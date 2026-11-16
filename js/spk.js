/**
 * PENAMBAHAN (2026-09-09): Portal Karyawan - SPK (Surat Perintah Kerja)
 * Karyawan (khusus petugas lapangan Transmisi & Distribusi) input
 * pengajuan SPK - berstatus PENDING dulu, baru berlaku (sesi absensi yang
 * dipilih otomatis tercatat "SPK") SETELAH disetujui Admin. Lihat
 * approveSpkData() di Spk.gs.
 *
 * BEDA dengan Surat Tugas (SPPD, lihat surat-tugas.js): SPK bukan untuk
 * dinas ke luar kantor dengan rentang tanggal, tapi untuk petugas yang
 * sedang memperbaiki gangguan air di lapangan (biasanya di luar radius/
 * tanpa sinyal HP memadai) - jadi cukup pilih SESI mana saja (Masuk/
 * Istirahat/Selesai Istirahat/Pulang) di SATU tanggal yang akan digantikan
 * "SPK", bukan rentang tanggal dengan jam dari-sampai.
 */
const spk = {
    // 4 sesi standar - PERSIS Timeline Hari Ini di halaman Absensi.
    SESI_LABELS: {
        clockIn: 'Masuk',
        breakStart: 'Istirahat',
        breakEnd: 'Selesai Istirahat',
        clockOut: 'Pulang'
    },

    // ---------- Kunci tombol Input SPK ----------
    // true selama karyawan punya SPK berstatus PENDING (belum diputuskan
    // Admin) yang TANGGALNYA = HARI INI. Selama true, tombol Input SPK
    // dinonaktifkan. Begitu Admin menolak (atau menyetujui), SPK itu tidak
    // pending lagi -> tombol aktif kembali. SPK pending untuk tanggal LAIN
    // (mis. diajukan untuk besok) TIDAK mengunci apa pun hari ini - tombol
    // baru terkunci saat tanggal SPK itu tiba dan masih pending.
    hasPendingToday: false,

    _todayStr() {
        try {
            if (window.dateTime && typeof dateTime.getLocalDate === 'function') return dateTime.getLocalDate();
        } catch (e) { /* jatuh ke tanggal perangkat */ }
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    // "2026-11-16" / "2026-11-16T00:00:00.000Z" -> "2026-11-16"
    _toYMD(v) {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '').trim());
        return m ? m[1] : '';
    },

    setPendingToday(has) {
        this.hasPendingToday = !!has;
        this.applyLockUI();
    },

    applyLockUI() {
        const btn = document.getElementById('btn-spk-trigger');
        if (!btn) return;
        const locked = this.hasPendingToday;
        btn.disabled = locked;
        btn.classList.toggle('disabled', locked);
        const subEl = btn.querySelector('small');
        if (subEl) {
            if (!subEl.dataset.defaultText) subEl.dataset.defaultText = subEl.textContent;
            subEl.textContent = locked
                ? 'Menunggu approval admin - SPK hari ini sudah diajukan'
                : subEl.dataset.defaultText;
        }
    },

    // Dipanggil dari absensi.init() setiap halaman Absensi dibuka.
    // pendingCount = jumlah SPK pending milik karyawan (sudah ikut terhitung
    // di getAbsensiPageData(), jadi TIDAK ada request tambahan untuk
    // karyawan yang tidak punya SPK pending). undefined = data halaman
    // gagal dimuat -> cek sendiri lewat api.getSpk().
    async refreshLock(pendingCount) {
        if (pendingCount === 0) {
            this.setPendingToday(false);
            return;
        }
        try {
            const user = auth.getCurrentUser();
            const effectiveId = user?.employeeId || user?.id;
            if (!effectiveId) return;
            const res = await api.getSpk(effectiveId);
            if (!res || !res.success) return; // gagal memuat: biarkan tombol apa adanya
            const today = this._todayStr();
            const adaHariIni = (res.data || []).some(r =>
                (r.status || 'pending') === 'pending' && this._toYMD(r.tanggal) === today
            );
            this.setPendingToday(adaHariIni);
        } catch (e) {
            console.error('Gagal memuat status kunci tombol SPK:', e);
        }
    },

    openModal() {
        // Sudah ada SPK untuk HARI INI yang menunggu approval Admin - tombolnya
        // sudah dinonaktifkan lewat applyLockUI(), ini jaga-jaga kalau masih ke-klik.
        if (this.hasPendingToday) {
            toast.error('SPK hari ini masih menunggu approval Admin. Tombol aktif lagi setelah diputuskan.');
            return;
        }

        // Jangan izinkan input SPK selama user masih dalam rentang Izin/Cuti
        // yang sedang berjalan hari ini - sama jaga-jaga seperti Surat Tugas
        // (lihat suratTugas.openModal() di surat-tugas.js).
        if (window.absensi && absensi.currentState === 'excused') {
            toast.error('Tidak bisa input SPK selama masih Izin/Cuti. Coba lagi setelah rentang Izin/Cuti Anda selesai.');
            return;
        }

        // Reset form tiap dibuka
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const tglEl = document.getElementById('spk-tanggal');
        tglEl.value = todayStr;
        // Sesi dideteksi otomatis dari data absensi tanggal yang dipilih (sama seperti
        // "Sesi yang Bermasalah" di Sanggahan Absensi) - tanggal lampau tetap boleh dipilih.
        tglEl.onchange = () => this._loadSesiForDate(tglEl.value);
        this._loadSesiForDate(todayStr);
        document.getElementById('spk-keterangan').value = '';
        berkasUpload.mount('spk-berkas');

        document.getElementById('modal-spk').style.display = 'flex';
        this._resetSimpanButton();
    },

    _sesiLoading: false,
    _sesiReq: 0,   // penanda permintaan terakhir, supaya hasil tanggal lama tidak menimpa tanggal baru

    _renderSesi(list, sesi, catatan) {
        const note = catatan
            ? `<span style="font-size:0.78rem;color:var(--text-muted);">${catatan}</span>` : '';
        list.innerHTML = sesi.map(s => `
            <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
                <input type="checkbox" class="spk-sesi-checkbox" value="${s.field}"> ${s.label}
            </label>
        `).join('') + note;
    },

    async _loadSesiForDate(dateStr) {
        const list = document.getElementById('spk-sesi-list');
        if (!list) return;
        const reqId = ++this._sesiReq;
        const semua = Object.keys(this.SESI_LABELS).map(f => ({ field: f, label: this.SESI_LABELS[f] }));
        if (!dateStr) {
            list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">Pilih tanggal terlebih dahulu.</span>';
            return;
        }
        this._sesiLoading = true;
        list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Memuat sesi...</span>';

        const user = auth.getCurrentUser();
        const effectiveId = user?.employeeId || user?.id;
        try {
            const result = await api.getAttendanceSessionsForDate(effectiveId, dateStr);
            if (reqId !== this._sesiReq) return;
            const data = (result && result.success && result.data) || null;
            const sesi = (data && data.sessions) || [];
            if (!data || data.libur || !sesi.length) {
                // Hari libur / tanpa jadwal / gagal memuat: SPK tetap boleh diajukan (mis. perbaikan di
                // akhir pekan), jadi tampilkan 4 sesi standar untuk dipilih manual.
                this._renderSesi(list, semua, 'Tidak ada jadwal absen di tanggal ini - pilih sesi yang digantikan secara manual.');
                return;
            }
            const bisa = sesi.filter(s => s.disputable);
            if (!bisa.length) {
                list.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">Tidak ada sesi yang bisa digantikan SPK di tanggal ini - semua sesi sudah tercatat (absen normal, SPK, atau sedang menunggu approval).</span>';
                return;
            }
            this._renderSesi(list, bisa, bisa.length < sesi.length ? 'Sesi yang sudah tercatat tidak ditampilkan.' : '');
        } catch (e) {
            if (reqId !== this._sesiReq) return;
            console.error('Error memuat sesi SPK:', e);
            this._renderSesi(list, semua, 'Gagal mendeteksi sesi otomatis - pilih sesi secara manual.');
        } finally {
            if (reqId === this._sesiReq) this._sesiLoading = false;
        }
    },

    // Cegah submit dobel - pola sama persis seperti suratTugas di
    // surat-tugas.js.
    _isSubmitting: false,

    _setSimpanLoading(loading) {
        const btn = document.getElementById('spk-btn-simpan');
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
        if (this._isSubmitting) return;
        if (this._sesiLoading) { toast.error('Sesi masih dimuat, tunggu sebentar.'); return; }

        const tanggal = document.getElementById('spk-tanggal').value;
        const sesi = Array.from(document.querySelectorAll('#spk-sesi-list .spk-sesi-checkbox:checked')).map(cb => cb.value);
        const keterangan = document.getElementById('spk-keterangan').value.trim();

        if (!tanggal) { toast.error('Tanggal wajib diisi!'); return; }
        if (sesi.length === 0) { toast.error('Pilih minimal 1 sesi yang akan digantikan SPK!'); return; }
        if (!keterangan) { toast.error('Keterangan wajib diisi!'); return; }

        if (berkasUpload.isBusy('spk-berkas')) { toast.error('Berkas masih diproses, tunggu sebentar.'); return; }
        const berkas = berkasUpload.get('spk-berkas');

        const currentUser = auth.getCurrentUser();
        const data = {
            userId: currentUser?.employeeId || currentUser?.id,
            userName: currentUser?.name || '',
            tanggal,
            sesi,
            keterangan,
            berkasBase64: berkas ? berkas.base64 : '',
            berkasMime: berkas ? berkas.mime : '',
            berkasNama: berkas ? berkas.nama : ''
        };

        this._isSubmitting = true;
        this._setSimpanLoading(true);

        try {
            const result = await api.submitSpk(data);
            if (result.success) {
                toast.success('SPK berhasil diajukan! Menunggu persetujuan Admin sebelum sesi absensi terkait otomatis tercatat SPK.');
                document.getElementById('modal-spk').style.display = 'none';
                // SPK untuk HARI INI -> langsung nonaktifkan tombol (tanpa menunggu
                // data halaman dimuat ulang). SPK untuk tanggal lain tidak mengunci.
                if (tanggal === this._todayStr()) this.setPendingToday(true);
                if (window.absensi && typeof absensi.init === 'function') {
                    absensi.init();
                }
            } else {
                toast.error(result.error || 'Gagal menyimpan SPK');
            }
        } catch (e) {
            console.error('Error submit SPK:', e);
            toast.error('Terjadi kesalahan');
        } finally {
            this._resetSimpanButton();
        }
    }
};

window.spk = spk;
