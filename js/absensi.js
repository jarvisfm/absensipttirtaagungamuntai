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
            const result = await api.getAllAttendance();
            const all = result.data || [];
            const effectiveId = user.employeeId || user.id;
            const history = all.filter(d => String(d.userId) === String(effectiveId));
            this.renderHistory(history);
        } catch (e) {
            console.error('Error loading history:', e);
        }
    },

    renderHistory(historyData) {
    const tbody = document.getElementById('attendance-history');
    if (!tbody) return;

    if (historyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">Belum ada riwayat absensi.</td></tr>';
        return;
    }

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

    tbody.innerHTML = historyData.slice(0, 30).map(record => {
        // Format tanggal
        const [y, m, d] = (record.date || '').split('-');
        const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';

        // Status badge
        const statusLower = String(record.status || '').toLowerCase();
        let badge = '<span class="badge-status">Menunggu</span>';
        if (statusLower === 'hadir' || statusLower === 'ontime') {
            badge = '<span class="badge-status success">Hadir</span>';
        } else if (statusLower === 'terlambat' || statusLower === 'late') {
            badge = '<span class="badge-status warning">Terlambat</span>';
        } else if (statusLower === 'pulang awal') {
            badge = '<span class="badge-status danger">Pulang Awal</span>';
        } else if (statusLower === 'pending' || statusLower === 'waiting') {
            badge = '<span class="badge-status">Pending</span>';
        }

        return `
            <tr>
                <td>${dateStr}</td>
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

        switch (action) {
            case 'clock-in':
                this.attendanceData.clockIn = timeStr;
                this.currentState = 'clocked-in';
                toast.success(`Absen masuk berhasil: ${timeStr}`);
                break;
            case 'break':
                this.attendanceData.breakStart = timeStr;
                this.currentState = 'on-break';
                toast.info(`Absen istirahat: ${timeStr}`);
                break;
            case 'after-break':
                this.attendanceData.breakEnd = timeStr;
                this.currentState = 'clocked-in';
                toast.success(`Absen kembali bekerja: ${timeStr}`);
                break;
            case 'clock-out':
                this.attendanceData.clockOut = timeStr;
                this.currentState = 'completed';
                toast.success(`Absen pulang berhasil: ${timeStr}`);
                break;
        }

        this.attendanceData.verificationPhoto     = verificationData.photo || '';
        this.attendanceData.verificationLocation  = verificationData.location || '';
        this.attendanceData.verificationTimestamp = verificationData.timestamp || '';

        await this.saveAttendance();
        this.updateUI();
        this.renderTimeline();
        storage.remove('temp_attendance');
    },

    async saveAttendance() {
    const user = auth.getCurrentUser();
    // Gunakan employeeId jika ada (untuk admin yang punya data karyawan sendiri)
    // Fallback ke id jika employeeId tidak ada
    this.attendanceData.userId = user?.employeeId || user?.id;

        try {
            const result = await api.saveAttendance(this.attendanceData);
            if (result && result.success && result.data) {
                // Sinkronkan status yang dihitung server (Hadir/Terlambat)
                this.attendanceData = { ...this.attendanceData, ...result.data };
            }
        } catch (e) {
            console.error('Error saving attendance:', e);
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
            if (d.clockIn) {
                btnIn.classList.add('completed');
                const el = document.getElementById('clock-in-time');
                if (el) el.textContent = d.clockIn;
            } else {
                btnIn.classList.remove('completed');
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
                if (d.breakStart) {
                    btnBreak.classList.add('completed');
                    const el = document.getElementById('break-time');
                    if (el) el.textContent = d.breakStart;
                } else {
                    btnBreak.classList.remove('completed');
                }
            }
            if (btnAfterBreak) {
                btnAfterBreak.style.display = '';
                btnAfterBreak.disabled = !d.breakStart || !!d.breakEnd || !!d.clockOut;
                if (d.breakEnd) {
                    btnAfterBreak.classList.add('completed');
                    const el = document.getElementById('after-break-time');
                    if (el) el.textContent = d.breakEnd;
                } else {
                    btnAfterBreak.classList.remove('completed');
                }
            }
        }

        // Tombol Pulang
        const btnOut = document.getElementById('btn-clock-out');
        if (btnOut) {
            btnOut.disabled = !d.clockIn || !!d.clockOut;
            if (d.clockOut) {
                btnOut.classList.add('completed');
                const el = document.getElementById('clock-out-time');
                if (el) el.textContent = d.clockOut;
            } else {
                btnOut.classList.remove('completed');
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
