/**
 * Portal Karyawan - Admin: Modal Konfirmasi Approve/Tolak
 * PT. Tirta Agung Amuntai
 *
 * Modal generik pengganti window.confirm()/window.prompt() bawaan browser -
 * dipakai admin-surat-tugas.js untuk approve/tolak Sanggahan Absensi & SPK
 * (menu Approval Surat Tugas). Menampilkan ringkasan pengajuan (karyawan,
 * tanggal, sesi, keterangan) dulu supaya Admin bisa cek sebelum menekan
 * tombol, dan textarea catatan bergaya form untuk aksi tolak (bukan
 * prompt() polosan seperti sebelumnya).
 *
 * Cara pakai (lihat approveSanggahan()/rejectSanggahan()/approveSpk()/
 * rejectSpk() di admin-surat-tugas.js):
 *
 *   adminApprovalModal.open({
 *     mode: 'approve' | 'reject',
 *     title: 'Setujui Sanggahan Absensi',
 *     details: [{ label: 'Karyawan', value: row.userName }, ...],
 *     warning: 'Sesi yang disanggah akan otomatis tercatat "Hadir (Kendala Teknis)".',
 *     confirmLabel: 'Setujui',
 *     onConfirm: async (catatan) => { ...; return true/false; }
 *   });
 *
 * onConfirm HARUS mengembalikan true kalau berhasil (modal otomatis
 * tertutup) atau false kalau gagal (modal tetap terbuka, tombol aktif
 * lagi, supaya Admin bisa coba ulang tanpa kehilangan catatan yang sudah
 * diketik). catatan yang dikirim ke onConfirm cuma relevan untuk mode
 * 'reject' - kosong ('') untuk mode 'approve'.
 */
const adminApprovalModal = {
    _onConfirm: null,

    open(options) {
        options = options || {};
        const isApprove = options.mode !== 'reject';
        this._onConfirm = options.onConfirm || null;

        document.getElementById('ac-title-text').textContent = options.title || (isApprove ? 'Setujui' : 'Tolak');
        const iconEl = document.getElementById('ac-title-icon');
        iconEl.className = isApprove ? 'fas fa-check-circle' : 'fas fa-triangle-exclamation';
        iconEl.style.color = isApprove ? 'var(--color-success)' : 'var(--color-danger)';

        const detailsEl = document.getElementById('ac-details');
        detailsEl.innerHTML = (options.details || []).map(function (d) {
            return `
                <div style="display:flex;justify-content:space-between;gap:12px;">
                    <span style="color:var(--text-muted);">${d.label}</span>
                    <span style="font-weight:600;text-align:right;">${d.value || '-'}</span>
                </div>
            `;
        }).join('');

        const catatanGroup = document.getElementById('ac-catatan-group');
        const catatanInput = document.getElementById('ac-catatan');
        catatanInput.value = '';
        catatanGroup.style.display = isApprove ? 'none' : 'block';

        const warningEl = document.getElementById('ac-warning');
        if (options.warning) {
            warningEl.textContent = options.warning;
            warningEl.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
        }

        const confirmBtn = document.getElementById('ac-btn-confirm');
        const label = options.confirmLabel || (isApprove ? 'Setujui' : 'Tolak');
        confirmBtn.textContent = label;
        confirmBtn.dataset.originalText = label;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.background = isApprove ? 'var(--color-success)' : 'var(--color-danger)';

        document.getElementById('modal-approval-confirm').style.display = 'flex';
    },

    close() {
        document.getElementById('modal-approval-confirm').style.display = 'none';
        this._onConfirm = null;
    },

    async confirm() {
        if (!this._onConfirm) { this.close(); return; }

        const catatan = document.getElementById('ac-catatan').value.trim();
        const btn = document.getElementById('ac-btn-confirm');
        const originalText = btn.dataset.originalText || btn.textContent;

        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

        let success = false;
        try {
            success = await this._onConfirm(catatan);
        } catch (e) {
            console.error('Error konfirmasi modal approval:', e);
            success = false;
        }

        if (success) {
            this.close();
        } else {
            // Gagal - biarkan modal tetap terbuka (catatan yang sudah diketik
            // tidak hilang) supaya Admin bisa coba lagi. Pesan error-nya
            // sendiri sudah ditampilkan lewat toast oleh onConfirm.
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = 'pointer';
            btn.textContent = originalText;
        }
    }
};

window.adminApprovalModal = adminApprovalModal;
