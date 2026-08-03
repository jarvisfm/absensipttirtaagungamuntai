/**
 * Portal Karyawan - Izin / Sakit / Keluar Kantor
 * Mendukung 2 jenis surat:
 *  - Surat Permohonan Izin biasa (type: 'sick' | 'permission' | 'emergency')
 *  - Surat Izin Keluar Kantor (type: 'keluar_kantor', dengan jamKeluar & jamMasuk)
 */

function getIzinData(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  const rows = findRows('Izin', 'userId', userId);
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  return { success: true, data: rows };
}

function getAllIzinData() {
  const rows = getAllRows('Izin');
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  return { success: true, data: rows };
}

function submitIzinData(data) {
  if (!data.userId || !data.type) {
    return { success: false, error: 'Required fields missing' };
  }

  ensureColumns('Izin', [
    'dateEnd', 'bagian',
    'jamKeluar', 'jamMasuk',
    'asmenId', 'asmenName', 'asmenNik', 'asmenApprovedAt', 'asmenNote',
    'managerName', 'managerNik', 'managerApprovedAt', 'managerNote',
    'hrManagerName', 'hrManagerNik', 'hrManagerApprovedAt', 'hrManagerNote',
    'directorName', 'directorNik', 'directorApprovedAt', 'directorNote',
    'rejectedBy', 'rejectedByRole', 'rejectedAt', 'rejectedNote'
  ]);

  // Ambil bagian pemohon dari data karyawan, jangan percaya kiriman client
  const pemohon = findRow('Employees', 'id', String(data.userId));
  data.bagian = pemohon ? (pemohon.bagian || '') : '';

  // Wajib pilih Asmen HANYA untuk Surat Permohonan Izin (izin_harian) yang
  // diajukan staff. Izin Keluar Kantor/Sakit/dll tidak perlu Asmen sama sekali
  // — alurnya beda, lihat approveIzinData().
  if (pemohon && pemohon.role === 'staff' && data.type === 'izin_harian') {
    if (!data.asmenId) {
      return { success: false, error: 'Silakan pilih Asisten Manajer penyetuju' };
    }
    const asmen = findRow('Employees', 'id', String(data.asmenId));
    if (!asmen || asmen.role !== 'asmen' || String(asmen.bagian) !== String(data.bagian)) {
      return { success: false, error: 'Asmen yang dipilih tidak valid untuk bagian ini' };
    }
    data.asmenId = asmen.id;
  }

  // Kunci proses ambil ID + tulis baris supaya 2 request yang nyaris bersamaan
  // tidak pernah dapat ID yang sama (mencegah data dobel/ID bentrok).
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    data.id = getNextId('Izin');
    data.status = 'pending';
    data.appliedAt = new Date().toISOString();

    addRow('Izin', data);
    return { success: true, data: data };
  } finally {
    lock.releaseLock();
  }
}

/**
 * approver: { id, name, nik, role, bagian } - role 'asmen', 'manajer', 'direktur', atau 'admin'
 *
 * Ada 4 alur berbeda tergantung ROLE SI PEMOHON (bukan cuma status surat)
 * - ini SEMUA untuk type 'izin_harian' (Surat Permohonan Izin biasa). Untuk
 * type 'keluar_kantor' (Surat Izin Keluar Kantor), alur TERPISAH & lebih
 * sederhana - lihat blok "if (izin.type === 'keluar_kantor')" di bawah:
 * pending -> (Manajer bagian yang SAMA dengan pemohon) -> manajer_approved
 * -> (Direktur) -> approved. Kalau pemohonnya sendiri Manajer, tahap
 * Manajer dilewati (langsung ke Direktur) - sama seperti aturan pemohon
 * Manajer di alur Izin Harian di bawah ini.
 *
 * 1) Pemohon STAFF:
 *    pending -> (asmen pilihan staff) -> asmen_approved
 *            -> (manajer bagian staff itu) -> manajer_approved
 *            -> (direktur) -> approved
 *
 * 2) Pemohon ASMEN, bagian != UMUM DAN KEPEGAWAIAN:
 *    pending -> (Manajer bidang Asmen itu sendiri) -> manajer_bidang_approved
 *            -> (Manajer Umum & Kepegawaian - HR) -> manajer_approved
 *            -> (direktur) -> approved
 *
 * 3) Pemohon ASMEN dari bagian UMUM DAN KEPEGAWAIAN sendiri:
 *    pending -> (Manajer Umum & Kepegawaian - orang yang sama dengan manajer
 *                bidangnya sendiri, jadi cukup 1x approval sebagai
 *                representasi, tidak dobel) -> manajer_approved
 *            -> (direktur) -> approved
 *
 * 4) Pemohon MANAJER (bagian manapun):
 *    pending -> (direktur langsung, tahap manajer dilewati sama sekali) -> approved
 */
