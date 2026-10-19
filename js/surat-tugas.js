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
        // Pending TIDAK mendisable tombol - modal tetap bisa dibuka untuk melihat
        // riwayat, tapi form input disembunyikan (lihat openModal()).
        btn.disabled = isExcused;
        btn.classList.toggle('disabled', isExcused);
        const subEl = document.getElementById('surat-tugas-trigger-sub');
        if (subEl) {
            subEl.textContent = isExcused
                ? 'Tidak bisa diisi selama masih Izin/Cuti'
                : (this.hasPending
                    ? 'Menunggu approval admin - lihat riwayat di sini'
                    : 'Sedang dinas luar? Catat di sini');
        }
    },

    openModal() {
        // Sudah ada SPPD yang menunggu approval - jangan izinkan input lagi
        // (cegah data ganda). Tombolnya juga sudah dikunci lewat applyLockUI().
        // Kalau pending: modal dibuka dalam mode riwayat saja (form disembunyikan).
        const pending = this.hasPending;
        const formEl = document.getElementById('st-form-section');
        const noticeEl = document.getElementById('st-pending-notice');
        if (formEl) formEl.style.display = pending ? 'none' : '';
        if (noticeEl) noticeEl.style.display = pending ? '' : 'none';

        // Jangan izinkan input Surat Tugas selama user masih dalam rentang
        // Izin/Cuti yang sedang berjalan hari ini (lihat updateUI() di
        // absensi.js yang men-disable tombolnya) - dicek ulang di sini
        // sebagai jaga-jaga kalau tombolnya somehow masih ke-klik.
        if (window.absensi && absensi.currentState === 'excused') {
            toast.error('Tidak bisa input Surat Tugas selama masih Izin/Cuti. Coba lagi setelah rentang Izin/Cuti Anda selesai.');
            return;
        }

        // Reset form tiap dibuka
        if (!pending) {
        document.getElementById('st-nomorSurat').value = '';
        document.getElementById('st-tujuan').value = '';
        document.getElementById('st-tanggalMulai').value = '';
        document.getElementById('st-tanggalSelesai').value = '';
        document.getElementById('st-keterangan').value = '';
        document.getElementById('st-fileUrl').value = '';
        }

        document.getElementById('modal-surat-tugas').style.display = 'flex';
        this._renderHistory();

        // Pastikan tombol Simpan dalam keadaan aktif & teks normal tiap
        // modal dibuka (jaga-jaga kalau submit sebelumnya gagal di tengah
        // jalan dan sempat tidak ke-reset).
        this._resetSimpanButton();
    },

    // ---------- Riwayat SPPD saya (pola sama dengan Riwayat Sanggahan Saya) ----------
    _historyRows: [],

    _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    _fmtTgl(ymd) {
        const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return this._esc(ymd || '-');
        const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        return `${parseInt(m[3], 10)} ${bln[parseInt(m[2], 10) - 1]} ${m[1]}`;
    },

    async _renderHistory() {
        const list = document.getElementById('st-history-list');
        if (!list) return;
        list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</span>';

        const user = auth.getCurrentUser();
        const effectiveId = user?.employeeId || user?.id;
        if (!effectiveId) return;

        try {
            const result = await api.getSuratTugas(effectiveId);
            this._historyRows = result.success ? (result.data || []) : [];
            this._populateHistoryMonthFilter();
            this._renderHistoryList();
        } catch (e) {
            console.error('Gagal memuat riwayat Surat Tugas:', e);
            list.innerHTML = '<span style="font-size:0.8rem;color:var(--color-danger);">Gagal memuat riwayat.</span>';
        }
    },

    _populateHistoryMonthFilter() {
        const select = document.getElementById('st-history-month');
        if (!select) return;
        const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const months = [...new Set((this._historyRows || []).map(r => String(r.tanggalMulai || '').substring(0, 7)).filter(Boolean))];
        months.sort().reverse();
        const todayYM = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate().substring(0, 7) : '';

        const previouslySelected = select.value;
        select.innerHTML = ['<option value="">Semua Bulan</option>'].concat(months.map(ym => {
            const [y, m] = ym.split('-');
            return `<option value="${ym}">${monthNames[parseInt(m, 10) - 1]} ${y}</option>`;
        })).join('');
        select.value = (previouslySelected && months.includes(previouslySelected))
            ? previouslySelected
            : (months.includes(todayYM) ? todayYM : '');

        if (!select._historyFilterBound) {
            select.addEventListener('change', () => this._renderHistoryList());
            select._historyFilterBound = true;
        }
    },

    _renderHistoryList() {
        const list = document.getElementById('st-history-list');
        if (!list) return;
        const select = document.getElementById('st-history-month');
        const ym = select ? select.value : '';
        const all = this._historyRows || [];
        const rows = ym ? all.filter(r => String(r.tanggalMulai || '').startsWith(ym)) : all;

        if (!rows.length) {
            list.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${all.length ? 'Tidak ada SPPD di bulan ini.' : 'Belum pernah mengajukan Surat Tugas (SPPD).'}</span>`;
            return;
        }

        const statusLabels = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
        list.innerHTML = rows.map(r => {
            const status = r.status || 'pending';
            const label = statusLabels[status] || status;
            const range = (r.tanggalMulai === r.tanggalSelesai || !r.tanggalSelesai)
                ? this._fmtTgl(r.tanggalMulai)
                : `${this._fmtTgl(r.tanggalMulai)} s.d. ${this._fmtTgl(r.tanggalSelesai)}`;
            const nomor = r.nomorSurat ? `<div style="font-size:0.75rem;color:var(--text-muted);">No. ${this._esc(r.nomorSurat)}</div>` : '';
            const link = /^https?:\/\//i.test(String(r.fileUrl || ''))
                ? ` &bull; <a href="${this._esc(r.fileUrl)}" target="_blank" rel="noopener">Dokumen</a>` : '';
            const note = (status === 'rejected' && r.rejectedNote)
                ? `<div style="font-size:0.8rem;color:var(--color-danger);margin-top:6px;"><i class="fas fa-comment-dots"></i> Catatan Admin: &ldquo;${this._esc(r.rejectedNote)}&rdquo;</div>` : '';
            return `
                <div style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <strong style="font-size:0.85rem;">${range}</strong>
                        <span class="status-badge ${this._esc(status)}" style="font-size:0.7rem;">${this._esc(label)}</span>
                    </div>
                    ${nomor}
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${this._esc(r.tujuan || '-')}${link}</div>
                    ${note}
                </div>`;
        }).join('');
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
                    this.setPending(true);
                    this.openModal();
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
