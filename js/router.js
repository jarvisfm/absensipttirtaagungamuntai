/**
 * Portal Karyawan - Router
 * Simple SPA Router for vanilla JS
 */

const router = {
    currentPage: 'dashboard',
    routes: ['dashboard', 'absensi', 'face-recognition', 'izin', 'jurnal', 'cuti', 
         'approval-asmen', 'approval-manajer', 'approval-direktur', 'profile',
         'admin-dashboard', 'employees', 'karyawan', 'attendance-reports', 'jurnal-reports', 
         'leave-reports', 'shift-schedule', 'settings'],
    
    init() {
        // Handle navigation clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            // Menu eksternal (mis. "Permintaan Barang" yang buka tab baru) tidak
            // ikut ditangani router SPA - biarkan link-nya bekerja apa adanya.
            if (item.dataset.external) return;

            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) {
                    this.navigate(page);
                }
            });
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.showPage(e.state.page, false);
            }
        });
        
        // Check for stored current page
        const storedPage = storage.get('currentPage');
        if (storedPage && this.routes.includes(storedPage)) {
            this.showPage(storedPage, false);
        }
    },
    
    navigate(page) {
        if (!this.routes.includes(page)) return;
        
        this.showPage(page, true);
        storage.set('currentPage', page);
    },
    
    showPage(page, pushState = true) {
        const previousPage = this.currentPage;
        this.currentPage = page;

        // Pastikan kamera selalu dimatikan begitu meninggalkan halaman
        // Face Recognition ke menu manapun - sebelumnya kamera bisa tetap
        // menyala di background kalau user pindah halaman di tengah proses
        // verifikasi (belum sempat capturePhoto() memanggil stopCamera()).
        if (previousPage === 'face-recognition' && page !== 'face-recognition') {
            if (window.faceRecognition && typeof faceRecognition.stopCamera === 'function') {
                faceRecognition.stopCamera();
            }
        }
        
        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            absensi: 'Absensi',
            izin: 'Izin / Sakit',
            karyawan: 'Data Karyawan',
            jurnal: 'Jurnal Kerja',
            cuti: 'Pengajuan Cuti',
            'approval-asmen': 'Approval Asmen',
            'approval-manajer': 'Approval Manajer',
            'approval-direktur': 'Approval Direktur',
            'admin-dashboard': 'Dashboard Admin',
            employees: 'Data Karyawan',
            'attendance-reports': 'Rekap Absensi',
            'jurnal-reports': 'Rekap Jurnal Kerja',
            'leave-reports': 'Rekap Cuti & Izin',
            'shift-schedule': 'Jadwal Shift',
            settings: 'Settings',
            profile: 'Edit Profil'
        };
        
        const company = storage.get('company', { name: 'Portal Karyawan' });
        document.title = `${titles[page] || 'Portal Karyawan'} - ${company.name}`;
        
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        
        // Show/hide pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        const targetPage = document.getElementById(`page-${page}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // Update page title in header
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            pageTitle.textContent = titles[page];
        }
        
        // Push state for browser history
        if (pushState) {
            history.pushState({ page }, titles[page], `#${page}`);
        }
        
        // Trigger page-specific init functions
        this.triggerPageInit(page);
        
        // Scroll to top
        document.querySelector('.page-content').scrollTop = 0;
    },
    
    triggerPageInit(page) {
        // Call init function for each page if exists
        switch(page) {
            case 'dashboard':
                if (window.initDashboard) window.initDashboard();
                break;
            case 'absensi':
                if (window.initAbsensi) window.initAbsensi();
                break;
            case 'face-recognition':
                // Face recognition is initialized with action parameter
                break;
            case 'izin':
                if (window.initIzin) window.initIzin();
                break;
            case 'jurnal':
                if (window.initJurnal) window.initJurnal();
                break;
            case 'cuti':
                if (window.initCuti) window.initCuti();
                break;
            case 'approval-asmen':
                if (window.izin) izin.initApprovalPage('asmen');
                if (window.cuti) cuti.initApprovalPage('asmen');
                if (window.outOfRadius) outOfRadius.initApprovalPage('asmen');
                break;
            case 'approval-manajer':
                if (window.izin) izin.initApprovalPage('manajer');
                if (window.cuti) cuti.initApprovalPage('manajer');
                if (window.outOfRadius) outOfRadius.initApprovalPage('manajer');
                break;
            case 'approval-direktur':
                if (window.izin) izin.initApprovalPage('direktur');
                if (window.cuti) cuti.initApprovalPage('direktur');
                if (window.outOfRadius) outOfRadius.initApprovalPage('direktur');
                break;
            case 'profile':
                if (window.initProfile) window.initProfile();
                break;
            case 'admin-dashboard':
                if (window.initAdminDashboard) window.initAdminDashboard();
                break;
            case 'employees':
                if (window.initEmployees) window.initEmployees();
                break;
            case 'karyawan':
                if (window.initKaryawan) window.initKaryawan();
                break;
            case 'attendance-reports':
                if (window.initAttendanceReports) window.initAttendanceReports();
                break;
            case 'jurnal-reports':
                if (window.initJurnalReports) window.initJurnalReports();
                break;
            case 'leave-reports':
                if (window.initLeaveReports) window.initLeaveReports();
                break;
            case 'shift-schedule':
                if (window.initShiftSchedule) window.initShiftSchedule();
                break;
            case 'settings':
                if (window.initSettings) window.initSettings();
                break;
        }
        
        // Update mobile bottom nav
        if (window.mobile) {
            window.mobile.updateBottomNav(page);
        }
    }
};

// Initialize router on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    router.init();
});

// Expose to global
window.router = router;
