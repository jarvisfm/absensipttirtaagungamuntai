/**
 * Portal Karyawan - Status Kehadiran Per Sesi
 *
 * Dulu Rekap Absensi (admin) & Riwayat Absensi (karyawan) sama-sama punya
 * 1 kolom "Status" per HARI (Hadir / Hadir (Terlambat) / dst). Sekarang
 * kolom itu dihapus, digantikan status per SESI (Masuk/Istirahat/Kembali/
 * Pulang) - "Hadir Tepat Waktu" kalau jam absennya <= jam target sesi itu
 * di jadwal, "Hadir Terlambat" kalau lewat dari itu.
 *
 * File ini SENGAJA dipisah supaya admin-reports.js (Rekap Absensi admin)
 * dan absensi.js (Riwayat Absensi karyawan) pakai logika & sumber jadwal
 * yang PERSIS SAMA - tidak ada 2 cara hitung yang bisa beda hasil.
 *
 * Konfigurasi jam per Jenis Jadwal diambil dari setting 'shift_types_config'
 * (sama seperti shift-schedule.js) - fallback-nya SENGAJA memanggil
 * shiftSchedule._defaultConfig() (bukan disalin ulang ke sini) supaya kalau
 * default jam kerja itu diubah di shift-schedule.js, tempat lain otomatis
 * ikut sinkron, tidak perlu diubah 2 tempat.
 */

let _shiftTypesConfigFullCache = null;

/**
 * preloadedSettingsRes (opsional, PERBAIKAN PERFORMA) - hasil api.getSettings()
 * yang SUDAH diambil sebelumnya, dipakai supaya fungsi ini tidak perlu
 * fetch ulang 'Settings' kalau pemanggilnya (mis. admin-reports.js) kebetulan
 * sudah punya hasilnya dari Promise.all/allSettled miliknya sendiri. Kalau
 * tidak diisi (semua pemanggil LAIN, tidak berubah), tetap fetch sendiri
 * seperti biasa.
 */
async function getShiftTypesConfigFull(preloadedSettingsRes) {
    if (_shiftTypesConfigFullCache) return _shiftTypesConfigFullCache;

    let config = null;
    try {
        const res = preloadedSettingsRes || await api.getSettings();
        const raw = res.success && res.data ? res.data['shift_types_config'] : null;
        config = raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('Gagal memuat shift_types_config lengkap:', e);
    }

    if (!config || !Object.keys(config).length) {
        config = (typeof shiftSchedule !== 'undefined' && shiftSchedule._defaultConfig)
            ? shiftSchedule._defaultConfig()
            : {};
    }

    _shiftTypesConfigFullCache = config;
    return config;
}

// Ambil GRUP jadwal (dayGroup biasa, ATAU shiftOption Pagi/Siang/Malam untuk
// Jenis Jadwal rosterCheck) yang berlaku untuk 1 baris absensi - bukan cuma
// array sesi-nya saja, supaya "batasLambat"/"toleransi" di level grup ini
// (lihat halaman Jadwal Shift: field "Batas terlambat" & "Toleransi
// (menit)") ikut bisa dibaca oleh getSessionAttendanceLabel() di bawah,
// PERSIS sumber yang sama dipakai backend (_determineStatus() di
// Attendance.gs) buat menentukan status Hadir/Terlambat per hari.
function _groupForShiftRaw(configAll, shiftRaw, dateStr) {
    const raw = String(shiftRaw || '').trim();
    if (!raw || !configAll) return null;

    // 1) Jenis Jadwal biasa, tanpa embel-embel sesi (Reguler, TRD, Operator - 24 Jam, dst)
    if (configAll[raw]) {
        return _groupFromDayGroups(configAll[raw], dateStr);
    }

    // 2) Jenis Jadwal dengan shiftOptions (BNA Amuntai/SATPAM Pagi/Siang/
    // Malam) - kolom shift-nya sudah tercatat sebagai "<key> - <Label Sesi>"
    // sejak clock-in (lihat saveAttendanceData() di Attendance.gs).
    for (const key of Object.keys(configAll)) {
        const opts = configAll[key].shiftOptions;
        if (!opts) continue;
        for (const optKey of Object.keys(opts)) {
            const label = opts[optKey].label || optKey;
            if (raw === `${key} - ${label}`) {
                return opts[optKey] || null;
            }
        }
    }
    return null;
}

function _groupFromDayGroups(shiftConfig, dateStr) {
    if (!shiftConfig || shiftConfig.shiftOptions) return null;
    const dayGroups = shiftConfig.dayGroups || [];
    if (!dayGroups.length) return null;

    // Jam 12 siang supaya perhitungan hari-nya aman dari pergeseran tanggal
    // akibat timezone browser (tanggalnya sendiri "YYYY-MM-DD" tanpa jam).
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dayGroups[0] || null;

    const dow = d.getDay();
    const group = dayGroups.find(g => (g.days || []).includes(dow)) || dayGroups[0];
    if (group.libur) return null;
    return group || null;
}

