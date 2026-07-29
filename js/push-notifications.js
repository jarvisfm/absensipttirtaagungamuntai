/**
 * Portal Karyawan - Push Notification (Firebase Cloud Messaging)
 *
 * PENTING: firebaseConfig & VAPID_KEY di bawah ini WAJIB diisi dari Firebase
 * Console Anda sendiri (lihat panduan setup terpisah) - tanpa itu modul ini
 * otomatis nonaktif (tidak error, cuma diam saja / degradasi sopan).
 */
const firebaseConfig = {
    apiKey: "ISI_DARI_FIREBASE_CONSOLE",
    authDomain: "ISI_DARI_FIREBASE_CONSOLE",
    projectId: "ISI_DARI_FIREBASE_CONSOLE",
    storageBucket: "ISI_DARI_FIREBASE_CONSOLE",
    messagingSenderId: "ISI_DARI_FIREBASE_CONSOLE",
    appId: "ISI_DARI_FIREBASE_CONSOLE"
};
const VAPID_KEY = "ISI_DARI_FIREBASE_CONSOLE";

const pushNotif = {
    messaging: null,
    _configured: false,

    async init() {
        // Degradasi sopan: kalau config belum diisi, browser tidak
        // mendukung, atau bukan konteks aman (HTTPS) - diam saja, jangan
        // ganggu jalannya aplikasi.
        this._configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'ISI_DARI_FIREBASE_CONSOLE';
        if (!this._configured) return;
        if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
        if (typeof firebase === 'undefined') return;

        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            this.messaging = firebase.messaging();

            // Pesan masuk SAAT aplikasi lagi dibuka (foreground) - Firefox/
            // Chrome tidak otomatis munculkan notifikasi tray untuk kasus
            // ini, jadi kita tampilkan manual + refresh panel lonceng.
            this.messaging.onMessage((payload) => {
                this._showForegroundNotification(payload);
                if (window.notifications && typeof notifications.load === 'function') {
                    notifications.load();
                }
            });
        } catch (e) {
            console.error('Gagal inisialisasi push notification:', e);
        }
    },

    /**
     * Minta izin notifikasi & daftarkan token ke backend. Dipanggil dari
     * tombol eksplisit di halaman Settings/Profil (BUKAN otomatis saat
     * app dibuka) - supaya user yang memutuskan sendiri, bukan dikagetkan
     * popup izin begitu login.
     */
    async requestPermission() {
        if (!this._configured) {
            toast.error('Push notification belum dikonfigurasi Admin.');
            return false;
        }
        if (!this.messaging) {
            toast.error('Push notification tidak didukung di perangkat/browser ini.');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                toast.error('Izin notifikasi ditolak. Aktifkan lewat pengaturan browser kalau berubah pikiran.');
                return false;
            }

            const registration = await navigator.serviceWorker.ready;
            const token = await this.messaging.getToken({
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (!token) {
                toast.error('Gagal mendapatkan token notifikasi.');
                return false;
            }

            const currentUser = auth.getCurrentUser();
            const userId = currentUser?.employeeId || currentUser?.id;
            const device = navigator.userAgent.substring(0, 120);

            const result = await api.savePushToken(userId, token, device);
            if (result.success) {
                toast.success('Notifikasi HP berhasil diaktifkan!');
                storage.set('pushToken', token);
                return true;
            } else {
                toast.error(result.error || 'Gagal menyimpan token notifikasi');
                return false;
            }
        } catch (e) {
            console.error('Gagal aktifkan push notification:', e);
            toast.error('Terjadi kesalahan saat mengaktifkan notifikasi.');
            return false;
        }
    },

    /** Dipanggil saat logout - supaya device yang logout tidak terus dapat push. */
    async unregister() {
        const token = storage.get('pushToken');
        if (token) {
            try { await api.deletePushToken(token); } catch (e) { /* best-effort */ }
            storage.remove('pushToken');
        }
    },

    _showForegroundNotification(payload) {
        const title = payload.notification?.title || 'Notifikasi';
        const body = payload.notification?.body || '';
        if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, {
                    body,
                    icon: 'assets/icons/icon-192.png'
                });
            });
        } else if (window.toast) {
            toast.info(`${title}: ${body}`);
        }
    }
};

window.pushNotif = pushNotif;
