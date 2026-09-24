/**
 * Portal Karyawan - Admin Dashboard
 * Admin dashboard with employee statistics
 */

const adminDashboard = {
    employees: [],
    attendance: [],
    leaves: [],

    async init() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.updateStats();
        this.renderRecentActivity();
        this.renderGolonganChart();
        this.renderPendidikanChart();
        this.renderPensiunTable();
    },

    async loadData() {
        try {
            const [empResult, attResult, leaveResult, izinResult, jurnalResult] = await Promise.all([
                api.getEmployees(),
                // PERBAIKAN PERFORMA (24 September 2026): dashboard cuma
                // pernah pakai attendance 30 hari terakhir (stats hari
                // ini, recent activity, chart 30 hari) - lihat
                // renderAttendanceChart() & updateStats() di bawah.
                // getAllAttendance() (dump seluruh histori) diganti
                // getDashboardAttendance() yang sudah dibatasi di server.
                api.getDashboardAttendance(),
                api.getAllLeaves(),
                api.getAllIzin(),
                api.getAllJournals()
            ]);
            this.employees = empResult.data || [];
            this.attendance = attResult.data || [];
            this.leaves = leaveResult.data || [];
            this.izin = izinResult.data || [];
            this.jurnals = jurnalResult.data || [];
        } catch (error) {
            console.error('Error loading admin data:', error);
            this.employees = storage.get('admin_employees', []);
            this.attendance = storage.get('attendance', []);
            this.leaves = storage.get('leaves', []);
            this.izin = storage.get('izin', []);
            this.jurnals = storage.get('jurnals', []);
        }
    },

    updateStats() {
        const totalEmployees = this.employees.length;
        const todayStr = dateTime.getLocalDate(); // yyyy-MM-dd

        // Filter attendance to ONLY today's records
        const todayAttendance = this.attendance.filter(a => a.date === todayStr);

        // Compute from real Today records
        let presentToday = 0;
        let lateToday = 0;

        todayAttendance.forEach(att => {
            if (att.clockIn) {
                presentToday++;
                // Check if late
                if (att.status && att.status.toLowerCase() === 'terlambat') {
                    lateToday++;
                }
            }
        });

        // Compute those on leave (cuti / izin) for today
        const onLeave = this.leaves.filter(l => l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr).length +
            this.izin.filter(i => i.status === 'approved' && i.date === todayStr).length;

        // Everyone not present and not on leave is absent
        const absentToday = Math.max(0, totalEmployees - presentToday - onLeave);

        // Count pending requests
        const pendingLeaves = this.leaves.filter(l => l.status === 'pending').length;
        const pendingIzin = this.izin.filter(i => i.status === 'pending').length;
        const totalPending = pendingLeaves + pendingIzin;

        // Update DOM
        const els = {
            'total-employees': totalEmployees,
            'present-today': presentToday,
            'absent-today': absentToday,
            'late-today': lateToday,
            'on-leave': onLeave,
            'pending-requests': totalPending
        };

        Object.entries(els).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                // Animate number
                this.animateNumber(el, parseInt(el.textContent) || 0, value);
            }
        });
    },

    animateNumber(element, start, end) {
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (end - start) * easeOutQuart);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    renderRecentActivity() {
        const container = document.getElementById('admin-recent-activity');
        if (!container) return;

        const findEmp = (userId) => this.employees.find(e => String(e.id) === String(userId));
        const activities = [];

        // Aktivitas Absensi (Clock In / Clock Out)
        (this.attendance || []).forEach(att => {
            const emp = findEmp(att.userId);
            const empName = emp?.name || `Karyawan #${att.userId}`;
            const baseTime = att.verificationTimestamp || att.date;

            if (att.clockIn) {
                activities.push({
                    user: empName,
                    avatar: emp?.avatar,
                    action: 'Clock In',
                    timestamp: this._toTimestamp(att.verificationTimestamp || `${att.date}T${att.clockIn}`)
                });
            }
            if (att.clockOut) {
                activities.push({
                    user: empName,
                    avatar: emp?.avatar,
                    action: 'Clock Out',
                    timestamp: this._toTimestamp(`${att.date}T${att.clockOut}`)
                });
            }
        });

        // Aktivitas Cuti
        (this.leaves || []).forEach(l => {
            const emp = findEmp(l.userId);
            activities.push({
                user: emp?.name || `Karyawan #${l.userId}`,
                avatar: emp?.avatar,
                action: 'Mengajukan Cuti',
                timestamp: this._toTimestamp(l.appliedAt)
            });
        });

        // Aktivitas Izin
        (this.izin || []).forEach(i => {
            const emp = findEmp(i.userId);
            const label = i.type === 'sick' ? 'Izin Sakit'
                : i.type === 'permission' ? 'Izin Penting'
                : i.type === 'emergency' ? 'Izin Keadaan Darurat'
                : (i.typeLabel || 'Mengajukan Izin');
            activities.push({
                user: emp?.name || `Karyawan #${i.userId}`,
                avatar: emp?.avatar,
                action: label,
                timestamp: this._toTimestamp(i.appliedAt)
            });
        });

        // Aktivitas Jurnal
        (this.jurnals || []).forEach(j => {
            const emp = findEmp(j.userId);
            activities.push({
                user: emp?.name || `Karyawan #${j.userId}`,
                avatar: emp?.avatar,
                action: 'Mengisi Jurnal',
                timestamp: this._toTimestamp(j.updatedAt)
            });
        });

        // Urutkan dari terbaru, ambil yang valid timestamp-nya saja
        const sorted = activities
            .filter(a => a.timestamp && !isNaN(a.timestamp))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 8);

        if (sorted.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Belum ada aktivitas</p>';
            return;
        }

        container.innerHTML = sorted.map(act => `
            <div class="activity-item">
                <div class="activity-avatar">
                    <img src="${getAvatarUrl({ name: act.user, avatar: act.avatar })}" alt="${act.user}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${act.user}</strong> ${act.action}</p>
                    <span class="activity-time">${this._formatRelativeTime(act.timestamp)}</span>
                </div>
            </div>
        `).join('');
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
        if (days < 30) return `${days} hari yang lalu`;
        const months = Math.floor(days / 30);
        return `${months} bulan yang lalu`;
    },

    renderOnlineUsers() {
        const container = document.getElementById('admin-online-users');
        if (!container) return;

        const todayStr = this._formatDateYMD(new Date());

        // "Online" = sudah Clock In hari ini & belum Clock Out
        const todayAttendance = this.attendance.filter(a =>
            a.date === todayStr && a.clockIn && !a.clockOut
        );

        const onlineUsers = todayAttendance
            .map(att => this.employees.find(e => String(e.id) === String(att.userId)))
            .filter(Boolean);

        const onlineCount = onlineUsers.length;

        const countEl = document.getElementById('online-count');
        if (countEl) countEl.textContent = onlineCount;

        if (onlineUsers.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Belum ada karyawan yang clock in</p>';
            return;
        }

        container.innerHTML = onlineUsers.slice(0, 5).map(user => `
            <div class="online-user-item">
                <div class="user-status-dot"></div>
                <div class="activity-avatar">
                    <img src="${getAvatarUrl(user)}" alt="${user.name}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${user.name}</strong></p>
                    <span class="activity-time">${user.department} - ${user.position}</span>
                </div>
            </div>
        `).join('');
    },

    /**
     * [TAMBAHAN, permintaan admin] Kartu "Karyawan Online" digantikan oleh
     * 3 kartu ini - "Statistik Golongan", "Statistik Tingkat Pendidikan",
     * "Pensiun 1 Tahun Yang Akan Datang" - persis sama dengan yang sudah
     * ada di dashboard karyawan (lihat renderGolonganChart/
     * renderPendidikanChart/renderPensiunTable di dashboard.js), cuma versi
     * admin ini pakai this.employees (sudah dimuat loadData() di atas)
     * dan container ID sendiri supaya tidak bentrok dengan punya karyawan.
     * renderOnlineUsers() di atas SENGAJA dibiarkan tetap ada (cuma tidak
     * dipanggil lagi dari init()) - jaga-jaga kalau suatu saat mau dipakai
     * lagi, sama seperti pola yang sudah dipakai di dashboard.js.
     */
    renderGolonganChart() {
        const container = document.getElementById('admin-golongan-chart');
        if (!container) return;

        const counts = {};
        (this.employees || []).forEach(e => {
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
        const container = document.getElementById('admin-pendidikan-chart');
        if (!container) return;

        const counts = {};
        (this.employees || []).forEach(e => {
            const p = String(e.pendidikan || '').trim();
            if (!p) return;
            counts[p] = (counts[p] || 0) + 1;
        });

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
     * Format tanggal pensiun: ambil tanggal & bulan dari tanggalLahir
     * (format input date "YYYY-MM-DD"), lalu gabungkan dengan tahunPensiun.
     * Sama persis dengan formatTanggalPensiun() di dashboard.js.
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
        const container = document.getElementById('admin-pensiun-table');
        if (!container) return;

        const currentYear = new Date().getFullYear();
        const list = (this.employees || [])
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

    // Charts initialization using Chart.js
    initCharts() {
        this.renderAttendanceChart();
        this.renderDeptChart();
    },

    _formatDateYMD(d) {
        const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        return local.toISOString().split('T')[0];
    },

    renderAttendanceChart() {
        const container = document.getElementById('admin-attendance-chart');
        if (!container || typeof Chart === 'undefined') return;

        // Siapkan 30 hari terakhir
        const days = [];
        const counts = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = this._formatDateYMD(d); // yyyy-MM-dd
            const label = `${d.getDate()}/${d.getMonth() + 1}`;
            const hadirCount = this.attendance.filter(a => a.date === dateStr && a.clockIn).length;
            days.push(label);
            counts.push(hadirCount);
        }

        container.innerHTML = '<canvas id="admin-attendance-canvas"></canvas>';
        const ctx = document.getElementById('admin-attendance-canvas');

        if (this._attendanceChartInstance) this._attendanceChartInstance.destroy();
        this._attendanceChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'Karyawan Hadir',
                    data: counts,
                    backgroundColor: '#3B82F6',
                    borderRadius: 4,
                    maxBarThickness: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { autoSkip: true, maxRotation: 0 } }
                }
            }
        });
    },

    renderDeptChart() {
        const container = document.getElementById('admin-dept-chart');
        if (!container || typeof Chart === 'undefined') return;

        const todayStr = dateTime.getLocalDate();
        const todayAttendance = this.attendance.filter(a => a.date === todayStr && a.clockIn);

        // Hitung kehadiran hari ini per departemen
        const deptCounts = {};
        todayAttendance.forEach(att => {
            const emp = this.employees.find(e => String(e.id) === String(att.userId));
            const dept = emp?.department || 'Lainnya';
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        });

        const labels = Object.keys(deptCounts);
        const data = Object.values(deptCounts);
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

        container.innerHTML = labels.length
            ? '<canvas id="admin-dept-canvas"></canvas>'
            : '<div class="chart-placeholder"><i class="fas fa-chart-pie"></i><p>Belum ada kehadiran hari ini</p></div>';

        if (!labels.length) return;

        const ctx = document.getElementById('admin-dept-canvas');
        if (this._deptChartInstance) this._deptChartInstance.destroy();
        this._deptChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: labels.map((_, i) => colors[i % colors.length])
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
};

// Global init function
window.initAdminDashboard = () => {
    adminDashboard.init();
    adminDashboard.initCharts();
};

// Expose
window.adminDashboard = adminDashboard;
