/**
 * offline-db.js — Wrapper IndexedDB untuk antrean Absensi Offline.
 *
 * TUJUAN: kalau perangkat sedang offline saat karyawan menekan tombol
 * absen, data (userId, jam, foto verifikasi wajah, lokasi, dst) DISIMPAN
 * DULU di memori perangkat (IndexedDB) alih-alih dianggap gagal - lalu
 * disinkronkan otomatis ke server begitu online lagi (lihat
 * js/offline-queue.js untuk logika antrean & pengirimannya).
 *
 * Kenapa IndexedDB, bukan localStorage:
 * - localStorage cuma muat ~5-10MB & SELALU synchronous (bisa nge-freeze
 *   UI kalau datanya besar) - sedangkan payload absen di sini menyertakan
 *   foto verifikasi wajah base64 yang lumayan besar per rekaman.
 * - IndexedDB async, kapasitasnya jauh lebih besar (ratusan MB, tergantung
 *   sisa storage HP), dan tetap ada meski app di-refresh/ditutup - pas
 *   untuk antrean yang mungkin baru tersinkron beberapa jam kemudian.
 *
 * PENTING - file ini SENGAJA ditulis tanpa bergantung ke `window`/`document`
 * apapun (isomorphic), supaya bisa dipakai baik dari:
 * 1. Halaman utama - lewat <script src="js/offline-db.js"> biasa di
 *    index.html (lihat urutan load-nya, harus SEBELUM offline-queue.js &
 *    absensi.js).
 * 2. Service Worker - lewat importScripts('./js/offline-db.js') di sw.js,
 *    supaya proses sinkronisasi via Background Sync API tetap bisa jalan
 *    walau tab/app sedang tertutup (lihat sw.js).
 * `indexedDB` sendiri adalah API global yang tersedia di KEDUA konteks
 * tersebut, jadi tidak perlu kode berbeda untuk masing-masing.
 */
const offlineDB = {
    DB_NAME: 'taa-absensi-offline',
    DB_VERSION: 1,
    STORE_NAME: 'pending_attendance',

    _dbPromise: null,

    // Buka (atau buat, kalau belum ada) database-nya - hasil Promise-nya
    // di-cache di this._dbPromise supaya sepanjang hidup halaman/Service
    // Worker ini cuma ada 1 koneksi yang dipakai bersama, bukan buka-tutup
    // koneksi baru tiap kali salah satu fungsi di bawah dipanggil.
    _open() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(offlineDB.STORE_NAME)) {
                    const store = db.createObjectStore(offlineDB.STORE_NAME, {
                        keyPath: 'localId',
                        autoIncrement: true
                    });
                    // Index 'createdAt' dipakai buat baca antrean terurut
                    // FIFO (absen paling lama duluan yang disinkron) - lihat
                    // getAllPending() di bawah & _sendOne() di offline-queue.js.
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this._dbPromise;
    },

    // Tambah 1 record absen baru ke antrean - status awal SELALU 'pending'.
    // `record` adalah payload absen APA ADANYA (field sama persis dengan
    // yang biasanya dikirim ke api.saveAttendance() - userId, date,
    // clockIn/breakStart/breakEnd/clockOut, verificationPhoto,
    // verificationLocation, dst) ditambah `apiBaseUrl` (lihat catatan di
    // offline-queue.js kenapa URL tujuan disertakan per-record, bukan
    // konstanta terpisah).
    async enqueue(record) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const toSave = {
                ...record,
                status: 'pending',     // pending -> syncing -> (dihapus kalau sukses) | failed (lihat offline-queue.js)
                createdAt: Date.now(), // dasar urutan FIFO & buat lihat sudah berapa lama menunggu
                attempts: 0,           // jumlah percobaan gagal transient (jaringan) - dasar backoff di offline-queue.js
                lastError: null
            };
            const req = store.add(toSave);
            req.onsuccess = () => resolve(req.result); // localId hasil auto-increment
            req.onerror = () => reject(req.error);
        });
    },

    // Ambil SEMUA record yang MASIH PERLU disinkron (belum 'failed'),
    // terurut FIFO (createdAt menaik) - 'failed' sengaja tidak diikutkan
    // supaya 1 record yang sudah pasti ditolak backend (bukan soal
    // jaringan) tidak diulang-ulang terus dan menghalangi antrean di
    // belakangnya. Lihat getAllFailed() di bawah untuk lihat yang gagal.
    async getAllPending() {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const index = store.index('createdAt');
            const req = index.getAll();
            req.onsuccess = () => resolve((req.result || []).filter(r => r.status !== 'failed'));
            req.onerror = () => reject(req.error);
        });
    },

    // Record yang SUDAH DIPASTIKAN ditolak backend dengan alasan sah (mis.
    // "di luar radius kantor") atau gagal terus lebih dari batas percobaan
    // (lihat MAX_ATTEMPTS di offline-queue.js) - TIDAK dihapus otomatis
    // (supaya datanya tidak hilang begitu saja), tapi juga tidak diulang
    // otomatis lagi. Berguna untuk pengecekan manual lewat console
    // (`offlineDB.getAllFailed()`) kalau ada laporan "absen saya hilang".
    async getAllFailed() {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.index('status').getAll('failed');
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    // Hitung berapa banyak yang masih menunggu (dipakai badge UI - lihat
    // offline-queue.js _renderBadge()).
    async countPending() {
        const all = await this.getAllPending();
        return all.length;
    },

    async updateStatus(localId, status, extra = {}) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const getReq = store.get(localId);
            getReq.onsuccess = () => {
                const rec = getReq.result;
                if (!rec) { resolve(null); return; }
                Object.assign(rec, { status }, extra);
                const putReq = store.put(rec);
                putReq.onsuccess = () => resolve(rec);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    },

    // Hapus record dari IndexedDB - HANYA dipanggil setelah sinkronisasi
    // benar-benar dikonfirmasi sukses oleh server (result.success === true),
    // BUKAN cuma karena sudah "dicoba kirim" - supaya tidak ada data yang
    // hilang kalau ternyata request-nya gagal di tengah jalan.
    async remove(localId) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete(localId);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
};
