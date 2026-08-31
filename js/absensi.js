/**
 * Portal Karyawan - Absensi
 * PT. Tirta Agung Amuntai
 */

const absensi = {
    currentState: 'waiting',
    attendanceData: {},
    accessInfo: null,      // hasil checkAttendanceAccess dari backend
    liveClockInterval: null,
    // BUGFIX (2026-08-31): lihat catatan lengkap di handleClockIn() di
    // bawah - field ini SENGAJA tidak ikut direset di init() (beda dari
    // currentState/attendanceData/accessInfo di atas).
    _pendingAction: null,

    async init() {
    const comingSoonEl = document.getElementById('absensi-coming-soon');
    const realContentEl = document.getElementById('absensi-real-content');

    if (comingSoonEl) comingSoonEl.style.display = 'none';
    if (realContentEl) realContentEl.style.display = '';

    // Reset state dulu sebelum load data baru
    this.currentState = 'waiting';
    this.attendanceData = {};
    this.accessInfo = null;

    // Tampilkan status "Memuat..." dulu supaya tombol/teks lama tidak
    // sempat kelihatan seolah sudah siap-pakai sebelum data asli datang
    const statusText = document.querySelector('.status-text');
    const statusSubtext = document.querySelector('.status-subtext');
    if (statusText) statusText.textContent = 'Memuat...';
    if (statusSubtext) statusSubtext.textContent = 'Mengecek data absensi Anda';
    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-clock-out'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = true;
    });

    // PERBAIKAN: tabel "Riwayat Absensi" ikut direset ke status loading di
    // sini juga - supaya setiap kali halaman Absensi dibuka/dibuka ULANG
    // (bukan cuma pertama kali app dimuat), user tidak sempat melihat data
    // riwayat dari kunjungan SEBELUMNYA (yang bisa saja sudah basi, mis.
    // baru saja absen tapi tabel belum ikut ter-refresh) sebelum data yang
    // baru selesai diambil dari server. Cuma manipulasi DOM biasa (tanpa
    // request/komputasi tambahan), jadi tidak menambah beban ke server.
    const historyBody = document.getElementById('attendance-history');
    if (historyBody) {
        historyBody.innerHTML = '<tr><td colspan="6"><div class="history-empty"><i class="fas fa-spinner fa-spin"></i><span>Memuat riwayat absensi...</span></div></td></tr>';
    }

    // PERBAIKAN PERFORMA: loadAttendanceHistory() (tabel Riwayat Absensi)
    // TIDAK butuh data dari loadAccessInfo()/loadTodayAttendance() sama
    // sekali (sudah dicek: _historyData cuma dipakai fungsi-fungsi terkait
    // riwayat sendiri) - jadi dijalankan BERSAMAAN (Promise.all), bukan
    // menunggu antre di belakang 2 request lain. loadAccessInfo() dan
    // loadTodayAttendance() TETAP berurutan (tidak ikut diparalelkan)
    // karena loadTodayAttendance() betulan baca this.accessInfo untuk
    // menentukan state 'libur' - kalau ikut diparalelkan, sesekali bisa
    // salah baca accessInfo yang belum sempat terisi (race condition).
    // Jumlah request ke server SAMA PERSIS seperti sebelumnya (3 kali) -
    // cuma waktu TUNGGU-nya yang lebih pendek karena tidak lagi antre satu
    // per satu, jadi tidak menambah beban ke server sama sekali.
    await Promise.all([
        (async () => {
            await this.loadAccessInfo();
            this.updateShiftInfoCard();
            await this.loadTodayAttendance();
        })(),
        this.loadAttendanceHistory()
    ]);
    this.initLiveClock();
    this.initButtons();
    this.renderTimeline();
    this.updateUI();
},

    // Cek jadwal & sesi absensi hari ini dari backend
    async loadAccessInfo() {
    const user = auth.getCurrentUser();
    if (!user) return;
    try {
        const effectiveId = user.employeeId || user.id;
        const result = await api.checkAttendanceAccess(effectiveId);
        if (result && result.success) {
            this.accessInfo = result.data;
        } else {
            console.warn('checkAttendanceAccess gagal:', result);
        }
    } catch (e) {
        console.error('Error checkAttendanceAccess:', e);
    }
},

    // Isi kartu "Shift Anda" (nama shift + jam kerja) di bagian atas halaman
    // Absensi dari hasil checkAttendanceAccess() - supaya SELALU mengikuti
    // Jenis Jadwal karyawan yang sebenarnya (termasuk sesi Operator hasil
    // pencocokan Jadwal Jaga Operator hari ini), bukan teks statis "Pagi
    // 08:00-17:00" seperti sebelumnya.
    updateShiftInfoCard() {
        const nameEl = document.getElementById('current-shift-name');
        const timeEl = document.getElementById('current-shift-time');
        if (!nameEl || !timeEl) return;

        if (!this.accessInfo || !this.accessInfo.canAccess) {
            nameEl.textContent = 'Libur';
            timeEl.textContent = (this.accessInfo && this.accessInfo.message) || 'Tidak ada jadwal hari ini';
            return;
        }

        nameEl.textContent = this.accessInfo.activeSessionLabel
            ? `${this._cleanShiftBaseName(this.accessInfo.shift)} ${this.accessInfo.activeSessionLabel}`
            : (this.accessInfo.shift || '-');

        const sessions = this.accessInfo.sessions || [];
        const masuk  = sessions.find(s => s.field === 'clockIn');
        const pulang = sessions.find(s => s.field === 'clockOut');
        timeEl.textContent = (masuk && pulang) ? `${masuk.time} - ${pulang.time}` : '-';
    },

    // Rapikan nama shift mentah (mis. "Operator - BNA Amuntai (3 Sesi)")
    // jadi "Operator BNA Amuntai" - buang keterangan "(N Sesi)" & tanda "-"
    // supaya enak dibaca saat digabung dengan label sesi (Pagi/Siang/Malam).
    _cleanShiftBaseName(raw) {
        return String(raw || '')
            .replace(/\s*\(\d+\s*Sesi\)\s*/gi, ' ')
            .replace(/\s*-\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    // Format label shift buat kolom "Shift" di tabel Riwayat Absensi.
    // Shift multi-sesi (Operator/SATPAM dgn Pagi/Siang/Malam) tersimpan di
    // backend sebagai "Operator - BNA Amuntai (3 Sesi) - Pagi" (lihat
    // saveAttendanceData() di Attendance.gs) - di sini dirapikan jadi
    // "Operator BNA Amuntai Pagi". Shift satu sesi (mis. "TRD") yang tidak
    // punya akhiran Pagi/Siang/Malam dibiarkan apa adanya, tidak diubah.
    _formatShiftDisplay(raw) {
        const shift = String(raw || '').trim();
        if (!shift) return '-';

        const SESSION_LABELS = ['Pagi', 'Siang', 'Malam'];
        const parts = shift.split(' - ').map(p => p.trim());
        const lastPart = parts[parts.length - 1];

        if (parts.length < 2 || !SESSION_LABELS.includes(lastPart)) {
            return shift;
        }

        const baseName = this._cleanShiftBaseName(parts.slice(0, -1).join(' - '));
        return baseName ? `${baseName} ${lastPart}` : lastPart;
    },

    async loadTodayAttendance() {
    const user = auth.getCurrentUser();
    if (!user) return;

    try {
        const effectiveId = user.employeeId || user.id;        // ← TAMBAH INI
        const result = await api.getTodayAttendance(effectiveId); // ← GANTI user.id
            let today = result?.data || {};

            today.clockIn     = today.clockIn     || null;
            today.clockOut    = today.clockOut    || null;
            today.breakStart  = today.breakStart  || null;
            today.breakEnd    = today.breakEnd    || null;

            this.attendanceData = today;
            this._activeSuratTugas = null;
            this._activeExcusedRecord = null;

            // Tentukan state
            if (today.status === 'izin' || today.status === 'cuti') {
                // Hari ini masuk rentang Izin/Cuti yang sudah disetujui
                // penuh (lihat _markAttendanceRangeAsExcused di
                // Attendance.gs) - dicek PALING AWAL, sebelum fallback
                // !canAccess di bawah, supaya tidak ketimpa jadi 'libur'
                // (backend sengaja set canAccess:false untuk hari yang
                // di-excuse ini, tapi itu cuma buat kunci tombol absen
                // manual - bukan berarti harus tampil sebagai "libur").
                this.currentState = 'excused';
                // Ambil tanggal selesai dari record Izin/Cuti aslinya (lihat
                // excusedRefId/excusedRefType yang ditulis backend), untuk
                // ditampilkan di banner (lihat updateUI) - mirip pola Dinas
                // Luar di bawah.
                try {
                    if (today.excusedRefType === 'cuti') {
                        const leaveRes = await api.getLeaves(effectiveId);
                        if (leaveRes.success) {
                            const rec = (leaveRes.data || []).find(l => String(l.id) === String(today.excusedRefId));
                            if (rec) this._activeExcusedRecord = { type: 'cuti', tanggalSelesai: rec.endDate };
                        }
                    } else {
                        const izinRes = await api.getIzin(effectiveId);
                        if (izinRes.success) {
                            const rec = (izinRes.data || []).find(i => String(i.id) === String(today.excusedRefId));
                            if (rec) this._activeExcusedRecord = { type: 'izin', typeLabel: rec.typeLabel, tanggalSelesai: rec.dateEnd || rec.date };
                        }
                    }
                } catch (e) { /* banner tetap tampil, cuma tanpa tanggal selesai */ }
            } else if (!this.accessInfo || !this.accessInfo.canAccess) {
                this.currentState = 'libur';
            } else if (today.isDinasLuar) {
                this.currentState = 'dinas';
                // Ambil tanggal selesai dari record Surat Tugas-nya, untuk
                // ditampilkan di banner (lihat updateUI).
                try {
                    const stResult = await api.getSuratTugas(effectiveId);
                    if (stResult.success) {
                        this._activeSuratTugas = (stResult.data || []).find(
                            st => String(st.id) === String(today.suratTugasId)
                        ) || null;
                    }
                } catch (e) { /* banner tetap tampil, cuma tanpa tanggal selesai */ }
            } else if (today.clockOut) {
                this.currentState = 'completed';
            } else if (today.breakStart && !today.breakEnd) {
                this.currentState = 'on-break';
            } else if (today.clockIn) {
                this.currentState = 'clocked-in';
            } else {
                // Belum ada absen sama sekali hari ini (bukan libur/dinas) -
                // cek apakah ada pengajuan Izin/Sakit untuk hari ini yang
                // SUDAH DIAJUKAN tapi BELUM FINAL disetujui (masih di tahap
                // Asmen/Manajer/Direktur). Kalau ada, tampilkan sebagai
                // 'excused-pending' (merah) supaya karyawan & yang lihat
                // tahu izinnya sudah masuk, tinggal menunggu persetujuan -
                // begitu disetujui penuh, hari berikutnya (atau reload)
                // otomatis pindah ke 'excused' (hijau) lewat cek status
                // 'izin'/'cuti' di atas. TIDAK menimpa absen asli yang
                // sudah terisi (clockIn/breakStart/clockOut) - blok ini
                // cuma jalan kalau semuanya masih kosong.
                const pendingIzin = await this._checkPendingIzinToday(effectiveId);
                if (pendingIzin) {
                    this.currentState = 'excused-pending';
                    this._activeExcusedRecord = {
                        type: 'izin',
                        pending: true,
                        typeLabel: pendingIzin.typeLabel || 'Izin',
                        tanggalSelesai: pendingIzin.dateEnd || pendingIzin.date
                    };
                } else {
                    this.currentState = 'waiting';
                }
            }
        } catch (e) {
            console.error('Error loading attendance:', e);
        }
    },

    // Cari pengajuan Izin/Sakit milik user ini yang tanggalnya mencakup HARI
    // INI dan statusnya masih "dalam proses" (sudah diajukan, belum final
    // disetujui/ditolak) - dipakai loadTodayAttendance() untuk state
    // 'excused-pending'. Izin Keluar Kantor sengaja dilewati (itu cuma
    // keluar sebentar, bukan izin seharian - lihat _finalizeKeluarKantorApproval
    // di Izin.gs). Logika rentang tanggalnya SAMA seperti _getIzinRange() di
    // izin.js (duplikat kecil, supaya halaman Absensi tidak perlu memuat
    // seluruh modul izin.js hanya untuk 1 fungsi ini).
    async _checkPendingIzinToday(effectiveId) {
        const PENDING_STATUSES = ['pending', 'asmen_approved', 'manajer_bidang_approved', 'manajer_approved'];
        try {
            const todayYMD = (typeof dateTime !== 'undefined' && dateTime.getLocalDate)
                ? dateTime.getLocalDate()
                : new Date().toISOString().split('T')[0];
            const izinRes = await api.getIzin(effectiveId);
            if (!izinRes.success) return null;
            for (const rec of (izinRes.data || [])) {
                if (rec.type === 'keluar_kantor') continue;
                if (PENDING_STATUSES.indexOf(rec.status) === -1) continue;
                const start = rec.date;
                let end = rec.dateEnd;
                if (!end && start) {
                    const durasi = parseInt(rec.duration, 10) || 1;
                    const d = new Date(start);
                    d.setDate(d.getDate() + durasi - 1);
                    end = d.toISOString().split('T')[0];
                }
                if (start && end && start <= todayYMD && todayYMD <= end) return rec;
            }
        } catch (e) { /* biarkan tampilan normal (waiting) kalau gagal cek */ }
        return null;
    },

    // Tampilkan catatan absen-luar-wilayah milik karyawan sendiri, lewat
    // modal view-only bersama (juga dipakai adminReports.showOutOfWilayahNote()
    // di Rekap Absensi Admin).
    showOutOfWilayahNote(date, type) {
        const r = (this._outOfWilayahMap || {})[`${date}|${type}`];
        if (!r) return;

        const modal = document.getElementById('modal-out-of-wilayah-view');
        if (!modal) {
            alert(`Catatan Absen Luar Unit Wilayah\n\n"${r.note}"`);
            return;
        }

        document.getElementById('oown-user-name').textContent = '';
        document.getElementById('oown-note-text').textContent = `"${r.note || ''}"`;
        document.getElementById('oown-status-text').textContent =
            `Unit Wilayah: ${r.unitWilayah || '-'} · Absen di: ${r.detectedOffice || '-'}`;

        modal.style.display = 'flex';
    },

    async loadAttendanceHistory() {
        try {
            const user = auth.getCurrentUser();
            if (!user) return;
            const effectiveId = user.employeeId || user.id;
            // Pakai endpoint yang sudah difilter userId DI SERVER, bukan
            // getAllAttendance() yang menarik data semua karyawan lalu
            // difilter di browser (itu penyebab history user lain sempat
            // kebaca sebelum filter jalan).
            const result = await api.getAttendance(effectiveId);
            this._historyData = result.data || [];

            // Laporan absen luar Unit Wilayah milik karyawan ini sendiri -
            // dipakai renderHistory() untuk menandai jam yang bersangkutan
            // dengan badge "Luar Unit Wilayah", sama polanya dengan badge
            // "Luar Radius" punya adminReports (admin-reports.js).
            try {
                const oowResult = await api.getOutOfWilayahReportsForUser(effectiveId);
                const oowReports = (oowResult && oowResult.success) ? (oowResult.data || []) : [];
                this._outOfWilayahMap = {};
                oowReports.forEach(r => {
                    this._outOfWilayahMap[`${r.date}|${r.type}`] = r;
                });
            } catch (e) {
                console.error('Gagal memuat laporan luar wilayah:', e);
                this._outOfWilayahMap = {};
            }

            // Data Izin/Sakit milik user ini - dipakai _buildSyntheticPendingIzinRows()
            // supaya pengajuan yang MASIH PENDING (belum final disetujui,
            // jadi belum tercatat sebagai baris Attendance asli) tetap
            // kelihatan di tabel Riwayat sebagai baris merah "Menunggu
            // Persetujuan". Gagal muat pun tidak boleh menggagalkan render
            // riwayat absensi yang asli - cukup anggap tidak ada izin pending.
            try {
                const izinRes = await api.getIzin(effectiveId);
                this._izinDataForHistory = (izinRes && izinRes.success) ? (izinRes.data || []) : [];
            } catch (e) {
                this._izinDataForHistory = [];
            }

            this._populateHistoryMonthFilter();
            this.renderHistory(this._getHistoryForSelectedMonth());
            this.renderHistoryStats(this._getHistoryForSelectedMonth());
        } catch (e) {
            console.error('Error loading history:', e);
        }
    },

    /**
     * Isi dropdown filter bulan dari bulan-bulan yang BENAR-BENAR ada di
     * data absensi user (bukan 12 bulan kalender statis - biar tidak ada
     * pilihan bulan kosong tanpa data). Default: bulan berjalan (kalau ada
     * datanya), atau bulan paling baru yang ada.
     */
    _populateHistoryMonthFilter() {
        const select = document.getElementById('attendance-history-month');
        if (!select) return;

        const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const months = [...new Set((this._historyData || []).map(r => (r.date || '').substring(0, 7)).filter(Boolean))];
        months.sort().reverse();

        const todayYM = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate().substring(0, 7) : '';
        if (todayYM && !months.includes(todayYM)) months.unshift(todayYM);

        const previouslySelected = select.value;
        select.innerHTML = months.map(ym => {
            const [y, m] = ym.split('-');
            return `<option value="${ym}">${monthNames[parseInt(m) - 1]} ${y}</option>`;
        }).join('');

        // Pertahankan pilihan bulan yang sedang aktif (mis. setelah absen
        // baru & tabel di-refresh) - kalau belum pernah pilih, default ke
        // bulan berjalan.
        select.value = months.includes(previouslySelected) ? previouslySelected : (todayYM || months[0] || '');

        if (!select._historyFilterBound) {
            select.addEventListener('change', () => {
                this.renderHistory(this._getHistoryForSelectedMonth());
                this.renderHistoryStats(this._getHistoryForSelectedMonth());
            });
            select._historyFilterBound = true;
        }
    },

    /**
     * Badge Hadir/Terlambat/Total di atas tabel Riwayat Absensi - persis
     * cara hitungnya sama seperti rekap Admin (admin-reports.js): status
     * 'hadir'/'ontime'/'terlambat'/'late' semua dihitung Hadir, 'terlambat'/
     * 'late' juga masuk breakdown Terlambat, Total = jumlah baris di bulan
     * yang lagi difilter.
     *
     * 'izin'/'cuti' JUGA dihitung Hadir - sama seperti Dinas Luar (yang
     * baris Attendance-nya memang sudah ditulis status:'hadir' langsung
     * oleh backend). Izin/Cuti yang sudah disetujui penuh itu bukan
     * ketidakhadiran, jadi harus ikut dihitung Hadir juga, bukan cuma
     * ditampilkan sebagai badge terpisah tanpa masuk hitungan mana pun.
     */
    renderHistoryStats(historyData) {
        const el = document.getElementById('attendance-history-stats');
        if (!el) return;

        const rows = historyData || [];
        const totalTerlambat = rows.filter(r => ['terlambat', 'late'].includes(String(r.status || '').toLowerCase())).length;
        const totalHadir = rows.filter(r => ['hadir', 'ontime', 'terlambat', 'late', 'izin', 'cuti'].includes(String(r.status || '').toLowerCase())).length;
        const totalHari = rows.length;

        el.innerHTML = `
            <span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir: ${totalHadir}</span>
            <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-weight:500;">Terlambat: ${totalTerlambat}</span>
            <span style="background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:20px;font-weight:500;">Total: ${totalHari} hari</span>
        `;
    },

    _getHistoryForSelectedMonth() {
        const select = document.getElementById('attendance-history-month');
        const selectedMonth = select ? select.value : '';
        if (!selectedMonth) return this._historyData || [];
        return (this._historyData || []).filter(r => (r.date || '').startsWith(selectedMonth));
    },

    /**
     * Bikin baris SEMU (bukan dari data Attendance asli) untuk tanggal yang
     * SUDAH LEWAT di bulan yang lagi ditampilkan, tapi memang tidak ada
     * jadwal absen sama sekali - HANYA untuk tanggal merah nasional (lihat
     * checkAttendanceAccess() di Attendance.gs) - HANYA utk jadwal
     * dayGroups biasa, rosterCheck dilewati total karena Operator/SATPAM/
     * dst memang tidak punya konsep "libur tetap".
     *
     * PERBAIKAN: baris libur MINGGUAN (Sabtu/Minggu dkk sesuai
     * dayGroup.libur karyawan) SENGAJA TIDAK DIBUATKAN baris lagi di sini -
     * dulu ditampilkan sebagai baris "Libur (Sabtu)"/"Libur (Minggu)" di
     * tabel Riwayat Absensi, sekarang dihapus supaya hari libur mingguan
     * yang rutin & terjadi berulang setiap minggu itu tidak lagi memenuhi
     * tabel Riwayat Absensi. Tanggal merah (hari libur NASIONAL, jarang &
     * tidak rutin) tetap ditampilkan seperti sebelumnya karena informasinya
     * tetap relevan untuk diketahui user.
     */
    _buildSyntheticLiburRows(existingRows, selectedMonth, shiftTypesConfigFull, holidayDatesForYear) {
        if (!selectedMonth || !shiftTypesConfigFull) return [];

        const user = auth.getCurrentUser();
        const myShift = user?.shift || '';
        const shiftConfig = shiftTypesConfigFull[myShift];
        if (!shiftConfig || shiftConfig.rosterCheck) return [];

        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); // 1-12
        if (!year || !month) return [];

        const existingDates = new Set(existingRows.map(r => r.date));
        const todayYMD = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate() : '';
        const lastDay = new Date(year, month, 0).getDate();
        const rows = [];

        for (let day = 1; day <= lastDay; day++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (todayYMD && dateStr > todayYMD) break; // jangan tampilkan hari yang belum lewat
            if (existingDates.has(dateStr)) continue;  // sudah ada baris asli (absen/Izin/Cuti/dll)

            const holidayName = (holidayDatesForYear || {})[dateStr];
            if (!holidayName) continue; // bukan tanggal merah - lewati (termasuk libur mingguan biasa)

            rows.push({
                date: dateStr,
                shift: myShift,
                _syntheticLibur: true,
                _liburLabel: 'Tanggal Merah: ' + holidayName,
                _liburIsHoliday: true
            });
        }
        return rows;
    },

    /**
     * Bikin baris SEMU (merah, "Menunggu Persetujuan") untuk hari-hari di
     * bulan yang ditampilkan yang tercakup pengajuan Izin/Sakit MILIK USER
     * INI yang MASIH PENDING (belum final disetujui/ditolak) - supaya
     * begitu karyawan mengajukan izin, langsung kelihatan di tabel Riwayat
     * meski belum ada baris Attendance asli untuk tanggal itu (baris
     * Attendance baru ditulis backend SETELAH disetujui penuh - lihat
     * _markAttendanceRangeAsExcused di Attendance.gs). Begitu disetujui,
     * baris asli sudah ada (existingRows mencakup tanggal itu) sehingga
     * baris semu ini otomatis tidak dibuat lagi (lihat existingDates.has()
     * di bawah) - tidak akan pernah dobel dengan baris hijau yang sudah
     * final. Izin Keluar Kantor sengaja dilewati (bukan izin seharian).
     */
    _buildSyntheticPendingIzinRows(existingRows, selectedMonth) {
        const izinList = this._izinDataForHistory || [];
        if (!selectedMonth || !izinList.length) return [];

        const PENDING_STATUSES = ['pending', 'asmen_approved', 'manajer_bidang_approved', 'manajer_approved'];
        const existingDates = new Set(existingRows.map(r => r.date));
        const [yearStr, monthStr] = selectedMonth.split('-');
        const monthStart = `${yearStr}-${monthStr}-01`;
        const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
        const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
        const user = auth.getCurrentUser();
        const myShift = user?.shift || '';

        const rows = [];
        izinList.forEach(rec => {
            if (rec.type === 'keluar_kantor') return;
            if (PENDING_STATUSES.indexOf(rec.status) === -1) return;

            const start = rec.date;
            let end = rec.dateEnd;
            if (!end && start) {
                const durasi = parseInt(rec.duration, 10) || 1;
                const d = new Date(start);
                d.setDate(d.getDate() + durasi - 1);
                end = d.toISOString().split('T')[0];
            }
            if (!start || !end) return;
            // Lewati kalau rentangnya sama sekali tidak beririsan dengan bulan ini
            if (end < monthStart || start > monthEnd) return;

            for (let d = new Date(Math.max(new Date(start), new Date(monthStart))); d <= new Date(Math.min(new Date(end), new Date(monthEnd))); d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                if (existingDates.has(dateStr)) continue; // sudah ada baris asli (mis. sudah disetujui)
                rows.push({
                    date: dateStr,
                    shift: myShift,
                    _syntheticPendingIzin: true,
                    _pendingIzinLabel: rec.typeLabel || 'Izin'
                });
            }
        });
        return rows;
    },

    // Ambil daftar tanggal merah 1 tahun (dicache per tahun) - dipanggil
    // dari renderHistory(), pola sama seperti cache shiftTypesConfigFull di
    // bawah: kalau belum ada, muat dulu lalu render ULANG.
    _ensureHolidayDatesForYear(year) {
        if (!this._holidayDatesCacheByYear) this._holidayDatesCacheByYear = {};
        if (this._holidayDatesCacheByYear[year] || this._holidayDatesFetchingYear === year) return;
        this._holidayDatesFetchingYear = year;
        api.getHolidayDates(year).then(res => {
            this._holidayDatesCacheByYear[year] = (res && res.success && res.data) ? res.data : {};
            this._holidayDatesFetchingYear = null;
            this.renderHistory(this._getHistoryForSelectedMonth());
        }).catch(() => { this._holidayDatesFetchingYear = null; });
    },

    renderHistory(historyData) {
    const tbody = document.getElementById('attendance-history');
    if (!tbody) return;

    const shiftTypesConfigFull = this._shiftTypesConfigFullCache || null;
    const selectedMonth = document.getElementById('attendance-history-month')?.value || '';
    const selectedYear = selectedMonth.split('-')[0];
    if (selectedYear) this._ensureHolidayDatesForYear(selectedYear);
    const holidayDatesForYear = (this._holidayDatesCacheByYear || {})[selectedYear] || {};

    const liburRows = this._buildSyntheticLiburRows(historyData, selectedMonth, shiftTypesConfigFull, holidayDatesForYear);
    const pendingIzinRows = this._buildSyntheticPendingIzinRows(historyData, selectedMonth);
    const combinedData = [...historyData, ...liburRows, ...pendingIzinRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (combinedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="history-empty"><i class="fas fa-calendar-day"></i><span>Belum ada riwayat absensi di bulan ini.</span></div></td></tr>';
        return;
    }

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const todayYMD = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate() : '';

    tbody.innerHTML = combinedData.map(record => {
        // Format tanggal
        const [y, m, d] = (record.date || '').split('-');
        const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';
        const isToday = todayYMD && record.date === todayYMD;

        // Baris SEMU libur/tanggal merah (lihat _buildSyntheticLiburRows di
        // atas) - tampilkan badge tunggal merentang 4 kolom sesi, bukan jam
        // satu-satu (karena memang tidak ada jam sama sekali hari itu).
        if (record._syntheticLibur) {
            const bg = record._liburIsHoliday ? '#FEE2E2' : '#FEF3C7';
            const fg = record._liburIsHoliday ? '#B91C1C' : '#92400E';
            const icon = record._liburIsHoliday ? 'fa-flag' : 'fa-bed';
            return `
                <tr${isToday ? ' class="row-today"' : ''}>
                    <td>${dateStr}${isToday ? '<span class="today-tag">Hari Ini</span>' : ''}</td>
                    <td style="font-size:0.82rem;">${this._formatShiftDisplay(record.shift)}</td>
                    <td colspan="4" style="text-align:center;">
                        <span style="background:${bg};color:${fg};padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                            <i class="fas ${icon}"></i> ${record._liburLabel}
                        </span>
                    </td>
                </tr>
            `;
        }

        // Baris SEMU Izin/Sakit yang MASIH PENDING (lihat
        // _buildSyntheticPendingIzinRows di atas) - merah, beda dari baris
        // Izin/Cuti yang SUDAH disetujui (hijau, lihat isExcused di bawah).
        if (record._syntheticPendingIzin) {
            return `
                <tr${isToday ? ' class="row-today"' : ''}>
                    <td>${dateStr}${isToday ? '<span class="today-tag">Hari Ini</span>' : ''}</td>
                    <td style="font-size:0.82rem;">${this._formatShiftDisplay(record.shift)}</td>
                    <td colspan="4" style="text-align:center;">
                        <span style="background:#FEE2E2;color:#B91C1C;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                            <i class="fas fa-hourglass-half"></i> ${record._pendingIzinLabel} - Menunggu Persetujuan
                        </span>
                        <br><small style="color:#B91C1C;font-weight:600;font-size:0.7rem;">Menunggu ditinjau</small>
                    </td>
                </tr>
            `;
        }

        const statusLower = String(record.status || '').toLowerCase();

        // Baris Izin/Cuti yang SUDAH disetujui penuh - hijau konsisten
        // merentang 4 kolom sesi (dulu 4 warna beda-beda per kolom: hijau/
        // abu/abu/merah, padahal isinya sama-sama cuma label jenis izin,
        // bukan jam sungguhan) + teks "Sudah ditinjau" supaya pasangan
        // dengan baris pending (merah, "Menunggu ditinjau") di atas jelas.
        const isExcused = statusLower === 'izin' || statusLower === 'cuti';
        if (isExcused) {
            return `
                <tr${isToday ? ' class="row-today"' : ''}>
                    <td>${dateStr}${isToday ? '<span class="today-tag">Hari Ini</span>' : ''}</td>
                    <td style="font-size:0.82rem;">${this._formatShiftDisplay(record.shift)}</td>
                    <td colspan="4" style="text-align:center;">
                        <span style="background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                            <i class="fas fa-check-circle"></i> ${record.clockIn || (statusLower === 'cuti' ? 'Cuti' : 'Izin')}
                        </span>
                        <br><small style="color:#065F46;font-weight:600;font-size:0.7rem;">Sudah ditinjau</small>
                    </td>
                </tr>
            `;
        }

        // 4 sesi kosong semua (tidak clockIn/breakStart/breakEnd/clockOut
        // sama sekali) - dianggap "Tidak Hadir".
        const allSessionsEmpty = !record.clockIn && !record.breakStart && !record.breakEnd && !record.clockOut;

        // Status PER SESI ("Hadir Tepat Waktu"/"Hadir Terlambat") - dihitung
        // pakai jadwal shift hari itu (lihat session-status.js). null kalau
        // nilainya bukan jam (mis. hari Izin/Cuti) atau jam target-nya tidak
        // ketemu - fallback tidak nampilkan apa-apa (biar jamnya apa adanya).
        const sessionLabel = (field, actualValue) => {
            if (!actualValue) return '';
            const lbl = getSessionAttendanceLabel(shiftTypesConfigFull, record.shift, record.date, field, actualValue);
            if (!lbl) return '';
            // PERBAIKAN: status "Terlambat" (sudah lewat batas toleransi -
            // lihat getSessionAttendanceLabel di session-status.js) dikasih
            // warna merah biar beda dari "Hadir Terlambat" (masih dalam
            // toleransi, kuning) - supaya level keterlambatannya kelihatan
            // jelas, bukan cuma beda teks.
            const color = lbl.veryLate ? '#DC2626' : (lbl.late ? '#D97706' : '#059669');
            return `<br><small style="color:${color};font-weight:600;font-size:0.7rem;">${lbl.text}</small>`;
        };

        const clockInCell = allSessionsEmpty
            ? '<span style="color:#EF4444;font-weight:600;">Tidak Hadir</span>'
            : `${record.clockIn || '–'}${sessionLabel('clockIn', record.clockIn)}`;

        // Badge "Luar Unit Wilayah" - muncul kalau ada laporan tersimpan
        // untuk tanggal+sesi ini (lihat this._outOfWilayahMap di
        // loadAttendanceHistory()). Klik untuk lihat isi catatannya lewat
        // modal view-only yang sama dipakai admin (#modal-out-of-wilayah-view).
        const oowBadge = (type) => {
            const r = (this._outOfWilayahMap || {})[`${record.date}|${type}`];
            if (!r) return '';
            return `<br><span onclick="absensi.showOutOfWilayahNote('${record.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FDE68A;color:#92400E;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-signs"></i> Luar Unit Wilayah <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
        };

        return `
            <tr${isToday ? ' class="row-today"' : ''}>
                <td>${dateStr}${isToday ? '<span class="today-tag">Hari Ini</span>' : ''}</td>
                <td style="font-size:0.82rem;">${this._formatShiftDisplay(record.shift)}</td>
                <td style="font-weight:600;color:#10b981;">${clockInCell}${oowBadge('clockIn')}</td>
                <td style="color:var(--text-muted);">${record.breakStart || '–'}${sessionLabel('breakStart', record.breakStart)}${oowBadge('breakStart')}</td>
                <td style="color:var(--text-muted);">${record.breakEnd || '–'}${sessionLabel('breakEnd', record.breakEnd)}${oowBadge('breakEnd')}</td>
                <td style="font-weight:600;color:#EF4444;">${record.clockOut || '–'}${sessionLabel('clockOut', record.clockOut)}${oowBadge('clockOut')}</td>
            </tr>
        `;
    }).join('');

    // Konfigurasi jam per Jenis Jadwal (buat hitung status per sesi di atas)
    // - dimuat SEKALI lalu di-cache, kalau belum ada cache-nya, muat dulu
    // lalu render ULANG supaya label per sesi langsung muncul tanpa perlu
    // ganti bulan/reload manual.
    if (!this._shiftTypesConfigFullCache) {
        getShiftTypesConfigFull().then(config => {
            this._shiftTypesConfigFullCache = config;
            this.renderHistory(historyData);
        }).catch(() => { /* biarkan tampil tanpa label per sesi kalau gagal dimuat */ });
    }
},

    _toMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = String(timeStr).replace('.', ':').split(':');
        return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    },

    // Cek apakah tombol sesi tertentu sudah boleh diakses berdasarkan jam
    _isSessionOpen(opensAt) {
        if (!opensAt) return true;
        const now = dateTime.now();
        const nowMin = this._getWitaMinutesOfDay(now);
        const openMin = this._toMinutes(opensAt);
        if (nowMin >= openMin) return true;

        // Sesi yang melewati tengah malam (mis. Malam 23:00-08:00) - begitu
        // WITA sudah masuk hari baru, "jam sekarang" (nowMin) jadi kecil
        // lagi, sedangkan "mulai bisa absen" sesi semalam (openMin) masih
        // besar (mis. 22:45), jadi perbandingan mentah di atas SELALU
        // salah kebaca "belum buka" walau sesinya masih berlangsung.
        // Dicek pakai jam target Pulang (clockOut) sesi yang sama: kalau
        // target Pulang-nya LEBIH KECIL dari opensAt ini (tandanya
        // pulangnya di hari berikutnya, melewati tengah malam) DAN
        // sekarang masih SEBELUM jam Pulang itu, sesi ini dianggap MASIH
        // BUKA (kelanjutan dari semalam), bukan "belum buka".
        const pulang = this._getSessions().find(s => s.field === 'clockOut');
        if (pulang && pulang.time) {
            const pulangMin = this._toMinutes(pulang.time);
            if (pulangMin < openMin && nowMin < pulangMin) {
                return true;
            }
        }
        return false;
    },

    // "Jam:menit sekarang" (dalam total menit sejak 00:00) tapi dihitung
    // eksplisit pakai timezone WITA (Asia/Makassar) - BUKAN
    // now.getHours()/now.getMinutes() native yang ikut timezone
    // PERANGKAT/browser karyawan (belum tentu WITA kalau setelan zona
    // waktu HP-nya kebetulan bukan WITA). dateTime.now() sendiri sudah
    // benar (disinkron ke jam server, kebal dari jam HP diubah-ubah),
    // tapi getHours()/getMinutes() di JS selalu mengikuti timezone
    // perangkat saat membaca Date, jadi perlu dikunci manual ke WITA di
    // sini - pola sama seperti _getDayOfWeekSafe() di backend
    // (Attendance.gs).
    _getWitaMinutesOfDay(date) {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Makassar',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date);
        const hh = parseInt((parts.find(p => p.type === 'hour') || {}).value, 10) || 0;
        const mm = parseInt((parts.find(p => p.type === 'minute') || {}).value, 10) || 0;
        return hh * 60 + mm;
    },

    // Ambil sesi hari ini dari accessInfo
    _getSessions() {
        return (this.accessInfo && this.accessInfo.sessions) ? this.accessInfo.sessions : [];
    },

    // Cek apakah shift hari ini punya sesi istirahat
    _hasBreak() {
        return this._getSessions().some(s => s.field === 'breakStart');
    },

    initLiveClock() {
        if (this.liveClockInterval) clearInterval(this.liveClockInterval);

        const update = () => {
            const clockEl = document.getElementById('live-clock');
            const dateEl  = document.getElementById('live-date');
            if (clockEl) clockEl.textContent = dateTime.getCurrentTime();
            if (dateEl)  dateEl.textContent  = dateTime.getCurrentDate();
        };
        update();
        this.liveClockInterval = setInterval(update, 1000);
    },

    initButtons() {
    const map = {
        'btn-clock-in':    () => this.handleClockIn(),
        'btn-break':       () => this.handleBreak(),
        'btn-after-break': () => this.handleAfterBreak(),
        'btn-clock-out':   () => this.handleClockOut(),
    };
    Object.entries(map).forEach(([id, fn]) => {
        const btn = document.getElementById(id);
        if (btn) {
            // Hapus event listener lama sebelum tambah baru
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => { e.preventDefault(); fn(); });
        }
    });
},

    // ==== AKUN DEMO PRESENTASI ====
    // Username "demo" (lihat DEMO_ACCOUNT_USERNAMES di Auth.gs backend) -
    // dipakai supaya saat presentasi: (1) absen tetap bisa dilakukan walau
    // belum upload foto profil dan SELALU lolos, (2) absen masuk/istirahat/
    // pulang TIDAK pernah benar-benar tersimpan ke Google Sheets (lihat
    // saveAttendance di bawah) sehingga bisa dicoba berulang kali tanpa
    // mengotori data asli. Hapus blok ini (dan bagian terkait di
    // saveAttendance) atau ganti username-nya kalau fitur demo sudah tidak
    // diperlukan lagi.
    _isDemoAccount() {
        const user = auth.getCurrentUser();
        return !!(user && String(user.username || '').trim().toLowerCase() === 'demo');
    },

    // Cek apakah karyawan yang sedang login sudah upload foto profil.
    // Foto profil dipakai sebagai acuan pencocokan wajah (lihat
    // face-recognition.js _getReferenceDescriptor) - kalau belum ada,
    // pencocokan wajah otomatis di-skip (fail-open) sehingga siapa saja
    // bisa absen memakai akun tsb. Makanya karyawan diwajibkan upload
    // foto profil dulu sebelum diizinkan absen.
    _hasProfilePhoto() {
        const user = auth.getCurrentUser();
        return !!(user && user.avatar);
    },

    // Balikin true (dan tampilkan notifikasi + arahkan ke halaman Profil)
    // kalau user belum punya foto profil, supaya pemanggil bisa langsung
    // "return" tanpa lanjut membuka kamera/face-recognition.
    _blockIfNoProfilePhoto() {
        // Akun demo: lewati wajib foto profil - pencocokan wajah otomatis
        // fail-open (lolos) karena memang tidak ada foto acuan.
        if (this._isDemoAccount()) return false;
        if (!this._hasProfilePhoto()) {
            toast.warning('Anda belum mengupload foto profil. Silakan upload foto profil terlebih dahulu sebelum melakukan absensi.');
            router.navigate('profile');
            return true;
        }
        return false;
    },

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

        // BUGFIX (2026-08-31): sejak face-recognition.js confirmAttendance()
        // langsung router.navigate('absensi') begitu wajah terverifikasi
        // (foto+simpan ke server dilanjutkan di LATAR BELAKANG setelahnya -
        // lihat catatan di sana), ada celah waktu singkat di mana halaman
        // Absensi ini sempat memuat ulang data dari server (this.init(),
        // yang baca) SEBELUM proses simpan absen sebelumnya (yang tulis,
        // lebih lambat karena termasuk upload foto ke Drive) benar-benar
        // selesai. Kalau baca-nya keburu selesai duluan dengan data yang
        // masih basi, this.attendanceData.clockIn di atas bisa kebaca
        // kosong lagi walau sebenarnya absen SEDANG diproses - guard di
        // atas saja jadi tidak cukup. this._pendingAction diset di
        // confirmAttendance() SEBELUM navigate, dan baru dibersihkan
        // setelah proses simpan itu selesai (berhasil ataupun gagal) -
        // TIDAK ikut ke-reset oleh init() (lihat deklarasinya di atas),
        // jadi guard ini tetap berlaku sepanjang celah waktu tsb.
        if (this._pendingAction) {
            toast.warning('Absen sebelumnya masih diproses, mohon tunggu sebentar...');
            return;
        }

        // Cek portal sudah buka?
        const sesiMasuk = this._getSessions().find(s => s.field === 'clockIn');
        if (sesiMasuk && !this._isSessionOpen(sesiMasuk.opensAt)) {
            toast.warning(`Portal absen masuk baru dibuka pukul ${sesiMasuk.opensAt}`);
            return;
        }

        if (this._blockIfNoProfilePhoto()) return;

        router.navigate('face-recognition');
        setTimeout(() => { if (window.faceRecognition) window.faceRecognition.init('clock-in'); }, 100);
    },

    handleBreak() {
        if (!this.attendanceData.clockIn || this.attendanceData.breakStart) return;
        // BUGFIX (2026-08-31): lihat catatan lengkap di handleClockIn() di atas.
        if (this._pendingAction) {
            toast.warning('Absen sebelumnya masih diproses, mohon tunggu sebentar...');
            return;
        }

        const sesi = this._getSessions().find(s => s.field === 'breakStart');
        if (sesi && !this._isSessionOpen(sesi.opensAt)) {
            toast.warning(`Absen istirahat baru dibuka pukul ${sesi.opensAt}`);
            return;
        }

        if (this._blockIfNoProfilePhoto()) return;

        router.navigate('face-recognition');
        setTimeout(() => { if (window.faceRecognition) window.faceRecognition.init('break'); }, 100);
    },

    handleAfterBreak() {
        if (!this.attendanceData.breakStart || this.attendanceData.breakEnd) return;
        // BUGFIX (2026-08-31): lihat catatan lengkap di handleClockIn() di atas.
        if (this._pendingAction) {
            toast.warning('Absen sebelumnya masih diproses, mohon tunggu sebentar...');
            return;
        }

        const sesi = this._getSessions().find(s => s.field === 'breakEnd');
        if (sesi && !this._isSessionOpen(sesi.opensAt)) {
            toast.warning(`Absen setelah istirahat baru dibuka pukul ${sesi.opensAt}`);
            return;
        }

        if (this._blockIfNoProfilePhoto()) return;

        router.navigate('face-recognition');
        setTimeout(() => { if (window.faceRecognition) window.faceRecognition.init('after-break'); }, 100);
    },

    handleClockOut() {
        if (!this.attendanceData.clockIn || this.attendanceData.clockOut) return;
        // BUGFIX (2026-08-31): lihat catatan lengkap di handleClockIn() di atas.
        if (this._pendingAction) {
            toast.warning('Absen sebelumnya masih diproses, mohon tunggu sebentar...');
            return;
        }

        // Jika ada sesi istirahat, harus selesai dulu
        if (this._hasBreak() && this.attendanceData.breakStart && !this.attendanceData.breakEnd) {
            toast.warning('Selesaikan absen istirahat masuk terlebih dahulu');
            return;
        }

        const sesi = this._getSessions().find(s => s.field === 'clockOut');
        if (sesi && !this._isSessionOpen(sesi.opensAt)) {
            toast.warning(`Absen pulang baru dibuka pukul ${sesi.opensAt}`);
            return;
        }

        if (this._blockIfNoProfilePhoto()) return;

        router.navigate('face-recognition');
        setTimeout(() => { if (window.faceRecognition) window.faceRecognition.init('clock-out'); }, 100);
    },

    async processWithVerification(action, verificationData) {
        // PENTING: pakai dateTime.now() (jam server), BUKAN new Date() (jam
        // HP) - supaya jam yang tercatat sebagai clockIn/clockOut/dst tidak
        // bisa dikelabui dengan mengubah setting jam/tanggal di HP.
        const now     = dateTime.now();
        const timeStr = dateTime.formatTime(now);

        // Susun data absen dulu ke variabel terpisah (BUKAN langsung ke
        // this.attendanceData/this.currentState). Kalau backend menolak
        // (misal di luar radius kantor), UI tidak boleh kadung menampilkan
        // "berhasil" padahal datanya tidak benar-benar tersimpan.
        const payload = { ...this.attendanceData };
        switch (action) {
            case 'clock-in':    payload.clockIn    = timeStr; break;
            case 'break':       payload.breakStart = timeStr; break;
            case 'after-break': payload.breakEnd   = timeStr; break;
            case 'clock-out':   payload.clockOut   = timeStr; break;
        }
        payload.verificationPhoto     = verificationData.photo || '';
        payload.verificationLocation  = verificationData.location || '';
        payload.verificationTimestamp = verificationData.timestamp || '';
        // Skor kecocokan wajah & penanda "perlu ditinjau admin" (lihat
        // face-recognition.js confirmAttendance/_verifyFaceIdentity) -
        // dikosongkan kalau memang tidak sempat dicek (mis. toggle Face
        // Recognition di Settings sedang OFF, atau belum ada foto profil).
        payload.faceMatchScore = (verificationData.faceMatchScore !== undefined && verificationData.faceMatchScore !== null)
            ? verificationData.faceMatchScore : '';
        payload.faceMatchFlag  = verificationData.faceMatchFlag || false;

        const result = await this.saveAttendance(payload);

        if (!result || !result.success) {
            // Absen ditolak backend (contoh: di luar radius kantor) -
            // tampilkan alasannya dan JANGAN ubah state lokal sama sekali,
            // supaya tombol absen tetap dalam kondisi semula (belum absen)
            // dan user bisa coba lagi.
            toast.error(result?.error || 'Absen gagal disimpan. Silakan coba lagi.');
            router.navigate('absensi');
            return;
        }

        this.attendanceData = { ...payload, ...(result.data || {}) };

        switch (action) {
            case 'clock-in':
                this.currentState = 'clocked-in';
                toast.success(`Absen masuk berhasil: ${timeStr}`);
                break;
            case 'break':
                this.currentState = 'on-break';
                toast.info(`Absen istirahat: ${timeStr}`);
                break;
            case 'after-break':
                this.currentState = 'clocked-in';
                toast.success(`Absen kembali bekerja: ${timeStr}`);
                break;
            case 'clock-out':
                this.currentState = 'completed';
                toast.success(`Absen pulang berhasil: ${timeStr}`);
                break;
        }

        this.updateUI();
        this.renderTimeline();
        // CATATAN PERFORMA: dulu ada `await this.loadAttendanceHistory()` di
        // sini supaya tabel Riwayat Absensi tidak nampilin data basi. Ini
        // DIHAPUS karena kode yang memanggil processWithVerification() ini
        // (lihat face-recognition.js confirmAttendance()) SELALU langsung
        // router.navigate('absensi') sesudahnya - dan navigate ke halaman
        // 'absensi' otomatis memicu absensi.init() dari awal lagi (lihat
        // window.initAbsensi di bawah), yang SUDAH memanggil
        // loadAttendanceHistory() sendiri. Jadi baris ini cuma bikin 1 kali
        // baca data absensi ke server yang hasilnya langsung dibuang -
        // dihapus supaya jeda antara "Wajah Terverifikasi" dan kembali ke
        // menu Absensi tidak lagi menunggu 1 request tambahan yang sia-sia.
        storage.remove('temp_attendance');
    },

    async saveAttendance(payload) {
        const data = payload || this.attendanceData;
        const user = auth.getCurrentUser();
        // Gunakan employeeId jika ada (untuk admin yang punya data karyawan sendiri)
        // Fallback ke id jika employeeId tidak ada
        data.userId = user?.employeeId || user?.id;

        // PENGAMAN TAMBAHAN: kalau userId ternyata KOSONG di sini (mis. sesi
        // sempat dianggap tidak valid & auth.currentUser jadi null di tengah
        // proses verifikasi wajah - lihat perbaikan race condition
        // _patchCachedRow() di Database.gs), JANGAN kirim ke backend sama
        // sekali. Sebelumnya ini terkirim apa adanya dan ditolak backend
        // dengan pesan generik ("userId and date are required") - absen
        // gagal tersimpan TANPA penjelasan jelas ke user kenapa. Sekarang
        // langsung ketahuan jelas & user diarahkan login ulang alih-alih
        // mengira sudah absen padahal tidak tersimpan.
        if (!data.userId) {
            toast.error('Sesi Anda perlu login ulang sebelum bisa absen. Silakan login kembali.');
            if (window.auth) auth.showLogin();
            return { success: false, error: 'Sesi tidak valid (userId kosong)' };
        }

        // Akun demo: JANGAN dikirim ke backend sama sekali - tidak boleh ada
        // baris absensi yang benar-benar tersimpan di Google Sheets. Balikin
        // sukses palsu supaya UI (toast, status, timeline) tetap berjalan
        // normal seperti absen sungguhan, tapi tidak pernah tersimpan -
        // sehingga bisa dicoba absen masuk/istirahat/pulang berulang kali.
        if (this._isDemoAccount()) {
            return { success: true, data: {} };
        }

        try {
            const result = await api.saveAttendance(data);
            return result;
        } catch (e) {
            console.error('Error saving attendance:', e);
            return { success: false, error: 'Terjadi kesalahan koneksi saat menyimpan absensi. Coba lagi.' };
        }
    },

    updateUI() {
        const statusRing    = document.querySelector('.status-ring');
        const statusText    = document.querySelector('.status-text');
        const statusSubtext = document.querySelector('.status-subtext');

        // Sesi Masuk hari ini (dipakai buat teks status di bawah, dan buat
        // nonaktifkan tombol Masuk lebih ke bawah) - dihitung di awal supaya
        // bisa dipakai state 'waiting' juga.
        const sesiMasukUntukStatus = this._getSessions().find(s => s.field === 'clockIn');
        const portalMasukBelumBuka = !!sesiMasukUntukStatus && !this._isSessionOpen(sesiMasukUntukStatus.opensAt);

        if (statusRing) {
            statusRing.className = 'status-ring';
            const states = {
                libur:      { cls: 'waiting',   text: 'Hari Libur',       sub: (this.accessInfo && this.accessInfo.message) || 'Tidak ada jadwal kerja hari ini' },
                waiting:    portalMasukBelumBuka
                    ? { cls: 'waiting', text: 'Menunggu Jam Masuk', sub: `Absen baru bisa dimulai pukul ${sesiMasukUntukStatus.opensAt}` }
                    : { cls: 'waiting', text: 'Siap Absen Masuk', sub: 'Tekan tombol di bawah untuk absen' },
                'clocked-in': { cls: 'active',  text: 'Sedang Bekerja',   sub: 'Semangat bekerja!' },
                'on-break': { cls: 'on-break',  text: 'Sedang Istirahat', sub: 'Nikmati waktu istirahat Anda' },
                completed:  { cls: 'completed', text: 'Selesai Bekerja',  sub: 'Terima kasih atas kerja kerasnya!' },
                dinas:      { cls: 'completed', text: 'Sedang Dinas Luar (SPPD)', sub: 'Semua sesi absensi hari ini otomatis Hadir' },
                excused:    { cls: 'completed', text: this._activeExcusedRecord?.typeLabel || this.attendanceData.clockIn || 'Izin/Cuti', sub: 'Absensi hari ini mengikuti pengajuan yang sudah disetujui' },
                // Izin/Sakit yang SUDAH DIAJUKAN tapi BELUM final disetujui
                // (lihat _checkPendingIzinToday) - merah, beda dari 'excused'
                // (hijau/abu) di atas yang khusus untuk yang sudah disetujui
                // penuh.
                'excused-pending': { cls: 'pending-review', text: this._activeExcusedRecord?.typeLabel || 'Izin', sub: 'Sudah diajukan, menunggu persetujuan atasan' },
            };
            const s = states[this.currentState] || states.waiting;
            statusRing.classList.add(s.cls);
            if (statusText)    statusText.textContent    = s.text;
            if (statusSubtext) statusSubtext.textContent = s.sub;
        }

        // Banner info Dinas Luar (SPPD)
        const dinasInfo = document.getElementById('dinas-luar-info');
        if (dinasInfo) {
            if (this.attendanceData.isDinasLuar) {
                dinasInfo.style.display = 'block';
                const tujuanEl = document.getElementById('dinas-luar-tujuan');
                const tanggalEl = document.getElementById('dinas-luar-tanggal');
                if (tujuanEl) tujuanEl.textContent = this.attendanceData.suratTugasTujuan || '-';
                if (tanggalEl) tanggalEl.textContent = this._activeSuratTugas?.tanggalSelesai || '-';
            } else {
                dinasInfo.style.display = 'none';
            }
        }

        // Banner info Izin/Cuti (mirip pola banner Dinas Luar di atas) -
        // sekarang tampil untuk 2 kondisi: 'excused-pending' (merah, masih
        // menunggu) dan 'excused' (hijau, sudah final disetujui).
        const excusedInfo = document.getElementById('excused-info');
        if (excusedInfo) {
            const isPendingBanner  = this.currentState === 'excused-pending';
            const isApprovedBanner = this.currentState === 'excused';
            if (isPendingBanner || isApprovedBanner) {
                excusedInfo.style.display = 'block';
                const typeLabelEl  = document.getElementById('excused-type-label');
                const tanggalEl    = document.getElementById('excused-tanggal');
                const mainNoteEl   = document.getElementById('excused-main-note');
                const reviewEl     = document.getElementById('excused-review-status');
                const defaultLabel = this._activeExcusedRecord?.type === 'cuti' ? 'Cuti' : 'Izin';
                if (typeLabelEl) typeLabelEl.textContent = this._activeExcusedRecord?.typeLabel || defaultLabel;
                if (tanggalEl)   tanggalEl.textContent   = this._activeExcusedRecord?.tanggalSelesai || '-';

                // Merah selagi menunggu persetujuan, hijau begitu sudah
                // disetujui penuh - sama pola warnanya dengan status-ring
                // (lihat states.excused / states['excused-pending'] di atas
                // dan .status-ring.pending-review di absensi.css).
                if (isPendingBanner) {
                    excusedInfo.style.background   = '#FEF2F2';
                    excusedInfo.style.borderColor  = '#FECACA';
                    excusedInfo.style.color        = '#B91C1C';
                    if (mainNoteEl) mainNoteEl.textContent = 'Pengajuan sudah masuk, silakan tetap tunggu keputusan atasan.';
                    if (reviewEl)   reviewEl.textContent   = 'Menunggu ditinjau';
                } else {
                    excusedInfo.style.background   = '#ECFDF5';
                    excusedInfo.style.borderColor  = '#A7F3D0';
                    excusedInfo.style.color        = '#065F46';
                    if (mainNoteEl) mainNoteEl.textContent = 'Tidak perlu/tidak bisa absen manual untuk rentang tanggal ini.';
                    if (reviewEl)   reviewEl.textContent   = 'Sudah ditinjau';
                }
            } else {
                excusedInfo.style.display = 'none';
            }
        }

        // Badge "tanggal merah" / "libur" (Sabtu-Minggu dsb) - reuse
        // this.currentState === 'libur' yang sudah dihitung di
        // loadTodayAttendance() dari accessInfo.canAccess === false (lihat
        // checkAttendanceAccess() di Attendance.gs). Dibedakan 2 tampilan:
        // - accessInfo.holiday terisi -> tanggal merah nasional (Idul
        //   Fitri, Maulid Nabi, HUT RI, dst - warna merah, lebih tegas).
        // - selain itu -> libur mingguan biasa (Sabtu/Minggu utk jadwal
        //   Reguler/Jaga Malam/TRD - dayGroup.libur di getShiftTypesConfig())
        //   warna netral/kuning, reuse skema warna excused-info di atas.
        const holidayBadge = document.getElementById('holiday-badge-info');
        if (holidayBadge) {
            if (this.currentState === 'libur' && this.accessInfo) {
                holidayBadge.style.display = 'block';
                const titleEl = document.getElementById('holiday-badge-title');
                const nameEl  = document.getElementById('holiday-badge-name');
                if (this.accessInfo.holiday) {
                    holidayBadge.style.background = '#FEF2F2';
                    holidayBadge.style.borderColor = '#FECACA';
                    holidayBadge.style.color = '#B91C1C';
                    if (titleEl) titleEl.textContent = 'Hari ini tanggal merah:';
                    if (nameEl)  nameEl.textContent  = this.accessInfo.holiday;
                } else {
                    holidayBadge.style.background = '#FFFBEB';
                    holidayBadge.style.borderColor = '#FDE68A';
                    holidayBadge.style.color = '#92400E';
                    if (titleEl) titleEl.textContent = 'Hari ini libur:';
                    // Ambil nama hari dari pesan backend, mis. "Hari ini libur
                    // (Sabtu)" -> "Sabtu" - lihat dayGroup.label di
                    // getShiftTypesConfig() (Setting.gs).
                    const match = /\(([^)]+)\)/.exec(this.accessInfo.message || '');
                    if (nameEl) nameEl.textContent = match ? match[1] : '';
                }
            } else {
                holidayBadge.style.display = 'none';
            }
        }

        const isLibur     = this.currentState === 'libur';
        const isExcused   = this.currentState === 'excused';
        // Hari Izin/Cuti (excused) selalu tampilkan semua sesi (Clock In,
        // Istirahat, Selesai Istirahat, Clock Out) meski _hasBreak() false
        // (mis. accessInfo gagal dimuat) - backend selalu mengisi keempat
        // field itu dengan label Izin/Cuti untuk hari yang di-excuse
        // (lihat _markAttendanceRangeAsExcused di Attendance.gs).
        const hasBreak    = this._hasBreak() || isExcused;
        const d           = this.attendanceData;

        // Tombol Masuk - selain "sudah absen atau belum", ikut cek jendela
        // sesi (_isSessionOpen) supaya tombol tidak tampil aktif/hijau kalau
        // memang belum/sudah lewat jam yang diizinkan (lihat handleClockIn()
        // yang mengecek hal sama saat diklik - di sini disamakan supaya
        // tampilan tombolnya konsisten, bukan cuma ketahuan ditolak setelah
        // diklik).
        const sesiMasuk = this._getSessions().find(s => s.field === 'clockIn');
        const masukBelumBuka = !!sesiMasuk && !this._isSessionOpen(sesiMasuk.opensAt);

        const btnIn = document.getElementById('btn-clock-in');
        if (btnIn) {
            btnIn.disabled = !!d.clockIn || isLibur || masukBelumBuka;
            const el = document.getElementById('clock-in-time');
            if (d.clockIn) {
                btnIn.classList.add('completed');
                if (el) el.textContent = d.clockIn;
            } else {
                btnIn.classList.remove('completed');
                // PENTING: reset ke placeholder - kalau tidak, teks jam dari
                // sesi/user SEBELUMNYA (mis. user lain yang tadi absen di
                // perangkat/tab yang sama) akan tetap kelihatan seolah punya
                // user yang sedang login sekarang, padahal attendanceData-nya
                // sendiri sudah benar kosong.
                if (el) el.textContent = '--:--';
            }
        }

        // Tombol Istirahat — sembunyikan jika shift tidak punya istirahat (misal Jumat)
        const btnBreak = document.getElementById('btn-break');
        const btnAfterBreak = document.getElementById('btn-after-break');
        const breakSection = document.getElementById('break-section'); // tambahkan id ini di HTML jika belum ada

        if (!hasBreak) {
            if (breakSection) breakSection.style.display = 'none';
            if (btnBreak) btnBreak.style.display = 'none';
            if (btnAfterBreak) btnAfterBreak.style.display = 'none';
        } else {
            const sesiIstirahat = this._getSessions().find(s => s.field === 'breakStart');
            const istirahatBelumBuka = !!sesiIstirahat && !this._isSessionOpen(sesiIstirahat.opensAt);
            const sesiSetelahIstirahat = this._getSessions().find(s => s.field === 'breakEnd');
            const setelahIstirahatBelumBuka = !!sesiSetelahIstirahat && !this._isSessionOpen(sesiSetelahIstirahat.opensAt);

            if (breakSection) breakSection.style.display = '';
            if (btnBreak) {
                btnBreak.style.display = '';
                btnBreak.disabled = !d.clockIn || !!d.breakStart || !!d.clockOut || istirahatBelumBuka;
                const el = document.getElementById('break-time');
                if (d.breakStart) {
                    btnBreak.classList.add('completed');
                    if (el) el.textContent = d.breakStart;
                } else {
                    btnBreak.classList.remove('completed');
                    if (el) el.textContent = '--:--';
                }
            }
            if (btnAfterBreak) {
                btnAfterBreak.style.display = '';
                btnAfterBreak.disabled = !d.breakStart || !!d.breakEnd || !!d.clockOut || setelahIstirahatBelumBuka;
                const elAfter = document.getElementById('after-break-time');
                if (d.breakEnd) {
                    btnAfterBreak.classList.add('completed');
                    if (elAfter) elAfter.textContent = d.breakEnd;
                } else {
                    btnAfterBreak.classList.remove('completed');
                    if (elAfter) elAfter.textContent = '--:--';
                }
            }
        }

        // Tombol Pulang - ikut cek jendela sesi juga, sama seperti Masuk di atas.
        const sesiPulang = this._getSessions().find(s => s.field === 'clockOut');
        const pulangBelumBuka = !!sesiPulang && !this._isSessionOpen(sesiPulang.opensAt);

        const btnOut = document.getElementById('btn-clock-out');
        if (btnOut) {
            btnOut.disabled = !d.clockIn || !!d.clockOut || pulangBelumBuka;
            const el = document.getElementById('clock-out-time');
            if (d.clockOut) {
                btnOut.classList.add('completed');
                if (el) el.textContent = d.clockOut;
            } else {
                btnOut.classList.remove('completed');
                if (el) el.textContent = '--:--';
            }
        }

        // Tombol Input Surat Tugas (SPPD) - dikunci selama user masih dalam
        // rentang Izin/Cuti yang sedang berjalan (currentState 'excused'),
        // supaya tidak bisa input dinas luar yang tumpang tindih dengan
        // Izin/Cuti yang sudah disetujui. Otomatis aktif lagi begitu
        // currentState bukan 'excused' lagi (rentang izin/cuti sudah lewat).
        const btnSuratTugas = document.getElementById('btn-surat-tugas-trigger');
        if (btnSuratTugas) {
            btnSuratTugas.disabled = isExcused;
            btnSuratTugas.classList.toggle('disabled', isExcused);
            const subEl = document.getElementById('surat-tugas-trigger-sub');
            if (subEl) {
                subEl.textContent = isExcused
                    ? 'Tidak bisa diisi selama masih Izin/Cuti'
                    : 'Sedang dinas luar? Catat di sini';
            }
        }
    },

    renderTimeline() {
        const timeline = document.getElementById('attendance-timeline');
        if (!timeline) return;

        timeline.querySelectorAll('.timeline-item').forEach(item => {
            const type   = item.dataset.type;
            const timeEl = item.querySelector('.timeline-time');
            item.className = 'timeline-item pending';
            const d = this.attendanceData;

            const map = {
                'clock-in':    d.clockIn,
                'break':       d.breakStart,
                'after-break': d.breakEnd,
                'clock-out':   d.clockOut,
            };

            if (map[type]) {
                item.classList.add('completed');
                if (timeEl) timeEl.textContent = map[type];
            } else {
                // PENTING: reset ke placeholder, sama seperti di updateUI() -
                // supaya jam dari sesi/user sebelumnya tidak "nyangkut" tampil
                // di timeline user yang sedang login sekarang.
                if (timeEl) timeEl.textContent = '--:--';
            }

            // Sembunyikan item istirahat jika shift tidak punya istirahat -
            // KECUALI hari ini status excused (Izin/Cuti), tetap tampilkan
            // semua item supaya konsisten dengan card di atas.
            if ((type === 'break' || type === 'after-break') && !this._hasBreak() && this.currentState !== 'excused') {
                item.style.display = 'none';
            } else {
                item.style.display = '';
            }
        });
    }
};

window.initAbsensi = () => { absensi.init(); };
window.absensi = absensi;
