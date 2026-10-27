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
    MAX_HARI: 3,                  // batas pengajuan ke belakang (hari) - samakan dengan SANGGAHAN_MAX_HARI di server
    ALASAN: { jaringan: 'Tidak ada jaringan / sinyal', listrik: 'Listrik padam', server: 'Server / aplikasi error' },
    MAX_BUKTI_BYTES: 1024 * 1024, // batas ukuran bukti: 1 MB
    _bukti: null,                 // { nama, base64, mime, size, previewUrl } - bukti foto yang dipilih
    _sessionsForDate: [], // hasil terakhir dari getAttendanceSessionsForDate(), dipakai submit() buat tau label sesi yang dicentang

    openModal() {
        document.getElementById('sa-keterangan').value = '';
        this._bukti = null;
        this._paintBukti();

        const tanggalInput = document.getElementById('sa-tanggal');
        const todayStr = (typeof dateTime !== 'undefined' && dateTime.getLocalDate)
            ? dateTime.getLocalDate()
            : new Date().toISOString().split('T')[0];
        tanggalInput.value = todayStr;
        tanggalInput.max = todayStr; // tidak boleh pilih tanggal masa depan
        const minD = new Date(todayStr + 'T00:00:00');
        minD.setDate(minD.getDate() - this.MAX_HARI);
        tanggalInput.min = `${minD.getFullYear()}-${String(minD.getMonth() + 1).padStart(2, '0')}-${String(minD.getDate()).padStart(2, '0')}`;
        document.querySelectorAll('input[name="sa-alasan"]').forEach(r => { r.checked = false; });

        tanggalInput.onchange = () => this._loadSessionsForDate(tanggalInput.value);

        document.getElementById('modal-sanggahan-absensi').style.display = 'flex';
        this._resetSimpanButton();
        this._loadSessionsForDate(todayStr);
        this._renderHistory();
    },

    // ---------- Bukti foto (wajib) ----------
    _ukuran(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },

    _paintBukti() {
        const box = document.getElementById('sa-bukti-box');
        if (!box) return;
        const b = this._bukti;
        if (!b) {
            box.innerHTML = `
                <div style="display:flex;gap:8px;">
                    <button type="button" onclick="document.getElementById('sa-bukti-camera').click()" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:2px dashed var(--color-primary);border-radius:10px;background:none;color:var(--text-muted);cursor:pointer;font-family:inherit;">
                        <i class="fas fa-camera" style="font-size:1.3rem;color:var(--color-primary);"></i>
                        <span style="font-size:0.82rem;font-weight:600;color:var(--text-main,inherit);">Ambil Foto</span>
                        <span style="font-size:0.7rem;">Langsung dari kamera</span>
                    </button>
                    <button type="button" onclick="document.getElementById('sa-bukti-input').click()" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:2px dashed var(--border-color);border-radius:10px;background:none;color:var(--text-muted);cursor:pointer;font-family:inherit;">
                        <i class="fas fa-image" style="font-size:1.3rem;color:var(--text-muted);"></i>
                        <span style="font-size:0.82rem;font-weight:600;color:var(--text-main,inherit);">Dari Galeri</span>
                        <span style="font-size:0.7rem;">Foto / screenshot</span>
                    </button>
                </div>`;
            return;
        }
        if (b.loading) {
            box.innerHTML = '<div style="padding:14px;border:1px solid var(--border-color);border-radius:10px;font-size:0.82rem;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Memproses foto...</div>';
            return;
        }
        box.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border-color);border-radius:10px;">
                <img src="${b.previewUrl}" alt="Bukti" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;">
                <div style="min-width:0;flex:1;">
                    <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${String(b.nama).replace(/</g, '&lt;')}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);">${this._ukuran(b.size)} &middot; ${b.sumber === 'kamera' ? 'Kamera' : 'Galeri'}${b.diambil ? ' &middot; diambil ' + String(b.diambil).replace(/ \((EXIF|file)\)$/, '') : ''}</div>
                </div>
                <button type="button" onclick="document.getElementById('sa-bukti-' + (sanggahanAbsensi._bukti.sumber === 'kamera' ? 'camera' : 'input')).click()" title="Ganti foto" style="background:none;border:1px solid var(--border-color);border-radius:8px;padding:6px 9px;cursor:pointer;color:var(--text-muted);"><i class="fas fa-rotate"></i></button>
                <button type="button" onclick="sanggahanAbsensi.removeBukti()" title="Hapus" style="background:none;border:1px solid var(--border-color);border-radius:8px;padding:6px 9px;cursor:pointer;color:var(--color-danger);"><i class="fas fa-trash"></i></button>
            </div>`;
    },

    removeBukti() {
        if (this._bukti && this._bukti.previewUrl) { try { URL.revokeObjectURL(this._bukti.previewUrl); } catch (e) {} }
        this._bukti = null;
        this._paintBukti();
    },

    // Waktu foto diambil: dari EXIF (DateTimeOriginal) kalau ada, kalau tidak
    // dari waktu file terakhir diubah. Hasil: "YYYY-MM-DD HH:mm (EXIF)" / "(file)".
    async _waktuFoto(file) {
        const pad = n => String(n).padStart(2, '0');
        try {
            const buf = await file.slice(0, 131072).arrayBuffer();
            const v = new DataView(buf);
            if (v.getUint16(0) === 0xFFD8) {
                let off = 2;
                while (off + 4 < v.byteLength) {
                    const marker = v.getUint16(off); const len = v.getUint16(off + 2);
                    if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { // "Exif"
                        const t = off + 10; const le = v.getUint16(t) === 0x4949;
                        const g16 = o => v.getUint16(t + o, le), g32 = o => v.getUint32(t + o, le);
                        const readStr = (o, n) => { let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; };
                        const findTag = (ifd, tag) => {
                            const n = g16(ifd);
                            for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (g16(e) === tag) return e; }
                            return -1;
                        };
                        const ifd0 = g32(4);
                        const ep = findTag(ifd0, 0x8769);
                        let str = '';
                        if (ep > -1) {
                            const sub = g32(ep + 8);
                            const e = findTag(sub, 0x9003);
                            if (e > -1) str = readStr(g32(e + 8), g32(e + 4));
                        }
                        if (!str) { const e = findTag(ifd0, 0x0132); if (e > -1) str = readStr(g32(e + 8), g32(e + 4)); }
                        const m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
                        if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} (EXIF)`;
                        break;
                    }
                    if ((marker & 0xFF00) !== 0xFF00) break;
                    off += 2 + len;
                }
            }
        } catch (e) { /* lanjut ke waktu file */ }
        if (file.lastModified) {
            const d = new Date(file.lastModified);
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} (file)`;
        }
        return '';
    },

    // Sidik jari (SHA-256) file ASLI - dipakai server untuk mendeteksi foto yang sama dipakai ulang.
    async _hashFile(file) {
        try {
            if (!(window.crypto && crypto.subtle)) return '';
            const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { return ''; }
    },

    async pickBukti(input, sumber) {
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        if (!/^image\/(jpeg|png)$/i.test(f.type)) {
            toast.error('Bukti harus berupa foto JPG atau PNG.');
            return;
        }
        if (f.size > this.MAX_BUKTI_BYTES) {
            toast.info(`Foto ${this._ukuran(f.size)} (lebih dari 1 MB) - dikecilkan otomatis.`);
        }
        this._bukti = { loading: true, nama: f.name };
        this._paintBukti();
        try {
            const rd = await this._compress(f);
            const diambil = await this._waktuFoto(f);
            const hashAsli = await this._hashFile(f);
            this._bukti = {
                sumber: sumber === 'kamera' ? 'kamera' : 'galeri', diambil, hashAsli,
                nama: f.name, base64: rd.base64, mime: rd.mime,
                size: Math.round(rd.base64.length * 0.75),
                previewUrl: URL.createObjectURL(f)
            };
        } catch (e) {
            this._bukti = null;
            toast.error(e.message || 'Foto tidak bisa diproses, pilih foto lain.');
        }
        this._paintBukti();
    },

    // Kecilkan foto bertahap (dimensi & kualitas) sampai di bawah 1 MB.
    _compress(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let max = 1800, q = 0.82, out = '';
                for (let i = 0; i < 12; i++) {
                    const sc = Math.min(1, max / Math.max(img.width, img.height));
                    const cv = document.createElement('canvas');
                    cv.width = Math.max(1, Math.round(img.width * sc));
                    cv.height = Math.max(1, Math.round(img.height * sc));
                    const ctx = cv.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    out = cv.toDataURL('image/jpeg', q).split(',')[1];
                    if (out.length * 0.75 <= this.MAX_BUKTI_BYTES * 0.95) break;
                    if (q > 0.5) q -= 0.1; else max = Math.round(max * 0.8);
                }
                if (out.length * 0.75 > this.MAX_BUKTI_BYTES) { reject(new Error('Foto terlalu besar, gunakan foto yang lebih kecil.')); return; }
                resolve({ base64: out, mime: 'image/jpeg' });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak bisa dibaca.')); };
            img.src = url;
        });
    },

    // Link foto bukti (Google Drive) - thumbnail untuk tampilan, view untuk buka penuh.
    buktiThumbUrl(fileId) { return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`; },
    buktiViewUrl(fileId) { return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`; },

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
     *
     * [TAMBAHAN filter bulan] Data mentahnya disimpan di this._historyRows,
     * dropdown bulan diisi dari bulan-bulan yang BENAR-BENAR ada di data
     * (pola sama persis dengan _populateHistoryMonthFilter() di
     * absensi.js, "Riwayat Absensi") - bukan 12 bulan kalender statis.
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
            this._historyRows = result.success ? (result.data || []) : [];
            this._populateHistoryMonthFilter();
            this._renderHistoryList();
        } catch (e) {
            console.error('Gagal memuat riwayat Sanggahan Absensi:', e);
            list.innerHTML = '<span style="font-size:0.8rem;color:var(--color-danger);">Gagal memuat riwayat.</span>';
        }
    },

    /**
     * Isi dropdown filter bulan dari bulan-bulan yang ada di
     * this._historyRows saja (biar tidak ada pilihan bulan kosong) -
     * default ke bulan berjalan kalau ada datanya, kalau tidak ke bulan
     * paling baru yang ada. Persis pola _populateHistoryMonthFilter() di
     * absensi.js.
     */
    _populateHistoryMonthFilter() {
        const select = document.getElementById('sa-history-month');
        if (!select) return;

        const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const months = [...new Set((this._historyRows || []).map(r => (r.date || '').substring(0, 7)).filter(Boolean))];
        months.sort().reverse();

        const todayYM = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate().substring(0, 7) : '';

        const previouslySelected = select.value;
        const options = ['<option value="">Semua Bulan</option>'].concat(months.map(ym => {
            const [y, m] = ym.split('-');
            return `<option value="${ym}">${monthNames[parseInt(m) - 1]} ${y}</option>`;
        }));
        select.innerHTML = options.join('');

        // Pertahankan pilihan bulan yang sedang aktif (mis. setelah kirim
        // sanggahan baru & modal dibuka ulang) - kalau belum pernah pilih,
        // default ke bulan berjalan (kalau ada datanya di bulan itu).
        select.value = (previouslySelected && months.includes(previouslySelected))
            ? previouslySelected
            : (months.includes(todayYM) ? todayYM : '');

        if (!select._historyFilterBound) {
            select.addEventListener('change', () => this._renderHistoryList());
            select._historyFilterBound = true;
        }
    },

    _getHistoryForSelectedMonth() {
        const select = document.getElementById('sa-history-month');
        const selectedMonth = select ? select.value : '';
        if (!selectedMonth) return this._historyRows || [];
        return (this._historyRows || []).filter(r => (r.date || '').startsWith(selectedMonth));
    },

    _renderHistoryList() {
        const list = document.getElementById('sa-history-list');
        if (!list) return;

        const rows = this._getHistoryForSelectedMonth();
        if (!rows.length) {
            list.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${(this._historyRows || []).length ? 'Tidak ada sanggahan di bulan ini.' : 'Belum pernah mengajukan sanggahan absensi.'}</span>`;
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
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${r.sessionLabels || '-'}${r.alasanKendala && this.ALASAN[r.alasanKendala] ? ' &middot; ' + this.ALASAN[r.alasanKendala] : ''}</div>
                    ${r.buktiFileId ? `<a href="${this.buktiViewUrl(r.buktiFileId)}" target="_blank" rel="noopener" style="display:inline-block;font-size:0.78rem;margin-top:6px;color:var(--color-primary);"><i class="fas fa-image"></i> Lihat bukti</a>` : ''}
                    ${rejectedNoteHtml}
                </div>`;
        }).join('');
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
        const alasanEl = document.querySelector('input[name="sa-alasan"]:checked');
        if (!alasanEl) { toast.error('Pilih alasan kendala terlebih dahulu!'); return; }
        if (!keterangan) { toast.error('Keterangan wajib diisi!'); return; }
        if (this._bukti && this._bukti.loading) { toast.error('Foto bukti masih diproses, tunggu sebentar.'); return; }
        if (!this._bukti || !this._bukti.base64) { toast.error('Bukti foto wajib diunggah!'); return; }

        const currentUser = auth.getCurrentUser();
        const data = {
            userId: currentUser?.employeeId || currentUser?.id,
            userName: currentUser?.name || '',
            date: tanggal,
            sessionFields: sessionFields,
            keterangan: keterangan,
            alasanKendala: alasanEl.value,
            buktiSumber: this._bukti.sumber,
            buktiDiambil: this._bukti.diambil || '',
            buktiHashAsli: this._bukti.hashAsli || '',
            buktiBase64: this._bukti.base64,
            buktiMime: this._bukti.mime,
            buktiNamaAsli: this._bukti.nama
        };

        this._isSubmitting = true;
        this._setSimpanLoading(true);

        try {
            const result = await api.submitSanggahanAbsensi(data);
            if (result.success) {
                toast.success('Sanggahan Absensi berhasil dikirim - menunggu persetujuan Admin.');
                document.getElementById('modal-sanggahan-absensi').style.display = 'none';
                this.refreshBadge();
                // [TAMBAHAN] Muat ulang data halaman Absensi (kartu sesi,
                // timeline, Riwayat Absensi) begitu sanggahan terkirim,
                // supaya status "Menunggu Approval" langsung tampil tanpa
                // perlu refresh browser. init() aman dipanggil ulang - sama
                // seperti saat halaman Absensi dibuka lagi lewat menu.
                if (window.absensi && typeof absensi.init === 'function') absensi.init();
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
