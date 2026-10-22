/**
 * Portal Karyawan - Admin Dashboard
 * Admin dashboard with employee statistics
 */

const adminDashboard = {
    employees: [],
    attendance: [],
    leaves: [],

    async init() {
        if (!auth.isAdmin() && !auth.hasSharedMenu('admin-dashboard')) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.updateStats();
        this.bindStatPopups();
        this.renderJenisKaryawan();
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

        this.updateStatBadges({
            total: totalEmployees, present: presentToday, absent: absentToday,
            late: lateToday, leave: onLeave, pending: totalPending
        });
        this.buildStatLists(todayStr);
    },

    // ── Popup daftar karyawan (klik kartu Hadir / Tidak Hadir / Cuti / Terlambat) ──
    STAT_POPUP: {
        'present-today': { key: 'present', judul: 'Hadir Hari Ini', c: '#10B981', soft: '#ECFDF5' },
        'absent-today': { key: 'absent', judul: 'Tidak Hadir', c: '#EF4444', soft: '#FEF2F2' },
        'late-today': { key: 'late', judul: 'Terlambat', c: '#F59E0B', soft: '#FFFBEB' },
        'on-leave': { key: 'leave', judul: 'Sedang Cuti / Izin', c: '#8B5CF6', soft: '#F5F3FF' }
    },
    _statLists: { present: [], absent: [], late: [], leave: [] },

    // Susun daftar orang per kategori memakai aturan yang sama dengan angka di kartu.
    buildStatLists(todayStr) {
        const emp = {};
        this.employees.forEach(e => { emp[String(e.id)] = e; });
        const sub = e => e.jabatan || e.bagian || '';
        const uniq = new Map();
        const add = (map, e, extra) => { if (e && !map.has(String(e.id))) map.set(String(e.id), { nama: e.nama || '-', sub: sub(e), meta: extra || '' }); };

        const present = new Map(), late = new Map(), leave = new Map();
        this.attendance.filter(a => a.date === todayStr && a.clockIn).forEach(a => {
            const e = emp[String(a.userId)];
            add(present, e, a.clockIn);
            if (a.status && String(a.status).toLowerCase() === 'terlambat') add(late, e, a.clockIn);
        });
        this.leaves.filter(l => l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr)
            .forEach(l => add(leave, emp[String(l.userId)], l.typeLabel || 'Cuti'));
        this.izin.filter(i => i.status === 'approved' && i.date === todayStr)
            .forEach(i => add(leave, emp[String(i.userId)], i.typeLabel || 'Izin'));

        const absent = new Map();
        this.employees.forEach(e => {
            const id = String(e.id);
            if (!present.has(id) && !leave.has(id)) add(absent, e, e.bagian || '');
        });
        const arr = m => Array.from(m.values()).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
        this._statLists = { present: arr(present), absent: arr(absent), late: arr(late), leave: arr(leave) };
    },

    // Jadikan 4 kartu bisa diklik (dipasang sekali).
    bindStatPopups() {
        this._popStyle();
        Object.keys(this.STAT_POPUP).forEach(id => {
            const card = document.getElementById(id) && document.getElementById(id).closest('.admin-stat-card');
            if (!card || card.dataset.popup) return;
            card.dataset.popup = '1';
            card.classList.add('asc-click');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.title = 'Klik untuk melihat daftar karyawan';
            card.addEventListener('click', () => this.lihatStat(id));
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.lihatStat(id); } });
        });
    },

    _popStyle() {
        if (!document.getElementById('adm-pop-style')) {
            const st = document.createElement('style');
            st.id = 'adm-pop-style';
            st.textContent = `
                .asc-click { cursor: pointer; }
                .asc-click:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
                .adm-pop-ov { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 10100; display: flex; align-items: center; justify-content: center; padding: 16px; }
                .adm-pop { width: 100%; max-width: 380px; max-height: 72vh; display: flex; flex-direction: column; background: var(--bg-secondary, #fff); color: var(--text-primary, #0f172a);
                    border-radius: 18px; box-shadow: 0 24px 60px -12px rgba(15,23,42,.4); overflow: hidden; animation: admPop .18s ease-out; }
                @keyframes admPop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
                .adm-pop-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(148,163,184,.25); }
                .adm-pop-head b { flex: 1; font-size: .95rem; }
                .adm-pop-n { padding: 2px 10px; border-radius: 99px; font-size: .74rem; font-weight: 700; background: var(--soft); color: var(--c); }
                .adm-pop-x { border: 0; background: transparent; color: #94a3b8; font-size: 1rem; cursor: pointer; padding: 4px 6px; border-radius: 8px; }
                .adm-pop-x:hover { background: rgba(148,163,184,.18); color: #475569; }
                .adm-pop-q { margin: 10px 16px 0; padding: 8px 12px; border: 1px solid rgba(148,163,184,.4); border-radius: 10px; font: inherit; font-size: .84rem; background: transparent; color: inherit; }
                .adm-pop-list { overflow-y: auto; padding: 6px 8px 10px; -webkit-overflow-scrolling: touch; }
                .adm-pop-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; }
                .adm-pop-row:hover { background: rgba(148,163,184,.12); }
                .adm-pop-av { width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--soft); color: var(--c); font-size: .8rem; font-weight: 700; }
                .adm-pop-tx { flex: 1; min-width: 0; }
                .adm-pop-tx b { display: block; font-size: .84rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .adm-pop-tx small { display: block; font-size: .72rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .adm-pop-meta { font-size: .74rem; font-weight: 600; color: var(--c); white-space: nowrap; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
                .adm-pop-empty { padding: 28px 12px; text-align: center; font-size: .84rem; color: #94a3b8; }`;
            document.head.appendChild(st);
        }
    },

    lihatStat(id) {
        const cfg = this.STAT_POPUP[id];
        if (!cfg) return;
        this.bukaPopupDaftar(cfg, this._statLists[cfg.key] || []);
    },

    // Popup minimalis daftar karyawan (dipakai kartu statistik & badge jenis karyawan).
    bukaPopupDaftar(cfg, data) {
        this.tutupStat();
        this._popStyle();
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const ov = document.createElement('div');
        ov.id = 'adm-pop-ov';
        ov.className = 'adm-pop-ov';
        ov.style.cssText = `--c:${cfg.c};--soft:${cfg.soft}`;
        const rows = list => list.length ? list.map(u => `<div class="adm-pop-row">
                <span class="adm-pop-av">${esc((u.nama.trim().charAt(0) || '?').toUpperCase())}</span>
                <span class="adm-pop-tx"><b>${esc(u.nama)}</b>${u.sub ? `<small>${esc(u.sub)}</small>` : ''}</span>
                ${u.meta ? `<span class="adm-pop-meta">${esc(u.meta)}</span>` : ''}</div>`).join('')
            : '<div class="adm-pop-empty">Tidak ada karyawan.</div>';
        ov.innerHTML = `<div class="adm-pop" role="dialog" aria-label="${esc(cfg.judul)}">
            <div class="adm-pop-head"><b>${esc(cfg.judul)}</b><span class="adm-pop-n">${data.length} orang</span>
                <button type="button" class="adm-pop-x" aria-label="Tutup"><i class="fas fa-xmark"></i></button></div>
            ${data.length > 10 ? '<input type="text" class="adm-pop-q" placeholder="Cari nama..." autocomplete="off">' : ''}
            <div class="adm-pop-list">${rows(data)}</div></div>`;
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.adm-pop-x')) this.tutupStat(); });
        const q = ov.querySelector('.adm-pop-q');
        if (q) q.addEventListener('input', () => {
            const k = q.value.trim().toLowerCase();
            ov.querySelector('.adm-pop-list').innerHTML = rows(k ? data.filter(u => u.nama.toLowerCase().includes(k) || u.sub.toLowerCase().includes(k)) : data);
        });
        this._popEsc = e => { if (e.key === 'Escape') this.tutupStat(); };
        document.addEventListener('keydown', this._popEsc);
        document.body.appendChild(ov);
    },

    tutupStat() {
        const ov = document.getElementById('adm-pop-ov');
        if (ov) ov.remove();
        if (this._popEsc) { document.removeEventListener('keydown', this._popEsc); this._popEsc = null; }
    },

    // Pil persen + batang tipis pada kartu statistik (persen terhadap total karyawan;
    // "Terlambat" dihitung terhadap yang hadir, "Menunggu Approval" berupa penanda).
    updateStatBadges(v) {
        const total = v.total || 0;
        const share = n => (total ? (n / total) * 100 : 0);
        const set = (id, text, pct) => {
            const p = document.getElementById('pct-' + id);
            if (p) p.textContent = text;
            const b = document.getElementById('bar-' + id);
            if (b) b.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
        };
        set('total-employees', total ? '100%' : '0%', total ? 100 : 0);
        set('present-today', Math.round(share(v.present)) + '%', share(v.present));
        set('absent-today', Math.round(share(v.absent)) + '%', share(v.absent));
        set('on-leave', Math.round(share(v.leave)) + '%', share(v.leave));
        const pHadir = v.present ? (v.late / v.present) * 100 : 0;
        set('late-today', Math.round(pHadir) + '% dari hadir', pHadir);
        set('pending-requests', v.pending > 0 ? 'Perlu aksi' : 'Beres', v.pending > 0 ? Math.max(8, share(v.pending)) : 0);
    },

    // ── Komposisi jenis karyawan (field statusPekerjaan) ─────────
    // Dihitung dari data yang sama dengan kartu "Total Karyawan", jadi
    // jumlah semua badge selalu sama dengan totalnya.
    JENIS_KARYAWAN: [
        { label: 'Karyawan Tetap', icon: 'fa-user-shield', c: '#6366F1', soft: '#EEF2FF', line: '#C7D2FE', cocok: s => s.includes('tetap') },
        { label: 'Tenaga Kontrak', icon: 'fa-file-signature', c: '#F59E0B', soft: '#FFFBEB', line: '#FDE68A', cocok: s => s.includes('kontrak') },
        { label: 'Outsourcing', icon: 'fa-people-carry-box', c: '#14B8A6', soft: '#F0FDFA', line: '#99F6E4', cocok: s => s.includes('outsourc') || s.includes('alih daya') }
    ],

    renderJenisKaryawan() {
        const badges = document.getElementById('aj-badges');
        if (!badges) return;
        const bar = document.getElementById('aj-bar');
        const totalEl = document.getElementById('aj-total');
        const list = this.employees || [];
        const total = list.length;

        const items = this.JENIS_KARYAWAN.map(j => ({ ...j, n: 0, klik: true, orang: [] }));
        const lain = { label: 'Belum diisi / lainnya', icon: 'fa-circle-question', c: '#94A3B8', soft: '#F8FAFC', line: '#E2E8F0', n: 0, klik: true, orang: [] };
        list.forEach(e => {
            const s = String(e.statusPekerjaan || '').toLowerCase().trim();
            const hit = items.find(j => j.cocok(s));
            const t = hit || lain;
            t.n++;
            t.orang.push({ nama: e.nama || '-', sub: e.jabatan || '', meta: e.bagian || '' });
        });
        this._jenisLists = {};
        items.concat([lain]).forEach(i => {
            i.orang.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }));
            this._jenisLists[i.label] = { cfg: { judul: i.label, c: i.c, soft: i.soft }, orang: i.orang };
        });
        if (lain.n > 0) items.push(lain);

        if (totalEl) totalEl.textContent = total + ' orang';
        if (!total) {
            if (bar) bar.innerHTML = '';
            badges.innerHTML = '<p class="aj-empty">Belum ada data karyawan.</p>';
            return;
        }

        const pct = n => (n / total) * 100;
        if (bar) {
            bar.innerHTML = items.filter(i => i.n > 0).map(i =>
                `<span class="aj-seg" style="width:${pct(i.n).toFixed(2)}%;background:${i.c}" title="${i.label}: ${i.n}"></span>`).join('');
        }

        const bisaKlik = true;
        badges.innerHTML = items.map(i => {
            const tag = (i.klik && bisaKlik) ? 'button type="button"' : 'div';
            const end = (i.klik && bisaKlik) ? 'button' : 'div';
            const aksi = (i.klik && bisaKlik)
                ? ` onclick="adminDashboard.lihatJenis(this.dataset.jenis)" data-jenis="${i.label}" title="Lihat daftar ${i.label}"` : '';
            return `<${tag} class="aj-badge${i.klik && bisaKlik ? ' aj-click' : ''}" style="--c:${i.c};--soft:${i.soft};--line:${i.line}"${aksi}>
                <span class="aj-ic"><i class="fas ${i.icon}"></i></span>
                <span class="aj-body"><span class="aj-label">${i.label}</span><span class="aj-num" data-n="${i.n}">0</span></span>
                <span class="aj-pct">${Math.round(pct(i.n))}%</span>
            </${end}>`;
        }).join('');

        badges.querySelectorAll('.aj-num').forEach(el => this.animateNumber(el, 0, parseInt(el.dataset.n) || 0));
    },

    // Klik badge: popup minimalis daftar karyawan untuk jenis tersebut.
    lihatJenis(jenis) {
        const d = this._jenisLists && this._jenisLists[jenis];
        if (d) this.bukaPopupDaftar(d.cfg, d.orang);
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
