/**
 * Portal Karyawan - Mobile Responsive
 * Mobile-specific functionality
 */

const mobile = {
    isMobile: false,
    sidebarOpen: false,
    
    init() {
        this.checkMobile();
        this.initSidebar();
        this.initBottomNav();
        this.handleResize();
        
        // Listen for resize events
        window.addEventListener('resize', () => this.handleResize());

        // [TAMBAHAN 2026-10-19] Di HP, sidebar tidak dipakai lagi kalau
        // bottom bar tampil (semua menu ada di tombol "Menu" bottom bar).
        // Bottom bar bisa muncul/hilang dari luar file ini (login, Mode
        // Karyawan admin), jadi pantau perubahan style-nya.
        const bn = document.getElementById('bottom-nav');
        if (bn && window.MutationObserver) {
            new MutationObserver(() => this.syncSidebarAvailability())
                .observe(bn, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    },

    // True kalau di HP DAN bottom bar sedang tampil -> sidebar dimatikan.
    // Admin (bottom bar disembunyikan) tetap memakai sidebar seperti biasa.
    sidebarDisabled() {
        const bn = document.getElementById('bottom-nav');
        return !!(this.isMobile && bn && window.getComputedStyle(bn).display !== 'none');
    },

    syncSidebarAvailability() {
        const menuToggle = document.getElementById('mobile-menu-toggle');
        const disabled = this.sidebarDisabled();
        if (menuToggle) menuToggle.style.display = (this.isMobile && !disabled) ? 'flex' : 'none';
        if (disabled && this.sidebarOpen) this.closeSidebar();
    },
    
    checkMobile() {
        this.isMobile = window.innerWidth <= 768;
        return this.isMobile;
    },
    
    handleResize() {
        const wasMobile = this.isMobile;
        this.checkMobile();
        
        // Toggle mobile menu button visibility
        const menuToggle = document.getElementById('mobile-menu-toggle');
        if (menuToggle) {
            menuToggle.style.display = this.isMobile ? 'flex' : 'none';
        }
        
        // Toggle sidebar behavior
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            if (this.isMobile) {
                sidebar.classList.remove('open');
                this.sidebarOpen = false;
            } else {
                sidebar.style.transform = '';
            }
        }
        
       // Toggle bottom nav (hidden for admin regardless of screen size)
        const bottomNav = document.getElementById('bottom-nav');
        const isAdmin = window.auth && window.auth.isAdmin && window.auth.isAdmin();
        if (bottomNav) {
            bottomNav.style.display = (this.isMobile && !isAdmin) ? 'flex' : 'none';
        }
        
        // Update tables to cards on mobile
        this.updateTableViews();

        // Sembunyikan tombol hamburger kalau bottom bar tampil (lihat init()).
        this.syncSidebarAvailability();
    },
    
    initSidebar() {
        const menuToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        
        // Mobile menu toggle
        if (menuToggle) {
            menuToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        // Tombol "<" (id sidebar-toggle) di sebelah teks "Portal Karyawan":
        // - Desktop: collapse/expand sidebar (perilaku lama, tidak diubah)
        // - Mobile: sebelumnya tombol ini tidak melakukan apa-apa sama sekali
        //   kalau di mode mobile (blok if hanya jalan saat !isMobile), jadi
        //   pengguna mengira tombol itu rusak. Sekarang di mobile tombol ini
        //   menutup sidebar, sama seperti menekan tombol menu / overlay.
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                if (this.isMobile) {
                    this.closeSidebar();
                } else {
                    sidebar?.classList.toggle('collapsed');
                }
            });
        }
        
        // Close sidebar when clicking overlay
        if (overlay) {
            overlay.addEventListener('click', () => this.closeSidebar());
        }
        
        // Close sidebar when clicking nav items on mobile
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (this.isMobile) {
                    this.closeSidebar();
                }
            });
        });
    },
    
    initBottomNav() {
        const bottomNav = document.getElementById('bottom-nav');
        if (!bottomNav) return;
        
        const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) {
                    // Update active state
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    
                    // Navigate
                    router.navigate(page);
                }
            });
        });
    },
    
    toggleSidebar() {
    if (this.sidebarDisabled()) return;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    this.sidebarOpen = !this.sidebarOpen;
    
    if (this.sidebarOpen) {
        sidebar?.classList.add('open');
        overlay?.classList.add('show');
        document.body.style.overflow = 'hidden';
    } else {
        this.closeSidebar();
    }
},
    
    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        this.sidebarOpen = false;
        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = '';
    },
    
    updateTableViews() {
        // Convert tables to cards on mobile if needed
        const tableContainers = document.querySelectorAll('.table-responsive');
        
        tableContainers.forEach(container => {
            const table = container.querySelector('table');
            const mobileCards = container.nextElementSibling;
            
            if (table && mobileCards && mobileCards.classList.contains('mobile-cards')) {
                if (this.isMobile) {
                    container.style.display = 'none';
                    mobileCards.style.display = 'block';
                } else {
                    container.style.display = 'block';
                    mobileCards.style.display = 'none';
                }
            }
        });
    },
    
    // Update bottom nav active state based on current page
    updateBottomNav(page) {
        const bottomNav = document.getElementById('bottom-nav');
        if (!bottomNav) return;
        
        const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        // Halaman yang tidak punya tab sendiri (Cuti, Slip Gaji, dst) -> sorot tab "Menu"
        if (!bottomNav.querySelector('.bottom-nav-item.active')) {
            const menuTab = document.getElementById('bottom-nav-more');
            if (menuTab) menuTab.classList.add('active');
        }
    }
};

// Touch swipe support for sidebar
document.addEventListener('touchstart', handleTouchStart, { passive: true });
document.addEventListener('touchmove', handleTouchMove, { passive: true });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

let xDown = null;
let yDown = null;
let swipeHandled = false;

function handleTouchStart(evt) {
    xDown = evt.touches[0].clientX;
    yDown = evt.touches[0].clientY;
    swipeHandled = false;
}

function handleTouchMove(evt) {
    // BUG LAMA: xDown/yDown direset jadi null di akhir fungsi ini, padahal
    // "touchmove" terpicu berkali-kali selama satu gerakan geser jari — jadi
    // jarak yang kehitung cuma dari gerakan super kecil di awal sentuhan,
    // hampir tidak pernah sampai ambang 50px. Sekarang xDown/yDown tetap
    // dipertahankan dari titik sentuh AWAL sampai jari diangkat (touchend),
    // dan `swipeHandled` mencegah aksi ke-trigger berkali-kali dalam 1 geseran.
    if (xDown === null || yDown === null || swipeHandled) return;

    const xUp = evt.touches[0].clientX;
    const yUp = evt.touches[0].clientY;

    const xDiff = xDown - xUp;
    const yDiff = yDown - yUp;

    // Horizontal swipe
    if (Math.abs(xDiff) > Math.abs(yDiff)) {
        // Swipe right - open sidebar (dari tepi kiri layar)
        if (xDiff < -50 && xDown < 50 && mobile.isMobile && !mobile.sidebarOpen) {
            mobile.toggleSidebar();
            swipeHandled = true;
        }
        // Swipe left - close sidebar
        if (xDiff > 50 && mobile.sidebarOpen) {
            mobile.closeSidebar();
            swipeHandled = true;
        }
    }
}

function handleTouchEnd() {
    xDown = null;
    yDown = null;
    swipeHandled = false;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    mobile.init();
});

// Expose
window.mobile = mobile;
