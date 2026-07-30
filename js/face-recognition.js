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
    // Dikontrol dari toggle "Face Recognition" di halaman Settings admin -
    // lihat _loadFaceRecognitionSetting(). Default true (tetap aktif)
    // sebelum settingnya sempat dimuat, supaya tidak "bocor" jadi nonaktif
    // kalau pengecekan setting-nya sendiri gagal/lambat.
    faceRecognitionEnabled: true,
    // Model tambahan untuk RECOGNITION (mengenali identitas, bukan cuma
    // mendeteksi ada-tidaknya wajah) - dipakai untuk mencocokkan wajah yang
    // difoto saat absen dengan foto profil karyawan yang bersangkutan, supaya
    // orang lain tidak bisa absen memakai akun karyawan lain ("titip absen").
    recognitionModelsLoaded: false,
    _referenceDescriptor: null,
    _referenceDescriptorAvatarUrl: null,
    // Ambang batas jarak Euclidean antar descriptor wajah (face-api.js) -
    // makin kecil jaraknya makin mirip. 0.55 adalah nilai yang umum dipakai
    // face-api.js sendiri sebagai batas "wajah yang sama".
    FACE_MATCH_THRESHOLD: 0.55,
    // Kalau jarak masih di bawah threshold (jadi tetap dianggap "cocok")
    // TAPI di atas angka ini, kecocokannya dianggap "kurang yakin" - absen
    // tetap diloloskan (tidak mau bikin karyawan asli ditolak-tolak gara-
    // gara pencahayaan/sudut kurang pas), tapi ditandai faceMatchFlag=true
    // di data absensinya supaya admin bisa tinjau ulang lewat foto yang
    // tersimpan.
    FACE_MATCH_CONFIDENT_ZONE: 0.45,
    _lastFaceMatch: null,
    // ---- Liveness check (deteksi kedipan mata) ----
    // Mencegah orang "titip absen" cuma dengan menodongkan FOTO/screenshot
    // wajah orang lain ke kamera - foto diam tidak akan pernah berkedip,
    // jadi tombol capture baru aktif setelah wajah terdeteksi DAN minimal
    // 1 kedipan alami terekam selama sesi kamera ini berjalan.
    blinkDetected: false,
    // EAR (Eye Aspect Ratio) "mata terbuka" beda-beda tiap orang (tergantung
    // bentuk mata, jarak & sudut kamera, resolusi) - angka mutlak yang sama
    // untuk semua orang gampang meleset (kedip asli tidak pernah kedeteksi
    // kalau baseline mata terbuka orang itu memang lebih rendah dari angka
    // tetap yang diasumsikan). Makanya threshold-nya dihitung RELATIF
    // terhadap baseline yang dikalibrasi otomatis di awal tiap sesi kamera -
    // lihat _trackBlink(). _earBaseline null berarti masih tahap kalibrasi.
    _earBaseline: null,
    _earBaselineSum: 0,
    _earBaselineCount: 0,
    EAR_CLOSED_RATIO: 0.78, // EAR di bawah 78% baseline = mata tertutup
    EAR_OPEN_RATIO: 0.90,   // EAR di atas 90% baseline = mata terbuka lagi
    _eyesWereClosed: false,
    _detectLoopId: null,
    _leafletMap: null,
    _outOfRadiusNote: null,
    _outOfRadiusPhoto: null, // base64 foto dokumentasi (opsional)
    _outOfRadiusContext: null,

    init(action) {
        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.faceDetected = false;
        this.blinkDetected = false;
        this._eyesWereClosed = false;
        this._earBaseline = null;
        this._earBaselineSum = 0;
        this._earBaselineCount = 0;
        this._lastFaceMatch = null;
        this.position = null;
        this._destroyRealMap();
        this._outOfRadiusNote = null;
        this._outOfRadiusPhoto = null;
        this._outOfRadiusContext = null;

        // Ambil status toggle "Face Recognition" dari Settings admin dulu -
        // initCamera() di bawah butuh tahu ini supaya bisa memutuskan mau
        // menjalankan deteksi/pengenalan wajah atau tidak sama sekali.
        this._loadFaceRecognitionSetting().finally(() => {
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
        });
    },

    /**
     * Baca toggle "Face Recognition" dari Settings admin. Kalau OFF, seluruh
     * pengecekan wajah (deteksi ada-tidaknya wajah, MAUPUN pencocokan
     * identitas ke foto profil) dilewati - absen kembali seperti sebelum
     * ada fitur ini (cukup ambil foto & kirim). Kalau gagal dimuat (mis.
     * error jaringan), default AKTIF (fail-safe ke arah lebih ketat, bukan
     * lebih longgar).
     */
    async _loadFaceRecognitionSetting() {
        try {
            const result = await api.getSettings();
            if (result && result.success && result.data && result.data.face_recognition !== undefined) {
                // PENTING: nilai boolean yang tersimpan di Google Sheets suka
                // kebaca balik sebagai teks "TRUE"/"FALSE" (huruf besar semua),
                // bukan "true"/"false" seperti waktu pertama disimpan - jadi
                // dicek tanpa peduli besar/kecil huruf (lihat juga settings.js
                // & Attendance.gs yang punya catatan sama).
                this.faceRecognitionEnabled = String(result.data.face_recognition).toLowerCase() === 'true'
                    || result.data.face_recognition === true;
            } else {
                this.faceRecognitionEnabled = true;
            }
        } catch (e) {
            console.error('Gagal memuat setting Face Recognition, dianggap aktif:', e);
            this.faceRecognitionEnabled = true;
        }
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
                // Toggle "Face Recognition" di Settings admin sedang OFF -
                // lewati semua pengecekan wajah, tombol capture langsung
                // boleh ditekan seperti alur lama sebelum fitur ini ada.
                if (!this.faceRecognitionEnabled) {
                    this.faceDetected = true;
                    const captureBtn = document.getElementById('btn-capture');
                    if (captureBtn) captureBtn.disabled = false;
                    const guideText = document.querySelector('#face-overlay .face-guide p');
                    if (guideText) guideText.textContent = 'Posisikan wajah di dalam frame';
                    return;
                }

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

                // Mulai muat model recognition + hitung referensi dari foto
                // profil di LATAR BELAKANG (tidak di-await) selagi karyawan
                // baru memposisikan wajahnya - supaya pas tombol "Absen
                // Sekarang" ditekan, pencocokan identitas di capturePhoto()
                // besar kemungkinan sudah tidak perlu menunggu model dimuat
                // lagi dari nol.
                this._getReferenceDescriptor();
            };

        } catch (error) {
            console.error('Camera error:', error);
            toast.error('Tidak dapat mengakses kamera. Pastikan Anda memberikan izin kamera.');
        }
    },

    /**
     * Muat model TinyFaceDetector + FaceLandmark68 (face-api.js) sekali saja -
     * dipakai untuk mendeteksi APAKAH ada wajah di frame kamera, dan untuk
     * memantau kedipan mata (liveness check, lihat _startFaceDetectionLoop)
     * selama karyawan memposisikan wajahnya. Landmark dimuat di sini (bukan
     * di _loadRecognitionModels di bawah) karena dibutuhkan SELAMA loop
     * deteksi live berjalan, bukan cuma sesaat sebelum submit.
     */
    async _loadFaceModels() {
        if (this.modelsLoaded) return true;
        if (typeof faceapi === 'undefined') {
            console.error('face-api.js tidak termuat.');
            return false;
        }
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            ]);
            this.modelsLoaded = true;
            return true;
        } catch (e) {
            console.error('Gagal memuat model deteksi wajah:', e);
            return false;
        }
    },

    /**
     * Muat model recognition (face-api.js) - dipakai untuk menghitung
     * descriptor/"sidik wajah" saat mencocokkan identitas ke foto profil.
     * Lebih berat dari model deteksi/landmark di atas, jadi dimuat terpisah
     * di latar belakang (lihat pemanggilan di initCamera), supaya tidak
     * memberatkan HP yang koneksinya lambat waktu kamera baru dibuka.
     */
    async _loadRecognitionModels() {
        if (this.recognitionModelsLoaded) return true;
        if (typeof faceapi === 'undefined') return false;
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
            // Landmark sudah dimuat lewat _loadFaceModels() - di sini tinggal
            // muat ulang juga (aman, cache internal face-api.js) jaga-jaga
            // kalau dipanggil dari alur lain di masa depan.
            await Promise.all([
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            this.recognitionModelsLoaded = true;
            return true;
        } catch (e) {
            console.error('Gagal memuat model pengenalan wajah:', e);
            return false;
        }
    },

    /**
     * Hitung "sidik wajah" (descriptor) dari foto profil karyawan yang
     * sedang login, dipakai sebagai acuan pembanding saat absen. Hasilnya
     * di-cache di memori (this._referenceDescriptor) selama foto profilnya
     * tidak berubah, supaya tidak perlu dihitung ulang tiap kali absen.
     *
     * Balikin null kalau: karyawan belum punya foto profil, foto gagal
     * dimuat (mis. karena CORS atau link putus), atau modelnya gagal
     * dimuat - di semua kasus itu, pemanggil (capturePhoto) akan
     * MELOLOSKAN absen tanpa pencocokan identitas (fail-open), supaya
     * karyawan yang belum sempat upload foto profil tidak jadi tidak bisa
     * absen sama sekali gara-gara fitur ini.
     */
    async _getReferenceDescriptor() {
        const user = auth.getCurrentUser();
        const avatarUrl = user && user.avatar ? user.avatar : '';
        if (!avatarUrl) return null;

        // Masih sama dengan yang sudah di-cache sebelumnya - tidak perlu
        // dihitung ulang.
        if (this._referenceDescriptor && this._referenceDescriptorAvatarUrl === avatarUrl) {
            return this._referenceDescriptor;
        }

        const modelsOk = await this._loadRecognitionModels();
        if (!modelsOk) return null;

        try {
            // PENTING: foto profil di-hosting di Google Drive, dan Google
            // Drive tidak mengirim header CORS - kalau link-nya dipasang
            // LANGSUNG sebagai src <img>, browser memang berhasil
            // menampilkannya secara visual, TAPI kanvas jadi "tainted" dan
            // face-api.js tidak bisa membaca pixel-nya sama sekali untuk
            // dihitung descriptor-nya (selalu gagal diam-diam). Makanya
            // foto-nya diambil dulu lewat backend sebagai base64 (lihat
            // api.getDriveFileAsBase64), baru dipakai sebagai data: URL -
            // data: URL tidak pernah kena masalah CORS.
            const fileResult = await api.getDriveFileAsBase64(avatarUrl);
            if (!fileResult || !fileResult.success || !fileResult.data || !fileResult.data.base64) {
                console.error('Gagal mengambil foto profil dari server:', fileResult && fileResult.error);
                return null;
            }

            const dataUrl = `data:${fileResult.data.mimeType || 'image/jpeg'};base64,${fileResult.data.base64}`;

            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = dataUrl;
            });

            const result = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) return null;

            this._referenceDescriptor = result.descriptor;
            this._referenceDescriptorAvatarUrl = avatarUrl;
            return this._referenceDescriptor;
        } catch (e) {
            // Foto profil gagal dimuat (link putus, file terhapus, dsb) atau
            // tidak ada wajah terdeteksi di foto profilnya sendiri -
            // fail-open, lihat catatan di atas.
            console.error('Gagal menghitung referensi wajah dari foto profil:', e);
            return null;
        }
    },

    /**
     * Bandingkan wajah di foto yang baru diambil (canvas) dengan foto profil
     * karyawan yang sedang login. Balikin { matched, checked, distance } -
     * "checked" true kalau pencocokan benar-benar dilakukan (ada referensi &
     * model termuat), supaya pemanggil bisa membedakan "cocok", "tidak
     * cocok", dan "tidak sempat dicek sama sekali" (fail-open). "distance"
     * dipakai pemanggil untuk menandai kecocokan yang "kurang yakin" (lihat
     * FACE_MATCH_CONFIDENT_ZONE) supaya bisa ditinjau admin.
     */
    async _verifyFaceIdentity() {
        const reference = await this._getReferenceDescriptor();
        if (!reference) return { matched: true, checked: false, distance: null };

        try {
            const result = await faceapi
                .detectSingleFace(this.canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!result) return { matched: true, checked: false, distance: null };

            const distance = faceapi.euclideanDistance(reference, result.descriptor);
            return { matched: distance <= this.FACE_MATCH_THRESHOLD, checked: true, distance: distance };
        } catch (e) {
            console.error('Gagal mencocokkan wajah:', e);
            return { matched: true, checked: false, distance: null };
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
                const result = await faceapi
                    .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                    .withFaceLandmarks();
                detected = !!result;

                // Baru perlu lacak kedipan kalau belum pernah kedeteksi 1x
                // sepanjang sesi kamera ini - begitu blinkDetected true,
                // tidak perlu dihitung lagi (hemat proses).
                if (detected && !this.blinkDetected) {
                    this._trackBlink(result.landmarks);
                }
            } catch (e) {
                detected = false;
            }

            this.faceDetected = detected;
            this._updateFaceOverlay(detected);

            // Tombol capture baru boleh ditekan kalau wajah terdeteksi DAN
            // sudah terekam minimal 1 kedipan alami (liveness check) - lihat
            // _trackBlink(). Ini yang mencegah "titip absen" cuma dengan
            // menodongkan foto/screenshot wajah orang lain ke kamera, karena
            // gambar diam tidak akan pernah berkedip.
            const readyToCapture = detected && this.blinkDetected;
            const captureBtn = document.getElementById('btn-capture');
            if (captureBtn && !this.photoCaptured) captureBtn.disabled = !readyToCapture;
        }, 150);
    },

    /**
     * Hitung Eye Aspect Ratio (EAR) dari landmark mata kiri+kanan, lalu
     * lacak transisi "terbuka -> tertutup -> terbuka" sebagai 1 kedipan
     * alami. Foto/screenshot yang ditodongkan ke kamera tidak akan pernah
     * menghasilkan transisi ini (posisi matanya selalu diam persis sama),
     * jadi ini jadi pertahanan utama terhadap serangan "foto statis".
     */
    _trackBlink(landmarks) {
        if (!landmarks) return;
        try {
            const leftEAR  = this._eyeAspectRatio(landmarks.getLeftEye());
            const rightEAR = this._eyeAspectRatio(landmarks.getRightEye());
            const ear = (leftEAR + rightEAR) / 2;

            // Tahap kalibrasi: kumpulkan beberapa sampel EAR pertama sebagai
            // baseline "mata terbuka". Sampel yang jauh lebih rendah dari
            // rata-rata sejauh ini diabaikan (kemungkinan besar kebetulan
            // lagi berkedip pas kalibrasi), supaya baseline tidak keburu
            // rendah gara-gara itu.
            if (this._earBaseline === null) {
                const runningAvg = this._earBaselineCount > 0 ? (this._earBaselineSum / this._earBaselineCount) : null;
                if (runningAvg === null || ear >= runningAvg * 0.85) {
                    this._earBaselineSum += ear;
                    this._earBaselineCount++;
                }
                if (this._earBaselineCount >= 6) {
                    this._earBaseline = this._earBaselineSum / this._earBaselineCount;
                }
                return; // belum mulai lacak kedipan selama masih kalibrasi
            }

            const closedThreshold = this._earBaseline * this.EAR_CLOSED_RATIO;
            const openThreshold   = this._earBaseline * this.EAR_OPEN_RATIO;

            if (ear < closedThreshold) {
                this._eyesWereClosed = true;
            } else if (ear > openThreshold && this._eyesWereClosed) {
                // Mata sempat terpejam, sekarang terbuka lagi -> 1 kedipan
                // lengkap terekam.
                this.blinkDetected = true;
                this._eyesWereClosed = false;
            }
        } catch (e) {
            // Landmark gagal dihitung di frame ini - lewati, dicoba lagi di
            // tick berikutnya (150ms kemudian).
        }
    },

    // eyePoints: 6 titik landmark 1 mata, urutan standar dlib 68-point
    // (p1 sudut luar, p2, p3, p4 sudut dalam, p5, p6).
    _eyeAspectRatio(eyePoints) {
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const vertical1  = dist(eyePoints[1], eyePoints[5]);
        const vertical2  = dist(eyePoints[2], eyePoints[4]);
        const horizontal = dist(eyePoints[0], eyePoints[3]);
        if (horizontal === 0) return 1;
        return (vertical1 + vertical2) / (2 * horizontal);
    },

    _stopFaceDetectionLoop() {
        if (this._detectLoopId) {
            clearInterval(this._detectLoopId);
            this._detectLoopId = null;
        }
    },

    // Ubah tampilan frame & teks panduan sesuai status deteksi wajah +
    // status kedipan (liveness).
    _updateFaceOverlay(detected) {
        const frame = document.querySelector('#face-overlay .face-frame');
        const guideIcon = document.querySelector('#face-overlay .face-guide i');
        const guideText = document.querySelector('#face-overlay .face-guide p');

        if (frame) frame.classList.toggle('detected', detected);
        if (guideIcon) guideIcon.classList.toggle('detected', detected);
        if (guideText) {
            if (!detected) {
                guideText.textContent = 'Wajah tidak terlihat - posisikan wajah di dalam frame';
            } else if (!this.blinkDetected) {
                guideText.textContent = 'Wajah terdeteksi - silakan berkedip secara alami untuk verifikasi';
            } else {
                guideText.textContent = 'Wajah terverifikasi - siap absen';
            }
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

    /**
     * Munculkan modal wajib isi catatan alasan untuk karyawan "Pekerja
     * Lapangan" yang terdeteksi BENAR-BENAR di luar semua radius kantor.
     * locationVerified tetap false sampai catatan disubmit - tombol absen
     * tetap terkunci selama itu.
     */
    _promptOutOfRadiusNote(ctx) {
        this._outOfRadiusContext = ctx;
        this._outOfRadiusPhoto = null; // reset tiap kali modal dibuka baru
        const modal = document.getElementById('modal-out-of-radius-note');
        const textarea = document.getElementById('out-of-radius-note-text');
        const infoEl = document.getElementById('out-of-radius-note-info');
        if (textarea) textarea.value = '';
        this.removeOutOfRadiusPhoto();
        if (infoEl) {
            infoEl.textContent = `Anda terdeteksi ${ctx.distance}m dari ${ctx.nearest.nama}. Sebagai Pekerja Lapangan, Anda tetap boleh absen - jelaskan dulu sedang di mana/mengerjakan apa.`;
        }
        if (modal) modal.style.display = 'flex';
    },

    // Foto dokumentasi bersifat OPSIONAL (beda dengan catatan yang wajib) -
    // dikonversi ke base64 di browser, lalu ditumpangkan ke laporan yang
    // sama seperti catatan alasan.
    previewOutOfRadiusPhoto(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this._outOfRadiusPhoto = e.target.result; // base64 data URL
            const preview = document.getElementById('out-of-radius-photo-preview');
            const img = document.getElementById('out-of-radius-photo-img');
            if (img) img.src = this._outOfRadiusPhoto;
            if (preview) preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    },

    removeOutOfRadiusPhoto() {
        this._outOfRadiusPhoto = null;
        const input = document.getElementById('out-of-radius-photo-input');
        const preview = document.getElementById('out-of-radius-photo-preview');
        if (input) input.value = '';
        if (preview) preview.style.display = 'none';
    },

    submitOutOfRadiusNote() {
        const textarea = document.getElementById('out-of-radius-note-text');
        const note = textarea ? textarea.value.trim() : '';
        if (!note) {
            toast.error('Catatan alasan wajib diisi sebelum bisa absen.');
            return;
        }

        this._outOfRadiusNote = note;
        this.locationVerified = true;

        const modal = document.getElementById('modal-out-of-radius-note');
        if (modal) modal.style.display = 'none';

        const statusEl = document.getElementById('location-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terverifikasi (Pekerja Lapangan - Luar Radius, tercatat)';
            statusEl.classList.add('verified');
            statusEl.classList.remove('out-of-range');
        }

        this.checkCanSubmit();
    },

    cancelOutOfRadiusNote() {
        const modal = document.getElementById('modal-out-of-radius-note');
        if (modal) modal.style.display = 'none';
        // locationVerified tetap false - karyawan bisa klik "Coba Lagi" lokasi
        const retryBtn = document.getElementById('btn-retry-location');
        if (retryBtn) retryBtn.style.display = 'flex';
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
                // dari validasi radius - TAPI tetap dihitung jaraknya di
                // bawah supaya kita tahu apakah dia SEDANG BENAR-BENAR di
                // luar radius atau tidak. Kalau memang di luar radius,
                // dia tetap boleh absen, tapi wajib isi catatan alasan dulu
                // (lihat _promptOutOfRadiusNote) - laporannya dikirim ke
                // approver yang ditunjuk Admin. Backend TETAP jadi penentu
                // akhir/wajib (lihat Attendance.gs), ini cuma untuk UX di layar.
                let isExempt = false;
                let withinExemptRange = false;
                let exemptUserId = null;
                try {
                    const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
                    if (user && user.id) {
                        exemptUserId = user.employeeId || user.id;
                        const empRes = await api.getKaryawanDetail(user.id);
                        const emp = empRes && empRes.data;
                        isExempt = !!(emp && (emp.locationExempt === true || String(emp.locationExempt || '').toUpperCase() === 'TRUE'));
                        withinExemptRange = isExempt;
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
                    }
                } catch (e) { /* kalau gagal cek, anggap tidak exempt, lanjut ke validasi radius normal */ }

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

                // Bacaan geolocation dengan akurasi sangat jelek (mis. fallback
                // WiFi/network-based di desktop yang bisa meleset puluhan-
                // ratusan km, accuracy sampai puluhan ribu meter) TIDAK BOLEH
                // dipakai untuk validasi radius - bisa salah nuduh karyawan
                // "di luar radius" padahal cuma GPS-nya yang belum akurat.
                // Minta user coba lagi daripada lanjut dengan koordinat sampah.
                const MAX_ACCEPTABLE_ACCURACY = 1000; // meter
                if (position.coords.accuracy > MAX_ACCEPTABLE_ACCURACY) {
                    if (statusEl) {
                        statusEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#EF4444;"></i> <span style="color:#EF4444;">Akurasi GPS rendah (±${Math.round(position.coords.accuracy)}m) - coba lagi</span>`;
                        statusEl.classList.remove('verified');
                        statusEl.classList.add('out-of-range');
                    }
                    toast.error('Akurasi lokasi terlalu rendah untuk divalidasi. Pastikan GPS/lokasi aktif, lalu tekan "Coba Lagi" atau refresh lokasi.');
                    this.locationVerified = false;
                    this.position = null;
                    const retryBtn = document.getElementById('btn-retry-location');
                    if (retryBtn) retryBtn.style.display = 'flex';
                    this.checkCanSubmit();
                    return;
                }

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

                    if (!inRadius && withinExemptRange) {
                        // Pekerja Lapangan yang MEMANG sedang di luar radius -
                        // diizinkan, tapi wajib isi catatan alasan dulu.
                        if (statusEl) {
                            statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#D97706;"></i> <span style="color:#D97706;">Di luar radius - isi catatan untuk lanjut (Pekerja Lapangan)</span>';
                            statusEl.classList.remove('verified');
                            statusEl.classList.add('out-of-range');
                        }

                        if (infoEl) {
                            infoEl.style.display = 'block';
                            const coordsEl   = document.getElementById('location-coords');
                            const accuracyEl = document.getElementById('location-accuracy');
                            if (coordsEl)   coordsEl.textContent   = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
                            if (accuracyEl) accuracyEl.textContent = `±${Math.round(position.coords.accuracy)}m`;
                        }
                        this._renderRealMap(mapEl, userLat, userLng, position.coords.accuracy);

                        this.locationVerified = false;
                        this.checkCanSubmit();
                        this._promptOutOfRadiusNote({
                            userId: exemptUserId,
                            userLat, userLng,
                            distance,
                            nearest,
                            accuracy: position.coords.accuracy
                        });
                        return;
                    }

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
            let faceOk = true;

            if (this.faceRecognitionEnabled) {
                faceOk = this.faceDetected; // fallback kalau model gagal load (lihat _loadFaceModels)
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
            }

            if (scanningLine) scanningLine.style.display = 'none';

            if (!faceOk) {
                toast.error('Wajah tidak terdeteksi. Pastikan wajah Anda terlihat jelas di kamera, lalu coba lagi.');
                if (captureBtnEl) captureBtnEl.disabled = !this.faceDetected;
                return;
            }

            // Jaring pengaman terakhir untuk liveness check - seharusnya
            // tombol capture memang sudah terkunci selama belum ada kedipan
            // terekam (lihat _startFaceDetectionLoop), tapi dicek ulang di
            // sini juga jaga-jaga ada race condition.
            if (this.faceRecognitionEnabled && !this.blinkDetected) {
                toast.error('Verifikasi kedipan mata belum lengkap. Silakan berkedip secara alami, lalu coba lagi.');
                if (captureBtnEl) captureBtnEl.disabled = true;
                return;
            }

            // Cocokkan wajah di foto ini dengan foto profil karyawan yang
            // sedang login - supaya tidak bisa "titip absen" pakai akun
            // orang lain. Kalau tidak sempat dicek (belum ada foto profil/
            // model gagal dimuat), absen tetap diloloskan (fail-open) -
            // lihat penjelasan di _getReferenceDescriptor(). Dilewati total
            // kalau toggle Face Recognition di Settings admin sedang OFF.
            this._lastFaceMatch = null;
            if (this.faceRecognitionEnabled) {
                const identity = await this._verifyFaceIdentity();
                if (identity.checked && !identity.matched) {
                    toast.error('Wajah tidak cocok dengan foto profil Anda. Absen dibatalkan - pastikan yang absen adalah pemilik akun ini.');
                    if (captureBtnEl) captureBtnEl.disabled = !this.faceDetected;
                    return;
                }
                // Simpan hasilnya untuk dikirim bareng data absensi (dibaca
                // di confirmAttendance) - dipakai buat menandai kecocokan
                // yang "kurang yakin" supaya admin bisa tinjau ulang.
                this._lastFaceMatch = identity;
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
        this.blinkDetected = false;
        this._eyesWereClosed = false;
        this._lastFaceMatch = null;

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

    /**
     * currentAction pakai format 'clock-in'/'break'/'after-break'/'clock-out'
     * (dipakai processWithVerification), sedangkan laporan luar-radius &
     * rekap admin pakai nama field Attendance ('clockIn'/'breakStart'/
     * 'breakEnd'/'clockOut'). Fungsi ini menjembatani keduanya - tanpa ini,
     * laporan tersimpan dengan type yang tidak pernah cocok di rekap admin.
     */
    _normalizeAttendanceType(action) {
        const map = {
            'clock-in': 'clockIn',
            'break': 'breakStart',
            'after-break': 'breakEnd',
            'clock-out': 'clockOut'
        };
        return map[action] || action;
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
            photo: this.canvas ? this.canvas.toDataURL('image/png') : null,
            // Skor kecocokan wajah (jarak Euclidean, makin kecil makin mirip)
            // + penanda "perlu ditinjau admin" kalau kecocokannya tidak
            // sepenuhnya yakin (lihat FACE_MATCH_CONFIDENT_ZONE) - dikosongkan
            // kalau pencocokan tidak sempat dilakukan sama sekali (fail-open).
            faceMatchScore: (this._lastFaceMatch && this._lastFaceMatch.checked && this._lastFaceMatch.distance != null)
                ? Number(this._lastFaceMatch.distance.toFixed(4)) : null,
            faceMatchFlag: !!(this._lastFaceMatch && this._lastFaceMatch.checked
                && this._lastFaceMatch.distance != null
                && this._lastFaceMatch.distance > this.FACE_MATCH_CONFIDENT_ZONE)
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

                // Kirim laporan luar-radius (kalau ada) SETELAH absen sukses
                // tersimpan - gagal kirim laporan tidak boleh membatalkan
                // absen yang sudah tercatat.
                if (this._outOfRadiusNote && this._outOfRadiusContext) {
                    try {
                        const currentUser = auth.getCurrentUser();
                        const ctx = this._outOfRadiusContext;
                        await api.submitOutOfRadiusReport({
                            userId: currentUser?.employeeId || currentUser?.id || ctx.userId,
                            userName: currentUser?.name || '',
                            type: this._normalizeAttendanceType(this.currentAction),
                            note: this._outOfRadiusNote,
                            photo: this._outOfRadiusPhoto || '', // opsional
                            lat: ctx.userLat,
                            lng: ctx.userLng,
                            distance: ctx.distance,
                            nearestOffice: ctx.nearest ? ctx.nearest.nama : ''
                        });
                    } catch (e) {
                        console.error('Gagal kirim laporan luar radius:', e);
                    }
                    this._outOfRadiusNote = null;
                    this._outOfRadiusPhoto = null;
                    this._outOfRadiusContext = null;
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
