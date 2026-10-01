/**
 * offline-queue.js — Antrean & sinkronisasi Absensi Offline.
 *
 * Alur singkat:
 * 1. js/absensi.js memanggil offlineQueue.enqueueAttendance(payload) saat
 *    absen gagal terkirim karena TIDAK ADA KONEKSI (lihat integrasi di
 *    absensi.js saveAttendance()) - payload disimpan ke IndexedDB lewat
 *    offline-db.js, status 'pending'.
 * 2. Begitu perangkat online lagi (event 'online', Background Sync API,
 *    atau sekadar app dibuka/di-foreground-kan lagi), flushQueue() jalan:
 *    ambil SEMUA record 'pending' terurut FIFO, kirim SATU PER SATU ke
 *    Google Apps Script dengan JEDA (throttle) di antara tiap pengiriman.
 * 3. Begitu 1 record dikonfirmasi sukses oleh server (result.success),
 *    langsung dihapus dari IndexedDB. Kalau gagal karena jaringan, record
 *    itu dikembalikan ke 'pending' untuk dicoba lagi nanti. Kalau memang
 *    ditolak backend dengan alasan sah, ditandai 'failed' (berhenti
 *    diulang otomatis, TAPI TIDAK DIHAPUS - lihat offlineDB.getAllFailed()).
 *
 * KENAPA PERLU JEDA (poin 3 di permintaan): Google Sheets/Apps Script
 * Web App yang jadi backend aplikasi ini py kuota terbatas (sekitar 60
 * request/user/menit, dan ada batas eksekusi paralel per script). Kalau
 * banyak karyawan absen offline lalu HP-nya dapat sinyal BERSAMAAN (mis.
 * WiFi kantor baru nyala pagi hari), tiap HP yang langsung menembakkan
 * semua antreannya sekaligus TANPA jeda bisa membuat backend kebanjiran
 * request di detik yang sama. Makanya di sini SETIAP device:
 * - Mengirim SATU PER SATU (bukan sekaligus/paralel) - lihat flushQueue().
 * - Ada jeda tetap (DELAY_BETWEEN_MS) di antara tiap pengiriman.
 * - Ada jeda ACAK di awal (jitter, MAX_JITTER_MS) sebelum mulai sinkron -
 *   supaya kalaupun PULUHAN HP sama-sama baru online di detik yang sama,
 *   mereka tidak semua mulai menembak persis di detik yang sama juga.
 * Catatan jujur: ini menjaga SATU device supaya tidak boros kuota &
 * menyebar beban ANTAR-device, tapi tetap tidak 100% menjamin nol
 * lonjakan kalau device-nya sangat banyak sekaligus - backend
 * (Database.gs) sudah pakai LockService untuk kunci penulisan, jadi
 * skenario terburuknya adalah sinkron jadi lebih lambat/beberapa kali
 * gagal-lalu-dicoba-lagi, BUKAN data yang tertukar/rusak.
 *
 * Isomorphic (lihat catatan sama di offline-db.js) - dipakai dari halaman
 * utama MAUPUN dari dalam Service Worker (importScripts, lihat sw.js)
 * supaya Background Sync tetap bisa jalan walau app sedang tertutup.
 */

// Kirim 1 record ke Google Apps Script - fungsi berdiri sendiri (BUKAN
// bergantung ke api.js) supaya file ini tidak perlu importScripts('api.js')
// segala macam di dalam Service Worker (api.js banyak berisi hal yang
// cuma masuk akal di konteks halaman biasa). `record.apiBaseUrl` disimpan
// per-record SAAT enqueue (lihat enqueueAttendance() di bawah) - bukan
// dibaca dari konstanta terpisah - supaya kode ini tetap jalan normal
// walau dipanggil dari Service Worker yang tidak memuat js/api.js sama
// sekali.
function _offlineQueueSendToServer(record) {
    const {
        apiBaseUrl, localId, status, createdAt, attempts, lastError,
        ...cleanPayload
    } = record;
    return fetch(apiBaseUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'saveAttendance', ...cleanPayload })
    }).then((response) => response.text()).then((text) => JSON.parse(text));
    // Sengaja TIDAK menangkap error JSON.parse/fetch di sini - biarkan
    // lempar ke pemanggil (_sendOne di bawah), supaya dianggap error
    // transient (jaringan) dan di-retry, bukan diam-diam dianggap gagal.
}

