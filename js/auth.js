/**
 * Portal Karyawan - Authentication
 * Handle login/logout and session management
 */

const auth = {
    currentUser: null,

    // Sesi login otomatis dianggap habis setelah durasi ini (ms), supaya
    // perangkat yang pernah dipakai login (mis. HP) tidak selamanya langsung
    // masuk dashboard tanpa login ulang. 12 jam.
    SESSION_DURATION_MS: 12 * 60 * 60 * 1000,

    // Kalau app/browser ditutup (atau di-background, mis. minimize/kunci
    // layar/pindah app lain) dan BARU dibuka lagi setelah lebih dari durasi
    // ini, sesi dianggap habis walau SESSION_DURATION_MS di atas belum
    // lewat - beda dari expiry 12 jam yang dihitung dari waktu login,  ini
    // dihitung dari kapan TERAKHIR app-nya aktif/kelihatan. 30 menit.
    IDLE_LOGOUT_MS: 30 * 60 * 1000,

    // Fitur "1 perangkat saja": tiap sekian detik, cek ke server apakah
    // sessionToken perangkat ini masih yang paling baru untuk akun ini.
    // Kalau akun ini ternyata sudah login lagi di perangkat lain, sesi di
    // perangkat ini otomatis di-logout dengan notifikasi.
    SESSION_CHECK_INTERVAL_MS: 5 * 1000,
    _sessionWatcherId: null,
    _visibilityHandler: null,

    init() {
    const session = storage.get('session');
    if (session && session.id && session.role && !this.isSessionExpired(session)) {
        if (this._isIdleTimedOut()) {
            // App sempat ditutup/di-background >30 menit - anggap sesi
            // habis walau belum 12 jam, harus login ulang.
            storage.remove('session');
            storage.remove('lastHiddenAt');
            this.showLogin();
            toast.show(
                'Sesi Anda berakhir karena aplikasi tidak aktif lebih dari 30 menit. Silakan login kembali.',
                'warning', 'Sesi Berakhir', 6000
            );
        } else {
            this.currentUser = session;
            this.showApp(true); // true = restore sesi (refresh halaman), BUKAN login baru
            this.startSessionWatcher();
        }
    } else {
        storage.remove('session');
        this.showLogin();
    }
    this._startIdleTracking();

        // Login form handler
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Toggle password visibility
        const togglePassword = document.getElementById('toggle-password');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => this.togglePasswordVisibility());
        }

        // Logout button
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }


        // Profile click - open profile modal
        // (helper isSessionExpired ada di bawah, dipakai oleh init() di atas)
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            // Make the user info area clickable (not the logout button)
            const userInfoArea = userProfile.querySelector('.user-info');
            const userAvatarArea = userProfile.querySelector('.user-avatar');
            if (userInfoArea) {
                userInfoArea.style.cursor = 'pointer';
                userInfoArea.addEventListener('click', () => this.openProfileModal());
            }
            if (userAvatarArea) {
                userAvatarArea.style.cursor = 'pointer';
                userAvatarArea.addEventListener('click', () => this.openProfileModal());
            }
        }
        this._setupBiometricLogin(); // NEW
    },

    async handleLogin(e) {
        e.preventDefault();

        // .trim() penting khusus di HP - keyboard mobile (terutama Android/
        // Gboard) kadang otomatis menambah spasi tersembunyi di akhir kata
        // saat mengetik/memilih saran kata, yang bikin username tidak match
        // walau kelihatannya sama persis di layar.
        const username = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        // Validate
        if (!username || !password) {
            toast.error('Username dan password harus diisi!');
            return;
        }    

        // Show loading
        const submitBtn = e.target.querySelector('.btn-login');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const result = await api.login(username, password);

            let user;
            if (result.success && result.data) {
                // Backend mode - user from API (Employees or Users sheet)
                user = {
                    id: result.data.id,
                    employeeId: result.data.employeeId || null, 
                    username: result.data.username,
                    name: result.data.name,
                    role: result.data.role,
                    employeeRole: result.data.employeeRole || '',
                    department: result.data.department || '',
                    position: result.data.position || '',
                    shift: result.data.shift || '',
                    avatar: result.data.avatar || '',
                    nik: result.data.nik || '',
                    jabatan: result.data.jabatan || '',
                    unitKerja: result.data.unitKerja || '',
                    unitWilayah: result.data.unitWilayah || '',
                    bagian: result.data.bagian || '',
                    pangkat: result.data.pangkat || '',
                    golongan: result.data.golongan || '',
                    sessionToken: result.data.sessionToken || '',
                    loginTime: new Date().toISOString(),
                    expiresAt: Date.now() + this.SESSION_DURATION_MS
                };
    
            } else {
                toast.error(result.error || 'Email atau password salah!');
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                return;
            }

            this.currentUser = user;
            storage.set('session', user);
            storage.remove('lastHiddenAt');

            // Update UI
            this.updateUserUI();

            // Show app
            this.showApp();
            this.startSessionWatcher();

            toast.success(`Selamat datang, ${user.name}!`);
            this._maybeOfferBiometricEnrollment(username, password); // NEW
        } catch (error) {
            console.error('Login error:', error);
            toast.error('Terjadi kesalahan saat login');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    },

    // Sebelumnya pakai confirm() bawaan browser (tampilannya polos/kaku).
    // Sekarang menampilkan modal konfirmasi custom (#modal-logout-confirm)
    // supaya lebih menarik dan konsisten dengan gaya modal lain di aplikasi.
    handleLogout() {
        const modal = document.getElementById('modal-logout-confirm');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            // Fallback kalau elemen modal tidak ada di halaman ini
            if (confirm('Apakah Anda yakin ingin logout?')) this._doLogout();
        }
    },

    cancelLogoutModal() {
        const modal = document.getElementById('modal-logout-confirm');
        if (modal) modal.style.display = 'none';
    },

    confirmLogout() {
        this.cancelLogoutModal();
        this._doLogout();
    },

    _doLogout() {
        this.stopSessionWatcher();
        this.currentUser = null;
        storage.remove('session');
        storage.remove('lastHiddenAt');
        storage.remove('currentPage');
        sessionStorage.removeItem('adminSwitchMode');

        this.showLogin();
        toast.info('Anda telah logout');
    },

    // Sudah lewat IDLE_LOGOUT_MS sejak app terakhir disembunyikan/ditutup?
    _isIdleTimedOut() {
        const lastHidden = storage.get('lastHiddenAt');
        return !!(lastHidden && (Date.now() - lastHidden > this.IDLE_LOGOUT_MS));
    },

    /**
     * Catat kapan app terakhir disembunyikan (tab/app pindah ke background,
     * layar dikunci, atau browser/PWA ditutup) ke localStorage - dipakai
     * _isIdleTimedOut() begitu app dibuka lagi (baik lewat init() setelah
     * app benar-benar ditutup total, maupun langsung di listener di bawah
     * kalau cuma pindah tab/app sebentar lalu balik lagi).
     *
     * 'visibilitychange' menangkap kasus minimize/kunci layar/pindah app
     * lain. 'pagehide' jadi jaring pengaman tambahan khusus utuk kasus tab/
     * browser/PWA benar-benar ditutup (lebih andal dibanding 'beforeunload'
     * di mobile & PWA).
     */
    _startIdleTracking() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                storage.set('lastHiddenAt', Date.now());
            } else if (document.visibilityState === 'visible') {
                if (this.currentUser && this._isIdleTimedOut()) {
                    this._forceLogoutIdleTimeout();
                } else {
                    storage.remove('lastHiddenAt');
                }
            }
        });
        window.addEventListener('pagehide', () => {
            storage.set('lastHiddenAt', Date.now());
        });
    },

    // Dipanggil kalau terdeteksi app sempat ditutup/di-background lebih
    // dari IDLE_LOGOUT_MS - paksa logout disertai notifikasi yang jelas.
    _forceLogoutIdleTimeout() {
        this.stopSessionWatcher();
        this.currentUser = null;
        storage.remove('session');
        storage.remove('lastHiddenAt');
        storage.remove('currentPage');
        sessionStorage.removeItem('adminSwitchMode');

        this.showLogin();
        toast.show(
            'Sesi Anda berakhir karena aplikasi tidak aktif lebih dari 30 menit. Silakan login kembali.',
            'warning', 'Sesi Berakhir', 6000
        );
    },

    /**
     * Fitur "1 perangkat saja": mulai polling berkala ke server untuk cek
     * apakah sessionToken perangkat ini masih yang terbaru untuk akun ini.
     * Dipanggil setelah login berhasil ATAU setelah sesi lama berhasil
     * dipulihkan (init()). Aman dipanggil berkali-kali - interval/listener
     * lama selalu dibersihkan dulu supaya tidak dobel jalan.
     */
    startSessionWatcher() {
        this.stopSessionWatcher();

        // Tidak ada sessionToken (mis. sesi lama dari sebelum fitur ini ada,
        // atau mode localStorage tanpa backend) - tidak ada yang bisa dicek.
        if (!this.currentUser || !this.currentUser.sessionToken) return;

        this._sessionWatcherId = setInterval(() => this._checkSessionNow(), this.SESSION_CHECK_INTERVAL_MS);

        // PENTING: browser HP sering "membekukan" setInterval saat tab di-
        // background/layar dikunci untuk hemat baterai, jadi pengecekan
        // berkala di atas bisa telat jalan kalau HP-nya tidak dibiarkan
        // aktif. Untuk itu, tambahan: begitu tab ini aktif/terlihat lagi
        // (mis. user membuka HP yang tadi dikunci), langsung cek ulang saat
        // itu juga - tidak perlu menunggu interval berikutnya.
        this._visibilityHandler = () => {
            if (document.visibilityState === 'visible') this._checkSessionNow();
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);
    },

    async _checkSessionNow() {
        if (!this.currentUser || !this.currentUser.sessionToken) return;
        try {
            const result = await api.validateSession(
                this.currentUser.id,
                this.currentUser.role,
                this.currentUser.sessionToken
            );
            if (result.success && result.data && result.data.valid === false) {
                this._forceLogoutOtherDevice();
            }
        } catch (e) {
            // Gangguan koneksi sesaat - jangan langsung logout paksa, coba
            // lagi di pengecekan berikutnya.
            console.error('Session check error:', e);
        }
    },

    stopSessionWatcher() {
        if (this._sessionWatcherId) {
            clearInterval(this._sessionWatcherId);
            this._sessionWatcherId = null;
        }
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
    },

    // Dipanggil kalau terdeteksi akun ini sudah login di perangkat lain -
    // paksa logout perangkat ini disertai notifikasi yang jelas kenapa.
    _forceLogoutOtherDevice() {
        this.stopSessionWatcher();
        this.currentUser = null;
        storage.remove('session');
        storage.remove('currentPage');
        sessionStorage.removeItem('adminSwitchMode');

        this.showLogin();
        toast.show(
            'Akun ini baru saja login di perangkat/browser lain, jadi sesi di perangkat ini otomatis di-logout. Silakan login kembali kalau ini bukan Anda.',
            'warning',
            'Login di Perangkat Lain',
            8000
        );
    },

    showApp(isSessionRestore = false) {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');

        if (loginContainer && appContainer) {
            loginContainer.style.display = 'none';
            appContainer.classList.remove('hidden');

            // Update user UI first
            this.updateUserUI();

            // Isi notifikasi dengan data nyata
            if (window.notifications) notifications.init();

            // Selalu reset mode karyawan saat showApp (login baru)
            sessionStorage.removeItem('adminSwitchMode');
            const banner = document.getElementById('admin-switch-banner');
            const switchBtn = document.getElementById('btn-switch-to-employee');
            if (banner) banner.style.display = 'none';
            if (switchBtn) switchBtn.style.display = '';
                        
            // Show appropriate menu based on role
            const employeeMenu = document.getElementById('employee-menu');
            const adminMenu = document.getElementById('admin-menu-nav');
            const bottomNav = document.getElementById('bottom-nav');

            if (this.currentUser && this.currentUser.role === 'admin') {
                // Show admin menu, hide employee menu
                if (employeeMenu) employeeMenu.classList.add('hidden');
                if (adminMenu) adminMenu.classList.remove('hidden');
                if (bottomNav) bottomNav.style.display = 'none';

                // Navigate to admin dashboard - CUMA kalau ini login baru,
                // bukan restore sesi (refresh halaman) - supaya refresh
                // tidak selalu balik ke dashboard, tetap di halaman terakhir.
                if (!isSessionRestore) router.navigate('admin-dashboard');
            } else {
                // Show employee menu, hide admin menu
                if (employeeMenu) employeeMenu.classList.remove('hidden');
                if (adminMenu) adminMenu.classList.add('hidden');
                if (bottomNav) bottomNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';

                // Navigate to employee dashboard - sama, cuma untuk login baru
                if (!isSessionRestore) router.navigate('dashboard');
            }

            // Menu approval terpisah untuk tiap tahap: Asmen, Manajer, Direktur.
            // Dipanggil di LUAR if/else di atas (bukan cuma di cabang employee),
            // karena akun rangkap seperti Admin yang juga Asmen/Manajer punya
            // currentUser.role === 'admin' di level atas - employeeRole-nya baru
            // kepakai lewat isAsmen()/isManajer()/isDirektur() begitu masuk Mode
            // Karyawan. Fungsi ini juga dipanggil ulang oleh admin-switch.js
            // setiap kali Mode Karyawan diaktifkan/dinonaktifkan.
            this.updateApprovalNav();

            // Initialize mobile
            if (window.mobile) {
                window.mobile.handleResize();
            }
        }
    },

    showLogin() {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');

        if (loginContainer && appContainer) {
            appContainer.classList.add('hidden');
            loginContainer.style.display = 'flex';

            // Reset form
            const loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.reset();
        }

        // PENTING: router.js mengubah document.title jadi "<Judul Halaman> -
        // <Nama Perusahaan>" (mis. "Rekap Absensi - Portal Karyawan...")
        // setiap kali pindah halaman, tapi tidak pernah direset balik saat
        // logout - jadi tab browser tetap menampilkan judul halaman terakhir
        // walau user sudah kembali ke layar login. Reset di sini supaya tab
        // langsung sesuai lagi begitu logout (manual, sesi habis, atau
        // dipaksa logout dari perangkat lain).
        const company = storage.get('company', { name: 'Portal Karyawan' });
        document.title = company.name;
    },

    // Sesi dianggap kedaluwarsa kalau tidak punya expiresAt (data lama sebelum
    // fitur ini ada) atau waktunya sudah lewat.
    isSessionExpired(session) {
        return !session.expiresAt || Date.now() > session.expiresAt;
    },

    updateUserUI() {
        if (!this.currentUser) return;

        // Update user info in sidebar
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userAvatarEl = document.getElementById('user-avatar');
        const welcomeNameEl = document.getElementById('welcome-name');

        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role === 'admin' ? 'Administrator' : (this.currentUser.jabatan || 'Karyawan');
        if (userAvatarEl) userAvatarEl.src = getAvatarUrl(this.currentUser);
        if (welcomeNameEl) welcomeNameEl.textContent = this.currentUser.name.split(' ')[0];
    },

    async openProfileModal() {
        const modal = document.getElementById('modal-profile');
        if (!modal) return;

        const user = this.currentUser;
        if (!user) return;

        const contentEl = document.getElementById('profile-detail-content');

        // Sama seperti profileManager.myId di js/profile.js: untuk akun Admin,
        // `id` di sesi login adalah ID di sheet "Users" (bukan Employees),
        // jadi harus dipetakan lewat `employeeId`. Untuk staff/asmen/manajer
        // biasa, `id` di sesi memang sudah = ID Employees.
        const myId = (user.role === 'admin') ? (user.employeeId || null) : user.id;

        if (!myId) {
            if (contentEl) {
                contentEl.innerHTML = `
                    <div style="text-align:center;margin-bottom:1.5rem;">
                        <img src="${getAvatarUrl(user)}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--color-primary);">
                        <h3 style="margin-top:0.75rem;font-size:1.1rem;">${user.name || '-'}</h3>
                        <p style="color:var(--text-muted);font-size:0.85rem;">${user.role === 'admin' ? 'Administrator' : (user.jabatan || 'Karyawan')}</p>
                    </div>
                    <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;">Akun ini belum terhubung ke data karyawan di menu Data Karyawan.</p>
                `;
            }
        } else {
            try {
                const result = await api.getKaryawanDetail(myId);
                if (result.success && result.data) {
                    if (contentEl) contentEl.innerHTML = this.renderProfileDetailHtml(result.data);
                } else if (contentEl) {
                    contentEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.85rem;">Gagal memuat data profil.</p>';
                }
            } catch (e) {
                console.error('Error load profil:', e);
                if (contentEl) contentEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.85rem;">Terjadi kesalahan saat memuat profil.</p>';
            }
        }

        // Clear password form
        document.getElementById('old-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        modal.style.display = 'flex';
    },

    // Membangun markup detail profil, identik dengan modal "Detail Karyawan"
    // di js/karyawan.js (karyawanManager.viewDetail), tanpa tombol "Edit Data".
    renderProfileDetailHtml(p) {
        const keluarga = p.keluarga || [];
        const pasangan = keluarga.find(k => k.tipe === 'pasangan');
        const ayah     = keluarga.find(k => k.tipe === 'ayah');
        const ibu      = keluarga.find(k => k.tipe === 'ibu');
        const anak     = keluarga.filter(k => k.tipe === 'anak');

        const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
        const color  = colors[(p.nama || '').charCodeAt(0) % colors.length];
        const initials = (p.nama || 'P').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

        const fotoHtml = p.foto
            ? `<img src="${p.foto}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--color-primary);">`
            : `<div style="width:90px;height:90px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:700;margin:0 auto;">${initials}</div>`;

        const field = (label, value) => value
            ? `<div style="display:flex;padding:8px 0;border-bottom:1px solid var(--border-color);">
                    <span style="min-width:160px;color:var(--text-muted);font-size:0.85rem;">${label}</span>
                    <span style="font-weight:500;font-size:0.85rem;">${value}</span>
               </div>`
            : '';

        const statusColor = p.statusKaryawan === 'AKTIF' ? '#10B981' : '#F59E0B';

        return `
            <div style="text-align:center;margin-bottom:1.5rem;">
                ${fotoHtml}
                <h3 style="margin-top:0.75rem;font-size:1.1rem;">${p.nama || '-'}</h3>
                <p style="color:var(--text-muted);font-size:0.85rem;">${p.jabatan || ''} — ${p.unitWilayah || ''}</p>
                <span style="background:${statusColor}20;color:${statusColor};padding:3px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;">${p.statusKaryawan || ''}</span>
            </div>

            <div style="margin-bottom:1.5rem;">
                <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                    <i class="fas fa-user"></i> DATA PRIBADI
                </div>
                ${field('NIK', p.nik)}
                ${field('Jenis Kelamin', p.jenisKelamin)}
                ${field('Status Pernikahan', p.statusPernikahan === 'K' ? 'Kawin' : p.statusPernikahan === 'TK' ? 'Belum Kawin' : p.statusPernikahan)}
                ${field('Tempat, Tgl Lahir', p.tempatLahir && p.tanggalLahir ? `${p.tempatLahir}, ${p.tanggalLahir}` : '')}
                ${field('Golongan Darah', p.golonganDarah)}
                ${field('No. KTP', p.ktp)}
                ${field('NPWP', p.npwp)}
                ${field('No. Telp', p.noTelp)}
                ${field('Email', p.email)}
            </div>

            <div style="margin-bottom:1.5rem;">
                <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                    <i class="fas fa-briefcase"></i> DATA KEPEGAWAIAN
                </div>
                ${field('Status Pekerjaan', p.statusPekerjaan)}
                ${field('Pendidikan', p.pendidikan)}
                ${field('Jabatan', p.jabatan)}
                ${field('Unit Wilayah', p.unitWilayah)}
                ${field('Pangkat', p.pangkat)}
                ${field('Golongan', p.golongan)}
                ${field('Gaji Pokok', p.gajiPokok ? 'Rp ' + Number(p.gajiPokok).toLocaleString('id-ID') : '')}
                ${field('Terhitung Mulai', p.terhitungMulai)}
                ${field('Masa Kerja', p.masaKerja)}
                ${field('Tahun Pensiun', p.tahunPensiun)}
                ${field('Jadwal', p.shift)}
            </div>

            ${(p.fileSK || p.fileKTP || p.fileIjazah || p.fileSertifikat) ? `
            <div style="margin-bottom:1.5rem;">
                <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                    <i class="fas fa-folder-open"></i> BERKAS DOKUMEN
                </div>
                ${p.fileSK ? field('Surat SK', `<a href="${p.fileSK}" target="_blank" style="color:var(--color-primary);"><i class="fas fa-file-pdf"></i> Lihat Berkas</a>`) : ''}
                ${p.fileKTP ? field('KTP', `<a href="${p.fileKTP}" target="_blank" style="color:#3B82F6;"><i class="fas fa-id-card"></i> Lihat Berkas</a>`) : ''}
                ${p.fileIjazah ? field('Ijazah', `<a href="${p.fileIjazah}" target="_blank" style="color:#10B981;"><i class="fas fa-graduation-cap"></i> Lihat Berkas</a>`) : ''}
                ${p.fileSertifikat ? field('Sertifikat', `<a href="${p.fileSertifikat}" target="_blank" style="color:#F59E0B;"><i class="fas fa-certificate"></i> Lihat Berkas</a>`) : ''}
            </div>` : ''}

            ${keluarga.length > 0 ? `
            <div style="margin-bottom:1.5rem;">
                <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                    <i class="fas fa-users"></i> DATA KELUARGA
                </div>
                ${field('Pasangan', pasangan?.nama)}
                ${anak.map((a, i) => field(`Anak ke-${i+1}`, a.nama)).join('')}
                ${field('Nama Ayah', ayah?.nama)}
                ${field('Nama Ibu', ibu?.nama)}
            </div>` : ''}
        `;
    },

    async handleChangePassword() {
        const oldPwd = document.getElementById('old-password').value;
        const newPwd = document.getElementById('new-password').value;
        const confirmPwd = document.getElementById('confirm-password').value;

        if (!oldPwd || !newPwd || !confirmPwd) {
            toast.error('Semua field password harus diisi!');
            return;
        }
        if (newPwd !== confirmPwd) {
            toast.error('Password baru dan konfirmasi tidak cocok!');
            return;
        }
        if (newPwd.length < 4) {
            toast.error('Password minimal 4 karakter!');
            return;
        }

        try {
            const result = await api.changePassword(this.currentUser.id, oldPwd, newPwd);
            if (result.success) {
                toast.success('Password berhasil diubah!');
                document.getElementById('old-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                toast.error(result.error || 'Gagal mengubah password');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error('Terjadi kesalahan');
        }
    },

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('login-password');
        const toggleBtn = document.getElementById('toggle-password');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    },

    // Menu approval terpisah untuk tiap tahap: Asmen, Manajer, Direktur.
    // Masing-masing hanya muncul untuk role yang sesuai (lihat isAsmen/isManajer/
    // isDirektur - keduanya sadar soal Mode Karyawan untuk akun rangkap admin).
    // Dipanggil dari showApp() (login) dan dari admin-switch.js (tiap kali Mode
    // Karyawan diaktifkan/dinonaktifkan), karena hasil isAsmen() dkk. bisa berubah
    // begitu adminSwitchMode berubah.
    updateApprovalNav() {
        const navApprovalAsmen = document.getElementById('nav-approval-asmen');
        if (navApprovalAsmen) navApprovalAsmen.classList.toggle('hidden', !this.isAsmen());

        const navApprovalManajer = document.getElementById('nav-approval-manajer');
        if (navApprovalManajer) navApprovalManajer.classList.toggle('hidden', !this.isManajer());

        const navApprovalDirektur = document.getElementById('nav-approval-direktur');
        if (navApprovalDirektur) navApprovalDirektur.classList.toggle('hidden', !this.isDirektur());

        // Bottom nav (mobile) - item "Approval" khusus untuk Asmen, Manajer & Direktur
        const bottomNavApprovalAsmen = document.getElementById('bottom-nav-approval-asmen');
        if (bottomNavApprovalAsmen) bottomNavApprovalAsmen.classList.toggle('hidden', !this.isAsmen());

        const bottomNavApprovalManajer = document.getElementById('bottom-nav-approval-manajer');
        if (bottomNavApprovalManajer) bottomNavApprovalManajer.classList.toggle('hidden', !this.isManajer());

        const bottomNavApprovalDirektur = document.getElementById('bottom-nav-approval-direktur');
        if (bottomNavApprovalDirektur) bottomNavApprovalDirektur.classList.toggle('hidden', !this.isDirektur());
    },

    isLoggedIn() {
        return this.currentUser !== null;
    },

    isAdmin() {
        // Jika sedang dalam mode karyawan, kembalikan false
        // agar semua fitur karyawan berjalan normal untuk admin
        if (sessionStorage.getItem('adminSwitchMode') === 'true') return false;
        return this.currentUser && this.currentUser.role === 'admin';
    },

    isManager() {
        if (sessionStorage.getItem('adminSwitchMode') === 'true') return false;
        return this.currentUser && this.currentUser.role === 'manager';
    },

    // Role Bahasa Indonesia yang dipakai alur approval Izin bertingkat
    // (Asmen -> Manajer -> Direktur). Terpisah dari isManager() lama
    // ('manager' bahasa Inggris) yang masih dipakai skema Cuti.
    //
    // Catatan khusus akun rangkap (misal admin yang juga Asmen/Manajer,
    // seperti M. Azemi): saat login sebagai Admin, currentUser.role selalu
    // 'admin'. Jabatan aslinya (asmen/manajer/direktur) disimpan terpisah di
    // currentUser.employeeRole (lihat Auth.gs). Begitu admin masuk "Mode
    // Karyawan", kita cek employeeRole itu - BUKAN role - supaya menu
    // approval yang sesuai muncul.
    isAsmen() {
        if (sessionStorage.getItem('adminSwitchMode') === 'true') {
            return this.currentUser && this.currentUser.employeeRole === 'asmen';
        }
        return this.currentUser && this.currentUser.role === 'asmen';
    },

    isManajer() {
        if (sessionStorage.getItem('adminSwitchMode') === 'true') {
            return this.currentUser && this.currentUser.employeeRole === 'manajer';
        }
        return this.currentUser && this.currentUser.role === 'manajer';
    },

    isDirektur() {
        if (sessionStorage.getItem('adminSwitchMode') === 'true') {
            return this.currentUser && this.currentUser.employeeRole === 'direktur';
        }
        return this.currentUser && this.currentUser.role === 'direktur';
    },

    // Admin, Manager, Asmen, Manajer, atau Direktur - semua bisa approve
    // Izin/Cuti (tahap berbeda-beda sesuai role masing-masing)
    isApprover() {
        return this.isAdmin() || this.isManager() || this.isAsmen() || this.isManajer() || this.isDirektur();
    },

    getCurrentUser() {
        return this.currentUser;
    },

    // ================= Login Sidik Jari (WebAuthn) — TAMBAHAN =================
    // Fitur tambahan, TIDAK mengganti login username/password yang sudah
    // ada. Sidik jari/Face Unlock HP cuma dipakai untuk membuka kunci
    // kredensial yang sudah tersimpan di HP ini; setelah verifikasi sukses,
    // login tetap lewat api.login() seperti biasa (backend Auth.gs tidak
    // perlu diubah sama sekali).
    //
    // Catatan keamanan: username & password disimpan di localStorage HP
    // ini (level keamanan yang sama dengan data sesi yang sudah disimpan
    // app ini sekarang) supaya bisa dipakai ulang otomatis setelah sidik
    // jari terverifikasi. Sebaiknya cuma diaktifkan di HP pribadi yang
    // memang sudah dikunci PIN/sidik jari oleh pemiliknya, bukan HP
    // bersama/kantor.
    BIOMETRIC_KEY: 'biometricLogin',
    BIOMETRIC_DISMISS_KEY: 'biometricPromptDismissed',

    // Setelah verifikasi sidik jari GAGAL/dibatalkan sebanyak ini secara
    // berturut-turut, tombol sidik jari disembunyikan supaya user
    // diarahkan login pakai username & password saja. Reset otomatis
    // begitu halaman dimuat ulang atau setelah verifikasi berhasil.
    BIOMETRIC_MAX_FAILS: 2,
    _biometricFailCount: 0,

    async _isBiometricAvailable() {
        return !!(window.PublicKeyCredential &&
            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    },

    _bufToBase64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    },
    _base64ToBuf(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    },

    // Tebak label perangkat dari User-Agent, buat ditampilkan di daftar
    // "Sidik Jari Terdaftar" di Edit Profil (mis. "Chrome di Android").
    _deviceLabel() {
        const ua = navigator.userAgent || '';
        let os = 'Perangkat';
        if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
        else if (/windows/i.test(ua)) os = 'Windows';
        else if (/mac os/i.test(ua)) os = 'Mac';
        let browser = 'Browser';
        if (/edg\//i.test(ua)) browser = 'Edge';
        else if (/chrome/i.test(ua)) browser = 'Chrome';
        else if (/firefox/i.test(ua)) browser = 'Firefox';
        else if (/safari/i.test(ua)) browser = 'Safari';
        return `${browser} di ${os}`;
    },

    // Dipanggil sekali dari init() - munculkan tombol "Masuk dengan Sidik
    // Jari" di layar login KALAU perangkat ini sudah pernah setup
    // sebelumnya dan masih mendukung platform authenticator.
    async _setupBiometricLogin() {
        const btn = document.getElementById('btn-biometric-login');
        if (!btn) return;
        const saved = storage.get(this.BIOMETRIC_KEY);
        const available = await this._isBiometricAvailable();
        if (saved && saved.credentialId && available) {
            btn.style.display = 'flex';
            btn.addEventListener('click', () => this.loginWithBiometric());
        }
    },

    // Dipanggil dari handleLogin() setelah login username/password sukses -
    // tawarkan aktifkan sidik jari kalau perangkat mendukung & belum
    // pernah diaktifkan/ditolak sebelumnya di HP ini.
    async _maybeOfferBiometricEnrollment(username, password) {
        if (storage.get(this.BIOMETRIC_KEY) || storage.get(this.BIOMETRIC_DISMISS_KEY)) return;
        if (!(await this._isBiometricAvailable())) return;
        this._pendingBiometricCreds = { username, password };
        const modal = document.getElementById('modal-biometric-enable');
        if (modal) modal.style.display = 'flex';
    },

    declineBiometricPrompt() {
        const modal = document.getElementById('modal-biometric-enable');
        if (modal) modal.style.display = 'none';
        storage.set(this.BIOMETRIC_DISMISS_KEY, true);
        this._pendingBiometricCreds = null;
    },

    // User tap "Aktifkan" di modal - daftarkan sidik jari/Face Unlock
    // perangkat ini lewat WebAuthn (platform authenticator).
    async confirmEnableBiometric() {
        const modal = document.getElementById('modal-biometric-enable');
        if (modal) modal.style.display = 'none';
        const creds = this._pendingBiometricCreds;
        this._pendingBiometricCreds = null;
        if (!creds) return;
        await this._createBiometricCredentialAndSave(creds.username, creds.password);
    },

    // Inti pendaftaran sidik jari - dipakai baik oleh modal ajakan setelah
    // login, maupun oleh toggle "Aktifkan Login Sidik Jari" di menu Edit
    // Profil > Akun. Setelah kredensial WebAuthn dibuat di perangkat ini,
    // didaftarkan juga ke server (sheet Users/Employees, kolom
    // biometricDevices) supaya muncul di "Daftar Sidik Jari Terdaftar" dan
    // bisa dihapus dari jarak jauh.
    async _createBiometricCredentialAndSave(username, password) {
        try {
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rp: { name: 'Portal Karyawan TAA', id: location.hostname },
                    user: {
                        id: crypto.getRandomValues(new Uint8Array(16)),
                        name: username,
                        displayName: username
                    },
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7 },
                        { type: 'public-key', alg: -257 }
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                        residentKey: 'preferred'
                    },
                    timeout: 60000,
                    attestation: 'none'
                }
            });
            if (!credential) throw new Error('Pendaftaran dibatalkan');

            const credentialId = this._bufToBase64(credential.rawId);
            let deviceId = null;

            if (this.currentUser && this.currentUser.id) {
                try {
                    const reg = await api.registerBiometricDevice(
                        this.currentUser.id, this.currentUser.role,
                        this._deviceLabel(), credentialId
                    );
                    if (reg.success && Array.isArray(reg.data)) {
                        const entry = reg.data.find(d => d.credentialId === credentialId);
                        deviceId = entry ? entry.id : null;
                    }
                } catch (e) {
                    console.error('Gagal mendaftarkan perangkat sidik jari ke server:', e);
                }
            }

            storage.set(this.BIOMETRIC_KEY, { credentialId, username, password, deviceId });

            const btn = document.getElementById('btn-biometric-login');
            if (btn) {
                btn.style.display = 'flex';
                btn.addEventListener('click', () => this.loginWithBiometric());
            }
            this._biometricFailCount = 0;

            const toggle = document.getElementById('pf-biometric-toggle');
            if (toggle) toggle.checked = true;
            this.renderBiometricSettings();

            toast.success('Login sidik jari berhasil diaktifkan di perangkat ini');
            return true;
        } catch (error) {
            console.error('Gagal mendaftarkan sidik jari:', error);
            toast.error('Gagal mengaktifkan sidik jari. Login manual tetap bisa dipakai.');
            return false;
        }
    },

    // Tombol "Masuk dengan Sidik Jari" di layar login.
    async loginWithBiometric() {
        const saved = storage.get(this.BIOMETRIC_KEY);
        if (!saved || !saved.credentialId) {
            toast.error('Sidik jari belum diaktifkan di perangkat ini');
            return;
        }
        const btn = document.getElementById('btn-biometric-login');
        if (btn) btn.classList.add('loading');

        // --- Tahap 1: verifikasi sidik jari (WebAuthn) ---
        let assertion;
        try {
            assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rpId: location.hostname,
                    allowCredentials: [{
                        id: this._base64ToBuf(saved.credentialId),
                        type: 'public-key',
                        transports: ['internal']
                    }],
                    userVerification: 'required',
                    timeout: 60000
                }
            });
            if (!assertion) throw new Error('Verifikasi dibatalkan');
        } catch (error) {
            console.error('Biometric verification error:', error);
            if (btn) btn.classList.remove('loading');

            // Sidik jari gagal/dibatalkan - hitung sebagai 1x gagal. Kalau
            // sudah 2x berturut-turut, arahkan ke login username & password.
            this._biometricFailCount++;
            if (this._biometricFailCount >= this.BIOMETRIC_MAX_FAILS) {
                this._lockBiometricToPasswordOnly();
            } else {
                toast.error(`Verifikasi sidik jari gagal atau dibatalkan (percobaan ${this._biometricFailCount}/${this.BIOMETRIC_MAX_FAILS})`);
            }
            return;
        }

        // Verifikasi sidik jari sukses - reset penghitung gagal.
        this._biometricFailCount = 0;

        // --- Tahap 2: lanjutkan login normal pakai username & password
        // yang tersimpan (proses sama persis dengan handleLogin(), termasuk
        // sessionToken 1-perangkat). Kegagalan di tahap ini BUKAN kegagalan
        // sidik jari (mis. password sudah diganti), jadi tidak dihitung ke
        // BIOMETRIC_MAX_FAILS.
        try {
            const result = await api.login(saved.username, saved.password);
            if (!result.success || !result.data) {
                toast.error(result.error || 'Login gagal, silakan login manual');
                // Kredensial tersimpan sudah tidak valid - hapus supaya
                // tidak terus gagal.
                storage.remove(this.BIOMETRIC_KEY);
                if (btn) btn.style.display = 'none';
                return;
            }

            const user = {
                id: result.data.id,
                employeeId: result.data.employeeId || null,
                username: result.data.username,
                name: result.data.name,
                role: result.data.role,
                employeeRole: result.data.employeeRole || '',
                department: result.data.department || '',
                position: result.data.position || '',
                shift: result.data.shift || '',
                avatar: result.data.avatar || '',
                nik: result.data.nik || '',
                jabatan: result.data.jabatan || '',
                unitKerja: result.data.unitKerja || '',
                unitWilayah: result.data.unitWilayah || '',
                bagian: result.data.bagian || '',
                pangkat: result.data.pangkat || '',
                golongan: result.data.golongan || '',
                sessionToken: result.data.sessionToken || '',
                loginTime: new Date().toISOString(),
                expiresAt: Date.now() + this.SESSION_DURATION_MS
            };

            this.currentUser = user;
            storage.set('session', user);
            storage.remove('lastHiddenAt');
            this.updateUserUI();
            this.showApp();
            this.startSessionWatcher();
            toast.success(`Selamat datang, ${user.name}!`);
        } catch (error) {
            console.error('Login error setelah verifikasi sidik jari:', error);
            toast.error('Terjadi kesalahan saat login');
        } finally {
            if (btn) btn.classList.remove('loading');
        }
    },

    // Dipanggil setelah verifikasi sidik jari gagal 2x berturut-turut -
    // sembunyikan tombol sidik jari (kredensial TIDAK dihapus, cuma
    // disembunyikan sesi ini) dan arahkan fokus ke form username/password.
    _lockBiometricToPasswordOnly() {
        const btn = document.getElementById('btn-biometric-login');
        if (btn) btn.style.display = 'none';
        this._biometricFailCount = 0;
        toast.show(
            'Verifikasi sidik jari gagal 2 kali. Silakan login dengan username & password.',
            'warning', 'Sidik Jari Gagal', 6000
        );
        const usernameInput = document.getElementById('login-email');
        if (usernameInput) usernameInput.focus();
    },

    // ===== Menu "Login Sidik Jari" di Edit Profil > tab Akun =====

    // Dipanggil profileManager.switchTab('akun') tiap kali tab Akun dibuka -
    // set posisi toggle & muat ulang daftar perangkat dari server.
    async renderBiometricSettings() {
        const toggle = document.getElementById('pf-biometric-toggle');
        const listEl = document.getElementById('pf-biometric-device-list');
        if (!toggle && !listEl) return;

        const saved = storage.get(this.BIOMETRIC_KEY);
        if (toggle) toggle.checked = !!(saved && saved.credentialId);

        if (!listEl || !this.currentUser || !this.currentUser.id) return;
        listEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Memuat...</p>';

        try {
            const result = await api.getBiometricDevices(this.currentUser.id, this.currentUser.role);
            const devices = (result.success && Array.isArray(result.data)) ? result.data : [];

            if (devices.length === 0) {
                listEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Belum ada perangkat yang mengaktifkan login sidik jari.</p>';
                return;
            }

            listEl.innerHTML = devices.map(d => {
                const tanggal = d.createdAt
                    ? new Date(d.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '';
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <i class="fas fa-fingerprint" style="color:var(--color-primary);font-size:1.1rem;"></i>
                            <div>
                                <div style="font-weight:600;font-size:0.88rem;">${d.label || 'Perangkat tidak dikenal'}</div>
                                <div style="font-size:0.75rem;color:var(--text-muted);">Didaftarkan ${tanggal}</div>
                            </div>
                        </div>
                        <button type="button" onclick="auth.removeBiometricDeviceById('${d.id}')"
                            style="background:none;border:none;color:var(--color-danger);cursor:pointer;font-size:0.8rem;font-weight:600;">
                            <i class="fas fa-trash-alt"></i> Hapus
                        </button>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Gagal memuat daftar sidik jari:', error);
            listEl.innerHTML = '<p style="font-size:0.85rem;color:var(--color-danger);">Gagal memuat daftar perangkat.</p>';
        }
    },

    // Handler onchange toggle "Aktifkan Login Sidik Jari" di Edit Profil.
    toggleBiometricSetting(checkboxEl) {
        const saved = storage.get(this.BIOMETRIC_KEY);
        if (checkboxEl.checked) {
            if (saved && saved.credentialId) return; // sudah aktif
            // Batalkan centang dulu sampai password dikonfirmasi & WebAuthn
            // berhasil didaftarkan.
            checkboxEl.checked = false;
            const modal = document.getElementById('modal-biometric-confirm-password');
            const input = document.getElementById('pf-biometric-confirm-password-input');
            if (input) input.value = '';
            if (modal) modal.style.display = 'flex';
        } else {
            this.disableBiometricLogin();
        }
    },

    cancelBiometricPasswordConfirm() {
        const modal = document.getElementById('modal-biometric-confirm-password');
        if (modal) modal.style.display = 'none';
    },

    // User memasukkan password di modal konfirmasi sebelum sidik jari
    // diaktifkan lewat menu Edit Profil (dicek ulang ke server lewat
    // verifyPasswordOnly - TIDAK memakai endpoint login supaya sessionToken
    // "1 perangkat saja" milik sesi yang sedang aktif tidak ikut berubah).
    async submitBiometricPasswordConfirm() {
        const input = document.getElementById('pf-biometric-confirm-password-input');
        const password = input ? input.value : '';
        if (!password) {
            toast.error('Password harus diisi');
            return;
        }
        const modal = document.getElementById('modal-biometric-confirm-password');
        if (modal) modal.style.display = 'none';

        if (!this.currentUser || !this.currentUser.id) return;

        const check = await api.verifyPassword(this.currentUser.id, this.currentUser.role, password);
        if (!check.success) {
            toast.error(check.error || 'Password salah, login sidik jari tidak diaktifkan');
            return;
        }

        await this._createBiometricCredentialAndSave(this.currentUser.username, password);
    },

    // Matikan login sidik jari di perangkat ini - dipanggil dari toggle di
    // Edit Profil ATAU dari tombol "Hapus" pada perangkat ini sendiri di
    // daftar sidik jari.
    async disableBiometricLogin() {
        const saved = storage.get(this.BIOMETRIC_KEY);
        storage.remove(this.BIOMETRIC_KEY);
        storage.remove(this.BIOMETRIC_DISMISS_KEY);

        const btn = document.getElementById('btn-biometric-login');
        if (btn) btn.style.display = 'none';
        const toggle = document.getElementById('pf-biometric-toggle');
        if (toggle) toggle.checked = false;

        if (saved && saved.deviceId && this.currentUser && this.currentUser.id) {
            try {
                await api.removeBiometricDevice(this.currentUser.id, this.currentUser.role, saved.deviceId);
            } catch (e) {
                console.error('Gagal menghapus perangkat sidik jari di server:', e);
            }
        }

        this.renderBiometricSettings();
        toast.info('Login sidik jari dinonaktifkan di perangkat ini');
    },

    // Tombol "Hapus" per baris di daftar sidik jari (Edit Profil). Bisa
    // menghapus perangkat MANA SAJA yang terdaftar - kalau kebetulan yang
    // dihapus adalah perangkat yang sedang dipakai sekarang, kredensial
    // lokalnya ikut dibersihkan juga.
    async removeBiometricDeviceById(deviceId) {
        if (!this.currentUser || !this.currentUser.id) return;
        try {
            const result = await api.removeBiometricDevice(this.currentUser.id, this.currentUser.role, deviceId);
            if (!result.success) {
                toast.error(result.error || 'Gagal menghapus perangkat');
                return;
            }

            const saved = storage.get(this.BIOMETRIC_KEY);
            if (saved && saved.deviceId === deviceId) {
                storage.remove(this.BIOMETRIC_KEY);
                const btn = document.getElementById('btn-biometric-login');
                if (btn) btn.style.display = 'none';
                const toggle = document.getElementById('pf-biometric-toggle');
                if (toggle) toggle.checked = false;
            }

            toast.success('Perangkat sidik jari dihapus');
            this.renderBiometricSettings();
        } catch (error) {
            console.error('Gagal menghapus perangkat sidik jari:', error);
            toast.error('Gagal menghapus perangkat');
        }
    }
};

// Initialize auth on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    auth.init();
});

// Expose to global
window.auth = auth;