function _toMinutesSafe(timeStr) {
    if (!timeStr) return null;
    const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Status 1 SESI - dibandingkan ke "jam target" (bukan batas toleransi
 * terlambat) sesi itu di jadwal:
 * - Istirahat Keluar/Istirahat Masuk: "Hadir Tepat Waktu" kalau <= jam
 *   target, "Hadir Terlambat" kalau lewat (tidak ada batas terlambat &
 *   toleransi terpisah untuk sesi ini, cuma 1 jam target per sesi).
 * - Masuk (clockIn): PAKAI 3 TINGKAT sesuai "Batas Terlambat" & "Toleransi
 *   (menit)" di halaman Jadwal Shift (lihat PERBAIKAN di bawah) - BUKAN
 *   cuma dibanding jam target sesi seperti field lain.
 * - Pulang (clockOut): SELALU "Pulang Biasa", tidak pernah dinilai
 *   terlambat - pulang lewat jam target itu wajar, bukan pelanggaran.
 * Mengembalikan null kalau nilainya bukan jam (mis. "Cuti Tahunan"/"Izin"/
 * label Dinas Luar) atau jam target-nya tidak ketemu - supaya rendering-nya
 * fallback ke tampilan apa adanya untuk kasus itu.
 */
function getSessionAttendanceLabel(configAll, shiftRaw, dateStr, field, actualValue) {
    const actualMinutes = _toMinutesSafe(actualValue);
    if (actualMinutes == null) return null;

    const group = _groupForShiftRaw(configAll, shiftRaw, dateStr);
    const sessions = group ? (group.sessions || null) : null;
    const sesi = sessions ? sessions.find(s => s.field === field) : null;
    const targetMinutes = sesi ? _toMinutesSafe(sesi.time) : null;
    if (targetMinutes == null) return null;

    // Sesi Pulang (clockOut) SENGAJA tidak dinilai tepat waktu/terlambat -
    // pulang lewat jam target itu wajar (karyawan masih di tempat kerja
    // lebih lama, bukan soal kedisiplinan seperti telat Masuk), jadi
    // labelnya cuma penanda "Pulang Biasa", bukan Hadir Tepat Waktu/
    // Terlambat.
    if (field === 'clockOut') {
        return { late: false, text: 'Pulang' };
    }

    // PERBAIKAN: khusus sesi Masuk (clockIn), status dipecah jadi 3 tingkat
    // memakai "Batas Terlambat" & "Toleransi (menit)" di level GRUP jadwal
    // (dayGroup biasa, atau shiftOption Pagi/Siang/Malam untuk Jenis
    // Jadwal rosterCheck) - PERSIS field yang sama diisi admin di halaman
    // Jadwal Shift, dan PERSIS sumber yang sama dipakai backend
    // (_determineStatus() di Attendance.gs) buat status Hadir/Terlambat
    // per hari - supaya batas hitungnya tidak pernah beda antara badge
    // rekap harian dengan label per-sesi di tabel ini:
    //   - Mulai Bisa Absen  s/d  Batas Terlambat            -> Hadir Tepat Waktu
    //   - Batas Terlambat   s/d  Batas Terlambat + Toleransi -> Hadir Terlambat
    //   - Lewat Batas Terlambat + Toleransi                  -> Terlambat
    if (field === 'clockIn' && group) {
        const batasLambatMinutes = _toMinutesSafe(group.batasLambat);
        if (batasLambatMinutes != null) {
            const toleransi = typeof group.toleransi === 'number' ? group.toleransi : 0;
            if (actualMinutes <= batasLambatMinutes) {
                return { late: false, text: 'Hadir Tepat Waktu' };
            }
            if (actualMinutes <= batasLambatMinutes + toleransi) {
                return { late: true, text: 'Hadir Terlambat' };
            }
            return { late: true, veryLate: true, text: 'Terlambat' };
        }
        // "Batas Terlambat" tidak diisi di konfigurasi jadwal ini - biarkan
        // jatuh ke logika lama di bawah (dibanding Jam Target sesi saja)
        // supaya tetap ada labelnya, bukan kosong sama sekali.
    }

    return actualMinutes > targetMinutes
        ? { late: true, text: 'Hadir Terlambat' }
        : { late: false, text: 'Hadir Tepat Waktu' };
}

window.getShiftTypesConfigFull = getShiftTypesConfigFull;
window.getSessionAttendanceLabel = getSessionAttendanceLabel;