var BAGIAN_UMUM_KEPEGAWAIAN = 'UMUM DAN KEPEGAWAIAN';

function approveIzinData(id, approver, catatan) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  approver = approver || {};
  const now = new Date().toISOString();

  const izin = findRow('Izin', 'id', String(id));
  if (!izin) return { success: false, error: 'Izin not found' };

  // Surat Izin Keluar Kantor: sekarang melalui tahap Manajer (bagian yang
  // SAMA dengan pemohon) dulu, baru Direktur - kecuali pemohonnya sendiri
  // seorang Manajer (tidak masuk akal approve diri sendiri), langsung ke
  // Direktur seperti alur Izin Harian untuk pemohon Manajer.
  if (izin.type === 'keluar_kantor') {
    const pemohonKK = findRow('Employees', 'id', String(izin.userId)) || {};
    const pemohonRoleKK = pemohonKK.role || 'staff';
    const pemohonBagianKK = String(pemohonKK.bagian || '').toUpperCase().trim();
    const skipManagerStageKK = pemohonRoleKK === 'manajer';

    if (approver.role === 'manajer') {
      if (skipManagerStageKK) {
        return { success: false, error: 'Pengajuan ini langsung ke Direktur, tidak melalui tahap Manajer' };
      }
      if (izin.status !== 'pending') {
        return { success: false, error: 'Surat sudah diproses, tidak bisa disetujui Manajer lagi' };
      }
      const approverBagianKK = String(approver.bagian || '').toUpperCase().trim();
      if (approverBagianKK !== pemohonBagianKK) {
        return { success: false, error: 'Surat ini bukan dari bagian Anda' };
      }
      const patchManajerKK = {
        status: 'manajer_approved',
        managerName: approver.name || '',
        managerNik: approver.nik || '',
        managerApprovedAt: now,
        managerNote: catatan || ''
      };
      const updatedManajerKK = updateRow('Izin', id, patchManajerKK);
      if (updatedManajerKK) return { success: true, data: updatedManajerKK };
      return { success: false, error: 'Izin not found' };
    }

    if (approver.role !== 'direktur' && approver.role !== 'admin') {
      return { success: false, error: 'Izin Keluar Kantor menunggu tahap Manajer/Direktur' };
    }
    const expectedStatusKK = skipManagerStageKK ? 'pending' : 'manajer_approved';
    if (izin.status !== expectedStatusKK) {
      return { success: false, error: skipManagerStageKK ? 'Surat sudah diproses' : 'Surat belum disetujui Manajer' };
    }
    const patchKeluarKantor = {
      status: 'approved',
      directorName: approver.name || '',
      directorNik: approver.nik || '',
      directorApprovedAt: now,
      directorNote: catatan || ''
    };
    const updatedKeluarKantor = updateRow('Izin', id, patchKeluarKantor);
    if (updatedKeluarKantor) {
      if (updatedKeluarKantor.jamMasuk === 'Pulang') {
        // Mode "Sampai Pulang" (tidak balik lagi ke kantor) - begitu
        // disetujui, sesi Pulang hari itu otomatis terisi, karyawan tidak
        // perlu Clock Out manual karena memang tidak kembali ke kantor.
        _markSessionAsExcused(
          updatedKeluarKantor.userId, updatedKeluarKantor.date, 'clockOut',
          'Izin Keluar Kantor', 'keluar_kantor', updatedKeluarKantor.id
        );
      } else if (updatedKeluarKantor.jamKeluar && updatedKeluarKantor.jamMasuk) {
        // Mode "Jam" (balik lagi jam tertentu) - kalau rentang Jam Keluar
        // s.d. Jam Masuk-nya MELEWATI jam Istirahat Keluar terjadwal
        // (dicocokkan ke jadwal shift ASLI karyawan itu di TANGGAL izin-nya,
        // bukan tanggal approval), karyawan tidak sempat absen Istirahat
        // Keluar karena sedang di luar kantor - excuse sesi itu saja.
        // Kembali Istirahat TETAP absen normal seperti biasa begitu
        // karyawan benar-benar kembali ke kantor.
        try {
          const scheduleKK = checkAttendanceAccess(updatedKeluarKantor.userId, null, updatedKeluarKantor.date);
          if (scheduleKK.success && scheduleKK.data.canAccess) {
            const breakSession = (scheduleKK.data.sessions || []).find(s => s.field === 'breakStart');
            if (breakSession &&
                updatedKeluarKantor.jamKeluar <= breakSession.time &&
                updatedKeluarKantor.jamMasuk > breakSession.time) {
              _markSessionAsExcused(
                updatedKeluarKantor.userId, updatedKeluarKantor.date, 'breakStart',
                'Izin Keluar Kantor', 'keluar_kantor', updatedKeluarKantor.id
              );
            }
          }
        } catch (e) {
          // Gagal cek jadwal (mis. karyawan sudah tidak aktif) - jangan
          // sampai membatalkan approval yang sudah berhasil, cukup lewati.
        }
      }
      // PDF surat digenerate & dikirim dari FRONTEND (persis tampilan
      // "Cetak Surat"), lalu diteruskan ke sendSuratEmailData() di
      // Mailer.gs - lihat printLetters.sendSuratEmailIfApproved() di
      // print-letters.js. Di sini cukup balikin hasil approve-nya saja.
      return { success: true, data: updatedKeluarKantor };
    }
    return { success: false, error: 'Izin not found' };
  }

  const pemohon = findRow('Employees', 'id', String(izin.userId)) || {};
  const pemohonRole = pemohon.role || 'staff';
  const pemohonBagian = String(pemohon.bagian || '').toUpperCase().trim();
  const isPemohonHrAsmen = pemohonRole === 'asmen' && pemohonBagian === BAGIAN_UMUM_KEPEGAWAIAN;

  // HANYA pemohon Manajer yang langsung ke Direktur tanpa tahap Manajer sama
  // sekali. Asmen dari bagian Umum & Kepegawaian sendiri TETAP melalui 1 kali
  // approval Manajer (representasi tunggal — karena manajer bidangnya dan
  // Manajer Umum & Kepegawaian adalah orang yang sama, jadi tidak perlu dobel).
  const skipManagerStage = pemohonRole === 'manajer';

  let patch;

  if (approver.role === 'asmen') {
    // Tahap Asmen cuma berlaku untuk pengajuan STAFF (yang lain sudah level
    // Asmen/Manajer sendiri, tidak butuh approval Asmen).
    if (pemohonRole !== 'staff') {
      return { success: false, error: 'Tahap Asmen tidak berlaku untuk pengajuan ini' };
    }
    if (izin.status !== 'pending') {
      return { success: false, error: 'Surat sudah diproses, tidak bisa disetujui Asmen lagi' };
    }
    patch = {
      status: 'asmen_approved',
      asmenName: approver.name || '',
      asmenNik: approver.nik || '',
      asmenApprovedAt: now,
      asmenNote: catatan || ''
    };

  } else if (approver.role === 'manajer') {
    if (skipManagerStage) {
      return { success: false, error: 'Pengajuan ini langsung ke Direktur, tidak melalui tahap Manajer' };
    }
    const approverBagian = String(approver.bagian || '').toUpperCase().trim();

    if (pemohonRole === 'staff') {
      // Manajer bagian yang sama dengan staff pemohon
      if (izin.status !== 'asmen_approved') {
        return { success: false, error: 'Surat belum disetujui Asmen' };
      }
      if (approverBagian !== pemohonBagian) {
        return { success: false, error: 'Surat ini bukan dari bagian Anda' };
      }
      patch = {
        status: 'manajer_approved',
        managerName: approver.name || '',
        managerNik: approver.nik || '',
        managerApprovedAt: now,
        managerNote: catatan || ''
      };

    } else if (pemohonRole === 'asmen' && isPemohonHrAsmen) {
      // Asmen dari Umum & Kepegawaian SENDIRI: manajer bidangnya = Manajer
      // Umum & Kepegawaian (orang yang sama) -> cukup SATU kali approval
      // saja sebagai representasi, tidak perlu dobel dari orang yang sama.
      if (izin.status !== 'pending') {
        return { success: false, error: 'Surat sudah diproses' };
      }
      if (approverBagian !== BAGIAN_UMUM_KEPEGAWAIAN) {
        return { success: false, error: 'Hanya Manajer Umum & Kepegawaian yang bisa menyetujui izin ini' };
      }
      patch = {
        status: 'manajer_approved',
        managerName: approver.name || '',
        managerNik: approver.nik || '',
        managerApprovedAt: now,
        managerNote: catatan || ''
      };

    } else if (pemohonRole === 'asmen') {
      // Asmen bagian LAIN (bukan Umum & Kepegawaian) -> 2 tahap manajer
      // berurutan: (1) Manajer bidang Asmen itu sendiri dulu, baru
      // (2) Manajer Umum & Kepegawaian (HR) sebagai tahap terakhir.
      if (izin.status === 'pending') {
        // Tahap 1: Manajer bidang si Asmen
        if (approverBagian !== pemohonBagian) {
          return { success: false, error: 'Surat ini bukan dari bagian Anda' };
        }
        patch = {
          status: 'manajer_bidang_approved',
          managerName: approver.name || '',
          managerNik: approver.nik || '',
          managerApprovedAt: now,
          managerNote: catatan || ''
        };
      } else if (izin.status === 'manajer_bidang_approved') {
        // Tahap 2: Manajer Umum & Kepegawaian (HR)
        if (approverBagian !== BAGIAN_UMUM_KEPEGAWAIAN) {
          return { success: false, error: 'Surat ini menunggu persetujuan Manajer Umum & Kepegawaian' };
        }
        patch = {
          status: 'manajer_approved',
          hrManagerName: approver.name || '',
          hrManagerNik: approver.nik || '',
          hrManagerApprovedAt: now,
          hrManagerNote: catatan || ''
        };
      } else {
        return { success: false, error: 'Surat sudah diproses' };
      }

    } else {
      return { success: false, error: 'Tahap Manajer tidak berlaku untuk pengajuan ini' };
    }

  } else if (approver.role === 'direktur' || approver.role === 'admin') {
    const requiredStatus = skipManagerStage ? 'pending' : 'manajer_approved';
    if (izin.status !== requiredStatus) {
      return {
        success: false,
        error: skipManagerStage
          ? 'Surat sudah diproses'
          : 'Surat belum disetujui Manajer'
      };
    }
    patch = {
      status: 'approved',
      directorName: approver.name || '',
      directorNik: approver.nik || '',
      directorApprovedAt: now,
      directorNote: catatan || ''
    };
  } else {
    return { success: false, error: 'Role approver tidak dikenali: ' + approver.role };
  }

  const updated = updateRow('Izin', id, patch);
  if (updated) {
    // Izin Harian/Sakit yang sudah disetujui PENUH (Direktur) - tandai
    // rentang tanggalnya di Attendance pakai label JENISNYA SENDIRI (mis.
    // "Permohonan Izin Harian" atau "Sakit", dari typeLabel), bukan teks
    // generik "Izin" - supaya Riwayat Absensi & rekap jelas menunjukkan
    // izin jenis apa yang disetujui. Keluar Kantor TIDAK ikut - itu cuma
    // keluar sebentar, karyawan tetap absen normal untuk hari itu (lihat
    // penanganan terpisah untuk keluar_kantor di bawah).
    if (updated.status === 'approved' && updated.type !== 'keluar_kantor') {
      // typeLabel kadang kosong/tidak tersimpan, jadi jangan cuma andalkan
      // itu - turunkan juga dari field 'type' (selalu wajib diisi saat
      // pengajuan) pakai pemetaan yang sama seperti di admin-reports.js,
      // supaya Riwayat Absensi tampil detail (mis. "Izin Harian"/"Sakit")
      // bukan cuma "Izin" generik.
      const izinTypeLabels = {
        sick: 'Sakit', permission: 'Izin Penting', emergency: 'Keadaan Darurat',
        izin_harian: 'Izin Harian'
      };
      const label = updated.typeLabel || izinTypeLabels[updated.type] || 'Izin';
      _markAttendanceRangeAsExcused(
        updated.userId, updated.date, updated.dateEnd || updated.date,
        'izin', label, 'izin', updated.id
      );
    }
    // PDF surat digenerate & dikirim dari FRONTEND (persis tampilan
    // "Cetak Surat"), lalu diteruskan ke sendSuratEmailData() di
    // Mailer.gs - lihat printLetters.sendSuratEmailIfApproved() di
    // print-letters.js. Di sini cukup balikin hasil approve-nya saja.
    return { success: true, data: updated };
  }
  return { success: false, error: 'Izin not found' };
}

