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
     * saja (tidak pakai badge titik oranye terpisah di sidebar).
     */
    async refreshBadge() {
        const subEl = document.getElementById('sanggahan-absensi-trigger-sub');
        if (!subEl) return;
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
