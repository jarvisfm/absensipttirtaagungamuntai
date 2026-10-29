/**
 * Sub Bidang / Seksi per Bagian (dipakai Edit Profil, Data Karyawan, dan form Permintaan Barang).
 * Dipakai sebagai <input list="..."> + <datalist>: bisa memilih dari daftar ATAU mengetik manual.
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

    /**
     * Daftar pilihan: SEMUA sub bidang, dengan milik Bagian yang diberikan ditaruh paling atas
     * (sisanya menyusul di bawah, bisa di-scroll). Kalau Bagian kosong/tidak dikenal, urutan standar.
     */
    optionsFor(bagian) {
        const own = this.MAP[this._key(bagian)] || [];
        return own.concat(this.all().filter(name => own.indexOf(name) === -1));
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
