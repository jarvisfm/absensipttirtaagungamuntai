/**
 * Portal Karyawan - Absensi
 * PT. Tirta Agung Amuntai
 */

const absensi = {
    currentState: 'waiting',
    attendanceData: {},
    accessInfo: null,      // hasil checkAttendanceAccess dari backend
    liveClockInterval: null,

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

    await this.loadAccessInfo();
    this.updateShiftInfoCard();
    await this.loadTodayAttendance();
    await this.loadAttendanceHistory();
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

        nameEl.textContent = this.accessInfo.shift || '-';

        const sessions = this.accessInfo.sessions || [];
        const masuk  = sessions.find(s => s.field === 'clockIn');
        const pulang = sessions.find(s => s.field === 'clockOut');
        timeEl.textContent = (masuk && pulang) ? `${masuk.time} - ${pulang.time}` : '-';
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
                            if (rec) this._activeExcusedRecord = { type: 'izin', tanggalSelesai: rec.dateEnd || rec.date };
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
                this.currentState = 'waiting';
            }
        } catch (e) {
            console.error('Error loading attendance:', e);
        }
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

    renderHistory(historyData) {
    const tbody = document.getElementById('attendance-history');
    if (!tbody) return;

    if (historyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="history-empty"><i class="fas fa-calendar-day"></i><span>Belum ada riwayat absensi di bulan ini.</span></div></td></tr>';
        return;
    }

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const todayYMD = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate() : '';

    tbody.innerHTML = historyData.map(record => {
        // Format tanggal
        const [y, m, d] = (record.date || '').split('-');
        const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';
        const isToday = todayYMD && record.date === todayYMD;

        // Status badge
        const statusLower = String(record.status || '').toLowerCase();
        let badge = '<span class="badge-status">Menunggu</span>';
        if (statusLower === 'hadir' || statusLower === 'ontime') {
            badge = '<span class="badge-status success">Hadir</span>';
        } else if (statusLower === 'terlambat' || statusLower === 'late') {
            badge = '<span class="badge-status warning">Hadir (Terlambat)</span>';
        } else if (statusLower === 'pulang awal') {
            badge = '<span class="badge-status danger">Pulang Awal</span>';
        } else if (statusLower === 'izin' || statusLower === 'cuti') {
            // Hari yang otomatis "diisi" begitu Izin/Cuti disetujui penuh
            // (lihat _markAttendanceRangeAsExcused di Attendance.gs) -
            // BUKAN status menunggu, jadi jangan jatuh ke badge default.
            // Pakai teks jenisnya sendiri (mis. "Cuti Tahunan"/"Sakit")
            // yang sudah tersimpan di kolom clockIn.
            badge = `<span class="badge-status info">${record.clockIn || (statusLower === 'izin' ? 'Izin' : 'Cuti')}</span>`;
        } else if (statusLower === 'pending' || statusLower === 'waiting') {
            badge = '<span class="badge-status">Pending</span>';
        }

        return `
            <tr${isToday ? ' class="row-today"' : ''}>
                <td>${dateStr}${isToday ? '<span class="today-tag">Hari Ini</span>' : ''}</td>
                <td style="font-size:0.82rem;">${record.shift || '-'}</td>
                <td style="font-weight:600;color:#10b981;">${record.clockIn || '–'}</td>
                <td style="color:var(--text-muted);">${record.breakStart || '–'}</td>
                <td style="color:var(--text-muted);">${record.breakEnd || '–'}</td>
                <td style="font-weight:600;color:#EF4444;">${record.clockOut || '–'}</td>
                <td>${badge}</td>
            </tr>
        `;
    }).join('');
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
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const openMin = this._toMinutes(opensAt);
        return nowMin >= openMin;
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
        if (!this._hasProfilePhoto()) {
            toast.warning('Anda belum mengupload foto profil. Silakan upload foto profil terlebih dahulu sebelum melakukan absensi.');
            router.navigate('profile');
            return true;
        }
        return false;
    },

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

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
        await this.loadAttendanceHistory(); // refresh tabel Riwayat Absensi supaya tidak nampilin data basi dari sebelum absen ini
        storage.remove('temp_attendance');
    },

    async saveAttendance(payload) {
        const data = payload || this.attendanceData;
        const user = auth.getCurrentUser();
        // Gunakan employeeId jika ada (untuk admin yang punya data karyawan sendiri)
        // Fallback ke id jika employeeId tidak ada
        data.userId = user?.employeeId || user?.id;

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

        if (statusRing) {
            statusRing.className = 'status-ring';
            const states = {
                libur:      { cls: 'waiting',   text: 'Hari Libur',       sub: (this.accessInfo && this.accessInfo.message) || 'Tidak ada jadwal kerja hari ini' },
                waiting:    { cls: 'waiting',   text: 'Siap Absen Masuk', sub: 'Tekan tombol di bawah untuk absen' },
                'clocked-in': { cls: 'active',  text: 'Sedang Bekerja',   sub: 'Semangat bekerja!' },
                'on-break': { cls: 'on-break',  text: 'Sedang Istirahat', sub: 'Nikmati waktu istirahat Anda' },
                completed:  { cls: 'completed', text: 'Selesai Bekerja',  sub: 'Terima kasih atas kerja kerasnya!' },
                dinas:      { cls: 'completed', text: 'Sedang Dinas Luar (SPPD)', sub: 'Semua sesi absensi hari ini otomatis Hadir' },
                excused:    { cls: 'completed', text: this.attendanceData.clockIn || 'Izin/Cuti', sub: 'Absensi hari ini mengikuti pengajuan yang sudah disetujui' },
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

        // Banner info Izin/Cuti (mirip pola banner Dinas Luar di atas)
        const excusedInfo = document.getElementById('excused-info');
        if (excusedInfo) {
            if (this.currentState === 'excused') {
                excusedInfo.style.display = 'block';
                const typeLabelEl = document.getElementById('excused-type-label');
                const tanggalEl   = document.getElementById('excused-tanggal');
                if (typeLabelEl) typeLabelEl.textContent = this._activeExcusedRecord?.type === 'cuti' ? 'Cuti' : 'Izin';
                if (tanggalEl)   tanggalEl.textContent   = this._activeExcusedRecord?.tanggalSelesai || '-';
            } else {
                excusedInfo.style.display = 'none';
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

        // Tombol Masuk
        const btnIn = document.getElementById('btn-clock-in');
        if (btnIn) {
            btnIn.disabled = !!d.clockIn || isLibur;
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
            if (breakSection) breakSection.style.display = '';
            if (btnBreak) {
                btnBreak.style.display = '';
                btnBreak.disabled = !d.clockIn || !!d.breakStart || !!d.clockOut;
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
                btnAfterBreak.disabled = !d.breakStart || !!d.breakEnd || !!d.clockOut;
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

        // Tombol Pulang
        const btnOut = document.getElementById('btn-clock-out');
        if (btnOut) {
            btnOut.disabled = !d.clockIn || !!d.clockOut;
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
