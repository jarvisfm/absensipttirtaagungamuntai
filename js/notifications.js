/**
 * Portal Karyawan - Notifications
 * Mengisi lonceng notifikasi dengan data nyata:
 * - Admin: pengajuan Izin/Cuti yang masih "Menunggu" persetujuan
 * - Karyawan: status pengajuan Izin/Cuti miliknya yang sudah disetujui/ditolak,
 *             + reminder belum absen hari ini (kalau sudah lewat jam tertentu)
 */

const notifications = {
    items: [],
    panelOpen: false,

    async init() {
        const btn = document.getElementById('btn-notifications');
        if (!btn) return;

        this._ensurePanel();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notif-panel');
            if (this.panelOpen && panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                this.closePanel();
            }
        });

        await this.load();
    },

    _ensurePanel() {
        if (document.getElementById('notif-panel')) return;
        const btn = document.getElementById('btn-notifications');
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        btn.parentNode.insertBefore(wrapper, btn);
        wrapper.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'notif-panel';
        panel.style.cssText = `
            position:absolute; top:48px; right:0; width:340px; max-height:420px;
            overflow-y:auto; background:#fff; border-radius:10px;
            box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:999; display:none;
        `;
        panel.innerHTML = `
            <div style="padding:14px 16px;border-bottom:1px solid #eee;font-weight:600;">Notifikasi</div>
            <div id="notif-list" style="padding:8px;"></div>
        `;
        wrapper.appendChild(panel);
    },

    togglePanel() {
        this.panelOpen ? this.closePanel() : this.openPanel();
    },

    openPanel() {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.style.display = 'block';
        this.panelOpen = true;
    },

    closePanel() {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.style.display = 'none';
        this.panelOpen = false;
    },

    async load() {
        const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
        if (!user) return;

        this.items = [];

        try {
            if (auth.isAdmin && auth.isAdmin()) {
                await this._loadAdminNotifications();
            } else {
                await this._loadKaryawanNotifications(user);
            }
        } catch (e) {
            console.error('Gagal memuat notifikasi:', e);
        }

        this._render();
    },

    async _loadAdminNotifications() {
        const [izinRes, leaveRes] = await Promise.all([
            api.getAllIzin().catch(() => ({ success: false })),
            api.getAllLeaves().catch(() => ({ success: false }))
        ]);

        const izinPending = (izinRes.success ? izinRes.data : []).filter(i => i.status === 'pending');
        const leavePending = (leaveRes.success ? leaveRes.data : []).filter(l => l.status === 'pending');

        izinPending.forEach(i => this.items.push({
            icon: 'fa-user-clock',
            color: '#F59E0B',
            title: `Pengajuan ${i.typeLabel || 'Izin'} menunggu persetujuan`,
            desc: i.reason || '',
            time: i.appliedAt || i.date,
            link: 'leave-reports'
        }));

        leavePending.forEach(l => this.items.push({
            icon: 'fa-calendar-alt',
            color: '#F59E0B',
            title: `Pengajuan Cuti (${l.typeLabel || ''}) menunggu persetujuan`,
            desc: l.reason || '',
            time: l.appliedAt || l.startDate,
            link: 'leave-reports'
        }));

        this._sortByTime();
    },

    async _loadKaryawanNotifications(user) {
        const [izinRes, leaveRes, attRes] = await Promise.all([
            api.getIzin(user.id).catch(() => ({ success: false })),
            api.getLeaves(user.id).catch(() => ({ success: false })),
            api.getAllAttendance().catch(() => ({ success: false }))
        ]);

        const izinData = izinRes.success ? izinRes.data : [];
        const leaveData = leaveRes.success ? leaveRes.data : [];

        izinData.filter(i => i.status === 'approved' || i.status === 'rejected').forEach(i => {
            this.items.push({
                icon: i.status === 'approved' ? 'fa-check-circle' : 'fa-times-circle',
                color: i.status === 'approved' ? '#10B981' : '#EF4444',
                title: `Pengajuan ${i.typeLabel || 'Izin'} ${i.status === 'approved' ? 'disetujui' : 'ditolak'}`,
                desc: i.date || '',
                time: i.appliedAt || i.date,
                link: 'izin'
            });
        });

        leaveData.filter(l => l.status === 'approved' || l.status === 'rejected').forEach(l => {
            this.items.push({
                icon: l.status === 'approved' ? 'fa-check-circle' : 'fa-times-circle',
                color: l.status === 'approved' ? '#10B981' : '#EF4444',
                title: `Pengajuan Cuti ${l.status === 'approved' ? 'disetujui' : 'ditolak'}`,
                desc: `${l.startDate || ''} - ${l.endDate || ''}`,
                time: l.appliedAt || l.startDate,
                link: 'cuti'
            });
        });

        // Reminder belum absen hari ini (kalau sudah lewat jam 9 pagi)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const hour = today.getHours();

        if (hour >= 9) {
            const attData = attRes.success ? attRes.data : [];
            const todayRecord = attData.find(a =>
                String(a.userId) === String(user.id) &&
                String(a.date).startsWith(todayStr)
            );
            if (!todayRecord || !todayRecord.clockIn) {
                this.items.unshift({
                    icon: 'fa-exclamation-triangle',
                    color: '#EF4444',
                    title: 'Kamu belum absen hari ini',
                    desc: 'Jangan lupa clock-in ya!',
                    time: new Date().toISOString(),
                    link: 'absensi'
                });
            }
        }

        this._sortByTime();
    },

    _sortByTime() {
        this.items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    },

    _render() {
        const badge = document.querySelector('#btn-notifications .badge');
        const list = document.getElementById('notif-list');

        if (badge) {
            if (this.items.length > 0) {
                badge.textContent = this.items.length > 9 ? '9+' : this.items.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!list) return;

        if (this.items.length === 0) {
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Tidak ada notifikasi baru</div>`;
            return;
        }

        list.innerHTML = this.items.map(item => `
            <div onclick="notifications._goTo('${item.link}')" style="display:flex;gap:10px;padding:10px 8px;border-radius:8px;cursor:pointer;" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='transparent'">
                <div style="width:32px;height:32px;border-radius:50%;background:${item.color}20;color:${item.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${item.icon}"></i>
                </div>
                <div style="min-width:0;">
                    <div style="font-size:0.85rem;font-weight:500;color:#111827;">${item.title}</div>
                    ${item.desc ? `<div style="font-size:0.78rem;color:#6B7280;margin-top:2px;">${item.desc}</div>` : ''}
                </div>
            </div>
        `).join('');
    },

    _goTo(page) {
        this.closePanel();
        if (window.router) router.navigate(page);
    }
};

window.notifications = notifications;
