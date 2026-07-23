/**
 * Portal Karyawan - Face Recognition & Location
 * Face detection and geolocation functionality
 */

const faceRecognition = {
    video: null,
    canvas: null,
    stream: null,
    currentAction: null,
    photoCaptured: false,
    locationVerified: false,
    position: null,
    // Deteksi wajah nyata (geometri/landmark) pakai face-api.js -
    // menggantikan simulasi "scanning" 2 detik yang lama, yang selalu
    // menganggap wajah terverifikasi apapun isi kameranya.
    modelsLoaded: false,
    faceDetected: false,
    _detectLoopId: null,
    _leafletMap: null,

    init(action) {
        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.faceDetected = false;
        this.position = null;
        this._destroyRealMap();

        const retryBtn = document.getElementById('btn-retry-location');
        if (retryBtn) retryBtn.style.display = 'none';

        // PENTING: kembalikan #camera-preview ke markup <video> semula.
        // Sebelumnya, capturePhoto() mengganti isi #camera-preview jadi
        // <img> hasil foto - kalau tidak dikembalikan dulu di sini, saat
        // pindah ke aksi absen berikutnya (mis. clock-in -> istirahat),
        // initCamera() mencari elemen #camera-video yang sudah tidak ada
        // lagi di DOM (sudah diganti <img>), gagal diam-diam, dan foto
        // lama dari aksi sebelumnya tetap kelihatan.
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.innerHTML = `
                <video id="camera-video" autoplay playsinline muted></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
                <div class="face-overlay" id="face-overlay">
                    <div class="face-frame">
                        <div class="face-corner top-left"></div>
                        <div class="face-corner top-right"></div>
                        <div class="face-corner bottom-left"></div>
                        <div class="face-corner bottom-right"></div>
                    </div>
                    <div class="face-guide">
                        <i class="fas fa-user"></i>
                        <p>Posisikan wajah di dalam frame</p>
                    </div>
                </div>
                <div class="scanning-line" id="scanning-line" style="display: none;"></div>
            `;
        }
        const captureBtnReset = document.getElementById('btn-capture');
        const retakeBtnReset = document.getElementById('btn-retake');
        if (captureBtnReset) {
            captureBtnReset.style.display = 'flex';
            captureBtnReset.disabled = true;
        }
        if (retakeBtnReset) retakeBtnReset.style.display = 'none';

        // Update UI based on action
        this.updateActionTitle(action);

        // Initialize camera
        this.initCamera();

        // Initialize location
        this.initLocation();

        // Bind buttons
        this.bindButtons();
    },

    updateActionTitle(action) {
        const titles = {
            'clock-in': { title: 'Clock In - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk Clock In' },
            'clock-out': { title: 'Clock Out - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk Clock Out' },
            'break': { title: 'Istirahat - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk mulai istirahat' },
            'after-break': { title: 'Selesai Istirahat - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk kembali bekerja' },
            'overtime': { title: 'Lembur - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk mulai lembur' },
            'izin': { title: 'Pengajuan Izin - Verifikasi Wajah', subtitle: 'Verifikasi wajah untuk pengajuan izin' }
        };

        const titleEl = document.getElementById('face-rec-title');
        const subtitleEl = document.getElementById('face-rec-subtitle');

        if (titles[action]) {
            if (titleEl) titleEl.textContent = titles[action].title;
            if (subtitleEl) subtitleEl.textContent = titles[action].subtitle;
        }
    },

    async initCamera() {
        this.video = document.getElementById('camera-video');
        this.canvas = document.getElementById('camera-canvas');

        if (!this.video) return;

        try {
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            this.video.srcObject = this.stream;

            // Dulu: tombol capture langsung di-enable begitu kamera nyala,
            // tanpa peduli ada wajah atau tidak. Sekarang: tunggu model
            // deteksi wajah siap, lalu tombol capture cuma aktif selama
            // wajah BENAR-BENAR terdeteksi di frame (lihat _startFaceDetectionLoop).
            this.video.onloadedmetadata = async () => {
                const ready = await this._loadFaceModels();
                if (!ready) {
                    // Model gagal dimuat (mis. tidak ada akses ke CDN) -
                    // supaya fitur absen tidak terkunci total, fallback ke
                    // perilaku lama (capture selalu boleh).
                    this.faceDetected = true;
                    const captureBtn = document.getElementById('btn-capture');
                    if (captureBtn) captureBtn.disabled = false;
                    return;
                }
                this._startFaceDetectionLoop();
            };

        } catch (error) {
            console.error('Camera error:', error);
            toast.error('Tidak dapat mengakses kamera. Pastikan Anda memberikan izin kamera.');
        }
    },

    /**
     * Muat model TinyFaceDetector (face-api.js) sekali saja - dipakai untuk
     * mendeteksi APAKAH ada wajah di frame kamera (bukan mengenali identitas
     * siapa, cukup memastikan ada wajah nyata di depan kamera).
     */
    async _loadFaceModels() {
        if (this.modelsLoaded) return true;
        if (typeof faceapi === 'undefined') {
            console.error('face-api.js tidak termuat.');
            return false;
        }
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            this.modelsLoaded = true;
            return true;
        } catch (e) {
            console.error('Gagal memuat model deteksi wajah:', e);
            return false;
        }
    },

    /**
     * Loop deteksi wajah live tiap ~400ms selama kamera aktif. Tombol
     * capture cuma aktif selama this.faceDetected true, dan overlay
     * (frame + teks panduan) berubah warna/teks sesuai status supaya
     * karyawan tahu harus memposisikan wajahnya.
     */
    _startFaceDetectionLoop() {
        this._stopFaceDetectionLoop();

        this._detectLoopId = setInterval(async () => {
            if (!this.video || this.video.readyState < 2 || this.photoCaptured) return;

            let detected = false;
            try {
                const result = await faceapi.detectSingleFace(
                    this.video,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
                );
                detected = !!result;
            } catch (e) {
                detected = false;
            }

            this.faceDetected = detected;
            this._updateFaceOverlay(detected);

            const captureBtn = document.getElementById('btn-capture');
            if (captureBtn && !this.photoCaptured) captureBtn.disabled = !detected;
        }, 400);
    },

    _stopFaceDetectionLoop() {
        if (this._detectLoopId) {
            clearInterval(this._detectLoopId);
            this._detectLoopId = null;
        }
    },

    // Ubah tampilan frame & teks panduan sesuai status deteksi wajah
    _updateFaceOverlay(detected) {
        const frame = document.querySelector('#face-overlay .face-frame');
        const guideIcon = document.querySelector('#face-overlay .face-guide i');
        const guideText = document.querySelector('#face-overlay .face-guide p');

        if (frame) frame.classList.toggle('detected', detected);
        if (guideIcon) guideIcon.classList.toggle('detected', detected);
        if (guideText) {
            guideText.textContent = detected
                ? 'Wajah terdeteksi'
                : 'Wajah tidak terlihat - posisikan wajah di dalam frame';
        }
    },

    // Hitung jarak antara 2 koordinat dalam meter (Haversine formula)
    _calcDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // radius bumi dalam meter
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    /**
     * Render peta ASLI (OpenStreetMap via Leaflet) berpusat di koordinat
     * karyawan - menggantikan kotak abu-abu dengan ikon pin statis yang lama.
     * Tidak butuh API key (beda dari Google Maps).
     */
    _renderRealMap(mapEl, lat, lng, accuracy) {
        if (!mapEl || typeof L === 'undefined') {
            console.error('Leaflet tidak termuat, peta tidak bisa ditampilkan.');
            return;
        }

        // Leaflet tidak bisa di-init 2x di container yang sama tanpa
        // di-destroy dulu - bersihkan instance lama & buat div baru yang
        // masih "polos".
        this._destroyRealMap();
        mapEl.innerHTML = '<div id="leaflet-map-el" style="width:100%;height:100%;"></div>';

        const mapContainer = document.getElementById('leaflet-map-el');
        if (!mapContainer) return;

        try {
            this._leafletMap = L.map(mapContainer, { zoomControl: false }).setView([lat, lng], 17);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this._leafletMap);

            L.marker([lat, lng]).addTo(this._leafletMap)
                .bindPopup('Lokasi Anda saat ini')
                .openPopup();

            if (accuracy) {
                L.circle([lat, lng], {
                    radius: accuracy,
                    color: '#F59E0B',
                    fillColor: '#F59E0B',
                    fillOpacity: 0.12,
                    weight: 1
                }).addTo(this._leafletMap);
            }

            // Leaflet kadang salah hitung ukuran kalau container-nya baru
            // dipasang ke DOM (mis. div sebelumnya display:none) - paksa
            // recalculate sesudah render supaya peta tidak terpotong/blank.
            setTimeout(() => { if (this._leafletMap) this._leafletMap.invalidateSize(); }, 200);
        } catch (e) {
            console.error('Gagal render peta:', e);
        }
    },

    _destroyRealMap() {
        if (this._leafletMap) {
            try { this._leafletMap.remove(); } catch (e) {}
            this._leafletMap = null;
        }
    },

    /**
     * Ambil alamat asli dari koordinat GPS (reverse geocoding) pakai
     * Nominatim/OpenStreetMap - gratis, tanpa API key, sama seperti peta
     * yang sudah dipakai di _renderRealMap(). Balikin '' kalau gagal
     * (offline, timeout, dll) supaya pemanggilnya bisa fallback ke teks lain.
     */
    async _reverseGeocode(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const res = await fetch(url, { headers: { 'Accept-Language': 'id' } });
            if (!res.ok) throw new Error('reverse geocode gagal: ' + res.status);
            const data = await res.json();
            return data && data.display_name ? data.display_name : '';
        } catch (e) {
            console.error('Gagal ambil alamat dari koordinat:', e);
            return '';
        }
    },

    initLocation() {
        if (!navigator.geolocation) {
            toast.error('Browser Anda tidak mendukung geolokasi');
            return;
        }

        const statusEl = document.getElementById('location-status');
        const infoEl = document.getElementById('location-info');
        const mapEl = document.getElementById('location-map');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                this.position = position;

                // Karyawan "Pekerja Lapangan" (ditandai Admin) dikecualikan
                // dari validasi radius - dicek dulu di sini supaya mereka
                // tidak melihat pesan "di luar radius" yang membingungkan.
                // Backend TETAP jadi penentu akhir/wajib (lihat
                // Attendance.gs), ini cuma untuk UX di layar.
                try {
                    const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
                    if (user && user.id) {
                        const empRes = await api.getKaryawanDetail(user.id);
                        const emp = empRes && empRes.data;
                        const isExempt = emp && (emp.locationExempt === true || String(emp.locationExempt || '').toUpperCase() === 'TRUE');
                        let withinExemptRange = isExempt;
                        if (isExempt) {
                            // Sama seperti backend: kalau Admin isi tanggal
                            // "Berlaku Dari/Sampai", bebas-radius cuma aktif
                            // di rentang itu - di luar itu, otomatis balik
                            // ke validasi radius normal (tidak perlu Admin
                            // matikan manual tiap hari).
                            const todayStr = new Date().toISOString().substring(0, 10);
                            const exemptFrom  = emp.locationExemptFrom  ? String(emp.locationExemptFrom).substring(0, 10)  : '';
                            const exemptUntil = emp.locationExemptUntil ? String(emp.locationExemptUntil).substring(0, 10) : '';
                            if (exemptFrom  && todayStr < exemptFrom)  withinExemptRange = false;
                            if (exemptUntil && todayStr > exemptUntil) withinExemptRange = false;
                        }
                        if (withinExemptRange) {
                            if (statusEl) {
                                statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terverifikasi (Pekerja Lapangan - bebas radius)';
                                statusEl.classList.add('verified');
                                statusEl.classList.remove('out-of-range');
                            }
                            this.locationVerified = true;
                            this.checkCanSubmit();
                            return;
                        }
                    }
                } catch (e) { /* kalau gagal cek, lanjut ke validasi radius normal */ }

                // Ambil pengaturan lokasi kantor dari backend (bisa lebih
                // dari 1 - Kantor Pusat, Unit SPAM, dsb)
                let officeLocations = [], radius = 100;
                try {
                    const result = await api.getSettings();
                    const s = result.data || {};
                    radius = s.location_radius ? parseInt(s.location_radius) : 100;

                    if (s.office_locations) {
                        try {
                            const parsed = JSON.parse(s.office_locations);
                            if (Array.isArray(parsed)) {
                                officeLocations = parsed
                                    .map(loc => ({ nama: loc.nama || 'Kantor', lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) }))
                                    .filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));
                            }
                        } catch (e) { /* JSON rusak, abaikan */ }
                    }
                    // Fallback ke field lama (1 lokasi) kalau office_locations
                    // belum pernah diisi - supaya konfigurasi lama tidak
                    // hilang setelah update ke fitur multi-lokasi ini.
                    if (officeLocations.length === 0 && s.office_lat && s.office_lng) {
                        const oldLat = parseFloat(s.office_lat);
                        const oldLng = parseFloat(s.office_lng);
                        if (!isNaN(oldLat) && !isNaN(oldLng)) {
                            officeLocations = [{ nama: 'Kantor', lat: oldLat, lng: oldLng }];
                        }
                    }
                } catch(e) { /* pakai default */ }

                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;

                // Validasi radius jika sudah ada lokasi kantor yang diset -
                // cari lokasi TERDEKAT dari semua yang ada, user dianggap
                // valid kalau masuk radius SALAH SATU lokasi saja.
                if (officeLocations.length > 0) {
                    let nearest = null;
                    officeLocations.forEach(loc => {
                        const d = this._calcDistance(userLat, userLng, loc.lat, loc.lng);
                        if (nearest === null || d < nearest.distance) {
                            nearest = { nama: loc.nama, distance: d };
                        }
                    });
                    const distance = Math.round(nearest.distance);
                    const inRadius = distance <= radius;

                    if (statusEl) {
                        if (inRadius) {
                            statusEl.innerHTML = `<i class="fas fa-check-circle"></i> Terverifikasi (${distance}m dari ${nearest.nama})`;
                            statusEl.classList.add('verified');
                            statusEl.classList.remove('out-of-range');
                        } else {
                            statusEl.innerHTML = `<i class="fas fa-times-circle" style="color:#EF4444;"></i> <span style="color:#EF4444;">Di luar area (${distance}m dari ${nearest.nama}, maks ${radius}m)</span>`;
                            statusEl.classList.remove('verified');
                            statusEl.classList.add('out-of-range');
                        }
                    }

                    if (!inRadius) {
                        // Tampilkan notifikasi & kunci tombol konfirmasi
                        toast.error(`Anda berada ${distance}m dari lokasi terdekat (${nearest.nama}). Absensi hanya diizinkan dalam radius ${radius}m.`);
                        this.locationVerified = false;
                        this.checkCanSubmit();

                        // Tampilkan info lokasi
                        if (infoEl) {
                            infoEl.style.display = 'block';
                            const coordsEl    = document.getElementById('location-coords');
                            const addressEl   = document.getElementById('location-address');
                            const accuracyEl  = document.getElementById('location-accuracy');
                            if (coordsEl)   coordsEl.textContent   = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
                            if (addressEl)  addressEl.textContent  = `Di luar radius ${nearest.nama} (${distance}m)`;
                            if (accuracyEl) accuracyEl.textContent = `±${Math.round(position.coords.accuracy)}m`;

                            // Tampilkan alamat asli begitu selesai diambil (async,
                            // tidak menghalangi info radius yang sudah tampil duluan)
                            this._reverseGeocode(userLat, userLng).then(addr => {
                                if (addressEl && addr) {
                                    addressEl.textContent = `${addr} — di luar radius ${nearest.nama} (${distance}m)`;
                                }
                            });
                        }
                        return; // jangan set locationVerified = true
                    }
                } else {
                    // Belum ada lokasi kantor yang diset, loloskan saja
                    if (statusEl) {
                        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terverifikasi';
                        statusEl.classList.add('verified');
                    }
                }

                this.locationVerified = true;

                // Show location info
                if (infoEl) {
                    infoEl.style.display = 'block';
                    const coordsEl   = document.getElementById('location-coords');
                    const addressEl  = document.getElementById('location-address');
                    const timeEl     = document.getElementById('location-time');
                    const accuracyEl = document.getElementById('location-accuracy');
                    if (coordsEl)   coordsEl.textContent   = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
                    if (addressEl)  addressEl.textContent  = 'Mencari alamat...';
                    if (timeEl)     timeEl.textContent     = dateTime.getCurrentTime();
                    if (accuracyEl) accuracyEl.textContent = `±${Math.round(position.coords.accuracy)}m`;

                    // Alamat asli dari koordinat GPS (reverse geocoding) -
                    // menggantikan teks statis "Lokasi Valid" yang lama.
                    this._reverseGeocode(userLat, userLng).then(addr => {
                        if (addressEl) addressEl.textContent = addr || 'Lokasi Valid';
                    });
                }

                // Update map visualization - peta asli (OpenStreetMap via
                // Leaflet), bukan lagi kotak abu-abu dengan ikon pin statis.
                this._renderRealMap(mapEl, userLat, userLng, position.coords.accuracy);

                this.checkCanSubmit();
            },
            (error) => {
                console.error('Location error:', error);

                // JANGAN loloskan absen dengan lokasi palsu. Tampilkan error
                // dan biarkan user coba lagi - locationVerified tetap false
                // supaya tombol konfirmasi tetap terkunci.
                this.locationVerified = false;
                this.position = null;

                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#EF4444;"></i> <span style="color:#EF4444;">Gagal mendapat lokasi</span>';
                    statusEl.classList.remove('verified');
                    statusEl.classList.add('out-of-range');
                }
                this._destroyRealMap();
                if (mapEl) {
                    mapEl.innerHTML = `
                        <div class="map-placeholder"><i class="fas fa-exclamation-triangle" style="color:#EF4444;"></i>
                            <p>Tidak bisa mendapatkan lokasi GPS. Pastikan izin lokasi aktif & sinyal GPS/internet stabil, lalu coba lagi.</p>
                        </div>
                    `;
                }
                const retryBtn = document.getElementById('btn-retry-location');
                if (retryBtn) retryBtn.style.display = 'flex';

                toast.error('Gagal mendapatkan lokasi. Tekan "Coba Lagi" setelah memastikan GPS aktif.');
                this.checkCanSubmit();
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    },

    bindButtons() {
        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');
        const retryLocationBtn = document.getElementById('btn-retry-location');
        const refreshLocationBtn = document.getElementById('btn-refresh-location');

        // Tombol refresh lokasi - selalu tersedia (beda dari "Coba Lagi"
        // yang cuma muncul kalau GPS gagal total), supaya user bisa
        // manual minta ulang titik GPS kalau koordinatnya kelihatan
        // meleset dari posisi asli (GPS HP/PC kadang butuh beberapa kali
        // baca ulang untuk akurat).
        if (refreshLocationBtn) {
            const newRefreshBtn = refreshLocationBtn.cloneNode(true);
            refreshLocationBtn.parentNode.replaceChild(newRefreshBtn, refreshLocationBtn);
            newRefreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const icon = newRefreshBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                newRefreshBtn.disabled = true;

                const statusEl = document.getElementById('location-status');
                if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendeteksi ulang...';

                const retryBtn = document.getElementById('btn-retry-location');
                if (retryBtn) retryBtn.style.display = 'none';

                this.locationVerified = false;
                this.checkCanSubmit();

                this.initLocation();

                setTimeout(() => {
                    if (icon) icon.classList.remove('fa-spin');
                    newRefreshBtn.disabled = false;
                }, 1500);
            });
        }

        if (retryLocationBtn) {
            const newRetryBtn = retryLocationBtn.cloneNode(true);
            retryLocationBtn.parentNode.replaceChild(newRetryBtn, retryLocationBtn);
            newRetryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                newRetryBtn.style.display = 'none';
                const statusEl = document.getElementById('location-status');
                if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendeteksi...';
                this.initLocation();
            });
        }

        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);
            newCaptureBtn.addEventListener('click', (e) => { e.preventDefault(); this.capturePhoto(); });
        }

        if (retakeBtn) {
            const newRetakeBtn = retakeBtn.cloneNode(true);
            retakeBtn.parentNode.replaceChild(newRetakeBtn, retakeBtn);
            newRetakeBtn.addEventListener('click', (e) => { e.preventDefault(); this.retakePhoto(); });
        }
    },

    capturePhoto() {
        if (!this.video || !this.canvas) return;

        // Sekarang cuma ada 1 tombol ("Absen Sekarang") yang sekaligus ambil
        // foto & submit absensi - jadi lokasi WAJIB divalidasi duluan di sini,
        // sebelum foto diambil, supaya tidak ada foto yang "kepotong di
        // tengah" gara-gara ternyata lokasinya belum/tidak valid.
        if (!this.locationVerified) {
            toast.error('Lokasi belum terverifikasi. Mohon tunggu sebentar, lalu coba lagi.');
            return;
        }

        const captureBtnEl = document.getElementById('btn-capture');
        if (captureBtnEl) captureBtnEl.disabled = true;

        const ctx = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        // Draw video frame to canvas
        ctx.drawImage(this.video, 0, 0);

        // Show scanning animation
        const scanningLine = document.getElementById('scanning-line');
        if (scanningLine) {
            scanningLine.style.display = 'block';
        }

        // Pengecekan wajah FINAL, langsung di frame yang baru saja diambil -
        // bukan cuma mengandalkan hasil loop live sebelumnya (bisa saja wajah
        // sempat kelihatan lalu menghilang tepat sebelum tombol ditekan).
        // Kalau tidak ada wajah di foto ini, absen DIBATALKAN dan user harus
        // mengulang - tidak ada lagi "verifikasi" palsu yang selalu sukses.
        (async () => {
            let faceOk = this.faceDetected; // fallback kalau model gagal load (lihat _loadFaceModels)
            if (this.modelsLoaded && typeof faceapi !== 'undefined') {
                try {
                    const result = await faceapi.detectSingleFace(
                        this.canvas,
                        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
                    );
                    faceOk = !!result;
                } catch (e) {
                    faceOk = this.faceDetected;
                }
            }

            if (scanningLine) scanningLine.style.display = 'none';

            if (!faceOk) {
                toast.error('Wajah tidak terdeteksi. Pastikan wajah Anda terlihat jelas di kamera, lalu coba lagi.');
                if (captureBtnEl) captureBtnEl.disabled = !this.faceDetected;
                return;
            }

            // Show verification success
            const statusEl = document.getElementById('verification-status');
            if (statusEl) {
                statusEl.classList.add('show');
            }

            // Stop camera
            this.stopCamera();

            // Show captured photo
            const preview = document.getElementById('camera-preview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${this.canvas.toDataURL('image/png')}" class="captured-photo" alt="Captured">
                    <div class="verification-status show" id="verification-status">
                        <div class="status-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <p>Wajah Terverifikasi</p>
                    </div>
                `;
            }

            // Sembunyikan tombol capture (foto sudah diambil)
            const captureBtn = document.getElementById('btn-capture');
            if (captureBtn) captureBtn.style.display = 'none';

            this.photoCaptured = true;

            // Langsung lanjut submit absensi otomatis - tidak perlu klik
            // tombol konfirmasi terpisah lagi (dulu ada 2 tombol, sekarang
            // digabung jadi 1 aksi).
            this.confirmAttendance();
        })();
    },

    retakePhoto() {
        this.photoCaptured = false;
        this.faceDetected = false;

        // Reset preview
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.innerHTML = `
                <video id="camera-video" autoplay playsinline muted></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
                <div class="face-overlay" id="face-overlay">
                    <div class="face-frame">
                        <div class="face-corner top-left"></div>
                        <div class="face-corner top-right"></div>
                        <div class="face-corner bottom-left"></div>
                        <div class="face-corner bottom-right"></div>
                    </div>
                    <div class="face-guide">
                        <i class="fas fa-user"></i>
                        <p>Posisikan wajah di dalam frame</p>
                    </div>
                </div>
                <div class="scanning-line" id="scanning-line" style="display: none;"></div>
            `;
        }

        // Update buttons
        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');

        if (captureBtn) {
            captureBtn.style.display = 'flex';
            captureBtn.disabled = true;
        }
        if (retakeBtn) retakeBtn.style.display = 'none';

        // Reinitialize camera
        this.initCamera();
        this.checkCanSubmit();
    },

    stopCamera() {
        this._stopFaceDetectionLoop();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },

    checkCanSubmit() {
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        if (confirmBtn) {
            confirmBtn.disabled = !(this.photoCaptured && this.locationVerified);
        }
    },

    confirmAttendance() {
        if (!this.photoCaptured || !this.locationVerified) {
            toast.error('Harap verifikasi wajah dan lokasi terlebih dahulu!');
            return;
        }

        // Save data
        const attendanceData = {
            action: this.currentAction,
            timestamp: new Date().toISOString(),
            location: {
                latitude: this.position.coords.latitude,
                longitude: this.position.coords.longitude,
                accuracy: this.position.coords.accuracy
            },
            photo: this.canvas ? this.canvas.toDataURL('image/png') : null
        };

        // Store temporary data
        storage.set('temp_attendance', attendanceData);

        // Process based on action
        toast.success('Verifikasi berhasil!');

        // Wrap in async IIFE to allow awaiting the process before navigating
        (async () => {
            try {
                if (window.absensi) {
                    await window.absensi.processWithVerification(this.currentAction, attendanceData);
                }
                setTimeout(() => router.navigate('absensi'), 500);
            } catch (error) {
                console.error('Processing error:', error);
                toast.error('Terjadi kesalahan saat memproses data.');
            }
        })();
    },

    // Cleanup when leaving page
    cleanup() {
        this.stopCamera();
    }
};

// Global init function
window.initFaceRecognition = (action) => {
    faceRecognition.init(action);
};

// Cleanup on page change
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        faceRecognition.cleanup();
    }
});

// Expose
window.faceRecognition = faceRecognition;
