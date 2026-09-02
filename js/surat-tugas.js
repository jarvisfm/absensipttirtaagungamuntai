/**
 * Portal Karyawan - Surat Tugas (SPPD)
 * Karyawan input pengajuan Surat Tugas (dinas luar) - berstatus PENDING
 * dulu, baru berlaku (Attendance tercatat otomatis Dinas Luar) SETELAH
 * disetujui Admin. Lihat approveSuratTugasData() di Surattugas.gs.
 */
const suratTugas = {
    openModal() {
        // Jangan izinkan input Surat Tugas selama user masih dalam rentang
        // Izin/Cuti yang sedang berjalan hari ini (lihat updateUI() di
        // absensi.js yang men-disable tombolnya) - dicek ulang di sini
        // sebagai jaga-jaga kalau tombolnya somehow masih ke-klik.
        if (window.absensi && absensi.currentState === 'excused') {
            toast.error('Tidak bisa input Surat Tugas selama masih Izin/Cuti. Coba lagi setelah rentang Izin/Cuti Anda selesai.');
            return;
        }

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
                toast.success('Surat Tugas berhasil diajukan! Menunggu persetujuan Admin sebelum absensi Anda otomatis tercatat Dinas Luar.');
                document.getElementById('modal-surat-tugas').style.display = 'none';
                // Refresh halaman Absensi supaya banner "Dinas Luar" langsung
                // kelihatan kalau hari ini termasuk dalam rentangnya.
                if (window.absensi && typeof absensi.init === 'function') {
                    absensi.init();
                }
                // Badge kecil "menunggu approval" di menu sidebar - langsung
                // muncul tanpa perlu reload/login ulang.
                if (window.absensi && typeof absensi.refreshSuratTugasBadge === 'function') {
                    absensi.refreshSuratTugasBadge();
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
