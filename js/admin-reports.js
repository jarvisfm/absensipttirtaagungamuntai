/**
 * Portal Karyawan - Admin Reports
 * Reports and exports for admin
 */

const adminReports = {
    attendanceData: [],
    jurnalData: [],
    leaveData: [],
    leaveQuota: {},
    izinHarianQuota: {},
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

        const [empResult, jurnalResult, leaveResult, izinResult, attResult, oorResult, oowResult, settingsResult] = await Promise.allSettled([
            api.getEmployees(),
            api.getAllJournals(),
            api.getAllLeaves(),
            api.getAllIzin(),
            api.getAllAttendance(),
            api.getAllOutOfRadiusReports(),
            api.getAllOutOfWilayahReports(),
            api.getSettings()
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

        // Lookup laporan luar-wilayah per userId+date+type - sama polanya
        // dengan outOfRadiusMap di atas, dipakai untuk badge "Luar Unit
        // Wilayah" di renderAttendanceReports().
        const oowReports = pick(oowResult, 'laporan luar wilayah');
        this.outOfWilayahMap = {};
        oowReports.forEach(r => {
            const key = `${r.userId}|${r.date}|${r.type}`;
            this.outOfWilayahMap[key] = r;
        });

        // Daftar lokasi kantor (Kantor Pusat, Unit SPAM, dsb) - dipakai
        // sessionGps() untuk mencocokkan titik GPS tiap sesi absen (Masuk/
        // Istirahat/Kembali/Pulang) ke NAMA lokasi terdekat (mis. "BNA
        // Amuntai", "SPAM Alabio"), bukan cuma pin GPS mentah. Sama seperti
        // fallback yang dipakai settings.js/face-recognition.js - kalau
        // "office_locations" belum diisi, coba field lama office_lat/lng
        // (1 lokasi saja).
        const settingsData = (settingsResult.status === 'fulfilled' && settingsResult.value && settingsResult.value.data) || {};
        this.officeLocations = [];
        if (settingsData.office_locations) {
            try {
                const parsed = JSON.parse(settingsData.office_locations);
                if (Array.isArray(parsed)) this.officeLocations = parsed;
            } catch (e) { /* JSON rusak, biarkan kosong */ }
        }
        if (this.officeLocations.length === 0 && settingsData.office_lat && settingsData.office_lng) {
            this.officeLocations = [{ nama: 'Kantor', lat: settingsData.office_lat, lng: settingsData.office_lng }];
        }

        // Konfigurasi jam per Jenis Jadwal (lihat session-status.js) - dipakai
        // renderAttendanceReports()/renderAttendanceMobileCards() buat hitung
        // status PER SESI ("Hadir Tepat Waktu"/"Hadir Terlambat"), gantinya
        // kolom "Status" per hari yang sudah dihapus.
        // PERBAIKAN PERFORMA: oper settingsResult yang SUDAH diambil di
        // Promise.allSettled di atas, supaya getShiftTypesConfigFull() tidak
        // fetch ulang 'Settings' dari server (sebelumnya jadi 2x request
        // getSettings() terpisah tiap kali halaman ini dibuka pertama kali).
        this.shiftTypesConfigFull = await getShiftTypesConfigFull(
            settingsResult.status === 'fulfilled' ? settingsResult.value : null
        );

        // Fallback ke localStorage hanya untuk bagian yang benar-benar kosong/gagal
        if (employees.length === 0) employees = storage.get('admin_employees', []);
        if (attendances.length === 0) attendances = storage.get('attendance', []);

        this.rawAttendance = attendances;
        this.rawEmployees = employees;
        this.rawIzin = izinList;

        this.attendanceData = employees.map(emp => {
            const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
            let present = 0;
            let late = 0;
            empAtt.forEach(a => {
                // Kecualikan hari Izin/Cuti (yang otomatis "diisi" di
                // Attendance begitu disetujui - lihat _markAttendanceRangeAsExcused
                // di Attendance.gs) dari hitungan present - itu SUDAH
                // dihitung terpisah lewat leaveDays di bawah, supaya tidak
                // dobel dihitung present DAN cuti/izin sekaligus.
                const statusLower = String(a.status || '').toLowerCase();
                if (a.clockIn && statusLower !== 'izin' && statusLower !== 'cuti') {
                    present++;
                    if (statusLower === 'terlambat') late++;
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

        // Kuota "Permohonan Izin Harian" - 2 HARI per tahun per karyawan
        // (Samakan dengan _hitungKuotaIzinHarian di Leave.gs/Izin.gs backend
        // & _checkIzinHarianQuota di izin.js frontend - user tetap boleh
        // mengajukan Izin Harian melebihi kuota ini, TIDAK diblokir, cuma
        // ditandai di sini untuk ditinjau admin). Dihitung dari status
        // 'approved' saja & dijumlah dari field `duration` (hari), sama
        // seperti pola kuota Cuti Tahunan di bawah.
        const KUOTA_IZIN_HARIAN = 2;
        const tahunIniIzinHarian = new Date().getFullYear();
        const izinHarianTotalByUser = {};
        uniqueIzin.forEach(i => {
            if (i.type !== 'izin_harian' || i.status !== 'approved') return;
            if (!(i.date || '').startsWith(String(tahunIniIzinHarian))) return;
            const uid = String(i.userId);
            izinHarianTotalByUser[uid] = (izinHarianTotalByUser[uid] || 0) + (parseInt(i.duration) || 0);
        });
        this.izinHarianQuota = { total: izinHarianTotalByUser, kuota: KUOTA_IZIN_HARIAN, tahun: tahunIniIzinHarian };

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
                    role: emp.role || 'staff',
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
                    startDate: l.startDate || '',
                    asmenId:          l.asmenId          || '',
                    asmenName:        l.asmenName        || '',
                    asmenNik:         l.asmenNik         || '',
                    asmenApprovedAt:  l.asmenApprovedAt  || '',
                    asmenNote:        l.asmenNote        || '',
                    managerName:      l.managerName      || '',
                    managerNik:       l.managerNik       || '',
                    managerApprovedAt: l.managerApprovedAt || '',
                    managerNote:      l.managerNote      || '',
                    hrManagerName:      l.hrManagerName      || '',
                    hrManagerNik:       l.hrManagerNik       || '',
                    hrManagerApprovedAt: l.hrManagerApprovedAt || '',
                    hrManagerNote:      l.hrManagerNote      || '',
                    directorName:      l.directorName      || '',
                    directorNik:       l.directorNik       || '',
                    directorApprovedAt: l.directorApprovedAt || '',
                    directorNote:      l.directorNote      || '',
                    rejectedByRole:    l.rejectedByRole    || '',
                    rejectedNote:      l.rejectedNote      || '',
                    tundaSampai:       l.tundaSampai       || ''
                };
            }),
            ...uniqueIzin.map(i => {
                let emp = employees.find(e => String(e.id) === String(i.userId));
                if (!emp && currentUser && String(currentUser.id) === String(i.userId))
                    emp = { name: currentUser.name, department: currentUser.department || '-' };
                if (!emp) emp = { name: i.userId || 'Karyawan', department: '-' };
                // Keterangan "sudah melewati kuota Izin Harian" - ditandai
                // di SETIAP baris Izin Harian milik karyawan yang total
                // pakainya tahun ini sudah > kuota, bukan cuma baris yang
                // bikin dia lewat kuota (supaya kelihatan konsisten di
                // rekap, bukan cuma di 1 baris acak).
                const overQuotaNote = (i.type === 'izin_harian' &&
                    (izinHarianTotalByUser[String(i.userId)] || 0) > KUOTA_IZIN_HARIAN)
                    ? `Sudah ${izinHarianTotalByUser[String(i.userId)]} hari (lebih dari kuota ${KUOTA_IZIN_HARIAN} hari/tahun)`
                    : '';
                return {
                    id: i.id,
                    kind: 'izin',
                    userId: i.userId,
                    name: emp.name || emp.nama || i.userId,
                    department: emp.department || emp.unitKerja || '-',
                    bagian: emp.bagian || '-',
                    role: emp.role || 'staff',
                    position: emp.position || emp.jabatan || '-',
                    rawType: i.type || '',
                    type: i.type === 'sick' ? 'Sakit'
                        : i.type === 'permission' ? 'Izin Penting'
                        : i.type === 'emergency' ? 'Keadaan Darurat'
                        : i.type === 'keluar_kantor' ? 'Izin Keluar Kantor'
                        : i.type === 'izin_harian' ? 'Izin Harian'
                        : (i.typeLabel || 'Izin'),
                    overQuotaNote: overQuotaNote,
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
                    asmenId:          i.asmenId          || '',
                    asmenName:        i.asmenName        || '',
                    asmenNik:         i.asmenNik         || '',
                    asmenApprovedAt:  i.asmenApprovedAt  || '',
                    asmenNote:        i.asmenNote        || '',
                    managerName:      i.managerName      || '',
                    managerNik:       i.managerNik       || '',
                    managerApprovedAt: i.managerApprovedAt || '',
                    managerNote:      i.managerNote      || '',
                    hrManagerName:      i.hrManagerName      || '',
                    hrManagerNik:       i.hrManagerNik       || '',
                    hrManagerApprovedAt: i.hrManagerApprovedAt || '',
                    hrManagerNote:      i.hrManagerNote      || '',
                    directorName:      i.directorName      || '',
                    directorNik:       i.directorNik       || '',
                    directorApprovedAt: i.directorApprovedAt || '',
                    directorNote:      i.directorNote      || '',
                    rejectedByRole:    i.rejectedByRole    || '',
                    rejectedNote:      i.rejectedNote      || ''
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

        // Notif "kuota Izin Harian terlewati" ke admin - pola sama persis
        // dengan notif kuota cuti tahunan di atas (sekali per sesi per
        // karyawan+tahun, lewat sessionStorage). izinHarianTotalByUser &
        // KUOTA_IZIN_HARIAN sudah dihitung lebih awal (lihat sebelum
        // this.leaveData di atas).
        let warnedSetIzinHarian = new Set();
        try {
            warnedSetIzinHarian = new Set(JSON.parse(sessionStorage.getItem('izinHarianQuotaWarned') || '[]'));
        } catch (e) {
            warnedSetIzinHarian = new Set();
        }
        employees.forEach(emp => {
            const totalPakai = izinHarianTotalByUser[String(emp.id)] || 0;
            if (totalPakai > KUOTA_IZIN_HARIAN) {
                const warnKey = `${emp.id}-${tahunIniIzinHarian}`;
                if (!warnedSetIzinHarian.has(warnKey)) {
                    const nama = emp.name || emp.nama || 'Karyawan';
                    toast.warning(`⚠️ Izin Harian ${nama} sudah ${totalPakai} hari, melewati kuota ${KUOTA_IZIN_HARIAN} hari/tahun.`);
                    warnedSetIzinHarian.add(warnKey);
                }
            }
        });
        try {
            sessionStorage.setItem('izinHarianQuotaWarned', JSON.stringify([...warnedSetIzinHarian]));
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

    /**
     * Baris pending izin/sakit (belum final disetujui) untuk 1 karyawan di
     * bulan yang sedang difilter - dipakai renderAttendanceReports() supaya
     * Rekap Absensi Admin menampilkan hal yang sama seperti Riwayat Absensi
     * karyawan sendiri (lihat _buildSyntheticPendingIzinRows di absensi.js -
     * logikanya sengaja disamakan persis). Data izin semua karyawan sudah
     * dimuat sekali di this.rawIzin (lihat init/loadAllData di atas).
     */
    _buildPendingIzinRowsForEmployee(empId, month) {
        const izinList = (this.rawIzin || []).filter(i => String(i.userId) === String(empId));
        if (!izinList.length) return [];

        const PENDING_STATUSES = ['pending', 'asmen_approved', 'manajer_bidang_approved', 'manajer_approved'];
        const existingDates = new Set((this.rawAttendance || [])
            .filter(r => String(r.userId) === String(empId))
            .map(r => r.date));

        let monthStart = '0000-01-01', monthEnd = '9999-12-31';
        if (month) {
            const [yearStr, monthStr] = month.split('-');
            monthStart = `${yearStr}-${monthStr}-01`;
            const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
            monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
        }

        const rows = [];
        izinList.forEach(rec => {
            if (rec.type === 'keluar_kantor' || rec.type === 'sick') return;
            if (PENDING_STATUSES.indexOf(rec.status) === -1) return;

            const start = rec.date;
            let end = rec.dateEnd;
            if (!end && start) {
                const durasi = parseInt(rec.duration, 10) || 1;
                const d = new Date(start);
                d.setDate(d.getDate() + durasi - 1);
                end = d.toISOString().split('T')[0];
            }
            if (!start || !end) return;
            if (end < monthStart || start > monthEnd) return;

            for (let d = new Date(Math.max(new Date(start), new Date(monthStart))); d <= new Date(Math.min(new Date(end), new Date(monthEnd))); d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                if (existingDates.has(dateStr)) continue;
                rows.push({ date: dateStr, _syntheticPendingIzin: true, _pendingIzinLabel: rec.typeLabel || 'Izin' });
            }
        });
        return rows;
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
            container.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">Tidak ada data karyawan</td></tr>';
            return;
        }

        let html = '';
        employees.forEach(emp => {
            let rows = (this.rawAttendance || []).filter(r => String(r.userId) === String(emp.id));
            if (month) rows = rows.filter(r => r.date && r.date.startsWith(month));

            const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
            const color = colors[(emp.name || '').charCodeAt(0) % colors.length];
            // "Terlambat" tetap dihitung sebagai hadir (cuma telat absen masuk),
            // bukan status tandingan dari "Hadir" - makanya totalHadir mencakup
            // keduanya, dan totalTerlambat cuma breakdown info tambahan.
            // 'izin'/'cuti' juga dihitung Hadir - sama seperti Dinas Luar
            // (statusnya sudah 'hadir' langsung dari backend) - Izin/Cuti
            // yang disetujui penuh bukan ketidakhadiran. DIHITUNG DARI rows
            // ASLI (sebelum baris pending izin semu digabung di bawah) -
            // pending izin BUKAN kehadiran, jangan sampai menggelembungkan
            // Total hari (sama seperti renderHistoryStats di absensi.js).
            const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHadir = rows.filter(r => ['hadir','ontime','terlambat','late','izin','cuti'].includes(String(r.status||'').toLowerCase())).length;
            const totalHari = rows.length;

            // "Hadir Terlambat" - beda dari "Terlambat" di atas (yang cuma
            // merefleksikan status keseluruhan hari, pada praktiknya cuma
            // mencerminkan sesi Masuk). Di sini dihitung per KEJADIAN
            // (bukan per hari) - tiap sesi (Masuk/Istirahat/Kembali/Pulang)
            // yang kena label terlambat lewat getSessionAttendanceLabel()
            // (fungsi yang SAMA dipakai mewarnai tiap sel di tabel, lihat
            // baris ~862) dihitung +1 sendiri-sendiri - jadi kalau dalam
            // 1 hari ada 2 sesi yang telat sekaligus, badge ini bertambah
            // +2 untuk hari itu, bukan +1.
            let totalHadirTerlambat = 0;
            if (this.shiftTypesConfigFull) {
                rows.forEach(r => {
                    const statusLower = String(r.status || '').toLowerCase();
                    if (!['hadir','ontime','terlambat','late'].includes(statusLower)) return;
                    ['clockIn','breakStart','breakEnd','clockOut'].forEach(field => {
                        if (!r[field]) return;
                        const lbl = getSessionAttendanceLabel(this.shiftTypesConfigFull, r.shift, r.date, field, r[field]);
                        if (lbl && (lbl.late || lbl.veryLate)) totalHadirTerlambat++;
                    });
                });
            }

            // Baris pending izin semu digabung SETELAH statistik di atas
            // dihitung, supaya cuma memengaruhi tampilan tabel per-hari, bukan
            // badge Hadir/Terlambat/Total.
            const pendingIzinRows = this._buildPendingIzinRowsForEmployee(emp.id, month);
            rows = [...rows, ...pendingIzinRows];
            rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            html += `
                <tr class="employee-group-header" style="background:var(--bg-secondary,#f8f9fa);">
                    <td colspan="9" style="padding:12px 16px;">
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
                                <span style="background:#FFE4D6;color:#C2410C;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir Terlambat: ${totalHadirTerlambat}</span>
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
                    <td style="padding:8px 12px;">Foto</td>
                </tr>
            `;

            if (rows.length === 0) {
                html += `<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;"><i class="fas fa-calendar-times" style="margin-right:6px;"></i>Tidak ada data absensi pada periode ini</td></tr>`;
            } else {
                rows.forEach(row => {
                    const [y, m, d] = (row.date || '').split('-');
                    const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';

                    // Baris SEMU Izin/Sakit yang MASIH PENDING (lihat
                    // _buildPendingIzinRowsForEmployee di atas) - merah,
                    // sama pola dengan Riwayat Absensi karyawan sendiri.
                    if (row._syntheticPendingIzin) {
                        html += `
                            <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                                <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}</td>
                                <td style="padding:10px 12px;font-size:0.82rem;">${emp.shift || '-'}</td>
                                <td colspan="4" style="padding:10px 12px;text-align:center;">
                                    <span style="background:#FEE2E2;color:#B91C1C;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                        <i class="fas fa-hourglass-half"></i> ${row._pendingIzinLabel} - Menunggu Persetujuan
                                    </span>
                                    <br><small style="color:#B91C1C;font-weight:600;font-size:0.7rem;">Menunggu ditinjau</small>
                                </td>
                                <td style="padding:10px 12px;">–</td>
                                <td style="padding:10px 12px;">–</td>
                            </tr>
                        `;
                        return;
                    }

                    // Baris Izin/Cuti - PENTING soal Sakit: sejak diajukan
                    // (belum tentu disetujui) sudah punya baris Attendance,
                    // jadi status 'izin' BELUM TENTU berarti sudah
                    // disetujui - cek status record Izin aslinya
                    // (this.rawIzin) untuk tentukan merah/hijau. Cuti selalu
                    // hijau (baris Cuti baru dibuat setelah disetujui
                    // penuh). Sama pola dengan Riwayat Absensi karyawan
                    // sendiri.
                    const statusLowerRow = String(row.status || '').toLowerCase();
                    if (statusLowerRow === 'izin' || statusLowerRow === 'cuti') {
                        let isPendingRow = false;
                        if (row.excusedRefType === 'izin' && row.excusedRefId) {
                            const linkedIzin = (this.rawIzin || []).find(i => String(i.id) === String(row.excusedRefId));
                            if (linkedIzin && linkedIzin.status && linkedIzin.status !== 'approved' && linkedIzin.status !== 'rejected') {
                                isPendingRow = true;
                            }
                        }

                        if (isPendingRow) {
                            html += `
                                <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                                    <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}</td>
                                    <td style="padding:10px 12px;font-size:0.82rem;">${row.shift || '-'}</td>
                                    <td colspan="4" style="padding:10px 12px;text-align:center;">
                                        <span style="background:#FEE2E2;color:#B91C1C;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                            <i class="fas fa-hourglass-half"></i> ${row.clockIn || 'Izin'} - Menunggu Persetujuan
                                        </span>
                                        <br><small style="color:#B91C1C;font-weight:600;font-size:0.7rem;">Menunggu ditinjau</small>
                                    </td>
                                    <td style="padding:10px 12px;">–</td>
                                    <td style="padding:10px 12px;">–</td>
                                </tr>
                            `;
                            return;
                        }

                        html += `
                            <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                                <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}</td>
                                <td style="padding:10px 12px;font-size:0.82rem;">${row.shift || '-'}</td>
                                <td colspan="4" style="padding:10px 12px;text-align:center;">
                                    <span style="background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                        <i class="fas fa-check-circle"></i> ${row.clockIn || (statusLowerRow === 'cuti' ? 'Cuti' : 'Izin')}
                                    </span>
                                    <br><small style="color:#065F46;font-weight:600;font-size:0.7rem;">Sudah ditinjau</small>
                                </td>
                                <td style="padding:10px 12px;">–</td>
                                <td style="padding:10px 12px;">–</td>
                            </tr>
                        `;
                        return;
                    }

                    const coords = this._parseLatLng(row.verificationLocation);
                    const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';
                    const lokasiHtml = coords
                        ? `<span id="loc-t-${row.id}" style="font-size:0.75rem;"><i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i><small style="color:var(--text-muted);">${coordLabel}</small></span>`
                        : '<span style="color:var(--text-muted)">–</span>';
                    const fotoHtml = row.verificationPhoto
                        ? `<img src="${row.verificationPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="adminReports.viewPhoto('${row.verificationPhoto}')">`
                        : '<span style="color:var(--text-muted)">–</span>';

                    // Tandai absen yang skor kecocokan wajahnya "kurang yakin"
                    // (lihat FACE_MATCH_CONFIDENT_ZONE di face-recognition.js) -
                    // absen tetap diloloskan sistem, tapi ditandai di sini
                    // supaya admin bisa tinjau ulang manual lewat foto-nya.
                    const faceFlagRaw = String(row.faceMatchFlag).toLowerCase();
                    const faceReviewBadge = (faceFlagRaw === 'true')
                        ? `<br><span onclick="adminReports.showFaceMatchInfo('${row.faceMatchScore || ''}')" style="display:inline-block;margin-top:4px;background:#FEF3C7;color:#D97706;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-user-shield"></i> Perlu Review <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`
                        : '';

                    // Status PER SESI ("Hadir Tepat Waktu"/"Hadir Terlambat") -
                    // gantinya kolom "Status" per hari yang sudah dihapus.
                    // null (mis. utk "Cuti Tahunan"/Dinas Luar) berarti tidak
                    // ditampilkan apa-apa, jamnya tetap tampil apa adanya.
                    const sessionStatusHtml = (field, actualValue) => {
                        const lbl = getSessionAttendanceLabel(this.shiftTypesConfigFull, row.shift, row.date, field, actualValue);
                        if (!lbl) return '';
                        // PERBAIKAN: "Terlambat" (lewat batas toleransi) dikasih
                        // merah, beda dari "Hadir Terlambat" (masih dalam
                        // toleransi, kuning) - lihat session-status.js.
                        const color = lbl.veryLate ? '#DC2626' : (lbl.late ? '#D97706' : '#059669');
                        return `<br><small style="color:${color};font-weight:600;font-size:0.68rem;">${lbl.text}</small>`;
                    };

                    // GPS per sesi (Masuk/Istirahat/Kembali/Pulang) - ikon kecil
                    // yang bisa diklik, muncul di sebelah jam kalau ada titik
                    // koordinat tersimpan untuk sesi itu spesifik (bukan cuma
                    // GPS umum yang cuma nunjuk sesi terakhir).
                    const sessionGps = (locField) => {
                        const c = this._parseLatLng(row[locField]);
                        if (!c) return '';
                        const namaLokasi = this._nearestOfficeName(c.lat, c.lng);
                        const namaHtml = namaLokasi
                            ? `<br><small style="color:var(--text-muted);font-size:0.68rem;">${this._esc(namaLokasi)}</small>`
                            : '';
                        return ` <i class="fas fa-map-marker-alt" style="color:#10b981;cursor:pointer;font-size:0.75rem;" onclick="adminReports.openMaps(${c.lat}, ${c.lng})" title="Lihat titik GPS sesi ini"></i>${namaHtml}`;
                    };

                    // Tandai jam yang tercatat di luar radius.
                    // Dulu catatannya cuma muncul lewat hover (title attribute) -
                    // di HP/touchscreen hover tidak berfungsi, jadi sekarang
                    // badge-nya bisa DIKLIK/DITAP untuk menampilkan catatannya.
                    const oorBadge = (type) => {
                        const r = (this.outOfRadiusMap || {})[`${emp.id}|${row.date}|${type}`];
                        if (!r) return '';
                        return `<br><span onclick="adminReports.showOutOfRadiusNote('${emp.id}', '${row.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FEF3C7;color:#D97706;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-marker-alt"></i> Luar Radius${r.status === 'approved' ? ' ✓' : ''} <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
                    };

                    // Tandai jam yang tercatat di luar Unit Wilayah yang
                    // ditugaskan - sama pola/perilakunya dengan oorBadge di atas.
                    const oowBadge = (type) => {
                        const r = (this.outOfWilayahMap || {})[`${emp.id}|${row.date}|${type}`];
                        if (!r) return '';
                        return `<br><span onclick="adminReports.showOutOfWilayahNote('${emp.id}', '${row.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FDE68A;color:#92400E;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-signs"></i> Luar Unit Wilayah <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
                    };

                    // Kalau hari ini Dinas Luar (self-declare Surat Tugas/SPPD),
                    // tampilkan badge yang bisa diklik untuk buka dokumen
                    // suratnya (kalau ada link-nya) - lihat Surattugas.gs.
                    const dinasLuarBadge = row.isDinasLuar
                        ? (row.suratTugasFileUrl
                            ? `<br><span onclick="window.open('${row.suratTugasFileUrl}', '_blank')" style="display:inline-block;margin-top:4px;background:#DBEAFE;color:#1D4ED8;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;" title="${this._esc(row.suratTugasTujuan || '')}"><i class="fas fa-file-lines"></i> Surat Tugas</span>`
                            : `<br><span style="display:inline-block;margin-top:4px;background:#DBEAFE;color:#1D4ED8;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;" title="${this._esc(row.suratTugasTujuan || '')}"><i class="fas fa-file-lines"></i> Dinas Luar</span>`)
                        : '';

                    html += `
                        <tr style="border-bottom:1px solid var(--border-color,#e5e7eb);">
                            <td style="padding:10px 12px;font-size:0.85rem;">${dateStr}${dinasLuarBadge}</td>
                            <td style="padding:10px 12px;font-size:0.82rem;">${row.shift || '-'}</td>
                            <td style="padding:10px 12px;font-weight:600;color:#10b981;">${row.clockIn || '–'}${sessionStatusHtml('clockIn', row.clockIn)}${sessionGps('clockInLocation')}${oorBadge('clockIn')}${oowBadge('clockIn')}</td>
                            <td style="padding:10px 12px;color:var(--text-muted);">${row.breakStart || '–'}${sessionStatusHtml('breakStart', row.breakStart)}${sessionGps('breakStartLocation')}${oorBadge('breakStart')}${oowBadge('breakStart')}</td>
                            <td style="padding:10px 12px;color:var(--text-muted);">${row.breakEnd || '–'}${sessionStatusHtml('breakEnd', row.breakEnd)}${sessionGps('breakEndLocation')}${oorBadge('breakEnd')}${oowBadge('breakEnd')}</td>
                            <td style="padding:10px 12px;font-weight:600;color:#EF4444;">${row.clockOut || '–'}${sessionStatusHtml('clockOut', row.clockOut)}${sessionGps('clockOutLocation')}${oorBadge('clockOut')}${oowBadge('clockOut')}</td>
                            <td style="padding:10px 12px;font-size:0.75rem;max-width:160px;">${lokasiHtml}</td>
                            <td style="padding:10px 12px;">${fotoHtml}${faceReviewBadge}</td>
                        </tr>
                    `;
                });
            }
            html += `<tr><td colspan="8" style="padding:8px;background:transparent;border:none;"></td></tr>`;
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

            const initials = (emp.name || 'K').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const colors = ['#F59E0B','#3B82F6','#10B981','#EF4444','#8B5CF6'];
            const color = colors[(emp.name || '').charCodeAt(0) % colors.length];
            // "Terlambat" tetap dihitung sebagai hadir (cuma telat absen masuk),
            // bukan status tandingan dari "Hadir" - makanya totalHadir mencakup
            // keduanya, dan totalTerlambat cuma breakdown info tambahan.
            // 'izin'/'cuti' juga dihitung Hadir - sama seperti Dinas Luar
            // (statusnya sudah 'hadir' langsung dari backend) - Izin/Cuti
            // yang disetujui penuh bukan ketidakhadiran. DIHITUNG DARI rows
            // ASLI (sebelum baris pending izin semu digabung di bawah).
            const totalTerlambat = rows.filter(r => ['terlambat','late'].includes(String(r.status||'').toLowerCase())).length;
            const totalHadir = rows.filter(r => ['hadir','ontime','terlambat','late','izin','cuti'].includes(String(r.status||'').toLowerCase())).length;
            const totalHari = rows.length;

            // "Hadir Terlambat" per-KEJADIAN - lihat komentar lengkap di
            // versi desktop (renderAttendanceReports) di atas, logikanya sama persis.
            let totalHadirTerlambat = 0;
            if (this.shiftTypesConfigFull) {
                rows.forEach(r => {
                    const statusLower = String(r.status || '').toLowerCase();
                    if (!['hadir','ontime','terlambat','late'].includes(statusLower)) return;
                    ['clockIn','breakStart','breakEnd','clockOut'].forEach(field => {
                        if (!r[field]) return;
                        const lbl = getSessionAttendanceLabel(this.shiftTypesConfigFull, r.shift, r.date, field, r[field]);
                        if (lbl && (lbl.late || lbl.veryLate)) totalHadirTerlambat++;
                    });
                });
            }

            const pendingIzinRowsM = this._buildPendingIzinRowsForEmployee(emp.id, month);
            rows = [...rows, ...pendingIzinRowsM];
            rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

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
                        <span style="background:#FFE4D6;color:#C2410C;padding:3px 10px;border-radius:20px;font-weight:500;">Hadir Terlambat: ${totalHadirTerlambat}</span>
                        <span style="background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:20px;font-weight:500;">Total: ${totalHari} hari</span>
                    </div>
            `;

            if (rows.length === 0) {
                html += `<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem;border-top:1px solid var(--border-color,#e5e7eb);"><i class="fas fa-calendar-times" style="margin-right:6px;"></i>Tidak ada data absensi pada periode ini</div>`;
            } else {
                rows.forEach(row => {
                    const [y, m, d] = (row.date || '').split('-');
                    const dateStr = (y && m && d) ? `${d} ${months[parseInt(m)-1]} ${y}` : '-';

                    // Baris SEMU Izin/Sakit yang MASIH PENDING - sama pola
                    // dengan tabel desktop di atas.
                    if (row._syntheticPendingIzin) {
                        html += `
                            <div style="padding:10px 0;border-top:1px solid var(--border-color,#e5e7eb);text-align:center;">
                                <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">${dateStr}</div>
                                <span style="background:#FEE2E2;color:#B91C1C;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                    <i class="fas fa-hourglass-half"></i> ${row._pendingIzinLabel} - Menunggu Persetujuan
                                </span>
                                <br><small style="color:#B91C1C;font-weight:600;font-size:0.7rem;">Menunggu ditinjau</small>
                            </div>
                        `;
                        return;
                    }

                    // Baris Izin/Cuti - cek status record Izin asli untuk
                    // Sakit (bisa masih pending, lihat komentar versi
                    // desktop di atas). Cuti selalu hijau.
                    const statusLowerRowM = String(row.status || '').toLowerCase();
                    if (statusLowerRowM === 'izin' || statusLowerRowM === 'cuti') {
                        let isPendingRowM = false;
                        if (row.excusedRefType === 'izin' && row.excusedRefId) {
                            const linkedIzinM = (this.rawIzin || []).find(i => String(i.id) === String(row.excusedRefId));
                            if (linkedIzinM && linkedIzinM.status && linkedIzinM.status !== 'approved' && linkedIzinM.status !== 'rejected') {
                                isPendingRowM = true;
                            }
                        }

                        if (isPendingRowM) {
                            html += `
                                <div style="padding:10px 0;border-top:1px solid var(--border-color,#e5e7eb);text-align:center;">
                                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">${dateStr}</div>
                                    <span style="background:#FEE2E2;color:#B91C1C;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                        <i class="fas fa-hourglass-half"></i> ${row.clockIn || 'Izin'} - Menunggu Persetujuan
                                    </span>
                                    <br><small style="color:#B91C1C;font-weight:600;font-size:0.7rem;">Menunggu ditinjau</small>
                                </div>
                            `;
                            return;
                        }

                        html += `
                            <div style="padding:10px 0;border-top:1px solid var(--border-color,#e5e7eb);text-align:center;">
                                <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">${dateStr}</div>
                                <span style="background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:20px;font-weight:600;font-size:0.78rem;">
                                    <i class="fas fa-check-circle"></i> ${row.clockIn || (statusLowerRowM === 'cuti' ? 'Cuti' : 'Izin')}
                                </span>
                                <br><small style="color:#065F46;font-weight:600;font-size:0.7rem;">Sudah ditinjau</small>
                            </div>
                        `;
                        return;
                    }

                    const coords = this._parseLatLng(row.verificationLocation);
                    const coordLabel = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '';
                    const lokasiHtml = coords
                        ? `<span id="loc-m-${row.id}" style="font-size:0.75rem;"><i class="fas fa-spinner fa-spin" style="color:var(--text-muted);font-size:0.7rem;"></i><small style="color:var(--text-muted);">${coordLabel}</small></span>`
                        : '<span style="color:var(--text-muted)">–</span>';
                    const fotoHtml = row.verificationPhoto
                        ? `<img src="${row.verificationPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="adminReports.viewPhoto('${row.verificationPhoto}')">`
                        : '<span style="color:var(--text-muted)">–</span>';

                    // Sama seperti versi tabel desktop - tandai kalau skor
                    // kecocokan wajahnya kurang meyakinkan.
                    const faceFlagRawM = String(row.faceMatchFlag).toLowerCase();
                    const faceReviewBadgeM = (faceFlagRawM === 'true')
                        ? `<span onclick="adminReports.showFaceMatchInfo('${row.faceMatchScore || ''}')" style="display:inline-block;background:#FEF3C7;color:#D97706;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;white-space:nowrap;"><i class="fas fa-user-shield"></i> Review</span>`
                        : '';

                    // Status PER SESI - sama seperti versi tabel desktop.
                    const sessionStatusHtmlM = (field, actualValue) => {
                        const lbl = getSessionAttendanceLabel(this.shiftTypesConfigFull, row.shift, row.date, field, actualValue);
                        if (!lbl) return '';
                        // PERBAIKAN: sama seperti versi tabel desktop di atas.
                        const color = lbl.veryLate ? '#DC2626' : (lbl.late ? '#D97706' : '#059669');
                        return `<br><small style="color:${color};font-weight:600;font-size:0.68rem;">${lbl.text}</small>`;
                    };

                    // GPS per sesi (Masuk/Istirahat/Kembali/Pulang) - sama
                    // seperti versi tabel desktop.
                    const sessionGps = (locField) => {
                        const c = this._parseLatLng(row[locField]);
                        if (!c) return '';
                        const namaLokasi = this._nearestOfficeName(c.lat, c.lng);
                        const namaHtml = namaLokasi
                            ? `<br><small style="color:var(--text-muted);font-size:0.68rem;">${this._esc(namaLokasi)}</small>`
                            : '';
                        return ` <i class="fas fa-map-marker-alt" style="color:#10b981;cursor:pointer;font-size:0.75rem;" onclick="adminReports.openMaps(${c.lat}, ${c.lng})" title="Lihat titik GPS sesi ini"></i>${namaHtml}`;
                    };

                    // Tandai jam yang tercatat di luar radius
                    // - sama seperti versi tabel desktop, cuma sebelumnya lupa
                    // ditambahkan di kartu mobile ini.
                    const oorBadgeM = (type) => {
                        const r = (this.outOfRadiusMap || {})[`${emp.id}|${row.date}|${type}`];
                        if (!r) return '';
                        return `<br><span onclick="adminReports.showOutOfRadiusNote('${emp.id}', '${row.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FEF3C7;color:#D97706;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-marker-alt"></i> Luar Radius${r.status === 'approved' ? ' ✓' : ''} <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
                    };

                    // Tandai jam yang tercatat di luar Unit Wilayah - sama
                    // seperti versi tabel desktop (oowBadge).
                    const oowBadgeM = (type) => {
                        const r = (this.outOfWilayahMap || {})[`${emp.id}|${row.date}|${type}`];
                        if (!r) return '';
                        return `<br><span onclick="adminReports.showOutOfWilayahNote('${emp.id}', '${row.date}', '${type}')" style="display:inline-block;margin-top:2px;background:#FDE68A;color:#92400E;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;"><i class="fas fa-map-signs"></i> Luar Unit Wilayah <i class="fas fa-circle-info" style="font-size:0.6rem;"></i></span>`;
                    };

                    // Sama seperti versi tabel desktop - badge Dinas Luar yang
                    // bisa diklik untuk buka dokumen Surat Tugas/SPPD.
                    const dinasLuarBadgeM = row.isDinasLuar
                        ? (row.suratTugasFileUrl
                            ? `<span onclick="window.open('${row.suratTugasFileUrl}', '_blank')" style="display:inline-block;margin-top:4px;background:#DBEAFE;color:#1D4ED8;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;cursor:pointer;" title="${this._esc(row.suratTugasTujuan || '')}"><i class="fas fa-file-lines"></i> Surat Tugas</span>`
                            : `<span style="display:inline-block;margin-top:4px;background:#DBEAFE;color:#1D4ED8;font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:10px;" title="${this._esc(row.suratTugasTujuan || '')}"><i class="fas fa-file-lines"></i> Dinas Luar</span>`)
                        : '';

                    html += `
                        <div style="padding:10px 0;border-top:1px solid var(--border-color,#e5e7eb);">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                <span style="font-weight:600;font-size:0.85rem;">${dateStr}</span>
                                <span>${dinasLuarBadgeM}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">
                                <div>Shift: <span style="color:var(--text-primary,#111);">${row.shift || '-'}</span></div>
                                <div>Masuk: <span style="color:#10b981;font-weight:600;">${row.clockIn || '–'}</span>${sessionStatusHtmlM('clockIn', row.clockIn)}${sessionGps('clockInLocation')}${oorBadgeM('clockIn')}${oowBadgeM('clockIn')}</div>
                                <div>Istirahat: ${row.breakStart || '–'}${sessionStatusHtmlM('breakStart', row.breakStart)}${sessionGps('breakStartLocation')}${oorBadgeM('breakStart')}${oowBadgeM('breakStart')}</div>
                                <div>Kembali: ${row.breakEnd || '–'}${sessionStatusHtmlM('breakEnd', row.breakEnd)}${sessionGps('breakEndLocation')}${oorBadgeM('breakEnd')}${oowBadgeM('breakEnd')}</div>
                                <div>Pulang: <span style="color:#EF4444;font-weight:600;">${row.clockOut || '–'}</span>${sessionStatusHtmlM('clockOut', row.clockOut)}${sessionGps('clockOutLocation')}${oorBadgeM('clockOut')}${oowBadgeM('clockOut')}</div>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                <div style="flex:1;min-width:0;">${lokasiHtml}</div>
                                <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">${fotoHtml}${faceReviewBadgeM}</div>
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

    // Rumus Haversine, sama persis dengan yang dipakai backend
    // (Attendance.gs) supaya jarak yang dihitung konsisten.
    _haversineMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000; // radius bumi dalam meter
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    // Cari NAMA lokasi kantor (mis. "BNA Amuntai", "SPAM Alabio") yang
    // paling dekat dengan titik GPS sesi absen tertentu - dipakai
    // sessionGps() supaya admin lihat nama lokasinya, bukan cuma
    // koordinat mentah. Kalau belum ada lokasi kantor yang diset di
    // Settings, kembalikan null (sessionGps tetap tampil pin GPS saja).
    _nearestOfficeName(lat, lng) {
        const locations = this.officeLocations || [];
        let nearest = null;
        locations.forEach(loc => {
            const locLat = parseFloat(loc.lat);
            const locLng = parseFloat(loc.lng);
            if (isNaN(locLat) || isNaN(locLng)) return;
            const d = this._haversineMeters(lat, lng, locLat, locLng);
            if (nearest === null || d < nearest.distance) {
                nearest = { nama: loc.nama || 'Kantor', distance: d };
            }
        });
        return nearest ? nearest.nama : null;
    },

    // Sebelumnya fungsi ini menerima string mentah row.verificationLocation
    // lalu di-parse ulang pakai regex - selain rawan gagal (kalau ada
    // karakter yang bikin onclick-nya rusak, klik jadi tidak bereaksi sama
    // sekali tanpa error yang kelihatan), itu juga kerjaan dobel karena
    // koordinatnya SUDAH di-parse duluan (this._parseLatLng) untuk
    // ditampilkan di kolom LOKASI. Sekarang tinggal terima lat/lng yang
    // sudah bersih, lalu buka Google Maps PERSIS di titik itu.
    openMaps(lat, lng) {
        if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    },

    _esc(str) {
        return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    showFaceMatchInfo(score) {
        if (!score) {
            toast.warning('Absen ini ditandai untuk ditinjau karena identitas wajah TIDAK SEMPAT diverifikasi otomatis (kemungkinan foto profil karyawan bermasalah/belum ada). Cek foto verifikasinya secara manual untuk memastikan.');
            return;
        }
        toast.warning(`Absen ini ditandai untuk ditinjau karena kecocokan wajah kurang meyakinkan. Skor jarak kecocokan: ${score} (semakin kecil = semakin mirip, ambang batas 0.55). Cek foto verifikasinya untuk memastikan.`);
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

        const photoWrap = document.getElementById('oorn-photo-wrap');
        const photoImg = document.getElementById('oorn-photo-img');
        if (r.photo && photoWrap && photoImg) {
            photoImg.src = r.photo;
            photoWrap.style.display = 'block';
        } else if (photoWrap) {
            photoWrap.style.display = 'none';
        }

        modal.style.display = 'flex';
    },

    closeOutOfRadiusNote() {
        const modal = document.getElementById('modal-out-of-radius-view');
        if (modal) modal.style.display = 'none';
    },

    // Tampilkan catatan absen-luar-wilayah di modal view-only bersama
    // (#modal-out-of-wilayah-view, juga dipakai absensi.js untuk Riwayat
    // Absensi karyawan sendiri) - pola sama seperti showOutOfRadiusNote().
    showOutOfWilayahNote(userId, date, type) {
        const r = (this.outOfWilayahMap || {})[`${userId}|${date}|${type}`];
        if (!r) return;

        const modal = document.getElementById('modal-out-of-wilayah-view');
        if (!modal) {
            alert(`Catatan Absen Luar Unit Wilayah\n\n${r.userName}\n\n"${r.note}"`);
            return;
        }

        document.getElementById('oown-user-name').textContent = r.userName || '';
        document.getElementById('oown-note-text').textContent = `"${r.note || ''}"`;
        document.getElementById('oown-status-text').textContent =
            `Unit Wilayah: ${r.unitWilayah || '-'} · Absen di: ${r.detectedOffice || '-'}`;

        modal.style.display = 'flex';
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

        const statusLabels = { 'pending': 'Menunggu', 'asmen_approved': 'Disetujui Asmen', 'manajer_bidang_approved': 'Disetujui Manajer Bidang', 'manajer_approved': 'Disetujui Manajer', 'approved': 'Disetujui', 'rejected': 'Ditolak' };

        tbody.innerHTML = data.map(row => {
            const isKeluarKantor = row.kind === 'izin' && row.rawType === 'keluar_kantor';
            const durasiHtml = row.duration === '-' ? '-' : (isKeluarKantor ? row.duration : row.duration + ' hari');
            const needsAction = this._canActOnStage(row);

            return `
            <tr>
                <td>${row.name}</td>
                <td>${row.position}</td>
                <td>${row.type}${row.overQuotaNote ? `<br><span style="color:#D97706;font-size:0.78em;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> ${row.overQuotaNote}</span>` : ''}</td>
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

        const statusLabels = { 'pending': 'Menunggu', 'asmen_approved': 'Disetujui Asmen', 'manajer_bidang_approved': 'Disetujui Manajer Bidang', 'manajer_approved': 'Disetujui Manajer', 'approved': 'Disetujui', 'rejected': 'Ditolak' };

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
                        <span class="mobile-card-value">${row.type}${row.overQuotaNote ? `<br><span style="color:#D97706;font-size:0.85em;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> ${row.overQuotaNote}</span>` : ''}</span>
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

    /**
     * Bangun daftar TAHAPAN approval (stepper) yang BENAR-BENAR berlaku
     * untuk baris ini - mengikuti PERSIS cabang logika yang sama dengan
     * _getDetailedStatusLabel() di izin.js/cuti.js (bukan tebakan baru).
     * PENTING: row.rawType 'sick' bisa berarti 2 hal berbeda tergantung
     * row.kind - Sakit (izin, 1 tahap) ATAU Cuti Sakit (leave, berjenjang
     * penuh seperti Cuti Tahunan) - harus dicek row.kind dulu supaya tidak
     * salah pilih alur.
     */
    _buildApprovalStages(row) {
        const pemohonRole = row.role || 'staff';
        const bagian = row.bagian && row.bagian !== '-' ? row.bagian : '';
        const isPemohonHr = pemohonRole === 'asmen' && String(bagian).toUpperCase().trim() === 'UMUM DAN KEPEGAWAIAN';
        const manajerLabel = bagian ? `Manajer ${bagian}` : 'Manajer';

        const stage = (key, label, nameField, atField, noteField) => ({
            key, label,
            name: row[nameField] || '',
            at: row[atField] || '',
            note: row[noteField] || ''
        });
        const ASMEN        = () => stage('asmen', 'Asmen', 'asmenName', 'asmenApprovedAt', 'asmenNote');
        const MANAJER       = (label) => stage('manajer', label || manajerLabel, 'managerName', 'managerApprovedAt', 'managerNote');
        const MANAJER_UMUM  = () => stage('hrManajer', 'Manajer Umum dan Kepegawaian', 'hrManagerName', 'hrManagerApprovedAt', 'hrManagerNote');
        const DIREKTUR      = () => stage('direktur', 'Direktur', 'directorName', 'directorApprovedAt', 'directorNote');

        const isIzin = row.kind === 'izin';
        let order;
        if (isIzin && row.rawType === 'sick') {
            // Sakit: cuma 1 tahap sesuai role pemohon.
            if (pemohonRole === 'staff')      order = [ASMEN()];
            else if (pemohonRole === 'asmen') order = [MANAJER()];
            else                              order = [DIREKTUR()];
        } else if (isIzin && row.rawType === 'keluar_kantor') {
            order = (pemohonRole === 'manajer') ? [DIREKTUR()] : [MANAJER()];
        } else if (pemohonRole === 'manajer') {
            order = [DIREKTUR()];
        } else if (pemohonRole === 'asmen') {
            order = isPemohonHr
                ? [MANAJER('Manajer Umum dan Kepegawaian'), DIREKTUR()]
                : [MANAJER(), MANAJER_UMUM(), DIREKTUR()];
        } else if (!isIzin) {
            // Cuti, pemohon staff: TETAP 2 tahap Manajer terpisah kalau
            // bukan dari bagian Umum & Kepegawaian (beda dari Izin Harian
            // yang cuma 1 tahap Manajer) - lihat Leave.gs approveLeaveData.
            order = isPemohonHr
                ? [ASMEN(), MANAJER('Manajer Umum dan Kepegawaian'), DIREKTUR()]
                : [ASMEN(), MANAJER(), MANAJER_UMUM(), DIREKTUR()];
        } else {
            // Izin Harian, pemohon staff - berjenjang penuh (1 tahap Manajer saja).
            order = [ASMEN(), MANAJER(), DIREKTUR()];
        }

        const isStoppedEarly = row.status === 'rejected' || row.status === 'ditolak' || row.status === 'ditunda';
        let currentAssigned = false;
        return order.map(s => {
            if (s.name) return Object.assign({}, s, { state: 'done' });
            if (isStoppedEarly) return Object.assign({}, s, { state: 'skipped' });
            if (!currentAssigned) { currentAssigned = true; return Object.assign({}, s, { state: 'current' }); }
            return Object.assign({}, s, { state: 'upcoming' });
        });
    },

    _formatStageDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
        const jam = String(d.getHours()).padStart(2, '0');
        const menit = String(d.getMinutes()).padStart(2, '0');
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${jam}.${menit}`;
    },

    // Stepper visual di dalam modal detail (dipakai viewLeaveDetail via
    // _renderApprovalHistory di bawah) - menggantikan versi lama yang
    // berdasarkan field yang tidak pernah ada (stage1ApproverName dkk).
    _renderApprovalHistory(row) {
        const stages = this._buildApprovalStages(row);
        const icon = { done: 'fa-check', current: 'fa-hourglass-half', upcoming: 'fa-circle', skipped: 'fa-xmark' };
        const stepsHtml = stages.map(s => `
            <div class="approval-step ${s.state}">
                <div class="approval-step-icon"><i class="fas ${icon[s.state]}"></i></div>
                <div class="approval-step-body">
                    <div class="approval-step-label">${s.label}</div>
                    <div class="approval-step-status">
                        ${s.state === 'done'
                            ? `Disetujui oleh <strong>${s.name}</strong>${s.at ? ' &middot; ' + this._formatStageDateTime(s.at) : ''}`
                            : s.state === 'current' ? 'Menunggu persetujuan...'
                            : s.state === 'skipped' ? 'Tidak dilanjutkan'
                            : 'Menunggu tahap sebelumnya'}
                    </div>
                    ${s.note ? `<div class="approval-step-note">&ldquo;${s.note}&rdquo;</div>` : ''}
                </div>
            </div>`).join('');

        let footerHtml = '';
        if (row.status === 'rejected') {
            footerHtml = `<div class="approval-step-final rejected"><i class="fas fa-ban"></i> Pengajuan ini ditolak${row.rejectedByRole ? ' oleh ' + row.rejectedByRole : ''}${row.rejectedNote ? ': "' + row.rejectedNote + '"' : ''}</div>`;
        } else if (row.status === 'ditunda') {
            footerHtml = `<div class="approval-step-final postponed"><i class="fas fa-pause-circle"></i> Ditunda oleh Direktur${row.tundaSampai ? ' sampai ' + row.tundaSampai : ''}${row.directorNote ? ': "' + row.directorNote + '"' : ''}</div>`;
        }
        return `<div class="approval-stepper">${stepsHtml}</div>${footerHtml}`;
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

        const statusLabels = { 'pending': 'Menunggu', 'asmen_approved': 'Disetujui Asmen', 'manajer_bidang_approved': 'Disetujui Manajer Bidang', 'manajer_approved': 'Disetujui Manajer', 'approved': 'Disetujui', 'rejected': 'Ditolak' };
        const statusColors = { 'pending': '#F59E0B', 'manager_approved': '#3B82F6', 'approved': '#10B981', 'rejected': '#EF4444' };
        const statusColor = statusColors[row.status] || '#94A3B8';

        const content = `
            <div style="text-align:center;margin-bottom:1.25rem;">
                <div style="width:56px;height:56px;border-radius:50%;background:rgba(245,158,11,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px;">
                    <i class="fas ${isKeluarKantor ? 'fa-door-open' : 'fa-file-alt'}"></i>
                </div>
                <h3 style="font-size:1.05rem;margin-bottom:4px;">${row.type}</h3>
                <span style="background:${statusColor}20;color:${statusColor};padding:4px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;">${statusLabels[row.status] || row.status}</span>
                ${row.overQuotaNote ? `<div style="margin-top:8px;color:#D97706;font-size:0.8rem;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> ${row.overQuotaNote}</div>` : ''}
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
