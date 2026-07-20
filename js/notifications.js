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

        // PENTING: init() bisa terpanggil lebih dari sekali dalam 1 sesi
        // (misal tiap kali showApp() jalan lagi). Tanpa guard ini, listener
        // klik akan numpuk setiap kali init() dipanggil, jadi 1 klik bisa
        // memicu togglePanel() beberapa kali sekaligus dan saling
        // membatalkan (buka-tutup dalam sekejap) - inilah penyebab
        // notifikasi "kadang bisa dibuka, kadang tidak". Dengan guard ini,
        // listener cuma dipasang SEKALI seumur hidup halaman.
        if (!this._listenersAttached) {
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

            this._listenersAttached = true;
        }

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
        // PENTING: position:fixed (bukan absolute) + lebar responsif supaya
        // panel tidak "kepotong" di layar HP yang sempit. Posisi top/right
        // dihitung ulang tiap kali dibuka (lihat openPanel()) berdasarkan
        // posisi asli tombol lonceng di layar - jadi tidak lagi kena efek
        // kepotong oleh parent/header yang membatasi lebar/overflow-nya.
        //
        // Panel dibuat 2 lapis: elemen luar (panel) transparan & TANPA
        // overflow, isinya cuma "caret" (segitiga kecil penunjuk ke arah
        // tombol lonceng) + kotak konten (notif-panel-inner) yang baru
        // punya background/shadow/scroll. Ini supaya caret-nya tidak
        // kepotong oleh overflow:hidden/auto milik kotak konten, dan panel
        // kelihatan jelas "muncul dari" tombol lonceng - bukan kotak
        // terpisah yang melayang di tempat lain. Animasi scale+fade dengan
        // transform-origin di kanan-atas juga bikin efeknya seperti
        // membuka/minimize dari tombol, bukan tiba-tiba muncul dari 0.
        panel.style.cssText = `
            position:fixed; width:300px; max-width:calc(100% - 32px);
            z-index:2000; display:none;
            transform-origin: top right;
            opacity:0; transform: scale(0.92) translateY(-6px);
            transition: opacity 0.15s ease, transform 0.15s ease;
        `;
        panel.innerHTML = `
            <div style="position:absolute; top:-6px; right:18px; width:12px; height:12px;
                background:#fff; transform:rotate(45deg); border-radius:2px;
                box-shadow:-2px -2px 4px rgba(0,0,0,0.04);"></div>
            <div style="position:relative; background:#fff; border-radius:12px;
                box-shadow:0 8px 24px rgba(0,0,0,0.15); max-height:420px;
                overflow-y:auto;">
                <div style="padding:14px 16px;border-bottom:1px solid #eee;font-weight:600;">Notifikasi</div>
                <div id="notif-list" style="padding:8px;"></div>
            </div>
        `;
        // Ditaruh langsung di <body>, bukan di dalam wrapper header - supaya
        // tidak kena batasi/overflow dari container header sama sekali.
        document.body.appendChild(panel);
    },

    togglePanel() {
        this.panelOpen ? this.closePanel() : this.openPanel();
    },

    openPanel() {
        const panel = document.getElementById('notif-panel');
        const btn = document.getElementById('btn-notifications');
        if (panel && btn) {
            const rect = btn.getBoundingClientRect();
            const margin = 12;
            const isMobile = window.innerWidth <= 480;

            panel.style.top = (rect.bottom + 10) + 'px';

            if (isMobile) {
                // Di layar sempit: anchor dari KIRI dan KANAN sekaligus dengan
                // margin tetap, dan biarkan lebar mengikuti (bukan dihitung
                // manual). Ini "anti-gagal" - berapapun lebar layar sebenarnya
                // (termasuk quirk vw/viewport di berbagai browser HP), panel
                // secara struktur TIDAK BISA nyembur ke luar sisi manapun,
                // karena kedua tepinya sendiri yang menentukan lebarnya.
                panel.style.left = margin + 'px';
                panel.style.right = margin + 'px';
                panel.style.width = 'auto';
                panel.style.maxWidth = 'none';
            } else {
                // Desktop: dropdown kecil menempel dekat tombol lonceng seperti biasa.
                const rightGap = Math.max(margin, window.innerWidth - rect.right);
                panel.style.left = 'auto';
                panel.style.width = '300px';
                panel.style.maxWidth = 'calc(100% - 32px)';
                panel.style.right = rightGap + 'px';
            }

            panel.style.display = 'block';
            // Set posisi awal (kecil & transparan) dulu, baru di frame
            // berikutnya animasikan ke ukuran penuh - efeknya jadi "muncul/
            // membesar dari tombol lonceng", bukan langsung nongol utuh.
            panel.style.opacity = '0';
            panel.style.transform = 'scale(0.92) translateY(-6px)';
            requestAnimationFrame(() => {
                panel.style.opacity = '1';
                panel.style.transform = 'scale(1) translateY(0)';
            });
        }
        this.panelOpen = true;
    },

    closePanel() {
        const panel = document.getElementById('notif-panel');
        if (panel) {
            // Animasikan dulu balik ke kecil/transparan (seperti minimize),
            // baru display:none setelah transisinya selesai.
            panel.style.opacity = '0';
            panel.style.transform = 'scale(0.92) translateY(-6px)';
            setTimeout(() => { panel.style.display = 'none'; }, 150);
        }
        this.panelOpen = false;
    },

    async load() {
        const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
        if (!user) return;

        this.items = [];

        try {
            if (auth.isAdmin && auth.isAdmin()) {
                await this._loadAdminNotifications();
            } else if ((auth.isAsmen && auth.isAsmen()) || (auth.isManajer && auth.isManajer()) || (auth.isDirektur && auth.isDirektur())) {
                await this._loadApproverNotifications(user);
            } else {
                await this._loadKaryawanNotifications(user);
            }
        } catch (e) {
            console.error('Gagal memuat notifikasi:', e);
        }

        this._render();
    },

    // Asmen, Manajer & Direktur punya menu Approval sendiri (approval-asmen /
    // approval-manajer / approval-direktur) - notifikasi mereka gabungan dari 2 hal:
    // (1) notifikasi pribadi seperti karyawan biasa (status izin/cuti
    //     mereka sendiri, reminder belum absen), DAN
    // (2) pengajuan staff/asmen lain yang lagi MENUNGGU PERSETUJUAN MEREKA
    //     di tahap ini. Logika tahapan di bawah SENGAJA disamakan persis
    //     dengan izin.js/cuti.js (renderApprovalList) supaya jumlah & isi
    //     notifikasi konsisten dengan yang tampil di halaman Approval-nya.
    async _loadApproverNotifications(user) {
        // (1) Notifikasi pribadi dulu (ini juga sudah panggil _sortByTime()
        // di akhir - tidak masalah, nanti di-sort ulang lagi di akhir sini
        // setelah item approval ditambahkan).
        await this._loadKaryawanNotifications(user);

        const role = (auth.isAsmen && auth.isAsmen()) ? 'asmen'
            : (auth.isManajer && auth.isManajer()) ? 'manajer'
            : 'direktur';

        const [izinRes, leaveRes, empRes] = await Promise.all([
            api.getAllIzin().catch(() => ({ success: false })),
            api.getAllLeaves().catch(() => ({ success: false })),
            api.getEmployees().catch(() => ({ success: false }))
        ]);

        const employees = empRes.success ? empRes.data : [];
        const findEmp = (userId) => employees.find(e => String(e.id) === String(userId)) || {};
        const pemohonInfo = (userId) => {
            const emp = findEmp(userId);
            const empName = emp.name || emp.nama || 'Karyawan';
            const empBagian = emp.bagian || '-';
            return `${empName} — ${empBagian}`;
        };

        const myEmployeeId = user.employeeId || user.id;
        const myBagian = String(user.bagian || '').toUpperCase().trim();
        const isHrManajer = myBagian === 'UMUM DAN KEPEGAWAIAN';

        // Cek apakah 1 item (izin/cuti) sedang menunggu persetujuan SAYA
        // di tahap ini - sama persis dengan filter di renderApprovalList()
        // (izin.js & cuti.js), termasuk untuk tahap Direktur.
        const isPendingForMe = (item) => {
            if (role === 'asmen') {
                return item.status === 'pending' && String(item.asmenId) === String(myEmployeeId);
            }

            const pemohon = findEmp(item.userId);
            const pemohonRole = pemohon.role || 'staff';

            if (role === 'direktur') {
                // Izin Keluar Kantor: alur sendiri, langsung ke Direktur begitu
                // masih pending - apapun jabatan pemohonnya.
                if (item.type === 'keluar_kantor') {
                    return item.status === 'pending';
                }
                if (pemohonRole === 'manajer') {
                    // Tahap Manajer dilewati sama sekali untuk pemohon Manajer
                    return item.status === 'pending';
                }
                // Staff & Asmen: harus sudah disetujui Manajer dulu
                return item.status === 'manajer_approved';
            }

            // role === 'manajer'
            const pemohonBagian = String(pemohon.bagian || '').toUpperCase().trim();
            const isPemohonHr = pemohonBagian === 'UMUM DAN KEPEGAWAIAN';
            const gateStatus = pemohonRole === 'staff' ? 'asmen_approved' : 'pending';

            if (pemohonRole === 'manajer') return false; // tahap ini dilewati sama sekali
            if (isPemohonHr) return isHrManajer && item.status === gateStatus;
            if (item.status === gateStatus && pemohonBagian === myBagian) return true;
            if (item.status === 'manajer_bidang_approved' && isHrManajer) return true;
            return false;
        };

        const izinPending = (izinRes.success ? izinRes.data : []).filter(isPendingForMe);
        const leavePending = (leaveRes.success ? leaveRes.data : []).filter(isPendingForMe);
        const approvalLink = role === 'asmen' ? 'approval-asmen' : (role === 'manajer' ? 'approval-manajer' : 'approval-direktur');

        izinPending.forEach(i => this.items.push({
            icon: 'fa-user-clock',
            color: '#F59E0B',
            title: `Pengajuan ${i.typeLabel || 'Izin'} menunggu persetujuan`,
            desc: pemohonInfo(i.userId),
            time: i.appliedAt || i.date,
            link: approvalLink
        }));

        leavePending.forEach(l => this.items.push({
            icon: 'fa-calendar-alt',
            color: '#F59E0B',
            title: `Pengajuan Cuti (${l.typeLabel || ''}) menunggu persetujuan`,
            desc: pemohonInfo(l.userId),
            time: l.appliedAt || l.startDate,
            link: approvalLink
        }));

        this._sortByTime();
    },

    async _loadAdminNotifications() {
        const [izinRes, leaveRes, empRes] = await Promise.all([
            api.getAllIzin().catch(() => ({ success: false })),
            api.getAllLeaves().catch(() => ({ success: false })),
            api.getEmployees().catch(() => ({ success: false }))
        ]);

        const employees = empRes.success ? empRes.data : [];
        const findEmp = (userId) => employees.find(e => String(e.id) === String(userId));
        // Format "Nama — Bagian" supaya notifikasi langsung jelas siapa yang
        // mengajukan dan dari bagian mana, tanpa perlu buka detailnya dulu.
        const pemohonInfo = (userId) => {
            const emp = findEmp(userId);
            const empName = emp?.name || emp?.nama || 'Karyawan';
            const empBagian = emp?.bagian || '-';
            return `${empName} — ${empBagian}`;
        };

        const izinPending = (izinRes.success ? izinRes.data : []).filter(i => i.status === 'pending');
        const leavePending = (leaveRes.success ? leaveRes.data : []).filter(l => l.status === 'pending');

        izinPending.forEach(i => this.items.push({
            icon: 'fa-user-clock',
            color: '#F59E0B',
            title: `Pengajuan ${i.typeLabel || 'Izin'} menunggu persetujuan`,
            desc: pemohonInfo(i.userId),
            time: i.appliedAt || i.date,
            link: 'leave-reports'
        }));

        leavePending.forEach(l => this.items.push({
            icon: 'fa-calendar-alt',
            color: '#F59E0B',
            title: `Pengajuan Cuti (${l.typeLabel || ''}) menunggu persetujuan`,
            desc: pemohonInfo(l.userId),
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
