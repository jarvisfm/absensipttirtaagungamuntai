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

    // ========== SHIFTS ==========

    async getShifts() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('shifts', []) };
        }
        return this.request('getShifts');
    },

    async addShift(data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            data.id = Date.now();
            all.push(data);
            storage.set('shifts', all);
            return { success: true, data: data };
        }
        return this.request('addShift', data);
    },

    async updateShift(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            const idx = all.findIndex(s => s.id === id || s.id === Number(id));
            if (idx >= 0) { Object.assign(all[idx], data); storage.set('shifts', all); }
            return { success: true, data: all[idx] };
        }
        return this.request('updateShift', { id, ...data });
    },

    async deleteShift(id) {
        if (!API_BASE_URL) {
            let all = storage.get('shifts', []);
            all = all.filter(s => s.id !== id && s.id !== Number(id));
            storage.set('shifts', all);
            return { success: true, data: { id } };
        }
        return this.request('deleteShift', { id });
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
    async uploadFileSK(id, base64Data, mimeType, fileName) {
        return this.request('uploadFileSK', { id, base64Data, mimeType, fileName });
    },
    async uploadFileIzin(id, base64Data, mimeType, fileName) {
        return this.request('uploadFileIzin', { id, base64Data, mimeType, fileName });
    },

    // ========== DOKUMEN (TAUTAN DRIVE BERNAMA) ==========
    async getDocumentLinks(employeeId) {
        return this.request('getDocumentLinks', { employeeId });
    },
    async addDocumentLink(data) {
        return this.request('addDocumentLink', data);
    },
    async deleteDocumentLink(id) {
        return this.request('deleteDocumentLink', { id });
    },

    async getRiwayatPendidikan(userId) {
        return this.request('getRiwayatPendidikan', { userId });
    },
    async saveRiwayatPendidikan(data) {
        return this.request('saveRiwayatPendidikan', data);
    },
    async deleteRiwayatPendidikan(id) {
        return this.request('deleteRiwayatPendidikan', { id });
    },

    // ========== KIRIM PDF SURAT VIA EMAIL ==========
    // PDF-nya sudah di-generate di frontend (persis tampilan "Cetak Surat"),
    // backend di sini cuma menerima base64-nya dan mengirim lewat Gmail.
    async sendSuratEmail(data) {
        return this.request('sendSuratEmail', data);
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
