/**
 * Portal Karyawan - Admin: Approval Surat Tugas (SPPD) & Sanggahan Absensi
 * PT. Tirta Agung Amuntai
 *
 * Halaman khusus Admin untuk meninjau DUA jenis pengajuan karyawan sekaligus
 * (dipilih lewat dropdown "Jenis Dokumen" di atas filter Status - lihat
 * index.html #st-doctype-filter), satu pintu approval untuk keduanya:
 *
 * 1) Surat Tugas (SPPD) - begitu di-approve, Attendance karyawan otomatis
 *    ditandai Dinas Luar untuk seluruh rentang tanggalnya (lihat
 *    approveSuratTugasData() di Surattugas.gs).
 * 2) Sanggahan Absensi - begitu di-approve, sesi absen yang disanggah
 *    (mis. Istirahat/Selesai Istirahat karena jaringan mati) otomatis
 *    ditandai "Hadir (Kendala Teknis)" di Attendance (lihat
 *    approveSanggahanAbsensi() di SanggahanAbsensi.gs).
 *
 * Kalau ditolak (jenis manapun), TIDAK ada efek apapun ke Attendance.
 *
 * rawData/renderSuratTugas* menangani SPPD (kode ASLI, tidak diubah logic-nya -
 * cuma dipisah biar bisa gantian tampil dengan Sanggahan lewat docType).
 * sanggahanRawData/renderSanggahan* adalah bagian BARU untuk Sanggahan Absensi.
 */
