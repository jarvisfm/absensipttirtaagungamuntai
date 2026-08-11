/**
 * Portal Karyawan - Push Notification (Firebase Cloud Messaging) & Reminder
 * Absensi Otomatis.
 *
 * SETUP WAJIB SEBELUM FITUR INI BISA MENGIRIM NOTIFIKASI (sekali saja):
 * Buka Apps Script Editor > Project Settings (ikon gerigi) > Script
 * Properties > Add script property, isi 3 baris berikut (dari file JSON
 * "service account" yang diunduh dari Firebase Console > Project Settings >
 * Service accounts > Generate new private key):
 *   FCM_PROJECT_ID     = project_id
 *   FCM_CLIENT_EMAIL   = client_email
 *   FCM_PRIVATE_KEY    = private_key  (termasuk baris "-----BEGIN PRIVATE
 *                         KEY-----" dan "-----END PRIVATE KEY-----", apa
 *                         adanya persis dari file JSON)
 *
 * SENGAJA disimpan di Script Properties (bukan ditulis langsung di file
 * .gs ini) - private_key itu KUNCI RAHASIA yang bisa dipakai siapa saja
 * mengirim notifikasi atas nama app ini kalau bocor. Script Properties
 * tidak ikut ke-lihat kalau file .gs ini di-export/di-backup/dibagikan.
 *
 * Setelah Script Properties diisi, jalankan SEKALI SAJA fungsi
 * installAttendanceReminderTrigger() (pilih di dropdown fungsi Apps Script
 * Editor, klik Run) untuk mengaktifkan pengecekan reminder otomatis
 * setiap 10 menit.
 */

// ===================== Penyimpanan token per karyawan =====================

/**
 * Daftarkan/perbarui token FCM 1 perangkat untuk 1 karyawan. Dipanggil dari
 * tombol "Aktifkan Notifikasi HP" di Edit Profil > Akun (lihat
 * push-notifications.js requestPermission()). 1 karyawan bisa punya lebih
 * dari 1 token (login di beberapa HP/browser sekaligus).
 */
function savePushTokenData(userId, token, device) {
  if (!userId || !token) return { success: false, error: 'Data tidak lengkap' };

  ensureColumns('Employees', ['pushTokens']);
  const emp = findRow('Employees', 'id', String(userId)) || findRow('Employees', 'id', Number(userId));
  if (!emp) return { success: false, error: 'Karyawan tidak ditemukan' };

  let tokens = [];
  try { tokens = emp.pushTokens ? JSON.parse(emp.pushTokens) : []; } catch (e) { tokens = []; }
  if (!Array.isArray(tokens)) tokens = [];

  // Buang entri lama dengan token yang persis sama (kalau daftar ulang di
  // perangkat yang sama), baru tambahkan sebagai entri baru/terbaru.
  tokens = tokens.filter(function (t) { return t.token !== token; });
  tokens.push({ token: token, device: device || '', savedAt: new Date().toISOString() });

  updateRow('Employees', emp.id, { pushTokens: JSON.stringify(tokens) });
  return { success: true };
}

/**
 * Hapus 1 token (dipanggil saat karyawan matikan notifikasi di perangkat
 * ini, atau saat logout - lihat push-notifications.js unregister()). Cari
 * di SEMUA karyawan karena pemanggil cuma tahu token-nya, belum tentu tahu
 * lagi siapa pemiliknya saat ini.
 */
function deletePushTokenData(token) {
  if (!token) return { success: false, error: 'Token tidak valid' };

  const employees = getAllRows('Employees');
  let removed = false;
  employees.forEach(function (emp) {
    if (!emp.pushTokens) return;
    let tokens;
    try { tokens = JSON.parse(emp.pushTokens); } catch (e) { return; }
    if (!Array.isArray(tokens) || !tokens.length) return;

    const filtered = tokens.filter(function (t) { return t.token !== token; });
    if (filtered.length !== tokens.length) {
      updateRow('Employees', emp.id, { pushTokens: JSON.stringify(filtered) });
      removed = true;
    }
  });

  return { success: true, removed: removed };
}

