/**
 * Portal Karyawan - Tukar Jadwal Jaga Operator
 * Backend: Tukarjadwal.gs
 *
 * Petugas operator mengajukan tukar jadwal jaga dengan petugas operator lain
 * di unit yang sama. Disetujui Manajer Operasi dan Jaringan (atau Admin) ->
 * jadwal di menu Jadwal Jaga Operator langsung berubah. Ditolak -> jadwal
 * tetap & pemohon/rekan mendapat notifikasi.
 */
const tukarJadwal = {
    ctx: null,      // { me, unit, isOperator, partners, isApprover, rekap, months, today }
    list: null,     // { saya, masuk, semua, menungguCount }
    tab: 'saya',
    error: '',
    _busy: false,
    _mySlots: [],
    _partnerSlots: [],

    BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    HARI: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],

    _e(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    _root() { return document.getElementById('tukar-jadwal-root'); },
    _$(id) { return document.getElementById(id); },
    _tgl(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
        if (!m) return String(v || '-');
        const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        return `${this.HARI[d.getDay()]}, ${parseInt(m[3], 10)} ${this.BULAN[parseInt(m[2], 10) - 1]} ${m[1]}`;
    },
    _slotText(date, label) { return `${this._tgl(date)} · ${label}`; },

    _chip(s) {
        const m = {
            Menunggu: ['wait', 'fa-hourglass-half'], Diproses: ['wait', 'fa-spinner'], Disetujui: ['ok', 'fa-circle-check'],
            Ditolak: ['no', 'fa-circle-xmark'], Dibatalkan: ['off', 'fa-ban']
        };
        const x = m[s] || ['wait', 'fa-clock'];
        return `<span class="tj-chip tj-chip-${x[0]}"><i class="fas ${x[1]}"></i> ${this._e(s)}</span>`;
    },

    // ── Init ───────────────────────────────────────────────
    async init() {
        const root = this._root();
        if (!root) return;
        if (!this.ctx) root.innerHTML = '<div class="tj-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';
        this.error = '';
        try {
            const [c, l] = await Promise.all([api.getTukarJadwalContext(), api.getTukarJadwalList()]);
            if (!c || !c.success) throw new Error((c && c.error) || 'Gagal memuat data pengguna');
            if (!l || !l.success) throw new Error((l && l.error) || 'Gagal memuat daftar pengajuan');
            this.ctx = c.data; this.list = l.data;
        } catch (e) {
            this.error = e.message || 'Gagal memuat data';
        }
        this.render();
    },

    async refresh() {
        try {
            const l = await api.getTukarJadwalList();
            if (l && l.success) this.list = l.data;
        } catch (e) { /* tampilan lama tetap dipakai */ }
        this.render();
    },

    // ── Tampilan ───────────────────────────────────────────
    render() {
        const root = this._root();
        if (!root) return;
        if (this.error) {
            root.innerHTML = `<div class="tj-empty"><i class="fas fa-triangle-exclamation"></i><p>${this._e(this.error)}</p>
                <button type="button" class="tj-btn" onclick="tukarJadwal.init()"><i class="fas fa-rotate"></i> Coba lagi</button></div>`;
            return;
        }
        if (!this.ctx || !this.list) return;
        const c = this.ctx, l = this.list;
        const tabs = [['saya', 'fa-right-left', 'Pengajuan Saya', 0]];
        if (c.isApprover) tabs.push(['masuk', 'fa-clipboard-check', 'Perlu Persetujuan', l.menungguCount]);
        if (c.rekap) tabs.push(['semua', 'fa-table-list', 'Semua Pengajuan', 0]);
        if (!tabs.some(t => t[0] === this.tab)) this.tab = tabs[0][0];

        root.innerHTML = `
        <div class="tj-hero">
            <div class="tj-hero-ic"><i class="fas fa-right-left"></i></div>
            <div><h2>Tukar Jadwal Jaga</h2>
            <p>Ajukan tukar jadwal jaga dengan petugas operator lain di unit yang sama. Setelah disetujui Manajer Operasi dan Jaringan, jadwal langsung berubah.</p></div>
        </div>
        <div class="tj-tabs">${tabs.map(t => `
            <button type="button" class="tj-tab${this.tab === t[0] ? ' active' : ''}" onclick="tukarJadwal.setTab('${t[0]}')">
                <i class="fas ${t[1]}"></i> ${t[2]}${t[3] ? `<span class="tj-badge">${t[3]}</span>` : ''}</button>`).join('')}
        </div>
        <div>${this._tabHtml()}</div>`;
    },

    setTab(t) { this.tab = t; this.render(); },

    _tabHtml() {
        const l = this.list, c = this.ctx;
        if (this.tab === 'masuk') {
            const pend = l.masuk.filter(x => x.bisaAct), done = l.masuk.filter(x => !x.bisaAct);
            return (pend.length ? `<h3 class="tj-sec">Menunggu Anda <span>${pend.length}</span></h3><div class="tj-list">${pend.map(x => this._card(x)).join('')}</div>` :
                `<div class="tj-empty"><i class="fas fa-circle-check"></i><p>Tidak ada pengajuan yang menunggu persetujuan Anda.</p></div>`) +
                (done.length ? `<h3 class="tj-sec">Riwayat <span>${done.length}</span></h3><div class="tj-list">${done.map(x => this._card(x)).join('')}</div>` : '');
        }
        if (this.tab === 'semua') {
            return l.semua.length ? `<div class="tj-list">${l.semua.map(x => this._card(x)).join('')}</div>` :
                '<div class="tj-empty"><i class="fas fa-folder-open"></i><p>Belum ada pengajuan tukar jadwal.</p></div>';
        }
        let head;
        if (c.isOperator) {
            head = `<button type="button" class="tj-btn tj-btn-primary tj-new" onclick="tukarJadwal.openForm()"><i class="fas fa-plus"></i> Ajukan Tukar Jadwal</button>`;
        } else {
            head = '<div class="tj-note"><i class="fas fa-circle-info"></i> Pengajuan tukar jadwal hanya untuk petugas operator. Anda tetap bisa melihat pengajuan yang melibatkan Anda di sini.</div>';
        }
        return head + (l.saya.length ? `<div class="tj-list">${l.saya.map(x => this._card(x)).join('')}</div>` :
            '<div class="tj-empty"><i class="fas fa-right-left"></i><p>Belum ada pengajuan tukar jadwal.</p></div>');
    },

    _card(x) {
        const peran = x.sebagai === 'rekan' ? '<span class="tj-role">Anda sebagai rekan tukar</span>' : '';
        return `<div class="tj-card tj-s-${x.status === 'Disetujui' ? 'ok' : (x.status === 'Ditolak' || x.status === 'Dibatalkan' ? 'no' : 'wait')}">
            <div class="tj-card-top">
                <div><b>${this._e(x.unit)}</b>${peran}</div>
                ${this._chip(x.status)}
            </div>
            <div class="tj-swap">
                <div class="tj-side"><small>${this._e(x.userNama)} menjaga</small><b>${this._e(this._slotText(x.dateA, x.labelA))}</b></div>
                <div class="tj-arrow"><i class="fas fa-right-left"></i></div>
                <div class="tj-side"><small>${this._e(x.partnerNama)} menjaga</small><b>${this._e(this._slotText(x.dateB, x.labelB))}</b></div>
            </div>
            <div class="tj-info"><i class="fas fa-comment"></i> ${this._e(x.alasan)}</div>
            ${x.status === 'Disetujui' ? `<div class="tj-res tj-res-ok"><i class="fas fa-circle-check"></i> Disetujui ${this._e(x.approverNama)} - jadwal sudah berubah.</div>` : ''}
            ${x.status === 'Ditolak' ? `<div class="tj-res tj-res-no"><i class="fas fa-circle-xmark"></i> Ditolak ${this._e(x.approverNama)}${x.catatan ? ' - ' + this._e(x.catatan) : ''}. Jadwal tidak berubah.</div>` : ''}
            ${x.status === 'Menunggu' ? '<div class="tj-res tj-res-wait"><i class="fas fa-hourglass-half"></i> Menunggu persetujuan Manajer Operasi dan Jaringan.</div>' : ''}
            <div class="tj-actions">
                ${x.bisaAct ? `<button type="button" class="tj-btn tj-btn-primary" onclick="tukarJadwal.openProses('${this._e(x.id)}')"><i class="fas fa-clipboard-check"></i> Buka & Proses</button>` : ''}
                ${x.bisaBatal ? `<button type="button" class="tj-btn tj-btn-danger" onclick="tukarJadwal.batal('${this._e(x.id)}', this)"><i class="fas fa-ban"></i> Batalkan</button>` : ''}
            </div>
        </div>`;
    },

    // ── Overlay ────────────────────────────────────────────
    _openModal(html) {
        this._closeModal();
        const ov = document.createElement('div');
        ov.className = 'tj-overlay';
        ov.id = 'tj-overlay';
        ov.innerHTML = `<div class="tj-modal" role="dialog">${html}</div>`;
        ov.addEventListener('mousedown', (e) => { if (e.target === ov && !this._busy) this._closeModal(); });
        document.body.appendChild(ov);
    },
    _closeModal() {
        const ov = this._$('tj-overlay');
        if (ov) ov.remove();
    },

    // ── Form ajukan ────────────────────────────────────────
    async openForm() {
        const c = this.ctx;
        this._mySlots = []; this._partnerSlots = [];
        this._openModal(`
            <div class="tj-mh"><h3><i class="fas fa-right-left"></i> Ajukan Tukar Jadwal</h3>
                <button type="button" class="tj-x" onclick="tukarJadwal._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tj-mb">
                <div class="tj-fg"><label>Unit</label><input type="text" value="${this._e(c.unit)}" disabled></div>
                <div class="tj-fg"><label>Jadwal jaga saya yang ditukar <span class="tj-req">*</span></label>
                    <select id="tj-slot-a"><option value="">Memuat jadwal Anda...</option></select></div>
                <div class="tj-fg"><label>Tukar dengan petugas <span class="tj-req">*</span></label>
                    <select id="tj-partner" onchange="tukarJadwal.pilihRekan()">
                        <option value="">-- Pilih petugas --</option>
                        ${c.partners.map(p => `<option value="${this._e(p.id)}">${this._e(p.nama)}</option>`).join('')}
                    </select></div>
                <div class="tj-fg"><label>Jadwal jaga rekan yang ditukar <span class="tj-req">*</span></label>
                    <select id="tj-slot-b" disabled><option value="">Pilih petugas dulu</option></select></div>
                <div class="tj-fg"><label>Alasan <span class="tj-req">*</span></label>
                    <textarea id="tj-alasan" rows="3" maxlength="500" placeholder="mis. Ada keperluan keluarga di tanggal tersebut"></textarea></div>
                <div class="tj-note"><i class="fas fa-circle-info"></i> Pengajuan menunggu persetujuan Manajer Operasi dan Jaringan. Jadwal baru berubah setelah disetujui.</div>
            </div>
            <div class="tj-mf">
                <button type="button" class="tj-btn" onclick="tukarJadwal._closeModal()">Batal</button>
                <button type="button" class="tj-btn tj-btn-primary" id="tj-submit" onclick="tukarJadwal.submit()"><i class="fas fa-paper-plane"></i> Kirim Pengajuan</button>
            </div>`);
        try {
            const r = await api.getTukarJadwalSlots(c.me.id);
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal memuat jadwal');
            this._mySlots = r.data.slots || [];
            const sel = this._$('tj-slot-a');
            if (!sel) return;
            sel.innerHTML = this._mySlots.length
                ? '<option value="">-- Pilih jadwal Anda --</option>' + this._mySlots.map((s, i) => `<option value="${i}">${this._e(this._slotText(s.date, s.label))}</option>`).join('')
                : '<option value="">Anda belum punya jadwal jaga mendatang</option>';
        } catch (e) {
            const sel = this._$('tj-slot-a');
            if (sel) sel.innerHTML = `<option value="">${this._e(e.message || 'Gagal memuat jadwal')}</option>`;
        }
    },

    async pilihRekan() {
        const pid = (this._$('tj-partner') || {}).value;
        const sel = this._$('tj-slot-b');
        if (!sel) return;
        this._partnerSlots = [];
        if (!pid) { sel.disabled = true; sel.innerHTML = '<option value="">Pilih petugas dulu</option>'; return; }
        sel.disabled = true; sel.innerHTML = '<option value="">Memuat jadwal rekan...</option>';
        try {
            const r = await api.getTukarJadwalSlots(pid);
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal memuat jadwal rekan');
            if ((this._$('tj-partner') || {}).value !== pid) return;
            this._partnerSlots = r.data.slots || [];
            sel.innerHTML = this._partnerSlots.length
                ? '<option value="">-- Pilih jadwal rekan --</option>' + this._partnerSlots.map((s, i) => `<option value="${i}">${this._e(this._slotText(s.date, s.label))}</option>`).join('')
                : '<option value="">Rekan belum punya jadwal jaga mendatang</option>';
            sel.disabled = !this._partnerSlots.length;
        } catch (e) {
            sel.innerHTML = `<option value="">${this._e(e.message || 'Gagal memuat jadwal rekan')}</option>`;
        }
    },

    async submit() {
        if (this._busy) return;
        const ia = (this._$('tj-slot-a') || {}).value, ib = (this._$('tj-slot-b') || {}).value;
        const pid = (this._$('tj-partner') || {}).value;
        const alasan = ((this._$('tj-alasan') || {}).value || '').trim();
        const a = this._mySlots[parseInt(ia, 10)], b = this._partnerSlots[parseInt(ib, 10)];
        if (!a) { toast.error('Pilih jadwal jaga Anda yang akan ditukar.'); return; }
        if (!pid) { toast.error('Pilih petugas yang diajak tukar.'); return; }
        if (!b) { toast.error('Pilih jadwal jaga rekan yang akan ditukar.'); return; }
        if (!alasan) { toast.error('Alasan wajib diisi.'); return; }
        const btn = this._$('tj-submit');
        this._busy = true;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...'; }
        try {
            const r = await api.ajukanTukarJadwal({ partnerId: pid, dateA: a.date, sessA: a.sess, dateB: b.date, sessB: b.sess, alasan });
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal mengirim pengajuan');
            toast.success(r.message || 'Pengajuan dikirim.');
            this._closeModal();
            await this.refresh();
        } catch (e) {
            toast.error(e.message || 'Gagal mengirim pengajuan');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Pengajuan'; }
        }
        this._busy = false;
    },

    // ── Batalkan ───────────────────────────────────────────
    async batal(id, btn) {
        if (this._busy || !confirm('Batalkan pengajuan tukar jadwal ini?')) return;
        this._busy = true;
        if (btn) btn.disabled = true;
        try {
            const r = await api.batalTukarJadwal(id);
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal membatalkan');
            toast.success(r.message || 'Pengajuan dibatalkan.');
            await this.refresh();
        } catch (e) {
            toast.error(e.message || 'Gagal membatalkan');
            if (btn) btn.disabled = false;
        }
        this._busy = false;
    },

    // ── Proses (approver) ──────────────────────────────────
    openProses(id) {
        const all = [].concat(this.list.masuk || [], this.list.semua || []);
        const x = all.filter(r => r.id === id)[0];
        if (!x) return;
        this._openModal(`
            <div class="tj-mh"><h3><i class="fas fa-clipboard-check"></i> Proses Pengajuan</h3>
                <button type="button" class="tj-x" onclick="tukarJadwal._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tj-mb">
                <div class="tj-swap">
                    <div class="tj-side"><small>${this._e(x.userNama)} menjaga</small><b>${this._e(this._slotText(x.dateA, x.labelA))}</b></div>
                    <div class="tj-arrow"><i class="fas fa-right-left"></i></div>
                    <div class="tj-side"><small>${this._e(x.partnerNama)} menjaga</small><b>${this._e(this._slotText(x.dateB, x.labelB))}</b></div>
                </div>
                <div class="tj-info"><i class="fas fa-comment"></i> ${this._e(x.alasan)}</div>
                <div class="tj-fg"><label>Catatan (opsional, ikut dikirim di notifikasi)</label>
                    <textarea id="tj-catatan" rows="3" maxlength="500" placeholder="mis. Alasan penolakan"></textarea></div>
                <div class="tj-note"><i class="fas fa-circle-info"></i> Jika disetujui, nama petugas di menu Jadwal Jaga Operator langsung saling bertukar. Jika ditolak, jadwal tidak berubah dan pemohon mendapat notifikasi.</div>
            </div>
            <div class="tj-mf">
                <button type="button" class="tj-btn tj-btn-danger" id="tj-tolak" onclick="tukarJadwal.proses('${this._e(x.id)}','tolak')"><i class="fas fa-xmark"></i> Tolak</button>
                <button type="button" class="tj-btn tj-btn-ok" id="tj-setuju" onclick="tukarJadwal.proses('${this._e(x.id)}','setuju')"><i class="fas fa-check"></i> Setujui</button>
            </div>`);
    },

    async proses(id, tindakan) {
        if (this._busy) return;
        const catatan = ((this._$('tj-catatan') || {}).value || '').trim();
        this._busy = true;
        ['tj-tolak', 'tj-setuju'].forEach(k => { const b = this._$(k); if (b) b.disabled = true; });
        try {
            const r = await api.prosesTukarJadwal({ id, tindakan, catatan });
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal memproses');
            toast.success(r.message || 'Selesai.');
            this._closeModal();
            await this.refresh();
        } catch (e) {
            toast.error(e.message || 'Gagal memproses');
            ['tj-tolak', 'tj-setuju'].forEach(k => { const b = this._$(k); if (b) b.disabled = false; });
        }
        this._busy = false;
    }
};

window.tukarJadwal = tukarJadwal;
window.initTukarJadwal = () => tukarJadwal.init();
