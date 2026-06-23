/**
 * Portal Karyawan - Dashboard
 * Dashboard functionality and charts
 */

const dashboard = {
    initialized: false,
    attendanceData: [],

    async init() {
        if (this.initialized) return;

        await this.loadData();

        this.updateWelcomeCard();
        this.updateStats();
        this.updateSessionInfo();
        this.updateProgressBar();
        this.updateWeeklyChart();
        this.renderRecentActivity();
        this.renderTeamAttendance();

        this.initialized = true;
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
                    api.getAllJournals().catch(() => ({ success: false })),
                    api.getEmployees().catch(() => ({ success: false })),
                    api.getAllAttendance().catch(() => ({ success: false }))
                ]);

                this.attendanceData = (attResult && attResult.success) ? attResult.data : [];
                this.myLeaves = (leaveRes && leaveRes.success) ? leaveRes.data : [];
                this.myIzin = (izinRes && izinRes.success) ? izinRes.data : [];
                const allJurnals = (jurnalRes && jurnalRes.success) ? jurnalRes.data : [];
                this.myJurnals = allJurnals.filter(j => String(j.userId) === String(currentUser.id));
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

    updateWelcomeCard() {
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

        const userName = auth.getCurrentUser()?.name?.split(' ')[0] || 'User';
        greetingEl.innerHTML = `${greeting}, <span id="welcome-name">${userName}</span>! 👋`;

        if (iconEl) {
            iconEl.className = `fas ${icon}`;
        }

        // Update card class for different gradient
        welcomeCard.className = `welcome-card ${className}`;

        // Update shift info
        const shifts = storage.get('shifts', []);
        let currentShiftName = auth.getCurrentUser()?.shift || 'Pagi';

        // Automated shift lookup from admin schedule
        try {
            const userId = String(auth.getCurrentUser()?.id);
            const schedules = storage.get('shift_schedule', {});
            const todayObj = new Date();
            const currentYear = todayObj.getFullYear();
            const currentMonth = todayObj.getMonth();
            const currentDay = todayObj.getDate();
            const key = `${currentYear}-${currentMonth}`;

            console.log('Dashboard Shift Sync - Key:', key, 'UserId:', userId, 'Day:', currentDay);

            if (schedules[key] && schedules[key][userId]) {
                const assignedShift = schedules[key][userId][currentDay];
                console.log('Dashboard Shift Sync - Found Shift:', assignedShift);
                if (assignedShift) {
                    currentShiftName = assignedShift;
                }
            } else {
                console.log('Dashboard Shift Sync - Missing Schedule key or User record.');
            }
        } catch (e) {
            console.error('Error reading shift schedule:', e);
        }

        const activeShift = shifts.find(s => s.name === currentShiftName) || shifts[0] || { name: 'Pagi', startTime: '08:00', endTime: '17:00' };

        if (shiftEl) {
            if (currentShiftName === 'Libur') {
                shiftEl.textContent = `Shift: Libur (Tidak ada jadwal)`;
            } else {
                shiftEl.textContent = `Shift: ${activeShift.name} (${activeShift.startTime} - ${activeShift.endTime})`;
            }
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

            if (todayAttendance.clockIn && todayAttendance.clockOut && durationEl) {
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
            if (record && record.clockIn && record.clockOut) {
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
