/**
 * Portal Karyawan - Permintaan Barang
 * PT. Tirta Agung Amuntai
 *
 * Menggantikan aplikasi Permintaan Barang yang dulu terpisah (link Apps Script).
 * Backend: Permintaan.gs. Alur persetujuan dibentuk otomatis dari data karyawan
 * (Asmen penyetuju, Manajer bagian, Manajer Umum, Manajer Keuangan, Direktur,
 * lalu Pejabat Pengadaan - yang dicentang di Edit Karyawan > tab Kekaryawanan).
 */
const permintaanBarang = {
    ctx: null,          // { me, pengadaanList, preview }
    list: null,         // { saya, menunggu, riwayat, semua, stats }
    katalog: [],
    tab: 'ringkasan',
    filterSemua: 'Semua',
    loading: false,
    error: '',
    detail: null,       // permintaan yang sedang dibuka
    detailTtd: {},
    _itemSeq: 0,
    editing: null,      // permintaan ditolak yang sedang diperbaiki (mode ajukan ulang)
    _submitting: false,
    _sig: null,

    // ── Util ───────────────────────────────────────────────
    _e(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    _root() { return document.getElementById('pb-root'); },
    _statusChip(s) {
        const cls = s === 'Disetujui' ? 'ok' : (s === 'Ditolak' ? 'no' : 'wait');
        const ic = s === 'Disetujui' ? 'fa-circle-check' : (s === 'Ditolak' ? 'fa-circle-xmark' : 'fa-hourglass-half');
        return `<span class="pb-chip pb-chip-${cls}"><i class="fas ${ic}"></i> ${this._e(s)}</span>`;
    },
    _tglIndo(t) {
        const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const p = String(t || '').split('/');
        return p.length === 3 ? `${parseInt(p[0], 10)} ${b[parseInt(p[1], 10) - 1]} ${p[2]}` : (t || '');
    },

    // ── Init ───────────────────────────────────────────────
    async init() {
        const root = this._root();
        if (!root) return;
        if (!this.ctx) root.innerHTML = '<div class="pb-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';
        this.loading = true;
        this.error = '';
        try {
            const [c, l] = await Promise.all([api.getPermintaanContext(), api.getPermintaanBarangList()]);
            if (!c || !c.success) throw new Error((c && c.error) || 'Gagal memuat data pengguna');
            if (!l || !l.success) throw new Error((l && l.error) || 'Gagal memuat daftar permintaan');
            this.ctx = c.data;
            this.list = l.data;
        } catch (e) {
            this.error = e.message || 'Gagal memuat data';
        }
        this.loading = false;
        if (!this._tabAllowed(this.tab)) this.tab = 'ringkasan';
        this.render();
    },

    _tabAllowed(t) {
        if (!this.ctx) return t === 'ringkasan';
        const me = this.ctx.me;
        if (t === 'baru' || t === 'saya' || t === 'menunggu' || t === 'riwayat') return me.hasEmployee;
        if (t === 'semua') return !!me.rekap;
        return true;
    },

    setTab(t) {
        if (t !== 'baru') this.editing = null;
        this.tab = t;
        this.render();
        if (t === 'baru') this._initForm();
        const pc = document.querySelector('.page-content');
        if (pc) pc.scrollTop = 0;
    },

    // ── Render utama ───────────────────────────────────────
    render() {
        const root = this._root();
        if (!root) return;
        const hero = `
            <div class="pb-hero"><div class="pb-hero-ic"><i class="fas fa-box-open"></i></div>
            <div><h2>Permintaan Barang</h2><p>${this.ctx && this.ctx.me.rekap ? 'Rekap seluruh permintaan barang dari karyawan.' : 'Ajukan permintaan barang dan pantau persetujuannya sampai Pejabat Pengadaan.'}</p></div></div>`;
        if (this.error) {
            root.innerHTML = `${hero}<div class="pb-alert pb-alert-err"><i class="fas fa-triangle-exclamation"></i> ${this._e(this.error)}</div>
                <button class="pb-btn pb-btn-primary" onclick="permintaanBarang.init()"><i class="fas fa-rotate"></i> Coba lagi</button>`;
            return;
        }
        if (!this.ctx || !this.list) return;
        const me = this.ctx.me;
        const nMenunggu = this.list.menunggu.length;
        const tabs = [
            ['ringkasan', 'fa-gauge', 'Ringkasan'],
            me.hasEmployee && ['baru', 'fa-plus-circle', 'Buat Permintaan'],
            me.hasEmployee && ['saya', 'fa-list', 'Permintaan Saya'],
            me.hasEmployee && ['menunggu', 'fa-stamp', 'Perlu Persetujuan' + (nMenunggu ? ` <span class="pb-badge">${nMenunggu}</span>` : '')],
            me.hasEmployee && ['riwayat', 'fa-clock-rotate-left', 'Riwayat Persetujuan'],
            me.rekap && ['semua', 'fa-folder-open', 'Semua Permintaan']
        ].filter(Boolean);
        const tabHtml = tabs.map(t =>
            `<button type="button" class="pb-tab ${this.tab === t[0] ? 'active' : ''}" onclick="permintaanBarang.setTab('${t[0]}')"><i class="fas ${t[1]}"></i> ${t[2]}</button>`
        ).join('');

        let body = '';
        if (this.tab === 'ringkasan') body = this._renderRingkasan();
        else if (this.tab === 'baru') body = this._renderForm();
        else if (this.tab === 'saya') body = this._renderList(this.list.saya, 'Anda belum pernah membuat permintaan barang.', false, true);
        else if (this.tab === 'menunggu') body = this._renderList(this.list.menunggu, 'Tidak ada permintaan yang menunggu persetujuan Anda.', true);
        else if (this.tab === 'riwayat') body = this._renderList(this.list.riwayat, 'Belum ada riwayat persetujuan.');
        else if (this.tab === 'semua') body = this._renderSemua();

        const warn = (!me.hasEmployee && !me.rekap)
            ? `<div class="pb-alert pb-alert-warn"><i class="fas fa-circle-info"></i> Akun admin ini belum terhubung ke data karyawan, jadi hanya bisa melihat dan menghapus permintaan.</div>` : '';
        root.innerHTML = `${hero}${warn}<div class="pb-tabs">${tabHtml}</div>${body}`;
    },

    _renderRingkasan() {
        const s = this.list.stats;
        const me = this.ctx.me;
        const judul = me.rekap ? 'Rekap seluruh permintaan' : 'Permintaan Anda';
        const cards = [
            ['Total', s.total, 'fa-box', 'blue'],
            ['Menunggu', s.menunggu, 'fa-hourglass-half', 'amber'],
            ['Disetujui', s.disetujui, 'fa-circle-check', 'green'],
            ['Ditolak', s.ditolak, 'fa-circle-xmark', 'red']
        ].map(c => `<div class="pb-stat pb-stat-${c[3]}"><i class="fas ${c[2]}"></i><div><b>${c[1]}</b><span>${c[0]}</span></div></div>`).join('');
        const perlu = this.list.menunggu.length
            ? `<div class="pb-alert pb-alert-warn"><i class="fas fa-stamp"></i> Ada <b>${this.list.menunggu.length}</b> permintaan yang menunggu persetujuan Anda.
               <button class="pb-btn pb-btn-sm" onclick="permintaanBarang.setTab('menunggu')">Lihat</button></div>` : '';
        const terbaru = (me.rekap ? this.list.semua : this.list.saya).slice(0, 5);
        return `${perlu}
            <div class="pb-card"><h3 class="pb-h3">${judul}</h3><div class="pb-stats">${cards}</div></div>
            <div class="pb-card"><h3 class="pb-h3">Permintaan Terbaru</h3>
            ${terbaru.length ? this._rows(terbaru) : '<div class="pb-empty"><i class="fas fa-inbox"></i><p>Belum ada permintaan.</p></div>'}</div>`;
    },

    _rows(arr, own) {
        return arr.map(r => {
            const n = r.items.length;
            const ringkas = r.items.slice(0, 2).map(i => this._e(i.nama)).join(', ') + (n > 2 ? ` +${n - 2} lainnya` : '');
            const giliran = r.status === 'Menunggu' && r.giliran
                ? `<small class="pb-giliran"><i class="fas fa-hourglass-half"></i> Menunggu: ${this._e(r.giliran)}</small>` : '';
            const rev = r.revisi ? ` <small class="pb-rev">revisi ke-${this._e(r.revisi)}</small>` : '';
            const tombol = own && r.status === 'Ditolak' ? `<div class="pb-row-act" onclick="event.stopPropagation()">
                    <button type="button" class="pb-btn pb-btn-sm pb-btn-primary" onclick="permintaanBarang.perbaiki('${this._e(r.id)}')"><i class="fas fa-pen"></i> Perbaiki</button>
                    <button type="button" class="pb-btn pb-btn-sm pb-btn-danger" onclick="permintaanBarang.hapus('${this._e(r.id)}')"><i class="fas fa-trash"></i> Hapus</button></div>` : '';
            return `<div class="pb-row" onclick="permintaanBarang.openDetail('${this._e(r.id)}')">
                <div class="pb-row-main">
                    <b>${this._e(r.nomor)}${rev}</b>
                    <span>${this._e(r.pemohonNama)} &middot; ${this._e(r.tanggal)}</span>
                    <small>${ringkas || '-'}</small>
                    ${giliran}
                    ${tombol}
                </div>
                ${this._statusChip(r.status)}
            </div>`;
        }).join('');
    },

    _renderList(arr, kosong, aksi, own) {
        if (!arr.length) return `<div class="pb-card"><div class="pb-empty"><i class="fas fa-inbox"></i><p>${kosong}</p></div></div>`;
        return `<div class="pb-card">${aksi ? '<p class="pb-note">Ketuk permintaan untuk menyetujui atau menolak.</p>' : ''}${this._rows(arr, own)}</div>`;
    },

    _renderSemua() {
        const f = this.filterSemua;
        const arr = this.list.semua.filter(r => f === 'Semua' || r.status === f);
        const opt = ['Semua', 'Menunggu', 'Disetujui', 'Ditolak'].map(o => `<option ${o === f ? 'selected' : ''}>${o}</option>`).join('');
        return `<div class="pb-card">
            <div class="pb-toolbar"><label>Status</label>
            <select onchange="permintaanBarang.filterSemua=this.value;permintaanBarang.render()">${opt}</select>
            <span class="pb-note">${arr.length} permintaan</span></div>
            ${arr.length ? this._rows(arr) : '<div class="pb-empty"><i class="fas fa-inbox"></i><p>Tidak ada data.</p></div>'}</div>`;
    },

    // ── Form buat permintaan ───────────────────────────────
    _renderForm() {
        const me = this.ctx.me;
        const chain = this.ctx.preview.map((s, i) =>
            `<li><span>${i + 1}</span><div><b>${this._e(s.jabatan)}</b>${s.nama ? `<small>${this._e(s.nama)}</small>` : ''}</div></li>`).join('');
        const ed = this.editing;
        const edInfo = ed ? `<div class="pb-alert pb-alert-warn"><i class="fas fa-pen"></i> <span>Memperbaiki permintaan <b>${this._e(ed.nomor)}</b> yang ditolak. Nomor tetap sama dan alur persetujuan dimulai dari awal.${ed.catatan ? '<br>Alasan penolakan: ' + this._e(ed.catatan) : ''}</span></div>` : '';
        return `<div class="pb-card">
            <h3 class="pb-h3">${ed ? 'Perbaiki Permintaan Barang' : 'Form Permintaan Barang'}</h3>
            ${edInfo}
            <div class="pb-form-grid">
                <div><label>Nama Pemohon</label><input type="text" value="${this._e(me.nama)}" readonly></div>
                <div><label>Jabatan</label><input type="text" value="${this._e(me.jabatan || '-')}" readonly></div>
                <div><label>Bagian</label><input type="text" value="${this._e(me.bagian || '-')}" readonly></div>
                <div><label>Sub Bidang / Seksi <small>(opsional, dipakai di nomor surat)</small></label>
                    <input type="text" id="pb-subBidang" value="${this._e(ed ? ed.subBidang : '')}" placeholder="Contoh: Pergudangan"></div>
                <div><label>Unit Wilayah</label><input type="text" id="pb-wilayah" value="${this._e(ed ? ed.wilayah : (me.unitWilayah || ''))}" placeholder="Contoh: BNA Amuntai"></div>
            </div>
            <label class="pb-lbl">Keperluan / Alasan Kebutuhan</label>
            <textarea id="pb-keperluan" rows="3" placeholder="Jelaskan keperluan permintaan ini...">${this._e(ed ? ed.keperluan : '')}</textarea>

            <div class="pb-items-head"><b><i class="fas fa-boxes-stacked"></i> Daftar Barang</b>
                <button type="button" class="pb-btn pb-btn-sm" onclick="permintaanBarang.addItem()"><i class="fas fa-plus"></i> Tambah Barang</button></div>
            <div id="pb-items"></div>
            <datalist id="pb-katalog"></datalist>

            <h4 class="pb-h4">Alur Persetujuan</h4>
            <ol class="pb-chain">${chain}</ol>
            <p class="pb-note">Alur dibentuk otomatis dari data kepegawaian Anda. Tahap yang sama dengan pemohon dilewati.</p>

            <div class="pb-actions">
                <button type="button" class="pb-btn pb-btn-primary" id="pb-submit" onclick="permintaanBarang.submit()"><i class="fas fa-paper-plane"></i> ${ed ? 'Ajukan Kembali' : 'Kirim Permintaan'}</button>
                <button type="button" class="pb-btn" onclick="permintaanBarang.setTab('${ed ? 'saya' : 'ringkasan'}')">Batal</button>
            </div>
        </div>`;
    },

    async _initForm() {
        this._itemSeq = 0;
        if (this.editing && this.editing.items.length) this.editing.items.forEach(it => this.addItem(it));
        else this.addItem();
        if (!this.katalog.length) {
            try {
                const r = await api.getKatalogBarangPermintaan();
                this.katalog = (r && r.success && r.data) || [];
            } catch (e) { this.katalog = []; }
        }
        const dl = document.getElementById('pb-katalog');
        if (dl) dl.innerHTML = this.katalog.map(k => `<option value="${this._e(k.nama)}">`).join('');
    },

    addItem(pre) {
        const box = document.getElementById('pb-items');
        if (!box) return;
        if (box.children.length >= 50) { toast.error('Maksimal 50 barang per permintaan.'); return; }
        const id = ++this._itemSeq;
        const div = document.createElement('div');
        div.className = 'pb-item';
        div.id = 'pb-item-' + id;
        div.innerHTML = `
            <div class="pb-item-top"><span class="pb-item-no"></span>
                <button type="button" class="pb-icon-btn" title="Hapus barang" onclick="permintaanBarang.removeItem(${id})"><i class="fas fa-trash"></i></button></div>
            <div class="pb-item-grid">
                <div class="pb-span2"><label>Nama Barang *</label>
                    <input type="text" class="pb-i-nama" list="pb-katalog" placeholder="Nama barang" oninput="permintaanBarang.onNama(${id})" autocomplete="off"></div>
                <div><label>Jumlah *</label><input type="number" class="pb-i-jumlah" min="1" inputmode="numeric" placeholder="0"></div>
                <div><label>Satuan *</label><input type="text" class="pb-i-satuan" placeholder="Pcs, Unit, Meter..."></div>
                <div><label>Spesifikasi / Merek</label><input type="text" class="pb-i-spek"></div>
                <div><label>Keterangan</label><input type="text" class="pb-i-ket"></div>
            </div>
            <div class="pb-hint" id="pb-hint-${id}"></div>`;
        box.appendChild(div);
        if (pre) {
            div.querySelector('.pb-i-nama').value = pre.nama || '';
            div.querySelector('.pb-i-jumlah').value = pre.jumlah || '';
            div.querySelector('.pb-i-satuan').value = pre.satuan || '';
            div.querySelector('.pb-i-spek').value = pre.spesifikasi || '';
            div.querySelector('.pb-i-ket').value = pre.keterangan || '';
        }
        this._renumber();
    },

    removeItem(id) {
        const box = document.getElementById('pb-items');
        const el = document.getElementById('pb-item-' + id);
        if (!el || !box) return;
        if (box.children.length <= 1) { toast.warning('Minimal 1 barang.'); return; }
        el.remove();
        this._renumber();
    },

    _renumber() {
        document.querySelectorAll('#pb-items .pb-item .pb-item-no').forEach((n, i) => { n.textContent = 'Barang ' + (i + 1); });
    },

    onNama(id) {
        const el = document.getElementById('pb-item-' + id);
        if (!el) return;
        const v = el.querySelector('.pb-i-nama').value.trim().toLowerCase();
        const hint = document.getElementById('pb-hint-' + id);
        if (v.length < 2) { hint.innerHTML = ''; return; }
        const exact = this.katalog.filter(k => k.nama.toLowerCase() === v)[0];
        const sat = el.querySelector('.pb-i-satuan');
        if (exact && !sat.value) sat.value = exact.satuan;
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const n = norm(v);
        const tk = n.split(' ').filter(t => t.length >= 4);
        const cocok = k => {
            const m = norm(k.nama);
            return m === n || (n.length >= 3 && (m.indexOf(n) !== -1 || n.indexOf(m) !== -1)) || m.split(' ').some(t => t.length >= 4 && tk.indexOf(t) !== -1);
        };
        const rows = [];
        this.katalog.filter(cocok).forEach(k => k.riwayat.forEach(r => rows.push({ barang: k.nama, ...r })));
        rows.sort((a, b) => this._tglMs(b.tanggal) - this._tglMs(a.tanggal));
        hint.innerHTML = this._riwayatBox(rows.slice(0, 5), 'Riwayat permintaan barang ini sebelumnya:');
    },

    _tglMs(t) {
        const p = String(t || '').split('/');
        return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() : 0;
    },

    _lalu(t) {
        const ms = this._tglMs(t);
        if (!ms) return '';
        const d = Math.floor((Date.now() - ms) / 86400000);
        return d <= 0 ? 'hari ini' : d + ' hari lalu';
    },

    _riwayatBox(rows, judul) {
        if (!rows.length) return '';
        const tr = rows.map(r => `<tr>
            <td><b>${this._e(r.barang)}</b></td>
            <td class="c"><b>${this._e(r.jumlah)} ${this._e(r.satuan)}</b></td>
            <td>${this._e(r.pemohon)}</td>
            <td>${this._e(r.unit || r.bagian || '-')}</td>
            <td class="c">${this._e(r.tanggal)}<small>${this._e(this._lalu(r.tanggal))}</small></td>
            <td class="c">${this._statusChip(r.status)}</td></tr>`).join('');
        return `<div class="pb-riwayat"><div class="pb-riwayat-h"><i class="fas fa-triangle-exclamation"></i> ${this._e(judul)}</div>
            <div class="pb-scroll"><table class="pb-table"><thead><tr><th>Barang</th><th>Jumlah</th><th>Nama Pemohon</th><th>Unit/Bagian</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
    },

    async submit() {
        if (this._submitting) return;
        const keperluan = (document.getElementById('pb-keperluan').value || '').trim();
        if (!keperluan) { toast.error('Keperluan permintaan wajib diisi.'); return; }
        const items = [];
        let ada = 0;
        document.querySelectorAll('#pb-items .pb-item').forEach(el => {
            const nama = el.querySelector('.pb-i-nama').value.trim();
            const jumlah = Number(el.querySelector('.pb-i-jumlah').value);
            const satuan = el.querySelector('.pb-i-satuan').value.trim();
            if (nama || el.querySelector('.pb-i-jumlah').value || satuan) ada++;
            if (nama && satuan && jumlah > 0) {
                items.push({ nama, jumlah, satuan, spesifikasi: el.querySelector('.pb-i-spek').value.trim(), keterangan: el.querySelector('.pb-i-ket').value.trim() });
            }
        });
        if (!items.length) { toast.error('Isi minimal 1 barang lengkap (nama, jumlah, satuan).'); return; }
        if (items.length !== ada) { toast.error('Ada barang yang belum lengkap. Lengkapi atau hapus barang tersebut.'); return; }

        this._submitting = true;
        const btn = document.getElementById('pb-submit');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...'; }
        try {
            const payload = {
                keperluan, items,
                subBidang: document.getElementById('pb-subBidang').value.trim(),
                wilayah: document.getElementById('pb-wilayah').value.trim()
            };
            const res = this.editing
                ? await api.ajukanUlangPermintaanBarang({ ...payload, id: this.editing.id })
                : await api.buatPermintaanBarang(payload);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal mengirim permintaan');
            toast.success(res.message || 'Permintaan berhasil dibuat.');
            this.editing = null;
            this.katalog = [];
            this.tab = 'saya';
            await this.init();
        } catch (e) {
            toast.error(e.message || 'Gagal mengirim permintaan');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + (this.editing ? 'Ajukan Kembali' : 'Kirim Permintaan'); }
        }
        this._submitting = false;
    },

    // ── Detail ─────────────────────────────────────────────
    async openDetail(id) {
        this._closeDetail();
        const ov = document.createElement('div');
        ov.id = 'pb-overlay';
        ov.className = 'pb-overlay';
        ov.innerHTML = '<div class="pb-modal"><div class="pb-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div></div>';
        ov.addEventListener('click', e => { if (e.target === ov) this._closeDetail(); });
        document.body.appendChild(ov);
        try {
            const res = await api.getDetailPermintaanBarang(id);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memuat detail');
            this.detail = res.data;
            this.detailTtd = res.ttd || {};
            this._renderDetail();
        } catch (e) {
            toast.error(e.message || 'Gagal memuat detail');
            this._closeDetail();
        }
    },

    _closeDetail() {
        const ov = document.getElementById('pb-overlay');
        if (ov) ov.remove();
        this._sig = null;
    },

    _stepTable(p) {
        const th = ['Pemohon'].concat(p.steps.map(s => s.jabatan)).map(h => `<th>${this._e(h)}</th>`).join('');
        const sign = [`<td class="pb-ok">✔</td>`].concat(p.steps.map(s => {
            const img = this.detailTtd[s.key];
            return img ? `<td><img src="data:image/png;base64,${img}" alt="TTD"></td>` : '<td class="pb-blank">(.........)</td>';
        })).join('');
        const nama = [`<td>${this._e(p.pemohonNama)}</td>`].concat(p.steps.map(s => {
            const cls = s.status === 'Disetujui' ? 'ok' : (s.status === 'Ditolak' ? 'no' : 'wait');
            const ic = s.status === 'Disetujui' ? '✅' : (s.status === 'Ditolak' ? '❌' : '⏳');
            return `<td class="pb-st-${cls}">${ic} ${this._e(s.status)}${s.nama ? `<small>${this._e(s.nama)}</small>` : ''}${s.tanggal ? `<small>${this._e(s.tanggal)}</small>` : ''}</td>`;
        })).join('');
        return `<div class="pb-scroll"><table class="pb-table pb-steps"><thead><tr>${th}</tr></thead><tbody><tr>${sign}</tr><tr>${nama}</tr></tbody></table></div>`;
    },

    _renderDetail() {
        const ov = document.getElementById('pb-overlay');
        if (!ov) return;
        const p = this.detail;
        const items = p.items.map((it, i) => `<tr><td>${i + 1}</td><td>${this._e(it.nama)}${it.spesifikasi ? `<small>${this._e(it.spesifikasi)}</small>` : ''}</td>
            <td class="c">${this._e(it.jumlah)}</td><td class="c">${this._e(it.satuan)}</td><td>${this._e(it.keterangan || '')}</td></tr>`).join('');
        const catatan = p.status === 'Ditolak' && p.catatan
            ? `<div class="pb-alert pb-alert-err"><i class="fas fa-circle-xmark"></i> Alasan penolakan: ${this._e(p.catatan)}</div>` : '';
        const rwy = (p.riwayatPenolakan || []).length
            ? `<div class="pb-alert"><i class="fas fa-clock-rotate-left"></i> <span><b>Riwayat penolakan sebelumnya:</b><br>${p.riwayatPenolakan.map(x => `${this._e(x.tanggal)} - ${this._e(x.jabatan)}${x.oleh ? ' (' + this._e(x.oleh) + ')' : ''}: ${this._e(x.catatan || '-')}`).join('<br>')}</span></div>` : '';
        const aksi = p.bisaApprove ? this._approvePanel(p) : '';
        const revisi = p.bisaRevisi ? `<button class="pb-btn pb-btn-primary" onclick="permintaanBarang.perbaiki('${this._e(p.id)}')"><i class="fas fa-pen"></i> Perbaiki &amp; Ajukan Ulang</button>` : '';
        const hapus = p.bisaHapus ? `<button class="pb-btn pb-btn-danger" onclick="permintaanBarang.hapus('${this._e(p.id)}')"><i class="fas fa-trash"></i> Hapus</button>` : '';
        ov.innerHTML = `<div class="pb-modal">
            <div class="pb-modal-head"><div><b>${this._e(p.nomor)}</b><small>${this._e(this._tglIndo(p.tanggal))}</small></div>
                ${this._statusChip(p.status)}
                <button class="pb-icon-btn" onclick="permintaanBarang._closeDetail()" title="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="pb-modal-body">
                <div class="pb-kv"><span>Pemohon</span><b>${this._e(p.pemohonNama)}</b>
                    <span>Jabatan</span><b>${this._e(p.pemohonJabatan || '-')}</b>
                    <span>Bagian</span><b>${this._e([p.bagian, p.subBidang, p.wilayah].filter(Boolean).join(' / ') || '-')}</b></div>
                <h4 class="pb-h4">Daftar Barang</h4>
                <div class="pb-scroll"><table class="pb-table"><thead><tr><th>No</th><th>Nama Barang</th><th>Jumlah</th><th>Satuan</th><th>Keterangan</th></tr></thead><tbody>${items}</tbody></table></div>
                ${this._riwayatBox((p.riwayat || []).map(r => ({ ...r })), 'Riwayat permintaan barang serupa sebelumnya:')}
                <h4 class="pb-h4">Keperluan</h4>
                <div class="pb-box">${this._e(p.keperluan).replace(/\n/g, '<br>')}</div>
                ${catatan}
                ${rwy}
                <h4 class="pb-h4">Persetujuan</h4>
                ${this._stepTable(p)}
                ${aksi}
            </div>
            <div class="pb-modal-foot">${hapus}${revisi}<button class="pb-btn pb-btn-primary" onclick="permintaanBarang.cetak()"><i class="fas fa-print"></i> Cetak Form</button></div>
        </div>`;
        if (p.bisaApprove) this._initSignature();
    },

    _approvePanel(p) {
        let pilih = '';
        if (p.langkahAktif === 'direktur') {
            const opts = this.ctx.pengadaanList.map(x => `<option value="${this._e(x.id)}">${this._e(x.nama)}${x.jabatan ? ' - ' + this._e(x.jabatan) : ''}</option>`).join('');
            pilih = `<label class="pb-lbl">Tunjuk Pejabat Pengadaan</label>
                <select id="pb-pengadaan"><option value="">Semua Pejabat Pengadaan boleh menyetujui</option>${opts}</select>
                ${this.ctx.pengadaanList.length ? '' : '<p class="pb-note">Belum ada karyawan bertanda Pejabat Pengadaan (Edit Karyawan &gt; Kekaryawanan).</p>'}`;
        }
        return `<div class="pb-approve"><h4 class="pb-h4"><i class="fas fa-stamp"></i> Giliran Anda</h4>
            ${pilih}
            <label class="pb-lbl">Catatan <small>(wajib diisi jika menolak)</small></label>
            <textarea id="pb-catatan" rows="2" placeholder="Catatan atau alasan..."></textarea>
            <label class="pb-lbl">Tanda Tangan <small>(wajib jika menyetujui)</small></label>
            <div class="pb-sig-wrap"><canvas id="pb-sig"></canvas></div>
            <button type="button" class="pb-btn pb-btn-sm" onclick="permintaanBarang._clearSignature()"><i class="fas fa-eraser"></i> Hapus tanda tangan</button>
            <div class="pb-actions">
                <button type="button" class="pb-btn pb-btn-ok" id="pb-btn-setuju" onclick="permintaanBarang.putuskan('Disetujui')"><i class="fas fa-check"></i> Setujui</button>
                <button type="button" class="pb-btn pb-btn-danger" id="pb-btn-tolak" onclick="permintaanBarang.putuskan('Ditolak')"><i class="fas fa-xmark"></i> Tolak</button>
            </div></div>`;
    },

    // ── Tanda tangan (canvas) ──────────────────────────────
    _initSignature() {
        const cv = document.getElementById('pb-sig');
        if (!cv) return;
        const w = cv.parentElement.clientWidth || 320;
        const h = 150;
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
        const st = { drawing: false, dirty: false, last: null };
        this._sig = { cv, ctx, st };
        const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; };
        cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); st.drawing = true; st.last = pos(e); ctx.beginPath(); ctx.arc(st.last.x, st.last.y, 1, 0, 6.3); ctx.fill(); st.dirty = true; });
        cv.addEventListener('pointermove', e => { if (!st.drawing) return; e.preventDefault(); const p = pos(e); ctx.beginPath(); ctx.moveTo(st.last.x, st.last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); st.last = p; });
        const end = () => { st.drawing = false; };
        cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    },

    _clearSignature() {
        if (!this._sig) return;
        const { cv, ctx, st } = this._sig;
        ctx.clearRect(0, 0, cv.width, cv.height);
        st.dirty = false;
    },

    /** PNG transparan, diperkecil (lebar maks 360px) supaya ringan disimpan. */
    _exportSignature() {
        if (!this._sig || !this._sig.st.dirty) return '';
        const { cv } = this._sig;
        const scale = Math.min(1, 360 / cv.width);
        const out = document.createElement('canvas');
        out.width = Math.round(cv.width * scale); out.height = Math.round(cv.height * scale);
        out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
        return out.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    },

    async putuskan(keputusan) {
        const p = this.detail;
        const catatan = (document.getElementById('pb-catatan').value || '').trim();
        let ttd = '';
        if (keputusan === 'Disetujui') {
            ttd = this._exportSignature();
            if (!ttd) { toast.error('Tanda tangan wajib diisi sebelum menyetujui.'); return; }
        } else {
            if (!catatan) { toast.error('Isi alasan penolakan pada kolom catatan.'); return; }
            if (!confirm('Tolak permintaan ini?')) return;
        }
        const b1 = document.getElementById('pb-btn-setuju'), b2 = document.getElementById('pb-btn-tolak');
        [b1, b2].forEach(b => { if (b) b.disabled = true; });
        try {
            const sel = document.getElementById('pb-pengadaan');
            const res = await api.approvePermintaanBarang({
                id: p.id, keputusan, catatan, ttd, pengadaanDitunjuk: sel ? sel.value : ''
            });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memproses');
            toast.success(res.message || 'Berhasil');
            this._closeDetail();
            await this.init();
        } catch (e) {
            toast.error(e.message || 'Gagal memproses');
            [b1, b2].forEach(b => { if (b) b.disabled = false; });
        }
    },

    /** Buka form dalam mode perbaikan untuk permintaan yang ditolak (nomor tetap). */
    async perbaiki(id) {
        let p = (this.list.saya || []).filter(x => x.id === String(id))[0];
        if (!p || p.status !== 'Ditolak') { toast.error('Hanya permintaan yang ditolak yang bisa diperbaiki.'); return; }
        if (!p.subBidang && !p.wilayah) {
            // daftar ringkas tidak memuat sub bidang/wilayah - ambil dari detail
            try {
                const r = await api.getDetailPermintaanBarang(id);
                if (r && r.success) p = { ...p, subBidang: r.data.subBidang, wilayah: r.data.wilayah, catatan: r.data.catatan };
            } catch (e) { /* lanjut dengan data ringkas */ }
        }
        this._closeDetail();
        this.editing = { ...p, subBidang: p.subBidang || '', wilayah: p.wilayah || '', items: p.items || [] };
        this.tab = 'baru';
        this.render();
        this._initForm();
        const pc = document.querySelector('.page-content');
        if (pc) pc.scrollTop = 0;
    },

    async hapus(id) {
        if (!confirm('Hapus permintaan ini? Tindakan ini tidak bisa dibatalkan.')) return;
        try {
            const res = await api.hapusPermintaanBarang(id);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menghapus');
            toast.success(res.message || 'Terhapus');
            this._closeDetail();
            await this.init();
        } catch (e) {
            toast.error(e.message || 'Gagal menghapus');
        }
    },

    // ── Cetak ──────────────────────────────────────────────
    cetak() {
        const p = this.detail;
        if (!p) return;
        const e = s => this._e(s);
        const kop = new URL('assets/kop-surat.jpeg', location.href).href;

        const items = p.items.map((it, i) => `<tr>
            <td class="c">${i + 1}</td><td>${e(it.nama)}</td><td>${e(it.spesifikasi || '')}</td>
            <td class="c">${e(it.jumlah)}</td><td class="c">${e(it.satuan)}</td><td>${e(it.keterangan || '')}</td></tr>`).join('');

        const baris = [{ jabatan: 'Pemohon,<br>' + e(p.pemohonJabatan || ''), nama: e(p.pemohonNama), img: '', tgl: e(p.tanggal) }]
            .concat(p.steps.map(s => {
                const img = this.detailTtd[s.key];
                let nama = e(s.nama);
                let jab = e(s.jabatan);
                if (s.tipe === 'asmen' || s.tipe === 'manajer_bidang') jab = 'Atasan Langsung,<br>' + jab;
                if (s.tipe === 'direktur') jab = 'Menyetujui: Direktur';
                if (s.tipe === 'pengadaan') {
                    jab = 'Pejabat Pelaksana<br>Pengadaan yang ditunjuk';
                    // Semua Pejabat Pengadaan ditampilkan, yang menyetujui diberi centang.
                    const selesai = s.status === 'Disetujui';
                    const daftar = (this.ctx.pengadaanList || []).map(x => ({ id: String(x.id), nama: x.nama }));
                    if (selesai && !daftar.some(x => x.id === String(s.userId))) daftar.push({ id: String(s.userId), nama: s.nama });
                    nama = daftar.length ? daftar.map(x => {
                        const ok = selesai && x.id === String(s.userId);
                        return `<div style="margin-bottom:6px">${ok ? '<span style="color:#16a34a;font-weight:700;margin-right:4px">&#10003;</span>' : '<span style="color:#6b7280;margin-right:4px">&#9675;</span>'}${e(x.nama)}</div>`;
                    }).join('') : '<span style="color:#666">(.....................)</span>';
                }
                return { jabatan: jab, nama: nama, img: img ? `<img src="data:image/png;base64,${img}">` : '', tgl: e(s.status === 'Disetujui' ? s.tanggal : '') };
            }));
        const rows = baris.map(b => `<tr><td>${b.jabatan}</td><td>${b.nama}</td><td class="ttd">${b.img}</td><td class="c">${b.tgl}</td></tr>`).join('');

        const w = window.open('', '_blank');
        if (!w) { toast.error('Popup diblokir browser. Izinkan popup untuk mencetak.'); return; }
        w.document.open();
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Form Permintaan - ${e(p.nomor)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11.5pt;padding:20px;color:#000}
.kop{width:100%;display:block;margin-bottom:8px}
h1{text-align:center;font-size:14pt;text-transform:uppercase;margin-bottom:4px}
.nomor{text-align:center;margin-bottom:16px}
.sec{font-weight:bold;margin:10px 0 6px}
.info{width:100%;border-collapse:collapse;margin-bottom:12px}
.info td{padding:2px 4px;vertical-align:top}.info td:first-child{width:170px}.info td:nth-child(2){width:10px}
table.t{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11pt}
table.t th,table.t td{border:1px solid #000;padding:5px 8px;vertical-align:top}
table.t th{background:#f0f0f0;text-align:center}
.c{text-align:center}
.box{border:1px solid #000;min-height:70px;padding:8px;margin-bottom:14px}
.ttd{height:58px;text-align:center;vertical-align:middle}.ttd img{max-height:52px;max-width:130px}
.bar{position:fixed;top:0;left:0;right:0;display:flex;gap:10px;justify-content:flex-end;padding:10px 20px;background:#fff;border-bottom:1px solid #ddd}
.bar button{padding:8px 18px;border:0;border-radius:8px;color:#fff;font-weight:600;cursor:pointer}
@media print{.bar,.sp{display:none!important}body{padding:8px 16px;font-size:10.5pt}tr{page-break-inside:avoid}}
</style></head><body>
<div class="bar"><button style="background:#6b7280" onclick="window.close()">Tutup</button><button style="background:#0d6efd" onclick="window.print()">Cetak</button></div>
<div class="sp" style="height:50px"></div>
<img class="kop" src="${kop}" alt="Kop">
<h1>Permintaan Pesanan Barang</h1>
<div class="nomor">Nomor : ${e(p.nomor)}</div>
<p class="sec">I.&nbsp;&nbsp;IDENTITAS PEMOHON</p>
<table class="info">
<tr><td>Nama Pemohon</td><td>:</td><td>${e(p.pemohonNama)}</td></tr>
<tr><td>Jabatan</td><td>:</td><td>${e(p.pemohonJabatan || '-')}</td></tr>
<tr><td>Unit/Bagian/Wilayah</td><td>:</td><td>${[p.bagian, p.subBidang, p.wilayah].filter(Boolean).map(e).join(' / ')}</td></tr>
<tr><td>Tanggal Permintaan</td><td>:</td><td>${e(this._tglIndo(p.tanggal))}</td></tr>
</table>
<p class="sec">II.&nbsp;&nbsp;DAFTAR BARANG YANG DIMINTA</p>
<table class="t"><thead><tr><th style="width:5%">No</th><th style="width:28%">Nama Barang</th><th style="width:22%">Spesifikasi/Merek</th><th style="width:10%">Jumlah</th><th style="width:10%">Satuan</th><th>Keterangan</th></tr></thead><tbody>${items}</tbody></table>
<p class="sec">III.&nbsp;&nbsp;ALASAN/URGENSI KEBUTUHAN:</p>
<div class="box">${e(p.keperluan).replace(/\n/g, '<br>')}</div>
<p class="sec">IV.&nbsp;&nbsp;PERSETUJUAN</p>
<table class="t"><thead><tr><th style="width:25%">Jabatan</th><th style="width:32%">Nama</th><th style="width:25%">Tanda Tangan</th><th style="width:18%">Tanggal</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script>
</body></html>`);
        w.document.close();
    }
};

function initPermintaanBarang() { permintaanBarang.init(); }
window.permintaanBarang = permintaanBarang;
window.initPermintaanBarang = initPermintaanBarang;
