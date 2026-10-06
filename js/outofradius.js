/**
 * Portal Karyawan - Laporan Absen Luar Radius
 * Approver (siapapun yang ditunjuk Admin di field "Approver Absen Luar
 * Radius" pada form Karyawan) meninjau & meng-approve laporan absen di
 * luar radius milik karyawan yang jadi tanggung jawabnya. Approve di sini
 * CUMA menandai "sudah ditinjau" - tidak mengubah data absensi apapun,
 * karena absennya sendiri sudah tersimpan duluan (lihat face-recognition.js).
 *
 * Laporan yang sudah "Sudah Ditinjau" TETAP ditampilkan (tidak hilang dari
 * daftar) - beda dari Izin/Cuti yang riwayatnya baru ditambahkan terpisah,
 * di sini daftarnya sendiri sudah berfungsi sebagai riwayat. Filter bulan
 * ditambahkan supaya daftar tidak makin panjang seiring waktu.
 */
const outOfRadius = {
    reports: [],

    _containerMap: {
        'asmen': 'out-of-radius-approval-list-asmen',
        'manajer': 'out-of-radius-approval-list-manajer',
        'direktur': 'out-of-radius-approval-list-direktur'
    },

    /**
     * Dipanggil dari router.js bareng izin.initApprovalPage() &
     * cuti.initApprovalPage() - role di sini cuma dipakai untuk tahu id
     * container mana yang harus diisi, BUKAN untuk filter data (approver-nya
     * ditunjuk manual per-karyawan oleh Admin, bukan berdasarkan role).
     */
    async initApprovalPage(role) {
        if (!this._containerMap[role]) return;

        const currentUser = auth.getCurrentUser();
        const myId = currentUser?.employeeId || currentUser?.id;

        try {
            const result = await api.getOutOfRadiusReportsForApprover(myId);
            this.reports = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Gagal memuat laporan luar radius:', e);
            this.reports = [];
        }

        this._populateMonthFilter(role);
        this._render(role);
    },

    /**
     * Isi dropdown filter bulan dari bulan-bulan yang BENAR-BENAR ada di
     * laporan absen luar radius approver ini - sama pola/perilakunya
     * seperti izin.js: _populateApprovalHistoryMonthFilter.
     */
    _populateMonthFilter(role) {
        const select = document.getElementById(`out-of-radius-history-month-${role}`);
        if (!select) return;

        const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const months = [...new Set(this.reports.map(r => (r.date || '').substring(0, 7)).filter(Boolean))];
        months.sort().reverse();

        const todayYM = (typeof dateTime !== 'undefined' && dateTime.getLocalDate) ? dateTime.getLocalDate().substring(0, 7) : '';
        if (todayYM && !months.includes(todayYM)) months.unshift(todayYM);

        const previouslySelected = select.value;
        select.innerHTML = months.map(ym => {
            const [y, m] = ym.split('-');
            return `<option value="${ym}">${monthNames[parseInt(m) - 1]} ${y}</option>`;
        }).join('');
        select.value = months.includes(previouslySelected) ? previouslySelected : (todayYM || months[0] || '');

        if (!select._monthFilterBound) {
            select.addEventListener('change', () => this._render(role));
            select._monthFilterBound = true;
        }
    },

    _render(role) {
        const containerId = this._containerMap[role];
        const container = document.getElementById(containerId);
        if (!container) return;

        const select = document.getElementById(`out-of-radius-history-month-${role}`);
        const selectedMonth = select ? select.value : '';
        let filtered = this.reports;
        if (selectedMonth) filtered = filtered.filter(r => (r.date || '').startsWith(selectedMonth));
        filtered = filtered.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        container.classList.add('ap-list');

        // [TAMBAHAN 2026-10-06] Jumlah laporan yang belum ditinjau (semua
        // bulan) -> badge di tab "Absen Luar Radius" (lihat approvalUI di izin.js).
        if (window.approvalUI) {
            approvalUI.setCount(role, 'oor', this.reports.filter(r => r.status !== 'approved' && r.status !== 'rejected').length);
        }

        if (filtered.length === 0) {
            container.innerHTML = approvalUI.empty('fa-location-dot', 'Tidak ada laporan absen luar radius di bulan ini');
            return;
        }

        const ui = approvalUI;
        const rows = filtered.map(r => {
            const isDone = r.status === 'approved';
            const isRejected = r.status === 'rejected';
            const accent = isDone ? '#10B981' : (isRejected ? '#EF4444' : '#F59E0B');

            let stateHtml;
            if (isDone) {
                stateHtml = `<span class="ap-state ap-tone-ok"><i class="fas fa-check-circle"></i> Sudah Ditinjau</span>
                    <div class="ap-note-extra">Oleh ${ui.esc(r.approvedBy)}</div>`;
            } else if (isRejected) {
                stateHtml = `<span class="ap-state ap-tone-bad"><i class="fas fa-times-circle"></i> Ditolak</span>
                    <div class="ap-note-extra" title="${ui.esc((r.rejectedBy || '') + (r.rejectedNote ? ' - ' + r.rejectedNote : ''))}">Oleh ${ui.esc(r.rejectedBy)}${r.rejectedNote ? ' - ' + ui.esc(r.rejectedNote) : ''}. Absen dikosongkan, karyawan diminta absen ulang.</div>`;
            } else {
                stateHtml = `<span class="ap-state ap-tone-wait"><i class="fas fa-hourglass-half"></i> Menunggu Ditinjau</span>`;
            }

            const actionHtml = (!isDone && !isRejected)
                ? `<button type="button" class="ap-btn ap-btn-danger" onclick="outOfRadius.openRejectModal('${r.id}')"><i class="fas fa-times"></i> Tolak</button>
                   <button type="button" class="ap-btn ap-btn-success" onclick="outOfRadius.approve('${r.id}')"><i class="fas fa-check"></i> Approve</button>`
                : '<span class="ap-muted">-</span>';

            const locHtml = `<div class="ap-date-main">${ui.esc(r.date)} &middot; ${ui.esc(r.time)}</div>
                <div class="ap-date-sub"><span>${r.distance ? ui.esc(String(r.distance)) + 'm dari ' : ''}${ui.esc(r.nearestOffice || 'kantor')}</span></div>`;

            const noteHtml = `<div class="ap-note" title="${ui.esc(r.note || '')}">${r.note ? ui.esc(r.note) : '<span class="ap-muted">-</span>'}</div>
                ${r.photo ? `<img class="ap-photo" src="${ui.esc(r.photo)}" alt="Foto laporan" onclick="window.open(this.src,'_blank')">` : ''}`;

            return ui.row(accent, [
                { cls: 'ap-c-who', html: ui.who(r.userName || 'Tidak diketahui', []) },
                { label: 'Jenis Absen', html: ui.chip(r.typeLabel || 'Absen', 'fa-location-dot') },
                { label: 'Waktu & Lokasi', html: locHtml },
                { cls: 'ap-c-note', label: 'Alasan', html: noteHtml },
                { cls: 'ap-c-prog', label: 'Status', html: stateHtml },
                { cls: 'ap-c-act', html: actionHtml }
            ]);
        }).join('');

        container.innerHTML = ui.board(
            ['Pemohon', 'Jenis Absen', 'Waktu & Lokasi', 'Alasan', 'Status', 'Aksi'],
            rows,
            'ap-oor'
        );
    },

    async approve(id) {
        const currentUser = auth.getCurrentUser();
        try {
            const result = await api.approveOutOfRadiusReport(id, {
                name: currentUser?.name || '',
                role: currentUser?.role || ''
            });
            if (result.success) {
                toast.success('Laporan ditandai sudah ditinjau');
                const report = this.reports.find(r => String(r.id) === String(id));
                if (report) {
                    report.status = 'approved';
                    report.approvedBy = currentUser?.name || '';
                }
                Object.keys(this._containerMap).forEach(role => {
                    if (document.getElementById(this._containerMap[role])) this._render(role);
                });
            } else {
                toast.error(result.error || 'Gagal menandai laporan');
            }
        } catch (e) {
            console.error('Error approve laporan luar radius:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    // [TAMBAHAN] Tolak laporan: absen sesi itu dikosongkan & karyawan diminta
    // absen ulang. Modal konfirmasi (dengan catatan opsional) dibuat lewat
    // JS supaya tidak perlu mengubah index.html.
    openRejectModal(id) {
        const report = this.reports.find(r => String(r.id) === String(id));
        if (!report) return;

        const old = document.getElementById('oor-reject-modal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'oor-reject-modal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
                <h3 style="margin:0 0 8px;font-size:1.05rem;">Tolak Absen Luar Radius?</h3>
                <p style="margin:0 0 12px;font-size:0.85rem;color:var(--text-muted);">
                    Absen <b>${this._esc(report.typeLabel)}</b> milik <b>${this._esc(report.userName)}</b> (${this._esc(report.date)} ${this._esc(report.time)})
                    akan <b>dikosongkan</b> dan karyawan diminta absen kembali.
                </p>
                <textarea id="oor-reject-note" rows="3" placeholder="Alasan penolakan (opsional)" style="width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:8px;padding:8px 10px;font-size:0.85rem;resize:vertical;"></textarea>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
                    <button type="button" id="oor-reject-cancel" style="background:#fff;border:1px solid var(--border-color);padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;">Batal</button>
                    <button type="button" id="oor-reject-confirm" style="background:#DC2626;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Tolak</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('oor-reject-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.getElementById('oor-reject-confirm').onclick = async () => {
            const btn = document.getElementById('oor-reject-confirm');
            const note = document.getElementById('oor-reject-note').value.trim();
            btn.disabled = true;
            btn.textContent = 'Memproses...';
            const ok = await this.reject(id, note);
            if (ok) close(); else { btn.disabled = false; btn.textContent = 'Tolak'; }
        };
    },

    async reject(id, catatan) {
        const currentUser = auth.getCurrentUser();
        try {
            const result = await api.rejectOutOfRadiusReport(id, {
                name: currentUser?.name || '',
                role: currentUser?.role || ''
            }, catatan);
            if (result.success) {
                toast.success('Laporan ditolak, absen dikosongkan. Karyawan diminta absen ulang.');
                const report = this.reports.find(r => String(r.id) === String(id));
                if (report) {
                    report.status = 'rejected';
                    report.rejectedBy = currentUser?.name || '';
                    report.rejectedNote = catatan || '';
                }
                Object.keys(this._containerMap).forEach(role => {
                    if (document.getElementById(this._containerMap[role])) this._render(role);
                });
                return true;
            }
            toast.error(result.error || 'Gagal menolak laporan');
        } catch (e) {
            console.error('Error menolak laporan luar radius:', e);
            toast.error('Terjadi kesalahan');
        }
        return false;
    },

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.outOfRadius = outOfRadius;
