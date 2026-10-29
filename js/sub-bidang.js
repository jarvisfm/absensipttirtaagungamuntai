/**
 * Sub Bidang / Seksi per Bagian (dipakai Edit Profil, Data Karyawan, dan form Permintaan Barang).
 * Dipakai sebagai <input list="..."> + <datalist>: bisa memilih dari daftar ATAU mengetik manual.
 * Daftar pilihan HANYA berisi sub bidang milik Bagian yang dipilih (mis. UMUM DAN KEPEGAWAIAN ->
 * Kepegawaian, Pergudangan, Umum & Persediaan). Bagian kosong/tidak dikenal -> semua ditampilkan.
 */
window.SubBidang = {
    MAP: {
        'SPI': ['Tata Kelola dan Pelaporan', 'Auditor'],
        'UMUM DAN KEPEGAWAIAN': ['Kepegawaian', 'Pergudangan', 'Umum & Persediaan'],
        'KEUANGAN': ['Pengelolaan Kas', 'Penganggaran dan Akuntansi'],
        'HUBUNGAN LANGGANAN': ['Baca Meter dan Rekening', 'Pelayanan dan Pemasaran', 'Penagihan dan Penertiban'],
        'TEKNIK DAN PENGAWASAN': ['Laboratorium', 'Perencanaan dan Pengawasan', 'Meter dan Peralatan Teknik'],
        'OPERASI DAN JARINGAN': ['Transmisi dan Distribusi', 'Kehilangan Air (NRW)', 'Produksi']
    },

    _key(bagian) { return String(bagian || '').trim().toUpperCase(); },

    all() {
        return Object.keys(this.MAP).reduce((acc, k) => acc.concat(this.MAP[k]), []);
    },

    /** Pilihan untuk sebuah Bagian; kalau Bagian kosong/tidak dikenal, tampilkan semua. */
    optionsFor(bagian) {
        return this.MAP[this._key(bagian)] || this.all();
    },

    /** Isi ulang <datalist> sesuai Bagian. */
    fillList(listEl, bagian) {
        if (!listEl) return;
        listEl.innerHTML = '';
        this.optionsFor(bagian).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            listEl.appendChild(opt);
        });
    },

    /**
     * Dipanggil saat Bagian diganti: daftar pilihan ikut berganti. Kalau isian sekarang adalah
     * sub bidang standar milik Bagian LAIN, dikosongkan (tulisan manual tidak disentuh).
     */
    onBagianChange(inputEl, listEl, bagian) {
        if (inputEl) {
            const val = inputEl.value.trim();
            const known = this.MAP[this._key(bagian)];
            if (val && known && this.all().indexOf(val) !== -1 && known.indexOf(val) === -1) inputEl.value = '';
        }
        this.fillList(listEl, bagian);
    }
};
