/**
 * Portal Karyawan - Izin/Sakit
 * Leave permission functionality with face recognition
 */

const izin = {
    izinData: [],
    currentFile: null,
    verifiedData: null,
    filterStatus: '',

    async init() {
        await this.loadIzinData();
        this.initForm();
        this.initFilters();
        this.renderIzinList();
        this.updateStats();

        // Set default date to today
        const dateInput = document.getElementById('izin-date');
        if (dateInput) {
            dateInput.valueAsDate = new Date();
        }
    },

    async loadIzinData() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const result = auth.isApprover() ? await api.getAllIzin() : await api.getIzin(userId);
            this.izinData = result.data || [];
        } catch (error) {
            console.error('Error loading izin:', error);
            this.izinData = storage.get('izin', []);
        }
    },

    initForm() {
        // Guard: cegah listener dobel kalau initForm() terpanggil ulang
        // (terjadi setiap kali router membuka halaman Izin lagi)
        if (this._formBound) return;
        this._formBound = true;

        const form = document.getElementById('izin-form');
        const verifyBtn = document.getElementById('btn-verify-izin');
        const fileInput = document.getElementById('izin-document');
        const fileUpload = document.getElementById('file-upload');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitIzinForm();
            });
        }

        const typeSelect = document.getElementById('izin-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => this.toggleKeluarKantorFields(e.target.value));
        }

        if (verifyBtn) {
            verifyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.submitIzinForm();
            });
        }

        // File upload handling
        if (fileUpload && fileInput) {
            fileUpload.addEventListener('click', () => fileInput.click());

            fileUpload.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUpload.classList.add('dragover');
            });

            fileUpload.addEventListener('dragleave', () => {
                fileUpload.classList.remove('dragover');
            });

            fileUpload.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUpload.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    this.handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFile(e.target.files[0]);
                }
            });
        }

        // Remove file button
        const removeBtn = document.querySelector('.btn-remove-file');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile();
            });
        }

        this.initFilters();
    },

    toggleKeluarKantorFields(type) {
        const jamRow = document.getElementById('izin-jam-row');
        const durationGroup = document.getElementById('izin-duration-group');
        const durationInput = document.getElementById('izin-duration');
        const jamKeluar = document.getElementById('izin-jam-keluar');
        const jamMasuk = document.getElementById('izin-jam-masuk');
        const isKeluarKantor = type === 'keluar_kantor';
    
        if (jamRow) jamRow.style.display = isKeluarKantor ? 'flex' : 'none';
        if (durationGroup) durationGroup.style.display = isKeluarKantor ? 'none' : 'block';
    
        if (durationInput) durationInput.required = !isKeluarKantor;
        if (jamKeluar) jamKeluar.required = isKeluarKantor;
        if (jamMasuk) jamMasuk.required = isKeluarKantor;
    },
    
    initFilters() {
        // Status filter for izin history
        const statusFilter = document.querySelector('.izin-history-card .select-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderIzinList();
            });
        }
    },

    handleFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            toast.error('File terlalu besar. Maksimum 5MB');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            toast.error('Format file tidak didukung. Gunakan PDF, JPG, atau PNG');
            return;
        }

        this.currentFile = file;

        // Update UI
        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const filename = filePreview?.querySelector('.filename');

        if (uploadArea) uploadArea.style.display = 'none';
        if (filePreview) filePreview.style.display = 'flex';
        if (filename) filename.textContent = file.name;
    },

    removeFile() {
        this.currentFile = null;

        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const fileInput = document.getElementById('izin-document');

        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
        if (fileInput) fileInput.value = '';
    },

    async submitIzinForm() {
    // Guard: cegah submit dobel (klik cepat 2x, atau listener yang sempat terpasang ulang)
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    try {
        // Validate form first
        const type = document.getElementById('izin-type')?.value;
        const date = document.getElementById('izin-date')?.value;
        const duration = document.getElementById('izin-duration')?.value;
        const reason = document.getElementById('izin-reason')?.value;
        const isKeluarKantor = type === 'keluar_kantor';
        const jamKeluar = document.getElementById('izin-jam-keluar')?.value;
        const jamMasuk = document.getElementById('izin-jam-masuk')?.value;

        if (!type || !date || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }
        if (isKeluarKantor && (!jamKeluar || !jamMasuk)) {
            toast.error('Harap isi Jam Keluar dan Jam Masuk!');
            return;
        }
        if (!isKeluarKantor && !duration) {
            toast.error('Harap isi Durasi!');
            return;
        }

        const typeLabels = {
            'sick': 'Sakit',
            'permission': 'Izin Penting',
            'emergency': 'Keadaan Darurat',
            'keluar_kantor': 'Keluar Kantor'
        };

        const currentUser = auth.getCurrentUser();

        const izinEntry = {
            userId: currentUser?.id || 'demo-user',
            type: type,
            typeLabel: typeLabels[type] || type,
            date: date,
            duration: isKeluarKantor ? 0 : parseInt(duration),
            reason: reason,
            jamKeluar: isKeluarKantor ? jamKeluar : '',
            jamMasuk: isKeluarKantor ? jamMasuk : '',
            hasAttachment: !!this.currentFile
        };

        try {
            const result = await api.submitIzin(izinEntry);
            if (result.success) {
                this.izinData.unshift(result.data);
                if (this.currentFile) {
                    await this.uploadLampiranIzin(result.data.id, this.currentFile);
                }
            }
        } catch (error) {
            console.error('Error submitting izin:', error);
            toast.error('Gagal mengirim pengajuan izin.');
            return;
        }

        this.currentFile = null;
        toast.success('Pengajuan izin berhasil dikirim!');

        // Reset form
        const form = document.getElementById('izin-form');
        if (form) form.reset();
        this.toggleKeluarKantorFields('');
        this.removeFile();

        this.renderIzinList();
        this.updateStats();
    } finally {
        this.isSubmitting = false;
    }
},

    async uploadLampiranIzin(id, file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                try {
                    await api.uploadFileIzin(id, base64, mimeType, file.name);
                } catch (err) {
                    console.error('Upload lampiran izin gagal:', err);
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },

    updateStats() {
        const pending = this.izinData.filter(i => i.status === 'pending').length;
        const approved = this.izinData.filter(i => i.status === 'approved').length;
        const rejected = this.izinData.filter(i => i.status === 'rejected').length;

        const pendingEl = document.getElementById('izin-pending-count');
        const approvedEl = document.getElementById('izin-approved-count');
        const rejectedEl = document.getElementById('izin-rejected-count');

        if (pendingEl) pendingEl.textContent = pending;
        if (approvedEl) approvedEl.textContent = approved;
        if (rejectedEl) rejectedEl.textContent = rejected;
    },

    renderIzinList() {
        const list = document.getElementById('izin-list');
        if (!list) return;

        // Filter izin data
        let filteredData = this.izinData.filter(i => {
            if (!this.filterStatus) return true;
            if (this.filterStatus === 'menunggu') return i.status === 'pending';
            if (this.filterStatus === 'disetujui') return i.status === 'approved';
            if (this.filterStatus === 'ditolak') return i.status === 'rejected';
            return true;
        });

        if (filteredData.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan izin'}</p>
                </div>
            `;
            return;
        }

        // Sort by date descending
        const sortedData = filteredData.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedData.map(izin => {
            const date = new Date(izin.date);
            const dateFormatted = dateTime.formatDate(date, 'short');

            
            const icons = {
                'sick': 'fa-heartbeat',
                'permission': 'fa-hand-paper',
                'emergency': 'fa-exclamation-triangle',
                'keluar_kantor': 'fa-door-open'
            };
            const typeLabelFallback = {
                'sick': 'Sakit',
                'permission': 'Izin Penting',
                'emergency': 'Keadaan Darurat',
                'keluar_kantor': 'Izin Keluar Kantor'
            };
            const typeLabel = izin.typeLabel || typeLabelFallback[izin.type] || 'Izin';

            return `
                <div class="izin-item">
                    <div class="izin-icon ${izin.type}">
                        <i class="fas ${icons[izin.type] || 'fa-file'}"></i>
                    </div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${typeLabel}</h4>
                            <span class="izin-status ${izin.status}">${this.getStatusLabel(izin.status)}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date">
                                <i class="fas fa-calendar"></i>
                                ${dateFormatted} (${izin.duration} hari)
                            </span>
                        </div>
                        <p class="izin-reason">${izin.reason}</p>
                        ${izin.hasAttachment ? `
                            <span class="izin-attachment">
                                <i class="fas fa-paperclip"></i>
                                Lampiran tersedia
                            </span>
                        ` : ''}
                        ${izin.status === 'approved' && izin.type === 'keluar_kantor' ? `
                            <div style="margin-top:8px;display:flex;gap:6px;">
                                <button class="btn-small btn-outline" onclick="printLetters.openIzinKeluarKantor(${izin.id})">
                                    <i class="fas fa-print"></i> Cetak Surat Izin Keluar Kantor
                                </button>
                            </div>
                        ` : ''}
                        ${izin.status === 'approved' && izin.type !== 'keluar_kantor' ? `
                            <div style="margin-top:8px;display:flex;gap:6px;">
                                <button class="btn-small btn-outline" onclick="printLetters.openIzinPermohonan(${izin.id})">
                                    <i class="fas fa-print"></i> Surat Permohonan Izin
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            'pending': 'Menunggu',
            'manager_approved': 'Disetujui Manager',
            'approved': 'Disetujui',
            'rejected': 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.approveIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'approved'; }
            this.renderIzinList();
            this.updateStats();
            toast.success('Pengajuan izin disetujui');
        } catch (error) {
            console.error('Error approving izin:', error);
        }
    },

    async rejectIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.rejectIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'rejected'; }
            this.renderIzinList();
            this.updateStats();
            toast.info('Pengajuan izin ditolak');
        } catch (error) {
            console.error('Error rejecting izin:', error);
        }
    }
};

// Global init function
window.initIzin = () => {
    izin.init();
};

// Expose
window.izin = izin;
