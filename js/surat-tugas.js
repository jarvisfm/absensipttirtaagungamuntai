/**
 * Portal Karyawan - Surat Tugas (SPPD)
 * Self-declare dinas luar - begitu disimpan, langsung berlaku (tanpa
 * approval), semua sesi absensi di rentang tanggal itu otomatis Hadir.
 */
const suratTugas = {
    openModal() {
        // Reset form tiap dibuka
        document.getElementById('st-nomorSurat').value = '';
        document.getElementById('st-tujuan').value = '';
        document.getElementById('st-tanggalMulai').value = '';
        document.getElementById('st-tanggalSelesai').value = '';
        document.getElementById('st-keterangan').value = '';
        document.getElementById('st-fileUrl').value = '';

        document.getElementById('modal-surat-tugas').style.display = 'flex';
    },

    async submit() {
        const tujuan = document.getElementById('st-tujuan').value.trim();
        const tanggalMulai = document.getElementById('st-tanggalMulai').value;
        const tanggalSelesai = document.getElementById('st-tanggalSelesai').value;

        if (!tujuan) { toast.error('Tujuan dinas wajib diisi!'); return; }
        if (!tanggalMulai || !tanggalSelesai) { toast.error('Tanggal mulai dan selesai wajib diisi!'); return; }
        if (tanggalSelesai < tanggalMulai) { toast.error('Tanggal selesai tidak boleh sebelum tanggal mulai!'); return; }

        const currentUser = auth.getCurrentUser();
        const data = {
            userId: currentUser?.employeeId || currentUser?.id,
            userName: currentUser?.name || '',
            nomorSurat: document.getElementById('st-nomorSurat').value.trim(),
            tujuan,
            tanggalMulai,
            tanggalSelesai,
            keterangan: document.getElementById('st-keterangan').value.trim(),
            fileUrl: document.getElementById('st-fileUrl').value.trim()
        };

        try {
            const result = await api.submitSuratTugas(data);
            if (result.success) {
                toast.success('Surat Tugas tersimpan! Absensi Anda otomatis tercatat Hadir untuk rentang tanggal tsb.');
                document.getElementById('modal-surat-tugas').style.display = 'none';
                // Refresh halaman Absensi supaya banner "Dinas Luar" langsung
                // kelihatan kalau hari ini termasuk dalam rentangnya.
                if (window.absensi && typeof absensi.init === 'function') {
                    absensi.init();
                }
            } else {
                toast.error(result.error || 'Gagal menyimpan Surat Tugas');
            }
        } catch (e) {
            console.error('Error submit Surat Tugas:', e);
            toast.error('Terjadi kesalahan');
        }
    }
};

window.suratTugas = suratTugas;
