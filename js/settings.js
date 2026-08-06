/**
 * Portal Karyawan - Settings
 * Admin settings functionality
 */

const settings = {
    officeLocations: [],

    async init() {
        // Check if admin
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }

        await this.loadSettings();
        this.initForms();
    },

    async loadSettings() {
        try {
            const settingsResult = await api.getSettings();

            const allSettings = settingsResult.data || {};

            // System settings
            if (allSettings.late_tolerance !== undefined) {
                const el = document.getElementById('setting-late-tolerance');
                if (el) el.value = allSettings.late_tolerance;
            }
            // PENTING: Google Sheets otomatis mengubah teks "true"/"false"
            // yang disimpan jadi tipe boolean asli, dan dibaca balik sebagai
            // "TRUE"/"FALSE" (huruf besar semua) - bukan "true" huruf kecil
            // seperti saat pertama disimpan. Makanya dicek tanpa peduli
            // besar/kecil huruf, supaya checkbox-nya tidak salah tampil
            // "off" padahal sebenarnya aktif di database.
            if (allSettings.face_recognition !== undefined) {
                const el = document.getElementById('setting-face-recognition');
                if (el) el.checked = String(allSettings.face_recognition).toLowerCase() === 'true' || allSettings.face_recognition === true;
            }
            if (allSettings.location_tracking !== undefined) {
                const el = document.getElementById('setting-location-tracking');
                if (el) el.checked = String(allSettings.location_tracking).toLowerCase() === 'true' || allSettings.location_tracking === true;
            }
            if (allSettings.location_radius !== undefined) {
                const el = document.getElementById('setting-location-radius');
                if (el) el.value = allSettings.location_radius;
            }
            // Koordinat Kantor - bisa lebih dari 1 lokasi (Kantor Pusat,
            // Unit SPAM, dsb), disimpan sebagai JSON array di key
            // "office_locations". Fallback ke field lama office_lat/
            // office_lng (1 lokasi) kalau belum pernah diisi versi baru ini.
            this.officeLocations = [];
            if (allSettings.office_locations) {
                try {
                    const parsed = JSON.parse(allSettings.office_locations);
                    if (Array.isArray(parsed)) this.officeLocations = parsed;
                } catch (e) { /* JSON rusak, biarkan kosong */ }
            }
            if (this.officeLocations.length === 0 && allSettings.office_lat && allSettings.office_lng) {
                this.officeLocations = [{ nama: 'Kantor', lat: allSettings.office_lat, lng: allSettings.office_lng }];
            }
            this.renderOfficeLocations();
        } catch (error) {
            console.error('Error loading settings:', error);
            // PENTING: sebelumnya kalau load gagal, form tetap menampilkan
            // nilai default HTML (radius 100, koordinat kosong) TANPA ada
            // tanda apa pun ke admin - kelihatan seperti data asli padahal
            // sebenarnya gagal dimuat dari database. Sekarang admin diberi
            // tahu supaya tidak salah kira nilai yang tampil = nilai
            // tersimpan, dan tahu harus refresh/coba lagi.
            toast.error('Gagal memuat pengaturan dari server. Nilai yang tampil BUKAN data tersimpan - refresh halaman lalu coba lagi.');
        }
    },

    initForms() {
        // Save system settings
        const saveSystemBtn = document.getElementById('btn-save-system');
        if (saveSystemBtn) {
            saveSystemBtn.addEventListener('click', () => this.saveSystemSettings());
        }
    },

    async saveSystemSettings() {
        const lateTolerance    = document.getElementById('setting-late-tolerance');
        const faceRecognition  = document.getElementById('setting-face-recognition');
        const locationTracking = document.getElementById('setting-location-tracking');
        const locationRadius   = document.getElementById('setting-location-radius');

        this._syncOfficeLocationsFromDOM();

        // Validasi tiap lokasi kantor yang diisi. Baris yang benar-benar
        // kosong total (belum diisi apa-apa) dilewati saja, bukan dianggap
        // error - supaya admin yang menambah baris kosong lalu berubah
        // pikiran tidak perlu mengisi/menghapusnya dulu sebelum simpan.
        const validLocations = [];
        for (const loc of this.officeLocations) {
            const namaKosong = !loc.nama || !String(loc.nama).trim();
            const latKosong = loc.lat === '' || loc.lat === undefined || loc.lat === null;
            const lngKosong = loc.lng === '' || loc.lng === undefined || loc.lng === null;
            if (namaKosong && latKosong && lngKosong) continue;

            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lng);
            if (namaKosong || isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                toast.error(`Lokasi "${loc.nama || '(tanpa nama)'}" tidak valid. Nama wajib diisi, Latitude -90 s/d 90, Longitude -180 s/d 180.`);
                return;
            }
            validLocations.push({ nama: String(loc.nama).trim(), lat, lng });
        }

        try {
            await api.saveSettingsBulk({
                late_tolerance:    lateTolerance    ? lateTolerance.value              : '15',
                face_recognition:  faceRecognition  ? String(faceRecognition.checked)  : 'true',
                location_tracking: locationTracking ? String(locationTracking.checked) : 'true',
                location_radius:   locationRadius   ? locationRadius.value             : '100',
                office_locations:  JSON.stringify(validLocations),
            });
            toast.success('Pengaturan sistem berhasil disimpan!');
        } catch (error) {
            console.error('Error saving system settings:', error);
            toast.error('Gagal menyimpan pengaturan sistem');
        }
    },

    // ── Kelola beberapa lokasi kantor (Kantor Pusat, Unit SPAM, dst) ──
    renderOfficeLocations() {
        const container = document.getElementById('office-locations-list');
        if (!container) return;

        if (this.officeLocations.length === 0) {
            this.officeLocations.push({ nama: 'Kantor Pusat', lat: '', lng: '' });
        }

        container.innerHTML = this.officeLocations.map((loc, idx) => `
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;border:1px solid var(--border-color);border-radius:8px;padding:10px;">
                <div style="flex:1;min-width:130px;">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">Nama Lokasi</label>
                    <input type="text" class="office-loc-nama" data-idx="${idx}" value="${loc.nama || ''}" placeholder="Kantor Pusat / Unit SPAM A" style="width:100%;">
                </div>
                <div style="flex:1;min-width:120px;">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">Latitude</label>
                    <input type="text" class="office-loc-lat" data-idx="${idx}" value="${loc.lat || ''}" placeholder="-2.417000" style="width:100%;">
                </div>
                <div style="flex:1;min-width:120px;">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">Longitude</label>
                    <input type="text" class="office-loc-lng" data-idx="${idx}" value="${loc.lng || ''}" placeholder="115.216000" style="width:100%;">
                </div>
                <button type="button" onclick="settings.detectLocationForRow(${idx})" style="background:var(--color-primary);color:#fff;border:none;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">
                    <i class="fas fa-crosshairs"></i> Deteksi
                </button>
                ${this.officeLocations.length > 1 ? `
                <button type="button" onclick="settings.removeOfficeLocationRow(${idx})" style="background:#EF4444;color:#fff;border:none;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:0.8rem;">
                    <i class="fas fa-trash"></i>
                </button>` : ''}
            </div>
        `).join('');
    },

    // Baca ulang nilai dari input yang sedang tampil ke this.officeLocations,
    // supaya perubahan yang belum disimpan tidak hilang saat baris
    // ditambah/dihapus/dideteksi.
    _syncOfficeLocationsFromDOM() {
        document.querySelectorAll('.office-loc-nama').forEach(el => {
            const idx = parseInt(el.dataset.idx, 10);
            if (this.officeLocations[idx]) this.officeLocations[idx].nama = el.value;
        });
        document.querySelectorAll('.office-loc-lat').forEach(el => {
            const idx = parseInt(el.dataset.idx, 10);
            if (this.officeLocations[idx]) this.officeLocations[idx].lat = el.value;
        });
        document.querySelectorAll('.office-loc-lng').forEach(el => {
            const idx = parseInt(el.dataset.idx, 10);
            if (this.officeLocations[idx]) this.officeLocations[idx].lng = el.value;
        });
    },

    addOfficeLocationRow() {
        this._syncOfficeLocationsFromDOM();
        this.officeLocations.push({ nama: '', lat: '', lng: '' });
        this.renderOfficeLocations();
    },

    removeOfficeLocationRow(idx) {
        this._syncOfficeLocationsFromDOM();
        this.officeLocations.splice(idx, 1);
        this.renderOfficeLocations();
    },

    // Deteksi lokasi saat ini sebagai koordinat untuk 1 baris tertentu
    detectLocationForRow(idx) {
        if (!navigator.geolocation) {
            toast.error('Browser tidak mendukung geolokasi');
            return;
        }
        this._syncOfficeLocationsFromDOM();
        toast.info('Mendeteksi lokasi...');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (!this.officeLocations[idx]) return;
                this.officeLocations[idx].lat = pos.coords.latitude.toFixed(6);
                this.officeLocations[idx].lng = pos.coords.longitude.toFixed(6);
                this.renderOfficeLocations();
                toast.success('Lokasi berhasil dideteksi!');
            },
            () => { toast.error('Gagal mendeteksi lokasi. Pastikan izin lokasi diaktifkan.'); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
};

// Global init function
window.initSettings = () => {
    settings.init();
};

// Expose settings object
window.settings = settings;
