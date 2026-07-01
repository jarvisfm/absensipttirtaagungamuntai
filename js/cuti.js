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
        this.initForm();
        this.initFilters();
        this.renderLeaveList();
        this.updateStats();
    },

    async loadLeaves() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const result = auth.isApprover() ? await api.getAllLeaves() : await api.getLeaves(userId);
            this.leaves = result.data || [];
        } catch (error) {
            console.error('Error loading leaves:', error);
            this.leaves = storage.get('leaves', []);
        }

        // Load balance from storage or use default
        const savedBalance = storage.get('leaveBalance');
        if (savedBalance !== null) {
            this.leaveBalance = savedBalance;
        }
    },

    initForm() {
        const form = document.getElementById('cuti-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
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

        if (startDate) startDate.addEventListener('change', calculateDuration);
        if (endDate) endDate.addEventListener('change', calculateDuration);

        // Sisa cuti hanya berlaku untuk Cuti Tahunan
        const typeSelect = document.getElementById('leave-type');
        const balanceHint = document.getElementById('leave-balance-hint');
        if (typeSelect && balanceHint) {
            typeSelect.addEventListener('change', () => {
                balanceHint.style.display = typeSelect.value === 'annual' ? 'block' : 'none';
            });
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

        // Sisa cuti hanya berlaku untuk Cuti Tahunan
        if (type.value === 'annual' && diffDays > this.leaveBalance) {
            toast.error('Sisa cuti tidak mencukupi!');
            return;
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

        const leaveData = {
            userId: currentUser?.id || 'demo-user',
            type: type.value,
            typeLabel: typeLabels[type.value],
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
            reason: reason.value,
            address: address?.value || '',
            phone: phone?.value || ''
        };

        try {
            const result = await api.submitLeave(leaveData);
            if (result.success) {
                this.leaves.unshift(result.data);

                // Deduct balance for annual leave saja
                if (type.value === 'annual') {
                    this.leaveBalance -= diffDays;
                    storage.set('leaveBalance', this.leaveBalance);
                    this.updateBalanceDisplay();
                }

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

        // Sort by applied date descending
        const sortedLeaves = filteredLeaves.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

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

            return `
                <div class="leave-item">
                    <div class="leave-icon">
                        <i class="fas ${icons[leave.type] || 'fa-calendar'}"></i>
                    </div>
                    <div class="leave-content">
                        <div class="leave-header">
                            <h4 class="leave-type">${leave.typeLabel}</h4>
                            <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                        ${leave.status === 'approved' ? `
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
            manager_approved: 'Disetujui Manager',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };
        return labels[status] || status;
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

                // Return balance for annual leave
                if (leave.type === 'annual') {
                    this.leaveBalance += leave.duration;
                    storage.set('leaveBalance', this.leaveBalance);
                    this.updateBalanceDisplay();
                }
            }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan cuti ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
