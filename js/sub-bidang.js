/**
 * Sub Bidang / Seksi (dipakai Edit Profil, Data Karyawan, dan form Permintaan Barang).
 * Daftar UMUM (tidak bergantung pada Bagian). Dipakai sebagai <input list="..."> + <datalist>:
 * bisa memilih dari daftar ATAU mengetik manual.
 */
window.SubBidang = {
    LIST: [
        'Tata Kelola dan Pelaporan', 'Auditor',
        'Kepegawaian', 'Pergudangan', 'Umum & Persediaan',
        'Pengelolaan Kas', 'Penganggaran dan Akuntansi',
        'Baca Meter dan Rekening', 'Pelayanan dan Pemasaran', 'Penagihan dan Penertiban',
        'Laboratorium', 'Perencanaan dan Pengawasan', 'Meter dan Peralatan Teknik',
        'Transmisi dan Distribusi', 'Kehilangan Air (NRW)', 'Produksi'
    ],

    all() { return this.LIST.slice(); },

    /** Daftar pilihan (sama untuk semua Bagian; parameter dipertahankan agar pemanggil lama tetap jalan). */
    optionsFor(/* bagian */) { return this.all(); },

    /** Isi <datalist> dengan daftar pilihan. */
    fillList(listEl /*, bagian */) {
        if (!listEl) return;
        listEl.innerHTML = '';
        this.LIST.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            listEl.appendChild(opt);
        });
    },

    /** Dipanggil saat Bagian diganti: isian Sub Bidang dibiarkan apa adanya (daftar bersifat umum). */
    onBagianChange(inputEl, listEl) {
        this.fillList(listEl);
    }
};