const adminSuratTugas = {
    docType: 'surat_tugas', // 'surat_tugas' | 'sanggahan_absensi'
    rawData: [],
    sanggahanRawData: [],
    filterStatus: '',

    async init() {
        this.filterStatus = '';
        this.docType = 'surat_tugas';

        const docTypeFilter = document.getElementById('st-doctype-filter');
        if (docTypeFilter) {
            docTypeFilter.value = 'surat_tugas';
            docTypeFilter.onchange = (e) => {
                this.docType = e.target.value;
                this.render();
            };
        }

        const statusFilter = document.getElementById('st-status-filter');
        if (statusFilter) {
            statusFilter.value = '';
            statusFilter.onchange = (e) => {
                this.filterStatus = e.target.value;
                this.render();
            };
        }

        await this.loadData();
        this.render();
    },

    async loadData() {
        try {
            const result = await api.getAllSuratTugas();
            this.rawData = result.success ? (result.data || []) : [];
        } catch (e) {
            console.error('Error loading Surat Tugas:', e);
            this.rawData = [];
        }
        this.rawData.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        try {
            const result = await api.getAllSanggahanAbsensi();
            this.sanggahanRawData = result.success ? (result.data || []) : [];
        } catch (e) {
            console.error('Error loading Sanggahan Absensi:', e);
            this.sanggahanRawData = [];
        }
        this.sanggahanRawData.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },

    getFiltered() {
        const source = this.docType === 'sanggahan_absensi' ? this.sanggahanRawData : this.rawData;
        if (!this.filterStatus) return source;
        return source.filter(row => (row.status || 'pending') === this.filterStatus);
    },

    _statusLabel(status) {
        const labels = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
        return labels[status || 'pending'] || status;
    },

    _formatTanggal(row) {
        if (row.tanggalMulai === row.tanggalSelesai) return row.tanggalMulai || '-';
        return `${row.tanggalMulai || '-'} s.d. ${row.tanggalSelesai || '-'}`;
    },

    _renderThead() {
        const thead = document.getElementById('surat-tugas-approval-thead');
        if (!thead) return;
        thead.innerHTML = this.docType === 'sanggahan_absensi'
            ? `<tr>
                   <th>Karyawan</th>
                   <th>Tanggal Absensi</th>
                   <th>Sesi Bermasalah</th>
                   <th>Keterangan</th>
                   <th>Status</th>
                   <th>Aksi</th>
               </tr>`
            : `<tr>
                   <th>Karyawan</th>
                   <th>No. Surat</th>
                   <th>Tujuan</th>
                   <th>Tanggal</th>
                   <th>Keterangan</th>
                   <th>Status</th>
                   <th>Aksi</th>
               </tr>`;
    },

    render() {
        this._renderThead();
        if (this.docType === 'sanggahan_absensi') {
            this.renderSanggahan();
        } else {
            this.renderSuratTugas();
        }
    },

    // ---- Surat Tugas (SPPD) - tampilan & logic ASLI, tidak diubah ----
    renderSuratTugas() {
        const tbody = document.getElementById('surat-tugas-approval-body');
        const cardsContainer = document.getElementById('surat-tugas-approval-mobile-cards');
        const data = this.getFiltered();

        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</td></tr>';
            if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</div>';
            return;
        }

        tbody.innerHTML = data.map(row => {
            const status = row.status || 'pending';
            const needsAction = status === 'pending';
            return `
            <tr>
                <td>${row.userName || '-'}</td>
                <td>${row.nomorSurat || '-'}</td>
                <td>${row.tujuan || '-'}</td>
                <td>${this._formatTanggal(row)}</td>
                <td>${row.keterangan || '-'}</td>
                <td><span class="status-badge ${status}">${this._statusLabel(status)}</span></td>
                <td style="white-space:nowrap;">
                    ${needsAction ? `
                        <button class="btn-action" style="background:rgba(16,185,129,0.1);color:var(--color-success);" title="Setujui" onclick="adminSuratTugas.approve('${row.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action" style="background:rgba(239,68,68,0.1);color:var(--color-danger);" title="Tolak" onclick="adminSuratTugas.reject('${row.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `<span class="status-badge ${status}">${this._statusLabel(status)}</span>`}
                    ${row.fileUrl ? `<button class="btn-action view" title="Lihat Dokumen" onclick="window.open('${row.fileUrl}', '_blank')"><i class="fas fa-file-lines"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');

        this.renderMobileCardsSuratTugas(data);
    },

    renderMobileCardsSuratTugas(data) {
        const container = document.getElementById('surat-tugas-approval-mobile-cards');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</div>';
            return;
        }

        container.innerHTML = data.map(row => {
            const status = row.status || 'pending';
            const needsAction = status === 'pending';
            return `
            <div class="mobile-card" style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;">${row.userName || '-'}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${row.nomorSurat || '-'}</div>
                    </div>
                    <span class="status-badge ${status}">${this._statusLabel(status)}</span>
                </div>
                <div style="font-size:0.85rem;margin-bottom:4px;"><strong>Tujuan:</strong> ${row.tujuan || '-'}</div>
                <div style="font-size:0.85rem;margin-bottom:4px;"><strong>Tanggal:</strong> ${this._formatTanggal(row)}</div>
                ${row.keterangan ? `<div style="font-size:0.85rem;margin-bottom:8px;"><strong>Keterangan:</strong> ${row.keterangan}</div>` : ''}
                <div style="display:flex;gap:8px;margin-top:8px;">
                    ${needsAction ? `
                        <button class="btn-action" style="flex:1;background:var(--color-success);color:#fff;" onclick="adminSuratTugas.approve('${row.id}')">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="btn-action" style="flex:1;background:var(--color-danger);color:#fff;" onclick="adminSuratTugas.reject('${row.id}')">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    ` : ''}
                    ${row.fileUrl ? `<button class="btn-action" style="flex:1;background:var(--bg-secondary);border:1px solid var(--border-color);" onclick="window.open('${row.fileUrl}', '_blank')"><i class="fas fa-file-lines"></i> Dokumen</button>` : ''}
                </div>
            </div>`;
        }).join('');
    },

    async approve(id) {
        if (!confirm('Setujui Surat Tugas ini? Absensi karyawan untuk rentang tanggal tsb akan otomatis tercatat Dinas Luar.')) return;

        const user = auth.getCurrentUser();
        const approver = { name: user?.name || '', nik: user?.nik || '' };

        try {
            const result = await api.approveSuratTugas(id, approver);
            if (result.success) {
                toast.success('Surat Tugas disetujui. Absensi karyawan otomatis tercatat Dinas Luar.');
                await this.loadData();
                this.render();
            } else {
                toast.error(result.error || 'Gagal menyetujui Surat Tugas');
            }
        } catch (e) {
            console.error('Error approve Surat Tugas:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    async reject(id) {
        const catatan = prompt('Catatan penolakan (opsional):') || '';
        if (!confirm('Tolak Surat Tugas ini?')) return;

        const user = auth.getCurrentUser();
        const approver = { name: user?.name || '', nik: user?.nik || '' };

        try {
            const result = await api.rejectSuratTugas(id, approver, catatan);
            if (result.success) {
                toast.success('Surat Tugas ditolak.');
                await this.loadData();
                this.render();
            } else {
                toast.error(result.error || 'Gagal menolak Surat Tugas');
            }
        } catch (e) {
            console.error('Error reject Surat Tugas:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    // ---- Sanggahan Absensi - BARU ----
    renderSanggahan() {
        const tbody = document.getElementById('surat-tugas-approval-body');
        const cardsContainer = document.getElementById('surat-tugas-approval-mobile-cards');
        const data = this.getFiltered();

        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</td></tr>';
            if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</div>';
            return;
        }

        tbody.innerHTML = data.map(row => {
            const status = row.status || 'pending';
            const needsAction = status === 'pending';
            return `
            <tr>
                <td>${row.userName || row.nama || '-'}</td>
                <td>${row.date || '-'}</td>
                <td>${row.sessionLabels || '-'}</td>
                <td>${row.keterangan || '-'}</td>
                <td><span class="status-badge ${status}">${this._statusLabel(status)}</span></td>
                <td style="white-space:nowrap;">
                    ${needsAction ? `
                        <button class="btn-action" style="background:rgba(16,185,129,0.1);color:var(--color-success);" title="Setujui" onclick="adminSuratTugas.approveSanggahan('${row.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action" style="background:rgba(239,68,68,0.1);color:var(--color-danger);" title="Tolak" onclick="adminSuratTugas.rejectSanggahan('${row.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `<span class="status-badge ${status}">${this._statusLabel(status)}</span>`}
                </td>
            </tr>`;
        }).join('');

        this.renderMobileCardsSanggahan(data);
    },

    renderMobileCardsSanggahan(data) {
        const container = document.getElementById('surat-tugas-approval-mobile-cards');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</div>';
            return;
        }

        container.innerHTML = data.map(row => {
            const status = row.status || 'pending';
            const needsAction = status === 'pending';
            return `
            <div class="mobile-card" style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;">${row.userName || row.nama || '-'}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${row.date || '-'}</div>
                    </div>
                    <span class="status-badge ${status}">${this._statusLabel(status)}</span>
                </div>
                <div style="font-size:0.85rem;margin-bottom:4px;"><strong>Sesi Bermasalah:</strong> ${row.sessionLabels || '-'}</div>
                ${row.keterangan ? `<div style="font-size:0.85rem;margin-bottom:8px;"><strong>Keterangan:</strong> ${row.keterangan}</div>` : ''}
                <div style="display:flex;gap:8px;margin-top:8px;">
                    ${needsAction ? `
                        <button class="btn-action" style="flex:1;background:var(--color-success);color:#fff;" onclick="adminSuratTugas.approveSanggahan('${row.id}')">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="btn-action" style="flex:1;background:var(--color-danger);color:#fff;" onclick="adminSuratTugas.rejectSanggahan('${row.id}')">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
    },

    async approveSanggahan(id) {
        if (!confirm('Setujui Sanggahan Absensi ini? Sesi yang disanggah akan otomatis tercatat "Hadir (Kendala Teknis)".')) return;

        const user = auth.getCurrentUser();
        const approver = { name: user?.name || '', nik: user?.nik || '' };

        try {
            const result = await api.approveSanggahanAbsensi(id, approver);
            if (result.success) {
                toast.success('Sanggahan Absensi disetujui. Sesi terkait otomatis tercatat Hadir.');
                await this.loadData();
                this.render();
            } else {
                toast.error(result.error || 'Gagal menyetujui Sanggahan Absensi');
            }
        } catch (e) {
            console.error('Error approve Sanggahan Absensi:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    async rejectSanggahan(id) {
        const catatan = prompt('Catatan penolakan (opsional):') || '';
        if (!confirm('Tolak Sanggahan Absensi ini?')) return;

        const user = auth.getCurrentUser();
        const approver = { name: user?.name || '', nik: user?.nik || '' };

        try {
            const result = await api.rejectSanggahanAbsensi(id, approver, catatan);
            if (result.success) {
                toast.success('Sanggahan Absensi ditolak.');
                await this.loadData();
                this.render();
            } else {
                toast.error(result.error || 'Gagal menolak Sanggahan Absensi');
            }
        } catch (e) {
            console.error('Error reject Sanggahan Absensi:', e);
            toast.error('Terjadi kesalahan');
        }
    }
};

window.initSuratTugasApproval = () => { adminSuratTugas.init(); };
window.adminSuratTugas = adminSuratTugas;
