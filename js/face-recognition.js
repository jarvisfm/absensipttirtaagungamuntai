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
    // lihat _loadFaceRecognitionSetting(). Default FALSE (nonaktif).
    // Kedua mode (ON/OFF) SAMA-SAMA otomatis - kamera live tetap jalan,
    // tidak ada tombol fisik untuk ditekan (lihat #btn-capture di
    // index.html), dan foto yang diambil TETAP DICOCOKKAN dengan foto
    // profil (lihat _verifyFaceIdentity di capturePhoto()); kalau belum
    // cocok, otomatis dicoba lagi terus sampai wajahnya benar-benar sama.
    // OFF: TIDAK mewajibkan liveness kedip mata - livenessDetected
    // di-preset true dari awal (lihat initCamera()) supaya auto-capture
    // langsung jalan begitu wajah stabil terdeteksi di frame, tanpa
    // hitung landmark mata tiap tick (lebih ringan & cepat).
    // ON: yang berjalan TAMBAHAN adalah liveness BARU (deteksi kedipan
    // mata, lihat livenessDetected/_trackBlink di bawah) sebelum foto
    // boleh diambil - bukan lagi versi lama yang cuma cek "ada wajah
    // atau tidak" (itu yang bisa ditembus foto/kertas dicetak).
    faceRecognitionEnabled: false,
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
    //
    // PERBAIKAN (2026-08-20): 0.55 ternyata masih terlalu longgar - dites
    // langsung via debug log, 2 wajah BERBEDA orang bisa terhitung
    // distance ~0.47 (di bawah 0.55) dan tetap dianggap "cocok". Diperketat
    // ke 0.40 saat itu.
    //
    // PERBAIKAN (2026-08-29): 0.40 ternyata KEBABLASAN ketat - banyak
    // karyawan ASLI (sudah ganti foto profil jelas & absen di pencahayaan
    // terang) tetap sering ditolak/diulang-ulang. Dinaikkan ke 0.45 -
    // MASIH tetap menolak kasus 2-orang-berbeda ~0.47 yang jadi alasan
    // threshold ini diperketat di atas (0.47 > 0.45, jadi tetap ditolak),
    // tapi kasih sedikit ruang toleransi tambahan buat variasi
    // pencahayaan/sudut/kompresi foto profil resolusi rendah yang wajar
    // terjadi pada wajah yang SAMA. Kalau keluhan "sering tidak
    // lolos"-nya masih banyak setelah ini, opsi berikutnya BUKAN
    // menaikkan lagi angka ini (makin dekat ke 0.47 = makin mepet ke
    // kasus yang justru mau dicegah), melainkan naikkan dulu resolusi
    // foto acuan (lihat sz=w400 di Karyawan.gs getDriveFileAsBase64) atau
    // minta karyawan foto ulang profil yang lebih tegak lurus & tidak
    // gelap.
    FACE_MATCH_THRESHOLD: 0.45,
    // Kalau jarak masih di bawah threshold (jadi tetap dianggap "cocok")
    // TAPI di atas angka ini, kecocokannya dianggap "kurang yakin" - absen
    // tetap diloloskan (tidak mau bikin karyawan asli ditolak-tolak gara-
    // gara pencahayaan/sudut kurang pas), tapi ditandai faceMatchFlag=true
    // di data absensinya supaya admin bisa tinjau ulang lewat foto yang
    // tersimpan. Dinaikkan mengikuti FACE_MATCH_THRESHOLD di atas (tetap
    // dijaga jaraknya 0.05 dari threshold, sama seperti sebelumnya).
    FACE_MATCH_CONFIDENT_ZONE: 0.50,
    _lastFaceMatch: null,
    // ---- Tuning deteksi wajah live (kotak hijau) ----
    // PERBAIKAN (2026-08-27): beberapa karyawan melaporkan kamera menyala
    // normal & wajah kelihatan jelas di layar, tapi kotak deteksi tetap
    // kuning (belum terdeteksi) - inputSize 224 & scoreThreshold 0.5
    // (nilai default face-api.js) ternyata terlalu ketat untuk kondisi
    // pencahayaan/kamera HP yang kurang ideal. inputSize dinaikkan ke 320
    // (gambar dianalisis lebih detail, sedikit lebih berat tapi masih
    // real-time) dan scoreThreshold diturunkan ke 0.4 (lebih toleran)
    // supaya wajah yang sebenarnya sudah ada di frame tidak terus-menerus
    // dianggap "tidak ada". Dipakai SAMA di semua pemanggilan
    // detectSingleFace (loop live, capture final, pencocokan identitas)
    // supaya konsisten.
    FACE_DETECT_INPUT_SIZE: 320,
    FACE_DETECT_SCORE_THRESHOLD: 0.4,
    // Berapa kali berturut-turut boleh "gagal" terdeteksi sebelum kotak
    // beneran dianggap kuning lagi - meredam kedip-kedip hijau/kuning yang
    // dulu terjadi tiap kali ada 1 frame yang kebetulan gagal (motion
    // blur, HP sempat lag, dsb) padahal wajahnya tetap di situ.
    _missedDetectFrames: 0,
    // ---- Liveness check (deteksi menoleh kepala) ----
    // Mencegah orang "titip absen" cuma dengan menodongkan FOTO/screenshot
    // wajah orang lain ke kamera - foto diam tidak akan pernah bisa
    // menoleh, jadi tombol capture baru aktif setelah wajah terdeteksi DAN
    // gerakan menoleh (kiri/kanan lalu balik menghadap kamera) terekam
    // selama sesi kamera ini berjalan.
    livenessDetected: false,
    // Sedang dalam masa retry otomatis karena percobaan verifikasi
    // sebelumnya wajahnya tidak cocok dengan foto profil (lihat
    // capturePhoto()) - dipakai buat tampilan tombol & cegah toast error
    // berulang tiap retry (lihat _mismatchToastShown).
    _faceMismatchRetrying: false,
    _mismatchToastShown: false,
    // Posisi horizontal ujung hidung relatif terhadap lebar wajah (yaw
    // ratio) beda-beda tiap orang (bentuk wajah, sudut & jarak kamera) -
    // angka mutlak yang sama untuk semua orang gampang meleset. Makanya
    // threshold-nya dihitung RELATIF terhadap baseline "menghadap lurus ke
    // kamera" yang dikalibrasi otomatis di awal tiap sesi kamera - lihat
    // _trackHeadTurn(). _yawBaseline null berarti masih tahap kalibrasi.
    _yawBaseline: null,
    _yawBaselineSum: 0,
    _yawBaselineCount: 0,
    YAW_TURN_THRESHOLD: 0.12,   // deviasi dari baseline sejauh ini = dianggap menoleh
    YAW_RETURN_THRESHOLD: 0.06, // deviasi di bawah ini = dianggap sudah menghadap kamera lagi
    _headWasTurned: false,
    // ---- Liveness check (deteksi kedipan mata) ----
    // Dipilih menggantikan liveness "menoleh" di atas (yang tetap dibiarkan
    // ada kodenya, tapi TIDAK dipakai) karena kedip 1x jauh lebih cepat
    // dilakukan orang & lebih cepat kelihatan hasilnya di sistem - keluhan
    // sebelumnya adalah liveness kepakai (menoleh+kedip) lama diverifikasi
    // dan kadang beberapa kali kedip tidak terdeteksi. EAR (Eye Aspect
    // Ratio) dihitung dari landmark mata tiap tick deteksi (lihat
    // _trackBlink) - baseline "mata terbuka normal" dikalibrasi otomatis
    // di awal tiap sesi kamera sama seperti baseline menoleh, TAPI dengan
    // jumlah sampel kalibrasi yang sengaja dibuat sedikit (lihat
    // EAR_CALIBRATION_SAMPLES) dan ambang batas yang sengaja dibuat longgar
    // (EAR_CLOSE_RATIO/EAR_OPEN_RATIO) supaya kedipan wajar (bukan kedip
    // dibuat-buat lambat) tetap kena kedeteksi tanpa perlu user menunggu
    // lama atau mengulang-ulang. Foto/kertas yang ditodongkan ke kamera
    // tidak akan pernah bisa "berkedip" (rasio matanya diam persis sama),
    // jadi ini tetap jadi pertahanan utama terhadap serangan foto statis.
    _earBaseline: null,
    _earBaselineSum: 0,
    _earBaselineCount: 0,
    _eyesClosed: false,
    EAR_CALIBRATION_SAMPLES: 5,
    EAR_CLOSE_RATIO: 0.82, // EAR turun di bawah baseline * rasio ini -> dianggap merem
    EAR_OPEN_RATIO: 0.85,  // EAR naik balik di atas baseline * rasio ini (sambil sempat merem) -> dianggap 1 kedipan lengkap
    // Kalau sudah sekian detik sejak kalibrasi kelar tapi kedipan masih
    // belum kedeteksi (mis. kamera murah/pencahayaan kurang bikin gerakan
    // matanya kurang kentara buat model landmark "tiny" yang dipakai) -
    // ambang batasnya dilonggarkan BERTAHAP tiap RELAX_STEP_MS, supaya
    // pada akhirnya tetap kedeteksi tanpa harus tunggu lama/berkali-kali.
    // TETAP AMAN dari foto/kertas statis - longgar berapa pun tidak akan
    // pernah membuat EAR foto "bergerak", karena rasionya memang diam
    // persis sama tiap frame (tidak ada variasi sama sekali untuk
    // dideteksi sebagai kedipan).
    EAR_RELAX_STEP_MS: 2500,
    EAR_RELAX_STEP_AMOUNT: 0.03,
    EAR_RELAX_MAX_STEPS: 3,
    _blinkWaitStartedAt: null,
    _detectLoopId: null,
    _leafletMap: null,
    _outOfRadiusNote: null,
    _outOfRadiusPhoto: null, // base64 foto dokumentasi (wajib diisi - lihat submitOutOfRadiusNote)
    _outOfRadiusContext: null,

    // Laporan absen di luar Unit Wilayah yang ditugaskan (beda dari luar
    // radius) - lihat _promptOutOfWilayahNote(). Tanpa foto, cukup catatan.
    _outOfWilayahNote: null,
    _outOfWilayahContext: null,

    init(action) {
        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.faceDetected = false;
        this.livenessDetected = false;
        this._headWasTurned = false;
        this._yawBaseline = null;
        this._yawBaselineSum = 0;
        this._yawBaselineCount = 0;
        this._earBaseline = null;
        this._earBaselineSum = 0;
        this._earBaselineCount = 0;
        this._eyesClosed = false;
        this._blinkWaitStartedAt = null;
        this._stableFaceSince = null;
        this._autoCaptureNextAllowedAt = 0;
        this._mismatchToastShown = false;
        this._lastFaceMatch = null;
        this.position = null;
        this._destroyRealMap();
        this._outOfRadiusNote = null;
        this._outOfRadiusPhoto = null;
        this._outOfRadiusContext = null;
        this._outOfWilayahNote = null;
        this._outOfWilayahContext = null;

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
     * Baca toggle "Face Recognition" dari Settings admin. Default toggle ini
     * OFF - kalau OFF (atau belum pernah diatur admin sama sekali), kamera
     * live & auto-capture-nya TETAP jalan otomatis seperti biasa (tidak ada
     * tombol fisik untuk ditekan), yang dilewati HANYA liveness kedip mata -
     * pencocokan identitas ke foto profil TETAP jalan tiap kali foto
     * otomatis diambil (lihat initCamera() & capturePhoto()), dan kalau
     * belum cocok akan otomatis dicoba lagi terus. Karena tidak perlu
     * menunggu kedipan mata dulu, prosesnya jadi lebih cepat. Begitu admin
     * menyalakan toggle ini, tambahan liveness BARU (kedip mata) ikut
     * aktif sebelum foto boleh diambil. Kalau gagal dimuat (mis. error
     * jaringan), tetap default NONAKTIF supaya konsisten dengan default
     * barunya.
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
                this.faceRecognitionEnabled = false;
            }
        } catch (e) {
            console.error('Gagal memuat setting Face Recognition, dianggap nonaktif (default):', e);
            this.faceRecognitionEnabled = false;
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
                // TIDAK mewajibkan liveness kedip mata, tapi alur deteksi +
                // auto-capture di bawah (sama persis dengan toggle ON) tetap
                // berjalan otomatis - tidak ada tombol fisik untuk ditekan
                // (lihat #btn-capture di index.html, sudah jadi <div
                // pointer-events:none> sebagai indikator status/loading
                // saja). livenessDetected di-preset true SEBELUM loop
                // dimulai supaya seluruh logic auto-capture & status di
                // _startFaceDetectionLoop cukup menunggu wajah stabil di
                // frame (tanpa nunggu kedipan/hitung landmark mata tiap
                // tick - lebih ringan & cepat), lalu capturePhoto() yang
                // mencocokkan foto tsb ke foto profil - kalau belum cocok,
                // loop ini otomatis mencoba lagi terus sampai wajah yang
                // di kamera benar-benar sama dengan foto profil (lihat
                // _faceMismatchRetrying & cooldown _autoCaptureNextAllowedAt
                // di bawah).
                if (!this.faceRecognitionEnabled) {
                    this.livenessDetected = true;
                }

                const ready = await this._loadFaceModels();
                if (!ready) {
                    // BUGFIX (2026-08-29): model gagal dimuat (mis. koneksi
                    // lambat/CDN tidak terjangkau saat itu di HP karyawan -
                    // lihat laporan tanggal 27 Agustus: kotak deteksi macet
                    // kuning selamanya). Dulu di sini cuma menandai
                    // this.faceDetected=true & meng-enable #btn-capture
                    // supaya "boleh" absen - TAPI #btn-capture SEKARANG
                    // sudah bukan tombol yang bisa diklik (lihat markup-nya
                    // di index.html, pointer-events:none - cuma indikator
                    // status), jadi karyawan yang kena kasus ini benar-benar
                    // tidak punya cara lanjut absen sama sekali.
                    // Sekarang: tetap jalankan loop deteksi yang SAMA seperti
                    // mode normal (_startFaceDetectionLoop) supaya
                    // auto-capture (nunggu lokasi terverifikasi, wajah
                    // "stabil", retry kalau tidak cocok, dst) tetap
                    // berfungsi - faceDetected & livenessDetected di-preset
                    // true (fail-open, sama prinsipnya dengan toggle OFF)
                    // karena memang tidak ada cara mendeteksi wajah/kedipan
                    // tanpa model ini. tick() di _startFaceDetectionLoop
                    // sendiri yang mendeteksi this.modelsLoaded masih false
                    // dan melewati pemanggilan faceapi (lihat di sana).
                    this.faceDetected = true;
                    this.livenessDetected = true;
                    this._startFaceDetectionLoop();
                    return;
                }
                this._startFaceDetectionLoop();

                // Mulai muat model recognition + hitung referensi dari foto
                // profil di LATAR BELAKANG (tidak di-await) selagi karyawan
                // baru memposisikan wajahnya - supaya begitu wajah stabil
                // terdeteksi, pencocokan identitas di capturePhoto()
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
     * memantau gerakan menoleh (liveness check, lihat _startFaceDetectionLoop)
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
            // PERBAIKAN PERFORMA: URL model sebelumnya pakai "@master" (nama
            // branch), bukan versi/tag yang tetap. jsDelivr TIDAK
            // menganggap branch seperti ini "aman disimpan lama" (karena
            // isinya bisa berubah kapan saja kalau ada commit baru), jadi
            // file model (termasuk faceRecognitionNet yang ~6MB) berisiko
            // di-download ULANG dari internet oleh browser tiap beberapa
            // saat, bukan dipakai dari cache - lambat, apalagi di jaringan
            // kantor/seluler yang pas-pasan. "@0.22.2" adalah versi
            // TERAKHIR yang pernah dirilis project face-api.js (project ini
            // sudah tidak aktif dikembangkan lagi sejak 2020, jadi model
            // yang dipakai sekarang pun sebenarnya sudah versi itu juga -
            // cuma alamatnya yang belum di-pin) - dengan tag versi yang
            // tetap begini, jsDelivr menyimpannya sebagai cache PERMANEN
            // (immutable), jadi user ke-2/ke-3/dst yang pernah buka absen
            // sebelumnya (dari HP mana pun, bukan cuma HP sendiri, karena
            // ini cache CDN publik, bukan cache pribadi per-HP) akan dapat
            // model ini nyaris instan.
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                // Versi "tiny" dari model landmark - jauh lebih ringan/cepat
                // dari faceLandmark68Net di atas, dipakai KHUSUS buat lacak
                // kedipan tiap tick (150ms) di _startFaceDetectionLoop
                // supaya loop-nya tetap responsif (tidak "lama"/berat) di HP
                // atau laptop yang speknya pas-pasan. Model penuh
                // (faceLandmark68Net) tetap dipakai untuk pencocokan
                // identitas final di _verifyFaceIdentity() yang cuma jalan
                // sekali saat submit, jadi akurasinya tidak dikorbankan.
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
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
            // PERBAIKAN PERFORMA: sama seperti di _loadFaceModels() - "@0.22.2"
            // (versi tetap) menggantikan "@master" (branch, bisa berubah
            // isinya) supaya jsDelivr menyimpan cache PERMANEN untuk file
            // model recognition ini, yang paling besar (faceRecognitionNet
            // ~6MB, paling berat di antara semua model yang dipakai).
            const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
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
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: this.FACE_DETECT_INPUT_SIZE, scoreThreshold: this.FACE_DETECT_SCORE_THRESHOLD }))
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
                .detectSingleFace(this.canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: this.FACE_DETECT_INPUT_SIZE, scoreThreshold: this.FACE_DETECT_SCORE_THRESHOLD }))
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
        this._detectionActive = true;
        this._loopStartedAt = Date.now();
        this._faceFirstDetectedAt = null;
        this._noFaceWarnShown = false;
        this._turnHintShown = false;
        this._blinkHintShown = false;

        // Self-scheduling (setTimeout dipanggil ulang SETELAH tick
        // sebelumnya benar-benar selesai) - BUKAN setInterval. Kalau
        // inference-nya kebetulan lebih lambat dari 150ms (umum di HP
        // kelas menengah-bawah), setInterval akan tetap menembak panggilan
        // baru tanpa nunggu, jadi menumpuk (overlapping) dan bikin device
        // makin lemot & deteksi makin lambat lama-lama. Cara ini mencegah
        // itu - tick berikutnya baru dijadwalkan setelah yang sekarang tuntas.
        const tick = async () => {
            if (!this._detectionActive) return;

            if (!this.video || this.video.readyState < 2 || this.photoCaptured) {
                this._detectLoopId = setTimeout(tick, 150);
                return;
            }

            let detected = false;
            let landmarks = null;
            try {
                if (!this.modelsLoaded) {
                    // Model gagal dimuat sama sekali (lihat cabang !ready di
                    // initCamera()) - tidak ada cara mendeteksi wajah
                    // beneran lewat face-api.js. Anggap wajah selalu "ada"
                    // (fail-open) supaya auto-capture di bawah tetap bisa
                    // berjalan lewat jalur yang SAMA PERSIS dengan mode
                    // normal (nunggu lokasi terverifikasi + wajah "stabil"
                    // + cooldown retry kalau ternyata tidak cocok dengan
                    // foto profil di capturePhoto()) - bukan macet total
                    // kotak kuning selamanya seperti sebelumnya.
                    detected = true;
                } else if (!this.livenessDetected) {
                    // Kedipan belum terekam - butuh landmark mata tiap tick
                    // buat _trackBlink(). Begitu livenessDetected true, tidak
                    // perlu landmark lagi (lebih ringan), cukup cek wajah
                    // masih ada di frame sampai foto diambil.
                    const result = await faceapi
                        .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: this.FACE_DETECT_INPUT_SIZE, scoreThreshold: this.FACE_DETECT_SCORE_THRESHOLD }))
                        .withFaceLandmarks(true); // true = pakai model landmark "tiny" (ringan) - lihat _loadFaceModels
                    detected = !!result;
                    landmarks = result ? result.landmarks : null;
                } else {
                    const result = await faceapi
                        .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: this.FACE_DETECT_INPUT_SIZE, scoreThreshold: this.FACE_DETECT_SCORE_THRESHOLD }));
                    detected = !!result;
                }
            } catch (e) {
                detected = false;
            }

            // Redam kedip-kedip hijau/kuning: kalau frame kali ini "gagal"
            // padahal frame sebelumnya berhasil, jangan langsung dianggap
            // wajah hilang - baru dianggap benar-benar tidak ada kalau
            // gagal 2 kali berturut-turut. Wajah yang memang sudah pergi
            // dari kamera tetap akan terdeteksi hilang dalam waktu <300ms,
            // jadi tidak mengurangi keamanan (liveness/kecocokan wajah
            // tetap dicek terpisah, tidak terpengaruh oleh ini).
            if (detected) {
                this._missedDetectFrames = 0;
            } else {
                this._missedDetectFrames = (this._missedDetectFrames || 0) + 1;
                if (this._missedDetectFrames <= 1 && this.faceDetected) {
                    detected = true;
                }
            }

            this.faceDetected = detected;
            if (detected && !this._faceFirstDetectedAt) this._faceFirstDetectedAt = Date.now();
            if (landmarks) this._trackBlink(landmarks);
            this._updateFaceOverlay(detected);

            // Lacak berapa lama wajah terdeteksi TERUS-MENERUS tanpa putus -
            // dipakai buat auto-capture di bawah, supaya tidak langsung
            // ambil foto dari sekilas lirikan/wajah lewat, tapi nunggu
            // sedikit stabil dulu (>=800ms).
            if (detected) {
                if (!this._stableFaceSince) this._stableFaceSince = Date.now();
            } else {
                this._stableFaceSince = null;
            }

            // Liveness kedip mata WAJIB sebelum tombol/auto-capture dianggap
            // siap (lihat livenessDetected/_trackBlink) - foto/kertas statis
            // tidak akan pernah bisa berkedip, jadi ini mencegah kasus foto
            // dicetak lolos absen. Identitas (cocok/tidak dengan foto
            // profil) tetap dicek terpisah di capturePhoto().
            const readyToCapture = detected && this.livenessDetected && !this._faceMismatchRetrying;
            this._updateCaptureButtonState(detected, readyToCapture, this._faceMismatchRetrying);

            // Auto-capture: begitu wajah stabil terdeteksi (>=800ms) DAN
            // kedipan sudah terekam (liveness) DAN lokasi sudah terverifikasi
            // DAN tidak sedang cooldown dari percobaan sebelumnya - langsung
            // panggil capturePhoto() tanpa perlu user menekan tombol.
            // capturePhoto() sendiri yang menentukan sukses/gagal (termasuk
            // cocok/tidak dengan foto profil) dan langsung lanjut submit
            // otomatis kalau berhasil.
            const stableEnough = this._stableFaceSince && (Date.now() - this._stableFaceSince) >= 800;
            const cooldownOk = Date.now() >= (this._autoCaptureNextAllowedAt || 0);
            if (stableEnough && cooldownOk && this.livenessDetected && this.locationVerified && !this.photoCaptured) {
                // Jangan coba lagi otomatis sebelum jeda ini lewat - hindari
                // spam percobaan/toast kalau capturePhoto() gagal (mis. wajah
                // tidak terdeteksi lagi di frame final).
                this._autoCaptureNextAllowedAt = Date.now() + 3000;
                this.capturePhoto();
            }

            // Kasih tahu karyawan (bukan cuma diam disabled) kalau proses
            // terlalu lama - bantu troubleshoot (kamera/pencahayaan/lokasi).
            if (!this.photoCaptured) {
                const sinceStart = Date.now() - this._loopStartedAt;
                if (!detected && !this._noFaceWarnShown && sinceStart > 15000) {
                    this._noFaceWarnShown = true;
                    toast.error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera dan pencahayaan cukup.');
                } else if (detected && !this.livenessDetected && !this._blinkHintShown && sinceStart > 8000) {
                    this._blinkHintShown = true;
                    toast.info('Silakan berkedip sekali secara normal di depan kamera untuk verifikasi.');
                }
            }

            if (this._detectionActive) {
                // Selama masih menunggu kedipan, pindai lebih rapat (100ms)
                // supaya kedipan yang cepat tidak kelewat di antara 2 sample -
                // begitu kedipan sudah terekam, balik ke 150ms (lebih hemat
                // baterai/CPU, karena tinggal cek wajah masih ada atau tidak).
                const nextDelay = this.livenessDetected ? 150 : 100;
                this._detectLoopId = setTimeout(tick, nextDelay);
            }
        };

        tick();
    },

    // Update tampilan indikator status "Absen Sekarang" (SEKARANG BUKAN
    // TOMBOL LAGI - lihat index.html, elemen id="btn-capture" sudah diubah
    // jadi <div> dengan pointer-events:none) selama proses verifikasi
    // wajah/liveness berjalan, supaya karyawan tahu sistem masih memproses
    // (bukan macet/diam). Foto tetap diambil & disubmit OTOMATIS lewat
    // auto-capture di _startFaceDetectionLoop() - tidak pernah menunggu
    // ditekan, jadi teksnya sengaja tidak pernah berbunyi ajakan klik.
    _updateCaptureButtonState(detected, ready, mismatchRetrying) {
        const captureBtn = document.getElementById('btn-capture');
        if (!captureBtn || this.photoCaptured) return;
        captureBtn.disabled = !ready;
        const icon = captureBtn.querySelector('i');
        const label = captureBtn.querySelector('span');
        if (ready) {
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            if (label) label.textContent = 'Wajah terverifikasi, memproses...';
        } else if (mismatchRetrying) {
            if (icon) icon.className = 'fas fa-redo fa-spin';
            if (label) label.textContent = 'Wajah tidak cocok, mencoba lagi...';
        } else if (detected && !this.livenessDetected) {
            if (icon) icon.className = 'fas fa-eye';
            if (label) label.textContent = 'Wajah terdeteksi, silakan berkedip...';
        } else {
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            if (label) label.textContent = detected ? 'Memverifikasi otomatis...' : 'Menunggu wajah...';
        }
    },

    /**
     * Hitung posisi horizontal ujung hidung relatif terhadap lebar wajah
     * (yaw ratio, ~0.5 kalau menghadap lurus ke kamera), lalu lacak
     * transisi "netral -> menoleh -> netral" sebagai 1 gerakan menoleh
     * alami. Foto/screenshot yang ditodongkan ke kamera tidak akan pernah
     * menghasilkan transisi ini (posisi wajahnya selalu diam persis sama),
     * jadi ini jadi pertahanan utama terhadap serangan "foto statis".
     */
    _trackHeadTurn(landmarks) {
        if (!landmarks) return;
        try {
            const jaw = landmarks.getJawOutline(); // 17 titik, index 0 & 16 = pinggir kiri/kanan wajah
            const nose = landmarks.getNose();      // 9 titik, index 3 = ujung hidung (titik 30 di penomoran dlib)

            const faceLeftX  = jaw[0].x;
            const faceRightX = jaw[16].x;
            const noseTipX   = nose[3].x;
            const faceWidth  = faceRightX - faceLeftX;
            if (Math.abs(faceWidth) < 1) return; // landmark tidak wajar, lewati frame ini

            const yawRatio = (noseTipX - faceLeftX) / faceWidth;

            // Tahap kalibrasi: kumpulkan beberapa sampel yawRatio pertama
            // sebagai baseline "menghadap lurus ke kamera". Sampel yang
            // jauh berbeda dari rata-rata sejauh ini diabaikan (kemungkinan
            // besar kebetulan lagi menoleh pas kalibrasi), supaya baseline
            // tidak keburu miring gara-gara itu.
            if (this._yawBaseline === null) {
                const runningAvg = this._yawBaselineCount > 0 ? (this._yawBaselineSum / this._yawBaselineCount) : null;
                if (runningAvg === null || Math.abs(yawRatio - runningAvg) < 0.08) {
                    this._yawBaselineSum += yawRatio;
                    this._yawBaselineCount++;
                }
                if (this._yawBaselineCount >= 6) {
                    this._yawBaseline = this._yawBaselineSum / this._yawBaselineCount;
                }
                return; // belum mulai lacak gerakan menoleh selama masih kalibrasi
            }

            const deviation = Math.abs(yawRatio - this._yawBaseline);

            if (deviation > this.YAW_TURN_THRESHOLD) {
                this._headWasTurned = true;
            } else if (deviation < this.YAW_RETURN_THRESHOLD && this._headWasTurned) {
                // Sempat menoleh, sekarang menghadap kamera lagi -> 1
                // gerakan menoleh lengkap terekam.
                this.livenessDetected = true;
                this._headWasTurned = false;
            }
        } catch (e) {
            // Landmark gagal dihitung di frame ini - lewati, dicoba lagi di
            // tick berikutnya (150ms kemudian).
        }
    },

    // Jarak Euclidean 2D antar 2 titik landmark {x,y}.
    _dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    },

    /**
     * Hitung EAR (Eye Aspect Ratio) 1 mata dari 6 titik landmarknya (urutan
     * dlib/face-api.js: titik 0 & 3 = sudut kiri/kanan mata, titik 1,2,4,5 =
     * tepi kelopak atas/bawah). Rasio ini besar saat mata terbuka dan
     * mengecil tajam saat merem - dasar dari _trackBlink() di bawah.
     */
    _calcEAR(eye) {
        if (!eye || eye.length < 6) return null;
        const horizontal = this._dist(eye[0], eye[3]);
        if (horizontal < 1) return null;
        const vertical = this._dist(eye[1], eye[5]) + this._dist(eye[2], eye[4]);
        return vertical / (2 * horizontal);
    },

    /**
     * Hitung EAR rata-rata kedua mata tiap frame, lalu lacak transisi
     * "melek -> merem -> melek" sebagai 1 kedipan alami (liveness). Foto/
     * kertas yang ditodongkan ke kamera tidak akan pernah bisa "berkedip"
     * (rasio matanya diam persis sama tiap frame), jadi ini jadi pertahanan
     * utama terhadap serangan foto statis - dipilih ketimbang liveness
     * menoleh (_trackHeadTurn di atas, sudah tidak dipakai) karena kedip
     * jauh lebih cepat dilakukan orang & lebih cepat kelihatan hasilnya di
     * sini, sehingga tidak bikin user menunggu lama seperti sebelumnya.
     */
    _trackBlink(landmarks) {
        if (!landmarks) return;
        try {
            const leftEAR = this._calcEAR(landmarks.getLeftEye());
            const rightEAR = this._calcEAR(landmarks.getRightEye());
            if (leftEAR === null || rightEAR === null) return;
            const ear = (leftEAR + rightEAR) / 2;

            // Tahap kalibrasi: kumpulkan beberapa sampel EAR pertama sebagai
            // baseline "mata terbuka normal". Sampel yang jauh beda dari
            // rata-rata sejauh ini diabaikan (kemungkinan besar kebetulan
            // lagi berkedip pas kalibrasi), supaya baseline tidak keburu
            // rendah gara-gara itu. Jumlah sampelnya sengaja sedikit (lihat
            // EAR_CALIBRATION_SAMPLES) supaya kalibrasi kelar dalam
            // hitungan sepersekian detik, bukan bikin user menunggu.
            if (this._earBaseline === null) {
                const runningAvg = this._earBaselineCount > 0 ? (this._earBaselineSum / this._earBaselineCount) : null;
                if (runningAvg === null || Math.abs(ear - runningAvg) < 0.09) {
                    this._earBaselineSum += ear;
                    this._earBaselineCount++;
                }
                if (this._earBaselineCount >= this.EAR_CALIBRATION_SAMPLES) {
                    this._earBaseline = this._earBaselineSum / this._earBaselineCount;
                    this._blinkWaitStartedAt = Date.now(); // mulai hitung mundur pelonggaran dari sini
                }
                return; // belum mulai lacak kedipan selama masih kalibrasi
            }

            // Pelonggaran bertahap - lihat penjelasan di EAR_RELAX_STEP_MS.
            let relaxSteps = 0;
            if (this._blinkWaitStartedAt) {
                relaxSteps = Math.min(
                    this.EAR_RELAX_MAX_STEPS,
                    Math.floor((Date.now() - this._blinkWaitStartedAt) / this.EAR_RELAX_STEP_MS)
                );
            }
            const relaxAmount = relaxSteps * this.EAR_RELAX_STEP_AMOUNT;
            const closeLimit = this._earBaseline * (this.EAR_CLOSE_RATIO + relaxAmount);
            const openLimit = this._earBaseline * this.EAR_OPEN_RATIO;

            if (ear < closeLimit) {
                this._eyesClosed = true;
            } else if (ear > openLimit && this._eyesClosed) {
                // Sempat merem, sekarang melek lagi -> 1 kedipan lengkap
                // terekam.
                this.livenessDetected = true;
                this._eyesClosed = false;
            }
        } catch (e) {
            // Landmark gagal dihitung di frame ini - lewati, dicoba lagi di
            // tick berikutnya (150ms kemudian).
        }
    },

    _stopFaceDetectionLoop() {
        this._detectionActive = false;
        if (this._detectLoopId) {
            clearTimeout(this._detectLoopId);
            this._detectLoopId = null;
        }
    },

    // Ubah tampilan frame & teks panduan sesuai status deteksi wajah &
    // liveness (kedip mata) - verifikasi identitas ke foto profil berjalan
    // otomatis terpisah di capturePhoto().
    _updateFaceOverlay(detected) {
        const frame = document.querySelector('#face-overlay .face-frame');
        const guideIcon = document.querySelector('#face-overlay .face-guide i');
        const guideText = document.querySelector('#face-overlay .face-guide p');

        if (frame) frame.classList.toggle('detected', detected);
        if (guideIcon) guideIcon.classList.toggle('detected', detected);
        if (guideText) {
            if (!this.modelsLoaded) {
                // Model deteksi wajah gagal dimuat (lihat cabang !ready di
                // initCamera()) - tidak ada cara mendeteksi wajah beneran,
                // tapi absen tetap diproses otomatis (fail-open, lihat
                // tick() di _startFaceDetectionLoop). Kasih tahu apa
                // adanya, supaya karyawan tidak bingung kenapa kotaknya
                // tidak pernah berubah warna berdasarkan wajahnya sendiri.
                guideText.textContent = 'Deteksi wajah tidak tersedia (periksa koneksi internet) - foto diambil otomatis...';
            } else if (!detected) {
                guideText.textContent = 'Wajah tidak terlihat - posisikan wajah di dalam frame';
            } else if (!this.livenessDetected && !this.photoCaptured) {
                guideText.textContent = 'Wajah terdeteksi - silakan berkedip sekali secara normal';
            } else if (!this.photoCaptured) {
                guideText.textContent = 'Wajah terverifikasi - memverifikasi otomatis, tetap diam sebentar...';
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
     * Ambil alamat asli dari koordinat GPS (reverse geocoding) - lewat
     * BACKEND (Attendance.gs > reverseGeocodeCoords()), BUKAN fetch()
     * langsung ke Nominatim dari browser seperti sebelumnya. Nominatim
     * sering menolak/tidak konsisten kasih izin CORS untuk pemanggilan
     * langsung dari browser (kebijakan pemakaian mereka memang lebih
     * mengarahkan ke pemanggilan server-ke-server, bukan client-side),
     * jadi dipindah ke backend yang sama sekali tidak kena batasan CORS.
     * Balikin '' kalau gagal (offline, timeout, dll) supaya pemanggilnya
     * bisa fallback ke teks lain.
     */
    async _reverseGeocode(lat, lng) {
        try {
            const result = await api.reverseGeocode(lat, lng);
            return (result && result.success && result.data) ? (result.data.address || '') : '';
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
            infoEl.textContent = `Anda terdeteksi ${ctx.distance}m dari ${ctx.nearest.nama}. Anda tetap boleh absen - jelaskan dulu sedang di mana/mengerjakan apa.`;
        }
        if (modal) modal.style.display = 'flex';

        // Kunci scroll body selama modal ini terbuka. Modal-nya position:fixed,
        // tapi TANPA ini halaman di belakangnya (yang isinya video kamera live
        // absen, terus repaint tiap frame) masih ikut bisa discroll bareng
        // konten modal saat karyawan slide ke bawah di form catatan+foto -
        // ikut bergesernya latar belakang video itu yang kelihatan seperti
        // kedap-kedip di HP. Dibuka lagi di submitOutOfRadiusNote()/
        // cancelOutOfRadiusNote() begitu modal ditutup.
        this._lockBodyScroll();

        // Modal ini pakai latar semi-transparan (lihat .modal-overlay di
        // modal.css: rgba(0,0,0,0.5)) - kalau loop deteksi wajah dibiarkan
        // tetap jalan di belakangnya, kotak hijau/overlay kamera yang
        // menyala-mati tiap 150ms tetap kelihatan "kedap-kedip" tembus dari
        // balik modal. Hentikan dulu selama modal ini terbuka, nanti
        // dinyalakan lagi di submitOutOfRadiusNote()/cancelOutOfRadiusNote()
        // (lewat _restartCameraIfNeeded()) begitu modalnya ditutup.
        this._stopFaceDetectionLoop();
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

    /**
     * Cek apakah stream kamera ABSEN (getUserMedia, bukan foto dokumentasi
     * luar radius) masih hidup - lalu nyalakan ulang kalau ternyata sudah
     * mati. Dipanggil setelah modal catatan luar radius ditutup, karena
     * input foto dokumentasinya pakai capture="environment" yang di HP
     * membuka APLIKASI KAMERA BAWAAN (bukan cuma galeri) - browser jadi
     * di-background sebentar, dan kebanyakan browser mobile OTOMATIS
     * MEMATIKAN stream getUserMedia saat halaman di-background (cuma 1
     * aplikasi yang boleh pakai hardware kamera dalam satu waktu). Begitu
     * kembali ke halaman, video absen jadi blank/hitam kalau tidak
     * dinyalakan ulang di sini.
     */
    _restartCameraIfNeeded() {
        const tracks = this.stream ? this.stream.getVideoTracks() : [];
        const stillLive = tracks.length > 0 && tracks.every(t => t.readyState === 'live');
        if (!stillLive) {
            // Stream sudah mati - initCamera() minta stream baru, lalu
            // otomatis menyalakan lagi loop deteksi wajahnya sendiri begitu
            // video metadata siap (lihat video.onloadedmetadata di dalamnya).
            this.initCamera();
        } else if (!this.photoCaptured) {
            // Stream masih hidup (mis. modal cuma dibuka lalu ditutup tanpa
            // sempat ambil foto) - loop deteksinya tadi sengaja dihentikan
            // di _promptOutOfRadiusNote() supaya tidak kedap-kedip tembus
            // dari balik modal yang semi-transparan. Nyalakan lagi di sini.
            //
            // BUGFIX (2026-08-29): sebelumnya syaratnya "this.modelsLoaded
            // && !this.photoCaptured" - dulu itu valid karena kalau model
            // gagal dimuat, loop-nya memang TIDAK PERNAH dinyalakan sama
            // sekali (lihat initCamera()), jadi tidak ada yang perlu
            // dinyalakan ulang di sini. Sekarang loop tetap jalan juga di
            // kasus model gagal dimuat itu (fail-open, lihat tick() &
            // _updateFaceOverlay()), jadi syarat modelsLoaded ini
            // dilepas - kalau tidak, loop-nya justru tidak akan menyala
            // lagi setelah modal luar-radius ditutup buat karyawan yang
            // kebetulan kena kasus model gagal dimuat ini.
            this._startFaceDetectionLoop();
        }
    },

    /**
     * Kunci/buka scroll halaman di belakang modal luar-radius - lihat catatan
     * di _promptOutOfRadiusNote(). Pakai teknik position:fixed pada <body>
     * (bukan cuma overflow:hidden) supaya aman juga untuk Safari iOS, yang
     * kadang tetap membolehkan "rubber-band scroll" background walau body
     * sudah overflow:hidden.
     */
    _lockBodyScroll() {
        this._scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this._scrollLockY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
    },

    _unlockBodyScroll() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, this._scrollLockY || 0);
        this._scrollLockY = 0;
    },

    submitOutOfRadiusNote() {
        const textarea = document.getElementById('out-of-radius-note-text');
        const note = textarea ? textarea.value.trim() : '';
        if (!note) {
            toast.error('Catatan alasan wajib diisi sebelum bisa absen.');
            return;
        }

        // TAMBAHAN: Foto Dokumentasi sekarang WAJIB diisi (sebelumnya
        // opsional) - lihat this._outOfRadiusPhoto yang diisi oleh
        // previewOutOfRadiusPhoto() setelah user mengambil gambar lewat
        // tombol "Ambil Gambar".
        if (!this._outOfRadiusPhoto) {
            toast.error('Foto dokumentasi wajib diambil sebelum bisa absen.');
            return;
        }

        this._outOfRadiusNote = note;
        this.locationVerified = true;

        const modal = document.getElementById('modal-out-of-radius-note');
        if (modal) modal.style.display = 'none';
        this._unlockBodyScroll();

        const statusEl = document.getElementById('location-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terverifikasi (Luar Radius, tercatat)';
            statusEl.classList.add('verified');
            statusEl.classList.remove('out-of-range');
        }

        this.checkCanSubmit();
        this._restartCameraIfNeeded();
    },

    cancelOutOfRadiusNote() {
        const modal = document.getElementById('modal-out-of-radius-note');
        if (modal) modal.style.display = 'none';
        this._unlockBodyScroll();
        // locationVerified tetap false - karyawan bisa klik "Coba Lagi" lokasi
        const retryBtn = document.getElementById('btn-retry-location');
        if (retryBtn) retryBtn.style.display = 'flex';
        this._restartCameraIfNeeded();
    },

    /**
     * Munculkan modal wajib isi catatan untuk karyawan yang absen MASIH di
     * dalam radius sebuah kantor, tapi kantor itu bukan Unit Wilayah yang
     * ditugaskan untuknya. Beda dari _promptOutOfRadiusNote(): tidak ada
     * foto dokumentasi (cukup catatan saja) - lihat instruksi awal fitur
     * ini.
     */
    _promptOutOfWilayahNote(ctx) {
        this._outOfWilayahContext = ctx;
        const modal = document.getElementById('modal-out-of-wilayah-note');
        const textarea = document.getElementById('out-of-wilayah-note-text');
        const infoEl = document.getElementById('out-of-wilayah-note-info');
        if (textarea) textarea.value = '';
        if (infoEl) {
            infoEl.textContent = `Anda absen di ${ctx.nearest.nama}, sementara Unit Wilayah Anda terdaftar sebagai ${ctx.userWilayah}. Anda tetap boleh absen - jelaskan dulu alasannya.`;
        }
        if (modal) modal.style.display = 'flex';
        this._lockBodyScroll();
        this._stopFaceDetectionLoop();
    },

    /**
     * Modal ini SENGAJA tidak punya jalan pintas keluar - klik "Batal"/
     * tutup modal TIDAK membuat locationVerified jadi true, jadi tombol
     * absen tetap terkunci. Yang berubah cuma modalnya ditutup sementara;
     * status lokasi diganti jadi teks yang bisa diklik lagi untuk membuka
     * ulang modal ini, supaya karyawan tetap wajib mengisi catatan dulu
     * sebelum bisa absen (sesuai permintaan fitur ini).
     */
    cancelOutOfWilayahNote() {
        const modal = document.getElementById('modal-out-of-wilayah-note');
        if (modal) modal.style.display = 'none';
        this._unlockBodyScroll();

        const statusEl = document.getElementById('location-status');
        if (statusEl && this._outOfWilayahContext) {
            statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#D97706;"></i> <span style="color:#D97706;text-decoration:underline;cursor:pointer;" onclick="faceRecognition._promptOutOfWilayahNote(faceRecognition._outOfWilayahContext)">Di luar Unit Wilayah - klik untuk isi catatan</span>';
            statusEl.classList.remove('verified');
            statusEl.classList.add('out-of-range');
        }
        this._restartCameraIfNeeded();
    },

    submitOutOfWilayahNote() {
        const textarea = document.getElementById('out-of-wilayah-note-text');
        const note = textarea ? textarea.value.trim() : '';
        if (!note) {
            toast.error('Catatan alasan wajib diisi sebelum bisa absen.');
            return;
        }

        this._outOfWilayahNote = note;
        this.locationVerified = true;

        const modal = document.getElementById('modal-out-of-wilayah-note');
        if (modal) modal.style.display = 'none';
        this._unlockBodyScroll();

        const statusEl = document.getElementById('location-status');
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terverifikasi (Luar Unit Wilayah, tercatat)';
            statusEl.classList.add('verified');
            statusEl.classList.remove('out-of-range');
        }

        this.checkCanSubmit();
        this._restartCameraIfNeeded();
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

                // Absen di luar radius sekarang berlaku untuk SEMUA
                // karyawan (bukan cuma yang dulu ditandai "Pekerja
                // Lapangan") - kalau di luar radius, wajib isi catatan
                // alasan dulu (lihat _promptOutOfRadiusNote), laporannya
                // dikirim ke approver yang ditunjuk Admin untuk karyawan
                // ini. Backend TETAP jadi penentu akhir/wajib (lihat
                // Attendance.gs), ini cuma untuk UX di layar.
                let exemptUserId = null;
                try {
                    const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
                    if (user && user.id) exemptUserId = user.employeeId || user.id;
                } catch (e) { /* lanjut tanpa userId, backend tetap validasi ulang */ }

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

                    if (!inRadius) {
                        // Semua karyawan (bukan cuma yang dulu ditandai
                        // "Pekerja Lapangan") tetap boleh absen di luar
                        // radius, tapi wajib isi catatan alasan dulu -
                        // laporannya dikirim ke approver yang ditunjuk Admin
                        // untuk karyawan ini.
                        if (statusEl) {
                            statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#D97706;"></i> <span style="color:#D97706;">Di luar radius - isi catatan untuk lanjut</span>';
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

                    // Karyawan masuk radius salah satu kantor, TAPI kantor
                    // terdekat itu belum tentu Unit Wilayah yang ditugaskan
                    // untuknya (mis. karyawan Unit Wilayah "SPAM Danau
                    // Panggang" absen di kantor "BNA Amuntai"). Cek ini
                    // HANYA kalau unitWilayah karyawan memang cocok dengan
                    // salah satu NAMA lokasi kantor yang terdaftar di
                    // Settings - skema SATPAM/TRD menyimpan "SATPAM"/"TRD"
                    // di field yang sama (lihat karyawan.js), jadi otomatis
                    // dilewati karena nilainya tidak akan pernah cocok
                    // dengan nama lokasi kantor manapun.
                    let userWilayah = '';
                    try {
                        const u = auth.getCurrentUser ? auth.getCurrentUser() : null;
                        userWilayah = (u && u.unitWilayah) ? String(u.unitWilayah).trim() : '';
                    } catch (e) { /* lanjut tanpa unitWilayah */ }

                    const wilayahIsKnownOffice = userWilayah && officeLocations.some(
                        loc => String(loc.nama || '').trim().toLowerCase() === userWilayah.toLowerCase()
                    );

                    if (wilayahIsKnownOffice && nearest.nama &&
                        nearest.nama.trim().toLowerCase() !== userWilayah.toLowerCase()) {
                        if (statusEl) {
                            statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#D97706;"></i> <span style="color:#D97706;">Di luar Unit Wilayah - isi catatan untuk lanjut</span>';
                            statusEl.classList.remove('verified');
                            statusEl.classList.add('out-of-range');
                        }
                        this._renderRealMap(mapEl, userLat, userLng, position.coords.accuracy);
                        this.locationVerified = false;
                        this.checkCanSubmit();
                        this._promptOutOfWilayahNote({
                            userId: exemptUserId,
                            userLat, userLng,
                            distance,
                            nearest,
                            userWilayah
                        });
                        return;
                    }

                    if (statusEl) {
                        statusEl.innerHTML = `<i class="fas fa-check-circle"></i> Terverifikasi (${distance}m dari ${nearest.nama})`;
                        statusEl.classList.add('verified');
                        statusEl.classList.remove('out-of-range');
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

        // Jaring pengaman ANTI-DOBEL-SUBMIT: kalau proses capture SEDANG
        // berjalan (baik dipicu klik manual atau auto-capture dari loop
        // deteksi), abaikan panggilan susulan sampai proses ini selesai/
        // gagal. Tanpa ini, klik manual yang kebetulan bersamaan dengan
        // auto-capture (atau auto-capture yang keduanya sempat lolos
        // giliran karena verifikasi wajah/identitas makan waktu lebih dari
        // 150ms sebelum this.photoCaptured sempat di-set true) bisa
        // memicu confirmAttendance() 2x - absen tercatat dobel di
        // database DAN notifikasi sukses juga muncul dobel.
        if (this._captureInFlight) return;
        this._captureInFlight = true;

        // Sekarang cuma ada 1 tombol ("Absen Sekarang") yang sekaligus ambil
        // foto & submit absensi - jadi lokasi WAJIB divalidasi duluan di sini,
        // sebelum foto diambil, supaya tidak ada foto yang "kepotong di
        // tengah" gara-gara ternyata lokasinya belum/tidak valid.
        //
        // PERBAIKAN: sebelumnya kalau karyawan menekan "Batal" di modal
        // Catatan Luar Radius lalu langsung coba tekan tombol absen lagi
        // (tanpa lewat "Coba Lagi"), di sini cuma muncul toast error biasa
        // - modalnya sendiri TIDAK otomatis muncul lagi, jadi kesannya
        // seperti "mentok" tanpa arahan jelas kalau catatan itu WAJIB
        // diisi dulu. Sekarang: kalau this._outOfRadiusContext masih ada
        // (artinya sudah pernah terdeteksi di luar radius & modalnya
        // sempat di-Batal, belum pernah disubmit), paksa munculkan lagi
        // modal yang SAMA setiap kali tombol absen ditekan - karyawan
        // benar-benar tidak bisa lanjut absen tanpa mengisi laporan ini.
        if (!this.locationVerified) {
            if (this._outOfRadiusContext) {
                this._promptOutOfRadiusNote(this._outOfRadiusContext);
            } else {
                toast.error('Lokasi belum terverifikasi. Mohon tunggu sebentar, lalu coba lagi.');
            }
            this._captureInFlight = false;
            return;
        }

        // Jaga-jaga (defense in depth) - normalnya auto-capture di loop
        // deteksi sudah tidak akan memanggil capturePhoto() sebelum
        // livenessDetected true (lihat _startFaceDetectionLoop), tapi
        // dicek ulang di sini supaya tetap aman kalau capturePhoto()
        // suatu saat dipanggil dari jalur lain.
        if (this.faceRecognitionEnabled && !this.livenessDetected) {
            this._captureInFlight = false;
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

            // Dulu cuma dicek kalau toggle Face Recognition ON. Sekarang tetap
            // dicek juga saat OFF (this.modelsLoaded baru true kalau
            // _loadFaceModels() di initCamera() sempat berhasil dimuat -
            // lihat pemanggilannya di sana untuk kedua mode) supaya foto yang
            // benar-benar tidak ada wajahnya tertangkap sebelum masuk ke
            // pencocokan identitas di bawah. Fail-open (faceOk tetap
            // this.faceDetected, yaitu true) kalau modelnya belum/gagal
            // dimuat, sama seperti sebelumnya.
            faceOk = this.faceDetected; // fallback kalau model gagal load (lihat _loadFaceModels)
            if (this.modelsLoaded && typeof faceapi !== 'undefined') {
                try {
                    const result = await faceapi.detectSingleFace(
                        this.canvas,
                        new faceapi.TinyFaceDetectorOptions({ inputSize: this.FACE_DETECT_INPUT_SIZE, scoreThreshold: this.FACE_DETECT_SCORE_THRESHOLD })
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
                this._captureInFlight = false;
                return;
            }

            // Cocokkan wajah di foto ini dengan foto profil karyawan yang
            // sedang login - supaya tidak bisa "titip absen" pakai akun
            // orang lain. Tetap dijalankan baik toggle Face Recognition di
            // Settings admin ON maupun OFF (OFF cuma melewati liveness/kamera
            // live-nya saja, lihat komentar di _loadFaceRecognitionSetting()).
            //
            // PERBAIKAN (2026-08-20): SEBELUMNYA kalau wajah tidak cocok
            // (atau tidak sempat diverifikasi sama sekali), absen tetap
            // diloloskan (fail-open) - cuma ditandai flag utk ditinjau
            // admin belakangan, TIDAK benar-benar dicegah saat itu juga.
            // Artinya siapa saja bisa "titip absen" pakai wajah orang
            // lain dan tetap tercatat. Sekarang absen BENAR-BENAR ditolak
            // & diulang otomatis (kamera tetap jalan, tidak perlu keluar
            // masuk halaman) sampai wajah yang di kamera cocok dengan
            // foto profil. Kasus "belum ada foto profil sama sekali"
            // sudah dicegah lebih awal sebelum sampai ke halaman ini
            // (lihat _blockIfNoProfilePhoto() di absensi.js, yang
            // mengarahkan ke halaman Profil dulu) - jadi kalau di sini
            // ternyata tetap `!identity.checked`, itu murni kegagalan
            // teknis menghitung sidik wajah dari foto profil yang sudah
            // ada (link putus/model gagal dimuat/dsb), bukan alasan buat
            // meloloskan absen begitu saja.
            //
            // Akun demo (lihat _isDemoAccount() di absensi.js) sengaja
            // TETAP dikecualikan dari pencocokan ini - akun demo memang
            // tidak punya foto profil acuan sama sekali (_blockIfNoProfilePhoto
            // juga sudah melewatkannya), jadi tidak ada yang bisa
            // dicocokkan.
            this._lastFaceMatch = null;
            const _demoUser = auth.getCurrentUser();
            const _isDemo = !!(_demoUser && String(_demoUser.username || '').trim().toLowerCase() === 'demo');
            // Dulu blok ini cuma jalan kalau toggle Face Recognition ON.
            // Sekarang TETAP jalan walau OFF - bedanya cuma OFF tidak
            // mewajibkan liveness (kedip mata) dulu sebelum sampai sini,
            // jadi yang dibandingkan adalah foto statis yang baru saja
            // diambil, bukan hasil verifikasi wajah live.
            if (!_isDemo) {
                const identity = await this._verifyFaceIdentity();

                if (!identity.checked || !identity.matched) {
                    // Wajah tidak cocok DENGAN foto profil, atau gagal
                    // diverifikasi sama sekali - tolak, jangan lanjut ke
                    // status "Wajah Terverifikasi"/confirmAttendance().
                    // Kamera & loop deteksi dibiarkan tetap jalan supaya
                    // otomatis mencoba ulang begitu wajah stabil terdeteksi
                    // lagi (lihat cooldown _autoCaptureNextAllowedAt di
                    // _startFaceDetectionLoop()) - karyawan tinggal
                    // memperbaiki posisi/pencahayaan tanpa perlu keluar
                    // masuk halaman lagi. Berlaku sama untuk toggle ON
                    // maupun OFF, karena keduanya sekarang sama-sama
                    // menjalankan loop deteksi ini (lihat initCamera()) -
                    // bedanya cuma OFF tidak mewajibkan liveness kedip mata.
                    this._faceMismatchRetrying = true;
                    if (!this._mismatchToastShown) {
                        this._mismatchToastShown = true;
                        toast.error(identity.checked
                            ? 'Wajah tidak cocok dengan foto profil Anda. Absen ditolak, silakan coba lagi.'
                            : 'Wajah tidak dapat diverifikasi (foto profil bermasalah). Silakan coba lagi atau perbarui foto profil Anda.');
                    }
                    setTimeout(() => {
                        this._faceMismatchRetrying = false;
                        this._mismatchToastShown = false;
                    }, 3000);

                    this.photoCaptured = false;
                    this._captureInFlight = false;
                    if (scanningLine) scanningLine.style.display = 'block';
                    return;
                }

                this._faceMismatchRetrying = false;
                // Simpan hasilnya untuk dikirim bareng data absensi (dibaca
                // di confirmAttendance) - dipakai buat menandai kecocokan
                // yang "kurang yakin" (distance di antara threshold &
                // FACE_MATCH_CONFIDENT_ZONE) supaya admin bisa tinjau ulang,
                // walau absennya sendiri sudah dinyatakan cocok & lolos.
                this._lastFaceMatch = identity;
            }

            // Show verification success
            const statusEl = document.getElementById('verification-status');
            if (statusEl) {
                statusEl.classList.add('show');
            }

            // Stop camera
            this.stopCamera();

            // Simpan foto sebagai JPEG terkompresi (bukan PNG mentah) - PNG
            // dari video 1280x720 bisa beberapa MB, itu yang bikin proses
            // "upload ke server & simpan ke Drive" (Attendance.gs) kerasa
            // lama sekali walau di layar sudah kelihatan "Wajah
            // Terverifikasi". JPEG kualitas 0.85 ukurannya jauh lebih kecil
            // tapi masih cukup jelas untuk kebutuhan absensi/tinjauan admin.
            // Dihitung SEKALI di sini lalu dipakai juga di confirmAttendance()
            // (this._capturedPhotoDataUrl) supaya tidak di-encode dua kali.
            this._capturedPhotoDataUrl = this.canvas.toDataURL('image/jpeg', 0.85);

            // Show captured photo
            const preview = document.getElementById('camera-preview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${this._capturedPhotoDataUrl}" class="captured-photo" alt="Captured">
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
            this._captureInFlight = false;

            // Langsung lanjut submit absensi otomatis - tidak perlu klik
            // tombol konfirmasi terpisah lagi (dulu ada 2 tombol, sekarang
            // digabung jadi 1 aksi).
            this.confirmAttendance();
        })();
    },

    retakePhoto() {
        this.photoCaptured = false;
        this._captureInFlight = false;
        this.faceDetected = false;
        this.livenessDetected = false;
        this._headWasTurned = false;
        this._yawBaseline = null;
        this._yawBaselineSum = 0;
        this._yawBaselineCount = 0;
        this._earBaseline = null;
        this._earBaselineSum = 0;
        this._earBaselineCount = 0;
        this._eyesClosed = false;
        this._blinkWaitStartedAt = null;
        this._stableFaceSince = null;
        this._autoCaptureNextAllowedAt = 0;
        this._mismatchToastShown = false;
        this._lastFaceMatch = null;
        this._capturedPhotoDataUrl = null;
        this._missedDetectFrames = 0;

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
            photo: this._capturedPhotoDataUrl || (this.canvas ? this.canvas.toDataURL('image/jpeg', 0.85) : null),
            // Skor kecocokan wajah (jarak Euclidean, makin kecil makin mirip)
            // - dikosongkan kalau pencocokan tidak sempat dilakukan sama
            // sekali (fail-open, lihat _getReferenceDescriptor). Penanda
            // "perlu ditinjau admin" dipasang untuk DUA kasus: kecocokan
            // yang tidak sepenuhnya yakin (lihat FACE_MATCH_CONFIDENT_ZONE)
            // MAUPUN saat verifikasi gagal dilakukan sama sekali - fail-open
            // artinya sistem TIDAK TAHU apakah wajahnya cocok atau tidak,
            // jadi tetap layak ditinjau manual, bukan dianggap "aman" begitu
            // saja.
            faceMatchScore: (this._lastFaceMatch && this._lastFaceMatch.checked && this._lastFaceMatch.distance != null)
                ? Number(this._lastFaceMatch.distance.toFixed(4)) : null,
            faceMatchFlag: (
                !this._lastFaceMatch || !this._lastFaceMatch.checked || (
                    this._lastFaceMatch.distance != null &&
                    this._lastFaceMatch.distance > this.FACE_MATCH_CONFIDENT_ZONE
                )
            )
        };

        // Store temporary data
        storage.set('temp_attendance', attendanceData);

        // Process based on action
        toast.success('Verifikasi berhasil!');

        // PERBAIKAN (2026-08-31): sebelumnya router.navigate('absensi') di
        // bawah baru dieksekusi SETELAH absen selesai tersimpan ke server
        // (dan setelah laporan luar-radius/wilayah kalau ada) - karyawan
        // jadi "menunggu" di layar Wajah Terverifikasi selama proses simpan
        // itu berlangsung. Sekarang navigate ke menu Absensi dilakukan
        // LANGSUNG di sini - begitu wajah cocok dengan foto profil,
        // verifikasinya sendiri sudah selesai, tinggal menyimpan datanya.
        // Proses simpan (& laporan tambahan luar-radius/wilayah kalau ada)
        // dilanjutkan di LATAR BELAKANG oleh IIFE di bawah, TIDAK lagi
        // memblokir navigate ini. Kalau ternyata gagal tersimpan, tetap
        // akan ketahuan (toast.error dari processWithVerification()/
        // saveAttendance()), cuma pemberitahuannya muncul SETELAH karyawan
        // sudah kembali ke menu, bukan sebelum.
        // BUGFIX (2026-08-31): diset SEBELUM navigate di bawah - lihat
        // catatan lengkap di handleClockIn() (absensi.js). Dibersihkan di
        // blok finally si IIFE di bawah, begitu proses simpan ini benar-
        // benar selesai (berhasil ataupun gagal).
        if (window.absensi) window.absensi._pendingAction = this.currentAction;

        // BUGFIX (2026-08-31): HARUS diambil SEBELUM router.navigate() di
        // bawah - navigate itu memicu absensi.init(), yang me-reset
        // window.absensi.attendanceData jadi {} SEBELUM baris
        // processWithVerification() di bawah sempat jalan (init() adalah
        // async function, tapi baris reset-nya sendiri ada SEBELUM await
        // pertamanya, jadi tetap jalan duluan meski navigate ini sendiri
        // tidak di-await). Tanpa snapshot ini, payload yang dikirim ke
        // backend kehilangan field "date" (dan clockIn/breakStart/dst dari
        // absen hari ini yang sudah ada) - absen jadi GAGAL TOTAL tersimpan
        // dengan pesan mentah dari backend "userId and date are required",
        // meski karyawan sudah terlanjur melihat "Wajah Terverifikasi".
        const attendanceSnapshot = window.absensi ? { ...window.absensi.attendanceData } : {};

        router.navigate('absensi');

        // Wrap in async IIFE - proses simpan & laporan tambahan berjalan di
        // latar belakang, tidak lagi menunda navigate di atas.
        (async () => {
            try {
                if (window.absensi) {
                    await window.absensi.processWithVerification(this.currentAction, attendanceData, attendanceSnapshot);
                }

                // PERBAIKAN PERFORMA (2026-08-29): laporan luar-radius/luar-
                // wilayah di bawah ini cuma catatan TAMBAHAN buat admin -
                // gagal kirim TIDAK membatalkan absen yang sudah tercatat di
                // atas (lihat catatan try/catch masing-masing, tidak berubah).
                // Sebelumnya kedua laporan ini di-AWAIT satu-satu sebelum
                // router.navigate() di bawah - kalau kena kasus luar radius/
                // luar wilayah, user jadi menunggu di halaman "Wajah
                // Terverifikasi" sampai 2 request tambahan ini juga selesai
                // (padahal absennya sendiri sudah sukses tersimpan duluan).
                // Sekarang absennya sudah tercatat -> LANGSUNG navigate ke
                // menu Absensi, laporan tambahan ini dikirim di LATAR
                // BELAKANG (tidak di-await) setelahnya.
                if (this._outOfRadiusNote && this._outOfRadiusContext) {
                    const currentUser = auth.getCurrentUser();
                    const ctx = this._outOfRadiusContext;
                    const note = this._outOfRadiusNote;
                    // Sudah dipastikan wajib ada isinya oleh validasi di
                    // submitOutOfRadiusNote() sebelum modal ini ditutup -
                    // fallback '' di sini murni jaga-jaga saja.
                    const photo = this._outOfRadiusPhoto || '';
                    this._outOfRadiusNote = null;
                    this._outOfRadiusPhoto = null;
                    this._outOfRadiusContext = null;
                    api.submitOutOfRadiusReport({
                        userId: currentUser?.employeeId || currentUser?.id || ctx.userId,
                        userName: currentUser?.name || '',
                        type: this._normalizeAttendanceType(this.currentAction),
                        note: note,
                        photo: photo,
                        lat: ctx.userLat,
                        lng: ctx.userLng,
                        distance: ctx.distance,
                        nearestOffice: ctx.nearest ? ctx.nearest.nama : ''
                    }).catch((e) => {
                        console.error('Gagal kirim laporan luar radius:', e);
                    });
                }

                // Kirim laporan luar-wilayah (kalau ada) - pola sama dengan
                // laporan luar-radius di atas (latar belakang, tidak
                // di-await).
                if (this._outOfWilayahNote && this._outOfWilayahContext) {
                    const currentUser = auth.getCurrentUser();
                    const ctx = this._outOfWilayahContext;
                    const note = this._outOfWilayahNote;
                    this._outOfWilayahNote = null;
                    this._outOfWilayahContext = null;
                    api.submitOutOfWilayahReport({
                        userId: currentUser?.employeeId || currentUser?.id || ctx.userId,
                        userName: currentUser?.name || '',
                        type: this._normalizeAttendanceType(this.currentAction),
                        note: note,
                        unitWilayah: ctx.userWilayah || '',
                        detectedOffice: ctx.nearest ? ctx.nearest.nama : '',
                        lat: ctx.userLat,
                        lng: ctx.userLng,
                        distance: ctx.distance
                    }).catch((e) => {
                        console.error('Gagal kirim laporan luar wilayah:', e);
                    });
                }

                // PERBAIKAN (2026-08-31): baris navigate ini SENGAJA
                // dipertahankan meski sudah navigate ke halaman yang sama
                // duluan di atas (sebelum proses simpan ini dimulai) -
                // baris ini memicu absensi.init() SEKALI LAGI, kali ini
                // SESUDAH absennya benar-benar selesai tersimpan (datanya
                // pasti sudah akurat). Ini jaring pengaman andai pemuatan
                // data menu Absensi yang terpicu dari navigate PERTAMA tadi
                // kebetulan sempat membaca status yang belum ter-update
                // (race dengan proses simpan yang masih berjalan saat itu) -
                // begitu baris ini jalan, tampilannya otomatis dikoreksi ke
                // data yang benar.
                router.navigate('absensi');
            } catch (error) {
                console.error('Processing error:', error);
                toast.error('Terjadi kesalahan saat memproses data.');
            } finally {
                // BUGFIX (2026-08-31): lihat catatan di atas & di
                // handleClockIn() (absensi.js) - dibersihkan di sini (bukan
                // cuma di jalur sukses) supaya kalau gagal/error pun,
                // tombol absen tidak ikut terkunci selamanya gara-gara
                // guard ini.
                if (window.absensi) window.absensi._pendingAction = null;
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