const offlineQueue = {
    DELAY_BETWEEN_MS: 2000,  // jeda WAJIB antar-pengiriman per device -> maks ~30 request/menit, aman di bawah kuota ~60/menit dengan sisa ruang utk request lain (getServerTime, dsb)
    MAX_JITTER_MS: 4000,     // jeda ACAK sebelum MULAI sinkron - sebar beban kalau banyak HP online bersamaan
    MAX_ATTEMPTS: 5,         // batas percobaan ulang utk error transient (jaringan/response tidak valid) sebelum ditandai 'failed' permanen

    _isSyncing: false, // mutex sederhana - cegah 2 pemicu (mis. event 'online' & interval berkala) jalan berbarengan dan saling tabrak

    // Dipanggil dari js/absensi.js saat absen gagal terkirim karena tidak
    // ada koneksi. `payload` = data absen APA ADANYA (sama seperti yang
    // biasa dikirim ke api.saveAttendance()).
    async enqueueAttendance(payload) {
        const record = {
            ...payload,
            apiBaseUrl: (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) ? API_BASE_URL : payload.apiBaseUrl
        };
        const localId = await offlineDB.enqueue(record);
        this._notifyChange();
        this._registerBackgroundSync();
        // Kalau ternyata sudah online lagi SAAT INI JUGA (mis. status
        // offline tadi cuma sekejap), langsung coba proses - tidak perlu
        // menunggu event 'online' yang belum tentu terpicu tepat waktu.
        if (typeof navigator === 'undefined' || navigator.onLine !== false) this.flushQueue();
        return localId;
    },

    // Proses SELURUH antrean yang masih 'pending', satu per satu, dengan
    // jeda di antaranya (lihat penjelasan throttle di komentar file di
    // atas). `opts.noJitter` dipakai tombol "Sinkron Sekarang" manual di
    // UI (lihat _wireManualSyncButton() di bawah) supaya tidak perlu
    // menunggu jitter acak saat memang sengaja diminta user.
    async flushQueue(opts = {}) {
        if (this._isSyncing) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        this._isSyncing = true;
        try {
            if (!opts.noJitter) await this._sleep(Math.random() * this.MAX_JITTER_MS);

            const pending = await offlineDB.getAllPending();
            for (const record of pending) {
                // Putus lagi di tengah jalan -> hentikan loop SEKARANG,
                // jangan paksa lanjut ke record berikutnya (kemungkinan
                // besar juga bakal gagal jaringan lagi, buang-buang waktu).
                if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

                await offlineDB.updateStatus(record.localId, 'syncing');
                const outcome = await this._sendOne(record);
                if (outcome === 'network-error') break; // hentikan seluruh loop kali ini, coba lagi nanti (bukan lanjut ke record berikutnya)

                await this._sleep(this.DELAY_BETWEEN_MS); // THROTTLE - jeda wajib sebelum lanjut ke record berikutnya
            }
        } finally {
            this._isSyncing = false;
            this._notifyChange();
        }
    },

    // Kirim 1 record, balikin salah satu: 'ok' | 'failed' | 'network-error'.
    async _sendOne(record) {
        try {
            const result = await _offlineQueueSendToServer(record);
            if (result && result.success) {
                // [Poin 4 - Manajemen Data] Sukses dikonfirmasi server ->
                // langsung hapus dari IndexedDB supaya tidak menumpuk.
                await offlineDB.remove(record.localId);
                return 'ok';
            }
            // Ditolak backend dengan alasan SAH (bukan soal jaringan) -
            // misal "di luar radius kantor", sesi/userId tidak valid, dst.
            // Mengulang-ulang record ini tidak akan mengubah hasilnya, jadi
            // dihentikan (status 'failed') TAPI TIDAK DIHAPUS - supaya
            // datanya tidak hilang & bisa ditinjau manual kalau perlu
            // (lihat offlineDB.getAllFailed()).
            await offlineDB.updateStatus(record.localId, 'failed', {
                lastError: (result && result.error) || 'Ditolak server tanpa keterangan'
            });
            return 'failed';
        } catch (e) {
            // fetch() melempar (benar-benar tidak ada koneksi/timeout) atau
            // response bukan JSON valid - dianggap TRANSIENT (jaringan),
            // BUKAN penolakan sah. Coba lagi nanti, kecuali sudah melewati
            // batas percobaan (mencegah 1 record bermasalah bikin antrean
            // "macet" selamanya).
            const attempts = (record.attempts || 0) + 1;
            const lastError = String((e && e.message) || e);
            if (attempts >= this.MAX_ATTEMPTS) {
                await offlineDB.updateStatus(record.localId, 'failed', { attempts, lastError });
                return 'failed';
            }
            await offlineDB.updateStatus(record.localId, 'pending', { attempts, lastError });
            return 'network-error';
        }
    },

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },

    // Background Sync API HANYA didukung Chrome/Edge/Android - TIDAK ada
    // di Safari/iOS. Ini murni ENHANCEMENT (supaya sinkron bisa jalan
    // walau app sedang ditutup total, bukan cuma di-background-kan) -
    // jalur UTAMA tetap event 'online' + interval berkala di bawah, yang
    // jalan di SEMUA browser selama app-nya masih terbuka/di-foreground.
    _registerBackgroundSync() {
        try {
            if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof window !== 'undefined' && 'SyncManager' in window) {
                navigator.serviceWorker.ready
                    .then((reg) => reg.sync.register('sync-absensi'))
                    .catch(() => { /* browser tidak dukung/registrasi ditolak - abaikan, fallback online/interval tetap jalan */ });
            }
        } catch (e) { /* abaikan - lihat catatan di atas */ }
    },

    async getPendingCount() {
        return offlineDB.countPending();
    },

    // Kabari UI (badge "N absen menunggu sinkron" di halaman Absensi -
    // lihat index.html #offline-queue-banner) setiap kali antrean berubah.
    // Sengaja lewat CustomEvent (bukan pemanggilan langsung ke absensi.js)
    // supaya file ini tidak perlu tahu apa-apa soal absensi.js - dan tetap
    // aman dipanggil dari konteks Service Worker (tidak ada `window` di
    // sana, jadi otomatis di-skip, lihat pengecekan di bawah).
    _notifyChange() {
        if (typeof window === 'undefined' || !window.dispatchEvent) return;
        this.getPendingCount().then((count) => {
            window.dispatchEvent(new CustomEvent('offline-queue-changed', { detail: { count } }));
        });
    },

    _renderBadge(count) {
        if (typeof document === 'undefined') return;
        const banner = document.getElementById('offline-queue-banner');
        const countEl = document.getElementById('offline-queue-count');
        if (!banner) return;
        if (count > 0) {
            banner.style.display = 'flex';
            if (countEl) countEl.textContent = count;
        } else {
            banner.style.display = 'none';
        }
    }
};

