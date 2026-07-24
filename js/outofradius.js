/**
 * Portal Karyawan - Laporan Absen Luar Radius
 * Approver (siapapun yang ditunjuk Admin di field "Approver Absen Luar
 * Radius" pada form Karyawan) meninjau & meng-approve laporan absen di
 * luar radius milik karyawan "Pekerja Lapangan" yang jadi tanggung
 * jawabnya. Approve di sini CUMA menandai "sudah ditinjau" - tidak
 * mengubah data absensi apapun, karena absennya sendiri sudah tersimpan
 * duluan (lihat face-recognition.js).
 */
const outOfRadius = {
    reports: [],

    /**
     * Dipanggil dari router.js bareng izin.initApprovalPage() &
     * cuti.initApprovalPage() - role di sini cuma dipakai untuk tahu id
     * container mana yang harus diisi, BUKAN untuk filter data (approver-nya
     * ditunjuk manual per-karyawan oleh Admin, bukan berdasarkan role).
     */
    async initApprovalPage(role) {
        const containerMap = {
            'asmen': 'out-of-radius-approval-list-asmen',
            'manajer': 'out-of-radius-approval-list-manajer',
            'direktur': 'out-of-radius-approval-list-direktur'
        };
        const containerId = containerMap[role];
        if (!containerId) return;

        const currentUser = auth.getCurrentUser();
        const myId = currentUser?.employeeId || currentUser?.id;

        try {
            const result = await api.getOutOfRadiusReportsForApprover(myId);
            this.reports = (result.success && result.data) ? result.data : [];
        } catch (e) {
            console.error('Gagal memuat laporan luar radius:', e);
            this.reports = [];
        }

        this._render(containerId);
    },

    _render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (this.reports.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem 0;">Tidak ada laporan absen luar radius.</p>';
            return;
        }

        container.innerHTML = this.reports.map(r => `
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
                ['out-of-radius-approval-list-asmen', 'out-of-radius-approval-list-manajer', 'out-of-radius-approval-list-direktur']
                    .forEach(cid => { if (document.getElementById(cid)) this._render(cid); });
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
