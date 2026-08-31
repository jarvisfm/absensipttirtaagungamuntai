/**
 * Portal Karyawan - Edit Profil (Self-Service)
 * PT. Tirta Agung Amuntai
 *
 * Halaman ini dipakai oleh Staff/Asmen/Manajer (termasuk Admin saat Mode
 * Karyawan aktif) untuk mengubah data profil sendiri. Field & tab-nya sama
 * persis dengan modal "Edit Karyawan" milik Admin (lihat js/karyawan.js),
 * tapi HANYA bisa mengedit data akun sendiri (id diambil dari sesi login).
 */

const profileManager = {
    myId: null,
    anakCount: 0,

    async init() {
        const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
        if (!user || !user.id) {
            toast.error('Sesi tidak ditemukan, silakan login ulang');
            return;
        }

        // PENTING: untuk akun Admin, `id` di sesi login adalah ID di sheet
        // "Users" (bukan Employees) — kalau dipakai langsung sebagai ID
        // karyawan, bisa salah nyangkut ke baris Employees lain yang
        // kebetulan punya id sama. Admin punya baris Employees sendiri
        // (kalau ada) lewat field `employeeId` (lihat Auth.gs, dicocokkan
        // berdasarkan username yang sama). Untuk staff/asmen/manajer biasa,
        // `id` di sesi memang sudah = ID Employees, jadi tidak perlu diubah.
        this.myId = (user.role === 'admin') ? (user.employeeId || null) : user.id;
        this.isAdmin = (user.role === 'admin');

        if (!this.myId) {
            toast.error('Akun Admin ini belum terhubung ke data karyawan di menu Data Karyawan, jadi belum ada profil untuk diedit di sini.');
            return;
        }

        this.switchTab('profil');
        // FIX: loadMyProfile() di bawah ASYNC (menunggu respons server)
        // tapi tombol "Simpan Perubahan" tidak pernah dikunci selama itu -
        // kalau user sempat klik Simpan SEBELUM data lama (termasuk
        // Username di tab Akun) selesai dimuat ke form, field yang masih
        // kosong (default HTML, belum sempat diisi loadMyProfile) ikut
        // tersimpan menimpa data lama (lihat juga guard username di
        // updateKaryawanData, Karyawan.gs). Kunci tombol Simpan dulu
        // selama proses muat data, baru dibuka lagi setelah selesai.
        const saveBtn = document.querySelector('[onclick="profileManager.saveProfile()"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset.origText = saveBtn.innerHTML; saveBtn.innerHTML = 'Memuat data...'; }
        await this.loadMyProfile();
        if (saveBtn) { saveBtn.disabled = false; if (saveBtn.dataset.origText) saveBtn.innerHTML = saveBtn.dataset.origText; }
        await this.loadRiwayatPendidikan();
        await this.loadRiwayatKgb();
        await this.loadRiwayatGolongan();
        await this.loadRiwayatMutasi();
        await this.loadRiwayatKaryawan();
    },

    switchTab(tab) {
        ['profil', 'kekaryawanan', 'keluarga', 'akun', 'pendidikan', 'kgb', 'golongan', 'mutasi', 'riwayatkaryawan'].forEach(t => {
            const content = document.getElementById(`pf-tabcontent-${t}`);
            const btn     = document.getElementById(`pf-tab-${t}`);
            if (content) content.style.display = t === tab ? 'block' : 'none';
            if (btn) {
                btn.style.color        = t === tab ? 'var(--color-primary)' : 'var(--text-muted)';
                btn.style.fontWeight   = t === tab ? '600' : '500';
                btn.style.borderBottom = t === tab ? '2px solid var(--color-primary)' : '2px solid transparent';
            }
        });
        // NEW: muat status & daftar Login Sidik Jari tiap kali tab Akun dibuka
        if (tab === 'akun' && window.auth && auth.renderBiometricSettings) {
            auth.renderBiometricSettings();
        }
        // NEW: muat status Notifikasi HP tiap kali tab Akun dibuka
        if (tab === 'akun' && window.pushNotif && pushNotif.renderStatus) {
            pushNotif.renderStatus();
        }
    },

    // Tombol mata di field Password tab Akun - sama seperti toggle password
    // di halaman Login (lihat auth.js togglePasswordVisibility()), cuma
    // untuk field yang sedang DIKETIK user di sini (isinya kosong sampai
    // user mengetik password baru - lihat catatan "Jangan kirim password ke
    // frontend" di backend/loadMyProfile(), password lama TIDAK pernah
    // dikirim balik ke sini).
    togglePasswordVisibility() {
        const input = document.getElementById('pf-password');
        const btn = document.getElementById('pf-toggle-password');
        if (!input || !btn) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    },

    async loadMyProfile() {
        try {
            const result = await api.getKaryawanDetail(this.myId);
            if (!result.success) {
                toast.error(result.error || 'Gagal memuat data profil');
                return;
            }
            const p = result.data;

            // Tab Profil
            document.getElementById('pf-id').value               = p.id || '';
            document.getElementById('pf-nik').value               = p.nik || '';
            document.getElementById('pf-nama').value              = p.nama || '';
            document.getElementById('pf-jenisKelamin').value      = p.jenisKelamin || '';
            document.getElementById('pf-statusPernikahan').value  = p.statusPernikahan || '';
            document.getElementById('pf-tempatLahir').value       = p.tempatLahir || '';
            document.getElementById('pf-tanggalLahir').value      = p.tanggalLahir || '';
            document.getElementById('pf-golonganDarah').value     = p.golonganDarah || '';
            document.getElementById('pf-noTelp').value            = p.noTelp || '';
            document.getElementById('pf-npwp').value              = p.npwp || '';
            document.getElementById('pf-ktp').value               = p.ktp || '';
            document.getElementById('pf-email').value             = p.email || '';

            // Foto
            this._currentFotoUrl = p.foto || null;
            const fotoHapusBtn = document.getElementById('pf-foto-hapus-btn');
            if (p.foto) {
                document.getElementById('pf-foto-preview').src = p.foto;
                document.getElementById('pf-foto-preview').style.display = 'block';
                document.getElementById('pf-foto-placeholder').style.display = 'none';
                if (fotoHapusBtn) fotoHapusBtn.style.display = 'inline-block';
            } else {
                document.getElementById('pf-foto-preview').style.display = 'none';
                document.getElementById('pf-foto-placeholder').style.display = 'block';
                if (fotoHapusBtn) fotoHapusBtn.style.display = 'none';
            }

            // Tab Kekaryawanan
            document.getElementById('pf-statusPekerjaan').value = p.statusPekerjaan || 'Karyawan Tetap';
            document.getElementById('pf-statusKaryawan').value  = p.statusKaryawan || 'AKTIF';
            document.getElementById('pf-pendidikan').value      = p.pendidikan || '';
            document.getElementById('pf-jabatan').value         = p.jabatan || '';
            document.getElementById('pf-unitWilayah').value     = p.unitWilayah || '';
            document.getElementById('pf-bagian').value          = p.bagian || '';
            document.getElementById('pf-role').value            = p.role || 'staff';
            document.getElementById('pf-pangkat').value         = p.pangkat || '';
            document.getElementById('pf-golongan').value        = p.golongan || '';
            document.getElementById('pf-gajiPokok').value       = p.gajiPokok || '';
            document.getElementById('pf-terhitungMulai').value  = p.terhitungMulai || '';
            this.autoHitungMasaKerja();
            document.getElementById('pf-tahunPensiun').value    = p.tahunPensiun || '';
            // Isi dropdown Jenis Jadwal dari konfigurasi terkini (halaman
            // Jadwal Shift admin) - sama seperti di Edit Karyawan punya
            // Admin (js/karyawan.js), supaya daftar Jenis Jadwal selalu
            // sinkron di kedua sisi (tidak lagi daftar statis di sini).
            if (window.populateJenisJadwalSelect) {
                await populateJenisJadwalSelect('pf-shift', p.shift || 'Reguler (Sen-Kam)');
            } else {
                document.getElementById('pf-shift').value = p.shift || 'Reguler (Sen-Kam)';
            }

            this.applyFieldPermissions();

            // Berkas SK/Ijazah/Sertifikat: tidak diedit dari halaman ini,
            // jadi tidak perlu dimuat ke form. Nilainya tetap tersimpan di
            // data karyawan dan tidak disentuh sama sekali oleh halaman Edit
            // Profil ini. KTP dikecualikan - link KTP milik sendiri BOLEH
            // diedit dari sini (lihat tab Keluarga, sama seperti di Edit
            // Karyawan punya Admin).

            // Tab Keluarga
            const keluarga = p.keluarga || [];
            const pasangan = keluarga.find(k => k.tipe === 'pasangan');
            const ayah     = keluarga.find(k => k.tipe === 'ayah');
            const ibu      = keluarga.find(k => k.tipe === 'ibu');
            const anakList = keluarga.filter(k => k.tipe === 'anak');

            document.getElementById('pf-namaPasangan').value = pasangan?.nama || '';
            this.renderPasanganDocBlocks(pasangan || {});

            // Link KTP (Anda) - preview otomatis begitu link ke-load, sama
            // seperti field KTP Pasangan.
            document.getElementById('pf-fileKTP').value = p.fileKTP || '';
            this.updateKtpUserPreview();
            document.getElementById('pf-namaAyah').value     = ayah?.nama || '';
            document.getElementById('pf-namaIbu').value      = ibu?.nama || '';

            document.getElementById('pf-anak-list').innerHTML = '';
            this.anakCount = 0;
            anakList.forEach(a => this.addAnakField(a));

            // Tab Akun
            document.getElementById('pf-username').value = p.username || '';

        } catch (e) {
            console.error('Error load profil:', e);
            toast.error('Terjadi kesalahan saat memuat profil');
        }
    },

    // Blok 1 field dokumen (link + preview) untuk 1 anak - dipakai 4x
    // (KTP, KTA, Akta Kelahiran, KK) supaya tidak menulis ulang HTML yang
    // sama 4 kali di addAnakField().
    _anakDocBlock(n, key, label, url) {
        const previewUrl = url ? this.normalizeDriveLink(url) : '';
        return `
            <div>
                <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">${label}</label>
                <input type="url" class="pf-anak-${key}Url" value="${this._esc(url || '')}"
                    placeholder="Link Google Drive ${label}"
                    oninput="profileManager.updateAnakDocPreview(${n}, '${key}')"
                    style="width:100%;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:0.85rem;margin-bottom:6px;font-family:inherit;">
                <div id="pf-anak-${n}-${key}-preview" style="position:relative;height:180px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);display:${url ? 'block' : 'none'};">
                    ${previewUrl
                        ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
                        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${url ? 'Link tidak valid' : 'Belum ada link'}</span></div>`}
                </div>
            </div>
        `;
    },

    // data bisa berupa string (nama saja, kompatibel data lama) atau object
    // { nama, ktpUrl, ktaUrl, aktaUrl, kkUrl } untuk data yang sudah lengkap
    // dengan dokumen per anak.
    addAnakField(data = {}) {
        const a = (typeof data === 'string') ? { nama: data } : (data || {});
        this.anakCount++;
        const n = this.anakCount;
        const div = document.createElement('div');
        div.style.cssText = 'border:1px solid var(--border-color);border-radius:8px;padding:1rem;margin-bottom:1rem;';
        div.id = `pf-anak-row-${n}`;
        div.innerHTML = `
            <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
                <input type="text" class="pf-anak-nama" value="${this._esc(a.nama || '')}" placeholder="Nama anak ke-${n}"
                    style="flex:1;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;font-family:inherit;">
                <button type="button" onclick="document.getElementById('pf-anak-row-${n}').remove()"
                    style="background:#EF4444;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                ${this._anakDocBlock(n, 'ktp', 'Link KTP', a.ktpUrl)}
                ${this._anakDocBlock(n, 'akta', 'Link Akta Kelahiran', a.aktaUrl)}
            </div>
        `;
        document.getElementById('pf-anak-list').appendChild(div);
    },

    // Blok dokumen (link + preview) untuk Pasangan - sama persis stylenya
    // dengan _anakDocBlock() tapi ID-nya tetap (bukan per-index) karena
    // pasangan cuma 1, bukan daftar.
    _pasanganDocBlock(key, label, url) {
        const previewUrl = url ? this.normalizeDriveLink(url) : '';
        return `
            <div>
                <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">${label}</label>
                <input type="url" id="pf-pasangan-${key}Url" value="${this._esc(url || '')}"
                    placeholder="Link Google Drive ${label}"
                    oninput="profileManager.updatePasanganDocPreview('${key}')"
                    style="width:100%;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:0.85rem;margin-bottom:6px;font-family:inherit;">
                <div id="pf-pasangan-${key}-preview" style="position:relative;height:180px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);display:${url ? 'block' : 'none'};">
                    ${previewUrl
                        ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
                        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${url ? 'Link tidak valid' : 'Belum ada link'}</span></div>`}
                </div>
            </div>
        `;
    },

    // Render 2 blok dokumen Pasangan (KTP, KK) ke #pf-pasangan-doc-list
    renderPasanganDocBlocks(pasangan = {}) {
        const container = document.getElementById('pf-pasangan-doc-list');
        if (!container) return;
        container.innerHTML = `
            ${this._pasanganDocBlock('ktp', 'Link KTP (Pasangan)', pasangan.ktpUrl)}
            ${this._pasanganDocBlock('kk', 'Link Kartu Keluarga (KK) Pasangan', pasangan.kkUrl)}
        `;
    },

    // Update preview 1 dokumen Pasangan tertentu saat link-nya diketik/tempel
    updatePasanganDocPreview(key) {
        const input = document.getElementById(`pf-pasangan-${key}Url`);
        const previewEl = document.getElementById(`pf-pasangan-${key}-preview`);
        if (!input || !previewEl) return;
        const rawUrl = input.value;
        previewEl.style.display = rawUrl ? 'block' : 'none';
        const previewUrl = this.normalizeDriveLink(rawUrl);
        previewEl.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${rawUrl ? 'Link tidak valid' : 'Belum ada link'}</span></div>`;
    },

    // Preview "Link KTP (Anda)" - persis pola updatePasanganDocPreview,
    // auto-update tiap kali link diketik/tempel.
    updateKtpUserPreview() {
        const input = document.getElementById('pf-fileKTP');
        const previewEl = document.getElementById('pf-fileKTP-preview');
        if (!input || !previewEl) return;
        const rawUrl = input.value;
        previewEl.style.display = rawUrl ? 'block' : 'none';
        const previewUrl = this.normalizeDriveLink(rawUrl);
        previewEl.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${rawUrl ? 'Link tidak valid' : 'Belum ada link'}</span></div>`;
    },

    // Update preview 1 dokumen anak tertentu saat link-nya diketik/tempel
    updateAnakDocPreview(n, key) {
        const input = document.querySelector(`#pf-anak-row-${n} .pf-anak-${key}Url`);
        const previewEl = document.getElementById(`pf-anak-${n}-${key}-preview`);
        if (!input || !previewEl) return;
        const rawUrl = input.value;
        previewEl.style.display = rawUrl ? 'block' : 'none';
        const previewUrl = this.normalizeDriveLink(rawUrl);
        previewEl.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${rawUrl ? 'Link tidak valid' : 'Belum ada link'}</span></div>`;
    },

    /**
     * Hitung otomatis Tahun Pensiun = Tahun Lahir + 56 (rumus sama seperti
     * di Excel), dipanggil setiap field Tanggal Lahir berubah. Hasilnya
     * tetap bisa diubah manual sesudahnya kalau memang perlu (misal ada
     * aturan usia pensiun khusus untuk jabatan tertentu).
     */
    autoHitungTahunPensiun() {
        const tgl = document.getElementById('pf-tanggalLahir').value;
        if (!tgl) return;
        const tahunLahir = parseInt(tgl.split('-')[0], 10);
        if (isNaN(tahunLahir)) return;
        document.getElementById('pf-tahunPensiun').value = tahunLahir + 56;
    },

    /**
     * Hitung otomatis Masa Kerja = Terhitung Mulai s/d hari ini, dalam
     * format "Tahun/Bulan" (contoh: 21/3 = 21 tahun 3 bulan). Dipanggil
     * setiap field Terhitung Mulai berubah, dan setiap kali profil dimuat
     * supaya nilainya selalu segar sesuai tanggal hari ini.
     */
    autoHitungMasaKerja() {
        const tgl = document.getElementById('pf-terhitungMulai').value;
        const target = document.getElementById('pf-masaKerja');
        if (!tgl) { target.value = ''; return; }

        const mulai = new Date(tgl);
        const hariIni = new Date();
        if (isNaN(mulai.getTime())) { target.value = ''; return; }

        let tahun = hariIni.getFullYear() - mulai.getFullYear();
        let bulan = hariIni.getMonth() - mulai.getMonth();
        if (hariIni.getDate() < mulai.getDate()) bulan--;
        if (bulan < 0) { tahun--; bulan += 12; }
        if (tahun < 0) { tahun = 0; bulan = 0; }

        target.value = `${tahun}/${bulan}`;
    },

    /**
     * Seluruh isian di tab "Kekaryawanan" (Status Pekerjaan, Status Karyawan,
     * Pendidikan, Jabatan, Unit Wilayah, Bagian, Role, Pangkat, Golongan,
     * Gaji Pokok, Terhitung Mulai, Masa Kerja, Tahun Pensiun, Jenis Jadwal)
     * HANYA boleh diubah oleh Admin - staff/asmen/manajer biasa cuma bisa
     * lihat (disabled), tidak bisa mengedit data kekaryawanannya sendiri
     * lewat halaman ini. Dipilih otomatis lewat querySelectorAll supaya
     * kalau nanti ada field baru ditambahkan ke tab ini, otomatis ikut
     * terkunci juga tanpa perlu ubah daftar manual di sini.
     */
    applyFieldPermissions() {
        const tab = document.getElementById('pf-tabcontent-kekaryawanan');
        if (!tab) return;
        tab.querySelectorAll('input, select, textarea').forEach(el => {
            el.disabled = !this.isAdmin;
            el.title = this.isAdmin ? '' : 'Hanya Admin yang dapat mengubah field ini';
        });

        const note = document.getElementById('pf-kekaryawanan-note');
        if (note) note.style.display = this.isAdmin ? 'none' : 'block';
    },

    previewFoto(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('pf-foto-preview').src = e.target.result;
                document.getElementById('pf-foto-preview').style.display = 'block';
                document.getElementById('pf-foto-placeholder').style.display = 'none';
                const fotoHapusBtn = document.getElementById('pf-foto-hapus-btn');
                if (fotoHapusBtn) fotoHapusBtn.style.display = 'inline-block';
            };
            reader.readAsDataURL(input.files[0]);
        }
    },

    // TAMBAHAN: tombol "Hapus Foto" di Edit Profil > tab Profil.
    // 2 kasus:
    // 1) User baru saja pilih foto baru (Upload/Ambil Foto) tapi BELUM
    //    tekan "Simpan" - foto itu masih cuma preview lokal, belum pernah
    //    dikirim ke server sama sekali. Di sini cukup batalkan pilihannya
    //    (kosongkan input file) dan balikin preview ke foto lama yang
    //    memang tersimpan di server (kalau ada), tanpa perlu panggil
    //    backend apa pun.
    // 2) Tidak ada foto baru yang sedang dipilih - berarti foto yang
    //    tampil sekarang memang foto profil yang SUDAH tersimpan di
    //    server (this._currentFotoUrl). Baru di sini panggil backend
    //    buat benar-benar menghapusnya (dari Google Drive & kolom "foto"
    //    di sheet Employees).
    async hapusFoto() {
        const fotoFileInput = document.getElementById('pf-foto-file');
        const adaFotoBaruBelumDisimpan = !!(fotoFileInput && fotoFileInput.files && fotoFileInput.files[0]);

        if (adaFotoBaruBelumDisimpan) {
            fotoFileInput.value = '';
            const preview = document.getElementById('pf-foto-preview');
            const placeholder = document.getElementById('pf-foto-placeholder');
            const fotoHapusBtn = document.getElementById('pf-foto-hapus-btn');
            if (this._currentFotoUrl) {
                preview.src = this._currentFotoUrl;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                if (fotoHapusBtn) fotoHapusBtn.style.display = 'inline-block';
            } else {
                preview.style.display = 'none';
                placeholder.style.display = 'block';
                if (fotoHapusBtn) fotoHapusBtn.style.display = 'none';
            }
            return;
        }

        if (!this._currentFotoUrl) return;

        if (!confirm('Hapus foto profil ini? Foto akan langsung dihapus dari server (bukan cuma dari tampilan), dan wajah di foto ini tidak akan dipakai lagi sebagai acuan verifikasi saat absen sampai Anda upload foto baru.')) {
            return;
        }

        try {
            const result = await api.deleteFotoKaryawan(this.myId);
            if (!result || !result.success) {
                toast.error((result && result.error) || 'Gagal menghapus foto profil');
                return;
            }

            this._currentFotoUrl = null;
            document.getElementById('pf-foto-preview').style.display = 'none';
            document.getElementById('pf-foto-placeholder').style.display = 'block';
            const fotoHapusBtn = document.getElementById('pf-foto-hapus-btn');
            if (fotoHapusBtn) fotoHapusBtn.style.display = 'none';

            // Sinkronkan sesi login & cache pencocokan wajah - sama seperti
            // saat foto DIGANTI (lihat saveProfile()), supaya tidak ada
            // sisa foto lama yang masih dipakai faceRecognition sebagai
            // acuan setelah foto profilnya sudah dihapus.
            const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
            if (user) {
                user.avatar = '';
                if (typeof storage !== 'undefined') storage.set('session', user);
                if (auth.updateUserUI) auth.updateUserUI();
            }
            if (typeof faceRecognition !== 'undefined') {
                faceRecognition._referenceDescriptor = null;
                faceRecognition._referenceDescriptorAvatarUrl = null;
            }

            toast.success('Foto profil berhasil dihapus');
        } catch (e) {
            console.error('Error hapus foto profil:', e);
            toast.error('Terjadi kesalahan saat menghapus foto profil');
        }
    },

    // TAMBAHAN: tombol "Ambil Foto" di Edit Profil > tab Profil. Sengaja
    // TIDAK bikin <input> baru/terpisah - dipakai ulang persis input yang
    // sama dengan "Upload Foto" (#pf-foto-file), supaya previewFoto() &
    // saveProfile() (yang baca file dari #pf-foto-file) tetap jalan apa
    // adanya tanpa perlu tahu foto ini asalnya dari galeri atau kamera.
    // Atribut "capture" dipasang SESAAT sebelum dialog file dibuka supaya
    // browser HP langsung mengarah ke kamera (bukan galeri) - lalu segera
    // dilepas lagi supaya tombol "Upload Foto" yang lama tetap membuka
    // galeri seperti biasa (perilakunya tidak berubah sama sekali).
    // Di desktop/browser yang tidak mendukung atribut ini, otomatis
    // fallback ke dialog pilih file biasa - tidak ada yang rusak.
    openCameraForFoto() {
        const input = document.getElementById('pf-foto-file');
        if (!input) return;
        input.setAttribute('capture', 'user');
        input.click();
        setTimeout(() => input.removeAttribute('capture'), 0);
    },

    async saveProfile() {
        // Cegah simpan dobel kalau tombol "Simpan Perubahan" diklik
        // berkali-kali dengan cepat - pola sama dengan submitIzinForm()
        // (izin.js) dan handleSubmit() (cuti.js). Ini penyebab paling
        // umum data Keluarga/Pendidikan jadi tergandakan di sheet: klik
        // dobel bikin updateKaryawan() (yang menulis ulang SELURUH data
        // Keluarga) terkirim 2x nyaris bersamaan.
        if (this.isSubmittingProfile) return;
        this.isSubmittingProfile = true;

        const saveBtn = document.getElementById('btn-save-profile');
        const saveBtnOriginalHtml = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {

        const nama = document.getElementById('pf-nama').value.trim();
        if (!nama) {
            toast.error('Nama harus diisi!');
            this.switchTab('profil');
            return;
        }

        // Kumpulkan data keluarga
        const keluarga = [];
        const namaPasangan = document.getElementById('pf-namaPasangan').value.trim();
        const pasanganKtpUrl = document.getElementById('pf-pasangan-ktpUrl')?.value.trim() || '';
        const pasanganKkUrl  = document.getElementById('pf-pasangan-kkUrl')?.value.trim()  || '';

        // Link dokumen Pasangan cuma bisa tersimpan kalau Nama Pasangan juga
        // diisi (dokumen menempel ke data Pasangan, bukan berdiri sendiri) -
        // kasih tahu user duluan daripada link-nya diam-diam tidak tersimpan.
        if (!namaPasangan && (pasanganKtpUrl || pasanganKkUrl)) {
            toast.error('Isi dulu Nama Pasangan sebelum link dokumennya bisa disimpan!');
            this.switchTab('keluarga');
            return;
        }

        if (namaPasangan) {
            keluarga.push({
                tipe: 'pasangan',
                nama: namaPasangan,
                ktpUrl: pasanganKtpUrl,
                kkUrl:  pasanganKkUrl
            });
        }

        const anakRows = document.querySelectorAll('#pf-anak-list > div');
        anakRows.forEach(row => {
            const namaEl = row.querySelector('.pf-anak-nama');
            const nama = namaEl ? namaEl.value.trim() : '';
            if (!nama) return;
            keluarga.push({
                tipe: 'anak',
                nama,
                ktpUrl:  row.querySelector('.pf-anak-ktpUrl')?.value.trim()  || '',
                aktaUrl: row.querySelector('.pf-anak-aktaUrl')?.value.trim() || ''
            });
        });

        const namaAyah = document.getElementById('pf-namaAyah').value.trim();
        if (namaAyah) keluarga.push({ tipe: 'ayah', nama: namaAyah });

        const namaIbu = document.getElementById('pf-namaIbu').value.trim();
        if (namaIbu) keluarga.push({ tipe: 'ibu', nama: namaIbu });

        const data = {
            nik:              document.getElementById('pf-nik').value.trim(),
            nama,
            jenisKelamin:     document.getElementById('pf-jenisKelamin').value,
            statusPernikahan: document.getElementById('pf-statusPernikahan').value,
            tempatLahir:      document.getElementById('pf-tempatLahir').value.trim(),
            tanggalLahir:     document.getElementById('pf-tanggalLahir').value,
            golonganDarah:    document.getElementById('pf-golonganDarah').value,
            noTelp:           document.getElementById('pf-noTelp').value.trim(),
            npwp:             document.getElementById('pf-npwp').value.trim(),
            ktp:              document.getElementById('pf-ktp').value.trim(),
            fileKTP:          document.getElementById('pf-fileKTP')?.value.trim() || '',
            email:            document.getElementById('pf-email').value.trim(),
            username:         document.getElementById('pf-username').value.trim(),
            // Semua field tab "Kekaryawanan" (Status Pekerjaan s/d Jenis
            // Jadwal) SENGAJA tidak selalu disertakan di sini - lihat
            // penjelasan di bawah.
            keluarga
        };

        // Seluruh field tab "Kekaryawanan" HANYA boleh diubah Admin. Untuk
        // staff/asmen/manajer, field-field ini memang di-disable di form-nya,
        // tapi supaya aman (tidak sekadar UI), di sini juga SENGAJA tidak
        // disertakan sama sekali di payload kalau bukan Admin - backend
        // membiarkan nilai lama tetap ada untuk field yang tidak dikirim
        // (pola yang sama seperti fileSK/fileKTP di atas).
        if (this.isAdmin) {
            data.statusPekerjaan = document.getElementById('pf-statusPekerjaan').value;
            data.statusKaryawan  = document.getElementById('pf-statusKaryawan').value;
            data.pendidikan      = document.getElementById('pf-pendidikan').value;
            data.jabatan         = document.getElementById('pf-jabatan').value.trim();
            data.unitWilayah     = document.getElementById('pf-unitWilayah').value.trim();
            data.bagian          = document.getElementById('pf-bagian').value.trim();
            data.role            = document.getElementById('pf-role').value;
            data.pangkat         = document.getElementById('pf-pangkat').value.trim();
            data.golongan        = document.getElementById('pf-golongan').value.trim();
            data.gajiPokok       = document.getElementById('pf-gajiPokok').value;
            data.terhitungMulai  = document.getElementById('pf-terhitungMulai').value;
            data.masaKerja       = document.getElementById('pf-masaKerja').value.trim();
            data.tahunPensiun    = document.getElementById('pf-tahunPensiun').value.trim();
            data.shift           = document.getElementById('pf-shift').value;
        }

        const pwd = document.getElementById('pf-password').value;
        if (pwd) data.password = pwd;

        const result = await api.updateKaryawan(this.myId, data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan profil');
                return;
            }

            // Upload foto jika ada
            const fotoFile = document.getElementById('pf-foto-file')?.files[0];
            let newFotoUrl = null;
            if (fotoFile) {
                newFotoUrl = await this.uploadFoto(fotoFile);
            }

            toast.success('Profil berhasil diperbarui!');

            // Sinkronkan nama/foto di sidebar & sesi login
            const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
            if (user) {
                user.name = nama;
                // PENTING: foto baru punya URL Drive yang berbeda dari yang
                // lama (lihat uploadFotoKaryawan di backend - file lama
                // dihapus, file baru dibuat dengan ID baru). Kalau
                // user.avatar di sesi login tidak ikut diperbarui di sini,
                // face-recognition.js akan terus memakai foto profil LAMA
                // sebagai acuan pencocokan wajah (session cuma dimuat ulang
                // saat login) - akibatnya ganti foto profil ke wajah orang
                // lain tidak akan pernah membuat absen ditolak selama sesi
                // login yang sama, karena sistem masih membandingkan ke
                // foto lama, bukan yang baru.
                if (newFotoUrl) {
                    user.avatar = newFotoUrl;
                    // Buang cache descriptor wajah lama di faceRecognition
                    // supaya absen berikutnya menghitung ulang dari foto
                    // profil yang baru, bukan memakai hasil hitung foto lama.
                    if (typeof faceRecognition !== 'undefined') {
                        faceRecognition._referenceDescriptor = null;
                        faceRecognition._referenceDescriptorAvatarUrl = null;
                    }
                }
                if (typeof storage !== 'undefined') storage.set('session', user);
                if (auth.updateUserUI) auth.updateUserUI();
            }

            document.getElementById('pf-password').value = '';
            await this.loadMyProfile();

        } catch (e) {
            console.error('Error save profil:', e);
            toast.error('Terjadi kesalahan saat menyimpan');
        } finally {
            this.isSubmittingProfile = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = saveBtnOriginalHtml;
            }
        }
    },

    async uploadFoto(file) {
        // Balikin URL foto baru (dari backend) supaya pemanggil bisa
        // menyinkronkan user.avatar di sesi login - lihat catatan di
        // saveMyProfile(). Balikin null kalau upload gagal (biarkan sesi
        // login apa adanya, jangan menimpanya dengan sesuatu yang salah).
        //
        // PERBAIKAN (2026-08-27): sebelumnya file dikirim APA ADANYA dari
        // kamera/galeri HP (bisa beberapa MB, resolusi 3000-4000px+),
        // padahal foto ini di seluruh aplikasi CUMA PERNAH ditampilkan
        // sebagai thumbnail kecil (lihat sz=w300 di uploadFotoKaryawan
        // untuk tampilan, dan thumbnail w400 di getDriveFileAsBase64 untuk
        // pencocokan wajah) - menyimpan file asli penuh di Drive cuma
        // boros kuota penyimpanan & bikin upload dari HP lebih lama, tanpa
        // manfaat kualitas yang benar-benar kepakai. Sekarang di-resize ke
        // maksimal 640px pada sisi terpanjang (masih di atas 400px yang
        // dipakai pencocokan wajah, jadi tidak mengurangi akurasi) +
        // dikompres JPEG kualitas 0.85 di browser SEBELUM dikirim ke server.
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = async () => {
                    let { width, height } = img;
                    const maxDim = 640;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round(height * (maxDim / width));
                            width = maxDim;
                        } else {
                            width = Math.round(width * (maxDim / height));
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                    let fotoUrl = null;
                    try {
                        const result = await api.uploadFotoKaryawan(this.myId, base64, 'image/jpeg');
                        if (result && result.success && result.data && result.data.fotoUrl) {
                            fotoUrl = result.data.fotoUrl;
                        }
                    } catch (err) {
                        console.error('Upload foto gagal:', err);
                    }
                    resolve(fotoUrl);
                };
                img.onerror = () => resolve(null);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    },

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // ========== TAB PENDIDIKAN (Riwayat SD/SMP/SMA/S1/S2 + link Google Drive) ==========

    riwayatPendidikan: [],

    async loadRiwayatPendidikan() {
        try {
            const result = await api.getRiwayatPendidikan(this.myId);
            this.riwayatPendidikan = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat pendidikan:', e);
            this.riwayatPendidikan = [];
        }
        this.renderRiwayatPendidikan();
    },

    renderRiwayatPendidikan() {
        const container = document.getElementById('pf-pendidikan-list');
        if (!container) return;

        if (this.riwayatPendidikan.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Belum ada riwayat pendidikan yang disimpan.</p>';
            return;
        }

        container.innerHTML = this.riwayatPendidikan.map(r => `
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:1.25rem;margin-bottom:1rem;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                            <span style="background:var(--color-primary);color:#fff;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:20px;">${this._esc(r.jenjang)}</span>
                            <span style="font-weight:600;font-size:1.05rem;">${this._esc(r.namaSekolah)}</span>
                        </div>
                        <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">
                            ${r.jurusan ? this._esc(r.jurusan) + ' &middot; ' : ''}Lulus ${this._esc(r.tahunLulus || '-')}
                            ${r.nomorIjazah ? ' &middot; No. Ijazah: ' + this._esc(r.nomorIjazah) : ''}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                        <button type="button" onclick="profileManager.editRiwayatPendidikan('${r.id}')"
                            style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:8px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" onclick="profileManager.deleteRiwayatPendidikan('${r.id}')"
                            style="background:#EF4444;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${(r.fileIjazahUrl || r.fileTranskripUrl) ? `
                <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-color);">
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px;">Review Dokumen - ${this._esc(r.jenjang)} ${this._esc(r.namaSekolah)}</div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:260px;">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">Dokumen Ijazah</label>
                            <div style="position:relative;height:340px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);">
                                ${r.fileIjazahUrl
                                    ? `<iframe src="${this._esc(r.fileIjazahUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
                                    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">Belum ada link Ijazah</span></div>`}
                            </div>
                        </div>
                        <div style="flex:1;min-width:260px;">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">Dokumen Transkrip Nilai</label>
                            <div style="position:relative;height:340px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);">
                                ${r.fileTranskripUrl
                                    ? `<iframe src="${this._esc(r.fileTranskripUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
                                    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">Belum ada link Transkrip Nilai</span></div>`}
                            </div>
                        </div>
                    </div>
                </div>
                ` : `<div style="margin-top:8px;"><span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada link Ijazah/Transkrip</span></div>`}
            </div>
        `).join('');
    },

    editRiwayatPendidikan(id) {
        const r = this.riwayatPendidikan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('pf-pdk-id').value               = r.id;
        document.getElementById('pf-pdk-jenjang').value           = r.jenjang || '';
        document.getElementById('pf-pdk-jurusan').value           = r.jurusan || '';
        document.getElementById('pf-pdk-namaSekolah').value       = r.namaSekolah || '';
        document.getElementById('pf-pdk-nomorIjazah').value       = r.nomorIjazah || '';
        document.getElementById('pf-pdk-tahunLulus').value        = r.tahunLulus || '';
        document.getElementById('pf-pdk-tanggalLulus').value      = r.tanggalLulus || '';
        document.getElementById('pf-pdk-gelarDepan').value        = r.gelarDepan || '';
        document.getElementById('pf-pdk-gelarBelakang').value     = r.gelarBelakang || '';

        document.getElementById('pf-pdk-ijazah-url').value    = r.fileIjazahUrl || '';
        document.getElementById('pf-pdk-transkrip-url').value = r.fileTranskripUrl || '';

        document.getElementById('pf-pendidikan-form-title').innerHTML = '<i class="fas fa-graduation-cap"></i> Edit Riwayat Pendidikan';
        document.getElementById('pf-pdk-btn-batal').style.display = 'inline-flex';

        document.getElementById('modal-pendidikan-form').style.display = 'flex';
    },

    openPendidikanModal() {
        this.resetPendidikanForm();
        document.getElementById('modal-pendidikan-form').style.display = 'flex';
    },

    closePendidikanModal() {
        document.getElementById('modal-pendidikan-form').style.display = 'none';
    },

    resetPendidikanForm() {
        document.getElementById('pf-pdk-id').value = '';
        document.getElementById('pf-pdk-jenjang').value = '';
        document.getElementById('pf-pdk-jurusan').value = '';
        document.getElementById('pf-pdk-namaSekolah').value = '';
        document.getElementById('pf-pdk-nomorIjazah').value = '';
        document.getElementById('pf-pdk-tahunLulus').value = '';
        document.getElementById('pf-pdk-tanggalLulus').value = '';
        document.getElementById('pf-pdk-gelarDepan').value = '';
        document.getElementById('pf-pdk-gelarBelakang').value = '';
        document.getElementById('pf-pdk-ijazah-url').value = '';
        document.getElementById('pf-pdk-transkrip-url').value = '';

        document.getElementById('pf-pendidikan-form-title').innerHTML = '<i class="fas fa-graduation-cap"></i> Tambah Riwayat Pendidikan';
        document.getElementById('pf-pdk-btn-batal').style.display = 'none';
    },

    async saveRiwayatPendidikan() {
        // Sama seperti saveProfile() di atas - cegah tersimpan dobel kalau
        // tombol "Simpan Riwayat Pendidikan" diklik berkali-kali (ini
        // penyebab entri pendidikan yang sama muncul 2x di riwayat).
        if (this.isSubmittingPendidikan) return;
        this.isSubmittingPendidikan = true;

        const pdkBtn = document.getElementById('pf-pdk-btn-simpan');
        const pdkBtnOriginalHtml = pdkBtn ? pdkBtn.innerHTML : '';
        if (pdkBtn) {
            pdkBtn.disabled = true;
            pdkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {

        const id           = document.getElementById('pf-pdk-id').value;
        const jenjang       = document.getElementById('pf-pdk-jenjang').value;
        const namaSekolah   = document.getElementById('pf-pdk-namaSekolah').value.trim();

        if (!jenjang) { toast.error('Pilih jenjang pendidikan terlebih dahulu!'); return; }
        if (!namaSekolah) { toast.error('Nama sekolah/institusi wajib diisi!'); return; }

        const rawIjazahUrl    = document.getElementById('pf-pdk-ijazah-url').value.trim();
        const rawTranskripUrl = document.getElementById('pf-pdk-transkrip-url').value.trim();

        const fileIjazahUrl    = rawIjazahUrl ? this.normalizeDriveLink(rawIjazahUrl) : '';
        const fileTranskripUrl = rawTranskripUrl ? this.normalizeDriveLink(rawTranskripUrl) : '';

        if (rawIjazahUrl && !fileIjazahUrl) { toast.error('Link Ijazah bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }
        if (rawTranskripUrl && !fileTranskripUrl) { toast.error('Link Transkrip Nilai bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:                 id || undefined,
            userId:             this.myId,
            jenjang,
            jurusan:            document.getElementById('pf-pdk-jurusan').value.trim(),
            namaSekolah,
            nomorIjazah:        document.getElementById('pf-pdk-nomorIjazah').value.trim(),
            tahunLulus:         document.getElementById('pf-pdk-tahunLulus').value.trim(),
            tanggalLulus:       document.getElementById('pf-pdk-tanggalLulus').value,
            gelarDepan:         document.getElementById('pf-pdk-gelarDepan').value.trim(),
            gelarBelakang:      document.getElementById('pf-pdk-gelarBelakang').value.trim(),
            fileIjazahUrl,
            fileTranskripUrl
        };

            const result = await api.saveRiwayatPendidikan(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan riwayat pendidikan');
                return;
            }

            toast.success('Riwayat pendidikan berhasil disimpan!');
            this.resetPendidikanForm();
            this.closePendidikanModal();
            await this.loadRiwayatPendidikan();
        } catch (e) {
            console.error('Error simpan riwayat pendidikan:', e);
            toast.error('Terjadi kesalahan saat menyimpan riwayat pendidikan');
        } finally {
            this.isSubmittingPendidikan = false;
            if (pdkBtn) {
                pdkBtn.disabled = false;
                pdkBtn.innerHTML = pdkBtnOriginalHtml;
            }
        }
    },

    async deleteRiwayatPendidikan(id) {
        if (!confirm('Hapus riwayat pendidikan ini? (Link Ijazah/Transkrip hanya dihapus dari aplikasi, file aslinya di Google Drive Anda tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatPendidikan(id);
            if (result.success) {
                toast.success('Riwayat pendidikan dihapus');
                await this.loadRiwayatPendidikan();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    /**
     * Ubah berbagai format link share Google Drive (.../view?usp=sharing,
     * open?id=..., uc?id=..., dst) menjadi format ".../preview" yang bisa
     * ditanam di <iframe> (format lain sering diblokir Google karena
     * X-Frame-Options). Balikin null kalau bukan link Drive yang valid.
     */
    normalizeDriveLink(url) {
        if (!url) return '';
        const trimmed = url.trim();
        if (!trimmed) return '';

        let fileId = null;
        let m = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
        if (m) fileId = m[1];
        if (!fileId) {
            m = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
            if (m) fileId = m[1];
        }
        if (!fileId) return null;

        return `https://drive.google.com/file/d/${fileId}/preview`;
    },

    // ========== TAB KENAIKAN GAJI BERKALA (KGB) ==========

    riwayatKgb: [],

    async loadRiwayatKgb() {
        try {
            const result = await api.getRiwayatKgb(this.myId);
            this.riwayatKgb = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat KGB:', e);
            this.riwayatKgb = [];
        }
        this.renderRiwayatKgb();
    },

    renderRiwayatKgb() {
        const tbody = document.getElementById('pf-kgb-list');
        if (!tbody) return;

        if (this.riwayatKgb.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Belum ada riwayat Kenaikan Gaji Berkala yang disimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = this.riwayatKgb.map(r => `
            <tr>
                <td style="padding:10px 12px;">${this._esc(r.nomorSurat || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(this._formatTanggalID(r.tmtKgb) || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(this._formatMasaKerja(r.masaKerjaTahun, r.masaKerjaBulan))}</td>
                <td style="padding:10px 12px;">
                    ${r.fileDokumenUrl
                        ? `<button type="button" onclick="window.open('${r.fileDokumenUrl}', '_blank')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;"><i class="fas fa-download"></i> Unduh</button>`
                        : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada</span>`}
                </td>
                <td style="padding:10px 12px;">
                    <button type="button" onclick="profileManager.editRiwayatKgb('${r.id}')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;"><i class="fas fa-pen"></i></button>
                    <button type="button" onclick="profileManager.deleteRiwayatKgb('${r.id}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Gabungkan Masa Kerja (Tahun) + (Bulan) jadi 1 teks ringkas utk kolom tabel
    _formatMasaKerja(tahun, bulan) {
        const t = parseInt(tahun, 10) || 0;
        const b = parseInt(bulan, 10) || 0;
        if (!t && !b) return '-';
        const parts = [];
        if (t) parts.push(`${t} Tahun`);
        if (b) parts.push(`${b} Bulan`);
        return parts.join(' ');
    },

    openKgbModal() {
        this.resetKgbForm();
        document.getElementById('modal-kgb-form').style.display = 'flex';
    },

    closeKgbModal() {
        document.getElementById('modal-kgb-form').style.display = 'none';
    },

    editRiwayatKgb(id) {
        const r = this.riwayatKgb.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('pf-kgb-id').value             = r.id;
        document.getElementById('pf-kgb-nomorSurat').value      = r.nomorSurat || '';
        document.getElementById('pf-kgb-tmtKgb').value          = r.tmtKgb || '';
        document.getElementById('pf-kgb-tanggalSurat').value    = r.tanggalSurat || '';
        document.getElementById('pf-kgb-masaKerjaTahun').value  = r.masaKerjaTahun || '';
        document.getElementById('pf-kgb-masaKerjaBulan').value  = r.masaKerjaBulan || '';
        document.getElementById('pf-kgb-gajiPokokBaru').value   = r.gajiPokokBaru || '';
        document.getElementById('pf-kgb-dokumen-url').value     = r.fileDokumenUrl || '';

        document.getElementById('pf-kgb-form-title').innerHTML = '<i class="fas fa-money-bill-trend-up"></i> Edit Kenaikan Gaji Berkala';
        document.getElementById('pf-kgb-btn-batal').style.display = 'inline-flex';

        this.updateKgbPreview();
        document.getElementById('modal-kgb-form').style.display = 'flex';
    },

    resetKgbForm() {
        document.getElementById('pf-kgb-id').value = '';
        document.getElementById('pf-kgb-nomorSurat').value = '';
        document.getElementById('pf-kgb-tmtKgb').value = '';
        document.getElementById('pf-kgb-tanggalSurat').value = '';
        document.getElementById('pf-kgb-masaKerjaTahun').value = '';
        document.getElementById('pf-kgb-masaKerjaBulan').value = '';
        document.getElementById('pf-kgb-gajiPokokBaru').value = '';
        document.getElementById('pf-kgb-dokumen-url').value = '';

        document.getElementById('pf-kgb-form-title').innerHTML = '<i class="fas fa-money-bill-trend-up"></i> Tambah Kenaikan Gaji Berkala';
        document.getElementById('pf-kgb-btn-batal').style.display = 'none';
        this.updateKgbPreview();
    },

    // Update preview dokumen di bawah field link, sama seperti preview di
    // tab Pendidikan/Riwayat Mutasi (pakai normalizeDriveLink() yang sudah ada).
    updateKgbPreview() {
        const container = document.getElementById('pf-kgb-dokumen-preview');
        if (!container) return;
        const rawUrl = document.getElementById('pf-kgb-dokumen-url').value;
        const previewUrl = this.normalizeDriveLink(rawUrl);

        container.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">${rawUrl ? 'Link Google Drive tidak valid' : 'Belum ada link dokumen'}</span></div>`;
    },

    async saveRiwayatKgb() {
        const id         = document.getElementById('pf-kgb-id').value;
        const nomorSurat = document.getElementById('pf-kgb-nomorSurat').value.trim();

        if (!nomorSurat) { toast.error('Nomor surat wajib diisi!'); return; }

        const rawDokumenUrl = document.getElementById('pf-kgb-dokumen-url').value.trim();
        const fileDokumenUrl = rawDokumenUrl ? this.normalizeDriveLink(rawDokumenUrl) : '';

        if (rawDokumenUrl && !fileDokumenUrl) { toast.error('Link Dokumen KGB bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:             id || undefined,
            userId:         this.myId,
            nomorSurat,
            tmtKgb:         document.getElementById('pf-kgb-tmtKgb').value,
            tanggalSurat:   document.getElementById('pf-kgb-tanggalSurat').value,
            masaKerjaTahun: document.getElementById('pf-kgb-masaKerjaTahun').value.trim(),
            masaKerjaBulan: document.getElementById('pf-kgb-masaKerjaBulan').value.trim(),
            gajiPokokBaru:  document.getElementById('pf-kgb-gajiPokokBaru').value.trim(),
            fileDokumenUrl
        };

        try {
            const result = await api.saveRiwayatKgb(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan Kenaikan Gaji Berkala');
                return;
            }

            toast.success('Kenaikan Gaji Berkala berhasil disimpan!');
            this.resetKgbForm();
            this.closeKgbModal();
            await this.loadRiwayatKgb();
        } catch (e) {
            console.error('Error simpan riwayat KGB:', e);
            toast.error('Terjadi kesalahan saat menyimpan Kenaikan Gaji Berkala');
        }
    },

    async deleteRiwayatKgb(id) {
        if (!confirm('Hapus riwayat Kenaikan Gaji Berkala ini? (Link dokumen hanya dihapus dari aplikasi, file aslinya di Google Drive Anda tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatKgb(id);
            if (result.success) {
                toast.success('Riwayat Kenaikan Gaji Berkala dihapus');
                await this.loadRiwayatKgb();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    // ========== TAB GOLONGAN ==========

    riwayatGolongan: [],

    async loadRiwayatGolongan() {
        try {
            const result = await api.getRiwayatGolongan(this.myId);
            this.riwayatGolongan = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat Golongan:', e);
            this.riwayatGolongan = [];
        }
        this.renderRiwayatGolongan();
    },

    renderRiwayatGolongan() {
        const tbody = document.getElementById('pf-golongan-list');
        if (!tbody) return;

        if (this.riwayatGolongan.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Belum ada riwayat Golongan yang disimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = this.riwayatGolongan.map(r => `
            <tr>
                <td style="padding:10px 12px;">${this._esc(r.golongan || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(this._formatTanggalID(r.tmtGolongan) || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(r.nomorSK || '-')}</td>
                <td style="padding:10px 12px;">
                    ${r.fileDokumenUrl
                        ? `<button type="button" onclick="window.open('${r.fileDokumenUrl}', '_blank')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;"><i class="fas fa-download"></i> Unduh</button>`
                        : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada</span>`}
                </td>
                <td style="padding:10px 12px;">
                    <button type="button" onclick="profileManager.editRiwayatGolongan('${r.id}')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;"><i class="fas fa-pen"></i></button>
                    <button type="button" onclick="profileManager.deleteRiwayatGolongan('${r.id}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    openGolonganModal() {
        this.resetGolonganForm();
        document.getElementById('modal-golongan-form').style.display = 'flex';
    },

    closeGolonganModal() {
        document.getElementById('modal-golongan-form').style.display = 'none';
    },

    editRiwayatGolongan(id) {
        const r = this.riwayatGolongan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('pf-gol-id').value             = r.id;
        document.getElementById('pf-gol-golongan').value       = r.golongan || '';
        document.getElementById('pf-gol-tmtGolongan').value     = r.tmtGolongan || '';
        document.getElementById('pf-gol-jenisKenaikan').value  = r.jenisKenaikan || '';
        document.getElementById('pf-gol-nomorSK').value        = r.nomorSK || '';
        document.getElementById('pf-gol-masaKerjaTahun').value = r.masaKerjaTahun || '';
        document.getElementById('pf-gol-masaKerjaBulan').value = r.masaKerjaBulan || '';
        document.getElementById('pf-gol-tanggalSK').value      = r.tanggalSK || '';
        document.getElementById('pf-gol-dokumen-url').value    = r.fileDokumenUrl || '';

        document.getElementById('pf-gol-form-title').innerHTML = '<i class="fas fa-layer-group"></i> Edit Golongan';
        document.getElementById('pf-gol-btn-batal').style.display = 'inline-flex';

        this.updateGolonganPreview();
        document.getElementById('modal-golongan-form').style.display = 'flex';
    },

    resetGolonganForm() {
        document.getElementById('pf-gol-id').value = '';
        document.getElementById('pf-gol-golongan').value = '';
        document.getElementById('pf-gol-tmtGolongan').value = '';
        document.getElementById('pf-gol-jenisKenaikan').value = '';
        document.getElementById('pf-gol-nomorSK').value = '';
        document.getElementById('pf-gol-masaKerjaTahun').value = '';
        document.getElementById('pf-gol-masaKerjaBulan').value = '';
        document.getElementById('pf-gol-tanggalSK').value = '';
        document.getElementById('pf-gol-dokumen-url').value = '';

        document.getElementById('pf-gol-form-title').innerHTML = '<i class="fas fa-layer-group"></i> Tambah Golongan';
        document.getElementById('pf-gol-btn-batal').style.display = 'none';
        this.updateGolonganPreview();
    },

    updateGolonganPreview() {
        const container = document.getElementById('pf-gol-dokumen-preview');
        if (!container) return;
        const rawUrl = document.getElementById('pf-gol-dokumen-url').value;
        const previewUrl = this.normalizeDriveLink(rawUrl);

        container.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">${rawUrl ? 'Link Google Drive tidak valid' : 'Belum ada link dokumen'}</span></div>`;
    },

    async saveRiwayatGolongan() {
        const id       = document.getElementById('pf-gol-id').value;
        const golongan = document.getElementById('pf-gol-golongan').value.trim();

        if (!golongan) { toast.error('Golongan wajib diisi!'); return; }

        const rawDokumenUrl = document.getElementById('pf-gol-dokumen-url').value.trim();
        const fileDokumenUrl = rawDokumenUrl ? this.normalizeDriveLink(rawDokumenUrl) : '';

        if (rawDokumenUrl && !fileDokumenUrl) { toast.error('Link Dokumen SK Golongan bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:             id || undefined,
            userId:         this.myId,
            golongan,
            tmtGolongan:    document.getElementById('pf-gol-tmtGolongan').value,
            jenisKenaikan:  document.getElementById('pf-gol-jenisKenaikan').value,
            nomorSK:        document.getElementById('pf-gol-nomorSK').value.trim(),
            masaKerjaTahun: document.getElementById('pf-gol-masaKerjaTahun').value.trim(),
            masaKerjaBulan: document.getElementById('pf-gol-masaKerjaBulan').value.trim(),
            tanggalSK:      document.getElementById('pf-gol-tanggalSK').value,
            fileDokumenUrl
        };

        try {
            const result = await api.saveRiwayatGolongan(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan Golongan');
                return;
            }

            toast.success('Golongan berhasil disimpan!');
            this.resetGolonganForm();
            this.closeGolonganModal();
            await this.loadRiwayatGolongan();
        } catch (e) {
            console.error('Error simpan riwayat Golongan:', e);
            toast.error('Terjadi kesalahan saat menyimpan Golongan');
        }
    },

    async deleteRiwayatGolongan(id) {
        if (!confirm('Hapus riwayat Golongan ini? (Link dokumen hanya dihapus dari aplikasi, file aslinya di Google Drive Anda tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatGolongan(id);
            if (result.success) {
                toast.success('Riwayat Golongan dihapus');
                await this.loadRiwayatGolongan();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    // ========== TAB RIWAYAT MUTASI (perpindahan tugas + link Google Drive SK Mutasi) ==========

    riwayatMutasi: [],

    async loadRiwayatMutasi() {
        try {
            const result = await api.getRiwayatMutasi(this.myId);
            this.riwayatMutasi = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat mutasi:', e);
            this.riwayatMutasi = [];
        }
        this.renderRiwayatMutasi();
    },

    renderRiwayatMutasi() {
        const tbody = document.getElementById('pf-mutasi-list');
        if (!tbody) return;

        if (this.riwayatMutasi.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">Belum ada riwayat mutasi yang disimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = this.riwayatMutasi.map(r => `
            <tr>
                <td style="padding:10px 12px;">${this._esc(r.nomorSurat || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(this._formatTanggalID(r.tanggalSurat) || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(r.unorAsal || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(r.unorBaru || '-')}</td>
                <td style="padding:10px 12px;">
                    ${r.fileDokumenUrl
                        ? `<button type="button" onclick="window.open('${r.fileDokumenUrl}', '_blank')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;"><i class="fas fa-download"></i> Unduh</button>`
                        : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada</span>`}
                </td>
                <td style="padding:10px 12px;">
                    <button type="button" onclick="profileManager.editRiwayatMutasi('${r.id}')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;"><i class="fas fa-pen"></i></button>
                    <button type="button" onclick="profileManager.deleteRiwayatMutasi('${r.id}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Format "yyyy-mm-dd" ke "dd/mm/yyyy" untuk tampilan tabel Riwayat Mutasi
    _formatTanggalID(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).split('-');
        if (parts.length !== 3) return dateStr;
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
    },

    openMutasiModal() {
        this.resetMutasiForm();
        document.getElementById('modal-mutasi-form').style.display = 'flex';
    },

    closeMutasiModal() {
        document.getElementById('modal-mutasi-form').style.display = 'none';
    },

    editRiwayatMutasi(id) {
        const r = this.riwayatMutasi.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('pf-mts-id').value           = r.id;
        document.getElementById('pf-mts-nomorSurat').value    = r.nomorSurat || '';
        document.getElementById('pf-mts-tanggalSurat').value  = r.tanggalSurat || '';
        document.getElementById('pf-mts-unorAsal').value      = r.unorAsal || '';
        document.getElementById('pf-mts-unorBaru').value      = r.unorBaru || '';
        document.getElementById('pf-mts-dokumen-url').value   = r.fileDokumenUrl || '';

        document.getElementById('pf-mts-form-title').innerHTML = '<i class="fas fa-right-left"></i> Edit Riwayat Mutasi';
        document.getElementById('pf-mts-btn-batal').style.display = 'inline-flex';

        this.updateMutasiPreview();
        document.getElementById('modal-mutasi-form').style.display = 'flex';
    },

    resetMutasiForm() {
        document.getElementById('pf-mts-id').value = '';
        document.getElementById('pf-mts-nomorSurat').value = '';
        document.getElementById('pf-mts-tanggalSurat').value = '';
        document.getElementById('pf-mts-unorAsal').value = '';
        document.getElementById('pf-mts-unorBaru').value = '';
        document.getElementById('pf-mts-dokumen-url').value = '';

        document.getElementById('pf-mts-form-title').innerHTML = '<i class="fas fa-right-left"></i> Tambah Riwayat Mutasi';
        document.getElementById('pf-mts-btn-batal').style.display = 'none';
        this.updateMutasiPreview();
    },

    // Update preview dokumen di bawah field link, sama seperti preview di
    // tab Pendidikan (pakai normalizeDriveLink() yang sudah ada) - dipanggil
    // baik saat user mengetik/tempel link (oninput), maupun saat modal
    // dibuka untuk edit data yang sudah ada linknya.
    updateMutasiPreview() {
        const container = document.getElementById('pf-mts-dokumen-preview');
        if (!container) return;
        const rawUrl = document.getElementById('pf-mts-dokumen-url').value;
        const previewUrl = this.normalizeDriveLink(rawUrl);

        container.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">${rawUrl ? 'Link Google Drive tidak valid' : 'Belum ada link dokumen'}</span></div>`;
    },

    async saveRiwayatMutasi() {
        const id          = document.getElementById('pf-mts-id').value;
        const nomorSurat  = document.getElementById('pf-mts-nomorSurat').value.trim();

        if (!nomorSurat) { toast.error('Nomor surat wajib diisi!'); return; }

        const rawDokumenUrl = document.getElementById('pf-mts-dokumen-url').value.trim();
        const fileDokumenUrl = rawDokumenUrl ? this.normalizeDriveLink(rawDokumenUrl) : '';

        if (rawDokumenUrl && !fileDokumenUrl) { toast.error('Link Dokumen SK Mutasi bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:             id || undefined,
            userId:         this.myId,
            nomorSurat,
            tanggalSurat:   document.getElementById('pf-mts-tanggalSurat').value,
            unorAsal:       document.getElementById('pf-mts-unorAsal').value.trim(),
            unorBaru:       document.getElementById('pf-mts-unorBaru').value.trim(),
            fileDokumenUrl
        };

        try {
            const result = await api.saveRiwayatMutasi(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan riwayat mutasi');
                return;
            }

            toast.success('Riwayat mutasi berhasil disimpan!');
            this.resetMutasiForm();
            this.closeMutasiModal();
            await this.loadRiwayatMutasi();
        } catch (e) {
            console.error('Error simpan riwayat mutasi:', e);
            toast.error('Terjadi kesalahan saat menyimpan riwayat mutasi');
        }
    },

    async deleteRiwayatMutasi(id) {
        if (!confirm('Hapus riwayat mutasi ini? (Link dokumen hanya dihapus dari aplikasi, file aslinya di Google Drive Anda tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatMutasi(id);
            if (result.success) {
                toast.success('Riwayat mutasi dihapus');
                await this.loadRiwayatMutasi();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    // ========== TAB RIWAYAT KARYAWAN (status kepegawaian + link Google Drive SK CAPEG) ==========

    riwayatKaryawan: [],

    async loadRiwayatKaryawan() {
        try {
            const result = await api.getRiwayatKaryawan(this.myId);
            this.riwayatKaryawan = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat karyawan:', e);
            this.riwayatKaryawan = [];
        }
        this.renderRiwayatKaryawan();
    },

    renderRiwayatKaryawan() {
        const tbody = document.getElementById('pf-riwayatkaryawan-list');
        if (!tbody) return;

        // Header kolom "TMT (CAPEG)" ikut menyesuaikan status baris paling
        // baru (baris teratas, sudah terurut dari TMT terbaru): kalau
        // riwayat terkini "Calon Karyawan" -> "TMT CAPEG", kalau sudah
        // "Karyawan" -> "TMT" saja. Tabel ini bisa berisi banyak baris
        // dengan status berbeda-beda, jadi headernya cuma bisa mengikuti
        // status yang paling relevan/terkini, bukan tiap baris.
        const thTmt = document.getElementById('pf-rk-th-tmt');
        if (thTmt) {
            const terbaru = this.riwayatKaryawan[0];
            thTmt.textContent = (terbaru && terbaru.statusKepegawaian === 'Karyawan') ? 'TMT' : 'TMT CAPEG';
        }

        if (this.riwayatKaryawan.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">Belum ada riwayat karyawan yang disimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = this.riwayatKaryawan.map(r => `
            <tr>
                <td style="padding:10px 12px;">${this._esc(r.jenisKepegawaian || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(r.statusKepegawaian || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(this._formatTanggalID(r.tmtCapeg) || '-')}</td>
                <td style="padding:10px 12px;">${this._esc(r.nomorSK || '-')}</td>
                <td style="padding:10px 12px;">
                    ${r.fileDokumenUrl
                        ? `<button type="button" onclick="window.open('${r.fileDokumenUrl}', '_blank')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;"><i class="fas fa-download"></i> Unduh</button>`
                        : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada</span>`}
                </td>
                <td style="padding:10px 12px;">
                    <button type="button" onclick="profileManager.editRiwayatKaryawan('${r.id}')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;"><i class="fas fa-pen"></i></button>
                    <button type="button" onclick="profileManager.deleteRiwayatKaryawan('${r.id}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    openRiwayatKaryawanModal() {
        this.resetRiwayatKaryawanForm();
        document.getElementById('modal-riwayatkaryawan-form').style.display = 'flex';
    },

    closeRiwayatKaryawanModal() {
        document.getElementById('modal-riwayatkaryawan-form').style.display = 'none';
    },

    // Label field-field seputar CAPEG (Nomor SK, Tanggal SK, TMT, Nama
    // Jabatan Mengangkat, Dokumen SK) menyebut "CAPEG" hanya relevan kalau
    // statusnya "Calon Karyawan". Kalau statusnya sudah "Karyawan", kata
    // "CAPEG" di label dihilangkan - tapi field-nya sendiri TETAP tampil
    // dan tetap bisa diisi/disimpan seperti biasa.
    toggleRiwayatKaryawanCapegFields() {
        const status = document.getElementById('pf-rk-statusKepegawaian').value;
        const isCapeg = status === 'Calon Karyawan';

        const set = (id, textCapeg, textNonCapeg) => {
            const el = document.getElementById(id);
            if (el) el.textContent = isCapeg ? textCapeg : textNonCapeg;
        };
        set('pf-rk-label-nomorSK', 'Nomor Surat Keputusan CAPEG', 'Nomor Surat Keputusan');
        set('pf-rk-label-tanggalSK', 'Tanggal SK CAPEG', 'Tanggal SK');
        set('pf-rk-label-tmt', 'TMT CAPEG', 'TMT');
        set('pf-rk-label-jabatan', 'Nama Jabatan yang Mengangkat CAPEG', 'Nama Jabatan yang Mengangkat');
        set('pf-rk-label-dokumen', 'Link Google Drive - Dokumen SK CAPEG', 'Link Google Drive - Dokumen SK');
        const smallEl = document.getElementById('pf-rk-label-dokumen-small');
        if (smallEl) smallEl.textContent = isCapeg
            ? 'Upload file SK CAPEG ke Google Drive Anda, atur akses "Anyone with the link", lalu tempel link-nya di sini.'
            : 'Upload file SK ke Google Drive Anda, atur akses "Anyone with the link", lalu tempel link-nya di sini.';
        const urlInput = document.getElementById('pf-rk-dokumen-url');
        if (urlInput) urlInput.placeholder = isCapeg
            ? 'Tempel link share Google Drive Dokumen SK CAPEG di sini'
            : 'Tempel link share Google Drive Dokumen SK di sini';
    },

    editRiwayatKaryawan(id) {
        const r = this.riwayatKaryawan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('pf-rk-id').value                    = r.id;
        document.getElementById('pf-rk-jenisKepegawaian').value       = r.jenisKepegawaian || '';
        document.getElementById('pf-rk-statusKepegawaian').value      = r.statusKepegawaian || '';
        document.getElementById('pf-rk-nomorSK').value                = r.nomorSK || '';
        document.getElementById('pf-rk-tanggalSK').value              = r.tanggalSK || '';
        document.getElementById('pf-rk-tmtCapeg').value               = r.tmtCapeg || '';
        document.getElementById('pf-rk-namaJabatanMengangkat').value  = r.namaJabatanMengangkat || '';
        document.getElementById('pf-rk-dokumen-url').value            = r.fileDokumenUrl || '';

        document.getElementById('pf-rk-form-title').innerHTML = '<i class="fas fa-id-card"></i> Edit Riwayat Karyawan';
        document.getElementById('pf-rk-btn-batal').style.display = 'inline-flex';

        this.toggleRiwayatKaryawanCapegFields();
        this.updateRiwayatKaryawanPreview();
        document.getElementById('modal-riwayatkaryawan-form').style.display = 'flex';
    },

    resetRiwayatKaryawanForm() {
        document.getElementById('pf-rk-id').value = '';
        document.getElementById('pf-rk-jenisKepegawaian').value = '';
        document.getElementById('pf-rk-statusKepegawaian').value = '';
        document.getElementById('pf-rk-nomorSK').value = '';
        document.getElementById('pf-rk-tanggalSK').value = '';
        document.getElementById('pf-rk-tmtCapeg').value = '';
        document.getElementById('pf-rk-namaJabatanMengangkat').value = '';
        document.getElementById('pf-rk-dokumen-url').value = '';

        document.getElementById('pf-rk-form-title').innerHTML = '<i class="fas fa-id-card"></i> Tambah Riwayat Karyawan';
        document.getElementById('pf-rk-btn-batal').style.display = 'none';
        this.toggleRiwayatKaryawanCapegFields();
        this.updateRiwayatKaryawanPreview();
    },

    updateRiwayatKaryawanPreview() {
        const container = document.getElementById('pf-rk-dokumen-preview');
        if (!container) return;
        const rawUrl = document.getElementById('pf-rk-dokumen-url').value;
        const previewUrl = this.normalizeDriveLink(rawUrl);

        container.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark" style="font-size:1.5rem;"></i><span style="font-size:0.8rem;">${rawUrl ? 'Link Google Drive tidak valid' : 'Belum ada link dokumen'}</span></div>`;
    },

    async saveRiwayatKaryawan() {
        const id                 = document.getElementById('pf-rk-id').value;
        const jenisKepegawaian   = document.getElementById('pf-rk-jenisKepegawaian').value;
        const statusKepegawaian  = document.getElementById('pf-rk-statusKepegawaian').value;

        if (!jenisKepegawaian) { toast.error('Jenis Kepegawaian wajib dipilih!'); return; }
        if (!statusKepegawaian) { toast.error('Status Kepegawaian wajib dipilih!'); return; }

        const rawDokumenUrl = document.getElementById('pf-rk-dokumen-url').value.trim();
        const fileDokumenUrl = rawDokumenUrl ? this.normalizeDriveLink(rawDokumenUrl) : '';

        if (rawDokumenUrl && !fileDokumenUrl) { toast.error('Link Dokumen SK bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:                     id || undefined,
            userId:                 this.myId,
            jenisKepegawaian,
            statusKepegawaian,
            nomorSK:                document.getElementById('pf-rk-nomorSK').value.trim(),
            tanggalSK:              document.getElementById('pf-rk-tanggalSK').value,
            tmtCapeg:               document.getElementById('pf-rk-tmtCapeg').value,
            namaJabatanMengangkat:  document.getElementById('pf-rk-namaJabatanMengangkat').value.trim(),
            fileDokumenUrl
        };

        try {
            const result = await api.saveRiwayatKaryawan(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan Riwayat Karyawan');
                return;
            }

            toast.success('Riwayat Karyawan berhasil disimpan!');
            this.resetRiwayatKaryawanForm();
            this.closeRiwayatKaryawanModal();
            await this.loadRiwayatKaryawan();
        } catch (e) {
            console.error('Error simpan riwayat karyawan:', e);
            toast.error('Terjadi kesalahan saat menyimpan Riwayat Karyawan');
        }
    },

    async deleteRiwayatKaryawan(id) {
        if (!confirm('Hapus riwayat karyawan ini? (Link dokumen hanya dihapus dari aplikasi, file aslinya di Google Drive Anda tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatKaryawan(id);
            if (result.success) {
                toast.success('Riwayat Karyawan dihapus');
                await this.loadRiwayatKaryawan();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    }
};

window.initProfile = () => { profileManager.init(); };
window.profileManager = profileManager;
