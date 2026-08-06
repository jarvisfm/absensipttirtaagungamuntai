/**
 * Portal Karyawan - Jadwal Jaga Operator
 * Atur & cetak jadwal jaga per unit operator - SUDAH terhubung ke proses
 * absen (lihat checkOperatorRosterForToday() di Operatorschdule.gs, dipanggil
 * dari checkAttendanceAccess() di Attendance.gs). Karyawan dengan Jenis
 * Jadwal "Operator - ..."/SATPAM cuma bisa absen di hari yang namanya
 * benar-benar tercatat di jadwal ini.
 *
 * Konsep: pola jadwal (jam, jumlah sesi, jumlah orang/sesi) adalah properti UNIT,
 * bukan properti karyawan - jadi cukup dikonfigurasi sekali per unit di OPERATOR_UNITS,
 * admin tinggal isi nama petugasnya tiap bulan.
 */

// Konfigurasi pola tiap unit jaga. Ini hasil pembacaan jadwal jaga fisik
// (kertas) yang sudah dikonfirmasi. Kalau ada unit baru atau pola berubah,
// cukup tambah/ubah di sini - tidak perlu ubah logic render di bawah.
const OPERATOR_UNITS = {
    'BNA Amuntai': {
        label: 'BNA Amuntai',
        pattern: 'multi-grup', // banyak sesi/hari, tiap sesi bisa diisi banyak nama
        sessions: [
            { key: 'pagi',  label: 'Pagi',  time: '08.00 s/d 16.00' },
            { key: 'siang', label: 'Siang', time: '16.00 s/d 23.00' },
            { key: 'malam', label: 'Malam', time: '23.00 s/d 08.00' }
        ]
    },
    'SATPAM': {
        label: 'SATPAM',
        pattern: 'multi-solo', // banyak sesi/hari, 1 nama per sesi
        sessions: [
            { key: 'pagi',  label: 'Pagi',  time: '07.00 - 15.00' },
            { key: 'siang', label: 'Siang', time: '15.00 - 23.00' },
            { key: 'malam', label: 'Malam', time: '23.00 - 07.00' }
        ]
    },
    'SPAM Babirik': {
        label: 'Unit SPAM Babirik',
        pattern: 'kontinu', // 1 blok jam/hari, 1 orang jaga penuh, gantian per hari
        jamLabel: '18 Jam (04.00 - 22.00)'
    },
    'SPAM Danau Panggang': {
        label: 'Unit SPAM Danau Panggang',
        pattern: 'kontinu',
        jamLabel: '16 Jam (05.00 - 21.00)'
    },
    'SPAM Paminggir': {
        label: 'Unit SPAM Paminggir',
        pattern: 'kontinu-split', // 2 blok jam terpisah (ada jeda/istirahat)
        jamLabel: '13 Jam (04.30 - 13.00) (15.30 - 20.00)'
    },
    'SPAM Muara Tapus':     { label: 'Unit SPAM Muara Tapus',     pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Sungai Tabukan':  { label: 'Unit SPAM Sungai Tabukan',  pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Alabio':          { label: 'Unit SPAM Alabio',          pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Rantau Bujur':    { label: 'Unit SPAM Rantau Bujur',    pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Banjang':         { label: 'Unit SPAM Banjang',         pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Tangkawang':      { label: 'Unit SPAM Tangkawang',      pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Telaga Silaba':   { label: 'Unit SPAM Telaga Silaba',   pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Jarang Kuantan':  { label: 'Unit SPAM Jarang Kuantan',  pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Muara Baruh':     { label: 'Unit SPAM Muara Baruh',     pattern: 'kontinu', jamLabel: '24 Jam (00.00 - 24.00)' },
    'TRD': {
        label: 'TRD (Transmisi & Distribusi)',
        pattern: 'tim-oncall' // piket per tim/regu, bukan per jam tertentu; cabang diisi manual (mis. "TRD - Amuntai", "TRD - Cabang 1")
    }
};

const BULAN_NAMA = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI_NAMA  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

const jadwalJagaOperator = {
    unitKey: '',
    cabangTrd: '', // hanya dipakai kalau unitKey === 'TRD'
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    data: null,       // { days: {...}, teams: {...}(khusus TRD), signatures: {...} }
    _allSettings: {}, // cache semua settings dari server (supaya save 1 key tidak perlu reload semua)
    _employees: [],   // semua karyawan berjabatan "Operator" (dari getKaryawanList)
    _dirty: false,

    async init() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }

        await this._loadEmployees();
        this._populateUnitSelect();
        this._populateMonthYearSelect();
        this.bindEvents();

        const unitSelect = document.getElementById('jjo-unit');
        if (unitSelect && unitSelect.value) {
            this.unitKey = unitSelect.value;
            await this.loadAndRender();
        }
    },

    // Ambil karyawan berjabatan "Operator" (case-insensitive) - ini yang
    // muncul sebagai pilihan petugas. Nama bebas-teks (Fase 1) sudah
    // diganti jadi pilih dari daftar ini supaya bisa dicocokkan otomatis
    // dengan karyawan yang login saat proses absen (lihat Attendance.gs).
    async _loadEmployees() {
        try {
            const res = await api.getKaryawanList();
            const all = (res.success && res.data) ? res.data : [];
            this._employees = all.filter(e => String(e.jabatan || '').trim().toLowerCase() === 'operator');
        } catch (e) {
            console.error('Gagal memuat daftar karyawan Operator:', e);
            toast.error('Gagal memuat daftar karyawan Operator.');
            this._employees = [];
        }
    },

    // Karyawan Operator yang ditugaskan di unit ini saja (berdasarkan Unit
    // Wilayah). TRD sengaja tidak difilter per-unit di sini karena masih
    // pakai sistem tim bebas-teks (lihat catatan di OPERATOR_UNITS).
    _employeesForUnit(unitKey) {
        return this._employees.filter(e => String(e.unitWilayah || '') === unitKey);
    },

    _employeeName(id) {
        const emp = this._employees.find(e => String(e.id) === String(id));
        return emp ? emp.nama : '';
    },

    _populateUnitSelect() {
        const sel = document.getElementById('jjo-unit');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Pilih Unit --</option>' +
            Object.keys(OPERATOR_UNITS).map(key =>
                `<option value="${key}">${OPERATOR_UNITS[key].label}</option>`
            ).join('');
    },

    _populateMonthYearSelect() {
        const monthSel = document.getElementById('jjo-bulan');
        const yearSel  = document.getElementById('jjo-tahun');
        if (monthSel) {
            monthSel.innerHTML = BULAN_NAMA.map((b, i) => `<option value="${i}">${b}</option>`).join('');
            monthSel.value = this.month;
        }
        if (yearSel) {
            const nowYear = new Date().getFullYear();
            const years = [];
            for (let y = nowYear - 1; y <= nowYear + 2; y++) years.push(y);
            yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
            yearSel.value = this.year;
        }
    },

    bindEvents() {
        const unitSel  = document.getElementById('jjo-unit');
        const monthSel = document.getElementById('jjo-bulan');
        const yearSel  = document.getElementById('jjo-tahun');
        const cabangEl = document.getElementById('jjo-cabang-trd');
        const btnSimpan = document.getElementById('jjo-btn-simpan');
        const btnCetak  = document.getElementById('jjo-btn-cetak');

        if (unitSel) unitSel.onchange = async () => {
            if (this._dirty && !confirm('Ada perubahan yang belum disimpan. Ganti unit tanpa menyimpan?')) {
                unitSel.value = this.unitKey;
                return;
            }
            this.unitKey = unitSel.value;
            const isTrd = this.unitKey === 'TRD';
            const cabangWrap = document.getElementById('jjo-cabang-wrap');
            if (cabangWrap) cabangWrap.style.display = isTrd ? '' : 'none';
            if (this.unitKey) await this.loadAndRender();
            else this._renderEmpty();
        };

        if (monthSel) monthSel.onchange = async () => {
            this.month = parseInt(monthSel.value, 10);
            if (this.unitKey) await this.loadAndRender();
        };

        if (yearSel) yearSel.onchange = async () => {
            this.year = parseInt(yearSel.value, 10);
            if (this.unitKey) await this.loadAndRender();
        };

        if (cabangEl) cabangEl.onchange = async () => {
            this.cabangTrd = cabangEl.value.trim();
            if (this.unitKey === 'TRD') await this.loadAndRender();
        };

        if (btnSimpan) btnSimpan.onclick = () => this.saveData();
        if (btnCetak)  btnCetak.onclick  = () => this.printSchedule();
    },

    _settingKey() {
        const unitSlug = this.unitKey === 'TRD' && this.cabangTrd
            ? `TRD-${this.cabangTrd}`
            : this.unitKey;
        const mm = String(this.month + 1).padStart(2, '0');
        return `jaga_operator_${unitSlug}_${this.year}-${mm}`.replace(/\s+/g, '_');
    },

    _emptyData() {
        const unit = OPERATOR_UNITS[this.unitKey];
        const d = { days: {}, signatures: { diketahuiNama: '', diketahuiJabatan: 'Manajer Operasi dan Jaringan', dibuatNama: '', dibuatJabatan: '' } };
        if (unit && unit.pattern === 'tim-oncall') d.teams = {};
        return d;
    },

    async loadAndRender() {
        if (this.unitKey === 'TRD' && !this.cabangTrd) {
            this._renderNeedCabang();
            return;
        }
        try {
            const res = await api.getSettings();
            if (res.success && res.data) this._allSettings = res.data;
            const raw = this._allSettings[this._settingKey()];
            this.data = raw ? JSON.parse(raw) : this._emptyData();
        } catch (e) {
            console.error('Gagal memuat jadwal jaga operator:', e);
            toast.error('Gagal memuat data jadwal. Coba muat ulang halaman.');
            this.data = this._emptyData();
        }
        this._dirty = false;
        this.renderTable();
    },

    async saveData() {
        if (!this.unitKey) return;
        if (this.unitKey === 'TRD' && !this.cabangTrd) {
            toast.warning('Isi dulu nama cabang TRD-nya.');
            return;
        }
        try {
            const result = await api.saveSetting(this._settingKey(), JSON.stringify(this.data));
            if (result && result.success) {
                this._dirty = false;
                toast.success('Jadwal jaga berhasil disimpan.');
            } else {
                toast.error('Gagal menyimpan jadwal jaga.');
            }
        } catch (e) {
            console.error('Gagal menyimpan jadwal jaga operator:', e);
            toast.error('Gagal menyimpan jadwal jaga. Periksa koneksi internet Anda.');
        }
    },

    _markDirty() { this._dirty = true; },

    _daysInMonth() { return new Date(this.year, this.month + 1, 0).getDate(); },

    _dayInfo(dateNum) {
        const dateObj = new Date(this.year, this.month, dateNum);
        return {
            dow: dateObj.getDay(), // 0 = Minggu, 6 = Sabtu
            hariName: HARI_NAMA[dateObj.getDay()],
            tanggalStr: `${String(dateNum).padStart(2, '0')} ${BULAN_NAMA[this.month]} ${this.year}`
        };
    },

    _rowClass(dow) {
        if (dow === 0) return 'jjo-row-minggu';
        if (dow === 6) return 'jjo-row-sabtu';
        return '';
    },

    // ── Render (mode edit di layar) ───────────────────────────────
    _renderEmpty() {
        const el = document.getElementById('jjo-table-wrap');
        if (el) el.innerHTML = '<p class="jjo-empty-msg">Pilih unit terlebih dahulu untuk mengatur jadwal jaga.</p>';
        const info = document.getElementById('jjo-unit-info');
        if (info) info.innerHTML = '';
    },

    _renderNeedCabang() {
        const el = document.getElementById('jjo-table-wrap');
        if (el) el.innerHTML = '<p class="jjo-empty-msg">Isi nama cabang TRD dulu (mis. "Amuntai", "Cabang 1"), lalu jadwalnya akan muncul di sini.</p>';
    },

    renderTable() {
        const unit = OPERATOR_UNITS[this.unitKey];
        if (!unit) { this._renderEmpty(); return; }

        const info = document.getElementById('jjo-unit-info');
        if (info) {
            info.innerHTML = `<strong>${unit.label}</strong>` +
                (unit.jamLabel ? ` &mdash; ${unit.jamLabel}` : '') +
                (unit.pattern === 'tim-oncall' ? ' &mdash; jadwal piket tim (jam bebas)' : '');
        }

        switch (unit.pattern) {
            case 'multi-grup':
            case 'multi-solo':
                this._renderMultiSesi(unit);
                break;
            case 'kontinu':
            case 'kontinu-split':
                this._renderKontinu(unit);
                break;
            case 'tim-oncall':
                this._renderTimOncall(unit);
                break;
        }
    },

    _renderMultiSesi(unit) {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        const days = this._daysInMonth();
        const isGrup = unit.pattern === 'multi-grup';
        const unitEmployees = this._employeesForUnit(this.unitKey);

        let rows = '';
        for (let d = 1; d <= days; d++) {
            const info = this._dayInfo(d);
            const rowClass = this._rowClass(info.dow);
            const dayData = this.data.days[d] || { sessions: {}, keterangan: '' };
            if (!this.data.days[d]) this.data.days[d] = dayData;

            unit.sessions.forEach((sess, idx) => {
                const rawVal = dayData.sessions[sess.key];
                const selectedIds = isGrup
                    ? (Array.isArray(rawVal) ? rawVal.map(String) : [])
                    : (rawVal ? [String(rawVal)] : []);

                const optionsHtml = unitEmployees.map(emp => `
                    <option value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'selected' : ''}>${this._escAttr(emp.nama)}</option>
                `).join('');

                rows += `<tr class="${rowClass}">`;
                if (idx === 0) {
                    rows += `<td rowspan="${unit.sessions.length}">${d}</td>`;
                    rows += `<td rowspan="${unit.sessions.length}">${info.hariName}<br>${info.tanggalStr}</td>`;
                }
                rows += `<td>${sess.label}<br><span class="jjo-jam">${sess.time}</span></td>`;
                rows += `<td>
                    <select class="jjo-select" data-day="${d}" data-session="${sess.key}" ${isGrup ? 'multiple size="4"' : ''}>
                        ${!isGrup ? '<option value="">- Kosong -</option>' : ''}
                        ${optionsHtml}
                    </select>
                    ${unitEmployees.length === 0 ? '<div class="jjo-no-emp">Belum ada karyawan Operator di unit ini</div>' : ''}
                </td>`;
                if (idx === 0) {
                    rows += `<td rowspan="${unit.sessions.length}">
                        <input type="text" class="jjo-input" data-day="${d}" data-field="keterangan"
                            value="${this._escAttr(dayData.keterangan || '')}" placeholder="Catatan (opsional)">
                    </td>`;
                }
                rows += `</tr>`;
            });
        }

        wrap.innerHTML = `
            <table class="jjo-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Hari, Tanggal</th>
                        <th>Jam</th>
                        <th>Nama Petugas${isGrup ? ' <small>(Ctrl/Cmd+klik untuk pilih lebih dari 1)</small>' : ''}</th>
                        <th>Keterangan</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        this._bindInputs();
    },

    _renderKontinu(unit) {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        const days = this._daysInMonth();
        const unitEmployees = this._employeesForUnit(this.unitKey);

        let rows = '';
        for (let d = 1; d <= days; d++) {
            const info = this._dayInfo(d);
            const rowClass = this._rowClass(info.dow);
            const dayData = this.data.days[d] || { petugas: '', keterangan: '' };
            if (!this.data.days[d]) this.data.days[d] = dayData;

            const selectedId = dayData.petugas ? String(dayData.petugas) : '';
            const optionsHtml = unitEmployees.map(emp => `
                <option value="${emp.id}" ${selectedId === String(emp.id) ? 'selected' : ''}>${this._escAttr(emp.nama)}</option>
            `).join('');

            rows += `<tr class="${rowClass}">
                <td>${d}</td>
                <td>${info.hariName}<br>${info.tanggalStr}</td>
                <td>${unit.jamLabel}</td>
                <td>
                    <select class="jjo-select" data-day="${d}" data-field="petugas">
                        <option value="">- Kosong -</option>
                        ${optionsHtml}
                    </select>
                    ${unitEmployees.length === 0 ? '<div class="jjo-no-emp">Belum ada karyawan Operator di unit ini</div>' : ''}
                </td>
                <td><input type="text" class="jjo-input" data-day="${d}" data-field="keterangan"
                        value="${this._escAttr(dayData.keterangan || '')}" placeholder="Catatan (opsional)"></td>
            </tr>`;
        }

        wrap.innerHTML = `
            <table class="jjo-table">
                <thead>
                    <tr><th>No</th><th>Hari, Tanggal</th><th>Jam Operasional</th><th>Nama Petugas</th><th>Keterangan</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        this._bindInputs();
    },

    _renderTimOncall() {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        const days = this._daysInMonth();
        const teams = this.data.teams || {};
        const teamEntries = Object.keys(teams).map(code => `${code} = ${teams[code]}`).join('\n');

        let rows = '';
        for (let d = 1; d <= days; d++) {
            const info = this._dayInfo(d);
            const rowClass = this._rowClass(info.dow);
            const dayData = this.data.days[d] || { teams: '', keterangan: '' };
            if (!this.data.days[d]) this.data.days[d] = dayData;

            rows += `<tr class="${rowClass}">
                <td>${d}</td>
                <td>${info.hariName}<br>${info.tanggalStr}</td>
                <td><input type="text" class="jjo-input" data-day="${d}" data-field="teams"
                        value="${this._escAttr(dayData.teams || '')}" placeholder="mis. (A+B) (C+D)"></td>
                <td><input type="text" class="jjo-input" data-day="${d}" data-field="keterangan"
                        value="${this._escAttr(dayData.keterangan || '')}" placeholder="Catatan (opsional)"></td>
            </tr>`;
        }

        wrap.innerHTML = `
            <div class="jjo-team-editor">
                <label>Daftar Tim/Regu (format 1 baris = "KODE = Nama1, Nama2"; kode dipakai di kolom Petugas)</label>
                <textarea id="jjo-teams-textarea" rows="3" placeholder="A+B = Hendri, Wahyu Hidayat&#10;C+D = Rahmadi, Alwi">${teamEntries}</textarea>
            </div>
            <table class="jjo-table">
                <thead>
                    <tr><th>No</th><th>Hari, Tanggal</th><th>Tim/Regu Piket</th><th>Keterangan</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        this._bindInputs();

        const teamsTextarea = document.getElementById('jjo-teams-textarea');
        if (teamsTextarea) {
            teamsTextarea.oninput = () => {
                const parsed = {};
                teamsTextarea.value.split('\n').forEach(line => {
                    const idx = line.indexOf('=');
                    if (idx === -1) return;
                    const code = line.slice(0, idx).trim();
                    const members = line.slice(idx + 1).trim();
                    if (code) parsed[code] = members;
                });
                this.data.teams = parsed;
                this._markDirty();
            };
        }
    },

    _bindInputs() {
        document.querySelectorAll('#jjo-table-wrap .jjo-input').forEach(input => {
            input.oninput = () => {
                const day = input.dataset.day;
                const session = input.dataset.session;
                const field = input.dataset.field;
                if (!this.data.days[day]) this.data.days[day] = {};
                if (session) {
                    if (!this.data.days[day].sessions) this.data.days[day].sessions = {};
                    this.data.days[day].sessions[session] = input.value;
                } else if (field) {
                    this.data.days[day][field] = input.value;
                }
                this._markDirty();
            };
        });

        // Dropdown pilih petugas (menggantikan teks bebas - Fase 2b). Untuk
        // sesi multi-grup (mis. BNA Amuntai) selectnya "multiple", nilainya
        // array ID karyawan; selain itu 1 ID saja (atau '' kalau kosong).
        document.querySelectorAll('#jjo-table-wrap .jjo-select').forEach(sel => {
            sel.onchange = () => {
                const day = sel.dataset.day;
                const session = sel.dataset.session;
                const field = sel.dataset.field;
                if (!this.data.days[day]) this.data.days[day] = {};

                if (session) {
                    if (!this.data.days[day].sessions) this.data.days[day].sessions = {};
                    if (sel.multiple) {
                        this.data.days[day].sessions[session] = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
                    } else {
                        this.data.days[day].sessions[session] = sel.value;
                    }
                } else if (field) {
                    this.data.days[day][field] = sel.value;
                }
                this._markDirty();
            };
        });
    },

    _escAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    },

    // ── Cetak ──────────────────────────────────────────────────────
    _ensureOverlay() {
        let overlay = document.getElementById('print-letter-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'print-letter-overlay';
            overlay.className = 'print-letter-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    },

    printSchedule() {
        if (!this.unitKey) { toast.warning('Pilih unit dulu sebelum mencetak.'); return; }
        if (this.unitKey === 'TRD' && !this.cabangTrd) { toast.warning('Isi nama cabang TRD dulu sebelum mencetak.'); return; }

        const unit = OPERATOR_UNITS[this.unitKey];
        const judulUnit = this.unitKey === 'TRD' ? `${unit.label} - ${this.cabangTrd}` : unit.label;
        const sig = this.data.signatures || {};

        let bodyHtml = `
            <div class="jjo-print-title">
                <h3>JADWAL JAGA OPERATOR ${judulUnit.toUpperCase()}</h3>
                <h4>BULAN ${BULAN_NAMA[this.month].toUpperCase()} ${this.year}</h4>
            </div>
        `;

        bodyHtml += this._buildPrintTable(unit);

        bodyHtml += `
            <div class="jjo-print-signature">
                <div class="jjo-sig-left">
                    <p>Diketahui Oleh<br>${this._escAttr(sig.diketahuiJabatan || '')}</p>
                    <br><br><br>
                    <p><u>${this._escAttr(sig.diketahuiNama || '(...........................)')}</u></p>
                </div>
                <div class="jjo-sig-right">
                    <p>Dibuat Oleh<br>${this._escAttr(sig.dibuatJabatan || '')}</p>
                    <br><br><br>
                    <p><u>${this._escAttr(sig.dibuatNama || '(...........................)')}</u></p>
                </div>
            </div>
        `;

        const overlay = this._ensureOverlay();
        overlay.innerHTML = `
            <div class="print-letter-page">
                <div class="letter-kop-img-wrap">
                    <img src="assets/kop-surat.jpeg" alt="Kop Surat" class="letter-kop-img">
                </div>
                <div class="letter-body jjo-print-body">
                    ${bodyHtml}
                </div>
                <div class="jjo-print-toolbar no-print">
                    <button class="btn btn-primary" id="jjo-print-now">Cetak / Simpan PDF</button>
                    <button class="btn btn-secondary" id="jjo-print-close">Tutup</button>
                </div>
            </div>
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        const btnPrint = document.getElementById('jjo-print-now');
        const btnClose = document.getElementById('jjo-print-close');
        if (btnPrint) btnPrint.onclick = () => setTimeout(() => { try { window.print(); } catch (e) { alert('Gagal membuka dialog Cetak / Simpan PDF.'); } }, 150);
        if (btnClose) btnClose.onclick = () => {
            overlay.classList.remove('active');
            overlay.innerHTML = '';
            document.body.style.overflow = '';
        };
    },

    _buildPrintTable(unit) {
        const days = this._daysInMonth();
        let rows = '';

        if (unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo') {
            for (let d = 1; d <= days; d++) {
                const info = this._dayInfo(d);
                const dayData = this.data.days[d] || { sessions: {}, keterangan: '' };
                unit.sessions.forEach((sess, idx) => {
                    const rawVal = dayData.sessions && dayData.sessions[sess.key];
                    const ids = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                    const namaHtml = ids.map(id => this._escAttr(this._employeeName(id))).filter(Boolean).join('<br>') || '-';
                    rows += `<tr>`;
                    if (idx === 0) {
                        rows += `<td rowspan="${unit.sessions.length}">${d}</td>`;
                        rows += `<td rowspan="${unit.sessions.length}">${info.hariName}<br>${info.tanggalStr}</td>`;
                    }
                    rows += `<td>${sess.time}</td><td>${namaHtml}</td>`;
                    if (idx === 0) rows += `<td rowspan="${unit.sessions.length}">${this._escAttr(dayData.keterangan || '')}</td>`;
                    rows += `</tr>`;
                });
            }
            return `<table class="jjo-print-table">
                <thead><tr><th>No</th><th>Hari, Tanggal</th><th>Jam</th><th>Nama Petugas</th><th>Keterangan</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        if (unit.pattern === 'kontinu' || unit.pattern === 'kontinu-split') {
            for (let d = 1; d <= days; d++) {
                const info = this._dayInfo(d);
                const dayData = this.data.days[d] || { petugas: '', keterangan: '' };
                const namaPetugas = this._employeeName(dayData.petugas) || '-';
                rows += `<tr>
                    <td>${d}</td><td>${info.hariName}<br>${info.tanggalStr}</td>
                    <td>${unit.jamLabel}</td>
                    <td>${this._escAttr(namaPetugas)}</td>
                    <td>${this._escAttr(dayData.keterangan || '')}</td>
                </tr>`;
            }
            return `<table class="jjo-print-table">
                <thead><tr><th>No</th><th>Hari, Tanggal</th><th>Jam Operasional</th><th>Nama Petugas</th><th>Keterangan</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        // tim-oncall
        for (let d = 1; d <= days; d++) {
            const info = this._dayInfo(d);
            const dayData = this.data.days[d] || { teams: '', keterangan: '' };
            rows += `<tr>
                <td>${d}</td><td>${info.hariName}<br>${info.tanggalStr}</td>
                <td>${this._escAttr(dayData.teams || '-')}</td>
                <td>${this._escAttr(dayData.keterangan || '')}</td>
            </tr>`;
        }
        const teams = this.data.teams || {};
        const legend = Object.keys(teams).map(code => `<p>${this._escAttr(code)} = ${this._escAttr(teams[code])}</p>`).join('');
        return `<table class="jjo-print-table">
                <thead><tr><th>No</th><th>Hari, Tanggal</th><th>Tim/Regu Piket</th><th>Keterangan</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="jjo-print-legend">${legend}</div>`;
    }
};

function initJadwalJagaOperator() { jadwalJagaOperator.init(); }

window.jadwalJagaOperator = jadwalJagaOperator;
window.initJadwalJagaOperator = initJadwalJagaOperator;
