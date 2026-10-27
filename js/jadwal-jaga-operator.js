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
        // PERBAIKAN (2026-09-01, atas permintaan): diubah dari 'multi-solo'
        // (dropdown, 1 nama per sesi) ke 'multi-grup' (checkbox, boleh lebih
        // dari 1 nama per sesi) - sama seperti BNA Amuntai. Aman untuk
        // jadwal SATPAM yang SUDAH tersimpan sebelumnya (format lama 1 nama
        // per sesi) karena checkOperatorRosterForToday() di
        // Operatorschdule.gs (backend) sudah menangani kedua bentuk data
        // (satu ID string ATAU array ID) dengan cara yang sama persis sejak
        // awal - lihat komentar di sana.
        pattern: 'multi-grup',
        sessions: [
            { key: 'pagi',  label: 'Pagi',  time: '07.00 - 15.00' },
            { key: 'siang', label: 'Siang', time: '15.00 - 23.00' },
            { key: 'malam', label: 'Malam', time: '23.00 - 07.00' }
        ]
    },
    // PERBAIKAN (2026-09-01, atas permintaan): semua unit SPAM di bawah ini
    // (pattern 'kontinu'/'kontinu-split') dapat tambahan multiPetugas: true
    // - artinya kolom "Nama Petugas"-nya SEKARANG checkbox (boleh centang
    // lebih dari 1 nama sekaligus, sama seperti BNA Amuntai/SATPAM di
    // atas), bukan dropdown 1 nama lagi. Field jam (jamLabel) & struktur "1
    // baris per hari" (bukan multi-sesi pagi/siang/malam) TIDAK berubah -
    // itu murni soal jam operasionalnya (masih 1 blok jam per hari), beda
    // dari isu jumlah petugas. Lihat _renderKontinu()/_bindInputs() di
    // bawah, dan checkOperatorRosterForToday() di Operatorschdule.gs
    // (backend) yang sudah disesuaikan mendukung dayData.petugas berbentuk
    // array ID (checkbox baru) MAUPUN 1 ID string (data lama yang sudah
    // kadung tersimpan sebelum perubahan ini) - jadi jadwal bulan-bulan
    // sebelumnya yang sudah diisi tetap terbaca normal.
    'SPAM Babirik': {
        label: 'Unit SPAM Babirik',
        pattern: 'kontinu', // 1 blok jam/hari, gantian per hari - boleh lebih dari 1 orang/hari (checkbox)
        multiPetugas: true,
        jamLabel: '18 Jam (04.00 - 22.00)'
    },
    'SPAM Danau Panggang': {
        label: 'Unit SPAM Danau Panggang',
        pattern: 'kontinu',
        multiPetugas: true,
        jamLabel: '16 Jam (05.00 - 21.00)'
    },
    'SPAM Paminggir': {
        label: 'Unit SPAM Paminggir',
        pattern: 'kontinu-split', // 2 blok jam terpisah (ada jeda/istirahat)
        multiPetugas: true,
        jamLabel: '13 Jam (04.30 - 13.00) (15.30 - 20.00)'
    },
    'SPAM Muara Tapus':     { label: 'Unit SPAM Muara Tapus',     pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Sungai Tabukan':  { label: 'Unit SPAM Sungai Tabukan',  pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Alabio':          { label: 'Unit SPAM Alabio',          pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Rantau Bujur':    { label: 'Unit SPAM Rantau Bujur',    pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Banjang':         { label: 'Unit SPAM Banjang',         pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Tangkawang':      { label: 'Unit SPAM Tangkawang',      pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Telaga Silaba':   { label: 'Unit SPAM Telaga Silaba',   pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Jarang Kuantan':  { label: 'Unit SPAM Jarang Kuantan',  pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    'SPAM Muara Baruh':     { label: 'Unit SPAM Muara Baruh',     pattern: 'kontinu', multiPetugas: true, jamLabel: '24 Jam (00.00 - 24.00)' },
    // PERBAIKAN (2026-09-01, atas permintaan): TRD sebelumnya 1 unit
    // tunggal dengan input teks bebas "Nama Cabang TRD" (semua karyawan
    // TRD tampil dicentang di cabang mana pun, admin harus tahu sendiri
    // siapa di cabang mana). Sekarang dipecah jadi 4 unit terpisah persis
    // seperti unit lain (BNA Amuntai, Cabang I/II/III) - karyawannya
    // OTOMATIS terfilter per cabang lewat field "Unit Jaga" di Data
    // Karyawan (lihat p-unitJaga di index.html: "TRD - BNA Amuntai" /
    // "TRD - Cabang I" / "TRD - Cabang II" / "TRD - Cabang III"), sama
    // persis mekanismenya dengan unit SPAM yang difilter dari Unit
    // Wilayah - TIDAK perlu input cabang manual lagi.
    'TRD - BNA Amuntai': {
        label: 'TRD - BNA Amuntai',
        pattern: 'multi-grup',
        sessions: [ { key: 'piket', label: 'Piket', time: 'Jam Bebas' } ]
    },
    'TRD - Cabang I': {
        label: 'TRD - Cabang I',
        pattern: 'multi-grup',
        sessions: [ { key: 'piket', label: 'Piket', time: 'Jam Bebas' } ]
    },
    'TRD - Cabang II': {
        label: 'TRD - Cabang II',
        pattern: 'multi-grup',
        sessions: [ { key: 'piket', label: 'Piket', time: 'Jam Bebas' } ]
    },
    'TRD - Cabang III': {
        label: 'TRD - Cabang III',
        pattern: 'multi-grup',
        sessions: [ { key: 'piket', label: 'Piket', time: 'Jam Bebas' } ]
    }
};

const BULAN_NAMA = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI_NAMA  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

// Key setting yang sama dipakai halaman "Jadwal Shift" (lihat
// SHIFT_TYPES_SETTING_KEY di js/shift-schedule.js) - didefinisikan ULANG
// sebagai konstanta lokal di sini (bukan dipakai bareng lintas file)
// supaya file ini TIDAK bergantung pada urutan <script> di index.html.

const JJO_SHIFT_TYPES_SETTING_KEY = 'shift_types_config';

const jadwalJagaOperator = {
    unitKey: '',
    cabangTrd: '', // hanya dipakai kalau unitKey === 'TRD'
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    data: null,       // { days: {...}, signatures: {...} }
    _allSettings: {}, // cache semua settings dari server (supaya save 1 key tidak perlu reload semua)
    _employees: [],   // semua karyawan Jenis Jadwal-nya termasuk pola jaga operator (lihat _isOperatorShift)
    _dirty: false,
    // Diisi begitu halaman ini dibuka oleh Asmen (BUKAN admin) yang ditunjuk
    // sebagai pemegang jadwal 1 atau lebih unit tertentu (lihat
    // operatorScheduleUnit di Data Karyawan, teks dipisah koma kalau lebih
    // dari 1 unit) - kalau terisi, dropdown Unit cuma berisi unit-unit ini
    // saja, Asmen tidak bisa lihat/pilih unit lain. Array kosong berarti
    // tidak dibatasi (kasus normal: admin, selalu bisa akses SEMUA unit).
    _restrictedUnits: [],

    async init() {
        // Yang boleh buka halaman ini: (1) Admin - akses semua unit seperti
        // biasa, TIDAK PERNAH dibatasi field operatorScheduleUnit, atau
        // (2) karyawan berjabatan Asmen (auth.isAsmen(), sudah sadar soal
        // Mode Karyawan admin rangkap) YANG DITUNJUK admin sebagai
        // pemegang jadwal 1/lebih unit (operatorScheduleUnit di Data
        // Karyawan tidak kosong) - dikunci cuma ke unit-unit itu saja.
        // Karyawan yang diberi menu ini lewat "Bagikan Menu Admin" (Data Karyawan) diperlakukan seperti Admin: semua unit.
        const isAdminUser = auth.isAdmin() || auth.hasSharedMenu('jadwal-jaga-operator');
        const assignedUnits = (!isAdminUser && auth.isAsmen() && auth.currentUser)
            ? String(auth.currentUser.operatorScheduleUnit || '').split(',').map(s => s.trim()).filter(Boolean)
            : [];

        if (!isAdminUser && assignedUnits.length === 0) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }
        this._restrictedUnits = assignedUnits;

        // Kunci jadwal (Settings > Kunci Jadwal Jaga Operator): kalau ON, tabel
        // jadwal tidak bisa diedit user selain Admin. Dibaca ulang tiap halaman dibuka.
        await this._loadLockState();

        // Cache jadwal per unit/bulan dikosongkan tiap halaman ini dibuka
        // ulang (lihat loadAndRender()) supaya data selalu segar saat masuk.
        this._rosterCache = {};

        // PERBAIKAN PERFORMA (1 Oktober 2026): SEBELUMNYA dua panggilan di
        // bawah ini dijalankan BERURUTAN (daftar karyawan dulu, baru
        // konfigurasi), padahal keduanya tidak saling bergantung - sekarang
        // dijalankan BERSAMAAN, jadi waktu tunggunya kira-kira cuma yang
        // paling lama di antara keduanya, bukan dijumlahkan. Masing-masing
        // sudah punya try/catch sendiri, jadi kegagalan satu tidak
        // membatalkan yang lain.
        await Promise.all([
            this._loadEmployees(),
            this._loadShiftTypesConfig()
        ]);
        this._populateUnitSelect();
        this._populateMonthYearSelect();
        this.bindEvents();

        const unitSelect = document.getElementById('jjo-unit');

        if (this._restrictedUnits.length > 0) {
            // Asmen pemegang 1/lebih unit - default-kan ke unit pertama di
            // daftarnya. Kalau cuma pegang 1 unit, dropdown dikunci
            // (disabled) karena tidak ada pilihan lain yang relevan; kalau
            // pegang beberapa unit, dropdown tetap AKTIF supaya bisa
            // pindah-pindah, tapi isinya sudah dibatasi cuma unit-unit
            // miliknya (lihat _populateUnitSelect). Selebihnya (isi nama
            // petugas, simpan, cetak) PERSIS sama seperti admin - Asmen
            // memang sengaja diberi hak kelola penuh utk unit yang jadi
            // tanggung jawabnya.
            if (unitSelect) {
                unitSelect.value = this._restrictedUnits[0];
                unitSelect.disabled = this._restrictedUnits.length === 1;
            }
            this.unitKey = this._restrictedUnits[0];
            const isTrd = this.unitKey === 'TRD';
            const cabangWrap = document.getElementById('jjo-cabang-wrap');
            if (cabangWrap) cabangWrap.style.display = isTrd ? '' : 'none';
            await this.loadAndRender();
        } else if (unitSelect && unitSelect.value) {
            this.unitKey = unitSelect.value;
            await this.loadAndRender();
        }
    },

    // PERBAIKAN PERFORMA (1 Oktober 2026): halaman ini cuma memakai SATU
    // entri Settings (shift_types_config, dibaca _getEffectiveUnit()) -
    // SEBELUMNYA yang diambil api.getSettings(), yaitu SELURUH sheet
    // Settings (termasuk jadwal jaga bulanan SEMUA unit, JSON-nya besar).
    // Sekarang cukup ambil 1 key itu lewat api.getSettingByKey() (endpoint
    // yang sama dengan yang dipakai loadAndRender()). _allSettings tetap
    // berbentuk { shift_types_config: '...' } sehingga pembacanya tidak
    // perlu diubah.
    // ── Kunci jadwal ──────────────────────────────────────────────
    // Setting "jadwal_jaga_operator_lock" ('true'/'false', diatur Admin di
    // Settings). Admin tidak pernah terkunci. Kalau gagal dibaca, dianggap
    // tidak terkunci supaya halaman tidak macet.
    _locked: false,

    async _loadLockState() {
        this._locked = false;
        if (auth.isAdmin()) return;
        try {
            const res = await api.getSettingByKey('jadwal_jaga_operator_lock');
            this._locked = !!(res && res.success && String(res.data).toLowerCase() === 'true');
        } catch (e) {
            console.error('Gagal membaca status kunci jadwal:', e);
        }
    },

    _notifyLocked() {
        if (window.toast && toast.warning) toast.warning('Jadwal dikunci Admin, tidak bisa diedit.');
    },

    // Matikan semua kontrol EDIT di tabel jadwal (centang/pilihan petugas,
    // catatan, Salin kemarin, Kosongkan, daftar petugas). Filter ("Tampilkan
    // yang belum terisi saja", cari nama) & tombol di atas tabel tetap aktif.
    _applyLock() {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        wrap.classList.toggle('jjo-locked', !!this._locked);
        const upload = document.getElementById('jjo-btn-upload');
        if (upload) upload.disabled = !!this._locked;
        const banner = document.getElementById('jjo-lock-banner');
        if (banner) banner.remove();
        if (!this._locked) return;
        wrap.querySelectorAll('#jjo-days input, #jjo-days select, #jjo-days textarea, #jjo-days .jjo-tool')
            .forEach(el => { el.disabled = true; });
        const info = document.getElementById('jjo-unit-info');
        if (info) {
            const b = document.createElement('div');
            b.id = 'jjo-lock-banner';
            b.className = 'jjo-lock-banner';
            b.innerHTML = '<i class="fas fa-lock"></i> Jadwal dikunci Admin. Anda hanya bisa melihat, mencetak, dan export. Hubungi Admin untuk membuka kunci.';
            info.parentNode.insertBefore(b, info);
        }
    },

    async _loadShiftTypesConfig() {
        try {
            const res = await api.getSettingByKey(JJO_SHIFT_TYPES_SETTING_KEY);
            if (res && res.success && res.data) {
                this._allSettings = { [JJO_SHIFT_TYPES_SETTING_KEY]: res.data };
            }
        } catch (e) {
            console.error('Gagal memuat konfigurasi awal:', e);
        }
    },

    // Ambil karyawan yang Jenis Jadwal-nya termasuk pola jaga operator - ini
    // yang muncul sebagai pilihan petugas. Nama bebas-teks (Fase 1) sudah
    // diganti jadi pilih dari daftar ini supaya bisa dicocokkan otomatis
    // dengan karyawan yang login saat proses absen (lihat Attendance.gs).
    //
    // SENGAJA memakai field "Jenis Jadwal" (p-shift, dropdown terstruktur),
    // BUKAN field "Jabatan" (teks bebas) - supaya admin bisa isi Jabatan
    // apa saja (mis. "Operator Senior", "Kepala Regu") tanpa mempengaruhi
    // siapa yang muncul di daftar petugas jaga ini.
    async _loadEmployees() {
        try {
            const res = await api.getKaryawanList();
            const all = (res.success && res.data) ? res.data : [];
            this._employees = all.filter(e => this._isOperatorShift(e.shift));
            // PENAMBAHAN (2026-09-08, TTD Cetak Jadwal Jaga Operator):
            // simpan juga daftar LENGKAP semua karyawan (semua Jenis Jadwal,
            // semua Unit Wilayah) - dibutuhkan _signatureFor() di bawah untuk
            // menentukan nama "Diketahui Oleh"/"Dibuat Oleh" secara OTOMATIS
            // dari pengaturan Admin di Edit Karyawan (bukan dipilih user saat
            // mencetak). this._employees tetap dipakai persis seperti
            // sebelumnya untuk daftar petugas jaga, tidak diubah.
            this._allEmployeesRaw = all;
        } catch (e) {
            console.error('Gagal memuat daftar karyawan Operator:', e);
            toast.error('Gagal memuat daftar karyawan Operator.');
            this._employees = [];
            this._allEmployeesRaw = [];
        }
    },

    // PENAMBAHAN (2026-09-08): tentukan nama & jabatan untuk TTD "Diketahui
    // Oleh" (Manajer) dan "Dibuat Oleh" (Asmen) pada Cetak Jadwal Jaga
    // Operator - SEPENUHNYA otomatis dari pengaturan Admin di Edit Karyawan
    // (field "Pemegang Jadwal Jaga Operator" + "Manajer Mengetahui Jadwal
    // Jaga Operator"), BUKAN dipilih user saat mencetak.
    //
    // "Dibuat Oleh" = karyawan AKTIF berjabatan (role) "asmen" yang
    // ditunjuk sebagai pemegang unit ini (operatorScheduleUnit berisi
    // unitKey ini, diatur admin lewat checklist "Pemegang Jadwal Jaga
    // Operator" di Edit Karyawan).
    // "Diketahui Oleh" = Manajer yang dipilih admin di field
    // "Manajer Mengetahui Jadwal Jaga Operator" MILIK Asmen pemegang unit
    // itu (jjoManajerId).
    // Kalau tidak ada Asmen yang ditunjuk untuk unit ini (mis. unitnya
    // masih dipegang admin sendiri tanpa ditunjuk lewat checklist), kedua
    // nama dikosongkan (tetap tampil "(...........................)" seperti
    // sebelumnya di _buildPrintTable pemanggilnya).
    _signatureFor(unitKey) {
        const dibuat = (this._allEmployeesRaw || []).find(e => {
            if (String(e.role || '').toLowerCase() !== 'asmen') return false;
            if (String(e.statusKaryawan || '').toUpperCase() !== 'AKTIF') return false;
            const units = String(e.operatorScheduleUnit || '').split(',').map(s => s.trim()).filter(Boolean);
            return units.includes(unitKey);
        });

        let diketahui = null;
        if (dibuat && dibuat.jjoManajerId) {
            diketahui = (this._allEmployeesRaw || []).find(m =>
                String(m.id) === String(dibuat.jjoManajerId)
                && String(m.role || '').toLowerCase() === 'manajer'
                && String(m.statusKaryawan || '').toUpperCase() === 'AKTIF'
            );
        }

        return {
            dibuatNama:       dibuat ? dibuat.nama : '',
            dibuatJabatan:    dibuat ? (dibuat.jabatan || '') : '',
            diketahuiNama:    diketahui ? diketahui.nama : '',
            diketahuiJabatan: diketahui ? (diketahui.jabatan || '') : ''
        };
    },

    // true kalau Jenis Jadwal karyawan ini salah satu pola jaga unit operator
    // (lihat pilihan "Jenis Jadwal" di Data Karyawan / daftar OPERATOR_UNITS
    // di atas: Operator - BNA Amuntai/24 Jam/18 Jam/16 Jam/13 Jam, SATPAM,
    // TRD). Kalau nanti ada Jenis Jadwal operator baru ditambah di dropdown
    // p-shift, cukup pastikan namanya diawali "Operator" (atau tambahkan
    // exact-match baru di sini kalau namanya tidak diawali "Operator", 
    // seperti SATPAM/TRD).
    _isOperatorShift(shift) {
        const s = String(shift || '').trim().toLowerCase();
        return s.startsWith('operator') || s === 'satpam' || s === 'trd';
    },

    // Karyawan Operator yang ditugaskan di unit ini saja (berdasarkan Unit
    // Wilayah). Khusus TRD: karyawannya lintas cabang dan tidak ditandai
    // per-unitWilayah, jadi diambil dari Jenis Jadwal (shift) === 'trd'
    // langsung - semua karyawan TRD muncul sebagai checkbox, cabang (lihat
    // cabangTrd) cuma dipakai untuk memisahkan penyimpanan/judul cetak per
    // cabang, bukan untuk memfilter siapa yang muncul di checkbox.
    // PERBAIKAN (2026-09-01): TRD sekarang 4 unit terpisah (BNA
    // Amuntai/Cabang I/II/III, lihat OPERATOR_UNITS di atas) - karyawannya
    // difilter dari Unit Wilayah PERSIS SAMA seperti unit lain (baris di
    // bawah), jadi filter khusus "shift === trd" ini sudah TIDAK PERNAH
    // kepakai lagi (unitKey yang masuk ke sini sekarang selalu salah satu
    // dari 4 key baru itu, tidak pernah literal 'TRD' lagi) - dibiarkan
    // sebagai jaring pengaman kalau ada kode lama yang masih memanggil
    // dengan key lama.
    _employeesForUnit(unitKey) {
        if (unitKey === 'TRD') {
            return this._employees.filter(e => String(e.shift || '').trim().toLowerCase() === 'trd');
        }
        return this._employees.filter(e => String(e.unitWilayah || '') === unitKey);
    },

    _employeeName(id) {
        const emp = this._employees.find(e => String(e.id) === String(id));
        return emp ? emp.nama : '';
    },

    /**
     * Muat pustaka SheetJS (baca Excel/CSV) HANYA saat benar-benar
     * dipakai (baru tombol "Upload Jadwal" diklik), BUKAN dimuat di
     * index.html utk semua orang - fitur ini cuma dipakai Admin di
     * halaman ini saja, jadi tidak perlu ikut memperlambat load halaman
     * lain (sudah dioptimasi kecepatan loadingnya). Sekali termuat,
     * dipakai ulang (tidak diunduh dobel).
     */
    _ensureXlsxLib() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        if (this._xlsxLoadPromise) return this._xlsxLoadPromise;
        this._xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Gagal memuat pustaka pembaca Excel/CSV.'));
            document.head.appendChild(script);
        });
        return this._xlsxLoadPromise;
    },

    /**
     * Ubah teks tanggal dari file upload jadi nomor hari (1-31) - HANYA
     * kalau bulan & tahunnya cocok dengan yang sedang dibuka di halaman
     * ini (this.month/this.year) - baris dengan tanggal bulan lain
     * dilewati (lihat pemanggilnya). Format yang didukung: "DD/MM/YYYY"
     * dan "YYYY-MM-DD" (dua format tanggal paling umum dari Excel/CSV).
     */
    _parseUploadedDate(raw) {
        const s = String(raw || '').trim();
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
            const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, y = parseInt(m[3], 10);
            return (y === this.year && mo === this.month) ? d : null;
        }
        m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) {
            const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
            return (y === this.year && mo === this.month) ? d : null;
        }
        return null;
    },

    /**
     * FITUR BARU (2 September 2026, diperluas atas permintaan supaya semua
     * unit SPAM ikut kebagian): "Upload Jadwal" - baca file Excel/CSV
     * berisi jadwal jaga (kolom Tanggal, Sesi, Nama Petugas) lalu otomatis
     * centang/pilih nama petugas yang cocok di tabel (checkbox utk
     * multi-grup/kontinu mis. BNA Amuntai/SPAM, dropdown utk multi-solo
     * mis. SATPAM) - supaya Admin tidak perlu centang satu per satu secara
     * manual. Didukung utk SEMUA pola unit ('multi-grup', 'multi-solo',
     * 'kontinu', 'kontinu-split' - lihat toggle tombolnya di
     * renderTable()). Mencocokkan NAMA PERSIS (setelah di-trim & disamakan
     * huruf besar/kecilnya) dengan daftar karyawan unit ini
     * (this._employeesForUnit) - nama yang tidak ketemu dilaporkan lewat
     * toast di akhir, TIDAK menggagalkan baris lain. Tidak langsung Simpan
     * ke server - cuma mengisi state di layar (this.data, lalu render
     * ulang), Admin tetap perlu tinjau & tekan "Simpan" sendiri seperti
     * biasa (jaga-jaga kalau ada kekeliruan cocokkan sebelum tersimpan
     * permanen).
     */
    async _handleUploadJadwal(file) {
        if (this._locked) { this._notifyLocked(); return; }
        const unit = this._getEffectiveUnit(this.unitKey);
        const supportedPatterns = ['multi-grup', 'multi-solo', 'kontinu', 'kontinu-split'];
        if (!unit || supportedPatterns.indexOf(unit.pattern) === -1) {
            toast.warning('Unit ini belum didukung fitur Upload Jadwal.');
            return;
        }
        // Unit 'kontinu'/'kontinu-split' (SEMUA unit SPAM) cuma punya 1
        // "sesi"/hari (bukan Pagi/Siang/Malam terpisah seperti BNA
        // Amuntai/SATPAM) - namanya langsung tersimpan ke
        // this.data.days[day].petugas (array ID), BUKAN ke
        // this.data.days[day].sessions[key]. Kalau file uploadnya punya
        // lebih dari 1 baris utk tanggal yang sama, SEMUA nama di
        // baris-baris itu digabung jadi 1 array petugas hari itu (bukan
        // dianggap sesi berbeda seperti unit multi-grup).
        const isFlatPetugas = unit.pattern === 'kontinu' || unit.pattern === 'kontinu-split';

        try {
            await this._ensureXlsxLib();
        } catch (e) {
            console.error(e);
            toast.error('Gagal memuat pustaka pembaca Excel/CSV. Periksa koneksi internet Anda, lalu coba lagi.');
            return;
        }

        let rows;
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        } catch (e) {
            console.error('Gagal membaca file jadwal:', e);
            toast.error('Gagal membaca file. Pastikan formatnya Excel (.xlsx/.xls) atau CSV yang valid.');
            return;
        }

        if (!rows || rows.length < 2) {
            toast.error('File kosong atau tidak ada baris data.');
            return;
        }

        const header = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
        const idxTanggal = header.findIndex(h => h.includes('tanggal'));
        const idxNama    = header.findIndex(h => h.includes('petugas') || h.includes('nama'));
        if (idxTanggal === -1 || idxNama === -1) {
            toast.error('Format file tidak dikenali. Pastikan ada kolom "Tanggal" dan "Nama Petugas" (lihat keterangan di bawah tombol Upload).');
            return;
        }

        // PERUBAHAN (atas permintaan): sesi TIDAK dicocokkan dari
        // teksnya lagi (label/jam bisa beda-beda tiap file jadwal) -
        // sesi sekarang ditentukan dari URUTAN BARIS per tanggal: baris
        // pertama utk tanggal tsb dianggap sesi pertama unit ini
        // (mis. Pagi), baris kedua sesi kedua (Siang), dst., mengikuti
        // urutan sesi yang sudah didefinisikan di unit (unit.sessions).
        // Kalau ada baris LEBIH BANYAK dari jumlah sesi yang didefinisikan
        // utk tanggal yg sama, baris kelebihannya dilewati & dilaporkan.
        const sessionKeysInOrder = (unit.sessions || []).map(s => s.key);

        const unitEmployees = this._employeesForUnit(this.unitKey);
        const notFoundNames = new Set();
        const skippedDates = [];
        let extraRowsCount = 0;
        let matchedRows = 0;
        const rowCountPerDay = {};

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row.length) continue;

            const tglRaw  = String(row[idxTanggal] || '').trim();
            const namaRaw = String(row[idxNama] || '').trim();
            if (!tglRaw && !namaRaw) continue; // baris kosong, lewati diam-diam

            const day = this._parseUploadedDate(tglRaw);
            if (day === null) { if (tglRaw) skippedDates.push(tglRaw); continue; }

            const names = namaRaw.split(';').map(n => n.trim()).filter(Boolean);
            if (!names.length) continue;

            const matchedIds = [];
            names.forEach(n => {
                const emp = unitEmployees.find(e => String(e.nama || '').trim().toLowerCase() === n.toLowerCase());
                if (emp) matchedIds.push(String(emp.id));
                else notFoundNames.add(n);
            });
            if (!matchedIds.length) continue;

            if (isFlatPetugas) {
                // Unit 'kontinu'/'kontinu-split' - tidak ada konsep sesi,
                // semua nama langsung digabung ke satu array petugas/hari.
                if (!this.data.days[day]) this.data.days[day] = { petugas: [], keterangan: '' };
                const existing = Array.isArray(this.data.days[day].petugas)
                    ? this.data.days[day].petugas.map(String) : [];
                this.data.days[day].petugas = Array.from(new Set([...existing, ...matchedIds]));
                matchedRows++;
                continue;
            }

            const sessionIdx = rowCountPerDay[day] || 0;
            rowCountPerDay[day] = sessionIdx + 1;
            const sessionKey = sessionKeysInOrder[sessionIdx];
            if (!sessionKey) { extraRowsCount++; continue; } // sudah melebihi jumlah sesi unit ini utk tanggal ini

            if (!this.data.days[day]) this.data.days[day] = { sessions: {}, keterangan: '' };
            if (!this.data.days[day].sessions) this.data.days[day].sessions = {};

            if (unit.pattern === 'multi-grup') {
                const existing = Array.isArray(this.data.days[day].sessions[sessionKey])
                    ? this.data.days[day].sessions[sessionKey].map(String) : [];
                this.data.days[day].sessions[sessionKey] = Array.from(new Set([...existing, ...matchedIds]));
            } else { // multi-solo - 1 nama per sesi, file yang menang kalau ada >1 nama di baris yg sama
                this.data.days[day].sessions[sessionKey] = matchedIds[0];
            }
            matchedRows++;
        }

        if (matchedRows > 0) {
            this._markDirty();
            this.renderTable();
        }

        let msg = matchedRows > 0
            ? `Berhasil mencocokkan ${matchedRows} baris jadwal. Jangan lupa tekan "Simpan".`
            : 'Tidak ada baris yang berhasil dicocokkan - periksa lagi format Tanggal/Nama Petugas di file.';
        if (notFoundNames.size) {
            const list = Array.from(notFoundNames);
            msg += ` Nama tidak ditemukan di daftar karyawan unit ini: ${list.slice(0, 5).join(', ')}${list.length > 5 ? ', ...' : ''}.`;
        }
        if (extraRowsCount) {
            msg += ` ${extraRowsCount} baris dilewati karena melebihi jumlah sesi (${sessionKeysInOrder.length}) yang didefinisikan unit ini per tanggal.`;
        }
        if (skippedDates.length) {
            msg += ` ${skippedDates.length} baris tanggalnya di luar bulan/tahun yang sedang dibuka atau tidak terbaca.`;
        }
        toast[matchedRows > 0 && !notFoundNames.size && !skippedDates.length && !extraRowsCount ? 'success' : 'warning'](msg);
    },

    /**
     * SINKRONISASI Jadwal Shift <-> Jadwal Jaga Operator (2026-09-01, atas
     * permintaan): unit dengan pola dasar 'kontinu' (1 blok jam/hari - SEMUA
     * unit SPAM di atas, BUKAN 'kontinu-split' yang jam terpisahnya untuk 1
     * orang yang sama, bukan sesi berbeda) sekarang otomatis "naik kelas"
     * jadi tampilan multi-sesi (persis seperti BNA Amuntai/SATPAM) begitu
     * Jenis Jadwal karyawan unit itu (menu Jadwal Shift) punya LEBIH DARI 1
     * Kelompok Hari (dayGroups) - tiap Kelompok Hari jadi 1 baris sesi
     * sendiri di sini, label & urutannya mengikuti Kelompok Hari itu apa
     * adanya (mis. "Pagi"/"Malam"). Kalau Jenis Jadwal-nya masih 1
     * Kelompok Hari seperti semula, fungsi ini balikin unit ASLINYA apa
     * adanya - TIDAK ADA PERUBAHAN sama sekali untuk unit yang belum
     * diutak-atik.
     *
     * Dipakai menggantikan akses langsung ke OPERATOR_UNITS[key] di
     * renderTable()/printSchedule() supaya kedua tempat itu konsisten.
     * Backend (checkOperatorRosterForToday() & _getEffectiveRosterShiftOptions()
     * di Operatorschdule.gs/Attendance.gs) menurunkan pola & key sesi
     * ("grp0", "grp1", dst mengikuti urutan dayGroups) yang SAMA PERSIS
     * dari sumber yang sama, supaya proses absen & tampilan di sini selalu
     * sepakat satu sama lain.
     */
    _getEffectiveUnit(unitKey) {
        const base = OPERATOR_UNITS[unitKey];
        // BUGFIX (1 Oktober 2026): SEBELUMNYA hanya pola 'kontinu' yang ikut
        // sinkron ke Jadwal Shift; unit 'kontinu-split' (SPAM Paminggir)
        // langsung return base di sini, sehingga jam operasionalnya TERKUNCI
        // di label bawaan "13 Jam (04.30 - 13.00) (15.30 - 20.00)" walau
        // karyawannya sudah diatur Jenis Jadwal "Operator - 24 Jam" (yang
        // punya >1 Kelompok Hari: Pagi/Malam). Sekarang 'kontinu-split' ikut
        // diperlakukan sama - TETAPI tetap aman untuk karyawan Operator - 13
        // Jam: jadwal itu cuma 1 Kelompok Hari (jam terpisahnya untuk 1 orang
        // yang sama), jadi syarat "lebih dari 1 dayGroups" di bawah tidak
        // terpenuhi dan tampilannya TIDAK berubah sama sekali.
        // PASANGAN: checkOperatorRosterForToday() di Operatorschdule.gs
        // (backend) HARUS menerapkan aturan yang sama, kalau tidak jadwal yang
        // disimpan di sini (per sesi grp0/grp1) tidak terbaca saat absen.
        if (!base || (base.pattern !== 'kontinu' && base.pattern !== 'kontinu-split')) return base;

        try {
            const raw = this._allSettings && this._allSettings[JJO_SHIFT_TYPES_SETTING_KEY];
            if (!raw) return base;
            const shiftTypesConfig = JSON.parse(raw);

            const unitEmployees = this._employeesForUnit(unitKey);
            if (unitEmployees.length === 0) return base;

            // Kalau karyawan unit ini kebetulan beda-beda Jenis Jadwal,
            // pakai yang paling banyak dipakai (mayoritas) supaya hasilnya
            // tetap deterministik & tidak "goyang" tiap kali dirender ulang.
            const shiftCount = {};
            unitEmployees.forEach(e => {
                const s = String(e.shift || '').trim();
                if (s) shiftCount[s] = (shiftCount[s] || 0) + 1;
            });
            const shiftNames = Object.keys(shiftCount);
            if (shiftNames.length === 0) return base;
            shiftNames.sort((a, b) => shiftCount[b] - shiftCount[a]);
            const dominantShift = shiftNames[0];

            const shiftConfig = shiftTypesConfig[dominantShift];
            if (!shiftConfig || !shiftConfig.rosterCheck || shiftConfig.shiftOptions) return base;

            const groups = shiftConfig.dayGroups || [];
            if (groups.length <= 1) return base;

            return {
                label: base.label,
                pattern: 'multi-grup',
                sessions: groups.map((g, idx) => ({
                    key: 'grp' + idx,
                    label: g.label || ('Sesi ' + (idx + 1)),
                    time: this._dayGroupTimeRange(g)
                }))
            };
        } catch (e) {
            console.error('Gagal menurunkan sesi dinamis dari Jadwal Shift, pakai tampilan bawaan:', e);
            return base;
        }
    },

    // "08:00 s/d 20:00" dari sesi Masuk (clockIn) & Pulang (clockOut/
    // breakEnd) sebuah dayGroup - dipakai _getEffectiveUnit() di atas untuk
    // label jam per sesi di tabel Jadwal Jaga Operator.
    _dayGroupTimeRange(group) {
        const sessions = group.sessions || [];
        const masuk = sessions.find(s => s.field === 'clockIn');
        const pulang = [...sessions].reverse().find(s => s.field === 'clockOut' || s.field === 'breakEnd');
        if (masuk && pulang) return `${masuk.time} s/d ${pulang.time}`;
        if (masuk) return `Mulai ${masuk.time}`;
        return '';
    },

    _populateUnitSelect() {
        const sel = document.getElementById('jjo-unit');
        if (!sel) return;
        // Asmen yang dikunci ke unit tertentu (this._restrictedUnits) cuma
        // dikasih unit-unit itu saja di dropdown - unit lain tidak boleh
        // kelihatan sama sekali, bukan cuma "terkunci" tapi tetap ada di
        // daftar. Urutannya mengikuti OPERATOR_UNITS (bukan urutan simpan
        // admin) supaya konsisten dengan tampilan dropdown Data Karyawan.
        const keys = this._restrictedUnits.length > 0
            ? Object.keys(OPERATOR_UNITS).filter(k => this._restrictedUnits.includes(k))
            : Object.keys(OPERATOR_UNITS);
        sel.innerHTML = (this._restrictedUnits.length > 0 ? '' : '<option value="">-- Pilih Unit --</option>') +
            keys.map(key =>
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
        const btnUpload = document.getElementById('jjo-btn-upload');
        const btnExportExcel = document.getElementById('jjo-btn-export-excel');
        const uploadInput = document.getElementById('jjo-upload-input');

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
        if (btnExportExcel) btnExportExcel.onclick = () => this.exportAllToExcel();

        // "Upload Jadwal" - klik tombol cuma membuka dialog pilih file
        // (uploadInput disembunyikan lewat CSS, tombolnya cuma proxy
        // supaya tampilannya konsisten dengan tombol lain). Tampilkan
        // hint format file begitu tombol ditekan, supaya tidak
        // mengganggu tampilan default.
        if (btnUpload && uploadInput) {
            btnUpload.onclick = () => {
                const hint = document.getElementById('jjo-upload-hint');
                if (hint) hint.style.display = '';
                uploadInput.value = ''; // reset supaya bisa upload file yg sama 2x berturut-turut
                uploadInput.click();
            };
            uploadInput.onchange = () => {
                const file = uploadInput.files && uploadInput.files[0];
                if (file) this._handleUploadJadwal(file);
            };
        }
    },

    _settingKey() {
        const unitSlug = this.unitKey === 'TRD' && this.cabangTrd
            ? `TRD-${this.cabangTrd}`
            : this.unitKey;
        const mm = String(this.month + 1).padStart(2, '0');
        return `jaga_operator_${unitSlug}_${this.year}-${mm}`.replace(/\s+/g, '_');
    },

    _emptyData() {
        return { days: {}, signatures: { diketahuiNama: '', diketahuiJabatan: 'Manajer Operasi dan Jaringan', dibuatNama: '', dibuatJabatan: '' } };
    },

    async loadAndRender() {
        if (this.unitKey === 'TRD' && !this.cabangTrd) {
            this._renderNeedCabang();
            return;
        }
        // Segarkan status kunci (maks. 1x per 30 detik) supaya perubahan dari Admin cepat berlaku.
        if (!this._lockAt || (Date.now() - this._lockAt) > 30000) {
            await this._loadLockState();
            this._lockAt = Date.now();
        }
        try {
            // PERBAIKAN PERFORMA (2026-09-01, keluhan: pindah Unit terasa
            // lambat): SEBELUMNYA di sini manggil api.getSettings() PENUH
            // (baca ULANG SELURUH sheet Settings - semua Jenis Jadwal,
            // radius kantor, DAN semua jadwal jaga bulanan tiap unit
            // sekaligus) SETIAP kali admin ganti Unit/Bulan/Tahun, padahal
            // yang benar-benar dibutuhkan saat itu cuma 1 baris (jadwal
            // unit ini di bulan ini). Sekarang cukup ambil 1 key itu saja
            // lewat api.getSettingByKey() - jauh lebih ringan & cepat.
            // Settings LENGKAP (dibutuhkan _getEffectiveUnit() untuk baca
            // shift_types_config) sudah dimuat SEKALI di init() ke
            // this._allSettings, tidak perlu diulang di sini.
            //
            // PERBAIKAN PERFORMA (1 Oktober 2026): hasil baca jadwal tiap
            // unit/bulan diingat di memori (this._rosterCache, string JSON
            // mentah - JSON.parse tiap kali supaya this.data selalu objek
            // BARU, edit yang belum disimpan tidak ikut mengotori cache).
            // Pindah unit lalu kembali ke unit sebelumnya jadi instan, tanpa
            // panggilan ke server. Batas umur 60 detik supaya tidak terlalu
            // basi kalau ada admin/Asmen lain yang mengubah jadwal yang sama;
            // cache juga diperbarui setelah Simpan (saveData) & dikosongkan
            // saat halaman dibuka ulang (init).
            const cacheKey = this._settingKey();
            this._rosterCache = this._rosterCache || {};
            const hit = this._rosterCache[cacheKey];
            let raw;
            if (hit && (Date.now() - hit.t) < 60000) {
                raw = hit.raw;
            } else {
                const res = await api.getSettingByKey(cacheKey);
                if (res.success) {
                    raw = res.data;
                    this._rosterCache[cacheKey] = { raw: raw || null, t: Date.now() };
                } else {
                    raw = null;
                }
            }
            this.data = raw ? JSON.parse(raw) : this._emptyData();
        } catch (e) {
            console.error('Gagal memuat jadwal jaga operator:', e);
            toast.error('Gagal memuat data jadwal. Coba muat ulang halaman.');
            this.data = this._emptyData();
        }
        this._dirty = false;
        this.renderTable();
    },

    // Cegah submit dobel + tampilkan loading di tombol Simpan - pola
    // sama persis seperti SPK/Surat Tugas (spk.js, surat-tugas.js).
    _isSavingJadwal: false,

    _setSimpanJadwalLoading(loading) {
        const btn = document.getElementById('jjo-btn-simpan');
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.originalText) {
                btn.dataset.originalText = btn.innerHTML;
            }
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = 'pointer';
            if (btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
            }
        }
    },

    async saveData() {
        if (!this.unitKey) return;
        if (this._locked) { this._notifyLocked(); return; }
        if (this.unitKey === 'TRD' && !this.cabangTrd) {
            toast.warning('Isi dulu nama cabang TRD-nya.');
            return;
        }
        // Cegah klik Simpan berkali-kali cepat (mis. jaringan lambat)
        // sampai request sebelumnya selesai, supaya tidak memicu beberapa
        // request tersimpan bertumpuk.
        if (this._isSavingJadwal) return;
        this._isSavingJadwal = true;
        this._setSimpanJadwalLoading(true);
        try {
            const saveKey = this._settingKey();
            const savePayload = JSON.stringify(this.data);
            const result = await api.saveSetting(saveKey, savePayload);
            if (result && result.success) {
                // Samakan cache jadwal (lihat loadAndRender()) dengan yang
                // baru tersimpan, supaya pindah unit lalu kembali tidak
                // menampilkan versi lama.
                this._rosterCache = this._rosterCache || {};
                this._rosterCache[saveKey] = { raw: savePayload, t: Date.now() };
                this._dirty = false;
                toast.success('Jadwal jaga berhasil disimpan.');
            } else {
                toast.error('Gagal menyimpan jadwal jaga.');
            }
        } catch (e) {
            console.error('Gagal menyimpan jadwal jaga operator:', e);
            toast.error('Gagal menyimpan jadwal jaga. Periksa koneksi internet Anda.');
        } finally {
            this._isSavingJadwal = false;
            this._setSimpanJadwalLoading(false);
        }
    },

    _markDirty() { this._dirty = true; if (this._updateSummary) this._updateSummary(); },

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
        const unit = this._getEffectiveUnit(this.unitKey);
        if (!unit) { this._renderEmpty(); return; }

        const info = document.getElementById('jjo-unit-info');
        if (info) {
            info.innerHTML = `<strong>${unit.label}</strong>` +
                (unit.jamLabel ? ` &mdash; ${unit.jamLabel}` : '') +
                (this.unitKey === 'TRD' ? ' &mdash; jadwal piket (jam bebas)' : '');
        }

        // Tombol "Upload Jadwal" (Excel/CSV) - didukung utk SEMUA unit yang
        // pilih petugasnya lewat centang/dropdown per nama (multi-grup,
        // multi-solo, DAN kontinu/kontinu-split - yaitu semua unit SPAM,
        // diperluas atas permintaan supaya tidak cuma BNA Amuntai/SATPAM).
        // TRD (pattern multi-grup, 1 sesi "piket") otomatis ikut kebagian
        // juga lewat kondisi yang sama di bawah - tidak perlu penanganan
        // khusus.
        const btnUpload = document.getElementById('jjo-btn-upload');
        const uploadHint = document.getElementById('jjo-upload-hint');
        const supportsUpload = ['multi-grup', 'multi-solo', 'kontinu', 'kontinu-split'].indexOf(unit.pattern) !== -1;
        if (btnUpload) btnUpload.style.display = supportsUpload ? '' : 'none';
        if (uploadHint) uploadHint.style.display = 'none'; // cuma tampil sesaat setelah tombol diklik, lihat bindEvents()

        switch (unit.pattern) {
            case 'multi-grup':
            case 'multi-solo':
                this._renderMultiSesi(unit);
                break;
            case 'kontinu':
            case 'kontinu-split':
                this._renderKontinu(unit);
                break;
        }
    },

    // ── Tampilan kartu per hari (modern) ──────────────────────────
    // Data tersimpan TIDAK berubah (days[d].sessions[key] / days[d].petugas /
    // days[d].keterangan) - yang berubah hanya cara menampilkannya: tiap
    // hari 1 kartu, petugas dipilih lewat "pil" yang tinggal diketuk.
    _renderMultiSesi(unit) {
        this._curUnit = unit;
        this._renderDayCards(unit);
    },

    _renderKontinu(unit) {
        this._curUnit = unit;
        this._renderDayCards(unit);
    },

    _renderDayCards(unit) {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        const days = this._daysInMonth();
        for (let d = 1; d <= days; d++) this._normalizeDay(d, unit);

        let cards = '';
        for (let d = 1; d <= days; d++) cards += this._dayCardHtml(d, unit);

        const unitEmployees = this._employeesForUnit(this.unitKey);
        const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
        const poolChips = unitEmployees.length
            ? unitEmployees.map(emp => `<div class="jjo-pool-chip" data-emp="${emp.id}" data-nama="${this._escAttr(String(emp.nama || '').toLowerCase())}" title="Seret ke jadwal">
                    <span class="jjo-av">${this._escAttr(initials(emp.nama))}</span>
                    <span class="jjo-pool-name">${this._escAttr(emp.nama)}</span>
                    <span class="jjo-pool-count" title="Jumlah hari terjadwal bulan ini">0</span>
                </div>`).join('')
            : '<div class="jjo-no-emp">Belum ada karyawan Operator di unit ini</div>';

        wrap.innerHTML = `
          <div class="jjo-layout">
            <aside class="jjo-pool" id="jjo-pool">
                <div class="jjo-pool-head"><b><i class="fas fa-users"></i> Petugas</b><small><span class="jjo-hint-mouse">Ketuk nama, lalu ketuk sesi tujuan (atau seret)</span><span class="jjo-hint-touch">Ketuk nama, lalu ketuk sesi tujuan (atau tahan &amp; seret)</span></small></div>
                <div class="jjo-pool-search"><i class="fas fa-search"></i><input type="text" id="jjo-pool-q" placeholder="Cari nama..." autocomplete="off"></div>
                <div class="jjo-pool-list" id="jjo-pool-list">${poolChips}</div>
            </aside>
            <div class="jjo-main">
            <div class="jjo-toolbar">
                <div class="jjo-progress">
                    <div class="jjo-progress-text"><b id="jjo-prog-num">0</b> dari ${days} hari terisi <span id="jjo-prog-pct"></span></div>
                    <div class="jjo-progress-bar"><span id="jjo-prog-fill"></span></div>
                </div>
                <label class="jjo-switch"><input type="checkbox" id="jjo-only-empty"><span>Tampilkan yang belum terisi saja</span></label>
            </div>
            <div class="jjo-days" id="jjo-days">${cards}</div>
            </div>
          </div>
        `;
        wrap.onclick = (e) => this._onWrapClick(e);
        this._bindDnD(wrap);
        const only = document.getElementById('jjo-only-empty');
        if (only) only.onchange = () => {
            const box = document.getElementById('jjo-days');
            if (box) box.classList.toggle('only-empty', only.checked);
        };
        this._bindInputs();
        this._updateSummary();
        this._applyLock();
    },

    // Pastikan struktur data hari valid (menjaga perbaikan bug lama: data
    // format lama tanpa "sessions" tidak boleh bikin render gagal).
    _normalizeDay(d, unit) {
        const multi = unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo';
        let dd = this.data.days[d];
        if (!dd) dd = this.data.days[d] = multi ? { sessions: {}, keterangan: '' } : { petugas: '', keterangan: '' };
        if (multi && !dd.sessions) dd.sessions = {};
        return dd;
    },

    _toIds(v, asArray) {
        if (Array.isArray(v)) return v.map(String);
        return v ? [String(v)] : [];
    },

    _dayIds(d, unit) {
        const dd = this.data.days[d] || {};
        if (unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo') {
            let all = [];
            (unit.sessions || []).forEach(sess => {
                all = all.concat(this._toIds((dd.sessions || {})[sess.key]).filter(Boolean));
            });
            return all;
        }
        return this._toIds(dd.petugas).filter(Boolean);
    },

    _fieldHtml(d, unit, sessKey, selectedIds, unitEmployees) {
        const attr = sessKey ? `data-day="${d}" data-session="${sessKey}"` : `data-day="${d}" data-field="petugas"`;
        const multi = sessKey ? unit.pattern === 'multi-grup' : !!unit.multiPetugas;
        if (multi) {
            return `<div class="jjo-checkbox-group" ${attr}>
                ${unitEmployees.map(emp => `
                    <label class="jjo-checkbox-item">
                        <input type="checkbox" class="jjo-petugas-checkbox" ${attr} value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'checked' : ''}>
                        <span>${this._escAttr(emp.nama)}</span>
                    </label>`).join('')}
            </div>`;
        }
        return `<select class="jjo-select" ${attr}>
            <option value="">- Kosong -</option>
            ${unitEmployees.map(emp => `<option value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'selected' : ''}>${this._escAttr(emp.nama)}</option>`).join('')}
        </select>`;
    },

    _dayCardHtml(d, unit) {
        const info = this._dayInfo(d);
        const dayData = this._normalizeDay(d, unit);
        const unitEmployees = this._employeesForUnit(this.unitKey);
        const multiSesi = unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo';
        const isGrup = unit.pattern === 'multi-grup';
        const now = new Date();
        const isToday = now.getFullYear() === this.year && now.getMonth() === this.month && now.getDate() === d;
        const filled = this._dayIds(d, unit).length > 0;
        const noEmp = unitEmployees.length === 0 ? '<div class="jjo-no-emp">Belum ada karyawan Operator di unit ini</div>' : '';

        let body = '';
        if (multiSesi) {
            body = unit.sessions.map(sess => {
                const raw = dayData.sessions[sess.key];
                const ids = isGrup ? this._toIds(raw) : (raw ? [String(raw)] : []);
                return `<div class="jjo-sess">
                    <div class="jjo-sess-lab"><b>${sess.label}</b><span>${sess.time}</span></div>
                    <div class="jjo-sess-field">${this._fieldHtml(d, unit, sess.key, ids, unitEmployees)}</div>
                </div>`;
            }).join('') + noEmp;
        } else {
            const ids = this._toIds(dayData.petugas);
            body = `<div class="jjo-sess">
                <div class="jjo-sess-lab"><b>Petugas</b><span>${this._escAttr(unit.jamLabel || '')}</span></div>
                <div class="jjo-sess-field">${this._fieldHtml(d, unit, null, ids, unitEmployees)}</div>
            </div>` + noEmp;
        }

        const dowCls = info.dow === 0 ? ' is-minggu' : (info.dow === 6 ? ' is-sabtu' : '');
        return `<div class="jjo-day${dowCls}${filled ? ' is-filled' : ''}${isToday ? ' is-today' : ''}" id="jjo-day-${d}" data-day="${d}">
            <div class="jjo-day-head">
                <div class="jjo-day-num">${d}</div>
                <div class="jjo-day-title"><b>${info.hariName}${isToday ? ' <em>Hari ini</em>' : ''}</b><span>${info.tanggalStr}</span></div>
                <span class="jjo-day-badge">${filled ? '<i class="fas fa-check"></i> Terisi' : 'Kosong'}</span>
                <div class="jjo-day-tools">
                    ${d > 1 ? `<button type="button" class="jjo-tool" data-act="copy" data-day="${d}" title="Salin petugas dari hari sebelumnya"><i class="fas fa-copy"></i><span>Salin kemarin</span></button>` : ''}
                    <button type="button" class="jjo-tool danger" data-act="clear" data-day="${d}" title="Kosongkan petugas hari ini"><i class="fas fa-eraser"></i><span>Kosongkan</span></button>
                </div>
            </div>
            <div class="jjo-day-body">
                ${body}
                <div class="jjo-ket"><i class="fas fa-pen"></i><input type="text" class="jjo-input" data-day="${d}" data-field="keterangan" value="${this._escAttr(dayData.keterangan || '')}" placeholder="Catatan (opsional)"></div>
            </div>
        </div>`;
    },


    // ── Drag & drop petugas -> jadwal ─────────────────────────────
    // Berbasis pointer events supaya jalan di mouse DAN layar sentuh (HP):
    // di HP, nama harus DITAHAN sebentar dulu baru bisa diseret (supaya
    // tetap bisa scroll biasa). Saat dilepas di kartu/sesi jadwal, kita
    // cuma "mencentang" petugas itu lewat elemen checkbox/select yang SUDAH
    // ada, jadi seluruh logika simpan data tetap yang lama (tidak diubah).
    _bindDnD(wrap) {
        const q = document.getElementById('jjo-pool-q');
        if (q) q.oninput = () => {
            const key = q.value.trim().toLowerCase();
            document.querySelectorAll('#jjo-pool .jjo-pool-chip').forEach(c => {
                c.style.display = (!key || c.dataset.nama.indexOf(key) !== -1) ? '' : 'none';
            });
        };
        wrap.onpointerdown = (e) => this._dndStart(e);

        // Mode "pilih lalu taruh": ketuk nama petugas -> ketuk sesi tujuan.
        // Dipasang di fase capture supaya ketukan di sesi tidak ikut
        // mencentang pil nama (aksi bawaan) saat mode ini aktif.
        if (wrap._pickCapture) wrap.removeEventListener('click', wrap._pickCapture, true);
        wrap._pickCapture = (e) => this._pickClick(e);
        wrap.addEventListener('click', wrap._pickCapture, true);
        this._pickClear(true);
    },

    _pickClear(silent) {
        this._pickId = null;
        document.querySelectorAll('.jjo-pool-chip.is-armed').forEach(c => c.classList.remove('is-armed'));
        document.body.classList.remove('jjo-armed');
        const bar = document.getElementById('jjo-armed-bar');
        if (bar) bar.remove();
        if (this._pickKey) { document.removeEventListener('keydown', this._pickKey); this._pickKey = null; }
    },

    _pickSet(chip) {
        if (this._locked) return;
        const id = chip.dataset.emp;
        if (this._pickId === id) { this._pickClear(); return; }
        this._pickClear();
        this._pickId = id;
        chip.classList.add('is-armed');
        document.body.classList.add('jjo-armed');
        const nama = chip.querySelector('.jjo-pool-name').textContent;
        const bar = document.createElement('div');
        bar.id = 'jjo-armed-bar';
        bar.className = 'jjo-armed-bar';
        bar.innerHTML = `<div class="jjo-armed-ic"><i class="fas fa-hand-pointer"></i></div>
            <div class="jjo-armed-txt"><small>Petugas terpilih</small><b>${this._escAttr(nama)}</b><span>Ketuk sesi (Pagi/Siang/Malam) pada kartu hari tempat petugas ini ditaruh</span></div>
            <button type="button" id="jjo-armed-done"><i class="fas fa-check"></i> Selesai</button>`;
        document.body.appendChild(bar);
        document.getElementById('jjo-armed-done').onclick = () => this._pickClear();
        this._pickKey = (ev) => { if (ev.key === 'Escape') this._pickClear(); };
        document.addEventListener('keydown', this._pickKey);
    },

    _pickClick(e) {
        if (this._locked) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (this._suppressClick) return;
        const chip = t.closest('.jjo-pool-chip');
        if (chip) { e.stopPropagation(); this._pickSet(chip); return; }
        if (!this._pickId) return;
        const sess = t.closest('.jjo-sess');
        if (!sess) return;
        e.preventDefault();
        e.stopPropagation();
        const dayEl = sess.closest('.jjo-day');
        const lab = sess.querySelector('.jjo-sess-lab b');
        const emp = document.querySelector('#jjo-pool .jjo-pool-chip.is-armed .jjo-pool-name');
        const changed = this._dndDrop(sess, this._pickId, true);
        if (changed && window.toast && toast.success && dayEl) {
            const info = this._dayInfo(parseInt(dayEl.dataset.day, 10));
            toast.success(`${emp ? emp.textContent : 'Petugas'} → ${info.hariName}, ${info.tanggalStr} (${lab ? lab.textContent : ''})`);
        }
    },

    _dndScrollParent(el) {
        let n = el && el.parentElement;
        while (n && n !== document.body) {
            const oy = getComputedStyle(n).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
            n = n.parentElement;
        }
        return null;
    },

    _dndStart(e) {
        if (this._locked) return;
        const chip = e.target.closest ? e.target.closest('.jjo-pool-chip') : null;
        if (!chip || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const isTouch = e.pointerType !== 'mouse';
        const st = {
            chip, id: chip.dataset.emp, name: chip.querySelector('.jjo-pool-name').textContent,
            x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
            active: false, ghost: null, target: null, raf: 0, timer: null,
            scroller: this._dndScrollParent(chip) || null
        };
        this._dnd = st;

        const begin = () => {
            st.active = true;
            chip.classList.add('is-dragging');
            document.body.classList.add('jjo-dragging');
            const g = document.createElement('div');
            g.className = 'jjo-ghost';
            g.innerHTML = '<i class="fas fa-grip-vertical"></i> ' + this._escAttr(st.name);
            document.body.appendChild(g);
            st.ghost = g;
            if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
            loop();
        };
        const loop = () => {
            if (!st.active) return;
            if (st.ghost) st.ghost.style.transform = `translate(${st.x + 12}px, ${st.y + 12}px)`;
            // auto-scroll dekat tepi layar
            const edge = 70, vh = window.innerHeight;
            let dy = 0;
            if (st.y < edge) dy = -Math.ceil((edge - st.y) / 6);
            else if (st.y > vh - edge) dy = Math.ceil((st.y - (vh - edge)) / 6);
            if (dy) { if (st.scroller) st.scroller.scrollTop += dy; else window.scrollBy(0, dy); }
            this._dndHover(st);
            st.raf = requestAnimationFrame(loop);
        };
        const onMove = (ev) => {
            st.x = ev.clientX; st.y = ev.clientY;
            if (!st.active) {
                const moved = Math.hypot(st.x - st.x0, st.y - st.y0);
                if (isTouch) { if (moved > 10) cleanup(); }      // geser = scroll biasa
                else if (moved > 5) begin();
                return;
            }
            ev.preventDefault();
        };
        const blockTouch = (ev) => { if (st.active) ev.preventDefault(); };
        const finish = (ev) => {
            const wasActive = st.active;
            const hit = st.active ? this._dndTarget(st.x, st.y) : null;
            const id = st.id;
            cleanup();
            if (wasActive) { this._suppressClick = true; setTimeout(() => { this._suppressClick = false; }, 350); }
            if (hit) this._dndDrop(hit, id);
        };
        const cleanup = () => {
            clearTimeout(st.timer);
            cancelAnimationFrame(st.raf);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', finish);
            document.removeEventListener('pointercancel', cleanup);
            document.removeEventListener('touchmove', blockTouch);
            chip.classList.remove('is-dragging');
            document.body.classList.remove('jjo-dragging');
            document.querySelectorAll('.jjo-drop-hover').forEach(n => n.classList.remove('jjo-drop-hover'));
            if (st.ghost) st.ghost.remove();
            st.active = false;
            this._dnd = null;
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', finish);
        document.addEventListener('pointercancel', cleanup);
        document.addEventListener('touchmove', blockTouch, { passive: false });
        if (isTouch) st.timer = setTimeout(begin, 260);
    },

    // Cari sesi (atau kartu hari) di bawah jari/kursor.
    _dndTarget(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el || !el.closest) return null;
        let sess = el.closest('.jjo-sess');
        if (!sess) {
            const day = el.closest('.jjo-day');
            if (day) sess = day.querySelector('.jjo-sess');
        }
        return sess || null;
    },

    _dndHover(st) {
        const t = this._dndTarget(st.x, st.y);
        if (t === st.target) return;
        if (st.target) st.target.classList.remove('jjo-drop-hover');
        st.target = t;
        if (t) t.classList.add('jjo-drop-hover');
    },

    _dndDrop(sess, empId, fromPick) {
        const cb = Array.from(sess.querySelectorAll('.jjo-petugas-checkbox')).find(c => String(c.value) === String(empId));
        const sel = sess.querySelector('select.jjo-select');
        let changed = false;
        if (cb) {
            if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); changed = true; }
        } else if (sel) {
            if (sel.value !== String(empId)) { sel.value = String(empId); sel.dispatchEvent(new Event('change')); changed = true; }
        }
        sess.classList.add(changed ? 'jjo-drop-ok' : 'jjo-drop-dup');
        setTimeout(() => sess.classList.remove('jjo-drop-ok', 'jjo-drop-dup'), 700);
        if (!changed && window.toast && toast.info) toast.info('Petugas ini sudah ada di sesi tersebut.');
        return changed;
    },

    // Aksi tombol "Salin kemarin" & "Kosongkan" (event delegation).
    _onWrapClick(e) {
        if (this._locked) return;
        const btn = e.target.closest ? e.target.closest('.jjo-tool') : null;
        if (!btn) return;
        const unit = this._curUnit;
        if (!unit) return;
        const d = parseInt(btn.dataset.day, 10);
        const multi = unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo';
        const cur = this._normalizeDay(d, unit);
        if (btn.dataset.act === 'copy') {
            const prev = this._normalizeDay(d - 1, unit);
            if (multi) cur.sessions = JSON.parse(JSON.stringify(prev.sessions || {}));
            else cur.petugas = JSON.parse(JSON.stringify(prev.petugas || ''));
        } else if (btn.dataset.act === 'clear') {
            if (multi) cur.sessions = {};
            else cur.petugas = Array.isArray(cur.petugas) ? [] : '';
        } else return;
        this._markDirty();
        this._refreshDay(d);
    },

    _refreshDay(d) {
        const unit = this._curUnit;
        const el = document.getElementById('jjo-day-' + d);
        if (!el || !unit) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = this._dayCardHtml(d, unit);
        el.replaceWith(tmp.firstElementChild);
        this._bindInputs();
        this._updateSummary();
    },

    // Perbarui penanda "Terisi/Kosong" tiap kartu + progres bulan ini.
    _updateSummary() {
        const unit = this._curUnit;
        if (!unit || !document.getElementById('jjo-days')) return;
        const days = this._daysInMonth();
        let n = 0;
        for (let d = 1; d <= days; d++) {
            const filled = this._dayIds(d, unit).length > 0;
            if (filled) n++;
            const el = document.getElementById('jjo-day-' + d);
            if (!el) continue;
            el.classList.toggle('is-filled', filled);
            const badge = el.querySelector('.jjo-day-badge');
            if (badge) badge.innerHTML = filled ? '<i class="fas fa-check"></i> Terisi' : 'Kosong';
        }
        // Hitung jumlah hari terjadwal per petugas (badge di daftar petugas).
        const cnt = {};
        for (let d = 1; d <= days; d++) {
            new Set(this._dayIds(d, unit)).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; });
        }
        document.querySelectorAll('#jjo-pool .jjo-pool-chip').forEach(chip => {
            const c = chip.querySelector('.jjo-pool-count');
            if (c) c.textContent = cnt[chip.dataset.emp] || 0;
        });
        const num = document.getElementById('jjo-prog-num');
        const fill = document.getElementById('jjo-prog-fill');
        const pct = document.getElementById('jjo-prog-pct');
        const p = days ? Math.round((n / days) * 100) : 0;
        if (num) num.textContent = n;
        if (fill) fill.style.width = p + '%';
        if (pct) pct.textContent = '(' + p + '%)';
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
        // sesi NON-grup, tetap 1 ID saja (atau '' kalau kosong) lewat select
        // biasa di bawah ini.
        document.querySelectorAll('#jjo-table-wrap .jjo-select').forEach(sel => {
            sel.onchange = () => {
                const day = sel.dataset.day;
                const session = sel.dataset.session;
                const field = sel.dataset.field;
                if (!this.data.days[day]) this.data.days[day] = {};

                if (session) {
                    if (!this.data.days[day].sessions) this.data.days[day].sessions = {};
                    this.data.days[day].sessions[session] = sel.value;
                } else if (field) {
                    this.data.days[day][field] = sel.value;
                }
                this._markDirty();
            };
        });

        // Checkbox pilih petugas - dipakai untuk 2 kasus: (1) sesi multi-grup
        // (mis. BNA Amuntai/SATPAM, checkbox punya data-session, tersimpan ke
        // this.data.days[day].sessions[session] sebagai array ID); (2) unit
        // multiPetugas pola kontinu (SEMUA SPAM, PERBAIKAN 2026-09-01 -
        // checkbox-nya punya data-field="petugas" TANPA data-session,
        // tersimpan langsung ke this.data.days[day].petugas sebagai array
        // ID). Fase 2c: checkbox biasa (klik langsung per nama, tanpa perlu
        // tahan Ctrl/Cmd seperti <select multiple> dulu).
        document.querySelectorAll('#jjo-table-wrap .jjo-petugas-checkbox').forEach(cb => {
            cb.onchange = () => {
                const day = cb.dataset.day;
                const session = cb.dataset.session;
                const field = cb.dataset.field;
                if (!this.data.days[day]) this.data.days[day] = {};

                if (session) {
                    if (!this.data.days[day].sessions) this.data.days[day].sessions = {};
                    const groupSelector = `.jjo-petugas-checkbox[data-day="${day}"][data-session="${session}"]`;
                    const checkedIds = Array.from(document.querySelectorAll(groupSelector))
                        .filter(el => el.checked)
                        .map(el => el.value);
                    this.data.days[day].sessions[session] = checkedIds;
                } else if (field) {
                    const groupSelector = `.jjo-petugas-checkbox[data-day="${day}"][data-field="${field}"]`;
                    const checkedIds = Array.from(document.querySelectorAll(groupSelector))
                        .filter(el => el.checked)
                        .map(el => el.value);
                    this.data.days[day][field] = checkedIds;
                }
                this._markDirty();
            };
        });
    },

    _escAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    },

    // ── Export Excel (semua unit sekaligus) ───────────────────────
    // FITUR BARU: tombol "Export Excel" - export jadwal jaga SEMUA unit
    // (bulan/tahun yang sedang dipilih di filter atas) jadi 1 file .xls,
    // tiap unit di sheet terpisah (nama sheet = label unit) - supaya admin
    // tidak perlu buka & cetak/unduh satu-satu per unit. Tidak mengubah
    // data apa pun (read-only, hanya ambil data tersimpan tiap unit lewat
    // api.getSettingByKey), dan TIDAK bergantung pada unit yang sedang
    // aktif di layar (this.unitKey) - jalan independen mengambil data tiap
    // unit satu per satu. Asmen yang dibatasi (_restrictedUnits) cuma
    // dapat sheet untuk unit-unit yang jadi tanggung jawabnya saja, sama
    // seperti pembatasan yang sudah ada di dropdown Unit.
    async exportAllToExcel() {
        const btn = document.getElementById('jjo-btn-export-excel');
        try {
            await this._ensureXlsxLib();
        } catch (e) {
            console.error(e);
            toast.error('Gagal memuat pustaka pembuat Excel. Periksa koneksi internet Anda, lalu coba lagi.');
            return;
        }

        const keys = this._restrictedUnits.length > 0
            ? Object.keys(OPERATOR_UNITS).filter(k => this._restrictedUnits.includes(k))
            : Object.keys(OPERATOR_UNITS);

        if (keys.length === 0) {
            toast.warning('Tidak ada unit yang bisa diekspor.');
            return;
        }

        if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }
        toast.info(`Menyiapkan Excel ${keys.length} unit, mohon tunggu...`);

        try {
            const wb = XLSX.utils.book_new();
            const usedSheetNames = {};
            let failedUnits = 0;
            const konsolidasi = []; // bahan tab "Konsolidasi" (diisi di dalam loop di bawah)

            for (const key of keys) {
                const unit = this._getEffectiveUnit(key);
                if (!unit) continue;

                let data;
                try {
                    const res = await api.getSettingByKey(this._settingKeyFor(key));
                    data = (res.success && res.data) ? JSON.parse(res.data) : this._emptyData();
                } catch (e) {
                    console.error(`Gagal memuat jadwal unit ${key} untuk export:`, e);
                    data = this._emptyData();
                    failedUnits++;
                }

                konsolidasi.push({ key, unit, data });

                const aoa = this._buildExportRows(unit, data);
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 25 }];
                XLSX.utils.book_append_sheet(wb, ws, this._safeSheetName(unit.label, usedSheetNames));
            }

            // Tab "Konsolidasi" (sheet terakhir): rekap per petugas per unit - jumlah hari
            // dijadwalkan (Hari) & berapa di antaranya jatuh di hari libur (Libur = Sabtu,
            // Minggu, atau tanggal merah nasional). Lihat _buildKonsolidasiRows().
            let holidays = {};
            try {
                const rh = await api.getHolidayDates(this.year);
                if (rh && rh.success && rh.data && typeof rh.data === 'object') holidays = rh.data;
                else throw new Error('data tanggal merah kosong');
            } catch (e) {
                console.error('Gagal memuat tanggal merah untuk tab Konsolidasi:', e);
                toast.warning('Tanggal merah gagal dimuat - kolom Libur di tab Konsolidasi untuk BNA Amuntai & SPAM akan 0, dan untuk SATPAM/TRD hanya menghitung Sabtu & Minggu.');
            }
            const kons = this._buildKonsolidasiRows(konsolidasi, holidays);
            if (kons.rows.length > 1) {
                const wsKons = XLSX.utils.aoa_to_sheet(kons.rows);
                wsKons['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 8 }, { wch: 8 }];
                wsKons['!merges'] = kons.merges;
                XLSX.utils.book_append_sheet(wb, wsKons, this._safeSheetName('Konsolidasi', usedSheetNames));
            }

            const mm = String(this.month + 1).padStart(2, '0');
            const filename = `Jadwal_Jaga_Operator_${this.year}-${mm}.xls`;
            XLSX.writeFile(wb, filename, { bookType: 'xls' });

            toast[failedUnits ? 'warning' : 'success'](
                failedUnits
                    ? `Excel berhasil diunduh, tapi ${failedUnits} unit gagal dimuat (dianggap kosong).`
                    : 'Export Excel berhasil diunduh.'
            );
        } catch (e) {
            console.error('Gagal membuat file Excel:', e);
            toast.error('Gagal membuat file Excel.');
        } finally {
            if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
        }
    },

    // Sama seperti _settingKey(), tapi menerima unitKey secara eksplisit
    // (bukan this.unitKey/this.cabangTrd) - dipakai exportAllToExcel()
    // supaya bisa ambil data TIAP unit satu per satu tanpa mengubah unit
    // yang sedang aktif di layar.
    _settingKeyFor(unitKey) {
        const mm = String(this.month + 1).padStart(2, '0');
        return `jaga_operator_${unitKey}_${this.year}-${mm}`.replace(/\s+/g, '_');
    },

    // Baris data (array-of-array, siap dipakai XLSX.utils.aoa_to_sheet)
    // untuk 1 sheet unit - strukturnya mengikuti _buildPrintTable() (versi
    // HTML utk Cetak) supaya isinya konsisten, tapi teks polos (tanpa
    // HTML) & 1 baris Excel per sesi/hari (tidak pakai rowspan, supaya
    // aman dibuka di Excel/Sheets apa pun).
    _buildExportRows(unit, data) {
        const days = this._daysInMonth();
        const rows = [];

        if (unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo') {
            rows.push(['No', 'Hari', 'Tanggal', 'Jam', 'Nama Petugas', 'Keterangan']);
            for (let d = 1; d <= days; d++) {
                const info = this._dayInfo(d);
                const dayData = (data.days && data.days[d]) || { sessions: {}, keterangan: '' };
                (unit.sessions || []).forEach(sess => {
                    const rawVal = dayData.sessions && dayData.sessions[sess.key];
                    const ids = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                    const nama = ids.map(id => this._employeeName(id)).filter(Boolean).join(', ') || '-';
                    rows.push([d, info.hariName, info.tanggalStr, sess.time, nama, dayData.keterangan || '']);
                });
            }
            return rows;
        }

        if (unit.pattern === 'kontinu' || unit.pattern === 'kontinu-split') {
            rows.push(['No', 'Hari', 'Tanggal', 'Jam Operasional', 'Nama Petugas', 'Keterangan']);
            for (let d = 1; d <= days; d++) {
                const info = this._dayInfo(d);
                const dayData = (data.days && data.days[d]) || { petugas: '', keterangan: '' };
                const petugasIds = Array.isArray(dayData.petugas) ? dayData.petugas : (dayData.petugas ? [dayData.petugas] : []);
                const nama = petugasIds.map(id => this._employeeName(id)).filter(Boolean).join(', ') || '-';
                rows.push([d, info.hariName, info.tanggalStr, unit.jamLabel, nama, dayData.keterangan || '']);
            }
            return rows;
        }

        return rows;
    },

    // Isi tab "Konsolidasi" di Export Excel: per unit (judul = kode unit, mis. "BNA Amuntai")
    // daftar petugas yang dijadwalkan bulan itu + 2 angka:
    //   Hari  = jumlah HARI petugas dijadwalkan (sama dengan angka di samping nama pada
    //           daftar Petugas di layar: 1 hari dihitung 1 walau ikut >1 sesi di hari itu)
    //   Libur = dari hari-hari itu, berapa yang jatuh di hari libur. Aturannya beda per unit:
    //           - BNA Amuntai & semua unit SPAM : HANYA tanggal merah nasional (Sabtu/Minggu
    //             di unit ini hari kerja biasa, jadi tidak dihitung libur)
    //           - SATPAM & TRD (semua cabang)   : Sabtu, Minggu, ATAU tanggal merah nasional
    //           (holidays = { 'yyyy-MM-dd': 'Nama Libur' } dari api.getHolidayDates).
    // Unit tanpa petugas terjadwal dilewati. Ubah KONSOLIDASI_TAMPILKAN_NOL jadi true kalau
    // ingin petugas unit yang belum dijadwalkan sama sekali (Hari 0) tetap ikut dicantumkan.
    _buildKonsolidasiRows(items, holidays) {
        const KONSOLIDASI_TAMPILKAN_NOL = false;
        const days = this._daysInMonth();
        const mm = String(this.month + 1).padStart(2, '0');
        const rows = [['No', 'Nama Petugas', 'Hari', 'Libur']];
        const merges = [];

        items.forEach(({ key, unit, data }) => {
            // BNA Amuntai (kode persis, BUKAN "TRD - BNA Amuntai") & unit SPAM: libur = tanggal merah saja.
            const hanyaTanggalMerah = key === 'BNA Amuntai' || /^SPAM /.test(key);
            const stat = {}; // id -> { hari, libur }
            for (let d = 1; d <= days; d++) {
                const dd = (data.days && data.days[d]) || {};
                let ids = [];
                if (unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo') {
                    (unit.sessions || []).forEach(sess => {
                        ids = ids.concat(this._toIds((dd.sessions || {})[sess.key]).filter(Boolean));
                    });
                } else {
                    ids = this._toIds(dd.petugas).filter(Boolean);
                }
                if (!ids.length) continue;
                const dow = new Date(this.year, this.month, d).getDay();
                const dateStr = `${this.year}-${mm}-${String(d).padStart(2, '0')}`;
                const isLibur = (!hanyaTanggalMerah && (dow === 0 || dow === 6)) || !!(holidays && holidays[dateStr]);
                new Set(ids.map(String)).forEach(id => {
                    if (!stat[id]) stat[id] = { hari: 0, libur: 0 };
                    stat[id].hari++;
                    if (isLibur) stat[id].libur++;
                });
            }

            const ids = new Set(Object.keys(stat));
            if (KONSOLIDASI_TAMPILKAN_NOL) this._employeesForUnit(key).forEach(e => ids.add(String(e.id)));
            const list = Array.from(ids)
                .map(id => ({ nama: this._employeeName(id) || ('Petugas #' + id), hari: (stat[id] || {}).hari || 0, libur: (stat[id] || {}).libur || 0 }))
                .sort((a, b) => a.nama.localeCompare(b.nama));
            if (!list.length) return;

            merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: 3 } });
            rows.push([key, '', '', '']);
            list.forEach((p, i) => rows.push([i + 1, p.nama, p.hari, p.libur]));
        });

        return { rows, merges };
    },

    // Nama sheet Excel maksimal 31 karakter & tidak boleh berisi \ / ? * [ ]
    // atau duplikat - bersihkan label unit supaya aman dipakai sebagai nama
    // sheet, tambah " (2)", " (3)", dst kalau kebetulan ada 2 unit dengan
    // label yang sama persis setelah dibersihkan.
    _safeSheetName(label, usedSheetNames) {
        let name = String(label || 'Unit').replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
        if (name.length > 31) name = name.substring(0, 31).trim();
        if (!name) name = 'Unit';

        let finalName = name;
        let i = 2;
        while (usedSheetNames[finalName]) {
            const suffix = ` (${i})`;
            finalName = name.substring(0, 31 - suffix.length) + suffix;
            i++;
        }
        usedSheetNames[finalName] = true;
        return finalName;
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

        const unit = this._getEffectiveUnit(this.unitKey);
        const judulUnit = this.unitKey === 'TRD' ? `${unit.label} - ${this.cabangTrd}` : unit.label;
        // PENAMBAHAN (2026-09-08): Nama & Jabatan TTD "Diketahui Oleh"/"Dibuat
        // Oleh" SEPENUHNYA otomatis mengikuti pengaturan Admin di Edit
        // Karyawan (lihat _signatureFor()) - user yang mencetak tidak
        // memilih apa-apa lagi di sini.
        const sig = this._signatureFor(this.unitKey);

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
            <div class="print-letter-page jjo-print-page">
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
                // PERBAIKAN (2026-09-01): dayData.petugas sekarang bisa
                // berupa array ID (unit multiPetugas/checkbox) ATAU 1 ID
                // string (data lama) - lihat catatan lengkap di
                // _renderKontinu().
                const petugasIds = Array.isArray(dayData.petugas) ? dayData.petugas : (dayData.petugas ? [dayData.petugas] : []);
                const namaPetugas = petugasIds.map(id => this._employeeName(id)).filter(Boolean).join(', ') || '-';
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

        return '';
    }
};

function initJadwalJagaOperator() { jadwalJagaOperator.init(); }

window.jadwalJagaOperator = jadwalJagaOperator;
window.initJadwalJagaOperator = initJadwalJagaOperator;
