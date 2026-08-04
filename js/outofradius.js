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

        if (filtered.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem 0;">Tidak ada laporan absen luar radius di bulan ini.</p>';
            return;
        }

        container.innerHTML = filtered.map(r => `
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:1rem;margin-bottom:0.75rem;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                            <span style="font-weight:600;">${this._esc(r.userName)}</span>
                            <span style="background:#FEF3C7;color:#D97706;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:20px;">${this._esc(r.typeLabel)}</span>
                            ${r.status === 'approved'
                                ? '<span style="background:rgba(16,185,129,0.12);color:#10B981;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:20px;"><i class="fas fa-check"></i> Sudah Ditinjau</span>'
                                : '<span style="background:rgba(217,119,6,0.12);color:#D97706;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:20px;">Menunggu Ditinjau</span>'}
                        </div>
                        <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">
                            ${this._esc(r.date)} - ${this._esc(r.time)} &middot; ${r.distance ? this._esc(String(r.distance)) + 'm dari ' : ''}${this._esc(r.nearestOffice || 'kantor')}
                        </div>
                        <div style="background:var(--color-gray-100);border-radius:8px;padding:8px 10px;font-size:0.85rem;">
                            <i class="fas fa-quote-left" style="color:var(--text-muted);font-size:0.7rem;"></i> ${this._esc(r.note)}
                        </div>
                        ${r.photo ? `<img src="${this._esc(r.photo)}" onclick="window.open(this.src,'_blank')" style="max-width:220px;max-height:140px;border-radius:8px;margin-top:8px;cursor:pointer;display:block;">` : ''}
                        ${r.status === 'approved' ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">Ditinjau oleh ${this._esc(r.approvedBy)}</div>` : ''}
                    </div>
                    ${r.status !== 'approved' ? `<button type="button" onclick="outOfRadius.approve('${r.id}')" style="background:var(--color-primary);color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;white-space:nowrap;"><i class="fas fa-check"></i> Approve</button>` : ''}
                </div>
            </div>
        `).join('');
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

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.outOfRadius = outOfRadius;
