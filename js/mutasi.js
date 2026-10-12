/**
 * Portal Karyawan - Mutasi Jabatan (Menu Admin > Mutasi)
 * PT. Tirta Agung Amuntai
 *
 * Admin memilih karyawan yang dimutasi, mengisi Jabatan Baru (+ Role/Bagian
 * kalau ikut berubah) dan data SK. Sekali simpan: data karyawan (jabatan,
 * role, bagian) ikut berubah di Data Karyawan > Edit > Kekaryawanan DAN 1
 * baris Riwayat Mutasi tercatat. Aturan lengkapnya ada di MutasiKaryawan.gs.
 */
const mutasi = {
    employees: [],
    selectedId: '',
    saving: false,
    BAGIAN: ['SPI', 'UMUM DAN KEPEGAWAIAN', 'KEUANGAN', 'HUBUNGAN LANGGANAN', 'TEKNIK DAN PENGAWASAN', 'OPERASI DAN JARINGAN'],
    ROLES: [['staff', 'Staff'], ['asmen', 'Asmen (Asisten Manajer)'], ['manajer', 'Manajer'], ['direktur', 'Direktur']],

    _e(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    async init() {
        const root = document.getElementById('mutasi-root');
        if (!root) return;
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }
        root.innerHTML = '<div class="mts-card"><i class="fas fa-spinner fa-spin"></i> Memuat data karyawan...</div>';
        try {
            const res = await api.getKaryawanList();
            this.employees = ((res && res.success && res.data) || [])
                .filter(e => String(e.statusKaryawan || 'AKTIF').toUpperCase() !== 'PENSIUN')
                .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        } catch (e) {
            console.error('Gagal memuat karyawan:', e);
            this.employees = [];
        }
        this.selectedId = '';
        this.render();
    },

    _emp() { return this.employees.find(e => String(e.id) === String(this.selectedId)); },

    // Tebakan Role dari teks jabatan baru (tetap bisa diubah manual oleh admin)
    _guessRole(jabatan) {
        const j = String(jabatan || '').toLowerCase();
        if (/direktur/.test(j)) return 'direktur';
        if (/asmen|asisten manajer|asisten manager/.test(j)) return 'asmen';
        if (/manajer|manager/.test(j)) return 'manajer';
        return 'staff';
    },

    render() {
        const root = document.getElementById('mutasi-root');
        if (!root) return;
        const opts = this.employees.map(e =>
            `<option value="${this._e(e.id)}"${String(e.id) === String(this.selectedId) ? ' selected' : ''}>${this._e(e.nama || '-')}${e.nik ? ' (' + this._e(e.nik) + ')' : ''}</option>`).join('');
        root.innerHTML = `
        <div class="mts-head">
            <h2>Mutasi Jabatan</h2>
            <p>Pilih karyawan yang dimutasi. Jabatan, Role &amp; Bagian di Data Karyawan akan ikut berubah dan tercatat di Riwayat Mutasi.</p>
        </div>
        <div class="mts-card">
            <label class="mts-label" for="mts-emp">Karyawan</label>
            <input type="text" id="mts-filter" class="mts-input" placeholder="Ketik untuk mencari nama / NIK..." oninput="mutasi.filter(this.value)">
            <select id="mts-emp" class="mts-input" size="6" onchange="mutasi.select(this.value)" style="margin-top:8px;">${opts}</select>
            <div id="mts-form"></div>
        </div>
        <div id="mts-riwayat"></div>`;
        if (this.selectedId) this.renderForm();
    },

    filter(q) {
        q = String(q || '').toLowerCase().trim();
        const sel = document.getElementById('mts-emp');
        if (!sel) return;
        [...sel.options].forEach(o => {
            o.hidden = q && !o.textContent.toLowerCase().includes(q);
        });
    },

    select(id) {
        this.selectedId = id;
        this.renderForm();
        this.loadRiwayat();
    },

    renderForm() {
        const box = document.getElementById('mts-form');
        const emp = this._emp();
        if (!box) return;
        if (!emp) { box.innerHTML = ''; return; }
        const role = String(emp.role || 'staff').toLowerCase();
        const roleLabel = (this.ROLES.find(r => r[0] === role) || [role, role])[1];
        const roleOpts = this.ROLES.map(r => `<option value="${r[0]}"${r[0] === role ? ' selected' : ''}>${r[1]}</option>`).join('');
        const bag = String(emp.bagian || '');
        const bagList = this.BAGIAN.includes(bag) || !bag ? this.BAGIAN : [bag, ...this.BAGIAN];
        const bagOpts = `<option value="">-- Pilih Bagian --</option>` + bagList.map(b => `<option value="${this._e(b)}"${b === bag ? ' selected' : ''}>${this._e(b)}</option>`).join('');
        box.innerHTML = `
        <div class="mts-now">
            <div><span>Jabatan sekarang</span><b>${this._e(emp.jabatan || '-')}</b></div>
            <div><span>Role</span><b>${this._e(roleLabel)}</b></div>
            <div><span>Bagian</span><b>${this._e(emp.bagian || '-')}</b></div>
        </div>
        <div class="mts-grid">
            <div>
                <label class="mts-label" for="mts-jabatan">Jabatan Baru</label>
                <input type="text" id="mts-jabatan" class="mts-input" placeholder="Contoh: Asmen Umum" oninput="mutasi.onJabatan(this.value)">
            </div>
            <div>
                <label class="mts-label" for="mts-role">Role (Alur Approval Izin/Cuti)</label>
                <select id="mts-role" class="mts-input">${roleOpts}</select>
            </div>
            <div>
                <label class="mts-label" for="mts-bagian">Bagian</label>
                <select id="mts-bagian" class="mts-input">${bagOpts}</select>
            </div>
            <div>
                <label class="mts-label" for="mts-nomor">Nomor SK Mutasi</label>
                <input type="text" id="mts-nomor" class="mts-input" placeholder="Contoh: 123/Amuntai/PTAA/2026">
            </div>
            <div>
                <label class="mts-label" for="mts-tgl">Terhitung Tanggal</label>
                <input type="date" id="mts-tgl" class="mts-input">
            </div>
            <div>
                <label class="mts-label" for="mts-doc">Link Dokumen SK (Google Drive, opsional)</label>
                <input type="url" id="mts-doc" class="mts-input" placeholder="https://drive.google.com/...">
            </div>
        </div>
        <div class="mts-note"><i class="fas fa-circle-info"></i>
            Kalau <b>Role atau Bagian</b> berubah, karyawan tidak boleh punya surat Cuti/Izin yang masih berjalan
            (belum final) - selesaikan atau batalkan dulu, supaya alur persetujuannya tidak nyangkut. Karyawan perlu
            login ulang agar menu sesuai jabatan barunya.
        </div>
        <div id="mts-msg"></div>
        <button class="btn-primary" id="mts-save" onclick="mutasi.save()"><i class="fas fa-right-left"></i> Proses Mutasi</button>`;
    },

    onJabatan(v) {
        const sel = document.getElementById('mts-role');
        if (sel && v.trim()) sel.value = this._guessRole(v);
    },

    async loadRiwayat() {
        const box = document.getElementById('mts-riwayat');
        if (!box) return;
        if (!this.selectedId) { box.innerHTML = ''; return; }
        let rows = [];
        try {
            const res = await api.getRiwayatMutasi(this.selectedId);
            rows = (res && res.success && res.data) || [];
        } catch (e) { rows = []; }
        const fmt = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : this._e(d || '-'); };
        box.innerHTML = `
        <div class="mts-card">
            <h3 style="margin:0 0 10px;font-size:1rem;">Riwayat Mutasi karyawan ini</h3>
            ${rows.length === 0 ? '<div style="color:var(--text-muted);">Belum ada riwayat mutasi.</div>' : `
            <div style="overflow-x:auto;"><table class="mts-table"><thead><tr>
                <th>Nomor SK</th><th>Terhitung Tanggal</th><th>Jabatan Lama</th><th>Jabatan Baru</th></tr></thead><tbody>
                ${rows.map(r => `<tr><td>${this._e(r.nomorSurat)}</td><td>${fmt(r.tanggalSurat)}</td><td>${this._e(r.unorAsal || '-')}</td><td>${this._e(r.unorBaru || '-')}</td></tr>`).join('')}
            </tbody></table></div>`}
        </div>`;
    },

    async save() {
        if (this.saving) return;
        const emp = this._emp();
        if (!emp) { toast.error('Pilih karyawan dulu'); return; }
        const val = (id) => (document.getElementById(id) || {}).value || '';
        const jabatanBaru = val('mts-jabatan').trim();
        const nomor = val('mts-nomor').trim();
        if (!jabatanBaru) { toast.error('Jabatan baru wajib diisi'); return; }
        if (!nomor) { toast.error('Nomor SK Mutasi wajib diisi'); return; }
        const role = val('mts-role');
        const bagian = val('mts-bagian');
        const roleLabel = (this.ROLES.find(r => r[0] === role) || [role, role])[1];
        if (!confirm(`Mutasikan ${emp.nama || 'karyawan ini'}?\n\n${emp.jabatan || '-'}  →  ${jabatanBaru}\nRole: ${roleLabel}\nBagian: ${bagian || '-'}`)) return;

        const msg = document.getElementById('mts-msg');
        const btn = document.getElementById('mts-save');
        this.saving = true;
        if (btn) btn.disabled = true;
        if (msg) msg.innerHTML = '';
        try {
            const res = await api.applyMutasiKaryawan({
                userId: emp.id, jabatanBaru, role, bagian,
                nomorSurat: nomor, tanggalSurat: val('mts-tgl'), fileDokumenUrl: val('mts-doc').trim()
            });
            if (!res || !res.success) {
                let extra = '';
                if (res && res.code === 'SURAT_BERJALAN' && Array.isArray(res.pending)) {
                    extra = '<ul>' + res.pending.map(p => `<li>${this._e(p.jenis)} #${this._e(p.id)} - status ${this._e(p.status)}${p.tanggal ? ' - ' + this._e(p.tanggal) : ''}</li>`).join('') + '</ul>';
                }
                if (msg) msg.innerHTML = `<div class="mts-err"><i class="fas fa-triangle-exclamation"></i> ${this._e((res && res.error) || 'Gagal memproses mutasi')}${extra}</div>`;
                toast.error((res && res.error) || 'Gagal memproses mutasi');
                return;
            }
            toast.success(`Mutasi ${emp.nama || ''} berhasil disimpan`);
            if (res.riwayatError) toast.warning(res.riwayatError);
            // Segarkan data lokal & tampilan
            const d = res.data || {};
            emp.jabatan = d.jabatanBaru || jabatanBaru;
            emp.role = d.roleBaru || role;
            emp.bagian = d.bagianBaru != null ? d.bagianBaru : bagian;
            this.renderForm();
            this.loadRiwayat();
        } catch (e) {
            console.error('Gagal memproses mutasi:', e);
            toast.error('Terjadi kesalahan saat memproses mutasi');
        } finally {
            this.saving = false;
            const b = document.getElementById('mts-save');
            if (b) b.disabled = false;
        }
    }
};

window.mutasi = mutasi;
window.initMutasi = () => { mutasi.init(); };
