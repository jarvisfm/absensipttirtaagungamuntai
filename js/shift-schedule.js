/**
 * Portal Karyawan - Shift Schedule (Jadwal Shift)
 * Fase ini: halaman "Jadwal Shift" diganti total jadi pengaturan JAM per
 * Jenis Jadwal (field employee.shift) - bukan lagi kalender per-karyawan.
 * Data ini yang benar-benar dipakai backend (checkAttendanceAccess) untuk
 * buka/tutup sesi absen, jadi tidak ada lagi jam yang hardcode di kode.
 */

const HARI_OPTIONS = [
    { value: 0, label: 'Minggu' },
    { value: 1, label: 'Senin' },
    { value: 2, label: 'Selasa' },
    { value: 3, label: 'Rabu' },
    { value: 4, label: 'Kamis' },
    { value: 5, label: 'Jumat' },
    { value: 6, label: 'Sabtu' }
];

const SHIFT_TYPES_SETTING_KEY = 'shift_types_config';

const shiftSchedule = {
    config: {},   // { "<Jenis Jadwal>": { dayGroups: [...] }, ... }
    _dirty: false,

    async init() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }
        await this.loadData();
        this.bindEvents();
        this.render();
    },

    async loadData() {
        try {
            const res = await api.getSettings();
            const raw = res.success && res.data ? res.data[SHIFT_TYPES_SETTING_KEY] : null;
            this.config = raw ? JSON.parse(raw) : this._defaultConfig();
        } catch (e) {
            console.error('Gagal memuat konfigurasi Jenis Jadwal:', e);
            toast.error('Gagal memuat konfigurasi. Menampilkan nilai bawaan.');
            this.config = this._defaultConfig();
        }
        this._dirty = false;
    },

    // Nilai bawaan ini SENGAJA persis meniru jam yang dulu hardcode di
    // Attendance.gs, supaya kalau admin belum pernah menyimpan apa pun,
    // jam kerja karyawan tidak berubah diam-diam.
    _defaultConfig() {
        return {
            'Reguler (Sen-Kam)': {
                dayGroups: [
                    {
                        days: [1, 2, 3, 4], label: 'Senin - Kamis', batasLambat: '08:10', toleransi: 0,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '06:45' },
                            { label: 'Istirahat Keluar', field: 'breakStart', time: '12:00', opensAt: '11:45' },
                            { label: 'Istirahat Masuk', field: 'breakEnd', time: '13:30', opensAt: '13:15' },
                            { label: 'Pulang', field: 'clockOut', time: '16:30', opensAt: '16:25' }
                        ]
                    },
                    {
                        days: [5], label: 'Jumat', batasLambat: '07:30', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '07:30', opensAt: '06:45' },
                            { label: 'Pulang', field: 'clockOut', time: '11:00', opensAt: '10:45' }
                        ]
                    },
                    { days: [6], label: 'Sabtu', libur: true },
                    { days: [0], label: 'Minggu', libur: true }
                ]
            },
            'Jaga Malam': {
                dayGroups: [
                    {
                        days: [1, 2, 3, 4, 5, 6], label: 'Senin - Sabtu', batasLambat: '21:00', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '21:00', opensAt: '20:45' },
                            { label: 'Istirahat', field: 'breakStart', time: '00:00', opensAt: '23:45' },
                            { label: 'Pulang', field: 'clockOut', time: '05:00', opensAt: '04:45' }
                        ]
                    },
                    { days: [0], label: 'Minggu', libur: true }
                ]
            },
            // ── Bawah ini nilai awal untuk unit Operator yang polanya "1 blok
            // jam per hari" (jam operasionalnya sama tiap hari, walau orang
            // yang jaga gantian) - hasil pembacaan jadwal jaga fisik bulan
            // Juli 2026. Admin bisa edit/hapus/tambah sendiri lewat halaman
            // ini kapan saja.
            //
            // CATATAN: "SATPAM" dan "BNA Amuntai" SENGAJA belum saya
            // tambahkan di sini - polanya beda (3 shift/hari, orang beda
            // tiap shift, bergilir per hari) sehingga tidak cocok dengan
            // model "1 Jenis Jadwal = jam tetap" seperti di bawah ini.
            // Perlu mekanisme tambahan (baca jadwal jaga hari itu dari
            // menu Jadwal Jaga Operator) - lihat penjelasan di chat.
            // CATATAN: "SATPAM" & unit seperti BNA Amuntai polanya 3 shift/hari
            // dengan orang berbeda tiap shift, bergilir per hari - belum bisa
            // divalidasi presisi per-shift tanpa membaca jadwal jaga hari itu
            // (lihat menu Jadwal Jaga Operator). Untuk sementara SATPAM diberi
            // 1 sesi jam bebas (mirip TRD) supaya karyawan tetap bisa absen
            // dengan wajar - nanti diperbaiki jadi presisi per-shift kalau
            // mekanisme baca-jadwal-hari-ini sudah dibangun.
            // ── BNA Amuntai & SATPAM: 3 shift/hari (Pagi/Siang/Malam),
            // orangnya gantian - jam absennya BUKAN ditentukan dari hari
            // dalam minggu, tapi dari "jadwal jaga hari ini" di menu
            // Jadwal Jaga Operator (rosterCheck: true + shiftOptions,
            // bukan dayGroups biasa). Lihat _renderRosterCheckCard().
            'Operator - BNA Amuntai (3 Sesi)': {
                rosterCheck: true,
                shiftOptions: {
                    pagi:  { label: 'Pagi',  batasLambat: '08:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' },
                        { label: 'Pulang', field: 'clockOut', time: '16:00', opensAt: '15:50' }
                    ] },
                    siang: { label: 'Siang', batasLambat: '16:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '16:00', opensAt: '15:45' },
                        { label: 'Pulang', field: 'clockOut', time: '23:00', opensAt: '22:50' }
                    ] },
                    malam: { label: 'Malam', batasLambat: '23:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '23:00', opensAt: '22:45' },
                        { label: 'Pulang', field: 'clockOut', time: '08:00', opensAt: '07:50' }
                    ] }
                }
            },
            'SATPAM': {
                rosterCheck: true,
                shiftOptions: {
                    pagi:  { label: 'Pagi',  batasLambat: '07:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '07:00', opensAt: '06:45' },
                        { label: 'Pulang', field: 'clockOut', time: '15:00', opensAt: '14:50' }
                    ] },
                    siang: { label: 'Siang', batasLambat: '15:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '15:00', opensAt: '14:45' },
                        { label: 'Pulang', field: 'clockOut', time: '23:00', opensAt: '22:50' }
                    ] },
                    malam: { label: 'Malam', batasLambat: '23:10', toleransi: 10, sessions: [
                        { label: 'Masuk', field: 'clockIn', time: '23:00', opensAt: '22:45' },
                        { label: 'Pulang', field: 'clockOut', time: '07:00', opensAt: '06:50' }
                    ] }
                }
            },
            'TRD': {
                // Sama persis seperti Reguler (Senin-Jumat) - jadwal jaga tim
                // piket (lihat menu Jadwal Jaga Operator) cuma referensi
                // regu on-call, TIDAK menggerbang absen.
                dayGroups: [
                    {
                        days: [1, 2, 3, 4], label: 'Senin - Kamis', batasLambat: '08:10', toleransi: 0,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '06:45' },
                            { label: 'Istirahat Keluar', field: 'breakStart', time: '12:00', opensAt: '11:45' },
                            { label: 'Istirahat Masuk', field: 'breakEnd', time: '13:30', opensAt: '13:15' },
                            { label: 'Pulang', field: 'clockOut', time: '16:30', opensAt: '16:25' }
                        ]
                    },
                    {
                        days: [5], label: 'Jumat', batasLambat: '07:30', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '07:30', opensAt: '06:45' },
                            { label: 'Pulang', field: 'clockOut', time: '11:00', opensAt: '10:45' }
                        ]
                    },
                    { days: [6], label: 'Sabtu', libur: true },
                    { days: [0], label: 'Minggu', libur: true }
                ]
            },
            'Operator - 24 Jam': {
                rosterCheck: true, // dicek dari jadwal jaga harian (menu Jadwal Jaga Operator)
                dayGroups: [
                    {
                        days: [0, 1, 2, 3, 4, 5, 6], label: 'Setiap Hari', batasLambat: '00:10', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '00:00', opensAt: '00:00' },
                            { label: 'Pulang', field: 'clockOut', time: '23:59', opensAt: '23:50' }
                        ]
                    }
                ]
            },
            'Operator - 18 Jam': {
                rosterCheck: true, // dicek dari jadwal jaga harian (menu Jadwal Jaga Operator)
                dayGroups: [
                    {
                        days: [0, 1, 2, 3, 4, 5, 6], label: 'Setiap Hari', batasLambat: '04:10', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '04:00', opensAt: '03:45' },
                            { label: 'Pulang', field: 'clockOut', time: '22:00', opensAt: '21:50' }
                        ]
                    }
                ]
            },
            'Operator - 16 Jam': {
                rosterCheck: true, // dicek dari jadwal jaga harian (menu Jadwal Jaga Operator)
                dayGroups: [
                    {
                        days: [0, 1, 2, 3, 4, 5, 6], label: 'Setiap Hari', batasLambat: '05:10', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '05:00', opensAt: '04:45' },
                            { label: 'Pulang', field: 'clockOut', time: '21:00', opensAt: '20:50' }
                        ]
                    }
                ]
            },
            'Operator - 13 Jam': {
                rosterCheck: true, // dicek dari jadwal jaga harian (menu Jadwal Jaga Operator)
                dayGroups: [
                    {
                        days: [0, 1, 2, 3, 4, 5, 6], label: 'Setiap Hari', batasLambat: '04:40', toleransi: 10,
                        sessions: [
                            { label: 'Masuk', field: 'clockIn', time: '04:30', opensAt: '04:15' },
                            { label: 'Istirahat Keluar', field: 'breakStart', time: '13:00', opensAt: '12:45' },
                            { label: 'Istirahat Masuk', field: 'breakEnd', time: '15:30', opensAt: '15:15' },
                            { label: 'Pulang', field: 'clockOut', time: '20:00', opensAt: '19:50' }
                        ]
                    }
                ]
            }
        };
    },

    bindEvents() {
        const btnSimpan = document.getElementById('ssc-btn-simpan');
        const btnTambah = document.getElementById('ssc-btn-tambah-jenis');
        const btnPulihkan = document.getElementById('ssc-btn-pulihkan-default');
        if (btnSimpan) btnSimpan.onclick = () => this.saveData();
        if (btnTambah) btnTambah.onclick = () => this.addJenisJadwal();
        if (btnPulihkan) btnPulihkan.onclick = () => this.restoreMissingDefaults();
    },

    // Kembalikan Jenis Jadwal bawaan (Reguler, Jaga Malam, SATPAM, TRD,
    // Operator - BNA Amuntai, Operator - 24/18/16/13 Jam) yang pernah
    // terhapus (mis. tidak sengaja diklik "Hapus" lalu ke-save). HANYA
    // menambahkan yang namanya BELUM ada di config sekarang - Jenis Jadwal
    // yang sudah ada (termasuk yang sudah admin ganti nama/jamnya, seperti
    // "Operator - 18 Jam (Babirik)") TIDAK disentuh/ditimpa sama sekali.
    restoreMissingDefaults() {
        const defaults = this._defaultConfig();
        const missingKeys = Object.keys(defaults).filter(k => !this.config[k]);

        if (missingKeys.length === 0) {
            toast.success('Semua Jenis Jadwal bawaan sudah ada, tidak ada yang perlu dipulihkan.');
            return;
        }

        if (!confirm(`Jenis Jadwal bawaan berikut belum ada / pernah terhapus dan akan ditambahkan kembali:\n\n${missingKeys.join('\n')}\n\nJenis Jadwal lain yang sudah ada TIDAK akan diubah. Lanjutkan?`)) return;

        missingKeys.forEach(k => { this.config[k] = defaults[k]; });
        this._markDirty();
        this.render();
        toast.success(`${missingKeys.length} Jenis Jadwal bawaan dipulihkan - jangan lupa klik "Simpan Semua".`);
    },

    async saveData() {
        try {
            const result = await api.saveSetting(SHIFT_TYPES_SETTING_KEY, JSON.stringify(this.config));
            if (result && result.success) {
                this._dirty = false;
                toast.success('Jam kerja berhasil disimpan. Berlaku langsung untuk proses absen.');
            } else {
                toast.error('Gagal menyimpan. Coba lagi.');
            }
        } catch (e) {
            console.error('Gagal menyimpan konfigurasi Jenis Jadwal:', e);
            toast.error('Gagal menyimpan. Periksa koneksi internet Anda.');
        }
    },

    addJenisJadwal() {
        const input = document.getElementById('ssc-new-jenis-nama');
        if (input) input.value = '';
        const rosterCheckbox = document.getElementById('ssc-new-jenis-roster');
        if (rosterCheckbox) rosterCheckbox.checked = false;
        const modal = document.getElementById('modal-tambah-jenis-jadwal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => input?.focus(), 50);
        }
    },

    closeAddJenisJadwalModal() {
        const modal = document.getElementById('modal-tambah-jenis-jadwal');
        if (modal) modal.style.display = 'none';
    },

    confirmAddJenisJadwal() {
        const input = document.getElementById('ssc-new-jenis-nama');
        const nama = (input?.value || '').trim();
        if (!nama) {
            toast.error('Nama Jenis Jadwal wajib diisi.');
            return;
        }
        if (this.config[nama]) {
            toast.warning('Jenis Jadwal ini sudah ada.');
            return;
        }

        const isRoster = document.getElementById('ssc-new-jenis-roster')?.checked;

        this.config[nama] = isRoster
            // Jadwal Operator (roster harian) - berlaku "Setiap Hari" dan
            // ditandai rosterCheck:true supaya Attendance.gs mewajibkan
            // karyawan terjadwal dulu di menu Jadwal Jaga Operator sebelum
            // bisa absen (persis pola "Operator - 24 Jam" dkk bawaan).
            // Jam & sesinya (Masuk/Istirahat/Pulang) tetap bisa diatur
            // manual di kartu ini sama seperti Jenis Jadwal biasa.
            ? {
                rosterCheck: true,
                dayGroups: [
                    { days: [0, 1, 2, 3, 4, 5, 6], label: 'Setiap Hari', batasLambat: '08:10', toleransi: 10,
                      sessions: [
                          { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' },
                          { label: 'Pulang', field: 'clockOut', time: '16:00', opensAt: '15:45' }
                      ] }
                ]
            }
            : {
                dayGroups: [
                    { days: [1, 2, 3, 4, 5], label: 'Senin - Jumat', batasLambat: '08:00', toleransi: 10,
                      sessions: [
                          { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' },
                          { label: 'Pulang', field: 'clockOut', time: '16:00', opensAt: '15:45' }
                      ] },
                    { days: [6], label: 'Sabtu', libur: true },
                    { days: [0], label: 'Minggu', libur: true }
                ]
            };
        this._markDirty();
        this.render();
        this.closeAddJenisJadwalModal();
    },

    removeJenisJadwal(key) {
        if (!confirm(`Hapus Jenis Jadwal "${key}"? Karyawan yang masih pakai jenis ini nanti otomatis dianggap "Reguler (Sen-Kam)" sampai diganti.`)) return;
        delete this.config[key];
        this._markDirty();
        this.render();
    },

    // Betulkan Jenis Jadwal lama (dibuat sebelum ada opsi roster di modal
    // Tambah) supaya jadi roster Operator yang sebenarnya: rosterCheck:true
    // + berlaku "Setiap Hari" (bukan Senin-Jumat) - dicek dari menu Jadwal
    // Jaga Operator sebelum karyawan boleh absen. Jam & sesi yang sudah
    // diatur admin sebelumnya (kelompok hari pertama) TETAP dipakai, cuma
    // hari berlakunya yang diubah jadi Setiap Hari dan kelompok hari
    // "libur" (mis. Sabtu/Minggu) dibuang karena Operator biasanya tetap
    // jaga di akhir pekan.
    makeShiftIntoRoster(shiftKey) {
        const shiftConfig = this.config[shiftKey];
        if (!shiftConfig || shiftConfig.rosterCheck) return;

        if (!confirm(`Jadikan "${shiftKey}" sebagai Jenis Jadwal Operator (roster harian)?\n\nJam kerja yang sudah diatur akan dipakai untuk SEMUA hari (Setiap Hari, termasuk Sabtu/Minggu), dan mulai sekarang karyawan dengan Jenis Jadwal ini WAJIB terjadwal dulu di menu "Jadwal Jaga Operator" sebelum bisa absen.`)) return;

        const dayGroups = shiftConfig.dayGroups || [];
        const acuan = dayGroups.find(g => !g.libur) || dayGroups[0] || {
            batasLambat: '08:00', toleransi: 10,
            sessions: [
                { label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' },
                { label: 'Pulang', field: 'clockOut', time: '16:00', opensAt: '15:45' }
            ]
        };

        this.config[shiftKey] = {
            rosterCheck: true,
            dayGroups: [
                {
                    days: [0, 1, 2, 3, 4, 5, 6],
                    label: 'Setiap Hari',
                    batasLambat: acuan.batasLambat,
                    toleransi: acuan.toleransi || 0,
                    sessions: acuan.sessions || []
                }
            ]
        };

        this._markDirty();
        this.render();
        toast.success(`"${shiftKey}" sekarang jadi roster Operator - jangan lupa klik "Simpan Semua" di bawah.`);
    },

    addDayGroup(shiftKey) {
        this.config[shiftKey].dayGroups.push({
            days: [], label: 'Grup Baru', batasLambat: '08:00', toleransi: 0,
            sessions: [{ label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' }]
        });
        this._markDirty();
        this.render();
    },

    removeDayGroup(shiftKey, groupIdx) {
        this.config[shiftKey].dayGroups.splice(groupIdx, 1);
        this._markDirty();
        this.render();
    },

    addSession(shiftKey, groupIdx) {
        const group = this.config[shiftKey].dayGroups[groupIdx];
        if (!group.sessions) group.sessions = [];
        group.sessions.push({ label: 'Sesi Baru', field: 'clockIn', time: '08:00', opensAt: '07:45' });
        this._markDirty();
        this.render();
    },

    removeSession(shiftKey, groupIdx, sessionIdx) {
        this.config[shiftKey].dayGroups[groupIdx].sessions.splice(sessionIdx, 1);
        this._markDirty();
        this.render();
    },

    _markDirty() { this._dirty = true; },

    render() {
        const wrap = document.getElementById('ssc-list');
        if (!wrap) return;

        const keys = Object.keys(this.config);
        if (!keys.length) {
            wrap.innerHTML = '<p class="ssc-empty-msg">Belum ada Jenis Jadwal. Klik "Tambah Jenis Jadwal" untuk mulai.</p>';
            return;
        }

        wrap.innerHTML = keys.map(key => this._renderShiftCard(key)).join('');
        this._bindCardEvents();
    },

    _renderShiftCard(shiftKey) {
        const shiftConfig = this.config[shiftKey];

        // Jenis Jadwal dengan shiftOptions (BNA Amuntai, SATPAM) - jamnya
        // ditentukan per shift (Pagi/Siang/Malam), bukan per hari-dalam-
        // minggu. "Hari ini pakai shift yang mana" dibaca dari menu Jadwal
        // Jaga Operator (rosterCheck), bukan diatur di sini.
        if (shiftConfig.shiftOptions) {
            return this._renderRosterCheckCard(shiftKey, shiftConfig);
        }

        const rosterBadge = shiftConfig.rosterCheck
            ? '<span class="ssc-roster-badge" title="Karyawan dengan Jenis Jadwal ini juga harus terjadwal di menu Jadwal Jaga Operator hari itu, baru bisa absen">🔒 Dicek dari Jadwal Jaga Operator</span>'
            : '';

        // Jenis Jadwal lama yang dibuat sebelum ada opsi "Ini Jenis Jadwal
        // Operator (roster harian)" di modal Tambah - kalau namanya
        // kelihatan seperti Operator (mis. "Operator - 18 Jam (Babirik)")
        // tapi belum rosterCheck, sediakan tombol untuk membetulkannya di
        // sini, tanpa perlu hapus & buat ulang (nanti kehilangan jam yang
        // sudah diatur admin).
        const makeRosterBtn = !shiftConfig.rosterCheck
            ? `<button class="btn-secondary ssc-make-roster" data-shift="${this._escAttr(shiftKey)}" title="Jadikan Jenis Jadwal ini roster harian Operator (berlaku Setiap Hari, dicek dari Jadwal Jaga Operator)" style="font-size:0.75rem;padding:4px 10px;">
                <i class="fas fa-people-arrows"></i> Jadikan Jadwal Operator
              </button>`
            : '';

        const groupsHtml = (shiftConfig.dayGroups || []).map((g, gIdx) => this._renderDayGroup(shiftKey, g, gIdx)).join('');

        return `
            <div class="ssc-card" data-shift="${this._escAttr(shiftKey)}">
                <div class="ssc-card-header">
                    <h3>${this._escAttr(shiftKey)} ${rosterBadge}</h3>
                    <div style="display:flex;align-items:center;gap:6px;">
                        ${makeRosterBtn}
                        <button class="btn-icon-danger ssc-remove-shift" data-shift="${this._escAttr(shiftKey)}" title="Hapus Jenis Jadwal">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="ssc-groups">${groupsHtml}</div>
                <button class="btn-secondary ssc-add-group" data-shift="${this._escAttr(shiftKey)}">
                    <i class="fas fa-plus"></i> Tambah Kelompok Hari
                </button>
            </div>
        `;
    },

    // Kartu untuk Jenis Jadwal dengan 3 shift bergilir (Pagi/Siang/Malam) -
    // "siapa dapat shift apa hari ini" diatur di menu Jadwal Jaga Operator,
    // di sini admin cuma atur JAM tiap shift-nya saja.
    _renderRosterCheckCard(shiftKey, shiftConfig) {
        const optionsHtml = Object.keys(shiftConfig.shiftOptions).map(optKey => {
            const opt = shiftConfig.shiftOptions[optKey];
            const sessionsHtml = (opt.sessions || []).map((s, sIdx) => `
                <div class="ssc-session-row" data-session="${sIdx}">
                    <input type="text" class="ssc-input ssc-so-session-label" data-field="label" placeholder="Label" value="${this._escAttr(s.label || '')}">
                    <select class="ssc-input ssc-so-session-field" data-field="field">
                        <option value="clockIn" ${s.field === 'clockIn' ? 'selected' : ''}>Masuk (clockIn)</option>
                        <option value="clockOut" ${s.field === 'clockOut' ? 'selected' : ''}>Pulang (clockOut)</option>
                    </select>
                    <label>Jam target <input type="time" class="ssc-input ssc-so-session-time" data-field="time" value="${this._escAttr(s.time || '')}"></label>
                    <label>Mulai bisa absen <input type="time" class="ssc-input ssc-so-session-opens" data-field="opensAt" value="${this._escAttr(s.opensAt || '')}"></label>
                </div>
            `).join('');

            return `
                <div class="ssc-shift-option" data-shift="${this._escAttr(shiftKey)}" data-opt="${optKey}">
                    <div class="ssc-shift-option-header">
                        <input type="text" class="ssc-input ssc-so-label" data-field="label" value="${this._escAttr(opt.label || optKey)}">
                        <label>Batas terlambat <input type="time" class="ssc-input ssc-so-batas" data-field="batasLambat" value="${this._escAttr(opt.batasLambat || '')}"></label>
                        <label>Toleransi (menit) <input type="number" min="0" class="ssc-input ssc-so-toleransi" data-field="toleransi" value="${opt.toleransi != null ? opt.toleransi : 0}"></label>
                    </div>
                    <div class="ssc-sessions">${sessionsHtml}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="ssc-card" data-shift="${this._escAttr(shiftKey)}">
                <div class="ssc-card-header">
                    <h3>${this._escAttr(shiftKey)} <span class="ssc-roster-badge" title="Siapa dapat shift Pagi/Siang/Malam hari ini diatur di menu Jadwal Jaga Operator, bukan di sini">🔒 3 shift bergilir - siapa dapat shift apa diatur di Jadwal Jaga Operator</span></h3>
                    <button class="btn-icon-danger ssc-remove-shift" data-shift="${this._escAttr(shiftKey)}" title="Hapus Jenis Jadwal">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="ssc-shift-options">${optionsHtml}</div>
            </div>
        `;
    },

    _renderDayGroup(shiftKey, group, groupIdx) {
        if (group.libur) {
            return `
                <div class="ssc-group ssc-group-libur" data-shift="${this._escAttr(shiftKey)}" data-group="${groupIdx}">

                    <div class="ssc-group-row">
                        <input type="text" class="ssc-input ssc-group-label" data-field="label" placeholder="Nama kelompok (mis. Minggu)" value="${this._escAttr(group.label || '')}">
                        ${this._renderDayCheckboxes(shiftKey, groupIdx, group.days || [])}
                        <label class="ssc-libur-toggle">
                            <input type="checkbox" class="ssc-libur-checkbox" checked> Libur (tidak ada sesi absen)
                        </label>
                        <button class="btn-icon-danger ssc-remove-group" title="Hapus kelompok"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }

        const sessionsHtml = (group.sessions || []).map((s, sIdx) => `
            <div class="ssc-session-row" data-session="${sIdx}">
                <input type="text" class="ssc-input ssc-session-label" data-field="label" placeholder="Label (mis. Masuk)" value="${this._escAttr(s.label || '')}">
                <select class="ssc-input ssc-session-field" data-field="field">
                    <option value="clockIn" ${s.field === 'clockIn' ? 'selected' : ''}>Masuk (clockIn)</option>
                    <option value="breakStart" ${s.field === 'breakStart' ? 'selected' : ''}>Istirahat Keluar (breakStart)</option>
                    <option value="breakEnd" ${s.field === 'breakEnd' ? 'selected' : ''}>Istirahat Masuk (breakEnd)</option>
                    <option value="clockOut" ${s.field === 'clockOut' ? 'selected' : ''}>Pulang (clockOut)</option>
                </select>
                <label>Jam target <input type="time" class="ssc-input ssc-session-time" data-field="time" value="${this._escAttr(s.time || '')}"></label>
                <label>Mulai bisa absen <input type="time" class="ssc-input ssc-session-opens" data-field="opensAt" value="${this._escAttr(s.opensAt || '')}"></label>
                <button class="btn-icon-danger ssc-remove-session" title="Hapus sesi"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');

        return `
            <div class="ssc-group" data-shift="${this._escAttr(shiftKey)}" data-group="${groupIdx}">
                <div class="ssc-group-row">
                    <input type="text" class="ssc-input ssc-group-label" data-field="label" placeholder="Nama kelompok (mis. Senin-Kamis)" value="${this._escAttr(group.label || '')}">
                    ${this._renderDayCheckboxes(shiftKey, groupIdx, group.days || [])}
                    <label class="ssc-libur-toggle">
                        <input type="checkbox" class="ssc-libur-checkbox"> Libur (tidak ada sesi absen)
                    </label>
                    <button class="btn-icon-danger ssc-remove-group" title="Hapus kelompok"><i class="fas fa-trash"></i></button>
                </div>
                <div class="ssc-batas-row">
                    <label>Batas terlambat <input type="time" class="ssc-input ssc-batas-lambat" data-field="batasLambat" value="${this._escAttr(group.batasLambat || '')}"></label>
                    <label>Toleransi (menit) <input type="number" min="0" class="ssc-input ssc-toleransi" data-field="toleransi" value="${group.toleransi != null ? group.toleransi : 0}"></label>
                </div>
                <div class="ssc-sessions">${sessionsHtml}</div>
                <button class="btn-secondary ssc-add-session" data-shift="${this._escAttr(shiftKey)}" data-group="${groupIdx}">
                    <i class="fas fa-plus"></i> Tambah Sesi
                </button>
            </div>
        `;
    },

    _renderDayCheckboxes(shiftKey, groupIdx, selectedDays) {
        const boxes = HARI_OPTIONS.map(h => `
            <label class="ssc-day-chip">
                <input type="checkbox" class="ssc-day-checkbox" value="${h.value}" ${selectedDays.includes(h.value) ? 'checked' : ''}>
                ${h.label}
            </label>
        `).join('');
        return `<div class="ssc-days">${boxes}</div>`;
    },

    _bindCardEvents() {
        const wrap = document.getElementById('ssc-list');
        if (!wrap) return;

        wrap.querySelectorAll('.ssc-remove-shift').forEach(btn => {
            btn.onclick = () => this.removeJenisJadwal(btn.dataset.shift);
        });

        wrap.querySelectorAll('.ssc-make-roster').forEach(btn => {
            btn.onclick = () => this.makeShiftIntoRoster(btn.dataset.shift);
        });

        // ── Kartu shiftOptions (BNA Amuntai / SATPAM) ──
        wrap.querySelectorAll('.ssc-shift-option').forEach(optEl => {
            const shiftKey = optEl.dataset.shift;
            const optKey = optEl.dataset.opt;
            const opt = this.config[shiftKey].shiftOptions[optKey];

            const labelEl = optEl.querySelector('.ssc-so-label');
            if (labelEl) labelEl.oninput = () => { opt.label = labelEl.value; this._markDirty(); };

            const batasEl = optEl.querySelector('.ssc-so-batas');
            if (batasEl) batasEl.oninput = () => { opt.batasLambat = batasEl.value; this._markDirty(); };

            const toleransiEl = optEl.querySelector('.ssc-so-toleransi');
            if (toleransiEl) toleransiEl.oninput = () => { opt.toleransi = parseInt(toleransiEl.value, 10) || 0; this._markDirty(); };

            optEl.querySelectorAll('.ssc-session-row').forEach(sessionEl => {
                const sessionIdx = parseInt(sessionEl.dataset.session, 10);
                const session = opt.sessions[sessionIdx];

                const sLabel = sessionEl.querySelector('.ssc-so-session-label');
                if (sLabel) sLabel.oninput = () => { session.label = sLabel.value; this._markDirty(); };

                const sField = sessionEl.querySelector('.ssc-so-session-field');
                if (sField) sField.onchange = () => { session.field = sField.value; this._markDirty(); };

                const sTime = sessionEl.querySelector('.ssc-so-session-time');
                if (sTime) sTime.oninput = () => { session.time = sTime.value; this._markDirty(); };

                const sOpens = sessionEl.querySelector('.ssc-so-session-opens');
                if (sOpens) sOpens.oninput = () => { session.opensAt = sOpens.value; this._markDirty(); };
            });
        });

        wrap.querySelectorAll('.ssc-add-group').forEach(btn => {
            btn.onclick = () => this.addDayGroup(btn.dataset.shift);
        });
        wrap.querySelectorAll('.ssc-remove-group').forEach(btn => {
            const groupEl = btn.closest('.ssc-group');
            btn.onclick = () => this.removeDayGroup(groupEl.dataset.shift, parseInt(groupEl.dataset.group, 10));
        });
        wrap.querySelectorAll('.ssc-add-session').forEach(btn => {
            btn.onclick = () => this.addSession(btn.dataset.shift, parseInt(btn.dataset.group, 10));
        });
        wrap.querySelectorAll('.ssc-remove-session').forEach(btn => {
            const groupEl = btn.closest('.ssc-group');
            const sessionEl = btn.closest('.ssc-session-row');
            btn.onclick = () => this.removeSession(groupEl.dataset.shift, parseInt(groupEl.dataset.group, 10), parseInt(sessionEl.dataset.session, 10));
        });

        wrap.querySelectorAll('.ssc-group').forEach(groupEl => {
            const shiftKey = groupEl.dataset.shift;
            const groupIdx = parseInt(groupEl.dataset.group, 10);
            const group = this.config[shiftKey].dayGroups[groupIdx];

            const labelInput = groupEl.querySelector('.ssc-group-label');
            if (labelInput) labelInput.oninput = () => { group.label = labelInput.value; this._markDirty(); };

            groupEl.querySelectorAll('.ssc-day-checkbox').forEach(cb => {
                cb.onchange = () => {
                    const day = parseInt(cb.value, 10);
                    group.days = group.days || [];
                    if (cb.checked) {
                        if (!group.days.includes(day)) group.days.push(day);
                    } else {
                        group.days = group.days.filter(d => d !== day);
                    }
                    this._markDirty();
                };
            });

            const liburCb = groupEl.querySelector('.ssc-libur-checkbox');
            if (liburCb) liburCb.onchange = () => {
                if (liburCb.checked) {
                    group.libur = true;
                    delete group.sessions;
                    delete group.batasLambat;
                    delete group.toleransi;
                } else {
                    delete group.libur;
                    group.sessions = [{ label: 'Masuk', field: 'clockIn', time: '08:00', opensAt: '07:45' }];
                    group.batasLambat = '08:00';
                    group.toleransi = 0;
                }
                this._markDirty();
                this.render();
            };

            const batasInput = groupEl.querySelector('.ssc-batas-lambat');
            if (batasInput) batasInput.oninput = () => { group.batasLambat = batasInput.value; this._markDirty(); };

            const toleransiInput = groupEl.querySelector('.ssc-toleransi');
            if (toleransiInput) toleransiInput.oninput = () => { group.toleransi = parseInt(toleransiInput.value, 10) || 0; this._markDirty(); };

            groupEl.querySelectorAll('.ssc-session-row').forEach(sessionEl => {
                const sessionIdx = parseInt(sessionEl.dataset.session, 10);
                const session = group.sessions[sessionIdx];

                const labelEl = sessionEl.querySelector('.ssc-session-label');
                if (labelEl) labelEl.oninput = () => { session.label = labelEl.value; this._markDirty(); };

                const fieldEl = sessionEl.querySelector('.ssc-session-field');
                if (fieldEl) fieldEl.onchange = () => { session.field = fieldEl.value; this._markDirty(); };

                const timeEl = sessionEl.querySelector('.ssc-session-time');
                if (timeEl) timeEl.oninput = () => { session.time = timeEl.value; this._markDirty(); };

                const opensEl = sessionEl.querySelector('.ssc-session-opens');
                if (opensEl) opensEl.oninput = () => { session.opensAt = opensEl.value; this._markDirty(); };
            });
        });
    },

    _escAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
};

function initShiftSchedule() { shiftSchedule.init(); }

window.shiftSchedule = shiftSchedule;
window.initShiftSchedule = initShiftSchedule;
