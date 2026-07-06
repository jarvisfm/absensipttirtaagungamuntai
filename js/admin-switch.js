/**
 * Admin Switch Mode
 * Memungkinkan admin untuk berpindah ke tampilan karyawan dan kembali lagi
 */

const adminSwitch = {

    STORAGE_KEY: 'adminSwitchMode',

    /**
     * Masuk ke mode karyawan
     * Dipanggil saat admin klik tombol "Mode Karyawan"
     */
    enterEmployeeMode() {
        if (!auth.isAdmin()) return;

        // Simpan flag mode karyawan
        sessionStorage.setItem(this.STORAGE_KEY, 'true');

        // Terapkan tampilan mode karyawan
        this._applyEmployeeMode();

        // PENTING: baru setelah flag di atas di-set, isAsmen()/isManajer()/isDirektur()
        // bisa mengecek employeeRole dengan benar (untuk akun rangkap seperti Admin
        // yang juga Asmen/Manajer). Tanpa panggilan ulang ini, menu Approval tidak
        // akan muncul walau data karyawannya sudah benar.
        auth.updateApprovalNav();

        // Navigasi ke dashboard karyawan
        router.navigate('dashboard');

        // Re-init dashboard karyawan agar data ter-load
        if (window.dashboard) {
            window.dashboard.initialized = false;
            window.dashboard.init();
        }
    },

    /**
     * Kembali ke mode admin
     * Dipanggil saat admin klik tombol "Kembali ke Admin"
     */
    exitEmployeeMode() {
        // Hapus flag
        sessionStorage.removeItem(this.STORAGE_KEY);

        // Terapkan kembali tampilan admin
        this._applyAdminMode();

        // Refresh juga status menu approval (balik ke false karena adminSwitchMode
        // sudah dihapus dan role tingkat atas 'admin' bukan asmen/manajer/direktur)
        auth.updateApprovalNav();

        // Navigasi ke dashboard admin
        router.navigate('admin-dashboard');
    },

    /**
     * Cek apakah saat ini sedang dalam mode karyawan
     */
    isEmployeeMode() {
        return sessionStorage.getItem(this.STORAGE_KEY) === 'true';
    },

    /**
     * Terapkan UI mode karyawan:
     * - Tampilkan sidebar menu karyawan
     * - Sembunyikan sidebar menu admin
     * - Tampilkan banner "Kembali ke Admin"
     * - Sembunyikan tombol "Mode Karyawan"
     * - Tampilkan bottom nav (mobile)
     */
    _applyEmployeeMode() {
        const employeeMenu = document.getElementById('employee-menu');
        const adminMenu    = document.getElementById('admin-menu-nav');
        const banner       = document.getElementById('admin-switch-banner');
        const switchBtn    = document.getElementById('btn-switch-to-employee');
        const bottomNav    = document.getElementById('bottom-nav');

        if (employeeMenu) employeeMenu.classList.remove('hidden');
        if (adminMenu)    adminMenu.classList.add('hidden');
        if (banner)       banner.style.display = 'flex';
        if (switchBtn)    switchBtn.style.display = 'none';
        if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';
    },

    /**
     * Terapkan kembali UI mode admin:
     * - Tampilkan sidebar menu admin
     * - Sembunyikan sidebar menu karyawan
     * - Sembunyikan banner
     * - Tampilkan kembali tombol "Mode Karyawan"
     * - Sembunyikan bottom nav
     */
    _applyAdminMode() {
        const employeeMenu = document.getElementById('employee-menu');
        const adminMenu    = document.getElementById('admin-menu-nav');
        const banner       = document.getElementById('admin-switch-banner');
        const switchBtn    = document.getElementById('btn-switch-to-employee');
        const bottomNav    = document.getElementById('bottom-nav');

        if (employeeMenu) employeeMenu.classList.add('hidden');
        if (adminMenu)    adminMenu.classList.remove('hidden');
        if (banner)       banner.style.display = 'none';
        if (switchBtn)    switchBtn.style.display = 'flex';
        if (bottomNav)    bottomNav.style.display = 'none';
    },

    /**
     * Inisialisasi: jalankan saat halaman pertama load
     * Jika sessionStorage masih ada flag (misal refresh), pulihkan state
     */
    init() {
        if (this.isEmployeeMode() && auth.isAdmin()) {
            this._applyEmployeeMode();
        }
    }
};

// Jalankan init setelah DOM dan auth siap
document.addEventListener('DOMContentLoaded', () => {
    // Tunggu sebentar agar auth.init() selesai duluan
    setTimeout(() => {
        if (auth.isAdmin()) {
            adminSwitch.init();
        }
    }, 300);
});

window.adminSwitch = adminSwitch;
