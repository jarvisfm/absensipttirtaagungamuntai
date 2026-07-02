/**
 * Portal Karyawan - Cetak Surat
 * PT. Tirta Agung Amuntai (Perseroda)
 *
 * Surat yang didukung:
 *  1. Surat Izin Keluar Kantor
 *  2. Surat Permohonan Izin — 3 format (Staff / Asmen / Manajer)
 *  3. Formulir Permohonan Izin Cuti
 */

const printLetters = {

    _bulanIndo: ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                 'Agustus','September','Oktober','November','Desember'],

    // ── Helpers ──────────────────────────────────────────────────
    _formatTanggalIndo(dateStr) {
        if (!dateStr) return '......................';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '......................';
        return `${d.getDate()} ${this._bulanIndo[d.getMonth()]} ${d.getFullYear()}`;
    },

    _formatJam(jamStr) {
        if (!jamStr) return '......................';
        return jamStr.replace(':', '.');
    },

    _getEmployee() {
        return auth.getCurrentUser() || {};
    },

    /** Deteksi format surat berdasarkan jabatan karyawan */
    _getLetterFormat(jabatan) {
        const j = (jabatan || '').toLowerCase();
        if (j.includes('manajer') || j.includes('manager')) return 'manajer';
        if (j.includes('asmen') || j.includes('asisten')) return 'asmen';
        return 'staff';
    },

    // ── Overlay / Render ─────────────────────────────────────────
    _ensureOverlay() {
        let overlay = document.getElementById('print-letter-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'print-letter-overlay';
            overlay.className = 'print-letter-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    },

        _show(contentHtml, options = {}) {
        const showFooter = options.showFooter !== false; // default true, kecuali di-set false
        const overlay = this._ensureOverlay();
        overlay.innerHTML = `
            <div class="print-letter-toolbar no-print">
                <button class="btn-small" onclick="printLetters.close()">
                    <i class="fas fa-times"></i> Tutup
                </button>
                <button class="btn-small btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Cetak / Simpan PDF
                </button>
            </div>
            <div class="print-letter-page">
                <div class="letter-kop-img-wrap">
                    <img src="assets/kop-surat.jpeg" alt="Kop Surat" class="letter-kop-img">
                </div>
                <div class="letter-body">
                    ${contentHtml}
                </div>
                ${showFooter ? `
                <div class="letter-footer-img-wrap">
                    <img src="assets/footer-surat.jpeg" alt="Footer" class="letter-footer-img">
                </div>` : ''}
            </div>
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    close() {
        const overlay = document.getElementById('print-letter-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.innerHTML = '';
        }
        document.body.style.overflow = '';
    },

    // ── Kop teks sederhana (khusus Surat Izin Keluar Kantor) ──────
    _letterHeaderPlain() {
        return `
            <div class="letter-kop">
                <img src="assets/logo-taa.png" alt="Logo PT. Tirta Agung Amuntai" class="letter-kop-logo">
                <div class="letter-kop-left">
                    <div class="letter-kop-title">PT. TIRTA AGUNG AMUNTAI (PERSERODA)</div>
                </div>
            </div>
            <div class="letter-kop-divider"></div>
            <div class="letter-kop-center-title">PT. TIRTA AGUNG AMUNTAI (PERSERODA)</div>
        `;
    },

    // Render tanpa banner jpeg — hanya kop teks polos di atas isi surat
    _showPlain(contentHtml) {
        const overlay = this._ensureOverlay();
        overlay.innerHTML = `
            <div class="print-letter-toolbar no-print">
                <button class="btn-small" onclick="printLetters.close()">
                    <i class="fas fa-times"></i> Tutup
                </button>
                <button class="btn-small btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Cetak / Simpan PDF
                </button>
            </div>
            <div class="print-letter-page">
                <div class="letter-body" style="padding-top:28px;">
                    ${this._letterHeaderPlain()}
                    ${contentHtml}
                </div>
            </div>
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    // ── Bagian isi yang sama untuk semua format Permohonan Izin ──
    _izinPermohonanTop(emp, izin) {
        const tgl       = izin.date    || izin.tanggal || '';
        const keperluan = izin.reason  || izin.alasan  || '';
        const durasi    = izin.duration || '......';

        // dateEnd seharusnya sudah dikirim backend untuk tipe 'izin_harian'.
        // Fallback: kalau kosong (mis. data lama sebelum kolom dateEnd ada di sheet)
        // tapi durasi > 1 hari diketahui, hitung tanggal selesai dari tgl + (durasi - 1) hari.
        let tglEnd = izin.dateEnd || '';
        if (!tglEnd && tgl && izin.duration && Number(izin.duration) > 1) {
            const start = new Date(tgl);
            if (!isNaN(start.getTime())) {
                start.setDate(start.getDate() + (Number(izin.duration) - 1));
                tglEnd = start.toISOString().split('T')[0];
            }
        }

        const tanggalValue = tglEnd
            ? `${this._formatTanggalIndo(tgl)} Sampai dengan tanggal ${this._formatTanggalIndo(tglEnd)}`
            : this._formatTanggalIndo(tgl);

        return `
            <h3 class="letter-title">SURAT PERMOHONAN IZIN</h3>

            <p class="letter-p">Yang bertanda tangan dibawah ini :</p>
            <table class="letter-field-table letter-indent">
                <tr>
                    <td class="lbl">N a m a</td>
                    <td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${emp.name || ''}"></td>
                </tr>
                <tr>
                    <td class="lbl">NIK</td>
                    <td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${emp.nik || ''}"></td>
                </tr>
                <tr>
                    <td class="lbl">Jabatan</td>
                    <td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${emp.jabatan || ''}"></td>
                </tr>
            </table>

            <p class="letter-p">Dengan ini mengajukan permohonan izin selama
                <input type="text" class="letter-input-inline" style="width:36px;text-align:center;"
                    value="${durasi}">
                hari kerja pada :
            </p>
            <table class="letter-field-table letter-indent">
                <tr>
                    <td class="lbl">Tanggal</td>
                    <td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${tanggalValue}"></td>
                </tr>
                <tr>
                    <td class="lbl">Keperluan</td>
                    <td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${keperluan}"></td>
                </tr>
                <tr>
                    <td class="lbl"></td>
                    <td></td>
                    <td><input type="text" class="letter-input" value=""></td>
                </tr>
            </table>

            <p class="letter-p letter-justify">Demikian permohonan izin ini disampaikan atas
                persetujuan Bapak diucapkan terimakasih.</p>

            <table class="letter-signoff-table" style="margin-top:20px;">
                <tr>
                    <td></td>
                    <td>Amuntai, ${this._formatTanggalIndo(new Date().toISOString())}</td>
                </tr>
            </table>
        `;
    },

    // ── Baris garis tanda tangan ─────────────────────────────────
    _ttdRow(label, subLabel, name, nik) {
        return `
            <td>
                <p style="margin:0 0 2px;">${label}</p>
                <p style="margin:0 0 2px; min-height:1.4em;">${subLabel || '&nbsp;'}</p>
                <div class="signature-space"></div>
                <div class="signature-line"></div>
                <p style="text-align:center; margin:4px 0 2px;">
                    <input type="text" class="letter-input letter-input-center"
                        value="${name || ''}" placeholder="......................">
                </p>
                <p style="text-align:center;">NIK. ${nik || '63 08 ......'}</p>
            </td>
        `;
    },

    // ── Baris dotted lines ───────────────────────────────────────
    _dottedLines(n) {
        return Array(n).fill('<div class="letter-dotted-line"></div>').join('');
    },

    // =============================================================
    // 1. SURAT IZIN KELUAR KANTOR
    //    Dokumen ini berbeda dari Surat Permohonan Izin — cukup TTD
    //    Direktur saja, tanpa tahapan Asmen/Manajer bidang.
    // =============================================================
    openIzinKeluarKantor(izinId, empOverride, izinOverride) {
        const emp  = empOverride || this._getEmployee();
        const izin = izinOverride || window.izin?.izinData?.find(i => i.id == izinId) || {};

        const tgl       = izin.date      || izin.tanggal   || izin.dates || '';
        const keluar    = izin.jamKeluar || izin.jam_keluar || '';
        const masuk     = izin.jamMasuk  || izin.jam_masuk  || '';
        const keperluan = izin.reason    || izin.alasan     || '';

        const html = `
            <h3 class="letter-title">SURAT IZIN KELUAR KANTOR</h3>

            <table class="letter-field-table">
                <tr><td class="lbl">NAMA / NIK</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input"
                        value="${emp.name || ''} / ${emp.nik || ''}"></td></tr>
                <tr><td class="lbl">PANGKAT / GOL</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input"
                        value="${emp.pangkat || ''} / ${emp.golongan || ''}"></td></tr>
                <tr><td class="lbl">JABATAN</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${emp.jabatan || ''}"></td></tr>
                <tr><td class="lbl">UNIT KERJA</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${emp.unitKerja || ''}"></td></tr>
                <tr><td class="lbl">KEPERLUAN</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input" value="${keperluan}"></td></tr>
                <tr><td class="lbl">HARI / TGL</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input"
                        value="${this._formatTanggalIndo(tgl)}"></td></tr>
                <tr><td class="lbl">KELUAR JAM</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input"
                        value="${this._formatJam(keluar)}"></td></tr>
                <tr><td class="lbl">MASUK JAM</td><td class="sep">:</td>
                    <td><input type="text" class="letter-input"
                        value="${this._formatJam(masuk)}"></td></tr>
            </table>

            <div class="letter-signoff-block">
                <p>Amuntai, ${this._formatTanggalIndo(new Date().toISOString())}</p>
                <p>Direktur</p>
                <div class="signature-space"></div>
                <p class="signature-name-underline">Muhammad Nasrullah, S. AB</p>
            </div>
        `;
        this._showPlain(html);
    },

    // =============================================================
    // 2a. SURAT PERMOHONAN IZIN — FORMAT STAFF
    //     Alur: Asmen → Manajer bidang → Direktur
    //     TTD bawah: Diketahui Oleh (Asmen) | Yang Memohon Izin
    //     Bawah: Pertimbangan Manager | Keputusan Direktur
    // =============================================================
    _openIzinPermohonanStaff(emp, izin) {
        const pertimbangan = izin.managerNote    || '';
        const keputusan    = izin.directorNote   || '';
        const asmenName    = izin.asmenName      || '';
        const asmenNik     = izin.asmenNik       || '';

        const html = `
            ${this._izinPermohonanTop(emp, izin)}

            <table class="letter-signoff-table">
                <tr>
                    ${this._ttdRow('Diketahui Oleh :', 'Asmen', asmenName, asmenNik)}
                    ${this._ttdRow('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <table class="letter-signoff-table" style="margin-top:24px;">
                <tr>
                    <td style="vertical-align:top;">
                        <p><strong>Pertimbangan :</strong></p>
                        <p><strong>Manager Umum &amp; Kepegawaian</strong></p>
                        <textarea class="letter-textarea" rows="7">${pertimbangan}</textarea>
                    </td>
                    <td style="vertical-align:top;">
                        <p><strong>Keputusan Direktur :</strong></p>
                        <textarea class="letter-textarea" rows="7">${keputusan}</textarea>
                    </td>
                </tr>
            </table>
        `;
        this._show(html);
    },

    // =============================================================
    // 2b. SURAT PERMOHONAN IZIN — FORMAT ASMEN
    //     Alur: Manajer bidang → Manajer Umum & Kepegawaian → Direktur
    //     TTD bawah: Diketahui Oleh (Manager) | Yang Memohon Izin
    //     Bawah: Pertimbangan Man. Umum & Kepeg | Keputusan Direktur
    // =============================================================
    _openIzinPermohonanAsmen(emp, izin) {
        const pertimbangan = izin.managerNote    || '';
        const keputusan    = izin.directorNote   || '';
        const mgrName      = izin.managerName    || '';
        const mgrNik       = izin.managerNik     || '';

        const html = `
            ${this._izinPermohonanTop(emp, izin)}

            <table class="letter-signoff-table">
                <tr>
                    ${this._ttdRow('Diketahui Oleh :', 'Manager', mgrName, mgrNik)}
                    ${this._ttdRow('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <table class="letter-signoff-table" style="margin-top:24px;">
                <tr>
                    <td style="vertical-align:top;">
                        <p><strong>Pertimbangan :</strong></p>
                        <p><strong>Manager Umum &amp; Kepegawaian</strong></p>
                        <textarea class="letter-textarea" rows="7">${pertimbangan}</textarea>
                    </td>
                    <td style="vertical-align:top;">
                        <p><strong>Keputusan Direktur :</strong></p>
                        <textarea class="letter-textarea" rows="7">${keputusan}</textarea>
                    </td>
                </tr>
            </table>
        `;
        this._show(html);
    },

    // =============================================================
    // 2c. SURAT PERMOHONAN IZIN — FORMAT MANAJER
    //     Alur: Direktur saja
    //     TTD: hanya Yang Memohon Izin di kanan
    //     Bawah: Keputusan Direktur saja (full width)
    // =============================================================
    _openIzinPermohonanManajer(emp, izin) {
        const keputusan = izin.directorNote || '';

        const html = `
            ${this._izinPermohonanTop(emp, izin)}

            <table class="letter-signoff-table">
                <tr>
                    <td></td>
                    ${this._ttdRow('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <div style="margin-top:24px;">
                <p><strong>Keputusan Direktur :</strong></p>
                <textarea class="letter-textarea" rows="7">${keputusan}</textarea>
            </div>
        `;
        this._show(html);
    },

    // =============================================================
    // 2. ENTRY POINT — otomatis pilih format berdasarkan jabatan
    //    empOverride/izinOverride: dipakai saat dipanggil dari modal
    //    Admin (Rekap Cuti & Izin), karena di situ karyawan yang
    //    login bukan si pemohon izin.
    // =============================================================
    openIzinPermohonan(izinId, empOverride, izinOverride) {
        const emp  = empOverride || this._getEmployee();
        const izin = izinOverride || window.izin?.izinData?.find(i => i.id == izinId) || {};

        const format = this._getLetterFormat(emp.jabatan);

        if (format === 'manajer') {
            this._openIzinPermohonanManajer(emp, izin);
        } else if (format === 'asmen') {
            this._openIzinPermohonanAsmen(emp, izin);
        } else {
            this._openIzinPermohonanStaff(emp, izin);
        }
    },

    // =============================================================
    // 3. FORMULIR PERMOHONAN IZIN CUTI
    // =============================================================
    openCuti(leaveId) {
        const emp   = this._getEmployee();
        const leave = window.cuti?.leaves?.find(l => l.id == leaveId) || {};

        const chk    = (checked) => `<span class="cuti-chk${checked ? ' checked' : ''}"></span>`;
        const isType = (t) => leave.type === t;

        const html = `
            <h3 class="letter-title">FORMULIR PERMOHONAN IZIN CUTI</h3>
            <p class="letter-center" style="margin-top:-10px;">No. ${leave.suratNumber || '851/...../..../PT.TAA/....'}</p>

            <div class="cuti-box">
                <table class="cuti-field-table">
                    <tr>
                        <td class="lbl" style="width:70px;">NIK</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${emp.nik || ''}"></td>
                        <td class="lbl" style="padding-left:1.5rem; width:120px;">UNIT/BAGIAN</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${emp.jabatan || ''}"></td>
                    </tr>
                    <tr>
                        <td colspan="3"></td>
                        <td class="lbl" style="padding-left:1.5rem; width:120px;">UNIT KERJA</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${emp.unitKerja || ''}"></td>
                    </tr>
                    <tr>
                        <td class="lbl" style="width:70px;">NAMA</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${emp.name || ''}"></td>
                        <td class="lbl" style="padding-left:1.5rem; width:120px;">PANGKAT/GOL</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input"
                            value="${emp.pangkat || ''} / ${emp.golongan || ''}"></td>
                    </tr>
                </table>
            </div>

            <div class="cuti-box">
                <div class="cuti-checkbox-cols" style="margin-bottom:8px; font-weight:bold;">
                    <div class="col">DATA KARYAWAN BERSANGKUTAN</div>
                    <div class="col">MENGAJUKAN CUTI :</div>
                </div>
                <div class="cuti-checkbox-cols">
                    <div class="col">
                        <label>${chk(isType('annual'))} CUTI TAHUNAN</label>
                        <label>${chk(isType('important'))} CUTI ALASAN PENTING</label>
                        <label>${chk(isType('sick'))} CUTI SAKIT</label>
                    </div>
                    <div class="col">
                        <label>${chk(isType('besar'))} CUTI BESAR</label>
                        <label>${chk(isType('maternity'))} CUTI BERSALIN</label>
                        <label>${chk(isType('other'))} KETERANGAN LAIN-LAIN</label>
                    </div>
                </div>

                <table class="cuti-field-table">
                    <tr><td class="lbl">Untuk keperluan</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${leave.reason || ''}"></td></tr>
                    <tr><td class="lbl">Jumlah Cuti</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input-inline" style="width:60px"
                            value="${leave.duration || ''}"> hari</td></tr>
                    <tr><td class="lbl">Dari Tanggal</td><td class="sep">:</td>
                        <td style="white-space:nowrap;">    
                            <input type="text" class="letter-input-inline" style="width:110px"
                                value="${this._formatTanggalIndo(leave.startDate)}">
                            Sampai dengan tanggal
                            <input type="text" class="letter-input-inline" style="width:110px"
                                value="${this._formatTanggalIndo(leave.endDate)}">
                        </td></tr>
                    <tr><td class="lbl" style="vertical-align:top;">Alamat yang dapat dihubungi selama cuti</td><td class="sep" style="vertical-align:top;">:</td>
                        <td><input type="text" class="letter-input" value="${leave.address || ''}" placeholder="Isi alamat..."></td></tr>
                    <tr><td class="lbl">Nomor Telpon/HP</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${leave.phone || ''}" placeholder="Isi no. HP..."></td></tr>
                </table>

                     <table class="letter-signoff-table" style="margin-top:10px;">
                         <tr>
                             <td></td>
                             <td>Amuntai, ${this._formatTanggalIndo(new Date().toISOString())}</td>
                         </tr>
                    <tr>
                        <td>
                            <p>MENGETAHUI :</p>
                            <div class="signature-space"></div>
                            <div class="signature-line"></div>
                            <p style="text-align:center; margin:4px 0 2px;">
                                <input type="text" class="letter-input letter-input-center"
                                    value="${leave.managerName || ''}" placeholder="......................">
                            </p>
                            <p style="text-align:center;">NIK. ${leave.managerNik || '63 08 ......'}</p>
                        </td>
                        <td>
                            <p>YANG MEMOHON,</p>
                            <div class="signature-space"></div>
                            <div class="signature-line"></div>
                            <p style="text-align:center; margin:4px 0 2px;">${emp.name || ''}</p>
                            <p style="text-align:center;">NIK. ${emp.nik || ''}</p>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="cuti-box">
                <table class="cuti-field-table">
                    <tr><td class="lbl">CATATAN / PERTIMBANGAN</td><td class="sep">:</td>
                        <td><input type="text" class="letter-input" value="${leave.managerNote || ''}"></td></tr>
                    <tr><td class="lbl"></td><td class="sep">:</td>
                        <td><input type="text" class="letter-input"></td></tr>
                    <tr><td class="lbl" style="padding-top:10px;">MANAGER UMUM &amp; KEPEG</td><td class="sep" style="padding-top:10px;">:</td>
                        <td style="padding-top:10px;"><input type="text" class="letter-input" value="${leave.mgrUmumNote || ''}"></td></tr>
                    <tr><td class="lbl"></td><td class="sep">:</td>
                        <td><input type="text" class="letter-input"></td></tr>
                    <tr><td class="lbl"></td><td class="sep">:</td>
                        <td><input type="text" class="letter-input"></td></tr>
                </table>
            </div>

            <div class="cuti-box">
                 <table class="cuti-keputusan-table">
                     <tr>
                         <td>KEPUTUSAN :</td>
                         <td>Tanda Tangan :</td>
                     </tr>
                     <tr>
                         <td>DIREKTUR PT.TAA : ☐ DISETUJUI</td>
                         <td></td>
                     </tr>
                     <tr>
                         <td style="padding-left:176px;">☐ DITUNDA</td>
                         <td>
                             <div class="cuti-sampai-dengan">
                                 <span>SAMPAI DENGAN&nbsp;:</span>
                                 <input type="text" class="letter-input-inline" style="flex:1; min-width:80px;">
                             </div>
                         </td>
                     </tr>
                 </table>
             </div>
        `;
        this._show(html, { showFooter: false });
    }
};

window.printLetters = printLetters;
