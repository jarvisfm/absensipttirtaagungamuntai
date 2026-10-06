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
                <div style="position:sticky;top:0;z-index:1;background:#fff;padding:14px 16px 10px;border-bottom:1px solid #eee;">
                    <div style="font-weight:600;">Notifikasi</div>
                    <div id="notif-actions" style="display:none;gap:8px;margin-top:8px;">
                        <button type="button" onclick="notifications.markAllRead()" style="flex:1;background:#FFF7ED;color:#D97706;border:1px solid #FDE68A;border-radius:6px;padding:6px 8px;font-size:0.75rem;font-weight:500;cursor:pointer;"><i class="fas fa-check-double"></i> Tandai semua dibaca</button>
                        <button type="button" onclick="notifications.deleteAll()" style="flex:1;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:6px 8px;font-size:0.75rem;font-weight:500;cursor:pointer;"><i class="fas fa-trash"></i> Hapus semua</button>
                    </div>
                </div>
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

        this._applyState();
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

            // Izin Keluar Kantor: alur TERPISAH, Manajer bagian yang sama
            // dengan pemohon adalah approver UTAMA/FINAL langsung dari
            // status 'pending' (tidak lewat tahap Asmen) - sama persis
            // dengan izin.js (renderApprovalList).
            if (item.type === 'keluar_kantor') {
                if (pemohonRole === 'manajer') return false;
                return item.status === 'pending' && pemohonBagian === myBagian;
            }

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
        const effectiveId = user.employeeId || user.id;
        // PERBAIKAN PERFORMA: dulu api.getAllAttendance() (SELURUH riwayat
        // attendance SEMUA karyawan) padahal di bawah cuma dipakai untuk
        // cari SATU baris (punya karyawan ini, hari ini) - lihat
        // `todayRecord` di bawah. notifications.js ini dimuat di HAMPIR
        // SETIAP kali aplikasi dibuka (lihat auth.js showApp()), jadi
        // sebelumnya SETIAP buka aplikasi = download seluruh histori
        // perusahaan, sia-sia dan bikin lambat terutama di HP. Ganti ke
        // versi yang sudah difilter userId+hari ini di server.
        const [izinRes, leaveRes, attRes, accessRes] = await Promise.all([
            api.getIzin(user.id).catch(() => ({ success: false })),
            api.getLeaves(user.id).catch(() => ({ success: false })),
            api.getTodayAttendanceForUser(effectiveId).catch(() => ({ success: false })),
            api.checkAttendanceAccess(effectiveId).catch(() => ({ success: false }))
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

        // Reminder absen berbasis jadwal sesi hari ini (dari
        // checkAttendanceAccess - sudah tahu shift & jam yang berlaku,
        // termasuk kasus Jumat/Jaga Malam/libur). Untuk tiap sesi KECUALI
        // Pulang, ada 2 jenis reminder:
        // 1. 15 menit SEBELUM jam sesi - "akan dibuka sebentar lagi"
        // 2. SETELAH jam sesi, kalau belum diisi - "belum absen"
        const access = accessRes.success ? accessRes.data : null;

        if (access && access.canAccess && Array.isArray(access.sessions)) {
            const attData = attRes.success ? attRes.data : [];
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const todayRecord = attData.find(a =>
                String(a.userId) === String(effectiveId) &&
                String(a.date).startsWith(todayStr)
            );

            const nowMinutes = today.getHours() * 60 + today.getMinutes();
            const toMinutes = (hhmm) => {
                const [h, m] = String(hhmm).split(':').map(Number);
                return h * 60 + m;
            };

            access.sessions
                .filter(s => s.field !== 'clockOut') // Pulang tidak usah diingatkan
                .forEach(s => {
                    const alreadyDone = todayRecord && todayRecord[s.field];
                    if (alreadyDone) return;

                    const sessionMinutes = toMinutes(s.time);
                    const reminderMinutes = sessionMinutes - 15;

                    if (nowMinutes >= reminderMinutes && nowMinutes < sessionMinutes) {
                        // T-15 menit: reminder "akan dibuka"
                        this.items.unshift({
                            icon: 'fa-clock',
                            color: '#F59E0B',
                            title: `Absen ${s.label} akan dibuka`,
                            desc: `Dibuka jam ${s.time} (${sessionMinutes - nowMinutes} menit lagi)`,
                            time: new Date().toISOString(),
                            link: 'absensi'
                        });
                    } else if (nowMinutes >= sessionMinutes) {
                        // Sudah lewat jamnya tapi belum diisi
                        this.items.unshift({
                            icon: 'fa-exclamation-triangle',
                            color: '#EF4444',
                            title: `Kamu belum absen ${s.label}`,
                            desc: `Sudah lewat jam ${s.time}, jangan lupa ya!`,
                            time: new Date().toISOString(),
                            link: 'absensi'
                        });
                    }
                });
        }

        this._sortByTime();
    },

    // ---- Status baca/hapus notifikasi (disimpan per-user di browser) ----
    // Notifikasi dihitung ulang dari data tiap kali dimuat, jadi tidak ada
    // ID tetap - tiap item diberi kunci dari isinya. Reminder absen
    // (waktu = "sekarang") dikunci TANPA waktu supaya tidak dianggap baru
    // setiap kali dimuat ulang.
    _stateKey() {
        const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
        return 'notif_state_' + (user ? (user.employeeId || user.id) : 'anon');
    },

    _keyOf(item) {
        const isReminder = item.icon === 'fa-clock' || item.icon === 'fa-exclamation-triangle';
        return [item.link, item.title, item.desc || '', isReminder ? '' : (item.time || '')].join('|');
    },

    _loadState() {
        try {
            const raw = JSON.parse(localStorage.getItem(this._stateKey()) || '{}');
            return {
                read: Array.isArray(raw.read) ? raw.read : [],
                deleted: Array.isArray(raw.deleted) ? raw.deleted : []
            };
        } catch (e) {
            return { read: [], deleted: [] };
        }
    },

    _saveState(state) {
        try {
            // Batasi ukuran supaya localStorage tidak membengkak
            state.read = state.read.slice(-300);
            state.deleted = state.deleted.slice(-300);
            localStorage.setItem(this._stateKey(), JSON.stringify(state));
        } catch (e) { /* localStorage tidak tersedia, abaikan */ }
    },

    _applyState() {
        const state = this._loadState();
        const deleted = new Set(state.deleted);
        const read = new Set(state.read);
        this.items.forEach(i => { i._key = this._keyOf(i); });
        this.items = this.items.filter(i => !deleted.has(i._key));
        this.items.forEach(i => { i._read = read.has(i._key); });
    },

    markAllRead() {
        const state = this._loadState();
        const read = new Set(state.read);
        this.items.forEach(i => { read.add(i._key); i._read = true; });
        state.read = Array.from(read);
        this._saveState(state);
        this._render();
    },

    // [PERUBAHAN] Hapus semua kini memakai modal konfirmasi (bergaya sama
    // dengan modal hapus lain di aplikasi), bukan confirm() bawaan browser.
    deleteAll() {
        if (this.items.length === 0) return;
        this._showConfirmModal({
            title: 'Hapus Semua Notifikasi?',
            message: `${this.items.length} notifikasi akan dihapus dari daftar Anda. Notifikasi baru tetap akan muncul seperti biasa.`,
            confirmText: 'Hapus Semua',
            onConfirm: () => this._deleteAllNow()
        });
    },

    // Modal konfirmasi dibuat lewat JS (tanpa mengubah index.html) dan
    // dibersihkan setiap ditutup. Bisa ditutup dengan tombol Batal, klik di
    // luar kotak, atau tombol Esc.
    _showConfirmModal({ title, message, confirmText, onConfirm }) {
        const old = document.getElementById('notif-confirm-modal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'notif-confirm-modal';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'display:flex;z-index:10000;';
        overlay.innerHTML = `
            <div class="modal-container" style="max-width:400px;width:92%;">
                <div style="padding:1.75rem 1.5rem 1.5rem;text-align:center;">
                    <div style="width:56px;height:56px;border-radius:50%;background:#FEE2E2;color:#DC2626;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.4rem;">
                        <i class="fas fa-trash-alt"></i>
                    </div>
                    <h3 style="margin-bottom:0.5rem;font-size:1.05rem;"></h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1.5rem;line-height:1.5;"></p>
                    <div style="display:flex;gap:8px;">
                        <button type="button" data-act="cancel" style="flex:1;background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:10px;border-radius:8px;cursor:pointer;font-weight:600;">Batal</button>
                        <button type="button" data-act="ok" style="flex:1;background:#DC2626;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:600;">
                            <i class="fas fa-trash-alt"></i> <span></span>
                        </button>
                    </div>
                </div>
            </div>`;
        // Teks diisi lewat textContent supaya aman dari karakter HTML.
        overlay.querySelector('h3').textContent = title;
        overlay.querySelector('p').textContent = message;
        overlay.querySelector('[data-act="ok"] span').textContent = confirmText || 'Hapus';
        document.body.appendChild(overlay);

        const onKey = (e) => { if (e.key === 'Escape') close(); };
        const close = () => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-act="ok"]').addEventListener('click', () => {
            close();
            onConfirm();
        });
    },

    _deleteAllNow() {
        if (this.items.length === 0) return;
        const state = this._loadState();
        const deleted = new Set(state.deleted);
        this.items.forEach(i => deleted.add(i._key));
        state.deleted = Array.from(deleted);
        this._saveState(state);
        this.items = [];
        this._render();
    },

    _openItem(idx) {
        const item = this.items[idx];
        if (!item) return;
        if (!item._read) {
            const state = this._loadState();
            if (!state.read.includes(item._key)) state.read.push(item._key);
            this._saveState(state);
            item._read = true;
            this._render();
        }
        this._goTo(item.link);
    },

    _sortByTime() {
        this.items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    },

    _render() {
        const badge = document.querySelector('#btn-notifications .badge');
        const list = document.getElementById('notif-list');

        const unreadCount = this.items.filter(i => !i._read).length;
        const actions = document.getElementById('notif-actions');
        if (actions) actions.style.display = this.items.length > 0 ? 'flex' : 'none';

        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
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

        list.innerHTML = this.items.map((item, idx) => `
            <div onclick="notifications._openItem(${idx})" style="display:flex;gap:10px;padding:10px 8px;border-radius:8px;cursor:pointer;${item._read ? 'opacity:0.55;' : ''}" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='transparent'">
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