function rejectIzinData(id, approver, catatan) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  approver = approver || {};
  const patch = {
    status: 'rejected',
    rejectedBy: approver.name || '',
    rejectedByRole: approver.role || '',
    rejectedAt: new Date().toISOString(),
    rejectedNote: catatan || ''
  };

  const updated = updateRow('Izin', id, patch);
  if (updated) {
    return { success: true, data: updated };
  }
  return { success: false, error: 'Izin not found' };
}

/**
 * Upload berkas lampiran surat untuk pengajuan Izin (PDF/JPG/PNG).
 * Disimpan ke Google Drive, link-nya disimpan di kolom 'fileUrl'.
 * Memakai helper _getOrCreateFolder & _extractDriveId yang sudah ada di Karyawan.gs.
 */
function uploadFileIzinData(id, base64Data, mimeType, fileName) {
  if (!id || !base64Data) {
    return { success: false, error: 'ID dan berkas diperlukan' };
  }

  try {
    ensureColumns('Izin', ['fileUrl']);

    const folder = _getOrCreateFolder('Lampiran Izin PT TAA');
    const ext = (mimeType && mimeType.split('/')[1]) || 'pdf';
    const safeName = fileName || ('Izin_' + id + '_' + Date.now() + '.' + ext);

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType || 'application/pdf',
      safeName
    );

    const izin = findRow('Izin', 'id', String(id));
    if (izin && izin.fileUrl) {
      try {
        const oldFileId = _extractDriveId(izin.fileUrl);
        if (oldFileId) DriveApp.getFileById(oldFileId).setTrashed(true);
      } catch (e) {}
    }

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileUrl = file.getUrl();

    const updated = updateRow('Izin', id, { fileUrl: fileUrl, hasAttachment: true });
    if (!updated) {
      return { success: false, error: 'Izin not found' };
    }

    return { success: true, data: { fileUrl } };
  } catch (e) {
    return { success: false, error: 'Gagal upload lampiran izin: ' + e.message };
  }
}
