/**
 * Portal Karyawan - API Layer
 * Abstraction layer for backend communication
 * 
 * Mode:
 * - Jika API_BASE_URL kosong → fallback ke localStorage (untuk testing lokal)
 * - Jika API_BASE_URL diisi → semua request dikirim ke Google Apps Script
 */

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbz3qeYiMdaJ1gvnpnv5j2cKp4JNQb0_QuW0XwTRkOETRQ4C2R8Med4I3VrSlCHyoLrO/exec'; // Kosongkan untuk mode localStorage, isi dengan URL Web App GAS

const api = {

    // ========== SERVER TIME (anti-akal jam HP) ==========
    async getServerTime() {
        return this.request('getServerTime', {});
    },

    // ========== CORE REQUEST ==========

    async request(action, data = {}) {
        // Jika API_BASE_URL kosong, gunakan localStorage fallback
        if (!API_BASE_URL) {
            return this._localFallback(action, data);
        }

        try {
            const response = await fetch(API_BASE_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action, ...data })
            });

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('Failed to parse response:', text.substring(0, 200));
                return { success: false, error: 'Invalid response from server' };
            }
        } catch (error) {
            console.error('API Error:', error);
            // Fallback to localStorage on network error
            return this._localFallback(action, data);
        }
    },

    // ========== AUTH ==========

    async login(username, password) {
    if (!API_BASE_URL) {
        return this._localLogin(username, password);
    }
    return this.request('login', { username, password });
},

    // Cek berkala apakah sesi login perangkat ini masih yang paling baru
    // untuk akun ini (dipakai untuk fitur "1 perangkat saja" - lihat
    // auth.js startSessionWatcher). Tidak ada mode localStorage untuk ini
    // karena fitur ini memang cuma relevan kalau ada backend nyata.
    async validateSession(userId, role, sessionToken) {
        if (!API_BASE_URL) {
            return { success: true, data: { valid: true } };
        }
        return this.request('validateSession', { userId, role, sessionToken });
    },

    // ========== LOGIN SIDIK JARI (WebAuthn) — TAMBAHAN ==========
    // Tidak ada mode localStorage fallback untuk fitur ini karena daftar
    // perangkat memang cuma relevan kalau ada backend nyata.
    async getBiometricDevices(userId, role) {
        if (!API_BASE_URL) return { success: true, data: [] };
        return this.request('getBiometricDevices', { userId, role });
    },

    async registerBiometricDevice(userId, role, deviceLabel, credentialId) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('registerBiometricDevice', { userId, role, deviceLabel, credentialId });
    },

    async removeBiometricDevice(userId, role, deviceId) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('removeBiometricDevice', { userId, role, deviceId });
    },

    // Cek apakah credentialId di perangkat ini MASIH terdaftar di server
    // (dipakai loginWithBiometric() supaya perangkat yang tergusur batas
    // maksimal atau dihapus manual dari Edit Profil benar-benar tidak bisa
    // login sidik jari lagi, bukan cuma hilang dari tampilan daftar).
    async isBiometricDeviceRegistered(userId, role, credentialId) {
        if (!API_BASE_URL) return { success: true, data: { registered: true } };
        return this.request('isBiometricDeviceRegistered', { userId, role, credentialId });
    },

    // Cek ulang password TANPA memicu login baru (jadi sessionToken "1
    // perangkat saja" milik sesi yang sedang aktif tidak ikut berubah) -
    // dipakai sebelum mengaktifkan sidik jari dari menu Edit Profil.
    async verifyPassword(userId, role, password) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('verifyPasswordOnly', { userId, role, password });
    },

    // ========== NOTIFIKASI HP (Firebase Cloud Messaging) — TAMBAHAN ==========
    async savePushToken(userId, token, device) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('savePushToken', { userId, token, device });
    },

    async deletePushToken(token) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('deletePushToken', { token });
    },

    async testPush(userId) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('testPush', { userId });
    },

    async changePassword(userId, oldPassword, newPassword) {
        if (!API_BASE_URL) {
            return { success: true, data: { message: 'Password changed (local)' } };
        }
        return this.request('changePassword', { userId, oldPassword, newPassword });
    },

    async getEmployeeProfile(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: {} };
        }
        return this.request('getEmployeeProfile', { userId });
    },

    // ========== ATTENDANCE ==========

    async checkAttendanceAccess(userId) {
        return this.request('checkAttendanceAccess', { userId });
    },

    async getAttendance(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('attendance', []);
            return { success: true, data: all };
        }
        return this.request('getAttendance', { userId });
    },

    async getTodayAttendance(userId) {
        if (!API_BASE_URL) {
            const today = dateTime.getLocalDate();
            const all = storage.get('attendance', []);
            const todayRecord = all.find(a => a.date === today);
            return {
                success: true,
                data: todayRecord || {
                    date: today, shift: 'Pagi', clockIn: null, clockOut: null,
                    breakStart: null, breakEnd: null, overtimeStart: null, status: 'waiting'
                }
            };
        }
        return this.request('getTodayAttendance', { userId });
    },

    async reverseGeocode(lat, lng) {
        if (!API_BASE_URL) {
            return { success: false, error: 'Reverse geocode butuh koneksi backend' };
        }
        return this.request('reverseGeocode', { lat, lng });
    },

    async saveAttendance(data) {
        if (!API_BASE_URL) {
            const all = storage.get('attendance', []);
            const idx = all.findIndex(a => a.date === data.date);
            if (idx >= 0) { all[idx] = data; } else { all.unshift(data); }
            storage.set('attendance', all);
            return { success: true, data: data };
        }
        return this.request('saveAttendance', data);
    },

    async getAllAttendance() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('attendance', []) };
        }
        return this.request('getAllAttendance');
    },

    // Versi RINGAN dari getAllAttendance() - cuma baris HARI INI (semua
    // karyawan). Pakai ini, BUKAN getAllAttendance(), kalau yang dibutuhkan
    // memang cuma status hari ini (lihat dashboard.js renderTeamAttendance).
    //
    // PERBAIKAN BUG (2026-08-20): SEBELUMNYA method ini juga bernama
    // `getTodayAttendance` (sama persis dengan versi PER-USER di atas,
    // `getTodayAttendance(userId)`) - karena object literal JS, definisi
    // yang paling BAWAH menimpa yang di atas, jadi `api.getTodayAttendance`
    // yang beneran jalan cuma versi TANPA ARGUMEN ini. Akibatnya
    // absensi.js -> loadTodayAttendance() (yang manggil
    // `api.getTodayAttendance(effectiveId)`, mengharap versi per-user)
    // ikut kepakai versi ini juga dan userId-nya KE-ABAIKAN begitu saja -
    // request ke backend jadi tanpa userId, backend balas gagal, dan
    // this.attendanceData jadi {} (kosong, termasuk field `date`-nya).
    // Begitu user coba absen, payload yang terkirim ke saveAttendance
    // kehilangan `date` sehingga backend menolak dengan pesan "userId and
    // date are required" - absen kelihatan tidak pernah tersimpan.
    // Diganti nama jadi getTodayAttendanceAll() supaya tidak lagi
    // tabrakan nama dengan getTodayAttendance(userId) di atas. Lihat juga
    // pembaruan pemanggil di dashboard.js dan case di Code.gs.
    async getTodayAttendanceAll() {
        if (!API_BASE_URL) {
            const todayStr = new Date().toISOString().split('T')[0];
            return { success: true, data: storage.get('attendance', []).filter(a => a.date === todayStr) };
        }
        return this.request('getTodayAttendanceAll');
    },

    // Sama seperti getTodayAttendance() tapi dipersempit lagi ke 1 userId -
    // dipakai notifications.js untuk cek sesi absen yang sudah/belum diisi
    // hari ini, tanpa perlu ikut download riwayat SEMUA karyawan.
    async getTodayAttendanceForUser(userId) {
        if (!API_BASE_URL) {
            const todayStr = new Date().toISOString().split('T')[0];
            return { success: true, data: storage.get('attendance', []).filter(a => a.date === todayStr && String(a.userId) === String(userId)) };
        }
        return this.request('getTodayAttendanceForUser', { userId });
    },

    async submitOutOfRadiusReport(data) {
        return this.request('submitOutOfRadiusReport', data);
    },
    async getOutOfRadiusReportsForApprover(approverId) {
        return this.request('getOutOfRadiusReportsForApprover', { approverId });
    },
    async getAllOutOfRadiusReports() {
        return this.request('getAllOutOfRadiusReports');
    },
    async approveOutOfRadiusReport(id, approver) {
        return this.request('approveOutOfRadiusReport', { id, approver });
    },
    async submitOutOfWilayahReport(data) {
        return this.request('submitOutOfWilayahReport', data);
    },
    async getAllOutOfWilayahReports() {
        return this.request('getAllOutOfWilayahReports');
    },
    async getOutOfWilayahReportsForUser(userId) {
        return this.request('getOutOfWilayahReportsForUser', { userId });
    },

    async submitSuratTugas(data) {
        return this.request('submitSuratTugas', data);
    },
    async getSuratTugas(userId) {
        return this.request('getSuratTugas', { userId });
    },
    async getAllSuratTugas() {
        return this.request('getAllSuratTugas');
    },
    async approveSuratTugas(id, approver, catatan) {
        return this.request('approveSuratTugas', { id, approver, catatan });
    },
    async rejectSuratTugas(id, approver, catatan) {
        return this.request('rejectSuratTugas', { id, approver, catatan });
    },

    // ========== LEAVES (CUTI) ==========

    async getLeaves(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('leaves', []) };
        }
        return this.request('getLeaves', { userId });
    },

    async submitLeave(data) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            data.id = Date.now();
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('leaves', all);
            return { success: true, data: data };
        }
        return this.request('submitLeave', data);
    },

    // Batalkan pengajuan cuti milik sendiri - HANYA jalan kalau statusnya
    // masih 'pending' (lihat cancelLeaveData() di Leave.gs).
    async cancelLeave(id, userId) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const filtered = all.filter(l => l.id !== id);
            storage.set('leaves', filtered);
            return { success: true, data: { id } };
        }
        return this.request('cancelLeave', { id, userId });
    },

    // Preview durasi cuti (hari kerja - Sabtu/Minggu/tanggal merah nasional
    // dikecualikan) SEBELUM submit, supaya angka yang tampil di form sudah
    // sama persis dengan yang nanti benar-benar dipotong dari kuota. Tidak
    // ada mode localStorage fallback (tanpa backend, cuma dipakai fallback
    // hitung mentah di cuti.js langsung).
    async previewLeaveDuration(startDate, endDate) {
        if (!API_BASE_URL) return { success: false, error: 'Backend tidak aktif' };
        return this.request('previewLeaveDuration', { startDate, endDate });
    },

    async approveLeave(id, approver, catatan) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) {
                if (approver?.role === 'manager') {
                    leave.status = 'manager_approved';
                    leave.managerName = approver.name; leave.managerNik = approver.nik;
                } else {
                    leave.status = 'approved';
                    leave.directorName = approver?.name; leave.directorNik = approver?.nik;
                }
                storage.set('leaves', all);
            }
            return { success: true, data: leave };
        }
        return this.request('approveLeave', { id, approver, catatan });
    },

    async rejectLeave(id, approver, catatan) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) { leave.status = 'rejected'; storage.set('leaves', all); }
            return { success: true, data: leave };
        }
        return this.request('rejectLeave', { id, approver, catatan });
    },

    // Direktur menunda keputusan (bukan setuju, bukan tolak) - dengan catatan
    // dan tanggal "Sampai dengan Tanggal ..."
    async postponeLeave(id, approver, catatan, tundaSampai) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) { leave.status = 'ditunda'; storage.set('leaves', all); }
            return { success: true, data: leave };
        }
        return this.request('postponeLeave', { id, approver, catatan, tundaSampai });
    },

    async getAllLeaves() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('leaves', []) };
        }
        return this.request('getAllLeaves');
    },

    // Sisa kuota Cuti Tahunan (dihitung server-side dari total cuti tahunan
    // yang sudah disetujui tahun berjalan)
    async getLeaveBalance(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: { tahun: new Date().getFullYear(), kuota: 12, terpakai: 0, sisa: 12 } };
        }
        return this.request('getLeaveBalance', { userId });
    },

    // Daftar tanggal merah nasional 1 tahun penuh ({ 'yyyy-MM-dd': 'Nama
    // Perayaan' }) - dipakai badge "tanggal merah" di halaman Absensi
    // (lihat absensi.js) & bisa dipakai lagi untuk kalender/laporan lain.
    async getHolidayDates(year) {
        if (!API_BASE_URL) {
            return { success: true, data: {} };
        }
        return this.request('getHolidayDates', { year: year || new Date().getFullYear() });
    },

    // ========== IZIN / PERMISSION ==========

    async getIzin(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('izin', []) };
        }
        return this.request('getIzin', { userId });
    },

    async submitIzin(data) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            data.id = Date.now();
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('izin', all);
            return { success: true, data: data };
        }
        return this.request('submitIzin', data);
    },

    // Batalkan pengajuan izin milik sendiri - HANYA jalan kalau statusnya
    // masih 'pending' (lihat cancelIzinData() di Izin.gs).
    async cancelIzin(id, userId) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const filtered = all.filter(i => i.id !== id);
            storage.set('izin', filtered);
            return { success: true, data: { id } };
        }
        return this.request('cancelIzin', { id, userId });
    },

    async approveIzin(id, approver, catatan) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) {
                if (approver?.role === 'manager') {
                    item.status = 'manager_approved';
                    item.managerName = approver.name; item.managerNik = approver.nik;
                } else {
                    item.status = 'approved';
                    item.directorName = approver?.name; item.directorNik = approver?.nik;
                }
                storage.set('izin', all);
            }
            return { success: true, data: item };
        }
        return this.request('approveIzin', { id, approver, catatan });
    },

    async rejectIzin(id, approver, catatan) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) { item.status = 'rejected'; storage.set('izin', all); }
            return { success: true, data: item };
        }
        return this.request('rejectIzin', { id, approver, catatan });
    },

    async getAllIzin() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('izin', []) };
        }
        return this.request('getAllIzin');
    },

    // Ambil daftar Asmen untuk 1 bagian tertentu, dipakai di dropdown "Pilih Asmen"
    // saat staff mengajukan izin.
    async getAsmenByBagian(bagian) {
        if (!API_BASE_URL) {
            return { success: true, data: [] };
        }
        return this.request('getAsmenByBagian', { bagian });
    },

    // Ambil daftar calon "Approver Absen Luar Radius" mengikuti jenjang
    // struktural (staff->Asmen bagian sama, asmen->Manajer bagian sama,
    // manajer->Direktur) - dipakai dropdown Approver di Edit/Tambah Karyawan.
    async getApproverCandidates(role, bagian) {
        if (!API_BASE_URL) {
            return { success: true, data: [] };
        }
        return this.request('getApproverCandidates', { role, bagian });
    },

    // ========== JOURNALS (JURNAL KERJA) ==========

    async getJournals(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            return { success: true, data: all.filter(j => String(j.userId) === String(userId)) };
        }
        return this.request('getJournals', { userId });
    },

    async saveJournal(data) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            const idx = all.findIndex(j => j.userId === data.userId && j.date === data.date);
            if (idx >= 0) { all[idx] = { ...all[idx], ...data }; } else { data.id = Date.now(); all.unshift(data); }
            storage.set('jurnals', all);
            return { success: true, data: data };
        }
        return this.request('saveJournal', data);
    },

    async getAllJournals() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('jurnals', []) };
        }
        return this.request('getAllJournals');
    },

    // ========== EMPLOYEES ==========

    async getEmployees() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('admin_employees', []) };
        }
        return this.request('getEmployees');
    },

    async addEmployee(data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            if (all.some(e => e.email === data.email)) {
                return { success: false, error: 'Email sudah terdaftar' };
            }
            data.id = Date.now();
            if (!data.avatar) {
                data.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=F59E0B&color=fff`;
            }
            all.unshift(data);
            storage.set('admin_employees', all);
            return { success: true, data: data };
        }
        return this.request('addEmployee', data);
    },

    async updateEmployee(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            const idx = all.findIndex(e => e.id === id);
            if (idx >= 0) { Object.assign(all[idx], data); storage.set('admin_employees', all); }
            return { success: true, data: all[idx] };
        }
        return this.request('updateEmployee', { id, ...data });
    },

    async deleteEmployee(id) {
        if (!API_BASE_URL) {
            let all = storage.get('admin_employees', []);
            all = all.filter(e => e.id !== id);
            storage.set('admin_employees', all);
            return { success: true, data: { id } };
        }
        return this.request('deleteEmployee', { id });
    },

    // ========== SETTINGS ==========

    async getSettings() {
        if (!API_BASE_URL) {
            const company = storage.get('company', { name: 'Portal Karyawan', logo: '' });
            return {
                success: true,
                data: { company_name: company.name, company_logo: company.logo }
            };
        }
        return this.request('getSettings');
    },

    // PERBAIKAN PERFORMA (2026-09-01) - lihat catatan lengkap di
    // getSettingByKey() (Setting.gs). Ambil HANYA 1 key setting (bukan
    // seluruh sheet Settings lewat getSettings()) - dipakai
    // jadwalJagaOperator.loadAndRender() supaya pindah Unit/Bulan/Tahun di
    // halaman Jadwal Jaga Operator tidak perlu baca ulang SELURUH sheet
    // Settings tiap kali.
    async getSettingByKey(key) {
        if (!API_BASE_URL) {
            return { success: true, data: null };
        }
        return this.request('getSettingByKey', { key });
    },

    async saveSetting(key, value) {
        if (!API_BASE_URL) {
            if (key === 'company_name' || key === 'company_logo') {
                const company = storage.get('company', { name: '', logo: '' });
                if (key === 'company_name') company.name = value;
                if (key === 'company_logo') company.logo = value;
                storage.set('company', company);
            }
            return { success: true, data: { key, value } };
        }
        return this.request('saveSetting', { key, value });
    },

    async saveSettingsBulk(settingsObj) {
        if (!API_BASE_URL) {
            Object.keys(settingsObj).forEach(key => {
                if (key === 'company_name' || key === 'company_logo') {
                    const company = storage.get('company', { name: '', logo: '' });
                    if (key === 'company_name') company.name = settingsObj[key];
                    if (key === 'company_logo') company.logo = settingsObj[key];
                    storage.set('company', company);
                }
            });
            return { success: true, data: settingsObj };
        }
        return this.request('saveSettingsBulk', { settings: settingsObj });
    },

    // ========== SCHEDULE ==========

    async getSchedule(month, year) {
        if (!API_BASE_URL) {
            const key = `schedule_${year}_${month}`;
            return { success: true, data: storage.get(key, {}) };
        }
        return this.request('getSchedule', { month, year });
    },

    async saveSchedule(data) {
        if (!API_BASE_URL) {
            const key = `schedule_${data.year}_${data.month}`;
            storage.set(key, data.schedule || {});
            return { success: true };
        }
        return this.request('saveSchedule', data);
    },

   // ========== LOCAL AUTH FALLBACK ==========

    _localLogin(email, password) {
        return { success: true, data: null };
    },

    _localFallback(action, data) {
        console.warn(`API Fallback: ${action} - using localStorage`);
        return { success: false, error: 'No fallback for action: ' + action };
    },

    // ========== KARYAWAN ==========
    async getKaryawanList() {
        return this.request('getKaryawanList', {});
    },
    async getKaryawanDetail(id) {
        return this.request('getKaryawanDetail', { id });
    },
    async addKaryawan(data) {
        return this.request('addKaryawan', data);
    },
    async updateKaryawan(id, data) {
        return this.request('updateKaryawan', { id, ...data });
    },
    async deleteKaryawan(id) {
        return this.request('deleteKaryawan', { id });
    },
    async uploadFotoKaryawan(id, base64Data, mimeType) {
        return this.request('uploadFotoKaryawan', { id, base64Data, mimeType });
    },
    async deleteFotoKaryawan(id) {
        return this.request('deleteFotoKaryawan', { id });
    },
    // Ambil isi 1 file Google Drive sebagai base64 - dipakai fitur pencocokan
    // wajah (face-recognition.js) supaya foto profil bisa dibaca pixel-nya
    // tanpa kena blokir CORS Google Drive (lihat catatan di Karyawan.gs
    // getDriveFileAsBase64).
    async getDriveFileAsBase64(url) {
        return this.request('getDriveFileAsBase64', { url });
    },
    async uploadFileSK(id, base64Data, mimeType, fileName) {
        return this.request('uploadFileSK', { id, base64Data, mimeType, fileName });
    },
    async uploadFileIzin(id, base64Data, mimeType, fileName) {
        return this.request('uploadFileIzin', { id, base64Data, mimeType, fileName });
    },

    // ========== KIRIM PDF SURAT VIA EMAIL ==========
    // PDF-nya sudah di-generate di frontend (persis tampilan "Cetak Surat"),
    // backend di sini cuma menerima base64-nya dan mengirim lewat Gmail.
    async sendSuratEmail(data) {
        return this.request('sendSuratEmail', data);
    },

    // ========== RIWAYAT PENDIDIKAN (link Google Drive Ijazah/Transkrip) ==========
    async getRiwayatPendidikan(userId) {
        return this.request('getRiwayatPendidikan', { userId });
    },
    async saveRiwayatPendidikan(data) {
        return this.request('saveRiwayatPendidikan', data);
    },
    async deleteRiwayatPendidikan(id) {
        return this.request('deleteRiwayatPendidikan', { id });
    },

    // ========== RIWAYAT MUTASI (link Google Drive Dokumen SK Mutasi) ==========
    async getRiwayatMutasi(userId) {
        return this.request('getRiwayatMutasi', { userId });
    },
    async saveRiwayatMutasi(data) {
        return this.request('saveRiwayatMutasi', data);
    },
    async deleteRiwayatMutasi(id) {
        return this.request('deleteRiwayatMutasi', { id });
    },

    // ========== RIWAYAT KGB / KENAIKAN GAJI BERKALA ==========
    async getRiwayatKgb(userId) {
        return this.request('getRiwayatKgb', { userId });
    },
    async saveRiwayatKgb(data) {
        return this.request('saveRiwayatKgb', data);
    },
    async deleteRiwayatKgb(id) {
        return this.request('deleteRiwayatKgb', { id });
    },

    // ========== RIWAYAT GOLONGAN ==========
    async getRiwayatGolongan(userId) {
        return this.request('getRiwayatGolongan', { userId });
    },
    async saveRiwayatGolongan(data) {
        return this.request('saveRiwayatGolongan', data);
    },
    async deleteRiwayatGolongan(id) {
        return this.request('deleteRiwayatGolongan', { id });
    },

    // ========== RIWAYAT KARYAWAN (link Google Drive Dokumen SK CAPEG) ==========
    async getRiwayatKaryawan(userId) {
        return this.request('getRiwayatKaryawan', { userId });
    },
    async saveRiwayatKaryawan(data) {
        return this.request('saveRiwayatKaryawan', data);
    },
    async deleteRiwayatKaryawan(id) {
        return this.request('deleteRiwayatKaryawan', { id });
    }

};  // ← penutup object api

// Expose to global
window.api = api;

// Helper: always return a valid avatar URL
window.getAvatarUrl = function (emp) {
    if (emp && emp.avatar && emp.avatar.startsWith('http')) {
        return emp.avatar;
    }
    const name = (emp && emp.name) ? emp.name : 'User';
    const colors = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', 'EC4899', '14B8A6', '6B7280'];
    const colorIdx = name.charCodeAt(0) % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIdx]}&color=fff`;
};
