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
        const isAdminUser = auth.isAdmin();
        const assignedUnits = (!isAdminUser && auth.isAsmen() && auth.currentUser)
            ? String(auth.currentUser.operatorScheduleUnit || '').split(',').map(s => s.trim()).filter(Boolean)
            : [];

        if (!isAdminUser && assignedUnits.length === 0) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }
        this._restrictedUnits = assignedUnits;

        await this._loadEmployees();
        // PERBAIKAN PERFORMA (2026-09-01, keluhan: pindah Unit terasa
        // lambat) - lihat catatan lengkap di getSettingByKey() (Setting.gs)
        // & loadAndRender() di bawah. Settings LENGKAP (shift_types_config
        // dkk, dibutuhkan _getEffectiveUnit()) cukup dimuat SEKALI saja di
        // sini saat halaman pertama dibuka - bukan diulang tiap kali admin
        // ganti Unit/Bulan/Tahun.
        try {
            const res = await api.getSettings();
            if (res.success && res.data) this._allSettings = res.data;
        } catch (e) {
            console.error('Gagal memuat konfigurasi awal:', e);
        }
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
        } catch (e) {
            console.error('Gagal memuat daftar karyawan Operator:', e);
            toast.error('Gagal memuat daftar karyawan Operator.');
            this._employees = [];
        }
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
     * FITUR BARU (2 September 2026): "Upload Jadwal" - baca file Excel/CSV
     * berisi jadwal jaga (kolom Tanggal, Sesi, Nama Petugas) lalu otomatis
     * centang/pilih nama petugas yang cocok di tabel (checkbox utk
     * multi-grup mis. BNA Amuntai, dropdown utk multi-solo mis. SATPAM) -
     * supaya Admin tidak perlu centang satu per satu secara manual.
     * Cuma didukung utk unit dengan pola 'multi-grup'/'multi-solo' (lihat
     * toggle tombolnya di renderTable()). Mencocokkan NAMA PERSIS (setelah
     * di-trim & disamakan huruf besar/kecilnya) dengan daftar karyawan
     * unit ini (this._employeesForUnit) - nama yang tidak ketemu
     * dilaporkan lewat toast di akhir, TIDAK menggagalkan baris lain.
     * Tidak langsung Simpan ke server - cuma mengisi state di layar
     * (this.data, lalu render ulang), Admin tetap perlu tinjau &
     * tekan "Simpan" sendiri seperti biasa (jaga-jaga kalau ada
     * kekeliruan cocokkan sebelum tersimpan permanen).
     */
    async _handleUploadJadwal(file) {
        const unit = this._getEffectiveUnit(this.unitKey);
        if (!unit || (unit.pattern !== 'multi-grup' && unit.pattern !== 'multi-solo')) {
            toast.warning('Upload jadwal cuma didukung utk unit dengan sesi per-nama (mis. BNA Amuntai, SATPAM).');
            return;
        }

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

            const sessionIdx = rowCountPerDay[day] || 0;
            rowCountPerDay[day] = sessionIdx + 1;
            const sessionKey = sessionKeysInOrder[sessionIdx];
            if (!sessionKey) { extraRowsCount++; continue; } // sudah melebihi jumlah sesi unit ini utk tanggal ini

            const matchedIds = [];
            names.forEach(n => {
                const emp = unitEmployees.find(e => String(e.nama || '').trim().toLowerCase() === n.toLowerCase());
                if (emp) matchedIds.push(String(emp.id));
                else notFoundNames.add(n);
            });
            if (!matchedIds.length) continue;

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
        if (!base || base.pattern !== 'kontinu') return base;

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
            const res = await api.getSettingByKey(this._settingKey());
            const raw = res.success ? res.data : null;
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
        const unit = this._getEffectiveUnit(this.unitKey);
        if (!unit) { this._renderEmpty(); return; }

        const info = document.getElementById('jjo-unit-info');
        if (info) {
            info.innerHTML = `<strong>${unit.label}</strong>` +
                (unit.jamLabel ? ` &mdash; ${unit.jamLabel}` : '') +
                (this.unitKey === 'TRD' ? ' &mdash; jadwal piket (jam bebas)' : '');
        }

        // Tombol "Upload Jadwal" (Excel/CSV) cuma relevan utk unit dengan
        // checkbox/pilih PER NAMA KARYAWAN per sesi (multi-grup/multi-solo,
        // mis. BNA Amuntai/SATPAM) - lihat _handleUploadJadwal(). Unit
        // 'kontinu' (1 nama/hari) & TRD (per kode tim, bukan nama
        // karyawan) tidak didukung fitur ini, jadi tombolnya disembunyikan
        // supaya tidak membingungkan.
        const btnUpload = document.getElementById('jjo-btn-upload');
        const uploadHint = document.getElementById('jjo-upload-hint');
        const supportsUpload = unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo';
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
            // PERBAIKAN BUG (2026-09-01, dari laporan pindah unit "nama
            // petugas tidak berubah"): kalau dayData UNTUK HARI INI sudah
            // ada tersimpan dari SEBELUM unit ini "naik kelas" jadi
            // multi-sesi (mis. masih format lama kontinu {petugas:[],
            // keterangan:''}, tanpa field "sessions" sama sekali),
            // dayData.sessions akan undefined - baris di bawah
            // (dayData.sessions[sess.key]) langsung melempar TypeError
            // ("Cannot read properties of undefined") dan MENGHENTIKAN
            // seluruh render di tengah jalan SEBELUM sempat mengganti isi
            // tabel yang lama. Efeknya persis seperti dilaporkan: pindah ke
            // unit lain terlihat seperti "tidak berubah", padahal
            // sebenarnya render-nya GAGAL/error dan tabel LAMA (dari unit
            // sebelumnya) yang masih nyangkut di layar - _employeesForUnit()
            // sendiri sebenarnya SUDAH benar dari awal (sudah dikonfirmasi
            // lewat console: mengembalikan nama yang benar-benar berbeda).
            // Perbaikannya: pastikan dayData.sessions selalu berupa objek
            // dulu sebelum dibaca - data lama yang tidak relevan lagi
            // (petugas dari sebelum unit ini multi-sesi) otomatis diabaikan,
            // tidak menghalangi render.
            if (!dayData.sessions) dayData.sessions = {};
            if (!this.data.days[d]) this.data.days[d] = dayData;

            unit.sessions.forEach((sess, idx) => {
                const rawVal = dayData.sessions[sess.key];
                const selectedIds = isGrup
                    ? (Array.isArray(rawVal) ? rawVal.map(String) : [])
                    : (rawVal ? [String(rawVal)] : []);

                // Sesi multi-grup (mis. BNA Amuntai) - checkbox biasa (klik
                // langsung per nama, tanpa perlu tahan Ctrl/Cmd seperti
                // <select multiple> dulu). Format tersimpan TETAP array ID
                // karyawan, tidak berubah - lihat _bindInputs() di bawah.
                const petugasFieldHtml = isGrup
                    ? `<div class="jjo-checkbox-group" data-day="${d}" data-session="${sess.key}">
                        ${unitEmployees.map(emp => `
                            <label class="jjo-checkbox-item">
                                <input type="checkbox" class="jjo-petugas-checkbox" data-day="${d}" data-session="${sess.key}" value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'checked' : ''}>
                                <span>${this._escAttr(emp.nama)}</span>
                            </label>
                        `).join('')}
                    </div>`
                    : `<select class="jjo-select" data-day="${d}" data-session="${sess.key}">
                        <option value="">- Kosong -</option>
                        ${unitEmployees.map(emp => `
                            <option value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'selected' : ''}>${this._escAttr(emp.nama)}</option>
                        `).join('')}
                    </select>`;

                rows += `<tr class="${rowClass}">`;
                if (idx === 0) {
                    rows += `<td rowspan="${unit.sessions.length}">${d}</td>`;
                    rows += `<td rowspan="${unit.sessions.length}">${info.hariName}<br>${info.tanggalStr}</td>`;
                }
                rows += `<td>${sess.label}<br><span class="jjo-jam">${sess.time}</span></td>`;
                rows += `<td>
                    ${petugasFieldHtml}
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
                        <th>Nama Petugas${isGrup ? ' <small>(centang boleh lebih dari 1)</small>' : ''}</th>
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
        const isMulti = !!unit.multiPetugas;

        let rows = '';
        for (let d = 1; d <= days; d++) {
            const info = this._dayInfo(d);
            const rowClass = this._rowClass(info.dow);
            const dayData = this.data.days[d] || { petugas: '', keterangan: '' };
            if (!this.data.days[d]) this.data.days[d] = dayData;

            // PERBAIKAN (2026-09-01): unit dengan multiPetugas (semua SPAM,
            // lihat OPERATOR_UNITS di atas) pakai checkbox - dayData.petugas
            // jadi ARRAY id karyawan (boleh lebih dari 1), bukan 1 id
            // string lagi. Dukung juga bentuk lama (1 id string, dari
            // jadwal yang sudah tersimpan sebelum perubahan ini) supaya
            // tetap kebaca benar - lihat catatan yang sama di
            // checkOperatorRosterForToday() (Operatorschdule.gs, backend).
            const selectedIds = Array.isArray(dayData.petugas)
                ? dayData.petugas.map(String)
                : (dayData.petugas ? [String(dayData.petugas)] : []);

            const petugasFieldHtml = isMulti
                ? `<div class="jjo-checkbox-group" data-day="${d}" data-field="petugas">
                    ${unitEmployees.map(emp => `
                        <label class="jjo-checkbox-item">
                            <input type="checkbox" class="jjo-petugas-checkbox" data-day="${d}" data-field="petugas" value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'checked' : ''}>
                            <span>${this._escAttr(emp.nama)}</span>
                        </label>
                    `).join('')}
                </div>`
                : `<select class="jjo-select" data-day="${d}" data-field="petugas">
                    <option value="">- Kosong -</option>
                    ${unitEmployees.map(emp => `
                        <option value="${emp.id}" ${selectedIds.includes(String(emp.id)) ? 'selected' : ''}>${this._escAttr(emp.nama)}</option>
                    `).join('')}
                </select>`;

            rows += `<tr class="${rowClass}">
                <td>${d}</td>
                <td>${info.hariName}<br>${info.tanggalStr}</td>
                <td>${unit.jamLabel}</td>
                <td>
                    ${petugasFieldHtml}
                    ${unitEmployees.length === 0 ? '<div class="jjo-no-emp">Belum ada karyawan Operator di unit ini</div>' : ''}
                </td>
                <td><input type="text" class="jjo-input" data-day="${d}" data-field="keterangan"
                        value="${this._escAttr(dayData.keterangan || '')}" placeholder="Catatan (opsional)"></td>
            </tr>`;
        }

        wrap.innerHTML = `
            <table class="jjo-table">
                <thead>
                    <tr><th>No</th><th>Hari, Tanggal</th><th>Jam Operasional</th><th>Nama Petugas${isMulti ? ' <small>(centang boleh lebih dari 1)</small>' : ''}</th><th>Keterangan</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        this._bindInputs();
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
