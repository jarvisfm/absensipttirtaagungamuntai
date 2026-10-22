/**
 * Portal Karyawan - Telaahan Staf (+ Lembar Disposisi + Lampiran Foto)
 * PT. Tirta Agung Amuntai
 *
 * Menggantikan menu "Telaahan Staf" di aplikasi Permintaan Barang yang dulu
 * terpisah. Backend: Telaah.gs. Pejabat disposisi diambil otomatis dari data
 * karyawan (lihat urutan di Telaah.gs), bukan NIK manual.
 *
 * Tiga lembar surat (format sama seperti aplikasi lama):
 *   1. Telaahan Staf   2. Lembar Disposisi   3. Lampiran (judul + foto)
 * Memakai ulang: richNote (editor catatan aman) dari rich-note.js.
 */
const telaahStaf = {
    ctx: null,          // { me, kodeDefault, pengadaanList, langkah }
    list: null,         // { saya, masuk, semua, menungguCount }
    tab: 'saya',
    formId: '',         // id telaahan yang sedang diedit ('' = baru)
    form: null,         // { id, terkunci, ttd, hapusTtd }
    loading: false,
    error: '',
    _sig: null,         // kanvas tanda tangan form
    _psig: null,        // kanvas paraf (modal pejabat)
    _lp: null,          // state lampiran { telaahId, nomor, foto: [{fileId, base64, src, ket}] }
    _disp: null,        // state disposisi (modal pembuat)
    _apv: null,         // state modal pejabat
    _busy: false,

    SECTIONS: [
        ['pokok', 'A. Pokok Persoalan'], ['praanggapan', 'B. Praanggapan'], ['fakta', 'C. Fakta yang Mempengaruhi'],
        ['analisis', 'D. Analisis'], ['kesimpulan', 'E. Kesimpulan'], ['saran', 'F. Saran']
    ],
    PENUTUP: 'Demikian Telaah Staf ini disampaikan sebagai bahan pertimbangan dan dasar pengambilan keputusan. Atas perhatian dan persetujuan Bapak Direktur, disampaikan terimakasih.',
    HARI: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    ROMAWI: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
    LAMPIRAN_MAX: 12,

    // ── Util ───────────────────────────────────────────────
    _e(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    _root() { return document.getElementById('tl-root'); },
    _$(id) { return document.getElementById(id); },
    _val(id) { const el = this._$(id); return el ? String(el.value || '').trim() : ''; },
    _foto(id) { return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id); },
    _kosong(html) { return !String(richNote.plain(html) || '').trim(); },
    _tglHariIni() {
        const d = new Date();
        return `${this.HARI[d.getDay()]}/${d.getDate()} ${this.BULAN[d.getMonth()]} ${d.getFullYear()}`;
    },
    _nomorPreview(kode) {
        const d = new Date();
        const k = String(kode || '').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '');
        return `…/TS-${k}/PT.TAA/${this.ROMAWI[d.getMonth()]}/${d.getFullYear()}`;
    },
    _statusChip(s) {
        const m = {
            Disetujui: ['ok', 'fa-circle-check'], Ditolak: ['no', 'fa-circle-xmark'], Menunggu: ['wait', 'fa-hourglass-half'],
            Dilewati: ['wait', 'fa-forward'], Belum: ['wait', 'fa-clock']
        };
        const x = m[s];
        if (!x) return '<span class="tl-note">-</span>';
        const label = s === 'Belum' ? 'Belum giliran' : (s === 'Dilewati' ? 'Dilewati (tanpa akun)' : s);
        return `<span class="tl-chip tl-chip-${x[0]}"><i class="fas ${x[1]}"></i> ${this._e(label)}</span>`;
    },

    // ── Init & muat data ───────────────────────────────────
    async init() {
        const root = this._root();
        if (!root) return;
        if (!this.ctx) root.innerHTML = '<div class="tl-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';
        this.loading = true;
        this.error = '';
        try {
            const [c, l] = await Promise.all([api.getTelaahContext(), api.getTelaahList()]);
            if (!c || !c.success) throw new Error((c && c.error) || 'Gagal memuat data pengguna');
            if (!l || !l.success) throw new Error((l && l.error) || 'Gagal memuat daftar telaahan');
            this.ctx = c.data;
            this.list = l.data;
        } catch (e) {
            this.error = e.message || 'Gagal memuat data';
        }
        this.loading = false;
        if (this.ctx && !this._tabAllowed(this.tab)) this.tab = this.ctx.me.rekap ? 'semua' : 'saya';
        this.render();
    },

    /** Muat ulang daftar tanpa menggambar ulang form (mis. setelah simpan). */
    async _muatList() {
        try {
            const l = await api.getTelaahList();
            if (l && l.success) this.list = l.data;
        } catch (e) { /* abaikan */ }
    },

    _tabAllowed(t) {
        if (!this.ctx) return t === 'saya';
        const me = this.ctx.me;
        if (t === 'form') return !!me.bolehMembuat;
        if (t === 'saya' || t === 'masuk') return me.hasEmployee;
        if (t === 'semua') return !!me.rekap;
        return false;
    },

    setTab(t, id) {
        if (this._formModal) this.tutupForm(); // form "Buka" tampil sebagai modal - tutup dulu
        if (t === 'form') this.formId = id || '';
        if (t !== 'form') this._sig = null;
        this.tab = t;
        this.render();
        const pc = document.querySelector('.page-content');
        if (pc) pc.scrollTop = 0;
    },

    // ── Render utama ───────────────────────────────────────
    render() {
        const root = this._root();
        if (!root) return;
        const hero = `
            <div class="tl-hero"><div class="tl-hero-ic"><i class="fas fa-file-signature"></i></div>
            <div><h2>Telaahan Staf</h2><p>${this.ctx && this.ctx.me.rekap
                ? 'Rekap seluruh telaahan staf dari karyawan.'
                : 'Buat telaahan, ajukan lembar disposisi, dan lampirkan foto pendukung.'}</p></div></div>`;
        if (this.error) {
            root.innerHTML = `${hero}<div class="tl-alert tl-alert-err"><i class="fas fa-triangle-exclamation"></i> ${this._e(this.error)}</div>
                <button class="tl-btn tl-btn-primary" onclick="telaahStaf.init()"><i class="fas fa-rotate"></i> Coba lagi</button>`;
            return;
        }
        if (!this.ctx || !this.list) return;
        const me = this.ctx.me;
        const n = this.list.menungguCount || 0;
        const tabs = [
            me.hasEmployee && ['saya', 'fa-list', 'Telaahan Saya'],
            me.bolehMembuat && ['form', 'fa-plus-circle', (this.formId && this.tab === 'form') ? 'Ubah Telaahan' : 'Buat Telaahan'],
            me.hasEmployee && ['masuk', 'fa-inbox', 'Disposisi Masuk', n],
            me.rekap && ['semua', 'fa-folder-open', 'Semua Telaahan']
        ].filter(Boolean);
        const tabsHtml = tabs.map(t => `<button class="tl-tab ${this.tab === t[0] ? 'active' : ''}" onclick="telaahStaf.setTab('${t[0]}'${t[0] === 'form' ? ", ''" : ''})">
            <i class="fas ${t[1]}"></i> ${t[2]}${t[3] ? ` <span class="tl-badge">${t[3]}</span>` : ''}</button>`).join('');

        let body = '';
        if (!me.hasEmployee && !me.rekap) {
            body = '<div class="tl-alert tl-alert-warn"><i class="fas fa-circle-info"></i> Akun ini belum terhubung ke data karyawan.</div>';
        } else if (this.tab === 'saya') body = this._renderDaftar(this.list.saya, 'Belum ada telaahan. Klik "Buat Telaahan" untuk membuat yang pertama.', true);
        else if (this.tab === 'masuk') body = this._renderMasuk();
        else if (this.tab === 'semua') body = this._renderDaftar(this.list.semua, 'Belum ada telaahan.', false);
        else if (this.tab === 'form') body = this._renderForm();

        // Pertahankan posisi geser tab (HP) & geser otomatis ke tab yang sedang aktif
        // (sama seperti menu Permintaan Barang).
        const oldTabs = root.querySelector('.tl-tabs');
        const keepX = oldTabs ? oldTabs.scrollLeft : 0;
        root.innerHTML = `${hero}<div class="tl-tabs">${tabsHtml}</div>${body}`;
        const tabsEl = root.querySelector('.tl-tabs');
        const act = tabsEl && tabsEl.querySelector('.tl-tab.active');
        if (tabsEl) {
            tabsEl.scrollLeft = keepX;
            if (act) {
                const l = act.offsetLeft, r = l + act.offsetWidth;
                if (l < tabsEl.scrollLeft || r > tabsEl.scrollLeft + tabsEl.clientWidth) {
                    tabsEl.scrollLeft = l - (tabsEl.clientWidth - act.offsetWidth) / 2;
                }
            }
        }
        if (this.tab === 'form') this._initForm();
    },

    // ── Daftar ─────────────────────────────────────────────
    _chipsTelaah(t) {
        const c = [];
        const d = t.dp;
        if (d && d.diajukan) {
            if (d.selesai) c.push('<span class="tl-chip2 green"><i class="fas fa-circle-check"></i> Disposisi selesai</span>');
            else if (d.ditolak) c.push('<span class="tl-chip2 red"><i class="fas fa-circle-xmark"></i> Disposisi ditolak</span>');
            else c.push(`<span class="tl-chip2"><i class="fas fa-diagram-project"></i> Disposisi ${d.setuju} disetujui${d.menunggu ? ' · menunggu ' + this._e(d.menunggu) : ''}</span>`);
        }
        if (t.foto) c.push(`<span class="tl-chip2 green"><i class="fas fa-images"></i> Lampiran ${t.foto} foto</span>`);
        if (t.terkunci) c.push('<span class="tl-chip2 lock"><i class="fas fa-lock"></i> Terkunci</span>');
        return c.length ? `<div class="tl-chips">${c.join('')}</div>` : '';
    },

    _renderDaftar(arr, kosong, own) {
        if (!arr || !arr.length) return `<div class="tl-card"><div class="tl-empty"><i class="fas fa-inbox"></i><p>${this._e(kosong)}</p></div></div>`;
        const rows = arr.map(t => `
            <div class="tl-row2">
                <div class="tl-row2-main">
                    <b>${this._e(t.nomor)}</b>
                    <span>${this._e(t.perihal)}</span>
                    <small>${own ? '' : this._e(t.pembuatNama) + ' · '}${this._e(t.dari)} · ${this._e(t.tanggal)}</small>
                    ${this._chipsTelaah(t)}
                </div>
                <div class="tl-row-act">
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.bukaForm('${t.id}')"><i class="fas fa-pen"></i> ${t.terkunci ? 'Lihat' : 'Buka'}</button>
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.openDisposisi('${t.id}')"><i class="fas fa-diagram-project"></i> Disposisi</button>
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.openLampiran('${t.id}')"><i class="fas fa-images"></i> Lampiran</button>
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.cetakSemua('${t.id}')"><i class="fas fa-print"></i> Cetak Semua</button>
                    <button class="tl-btn tl-btn-sm tl-btn-danger" onclick="telaahStaf.hapus('${t.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
        return `<div class="tl-card">${rows}</div>`;
    },

    _renderMasuk() {
        const arr = this.list.masuk || [];
        if (!arr.length) return '<div class="tl-card"><div class="tl-empty"><i class="fas fa-inbox"></i><p>Belum ada disposisi yang ditujukan ke Anda.</p></div></div>';
        const rows = arr.map(x => `
            <div class="tl-row2">
                <div class="tl-row2-main">
                    <b>${this._e(x.nomor)}</b>
                    <span>${this._e(x.perihal)}</span>
                    <small>${this._e(x.pembuatNama)} · sebagai ${this._e(x.jabatan)}</small>
                </div>
                <div class="tl-row-act" style="align-items:center">
                    ${this._statusChip(x.status)}
                    <button class="tl-btn tl-btn-sm ${x.status === 'Menunggu' ? 'tl-btn-primary' : ''}" onclick="telaahStaf.openApprover('${x.telaahId}','${x.key}')">
                        <i class="fas fa-eye"></i> ${x.status === 'Menunggu' ? 'Proses' : 'Lihat'}</button>
                </div>
            </div>`).join('');
        return `<div class="tl-card">${rows}</div>`;
    },

    // "Buka"/"Lihat" telaahan: form ditampilkan sebagai modal (bukan pindah halaman).
    bukaForm(id) {
        if (!this.ctx.me.bolehMembuat && !this.ctx.me.rekap) return;
        this.formId = id;
        this._openFormModal();
    },

    _openFormModal() {
        this._sig = null;
        this._formModal = true;
        this._openModal(`<div class="tl-modal tl-modal-wide tl-modal-form">
            <div class="tl-modal-head"><div><b>Ubah Telaahan Staf</b><small>Ubah isi, simpan, atau cetak</small></div>
                <button class="tl-icon-btn" onclick="telaahStaf.tutupForm()" title="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="tl-modal-body" id="tl-form-body">${this._renderForm()}</div></div>`, { sticky: true });
        this._initForm();
    },

    tutupForm() {
        this._formModal = false;
        this._closeModal();
        this.formId = '';
        this._sig = null;
        this.form = null;
    },

    // ── Form telaahan ──────────────────────────────────────
    _renderForm() {
        const editing = !!this.formId;
        const editors = this.SECTIONS.map(([k, label]) => `
            <label class="tl-ed-label">${label}</label>
            ${richNote.editorHtml('tl-ed-' + k, { placeholder: 'Tulis ' + label.slice(3).toLowerCase() + '...' })}`).join('');
        return `
        <div class="tl-card">
            <h3 class="tl-h3">${editing ? 'Ubah Telaahan Staf' : 'Form Telaahan Staf'}</h3>
            <div id="tl-lock" class="tl-alert tl-alert-warn" style="display:none"><i class="fas fa-lock"></i>
                Telaahan ini sudah disetujui sebagian oleh pejabat disposisi, isinya tidak dapat diubah lagi (masih bisa dicetak).</div>
            <div class="tl-form-grid">
                ${editing ? '' : `<div><label>Mode Nomor Surat</label>
                    <select id="tl-mode" onchange="telaahStaf.onMode()"><option value="auto">Otomatis (format)</option><option value="manual">Manual</option></select></div>
                <div id="tl-kode-wrap"><label>Kode Bagian / Sub Bidang <small>(untuk nomor otomatis)</small></label>
                    <input type="text" id="tl-kode" maxlength="100" oninput="telaahStaf.onMode(true)"></div>`}
                <div><label>Nomor</label><input type="text" id="tl-nomor" maxlength="150" placeholder="Isi nomor surat..."></div>
                <div><label>Kepada</label><input type="text" id="tl-kepada" list="tl-kepada-list" maxlength="200">
                    <datalist id="tl-kepada-list"><option value="Direktur PT. Tirta Agung Amuntai (Perseroda)"><option value="Manajer Umum dan Kepegawaian"><option value="Manajer Keuangan"></datalist></div>
                <div><label>Dari</label><input type="text" id="tl-dari" maxlength="200"></div>
                <div><label>Hari/Tanggal</label><input type="text" id="tl-tanggal" maxlength="100"></div>
                <div><label>Lampiran</label><input type="text" id="tl-lampiran" readonly value="-">
                    <div class="tl-sub"><i class="fas fa-circle-info"></i> Otomatis, dihitung dari foto di tombol Lampiran</div></div>
            </div>
            <label class="tl-lbl">Perihal <span class="tl-req">wajib</span></label>
            <textarea id="tl-perihal" rows="2" maxlength="500" placeholder="Permohonan persetujuan ..."></textarea>
            ${editors}
            <label class="tl-ed-label">Kalimat Penutup</label>
            <textarea id="tl-penutup" rows="3" maxlength="2000"></textarea>

            <h4 class="tl-h4">Tanda Tangan</h4>
            <div class="tl-form-grid">
                <div><label>Nama</label><input type="text" id="tl-nama" readonly></div>
                <div><label>NIK</label><input type="text" id="tl-nik" maxlength="60"></div>
                <div style="grid-column:1/-1"><label>Jabatan</label><input type="text" id="tl-jabatan" maxlength="200"></div>
            </div>
            <div id="tl-ttd-saved" class="tl-ttd-saved" style="display:none">
                <img id="tl-ttd-img" alt="TTD tersimpan"><span>TTD tersimpan - dipakai jika Anda tidak menggambar ulang.</span>
                <button class="tl-btn tl-btn-sm tl-btn-danger" onclick="telaahStaf.hapusTtdTersimpan()">Hapus</button>
            </div>
            <div class="tl-sig-wrap" style="max-width:420px"><canvas id="tl-sig"></canvas></div>
            <button class="tl-btn tl-btn-sm" onclick="telaahStaf._clearSig('_sig')"><i class="fas fa-eraser"></i> Hapus coretan</button>

            <div class="tl-actions">
                <button class="tl-btn tl-btn-ok" id="tl-simpan" onclick="telaahStaf.simpan()"><i class="fas fa-save"></i> Simpan</button>
                <button class="tl-btn tl-btn-primary" onclick="telaahStaf.cetakForm()"><i class="fas fa-print"></i> Pratinjau / Cetak</button>
                ${editing ? `<button class="tl-btn" onclick="telaahStaf.setTab('form','')"><i class="fas fa-file-circle-plus"></i> Telaahan Baru</button>` : ''}
                <button class="tl-btn" onclick="telaahStaf.setTab('saya')">Batal</button>
            </div>
        </div>`;
    },

    async _initForm() {
        const me = this.ctx.me;
        this.form = { id: '', terkunci: false, ttd: '', hapusTtd: false };
        const set = (id, v) => { const el = this._$(id); if (el) el.value = v == null ? '' : v; };
        set('tl-kepada', 'Direktur PT. Tirta Agung Amuntai (Perseroda)');
        set('tl-dari', me.jabatan);
        set('tl-tanggal', this._tglHariIni());
        set('tl-penutup', this.PENUTUP);
        set('tl-nama', me.nama);
        set('tl-nik', me.nik);
        set('tl-jabatan', me.jabatan);
        if (!this.formId) {
            set('tl-kode', this.ctx.kodeDefault);
            set('tl-mode', 'auto');
            this.onMode();
        }
        this._initSig('tl-sig', '_sig');
        if (!this.formId) return;

        const root = this._$('tl-form-body') || this._root();
        root.style.opacity = '.6'; root.style.pointerEvents = 'none';
        try {
            const res = await api.getTelaah(this.formId);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal membuka telaahan');
            this._isiForm(res.data);
        } catch (e) {
            toast.error(e.message || 'Gagal membuka telaahan');
            this.formId = '';
            this.setTab('saya');
        }
        root.style.opacity = ''; root.style.pointerEvents = '';
    },

    _isiForm(t) {
        const set = (id, v) => { const el = this._$(id); if (el) el.value = v == null ? '' : v; };
        set('tl-nomor', t.nomor); set('tl-kepada', t.kepada); set('tl-dari', t.dari);
        set('tl-tanggal', t.tanggal); set('tl-lampiran', t.lampiran || '-'); set('tl-perihal', t.perihal);
        set('tl-penutup', t.penutup); set('tl-nama', t.namaTtd); set('tl-nik', t.nik); set('tl-jabatan', t.jabatanTtd);
        this.SECTIONS.forEach(([k]) => richNote.setValue('tl-ed-' + k, t[k] || ''));
        this.form = { id: t.id, terkunci: !!t.terkunci, ttd: t.ttd || '', hapusTtd: false };
        this._tampilTtd();
        if (t.terkunci) {
            this._$('tl-lock').style.display = '';
            const b = this._$('tl-simpan'); if (b) b.disabled = true;
        }
    },

    _tampilTtd() {
        const box = this._$('tl-ttd-saved');
        if (!box) return;
        const ada = !!(this.form && this.form.ttd && !this.form.hapusTtd);
        box.style.display = ada ? '' : 'none';
        if (ada) this._$('tl-ttd-img').src = 'data:image/png;base64,' + this.form.ttd;
    },

    hapusTtdTersimpan() {
        if (!this.form) return;
        this.form.hapusTtd = true;
        this._tampilTtd();
    },

    onMode(dariKode) {
        const mode = this._val('tl-mode') || 'auto';
        const el = this._$('tl-nomor');
        if (!el) return;
        if (mode === 'auto') {
            el.value = this._nomorPreview(this._val('tl-kode'));
            el.readOnly = true;
        } else {
            if (!dariKode) { el.value = ''; el.focus(); }
            el.readOnly = false;
        }
        const w = this._$('tl-kode-wrap');
        if (w) w.style.display = mode === 'auto' ? '' : 'none';
    },

    _kumpulForm() {
        const f = {
            id: this.form ? this.form.id : '',
            nomorMode: this._val('tl-mode') || 'manual',
            nomor: this._val('tl-nomor'), kodeBagian: this._val('tl-kode'),
            kepada: this._val('tl-kepada'), dari: this._val('tl-dari'), tanggal: this._val('tl-tanggal'),
            perihal: this._val('tl-perihal'), penutup: this._val('tl-penutup'),
            namaTtd: this._val('tl-nama'), nik: this._val('tl-nik'), jabatanTtd: this._val('tl-jabatan')
        };
        this.SECTIONS.forEach(([k]) => { f[k] = richNote.getValue('tl-ed-' + k); });
        return f;
    },

    async simpan() {
        if (this._busy) return;
        const f = this._kumpulForm();
        if (!f.perihal) { toast.error('Perihal wajib diisi.'); return; }
        f.ttd = this._exportPng(this._sig, 360);
        f.hapusTtd = !!(this.form && this.form.hapusTtd);
        const btn = this._$('tl-simpan');
        this._busy = true; if (btn) btn.disabled = true;
        try {
            const res = await api.simpanTelaah(f);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menyimpan');
            toast.success(res.message || 'Tersimpan');
            this.formId = res.id;
            this.form.id = res.id;
            if (f.ttd) { this.form.ttd = f.ttd; this.form.hapusTtd = false; this._clearSig('_sig'); }
            else if (f.hapusTtd) { this.form.ttd = ''; this.form.hapusTtd = false; }
            this._tampilTtd();
            const nom = this._$('tl-nomor'); if (nom) { nom.value = res.nomor; nom.readOnly = false; }
            await this._muatList();
            if (this._formModal && this.tab !== 'form') this.render(); // segarkan daftar di belakang modal
        } catch (e) {
            toast.error(e.message || 'Gagal menyimpan');
        }
        this._busy = false; if (btn && !(this.form && this.form.terkunci)) btn.disabled = false;
    },

    cetakForm() {
        const f = this._kumpulForm();
        if (!f.perihal) { toast.error('Perihal wajib diisi.'); return; }
        const drawn = this._exportPng(this._sig, 360);
        const ttd = drawn || (this.form && this.form.ttd && !this.form.hapusTtd ? this.form.ttd : '');
        f.lampiran = this._val('tl-lampiran') || '-';
        this._cetak('Telaahan Staf', [this._lembarTelaah(f, ttd)]);
    },

    // ── Kanvas tanda tangan / paraf ────────────────────────
    _initSig(canvasId, slot, tinggi) {
        const cv = this._$(canvasId);
        if (!cv) return;
        const w = (cv.parentElement && cv.parentElement.clientWidth) || 320;
        const h = tinggi || 150;
        cv.width = w; cv.height = h;
        cv.style.height = h + 'px';
        const ctx = cv.getContext('2d');
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
        const st = { drawing: false, dirty: false, last: null };
        this[slot] = { cv, ctx, st };
        const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; };
        cv.addEventListener('pointerdown', e => {
            e.preventDefault(); cv.setPointerCapture(e.pointerId); st.drawing = true; st.last = pos(e);
            ctx.beginPath(); ctx.arc(st.last.x, st.last.y, 1, 0, 6.3); ctx.stroke(); st.dirty = true;
        });
        cv.addEventListener('pointermove', e => {
            if (!st.drawing) return; e.preventDefault();
            const p = pos(e); ctx.beginPath(); ctx.moveTo(st.last.x, st.last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); st.last = p; st.dirty = true;
        });
        const end = () => { st.drawing = false; };
        cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    },

    _clearSig(slot) {
        const s = this[slot];
        if (!s) return;
        s.ctx.clearRect(0, 0, s.cv.width, s.cv.height);
        s.st.dirty = false;
    },

    /** PNG transparan diperkecil supaya ringan disimpan ('' kalau belum digambar). */
    _exportPng(s, maxW) {
        if (!s || !s.st.dirty) return '';
        const k = Math.min(1, maxW / s.cv.width);
        const out = document.createElement('canvas');
        out.width = Math.round(s.cv.width * k); out.height = Math.round(s.cv.height * k);
        out.getContext('2d').drawImage(s.cv, 0, 0, out.width, out.height);
        return out.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    },

    // ── Modal umum & konfirmasi ────────────────────────────
    _closeModal() {
        if (this._ajukanBusy) return; // sedang mengirim - jangan ditutup
        const ov = this._$('tl-overlay');
        if (ov) ov.remove();
        this._psig = null; this._apv = null; this._disp = null; this._lp = null;
    },

    _openModal(html, opts) {
        // Hanya mengganti tampilan modal - state (_lp/_disp/_apv) JANGAN direset di sini.
        const lama = this._$('tl-overlay');
        // keep: ganti isi modal yang sedang terbuka (tanpa berkedip) + animasi transisi.
        if (opts && opts.keep && lama) {
            lama.innerHTML = html;
            lama.classList.remove('tl-swap'); void lama.offsetWidth; lama.classList.add('tl-swap');
            return lama;
        }
        if (lama) lama.remove();
        const ov = document.createElement('div');
        ov.id = 'tl-overlay';
        ov.className = 'tl-overlay';
        ov.innerHTML = html || '<div class="tl-modal"><div class="tl-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div></div>';
        // Modal form tidak ditutup lewat klik latar (cegah isian hilang tak sengaja).
        if (!(opts && opts.sticky)) ov.addEventListener('click', e => { if (e.target === ov) this._closeModal(); });
        document.body.appendChild(ov);
        return ov;
    },

    _confirm({ judul, pesan, ok, icon }) {
        return new Promise(resolve => {
            const old = this._$('tl-confirm');
            if (old) old.remove();
            const ov = document.createElement('div');
            ov.id = 'tl-confirm';
            ov.className = 'tl-overlay tl-overlay-top';
            ov.innerHTML = `<div class="tl-modal tl-confirm">
                <div class="tl-confirm-ic"><i class="fas ${this._e(icon || 'fa-circle-question')}"></i></div>
                <h3>${this._e(judul)}</h3><p>${this._e(pesan)}</p>
                <div class="tl-confirm-act">
                    <button type="button" class="tl-btn" data-r="0">Batal</button>
                    <button type="button" class="tl-btn tl-btn-danger-fill" data-r="1">${this._e(ok || 'Ya')}</button>
                </div></div>`;
            const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
            const onKey = e => { if (e.key === 'Escape') done(false); };
            ov.addEventListener('click', e => {
                if (e.target === ov) return done(false);
                const b = e.target.closest('button[data-r]');
                if (b) done(b.dataset.r === '1');
            });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(ov);
            const first = ov.querySelector('button[data-r="0"]');
            if (first) first.focus();
        });
    },

    async hapus(id) {
        const all = [].concat(this.list.saya || [], this.list.semua || []);
        const t = all.find(x => String(x.id) === String(id)) || {};
        if (!await this._confirm({
            judul: 'Hapus Telaahan', ok: 'Ya, Hapus', icon: 'fa-trash',
            pesan: `Hapus telaahan ${t.nomor || ''}? Lembar disposisi dan lampiran (beserta foto) ikut terhapus. Tindakan ini tidak bisa dibatalkan.`
        })) return;
        try {
            const res = await api.hapusTelaah(id);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menghapus');
            toast.success(res.message || 'Terhapus');
            if (String(this.formId) === String(id)) this.formId = '';
            await this.init();
        } catch (e) {
            toast.error(e.message || 'Gagal menghapus');
        }
    },

    // ── Lembar Disposisi: sisi pembuat ─────────────────────
    async openDisposisi(telaahId) {
        this._openModal();
        try {
            const res = await api.getTelaahDisposisi(telaahId);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memuat disposisi');
            this._disp = res.data;
            this._renderDisposisi();
        } catch (e) {
            toast.error(e.message || 'Gagal memuat disposisi');
            this._closeModal();
        }
    },

    _renderDisposisi(opts) {
        const d = this._disp;
        const berikut = (d.rows || []).find(r => r.status === 'Menunggu');
        const sukses = opts && opts.sukses ? `<div class="tl-alert tl-alert-ok tl-sukses"><i class="fas fa-circle-check"></i> <span>Disposisi berhasil diajukan${berikut ? ' dan sekarang menunggu <b>' + this._e(berikut.jabatan) + '</b>' : ''}.</span></div>` : '';
        const langkah = d.rows.map((r, i) => `
            <div class="tl-step ${r.status === 'Menunggu' ? 'now' : ''}">
                <div class="tl-step-no">${i + 1}</div>
                <div class="tl-step-main">
                    <b>${this._e(r.jabatan)}</b>
                    ${r.nama ? `<small>${this._e(r.nama)}${r.tgl ? ' · ' + this._e(r.tgl) : ''}</small>` : ''}
                    ${r.dipilih ? `<small>Ditunjuk: ${this._e(r.dipilih)}</small>` : ''}
                    ${!this._kosong(r.catatan) ? `<div class="tl-cat tl-doc">${richNote.view(r.catatan)}</div>` : ''}
                </div>
                ${r.paraf ? `<img src="data:image/png;base64,${r.paraf}" alt="Paraf">` : ''}
                ${this._statusChip(r.status)}
            </div>`).join('');

        let aksi;
        if (!d.diajukan) aksi = `<button class="tl-btn tl-btn-primary" onclick="telaahStaf.ajukan()"><i class="fas fa-paper-plane"></i> Ajukan Disposisi</button>`;
        else if (d.ditolak) aksi = `<button class="tl-btn tl-btn-primary" onclick="telaahStaf.ajukan()"><i class="fas fa-rotate"></i> Ajukan Ulang</button>`;
        else if (d.selesai) aksi = `<button class="tl-btn tl-btn-ok" onclick="telaahStaf.cetakDisposisi()"><i class="fas fa-print"></i> Cetak Lembar Disposisi</button>`;
        else aksi = '<span class="tl-note"><i class="fas fa-lock"></i> Cetak tersedia setelah semua pejabat menyetujui</span>';

        this._openModal(`<div class="tl-modal tl-modal-wide">
            <div class="tl-modal-head"><div><b>Disposisi: ${this._e(d.telaah.nomor)}</b><small>${this._e(d.telaah.perihal)}</small></div>
                <button class="tl-icon-btn" onclick="telaahStaf._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tl-modal-body">
                ${sukses}
                <div class="tl-alert"><i class="fas fa-circle-info"></i> Disposisi berjalan berurutan. Tiap pejabat menyetujui dan memberi paraf dari akunnya sendiri. Langkah yang belum punya akun dilewati otomatis.</div>
                ${langkah}
                ${d.ditolak ? '<div class="tl-alert tl-alert-err"><i class="fas fa-circle-xmark"></i> Disposisi ditolak. Perbaiki telaahan bila perlu, lalu ajukan ulang untuk memulai dari langkah pertama.</div>' : ''}
            </div>
            <div class="tl-modal-foot"><button class="tl-btn" onclick="telaahStaf._closeModal()">Tutup</button>${aksi}</div></div>`, opts && opts.keep ? { keep: true } : undefined);
    },

    /** Lapisan loading/sukses di atas modal disposisi (mode: 'load' | 'ok' | null = tutup). */
    _setBusy(mode, text) {
        const m = document.querySelector('#tl-overlay .tl-modal');
        if (!m) return;
        let b = m.querySelector('.tl-busy');
        if (!mode) {
            if (b) { b.classList.add('out'); setTimeout(() => b.remove(), 260); }
            return;
        }
        if (!b) { b = document.createElement('div'); m.appendChild(b); }
        b.className = 'tl-busy ' + mode;
        b.innerHTML = `<div class="tl-busy-ic">${mode === 'ok' ? '<span class="tl-check"></span>' : '<span class="tl-spin"></span>'}</div><p>${this._e(text || '')}</p>`;
    },

    async ajukan() {
        const d = this._disp;
        if (d.ditolak && !await this._confirm({ judul: 'Ajukan Ulang', pesan: 'Ajukan ulang disposisi dari langkah pertama? Paraf lama akan dihapus.', ok: 'Ya, Ajukan', icon: 'fa-rotate' })) return;
        const id = d.telaah.id;
        if (this._ajukanBusy) return;
        this._ajukanBusy = true;
        this._setBusy('load', 'Mengajukan disposisi...');
        try {
            const res = await api.ajukanTelaahDisposisi(id);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal mengajukan');
            // Berhasil: tampilkan centang + notifikasi, sambil memuat status terbaru.
            this._setBusy('ok', 'Disposisi berhasil diajukan');
            toast.success(res.message || 'Diajukan');
            const [, fresh] = await Promise.all([
                this._muatList(),
                api.getTelaahDisposisi(id).catch(() => null),
                new Promise(r => setTimeout(r, 1100))
            ]);
            this._ajukanBusy = false;
            if (this._$('tl-overlay')) {
                if (fresh && fresh.success) { this._disp = fresh.data; this._renderDisposisi({ keep: true, sukses: true }); }
                else { this._setBusy(null); await this.openDisposisi(id); }
            }
            if (this.tab !== 'form') this.render();
        } catch (e) {
            this._ajukanBusy = false;
            this._setBusy(null);
            toast.error(e.message || 'Gagal mengajukan');
        }
        this._ajukanBusy = false;
    },

    cetakDisposisi() {
        if (!this._disp) return;
        this._cetak('Lembar Disposisi', [this._lembarDisposisi(this._disp.rows)]);
    },

    // ── Lembar Disposisi: sisi pejabat ─────────────────────
    async openApprover(telaahId, key) {
        this._openModal();
        try {
            const res = await api.getTelaahDisposisiApprover(telaahId, key);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memuat disposisi');
            this._apv = res.data;
            this._renderApprover();
        } catch (e) {
            toast.error(e.message || 'Gagal memuat disposisi');
            this._closeModal();
        }
    },

    _docHtml(t) {
        const sec = this.SECTIONS.map(([k, label]) => `<h4>${label}</h4><div class="tl-isi">${this._kosong(t[k]) ? '-' : richNote.view(t[k])}</div>`).join('');
        return `<div class="tl-doc">
            <div class="tl-kv">
                <span>Kepada</span><div>${this._e(t.kepada)}</div><span>Dari</span><div>${this._e(t.dari)}</div>
                <span>Tanggal</span><div>${this._e(t.tanggal)}</div><span>Nomor</span><div>${this._e(t.nomor)}</div>
                <span>Lampiran</span><div>${this._e(t.lampiran || '-')}</div><span>Perihal</span><div>${this._e(t.perihal)}</div>
            </div>${sec}
            <div class="tl-isi" style="margin-top:10px">${this._e(t.penutup).replace(/\n/g, '<br>')}</div></div>`;
    },

    _renderApprover() {
        const d = this._apv, t = d.telaah, lp = d.lampiran || {};
        const lamp = (lp.foto && lp.foto.length) ? `
            <div class="tl-box-green"><b style="font-size:.82rem"><i class="fas fa-images"></i> Lampiran (${lp.foto.length} foto)</b>
                ${lp.judul ? `<div class="tl-sub" style="margin-top:2px">${this._e(lp.judul).replace(/\n/g, '<br>')}</div>` : ''}
                <div class="tl-view">${lp.foto.map(f => `<img src="${this._foto(f.fileId)}" alt="Lampiran" title="${this._e(f.ket)}" onclick="window.open(this.src,'_blank')">`).join('')}</div></div>` : '';
        const riw = (d.riwayat || []).length ? `
            <div class="tl-box-green" style="background:rgba(99,102,241,.06);border-color:rgba(99,102,241,.25)"><b style="font-size:.82rem">Disposisi pejabat sebelumnya</b>
                ${d.riwayat.map(r => `<div style="padding:4px 0;font-size:.82rem"><b>${this._e(r.jabatan)}</b> (${this._e(r.nama)}) ${this._statusChip(r.status)}
                    ${!this._kosong(r.catatan) ? `<div class="tl-cat tl-doc">${richNote.view(r.catatan)}</div>` : ''}</div>`).join('')}</div>` : '';

        let aksi = '';
        if (d.bisaAct) {
            const pilih = d.key === 'direktur' ? `
                <label class="tl-lbl">Tunjuk Pejabat Pelaksana Pengadaan <small>(wajib untuk Setujui)</small></label>
                <select id="tl-ditunjuk"><option value="">-- Pilih Pejabat Pengadaan --</option>
                    ${(d.pengadaan || []).map(p => `<option value="${this._e(p.id)}">${this._e(p.nama)}</option>`).join('')}</select>` : '';
            aksi = `<div class="tl-approve">
                ${pilih}
                <label class="tl-lbl">Paraf <small>(wajib untuk Setujui)</small></label>
                <div class="tl-sig-wrap"><canvas id="tl-paraf"></canvas></div>
                <button class="tl-btn tl-btn-sm" onclick="telaahStaf._clearSig('_psig')"><i class="fas fa-eraser"></i> Hapus coretan</button>
                <label class="tl-lbl">Catatan Disposisi <small>(opsional untuk Setujui, wajib untuk Tolak)</small></label>
                ${richNote.editorHtml('tl-dp-cat', { placeholder: 'Ketik catatan disposisi di sini...' })}
                <div class="tl-actions">
                    <button class="tl-btn tl-btn-ok" id="tl-btn-setuju" onclick="telaahStaf.putuskan('Disetujui')"><i class="fas fa-check"></i> Setujui</button>
                    <button class="tl-btn tl-btn-danger" id="tl-btn-tolak" onclick="telaahStaf.putuskan('Ditolak')"><i class="fas fa-xmark"></i> Tolak</button>
                </div></div>`;
        } else {
            aksi = `<div style="margin-top:12px">${this._statusChip(d.status)}
                ${!this._kosong(d.catatan) ? `<div class="tl-cat tl-doc">${richNote.view(d.catatan)}</div>` : ''}
                ${d.paraf ? `<img src="data:image/png;base64,${d.paraf}" alt="Paraf" style="max-height:44px;margin-top:6px">` : ''}</div>`;
        }

        this._openModal(`<div class="tl-modal tl-modal-wide">
            <div class="tl-modal-head"><div><b>Disposisi: ${this._e(t.nomor)}</b><small>Sebagai ${this._e(d.jabatan)}</small></div>
                <button class="tl-icon-btn" onclick="telaahStaf._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tl-modal-body">${this._docHtml(t)}${lamp}${riw}${aksi}</div>
            <div class="tl-modal-foot"><button class="tl-btn" onclick="telaahStaf._closeModal()">Tutup</button></div></div>`);
        this._apv = d;
        if (d.bisaAct) this._initSig('tl-paraf', '_psig', 110);
    },

    async putuskan(keputusan) {
        const d = this._apv;
        if (!d || this._busy) return;
        const catatan = richNote.getValue('tl-dp-cat');
        let paraf = '', ditunjuk = '';
        if (keputusan === 'Disetujui') {
            if (d.key === 'direktur') {
                ditunjuk = this._val('tl-ditunjuk');
                if (!ditunjuk) { toast.error('Pilih Pejabat Pelaksana Pengadaan yang ditunjuk.'); return; }
            }
            paraf = this._exportPng(this._psig, 300);
            if (!paraf) { toast.error('Paraf wajib diisi untuk menyetujui.'); return; }
        } else {
            if (!catatan) { toast.error('Isi alasan penolakan pada kolom catatan.'); return; }
            if (!await this._confirm({ judul: 'Tolak Disposisi', pesan: 'Tolak disposisi ini? Pembuat telaahan akan diberi tahu alasan Anda.', ok: 'Ya, Tolak', icon: 'fa-circle-xmark' })) return;
        }
        const b1 = this._$('tl-btn-setuju'), b2 = this._$('tl-btn-tolak');
        const setuju = keputusan === 'Disetujui';
        this._busy = true; [b1, b2].forEach(b => { if (b) b.disabled = true; });
        // Loading screen di atas modal sampai hasilnya keluar (modal tidak bisa ditutup selama proses).
        this._ajukanBusy = true;
        this._setBusy('load', setuju ? 'Menyimpan persetujuan...' : 'Menyimpan penolakan...');
        try {
            const res = await api.approveTelaahDisposisi({ telaahId: d.telaahId, key: d.key, keputusan, catatan, paraf, ditunjuk });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memproses');
            // Berhasil: tampilkan centang + notifikasi sambil memuat ulang daftar, lalu tutup modal dengan transisi.
            this._setBusy('ok', setuju ? 'Disposisi berhasil disetujui' : 'Disposisi berhasil ditolak');
            toast.success(res.message || 'Berhasil');
            await Promise.all([this.init(), new Promise(r => setTimeout(r, 1100))]);
            this._ajukanBusy = false;
            const ov = this._$('tl-overlay');
            if (ov) { ov.classList.add('tl-leave'); await new Promise(r => setTimeout(r, 240)); }
            this._closeModal();
            this._busy = false;
        } catch (e) {
            this._ajukanBusy = false;
            this._setBusy(null);
            toast.error(e.message || 'Gagal memproses');
            this._busy = false;
            [b1, b2].forEach(b => { if (b) b.disabled = false; });
        }
    },

    // ── Lampiran (judul + foto) ────────────────────────────
    async openLampiran(telaahId) {
        this._openModal();
        try {
            const res = await api.getTelaahLampiran(telaahId);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memuat lampiran');
            this._lp = {
                telaahId: String(telaahId), nomor: res.data.telaah.nomor, judul: res.data.judul || '',
                foto: (res.data.foto || []).map(f => ({ fileId: f.fileId, base64: '', src: this._foto(f.fileId), ket: f.ket || '' }))
            };
            this._renderLampiran();
        } catch (e) {
            toast.error(e.message || 'Gagal memuat lampiran');
            this._closeModal();
        }
    },

    _renderLampiran() {
        const lp = this._lp;
        const grid = lp.foto.length ? lp.foto.map((f, i) => `
            <div class="tl-foto">
                <img src="${this._e(f.src)}" alt="Foto ${i + 1}" onclick="window.open(this.src,'_blank')">
                <input type="text" maxlength="200" placeholder="Keterangan foto (opsional)" value="${this._e(f.ket)}" oninput="telaahStaf._lp.foto[${i}].ket=this.value">
                <div class="tl-foto-tools"><span>Foto ${i + 1}${f.base64 ? ' · belum disimpan' : ''}</span>
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.lpGeser(${i},-1)" ${i === 0 ? 'disabled' : ''}><i class="fas fa-arrow-left"></i></button>
                    <button class="tl-btn tl-btn-sm" onclick="telaahStaf.lpGeser(${i},1)" ${i === lp.foto.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-right"></i></button>
                    <button class="tl-btn tl-btn-sm tl-btn-danger" onclick="telaahStaf.lpHapus(${i})"><i class="fas fa-trash"></i></button></div>
            </div>`).join('') : '<div class="tl-note" style="grid-column:1/-1;text-align:center;padding:10px">Belum ada foto.</div>';

        const body = `
            <label>Judul / Keterangan Lampiran</label>
            <textarea id="tl-lp-judul" rows="3" maxlength="1000" placeholder="Contoh: DOKUMENTASI PERBAIKAN BODI, JOK KULIT ... MOBIL DINAS DA 1410 FD">${this._e(lp.judul)}</textarea>
            <div class="tl-sub"><i class="fas fa-circle-info"></i> Tampil di bagian atas lembar lampiran (huruf kapital, rata tengah).</div>
            <label class="tl-lbl">Foto Lampiran <span class="tl-note">(${lp.foto.length}/${this.LAMPIRAN_MAX})</span></label>
            <div class="tl-drop" onclick="document.getElementById('tl-lp-file').click()">
                <i class="fas fa-cloud-arrow-up"></i>Klik untuk memilih foto (bisa banyak sekaligus)
                <div class="tl-sub">Foto dikompres otomatis. Maksimal ${this.LAMPIRAN_MAX} foto.</div></div>
            <input type="file" id="tl-lp-file" accept="image/*" multiple style="display:none" onchange="telaahStaf.lpTambah(this)">
            <div class="tl-grid">${grid}</div>`;

        // pertahankan isi judul yang sedang diketik saat render ulang
        const old = this._$('tl-lp-judul');
        if (old) lp.judul = old.value;

        this._openModal(`<div class="tl-modal tl-modal-wide">
            <div class="tl-modal-head"><div><b>Lampiran: ${this._e(lp.nomor)}</b></div>
                <button class="tl-icon-btn" onclick="telaahStaf._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tl-modal-body">${body}</div>
            <div class="tl-modal-foot"><button class="tl-btn" onclick="telaahStaf._closeModal()">Tutup</button>
                <button class="tl-btn" onclick="telaahStaf.cetakLampiran()"><i class="fas fa-print"></i> Pratinjau / Cetak</button>
                <button class="tl-btn tl-btn-ok" id="tl-lp-simpan" onclick="telaahStaf.lpSimpan()"><i class="fas fa-save"></i> Simpan Lampiran</button></div></div>`);
    },

    _lpSimpanJudul() {
        const el = this._$('tl-lp-judul');
        if (el && this._lp) this._lp.judul = el.value;
    },

    /** Perkecil foto di browser supaya unggahan ringan. */
    _kompres(file, maxSide, kualitas) {
        maxSide = maxSide || 1280; kualitas = kualitas || 0.8;
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('Gagal membaca file.'));
            fr.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
                img.onload = () => {
                    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
                    const w = Math.round(img.width * k), h = Math.round(img.height * k);
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', kualitas));
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    },

    async lpTambah(input) {
        const files = Array.from(input.files || []);
        input.value = '';
        if (!files.length || !this._lp) return;
        this._lpSimpanJudul();
        const sisa = this.LAMPIRAN_MAX - this._lp.foto.length;
        if (sisa <= 0) { toast.error('Maksimal ' + this.LAMPIRAN_MAX + ' foto.'); return; }
        if (files.length > sisa) toast.info('Hanya ' + sisa + ' foto pertama yang ditambahkan (maksimal ' + this.LAMPIRAN_MAX + ').');
        for (const f of files.slice(0, sisa)) {
            try {
                const src = await this._kompres(f);
                this._lp.foto.push({ fileId: '', base64: src.split(',')[1], src, ket: '' });
            } catch (e) {
                toast.error(f.name + ': ' + e.message);
            }
        }
        this._renderLampiran();
    },

    lpGeser(i, arah) {
        const lp = this._lp, j = i + arah;
        if (!lp || j < 0 || j >= lp.foto.length) return;
        this._lpSimpanJudul();
        const tmp = lp.foto[i]; lp.foto[i] = lp.foto[j]; lp.foto[j] = tmp;
        this._renderLampiran();
    },

    lpHapus(i) {
        if (!this._lp) return;
        this._lpSimpanJudul();
        this._lp.foto.splice(i, 1);
        this._renderLampiran();
    },

    async lpSimpan() {
        const lp = this._lp;
        if (!lp || this._busy) return;
        this._lpSimpanJudul();
        const btn = this._$('tl-lp-simpan');
        this._busy = true; if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; }
        try {
            // 1) unggah foto baru satu per satu (lebih andal daripada 1 permintaan besar)
            const baru = lp.foto.filter(f => f.base64);
            let n = 0;
            for (const f of baru) {
                n++;
                if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Mengunggah ${n}/${baru.length}...`;
                const up = await api.uploadTelaahFoto(lp.telaahId, f.base64);
                if (!up || !up.success) throw new Error((up && up.error) || 'Gagal mengunggah foto');
                f.fileId = up.fileId; f.base64 = '';
            }
            // 2) simpan judul + urutan foto
            const res = await api.simpanTelaahLampiran({
                telaahId: lp.telaahId, judul: lp.judul,
                foto: lp.foto.map(f => ({ fileId: f.fileId, ket: f.ket }))
            });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menyimpan lampiran');
            toast.success(res.message || 'Tersimpan');
            lp.foto = (res.foto || []).map(f => {
                const lama = lp.foto.find(x => x.fileId === f.fileId);
                return { fileId: f.fileId, base64: '', src: (lama && lama.src) || this._foto(f.fileId), ket: f.ket || '' };
            });
            this._busy = false;
            this._renderLampiran();
            await this._muatList();
            if (this.tab !== 'form') this.render();
            else if (String(this.formId) === String(lp.telaahId)) { const el = this._$('tl-lampiran'); if (el) el.value = res.lampiran || '-'; }
        } catch (e) {
            toast.error(e.message || 'Gagal menyimpan lampiran');
            this._busy = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Simpan Lampiran'; }
        }
    },

    cetakLampiran() {
        const lp = this._lp;
        if (!lp) return;
        this._lpSimpanJudul();
        if (!lp.foto.length) { toast.error('Tambahkan minimal 1 foto.'); return; }
        this._cetak('Lembar Lampiran', [this._lembarLampiran(lp.judul, lp.foto.map(f => ({ src: f.src, ket: f.ket })))]);
    },

    // ── Cetak ──────────────────────────────────────────────
    _lembarTelaah(t, ttd) {
        const e = s => this._e(s);
        const sec = this.SECTIONS.map(([k, label]) => `<div class="sec"><div class="sec-t">${label}</div>
            <div class="isi">${this._kosong(t[k]) ? '-' : richNote.view(t[k])}</div></div>`).join('');
        return `<section class="lembar">
            <div class="j-ts">TELAAHAN STAF</div>
            <div class="nomor">${e(t.nomor)}</div>
            <table class="hdr">
                <tr><td>Kepada</td><td>:</td><td>${e(t.kepada)}</td></tr>
                <tr><td>Dari</td><td>:</td><td>${e(t.dari)}</td></tr>
                <tr><td>Hari/Tanggal</td><td>:</td><td>${e(t.tanggal)}</td></tr>
                <tr><td>Lampiran</td><td>:</td><td>${e(t.lampiran || '-')}</td></tr>
                <tr><td>Perihal</td><td>:</td><td>${e(t.perihal).replace(/\n/g, '<br>')}</td></tr>
            </table>
            <hr class="garis">
            ${sec}
            <div class="penutup">${e(t.penutup).replace(/\n/g, '<br>')}</div>
            <div class="ttd">
                <div>${e(t.jabatanTtd)}</div>
                ${ttd ? `<img src="data:image/png;base64,${ttd}" alt="TTD">` : '<div class="sp"></div>'}
                <div class="nm">${e(t.namaTtd)}</div>
                <div>NIK. ${e(t.nik)}</div>
            </div></section>`;
    },

    _lembarDisposisi(rows) {
        const e = s => this._e(s);
        const isi = rows.map(r => {
            let c = `<div class="jab">${e(r.jabatan)}:</div>`;
            if (r.pilihan) {
                const dp = String(r.dipilih || '').toLowerCase();
                c += '<div class="pil">' + r.pilihan.map(n => {
                    const ya = dp && String(n).toLowerCase() === dp;
                    return `<div>${ya ? '<span class="cek">&#10003;</span>' : '<span class="bul">&#9675;</span>'} ${e(n)}</div>`;
                }).join('') + '</div>';
            }
            if (r.status === 'Ditolak') c += '<div class="cat"><b>[DITOLAK]</b></div>';
            if (!this._kosong(r.catatan)) c += `<div class="cat">${richNote.view(r.catatan)}</div>`;
            return `<tr><td class="c1">${c}</td><td class="c2">${e(r.tgl)}</td>
                <td class="c3">${r.paraf ? `<img src="data:image/png;base64,${r.paraf}" alt="Paraf">` : ''}</td></tr>`;
        }).join('');
        return `<section class="lembar"><div class="j-ld">LEMBAR DISPOSISI</div>
            <table class="ld"><thead><tr><th style="width:62%">JABATAN</th><th style="width:18%">TANGGAL</th><th style="width:20%">PARAF</th></tr></thead>
            <tbody>${isi}</tbody></table></section>`;
    },

    _lembarLampiran(judul, foto) {
        const e = s => this._e(s);
        const sel = f => `<td><img src="${e(f.src)}" alt="Foto">${f.ket ? `<div class="cap">${e(f.ket)}</div>` : ''}</td>`;
        let rows = '';
        for (let i = 0; i < foto.length; i += 2) rows += '<tr>' + sel(foto[i]) + (foto[i + 1] ? sel(foto[i + 1]) : '<td></td>') + '</tr>';
        return `<section class="lembar">${judul ? `<div class="j-lp">${e(judul).replace(/\n/g, '<br>')}</div>` : ''}
            <table class="lp"><tbody>${rows}</tbody></table></section>`;
    },

    _printCss() {
        return `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11.5pt;color:#000;line-height:1.4}
.lembar{padding:20px 28px;page-break-after:always}.lembar:last-of-type{page-break-after:auto}
img.kop{width:100%;display:block;margin-bottom:8px}
.j-ts{text-align:center;font-weight:bold;font-size:14pt;text-decoration:underline;margin:10px 0 2px}
.nomor{text-align:center;font-size:11.5pt;margin-bottom:14px}
.hdr{width:100%;border-collapse:collapse;margin-bottom:6px}.hdr td{vertical-align:top;padding:1px 4px}
.hdr td:first-child{width:110px}.hdr td:nth-child(2){width:10px}
hr.garis{border:none;border-top:2px solid #000;margin:8px 0 12px}
.sec{margin-bottom:10px}.sec-t{font-weight:bold;margin-bottom:2px}
.isi{text-align:justify;padding-left:18px}.isi ol,.isi ul{margin-left:22px;padding-left:4px}
.penutup{text-align:justify;margin:14px 0 18px;padding-left:18px}
.ttd{width:240px;margin-left:auto;text-align:center;page-break-inside:avoid}
.ttd img{height:70px;display:block;margin:4px auto}.ttd .sp{height:70px}
.ttd .nm{font-weight:bold;text-decoration:underline;text-transform:uppercase}
.j-ld{text-align:center;font-weight:bold;font-size:13pt;margin:12px 0}
table.ld{width:100%;border-collapse:collapse;table-layout:fixed}
table.ld th,table.ld td{border:1px solid #000;padding:6px 8px;vertical-align:top}
table.ld th{text-align:center;background:#f0f0f0}table.ld tr{page-break-inside:avoid}
td.c1{height:80px}td.c2{text-align:center}td.c3{text-align:center;vertical-align:middle}
td.c3 img{max-height:60px;max-width:100%}
.jab{font-weight:bold}.cat{margin-top:4px;text-align:left}.cat ol,.cat ul{margin:2px 0 2px 20px;padding-left:4px}
.pil{margin:4px 0 0 4px}.pil .cek{color:#16a34a;font-weight:bold}.pil .bul{color:#6b7280}
.j-lp{text-align:center;font-weight:bold;font-size:11pt;text-transform:uppercase;margin:12px 0 14px;line-height:1.5}
table.lp{width:100%;border-collapse:collapse;table-layout:fixed}
table.lp td{border:1px solid #000;padding:6px;width:50%;text-align:center;vertical-align:middle}
table.lp tr{page-break-inside:avoid}table.lp img{width:100%;height:5.5cm;object-fit:contain;display:block}
.cap{font-size:9.5pt;margin-top:4px}
.bar{position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;gap:10px;justify-content:flex-end;padding:10px 24px;background:rgba(255,255,255,.96);border-bottom:1px solid #e5e7eb}
.bar button{padding:8px 20px;border:0;border-radius:8px;color:#fff;font-weight:600;cursor:pointer}
@media print{.bar,.sp-bar{display:none!important}.lembar{padding:8px 16px}body{font-size:10.5pt}}`;
    },

    _cetakHtml(judul, lembar) {
        const kop = new URL('assets/kop-surat.jpeg', location.href).href;
        // Tiap lembar diberi kop surat di bagian atasnya.
        const isi = lembar.map(l => l.replace('<section class="lembar">', `<section class="lembar"><img class="kop" src="${kop}" alt="Kop">`)).join('');
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${this._e(judul)}</title><style>${this._printCss()}</style></head><body>
<div class="bar"><button style="background:#6b7280" onclick="window.close()">Tutup</button><button style="background:#0d6efd" onclick="window.print()">Cetak</button></div>
<div class="sp-bar" style="height:52px"></div>${isi}</body></html>`;
    },

    _cetak(judul, lembar) {
        const w = window.open('', '_blank');
        if (!w) { toast.error('Popup diblokir browser. Izinkan popup untuk mencetak.'); return; }
        w.document.open(); w.document.write(this._cetakHtml(judul, lembar)); w.document.close();
    },

    /** Cetak Semua: Telaahan Staf + Lembar Disposisi (jika diajukan) + Lampiran (jika ada foto). */
    async cetakSemua(id) {
        // Jendela dibuka SEKARANG (saat klik) supaya tidak diblokir popup-blocker.
        const w = window.open('', '_blank');
        if (!w) { toast.error('Popup diblokir browser. Izinkan popup untuk mencetak.'); return; }
        w.document.write('<p style="font-family:Arial;padding:24px">Menyiapkan dokumen...</p>');
        try {
            const [rt, rd, rl] = await Promise.all([api.getTelaah(id), api.getTelaahDisposisi(id), api.getTelaahLampiran(id)]);
            if (!rt || !rt.success) throw new Error((rt && rt.error) || 'Gagal memuat telaahan');
            const t = rt.data;
            t.lampiran = t.lampiran || '-';
            const lembar = [this._lembarTelaah(t, t.ttd)];
            if (rd && rd.success && rd.data.diajukan) {
                lembar.push(this._lembarDisposisi(rd.data.rows));
                if (!rd.data.selesai) toast.info('Perhatian: disposisi belum selesai disetujui semua pejabat.');
            }
            const foto = (rl && rl.success && rl.data.foto) || [];
            if (foto.length) lembar.push(this._lembarLampiran(rl.data.judul, foto.map(f => ({ src: this._foto(f.fileId), ket: f.ket }))));
            w.document.open(); w.document.write(this._cetakHtml('Cetak Semua - ' + t.nomor, lembar)); w.document.close();
        } catch (e) {
            w.close();
            toast.error(e.message || 'Gagal menyiapkan dokumen');
        }
    }
};

function initTelaahStaf() { telaahStaf.init(); }
window.telaahStaf = telaahStaf;
window.initTelaahStaf = initTelaahStaf;
