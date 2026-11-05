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

    // Tab "Jadwal Jaga" (BACA SAJA, khusus petugas operator) - lihat bagian "Jadwal Jaga" di bawah.
    jjv: null,          // data dari getJadwalJagaView
    jjvYear: 0,
    jjvMonth: 0,
    _jjvOnlyMe: false,
    _jjvAt: 0,
    _jjvErr: '',
    _jjvSeq: 0,
    _jjvTimer: null,
    _jjvVisBound: false,
    _tabInit: false,

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
            // Petugas operator langsung melihat tab "Jadwal Jaga" saat halaman dibuka.
            if (this.ctx.isOperator && !this._tabInit) { this.tab = 'jadwal'; this._tabInit = true; }
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
        const tabs = [];
        if (c.isOperator) tabs.push(['jadwal', 'fa-calendar-days', 'Jadwal Jaga', 0]);
        tabs.push(['saya', 'fa-right-left', 'Pengajuan Saya', 0]);
        if (c.isApprover) tabs.push(['masuk', 'fa-clipboard-check', 'Perlu Persetujuan', l.menungguCount]);
        if (c.rekap) tabs.push(['semua', 'fa-table-list', 'Semua Pengajuan', 0]);
        if (!tabs.some(t => t[0] === this.tab)) this.tab = tabs[0][0];

        root.innerHTML = `
        <div class="tj-hero">
            <div class="tj-hero-ic"><i class="fas fa-right-left"></i></div>
            <div><h2>Jadwal Jaga</h2>
            <p>${this._heroDesc()}</p></div>
        </div>
        <div class="tj-tabs">${tabs.map(t => `
            <button type="button" class="tj-tab${this.tab === t[0] ? ' active' : ''}" onclick="tukarJadwal.setTab('${t[0]}')">
                <i class="fas ${t[1]}"></i> ${t[2]}${t[3] ? `<span class="tj-badge">${t[3]}</span>` : ''}</button>`).join('')}
        </div>
        <div>${this._tabHtml()}</div>`;
        if (this.tab === 'jadwal') this._jjvEnsure();
    },

    setTab(t) { this.tab = t; this.render(); },

    _tabHtml() {
        const l = this.list, c = this.ctx;
        if (this.tab === 'jadwal') return '<div id="tj-jjv">' + this._jjvHtml() + '</div>';
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
            ${x.status === 'Disetujui' ? `<div class="tj-res tj-res-ok"><i class="fas fa-circle-check"></i> <span>Disetujui ${this._e(x.approverNama)} - jadwal sudah berubah.${x.catatan ? `<br><b>Catatan:</b> ${this._e(x.catatan)}` : ''}</span></div>` : ''}
            ${x.status === 'Ditolak' ? `<div class="tj-res tj-res-no"><i class="fas fa-circle-xmark"></i> <span>Ditolak ${this._e(x.approverNama)}. Jadwal tidak berubah.${x.catatan ? `<br><b>Catatan:</b> ${this._e(x.catatan)}` : ''}</span></div>` : ''}
            ${x.status === 'Menunggu' ? '<div class="tj-res tj-res-wait"><i class="fas fa-hourglass-half"></i> Menunggu persetujuan Manajer Operasi dan Jaringan.</div>' : ''}
            <div class="tj-actions">
                ${x.bisaAct ? `<button type="button" class="tj-btn tj-btn-primary" onclick="tukarJadwal.openProses('${this._e(x.id)}')"><i class="fas fa-clipboard-check"></i> Buka & Proses</button>` : ''}
                ${x.bisaBatal ? `<button type="button" class="tj-btn tj-btn-danger" onclick="tukarJadwal.batal('${this._e(x.id)}', this)"><i class="fas fa-ban"></i> Batalkan</button>` : ''}
            </div>
        </div>`;
    },


    _heroDesc() {
        if (this.tab === 'jadwal') {
            return 'Lihat jadwal jaga unit Anda. Hanya untuk dilihat - jadwal otomatis ikut berubah kalau admin atau pemegang jadwal jaga mengubahnya.';
        }
        return 'Ajukan tukar jadwal jaga dengan petugas operator lain di unit yang sama. Setelah disetujui Manajer Operasi dan Jaringan, jadwal langsung berubah.';
    },

    // ── Jadwal Jaga (BACA SAJA) ────────────────────────────
    // Petugas operator melihat jadwal jaga unitnya (diatur admin / pemegang Jadwal Jaga Operator).
    // Tidak ada tombol ubah/simpan. Data dimuat ulang saat tab dibuka, ganti bulan, tombol
    // "Muat ulang", tab kembali aktif, dan otomatis tiap 2 menit selama tab ini terbuka.
    _jjvPeriod() {
        if (!this.jjvYear) {
            const m = /^(\d{4})-(\d{2})/.exec(String((this.ctx && this.ctx.today) || ''));
            const now = new Date();
            this.jjvYear = m ? parseInt(m[1], 10) : now.getFullYear();
            this.jjvMonth = m ? parseInt(m[2], 10) : now.getMonth() + 1;
        }
        return { y: this.jjvYear, m: this.jjvMonth };
    },

    _jjvEnsure() {
        if (!this.jjv || (Date.now() - this._jjvAt) > 20000) this._jjvLoad(!!this.jjv);
        this._jjvStartAuto();
    },

    async _jjvLoad(silent) {
        const p = this._jjvPeriod();
        const seq = ++this._jjvSeq;
        if (!silent) { this._jjvErr = ''; this._jjvPaint(); }
        let ok = false;
        try {
            const r = await api.request('getJadwalJagaView', { year: p.y, month: p.m, ...api._pbAuth() });
            if (!r || !r.success) throw new Error((r && r.error) || 'Gagal memuat jadwal jaga');
            if (seq !== this._jjvSeq) return false; // sudah ada permintaan yang lebih baru (mis. ganti bulan)
            this.jjv = r.data; this._jjvErr = ''; this._jjvAt = Date.now(); ok = true;
        } catch (e) {
            if (seq !== this._jjvSeq) return false;
            if (!silent || !this.jjv) this._jjvErr = e.message || 'Gagal memuat jadwal jaga';
        }
        this._jjvPaint();
        return ok;
    },

    _jjvPaint() {
        const el = this._$('tj-jjv');
        if (el && this.tab === 'jadwal') el.innerHTML = this._jjvHtml();
    },

    _jjvStartAuto() {
        if (this._jjvTimer) return;
        const visible = () => { const r = this._root(); return !!r && r.offsetParent !== null && this.tab === 'jadwal' && !document.hidden; };
        this._jjvTimer = setInterval(() => { if (visible()) this._jjvLoad(true); }, 120000);
        if (!this._jjvVisBound) {
            this._jjvVisBound = true;
            document.addEventListener('visibilitychange', () => {
                if (visible() && (Date.now() - this._jjvAt) > 20000) this._jjvLoad(true);
            });
        }
    },

    _jjvShift(delta) {
        const p = this._jjvPeriod();
        let m = p.m + delta, y = p.y;
        if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
        this.jjvYear = y; this.jjvMonth = m; this.jjv = null;
        this._jjvLoad(false);
    },

    _jjvThisMonth() {
        this.jjvYear = 0; this.jjv = null;
        this._jjvLoad(false);
    },

    async _jjvManual() {
        const ok = await this._jjvLoad(true);
        if (ok && typeof toast !== 'undefined') toast.success('Jadwal diperbarui');
        else if (!ok && this._jjvErr && typeof toast !== 'undefined') toast.error(this._jjvErr);
    },

    _jjvToggleMine(v) { this._jjvOnlyMe = !!v; this._jjvPaint(); },

    _jjvHtml() {
        const p = this._jjvPeriod();
        const d = this.jjv;
        const bar = `
        <div class="tj-jjv-bar">
            <div class="tj-jjv-nav">
                <button type="button" class="tj-btn" onclick="tukarJadwal._jjvShift(-1)" aria-label="Bulan sebelumnya"><i class="fas fa-chevron-left"></i></button>
                <b>${this.BULAN[p.m - 1]} ${p.y}</b>
                <button type="button" class="tj-btn" onclick="tukarJadwal._jjvShift(1)" aria-label="Bulan berikutnya"><i class="fas fa-chevron-right"></i></button>
                <button type="button" class="tj-btn" onclick="tukarJadwal._jjvThisMonth()">Bulan ini</button>
            </div>
            <div class="tj-jjv-tools">
                <label class="tj-jjv-chk"><input type="checkbox" ${this._jjvOnlyMe ? 'checked' : ''} onchange="tukarJadwal._jjvToggleMine(this.checked)"> Hanya jadwal saya</label>
                <button type="button" class="tj-btn" onclick="tukarJadwal._jjvManual()"><i class="fas fa-rotate"></i> Muat ulang</button>
            </div>
        </div>`;

        if (!d) {
            if (this._jjvErr) {
                return bar + `<div class="tj-empty"><i class="fas fa-triangle-exclamation"></i><p>${this._e(this._jjvErr)}</p>
                    <button type="button" class="tj-btn" onclick="tukarJadwal._jjvLoad(false)"><i class="fas fa-rotate"></i> Coba lagi</button></div>`;
            }
            return bar + '<div class="tj-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat jadwal jaga...</p></div>';
        }

        const upd = new Date(this._jjvAt);
        const updTxt = ('0' + upd.getHours()).slice(-2) + '.' + ('0' + upd.getMinutes()).slice(-2);
        const note = `<div class="tj-note"><i class="fas fa-circle-info"></i>
            <span>Jadwal jaga <b>${this._e(d.unit)}</b>${this._jjvErr ? ' <b style="color:#B45309">(gagal memperbarui, menampilkan data terakhir)</b>' : ''}. Hanya untuk dilihat, tidak bisa diubah dari sini. Terakhir dimuat ${updTxt}.</span></div>`;

        if (!d.hasRoster) {
            return bar + note + `<div class="tj-empty"><i class="fas fa-calendar-xmark"></i>
                <p>Jadwal jaga ${this.BULAN[d.month - 1]} ${d.year} untuk unit ${this._e(d.unit)} belum diatur admin.</p></div>`;
        }

        const me = String(d.meId);
        const name = (id) => (d.people[id] && d.people[id].nama) ? d.people[id].nama : 'Petugas lain';
        const chips = (ids) => ids.length
            ? ids.map(id => `<span class="tj-jjv-chip${id === me ? ' me' : ''}">${this._e(name(id))}</span>`).join('')
            : '<span class="tj-jjv-none">-</span>';
        const cols = d.sessions || [];
        const useSess = cols.length > 0;
        const tp = String(d.today || '').split('-');
        const isTodayMonth = parseInt(tp[0], 10) === d.year && parseInt(tp[1], 10) === d.month;
        const todayNum = isTodayMonth ? parseInt(tp[2], 10) : 0;

        let mineDays = 0;
        let rows = '';
        for (let n = 1; n <= d.daysInMonth; n++) {
            const day = d.days[String(n)] || { sessions: {}, petugas: [] };
            const cells = useSess ? cols.map(c => day.sessions[c.key] || []) : [day.petugas || []];
            const mine = cells.some(ids => ids.indexOf(me) !== -1);
            if (mine) mineDays++;
            if (this._jjvOnlyMe && !mine) continue;
            const dow = new Date(Date.UTC(d.year, d.month - 1, n)).getUTCDay();
            const cls = 'tj-jjv-row' + (n === todayNum ? ' today' : '') + (dow === 0 ? ' sun' : '') + (mine ? ' mine' : '');
            rows += `<tr class="${cls}"><td class="tj-jjv-tgl">${n}</td><td class="tj-jjv-hari">${this.HARI[dow]}${n === todayNum ? '<small>Hari ini</small>' : ''}</td>` +
                cells.map(ids => `<td>${chips(ids)}</td>`).join('') + '</tr>';
        }
        if (!rows) rows = `<tr><td colspan="${2 + (useSess ? cols.length : 1)}" class="tj-jjv-empty">Anda tidak terjadwal jaga di bulan ini.</td></tr>`;

        const head = '<th>Tgl</th><th>Hari</th>' + (useSess
            ? cols.map(c => `<th>${this._e(c.label)}${c.time ? `<small>${this._e(c.time)}</small>` : ''}</th>`).join('')
            : '<th>Petugas</th>');

        return bar + note +
            `<div class="tj-jjv-sum"><i class="fas fa-user-check"></i> Anda terjadwal jaga <b>${mineDays} hari</b> di ${this.BULAN[d.month - 1]} ${d.year}. Nama Anda ditandai hijau.</div>` +
            `<div class="tj-jjv-wrap"><table class="tj-jjv"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
    // Daftar <option> dikelompokkan per tanggal (optgroup), tiap tanggal menampilkan SEMUA sesi yang terisi.
    _slotOptions(slots, placeholder) {
        if (!slots.length) return '';
        const byDate = {};
        slots.forEach((s, i) => { (byDate[s.date] = byDate[s.date] || []).push([s, i]); });
        const opts = Object.keys(byDate).sort().map(d =>
            `<optgroup label="${this._e(this._tgl(d))}">${byDate[d].map(([s, i]) => `<option value="${i}">${this._e(this._tgl(d))} · ${this._e(s.label)}</option>`).join('')}</optgroup>`).join('');
        return (slots.length > 1 ? `<option value="">${placeholder}</option>` : '') + opts;
    },

    async openForm() {
        this._mySlots = []; this._partnerSlots = [];
        this._openModal(`
            <div class="tj-mh"><h3><i class="fas fa-right-left"></i> Ajukan Tukar Jadwal</h3>
                <button type="button" class="tj-x" onclick="tukarJadwal._closeModal()"><i class="fas fa-xmark"></i></button></div>
            <div class="tj-mb">
                <div class="tj-fg"><label>Unit</label><input type="text" value="${this._e(this.ctx.unit)}" disabled></div>
                <div class="tj-fg"><label>Jadwal jaga saya yang ditukar <span class="tj-req">*</span></label>
                    <select id="tj-slot-a" onchange="tukarJadwal.pilihJadwalSaya()"><option value="">Memuat jadwal Anda...</option></select></div>
                <div class="tj-fg"><label>Tukar dengan petugas <span class="tj-req">*</span></label>
                    <select id="tj-partner" onchange="tukarJadwal.pilihRekan()" disabled><option value="">Pilih jadwal Anda dulu</option></select></div>
                <div class="tj-fg"><label>Jadwal jaga rekan yang ditukar <span class="tj-req">*</span></label>
                    <select id="tj-slot-b" disabled><option value="">Pilih petugas dulu</option></select></div>
                <div class="tj-fg"><label>Alasan <span class="tj-req">*</span></label>
                    <textarea id="tj-alasan" rows="3" maxlength="500" placeholder="mis. Ada keperluan keluarga di tanggal tersebut"></textarea></div>
                <div class="tj-note"><i class="fas fa-circle-info"></i> Hanya jadwal hari ini sampai 2 hari ke depan yang bisa ditukar. Pengajuan menunggu persetujuan Manajer Operasi dan Jaringan; jadwal baru berubah setelah disetujui.</div>
            </div>
            <div class="tj-mf">
                <button type="button" class="tj-btn" onclick="tukarJadwal._closeModal()">Batal</button>
                <button type="button" class="tj-btn tj-btn-primary" id="tj-submit" onclick="tukarJadwal.submit()"><i class="fas fa-paper-plane"></i> Kirim Pengajuan</button>
            </div>`);
        const sel = this._$('tj-slot-a');
        try {
            // Muat ulang konteks supaya jadwal & daftar petugas selalu terbaru.
            const c = await api.getTukarJadwalContext();
            if (!c || !c.success) throw new Error((c && c.error) || 'Gagal memuat jadwal');
            this.ctx = c.data;
            this._mySlots = c.data.mySlots || [];
            if (!sel) return;
            sel.innerHTML = this._mySlots.length
                ? this._slotOptions(this._mySlots, '-- Pilih jadwal Anda --')
                : '<option value="">Anda tidak punya jadwal jaga hari ini s/d 2 hari ke depan</option>';
            if (this._mySlots.length === 1) this.pilihJadwalSaya();
        } catch (e) {
            if (sel) sel.innerHTML = `<option value="">${this._e(e.message || 'Gagal memuat jadwal')}</option>`;
        }
    },

    _sama(a, b) { return a.date === b.date && a.sess === b.sess; },

    // Setelah jadwal saya dipilih: tampilkan hanya petugas yang punya jadwal yang BISA ditukar
    // (bukan sesi yang sama dengan jadwal saya, dan bukan slot yang sudah saya isi sendiri).
    pilihJadwalSaya() {
        const mine = this._mySlots[parseInt((this._$('tj-slot-a') || {}).value, 10)];
        const psel = this._$('tj-partner'), bsel = this._$('tj-slot-b');
        if (!psel || !bsel) return;
        this._partnerSlots = [];
        bsel.disabled = true; bsel.innerHTML = '<option value="">Pilih petugas dulu</option>';
        if (!mine) { psel.disabled = true; psel.innerHTML = '<option value="">Pilih jadwal Anda dulu</option>'; return; }
        this._eligible = (this.ctx.partners || []).map(p => ({
            id: p.id, nama: p.nama,
            slots: (p.slots || []).filter(s => !this._sama(s, mine) && !this._mySlots.some(m => this._sama(m, s)))
        })).filter(p => p.slots.length);
        psel.innerHTML = this._eligible.length
            ? '<option value="">-- Pilih petugas --</option>' + this._eligible.map(p => `<option value="${this._e(p.id)}">${this._e(p.nama)}</option>`).join('')
            : '<option value="">Tidak ada petugas lain yang bisa ditukar</option>';
        psel.disabled = !this._eligible.length;
    },

    pilihRekan() {
        const pid = (this._$('tj-partner') || {}).value;
        const sel = this._$('tj-slot-b');
        if (!sel) return;
        const p = (this._eligible || []).filter(x => x.id === pid)[0];
        this._partnerSlots = p ? p.slots : [];
        if (!p) { sel.disabled = true; sel.innerHTML = '<option value="">Pilih petugas dulu</option>'; return; }
        sel.innerHTML = this._slotOptions(this._partnerSlots, '-- Pilih jadwal rekan --');
        sel.disabled = false;
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
