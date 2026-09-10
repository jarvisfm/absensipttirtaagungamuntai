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
 *
 * [TAMBAHAN - Absensi Offline] Event 'sync' (Background Sync API) di paling
 * bawah file ini - dipakai supaya antrean absen offline (lihat
 * js/offline-db.js & js/offline-queue.js) tetap bisa disinkronkan ke
 * server walau app/tab-nya SEDANG TERTUTUP saat sinyal kembali ada.
 * HANYA didukung Chrome/Edge/Android (tidak ada di Safari/iOS) - jalur
 * sinkron utama (event 'online' + interval berkala) tetap ada di
 * offline-queue.js sendiri untuk browser yang tidak dukung ini.
 */

// PENTING: naikkan angka versi ini (mis. jadi 'v2') tiap kali index.html/
// css/js diubah & di-deploy ulang - supaya HP karyawan otomatis ambil versi
// baru, bukan kepakai cache lama terus-menerus.
const CACHE_NAME = 'taa-portal-v16';

// [TAMBAHAN - Absensi Offline] importScripts() menjalankan kedua file ini
// SATU KALI di scope Service Worker ini, di-load SEBELUM baris-baris di
// bawahnya - jadi `offlineDB` & `offlineQueue` langsung bisa dipakai
// sebagai variabel biasa (lihat event 'sync' di paling bawah file ini).
// Kedua file ini sengaja ditulis isomorphic (tanpa bergantung ke
// `window`/`document`) supaya aman dipanggil dari sini - lihat catatan di
// masing-masing file.
importScripts('./js/offline-db.js', './js/offline-queue.js');

// File shell inti yang di-precache saat install, supaya app langsung bisa
// dibuka (walau offline) begitu pernah dibuka online minimal 1x.
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json'
];

// [TAMBAHAN - Absensi Offline] Model face-api.js (dipakai verifikasi wajah
// saat absen - lihat js/face-recognition.js) dimuat dari CDN EKSTERNAL ini,
// dan sebelumnya SAMA SEKALI TIDAK di-cache (kebijakan lama: semua request
// cross-origin dibiarkan lewat apa adanya - lihat komentar di listener
// 'fetch' di bawah). Kalau perangkat offline dan modelnya belum kebetulan
// ter-cache sendiri oleh browser dari kunjungan online sebelumnya, deteksi
// wajah bisa gagal dimuat total - kamera menyala tapi kotak deteksi wajah
// tidak pernah muncul, foto tidak pernah otomatis terambil.
//
// URL di bawah SUDAH DIKUNCI ke versi tertentu (@0.22.2) - isi file untuk
// URL yang sama TIDAK PERNAH BERUBAH, jadi aman di-cache SELAMANYA begitu
// berhasil diunduh sekali (cache-first, beda dari stale-while-revalidate
// yang dipakai utk shell app sendiri di bawah, yang memang bisa berubah
// tiap deploy). Kalau nanti versi face-api.js di face-recognition.js
// diganti (mis. ke @0.23.0), naikkan juga FACE_MODELS_CACHE ini (jadi
// 'v2') supaya cache model versi lama otomatis dibersihkan saat itu -
// SAMA seperti pola menaikkan CACHE_NAME di atas tiap deploy shell baru.
const FACE_MODELS_CACHE = 'taa-portal-face-models-v1';
const FACE_MODELS_ORIGIN = 'https://cdn.jsdelivr.net';
const FACE_MODELS_PATH_PREFIX = '/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

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
                // [TAMBAHAN - Absensi Offline] FACE_MODELS_CACHE SENGAJA
                // dikecualikan dari pembersihan cache lama ini - beda dari
                // shell app (CACHE_NAME) yang memang harus diganti tiap
                // deploy, model face-api.js yang sudah diunduh tidak perlu
                // diunduh ulang cuma karena ada deploy baru (lihat catatan
                // versi-nya di atas).
                keys.filter((key) => key !== CACHE_NAME && key !== FACE_MODELS_CACHE).map((key) => caches.delete(key))
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

    // [TAMBAHAN - Absensi Offline] Model face-api.js - lihat catatan
    // FACE_MODELS_CACHE di atas. Ditangani TERPISAH & LEBIH DULU dari
    // pengecekan "cuma same-origin" di bawah, karena ini justru KEBALIKAN
    // kebijakannya (cross-origin, tapi SENGAJA di-cache karena isinya
    // dikunci per-versi & tidak pernah berubah).
    if (url.origin === FACE_MODELS_ORIGIN && url.pathname.startsWith(FACE_MODELS_PATH_PREFIX)) {
        event.respondWith(
            caches.open(FACE_MODELS_CACHE).then((cache) =>
                cache.match(req).then((cached) => {
                    // Sudah pernah diunduh -> langsung pakai dari cache,
                    // TIDAK PERLU network sama sekali (termasuk saat
                    // offline) - inilah yang membuat verifikasi wajah bisa
                    // tetap jalan walau tidak ada sinyal.
                    if (cached) return cached;
                    return fetch(req).then((res) => {
                        if (res && res.status === 200) cache.put(req, res.clone());
                        return res;
                    });
                })
            )
        );
        return;
    }

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

// [TAMBAHAN - Absensi Offline] Dipicu browser (Chrome/Edge/Android saja)
// begitu perangkat kembali online, walau app/tab-nya sedang tertutup -
// didaftarkan dari halaman utama lewat offlineQueue._registerBackgroundSync()
// (js/offline-queue.js) setiap kali ada absen baru masuk antrean offline.
// event.waitUntil() memastikan browser TIDAK mematikan Service Worker ini
// sebelum seluruh antrean (dengan jeda/throttle-nya - lihat flushQueue()
// di offline-queue.js) selesai diproses.
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-absensi') {
        event.waitUntil(offlineQueue.flushQueue());
    }
});
