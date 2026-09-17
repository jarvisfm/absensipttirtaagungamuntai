/**
 * Portal Karyawan - Sanggahan Absensi
 * PT. Tirta Agung Amuntai
 *
 * Karyawan mengajukan sanggahan untuk sesi absen yang tidak sempat tercatat
 * karena kendala teknis (jaringan hilang, listrik padam, dsb) - berstatus
 * PENDING dulu, baru berlaku (sesi yang disanggah tercatat "Hadir (Kendala
 * Teknis)") SETELAH disetujui Admin. Lihat approveSanggahanAbsensi() di
 * SanggahanAbsensi.gs. Pola file ini SENGAJA meniru surat-tugas.js supaya
 * konsisten.
 */
const sanggahanAbsensi = {
    _sessionsForDate: [], // hasil terakhir dari getAttendanceSessionsForDate(), dipakai submit() buat tau label sesi yang dicentang

    openModal() {
        document.getElementById('sa-keterangan').value = '';

        const tanggalInput = document.getElementById('sa-tanggal');
        const todayStr = (typeof dateTime !== 'undefined' && dateTime.getLocalDate)
            ? dateTime.getLocalDate()
            : new Date().toISOString().split('T')[0];
        tanggalInput.value = todayStr;
        tanggalInput.max = todayStr; // tidak boleh pilih tanggal masa depan

        tanggalInput.onchange = () => this._loadSessionsForDate(tanggalInput.value);

        document.getElementById('modal-sanggahan-absensi').style.display = 'flex';
        this._resetSimpanButton();
        this._loadSessionsForDate(todayStr);
        this._renderHistory();
    },

    // Format tanggal "YYYY-MM-DD" jadi "11 Sep 2026" - dipakai riwayat di
    // bawah, biar konsisten dengan format tanggal lain di aplikasi ini.
    _formatTanggalSingkat(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(String(dateStr) + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    },

    /**
     * [TAMBAHAN] Riwayat Sanggahan Absensi milik karyawan sendiri, di
     * dalam modal - biar status & CATATAN PENOLAKAN Admin (kalau ditolak,
     * lihat rejectSanggahanAbsensi() di Sanggahanabsensi.gs) langsung
     * kelihatan di aplikasi, tidak cuma lewat notifikasi push yang sekilas
     * lewat dan tidak bisa dibuka lagi. Dipanggil tiap modal dibuka
     * (openModal()) supaya selalu terbaru - termasuk begitu karyawan buka
     * lagi modal ini setelah pengajuan sebelumnya diproses Admin.
     */
    async _renderHistory() {
        const list = document.getElementById('sa-history-list');
        if (!list) return;
        list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</span>';

        const user = auth.getCurrentUser();
        const effectiveId = user?.employeeId || user?.id;
        if (!effectiveId) return;

        try {
            const result = await api.getSanggahanAbsensi(effectiveId);
            const rows = result.success ? (result.data || []) : [];

            if (!rows.length) {
                list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">Belum pernah mengajukan sanggahan absensi.</span>';
                return;
            }

            const statusLabels = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

            list.innerHTML = rows.map(r => {
                const status = r.status || 'pending';
                const label = statusLabels[status] || status;
                const rejectedNoteHtml = (status === 'rejected' && r.rejectedNote)
                    ? `<div style="font-size:0.8rem;color:var(--color-danger);margin-top:6px;"><i class="fas fa-comment-dots"></i> Catatan Admin: &ldquo;${r.rejectedNote}&rdquo;</div>`
                    : '';
                return `
                    <div style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <strong style="font-size:0.85rem;">${this._formatTanggalSingkat(r.date)}</strong>
                            <span class="status-badge ${status}" style="font-size:0.7rem;">${label}</span>
                        </div>
                        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${r.sessionLabels || '-'}</div>
                        ${rejectedNoteHtml}
                    </div>`;
            }).join('');
        } catch (e) {
            console.error('Gagal memuat riwayat Sanggahan Absensi:', e);
            list.innerHTML = '<span style="font-size:0.8rem;color:var(--color-danger);">Gagal memuat riwayat.</span>';
        }
    },

    async _loadSessionsForDate(dateStr) {
        const list = document.getElementById('sa-sessions-list');
        if (!list) return;
        list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Memuat sesi...</span>';
        this._sessionsForDate = [];

        const user = auth.getCurrentUser();
        const effectiveId = user?.employeeId || user?.id;
        if (!effectiveId || !dateStr) return;

        try {
            const result = await api.getAttendanceSessionsForDate(effectiveId, dateStr);
            if (!result.success) {
                list.innerHTML = `<span style="font-size:0.8rem;color:var(--color-danger);">${result.error || 'Gagal memuat sesi'}</span>`;
                return;
            }

            const sessions = (result.data && result.data.sessions) || [];
            this._sessionsForDate = sessions;
            const disputable = sessions.filter(s => s.disputable);

            if (!disputable.length) {
                list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">Tidak ada sesi yang bisa disanggah untuk tanggal ini - semua sesi sudah tercatat normal, atau tidak ada jadwal kerja di tanggal tsb.</span>';
                return;
            }

            list.innerHTML = disputable.map(s => `
                <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer;">
                    <input type="checkbox" class="sa-session-checkbox" value="${s.field}">
                    <span>${s.label}</span>
                </label>
            `).join('');
        } catch (e) {
            console.error('Error memuat sesi Sanggahan Absensi:', e);
            list.innerHTML = '<span style="font-size:0.8rem;color:var(--color-danger);">Gagal memuat sesi - coba lagi.</span>';
        }
    },

    // Cegah submit dobel - pola sama seperti suratTugas._isSubmitting.
    _isSubmitting: false,

    _setSimpanLoading(loading) {
        const btn = document.getElementById('sa-btn-simpan');
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = 'pointer';
            if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
        }
    },

    _resetSimpanButton() {
        this._isSubmitting = false;
        this._setSimpanLoading(false);
    },

    async submit() {
        if (this._isSubmitting) return;

        const tanggal = document.getElementById('sa-tanggal').value;
        const keterangan = document.getElementById('sa-keterangan').value.trim();
        const checkedBoxes = Array.from(document.querySelectorAll('.sa-session-checkbox:checked'));
        const sessionFields = checkedBoxes.map(cb => cb.value);

        if (!tanggal) { toast.error('Tanggal absensi wajib diisi!'); return; }
        if (!sessionFields.length) { toast.error('Pilih minimal 1 sesi yang bermasalah!'); return; }
        if (!keterangan) { toast.error('Keterangan wajib diisi!'); return; }

        const currentUser = auth.getCurrentUser();
        const data = {
            userId: currentUser?.employeeId || currentUser?.id,
            userName: currentUser?.name || '',
            date: tanggal,
            sessionFields: sessionFields,
            keterangan: keterangan
        };

        this._isSubmitting = true;
        this._setSimpanLoading(true);

        try {
            const result = await api.submitSanggahanAbsensi(data);
            if (result.success) {
                toast.success('Sanggahan Absensi berhasil dikirim - menunggu persetujuan Admin.');
                document.getElementById('modal-sanggahan-absensi').style.display = 'none';
                this.refreshBadge();
            } else {
                toast.error(result.error || 'Gagal mengirim Sanggahan Absensi');
            }
        } catch (e) {
            console.error('Error submit Sanggahan Absensi:', e);
            toast.error('Terjadi kesalahan, coba lagi.');
        } finally {
            this._resetSimpanButton();
        }
    },

    /**
     * Sub-teks kecil di bawah tombol "Sanggahan Absensi" (kartu Absensi) -
     * kasih tahu karyawan kalau masih ada sanggahan yang berstatus
     * 'pending' (belum diputuskan Admin). Pola ringan, mirror
     * absensi.refreshSuratTugasBadge() tapi cuma untuk teks tombol ini
     * saja (tidak pakai badge titik oranye terpisah di sidebar). Dipanggil
     * dari 2 tempat: (1) absensi.js init(), dengan angka yang sudah
     * didapat lewat getAbsensiPageData() (lihat preFetchedPendingCount di
     * bawah); (2) di sini sendiri, setelah submit sanggahan baru berhasil.
     *
     * [TAMBAHAN - optimasi jam sibuk, 15 September 2026] preFetchedPendingCount
     * (number, opsional): kalau diisi, fungsi ini TIDAK memanggil server
     * sendiri lagi - tinggal pakai angka yang sudah didapat pemanggilnya.
     * Dipanggil TANPA argumen (mis. dari submit() di atas) tetap jatuh ke
     * perilaku lama (fetch sendiri lewat api.getSanggahanAbsensi()).
     */
    async refreshBadge(preFetchedPendingCount) {
        const subEl = document.getElementById('sanggahan-absensi-trigger-sub');
        if (!subEl) return;

        if (typeof preFetchedPendingCount === 'number') {
            subEl.textContent = preFetchedPendingCount > 0
                ? `${preFetchedPendingCount} sanggahan menunggu persetujuan Admin`
                : 'Ada kendala jaringan/listrik saat absen? Laporkan di sini';
            return;
        }

        try {
            const user = auth.getCurrentUser ? auth.getCurrentUser() : null;
            if (!user) return;
            const effectiveId = user.employeeId || user.id;
            const res = await api.getSanggahanAbsensi(effectiveId);
            const pendingCount = res.success ? (res.data || []).filter(r => r.status === 'pending').length : 0;
            subEl.textContent = pendingCount > 0
                ? `${pendingCount} sanggahan menunggu persetujuan Admin`
                : 'Ada kendala jaringan/listrik saat absen? Laporkan di sini';
        } catch (e) {
            console.error('Gagal memuat status Sanggahan Absensi:', e);
        }
    }
};

window.sanggahanAbsensi = sanggahanAbsensi;
