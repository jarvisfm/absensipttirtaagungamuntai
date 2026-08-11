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

async function getShiftTypesConfigFull() {
    if (_shiftTypesConfigFullCache) return _shiftTypesConfigFullCache;

    let config = null;
    try {
        const res = await api.getSettings();
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

// Ambil array sesi (Masuk/Istirahat Keluar/dst, masing-masing { field, time, ... })
// yang berlaku untuk 1 baris absensi, berdasarkan string mentah kolom
// "shift"-nya (mis. "Reguler (Sen-Kam)" atau "SATPAM - Pagi").
function _sessionsForShiftRaw(configAll, shiftRaw, dateStr) {
    const raw = String(shiftRaw || '').trim();
    if (!raw || !configAll) return null;

    // 1) Jenis Jadwal biasa, tanpa embel-embel sesi (Reguler, TRD, Operator - 24 Jam, dst)
    if (configAll[raw]) {
        return _sessionsFromDayGroups(configAll[raw], dateStr);
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
                return opts[optKey].sessions || null;
            }
        }
    }
    return null;
}

function _sessionsFromDayGroups(shiftConfig, dateStr) {
    if (!shiftConfig || shiftConfig.shiftOptions) return null;
    const dayGroups = shiftConfig.dayGroups || [];
    if (!dayGroups.length) return null;

    // Jam 12 siang supaya perhitungan hari-nya aman dari pergeseran tanggal
    // akibat timezone browser (tanggalnya sendiri "YYYY-MM-DD" tanpa jam).
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dayGroups[0].sessions || null;

    const dow = d.getDay();
    const group = dayGroups.find(g => (g.days || []).includes(dow)) || dayGroups[0];
    if (group.libur) return null;
    return group.sessions || null;
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
 * - Masuk/Istirahat Keluar/Istirahat Masuk: "Hadir Tepat Waktu" kalau <=
 *   jam target, "Hadir Terlambat" kalau lewat.
 * - Pulang (clockOut): SELALU "Pulang Biasa", tidak pernah dinilai
 *   terlambat - pulang lewat jam target itu wajar, bukan pelanggaran.
 * Mengembalikan null kalau nilainya bukan jam (mis. "Cuti Tahunan"/"Izin"/
 * label Dinas Luar) atau jam target-nya tidak ketemu - supaya rendering-nya
 * fallback ke tampilan apa adanya untuk kasus itu.
 */
function getSessionAttendanceLabel(configAll, shiftRaw, dateStr, field, actualValue) {
    const actualMinutes = _toMinutesSafe(actualValue);
    if (actualMinutes == null) return null;

    const sessions = _sessionsForShiftRaw(configAll, shiftRaw, dateStr);
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

    return actualMinutes > targetMinutes
        ? { late: true, text: 'Hadir Terlambat' }
        : { late: false, text: 'Hadir Tepat Waktu' };
}

window.getShiftTypesConfigFull = getShiftTypesConfigFull;
window.getSessionAttendanceLabel = getSessionAttendanceLabel;
