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

            // Tentukan state
            if (!this.accessInfo || !this.accessInfo.canAccess) {
                this.currentState = 'libur';
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
            const effectiveId = user.employeeId || user.id;
            // Pakai endpoint yang sudah difilter userId DI SERVER, bukan
            // getAllAttendance() yang menarik data semua karyawan lalu
            // difilter di browser (itu penyebab history user lain sempat
            // kebaca sebelum filter jalan).
            const result = await api.getAttendance(effectiveId);
            const history = result.data || [];
            this.renderHistory(history);
        } catch (e) {
            console.error('Error loading history:', e);
        }
    },

    renderHistory(historyData) {
    const tbody = document.getElementById('attendance-history');
    if (!tbody) return;

    if (historyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="history-empty"><i class="fas fa-calendar-day"></i><span>Belum ada riwayat absensi.</span></div></td></tr>';
        return;
    }

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const todayYMD = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate() : '';

    tbody.innerHTML = historyData.slice(0, 30).map(record => {
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
        const now = new Date();
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

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

        // Cek portal sudah buka?
        const sesiMasuk = this._getSessions().find(s => s.field === 'clockIn');
        if (sesiMasuk && !this._isSessionOpen(sesiMasuk.opensAt)) {
            toast.warning(`Portal absen masuk baru dibuka pukul ${sesiMasuk.opensAt}`);
            return;
        }

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

        router.navigate('face-recognition');
        setTimeout(() => { if (window.faceRecognition) window.faceRecognition.init('clock-out'); }, 100);
    },

    async processWithVerification(action, verificationData) {
        const now     = new Date();
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
                libur:      { cls: 'waiting',   text: 'Hari Libur',       sub: 'Tidak ada jadwal kerja hari ini' },
                waiting:    { cls: 'waiting',   text: 'Siap Absen Masuk', sub: 'Tekan tombol di bawah untuk absen' },
                'clocked-in': { cls: 'active',  text: 'Sedang Bekerja',   sub: 'Semangat bekerja!' },
                'on-break': { cls: 'on-break',  text: 'Sedang Istirahat', sub: 'Nikmati waktu istirahat Anda' },
                completed:  { cls: 'completed', text: 'Selesai Bekerja',  sub: 'Terima kasih atas kerja kerasnya!' },
            };
            const s = states[this.currentState] || states.waiting;
            statusRing.classList.add(s.cls);
            if (statusText)    statusText.textContent    = s.text;
            if (statusSubtext) statusSubtext.textContent = s.sub;
        }

        const isLibur     = this.currentState === 'libur';
        const hasBreak    = this._hasBreak();
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

            // Sembunyikan item istirahat jika shift tidak punya istirahat
            if ((type === 'break' || type === 'after-break') && !this._hasBreak()) {
                item.style.display = 'none';
            } else {
                item.style.display = '';
            }
        });
    }
};

window.initAbsensi = () => { absensi.init(); };
window.absensi = absensi;
