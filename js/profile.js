/**
 * Portal Karyawan - Edit Profil (Self-Service)
 * PT. Tirta Agung Amuntai
 *
 * Halaman ini dipakai oleh Staff/Asmen/Manajer (termasuk Admin saat Mode
 * Karyawan aktif) untuk mengubah data profil sendiri. Field & tab-nya sama
 * persis dengan modal "Edit Karyawan" milik Admin (lihat js/karyawan.js),
 * tapi HANYA bisa mengedit data akun sendiri (id diambil dari sesi login),
 * ditambah 1 tab baru "Dokumen" untuk menyimpan tautan Google Drive bernama
 * bebas (tidak mengunggah file fisik, hanya link).
 */

const profileManager = {
    myId: null,
    anakCount: 0,
    docLinks: [],
    riwayatPendidikan: [],

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

        if (!this.myId) {
            toast.error('Akun Admin ini belum terhubung ke data karyawan di menu Data Karyawan, jadi belum ada profil untuk diedit di sini.');
            return;
        }

        this.switchTab('profil');
        await this.loadMyProfile();
        await this.loadDocLinks();
        await this.loadRiwayatPendidikan();
    },

    switchTab(tab) {
        ['profil', 'kekaryawanan', 'keluarga', 'akun', 'dokumen', 'pendidikan'].forEach(t => {
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
            document.getElementById('pf-unitKerja').value       = p.unitKerja || '';
            document.getElementById('pf-unitWilayah').value     = p.unitWilayah || '';
            document.getElementById('pf-bagian').value          = p.bagian || '';
            document.getElementById('pf-role').value            = p.role || 'staff';
            document.getElementById('pf-pangkat').value         = p.pangkat || '';
            document.getElementById('pf-golongan').value        = p.golongan || '';
            document.getElementById('pf-gajiPokok').value       = p.gajiPokok || '';
            document.getElementById('pf-terhitungMulai').value  = p.terhitungMulai || '';
            document.getElementById('pf-masaKerja').value       = p.masaKerja || '';
            document.getElementById('pf-tahunPensiun').value    = p.tahunPensiun || '';
            document.getElementById('pf-shift').value           = p.shift || 'Reguler (Sen-Kam)';

            // Berkas SK/KTP/Ijazah/Sertifikat: tidak lagi diedit dari halaman
            // ini (sudah digantikan tab "Dokumen"), jadi tidak perlu dimuat
            // ke form. Nilainya tetap tersimpan di data karyawan dan tidak
            // disentuh sama sekali oleh halaman Edit Profil ini.

            // Tab Keluarga
            const keluarga = p.keluarga || [];
            const pasangan = keluarga.find(k => k.tipe === 'pasangan');
            const ayah     = keluarga.find(k => k.tipe === 'ayah');
            const ibu      = keluarga.find(k => k.tipe === 'ibu');
            const anakList = keluarga.filter(k => k.tipe === 'anak');

            document.getElementById('pf-namaPasangan').value = pasangan?.nama || '';
            document.getElementById('pf-namaAyah').value     = ayah?.nama || '';
            document.getElementById('pf-namaIbu').value      = ibu?.nama || '';

            document.getElementById('pf-anak-list').innerHTML = '';
            this.anakCount = 0;
            anakList.forEach(a => this.addAnakField(a.nama));

            // Tab Akun
            document.getElementById('pf-username').value = p.username || '';

        } catch (e) {
            console.error('Error load profil:', e);
            toast.error('Terjadi kesalahan saat memuat profil');
        }
    },

    addAnakField(value = '') {
        this.anakCount++;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
        div.id = `pf-anak-row-${this.anakCount}`;
        div.innerHTML = `
            <input type="text" value="${value}" placeholder="Nama anak ke-${this.anakCount}"
                style="flex:1;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;font-family:inherit;">
            <button type="button" onclick="this.parentElement.remove()"
                style="background:#EF4444;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.getElementById('pf-anak-list').appendChild(div);
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
        if (namaPasangan) keluarga.push({ tipe: 'pasangan', nama: namaPasangan });

        const anakInputs = document.querySelectorAll('#pf-anak-list input');
        anakInputs.forEach(inp => {
            if (inp.value.trim()) keluarga.push({ tipe: 'anak', nama: inp.value.trim() });
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
            unitKerja:        document.getElementById('pf-unitKerja').value.trim(),
            unitWilayah:      document.getElementById('pf-unitWilayah').value.trim(),
            bagian:           document.getElementById('pf-bagian').value.trim(),
            role:             document.getElementById('pf-role').value,
            pangkat:          document.getElementById('pf-pangkat').value.trim(),
            golongan:         document.getElementById('pf-golongan').value.trim(),
            gajiPokok:        document.getElementById('pf-gajiPokok').value,
            terhitungMulai:   document.getElementById('pf-terhitungMulai').value,
            masaKerja:        document.getElementById('pf-masaKerja').value.trim(),
            tahunPensiun:     document.getElementById('pf-tahunPensiun').value.trim(),
            shift:            document.getElementById('pf-shift').value,
            username:         document.getElementById('pf-username').value.trim(),
            // fileSK/fileKTP/fileIjazah/fileSertifikat SENGAJA tidak disertakan
            // di sini. Field ini sudah tidak diedit dari halaman Edit Profil
            // (tab "Upload File" dihapus, digantikan tab "Dokumen"), dan kalau
            // dikirim kosong ('') di sini, backend akan MENIMPA nilai yang
            // sudah tersimpan menjadi kosong. Dengan tidak menyertakan field
            // ini, updateKaryawanData() di backend otomatis membiarkan nilai
            // lama tetap ada (hanya field yang dikirim yang ditimpa).
            keluarga
        };

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

    // ========== TAB DOKUMEN (tautan Drive bernama bebas) ==========

    async loadDocLinks() {
        try {
            const result = await api.getDocumentLinks(this.myId);
            this.docLinks = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load dokumen:', e);
            this.docLinks = [];
        }
        this.renderDocLinks();
    },

    renderDocLinks() {
        const container = document.getElementById('pf-dokumen-list');
        if (!container) return;

        if (this.docLinks.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Belum ada tautan dokumen yang disimpan.</p>';
            return;
        }

        container.innerHTML = this.docLinks.map(d => `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border:1px solid var(--border-color);border-radius:8px;padding:1.25rem;margin-bottom:1rem;">
                <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <i class="fas fa-file-alt" style="color:var(--color-primary);font-size:1.1rem;"></i>
                        <span style="font-weight:600;font-size:1.05rem;">${this._esc(d.nama)}</span>
                    </div>
                    ${d.keterangan ? `<div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">${this._esc(d.keterangan)}</div>` : ''}
                    <a href="${this._esc(d.url)}" target="_blank" style="font-size:0.9rem;color:var(--color-primary);word-break:break-all;font-weight:500;">
                        <i class="fas fa-external-link-alt"></i> Buka Tautan
                    </a>
                </div>
                <button type="button" onclick="profileManager.deleteDocLink('${d.id}')"
                    style="background:#EF4444;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:0.9rem;flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    async saveDocLink() {
        const nama = document.getElementById('pf-doc-nama').value.trim();
        const url  = document.getElementById('pf-doc-url').value.trim();
        const keterangan = document.getElementById('pf-doc-keterangan').value.trim();

        if (!nama || !url) {
            toast.error('Nama dan Link dokumen wajib diisi!');
            return;
        }

        try {
            const result = await api.addDocumentLink({
                employeeId: this.myId,
                nama,
                url,
                keterangan
            });

            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan tautan dokumen');
                return;
            }

            toast.success('Tautan dokumen berhasil disimpan!');
            document.getElementById('pf-doc-nama').value = '';
            document.getElementById('pf-doc-url').value = '';
            document.getElementById('pf-doc-keterangan').value = '';

            await this.loadDocLinks();
        } catch (e) {
            console.error('Error simpan dokumen:', e);
            toast.error('Terjadi kesalahan saat menyimpan tautan');
        }
    },

    async deleteDocLink(id) {
        if (!confirm('Hapus tautan dokumen ini?')) return;
        try {
            const result = await api.deleteDocumentLink(id);
            if (result.success) {
                toast.success('Tautan dokumen dihapus');
                await this.loadDocLinks();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    // ========== TAB PENDIDIKAN (Riwayat SD/SMP/SMA/S1/S2 + upload file) ==========

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
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                            ${(r.fileIjazahUrl || r.fileTranskripUrl) ? `<button type="button" onclick="profileManager.openPreviewPendidikan('${r.id}')" style="background:var(--color-primary);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-eye"></i> Review Dokumen</button>` : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic;">Belum ada link Ijazah/Transkrip</span>`}
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
        document.getElementById('pf-pdk-pendidikanPertama').checked  = r.pendidikanPertama === 'true';
        document.getElementById('pf-pdk-pendidikanTerakhir').checked = r.pendidikanTerakhir === 'true';

        document.getElementById('pf-pdk-ijazah-url').value    = r.fileIjazahUrl || '';
        document.getElementById('pf-pdk-transkrip-url').value = r.fileTranskripUrl || '';

        document.getElementById('pf-pendidikan-form-title').innerHTML = '<i class="fas fa-graduation-cap"></i> Edit Riwayat Pendidikan';
        document.getElementById('pf-pdk-btn-batal').style.display = 'inline-flex';

        document.getElementById('pf-pdk-jenjang').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        document.getElementById('pf-pdk-pendidikanPertama').checked = false;
        document.getElementById('pf-pdk-pendidikanTerakhir').checked = false;
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
            pendidikanPertama:  document.getElementById('pf-pdk-pendidikanPertama').checked,
            pendidikanTerakhir: document.getElementById('pf-pdk-pendidikanTerakhir').checked,
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
            const savedId = result.data && result.data.id ? result.data.id : null;
            this.resetPendidikanForm();
            await this.loadRiwayatPendidikan();

            // Auto-buka review dokumen kalau ada minimal 1 link tersimpan
            if (savedId && (fileIjazahUrl || fileTranskripUrl)) {
                this.openPreviewPendidikan(savedId);
            }
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

    openPreviewPendidikan(id) {
        const r = this.riwayatPendidikan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('modal-preview-pendidikan-title').textContent =
            `Review Dokumen - ${r.jenjang} ${r.namaSekolah}`;

        this._togglePreviewPane('ijazah', r.fileIjazahUrl);
        this._togglePreviewPane('transkrip', r.fileTranskripUrl);

        document.getElementById('modal-preview-pendidikan').style.display = 'flex';
    },

    _togglePreviewPane(key, url) {
        const iframe = document.getElementById(`modal-preview-pendidikan-${key}`);
        const empty  = document.getElementById(`modal-preview-pendidikan-${key}-empty`);
        if (url) {
            iframe.src = url;
            iframe.style.display = '';
            empty.style.display = 'none';
        } else {
            iframe.src = '';
            iframe.style.display = 'none';
            empty.style.display = 'block';
        }
    },

    closePreviewPendidikan() {
        document.getElementById('modal-preview-pendidikan').style.display = 'none';
        document.getElementById('modal-preview-pendidikan-ijazah').src = '';
        document.getElementById('modal-preview-pendidikan-transkrip').src = '';
    },

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    }
};

window.initProfile = () => { profileManager.init(); };
window.profileManager = profileManager;
