/**
 * Portal Karyawan - DP3 (Daftar Penilaian Pelaksanaan Pekerjaan)
 * PT. Tirta Agung Amuntai
 *
 * Menu "DP3" untuk SEMUA karyawan, tampilannya beda per jabatan:
 *   - Direktur : menilai Manajer.
 *   - Manajer  : menilai Asmen (se-Bagian) + melihat hasil penilaian dirinya.
 *   - Asmen    : menilai Staff + melihat hasil penilaian dirinya.
 *   - Staff    : HANYA melihat/mencetak hasil penilaian untuk dirinya (tidak menilai).
 *
 * Siapa yang boleh dinilai ditentukan di backend (Dp3.gs - getDp3Data /
 * saveDp3Data), bukan di sini; frontend hanya menampilkan apa yang dikirim.
 *
 * Cetak: 2 jenis lembar, mengikuti format DP3.xlsx -
 *   1. "Daftar Nilai" (A4 portrait)
 *   2. "DP3" (Folio landscape, 2 halaman)
 */
const dp3 = {

    CRITERIA: [
        { key: 'kesetiaan',     label: 'Kesetiaan',       dp3Label: 'a. Kesetiaan' },
        { key: 'prestasiKerja', label: 'Prestasi Kerja',  dp3Label: 'b. Prestasi Kerja' },
        { key: 'tanggungJawab', label: 'Tanggung Jawab',  dp3Label: 'c. Tanggung Jawab' },
        { key: 'ketaatan',      label: 'Ketaatan',        dp3Label: 'd. Ketaatan' },
        { key: 'kejujuran',     label: 'Kejujuran',       dp3Label: 'e. Kejujuran' },
        { key: 'kerjasama',     label: 'Kerjasama',       dp3Label: 'f. Kerja sama' },
        { key: 'prakarsa',      label: 'Prakarsa',        dp3Label: 'g. Prakarsa' },
        { key: 'kepemimpinan',  label: 'Kepemimpinan',    dp3Label: 'h. Kepemimpinan' }
    ],

    state: { tahun: null, data: null, tab: 'menilai', loading: false, error: '', editingId: null, saving: false },
    _printRecord: null,

    // ── Util ────────────────────────────────────────────────────
    _e(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    _sebutan(n) {
        n = Number(n);
        if (isNaN(n) || n < 1) return '';
        if (n >= 91) return 'Amat Baik';
        if (n >= 76) return 'Baik';
        if (n >= 61) return 'Cukup';
        if (n >= 51) return 'Sedang';
        return 'Kurang';
    },

    _chipClass(sebutan) {
        return String(sebutan || '').toLowerCase().replace(/\s+/g, '-');
    },

    _fmt(n) {
        n = Number(n);
        if (isNaN(n)) return '';
        return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
    },

    _initials(nama) {
        const parts = String(nama || '?').trim().split(/\s+/);
        return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
    },

    _defaultTahun() {
        // Penilaian tahun lalu biasanya diisi di awal tahun berikutnya (Jan-Mar)
        const now = new Date();
        return now.getMonth() <= 2 ? now.getFullYear() - 1 : now.getFullYear();
    },

    _myEmployeeId() {
        const u = auth.getCurrentUser() || {};
        return u.employeeId || u.id;
    },

    _root() { return document.getElementById('dp3-root'); },

    // ── Muat & tampilkan ────────────────────────────────────────
    async init() {
        if (!this.state.tahun) this.state.tahun = this._defaultTahun();
        await this.load();
    },

    async load() {
        this.state.loading = true;
        this.state.error = '';
        this.render();
        try {
            const res = await api.getDp3Data(this._myEmployeeId(), this.state.tahun);
            if (!res || !res.success) {
                this.state.data = null;
                this.state.error = (res && (res.userMessage || res.error)) || 'Gagal memuat data DP3';
            } else {
                this.state.data = res.data;
                const d = res.data;
                // Pastikan tab yang aktif valid untuk role ini
                if (!d.canAssess) this.state.tab = 'saya';
                else if (this.state.tab === 'saya' && !d.canBeAssessed) this.state.tab = 'menilai';
            }
        } catch (err) {
            console.error('Gagal memuat DP3:', err);
            this.state.data = null;
            this.state.error = 'Terjadi kesalahan saat memuat data DP3';
        }
        this.state.loading = false;
        this.render();
    },

    async changeTahun(v) {
        this.state.tahun = parseInt(v, 10);
        await this.load();
    },

    setTab(tab) {
        this.state.tab = tab;
        this.render();
    },

    render() {
        const root = this._root();
        if (!root) return;
        const s = this.state;
        const d = s.data;

        const thisYear = new Date().getFullYear();
        const years = [];
        for (let y = thisYear; y >= thisYear - 5; y--) years.push(y);
        if (s.tahun && years.indexOf(s.tahun) === -1) years.push(s.tahun);

        let body = '';
        if (s.loading && !d) {
            body = `<div class="dp3-card dp3-empty"><i class="fas fa-spinner fa-spin"></i>Memuat data DP3...</div>`;
        } else if (s.error) {
            body = `<div class="dp3-card dp3-empty"><i class="fas fa-circle-exclamation"></i>${this._e(s.error)}</div>`;
        } else if (d) {
            const pending = d.subordinates.filter(x => !x.record).length;
            let tabs = '';
            if (d.canAssess) {
                tabs = `
                <div class="dp3-tabs">
                    <button class="dp3-tab ${s.tab === 'menilai' ? 'active' : ''}" onclick="dp3.setTab('menilai')">
                        <i class="fas fa-user-pen"></i> Penilaian Bawahan
                        ${pending ? `<span class="dp3-badge">${pending}</span>` : ''}
                    </button>
                    ${d.canBeAssessed ? `
                    <button class="dp3-tab ${s.tab === 'saya' ? 'active' : ''}" onclick="dp3.setTab('saya')">
                        <i class="fas fa-award"></i> Hasil Penilaian Saya
                    </button>` : ''}
                </div>`;
            }
            body = tabs + (s.tab === 'menilai' && d.canAssess ? this._renderBawahan(d) : this._renderHasilSaya(d));
        }

        root.innerHTML = `
            <div class="dp3-container">
                <div class="dp3-header">
                    <div>
                        <h2>DP3</h2>
                        <p>Daftar Penilaian Pelaksanaan Pekerjaan${d && d.canAssess ? ' &mdash; ' + this._roleHint(d.me.role) : ''}</p>
                    </div>
                    <label class="dp3-year">Tahun
                        <select class="select-filter" onchange="dp3.changeTahun(this.value)">
                            ${years.map(y => `<option value="${y}" ${y === s.tahun ? 'selected' : ''}>${y}</option>`).join('')}
                        </select>
                    </label>
                </div>
                ${body}
            </div>`;
    },

    _roleHint(role) {
        if (role === 'direktur') return 'Anda menilai Manajer';
        if (role === 'manajer') return 'Anda menilai Asmen di bagian Anda';
        if (role === 'asmen') return 'Anda menilai Staff';
        return '';
    },

    _renderBawahan(d) {
        const list = d.subordinates;
        if (!list.length) {
            return `<div class="dp3-card dp3-empty"><i class="fas fa-users-slash"></i>
                Belum ada karyawan yang perlu Anda nilai.<br>
                <span class="dp3-muted">${d.me.role === 'asmen'
                    ? 'Staff yang dinilai Asmen ditentukan Admin lewat "Asmen Penyetuju Izin/Cuti" di Data Karyawan.'
                    : 'Daftar ini mengikuti jabatan dan bagian di Data Karyawan.'}</span></div>`;
        }
        const done = list.filter(x => x.record).length;
        const rows = list.map(x => {
            const e = x.employee, r = x.record;
            const avatar = e.foto && /^https?:\/\//i.test(e.foto)
                ? `<img class="dp3-avatar" src="${this._e(e.foto)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;dp3-avatar&quot;>${this._e(this._initials(e.nama))}</div>'">`
                : `<div class="dp3-avatar">${this._e(this._initials(e.nama))}</div>`;
            return `
            <div class="dp3-row">
                ${avatar}
                <div class="dp3-who">
                    <b>${this._e(e.nama)}</b>
                    <span>${this._e(e.jabatan || '-')}${e.bagian ? ' &middot; ' + this._e(e.bagian) : ''}</span>
                </div>
                <div class="dp3-score">
                    ${r
                        ? `<b>${this._fmt(r.rataRata)}</b><span class="dp3-chip ${this._chipClass(r.sebutan)}">${this._e(r.sebutan)}</span>`
                        : `<span class="dp3-chip pending">Belum dinilai</span>`}
                </div>
                <div class="dp3-actions">
                    <button class="dp3-btn primary" onclick="dp3.openForm('${this._e(e.id)}')">
                        <i class="fas fa-pen"></i> ${r ? 'Ubah Nilai' : 'Beri Nilai'}
                    </button>
                    ${r ? `
                    <button class="dp3-btn" onclick="dp3.printNilai('${this._e(e.id)}')"><i class="fas fa-print"></i> Daftar Nilai</button>
                    <button class="dp3-btn" onclick="dp3.printDp3('${this._e(e.id)}')"><i class="fas fa-print"></i> DP3</button>` : ''}
                </div>
            </div>`;
        }).join('');

        return `
            <div class="dp3-stats">
                <div class="dp3-stat"><b>${list.length}</b><span>Total dinilai</span></div>
                <div class="dp3-stat"><b>${done}</b><span>Sudah dinilai</span></div>
                <div class="dp3-stat"><b>${list.length - done}</b><span>Belum dinilai</span></div>
            </div>
            <div class="dp3-list">${rows}</div>`;
    },

    _renderHasilSaya(d) {
        const r = d.myRecord;
        if (!r) {
            return `<div class="dp3-card dp3-empty"><i class="fas fa-hourglass-half"></i>
                Penilaian DP3 Anda untuk tahun ${d.tahun} belum diisi oleh atasan.<br>
                <span class="dp3-muted">Hasilnya akan tampil di sini setelah atasan Anda mengisinya.</span></div>`;
        }
        const rows = this.CRITERIA.map(c => `
            <tr><td>${this._e(c.label)}</td><td class="num">${this._fmt(r.nilai[c.key])}</td>
            <td class="num"><span class="dp3-chip ${this._chipClass(this._sebutan(r.nilai[c.key]))}">${this._e(this._sebutan(r.nilai[c.key]))}</span></td></tr>`).join('');
        return `
            <div class="dp3-card">
                <div class="dp3-result-head">
                    <div>
                        <h3>Hasil Penilaian DP3 Tahun ${d.tahun}</h3>
                        <div class="dp3-muted">Dinilai oleh ${this._e(r.penilai.nama || '-')}${r.penilai.jabatan ? ' &middot; ' + this._e(r.penilai.jabatan) : ''}</div>
                    </div>
                    <div class="dp3-big">
                        <b>${this._fmt(r.rataRata)}</b>
                        <span class="dp3-chip ${this._chipClass(r.sebutan)}">${this._e(r.sebutan)}</span>
                    </div>
                </div>
                <table class="dp3-table">
                    <thead><tr><th>Unsur yang dinilai</th><th class="num">Angka</th><th class="num">Sebutan</th></tr></thead>
                    <tbody>
                        ${rows}
                        <tr class="total"><td>Jumlah</td><td class="num">${this._fmt(r.jumlah)}</td><td></td></tr>
                        <tr class="total"><td>Nilai Rata-rata</td><td class="num">${this._fmt(r.rataRata)}</td><td class="num">${this._e(r.sebutan)}</td></tr>
                    </tbody>
                </table>
                <div class="dp3-actions" style="margin-top:14px;">
                    <button class="dp3-btn primary" onclick="dp3.printNilai('me')"><i class="fas fa-print"></i> Cetak Daftar Nilai</button>
                    <button class="dp3-btn primary" onclick="dp3.printDp3('me')"><i class="fas fa-print"></i> Cetak DP3</button>
                </div>
            </div>`;
    },

    // ── Form penilaian ──────────────────────────────────────────
    _ensureModal() {
        let m = document.getElementById('dp3-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'dp3-modal';
        m.className = 'dp3-modal-overlay';
        m.addEventListener('mousedown', (ev) => { if (ev.target === m) this.closeForm(); });
        document.body.appendChild(m);
        return m;
    },

    _findSub(empId) {
        const d = this.state.data;
        return d ? d.subordinates.find(x => String(x.employee.id) === String(empId)) : null;
    },

    openForm(empId) {
        const sub = this._findSub(empId);
        if (!sub) return;
        this.state.editingId = String(empId);
        const e = sub.employee, r = sub.record;
        const m = this._ensureModal();
        m.innerHTML = `
            <div class="dp3-modal" role="dialog" aria-modal="true">
                <div class="dp3-modal-head">
                    <h3>Penilaian DP3 ${this.state.tahun}</h3>
                    <button class="dp3-modal-close" onclick="dp3.closeForm()" aria-label="Tutup"><i class="fas fa-times"></i></button>
                </div>
                <div class="dp3-modal-body">
                    <b>${this._e(e.nama)}</b>
                    <div class="dp3-muted">${this._e(e.jabatan || '-')} &middot; NIK ${this._e(e.nik || '-')}</div>
                    <div style="margin-top:10px;">
                        ${this.CRITERIA.map(c => `
                        <div class="dp3-field">
                            <label for="dp3-in-${c.key}">${this._e(c.label)}</label>
                            <input type="number" inputmode="numeric" min="1" max="100" step="1"
                                   id="dp3-in-${c.key}" data-key="${c.key}" placeholder="1-100"
                                   value="${r ? this._e(r.nilai[c.key]) : ''}" oninput="dp3.recalc()">
                        </div>`).join('')}
                    </div>
                    <div class="dp3-summary">
                        <div><b id="dp3-sum-jumlah">0</b><span>Jumlah</span></div>
                        <div><b id="dp3-sum-rata">0</b><span>Rata-rata</span></div>
                        <div><b id="dp3-sum-sebutan">-</b><span>Sebutan</span></div>
                    </div>
                    <p class="dp3-hint">Isi angka bulat 1&ndash;100. Sebutan: 1&ndash;50 Kurang, 51&ndash;60 Sedang, 61&ndash;75 Cukup, 76&ndash;90 Baik, 91&ndash;100 Amat Baik.</p>
                    <div class="dp3-modal-foot">
                        <button class="dp3-btn" onclick="dp3.closeForm()">Batal</button>
                        <button class="dp3-btn primary" id="dp3-btn-save" onclick="dp3.save()"><i class="fas fa-check"></i> Simpan Penilaian</button>
                    </div>
                </div>
            </div>`;
        m.classList.add('open');
        this.recalc();
        const first = document.getElementById('dp3-in-' + this.CRITERIA[0].key);
        if (first) setTimeout(() => first.focus(), 50);
    },

    closeForm() {
        const m = document.getElementById('dp3-modal');
        if (m) { m.classList.remove('open'); m.innerHTML = ''; }
        this.state.editingId = null;
        this.state.saving = false;
    },

    _readInputs() {
        const vals = {};
        let allValid = true, sum = 0;
        this.CRITERIA.forEach(c => {
            const el = document.getElementById('dp3-in-' + c.key);
            const raw = el ? String(el.value).trim() : '';
            const n = Number(raw);
            const ok = raw !== '' && Number.isInteger(n) && n >= 1 && n <= 100;
            vals[c.key] = ok ? n : raw;
            if (!ok) allValid = false; else sum += n;
            if (el) el.classList.toggle('invalid', raw !== '' && !ok);
        });
        return { vals, allValid, sum };
    },

    recalc() {
        const { allValid, sum } = this._readInputs();
        const count = this.CRITERIA.length;
        const avg = sum / count;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('dp3-sum-jumlah', allValid ? this._fmt(sum) : '-');
        set('dp3-sum-rata', allValid ? this._fmt(avg) : '-');
        set('dp3-sum-sebutan', allValid ? this._sebutan(avg) : '-');
    },

    async save() {
        if (this.state.saving) return;
        const { vals, allValid } = this._readInputs();
        if (!allValid) {
            toast.error('Semua nilai harus diisi dengan angka bulat 1 sampai 100');
            const bad = this.CRITERIA.map(c => document.getElementById('dp3-in-' + c.key))
                .find(el => el && (!el.value || el.classList.contains('invalid')));
            if (bad) bad.focus();
            return;
        }
        this.state.saving = true;
        const btn = document.getElementById('dp3-btn-save');
        const original = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; }
        try {
            const res = await api.saveDp3({
                penilaiId: this._myEmployeeId(),
                employeeId: this.state.editingId,
                tahun: this.state.tahun,
                nilai: vals
            });
            if (!res || !res.success) {
                toast.error((res && (res.userMessage || res.error)) || 'Gagal menyimpan penilaian');
                if (btn) { btn.disabled = false; btn.innerHTML = original; }
                this.state.saving = false;
                return;
            }
            const sub = this._findSub(this.state.editingId);
            if (sub) sub.record = res.data;
            toast.success(res.updated ? 'Penilaian diperbarui' : 'Penilaian tersimpan');
            this.closeForm();
            this.render();
        } catch (err) {
            console.error('Gagal menyimpan DP3:', err);
            toast.error('Terjadi kesalahan saat menyimpan');
            if (btn) { btn.disabled = false; btn.innerHTML = original; }
            this.state.saving = false;
        }
    },

    // ── Cetak ───────────────────────────────────────────────────
    _recordFor(who) {
        const d = this.state.data;
        if (!d) return null;
        if (who === 'me') return d.myRecord;
        const sub = this._findSub(who);
        return sub ? sub.record : null;
    },

    _dash(v) {
        const s = String(v == null ? '' : v).trim();
        return s ? this._e(s) : '-';
    },

    _tglAkhirTahun(tahun) { return `31 DESEMBER ${tahun}`; },

    _nilaiPage(r) {
        const dn = r.dinilai || {};
        const pen = r.penilai || {};
        const rows = this.CRITERIA.map((c, i) => `
            <tr>
                <td class="no">${String.fromCharCode(97 + i)}.</td>
                <td class="un" colspan="1">${this._e(c.label)}</td>
                <td class="c">${this._fmt(r.nilai[c.key])}</td>
                <td class="c">${this._e(this._sebutan(r.nilai[c.key]))}</td>
                <td></td>
            </tr>`).join('');
        return `
        <div class="dp3p-paper dp3p-nilai">
            <img class="garuda" src="assets/garuda.png" alt="">
            <div class="ttl">R A H A S I A</div>
            <div class="ttl">Daftar Penilaian Pelaksanaan Pekerjaan</div>
            <div class="ttl">Karyawan/ti PT. Tirta Agung Amuntai</div>
            <div class="ttl">Tahun ${this._e(r.tahun)}</div>

            <table class="ident">
                <tr><td class="l">Nama</td><td class="c">:</td><td>${this._dash(dn.nama)}</td></tr>
                <tr><td class="l">Nomor Induk Karyawan</td><td class="c">:</td><td>${this._dash(dn.nik)}</td></tr>
                <tr><td class="l">Pangkat /Golongan Ruang</td><td class="c">:</td><td>${this._dash(dn.golongan || dn.pangkat)}</td></tr>
                <tr><td class="l">Jabatan</td><td class="c">:</td><td>${this._dash(dn.jabatan)}</td></tr>
                <tr><td class="l">Unit Organisasi</td><td class="c">:</td><td>${this._dash(dn.unit)}</td></tr>
            </table>

            <table class="nilai">
                <colgroup><col style="width:12mm"><col><col style="width:26mm"><col style="width:30mm"><col style="width:40mm"></colgroup>
                <thead>
                    <tr><th colspan="2" rowspan="2">UNSUR YANG DINILAI</th><th colspan="2">NILAI</th><th rowspan="2">KETERANGAN</th></tr>
                    <tr><th>ANGKA</th><th>SEBUTAN</th></tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr><td class="no">i.</td><td class="un"><b>JUMLAH</b></td><td class="c"><b>${this._fmt(r.jumlah)}</b></td><td></td><td></td></tr>
                    <tr><td class="no">j.</td><td class="un"><b>NILAI RATA-RATA</b></td><td class="c"><b>${this._fmt(r.rataRata)}</b></td><td class="c"><b>${this._e(r.sebutan)}</b></td><td></td></tr>
                </tbody>
            </table>

            <div class="sign">
                <div>Pejabat Yang Menilai<div class="sp"></div><b>${this._dash(pen.nama)}</b></div>
                <div>Yang Dinilai<div class="sp"></div><b>${this._dash(dn.nama)}</b></div>
            </div>

            <div class="cat">
                <b>Catatan :</b>
                <table>
                    <tr><th colspan="2">Skor</th><th>Katagori</th></tr>
                    <tr><td class="n cl">1</td><td class="n cr">50</td><td class="k">Kurang</td></tr>
                    <tr><td class="n cl">51</td><td class="n cr">60</td><td class="k">Sedang</td></tr>
                    <tr><td class="n cl">61</td><td class="n cr">75</td><td class="k">Cukup</td></tr>
                    <tr><td class="n cl">76</td><td class="n cr">90</td><td class="k">Baik</td></tr>
                    <tr><td class="n cl">91</td><td class="n cr">100</td><td class="k">Amat Baik</td></tr>
                </table>
            </div>
        </div>`;
    },

    _dp3Pages(r) {
        const dn = r.dinilai || {};
        const pen = r.penilai || {};
        const ats = r.atasan || {};
        const tahun = r.tahun;
        const tgl = this._tglAkhirTahun(tahun);
        const rah = '<div class="dp3p-rahasia">R A H A S I A</div>';

        const scoreRows = this.CRITERIA.map(c => `
            <tr><td>${this._e(c.dp3Label)}</td><td class="c">${this._fmt(r.nilai[c.key])}</td>
            <td class="c">${this._e(this._sebutan(r.nilai[c.key]))}</td><td></td></tr>`).join('');

        const tglBox = (label) => `<div class="dp3p-sec-tgl">${label}</div>`;

        // ── Halaman 1: Penilaian (4,5) | Tanggapan & Keputusan (6,7) ──
        const page1 = `
        <div class="dp3p-paper dp3p-dp3"><div class="dp3p-cols">
            <div class="dp3p-col">${rah}
                <div class="dp3p-panel">
                    <div class="dp3p-sec" style="flex:44 1 0;">
                        <div class="dp3p-sec-title"><span class="n">4</span><span class="t">P E N I L A I A N</span></div>
                        <table class="dp3p-score">
                            <colgroup><col style="width:40%"><col style="width:14%"><col style="width:17%"><col></colgroup>
                            <thead>
                                <tr><th rowspan="2">UNSUR YANG DINILAI</th><th colspan="2">NILAI</th><th rowspan="2">KETERANGAN</th></tr>
                                <tr><th>ANGKA</th><th>SEBUTAN</th></tr>
                            </thead>
                            <tbody>
                                ${scoreRows}
                                <tr><td>i. J U M L A H</td><td class="c b">${this._fmt(r.jumlah)}</td><td></td><td></td></tr>
                                <tr><td>j. NILAI RATA-RATA</td><td class="c b">${this._fmt(r.rataRata)}</td><td class="c b">${this._e(r.sebutan)}</td><td></td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="dp3p-sec" style="flex:56 1 0;">
                        <div class="dp3p-sec-title"><span class="n">5</span><span class="t">KEBERATAN DARI KARYAWAN<br>YANG DINILAI (APABILA ADA)</span></div>
                        ${tglBox('Tanggal, ..............................')}
                    </div>
                </div>${rah}
            </div>
            <div class="dp3p-col">${rah}
                <div class="dp3p-panel">
                    <div class="dp3p-sec" style="flex:44 1 0;">
                        <div class="dp3p-sec-title"><span class="n">6</span><span class="t">TANGGAPAN PEJABAT PENILAI<br>ATAS KEBERATAN</span></div>
                        ${tglBox('Tanggal<br>......................................')}
                    </div>
                    <div class="dp3p-sec" style="flex:56 1 0;">
                        <div class="dp3p-sec-title"><span class="n">7</span><span class="t">KEPUTUSAN ATASAN PEJABAT<br>PENILAI ATAS KEBERATAN</span></div>
                        ${tglBox('Tanggal<br>......................................')}
                    </div>
                </div>${rah}
            </div>
        </div></div>`;

        // ── Halaman 2: Lain-lain & tanda tangan (8-11) | Sampul identitas ──
        const idRows = (no, judul, o) => `
            <tr><td class="no">${no}</td><td class="hd" colspan="2">${judul}</td></tr>
            <tr><td class="no"></td><td class="lb">a. Nama</td><td>${this._dash(o.nama)}</td></tr>
            <tr><td class="no"></td><td class="lb">b. NIK</td><td>${this._dash(o.nik)}</td></tr>
            <tr><td class="no"></td><td class="lb">c. Pangkat / Golongan Ruang</td><td>${this._dash(o.golongan || o.pangkat)}</td></tr>
            <tr><td class="no"></td><td class="lb">d. Jabatan / Pekerjaan</td><td>${this._dash(o.jabatan)}</td></tr>
            <tr><td class="no"></td><td class="lb">e. Unit Organisasi</td><td>${this._dash(o.unit)}</td></tr>`;

        const page2 = `
        <div class="dp3p-paper dp3p-dp3"><div class="dp3p-cols">
            <div class="dp3p-col">${rah}
                <div class="dp3p-panel">
                    <div class="dp3p-sec" style="flex:45 1 0;">
                        <div class="dp3p-sec-title"><span class="t">8. LAIN-LAIN</span></div>
                    </div>
                    <div class="dp3p-sec" style="flex:55 1 0;">
                        <div class="dp3p-sign r">
                            <div>9. DIBUAT TANGGAL, ${tgl}</div>
                            <div class="c">PEJABAT PENILAI,</div>
                            <div class="nm">${this._dash(pen.nama)}</div>
                        </div>
                        <div class="dp3p-sign l" style="margin-top:2mm;">
                            <div>10. DITERIMA TANGGAL, ${tgl}</div>
                            <div class="c">KARYAWAN YANG DINILAI</div>
                            <div class="nm" style="margin-top:12mm;">${this._dash(dn.nama)}</div>
                        </div>
                        <div class="dp3p-sign r" style="margin-top:2mm;">
                            <div>11. DITERIMA TANGGAL, ${tgl}</div>
                            <div class="c">ATASAN PEJABAT PENILAI</div>
                            <div class="nm" style="margin-top:12mm;">${this._dash(ats.nama)}</div>
                        </div>
                    </div>
                </div>${rah}
            </div>
            <div class="dp3p-col">
                <div class="dp3p-cover">
                    <img class="garuda" src="assets/garuda.png" alt="">
                    <div class="ttl" style="font-weight:400;letter-spacing:.1em;">R A H A S I A</div>
                    <div class="ttl">DAFTAR PENILAIAN PELAKSANAAN PEKERJAAN</div>
                    <div class="ttl">PEGAWAI NEGERI SIPIL</div>
                    <div class="periode">JANGKA WAKTU PENILAIAN<br>JANUARI S/D DESEMBER ${this._e(tahun)}</div>
                </div>
                <table class="dp3p-id">
                    ${idRows(1, 'YANG DINILAI', dn)}
                    ${idRows(2, 'PEJABAT PENILAI', pen)}
                    ${idRows(3, 'ATASAN PEJABAT PENILAI', ats)}
                </table>
                <div style="flex:1 1 auto;"></div>
                ${rah}
            </div>
        </div></div>`;

        return page1 + page2;
    },

    // Satu-satunya cara membuka lembar cetak - "who" = id bawahan atau 'me'
    _openPrint(who, kind) {
        const r = this._recordFor(who);
        if (!r) { toast.error('Data penilaian tidak ditemukan'); return; }

        let overlay = document.getElementById('dp3-print-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dp3-print-overlay';
            overlay.className = 'print-letter-overlay';
            document.body.appendChild(overlay);
        }

        // Ukuran & orientasi kertas beda per jenis lembar
        let pageStyle = document.getElementById('dp3-page-style');
        if (!pageStyle) {
            pageStyle = document.createElement('style');
            pageStyle.id = 'dp3-page-style';
            document.head.appendChild(pageStyle);
        }
        const isNilai = kind === 'nilai';
        pageStyle.textContent = isNilai
            ? '@page { size: 210mm 297mm; margin: 0; }'
            : '@page { size: 330.2mm 215.9mm; margin: 0; }';

        const title = isNilai ? 'Daftar Nilai' : 'DP3';
        overlay.innerHTML = `
            <div class="print-letter-toolbar no-print">
                <button class="btn-small" onclick="dp3.closePrint()"><i class="fas fa-times"></i> Tutup</button>
                <button class="btn-small btn-primary" onclick="dp3.printNow()"><i class="fas fa-print"></i> Cetak / Simpan PDF</button>
            </div>
            <div class="dp3-papers"><div class="dp3-scale" data-w="${isNilai ? 210 : 330.2}">
                ${isNilai ? this._nilaiPage(r) : this._dp3Pages(r)}
            </div></div>`;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (this._prevTitle === undefined) this._prevTitle = document.title;
        document.title = `${title} ${r.tahun} - ${(r.dinilai && r.dinilai.nama) || ''}`;
        this._fitPreview();
        this._resizeHandler = this._resizeHandler || (() => this._fitPreview());
        window.addEventListener('resize', this._resizeHandler);
    },

    // Perkecil pratinjau di layar kalau jendela lebih sempit dari kertas
    // (cetak sendiri tidak terpengaruh - zoom dipaksa 1 lewat CSS @media print)
    _fitPreview() {
        const overlay = document.getElementById('dp3-print-overlay');
        const scale = overlay && overlay.querySelector('.dp3-scale');
        if (!scale) return;
        const mm = parseFloat(scale.dataset.w) || 210;
        const paperPx = mm * 96 / 25.4;
        const avail = overlay.clientWidth - 24;
        const z = Math.min(1, avail / paperPx);
        scale.style.zoom = z < 1 ? String(z) : '';
    },

    printNilai(who) { this._openPrint(who, 'nilai'); },
    printDp3(who) { this._openPrint(who, 'dp3'); },

    printNow() {
        setTimeout(() => {
            try { window.print(); }
            catch (e) { alert('Gagal membuka dialog Cetak / Simpan PDF. Coba buka di aplikasi browser (Chrome/Safari), lalu tekan tombol ini lagi.'); }
        }, 150);
    },

    closePrint() {
        const overlay = document.getElementById('dp3-print-overlay');
        if (overlay) { overlay.classList.remove('active'); overlay.innerHTML = ''; }
        const pageStyle = document.getElementById('dp3-page-style');
        if (pageStyle) pageStyle.remove();
        document.body.style.overflow = '';
        if (this._prevTitle !== undefined) { document.title = this._prevTitle; this._prevTitle = undefined; }
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    }
};

window.initDp3 = () => { dp3.init(); };
window.dp3 = dp3;
