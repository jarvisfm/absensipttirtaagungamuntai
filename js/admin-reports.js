/**
 * Portal Karyawan - Admin Reports
 * Reports and exports for admin
 */

const adminReports = {
    attendanceData: [],
    jurnalData: [],
    leaveData: [],
    leaveQuota: {},
    filters: {
        attendance: { month: '', name: '', bagian: '' },
        jurnal: { month: '', employee: '', status: '' },
        leave: { month: '', type: '', status: '', bagian: '' }
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
        if (!auth.isApprover()) {
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

        const [empResult, jurnalResult, leaveResult, izinResult, attResult, oorResult] = await Promise.allSettled([
            api.getEmployees(),
            api.getAllJournals(),
            api.getAllLeaves(),
            api.getAllIzin(),
            api.getAllAttendance(),
            api.getAllOutOfRadiusReports()
        ]);

        const pick = (settled, label) => {
            if (settled.status === 'fulfilled' && settled.value && settled.value.success !== false) {
                return settled.value.data || [];
            }
            console.error(`Gagal memuat ${label}:`, settled.reason || settled.value?.error);
            return [];
        };

        employees = pick(empResult, 'employees');
        jurnals = pick(jurnalResult, 'jurnals');
        leaves = pick(leaveResult, 'leaves');
        izinList = pick(izinResult, 'izin');
        attendances = pick(attResult, 'attendance');

        // Lookup laporan luar-radius per userId+date+type, dipakai
        // renderAttendanceReports() untuk menandai jam yang bersangkutan
        // dengan "(Luar Radius + Catatan)".
        const oorReports = pick(oorResult, 'laporan luar radius');
        this.outOfRadiusMap = {};
        oorReports.forEach(r => {
            const key = `${r.userId}|${r.date}|${r.type}`;
            this.outOfRadiusMap[key] = r;
        });

        // Fallback ke localStorage hanya untuk bagian yang benar-benar kosong/gagal
        if (employees.length === 0) employees = storage.get('admin_employees', []);
        if (attendances.length === 0) attendances = storage.get('attendance', []);

        this.rawAttendance = attendances;
        this.rawEmployees = employees;

        this.attendanceData = employees.map(emp => {
            const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
            let present = 0;
            let late = 0;
            empAtt.forEach(a => {
                if (a.clockIn) {
                    present++;
                    if (a.status && a.status.toLowerCase() === 'terlambat') late++;
                }
            });
            const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = izinList.filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');
            let leaveDays = 0;
            empLeaves.forEach(l => leaveDays += parseInt(l.duration) || 1);
            empIzin.forEach(i => leaveDays += parseInt(i.duration) || 1);
            return {
                name: emp.name,
                department: emp.department,
                present,
                late,
                absent: leaveDays,
                total: present + leaveDays
            };
        });

        const currentUser = auth.getCurrentUser();

        this.jurnalData = jurnals.map(j => {
            let emp = employees.find(e => e.id === j.userId);
            if (!emp && currentUser) emp = { name: currentUser.name, department: currentUser.department || '-' };
            if (!emp) emp = { name: 'Karyawan', department: '-' };
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

        this.rawLeaves = uniqueLeaves;

        this.leaveData = [
            ...uniqueLeaves.map(l => {
                let emp = employees.find(e => String(e.id) === String(l.userId));
                if (!emp && currentUser && String(currentUser.id) === String(l.userId))
                    emp = { name: currentUser.name, department: currentUser.department || '-' };
                if (!emp) emp = { name: l.userId || 'Karyawan', department: '-' };
                return {
                    id: l.id,
                    kind: 'leave',
                    userId: l.userId,
                    name: emp.name || emp.nama || l.userId,
                    department: emp.department || emp.unitKerja || '-',
                    bagian: emp.bagian || '-',
                    position: emp.position || emp.jabatan || '-',
                    type: l.type === 'annual' ? 'Cuti Tahunan'
                        : l.type === 'important' ? 'Cuti Alasan Penting'
                        : l.type === 'sick' ? 'Cuti Sakit'
                        : l.type === 'besar' ? 'Cuti Besar'
                        : l.type === 'maternity' ? 'Cuti Melahirkan'
                        : l.type === 'other' ? 'Keterangan Lain-lain'
                        : (l.typeLabel || l.type || 'Cuti'),
                    rawType: l.type || '',
                    dates: l.startDate && l.endDate
                        ? (l.startDate === l.endDate
                            ? dateTime.formatDate(l.startDate, 'dmy')
                            : `${dateTime.formatDate(l.startDate, 'dmy')} - ${dateTime.formatDate(l.endDate, 'dmy')}`)
                        : (l.startDate ? dateTime.formatDate(l.startDate, 'dmy') : '-'),
                    duration: l.duration != null ? l.duration : '-',
                    reason: l.reason || l.alasan || '-',
                    status: l.status || 'pending',
                    startDate: l.startDate || ''
                };
            }),
            ...uniqueIzin.map(i => {
                let emp = employees.find(e => String(e.id) === String(i.userId));
                if (!emp && currentUser && String(currentUser.id) === String(i.userId))
                    emp = { name: currentUser.name, department: currentUser.department || '-' };
                if (!emp) emp = { name: i.userId || 'Karyawan', department: '-' };
                return {
                    id: i.id,
                    kind: 'izin',
                    userId: i.userId,
                    name: emp.name || emp.nama || i.userId,
                    department: emp.department || emp.unitKerja || '-',
                    bagian: emp.bagian || '-',
                    position: emp.position || emp.jabatan || '-',
                    rawType: i.type || '',
                    type: i.type === 'sick' ? 'Sakit'
                        : i.type === 'permission' ? 'Izin Penting'
                        : i.type === 'emergency' ? 'Keadaan Darurat'
                        : i.type === 'keluar_kantor' ? 'Izin Keluar Kantor'
                        : i.type === 'izin_harian' ? 'Izin Harian'
                        : (i.typeLabel || 'Izin'),
                    dates: i.date ? dateTime.formatDate(i.date, 'dmy') : '-',
                    duration: i.type === 'keluar_kantor'
                        ? this.hitungDurasiJam(i.jamKeluar, i.jamMasuk)
                        : (i.duration != null ? i.duration : '-'),
                    jamKeluar: i.jamKeluar || '',
                    jamMasuk: i.jamMasuk || '',
                    hasAttachment: i.hasAttachment === true || i.hasAttachment === 'true' || i.hasAttachment === 'TRUE',
                    fileUrl: i.fileUrl || '',
                    reason: i.reason || i.alasan || '-',
                    status: i.status || 'pending',
                    startDate: i.date || '',
                    dateEnd: i.dateEnd || '',
                    asmenId:        i.asmenId        || '',
                    asmenName:      i.asmenName      || '',
                    asmenNik:       i.asmenNik       || '',
                    asmenNote:      i.asmenNote      || '',
                    managerName:    i.managerName    || '',
                    managerNik:     i.managerNik     || '',
                    managerNote:    i.managerNote    || '',
                    hrManagerName:  i.hrManagerName  || '',
                    hrManagerNik:   i.hrManagerNik   || '',
                    hrManagerNote:  i.hrManagerNote  || '',
                    directorName:   i.directorName   || '',
                    directorNik:    i.directorNik    || '',
                    directorNote:   i.directorNote   || ''
                };
            })
        ];

        // Hitung kuota cuti tahunan per karyawan (12 hari/tahun). Terpakai
        // dihitung dari status 'approved' (disetujui final Direktur) saja.
        // (Samakan dengan _hitungSisaCutiTahunan di Leave.gs backend)
        const KUOTA_CUTI = 12;
        const tahunIni = new Date().getFullYear();
        this.leaveQuota = {};

        // Notif "kuota cuti tahunan habis" hanya perlu ditampilkan SEKALI per
        // sesi (bukan setiap kali halaman Rekap Cuti & Izin dibuka/refresh),
        // supaya tidak berulang-ulang muncul. Dicatat per karyawan+tahun di
        // sessionStorage supaya kalau login lagi (sesi baru) bisa muncul lagi.
        let warnedSet = new Set();
        try {
            warnedSet = new Set(JSON.parse(sessionStorage.getItem('leaveQuotaWarned') || '[]'));
        } catch (e) {
            warnedSet = new Set();
        }

        employees.forEach(emp => {
            const cutiTahunanTerpakai = uniqueLeaves.filter(l =>
                String(l.userId) === String(emp.id) &&
                l.status === 'approved' &&
                l.type === 'annual' &&
                (l.startDate || '').startsWith(String(tahunIni))
            );
            const totalPakai = cutiTahunanTerpakai.reduce((sum, l) => sum + (parseInt(l.duration) || 0), 0);
            const sisa = KUOTA_CUTI - totalPakai;
            this.leaveQuota[String(emp.id)] = { pakai: totalPakai, sisa: Math.max(0, sisa) };
            if (totalPakai >= KUOTA_CUTI) {
                const warnKey = `${emp.id}-${tahunIni}`;
                if (!warnedSet.has(warnKey)) {
                    const nama = emp.name || emp.nama || 'Karyawan';
                    toast.warning(`⚠️ Kuota cuti tahunan ${nama} sudah habis tahun ini!`);
                    warnedSet.add(warnKey);
                }
            }
        });

        try {
            sessionStorage.setItem('leaveQuotaWarned', JSON.stringify([...warnedSet]));
        } catch (e) { /* abaikan kalau sessionStorage penuh/tidak tersedia */ }
    },

    /**
     * Hitung durasi antara jamKeluar & jamMasuk (format "HH:MM") menjadi teks "X jam Y menit".
     * Khusus dipakai untuk Surat Izin Keluar Kantor.
     */
    hitungDurasiJam(jamKeluar, jamMasuk) {
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
    },

    populateEmployeeFilter() {
        const employees = storage.get('admin_employees', []);
        const select = document.getElementById('jurnal-employee-filter');
        if (select) {
            select.innerHTML = '<option value="">Semua Karyawan</option>' +
                employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('');
        }
    },

    bindAttendanceEvents() {
        // PENTING: fungsi ini terpanggil lagi setiap kali halaman Rekap
        // Absensi dibuka (bukan cuma sekali), padahal tombol-tombolnya
        // adalah elemen statis yang sama (tidak dibuat ulang oleh router).
        // Tanpa guard ini, listener numpuk tiap kali halaman dibuka lagi,
        // jadi 1 klik bisa memicu export/print berkali-kali sekaligus -
        // sama persis seperti bug notifikasi kemarin.
        if (this._attendanceListenersAttached) return;
        this._attendanceListenersAttached = true;

        const exportBtn = document.getElementById('btn-export-attendance');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportToExcel('attendance'));

        const printBtn = document.getElementById('btn-print-attendance');
        if (printBtn) printBtn.addEventListener('click', () => this.printReport('attendance'));

        const nameFilter = document.getElementById('attendance-name-filter');
        if (nameFilter) nameFilter.addEventListener('input', (e) => {
            this.filters.attendance.name = e.target.value.trim();
            this.renderAttendanceReports();
        });

        const monthFilter = document.getElementById('attendance-month-filter');
        if (monthFilter) {
            // Default ke bulan berjalan, supaya data yang tampil pertama kali
            // adalah rekap bulan ini (bukan seluruh histori sekaligus).
            const now = new Date();
            const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            monthFilter.value = currentYearMonth;
            this.filters.attendance.month = currentYearMonth;

            monthFilter.addEventListener('change', (e) => {
                this.filters.attendance.month = e.target.value;
                this.renderAttendanceReports();
            });
        }

        const bagianFilter = document.getElementById('attendance-bagian-filter');
        if (bagianFilter) {
            // Isi opsi "Bagian" secara dinamis dari data karyawan yang ada,
            // sama seperti di Rekap Cuti & Izin.
            const existingValues = Array.from(bagianFilter.options).map(o => o.value);
            const uniqueBagian = [...new Set((this.rawEmployees || [])
                .map(e => e.bagian)
                .filter(b => b && b.trim()))].sort();
            uniqueBagian.forEach(b => {
                if (!existingValues.includes(b)) {
                    const opt = document.createElement('option');
                    opt.value = b;
                    opt.textContent = b;
                    bagianFilter.appendChild(opt);
                }
            });

            bagianFilter.addEventListener('change', (e) => {
                this.filters.attendance.bagian = e.target.value;
                this.renderAttendanceReports();
            });
        }
    },

    bindJurnalEvents() {
        // Sama seperti bindAttendanceEvents() - cegah listener numpuk.
        if (this._jurnalListenersAttached) return;
        this._jurnalListenersAttached = true;

        const exportBtn = document.getElementById('btn-export-jurnal');
        const printBtn = document.getElementById('btn-print-jurnal');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportToExcel('jurnal'));
        if (printBtn) printBtn.addEventListener('click', () => this.printReport('jurnal'));

        const monthFilter = document.getElementById('jurnal-month');
        if (monthFilter) monthFilter.addEventListener('change', (e) => {
            this.filters.jurnal.month = e.target.value;
            this.renderJurnalReports();
        });

        const empFilter = document.getElementById('jurnal-employee-filter');
        if (empFilter) empFilter.addEventListener('change', (e) => {
            this.filters.jurnal.employee = e.target.value;
            this.renderJurnalReports();
        });

        const statusFilter = document.getElementById('jurnal-status-filter');
        if (statusFilter) statusFilter.addEventListener('change', (e) => {
            this.filters.jurnal.status = e.target.value;
            this.renderJurnalReports();
        });
    },

    bindLeaveEvents() {
        // Sama seperti bindAttendanceEvents() - cegah listener numpuk.
        if (this._leaveListenersAttached) return;
        this._leaveListenersAttached = true;

        const exportBtn = document.getElementById('btn-export-leave');
        const printBtn = document.getElementById('btn-print-leave');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportToExcel('leave'));
        if (printBtn) printBtn.addEventListener('click', () => this.printReport('leave'));

        const monthFilter = document.getElementById('leave-month');
        if (monthFilter) {
            // Default ke BULAN BERJALAN (dinamis), sebelumnya hardcode
            // "2026-03" (Maret) di HTML jadi ketinggalan terus tiap bulan.
            const now = new Date();
            const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            monthFilter.value = currentYearMonth;
            this.filters.leave.month = currentYearMonth;

            monthFilter.addEventListener('change', (e) => {
                this.filters.leave.month = e.target.value;
                this.renderLeaveReports();
            });
        }

        const typeFilter = document.getElementById('leave-type-filter');
        if (typeFilter) typeFilter.addEventListener('change', (e) => {
            this.filters.leave.type = e.target.value;
            this.renderLeaveReports();
        });

        const statusFilter = document.getElementById('leave-status-filter');
        if (statusFilter) statusFilter.addEventListener('change', (e) => {
            this.filters.leave.status = e.target.value;
            this.renderLeaveReports();
        });

        const bagianFilter = document.getElementById('leave-bagian-filter');
        if (bagianFilter) {
            // Isi opsi "Bagian" secara dinamis dari data karyawan yang ada,
            // supaya selalu sinkron kalau daftar bagian berubah - tanpa
            // hardcode daftar bagian di sini.
            const existingValues = Array.from(bagianFilter.options).map(o => o.value);
            const uniqueBagian = [...new Set((this.rawEmployees || [])
                .map(e => e.bagian)
                .filter(b => b && b.trim()))].sort();
            uniqueBagian.forEach(b => {
                if (!existingValues.includes(b)) {
                    const opt = document.createElement('option');
                    opt.value = b;
                    opt.textContent = b;
                    bagianFilter.appendChild(opt);
                }
            });

            bagianFilter.addEventListener('change', (e) => {
                this.filters.leave.bagian = e.target.value;
                this.renderLeaveReports();
            });
        }
    },

    getFilteredAttendance() {
        const { month, name, bagian } = this.filters.attendance;
        return this.rawAttendance.filter(row => {
            const emp = this.rawEmployees.find(e => String(e.id) === String(row.userId));
            if (!emp) return false;
            const matchesBagian = !bagian || emp.bagian === bagian;
            const matchesName = !name || String(emp.name || '').toLowerCase().includes(name.toLowerCase());
            const matchesMonth = !month || (row.date && row.date.startsWith(month));
            return matchesBagian && matchesName && matchesMonth;
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
        const { month, type, status, bagian } = this.filters.leave;
        return this.leaveData.filter(row => {
            const matchesMonth = !month || (row.startDate && row.startDate.startsWith(month));
            const matchesType = !type ||
                (type === 'cuti' && row.type.toLowerCase().includes('cuti')) ||
                (type === 'izin' && row.kind === 'izin') ||
                (type === 'sakit' && row.type.toLowerCase().includes('sakit'));
            const matchesStatus = !status || row.status === status;
            const matchesBagian = !bagian || row.bagian === bagian;
            return matchesMonth && matchesType && matchesStatus && matchesBagian;
        });
    },

    renderAttendanceReports() {
        const container = document.getElementById('attendance-reports-body');
        if (!container) return;

        const { month, name, bagian } = this.filters.attendance;
        const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

        let employees = [...(this.rawEmployees || [])];
        if (bagian) employees = employees.filter(e => e.bagian === bagian);
        if (name) employees = employees.filter(e => String(e.name || '').toLowerCase().includes(name.toLowerCase()));
        employees.sort((a, b) => {
            const deptCompare = String(a.department || '').localeCompare(String(b.department || ''));
            if (deptCompare !== 0) return deptCompare;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        if (employees.length === 0) {
            container.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">Tidak ada data karyawan</td></tr>';
            return;
        }

        let html = '';
        employees.forEach(emp => {
            let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
            if (month) rows = rows.filter(r => r.date && r.date.startsWith(month));
            rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
            const color = colors[(emp.name || '').charCodeAt(0) % colors.length];
            // "Terlambat" tetap dihitung sebagai hadir (cuma telat absen masuk),
            // bukan status tandingan dari "Hadir" - makanya totalHadir mencakup
            // keduanya, dan totalTerlambat cuma breakdown info tambahan.
            const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHadir = rows.filter(r => ['hadir','ontime','terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHari = rows.length;

            html += `
                <tr class="employee-group-header" style="background:var(--bg-secondary,#f8f9fa);">
                    <td colspan="10" style="padding:12px 16px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">${initials}</div>
                                <div>
                                    <div style="font-weight:600;font-size:0.95rem;">${emp.name || '-'}</div>
                                    <div style="font-size:0.78rem;color:var(--text-muted);">${emp.department || '-'} — ${emp.bagian || '-'} — ${emp.position || '-'} — ${emp.shift || '-'}</div>
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
                html += `<tr><td colspan="10" style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;"><i class="fas fa-calendar-times" style="margin-right:6px;"></i>Tidak ada data absensi pada periode ini</td></tr>`;
            } else {
                rows.forEach(row => {
                    const [y, m, d] = (row.date || '').split('-');
                    const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';
                    const statusLower = String(row.status || '').toLowerCase();
                    let statusBadge = '<span class="badge-status">–</span>';
                    if (statusLower === 'hadir' || statusLower === 'ontime') statusBadge = '<span class="badge-status success">Hadir</span>';
                    else if (statusLower === 'terlambat' || statusLower === 'late') statusBadge = '<span class="badge-status warning">Hadir (Terlambat)</span>';
                    else if (statusLower === 'pending' || statusLower === 'waiting') statusBadge = '<span class="badge-status">Pending</span>';

                    const coords = this._parseLatLng(row.verificationLocation);
                    const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';
                    const lokasiHtml = coords
                        ? `<span id="loc-t-${row.id}" style="font-size:0.75rem;"><i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i><small style="color:var(--text-muted);">${coordLabel}</small></span>`
                        : '<span style="color:var(--text-muted)">–</span>';
                    const fotoHtml = row.verificationPhoto
                        ? `<img src="${row.verificationPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="adminReports.viewPhoto('${row.verificationPhoto}')">`
                        : '<span style="color:var(--text-muted)">–</span>';
                    const gpsHtml = coords
                        ? `<button style="background:#10b981;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;border:none;cursor:pointer;" onclick="adminReports.openMaps('${row.verificationLocation}')"><i class="fas fa-map-marker-alt"></i> GPS</button>`
                        : '<span style="color:var(--text-muted)">–</span>';

                    // Tandai jam yang tercatat di luar radius (Pekerja Lapangan).
                    // Dulu catatannya cuma muncul lewat hover (title attribute) -
                    // di HP/touchscreen hover tidak berfungsi, jadi sekarang
                    // badge-nya bisa DIKLIK/DITAP untuk menampilkan catatannya.
                    const oorBadge = (type) => {
                        const r = (this.outOfRadiusMap || {})[`${emp.id}|${row.date}|${type}`];
                        if (!r) return '';
                        return `<br><span onclick="adminReports.showOutOfRadiusNote('${emp.id}', '${row.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FEF3C7;color:#D97706;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-marker-alt"></i> Luar Radius${r.status === 'approved' ? ' ✓' : ''} <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
                    };

                    html += `
                        <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                            <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}</td>
                            <td style="padding:10px 12px;font-size:0.82rem;">${row.shift || '-'}</td>
                            <td style="padding:10px 12px;font-weight:600;color:#10b981;">${row.clockIn || '–'}${oorBadge('clockIn')}</td>
                            <td style="padding:10px 12px;color:var(--text-muted);">${row.breakStart || '–'}${oorBadge('breakStart')}</td>
                            <td style="padding:10px 12px;color:var(--text-muted);">${row.breakEnd || '–'}${oorBadge('breakEnd')}</td>
                            <td style="padding:10px 12px;font-weight:600;color:#EF4444;">${row.clockOut || '–'}${oorBadge('clockOut')}</td>
                            <td style="padding:10px 12px;font-size:0.75rem;max-width:160px;">${lokasiHtml}</td>
                            <td style="padding:10px 12px;">${statusBadge}</td>
                            <td style="padding:10px 12px;">${fotoHtml}</td>
                            <td style="padding:10px 12px;">${gpsHtml}</td>
                        </tr>
                    `;
                });
            }
            html += `<tr><td colspan="10" style="padding:8px;background:transparent;border:none;"></td></tr>`;
        });

        container.innerHTML = html;
        this.renderAttendanceMobileCards(employees, month, months);

        employees.forEach(emp => {
            let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
            if (month) rows = rows.filter(r => r.date && r.date.startsWith(month));
            rows.forEach(async (row) => {
                const coords = this._parseLatLng(row.verificationLocation);
                if (!coords) return;
                const address = await this._getAddressFromCoords(coords.lat, coords.lng);
                const elTable = document.getElementById(`loc-t-${row.id}`);
                const elCard = document.getElementById(`loc-m-${row.id}`);
                const html = address
                    ? `<span style="font-size:0.75rem;">${address}</span><br><small style="color:var(--text-muted);font-size:0.7rem;">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</small>`
                    : `<small style="color:var(--text-muted);">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</small>`;
                if (elTable) elTable.innerHTML = html;
                if (elCard) elCard.innerHTML = html;
            });
        });
    },

    renderAttendanceMobileCards(employees, month, months) {
        const container = document.getElementById('attendance-mobile-cards');
        if (!container) return;

        if (employees.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data karyawan</div>';
            return;
        }

        let html = '';
        employees.forEach(emp => {
            let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
            if (month) rows = rows.filter(r => r.date && r.date.startsWith(month));
            rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
            const color = colors[(emp.name || '').charCodeAt(0) % colors.length];
            // "Terlambat" tetap dihitung sebagai hadir (cuma telat absen masuk),
            // bukan status tandingan dari "Hadir" - makanya totalHadir mencakup
            // keduanya, dan totalTerlambat cuma breakdown info tambahan.
            const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHadir = rows.filter(r => ['hadir','ontime','terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHari = rows.length;

            html += `
                <div class="mobile-card" style="margin-bottom:16px;">
                    <div class="mobile-card-header" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">${initials}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:0.95rem;">${emp.name || '-'}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);">${emp.department || '-'} — ${emp.bagian || '-'} — ${emp.position || '-'}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;font-size:0.75rem;margin-bottom:10px;flex-wrap:wrap;">
                        <span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir: ${totalHadir}</span>
                        <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-weight:500;">Terlambat: ${totalTerlambat}</span>
                        <span style="background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:20px;font-weight:500;">Total: ${totalHari} hari</span>
                    </div>
            `;

            if (rows.length === 0) {
                html += `<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem;border-top:1px solid var(--border-color,#e5e7eb);"><i class="fas fa-calendar-times" style="margin-right:6px;"></i>Tidak ada data absensi pada periode ini</div>`;
            } else {
                rows.forEach(row => {
                    const [y, m, d] = (row.date || '').split('-');
                    const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';
                    const statusLower = String(row.status || '').toLowerCase();
                    let statusBadge = '<span class="badge-status">–</span>';
                    if (statusLower === 'hadir' || statusLower === 'ontime') statusBadge = '<span class="badge-status success">Hadir</span>';
                    else if (statusLower === 'terlambat' || statusLower === 'late') statusBadge = '<span class="badge-status warning">Hadir (Terlambat)</span>';
                    else if (statusLower === 'pending' || statusLower === 'waiting') statusBadge = '<span class="badge-status">Pending</span>';

                    const coords = this._parseLatLng(row.verificationLocation);
                    const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';
                    const lokasiHtml = coords
                        ? `<span id="loc-m-${row.id}" style="font-size:0.75rem;"><i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i><small style="color:var(--text-muted);">${coordLabel}</small></span>`
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
        if (latMatch && lngMatch) return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) };
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
        if (coords && coords.length >= 2) window.open(`https://www.google.com/maps?q=${coords[0]},${coords[1]}`, '_blank');
    },

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    showOutOfRadiusNote(userId, date, type) {
        const r = (this.outOfRadiusMap || {})[`${userId}|${date}|${type}`];
        if (!r) return;
        const statusText = r.status === 'approved' ? `Sudah ditinjau oleh ${r.approvedBy}` : 'Menunggu ditinjau';

        const modal = document.getElementById('modal-out-of-radius-view');
        if (!modal) {
            // Fallback kalau elemen modal tidak ada di halaman ini
            alert(`Catatan Absen Luar Radius\n\n${r.userName}\n\n"${r.note}"\n\n${statusText}`);
            return;
        }

        document.getElementById('oorn-user-name').textContent = r.userName || '';
        document.getElementById('oorn-note-text').textContent = `"${r.note || ''}"`;
        document.getElementById('oorn-status-text').textContent = statusText;
        modal.style.display = 'flex';
    },

    closeOutOfRadiusNote() {
        const modal = document.getElementById('modal-out-of-radius-view');
        if (modal) modal.style.display = 'none';
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
                    ${row.photo
                        ? `<img src="${row.photo}" class="jurnal-thumbnail" onclick="adminReports.viewPhoto('${row.photo}')" title="Klik untuk melihat">`
                        : '<span class="no-photo-cell">-</span>'
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

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</td></tr>';
            this.renderLeaveMobileCards(data);
            return;
        }

        const statusLabels = { 'pending': 'Menunggu', 'manager_approved': 'Disetujui Manager', 'approved': 'Disetujui', 'rejected': 'Ditolak' };

        tbody.innerHTML = data.map(row => {
            const isKeluarKantor = row.kind === 'izin' && row.rawType === 'keluar_kantor';
            const durasiHtml = row.duration === '-' ? '-' : (isKeluarKantor ? row.duration : row.duration + ' hari');
            const needsAction = this._canActOnStage(row);

            return `
            <tr>
                <td>${row.name}</td>
                <td>${row.position}</td>
                <td>${row.type}</td>
                <td>${row.dates}</td>
                <td>${durasiHtml}</td>
                <td>${row.reason}</td>
                <td><span class="status-badge ${row.status}">${statusLabels[row.status] || row.status}</span></td>
                <td style="white-space:nowrap;">
                    <button class="btn-action view" onclick="adminReports.viewLeaveDetail('${row.kind}', '${row.id}')" title="${needsAction ? 'Tinjau & putuskan' : 'Lihat detail'}">
                        <i class="fas ${needsAction ? 'fa-stamp' : 'fa-eye'}"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        this.renderLeaveMobileCards(data);
    },

    // Versi kartu (mobile) dari Rekap Cuti & Izin. Sebelumnya container
    // #leave-mobile-cards tidak pernah diisi sama sekali, jadi di HP
    // (yang menyembunyikan tabel dan menampilkan .mobile-cards) datanya
    // terlihat kosong padahal di desktop tabelnya terisi.
    renderLeaveMobileCards(data) {
        const container = document.getElementById('leave-mobile-cards');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Tidak ada data</div>';
            return;
        }

        const statusLabels = { 'pending': 'Menunggu', 'manager_approved': 'Disetujui Manager', 'approved': 'Disetujui', 'rejected': 'Ditolak' };

        container.innerHTML = data.map(row => {
            const isKeluarKantor = row.kind === 'izin' && row.rawType === 'keluar_kantor';
            const durasiHtml = row.duration === '-' ? '-' : (isKeluarKantor ? row.duration : row.duration + ' hari');
            const needsAction = this._canActOnStage(row);

            return `
                <div class="mobile-card" style="margin-bottom:16px;" onclick="adminReports.viewLeaveDetail('${row.kind}', '${row.id}')">
                    <div class="mobile-card-header">
                        <span class="mobile-card-title">${row.name}</span>
                        <span class="status-badge ${row.status}">${statusLabels[row.status] || row.status}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Jabatan</span>
                        <span class="mobile-card-value">${row.position}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Jenis</span>
                        <span class="mobile-card-value">${row.type}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Tanggal</span>
                        <span class="mobile-card-value">${row.dates}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Durasi</span>
                        <span class="mobile-card-value">${durasiHtml}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Alasan</span>
                        <span class="mobile-card-value" style="text-align:right;max-width:60%;">${row.reason}</span>
                    </div>
                    <div style="text-align:right;margin-top:8px;">
                        <button class="btn-action view" onclick="event.stopPropagation();adminReports.viewLeaveDetail('${row.kind}', '${row.id}')" title="${needsAction ? 'Tinjau & putuskan' : 'Lihat detail'}">
                            <i class="fas ${needsAction ? 'fa-stamp' : 'fa-eye'}"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');
    },

    /**
     * ============================================================
     * RANTAI APPROVAL DINAMIS (Staf / Asmen / Manajer)
     * ------------------------------------------------------------
     * Catatan penting: field row.requesterRoleTier, row.status
     * ('menunggu_tahap1' dst) dan row.stageNApproverName/Decision/Note
     * adalah skema BARU yang perlu ditambahkan di backend (Izin.gs /
     * Leave.gs). Sebelum backend diupdate, kode di bawah otomatis
     * fallback ke skema lama (pending / manager_approved / approved)
     * supaya tampilan tidak error. Sekali backend sudah kirim field
     * baru itu, stepper & riwayat di bawah akan otomatis lengkap
     * tanpa perlu ubah UI lagi.
     */
    _approvalChainFor(row) {
        const chains = {
            staf:    [{ key: 'asmen',      label: 'Asmen bidang' },   { key: 'manajer',    label: 'Manajer bidang' }, { key: 'direktur', label: 'Direktur' }],
            asmen:   [{ key: 'manajer',    label: 'Manajer bidang' }, { key: 'manajer_uk', label: 'Manajer UK' },      { key: 'direktur', label: 'Direktur' }],
            manajer: [{ key: 'direktur',   label: 'Direktur' }]
        };
        const tier = (row.requesterRoleTier || this._guessTierFromPosition(row.position) || 'staf').toLowerCase();
        return chains[tier] || chains.staf;
    },

    _guessTierFromPosition(position) {
        const p = (position || '').toLowerCase();
        if (p.includes('asisten manajer') || p.includes('asmen')) return 'asmen';
        if (p.includes('manajer')) return 'manajer';
        return 'staf';
    },

    // Index tahap yang sedang berjalan (0-based). >= chain.length berarti sudah selesai.
    _currentStageIndex(row, chain) {
        if (row.status && row.status.indexOf('menunggu_tahap') === 0) {
            return parseInt(row.status.replace('menunggu_tahap', ''), 10) - 1;
        }
        if (row.status === 'selesai' || row.status === 'approved' || row.status === 'rejected') {
            return chain.length;
        }
        if (row.status === 'manager_approved') {
            return Math.max(chain.length - 1, 0);
        }
        return 0; // 'pending' / status lain / default
    },

    _isRowFinished(row) {
        return row.status === 'selesai' || row.status === 'approved' || row.status === 'rejected';
    },

    _finalDecisionLabel(row) {
        if (row.finalDecision === 'ditolak' || row.status === 'rejected') return { text: 'Ditolak', cls: 'selesai-ditolak' };
        if (row.finalDecision === 'disetujui' || row.status === 'approved') return { text: 'Disetujui', cls: 'selesai-disetujui' };
        return null;
    },

    // Badge ringkas untuk kolom status di tabel
    _stageBadgeHtml(row) {
        const chain = this._approvalChainFor(row);
        const finished = this._finalDecisionLabel(row);
        if (finished) {
            return `<span class="stage-badge ${finished.cls}">${finished.text}</span>`;
        }
        const idx = Math.min(this._currentStageIndex(row, chain), chain.length - 1);
        const stage = chain[idx] || chain[0];
        return `<span class="stage-badge tahap-${idx + 1}">Tahap ${idx + 1} &middot; ${stage.label}</span>`;
    },

    // Stepper visual di dalam modal detail
    _renderStageStepper(row) {
        const chain = this._approvalChainFor(row);
        const finished = this._isRowFinished(row);
        const currentIdx = finished ? chain.length : this._currentStageIndex(row, chain);

        const steps = chain.map((stage, i) => {
            const state = i < currentIdx ? 'done' : (i === currentIdx ? 'current' : 'upcoming');
            const dotContent = state === 'done' ? '<i class="fas fa-check"></i>' : (i + 1);
            const connector = i < chain.length - 1
                ? `<div class="stage-connector ${i < currentIdx ? 'done' : ''}"></div>`
                : '';
            return `
                <div class="stage-row" style="flex:1;">
                    <div class="stage-step ${state === 'current' ? 'current' : ''}">
                        <div class="stage-dot ${state}">${dotContent}</div>
                        <span class="stage-label">${stage.label}</span>
                    </div>
                    ${connector}
                </div>`;
        }).join('');

        return `<div class="stage-stepper">${steps}</div>`;
    },

    // Riwayat catatan tiap tahap yang sudah lewat
    _renderApprovalHistory(row) {
        const chain = this._approvalChainFor(row);
        let items = chain.map((stage, i) => {
            const n = i + 1;
            const name = row[`stage${n}ApproverName`];
            const decision = row[`stage${n}Decision`];
            const note = row[`stage${n}Note`];
            if (!name && !decision) return '';
            const decisionLabel = decision === 'tolak' ? 'Tolak' : (decision === 'setuju' ? 'Setuju' : '');
            return `
                <div class="approval-history-item">
                    <div class="ah-top">
                        <span><span class="ah-role">${stage.label}</span><span class="ah-who"> &middot; ${name || '-'}</span></span>
                        ${decisionLabel ? `<span class="ah-decision ${decision}">${decisionLabel}</span>` : ''}
                    </div>
                    ${note ? `<div class="ah-note">&ldquo;${note}&rdquo;</div>` : ''}
                </div>`;
        }).filter(Boolean);

        // fallback skema lama (managerName / directorName tanpa catatan)
        if (!items.length) {
            if (row.managerName) items.push(`<div class="approval-history-item"><span class="ah-role">Manager</span><span class="ah-who"> &middot; ${row.managerName}</span></div>`);
            if (row.directorName) items.push(`<div class="approval-history-item"><span class="ah-role">Direktur</span><span class="ah-who"> &middot; ${row.directorName}</span></div>`);
        }

        return items.length ? `<div class="approval-history">${items.join('')}</div>` : '';
    },

    // Sementara pakai auth.isManager()/isAdmin() sampai backend kirim data
    // role+bidang approver per tahap untuk pencocokan yang presisi.
    // Halaman "Rekap Cuti & Izin" ini VIEW-ONLY (rekap saja). Approve/tolak
    // yang sebenarnya sekarang dilakukan lewat halaman khusus Approval Asmen /
    // Approval Manajer / Approval Direktur (lihat izin.js), yang sudah pakai
    // role 'asmen'/'manajer'/'direktur' - bukan 'manager'/'admin' seperti di
    // sini. Dibiarkan selalu false supaya tombol Setuju/Tolak tidak muncul lagi
    // di modal ini (menghindari admin approve dari tempat yang salah).
    _canActOnStage(row) {
        return false;
    },

    // Form catatan wajib + tombol Setuju/Tolak (dipakai di dalam modal detail)
    _renderApprovalActions(row) {
        if (!this._canActOnStage(row)) return '';
        const boxId = `approval-note-${row.kind}-${row.id}`;
        return `
            <div class="approval-note-box">
                <label>Catatan (wajib)</label>
                <textarea id="${boxId}" placeholder="Tulis catatan pertimbangan..."></textarea>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
                <button class="btn-action" style="flex:1;background:#EF4444;color:#fff;" onclick="adminReports.submitDecision('${row.kind}', '${row.id}', 'tolak')">
                    <i class="fas fa-times"></i> Tolak
                </button>
                <button class="btn-action" style="flex:1;background:#10B981;color:#fff;" onclick="adminReports.submitDecision('${row.kind}', '${row.id}', 'setuju')">
                    <i class="fas fa-check"></i> Setuju
                </button>
            </div>
        `;
    },

    async submitDecision(kind, id, decision) {
        const boxId = `approval-note-${kind}-${id}`;
        const noteEl = document.getElementById(boxId);
        const note = noteEl ? noteEl.value.trim() : '';

        if (!note) {
            toast.error('Catatan wajib diisi sebelum menyetujui atau menolak');
            if (noteEl) { noteEl.classList.add('input-error'); noteEl.focus(); }
            return;
        }

        if (!confirm(decision === 'setuju' ? 'Setujui pengajuan ini?' : 'Tolak pengajuan ini? Catatan tetap akan diteruskan ke tahap berikutnya.')) return;

        const user = auth.getCurrentUser();
        const approver = {
            id: user?.id,
            name: user?.name || '',
            nik: user?.nik || '',
            role: auth.isManager() ? 'manager' : 'admin',
            // Field berikut (decision, note) dikirim untuk backend skema baru.
            // Backend saat ini mungkin belum membacanya — lihat catatan di atas.
            decision,
            note
        };

        try {
            const call = decision === 'tolak'
                ? (kind === 'leave' ? api.rejectLeave(id, approver) : api.rejectIzin(id, approver))
                : (kind === 'leave' ? api.approveLeave(id, approver) : api.approveIzin(id, approver));
            const result = await call;

            if (result.success) {
                toast.success(decision === 'setuju' ? 'Catatan persetujuan tersimpan' : 'Catatan penolakan tersimpan, diteruskan ke tahap berikutnya');
                document.getElementById('modal-detail-leave') && (document.getElementById('modal-detail-leave').style.display = 'none');
                await this.loadData();
                this.renderLeaveReports();
            } else {
                toast.error(result.error || 'Gagal menyimpan keputusan');
            }
        } catch (e) {
            console.error('Error submitDecision:', e);
            toast.error('Terjadi kesalahan');
        }
    },

    exportToExcel(type) {
        let data = [];
        let filename = '';
        switch (type) {
            case 'attendance': data = this.getFilteredAttendance(); filename = 'Rekap_Absensi.csv'; break;
            case 'jurnal': data = this.getFilteredJurnal(); filename = 'Rekap_Jurnal.csv'; break;
            case 'leave': data = this.getFilteredLeave(); filename = 'Rekap_Cuti_Izin.csv'; break;
        }
        const csv = this.convertToCSV(data);
        this.downloadFile(csv, filename, 'text/csv');
        toast.success(`Data berhasil diexport ke ${filename}`);
    },

    convertToCSV(data) {
        if (data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const rows = data.map(row => headers.map(h => `"${row[h]}"`).join(','));
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
        const titles = { attendance: 'Rekap Absensi Karyawan', jurnal: 'Rekap Jurnal Kerja', leave: 'Rekap Cuti & Izin' };
        const tableId = { attendance: 'attendance-reports-table', jurnal: 'jurnal-reports-table', leave: 'leave-reports-table' };
        const table = document.getElementById(tableId[type]);
        if (!table) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html><html><head>
            <title>${titles[type]}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
                h2 { text-align: center; margin-bottom: 4px; }
                p { text-align: center; color: #666; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: middle; }
                th { background: #f59e0b; color: white; font-weight: 600; }
                tr:nth-child(even) { background: #f9f9f9; }
                img { display: none; } button { display: none; }
            </style>
            </head><body>
            <h2>PT. Tirta Agung Amuntai</h2>
            <p>${titles[type]} — Dicetak: ${new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</p>
            ${table.outerHTML}
            </body></html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    },

    viewJurnalDetail(name, date) {
        const jurnal = this.jurnalData.find(j => j.name === name && j.date === date);
        if (!jurnal) { toast.error('Data jurnal tidak ditemukan'); return; }
        const photoHtml = jurnal.photo
            ? `<div class="detail-photo-section"><label>Foto Lampiran:</label><img src="${jurnal.photo}" alt="Foto jurnal" class="jurnal-photo-preview" onclick="window.open('${jurnal.photo}', '_blank')"></div>`
            : '<div class="detail-photo-section"><label>Foto Lampiran:</label><p class="no-photo">Tidak ada foto</p></div>';
        const content = `
            <div class="jurnal-detail-content">
                <div class="detail-row"><label>Nama:</label><p>${jurnal.name}</p></div>
                <div class="detail-row"><label>Departemen:</label><p>${jurnal.department}</p></div>
                <div class="detail-row"><label>Tanggal:</label><p>${dateTime.formatDate(new Date(jurnal.date), 'long')}</p></div>
                <div class="detail-section"><label>Tugas:</label><p>${jurnal.tasks.replace(/\n/g, '<br>')}</p></div>
                <div class="detail-section"><label>Pencapaian:</label><p>${jurnal.achievements.replace(/\n/g, '<br>')}</p></div>
                <div class="detail-section"><label>Kendala:</label><p>${jurnal.obstacles.replace(/\n/g, '<br>')}</p></div>
                <div class="detail-section"><label>Rencana:</label><p>${jurnal.plan.replace(/\n/g, '<br>')}</p></div>
                ${photoHtml}
            </div>`;
        modal.show('Detail Jurnal', content, [{ label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }]);
    },

    viewPhoto(photoUrl) {
        if (!photoUrl) return;
        const content = `<div class="photo-viewer-modal"><img src="${photoUrl}" alt="Foto" class="full-photo"></div>`;
        modal.show('Foto Lampiran', content, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Buka di Tab Baru', class: 'btn-primary', onClick: () => window.open(photoUrl, '_blank') }
        ]);
    },

    viewLeaveDetail(kind, id) {
        const row = this.leaveData.find(r => r.kind === kind && String(r.id) === String(id));
        if (!row) { toast.error('Data tidak ditemukan'); return; }

        const isKeluarKantor = row.kind === 'izin' && row.rawType === 'keluar_kantor';

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

        const jamHtml = isKeluarKantor ? `
            <div style="display:flex;gap:12px;margin:14px 0;">
                <div style="flex:1;background:var(--color-gray-50);border-radius:10px;padding:12px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;">Jam Keluar</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--color-primary);margin-top:4px;">${row.jamKeluar || '-'}</div>
                </div>
                <div style="flex:1;background:var(--color-gray-50);border-radius:10px;padding:12px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;">Jam Masuk</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--color-primary);margin-top:4px;">${row.jamMasuk || '-'}</div>
                </div>
                <div style="flex:1;background:var(--color-gray-50);border-radius:10px;padding:12px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;">Durasi</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--color-primary);margin-top:4px;">${row.duration}</div>
                </div>
            </div>` : '';

        const attachmentHtml = row.kind === 'izin'
            ? (row.fileUrl
                ? `<a href="${row.fileUrl}" target="_blank" style="display:flex;align-items:center;gap:8px;background:rgba(16,185,129,0.1);color:#10B981;border-radius:8px;padding:10px 12px;font-size:0.85rem;font-weight:600;margin-top:12px;text-decoration:none;">
                        <i class="fas fa-file-import"></i> Lihat Surat Lampiran <i class="fas fa-external-link-alt" style="margin-left:auto;font-size:0.75rem;"></i>
                   </a>`
                : row.hasAttachment
                    ? `<div style="display:flex;align-items:center;gap:8px;background:rgba(245,158,11,0.1);color:#D97706;border-radius:8px;padding:10px 12px;font-size:0.85rem;font-weight:600;margin-top:12px;">
                            <i class="fas fa-paperclip"></i> Lampiran disertakan, namun berkas belum berhasil ter-upload
                       </div>`
                    : `<div style="display:flex;align-items:center;gap:8px;background:var(--color-gray-100);color:var(--text-muted);border-radius:8px;padding:10px 12px;font-size:0.85rem;margin-top:12px;">
                            <i class="fas fa-paperclip"></i> Tidak ada lampiran surat
                       </div>`)
            : '';

        const statusLabels = { 'pending': 'Menunggu', 'manager_approved': 'Disetujui Manager', 'approved': 'Disetujui', 'rejected': 'Ditolak' };
        const statusColors = { 'pending': '#F59E0B', 'manager_approved': '#3B82F6', 'approved': '#10B981', 'rejected': '#EF4444' };
        const statusColor = statusColors[row.status] || '#94A3B8';

        const content = `
            <div style="text-align:center;margin-bottom:1.25rem;">
                <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px;">
                    <i class="fas ${isKeluarKantor ? 'fa-door-open' : 'fa-file-alt'}"></i>
                </div>
                <h3 style="font-size:1.05rem;margin-bottom:4px;">${row.type}</h3>
                <span style="background:${statusColor}20;color:${statusColor};padding:4px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;">${statusLabels[row.status] || row.status}</span>
            </div>

            ${infoRow('fa-user', 'Nama Karyawan', row.name)}
            ${infoRow('fa-briefcase', 'Jabatan', row.position)}
            ${infoRow('fa-calendar-day', 'Tanggal Izin', row.dates)}
            ${!isKeluarKantor ? infoRow('fa-clock', 'Durasi', row.duration !== '-' ? row.duration + ' hari' : '-') : ''}

            ${jamHtml}

            <div style="margin-top:14px;">
                <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:6px;">Alasan</div>
                <div style="background:var(--color-gray-50);border-radius:10px;padding:12px 14px;font-size:0.88rem;color:var(--text-primary);line-height:1.5;">${row.reason}</div>
            </div>

            ${attachmentHtml}

            ${this._renderApprovalHistory(row)}

            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-color);">
                ${this._renderApprovalActions(row)}
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:${this._canActOnStage(row) ? '10px' : '0'};">
                    ${row.kind === 'izin' && (row.rawType === 'keluar_kantor' || row.rawType === 'izin_harian')
                        ? `<button class="btn-secondary" style="font-size:0.85rem;" onclick="adminReports.printIzinLetter('${row.kind}','${row.id}')"><i class="fas fa-print"></i> Cetak Surat</button>`
                        : ''}
                    ${row.kind === 'leave'
                        ? `<button class="btn-secondary" style="font-size:0.85rem;" onclick="adminReports.printCutiLetter('${row.id}')"><i class="fas fa-print"></i> Cetak Surat</button>`
                        : ''}
                    <button class="btn-secondary" style="font-size:0.85rem;" onclick="document.getElementById('modal-detail-leave').style.display='none'">Tutup</button>
                </div>
            </div>
        `;

        document.getElementById('detail-leave-content').innerHTML = content;
        document.getElementById('modal-detail-leave').style.display = 'flex';
    },

    // Cetak surat langsung dari modal detail admin. Karena yang login
    // di sini adalah admin (bukan si pemohon izin), data karyawan &
    // izin diteruskan manual ke printLetters lewat parameter override.
    printIzinLetter(kind, id) {
        const row = this.leaveData.find(r => r.kind === kind && String(r.id) === String(id));
        if (!row) { toast.error('Data tidak ditemukan'); return; }

        const empRaw = (this.rawEmployees || []).find(e => String(e.id) === String(row.userId)) || {};
        const emp = {
            name:        empRaw.name || empRaw.nama || row.name,
            nik:         empRaw.nik || '',
            jabatan:     empRaw.jabatan || row.position,
            pangkat:     empRaw.pangkat || '',
            golongan:    empRaw.golongan || '',
            unitKerja:   empRaw.unitKerja || row.department,
            unitWilayah: empRaw.unitWilayah || '',
            bagian:      empRaw.bagian || row.bagian || '',
            role:        empRaw.role || ''
        };
        const izinOverride = {
            date:         row.startDate || row.dates,
            dateEnd:      row.dateEnd || '',
            jamKeluar:    row.jamKeluar,
            jamMasuk:     row.jamMasuk,
            reason:       row.reason,
            duration:     row.duration,
            asmenName:    row.asmenName    || '',
            asmenNik:     row.asmenNik     || '',
            managerName:  row.managerName  || '',
            managerNik:   row.managerNik   || '',
            managerNote:  row.managerNote  || '',
            hrManagerName: row.hrManagerName || '',
            hrManagerNik:  row.hrManagerNik  || '',
            hrManagerNote: row.hrManagerNote || '',
            directorNote: row.directorNote || ''
        };

        if (row.rawType === 'keluar_kantor') {
            printLetters.openIzinKeluarKantor(row.id, emp, izinOverride);
        } else {
            printLetters.openIzinPermohonan(row.id, emp, izinOverride);
        }
    },

    // Cetak Formulir Cuti langsung dari modal detail admin. Sama seperti
    // printIzinLetter() di atas — data karyawan & cuti diteruskan manual
    // lewat parameter override karena yang login adalah admin.
    printCutiLetter(id) {
        const row = this.leaveData.find(r => r.kind === 'leave' && String(r.id) === String(id));
        if (!row) { toast.error('Data tidak ditemukan'); return; }

        const leaveRaw = (this.rawLeaves || []).find(l => String(l.id) === String(id)) || {};
        const empRaw = (this.rawEmployees || []).find(e => String(e.id) === String(row.userId)) || {};
        const emp = {
            name:        empRaw.name || empRaw.nama || row.name,
            nik:         empRaw.nik || '',
            jabatan:     empRaw.jabatan || row.position,
            pangkat:     empRaw.pangkat || '',
            golongan:    empRaw.golongan || '',
            unitKerja:   empRaw.unitKerja || row.department,
            unitWilayah: empRaw.unitWilayah || '',
            role:        empRaw.role || ''
        };
        const leaveOverride = {
            type:            leaveRaw.type         || '',
            suratNumber:     leaveRaw.suratNumber  || '',
            reason:          row.reason,
            duration:        row.duration,
            startDate:       leaveRaw.startDate    || row.startDate,
            endDate:         leaveRaw.endDate      || row.startDate,
            address:         leaveRaw.address      || '',
            phone:           leaveRaw.phone        || '',
            appliedAt:       leaveRaw.appliedAt    || '',
            bagian:          leaveRaw.bagian       || empRaw.bagian || '',
            status:          leaveRaw.status       || row.status || '',
            asmenName:       leaveRaw.asmenName    || '',
            asmenNik:        leaveRaw.asmenNik     || '',
            asmenNote:       leaveRaw.asmenNote    || '',
            managerName:     leaveRaw.managerName  || '',
            managerNik:      leaveRaw.managerNik   || '',
            managerNote:     leaveRaw.managerNote  || '',
            hrManagerName:   leaveRaw.hrManagerName|| '',
            hrManagerNik:    leaveRaw.hrManagerNik || '',
            hrManagerNote:   leaveRaw.hrManagerNote|| '',
            directorName:    leaveRaw.directorName || '',
            directorNik:     leaveRaw.directorNik  || '',
            directorNote:    leaveRaw.directorNote || '',
            tundaSampai:     leaveRaw.tundaSampai  || ''
        };

        printLetters.openCuti(row.id, emp, leaveOverride);
    }
};

window.initAttendanceReports = () => adminReports.initAttendanceReports();
window.initJurnalReports = () => adminReports.initJurnalReports();
window.initLeaveReports = () => adminReports.initLeaveReports();
window.adminReports = adminReports;
