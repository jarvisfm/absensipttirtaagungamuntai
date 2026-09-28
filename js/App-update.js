/**
 * app-update.js
 * ============================================================
 * Pembaruan aplikasi (frontend) otomatis + tombol "Perbarui Aplikasi".
 *
 * MASALAH YANG DISELESAIKAN: frontend di-hosting statis (Cloudflare) dan
 * Service Worker (sw.js) meng-cache shell app dengan strategi
 * stale-while-revalidate - artinya karyawan SELALU dapat versi cache
 * (lama) lebih dulu, versi barunya baru dipakai di pembukaan BERIKUTNYA.
 * Karyawan yang membiarkan app terbuka/di background juga tidak pernah
 * tahu ada versi baru. (Backend Apps Script beda: selalu langsung aktif.)
 *
 * CARA KERJA:
 * 1. File ini berisi APP_VERSION (baris di bawah). Nilainya otomatis
 *    diisi ID commit GitHub oleh build command Cloudflare setiap deploy,
 *    jadi TIDAK ada langkah manual sama sekali.
 * 2. App membaca ulang file ini dari SERVER (bukan dari cache) lalu
 *    membandingkan versinya dengan versi yang sedang berjalan. Dicek:
 *    saat halaman dibuka, tiap 5 menit, dan setiap kali app kembali
 *    dibuka dari background.
 * 3. Kalau beda:
 *    - Di layar LOGIN (belum login, form kosong), atau baru beberapa
 *      detik setelah app dibuka dan tidak sedang memakai kamera: app
 *      langsung diperbarui otomatis.
 *    - Selain itu (sedang login/bekerja): muncul banner "Versi baru
 *      tersedia" dengan tombol Perbarui - TIDAK memaksa reload di tengah
 *      absen/pengisian form.
 * 4. "Memperbarui" = hapus cache shell app lama lalu reload, jadi
 *    hasilnya PASTI kode terbaru (tidak bergantung pada angka
 *    CACHE_NAME di sw.js).
 */

(function () {
    // Nilai di bawah ini DIGANTI OTOMATIS saat build di Cloudflare (Workers
    // Builds) dengan ID commit GitHub terbaru - JANGAN diedit manual dan
    // jangan diubah bentuknya. Lihat pengaturan "Build command" di
    // Cloudflare > Workers & Pages > app > Settings > Build.
    const APP_VERSION = '__BUILD__';

    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // cek berkala
    const MIN_GAP_MS = 60 * 1000;            // jarak minimal antar cek
    const SNOOZE_MS = 30 * 60 * 1000;        // "Nanti" menyembunyikan banner selama ini
    const FRESH_LOAD_WINDOW_MS = 20 * 1000;  // "baru dibuka" = auto-update masih aman
    const TRIED_KEY = 'appUpdateTriedVersion';

    const pageLoadedAt = Date.now();
    let lastCheckAt = 0;
    let checking = false;
    let latestVersion = null;
    let snoozedUntil = 0;

    async function fetchLatestVersion() {
        // Query unik + no-store supaya selalu ke server. sw.js (versi baru)
        // melewatkan URL ber-parameter "vcheck" langsung ke network.
        const res = await fetch('js/app-update.js?vcheck=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        const text = await res.text();
        const m = text.match(/APP_VERSION\s*=\s*'([^']+)'/);
        return m ? m[1] : null;
    }

    function isLoggedIn() {
        return !!(window.auth && window.auth.currentUser);
    }

    // Ada yang sedang diketik di form login, atau kamera sedang aktif -> jangan reload paksa.
    function isBusy() {
        const u = document.getElementById('login-email');
        const p = document.getElementById('login-password');
        if ((u && u.value) || (p && p.value)) return true;
        const videos = document.querySelectorAll('video');
        for (const v of videos) { if (v.srcObject) return true; }
        return false;
    }

    async function applyUpdate() {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg) {
                    await Promise.race([reg.update(), new Promise(r => setTimeout(r, 4000))]);
                }
            }
        } catch (e) { /* lanjut saja */ }

        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                // Model face-api.js sengaja dipertahankan (besar & tidak pernah berubah).
                await Promise.all(keys.filter(k => k.indexOf('face-models') === -1).map(k => caches.delete(k)));
            }
        } catch (e) { /* lanjut saja */ }

        try { sessionStorage.setItem(TRIED_KEY, latestVersion || ''); } catch (e) { /* abaikan */ }
        window.location.reload();
    }

    function removeBanner() {
        const el = document.getElementById('app-update-banner');
        if (el) el.remove();
    }

    function showBanner() {
        if (document.getElementById('app-update-banner')) return;
        const el = document.createElement('div');
        el.id = 'app-update-banner';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));' +
            'z-index:100000;max-width:460px;margin:0 auto;background:#1f2937;color:#fff;border-radius:12px;' +
            'padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);' +
            'font-size:.88rem;line-height:1.3;';
        el.innerHTML =
            '<span style="flex:1;">Versi baru aplikasi tersedia.</span>' +
            '<button type="button" id="app-update-later" style="background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:.82rem;">Nanti</button>' +
            '<button type="button" id="app-update-now" style="background:#f59e0b;border:none;color:#1f2937;font-weight:700;border-radius:8px;padding:8px 14px;cursor:pointer;">Perbarui</button>';
        document.body.appendChild(el);

        el.querySelector('#app-update-now').addEventListener('click', function () {
            this.disabled = true;
            this.textContent = 'Memperbarui...';
            applyUpdate();
        });
        el.querySelector('#app-update-later').addEventListener('click', function () {
            snoozedUntil = Date.now() + SNOOZE_MS;
            removeBanner();
        });
    }

    async function checkForUpdate(force) {
        if (checking) return;
        if (!force && Date.now() - lastCheckAt < MIN_GAP_MS) return;
        if (!navigator.onLine) return;
        checking = true;
        lastCheckAt = Date.now();
        try {
            const remote = await fetchLatestVersion();
            if (!remote || remote === APP_VERSION) { removeBanner(); return; }
            latestVersion = remote;

            let alreadyTried = false;
            try { alreadyTried = sessionStorage.getItem(TRIED_KEY) === remote; } catch (e) { /* abaikan */ }

            const safeToAuto = !alreadyTried && !isBusy() &&
                (!isLoggedIn() || (Date.now() - pageLoadedAt) < FRESH_LOAD_WINDOW_MS);
            if (safeToAuto) { applyUpdate(); return; }

            if (Date.now() >= snoozedUntil) showBanner();
        } catch (e) {
            // Offline/server sibuk - abaikan, dicoba lagi di jadwal berikutnya.
        } finally {
            checking = false;
        }
    }

    // Tombol manual di header (#btn-app-update) - sekarang ikut membersihkan cache.
    async function manualUpdate(btn) {
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try { latestVersion = (await fetchLatestVersion()) || latestVersion; } catch (e) { /* abaikan */ }
        await applyUpdate();
        btn.innerHTML = original; // hanya tercapai kalau reload gagal
        btn.disabled = false;
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('btn-app-update');
        if (btn) btn.addEventListener('click', function () { manualUpdate(btn); });

        setTimeout(function () { checkForUpdate(true); }, 1500);
        setInterval(function () { if (!document.hidden) checkForUpdate(false); }, CHECK_INTERVAL_MS);
    });

    // App kembali dibuka dari background / pindah tab.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkForUpdate(false);
    });
    window.addEventListener('online', function () { checkForUpdate(false); });
})();
