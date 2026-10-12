/**
 * Portal Karyawan - Slip Gaji (satu halaman untuk Admin & Karyawan)
 * PT. Tirta Agung Amuntai
 *
 * ADMIN   : Import Excel -> lihat Gaji Penerimaan / Gaji Potongan ->
 *           Print & Kirim (kirim = slip muncul di menu Slip Gaji karyawan,
 *           TIDAK lewat email).
 * KARYAWAN: hanya melihat/mencetak slip miliknya yang sudah dikirim admin.
 *
 * Backend: SlipGaji.gs. Format file Excel: lihat parseWorkbook() di bawah
 * (sama dengan contoh excel_cth.xlsx dari aplikasi SiGaji).
 */
const slipGaji = {
    // ====== Pengaturan tampilan slip (ubah di sini kalau perlu) ======
    COMPANY_NAME: 'PT. TIRTA AGUNG AMUNTAI',
    COMPANY_SUB: '(Perseroda)',
    SLIP_TITLE: 'SLIP GAJI KARYAWAN',
    JABATAN_TTD: 'Kasi. SDM. Kepegawaian',
    KOTA: 'Amuntai',

    BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],

    isAdminView: false,
    tab: 'import',
    periods: [],
    periode: '',
    rows: [],
    employees: [],
    parsed: null,
    busy: false,

    // ---------- util ----------
    _e(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    rp(n) { return 'Rp. ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID'); },
    namaBulan(b) { return this.BULAN[(Number(b) || 1) - 1] || ''; },
    blth(r) { return String(r.bulan).padStart(2, '0') + '/' + r.tahun; },
    periodeLabel(p) { return this.namaBulan(p.bulan) + ' ' + p.tahun; },
    _root() { return document.getElementById('slip-gaji-root'); },

    _ensureXlsxLib() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        if (this._xlsxPromise) return this._xlsxPromise;
        this._xlsxPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = () => resolve();
            s.onerror = () => { this._xlsxPromise = null; reject(new Error('Gagal memuat pustaka Excel')); };
            document.head.appendChild(s);
        });
        return this._xlsxPromise;
    },

    // ---------- init ----------
    async init() {
        const root = this._root();
        if (!root) return;
        this.isAdminView = !!(window.auth && auth.isAdmin());
        this.rows = [];
        this.parsed = null;
        if (this.isAdminView) {
            this.tab = 'import';
            await this.loadPeriods();
            this.renderAdmin();
        } else {
            this.renderKaryawanLoading();
            await this.loadSaya();
        }
    },

    // =====================================================================
    //  KARYAWAN
    // =====================================================================
    renderKaryawanLoading() {
        this._root().innerHTML = `
            <div class="sg-hero"><div class="sg-hero-ic"><i class="fas fa-file-invoice-dollar"></i></div>
            <div><h2>Slip Gaji</h2><p>Slip gaji Anda yang sudah dikirim oleh admin.</p></div></div>
            <div class="sg-card"><i class="fas fa-spinner fa-spin"></i> Memuat slip gaji...</div>`;
    },

    async loadSaya() {
        let list = [], err = '';
        try {
            const res = await api.getSlipGajiSaya();
            if (res && res.success) list = res.data || [];
            else err = (res && res.error) || 'Gagal memuat slip gaji';
        } catch (e) {
            console.error('Gagal memuat slip gaji:', e);
            err = 'Gagal memuat slip gaji';
        }
        this.rows = list;
        const items = list.map(r => `
            <div class="sg-month">
                <div class="sg-month-ic"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="sg-month-txt">
                    <b>${this._e(this.namaBulan(r.bulan))} ${this._e(r.tahun)}</b>
                    <small>Gaji diterima: <strong>${this._e(this.rp(r.gajiBersih))}</strong></small>
                </div>
                <button type="button" class="sg-btn sg-btn-primary" onclick="slipGaji.openSlip('${this._e(r.id)}')">
                    <i class="fas fa-eye"></i> Lihat
                </button>
                <button type="button" class="sg-btn" onclick="slipGaji.printOne('${this._e(r.id)}')">
                    <i class="fas fa-print"></i> Cetak
                </button>
            </div>`).join('');
        this._root().innerHTML = `
            <div class="sg-hero"><div class="sg-hero-ic"><i class="fas fa-file-invoice-dollar"></i></div>
            <div><h2>Slip Gaji</h2><p>Slip gaji Anda yang sudah dikirim oleh admin.</p></div></div>
            ${err ? `<div class="sg-alert sg-alert-err"><i class="fas fa-triangle-exclamation"></i> ${this._e(err)}</div>` : ''}
            <div class="sg-card">
                ${items || (err ? '' : '<div class="sg-empty"><i class="fas fa-inbox"></i><p>Belum ada slip gaji yang dikirim untuk Anda.</p></div>')}
            </div>`;
    },

    // =====================================================================
    //  ADMIN - kerangka & tab
    // =====================================================================
    async loadPeriods(keep) {
        try {
            const res = await api.getSlipGajiPeriode();
            this.periods = (res && res.success && res.data) || [];
        } catch (e) {
            console.error('Gagal memuat periode:', e);
            this.periods = [];
        }
        const want = keep || this.periode;
        this.periode = this.periods.some(p => p.periode === want) ? want : (this.periods[0] ? this.periods[0].periode : '');
    },

    async loadRows() {
        this.rows = [];
        if (!this.periode) return;
        try {
            const res = await api.getSlipGajiList(this.periode);
            if (res && res.success) this.rows = res.data || [];
            else toast.error(this._e((res && res.error) || 'Gagal memuat data slip gaji'));
        } catch (e) {
            console.error('Gagal memuat data slip:', e);
            toast.error('Gagal memuat data slip gaji');
        }
    },

    renderAdmin() {
        const root = this._root();
        const tabs = [
            ['import', 'fa-file-import', 'Import Data'],
            ['penerimaan', 'fa-money-bill-wave', 'Gaji Penerimaan'],
            ['potongan', 'fa-scissors', 'Gaji Potongan'],
            ['kirim', 'fa-paper-plane', 'Print & Kirim']
        ];
        root.innerHTML = `
            <div class="sg-hero"><div class="sg-hero-ic"><i class="fas fa-file-invoice-dollar"></i></div>
            <div><h2>Slip Gaji</h2><p>Import data gaji dari Excel, periksa penerimaan &amp; potongan, lalu kirim slip ke menu Slip Gaji karyawan.</p></div></div>
            <div class="sg-tabs">
                ${tabs.map(t => `<button type="button" class="sg-tab${this.tab === t[0] ? ' active' : ''}" onclick="slipGaji.switchTab('${t[0]}')">
                    <i class="fas ${t[1]}"></i> <span>${t[2]}</span></button>`).join('')}
            </div>
            <div id="sg-body"></div>`;
        this.renderTab();
    },

    async switchTab(t) {
        this.tab = t;
        document.querySelectorAll('#slip-gaji-root .sg-tab').forEach((el, i) => {
            el.classList.toggle('active', ['import', 'penerimaan', 'potongan', 'kirim'][i] === t);
        });
        await this.renderTab();
    },

    async renderTab() {
        const body = document.getElementById('sg-body');
        if (!body) return;
        if (this.tab === 'import') { this.renderImport(); return; }
        body.innerHTML = '<div class="sg-card"><i class="fas fa-spinner fa-spin"></i> Memuat data...</div>';
        await this.loadRows();
        if (this.tab === 'kirim') await this.ensureEmployees();
        const b = document.getElementById('sg-body');
        if (!b) return;
        if (this.tab === 'penerimaan') this.renderData('p');
        else if (this.tab === 'potongan') this.renderData('k');
        else this.renderKirim();
    },

    async ensureEmployees() {
        if (this.employees.length) return;
        // hanya perlu kalau ada baris yang belum terpasang ke karyawan
        if (!this.rows.some(r => !r.userId)) return;
        try {
            const res = await api.getKaryawanList();
            this.employees = ((res && res.success && res.data) || [])
                .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        } catch (e) { console.error('Gagal memuat karyawan:', e); }
    },

    _periodeBar(extra) {
        if (!this.periods.length) {
            return `<div class="sg-card"><div class="sg-empty"><i class="fas fa-inbox"></i>
                <p>Belum ada data gaji. Import file Excel terlebih dahulu di tab <b>Import Data</b>.</p></div></div>`;
        }
        return `<div class="sg-card sg-bar">
            <label>Periode
                <select id="sg-periode" onchange="slipGaji.changePeriode(this.value)">
                    ${this.periods.map(p => `<option value="${this._e(p.periode)}"${p.periode === this.periode ? ' selected' : ''}>${this._e(this.periodeLabel(p))} (${p.terkirim}/${p.total} terkirim)</option>`).join('')}
                </select>
            </label>
            <div class="sg-bar-actions">${extra || ''}</div>
        </div>`;
    },

    async changePeriode(v) {
        this.periode = v;
        await this.renderTab();
    },

    // =====================================================================
    //  ADMIN - Import
    // =====================================================================
    renderImport() {
        const body = document.getElementById('sg-body');
        const p = this.parsed;
        body.innerHTML = `
            <div class="sg-card">
                <h3 class="sg-h3"><i class="fas fa-file-excel"></i> Upload Data Excel Gaji</h3>
                <div class="sg-drop">
                    <input type="file" id="sg-file" accept=".xlsx" onchange="slipGaji.onFile(this)">
                    <small>Hanya menerima file Excel (.xlsx). Gunakan format yang sama dengan contoh.
                    <a href="#" onclick="slipGaji.downloadTemplate();return false;">Unduh contoh format</a></small>
                </div>
                <div id="sg-import-msg"></div>
            </div>
            <div id="sg-preview">${p ? this.previewHtml() : ''}</div>`;
    },

    async onFile(input) {
        const f = input.files && input.files[0];
        if (!f) return;
        const msg = document.getElementById('sg-import-msg');
        if (!/\.xlsx$/i.test(f.name)) {
            this.parsed = null;
            msg.innerHTML = '<div class="sg-alert sg-alert-err"><i class="fas fa-triangle-exclamation"></i> File harus berformat .xlsx</div>';
            document.getElementById('sg-preview').innerHTML = '';
            return;
        }
        msg.innerHTML = '<div class="sg-alert"><i class="fas fa-spinner fa-spin"></i> Membaca file...</div>';
        try {
            await this._ensureXlsxLib();
            const buf = await f.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            this.parsed = this.parseWorkbook(wb, f.name);
            msg.innerHTML = '';
            document.getElementById('sg-preview').innerHTML = this.previewHtml();
        } catch (e) {
            console.error('Gagal membaca Excel:', e);
            this.parsed = null;
            msg.innerHTML = `<div class="sg-alert sg-alert-err"><i class="fas fa-triangle-exclamation"></i> ${this._e(e.message || 'File Excel tidak bisa dibaca')}</div>`;
            document.getElementById('sg-preview').innerHTML = '';
        }
    },

    _norm(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); },

    _toNum(v) {
        if (typeof v === 'number') return isFinite(v) ? Math.round(v) : 0;
        if (v == null) return 0;
        let s = String(v).replace(/rp\.?/gi, '').replace(/\s/g, '');
        if (!s) return 0;
        s = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        return isFinite(n) ? Math.round(n) : 0;
    },

    _isBlank(v) { return v === null || v === undefined || String(v).trim() === ''; },

    /**
     * Format yang dibaca (sama dengan contoh excel_cth.xlsx):
     *  - Baris atas: "Gaji Bulan : Juli 2023", "Bendahara : NAMA  NIK. xxx"
     *  - Baris header: No | Nama | <kolom penerimaan...> | JUMLAH | Jumlah Bersih |
     *    <kolom potongan...> | E-mail | ... | JUMLAH POT | JMLH DITERIMA
     *  - Baris data di bawah header. Kolom yang kosong di SEMUA karyawan
     *    (mis. Uang Minyak) otomatis tidak ditampilkan di slip.
     */
    parseWorkbook(wb, fileName) {
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws || !ws['!ref']) throw new Error('Sheet pertama kosong');
        const range = XLSX.utils.decode_range(ws['!ref']);
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

        // --- header ---
        let hi = -1;
        for (let i = 0; i < Math.min(aoa.length, 40); i++) {
            const r = aoa[i].map(c => this._norm(c));
            if (r.includes('nama') && r.includes('no') && r.some(c => c === 'jumlah')) { hi = i; break; }
        }
        if (hi < 0) throw new Error('Baris header tidak ditemukan. Pastikan ada kolom "No", "Nama" dan "JUMLAH" seperti contoh format.');
        const head = aoa[hi].map(c => this._norm(c));
        const iNama = head.indexOf('nama');
        const iJumlah = head.indexOf('jumlah');
        const iBersih = head.indexOf('jumlah bersih');
        const iEmail = head.findIndex(c => /^e-?mail$/.test(c));
        const iJumPot = head.indexOf('jumlah pot');
        const iTerima = head.findIndex(c => c === 'jmlh diterima' || c === 'jumlah diterima');
        if (iJumlah <= iNama) throw new Error('Kolom "JUMLAH" harus berada setelah kolom "Nama".');

        const potStart = (iBersih >= 0 ? iBersih : iJumlah) + 1;
        let potEnd = head.length;
        [iEmail, iJumPot, iTerima].forEach(x => { if (x >= potStart && x < potEnd) potEnd = x; });
        head.forEach((c, i) => { if (i >= potStart && i < potEnd && (c === 'anak' || c === 'no' || c === 'password')) potEnd = i; });

        const labelAt = i => String(aoa[hi][i] == null ? '' : aoa[hi][i]).trim();
        const pCols = [], kCols = [];
        for (let c = iNama + 1; c < iJumlah; c++) if (labelAt(c)) pCols.push(c);
        for (let c = potStart; c < potEnd; c++) if (labelAt(c)) kCols.push(c);
        if (!pCols.length) throw new Error('Kolom penerimaan tidak ditemukan.');
        if (!kCols.length) throw new Error('Kolom potongan tidak ditemukan.');

        // --- meta (baris di atas header) ---
        let bulan = 0, tahun = 0, bendahara = '', nik = '';
        for (let i = 0; i < hi; i++) {
            const r = aoa[i];
            const first = r.findIndex(c => !this._isBlank(c));
            if (first < 0) continue;
            const key = this._norm(r[first]);
            const rest = r.slice(first + 1).filter(c => !this._isBlank(c) && String(c).trim() !== ':');
            if (key === 'gaji bulan' && rest.length) {
                const m = String(rest[0]).trim().toLowerCase().match(/([a-z]+)\s+(\d{4})/);
                if (m) {
                    const bi = this.BULAN.findIndex(b => b.toLowerCase() === m[1]);
                    if (bi >= 0) { bulan = bi + 1; tahun = Number(m[2]); }
                }
            } else if (key === 'bendahara' && rest.length) {
                bendahara = String(rest[0]).trim();
                const ni = r.findIndex(c => this._norm(c).replace('.', '') === 'nik');
                if (ni >= 0) {
                    const v = r.slice(ni + 1).find(c => !this._isBlank(c));
                    if (v != null) nik = String(v).trim();
                }
            }
        }

        // --- baris data ---
        const rows = [];
        const colHasValue = new Set();
        let uncalculated = 0;
        for (let i = hi + 1; i < aoa.length; i++) {
            const r = aoa[i];
            const nama = r[iNama];
            if (this._isBlank(nama) || typeof nama !== 'string') continue;
            const cells = (cols) => cols.map(c => {
                const cell = ws[XLSX.utils.encode_cell({ r: range.s.r + i, c: range.s.c + c })];
                if (cell && cell.f && cell.v === undefined) uncalculated++;
                if (!this._isBlank(r[c])) colHasValue.add(c);
                return this._toNum(r[c]);
            });
            rows.push({
                nama: nama.trim(),
                email: iEmail >= 0 && !this._isBlank(r[iEmail]) ? String(r[iEmail]).trim() : '',
                p: cells(pCols),
                k: cells(kCols),
                xlJumlah: iJumlah >= 0 && typeof r[iJumlah] === 'number' ? Math.round(r[iJumlah]) : null,
                xPot: iJumPot >= 0 && typeof r[iJumPot] === 'number' ? Math.round(r[iJumPot]) : null,
                xTerima: iTerima >= 0 && typeof r[iTerima] === 'number' ? Math.round(r[iTerima]) : null
            });
        }
        if (!rows.length) throw new Error('Tidak ada baris karyawan di bawah header.');

        if (uncalculated > 0) {
            throw new Error('Ada rumus Excel yang belum terhitung (tidak punya nilai tersimpan). Buka file di Excel, simpan ulang (Ctrl+S), lalu import lagi.');
        }

        // buang kolom yang kosong di semua karyawan
        const keepP = pCols.map((c, idx) => ({ c, idx })).filter(o => colHasValue.has(o.c));
        const keepK = kCols.map((c, idx) => ({ c, idx })).filter(o => colHasValue.has(o.c));
        const pLabels = keepP.map(o => labelAt(o.c));
        const kLabels = keepK.map(o => labelAt(o.c));
        rows.forEach(r => {
            r.p = keepP.map(o => r.p[o.idx]);
            r.k = keepK.map(o => r.k[o.idx]);
        });

        // --- peringatan ---
        const warnings = [];
        const mism = [];
        rows.forEach(r => {
            const tp = r.p.reduce((a, b) => a + b, 0);
            const tk = r.k.reduce((a, b) => a + b, 0);
            if ((r.xlJumlah != null && r.xlJumlah !== tp) ||
                (r.xPot != null && r.xPot !== tk) ||
                (r.xTerima != null && r.xTerima !== tp - tk)) mism.push(r.nama);
        });
        if (mism.length) {
            warnings.push(`Total hitungan ulang berbeda dengan kolom JUMLAH/JUMLAH POT/JMLH DITERIMA di Excel untuk: ${mism.slice(0, 5).join(', ')}${mism.length > 5 ? ` dan ${mism.length - 5} lainnya` : ''}. Periksa kembali file Anda.`);
        }
        if (rows.some(r => !r.email)) warnings.push('Ada karyawan tanpa email - pencocokan ke akun karyawan memakai nama.');
        if (!bulan || !tahun) warnings.push('Bulan/tahun gaji tidak terbaca dari file - pilih manual di bawah.');

        return { fileName, bulan, tahun, bendahara, nik, pLabels, kLabels, rows, warnings };
    },

    previewHtml() {
        const p = this.parsed;
        if (!p) return '';
        const now = new Date().getFullYear();
        const years = []; for (let y = now - 5; y <= now + 1; y++) years.push(y);
        if (p.tahun && !years.includes(p.tahun)) years.push(p.tahun);
        years.sort();
        const sum = (a) => a.reduce((x, y) => x + y, 0);
        const existing = p.bulan && p.tahun && this.periods.some(x => x.periode === String(p.tahun * 100 + p.bulan));
        return `
        <div class="sg-card">
            <h3 class="sg-h3"><i class="fas fa-eye"></i> Pratinjau: ${this._e(p.fileName)}</h3>
            ${p.warnings.map(w => `<div class="sg-alert sg-alert-warn"><i class="fas fa-triangle-exclamation"></i> ${this._e(w)}</div>`).join('')}
            <div class="sg-form">
                <label>Bulan
                    <select id="sg-imp-bulan" onchange="slipGaji.onMeta()">
                        <option value="">Pilih bulan</option>
                        ${this.BULAN.map((b, i) => `<option value="${i + 1}"${p.bulan === i + 1 ? ' selected' : ''}>${b}</option>`).join('')}
                    </select></label>
                <label>Tahun
                    <select id="sg-imp-tahun" onchange="slipGaji.onMeta()">
                        <option value="">Pilih tahun</option>
                        ${years.map(y => `<option value="${y}"${p.tahun === y ? ' selected' : ''}>${y}</option>`).join('')}
                    </select></label>
                <label>Nama penandatangan
                    <input type="text" id="sg-imp-bend" value="${this._e(p.bendahara)}" oninput="slipGaji.onMeta()"></label>
                <label>NIK penandatangan
                    <input type="text" id="sg-imp-nik" value="${this._e(p.nik)}" oninput="slipGaji.onMeta()"></label>
            </div>
            <p class="sg-note">${p.rows.length} karyawan &bull; ${p.pLabels.length} komponen penerimaan &bull; ${p.kLabels.length} komponen potongan</p>
            <div id="sg-replace-note">${existing ? '<div class="sg-alert sg-alert-warn"><i class="fas fa-circle-info"></i> Data periode ini sudah ada. Import akan menggantinya (status "terkirim" karyawan yang sama dipertahankan).</div>' : ''}</div>
            <div class="sg-table-wrap">
                <table class="sg-table">
                    <thead><tr><th>No</th><th>Nama</th><th>Email</th><th class="r">Penerimaan</th><th class="r">Potongan</th><th class="r">Gaji Bersih</th></tr></thead>
                    <tbody>${p.rows.map((r, i) => {
                        const tp = sum(r.p), tk = sum(r.k);
                        return `<tr><td>${i + 1}</td><td>${this._e(r.nama)}</td><td>${this._e(r.email || '-')}</td>
                            <td class="r">${this.rp(tp)}</td><td class="r">${this.rp(tk)}</td><td class="r"><b>${this.rp(tp - tk)}</b></td></tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <div class="sg-actions">
                <button type="button" class="sg-btn" onclick="slipGaji.cancelImport()">Batal</button>
                <button type="button" class="sg-btn sg-btn-primary" id="sg-do-import" onclick="slipGaji.doImport()"><i class="fas fa-upload"></i> Impor</button>
            </div>
        </div>`;
    },

    onMeta() {
        const p = this.parsed; if (!p) return;
        p.bulan = Number(document.getElementById('sg-imp-bulan').value) || 0;
        p.tahun = Number(document.getElementById('sg-imp-tahun').value) || 0;
        p.bendahara = document.getElementById('sg-imp-bend').value.trim();
        p.nik = document.getElementById('sg-imp-nik').value.trim();
        const note = document.getElementById('sg-replace-note');
        if (note) {
            const exists = p.bulan && p.tahun && this.periods.some(x => x.periode === String(p.tahun * 100 + p.bulan));
            note.innerHTML = exists ? '<div class="sg-alert sg-alert-warn"><i class="fas fa-circle-info"></i> Data periode ini sudah ada. Import akan menggantinya (status "terkirim" karyawan yang sama dipertahankan).</div>' : '';
        }
    },

    cancelImport() {
        this.parsed = null;
        this.renderImport();
    },

    async doImport() {
        const p = this.parsed;
        if (!p || this.busy) return;
        this.onMeta();
        if (!p.bulan || !p.tahun) { toast.warning('Pilih bulan dan tahun gaji terlebih dahulu'); return; }
        const exists = this.periods.some(x => x.periode === String(p.tahun * 100 + p.bulan));
        if (exists && !confirm(`Data gaji ${this.namaBulan(p.bulan)} ${p.tahun} sudah ada. Ganti dengan data dari file ini?`)) return;

        this.busy = true;
        const btn = document.getElementById('sg-do-import');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengimpor...'; }
        try {
            const res = await api.importSlipGaji({
                bulan: p.bulan, tahun: p.tahun, bendahara: p.bendahara, nikBendahara: p.nik,
                penerimaanLabels: p.pLabels, potonganLabels: p.kLabels,
                rows: p.rows.map(r => ({ nama: r.nama, email: r.email, penerimaan: r.p, potongan: r.k }))
            });
            if (res && res.success) {
                const d = res.data || {};
                let m = `${d.imported} data gaji berhasil diimpor.`;
                if (d.unmatched && d.unmatched.length) {
                    m += ` ${d.unmatched.length} belum cocok dengan data karyawan (bisa dipasangkan di tab Print & Kirim).`;
                    toast.warning(this._e(m));
                } else {
                    toast.success(this._e(m));
                }
                this.parsed = null;
                await this.loadPeriods(String(p.tahun * 100 + p.bulan));
                this.tab = 'kirim';
                this.renderAdmin();
            } else {
                toast.error(this._e((res && res.error) || 'Import gagal'));
            }
        } catch (e) {
            console.error('Import slip gaji gagal:', e);
            toast.error('Import gagal, periksa koneksi lalu coba lagi');
        } finally {
            this.busy = false;
            const b = document.getElementById('sg-do-import');
            if (b) { b.disabled = false; b.innerHTML = '<i class="fas fa-upload"></i> Impor'; }
        }
    },

    async downloadTemplate() {
        try {
            await this._ensureXlsxLib();
        } catch (e) { toast.error('Gagal memuat pustaka Excel'); return; }
        const pLabels = ['Gaji Pokok', 'Tunj. Kesehatan', 'Tunj. Kinerja', 'Tunj. Jabatan', 'Tunj. Kel. Anak/Istri', 'Tunj. Kehadiran', 'Tunj. Rumah', 'Uang Lembur', 'Uang Minum', 'Tunj. Kesejahteraan'];
        const kLabels = ['Dana Pensiun', 'Arisan D. Wanita', 'Arisan Pegawai', 'Sumbangan D. Wanita', 'Bon Koperasi', 'Iuran Koperasi', 'Barang Koperasi', 'Pot. Kematian', 'Angsuran Bank', 'Pot. Sumbangan', 'Pot. Absen Kehadiran & Kinerja', 'Arisan Sosialita', 'Korpri', 'BPJS Kesehatan', 'BPJS Ketenagakerjaan', 'Infaq', 'Sewa Rumah'];
        const header = ['No', 'Nama', ...pLabels, 'JUMLAH', 'Jumlah Bersih', ...kLabels, 'E-mail', 'JUMLAH POT', 'JMLH DITERIMA'];
        const jml = 3000000;
        const row = [1, 'Nama Karyawan', ...pLabels.map((_, i) => i === 0 ? 3000000 : 0), jml, jml, ...kLabels.map(() => 0), 'email@contoh.com', 0, jml];
        const aoa = [
            [null, 'Gaji Bulan', ':', 'Juli 2023'],
            [null, 'Bendahara', ':', 'NAMA PENANDATANGAN', null, 'NIK.', '00 00 000'],
            [],
            [],
            [],
            header,
            row
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'db_data');
        XLSX.writeFile(wb, 'contoh-format-slip-gaji.xlsx');
    },

    // =====================================================================
    //  ADMIN - Gaji Penerimaan / Potongan
    // =====================================================================
    renderData(kind) {
        const body = document.getElementById('sg-body');
        const bar = this._periodeBar(this.periods.length
            ? `<button type="button" class="sg-btn sg-btn-primary" onclick="slipGaji.openForm('${kind}')"><i class="fas fa-plus"></i> Tambah Data</button>
               <button type="button" class="sg-btn sg-btn-danger" onclick="slipGaji.hapusPeriode()"><i class="fas fa-trash"></i> Hapus Data Periode</button>` : '');
        if (!this.periods.length) { body.innerHTML = bar; return; }
        const rows = this.rows;
        const labels = rows.length ? (rows[0].rincian[kind] || []).map(x => x[0]) : [];
        const stick = 'position:sticky;right:0;background:var(--color-white,#fff);box-shadow:-2px 0 4px rgba(0,0,0,.06)';
        const total = kind === 'p' ? 'totalPenerimaan' : 'totalPotongan';
        body.innerHTML = bar + `
        <div class="sg-card">
            <div class="sg-search"><i class="fas fa-search"></i>
                <input type="text" placeholder="Cari nama..." oninput="slipGaji.filterTable(this.value)"></div>
            <div class="sg-table-wrap">
                <table class="sg-table" id="sg-data-table">
                    <thead><tr><th>No</th><th>BLTH</th><th>Nama</th>${labels.map(l => `<th class="r">${this._e(l)}</th>`).join('')}<th class="r">${kind === 'p' ? 'Jumlah' : 'Jumlah Potongan'}</th><th style="position:sticky;right:0">Aksi</th></tr></thead>
                    <tbody>${rows.map((r, i) => `<tr data-q="${this._e(String(r.nama).toLowerCase())}">
                        <td>${i + 1}</td><td>${this._e(this.blth(r))}</td><td>${this._e(r.nama)}</td>
                        ${(r.rincian[kind] || []).map(x => `<td class="r">${this.rp(x[1])}</td>`).join('')}
                        <td class="r"><b>${this.rp(r[total])}</b></td>
                        <td style="${stick}">
                            <button type="button" class="sg-btn sg-btn-sm" onclick="slipGaji.openForm('${kind}', '${this._e(r.id)}')"><i class="fas fa-pen-to-square"></i> Edit</button>
                            <button type="button" class="sg-btn sg-btn-sm sg-btn-danger" onclick="slipGaji.hapusSatu('${this._e(r.id)}')"><i class="fas fa-trash"></i> Hapus</button>
                        </td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    },

    filterTable(q) {
        q = String(q || '').toLowerCase().trim();
        document.querySelectorAll('#sg-data-table tbody tr, #sg-kirim-table tbody tr').forEach(tr => {
            tr.style.display = !q || (tr.dataset.q || '').includes(q) ? '' : 'none';
        });
    },

    async hapusPeriode() {
        const p = this.periods.find(x => x.periode === this.periode);
        if (!p) return;
        if (!confirm(`Hapus SEMUA data gaji ${this.periodeLabel(p)} (${p.total} karyawan)? Slip yang sudah terkirim ke karyawan juga ikut terhapus.`)) return;
        try {
            const res = await api.hapusSlipGajiPeriode(this.periode);
            if (res && res.success) {
                toast.success('Data gaji periode ini dihapus');
                await this.loadPeriods('');
                await this.renderTab();
            } else {
                toast.error(this._e((res && res.error) || 'Gagal menghapus data'));
            }
        } catch (e) {
            console.error(e);
            toast.error('Gagal menghapus data');
        }
    },

    // =====================================================================
    //  ADMIN - Tambah / Edit / Hapus data per karyawan
    //  (dipakai di tab Gaji Penerimaan [kind 'p'] dan Gaji Potongan [kind 'k'])
    // =====================================================================
    async _fetchEmployees() {
        if (this.employees.length) return;
        try {
            const res = await api.getKaryawanList();
            this.employees = ((res && res.success && res.data) || [])
                .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        } catch (e) { console.error('Gagal memuat karyawan:', e); }
    },

    async openForm(kind, id) {
        if (this._formBusy) return;
        const isEdit = !!id;
        const row = isEdit ? this._findRow(id) : null;
        if (isEdit && !row) return;
        const ref = row || this.rows[0];
        if (!ref) { toast.warning('Belum ada data pada periode ini'); return; }
        const labels = (ref.rincian[kind] || []).map(x => x[0]);
        const nilai = row ? (row.rincian[kind] || []).map(x => x[1]) : labels.map(() => 0);
        const judulJenis = kind === 'p' ? 'Gaji Penerimaan' : 'Gaji Potongan';

        let pilih = '';
        if (!isEdit) {
            await this._fetchEmployees();
            const sudah = new Set(this.rows.map(r => String(r.userId)).filter(Boolean));
            const namaAda = new Set(this.rows.map(r => String(r.nama).trim().toLowerCase()));
            const opts = this.employees
                .filter(e => !sudah.has(String(e.id)) && !namaAda.has(String(e.nama || '').trim().toLowerCase()))
                .map(e => `<option value="${this._e(e.id)}">${this._e(e.nama)}</option>`).join('');
            pilih = `
                <label style="grid-column:1/-1">Karyawan
                    <select id="sg-f-emp" onchange="slipGaji.onFormEmp()">
                        <option value="">- Ketik nama manual -</option>${opts}
                    </select></label>
                <label style="grid-column:1/-1" id="sg-f-nama-wrap">Nama
                    <input type="text" id="sg-f-nama" placeholder="Nama karyawan"></label>`;
        } else {
            pilih = `
                <label style="grid-column:1/-1">Nama
                    <input type="text" value="${this._e(row.nama)}" disabled></label>`;
        }

        this.closeForm();
        const p = this.periods.find(x => x.periode === this.periode);
        const el = document.createElement('div');
        el.className = 'sg-modal';
        el.id = 'sg-form-modal';
        el.innerHTML = `
            <div class="sg-modal-box">
                <div class="sg-modal-head">
                    <b>${isEdit ? 'Edit' : 'Tambah'} Data ${judulJenis}${p ? ' - ' + this._e(this.periodeLabel(p)) : ''}</b>
                    <div><button type="button" class="sg-btn sg-btn-sm" onclick="slipGaji.closeForm()"><i class="fas fa-times"></i></button></div>
                </div>
                <div class="sg-modal-body">
                    <div class="sg-form" style="margin-top:0">
                        ${pilih}
                        ${labels.map((l, i) => `<label>${this._e(l)}
                            <input type="number" class="sg-f-val" min="0" step="1" inputmode="numeric" value="${this._e(nilai[i] || 0)}"></label>`).join('')}
                    </div>
                    ${isEdit ? '' : '<p class="sg-note">Nominal sisi lainnya diisi 0. Lengkapi lewat tombol Edit di tab satunya.</p>'}
                    <div class="sg-actions">
                        <button type="button" class="sg-btn" onclick="slipGaji.closeForm()">Batal</button>
                        <button type="button" class="sg-btn sg-btn-primary" id="sg-f-save" onclick="slipGaji.saveForm('${kind}', '${isEdit ? this._e(id) : ''}')"><i class="fas fa-save"></i> Simpan</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(el);
        const first = el.querySelector(isEdit ? '.sg-f-val' : '#sg-f-emp');
        if (first) first.focus();
    },

    onFormEmp() {
        const sel = document.getElementById('sg-f-emp');
        const wrap = document.getElementById('sg-f-nama-wrap');
        if (wrap && sel) wrap.style.display = sel.value ? 'none' : '';
    },

    closeForm() {
        const el = document.getElementById('sg-form-modal');
        if (el) el.remove();
    },

    async saveForm(kind, id) {
        if (this._formBusy) return;
        const values = Array.from(document.querySelectorAll('#sg-form-modal .sg-f-val'))
            .map(i => Math.max(0, Math.round(Number(i.value) || 0)));
        const btn = document.getElementById('sg-f-save');
        let payload;
        if (id) {
            payload = { id, kind, values };
        } else {
            const userId = (document.getElementById('sg-f-emp') || {}).value || '';
            const nama = ((document.getElementById('sg-f-nama') || {}).value || '').trim();
            if (!userId && !nama) { toast.warning('Pilih karyawan atau isi nama terlebih dahulu'); return; }
            payload = { periode: this.periode, kind, values, userId, nama };
        }
        this._formBusy = true;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; }
        try {
            const res = id ? await api.updateSlipGaji(payload) : await api.tambahSlipGaji(payload);
            if (res && res.success) {
                toast.success(id ? 'Data berhasil diperbarui' : 'Data berhasil ditambahkan');
                this.closeForm();
                await this.loadPeriods(this.periode);
                await this.renderTab();
            } else {
                toast.error(this._e((res && res.error) || 'Gagal menyimpan data'));
            }
        } catch (e) {
            console.error('Simpan data slip gagal:', e);
            toast.error('Gagal menyimpan data, periksa koneksi lalu coba lagi');
        } finally {
            this._formBusy = false;
            const b = document.getElementById('sg-f-save');
            if (b) { b.disabled = false; b.innerHTML = '<i class="fas fa-save"></i> Simpan'; }
        }
    },

    async hapusSatu(id) {
        const r = this._findRow(id);
        if (!r) return;
        if (!confirm(`Hapus data gaji ${r.nama} (${this.blth(r)})? Penerimaan dan potongan karyawan ini ikut terhapus${r.status === 'terkirim' ? ', dan slipnya hilang dari menu Slip Gaji karyawan' : ''}.`)) return;
        try {
            const res = await api.hapusSlipGaji(id);
            if (res && res.success) {
                toast.success('Data gaji karyawan dihapus');
                await this.loadPeriods(this.periode);
                await this.renderTab();
            } else {
                toast.error(this._e((res && res.error) || 'Gagal menghapus data'));
            }
        } catch (e) {
            console.error(e);
            toast.error('Gagal menghapus data');
        }
    },

    // =====================================================================
    //  ADMIN - Print & Kirim
    // =====================================================================
    renderKirim() {
        const body = document.getElementById('sg-body');
        const bar = this._periodeBar(this.periods.length ? `
            <button type="button" class="sg-btn sg-btn-primary" onclick="slipGaji.kirimSemua()"><i class="fas fa-paper-plane"></i> Kirim ke Semua Karyawan</button>
            <button type="button" class="sg-btn" onclick="slipGaji.printAll()"><i class="fas fa-print"></i> Cetak Semua Slip</button>
            <button type="button" class="sg-btn" onclick="slipGaji.printDaftar()"><i class="fas fa-list"></i> Cetak Daftar Gaji</button>` : '');
        if (!this.periods.length) { body.innerHTML = bar; return; }
        const rows = this.rows;
        const terkirim = rows.filter(r => r.status === 'terkirim').length;
        const unmatched = rows.filter(r => !r.userId).length;
        body.innerHTML = bar + `
        <div class="sg-card">
            <div class="sg-chips">
                <span class="sg-chip">${rows.length} karyawan</span>
                <span class="sg-chip ok">${terkirim} terkirim</span>
                <span class="sg-chip">${rows.length - terkirim} belum dikirim</span>
                ${unmatched ? `<span class="sg-chip warn">${unmatched} belum cocok dengan akun karyawan</span>` : ''}
            </div>
            <div class="sg-search"><i class="fas fa-search"></i>
                <input type="text" placeholder="Cari nama..." oninput="slipGaji.filterTable(this.value)"></div>
            <div class="sg-table-wrap">
                <table class="sg-table" id="sg-kirim-table">
                    <thead><tr><th>No</th><th>Nama</th><th>Email</th><th class="r">Gaji Bersih</th><th>Status</th><th>Aksi</th></tr></thead>
                    <tbody>${rows.map((r, i) => this.kirimRowHtml(r, i)).join('')}</tbody>
                </table>
            </div>
        </div>`;
    },

    kirimRowHtml(r, i) {
        let status;
        if (!r.userId) status = '<span class="sg-chip warn">Belum cocok</span>';
        else if (r.status === 'terkirim') status = '<span class="sg-chip ok">Terkirim</span>';
        else status = '<span class="sg-chip">Belum dikirim</span>';

        let aksi;
        if (!r.userId) {
            aksi = `<select class="sg-assign" onchange="slipGaji.assign('${this._e(r.id)}', this.value)">
                <option value="">Pilih karyawan...</option>
                ${this.employees.map(e => `<option value="${this._e(e.id)}">${this._e(e.nama || '-')}</option>`).join('')}
            </select>`;
        } else {
            aksi = `<button type="button" class="sg-btn sg-btn-sm" onclick="slipGaji.openSlip('${this._e(r.id)}')"><i class="fas fa-eye"></i></button>
                <button type="button" class="sg-btn sg-btn-sm" onclick="slipGaji.printOne('${this._e(r.id)}')"><i class="fas fa-print"></i></button>
                <button type="button" class="sg-btn sg-btn-sm sg-btn-primary" onclick="slipGaji.kirimSatu('${this._e(r.id)}')">
                    <i class="fas fa-paper-plane"></i> ${r.status === 'terkirim' ? 'Kirim Ulang' : 'Kirim'}</button>`;
        }
        return `<tr data-q="${this._e((String(r.nama) + ' ' + String(r.email)).toLowerCase())}">
            <td>${i + 1}</td><td>${this._e(r.nama)}</td><td>${this._e(r.email || '-')}</td>
            <td class="r"><b>${this.rp(r.gajiBersih)}</b></td><td>${status}</td><td class="nowrap">${aksi}</td></tr>`;
    },

    async assign(id, userId) {
        if (!userId) return;
        try {
            const res = await api.assignSlipGajiKaryawan(id, userId);
            if (res && res.success) {
                toast.success('Slip dipasangkan ke karyawan');
                await this.renderTab();
            } else {
                toast.error(this._e((res && res.error) || 'Gagal memasangkan'));
            }
        } catch (e) {
            console.error(e);
            toast.error('Gagal memasangkan karyawan');
        }
    },

    async _kirim(payload, confirmMsg) {
        if (this.busy) return;
        if (confirmMsg && !confirm(confirmMsg)) return;
        this.busy = true;
        try {
            const res = await api.kirimSlipGaji(payload);
            if (res && res.success) {
                const d = res.data || {};
                let m = `${d.sent} slip terkirim ke menu Slip Gaji karyawan.`;
                if (d.skipped) m += ` ${d.skipped} dilewati karena belum cocok dengan akun karyawan.`;
                toast.success(this._e(m));
                await this.loadPeriods(this.periode);
                await this.renderTab();
            } else {
                toast.error(this._e((res && res.error) || 'Gagal mengirim slip'));
            }
        } catch (e) {
            console.error(e);
            toast.error('Gagal mengirim slip');
        } finally {
            this.busy = false;
        }
    },

    kirimSatu(id) { return this._kirim({ ids: [id] }); },

    kirimSemua() {
        const p = this.periods.find(x => x.periode === this.periode);
        if (!p) return;
        return this._kirim({ periode: this.periode, semua: true },
            `Kirim slip gaji ${this.periodeLabel(p)} ke semua karyawan? Slip akan langsung muncul di menu Slip Gaji masing-masing.`);
    },

    // =====================================================================
    //  Slip: tampilan, modal, cetak
    // =====================================================================
    _findRow(id) { return this.rows.find(r => String(r.id) === String(id)); },

    _logoUrl() {
        try { return new URL('assets/logo-taa.png', window.location.href).href; } catch (e) { return 'assets/logo-taa.png'; }
    },

    _tglCetak() {
        const d = new Date();
        return `${d.getDate()} ${this.namaBulan(d.getMonth() + 1)} ${d.getFullYear()}`;
    },

    slipHtml(r, no) {
        const li = (arr) => arr.map((x, i) => `
            <tr><td class="n">${i + 1}.</td><td>${this._e(x[0])}</td><td class="v">${this.rp(x[1])}</td></tr>`).join('');
        return `
        <div class="sg-slip">
            <div class="sg-kop">
                <img src="${this._e(this._logoUrl())}" alt="">
                <div><b>${this._e(this.COMPANY_NAME)}</b><span>${this._e(this.COMPANY_SUB)}</span></div>
            </div>
            <div class="sg-kop-line"></div>
            <div class="sg-slip-title">${this._e(this.SLIP_TITLE)}</div>
            <table class="sg-meta">
                <tr><td>BLTH</td><td>: ${this._e(this.blth(r))}</td><td class="r">${no ? 'No. ' + this._e(no) : ''}</td></tr>
                <tr><td>NAMA</td><td colspan="2">: ${this._e(r.nama)}</td></tr>
            </table>
            <table class="sg-items">
                <tr><td colspan="3" class="sg-sec">PENERIMAAN</td></tr>
                ${li(r.rincian.p)}
                <tr class="tot"><td colspan="2">JUMLAH (a)</td><td class="v">${this.rp(r.totalPenerimaan)}</td></tr>
                <tr><td colspan="3" class="sg-sec">POTONGAN</td></tr>
                ${li(r.rincian.k)}
                <tr class="tot"><td colspan="2">JUMLAH (b)</td><td class="v">${this.rp(r.totalPotongan)}</td></tr>
                <tr class="tot net"><td colspan="2">Jumlah diterima (a-b)</td><td class="v">${this.rp(r.gajiBersih)}</td></tr>
            </table>
            <div class="sg-ttd">
                <div>${this._e(this.KOTA)}, ${this._e(this._tglCetak())}</div>
                <div>${this._e(this.JABATAN_TTD)}</div>
                <div class="sg-ttd-sp">Ttd</div>
                <div class="sg-ttd-name">${this._e(r.bendahara || '')}</div>
                ${r.nikBendahara ? `<div>NIK. ${this._e(r.nikBendahara)}</div>` : ''}
            </div>
            <div class="sg-thanks">Terima Kasih.</div>
        </div>`;
    },

    _printCss() {
        return `
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;margin:0;padding:16px}
        .sg-slip{width:360px;max-width:100%;margin:0 0 24px 0;text-align:left;page-break-after:always}
        .sg-slip:last-child{page-break-after:auto}
        .sg-kop{display:flex;align-items:center;gap:10px}
        .sg-kop img{width:46px;height:46px;object-fit:contain}
        .sg-kop b{display:block;font-size:13px}.sg-kop span{font-size:11px}
        .sg-kop-line{border-top:3px double #333;margin:6px 0 10px}
        .sg-slip-title{text-align:center;font-weight:700;font-size:12px;margin-bottom:10px}
        table{border-collapse:collapse;width:100%}
        .sg-meta td{padding:1px 0}.sg-meta td:first-child{width:50px}
        .sg-items td{padding:1px 2px;vertical-align:top}
        .sg-items .n{width:24px}.v{text-align:left;white-space:nowrap}.sg-items .v{width:108px}
        .r{text-align:right}
        .sg-sec{font-weight:700;text-decoration:underline;padding-top:8px!important}
        .tot td{font-weight:700;padding-top:3px!important}
        .net .v{border:1px solid #000;padding:1px 6px}
        .sg-ttd{margin-top:14px;text-align:center;line-height:1.5}
        .sg-ttd-sp{margin-top:34px;color:#555}.sg-ttd-name{font-weight:700;text-decoration:underline;letter-spacing:2px}
        .sg-thanks{margin-top:10px}
        .sg-list-title{text-align:center;font-weight:700;font-size:14px;margin:6px 0 2px}
        .sg-list th,.sg-list td{border:1px solid #444;padding:4px 6px}.sg-list th{background:#eee}
        @page{margin:12mm}`;
    },

    _printHtml(bodyHtml, title) {
        const w = window.open('', '_blank');
        if (!w) { toast.error('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.'); return; }
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._e(title)}</title>
            <style>${this._printCss()}</style></head><body>${bodyHtml}
            <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>`);
        w.document.close();
    },

    printOne(id) {
        const r = this._findRow(id);
        if (!r) return;
        const no = this.rows.indexOf(r) + 1;
        this._printHtml(this.slipHtml(r, this.isAdminView ? no : ''), `Slip Gaji ${r.nama} ${this.blth(r)}`);
    },

    printAll() {
        if (!this.rows.length) { toast.warning('Belum ada data untuk dicetak'); return; }
        const p = this.periods.find(x => x.periode === this.periode);
        this._printHtml(this.rows.map((r, i) => this.slipHtml(r, i + 1)).join(''), `Slip Gaji ${p ? this.periodeLabel(p) : ''}`);
    },

    printDaftar() {
        if (!this.rows.length) { toast.warning('Belum ada data untuk dicetak'); return; }
        const p = this.periods.find(x => x.periode === this.periode);
        const first = this.rows[0];
        const html = `
            <div class="sg-list-title">${this._e(this.COMPANY_NAME)} ${this._e(this.COMPANY_SUB)}</div>
            <div class="sg-list-title">Daftar Gaji Karyawan</div>
            <p>Bulan : ${this._e(this.namaBulan(first.bulan))}<br>Tahun : ${this._e(first.tahun)}</p>
            <table class="sg-list"><thead><tr><th>No</th><th>Nama Karyawan</th><th>Gaji Penerimaan</th><th>Gaji Potongan</th><th>Gaji Bersih</th></tr></thead>
            <tbody>${this.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${this._e(r.nama)}</td>
                <td class="r">${this.rp(r.totalPenerimaan)}</td><td class="r">${this.rp(r.totalPotongan)}</td><td class="r">${this.rp(r.gajiBersih)}</td></tr>`).join('')}</tbody></table>
            <div class="sg-ttd" style="width:260px;margin-left:auto">
                <div>${this._e(this.KOTA)}, ${this._e(this._tglCetak())}</div><div>${this._e(this.JABATAN_TTD)}</div>
                <div class="sg-ttd-sp">Ttd</div><div class="sg-ttd-name">${this._e(first.bendahara || '')}</div>
                ${first.nikBendahara ? `<div>NIK. ${this._e(first.nikBendahara)}</div>` : ''}</div>`;
        this._printHtml(html, `Daftar Gaji ${p ? this.periodeLabel(p) : ''}`);
    },

    openSlip(id) {
        const r = this._findRow(id);
        if (!r) return;
        this.closeSlip();
        const no = this.isAdminView ? this.rows.indexOf(r) + 1 : '';
        const el = document.createElement('div');
        el.className = 'sg-modal';
        el.id = 'sg-modal';
        el.innerHTML = `
            <div class="sg-modal-box">
                <div class="sg-modal-head">
                    <b>Slip Gaji - ${this._e(this.namaBulan(r.bulan))} ${this._e(r.tahun)}</b>
                    <div>
                        <button type="button" class="sg-btn sg-btn-sm sg-btn-primary" onclick="slipGaji.printOne('${this._e(r.id)}')"><i class="fas fa-print"></i> Cetak</button>
                        <button type="button" class="sg-btn sg-btn-sm" onclick="slipGaji.closeSlip()"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="sg-modal-body">${this.slipHtml(r, no)}</div>
            </div>`;
        el.addEventListener('click', e => { if (e.target === el) this.closeSlip(); });
        document.body.appendChild(el);
    },

    closeSlip() {
        const el = document.getElementById('sg-modal');
        if (el) el.remove();
    }
};

window.slipGaji = slipGaji;
window.initSlipGaji = () => { slipGaji.init(); };
