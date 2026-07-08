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

    init() {
    const session = storage.get('session');
    if (session && session.id && session.role && !this.isSessionExpired(session)) {
        this.currentUser = session;
        this.showApp();
    } else {
        storage.remove('session');
        this.showLogin();
    }

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
    },

    async handleLogin(e) {
        e.preventDefault();

        const username = document.getElementById('login-email').value;
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
                    bagian: result.data.bagian || '',
                    pangkat: result.data.pangkat || '',
                    golongan: result.data.golongan || '',
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

            // Update UI
            this.updateUserUI();

            // Show app
            this.showApp();

            toast.success(`Selamat datang, ${user.name}!`);
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
        this.currentUser = null;
        storage.remove('session');
        storage.remove('currentPage');
        sessionStorage.removeItem('adminSwitchMode');

        this.showLogin();
        toast.info('Anda telah logout');
    },

    showApp() {
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

                // Navigate to admin dashboard
                router.navigate('admin-dashboard');
            } else {
                // Show employee menu, hide admin menu
                if (employeeMenu) employeeMenu.classList.remove('hidden');
                if (adminMenu) adminMenu.classList.add('hidden');
                if (bottomNav) bottomNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';

                // Navigate to employee dashboard
                router.navigate('dashboard');
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
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role === 'admin' ? 'Administrator' : 'Karyawan';
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
                        <p style="color:var(--text-muted);font-size:0.85rem;">${user.role === 'admin' ? 'Administrator' : 'Karyawan'}</p>
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
                <p style="color:var(--text-muted);font-size:0.85rem;">${p.jabatan || ''} — ${p.unitKerja || ''}</p>
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
                ${field('Unit Kerja', p.unitKerja)}
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

        // Bottom nav (mobile) - item "Approval" khusus untuk Asmen & Manajer
        const bottomNavApprovalAsmen = document.getElementById('bottom-nav-approval-asmen');
        if (bottomNavApprovalAsmen) bottomNavApprovalAsmen.classList.toggle('hidden', !this.isAsmen());

        const bottomNavApprovalManajer = document.getElementById('bottom-nav-approval-manajer');
        if (bottomNavApprovalManajer) bottomNavApprovalManajer.classList.toggle('hidden', !this.isManajer());
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
    }
};

// Initialize auth on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    auth.init();
});

// Expose to global
window.auth = auth;
