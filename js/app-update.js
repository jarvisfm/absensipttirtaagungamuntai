/**
 * app-update.js (BARU)
 * ============================================================
 * Tombol "Perbarui Aplikasi" (ikon refresh, header atas - lihat
 * #btn-app-update di index.html) - dipakai KHUSUS untuk memaksa app
 * mengambil versi kode FRONTEND terbaru SEKARANG, tanpa menunggu browser
 * cek update Service Worker sendiri (yang jadwalnya tidak pasti kapan).
 *
 * KENAPA INI DIBUTUHKAN: frontend di-hosting statis (Cloudflare), dan
 * Service Worker (sw.js) sengaja meng-cache shell app (HTML/CSS/JS) supaya
 * tetap bisa dibuka walau koneksi lemah/putus - lihat catatan lengkap di
 * sw.js. Konsekuensinya, kalau ada perbaikan kode di-deploy, user yang
 * SEDANG membuka app tidak otomatis dapat versi barunya sampai browser-nya
 * sendiri kebetulan mengecek update (biasanya cuma saat navigasi/reload,
 * dan ada throttle internal browser, tidak instan). Beda dari perubahan di
 * DATABASE (Firestore/Sheets) yang memang selalu realtime tanpa perlu
 * langkah manual apa pun.
 *
 * CARA KERJA tombol ini:
 * 1. Panggil registration.update() - paksa browser cek versi Service
 *    Worker terbaru ke server SEKARANG JUGA (bukan menunggu jadwal
 *    otomatis browser).
 * 2. Kalau ada versi baru: sw.js sendiri SUDAH otomatis skipWaiting() +
 *    clients.claim() + bersihkan cache lama (lihat event 'install' &
 *    'activate' di sw.js, TIDAK diubah/ditambah apa pun di sini) - tombol
 *    ini cuma menunggu event 'controllerchange' (tandanya proses itu
 *    SELESAI) sebelum me-reload halaman, supaya reload-nya sudah pasti
 *    dapat konten fresh, bukan reload di tengah proses.
 * 3. Kalau ternyata memang tidak ada versi baru (sudah paling baru): tidak
 *    ada 'controllerchange' yang akan pernah terjadi - dikasih batas
 *    waktu tunggu maksimal 5 detik, lewat itu reload biasa saja (user
 *    tetap dapat pengalaman "disegarkan", walau isinya memang sudah sama).
 *
 * File ini BERDIRI SENDIRI (tidak mengubah main.js/sw.js/file lain apa
 * pun) - aman ditambahkan ke halaman mana saja yang punya elemen
 * #btn-app-update.
 */

(function () {
    async function forceAppUpdate(btn) {
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg) {
                    const waitForNewWorker = new Promise((resolve) => {
                        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                        setTimeout(resolve, 5000); // jaga-jaga kalau memang tidak ada versi baru
                    });
                    await reg.update();
                    await waitForNewWorker;
                }
            }
        } catch (e) {
            console.error('Gagal memeriksa versi terbaru aplikasi:', e);
            // Tetap lanjut reload di bawah walau pengecekan gagal (mis. offline)
            // - reload biasa tidak merugikan, cuma tidak dapat versi baru kalau
            // memang sedang tidak ada koneksi.
        }

        // Reload TANPA parameter (location.reload(true) sudah usang/tidak
        // didukung lagi) - cukup, karena kalau memang ada versi baru,
        // Service Worker yang baru (dengan cache lama yang SUDAH
        // dibersihkan lewat event 'activate' di sw.js) sudah aktif duluan
        // di titik ini, jadi reload biasa otomatis mengambil konten fresh.
        window.location.reload();
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('btn-app-update');
        if (btn) btn.addEventListener('click', function () { forceAppUpdate(btn); });
    });
})();
