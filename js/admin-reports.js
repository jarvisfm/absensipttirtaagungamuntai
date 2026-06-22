/**
 * Portal Karyawan - Admin Reports
 * Reports and exports for admin
 */

const adminReports = {
    attendanceData: [],
    jurnalData: [],
    leaveData: [],
    filters: {
        attendance: { month: '', dept: '', status: '' },
        jurnal: { month: '', employee: '', status: '' },
        leave: { month: '', type: '', status: '' }
    },

    async initAttendanceReports() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.bindAttendanceEvents();
        this.populateEmployeeFilter();
        this.renderAttendanceReports();
    },

    async initJurnalReports() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.bindJurnalEvents();
        this.populateEmployeeFilter();
        this.renderJurnalReports();
    },

    async initLeaveReports() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.bindLeaveEvents();
        this.renderLeaveReports();
    },

    async loadData() {
        let employees = [];
        let jurnals = [];
        let leaves = [];
        let izinList = [];
        let attendances = [];

        try {
            const [empResult, jurnalResult, leaveResult, izinResult, attResult] = await Promise.all([
                api.getEmployees(),
                api.getAllJournals(),
                api.getAllLeaves(),
                api.getAllIzin(),
                api.getAllAttendance()
            ]);
            employees = empResult.data || [];
            jurnals = jurnalResult.data || [];
            leaves = leaveResult.data || [];
            izinList = izinResult.data || [];
            attendances = attResult.data || [];
        } catch (error) {
            console.error('Error loading report data:', error);
            employees = storage.get('admin_employees', []);
            jurnals = storage.get('jurnals', []);
            leaves = storage.get('leaves', []);
            izinList = storage.get('izin', []);
            attendances = storage.get('attendance', []);
        }

        // Generate attendance data from real database records
        this.rawAttendance = attendances;
        this.rawEmployees = employees;

        this.attendanceData = employees.map(emp => {
            const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
            let present = 0;
            let late = 0;

            empAtt.forEach(a => {
                if (a.clockIn) {
                    present++;
                    if (a.status && a.status.toLowerCase() === 'terlambat') {
                        late++;
                    }
                }
            });

            // Calculate leave/absent (Cutis & Izins)
            const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = izinList.filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');

            // Simplified sum: duration of valid leaves + single-day izin
            let leaveDays = 0;
            empLeaves.forEach(l => leaveDays += parseInt(l.duration) || 1);
            empIzin.forEach(i => leaveDays += parseInt(i.duration) || 1);

            const absent = leaveDays;

            return {
                name: emp.name,
                department: emp.department,
                present: present,
                late: late,
                absent: absent,
                total: present + absent
            };
        });

        const currentUser = auth.getCurrentUser();

        this.jurnalData = jurnals.map(j => {
            let emp = employees.find(e => e.id === j.userId);
            if (!emp && currentUser) {
                emp = { name: currentUser.name, department: currentUser.department || '-' };
            }
            if (!emp) {
                emp = { name: 'Karyawan', department: '-' };
            }
            return {
                date: j.date,
                name: emp.name,
                department: emp.department,
                tasks: j.tasks || '-',
                achievements: j.achievements || '-',
                obstacles: j.obstacles || '-',
                plan: j.plan || '-',
                photo: j.photo || null,
                status: j.tasks ? 'filled' : 'empty',
                updatedAt: j.updatedAt
            };
        });

        // Deduplikasi by id
const uniqueLeaves = leaves.filter((l, i, arr) =>
    arr.findIndex(x => String(x.id) === String(l.id)) === i
);
const uniqueIzin = izinList.filter((i, idx, arr) =>
    arr.findIndex(x => String(x.id) === String(i.id)) === idx
);

this.leaveData = [
    ...uniqueLeaves.map(l => {
        let emp = employees.find(e => String(e.id) === String(l.userId));
        if (!emp && currentUser && String(currentUser.id) === String(l.userId)) {
            emp = { name: currentUser.name, department: currentUser.department || '-' };
        }
        if (!emp) emp = { name: l.userId || 'Karyawan', department: '-' };
        return {
            id: l.id,
            kind: 'leave',
            userId: l.userId,
            name: emp.name || emp.nama || l.userId,
            department: emp.department || emp.unitKerja || '-',
            type: l.type === 'annual' ? 'Cuti Tahunan'
                : l.type === 'sick' ? 'Cuti Sakit'
                : l.type === 'important' ? 'Cuti Penting'
                : (l.typeLabel || l.type || 'Cuti'),
            dates: l.startDate && l.endDate
                ? (l.startDate === l.endDate ? l.startDate : `${l.startDate} - ${l.endDate}`)
                : (l.startDate || '-'),
            duration: l.duration != null ? l.duration : '-',
            reason: l.reason || l.alasan || '-',
            status: l.status || 'pending',
            startDate: l.startDate || ''
        };
    }),
    ...uniqueIzin.map(i => {
        let emp = employees.find(e => String(e.id) === String(i.userId));
        if (!emp && currentUser && String(currentUser.id) === String(i.userId)) {
            emp = { name: currentUser.name, department: currentUser.department || '-' };
        }
        if (!emp) emp = { name: i.userId || 'Karyawan', department: '-' };
        return {
            id: i.id,
            kind: 'izin',
            userId: i.userId,
            name: emp.name || emp.nama || i.userId,
            department: emp.department || emp.unitKerja || '-',
            type: i.type === 'sick' ? 'Sakit'
                : i.type === 'permission' ? 'Izin Penting'
                : i.type === 'emergency' ? 'Keadaan Darurat'
                : (i.typeLabel || 'Izin'),
            dates: i.date || '-',
            duration: i.duration != null ? i.duration : '-',
            reason: i.reason || i.alasan || '-',
            status: i.status || 'pending',
            startDate: i.date || ''
        };
    })
];

// Hitung kuota cuti per karyawan (12 hari/tahun)
const KUOTA_CUTI = 12;
const tahunIni = new Date().getFullYear();
this.leaveQuota = {};
employees.forEach(emp => {
    const cutiDisetujui = uniqueLeaves.filter(l =>
        String(l.userId) === String(emp.id) &&
        l.status === 'approved' &&
        (l.startDate || '').startsWith(String(tahunIni))
    );
    const totalPakai = cutiDisetujui.reduce((sum, l) => sum + (parseInt(l.duration) || 0), 0);
    const sisa = KUOTA_CUTI - totalPakai;
    this.leaveQuota[String(emp.id)] = { pakai: totalPakai, sisa: Math.max(0, sisa) };
    if (totalPakai >= KUOTA_CUTI) {
        const nama = emp.name || emp.nama || 'Karyawan';
        toast.warning(`⚠️ Kuota cuti ${nama} sudah habis tahun ini!`);
    }
});

    populateEmployeeFilter() {
        const employees = storage.get('admin_employees', []);
        const select = document.getElementById('jurnal-employee-filter');
        if (select) {
            select.innerHTML = '<option value="">Semua Karyawan</option>' +
                employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('');
        }
    },

    bindAttendanceEvents() {
        // Export button
        const exportBtn = document.getElementById('btn-export-attendance');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel('attendance'));
        }

        // Print button
        const printBtn = document.getElementById('btn-print-attendance');
        if (printBtn) {
            printBtn.addEventListener('click', () => this.printReport('attendance'));
        }

        // Month filter
        const dateFrom = document.getElementById('attendance-date-from');
        const dateTo   = document.getElementById('attendance-date-to');
        if (dateFrom) {
            dateFrom.addEventListener('change', (e) => {
                this.filters.attendance.dateFrom = e.target.value;
                this.renderAttendanceReports();
            });
        }
        if (dateTo) {
            dateTo.addEventListener('change', (e) => {
                this.filters.attendance.dateTo = e.target.value;
                this.renderAttendanceReports();
            });
        }

        // Department filter
        const deptFilter = document.getElementById('report-dept-filter');
        if (deptFilter) {
            deptFilter.addEventListener('change', (e) => {
                this.filters.attendance.dept = e.target.value;
                this.renderAttendanceReports();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('report-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.attendance.status = e.target.value;
                this.renderAttendanceReports();
            });
        }
    },

    bindJurnalEvents() {
        const exportBtn = document.getElementById('btn-export-jurnal');
        const printBtn = document.getElementById('btn-print-jurnal');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel('jurnal'));
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => this.printReport('jurnal'));
        }

        // Month filter
        const monthFilter = document.getElementById('jurnal-month');
        if (monthFilter) {
            monthFilter.addEventListener('change', (e) => {
                this.filters.jurnal.month = e.target.value;
                this.renderJurnalReports();
            });
        }

        // Employee filter
        const empFilter = document.getElementById('jurnal-employee-filter');
        if (empFilter) {
            empFilter.addEventListener('change', (e) => {
                this.filters.jurnal.employee = e.target.value;
                this.renderJurnalReports();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('jurnal-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.jurnal.status = e.target.value;
                this.renderJurnalReports();
            });
        }
    },

    bindLeaveEvents() {
        const exportBtn = document.getElementById('btn-export-leave');
        const printBtn = document.getElementById('btn-print-leave');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel('leave'));
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => this.printReport('leave'));
        }

        // Month filter
        const monthFilter = document.getElementById('leave-month');
        if (monthFilter) {
            monthFilter.addEventListener('change', (e) => {
                this.filters.leave.month = e.target.value;
                this.renderLeaveReports();
            });
        }

        // Type filter
        const typeFilter = document.getElementById('leave-type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.filters.leave.type = e.target.value;
                this.renderLeaveReports();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('leave-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.leave.status = e.target.value;
                this.renderLeaveReports();
            });
        }
    },

    getFilteredAttendance() {
    const { dateFrom, dateTo, dept, status } = this.filters.attendance;

    return this.rawAttendance.filter(row => {
        const emp = this.rawEmployees.find(e => String(e.id) === String(row.userId));
        if (!emp) return false;

        const matchesDept   = !dept   || emp.department === dept;
        const matchesStatus = !status || String(row.status || '').toLowerCase() === status.toLowerCase();

        let matchesDate = true;
        if (dateFrom) matchesDate = matchesDate && row.date >= dateFrom;
        if (dateTo)   matchesDate = matchesDate && row.date <= dateTo;

        return matchesDept && matchesStatus && matchesDate;
    }).map(row => {
        const emp = this.rawEmployees.find(e => String(e.id) === String(row.userId));
        return { ...row, empName: emp?.name || '-', empDept: emp?.department || '-' };
    });
},

    getFilteredJurnal() {
        return this.jurnalData.filter(row => {
            const matchesEmp = !this.filters.jurnal.employee || row.name === this.filters.jurnal.employee;
            const matchesStatus = !this.filters.jurnal.status || row.status === this.filters.jurnal.status;
            return matchesEmp && matchesStatus;
        });
    },

    getFilteredLeave() {
    const { month, type, status } = this.filters.leave;
    return this.leaveData.filter(row => {
        const matchesMonth = !month || (row.startDate && row.startDate.startsWith(month));
        const matchesType = !type ||
            (type === 'cuti' && row.type.toLowerCase().includes('cuti')) ||
            (type === 'izin' && row.type.toLowerCase().includes('izin')) ||
            (type === 'sakit' && (row.type.toLowerCase().includes('sakit') || row.kind === 'izin'));
        const matchesStatus = !status || row.status === status;
        return matchesMonth && matchesType && matchesStatus;
    });
},

    renderAttendanceReports() {
    const container = document.getElementById('attendance-reports-body');
    if (!container) return;

    const { dateFrom, dateTo, dept, status } = this.filters.attendance;
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

    // Filter & kelompokkan attendance per karyawan
    let employees = [...(this.rawEmployees || [])];

    // Filter departemen
    if (dept) employees = employees.filter(e => e.department === dept);

    // Urutkan berdasarkan departemen lalu nama
    employees.sort((a, b) => {
        const deptCompare = String(a.department || '').localeCompare(String(b.department || ''));
        if (deptCompare !== 0) return deptCompare;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (employees.length === 0) {
        container.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">Tidak ada data karyawan</td></tr>';
        return;
    }

    // Render per karyawan
    let html = '';

    employees.forEach(emp => {
        // Filter absensi karyawan ini
        let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));

        if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
        if (dateTo)   rows = rows.filter(r => r.date <= dateTo);
        if (status)   rows = rows.filter(r => String(r.status || '').toLowerCase() === status.toLowerCase());

        // Urutkan tanggal terbaru dulu
        rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

        // Inisial & warna avatar
        const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const colors   = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
        const color    = colors[(emp.name || '').charCodeAt(0) % colors.length];

        // Statistik ringkas
        const totalHadir    = rows.filter(r => ['hadir','ontime'].includes(String(r.status||'').toLowerCase())).length;
        const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
        const totalHari     = rows.length;

        html += `
            <tr class="employee-group-header" style="background:var(--bg-secondary,#f8f9fa);">
                <td colspan="10" style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">${initials}</div>
                            <div>
                                <div style="font-weight:600;font-size:0.95rem;">${emp.name || '-'}</div>
                                <div style="font-size:0.78rem;color:var(--text-muted);">${emp.department || '-'} — ${emp.position || '-'} — ${emp.shift || '-'}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:12px;font-size:0.8rem;">
                            <span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir: ${totalHadir}</span>
                            <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-weight:500;">Terlambat: ${totalTerlambat}</span>
                            <span style="background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:20px;font-weight:500;">Total: ${totalHari} hari</span>
                        </div>
                    </div>
                </td>
            </tr>
            <tr style="background:#f1f5f9;font-size:0.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">
                <td style="padding:8px 12px;">Tanggal</td>
                <td style="padding:8px 12px;">Shift</td>
                <td style="padding:8px 12px;">Masuk</td>
                <td style="padding:8px 12px;">Istirahat</td>
                <td style="padding:8px 12px;">Kembali</td>
                <td style="padding:8px 12px;">Pulang</td>
                <td style="padding:8px 12px;">Lokasi</td>
                <td style="padding:8px 12px;">Status</td>
                <td style="padding:8px 12px;">Foto</td>
                <td style="padding:8px 12px;">GPS</td>
            </tr>
        `;

        if (rows.length === 0) {
            html += `
                <tr>
                    <td colspan="10" style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;">
                        <i class="fas fa-calendar-times" style="margin-right:6px;"></i>
                        Tidak ada data absensi pada periode ini
                    </td>
                </tr>
            `;
        } else {
            rows.forEach(row => {
                const [y, m, d] = (row.date || '').split('-');
                const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';

                const statusLower = String(row.status || '').toLowerCase();
                let statusBadge = '<span class="badge-status">–</span>';
                if (statusLower === 'hadir' || statusLower === 'ontime') {
                    statusBadge = '<span class="badge-status success">Hadir</span>';
                } else if (statusLower === 'terlambat' || statusLower === 'late') {
                    statusBadge = '<span class="badge-status warning">Terlambat</span>';
                } else if (statusLower === 'pending' || statusLower === 'waiting') {
                    statusBadge = '<span class="badge-status">Pending</span>';
                }

                const coords = this._parseLatLng(row.verificationLocation);
                const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';

                const lokasiHtml = coords
                    ? `<span id="loc-t-${row.id}" style="font-size:0.75rem;">
                            <i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i>
                            <small style="color:var(--text-muted);">${coordLabel}</small>
                       </span>`
                    : '<span style="color:var(--text-muted)">–</span>';

                const fotoHtml = row.verificationPhoto
                    ? `<img src="${row.verificationPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="adminReports.viewPhoto('${row.verificationPhoto}')">`
                    : '<span style="color:var(--text-muted)">–</span>';

                const gpsHtml = coords
                    ? `<button style="background:#10b981;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;border:none;cursor:pointer;" onclick="adminReports.openMaps('${row.verificationLocation}')"><i class="fas fa-map-marker-alt"></i> GPS</button>`
                    : '<span style="color:var(--text-muted)">–</span>';

                html += `
                    <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                        <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}</td>
                        <td style="padding:10px 12px;font-size:0.82rem;">${row.shift || '-'}</td>
                        <td style="padding:10px 12px;font-weight:600;color:#10b981;">${row.clockIn || '–'}</td>
                        <td style="padding:10px 12px;color:var(--text-muted);">${row.breakStart || '–'}</td>
                        <td style="padding:10px 12px;color:var(--text-muted);">${row.breakEnd || '–'}</td>
                        <td style="padding:10px 12px;font-weight:600;color:#EF4444;">${row.clockOut || '–'}</td>
                        <td style="padding:10px 12px;font-size:0.75rem;max-width:160px;">${lokasiHtml}</td>
                        <td style="padding:10px 12px;">${statusBadge}</td>
                        <td style="padding:10px 12px;">${fotoHtml}</td>
                        <td style="padding:10px 12px;">${gpsHtml}</td>
                    </tr>
                `;
            });
        }

        // Garis pemisah antar karyawan
        html += `<tr><td colspan="10" style="padding:8px;background:transparent;border:none;"></td></tr>`;
    });

    container.innerHTML = html;

    // Render versi kartu mobile dengan data yang sama
    this.renderAttendanceMobileCards(employees, dateFrom, dateTo, status, months);

    // Isi nama lokasi secara async (tabel + kartu mobile)
    employees.forEach(emp => {
        let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
        if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
        if (dateTo)   rows = rows.filter(r => r.date <= dateTo);

        rows.forEach(async (row) => {
            const coords = this._parseLatLng(row.verificationLocation);
            if (!coords) return;
            const address = await this._getAddressFromCoords(coords.lat, coords.lng);
            const elTable = document.getElementById(`loc-t-${row.id}`);
            const elCard  = document.getElementById(`loc-m-${row.id}`);
            const html = address
                ? `<span style="font-size:0.75rem;">${address}</span><br>
                    <small style="color:var(--text-muted);font-size:0.7rem;">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</small>`
                : `<small style="color:var(--text-muted);">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</small>`;
            if (elTable) elTable.innerHTML = html;
            if (elCard) elCard.innerHTML = html;
        });
    });
},

    renderAttendanceMobileCards(employees, dateFrom, dateTo, status, months) {
    const container = document.getElementById('attendance-mobile-cards');
    if (!container) return;

    if (employees.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data karyawan</div>';
        return;
    }

    let html = '';

    employees.forEach(emp => {
        let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
        if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
        if (dateTo)   rows = rows.filter(r => r.date <= dateTo);
        if (status)   rows = rows.filter(r => String(r.status || '').toLowerCase() === status.toLowerCase());

        rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const colors   = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
        const color    = colors[(emp.name || '').charCodeAt(0) % colors.length];

        const totalHadir    = rows.filter(r => ['hadir','ontime'].includes(String(r.status||'').toLowerCase())).length;
        const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
        const totalHari     = rows.length;

        html += `
            <div class="mobile-card" style="margin-bottom:16px;">
                <div class="mobile-card-header" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">${initials}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.95rem;">${emp.name || '-'}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${emp.department || '-'} — ${emp.position || '-'}</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;font-size:0.75rem;margin-bottom:10px;flex-wrap:wrap;">
                    <span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir: ${totalHadir}</span>
                    <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-weight:500;">Terlambat: ${totalTerlambat}</span>
                    <span style="background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:20px;font-weight:500;">Total: ${totalHari} hari</span>
                </div>
        `;

        if (rows.length === 0) {
            html += `
                <div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem;border-top:1px solid var(--border-color,#e5e7eb);">
                    <i class="fas fa-calendar-times" style="margin-right:6px;"></i>
                    Tidak ada data absensi pada periode ini
                </div>
            `;
        } else {
            rows.forEach(row => {
                const [y, m, d] = (row.date || '').split('-');
                const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';

                const statusLower = String(row.status || '').toLowerCase();
                let statusBadge = '<span class="badge-status">–</span>';
                if (statusLower === 'hadir' || statusLower === 'ontime') {
                    statusBadge = '<span class="badge-status success">Hadir</span>';
                } else if (statusLower === 'terlambat' || statusLower === 'late') {
                    statusBadge = '<span class="badge-status warning">Terlambat</span>';
                } else if (statusLower === 'pending' || statusLower === 'waiting') {
                    statusBadge = '<span class="badge-status">Pending</span>';
                }

                const coords = this._parseLatLng(row.verificationLocation);
                const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';

                const lokasiHtml = coords
                    ? `<span id="loc-m-${row.id}" style="font-size:0.75rem;">
                            <i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i>
                            <small style="color:var(--text-muted);">${coordLabel}</small>
                       </span>`
                    : '<span style="color:var(--text-muted)">–</span>';

                const fotoHtml = row.verificationPhoto
                    ? `<img src="${row.verificationPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="adminReports.viewPhoto('${row.verificationPhoto}')">`
                    : '<span style="color:var(--text-muted)">–</span>';

                const gpsHtml = coords
                    ? `<button style="background:#10b981;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;border:none;cursor:pointer;" onclick="adminReports.openMaps('${row.verificationLocation}')"><i class="fas fa-map-marker-alt"></i> GPS</button>`
                    : '<span style="color:var(--text-muted)">–</span>';

                html += `
                    <div style="padding:10px 0;border-top:1px solid var(--border-color,#e5e7eb);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span style="font-weight:600;font-size:0.85rem;">${dateStr}</span>
                            ${statusBadge}
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">
                            <div>Shift: <span style="color:var(--text-primary,#111);">${row.shift || '-'}</span></div>
                            <div>Masuk: <span style="color:#10b981;font-weight:600;">${row.clockIn || '–'}</span></div>
                            <div>Istirahat: ${row.breakStart || '–'}</div>
                            <div>Kembali: ${row.breakEnd || '–'}</div>
                            <div>Pulang: <span style="color:#EF4444;font-weight:600;">${row.clockOut || '–'}</span></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <div style="flex:1;min-width:0;">${lokasiHtml}</div>
                            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">${fotoHtml}${gpsHtml}</div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
    });

    container.innerHTML = html;
},

    async _getAddressFromCoords(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`,
            { headers: { 'User-Agent': 'AbsensiPTTAA/1.0' } }
        );
        const data = await res.json();
        if (data && data.address) {
            const a = data.address;
            return [
                a.road || a.pedestrian || a.footway || '',
                a.village || a.suburb || a.neighbourhood || '',
                a.city || a.town || a.county || ''
            ].filter(Boolean).join(', ');
        }
        return null;
    } catch (e) {
        return null;
    }
},

_parseLatLng(locationStr) {
    if (!locationStr) return null;
    const latMatch = locationStr.match(/latitude=(-?\d+\.?\d*)/);
    const lngMatch = locationStr.match(/longitude=(-?\d+\.?\d*)/);
    if (latMatch && lngMatch) {
        return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) };
    }
    // Coba format "lat,lng" biasa
    const parts = locationStr.split(',');
    if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return null;
},
    
    openMaps(location) {
    if (!location) return;
    const coords = location.match(/-?\d+\.\d+/g);
    if (coords && coords.length >= 2) {
        window.open(`https://www.google.com/maps?q=${coords[0]},${coords[1]}`, '_blank');
    }
},

viewAttendanceDetail(id) {
    const row = this.rawAttendance.find(r => String(r.id) === String(id));
    if (!row) return;
    const emp = this.rawEmployees.find(e => String(e.id) === String(row.userId));
    alert(`Detail Absensi\n\nKaryawan: ${emp?.name || '-'}\nTanggal: ${row.date}\nShift: ${row.shift || '-'}\nMasuk: ${row.clockIn || '-'}\nIstirahat: ${row.breakStart || '-'}\nKembali: ${row.breakEnd || '-'}\nPulang: ${row.clockOut || '-'}\nStatus: ${row.status || '-'}`);
},
    
    renderJurnalReports() {
        const tbody = document.getElementById('jurnal-reports-body');
        if (!tbody) return;

        const data = this.getFilteredJurnal();

        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${row.date}</td>
                <td>${row.name}</td>
                <td>${row.department}</td>
                <td>${row.tasks.substring(0, 30)}${row.tasks.length > 30 ? '...' : ''}</td>
                <td>
                    ${row.photo ?
                `<img src="${row.photo}" class="jurnal-thumbnail" onclick="adminReports.viewPhoto('${row.photo}')" title="Klik untuk melihat">` :
                '<span class="no-photo-cell">-</span>'
            }
                </td>
                <td>
                    <span class="status-badge ${row.status}">
                        ${row.status === 'filled' ? 'Terisi' : 'Kosong'}
                    </span>
                </td>
                <td>
                    <button class="btn-action view" onclick="adminReports.viewJurnalDetail('${row.name}', '${row.date}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    renderLeaveReports() {
    const tbody = document.getElementById('leave-reports-body');
    if (!tbody) return;

    const data = this.getFilteredLeave();
    const statusLabels = {
        'pending': 'Menunggu',
        'approved': 'Disetujui',
        'rejected': 'Ditolak'
    };

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(row => {
        const quota = (this.leaveQuota || {})[String(row.userId)];
        const sisaHtml = quota != null
            ? `<span style="font-weight:600;color:${quota.sisa <= 0 ? '#EF4444' : quota.sisa <= 3 ? '#F59E0B' : '#10B981'};">${quota.sisa} hari</span>`
            : '-';
        return `
        <tr>
            <td>${row.name}</td>
            <td>${row.department}</td>
            <td>${row.type}</td>
            <td>${row.dates}</td>
            <td>${row.duration !== '-' ? row.duration + ' hari' : '-'}</td>
            <td>${row.reason}</td>
            <td style="text-align:center;">${sisaHtml}</td>
            <td>
                <span class="status-badge ${row.status}">
                    ${statusLabels[row.status] || row.status}
                </span>
            </td>
            <td style="white-space:nowrap;">
                <button class="btn-action view" onclick="adminReports.viewLeaveDetail('${row.name}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${row.status === 'pending' ? `
                    <button class="btn-action" style="background:#10B981;color:#fff;" title="Setuju" onclick="adminReports.approveLeaveOrIzin('${row.kind}', '${row.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn-action" style="background:#EF4444;color:#fff;" title="Tolak" onclick="adminReports.rejectLeaveOrIzin('${row.kind}', '${row.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            </td>
        </tr>`;
    }).join('');
},

    async approveLeaveOrIzin(kind, id) {
        if (!confirm('Setujui pengajuan ini?')) return;
        try {
            const result = kind === 'leave' ? await api.approveLeave(id) : await api.approveIzin(id);
            if (result.success) {
                toast.success('Pengajuan disetujui');
                await this.loadData();
                this.renderLeaveReports();
            } else {
                toast.error(result.error || 'Gagal menyetujui pengajuan');
            }
        } catch (e) {
            console.error('Error approve:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    async rejectLeaveOrIzin(kind, id) {
        if (!confirm('Tolak pengajuan ini?')) return;
        try {
            const result = kind === 'leave' ? await api.rejectLeave(id) : await api.rejectIzin(id);
            if (result.success) {
                toast.success('Pengajuan ditolak');
                await this.loadData();
                this.renderLeaveReports();
            } else {
                toast.error(result.error || 'Gagal menolak pengajuan');
            }
        } catch (e) {
            console.error('Error reject:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    exportToExcel(type) {
        let data = [];
        let filename = '';

        switch (type) {
            case 'attendance':
                data = this.getFilteredAttendance();
                filename = 'Rekap_Absensi.csv';
                break;
            case 'jurnal':
                data = this.getFilteredJurnal();
                filename = 'Rekap_Jurnal.csv';
                break;
            case 'leave':
                data = this.getFilteredLeave();
                filename = 'Rekap_Cuti_Izin.csv';
                break;
        }

        // For demo, we'll export as CSV
        const csv = this.convertToCSV(data);
        this.downloadFile(csv, filename, 'text/csv');

        toast.success(`Data berhasil diexport ke ${filename}`);
    },

    convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const rows = data.map(row =>
            headers.map(header => {
                const val = row[header];
                return `"${val}"`;
            }).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
    },

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    printReport(type) {
    const titles = {
        attendance: 'Rekap Absensi Karyawan',
        jurnal: 'Rekap Jurnal Kerja',
        leave: 'Rekap Cuti & Izin'
    };

    const tableId = {
        attendance: 'attendance-reports-table',
        jurnal: 'jurnal-reports-table',
        leave: 'leave-reports-table'
    };

    const table = document.getElementById(tableId[type]);
    if (!table) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${titles[type]}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
                h2 { text-align: center; margin-bottom: 4px; }
                p { text-align: center; color: #666; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: middle; }
                th { background: #f59e0b; color: white; font-weight: 600; }
                tr:nth-child(even) { background: #f9f9f9; }
                .badge-status { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
                .badge-status.success { background: #d1fae5; color: #065f46; }
                .badge-status.warning { background: #fef3c7; color: #92400e; }
                img { display: none; }
                button { display: none; }
                @media print { button { display: none !important; } }
            </style>
        </head>
        <body>
            <h2>PT. Tirta Agung Amuntai</h2>
            <p>${titles[type]} — Dicetak: ${new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</p>
            ${table.outerHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
},

    viewDetail(name) {
        toast.info(`Detail untuk ${name} akan ditampilkan`);
    },

    viewJurnalDetail(name, date) {
        const jurnal = this.jurnalData.find(j => j.name === name && j.date === date);
        if (!jurnal) {
            toast.error('Data jurnal tidak ditemukan');
            return;
        }

        const photoHtml = jurnal.photo ? `
            <div class="detail-photo-section">
                <label>Foto Lampiran:</label>
                <img src="${jurnal.photo}" alt="Foto jurnal" class="jurnal-photo-preview" onclick="window.open('${jurnal.photo}', '_blank')">
            </div>
        ` : '<div class="detail-photo-section"><label>Foto Lampiran:</label><p class="no-photo">Tidak ada foto</p></div>';

        const content = `
            <div class="jurnal-detail-content">
                <div class="detail-row">
                    <label>Nama:</label>
                    <p>${jurnal.name}</p>
                </div>
                <div class="detail-row">
                    <label>Departemen:</label>
                    <p>${jurnal.department}</p>
                </div>
                <div class="detail-row">
                    <label>Tanggal:</label>
                    <p>${dateTime.formatDate(new Date(jurnal.date), 'long')}</p>
                </div>
                <div class="detail-section">
                    <label>Tugas:</label>
                    <p>${jurnal.tasks.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="detail-section">
                    <label>Pencapaian:</label>
                    <p>${jurnal.achievements.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="detail-section">
                    <label>Kendala:</label>
                    <p>${jurnal.obstacles.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="detail-section">
                    <label>Rencana:</label>
                    <p>${jurnal.plan.replace(/\n/g, '<br>')}</p>
                </div>
                ${photoHtml}
            </div>
        `;

        modal.show('Detail Jurnal', content, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }
        ]);
    },

    viewPhoto(photoUrl) {
        if (!photoUrl) return;

        const content = `
            <div class="photo-viewer-modal">
                <img src="${photoUrl}" alt="Foto jurnal" class="full-photo">
            </div>
        `;

        modal.show('Foto Lampiran', content, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Buka di Tab Baru', class: 'btn-primary', onClick: () => window.open(photoUrl, '_blank') }
        ]);
    },

    viewLeaveDetail(name) {
        toast.info(`Detail cuti/izin ${name}`);
    }
};

// Global init functions
window.initAttendanceReports = () => {
    adminReports.initAttendanceReports();
};

window.initJurnalReports = () => {
    adminReports.initJurnalReports();
};

window.initLeaveReports = () => {
    adminReports.initLeaveReports();
};

// Expose
window.adminReports = adminReports;
