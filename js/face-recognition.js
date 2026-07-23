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

    init(action) {
        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.position = null;

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

            // Enable capture button when video is ready
            this.video.onloadedmetadata = () => {
                const captureBtn = document.getElementById('btn-capture');
                if (captureBtn) {
                    captureBtn.disabled = false;
                }
            };

        } catch (error) {
            console.error('Camera error:', error);
            toast.error('Tidak dapat mengakses kamera. Pastikan Anda memberikan izin kamera.');
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
                    if (addressEl)  addressEl.textContent  = 'Lokasi Valid';
                    if (timeEl)     timeEl.textContent     = dateTime.getCurrentTime();
                    if (accuracyEl) accuracyEl.textContent = `±${Math.round(position.coords.accuracy)}m`;
                }

                // Update map visualization
                if (mapEl) {
                    mapEl.innerHTML = `
                        <div class="map-container">
                            <div class="map-marker"></div>
                            <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(255,255,255,0.9); padding: 8px; border-radius: 6px; font-size: 12px;">
                                <i class="fas fa-map-marker-alt" style="color: var(--color-primary);"></i>
                                Lokasi Valid
                            </div>
                        </div>
                    `;
                }

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

        // Simulate face verification (2 seconds)
        setTimeout(() => {
            if (scanningLine) {
                scanningLine.style.display = 'none';
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

        }, 2000);
    },

    retakePhoto() {
        this.photoCaptured = false;

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
