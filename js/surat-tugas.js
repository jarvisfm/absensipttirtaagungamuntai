/**
 * Portal Karyawan - Surat Tugas (SPPD)
 * Karyawan input pengajuan Surat Tugas (dinas luar) - berstatus PENDING
 * dulu, baru berlaku (Attendance tercatat otomatis Dinas Luar) SETELAH
 * disetujui Admin. Lihat approveSuratTugasData() di Surattugas.gs.
 */
const suratTugas = {
    // true selama karyawan masih punya Surat Tugas berstatus pending (belum
    // diputuskan Admin). Selama true, tombol Input SPPD dikunci supaya tidak
    // ada data SPPD ganda di Admin. Diisi dari absensi.refreshSuratTugasBadge()
    // & absensi.init() (data pending yang sudah ada), dan dijaga ulang di
    // server (submitSuratTugasData di Surattugas.gs).
    hasPending: false,

    setPending(has) {
        this.hasPending = !!has;
        this.applyLockUI();
    },

    // Satu-satunya tempat yang mengatur tampilan tombol Input SPPD:
    // dikunci kalau sedang Izin/Cuti ATAU masih ada SPPD yang menunggu approval.
    applyLockUI() {
        const btn = document.getElementById('btn-surat-tugas-trigger');
        if (!btn) return;
        const isExcused = !!(window.absensi && absensi.currentState === 'excused');
        const locked = isExcused || this.hasPending;
        btn.disabled = locked;
        btn.classList.toggle('disabled', locked);
        const subEl = document.getElementById('surat-tugas-trigger-sub');
        if (subEl) {
            subEl.textContent = isExcused
                ? 'Tidak bisa diisi selama masih Izin/Cuti'
                : (this.hasPending
                    ? 'Menunggu approval dari admin'
                    : 'Sedang dinas luar? Catat di sini');
        }
    },

    openModal() {
        // Sudah ada SPPD yang menunggu approval - jangan izinkan input lagi
        // (cegah data ganda). Tombolnya juga sudah dikunci lewat applyLockUI().
        if (this.hasPending) {
            toast.error('Anda masih punya Surat Tugas yang menunggu approval admin. Tunggu sampai diputuskan sebelum mengajukan lagi.');
            return;
        }

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

        // Pastikan tombol Simpan dalam keadaan aktif & teks normal tiap
        // modal dibuka (jaga-jaga kalau submit sebelumnya gagal di tengah
        // jalan dan sempat tidak ke-reset).
        this._resetSimpanButton();
    },

    // Cegah submit dobel: flag jaga-jaga + disable tombol supaya user
    // tidak bisa klik "Simpan" berkali-kali selagi request masih diproses
    // (yang bisa bikin data SPPD kecatat berulang di database).
    _isSubmitting: false,

    _setSimpanLoading(loading) {
        const btn = document.getElementById('st-btn-simpan');
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

    _resetSimpanButton() {
        this._isSubmitting = false;
        this._setSimpanLoading(false);
    },

    async submit() {
        // Kalau masih ada request submit yang berjalan, abaikan klik ini.
        if (this._isSubmitting) return;

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

        this._isSubmitting = true;
        this._setSimpanLoading(true);

        try {
            const result = await api.submitSuratTugas(data);
            if (result.success) {
                toast.success('Surat Tugas berhasil diajukan! Menunggu persetujuan Admin sebelum absensi Anda otomatis tercatat Dinas Luar.');
                document.getElementById('modal-surat-tugas').style.display = 'none';
                // Kunci tombol Input SPPD sampai admin memutuskan.
                this.setPending(true);
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
                // Server menolak karena sudah ada SPPD pending (mis. dari
                // perangkat lain) - kunci tombolnya juga di sini.
                if (result.pendingExists) {
                    document.getElementById('modal-surat-tugas').style.display = 'none';
                    this.setPending(true);
                }
            }
        } catch (e) {
            console.error('Error submit Surat Tugas:', e);
            toast.error('Terjadi kesalahan');
        } finally {
            // Apapun hasilnya (sukses/gagal/error), tombol selalu
            // dikembalikan aktif supaya user bisa coba lagi kalau perlu.
            this._resetSimpanButton();
        }
    }
};

window.suratTugas = suratTugas;
