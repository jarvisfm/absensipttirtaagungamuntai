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

        // Dropdown "Pilih Asmen" hanya untuk role staff (lihat submitIzinData
        // di backend - staff wajib pilih Asmen penyetuju sesuai bagiannya)
        this._setupAsmenDropdown();
    },

    // Tampilkan & isi dropdown "Pilih Asmen" kalau user yang login role-nya staff.
    async _setupAsmenDropdown() {
        const user = auth.getCurrentUser();
        const group = document.getElementById('izin-asmen-group');
        const select = document.getElementById('izin-asmen');
        if (!group || !select) return;

        if (!user || user.role !== 'staff') {
            group.style.display = 'none';
            select.required = false;
            return;
        }

        group.style.display = 'block';
        select.required = true;

        try {
            const result = await api.getAsmenByBagian(user.bagian);
            const list = result.data || [];
            select.innerHTML = list.length
                ? '<option value="">Pilih Asmen...</option>' +
                  list.map(a => `<option value="${a.id}">${a.nama}</option>`).join('')
                : '<option value="">Tidak ada Asmen untuk bagian ini</option>';
        } catch (error) {
            console.error('Gagal memuat daftar Asmen:', error);
            select.innerHTML = '<option value="">Gagal memuat daftar Asmen</option>';
        }
    },

    async loadIzinData() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            // PENTING: ini riwayat MILIK SENDIRI di halaman "Izin/Sakit", jadi selalu
            // getIzin(userId) - jangan pakai isApprover() di sini. Kalau Asmen/Manajer/
            // Direktur login, mereka tetap hanya boleh lihat izin MEREKA SENDIRI di sini.
            // Data untuk approval (izin milik orang lain) dimuat terpisah lewat
            // loadAllIzinData(), dipakai khusus oleh halaman approval.
            const result = await api.getIzin(userId);
            this.izinData = result.data || [];
        } catch (error) {
            console.error('Error loading izin:', error);
            this.izinData = storage.get('izin', []);
        }
    },

    // Dipakai KHUSUS oleh halaman Approval Asmen/Manajer/Direktur - berisi izin
    // SEMUA karyawan, disimpan terpisah dari this.izinData (riwayat pribadi)
    // supaya tidak ketuker/tercampur.
    async loadAllIzinData() {
        try {
            const result = await api.getAllIzin();
            this.allIzinData = result.data || [];
        } catch (error) {
            console.error('Error loading all izin:', error);
            this.allIzinData = [];
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
        const jamRow        = document.getElementById('izin-jam-row');
        const durationGroup = document.getElementById('izin-duration-group');
        const singleRow     = document.getElementById('izin-date-single-row');
        const rangeRow      = document.getElementById('izin-date-range-row');
        const durationInput = document.getElementById('izin-duration');
        const jamKeluar     = document.getElementById('izin-jam-keluar');
        const jamMasuk      = document.getElementById('izin-jam-masuk');
        const dateStart     = document.getElementById('izin-date-start');
        const dateEnd       = document.getElementById('izin-date-end');
        const dateInput     = document.getElementById('izin-date');

        const isKeluarKantor = type === 'keluar_kantor';
        const isIzinHarian   = type === 'izin_harian';

        // Jam keluar/masuk — hanya untuk keluar_kantor
        if (jamRow) jamRow.style.display = isKeluarKantor ? 'flex' : 'none';
        if (jamKeluar) jamKeluar.required = isKeluarKantor;
        if (jamMasuk)  jamMasuk.required  = isKeluarKantor;

        // Tanggal range — hanya untuk izin_harian
        if (rangeRow)   rangeRow.style.display   = isIzinHarian ? 'flex' : 'none';
        if (singleRow)  singleRow.style.display  = isIzinHarian ? 'none' : 'flex';
        if (dateStart)  dateStart.required = isIzinHarian;
        if (dateEnd)    dateEnd.required   = isIzinHarian;
        if (dateInput)  dateInput.required = !isIzinHarian;

        // Durasi — sembunyikan untuk keluar_kantor dan izin_harian
        if (durationGroup) durationGroup.style.display = (isKeluarKantor || isIzinHarian) ? 'none' : 'block';
        if (durationInput) durationInput.required      = (!isKeluarKantor && !isIzinHarian);
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
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    try {
        const type           = document.getElementById('izin-type')?.value;
        const date           = document.getElementById('izin-date')?.value;
        const duration       = document.getElementById('izin-duration')?.value;
        const reason         = document.getElementById('izin-reason')?.value;
        const isKeluarKantor = type === 'keluar_kantor';
        const isIzinHarian   = type === 'izin_harian';
        const jamKeluar      = document.getElementById('izin-jam-keluar')?.value;
        const jamMasuk       = document.getElementById('izin-jam-masuk')?.value;
        const dateStart      = document.getElementById('izin-date-start')?.value;
        const dateEnd        = document.getElementById('izin-date-end')?.value;

        if (!type || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }
        if (isKeluarKantor && (!jamKeluar || !jamMasuk)) {
            toast.error('Harap isi Jam Keluar dan Jam Masuk!');
            return;
        }
        if (isIzinHarian && (!dateStart || !dateEnd)) {
            toast.error('Harap isi Tanggal Mulai dan Tanggal Selesai!');
            return;
        }
        if (!isKeluarKantor && !isIzinHarian && !date) {
            toast.error('Harap isi Tanggal!');
            return;
        }
        if (!isKeluarKantor && !isIzinHarian && !duration) {
            toast.error('Harap isi Durasi!');
            return;
        }

        const currentUser = auth.getCurrentUser();
        const asmenSelect = document.getElementById('izin-asmen');
        const asmenId = asmenSelect ? asmenSelect.value : '';

        if (currentUser?.role === 'staff' && !asmenId) {
            toast.error('Silakan pilih Asmen penyetuju!');
            return;
        }

        const typeLabels = {
            'sick':         'Sakit',
            'izin_harian':  'Permohonan Izin Harian',
            'keluar_kantor':'Keluar Kantor'
        };

        let computedDuration = isKeluarKantor ? 0 : parseInt(duration);
        if (isIzinHarian && dateStart && dateEnd) {
            const diff = (new Date(dateEnd) - new Date(dateStart)) / (1000 * 60 * 60 * 24);
            computedDuration = Math.max(1, Math.round(diff) + 1);
        }

        const izinEntry = {
            userId:        currentUser?.id || 'demo-user',
            type:          type,
            typeLabel:     typeLabels[type] || type,
            date:          isIzinHarian ? dateStart : date,
            dateEnd:       isIzinHarian ? dateEnd   : '',
            duration:      computedDuration,
            reason:        reason,
            jamKeluar:     isKeluarKantor ? jamKeluar : '',
            jamMasuk:      isKeluarKantor ? jamMasuk  : '',
            hasAttachment: !!this.currentFile,
            asmenId:       asmenId || ''
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
                'izin_harian': 'fa-file-alt',
                'keluar_kantor': 'fa-door-open'
            };
            const typeLabelFallback = {
                'sick': 'Sakit',
                'permission': 'Izin Penting',
                'emergency': 'Keadaan Darurat',
                'izin_harian': 'Permohonan Izin Harian',
                'keluar_kantor': 'Izin Keluar Kantor'
            };
            const typeLabel = izin.typeLabel || typeLabelFallback[izin.type] || 'Izin';

            const durationText = izin.type === 'keluar_kantor'
                ? this._hitungDurasiJam(izin.jamKeluar, izin.jamMasuk)
                : `${izin.duration} hari`;

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
                                ${dateFormatted} (${durationText})
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
                        ${izin.status === 'approved' && izin.type === 'izin_harian' ? `
                            <div style="margin-top:8px;display:flex;gap:6px;">
                                <button class="btn-small btn-outline" onclick="printLetters.openIzinPermohonan(${izin.id})">
                                    <i class="fas fa-print"></i> Cetak Surat Permohonan Izin
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
            'asmen_approved': 'Disetujui Asmen',
            'manajer_approved': 'Disetujui Manajer',
            'manager_approved': 'Disetujui Manager',
            'approved': 'Disetujui',
            'rejected': 'Ditolak'
        };
        return labels[status] || status;
    },

    // =========================================================
    // APPROVAL BERTINGKAT: Asmen -> Manajer -> Direktur
    // Dipanggil dari router saat halaman approval-asmen/manajer/direktur dibuka.
    // =========================================================
    async initApprovalPage(role) {
        // Approver butuh data SEMUA izin (bukan cuma miliknya sendiri) supaya bisa
        // melihat pengajuan staff lain - pakai allIzinData, TERPISAH dari izinData
        // (riwayat pribadi approver itu sendiri di halaman Izin/Sakit).
        await this.loadAllIzinData();
        await this._ensureEmployeesLoaded();
        this.renderApprovalList(role);
    },

    // Cache daftar karyawan (untuk resolve nama/jabatan pemohon by userId),
    // karena tabel Izin sendiri cuma menyimpan userId, bukan snapshot nama.
    async _ensureEmployeesLoaded() {
        if (this._employees) return;
        try {
            const result = await api.getKaryawanList();
            this._employees = result.data || [];
        } catch (error) {
            console.error('Gagal memuat data karyawan:', error);
            this._employees = [];
        }
    },

    _findEmployee(userId) {
        return (this._employees || []).find(e => String(e.id) === String(userId)) || {};
    },

    renderApprovalList(role) {
        const list = document.getElementById(`approval-${role}-list`);
        if (!list) return;

        const user = auth.getCurrentUser();
        // Untuk akun Admin yang juga terhubung ke data karyawan (mode "Switch ke
        // Karyawan"), id Employees-nya ada di employeeId, bukan id (id di sana
        // adalah id akun Users). Untuk karyawan biasa, employeeId kosong -> pakai id.
        const myEmployeeId = user?.employeeId || user?.id;
        const myBagian = String(user?.bagian || '').toUpperCase().trim();
        const isHrManajer = myBagian === 'UMUM DAN KEPEGAWAIAN';
        const data = this.allIzinData || [];
        let filtered = [];

        if (role === 'asmen') {
            // Hanya izin yang memang memilih Asmen ini sebagai penyetuju, status masih pending
            filtered = data.filter(i =>
                i.status === 'pending' && String(i.asmenId) === String(myEmployeeId)
            );
        } else if (role === 'manajer') {
            filtered = data.filter(i => {
                const pemohon = this._findEmployee(i.userId);
                const pemohonRole = pemohon.role || 'staff';
                const pemohonBagian = String(pemohon.bagian || '').toUpperCase().trim();

                if (pemohonRole === 'staff') {
                    // Sudah disetujui Asmen, dan izin itu dari bagian yang sama dengan Manajer ini
                    return i.status === 'asmen_approved' && pemohonBagian === myBagian;
                }
                if (pemohonRole === 'asmen' && pemohonBagian !== 'UMUM DAN KEPEGAWAIAN') {
                    // Izin dari Asmen bagian lain wajib lewat Manajer Umum & Kepegawaian
                    // (bukan manajer bidang si Asmen), berlaku company-wide.
                    return isHrManajer && i.status === 'pending';
                }
                // Asmen dari Umum & Kepegawaian sendiri, atau pemohon Manajer:
                // tahap ini dilewati sama sekali (langsung ke Direktur).
                return false;
            });
        } else if (role === 'direktur') {
            filtered = data.filter(i => {
                const pemohon = this._findEmployee(i.userId);
                const pemohonRole = pemohon.role || 'staff';
                const pemohonBagian = String(pemohon.bagian || '').toUpperCase().trim();
                const isHrAsmen = pemohonRole === 'asmen' && pemohonBagian === 'UMUM DAN KEPEGAWAIAN';

                if (pemohonRole === 'manajer' || isHrAsmen) {
                    // Langsung dari pending, tahap Manajer dilewati
                    return i.status === 'pending';
                }
                // Staff & Asmen bagian lain: harus sudah disetujui Manajer dulu
                return i.status === 'manajer_approved';
            });
        }

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:var(--spacing-xl);color:var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size:3rem;margin-bottom:var(--spacing);"></i>
                    <p>Tidak ada pengajuan yang menunggu persetujuan Anda saat ini</p>
                </div>
            `;
            return;
        }

        const sorted = filtered.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

        const typeLabelFallback = {
            'sick': 'Sakit',
            'permission': 'Izin Penting',
            'emergency': 'Keadaan Darurat',
            'izin_harian': 'Permohonan Izin Harian',
            'keluar_kantor': 'Izin Keluar Kantor'
        };

        list.innerHTML = sorted.map(item => {
            const emp = this._findEmployee(item.userId);
            const typeLabel = item.typeLabel || typeLabelFallback[item.type] || 'Izin';
            const dateFormatted = dateTime.formatDate(new Date(item.date), 'short');
            const dateDisplay = item.dateEnd
                ? `${dateFormatted} - ${dateTime.formatDate(new Date(item.dateEnd), 'short')}`
                : dateFormatted;

            return `
                <div class="izin-item">
                    <div class="izin-icon ${item.type}"><i class="fas fa-file-alt"></i></div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${typeLabel}</h4>
                            <span class="izin-status ${item.status}">${this.getStatusLabel(item.status)}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date"><i class="fas fa-user"></i> ${emp.nama || 'Tidak diketahui'}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date"><i class="fas fa-calendar"></i> ${dateDisplay}</span>
                        </div>
                        <p class="izin-reason">${item.reason || ''}</p>
                        <div style="margin-top:8px;">
                            <button class="btn-small btn-primary" onclick="izin.openApprovalModal(${item.id}, '${role}')">
                                <i class="fas fa-eye"></i> Lihat &amp; Proses
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    openApprovalModal(id, role) {
        const item = this.allIzinData.find(i => String(i.id) === String(id));
        const modal = document.getElementById('modal-approval-izin');
        const content = document.getElementById('approval-izin-content');
        if (!item || !modal || !content) return;

        const emp = this._findEmployee(item.userId);
        const typeLabelFallback = {
            'sick': 'Sakit',
            'permission': 'Izin Penting',
            'emergency': 'Keadaan Darurat',
            'izin_harian': 'Permohonan Izin Harian',
            'keluar_kantor': 'Izin Keluar Kantor'
        };
        const typeLabel = item.typeLabel || typeLabelFallback[item.type] || 'Izin';
        const dateFormatted = dateTime.formatDate(new Date(item.date), 'short');
        const dateDisplay = item.dateEnd
            ? `${dateFormatted} - ${dateTime.formatDate(new Date(item.dateEnd), 'short')}`
            : dateFormatted;

        const infoRow = (icon, label, value) => `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color);">
                <div style="width:32px;height:32px;border-radius:8px;background:rgba(245,158,11,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${icon}"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;">${label}</div>
                    <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin-top:2px;">${value}</div>
                </div>
            </div>`;

        content.innerHTML = `
            <div style="text-align:center;margin-bottom:1.25rem;">
                <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px;">
                    <i class="fas fa-file-alt"></i>
                </div>
                <h3 style="font-size:1.05rem;margin-bottom:4px;">${typeLabel}</h3>
                <span class="izin-status ${item.status}">${this.getStatusLabel(item.status)}</span>
            </div>

            ${infoRow('fa-user', 'Nama Karyawan', emp.nama || '-')}
            ${infoRow('fa-briefcase', 'Jabatan', emp.jabatan || '-')}
            ${infoRow('fa-calendar-day', 'Tanggal Izin', dateDisplay)}

            <div style="margin-top:14px;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:6px;">Alasan</div>
                <div style="background:var(--color-gray-50);border-radius:10px;padding:12px 14px;font-size:0.88rem;color:var(--text-primary);line-height:1.5;">${item.reason || '-'}</div>
            </div>

            <div class="form-group" style="margin-top:14px;">
                <label for="approval-catatan">Catatan${role === 'asmen' ? ' (opsional)' : ''}</label>
                <textarea id="approval-catatan" rows="3" placeholder="Tulis catatan/pertimbangan Anda di sini..."></textarea>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button class="btn-secondary" onclick="izin.submitApproval(${item.id}, '${role}', 'reject')">
                    <i class="fas fa-times"></i> Tolak
                </button>
                <button class="btn-primary" onclick="izin.submitApproval(${item.id}, '${role}', 'approve')">
                    <i class="fas fa-check"></i> Setuju
                </button>
            </div>
        `;

        modal.style.display = 'flex';
    },

    closeApprovalModal() {
        const modal = document.getElementById('modal-approval-izin');
        if (modal) modal.style.display = 'none';
    },

    async submitApproval(id, role, decision) {
        const catatan = document.getElementById('approval-catatan')?.value || '';
        const user = auth.getCurrentUser();
        const approver = {
            id: user?.employeeId || user?.id,
            name: user?.name,
            nik: user?.nik,
            role: role,
            bagian: user?.bagian
        };

        try {
            const result = decision === 'approve'
                ? await api.approveIzin(id, approver, catatan)
                : await api.rejectIzin(id, approver, catatan);

            if (!result.success) {
                toast.error(result.error || 'Gagal memproses pengajuan');
                return;
            }

            const idx = this.allIzinData.findIndex(i => String(i.id) === String(id));
            if (idx > -1) this.allIzinData[idx] = { ...this.allIzinData[idx], ...result.data };

            this.closeApprovalModal();
            this.renderApprovalList(role);
            toast.success(decision === 'approve' ? 'Pengajuan disetujui' : 'Pengajuan ditolak');
        } catch (error) {
            console.error('Error submitApproval:', error);
            toast.error('Terjadi kesalahan, silakan coba lagi.');
        }
    },

    // Durasi Izin Keluar Kantor ditampilkan dalam jam/menit, bukan hari,
    // karena field duration untuk tipe ini memang selalu 0 (lihat handleSubmit).
    _hitungDurasiJam(jamKeluar, jamMasuk) {
        if (!jamKeluar || !jamMasuk) return '-';
        const [h1, m1] = jamKeluar.split(':').map(Number);
        const [h2, m2] = jamMasuk.split(':').map(Number);
        if ([h1, m1, h2, m2].some(n => isNaN(n))) return '-';
        let totalMenit = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (totalMenit < 0) totalMenit += 24 * 60; // jaga-jaga kalau lintas tengah malam
        const jam = Math.floor(totalMenit / 60);
        const menit = totalMenit % 60;
        if (jam === 0) return `${menit} menit`;
        if (menit === 0) return `${jam} jam`;
        return `${jam} jam ${menit} menit`;
    }
};

// Global init function
window.initIzin = () => {
    izin.init();
};

// Expose
window.izin = izin;
