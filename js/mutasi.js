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

    _initials(n) {
        const w = String(n || '?').trim().split(/\s+/);
        return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
    },
    _color(id) {
        const c = ['#F59E0B', '#0EA5E9', '#10B981', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'];
        let h = 0; String(id).split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
        return c[h % c.length];
    },
    _roleLabel(r) { return (this.ROLES.find(x => x[0] === String(r || 'staff').toLowerCase()) || [r, r || 'Staff'])[1].replace(' (Asisten Manajer)', ''); },
    _roleChip(r) {
        const k = String(r || 'staff').toLowerCase();
        return `<span class="mts-chip mts-chip-${this._e(k)}">${this._e(this._roleLabel(k))}</span>`;
    },
    _avatar(e, big) {
        return `<div class="mts-avatar${big ? ' big' : ''}" style="background:${this._color(e.id)}">${this._e(this._initials(e.nama))}</div>`;
    },

    render() {
        const root = document.getElementById('mutasi-root');
        if (!root) return;
        const items = this.employees.map(e => `
            <button type="button" class="mts-item${String(e.id) === String(this.selectedId) ? ' active' : ''}" data-id="${this._e(e.id)}"
                data-q="${this._e(((e.nama || '') + ' ' + (e.nik || '') + ' ' + (e.jabatan || '')).toLowerCase())}" onclick="mutasi.select('${this._e(e.id)}')">
                ${this._avatar(e)}
                <span class="mts-item-txt"><b>${this._e(e.nama || '-')}</b><small>${this._e(e.jabatan || '-')}</small></span>
                ${this._roleChip(e.role)}
            </button>`).join('');
        root.innerHTML = `
        <div class="mts-hero">
            <div class="mts-hero-ic"><i class="fas fa-right-left"></i></div>
            <div>
                <h2>Mutasi Jabatan</h2>
                <p>Pindahkan karyawan ke jabatan baru. Data karyawan ikut diperbarui dan tercatat otomatis di Riwayat Mutasi.</p>
            </div>
        </div>
        <div class="mts-layout">
            <aside class="mts-side">
                <div class="mts-search"><i class="fas fa-search"></i>
                    <input type="text" id="mts-filter" placeholder="Cari nama, NIK, jabatan..." oninput="mutasi.filter(this.value)">
                </div>
                <div class="mts-count" id="mts-count">${this.employees.length} karyawan</div>
                <div class="mts-list" id="mts-list">${items || '<div class="mts-empty-s">Tidak ada karyawan</div>'}</div>
            </aside>
            <main class="mts-main">
                <div id="mts-form"></div>
                <div id="mts-riwayat"></div>
            </main>
        </div>`;
        this.renderForm();
        if (this.selectedId) this.loadRiwayat();
    },

    filter(q) {
        q = String(q || '').toLowerCase().trim();
        let n = 0;
        document.querySelectorAll('#mts-list .mts-item').forEach(el => {
            const ok = !q || el.dataset.q.includes(q);
            el.style.display = ok ? '' : 'none';
            if (ok) n++;
        });
        const c = document.getElementById('mts-count');
        if (c) c.textContent = `${n} karyawan`;
    },

    select(id) {
        this.selectedId = id;
        document.querySelectorAll('#mts-list .mts-item').forEach(el => el.classList.toggle('active', el.dataset.id === String(id)));
        this.renderForm();
        this.loadRiwayat();
        if (window.innerWidth < 900) {
            const f = document.getElementById('mts-form');
            if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    renderForm() {
        const box = document.getElementById('mts-form');
        const emp = this._emp();
        if (!box) return;
        if (!emp) {
            box.innerHTML = `
            <div class="mts-placeholder">
                <div class="mts-ph-ic"><i class="fas fa-user-tag"></i></div>
                <h3>Pilih karyawan terlebih dahulu</h3>
                <p>Klik salah satu nama di daftar untuk mulai memproses mutasi jabatan.</p>
            </div>`;
            const r = document.getElementById('mts-riwayat'); if (r) r.innerHTML = '';
            return;
        }
        const role = String(emp.role || 'staff').toLowerCase();
        const roleOpts = this.ROLES.map(r => `<option value="${r[0]}"${r[0] === role ? ' selected' : ''}>${r[1]}</option>`).join('');
        const bag = String(emp.bagian || '');
        const bagList = this.BAGIAN.includes(bag) || !bag ? this.BAGIAN : [bag, ...this.BAGIAN];
        const bagOpts = `<option value="">-- Pilih Bagian --</option>` + bagList.map(b => `<option value="${this._e(b)}"${b === bag ? ' selected' : ''}>${this._e(b)}</option>`).join('');
        box.innerHTML = `
        <div class="mts-card mts-emp-head">
            ${this._avatar(emp, true)}
            <div class="mts-emp-info">
                <h3>${this._e(emp.nama || '-')}</h3>
                <span>${emp.nik ? 'NIK ' + this._e(emp.nik) : 'NIK -'}${emp.unitWilayah ? ' · ' + this._e(emp.unitWilayah) : ''}</span>
            </div>
        </div>

        <div class="mts-flow">
            <div class="mts-flow-box">
                <small>SEKARANG</small>
                <b>${this._e(emp.jabatan || '-')}</b>
                <div class="mts-flow-meta">${this._roleChip(role)}<span>${this._e(emp.bagian || '-')}</span></div>
            </div>
            <div class="mts-flow-arrow"><i class="fas fa-arrow-right"></i></div>
            <div class="mts-flow-box new" id="mts-prev">
                <small>MENJADI</small>
                <b id="mts-prev-j">${this._e(emp.jabatan || '-')}</b>
                <div class="mts-flow-meta"><span id="mts-prev-r">${this._roleChip(role)}</span><span id="mts-prev-b">${this._e(emp.bagian || '-')}</span></div>
            </div>
        </div>

        <div class="mts-card">
            <div class="mts-sec"><i class="fas fa-briefcase"></i> Jabatan Baru</div>
            <div class="mts-grid">
                <div class="mts-full">
                    <label class="mts-label" for="mts-jabatan">Nama Jabatan</label>
                    <input type="text" id="mts-jabatan" class="mts-input" placeholder="Contoh: Asmen Umum" oninput="mutasi.onJabatan(this.value)">
                </div>
                <div>
                    <label class="mts-label" for="mts-role">Role (Alur Approval)</label>
                    <select id="mts-role" class="mts-input" onchange="mutasi.updatePreview()">${roleOpts}</select>
                </div>
                <div>
                    <label class="mts-label" for="mts-bagian">Bagian</label>
                    <select id="mts-bagian" class="mts-input" onchange="mutasi.updatePreview()">${bagOpts}</select>
                </div>
            </div>
            <div class="mts-sec" style="margin-top:22px;"><i class="fas fa-file-signature"></i> Surat Keputusan (SK)</div>
            <div class="mts-grid">
                <div>
                    <label class="mts-label" for="mts-nomor">Nomor SK Mutasi</label>
                    <input type="text" id="mts-nomor" class="mts-input" placeholder="123/Amuntai/PTAA/2026">
                </div>
                <div>
                    <label class="mts-label" for="mts-tgl">Terhitung Tanggal</label>
                    <input type="date" id="mts-tgl" class="mts-input">
                </div>
                <div class="mts-full">
                    <label class="mts-label" for="mts-doc">Link Dokumen SK <em>(Google Drive, opsional)</em></label>
                    <input type="url" id="mts-doc" class="mts-input" placeholder="https://drive.google.com/...">
                </div>
            </div>
            <div class="mts-note"><i class="fas fa-circle-info"></i>
                <span>Jika <b>Role atau Bagian</b> berubah, karyawan tidak boleh punya surat Cuti/Izin yang masih berjalan.
                Karyawan perlu <b>login ulang</b> agar menu sesuai jabatan barunya.</span>
            </div>
            <div id="mts-msg"></div>
            <div class="mts-actions">
                <button class="mts-btn" id="mts-save" onclick="mutasi.save()"><i class="fas fa-check"></i> Proses Mutasi</button>
            </div>
        </div>`;
    },

    onJabatan(v) {
        const sel = document.getElementById('mts-role');
        if (sel && v.trim()) sel.value = this._guessRole(v);
        this.updatePreview();
    },

    updatePreview() {
        const emp = this._emp();
        if (!emp) return;
        const val = (id) => (document.getElementById(id) || {}).value || '';
        const j = val('mts-jabatan').trim();
        const setH = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
        setH('mts-prev-j', this._e(j || emp.jabatan || '-'));
        setH('mts-prev-r', this._roleChip(val('mts-role') || emp.role));
        setH('mts-prev-b', this._e(val('mts-bagian') || emp.bagian || '-'));
        const box = document.getElementById('mts-prev');
        if (box) box.classList.toggle('changed', !!j);
    },

    async loadRiwayat() {
        const box = document.getElementById('mts-riwayat');
        if (!box) return;
        if (!this.selectedId) { box.innerHTML = ''; return; }
        const forId = this.selectedId;
        let rows = [];
        try {
            const res = await api.getRiwayatMutasi(forId);
            rows = (res && res.success && res.data) || [];
        } catch (e) { rows = []; }
        if (forId !== this.selectedId) return;
        const fmt = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : this._e(d || '-'); };
        box.innerHTML = `
        <div class="mts-card">
            <div class="mts-sec"><i class="fas fa-clock-rotate-left"></i> Riwayat Mutasi</div>
            ${rows.length === 0 ? '<div class="mts-empty-s">Belum ada riwayat mutasi untuk karyawan ini.</div>' : `
            <div class="mts-tl">
                ${rows.map(r => `
                <div class="mts-tl-item">
                    <div class="mts-tl-dot"></div>
                    <div class="mts-tl-body">
                        <div class="mts-tl-top"><b>${this._e(r.unorAsal || '-')}</b> <i class="fas fa-arrow-right"></i> <b>${this._e(r.unorBaru || '-')}</b></div>
                        <div class="mts-tl-sub">${this._e(r.nomorSurat || '-')} · Terhitung ${fmt(r.tanggalSurat)}</div>
                    </div>
                </div>`).join('')}
            </div>`}
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
            this.render();
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
