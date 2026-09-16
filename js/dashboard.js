/**
 * Portal Karyawan - Dashboard
 * Dashboard functionality and charts
 */

const dashboard = {
    attendanceData: [],

    async init() {
        await this.loadData();

        await this.updateWelcomeCard();
        this.updateBirthdayCard();
        this.updateStats();
        this.updateSessionInfo();
        this.updateProgressBar();
        this.renderGolonganChart();
        this.renderPendidikanChart();
        this.renderPensiunTable();
    },

    async loadData() {
        try {
            const currentUser = auth.getCurrentUser();
            if (currentUser && currentUser.id) {
                // Fetch attendance and global settings concurrently
                const [attResult, settingsRes, leaveRes, izinRes, jurnalRes, empRes, allAttRes] = await Promise.all([
                    api.getAttendance(currentUser.id),
                    api.getSettings(),
                    api.getLeaves(currentUser.id).catch(() => ({ success: false })),
                    api.getIzin(currentUser.id).catch(() => ({ success: false })),
                    // PERBAIKAN PERFORMA: dulu api.getAllJournals() (SELURUH jurnal
                    // SEMUA karyawan se-perusahaan, baca penuh sheet Journals yang
                    // tidak di-cache) padahal baris di bawah cuma pakai jurnal milik
                    // user ini sendiri (lihat filter userId yang lama). Ganti ke
                    // getJournals(userId) yang sudah difilter di server (findRows),
                    // payload jauh lebih kecil & tidak perlu baca seluruh sheet.
                    api.getJournals(currentUser.id).catch(() => ({ success: false })),
                    api.getEmployees().catch(() => ({ success: false })),
                    // PERBAIKAN PERFORMA: dulu api.getAllAttendance() (SELURUH
                    // riwayat attendance perusahaan) padahal renderTeamAttendance()
                    // di bawah cuma pakai baris HARI INI (lihat filter
                    // `a.date === todayStr` di sana) - baris lain dibuang percuma
                    // sesudah di-download. Ganti ke versi ringan yang sudah
                    // difilter di server, payload jauh lebih kecil terutama utk
                    // koneksi HP.
                    api.getTodayAttendanceAll().catch(() => ({ success: false }))
                ]);

                this.attendanceData = (attResult && attResult.success) ? attResult.data : [];
                this.myLeaves = (leaveRes && leaveRes.success) ? leaveRes.data : [];
                this.myIzin = (izinRes && izinRes.success) ? izinRes.data : [];
                // Sudah difilter userId-nya di server (getJournals), jadi tidak
                // perlu difilter ulang lagi di sini seperti sebelumnya.
                this.myJurnals = (jurnalRes && jurnalRes.success) ? jurnalRes.data : [];
                this.allEmployees = (empRes && empRes.success) ? empRes.data : [];
                this.allAttendance = (allAttRes && allAttRes.success) ? allAttRes.data : [];

                // Sync global schedule shift mapping from Admin to this employee's local instance
                if (settingsRes && settingsRes.success && settingsRes.data) {
                    const globalSettings = settingsRes.data;
                    const loadedSchedules = {};
                    Object.keys(globalSettings).forEach(k => {
                        if (k.startsWith('shift_schedule_')) {
                            const monthKey = k.replace('shift_schedule_', '');
                            try {
                                loadedSchedules[monthKey] = JSON.parse(globalSettings[k]);
                            } catch (e) { }
                        }
                    });
                    if (Object.keys(loadedSchedules).length > 0) {
                        storage.set('shift_schedule', loadedSchedules);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.attendanceData = [];
            this.myLeaves = [];
            this.myIzin = [];
            this.myJurnals = [];
            this.allEmployees = [];
            this.allAttendance = [];
        }
    },

    async updateWelcomeCard() {
        const welcomeCard = document.querySelector('.welcome-card');
        const greetingEl = document.querySelector('.welcome-content h2');
        const shiftEl = document.getElementById('welcome-shift');
        const iconEl = document.querySelector('.welcome-illustration i');

        if (!welcomeCard || !greetingEl) return;

        const hour = new Date().getHours();
        let greeting = 'Selamat Pagi';
        let icon = 'fa-sun';
        let className = 'morning';

        if (hour >= 11 && hour < 15) {
            greeting = 'Selamat Siang';
            icon = 'fa-sun';
            className = 'afternoon';
        } else if (hour >= 15 && hour < 18) {
            greeting = 'Selamat Sore';
            icon = 'fa-cloud-sun';
            className = 'evening';
        } else if (hour >= 18) {
            greeting = 'Selamat Malam';
            icon = 'fa-moon';
            className = 'evening';
        }

        const userName = auth.getCurrentUser()?.name || 'User';
        greetingEl.innerHTML = `${greeting}, <span id="welcome-name">${userName}</span>! 👋`;

        if (iconEl) {
            iconEl.className = `fas ${icon}`;
        }

        // Update card class for different gradient
        welcomeCard.className = `welcome-card ${className}`;

        // Info Shift: SEKARANG diambil dari checkAttendanceAccess() di backend
        // (sumber yang sama dipakai halaman Absensi) - bukan lagi dari
        // localStorage 'shifts'/'shift_schedule' (peninggalan versi lama,
        // tidak pernah tahu soal Jenis Jadwal per karyawan atau Jadwal Jaga
        // Operator, makanya selalu nampilin "Pagi (08:00-17:00)" default
        // walau Jenis Jadwal karyawan sudah diganti admin).
        if (shiftEl) {
            shiftEl.textContent = 'Shift: Memuat...';
            try {
                const currentUser = auth.getCurrentUser();
                const userId = currentUser?.employeeId || currentUser?.id;
                const result = await api.checkAttendanceAccess(userId);

                if (result && result.success && result.data && result.data.canAccess) {
                    const info = result.data;
                    const sessions = info.sessions || [];
                    const masuk  = sessions.find(s => s.field === 'clockIn');
                    const pulang = sessions.find(s => s.field === 'clockOut');
                    const jamKerja = (masuk && pulang) ? `${masuk.time} - ${pulang.time}` : '';
                    shiftEl.textContent = jamKerja ? `Shift: ${info.shift} (${jamKerja})` : `Shift: ${info.shift}`;
                } else {
                    const msg = (result && result.data && result.data.message) || 'Tidak ada jadwal';
                    shiftEl.textContent = `Shift: Libur (${msg})`;
                }
            } catch (e) {
                console.error('Gagal ambil info shift untuk welcome card:', e);
                shiftEl.textContent = 'Shift: -';
            }
        }
    },

    /**
     * Kartu "Selamat Ulang Tahun" - muncul di dashboard SIAPA SAJA (bukan
     * cuma akun yang berulang tahun sendiri) kalau HARI INI cocok dengan
     * tanggal & bulan lahir SALAH SATU karyawan (field Tanggal Lahir di
     * profil, disimpan sebagai "YYYY-MM-DD" dari <input type="date">) -
     * supaya rekan kerja lain ikut tahu & merayakan, bukan cuma terlihat
     * oleh orang yang berulang tahun itu sendiri. Tahun lahir sengaja
     * diabaikan - yang dicocokkan cuma tanggal & bulan. Data tanggalLahir
     * SEMUA karyawan (this.allEmployees) sudah dimuat lebih dulu di sini
     * juga (dipakai fitur "Kehadiran Tim"), jadi tidak ada data tambahan
     * yang perlu diambil untuk ini.
     */
    updateBirthdayCard() {
        const card = document.getElementById('birthday-card');
        if (!card) return;

        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        const birthdayNames = (this.allEmployees || [])
            .filter(e => {
                const m = String(e?.tanggalLahir || '').match(/^\d{4}-(\d{2})-(\d{2})/);
                if (!m) return false;
                return Number(m[1]) === todayMonth && Number(m[2]) === todayDate;
            })
            .map(e => e.nama || e.name)
            .filter(Boolean);

        if (birthdayNames.length > 0) {
            card.style.display = 'flex';
            const msgEl = document.getElementById('birthday-message');
            const namesText = birthdayNames.length === 1
                ? birthdayNames[0]
                : birthdayNames.slice(0, -1).join(', ') + ' & ' + birthdayNames[birthdayNames.length - 1];
            if (msgEl) msgEl.textContent = `Selamat Ulang Tahun, ${namesText}! 🎉`;
        } else {
            card.style.display = 'none';
        }
    },

    updateStats() {
        const attendance = this.attendanceData;

        // Calculate stats
        const total = Math.max(26, attendance.length); // Assuming min 26 working days base
        const present = attendance.filter(a => ['hadir', 'ontime'].includes(String(a.status || '').toLowerCase())).length;
        const late = attendance.filter(a => ['terlambat', 'late'].includes(String(a.status || '').toLowerCase())).length;
        const absent = attendance.filter(a => ['tidak hadir', 'absent', 'alpha'].includes(String(a.status || '').toLowerCase())).length;

        // Update donut chart values
        const presentPercent = total > 0 ? Math.round((present / total) * 100) : 0;

        // Update center text
        const donutValue = document.querySelector('.donut-value');
        if (donutValue) {
            donutValue.textContent = `${presentPercent}%`;
        }

        // Update legend
        const legendValues = document.querySelectorAll('.legend-value');
        if (legendValues.length >= 3) {
            legendValues[0].textContent = `${present} hari`;
            legendValues[1].textContent = `${late} hari`;
            legendValues[2].textContent = `${absent} hari`;
        }
    },

    updateSessionInfo() {
        // Get today's attendance
        const today = dateTime.getLocalDate();
        const attendance = this.attendanceData;
        const todayAttendance = attendance.find(a => a.date === today);

        const clockInEl = document.getElementById('dashboard-clock-in');
        const clockOutEl = document.getElementById('dashboard-clock-out');
        const durationEl = document.getElementById('dashboard-duration');

        if (clockInEl) clockInEl.textContent = '--:--';
        if (clockOutEl) clockOutEl.textContent = '--:--';
        if (durationEl) durationEl.textContent = '0j 0m';

        if (todayAttendance) {
            if (clockInEl) clockInEl.textContent = todayAttendance.clockIn || '--:--';
            if (clockOutEl) clockOutEl.textContent = todayAttendance.clockOut || '--:--';

            const excusedStatuses = ['izin', 'cuti'];
            if (todayAttendance.isDinasLuar || excusedStatuses.includes(String(todayAttendance.status || '').toLowerCase())) {
                if (durationEl) durationEl.textContent = todayAttendance.clockIn || '-';
            } else if (todayAttendance.clockIn && todayAttendance.clockOut && durationEl) {
                durationEl.textContent = dateTime.calculateDuration(
                    todayAttendance.clockIn,
                    todayAttendance.clockOut
                );
            }
        }
    },

    updateProgressBar() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour + (currentMinute / 60);

        // Assuming 8-hour work day from 8 AM to 5 PM
        const startHour = 8;
        const endHour = 17;
        const totalHours = endHour - startHour;

        let progress = ((currentTime - startHour) / totalHours) * 100;
        progress = Math.max(0, Math.min(100, progress));

        const progressFill = document.getElementById('work-progress');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    },

    updateWeeklyChart() {
        const barItems = document.querySelectorAll('.bar-chart .bar-item');
        if (!barItems.length) return;

        // Tentukan tanggal Senin minggu ini
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Min, 1=Sen, ... 6=Sab
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);

        // Cari durasi kerja maksimum minggu ini untuk skala tinggi bar (default 8 jam)
        const attendance = this.attendanceData;
        const durations = [];

        barItems.forEach((item, idx) => {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + idx);
            const dayStr = this._formatDateYMD(dayDate);

            const record = attendance.find(a => a.date === dayStr);
            const fillEl = item.querySelector('.bar-fill');
            if (!fillEl) return;

            const isWeekend = idx >= 5; // Sab, Min
            const isFuture = dayDate > today && dayStr !== this._formatDateYMD(today);

            let hours = 0;
            const recordStatusLower = record ? String(record.status || '').toLowerCase() : '';
            if (record && record.isDinasLuar) {
                hours = 8; // dianggap 1 hari kerja penuh untuk keperluan grafik
            } else if (record && (recordStatusLower === 'izin' || recordStatusLower === 'cuti')) {
                hours = 0; // Izin/Cuti bukan jam kerja - biarkan 0, bukan NaN
            } else if (record && record.clockIn && record.clockOut) {
                hours = dateTime.calculateDurationHours
                    ? dateTime.calculateDurationHours(record.clockIn, record.clockOut)
                    : this._durationToHours(dateTime.calculateDuration(record.clockIn, record.clockOut));
            } else if (record && record.clockIn) {
                hours = 0.5; // Sudah clock in tapi belum clock out, tampilkan sedikit
            }
            durations.push(isWeekend || isFuture ? 0 : hours);

            const heightPercent = isWeekend || isFuture ? 0 : Math.min(100, Math.round((hours / 8) * 100));
            fillEl.style.height = `${heightPercent}%`;
            fillEl.classList.toggle('weekend', isWeekend);
        });
    },

    /**
     * [TAMBAHAN 2026-09-16, permintaan admin] 3 kartu di bawah ini
     * ("Kehadiran Minggu Ini"/"Aktivitas Terbaru"/"Kehadiran Tim")
     * digantikan oleh 3 fungsi baru di bawah - "Statistik Golongan",
     * "Statistik Tingkat Pendidikan", "Pensiun 1 Tahun Yang Akan Datang".
     * Fungsi lama (updateWeeklyChart/renderRecentActivity/
     * renderTeamAttendance) SENGAJA dibiarkan tetap ada di bawah, cuma
     * tidak dipanggil lagi dari init() - jaga-jaga kalau suatu saat mau
     * dipakai lagi, dan supaya perubahan ini tidak perlu menghapus kode
     * yang sudah ada.
     */
    renderGolonganChart() {
        const container = document.getElementById('dashboard-golongan-chart');
        if (!container) return;

        const counts = {};
        (this.allEmployees || []).forEach(e => {
            const g = String(e.golongan || '').trim();
            if (!g) return;
            counts[g] = (counts[g] || 0) + 1;
        });

        const entries = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        if (entries.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Belum ada data golongan</p>';
            return;
        }

        const max = Math.max(...entries.map(e => e[1]));
        container.innerHTML = entries.map(([label, count]) => `
            <div class="bar-item">
                <span class="bar-value">${count}</span>
                <div class="bar-fill" style="height: ${Math.max(4, Math.round((count / max) * 100))}%"></div>
                <span class="bar-label">${label}</span>
            </div>
        `).join('');
    },

    renderPendidikanChart() {
        const container = document.getElementById('dashboard-pendidikan-chart');
        if (!container) return;

        const counts = {};
        (this.allEmployees || []).forEach(e => {
            const p = String(e.pendidikan || '').trim();
            if (!p) return;
            counts[p] = (counts[p] || 0) + 1;
        });

        // Urutan jenjang dari rendah ke tinggi (supaya bar-nya berurutan
        // logis, bukan alfabetis) - nilai yang tidak ada di daftar ini
        // (data lama/format lain) tetap ditampilkan, diletakkan di akhir.
        const ORDER = ['SD', 'SLTP', 'SLTA', 'SMK', 'STM', 'D3', 'Strata 1', 'Strata 2'];
        const entries = Object.entries(counts).sort((a, b) => {
            const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]);
            if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        if (entries.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Belum ada data pendidikan</p>';
            return;
        }

        const max = Math.max(...entries.map(e => e[1]));
        container.innerHTML = entries.map(([label, count]) => `
            <div class="bar-item">
                <span class="bar-value">${count}</span>
                <div class="bar-fill" style="height: ${Math.max(4, Math.round((count / max) * 100))}%"></div>
                <span class="bar-label">${label}</span>
            </div>
        `).join('');
    },

    /**
     * "1 Tahun Yang Akan Datang" diartikan: pensiun TAHUN INI atau TAHUN
     * DEPAN (data "Tahun Pensiun" di profil karyawan cuma menyimpan
     * ANGKA TAHUN, bukan tanggal lengkap - lihat field p-tahunPensiun di
     * karyawan.js, otomatis Tahun Lahir + 56, bisa diubah manual admin) -
     * ini pendekatan yang paling masuk akal dengan granularitas data yang
     * ada (tidak bisa hitung "persis 12 bulan dari sekarang" tanpa
     * tanggal lengkap).
     */
    /**
     * Format tanggal pensiun: ambil tanggal & bulan dari tanggalLahir
     * (format input date "YYYY-MM-DD"), lalu gabungkan dengan tahunPensiun.
     * Contoh: tanggalLahir "1971-06-11" + tahunPensiun "2027" -> "11 Juni 2027".
     * Kalau tanggalLahir tidak ada/tidak valid, fallback ke tahunPensiun saja.
     */
    formatTanggalPensiun(tanggalLahir, tahunPensiun) {
        const bulanIndo = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        if (tanggalLahir) {
            const m = String(tanggalLahir).match(/-(\d{2})-(\d{2})$/);
            if (m) {
                const bulanIdx = parseInt(m[1], 10) - 1;
                const tanggal = parseInt(m[2], 10);
                if (bulanIdx >= 0 && bulanIdx < 12 && !isNaN(tanggal)) {
                    return `${tanggal} ${bulanIndo[bulanIdx]} ${tahunPensiun}`;
                }
            }
        }
        return String(tahunPensiun || '-');
    },

    renderPensiunTable() {
        const container = document.getElementById('dashboard-pensiun-table');
        if (!container) return;

        const currentYear = new Date().getFullYear();
        const list = (this.allEmployees || [])
            .filter(e => {
                const ty = parseInt(e.tahunPensiun, 10);
                return !isNaN(ty) && (ty === currentYear || ty === currentYear + 1);
            })
            .sort((a, b) => (parseInt(a.tahunPensiun, 10) - parseInt(b.tahunPensiun, 10)) || String(a.name || '').localeCompare(String(b.name || '')));

        if (list.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Tidak ada karyawan yang pensiun dalam 1 tahun ke depan</p>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x:auto;padding:0 var(--spacing-md) var(--spacing-md);">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;white-space:nowrap;">
                <thead>
                    <tr style="text-align:left;color:var(--text-muted);">
                        <th style="padding:0.5rem 0.5rem 0.5rem 0;">NIK</th>
                        <th style="padding:0.5rem;">Nama</th>
                        <th style="padding:0.5rem;">TTL</th>
                        <th style="padding:0.5rem;">Tahun Pensiun</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(e => {
                        const ttl = (e.tempatLahir || e.tanggalLahir)
                            ? `${e.tempatLahir || ''}${e.tempatLahir && e.tanggalLahir ? ', ' : ''}${e.tanggalLahir || ''}`
                            : '-';
                        return `
                        <tr style="border-top:1px solid var(--border-color);">
                            <td style="padding:0.5rem 0.5rem 0.5rem 0;">${e.nik || '-'}</td>
                            <td style="padding:0.5rem;">${e.name || '-'}</td>
                            <td style="padding:0.5rem;">${ttl}</td>
                            <td style="padding:0.5rem;">${this.formatTanggalPensiun(e.tanggalLahir, e.tahunPensiun)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;
    },

    renderRecentActivity() {
        const container = document.getElementById('dashboard-recent-activity');
        if (!container) return;

        const activities = [];

        (this.attendanceData || []).forEach(att => {
            if (att.clockIn) {
                activities.push({
                    title: 'Clock In',
                    icon: 'clock-in',
                    iconClass: 'fa-sign-in-alt',
                    timestamp: this._toTimestamp(att.verificationTimestamp || `${att.date}T${att.clockIn}`)
                });
            }
            if (att.clockOut) {
                activities.push({
                    title: 'Clock Out',
                    icon: 'clock-out',
                    iconClass: 'fa-sign-out-alt',
                    timestamp: this._toTimestamp(`${att.date}T${att.clockOut}`)
                });
            }
        });

        (this.myLeaves || []).forEach(l => {
            activities.push({
                title: 'Mengajukan Cuti',
                icon: 'leave',
                iconClass: 'fa-umbrella-beach',
                timestamp: this._toTimestamp(l.appliedAt)
            });
        });

        (this.myIzin || []).forEach(i => {
            activities.push({
                title: i.type === 'sick' ? 'Izin Sakit' : (i.typeLabel || 'Mengajukan Izin'),
                icon: 'leave',
                iconClass: 'fa-file-medical',
                timestamp: this._toTimestamp(i.appliedAt)
            });
        });

        (this.myJurnals || []).forEach(j => {
            activities.push({
                title: 'Mengisi Jurnal',
                icon: 'journal',
                iconClass: 'fa-edit',
                timestamp: this._toTimestamp(j.updatedAt)
            });
        });

        const sorted = activities
            .filter(a => a.timestamp && !isNaN(a.timestamp))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Belum ada aktivitas</p>';
            return;
        }

        container.innerHTML = sorted.map(act => `
            <div class="activity-item">
                <div class="activity-icon ${act.icon}"><i class="fas ${act.iconClass}"></i></div>
                <div class="activity-content">
                    <p class="activity-title">${act.title}</p>
                    <p class="activity-time">${this._formatRelativeTime(act.timestamp)}</p>
                </div>
            </div>
        `).join('');
    },

    renderTeamAttendance() {
        const countEl = document.getElementById('dashboard-team-count');
        const avatarsEl = document.getElementById('dashboard-team-avatars');
        const onlineEl = document.getElementById('dashboard-team-online');
        const offlineEl = document.getElementById('dashboard-team-offline');
        if (!countEl || !avatarsEl) return;

        const employees = this.allEmployees || [];
        const total = employees.length;
        const todayStr = dateTime.getLocalDate();

        // "Online" = sudah Clock In hari ini & belum Clock Out
        const onlineUserIds = new Set(
            (this.allAttendance || [])
                .filter(a => a.date === todayStr && a.clockIn && !a.clockOut)
                .map(a => String(a.userId))
        );

        const onlineCount = employees.filter(e => onlineUserIds.has(String(e.id))).length;
        const offlineCount = Math.max(0, total - onlineCount);

        countEl.textContent = `${total} orang`;
        if (onlineEl) onlineEl.textContent = onlineCount;
        if (offlineEl) offlineEl.textContent = offlineCount;

        const colors = ['F59E0B', '3B82F6', '10B981', 'EF4444', '8B5CF6', 'EC4899', '14B8A6'];
        const shown = employees.slice(0, 5);
        const extra = Math.max(0, total - shown.length);

        avatarsEl.innerHTML = shown.map((emp, idx) => {
            const src = getAvatarUrl(emp) || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || '?')}&background=${colors[idx % colors.length]}&color=fff`;
            return `<img src="${src}" alt="${emp.name || 'Karyawan'}">`;
        }).join('') + (extra > 0 ? `<div class="avatar-more">+${extra}</div>` : '');
    },

    _toTimestamp(value) {
        if (!value) return NaN;
        const t = new Date(value).getTime();
        return isNaN(t) ? NaN : t;
    },

    _formatRelativeTime(timestamp) {
        const diffMs = Date.now() - timestamp;
        if (diffMs < 0) return 'baru saja';
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'baru saja';
        if (minutes < 60) return `${minutes} menit yang lalu`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} jam yang lalu`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Kemarin';
        if (days < 30) return `${days} hari yang lalu`;
        const months = Math.floor(days / 30);
        return `${months} bulan yang lalu`;
    },

    _formatDateYMD(d) {
        const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return local.toISOString().split('T')[0];
    },

    _durationToHours(durationLabel) {
        // Fallback parser untuk label seperti "7j 30m"
        if (!durationLabel) return 0;
        const match = String(durationLabel).match(/(\d+)j\s*(\d+)?m?/);
        if (!match) return 0;
        const h = parseInt(match[1] || '0', 10);
        const m = parseInt(match[2] || '0', 10);
        return h + (m / 60);
    }
};

// Global init function called by router
window.initDashboard = async () => {
    await dashboard.init();
};

// Auto-update progress every minute
setInterval(() => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
        dashboard.updateProgressBar();
    }
}, 60000);
