/**
 * Service Worker - Portal Karyawan PT. Tirta Agung Amuntai
 *
 * TUJUAN: cuma supaya aplikasi bisa di-"Install" sebagai PWA di HP
 * (Android/iOS) dan shell-nya (HTML/CSS/JS/ikon) tetap kebuka meski koneksi
 * lemah/putus sebentar.
 *
 * SENGAJA TIDAK men-cache:
 * - Semua request ke Google Apps Script (API_BASE_URL) - data absensi,
 *   settings, dsb. HARUS selalu real-time dari server, tidak boleh basi.
 * - Semua request POST (form submit, dll).
 * - Request cross-origin lain (CDN font-awesome, face-api.js, Leaflet,
 *   dst) - dibiarkan lewat langsung ke network seperti biasa.
 *
 * Push notification (event 'push' & 'notificationclick') ditambahkan di
 * bawah - lihat komentar masing-masing.
 */

// PENTING: naikkan angka versi ini (mis. jadi 'v2') tiap kali index.html/
// css/js diubah & di-deploy ulang - supaya HP karyawan otomatis ambil versi
// baru, bukan kepakai cache lama terus-menerus.
const CACHE_NAME = 'taa-portal-v8';

// File shell inti yang di-precache saat install, supaya app langsung bisa
// dibuka (walau offline) begitu pernah dibuka online minimal 1x.
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Cuma tangani GET - biarkan POST (semua panggilan API) & method lain
    // lewat langsung ke network tanpa campur tangan service worker sama sekali.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Cuma cache asset SATU ORIGIN dengan app ini (HTML/CSS/JS/gambar lokal).
    // Request ke domain lain (Apps Script, CDN, dll) dibiarkan apa adanya -
    // tidak di-intercept sama sekali, supaya selalu fresh dari network.
    if (url.origin !== self.location.origin) return;

    // Strategi: stale-while-revalidate - langsung kasih versi cache (kalau
    // ada) biar cepat & tetap jalan saat offline, TAPI di background selalu
    // ambil versi terbaru dari network untuk update cache-nya. Jadi tidak
    // pernah nyangkut permanen di versi lama selama masih online.
    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req, { cache: 'no-store' })
                .then((res) => {
                    if (res && res.status === 200) {
                        const resClone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    }
                    return res;
                })
                .catch(() => cached); // offline & tidak ada di cache -> biarkan gagal wajar

            return cached || networkFetch;
        })
    );
});

/**
 * Notifikasi masuk saat app TERTUTUP/di-background (kalau app sedang
 * dibuka/foreground, ditangani langsung di push-notifications.js lewat
 * messaging.onMessage(), BUKAN lewat sini - browser tidak mengirim event
 * 'push' ke service worker untuk tab yang sedang aktif memegang koneksi
 * messaging).
 *
 * Payload FCM webpush datang sebagai JSON biasa (bukan perlu SDK Firebase
 * di sini) - bentuknya { notification: { title, body }, data: {...} }
 * sesuai yang dikirim backend (lihat Operatorschdule.gs/PushNotification.gs
 * _sendFcmPushToToken()).
 */
self.addEventListener('push', (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) { /* biarkan kosong */ }

    const notif = payload.notification || {};
    const title = notif.title || 'Portal Karyawan TAA';
    const options = {
        body: notif.body || '',
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/icon-192.png',
        data: payload.data || {},
        tag: 'taa-reminder' // notifikasi baru menimpa yang lama, tidak numpuk di tray
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Tap notifikasi -> fokus ke tab yang sudah terbuka kalau ada, atau buka
// tab baru ke halaman utama app kalau belum ada tab yang terbuka sama sekali.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});