// ===================== Kirim notifikasi (FCM HTTP v1) =====================

/**
 * Ambil OAuth2 access token pakai kredensial Service Account (JWT
 * self-signed, ditandatangani RSA-SHA256 pakai private key dari Script
 * Properties) - Google MEMATIKAN API kirim FCM cara lama (server key)
 * sejak Juni 2024, jadi ini satu-satunya cara yang masih berlaku, dan tidak
 * butuh library tambahan apa pun (Utilities.computeRsaSha256Signature bawaan
 * Apps Script).
 *
 * Access token di-cache 55 menit (masa berlaku aslinya 60 menit) supaya
 * trigger yang jalan tiap 10 menit tidak perlu tanda-tangan JWT baru tiap
 * kali kalau masih dalam masa berlaku yang sama.
 */
function _getFcmAccessToken() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm_access_token');
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty('FCM_CLIENT_EMAIL');
  // PENTING: kalau private key ditempel ke Script Properties lewat kotak
  // teks 1 baris (cara paling umum copy-paste dari file JSON service
  // account), baris barunya kebawa sebagai TEKS LITERAL "\n" (2 karakter:
  // backslash + huruf n), BUKAN baris baru sungguhan. Utilities.
  // computeRsaSha256Signature() WAJIB terima PEM dengan baris baru asli -
  // tanpa .replace() ini, tanda tangan JWT gagal total (selalu dianggap
  // "invalid_grant" oleh Google walau isi key-nya sudah benar persis).
  const privateKeyRaw = props.getProperty('FCM_PRIVATE_KEY');
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw;
  if (!clientEmail || !privateKey) {
    throw new Error('FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY belum diisi di Script Properties. Lihat catatan setup di atas file PushNotification.gs.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };

  function base64url(obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  }

  const toSign = base64url(header) + '.' + base64url(claimSet);
  const signatureBytes = Utilities.computeRsaSha256Signature(toSign, privateKey);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');
  const jwt = toSign + '.' + signature;

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  let result;
  try { result = JSON.parse(response.getContentText()); } catch (e) { result = {}; }
  if (!result.access_token) {
    throw new Error('Gagal mendapat access token FCM: ' + response.getContentText());
  }

  cache.put('fcm_access_token', result.access_token, Math.min((result.expires_in || 3600) - 300, 1800));
  return result.access_token;
}

/**
 * Kirim 1 notifikasi ke 1 token perangkat via FCM HTTP v1 API.
 * Return { ok: true } kalau sukses, atau { ok:false, invalidToken:bool,
 * error } kalau gagal - invalidToken dipakai sendPushToEmployee() untuk
 * otomatis membuang token yang sudah tidak berlaku (mis. app di-uninstall).
 */
function _sendFcmPushToToken(token, title, body, data) {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FCM_PROJECT_ID');
  if (!projectId) throw new Error('FCM_PROJECT_ID belum diisi di Script Properties.');

  const accessToken = _getFcmAccessToken();
  const url = 'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send';

  const payload = {
    message: {
      token: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: {
        notification: { icon: 'assets/icons/icon-192.png' },
        fcm_options: { link: '/' }
      }
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code >= 200 && code < 300) return { ok: true };

  const bodyText = response.getContentText();
  const invalidToken = bodyText.indexOf('UNREGISTERED') !== -1
    || bodyText.indexOf('NOT_FOUND') !== -1
    || bodyText.indexOf('INVALID_ARGUMENT') !== -1;
  return { ok: false, invalidToken: invalidToken, error: bodyText };
}

/**
 * Kirim notifikasi ke SEMUA perangkat terdaftar milik 1 karyawan. Token yang
 * ternyata sudah tidak valid otomatis dibuang dari daftar (self-cleaning),
 * supaya daftar token tidak menumpuk sampah selamanya.
 */
function sendPushToEmployee(employeeId, title, body, data) {
  const emp = findRow('Employees', 'id', String(employeeId)) || findRow('Employees', 'id', Number(employeeId));
  if (!emp || !emp.pushTokens) return { success: false, error: 'Karyawan tidak ditemukan / belum ada perangkat terdaftar' };

  let tokens;
  try { tokens = JSON.parse(emp.pushTokens); } catch (e) { tokens = []; }
  if (!Array.isArray(tokens) || !tokens.length) return { success: false, error: 'Belum ada perangkat terdaftar' };

  const stillValid = [];
  let anySent = false;
  let lastError = null;
  tokens.forEach(function (t) {
    try {
      const result = _sendFcmPushToToken(t.token, title, body, data);
      if (result.ok) anySent = true;
      if (!result.ok) lastError = result.error;
      if (!result.ok && result.invalidToken) return; // dibuang, tidak dimasukkan lagi
      stillValid.push(t);
    } catch (e) {
      console.error('Gagal kirim push ke salah satu perangkat:', e);
      lastError = String(e && e.message ? e.message : e);
      stillValid.push(t); // gagal karena error lain (mis. Script Properties belum diisi) - jangan buang tokennya
    }
  });

  if (stillValid.length !== tokens.length) {
    updateRow('Employees', emp.id, { pushTokens: JSON.stringify(stillValid) });
  }

  // PENTING: sertakan pesan error asli (bukan cuma success:false) supaya
  // kegagalan (mis. Script Properties belum benar, JWT ditolak Google, dst)
  // langsung kelihatan di toast pemanggil (lihat pushNotif.sendTestNotification()
  // di push-notifications.js) - tidak perlu bongkar Execution log Apps
  // Script tiap kali cuma untuk tahu "kenapa gagal".
  return anySent ? { success: true } : { success: false, error: lastError || 'Gagal mengirim ke semua perangkat terdaftar.' };
}

// ===================== Reminder absensi otomatis per shift =====================

/**
 * Tentukan jam masuk (HH:mm) yang berlaku untuk 1 karyawan HARI INI, atau
 * null kalau karyawan itu tidak ada jadwal kerja hari ini (libur/tidak
 * terjadwal jaga). SENGAJA meniru persis logika _determineStatus() di
 * Attendance.gs (dipakai untuk cek "Terlambat" saat clock-in) tapi versi
 * PREDIKTIF - dipanggil SEBELUM karyawan absen (untuk reminder), bukan
 * sesudah. Reuse fungsi yang sama (_lookupShiftConfig, checkOperatorRosterForToday,
 * _pickActiveOperatorShiftKey, _getDayOfWeekSafe) dari Attendance.gs/
 * Operatorschdule.gs supaya jam yang dipakai reminder selalu konsisten
 * dengan jam yang dipakai penentuan "Terlambat" - tidak dobel logika yang
 * bisa saling melenceng kalau salah satu diubah belakangan tanpa mengubah
 * yang lain.
 */
function _getExpectedShiftStartForToday(employee, now) {
  const shiftTypesConfig = getShiftTypesConfig();
  const shiftConfig = _lookupShiftConfig(shiftTypesConfig, employee.shift);
  const todayDay = _getDayOfWeekSafe(now);

  if (shiftConfig.rosterCheck) {
    // Unit Operator/SATPAM/BNA Amuntai dsb - HARUS benar-benar terjadwal
    // jaga hari ini (lihat Jadwal Jaga Operator), bukan cuma soal hari apa.
    const rosterResult = checkOperatorRosterForToday(employee, now);
    if (!rosterResult.ok) return null;

    if (rosterResult.patternType === 'multi-grup' || rosterResult.patternType === 'multi-solo') {
      const activeKey = _pickActiveOperatorShiftKey(shiftConfig.shiftOptions, rosterResult.matchedShiftKeys, now);
      const shiftOption = activeKey ? (shiftConfig.shiftOptions || {})[activeKey] : null;
      if (!shiftOption) return null;
      return shiftOption.batasLambat || (shiftOption.sessions && shiftOption.sessions[0] && shiftOption.sessions[0].time) || null;
    }

    // kontinu/kontinu-split - cuma 1 sesi per hari, dayGroups[0] berlaku
    // untuk semua hari (lihat pola yang sama di _determineStatus()).
    const dayGroup = (shiftConfig.dayGroups || [])[0];
    if (!dayGroup) return null;
    return dayGroup.batasLambat || (dayGroup.sessions && dayGroup.sessions[0] && dayGroup.sessions[0].time) || null;
  }

  // Jenis Jadwal biasa (Reguler, Jaga Malam, dst) - dayGroup dicari
  // berdasarkan hari-dalam-minggu.
  const dayGroup = (shiftConfig.dayGroups || []).find(function (g) { return (g.days || []).indexOf(todayDay) !== -1; });
  if (!dayGroup || dayGroup.libur || !dayGroup.sessions || !dayGroup.sessions.length) return null;
  return dayGroup.batasLambat || dayGroup.sessions[0].time || null;
}

// Jendela pengiriman reminder: dikirim SEKALI dalam N menit pertama SETELAH
// jam masuk terlewati (bukan sebelum jam masuk - supaya tidak mengganggu
// karyawan yang memang berniat absen mepet/on-time, cuma menegur yang
// benar-benar sudah terlambat & lupa).
const REMINDER_WINDOW_MINUTES = 10;

/**
 * Fungsi utama reminder - dipanggil otomatis oleh time-based trigger tiap
 * 10 menit (lihat installAttendanceReminderTrigger() di bawah). Cek SEMUA
 * karyawan aktif: kalau jam masuk shift-nya hari ini sudah lewat (dalam
 * jendela REMINDER_WINDOW_MENIT menit terakhir) dan belum Clock In, kirim
 * 1x notifikasi pengingat.
 */
function runAttendanceReminderCheck() {
  const now = new Date();
  const tz = 'Asia/Makassar';
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const nowMinutes = _getMinutesOfDaySafe(now);
  const cache = CacheService.getScriptCache();

  const employees = getAllRows('Employees').filter(function (e) {
    return String(e.statusKaryawan || '').toUpperCase() === 'AKTIF';
  });
  const attendanceToday = _getAllAttendanceRowsRaw().filter(function (r) { return r.date === today; });

  employees.forEach(function (emp) {
    try {
      const startTime = _getExpectedShiftStartForToday(emp, now);
      if (!startTime) return; // tidak ada jadwal kerja hari ini

      const startMinutes = _toMinutes(startTime);
      const diff = nowMinutes - startMinutes;
      if (diff < 0 || diff >= REMINDER_WINDOW_MINUTES) return; // belum waktunya / sudah lewat jendela

      const sudahAbsen = attendanceToday.some(function (r) {
        return String(r.userId) === String(emp.id) && r.clockIn;
      });
      if (sudahAbsen) return;

      // Cegah kirim dobel - trigger jalan tiap 10 menit, jadi 1 karyawan
      // bisa "kena" jendela yang sama lebih dari sekali kalau tidak dicegah.
      const cacheKey = 'reminder_sent_' + emp.id + '_' + today;
      if (cache.get(cacheKey)) return;
      cache.put(cacheKey, '1', 21600); // 6 jam - lebih dari cukup utk 1 hari kerja

      sendPushToEmployee(
        emp.id,
        'Pengingat Absensi',
        'Jam masuk Anda (' + startTime + ') sudah lewat dan belum Clock In. Jangan lupa absen ya!'
      );
    } catch (e) {
      console.error('Gagal cek reminder absensi untuk karyawan id=' + emp.id + ':', e);
    }
  });
}

/**
 * JALANKAN FUNGSI INI SEKALI SAJA secara manual dari Apps Script Editor
 * (pilih "installAttendanceReminderTrigger" di dropdown fungsi atas, lalu
 * klik Run) untuk mengaktifkan pengecekan reminder otomatis tiap 10 menit.
 * Aman dijalankan berkali-kali - trigger lama dengan handler yang sama
 * dihapus dulu supaya tidak menumpuk jadi banyak trigger duplikat.
 */
function installAttendanceReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runAttendanceReminderCheck') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('runAttendanceReminderCheck')
    .timeBased()
    .everyMinutes(10)
    .create();
}
