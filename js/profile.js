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
    },

    switchTab(tab) {
        ['profil', 'kekaryawanan', 'keluarga', 'akun', 'dokumen'].forEach(t => {
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
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;border:1px solid var(--border-color);border-radius:8px;padding:0.85rem 1rem;margin-bottom:0.6rem;">
                <div style="min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:2px;">
                        <i class="fas fa-file-alt" style="color:var(--color-primary);"></i> ${this._esc(d.nama)}
                    </div>
                    ${d.keterangan ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">${this._esc(d.keterangan)}</div>` : ''}
                    <a href="${this._esc(d.url)}" target="_blank" style="font-size:0.8rem;color:var(--color-primary);word-break:break-all;">
                        <i class="fas fa-external-link-alt"></i> Buka Tautan
                    </a>
                </div>
                <button type="button" onclick="profileManager.deleteDocLink('${d.id}')"
                    style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;flex-shrink:0;">
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

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.initProfile = () => { profileManager.init(); };
window.profileManager = profileManager;
