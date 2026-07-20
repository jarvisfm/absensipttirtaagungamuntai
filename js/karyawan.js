/**
 * Portal Karyawan - Data Karyawan
 * PT. Tirta Agung Amuntai
 */

const karyawanManager = {
    karyawanList: [],
    editingId: null,
    anakCount: 0,
    riwayatPendidikanKaryawan: [],
    riwayatMutasiKaryawan: [],

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
                    <td style="padding:10px 12px;font-size:0.85rem;">${p.unitWilayah || '-'}</td>
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
        ['profil','kekaryawanan','keluarga','akun','uploadfile','pendidikan','mutasi'].forEach(t => {
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

        // Tab Pendidikan & Riwayat Mutasi butuh id karyawan yang sudah
        // tersimpan (baru bisa ditautkan ke karyawannya). Kalau ini
        // "Tambah Karyawan" baru (id belum ada), tampilkan pesan supaya
        // simpan dulu, dan jangan tampilkan list/form riwayat siapa pun.
        this.riwayatPendidikanKaryawan = [];
        this.riwayatMutasiKaryawan = [];
        this.renderRiwayatPendidikanAdmin();
        this.renderRiwayatMutasiAdmin();

        const pdkBlocked = document.getElementById('k-pendidikan-blocked');
        const pdkContent = document.getElementById('k-pendidikan-content');
        const mtsBlocked = document.getElementById('k-mutasi-blocked');
        const mtsContent = document.getElementById('k-mutasi-content');
        if (pdkBlocked) pdkBlocked.style.display = id ? 'none' : 'block';
        if (pdkContent) pdkContent.style.display = id ? 'block' : 'none';
        if (mtsBlocked) mtsBlocked.style.display = id ? 'none' : 'block';
        if (mtsContent) mtsContent.style.display = id ? 'block' : 'none';

        if (id) {
            this.loadDetailForEdit(id);
            this.loadRiwayatPendidikanAdmin(id);
            this.loadRiwayatMutasiAdmin(id);
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
            document.getElementById('p-unitWilayah').value     = p.unitWilayah || '';
            document.getElementById('p-bagian').value          = p.bagian || '';
            document.getElementById('p-role').value            = p.role || 'staff';
            document.getElementById('p-pangkat').value         = p.pangkat || '';
            document.getElementById('p-golongan').value        = p.golongan || '';
            document.getElementById('p-gajiPokok').value       = p.gajiPokok || '';
            document.getElementById('p-terhitungMulai').value  = p.terhitungMulai || '';
            this.autoHitungMasaKerja();
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
            'p-unitWilayah','p-bagian','p-pangkat','p-golongan','p-gajiPokok',
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

    /**
     * Hitung otomatis Tahun Pensiun = Tahun Lahir + 56 (rumus sama seperti
     * di Excel), dipanggil setiap field Tanggal Lahir berubah. Hasilnya
     * tetap bisa diubah manual sesudahnya kalau memang perlu (misal ada
     * aturan usia pensiun khusus untuk jabatan tertentu).
     */
    autoHitungTahunPensiun() {
        const tgl = document.getElementById('p-tanggalLahir').value;
        if (!tgl) return;
        const tahunLahir = parseInt(tgl.split('-')[0], 10);
        if (isNaN(tahunLahir)) return;
        document.getElementById('p-tahunPensiun').value = tahunLahir + 56;
    },

    /**
     * Hitung otomatis Masa Kerja = Terhitung Mulai s/d hari ini, dalam
     * format "Tahun/Bulan" (contoh: 21/3 = 21 tahun 3 bulan). Dipanggil
     * setiap field Terhitung Mulai berubah, dan setiap kali data karyawan
     * dimuat supaya nilainya selalu segar sesuai tanggal hari ini.
     */
    autoHitungMasaKerja() {
        const tgl = document.getElementById('p-terhitungMulai').value;
        const target = document.getElementById('p-masaKerja');
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
                    <p style="color:var(--text-muted);font-size:0.85rem;">${p.jabatan || ''} — ${p.unitWilayah || ''}</p>
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
    },

    // Format "yyyy-mm-dd" ke "dd/mm/yyyy" untuk tampilan tabel Riwayat Mutasi
    _formatTanggalID(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).split('-');
        if (parts.length !== 3) return dateStr;
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
    },

    // ========== TAB PENDIDIKAN (Admin - Edit Karyawan) ==========

    async loadRiwayatPendidikanAdmin(karyawanId) {
        try {
            const result = await api.getRiwayatPendidikan(karyawanId);
            this.riwayatPendidikanKaryawan = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat pendidikan:', e);
            this.riwayatPendidikanKaryawan = [];
        }
        this.renderRiwayatPendidikanAdmin();
    },

    renderRiwayatPendidikanAdmin() {
        const container = document.getElementById('k-pendidikan-list');
        if (!container) return;

        if (this.riwayatPendidikanKaryawan.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Belum ada riwayat pendidikan yang disimpan.</p>';
            return;
        }

        container.innerHTML = this.riwayatPendidikanKaryawan.map(r => `
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
                        <button type="button" onclick="karyawanManager.editRiwayatPendidikanAdmin('${r.id}')"
                            style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:8px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" onclick="karyawanManager.deleteRiwayatPendidikanAdmin('${r.id}')"
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

    editRiwayatPendidikanAdmin(id) {
        const r = this.riwayatPendidikanKaryawan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('k-pdk-id').value               = r.id;
        document.getElementById('k-pdk-jenjang').value           = r.jenjang || '';
        document.getElementById('k-pdk-jurusan').value           = r.jurusan || '';
        document.getElementById('k-pdk-namaSekolah').value       = r.namaSekolah || '';
        document.getElementById('k-pdk-nomorIjazah').value       = r.nomorIjazah || '';
        document.getElementById('k-pdk-tahunLulus').value        = r.tahunLulus || '';
        document.getElementById('k-pdk-tanggalLulus').value      = r.tanggalLulus || '';
        document.getElementById('k-pdk-gelarDepan').value        = r.gelarDepan || '';
        document.getElementById('k-pdk-gelarBelakang').value     = r.gelarBelakang || '';

        document.getElementById('k-pdk-ijazah-url').value    = r.fileIjazahUrl || '';
        document.getElementById('k-pdk-transkrip-url').value = r.fileTranskripUrl || '';

        document.getElementById('k-pendidikan-form-title').innerHTML = '<i class="fas fa-graduation-cap"></i> Edit Riwayat Pendidikan';
        document.getElementById('k-pdk-btn-batal').style.display = 'inline-flex';

        document.getElementById('modal-k-pendidikan-form').style.display = 'flex';
    },

    openPendidikanModalAdmin() {
        if (!this.editingId) { toast.error('Simpan data profil karyawan terlebih dahulu.'); return; }
        this.resetPendidikanFormAdmin();
        document.getElementById('modal-k-pendidikan-form').style.display = 'flex';
    },

    closePendidikanModalAdmin() {
        document.getElementById('modal-k-pendidikan-form').style.display = 'none';
    },

    resetPendidikanFormAdmin() {
        document.getElementById('k-pdk-id').value = '';
        document.getElementById('k-pdk-jenjang').value = '';
        document.getElementById('k-pdk-jurusan').value = '';
        document.getElementById('k-pdk-namaSekolah').value = '';
        document.getElementById('k-pdk-nomorIjazah').value = '';
        document.getElementById('k-pdk-tahunLulus').value = '';
        document.getElementById('k-pdk-tanggalLulus').value = '';
        document.getElementById('k-pdk-gelarDepan').value = '';
        document.getElementById('k-pdk-gelarBelakang').value = '';
        document.getElementById('k-pdk-ijazah-url').value = '';
        document.getElementById('k-pdk-transkrip-url').value = '';

        document.getElementById('k-pendidikan-form-title').innerHTML = '<i class="fas fa-graduation-cap"></i> Tambah Riwayat Pendidikan';
        document.getElementById('k-pdk-btn-batal').style.display = 'none';
    },

    async saveRiwayatPendidikanAdmin() {
        if (!this.editingId) { toast.error('Simpan data profil karyawan terlebih dahulu.'); return; }

        const id           = document.getElementById('k-pdk-id').value;
        const jenjang       = document.getElementById('k-pdk-jenjang').value;
        const namaSekolah   = document.getElementById('k-pdk-namaSekolah').value.trim();

        if (!jenjang) { toast.error('Pilih jenjang pendidikan terlebih dahulu!'); return; }
        if (!namaSekolah) { toast.error('Nama sekolah/institusi wajib diisi!'); return; }

        const rawIjazahUrl    = document.getElementById('k-pdk-ijazah-url').value.trim();
        const rawTranskripUrl = document.getElementById('k-pdk-transkrip-url').value.trim();

        const fileIjazahUrl    = rawIjazahUrl ? this.normalizeDriveLink(rawIjazahUrl) : '';
        const fileTranskripUrl = rawTranskripUrl ? this.normalizeDriveLink(rawTranskripUrl) : '';

        if (rawIjazahUrl && !fileIjazahUrl) { toast.error('Link Ijazah bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }
        if (rawTranskripUrl && !fileTranskripUrl) { toast.error('Link Transkrip Nilai bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:                 id || undefined,
            userId:             this.editingId,
            jenjang,
            jurusan:            document.getElementById('k-pdk-jurusan').value.trim(),
            namaSekolah,
            nomorIjazah:        document.getElementById('k-pdk-nomorIjazah').value.trim(),
            tahunLulus:         document.getElementById('k-pdk-tahunLulus').value.trim(),
            tanggalLulus:       document.getElementById('k-pdk-tanggalLulus').value,
            gelarDepan:         document.getElementById('k-pdk-gelarDepan').value.trim(),
            gelarBelakang:      document.getElementById('k-pdk-gelarBelakang').value.trim(),
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
            this.resetPendidikanFormAdmin();
            this.closePendidikanModalAdmin();
            await this.loadRiwayatPendidikanAdmin(this.editingId);
        } catch (e) {
            console.error('Error simpan riwayat pendidikan:', e);
            toast.error('Terjadi kesalahan saat menyimpan riwayat pendidikan');
        }
    },

    async deleteRiwayatPendidikanAdmin(id) {
        if (!confirm('Hapus riwayat pendidikan ini? (Link Ijazah/Transkrip hanya dihapus dari aplikasi, file aslinya di Google Drive tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatPendidikan(id);
            if (result.success) {
                toast.success('Riwayat pendidikan dihapus');
                await this.loadRiwayatPendidikanAdmin(this.editingId);
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    },

    // ========== TAB RIWAYAT MUTASI (Admin - Edit Karyawan) ==========

    async loadRiwayatMutasiAdmin(karyawanId) {
        try {
            const result = await api.getRiwayatMutasi(karyawanId);
            this.riwayatMutasiKaryawan = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Error load riwayat mutasi:', e);
            this.riwayatMutasiKaryawan = [];
        }
        this.renderRiwayatMutasiAdmin();
    },

    renderRiwayatMutasiAdmin() {
        const tbody = document.getElementById('k-mutasi-list');
        if (!tbody) return;

        if (this.riwayatMutasiKaryawan.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">Belum ada riwayat mutasi yang disimpan.</td></tr>';
            return;
        }

        tbody.innerHTML = this.riwayatMutasiKaryawan.map(r => `
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
                    <button type="button" onclick="karyawanManager.editRiwayatMutasiAdmin('${r.id}')" style="background:none;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;"><i class="fas fa-pen"></i></button>
                    <button type="button" onclick="karyawanManager.deleteRiwayatMutasiAdmin('${r.id}')" style="background:#EF4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    openMutasiModalAdmin() {
        if (!this.editingId) { toast.error('Simpan data profil karyawan terlebih dahulu.'); return; }
        this.resetMutasiFormAdmin();
        document.getElementById('modal-k-mutasi-form').style.display = 'flex';
    },

    closeMutasiModalAdmin() {
        document.getElementById('modal-k-mutasi-form').style.display = 'none';
    },

    editRiwayatMutasiAdmin(id) {
        const r = this.riwayatMutasiKaryawan.find(x => String(x.id) === String(id));
        if (!r) return;

        document.getElementById('k-mts-id').value           = r.id;
        document.getElementById('k-mts-nomorSurat').value    = r.nomorSurat || '';
        document.getElementById('k-mts-tanggalSurat').value  = r.tanggalSurat || '';
        document.getElementById('k-mts-unorAsal').value      = r.unorAsal || '';
        document.getElementById('k-mts-unorBaru').value      = r.unorBaru || '';
        document.getElementById('k-mts-dokumen-url').value   = r.fileDokumenUrl || '';

        document.getElementById('k-mts-form-title').innerHTML = '<i class="fas fa-right-left"></i> Edit Riwayat Mutasi';
        document.getElementById('k-mts-btn-batal').style.display = 'inline-flex';

        document.getElementById('modal-k-mutasi-form').style.display = 'flex';
    },

    resetMutasiFormAdmin() {
        document.getElementById('k-mts-id').value = '';
        document.getElementById('k-mts-nomorSurat').value = '';
        document.getElementById('k-mts-tanggalSurat').value = '';
        document.getElementById('k-mts-unorAsal').value = '';
        document.getElementById('k-mts-unorBaru').value = '';
        document.getElementById('k-mts-dokumen-url').value = '';

        document.getElementById('k-mts-form-title').innerHTML = '<i class="fas fa-right-left"></i> Tambah Riwayat Mutasi';
        document.getElementById('k-mts-btn-batal').style.display = 'none';
    },

    async saveRiwayatMutasiAdmin() {
        if (!this.editingId) { toast.error('Simpan data profil karyawan terlebih dahulu.'); return; }

        const id          = document.getElementById('k-mts-id').value;
        const nomorSurat  = document.getElementById('k-mts-nomorSurat').value.trim();

        if (!nomorSurat) { toast.error('Nomor surat wajib diisi!'); return; }

        const rawDokumenUrl = document.getElementById('k-mts-dokumen-url').value.trim();
        const fileDokumenUrl = rawDokumenUrl ? this.normalizeDriveLink(rawDokumenUrl) : '';

        if (rawDokumenUrl && !fileDokumenUrl) { toast.error('Link Dokumen SK Mutasi bukan link Google Drive yang valid! Pastikan link dari "Get link" / "Bagikan" di Drive.'); return; }

        const data = {
            id:             id || undefined,
            userId:         this.editingId,
            nomorSurat,
            tanggalSurat:   document.getElementById('k-mts-tanggalSurat').value,
            unorAsal:       document.getElementById('k-mts-unorAsal').value.trim(),
            unorBaru:       document.getElementById('k-mts-unorBaru').value.trim(),
            fileDokumenUrl
        };

        try {
            const result = await api.saveRiwayatMutasi(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan riwayat mutasi');
                return;
            }

            toast.success('Riwayat mutasi berhasil disimpan!');
            this.resetMutasiFormAdmin();
            this.closeMutasiModalAdmin();
            await this.loadRiwayatMutasiAdmin(this.editingId);
        } catch (e) {
            console.error('Error simpan riwayat mutasi:', e);
            toast.error('Terjadi kesalahan saat menyimpan riwayat mutasi');
        }
    },

    async deleteRiwayatMutasiAdmin(id) {
        if (!confirm('Hapus riwayat mutasi ini? (Link dokumen hanya dihapus dari aplikasi, file aslinya di Google Drive tidak terhapus)')) return;
        try {
            const result = await api.deleteRiwayatMutasi(id);
            if (result.success) {
                toast.success('Riwayat mutasi dihapus');
                await this.loadRiwayatMutasiAdmin(this.editingId);
            } else {
                toast.error(result.error || 'Gagal menghapus');
            }
        } catch (e) {
            toast.error('Terjadi kesalahan');
        }
    }
};

window.initKaryawan = () => { karyawanManager.init(); };
window.karyawanManager = karyawanManager;
