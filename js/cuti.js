/**
 * Portal Karyawan - Cuti/Leave
 * Leave request functionality
 */

const cuti = {
    leaves: [],
    leaveBalance: 12,
    filterStatus: '',

    async init() {
        await this.loadLeaves();
        await this.loadLeaveBalance();
        this.initForm();
        this.initFilters();
        this.renderLeaveList();
        this.updateStats();
    },

    async loadLeaves() {
        const currentUser = auth.getCurrentUser();
        // Admin dual-role (mis. M. Azemi = Admin sekaligus Asmen Kepegawaian)
        // login dengan id dari tabel Users, sedangkan seluruh logika approval
        // mencari data pemohon dari tabel Employees berdasarkan userId - pakai
        // employeeId (kalau ada) supaya konsisten.
        const userId = currentUser?.employeeId || currentUser?.id || 'demo-user';
        try {
            // PENTING: ini riwayat MILIK SENDIRI di halaman "Request Cuti", jadi harus
            // selalu getLeaves(userId) - jangan pakai isApprover() di sini, karena kalau
            // yang login Manajer/Asmen/Direktur, mereka akan lihat cuti SEMUA orang
            // tercampur di riwayat pribadinya sendiri (bukan cuma miliknya).
            const result = await api.getLeaves(userId);
            this.leaves = result.data || [];
        } catch (error) {
            console.error('Error loading leaves:', error);
            this.leaves = storage.get('leaves', []);
        }
    },

    // Sisa Cuti Tahunan dihitung di BACKEND (bukan localStorage lagi) - supaya
    // benar-benar berkurang begitu diajukan, tidak bisa diakali, sinkron di
    // semua device, dan otomatis reset tiap tahun (lihat Leave.gs).
    async loadLeaveBalance() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.employeeId || currentUser?.id || 'demo-user';
        try {
            const result = await api.getLeaveBalance(userId);
            this.leaveBalance = result.data ? result.data.sisa : 12;
        } catch (error) {
            console.error('Error loading leave balance:', error);
            this.leaveBalance = 12;
        }
        this.updateBalanceDisplay();
    },

    initForm() {
        // PENTING: halaman Cuti tidak di-render ulang setiap kali dibuka (router hanya
        // toggle class 'active'), jadi elemen form-nya sama terus. Kalau listener
        // dipasang lagi setiap initForm() dipanggil, submit form akan memicu
        // handleSubmit() berkali-kali -> data cuti & notifikasi tercipta ganda.
        // Guard dengan flag supaya listener hanya dipasang sekali.
        const form = document.getElementById('cuti-form');
        if (form && !this._formListenerAttached) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
            this._formListenerAttached = true;
        }

        // Auto-calculate duration when dates change (masih bisa diedit manual oleh user)
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const duration = document.getElementById('leave-duration');

        const calculateDuration = () => {
            if (startDate.value && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);
                const diffTime = end - start;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays > 0) {
                    duration.value = `${diffDays} hari`;
                } else {
                    duration.value = '0 hari';
                }
            }
        };

        if (startDate && endDate && !this._dateListenerAttached) {
            startDate.addEventListener('change', calculateDuration);
            endDate.addEventListener('change', calculateDuration);
            this._dateListenerAttached = true;
        }

        // Sisa cuti hanya berlaku untuk Cuti Tahunan
        const typeSelect = document.getElementById('leave-type');
        const balanceHint = document.getElementById('leave-balance-hint');
        if (typeSelect && balanceHint && !this._typeListenerAttached) {
            typeSelect.addEventListener('change', () => {
                balanceHint.style.display = typeSelect.value === 'annual' ? 'block' : 'none';
            });
            this._typeListenerAttached = true;
        }

        this._setupAsmenDropdown();
    },

    // Tampilkan & isi dropdown "Pilih Asmen" kalau user yang login role-nya
    // staff — sama seperti alur Surat Permohonan Izin (izin.js).
    async _setupAsmenDropdown() {
        const user = auth.getCurrentUser();
        const group = document.getElementById('cuti-asmen-group');
        const select = document.getElementById('cuti-asmen');
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

    async handleSubmit(e) {
        e.preventDefault();

        const type = document.getElementById('leave-type');
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const reason = document.getElementById('leave-reason');
        const durationInput = document.getElementById('leave-duration');
        const address = document.getElementById('leave-address');
        const phone = document.getElementById('leave-phone');

        if (!type.value || !startDate.value || !endDate.value || !reason.value) {
            toast.error('Semua field harus diisi!');
            return;
        }

        // Durasi: pakai selisih tanggal, kecuali user sudah mengisi manual berbeda
        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const calculatedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        const manualDays = parseInt((durationInput.value || '').replace(/[^0-9]/g, ''), 10);
        const diffDays = (durationInput.value && !isNaN(manualDays) && manualDays > 0)
            ? manualDays
            : calculatedDays;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            return;
        }

        // Sisa cuti hanya berlaku untuk Cuti Tahunan. Ini cuma pre-check di
        // frontend untuk UX cepat - validasi final & anti-akal-akalan tetap
        // di backend (submitLeaveData di Leave.gs).
        if (type.value === 'annual') {
            if (this.leaveBalance <= 0) {
                toast.error('Kuota Cuti Tahunan Anda tahun ini sudah habis!');
                return;
            }
            if (diffDays > this.leaveBalance) {
                toast.error(`Sisa Cuti Tahunan Anda cuma ${this.leaveBalance} hari!`);
                return;
            }
        }

        const typeLabels = {
            annual: 'Cuti Tahunan',
            important: 'Cuti Alasan Penting',
            sick: 'Cuti Sakit',
            besar: 'Cuti Besar',
            maternity: 'Cuti Bersalin',
            other: 'Keterangan Lain-lain'
        };

        const currentUser = auth.getCurrentUser();
        const asmenSelect = document.getElementById('cuti-asmen');
        const asmenId = asmenSelect ? asmenSelect.value : '';

        if (currentUser?.role === 'staff' && !asmenId) {
            toast.error('Silakan pilih Asmen penyetuju!');
            return;
        }

        const leaveData = {
            // Admin dual-role (mis. M. Azemi) pakai employeeId, karyawan biasa pakai id
            userId: currentUser?.employeeId || currentUser?.id || 'demo-user',
            type: type.value,
            typeLabel: typeLabels[type.value],
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
            reason: reason.value,
            address: address?.value || '',
            phone: phone?.value || '',
            asmenId: asmenId || ''
        };

        try {
            const result = await api.submitLeave(leaveData);
            if (result.success) {
                this.leaves.unshift(result.data);
                // Kuota Cuti Tahunan baru berkurang setelah disetujui FINAL oleh
                // Direktur (status 'approved'), jadi sengaja tidak dikurangi di sini
                // saat submit - lihat _hitungSisaCutiTahunan() di Leave.gs.
                toast.success('Pengajuan cuti berhasil dikirim!');
            } else {
                toast.error(result.error || 'Gagal mengajukan cuti');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            toast.error('Terjadi kesalahan');
        }

        // Reset form
        e.target.reset();
        document.getElementById('leave-duration').value = '';
        const balanceHint = document.getElementById('leave-balance-hint');
        if (balanceHint) balanceHint.style.display = 'none';

        this.renderLeaveList();
        this.updateStats();
    },

    initFilters() {
        const statusFilter = document.querySelector('.cuti-history-card .select-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderLeaveList();
            });
        }
    },

    updateBalanceDisplay() {
        const balanceEl = document.querySelector('.balance-value');
        if (balanceEl) {
            balanceEl.textContent = this.leaveBalance;
        }
    },

    updateStats() {
        const pending = this.leaves.filter(l => l.status === 'pending').length;
        const approved = this.leaves.filter(l => l.status === 'approved').length;
        const rejected = this.leaves.filter(l => l.status === 'rejected').length;

        const statValues = document.querySelectorAll('.leave-stats .stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = pending;
            statValues[1].textContent = approved;
            statValues[2].textContent = rejected;
        }
    },

    renderLeaveList() {
        const list = document.getElementById('leave-list');
        if (!list) return;

        // Filter leaves
        let filteredLeaves = this.leaves.filter(l => {
            if (!this.filterStatus) return true;
            if (this.filterStatus === 'menunggu') return l.status === 'pending';
            if (this.filterStatus === 'disetujui') return l.status === 'approved';
            if (this.filterStatus === 'ditolak') return l.status === 'rejected';
            return true;
        });

        if (filteredLeaves.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan cuti'}</p>
                </div>
            `;
            return;
        }

        // Sort by applied date descending. Fallback ke id (auto-increment di backend,
        // jadi id lebih besar = lebih baru) untuk kasus appliedAt kosong/tidak valid,
        // supaya urutan tetap benar walau data lama appliedAt-nya tidak tersimpan.
        const sortedLeaves = filteredLeaves.sort((a, b) => {
            const diff = new Date(b.appliedAt) - new Date(a.appliedAt);
            if (!isNaN(diff) && diff !== 0) return diff;
            return (Number(b.id) || 0) - (Number(a.id) || 0);
        });

        // Label & icon dihitung dari leave.type di sini (bukan field typeLabel dari
        // server), supaya tidak tergantung apakah kolom typeLabel tersimpan di sheet.
        const typeLabels = {
            annual: 'Cuti Tahunan',
            important: 'Cuti Alasan Penting',
            sick: 'Cuti Sakit',
            besar: 'Cuti Besar',
            maternity: 'Cuti Bersalin',
            other: 'Keterangan Lain-lain'
        };

        list.innerHTML = sortedLeaves.map(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const startFormatted = dateTime.formatDate(start, 'short');
            const endFormatted = dateTime.formatDate(end, 'short');

            let dateDisplay = startFormatted;
            if (leave.startDate !== leave.endDate) {
                dateDisplay = `${startFormatted} - ${endFormatted}`;
            }

            const icons = {
                annual: 'fa-umbrella-beach',
                important: 'fa-house-chimney',
                sick: 'fa-heartbeat',
                besar: 'fa-suitcase-rolling',
                maternity: 'fa-baby',
                other: 'fa-question-circle'
            };

            const typeLabel = leave.typeLabel || typeLabels[leave.type] || 'Cuti';

            return `
                <div class="leave-item">
                    <div class="leave-icon">
                        <i class="fas ${icons[leave.type] || 'fa-calendar'}"></i>
                    </div>
                    <div class="leave-content">
                        <div class="leave-header">
                            <h4 class="leave-type">${typeLabel}</h4>
                            <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                        ${leave.directorNote ? `
                            <div class="leave-director-note ${leave.status === 'ditunda' ? 'ditunda' : ''}">
                                <i class="fas fa-quote-left"></i>
                                <div>
                                    <span class="leave-director-note-label">Catatan Direktur</span>
                                    <p class="leave-director-note-text">${leave.directorNote}</p>
                                </div>
                            </div>
                        ` : ''}
                        ${(leave.status === 'approved' || leave.status === 'ditunda') ? `
                            <div style="margin-top:8px;">
                                <button class="btn-small btn-outline" onclick="printLetters.openCuti(${leave.id})">
                                    <i class="fas fa-print"></i> Cetak Formulir Cuti
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
            pending: 'Menunggu',
            asmen_approved: 'Disetujui Asmen',
            manajer_bidang_approved: 'Disetujui Manajer Bidang',
            manajer_approved: 'Disetujui Manajer',
            manager_approved: 'Disetujui Manager',
            approved: 'Disetujui',
            ditunda: 'Ditunda',
            rejected: 'Ditolak'
        };
        return labels[status] || status;
    },

    // Label status 'manajer_approved' yang lebih spesifik sesuai siapa approver
    // sebenarnya di tahap itu (sama seperti izin.js: _getDetailedStatusLabel).
    _getDetailedStatusLabel(item, emp) {
        if (item.status !== 'manajer_approved') {
            return this.getStatusLabel(item.status);
        }
        const pemohonRole = emp?.role || 'staff';
        if (pemohonRole === 'staff') {
            const bagian = emp?.bagian || '';
            return bagian ? `Disetujui Manajer ${bagian}` : 'Disetujui Manajer';
        }
        if (pemohonRole === 'asmen') {
            return 'Disetujui Manajer Umum dan Kepegawaian';
        }
        return this.getStatusLabel(item.status);
    },

    // Admin / Manager functions
    async approveLeave(id) {
        if (!auth.isApprover()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        const user = auth.getCurrentUser();
        const approver = {
            id: user?.id,
            name: user?.name || '',
            nik: user?.nik || '',
            role: auth.isManager() ? 'manager' : 'admin'
        };

        try {
            const result = await api.approveLeave(id, approver);
            const leave = this.leaves.find(l => l.id === id);
            if (leave && result?.data) {
                Object.assign(leave, result.data);
            }
            this.renderLeaveList();
            this.updateStats();
            toast.success(approver.role === 'manager'
                ? 'Disetujui sebagai Manager! Menunggu persetujuan Direktur.'
                : 'Pengajuan cuti disetujui final!');
        } catch (error) {
            console.error('Error approving leave:', error);
        }
    },

    async rejectLeave(id) {
        if (!auth.isApprover()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        const user = auth.getCurrentUser();
        const approver = {
            id: user?.id,
            name: user?.name || '',
            nik: user?.nik || '',
            role: auth.isManager() ? 'manager' : 'admin'
        };

        try {
            await api.rejectLeave(id, approver);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) {
                leave.status = 'rejected';
            }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan cuti ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    },

    // =========================================================
    // APPROVAL BERTINGKAT: Asmen -> Manajer (bidang + HR) -> Direktur
    // Dipanggil dari router saat halaman approval-asmen/manajer/direktur dibuka
    // (bersamaan dengan izin.initApprovalPage(role) - lihat router.js).
    // Sengaja pakai list & modal TERPISAH dari izin.js ('approval-{role}-list-cuti',
    // 'modal-approval-cuti') supaya tidak mengganggu logika Izin yang sudah ada.
    // =========================================================
    async initApprovalPage(role) {
        await this.loadAllLeavesData();
        await this._ensureEmployeesLoaded();
        this.renderApprovalList(role);
    },

    async loadAllLeavesData() {
        try {
            const result = await api.getAllLeaves();
            this.allLeavesData = result.data || [];
        } catch (error) {
            console.error('Gagal memuat semua data cuti:', error);
            this.allLeavesData = [];
        }
    },

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
        const list = document.getElementById(`approval-${role}-list-cuti`);
        if (!list) return;

        const user = auth.getCurrentUser();
        const myEmployeeId = user?.employeeId || user?.id;
        const myBagian = String(user?.bagian || '').toUpperCase().trim();
        const isHrManajer = myBagian === 'UMUM DAN KEPEGAWAIAN';
        const data = this.allLeavesData || [];
        let filtered = [];

        if (role === 'asmen') {
            filtered = data.filter(l =>
                l.status === 'pending' && String(l.asmenId) === String(myEmployeeId)
            );
        } else if (role === 'manajer') {
            filtered = data.filter(l => {
                const pemohon = this._findEmployee(l.userId);
                const pemohonRole = pemohon.role || 'staff';
                const pemohonBagian = String(pemohon.bagian || '').toUpperCase().trim();
                const isPemohonHr = pemohonBagian === 'UMUM DAN KEPEGAWAIAN';
                // Gerbang awal: staff harus sudah asmen_approved, asmen (tahap
                // asmen dilewati) langsung dari status pending.
                const gateStatus = pemohonRole === 'staff' ? 'asmen_approved' : 'pending';

                if (pemohonRole === 'manajer') return false; // tahap ini dilewati sama sekali

                if (isPemohonHr) {
                    // Manajer bidang == Manajer HR (orang sama) -> 1x approval representasi
                    return isHrManajer && l.status === gateStatus;
                }

                // 2 tahap berurutan: (1) manajer bidang pemohon, (2) Manajer Umum & Kepegawaian
                if (l.status === gateStatus && pemohonBagian === myBagian) return true;
                if (l.status === 'manajer_bidang_approved' && isHrManajer) return true;
                return false;
            });
        } else if (role === 'direktur') {
            filtered = data.filter(l => {
                const pemohon = this._findEmployee(l.userId);
                const pemohonRole = pemohon.role || 'staff';
                if (pemohonRole === 'manajer') {
                    return l.status === 'pending';
                }
                return l.status === 'manajer_approved';
            });
        }

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:var(--spacing-xl);color:var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size:3rem;margin-bottom:var(--spacing);"></i>
                    <p>Tidak ada pengajuan cuti yang menunggu persetujuan Anda saat ini</p>
                </div>
            `;
            return;
        }

        const sorted = filtered.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

        const typeLabels = {
            annual: 'Cuti Tahunan',
            important: 'Cuti Alasan Penting',
            sick: 'Cuti Sakit',
            besar: 'Cuti Besar',
            maternity: 'Cuti Bersalin',
            other: 'Keterangan Lain-lain'
        };

        list.innerHTML = sorted.map(item => {
            const emp = this._findEmployee(item.userId);
            const typeLabel = item.typeLabel || typeLabels[item.type] || 'Cuti';
            const startFormatted = dateTime.formatDate(new Date(item.startDate), 'short');
            const endFormatted = dateTime.formatDate(new Date(item.endDate), 'short');
            const dateDisplay = item.startDate !== item.endDate
                ? `${startFormatted} - ${endFormatted}` : startFormatted;

            return `
                <div class="izin-item">
                    <div class="izin-icon"><i class="fas fa-umbrella-beach"></i></div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${typeLabel}</h4>
                            <span class="izin-status ${item.status}">${this._getDetailedStatusLabel(item, emp)}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date"><i class="fas fa-user"></i> ${emp.nama || 'Tidak diketahui'}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date"><i class="fas fa-calendar"></i> ${dateDisplay} (${item.duration} hari)</span>
                        </div>
                        <p class="izin-reason">${item.reason || ''}</p>
                        <div style="margin-top:8px;">
                            <button class="btn-small btn-primary" onclick="cuti.openApprovalModal(${item.id}, '${role}')">
                                <i class="fas fa-eye"></i> Lihat &amp; Proses
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    openApprovalModal(id, role) {
        this._openModalId = id;
        const item = this.allLeavesData.find(l => String(l.id) === String(id));
        const modal = document.getElementById('modal-approval-cuti');
        const content = document.getElementById('approval-cuti-content');
        if (!item || !modal || !content) return;

        const emp = this._findEmployee(item.userId);
        const typeLabels = {
            annual: 'Cuti Tahunan',
            important: 'Cuti Alasan Penting',
            sick: 'Cuti Sakit',
            besar: 'Cuti Besar',
            maternity: 'Cuti Bersalin',
            other: 'Keterangan Lain-lain'
        };
        const typeLabel = item.typeLabel || typeLabels[item.type] || 'Cuti';
        const startFormatted = dateTime.formatDate(new Date(item.startDate), 'short');
        const endFormatted = dateTime.formatDate(new Date(item.endDate), 'short');
        const dateDisplay = item.startDate !== item.endDate
            ? `${startFormatted} - ${endFormatted}` : startFormatted;

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

        // Direktur punya 2 pilihan keputusan: Setuju, atau Tunda (dengan
        // tanggal "Sampai dengan Tanggal ..."). Asmen/Manajer cuma Setuju/Tolak.
        const isDirektur = role === 'direktur';
        const actionButtons = isDirektur ? `
            <div class="form-group" id="cuti-tunda-date-group" style="display:none;margin-top:10px;">
                <label for="cuti-tunda-sampai">Sampai dengan Tanggal</label>
                <input type="date" id="cuti-tunda-sampai">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
                <button class="btn-secondary" onclick="cuti.submitApproval(${item.id}, '${role}', 'reject')">
                    <i class="fas fa-times"></i> Tolak
                </button>
                <button class="btn-secondary" onclick="cuti.toggleTundaDate(true)" id="btn-cuti-tunda">
                    <i class="fas fa-clock"></i> Tunda
                </button>
                <button class="btn-primary" onclick="cuti.submitApproval(${item.id}, '${role}', 'approve')">
                    <i class="fas fa-check"></i> Setuju
                </button>
            </div>
        ` : `
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button class="btn-secondary" onclick="cuti.submitApproval(${item.id}, '${role}', 'reject')">
                    <i class="fas fa-times"></i> Tolak
                </button>
                <button class="btn-primary" onclick="cuti.submitApproval(${item.id}, '${role}', 'approve')">
                    <i class="fas fa-check"></i> Setuju
                </button>
            </div>
        `;

        content.innerHTML = `
            <div style="text-align:center;margin-bottom:1.25rem;">
                <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px;">
                    <i class="fas fa-umbrella-beach"></i>
                </div>
                <h3 style="font-size:1.05rem;margin-bottom:4px;">${typeLabel}</h3>
                <span class="izin-status ${item.status}">${this._getDetailedStatusLabel(item, emp)}</span>
            </div>

            ${infoRow('fa-user', 'Nama Karyawan', emp.nama || '-')}
            ${infoRow('fa-briefcase', 'Jabatan', emp.jabatan || '-')}
            ${infoRow('fa-calendar-day', 'Tanggal Cuti', `${dateDisplay} (${item.duration} hari)`)}

            <div style="margin-top:14px;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:6px;">Untuk Keperluan</div>
                <div style="background:var(--color-gray-50);border-radius:10px;padding:12px 14px;font-size:0.88rem;color:var(--text-primary);line-height:1.5;">${item.reason || '-'}</div>
            </div>

            <div class="form-group" style="margin-top:14px;">
                <label for="approval-catatan-cuti">Catatan${role === 'asmen' ? ' (opsional)' : ''}</label>
                <textarea id="approval-catatan-cuti" rows="3" placeholder="Tulis catatan/pertimbangan Anda di sini..."></textarea>
            </div>

            ${actionButtons}
        `;

        modal.style.display = 'flex';
    },

    // Toggle tampilan input tanggal "Sampai dengan Tanggal ..." saat Direktur
    // klik tombol Tunda. Klik lagi tombol Setuju/Tolak akan tetap submit biasa;
    // untuk konfirmasi Tunda, klik tombol "Tunda" sekali lagi setelah tanggal diisi.
    toggleTundaDate(show) {
        const group = document.getElementById('cuti-tunda-date-group');
        const btn = document.getElementById('btn-cuti-tunda');
        if (!group) return;

        if (show && group.style.display === 'none') {
            group.style.display = 'block';
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Konfirmasi Tunda';
                btn.setAttribute('onclick', `cuti.submitApproval(${this._currentModalId()}, 'direktur', 'postpone')`);
            }
        }
    },

    // Helper kecil untuk ambil id item yang sedang dibuka di modal, dipakai
    // toggleTundaDate() karena tombol Tunda butuh tahu id-nya juga.
    _currentModalId() {
        return this._openModalId;
    },

    closeApprovalModal() {
        const modal = document.getElementById('modal-approval-cuti');
        if (modal) modal.style.display = 'none';
    },

    async submitApproval(id, role, decision) {
        this._openModalId = id;
        const catatan = document.getElementById('approval-catatan-cuti')?.value || '';
        const tundaSampai = document.getElementById('cuti-tunda-sampai')?.value || '';

        if (decision === 'postpone' && !tundaSampai) {
            toast.error('Silakan isi tanggal "Sampai dengan Tanggal" terlebih dahulu!');
            return;
        }

        const user = auth.getCurrentUser();
        const approver = {
            id: user?.employeeId || user?.id,
            name: user?.name,
            nik: user?.nik,
            role: role,
            bagian: user?.bagian
        };

        try {
            let result;
            if (decision === 'approve') {
                result = await api.approveLeave(id, approver, catatan);
            } else if (decision === 'postpone') {
                result = await api.postponeLeave(id, approver, catatan, tundaSampai);
            } else {
                result = await api.rejectLeave(id, approver, catatan);
            }

            if (!result.success) {
                toast.error(result.error || 'Gagal memproses pengajuan');
                return;
            }

            const idx = this.allLeavesData.findIndex(l => String(l.id) === String(id));
            if (idx > -1) this.allLeavesData[idx] = { ...this.allLeavesData[idx], ...result.data };

            this.closeApprovalModal();
            this.renderApprovalList(role);

            const messages = { approve: 'Pengajuan cuti disetujui', reject: 'Pengajuan cuti ditolak', postpone: 'Pengajuan cuti ditunda' };
            toast.success(messages[decision] || 'Berhasil diproses');
        } catch (error) {
            console.error('Error submitApproval (cuti):', error);
            toast.error('Terjadi kesalahan, silakan coba lagi.');
        }
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