// ========== WIRING (halaman utama saja - otomatis di-skip di dalam
// Service Worker karena tidak ada `window`/`document` di sana) ==========
if (typeof window !== 'undefined') {
    // Jalur sinkron UTAMA - jalan di SEMUA browser (termasuk iOS Safari
    // yang tidak dukung Background Sync API sama sekali).
    window.addEventListener('online', () => offlineQueue.flushQueue());

    // Jaring pengaman: sebagian browser/koneksi flaky kadang tidak
    // memicu event 'online' dengan tepat. flushQueue() sendiri langsung
    // keluar kalau memang masih offline (lihat pengecekan di dalamnya),
    // jadi timer ini tidak boros walau app dibiarkan terbuka lama.
    setInterval(() => offlineQueue.flushQueue(), 60000);

    // Tangkap juga kasus "sempat offline & absen, app ditutup, dibuka
    // lagi setelah HP dapat sinyal" - baik saat halaman pertama dimuat
    // maupun saat tab kembali aktif dari background.
    window.addEventListener('DOMContentLoaded', () => {
        offlineQueue.getPendingCount().then((c) => offlineQueue._renderBadge(c));
        offlineQueue.flushQueue();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') offlineQueue.flushQueue();
    });

    window.addEventListener('offline-queue-changed', (e) => offlineQueue._renderBadge(e.detail.count));

    // Tombol "Sinkron Sekarang" manual di banner (lihat index.html
    // #offline-queue-sync-btn) - pakai noJitter supaya langsung jalan
    // begitu ditekan, tidak ikut menunggu delay acak.
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('offline-queue-sync-btn');
        if (btn) btn.addEventListener('click', () => offlineQueue.flushQueue({ noJitter: true }));
    });
}
