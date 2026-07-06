/**
 * Portal Karyawan - Data Karyawan
 * PT. Tirta Agung Amuntai
 */

const karyawanManager = {
    karyawanList: [],
    editingId: null,
    anakCount: 0,

    async init() {
        if (!auth.isAdmin()) {
            router.navigate('admin-dashboard');
            return;
        }
        await this.loadKaryawan();
        this.bindEvents();
    },

    async loadKaryawan() {
        try {
            const result = await api.getKaryawanList();
            this.karyawanList = result.data || [];
            this.renderTable();
        } catch (e) {
            console.error('Error loading karyawan:', e);
            toast.error('Gagal memuat data karyawan');
        }
    },

    bindEvents() {
        document.getElementById('btn-add-karyawan')?.addEventListener('click', () => this.openModal());

        document.getElementById('karyawan-search')?.addEventListener('input', () => this.renderTable());
        document.getElementById('karyawan-status-filter')?.addEventListener('change', () => this.renderTable());
        document.getElementById('karyawan-jenis-filter')?.addEventListener('change', () => this.renderTable());
    },

    getFiltered() {
        const search = (document.getElementById('karyawan-search')?.value || '').toLowerCase();
        const status = document.getElementById('karyawan-status-filter')?.value || '';
        const jenis  = document.getElementById('karyawan-jenis-filter')?.value || '';

        return this.karyawanList.filter(p => {
            const matchSearch = !search ||
                (p.nama || '').toLowerCase().includes(search) ||
                (p.nik  || '').toLowerCase().includes(search);
            const matchStatus = !status || String(p.statusKaryawan).toUpperCase() === status;
            const matchJenis  = !jenis  || p.statusPekerjaan === jenis;
            return matchSearch && matchStatus && matchJenis;
        });
    },

    renderTable() {
        const tbody = document.getElementById('karyawan-table-body');
        if (!tbody) return;

        const data = this.getFiltered();

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Belum ada data karyawan</td></tr>';
            return;
        }

        const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];

        tbody.innerHTML = data.map((p, idx) => {
            const initials = (p.nama || 'P').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
            const color    = colors[(p.nama || '').charCodeAt(0) % colors.length];

            const fotoHtml = p.foto
                ? `<img src="${p.foto}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.75rem;">${initials}</div>`;



            const statusColor = p.statusKaryawan === 'AKTIF' ? 'success' : 'warning';

            return `
                <tr>
                    <td style="padding:10px 12px;">${idx + 1}</td>
                    <td style="padding:10px 12px;">${fotoHtml}</td>
                    <td style="padding:10px 12px;font-size:0.82rem;">${p.nik || '-'}</td>
                    <td style="padding:10px 12px;font-weight:500;">${p.nama || '-'}</td>
                    <td style="padding:10px 12px;font-size:0.85rem;">${p.jabatan || '-'}</td>
                    <td style="padding:10px 12px;font-size:0.85rem;">${p.unitKerja || '-'}</td>
                    <td style="padding:10px 12px;">
                        <span class="badge-status ${statusColor}">${p.statusKaryawan || '-'}</span>
                    </td>
                    <td style="padding:10px 12px;">
                        <button onclick="karyawanManager.viewDetail('${p.id}')" style="background:#3B82F6;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;font-size:0.75rem;"><i class="fas fa-eye"></i></button>
                        <button onclick="karyawanManager.openModal('${p.id}')" style="background:#F59E0B;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;font-size:0.75rem;"><i class="fas fa-edit"></i></button>
                        <button onclick="karyawanManager.deleteKaryawan('${p.id}')" style="background:#EF4444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    switchTab(tab) {
        ['profil','kekaryawanan','keluarga','akun','uploadfile'].forEach(t => {
            const content = document.getElementById(`tabcontent-${t}`);
            const btn     = document.getElementById(`tab-${t}`);
            if (content) content.style.display = t === tab ? 'block' : 'none';
            if (btn) {
                btn.style.color       = t === tab ? 'var(--color-primary)' : 'var(--text-muted)';
                btn.style.fontWeight  = t === tab ? '600' : '500';
                btn.style.borderBottom = t === tab ? '2px solid var(--color-primary)' : '2px solid transparent';
            }
        });
    },

    openModal(id = null) {
        this.editingId = id;
        this.anakCount = 0;
        document.getElementById('modal-karyawan-title').textContent = id ? 'Edit Karyawan' : 'Tambah Karyawan';
        this.resetForm();
        this.switchTab('profil');

        if (id) {
            this.loadDetailForEdit(id);
        }

        document.getElementById('modal-karyawan').style.display = 'flex';
    },

    async loadDetailForEdit(id) {
        try {
            const result = await api.getKaryawanDetail(id);
            if (!result.success) return;
            const p = result.data;

            // Tab Profil
            document.getElementById('karyawan-id').value        = p.id || '';
            document.getElementById('p-nik').value             = p.nik || '';
            document.getElementById('p-nama').value            = p.nama || '';
            document.getElementById('p-jenisKelamin').value    = p.jenisKelamin || '';
            document.getElementById('p-statusPernikahan').value = p.statusPernikahan || '';
            document.getElementById('p-tempatLahir').value     = p.tempatLahir || '';
            document.getElementById('p-tanggalLahir').value    = p.tanggalLahir || '';
            document.getElementById('p-golonganDarah').value   = p.golonganDarah || '';
            document.getElementById('p-noTelp').value          = p.noTelp || '';
            document.getElementById('p-npwp').value            = p.npwp || '';
            document.getElementById('p-ktp').value             = p.ktp || '';
            document.getElementById('p-email').value           = p.email || '';

            // Foto
            if (p.foto) {
                document.getElementById('foto-preview').src          = p.foto;
                document.getElementById('foto-preview').style.display = 'block';
                document.getElementById('foto-placeholder').style.display = 'none';
            }

            // Tab Kekaryawanan
            document.getElementById('p-statusPekerjaan').value = p.statusPekerjaan || 'Karyawan Tetap';
            document.getElementById('p-statusKaryawan').value  = p.statusKaryawan || 'AKTIF';

            // Berkas SK
            if (p.fileSK) {
                document.getElementById('karyawan-sk-link').value = p.fileSK;
                document.getElementById('sk-file-link').href = p.fileSK;
                document.getElementById('sk-file-current').style.display = 'block';
            }

            // Berkas KTP, Ijazah, Sertifikat
            [['ktp','fileKTP'],['ijazah','fileIjazah'],['sertifikat','fileSertifikat']].forEach(([type, field]) => {
                if (p[field]) {
                    const input = document.getElementById(`karyawan-${type}-link`);
                    const link  = document.getElementById(`${type}-file-link`);
                    const cur   = document.getElementById(`${type}-file-current`);
                    if (input) input.value = p[field];
                    if (link)  link.href = p[field];
                    if (cur)   cur.style.display = 'block';
                }
            });

            document.getElementById('p-pendidikan').value      = p.pendidikan || '';
            document.getElementById('p-jabatan').value         = p.jabatan || '';
            document.getElementById('p-unitKerja').value       = p.unitKerja || '';
            document.getElementById('p-unitWilayah').value     = p.unitWilayah || '';
            document.getElementById('p-bagian').value          = p.bagian || '';
            document.getElementById('p-role').value            = p.role || 'staff';
            document.getElementById('p-pangkat').value         = p.pangkat || '';
            document.getElementById('p-golongan').value        = p.golongan || '';
            document.getElementById('p-gajiPokok').value       = p.gajiPokok || '';
            document.getElementById('p-terhitungMulai').value  = p.terhitungMulai || '';
            document.getElementById('p-masaKerja').value       = p.masaKerja || '';
            document.getElementById('p-tahunPensiun').value    = p.tahunPensiun || '';
            document.getElementById('p-shift').value           = p.shift || 'Reguler (Sen-Kam)';

            // Tab Keluarga
            const keluarga = p.keluarga || [];
            const pasangan = keluarga.find(k => k.tipe === 'pasangan');
            const ayah     = keluarga.find(k => k.tipe === 'ayah');
            const ibu      = keluarga.find(k => k.tipe === 'ibu');
            const anakList = keluarga.filter(k => k.tipe === 'anak');

            document.getElementById('p-namaPasangan').value = pasangan?.nama || '';
            document.getElementById('p-namaAyah').value     = ayah?.nama || '';
            document.getElementById('p-namaIbu').value      = ibu?.nama || '';

            document.getElementById('anak-list').innerHTML = '';
            this.anakCount = 0;
            anakList.forEach(a => this.addAnakField(a.nama));

            // Tab Akun
            document.getElementById('p-username').value = p.username || '';

        } catch (e) {
            console.error('Error load detail:', e);
        }
    },

    resetForm() {
        const fields = ['karyawan-id','p-nik','p-nama','p-jenisKelamin','p-statusPernikahan',
            'p-tempatLahir','p-tanggalLahir','p-golonganDarah','p-noTelp','p-npwp','p-ktp',
            'p-email','p-statusPekerjaan','p-statusKaryawan','p-pendidikan','p-jabatan',
            'p-unitKerja','p-unitWilayah','p-bagian','p-pangkat','p-golongan','p-gajiPokok',
            'p-terhitungMulai','p-masaKerja','p-tahunPensiun','p-shift',
            'p-namaPasangan','p-namaAyah','p-namaIbu','p-username','p-password'];

        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Select tidak punya opsi kosong, jadi default-kan manual ke 'staff'
        const roleEl = document.getElementById('p-role');
        if (roleEl) roleEl.value = 'staff';

        document.getElementById('foto-preview').src = '';
        document.getElementById('foto-preview').style.display = 'none';
        document.getElementById('foto-placeholder').style.display = 'block';
        document.getElementById('anak-list').innerHTML = '';
        document.getElementById('karyawan-foto-file').value = '';
        document.getElementById('karyawan-sk-link').value = '';
        document.getElementById('sk-file-current').style.display = 'none';
        ['ktp','ijazah','sertifikat'].forEach(type => {
            const el = document.getElementById(`karyawan-${type}-link`);
            if (el) el.value = '';
            const cur = document.getElementById(`${type}-file-current`);
            if (cur) cur.style.display = 'none';
        });
    },

    addAnakField(value = '') {
        this.anakCount++;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
        div.id = `anak-row-${this.anakCount}`;
        div.innerHTML = `
            <input type="text" value="${value}" placeholder="Nama anak ke-${this.anakCount}"
                style="flex:1;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;font-family:inherit;">
            <button type="button" onclick="this.parentElement.remove()"
                style="background:#EF4444;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.getElementById('anak-list').appendChild(div);
    },

    previewFoto(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('foto-preview').src = e.target.result;
                document.getElementById('foto-preview').style.display = 'block';
                document.getElementById('foto-placeholder').style.display = 'none';
            };
            reader.readAsDataURL(input.files[0]);
        }
    },

    async saveKaryawan() {
        const nama = document.getElementById('p-nama').value.trim();
        if (!nama) {
            toast.error('Nama karyawan harus diisi!');
            this.switchTab('profil');
            return;
        }

        // Kumpulkan data keluarga
        const keluarga = [];
        const namaPasangan = document.getElementById('p-namaPasangan').value.trim();
        if (namaPasangan) keluarga.push({ tipe: 'pasangan', nama: namaPasangan });

        const anakInputs = document.querySelectorAll('#anak-list input');
        anakInputs.forEach(inp => {
            if (inp.value.trim()) keluarga.push({ tipe: 'anak', nama: inp.value.trim() });
        });

        const namaAyah = document.getElementById('p-namaAyah').value.trim();
        if (namaAyah) keluarga.push({ tipe: 'ayah', nama: namaAyah });

        const namaIbu = document.getElementById('p-namaIbu').value.trim();
        if (namaIbu) keluarga.push({ tipe: 'ibu', nama: namaIbu });

        const data = {
            nik:              document.getElementById('p-nik').value.trim(),
            nama,
            jenisKelamin:     document.getElementById('p-jenisKelamin').value,
            statusPernikahan: document.getElementById('p-statusPernikahan').value,
            tempatLahir:      document.getElementById('p-tempatLahir').value.trim(),
            tanggalLahir:     document.getElementById('p-tanggalLahir').value,
            golonganDarah:    document.getElementById('p-golonganDarah').value,
            noTelp:           document.getElementById('p-noTelp').value.trim(),
            npwp:             document.getElementById('p-npwp').value.trim(),
            ktp:              document.getElementById('p-ktp').value.trim(),
            email:            document.getElementById('p-email').value.trim(),
            statusPekerjaan:  document.getElementById('p-statusPekerjaan').value,
            statusKaryawan:   document.getElementById('p-statusKaryawan').value,
            pendidikan:       document.getElementById('p-pendidikan').value,
            jabatan:          document.getElementById('p-jabatan').value.trim(),
            unitKerja:        document.getElementById('p-unitKerja').value.trim(),
            unitWilayah:      document.getElementById('p-unitWilayah').value.trim(),
            bagian:           document.getElementById('p-bagian').value.trim(),
            role:             document.getElementById('p-role').value,
            pangkat:          document.getElementById('p-pangkat').value.trim(),
            golongan:         document.getElementById('p-golongan').value.trim(),
            gajiPokok:        document.getElementById('p-gajiPokok').value,
            terhitungMulai:   document.getElementById('p-terhitungMulai').value,
            masaKerja:        document.getElementById('p-masaKerja').value.trim(),
            tahunPensiun:     document.getElementById('p-tahunPensiun').value.trim(),
            shift:            document.getElementById('p-shift').value,
            username:         document.getElementById('p-username').value.trim(),
            fileSK:           document.getElementById('karyawan-sk-link')?.value.trim() || '',
            fileKTP:          document.getElementById('karyawan-ktp-link')?.value.trim() || '',
            fileIjazah:       document.getElementById('karyawan-ijazah-link')?.value.trim() || '',
            fileSertifikat:   document.getElementById('karyawan-sertifikat-link')?.value.trim() || '',
            keluarga
        };

        const pwd = document.getElementById('p-password').value;
        if (pwd) data.password = pwd;

        try {
            let result;
            let savedId = this.editingId;

            if (this.editingId) {
                result = await api.updateKaryawan(this.editingId, data);
            } else {
                if (!data.password) data.password = '1234';
                result = await api.addKaryawan(data);
                if (result.success) savedId = result.data.id;
            }

            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan data');
                return;
            }

            // Upload foto jika ada
            const fotoFile = document.getElementById('karyawan-foto-file')?.files[0];
            if (fotoFile && savedId) {
                await this.uploadFoto(savedId, fotoFile);
            }

            toast.success(this.editingId ? 'Data karyawan berhasil diperbarui!' : 'Karyawan berhasil ditambahkan!');
            this.closeModal();
            await this.loadKaryawan();

        } catch (e) {
            console.error('Error save:', e);
            toast.error('Terjadi kesalahan saat menyimpan');
        }
    },

    async uploadFoto(id, file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                try {
                    await api.uploadFotoKaryawan(id, base64, mimeType);
                } catch (err) {
                    console.error('Upload foto gagal:', err);
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },

    async uploadFileSK(id, file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                try {
                    await api.uploadFileSK(id, base64, mimeType, file.name);
                } catch (err) {
                    console.error('Upload berkas SK gagal:', err);
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },

    async uploadFileGeneric(id, file, apiMethod, label) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64   = e.target.result.split(',')[1];
                const mimeType = file.type;
                try {
                    if (typeof api[apiMethod] === 'function') {
                        await api[apiMethod](id, base64, mimeType, file.name);
                    } else {
                        // Fallback: gunakan uploadFileSK dengan field berbeda jika API belum ada
                        console.warn(`api.${apiMethod} belum tersedia, upload ${label} dilewati`);
                    }
                } catch (err) {
                    console.error(`Upload berkas ${label} gagal:`, err);
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },

    async viewDetail(id) {
        try {
            const result = await api.getKaryawanDetail(id);
            if (!result.success) { toast.error('Data tidak ditemukan'); return; }
            const p = result.data;
            const keluarga = p.keluarga || [];

            const pasangan = keluarga.find(k => k.tipe === 'pasangan');
            const ayah     = keluarga.find(k => k.tipe === 'ayah');
            const ibu      = keluarga.find(k => k.tipe === 'ibu');
            const anak     = keluarga.filter(k => k.tipe === 'anak');

            const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
            const color  = colors[(p.nama || '').charCodeAt(0) % colors.length];
            const initials = (p.nama || 'P').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

            const fotoHtml = p.foto
                ? `<img src="${p.foto}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--color-primary);">`
                : `<div style="width:90px;height:90px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:700;">${initials}</div>`;

            const field = (label, value) => value
                ? `<div style="display:flex;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <span style="min-width:160px;color:var(--text-muted);font-size:0.85rem;">${label}</span>
                        <span style="font-weight:500;font-size:0.85rem;">${value}</span>
                   </div>`
                : '';

            const statusColor = p.statusKaryawan === 'AKTIF' ? '#10B981' : '#F59E0B';

            document.getElementById('detail-karyawan-content').innerHTML = `
                <div style="text-align:center;margin-bottom:1.5rem;">
                    ${fotoHtml}
                    <h3 style="margin-top:0.75rem;font-size:1.1rem;">${p.nama || '-'}</h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;">${p.jabatan || ''} — ${p.unitKerja || ''}</p>
                    <span style="background:${statusColor}20;color:${statusColor};padding:3px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;">${p.statusKaryawan || ''}</span>
                </div>

                <div style="margin-bottom:1.5rem;">
                    <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                        <i class="fas fa-user"></i> DATA PRIBADI
                    </div>
                    ${field('NIK', p.nik)}
                    ${field('Jenis Kelamin', p.jenisKelamin)}
                    ${field('Status Pernikahan', p.statusPernikahan === 'K' ? 'Kawin' : p.statusPernikahan === 'TK' ? 'Belum Kawin' : p.statusPernikahan)}
                    ${field('Tempat, Tgl Lahir', p.tempatLahir && p.tanggalLahir ? `${p.tempatLahir}, ${p.tanggalLahir}` : '')}
                    ${field('Golongan Darah', p.golonganDarah)}
                    ${field('No. KTP', p.ktp)}
                    ${field('NPWP', p.npwp)}
                    ${field('No. Telp', p.noTelp)}
                    ${field('Email', p.email)}
                </div>

                <div style="margin-bottom:1.5rem;">
                    <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                        <i class="fas fa-briefcase"></i> DATA KEPEGAWAIAN
                    </div>
                    ${field('Status Pekerjaan', p.statusPekerjaan)}
                    ${field('Pendidikan', p.pendidikan)}
                    ${field('Jabatan', p.jabatan)}
                    ${field('Unit Kerja', p.unitKerja)}
                    ${field('Unit Wilayah', p.unitWilayah)}
                    ${field('Pangkat', p.pangkat)}
                    ${field('Golongan', p.golongan)}
                    ${field('Gaji Pokok', p.gajiPokok ? 'Rp ' + Number(p.gajiPokok).toLocaleString('id-ID') : '')}
                    ${field('Terhitung Mulai', p.terhitungMulai)}
                    ${field('Masa Kerja', p.masaKerja)}
                    ${field('Tahun Pensiun', p.tahunPensiun)}
                    ${field('Jadwal', p.shift)}
                </div>

                ${(p.fileSK || p.fileKTP || p.fileIjazah || p.fileSertifikat) ? `
                <div style="margin-bottom:1.5rem;">
                    <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                        <i class="fas fa-folder-open"></i> BERKAS DOKUMEN
                    </div>
                    ${p.fileSK ? field('Surat SK', `<a href="${p.fileSK}" target="_blank" style="color:var(--color-primary);"><i class="fas fa-file-pdf"></i> Lihat Berkas</a>`) : ''}
                    ${p.fileKTP ? field('KTP', `<a href="${p.fileKTP}" target="_blank" style="color:#3B82F6;"><i class="fas fa-id-card"></i> Lihat Berkas</a>`) : ''}
                    ${p.fileIjazah ? field('Ijazah', `<a href="${p.fileIjazah}" target="_blank" style="color:#10B981;"><i class="fas fa-graduation-cap"></i> Lihat Berkas</a>`) : ''}
                    ${p.fileSertifikat ? field('Sertifikat', `<a href="${p.fileSertifikat}" target="_blank" style="color:#F59E0B;"><i class="fas fa-certificate"></i> Lihat Berkas</a>`) : ''}
                </div>` : ''}
                </div>

                ${keluarga.length > 0 ? `
                <div style="margin-bottom:1.5rem;">
                    <div style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;font-size:0.9rem;">
                        <i class="fas fa-users"></i> DATA KELUARGA
                    </div>
                    ${field('Pasangan', pasangan?.nama)}
                    ${anak.map((a, i) => field(`Anak ke-${i+1}`, a.nama)).join('')}
                    ${field('Nama Ayah', ayah?.nama)}
                    ${field('Nama Ibu', ibu?.nama)}
                </div>` : ''}

                <div style="text-align:right;margin-top:1rem;">
                    <button onclick="karyawanManager.openModal('${p.id}');document.getElementById('modal-detail-karyawan').style.display='none';"
                        class="btn-primary" style="font-size:0.85rem;">
                        <i class="fas fa-edit"></i> Edit Data
                    </button>
                </div>
            `;

            document.getElementById('modal-detail-karyawan').style.display = 'flex';
        } catch (e) {
            console.error('Error view detail:', e);
        }
    },

    async deleteKaryawan(id) {
        const p = this.karyawanList.find(p => String(p.id) === String(id));
        if (!confirm(`Hapus karyawan "${p?.nama || id}"? Data ini tidak dapat dikembalikan.`)) return;

        try {
            const result = await api.deleteKaryawan(id);
            if (result.success) {
                toast.success('Karyawan berhasil dihapus');
                await this.loadKaryawan();
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    closeModal() {
        document.getElementById('modal-karyawan').style.display = 'none';
        this.editingId = null;
    }
};

window.initKaryawan = () => { karyawanManager.init(); };
window.karyawanManager = karyawanManager;
