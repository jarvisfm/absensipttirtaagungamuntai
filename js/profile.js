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
        await this.loadMyProfile();
        await this.loadRiwayatPendidikan();
        await this.loadRiwayatMutasi();
    },

    switchTab(tab) {
        ['profil', 'kekaryawanan', 'keluarga', 'akun', 'pendidikan', 'mutasi'].forEach(t => {
            const content = document.getElementById(`pf-tabcontent-${t}`);
            const btn     = document.getElementById(`pf-tab-${t}`);
            if (content) content.style.display = t === tab ? 'block' : 'none';
            if (btn) {
                btn.style.color        = t === tab ? 'var(--color-primary)' : 'var(--text-muted)';
                btn.style.fontWeight   = t === tab ? '600' : '500';
                btn.style.borderBottom = t === tab ? '2px solid var(--color-primary)' : '2px solid transparent';
            }
        });
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
            if (p.foto) {
                document.getElementById('pf-foto-preview').src = p.foto;
                document.getElementById('pf-foto-preview').style.display = 'block';
                document.getElementById('pf-foto-placeholder').style.display = 'none';
            } else {
                document.getElementById('pf-foto-preview').style.display = 'none';
                document.getElementById('pf-foto-placeholder').style.display = 'block';
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
            document.getElementById('pf-shift').value           = p.shift || 'Reguler (Sen-Kam)';

            this.applyFieldPermissions();

            // Berkas SK/KTP/Ijazah/Sertifikat: tidak diedit dari halaman ini,
            // jadi tidak perlu dimuat ke form. Nilainya tetap tersimpan di
            // data karyawan dan tidak disentuh sama sekali oleh halaman Edit
            // Profil ini.

            // Tab Keluarga
            const keluarga = p.keluarga || [];
            const pasangan = keluarga.find(k => k.tipe === 'pasangan');
            const ayah     = keluarga.find(k => k.tipe === 'ayah');
            const ibu      = keluarga.find(k => k.tipe === 'ibu');
            const anakList = keluarga.filter(k => k.tipe === 'anak');

            document.getElementById('pf-namaPasangan').value = pasangan?.nama || '';
            this.renderPasanganDocBlocks(pasangan || {});
            this.renderKtpUserPreview(p.fileKTP || '');
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
                <div id="pf-anak-${n}-${key}-preview" style="position:relative;height:180px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);">
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
                <div id="pf-pasangan-${key}-preview" style="position:relative;height:180px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary,#f8f9fa);">
                    ${previewUrl
                        ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
                        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${url ? 'Link tidak valid' : 'Belum ada link'}</span></div>`}
                </div>
            </div>
        `;
    },

    // Preview read-only "Link KTP (Anda)" - berkas KTP sendiri, HANYA bisa
    // diisi/diubah oleh Admin (lihat komentar di loadProfile), jadi di sini
    // cuma ditampilkan (tanpa input) supaya tetap kelihatan di tab Keluarga.
    renderKtpUserPreview(fileKTP) {
        const el = document.getElementById('pf-ktpUser-preview');
        if (!el) return;
        const previewUrl = fileKTP ? this.normalizeDriveLink(fileKTP) : '';
        el.innerHTML = previewUrl
            ? `<iframe src="${this._esc(previewUrl)}" style="width:100%;height:100%;border:none;"></iframe>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--text-muted);"><i class="fas fa-file-circle-xmark"></i><span style="font-size:0.75rem;">${fileKTP ? 'Link tidak valid' : 'Belum ada link'}</span></div>`;
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
     * Pangkat, Golongan, Masa Kerja, dan Tahun Pensiun HANYA boleh diubah
     * oleh Admin - staff/asmen/manajer biasa cuma bisa lihat (disabled),
     * tidak bisa mengetik/mengubah nilainya sendiri lewat halaman ini.
     */
    applyFieldPermissions() {
        const restricted = ['pf-pangkat', 'pf-golongan', 'pf-masaKerja', 'pf-tahunPensiun'];
        restricted.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.disabled = !this.isAdmin;
            el.title = this.isAdmin ? '' : 'Hanya Admin yang dapat mengubah field ini';
        });
    },

    previewFoto(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('pf-foto-preview').src = e.target.result;
                document.getElementById('pf-foto-preview').style.display = 'block';
                document.getElementById('pf-foto-placeholder').style.display = 'none';
            };
            reader.readAsDataURL(input.files[0]);
        }
    },

    async saveProfile() {
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
            email:            document.getElementById('pf-email').value.trim(),
            statusPekerjaan:  document.getElementById('pf-statusPekerjaan').value,
            statusKaryawan:   document.getElementById('pf-statusKaryawan').value,
            pendidikan:       document.getElementById('pf-pendidikan').value,
            jabatan:          document.getElementById('pf-jabatan').value.trim(),
            unitWilayah:      document.getElementById('pf-unitWilayah').value.trim(),
            bagian:           document.getElementById('pf-bagian').value.trim(),
            role:             document.getElementById('pf-role').value,
            gajiPokok:        document.getElementById('pf-gajiPokok').value,
            terhitungMulai:   document.getElementById('pf-terhitungMulai').value,
            shift:            document.getElementById('pf-shift').value,
            username:         document.getElementById('pf-username').value.trim(),
            // Pangkat/Golongan/Masa Kerja/Tahun Pensiun SENGAJA tidak selalu
            // disertakan di sini - lihat penjelasan di bawah.
            keluarga
        };

        // Pangkat, Golongan, Masa Kerja, Tahun Pensiun HANYA boleh diubah
        // Admin. Untuk staff/asmen/manajer, field-field ini memang di-disable
        // di form-nya, tapi supaya aman (tidak sekadar UI), di sini juga
        // SENGAJA tidak disertakan sama sekali di payload kalau bukan Admin -
        // backend membiarkan nilai lama tetap ada untuk field yang tidak
        // dikirim (pola yang sama seperti fileSK/fileKTP di atas).
        if (this.isAdmin) {
            data.pangkat      = document.getElementById('pf-pangkat').value.trim();
            data.golongan     = document.getElementById('pf-golongan').value.trim();
            data.masaKerja    = document.getElementById('pf-masaKerja').value.trim();
            data.tahunPensiun = document.getElementById('pf-tahunPensiun').value.trim();
        }

        const pwd = document.getElementById('pf-password').value;
        if (pwd) data.password = pwd;

        try {
            const result = await api.updateKaryawan(this.myId, data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan profil');
                return;
            }

            // Upload foto jika ada
            const fotoFile = document.getElementById('pf-foto-file')?.files[0];
            if (fotoFile) {
                await this.uploadFoto(fotoFile);
            }

            toast.success('Profil berhasil diperbarui!');

            // Sinkronkan nama/foto di sidebar & sesi login
            const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
            if (user) {
                user.name = nama;
                if (typeof storage !== 'undefined') storage.set('session', user);
                if (auth.updateUserUI) auth.updateUserUI();
            }

            document.getElementById('pf-password').value = '';
            await this.loadMyProfile();

        } catch (e) {
            console.error('Error save profil:', e);
            toast.error('Terjadi kesalahan saat menyimpan');
        }
    },

    async uploadFoto(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                try {
                    await api.uploadFotoKaryawan(this.myId, base64, mimeType);
                } catch (err) {
                    console.error('Upload foto gagal:', err);
                }
                resolve();
            };
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

        try {
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
    }
};

window.initProfile = () => { profileManager.init(); };
window.profileManager = profileManager;
