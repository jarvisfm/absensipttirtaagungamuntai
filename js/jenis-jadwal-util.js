/**
 * Portal Karyawan - Sinkronisasi dropdown "Jenis Jadwal"
 *
 * Dropdown "Jenis Jadwal" di form Tambah/Edit Karyawan (p-shift, emp-shift,
 * edit-emp-shift) diisi DINAMIS dari konfigurasi jam yang diatur admin di
 * halaman "Jadwal Shift" (lihat shift-schedule.js, key setting
 * 'shift_types_config') - bukan daftar <option> hardcode lagi. Jadi begitu
 * admin menambah Jenis Jadwal baru (mis. "SATPAM", "TRD", atau varian
 * Operator lain) di halaman Jadwal Shift, otomatis jadi pilihan di sini juga
 * tanpa perlu ubah kode.
 */

// Label tampilan yang lebih ramah untuk beberapa key bawaan (opsional -
// kalau tidak ada di sini, key-nya sendiri yang ditampilkan apa adanya).
const JENIS_JADWAL_LABELS = {
    'Reguler (Sen-Kam)': 'Reguler (Senin-Jumat)',
    'Jaga Malam': 'Jaga Malam (Senin-Sabtu)'
};

async function getJenisJadwalOptions() {
    try {
        const res = await api.getSettings();
        const raw = res.success && res.data ? res.data['shift_types_config'] : null;
        const config = raw ? JSON.parse(raw) : null;
        const keys = config ? Object.keys(config) : [];
        if (keys.length) return keys;
    } catch (e) {
        console.error('Gagal memuat daftar Jenis Jadwal dari konfigurasi:', e);
    }
    // Fallback kalau gagal dimuat / admin belum pernah menyimpan apa pun di
    // halaman Jadwal Shift - persis meniru daftar bawaan di shift-schedule.js
    // (_defaultConfig) supaya dropdown ini tetap lengkap sejak awal, sebelum
    // admin sempat buka & "Simpan Semua" di halaman Jadwal Shift.
    return [
        'Reguler (Sen-Kam)',
        'Jaga Malam',
        'SATPAM',
        'TRD',
        'Operator - 24 Jam',
        'Operator - 18 Jam',
        'Operator - 16 Jam',
        'Operator - 13 Jam'
    ];
}

/**
 * Isi ulang <select> Jenis Jadwal dengan pilihan terkini, lalu set nilai
 * terpilih (kalau ada). Kalau nilai karyawan ini ternyata sudah tidak ada
 * lagi di konfigurasi (mis. Jenis Jadwal-nya sudah dihapus admin), tetap
 * ditampilkan sebagai opsi tambahan supaya tidak diam-diam berubah ke nilai
 * lain saat form disimpan ulang.
 */
async function populateJenisJadwalSelect(selectId, selectedValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const keys = await getJenisJadwalOptions();
    const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    sel.innerHTML = keys.map(k => `<option value="${escAttr(k)}">${escAttr(JENIS_JADWAL_LABELS[k] || k)}</option>`).join('');

    if (selectedValue && !keys.includes(selectedValue)) {
        sel.insertAdjacentHTML('beforeend', `<option value="${escAttr(selectedValue)}">${escAttr(selectedValue)} (tidak ada di konfigurasi Jadwal Shift)</option>`);
    }
    if (selectedValue) sel.value = selectedValue;
}

window.getJenisJadwalOptions = getJenisJadwalOptions;
window.populateJenisJadwalSelect = populateJenisJadwalSelect;
