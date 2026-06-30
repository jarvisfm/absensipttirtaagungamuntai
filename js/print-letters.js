/**
 * Portal Karyawan - Cetak Surat (Izin Keluar Kantor, Permohonan Izin, Cuti)
 * Render surat sesuai format resmi PT. Tirta Agung Amuntai, lalu window.print()
 */

const printLetters = {

    _bulanIndo: ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],

    _formatTanggalIndo(dateStr) {
        if (!dateStr) return '......................';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '......................';
        return `${d.getDate()} ${this._bulanIndo[d.getMonth()]} ${d.getFullYear()}`;
    },

    _getEmployee() {
        return auth.getCurrentUser() || {};
    },

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

    _show(contentHtml) {
        const overlay = this._ensureOverlay();
        overlay.innerHTML = `
            <div class="print-letter-toolbar no-print">
                <button class="btn-small" onclick="printLetters.close()"><i class="fas fa-times"></i> Tutup</button>
                <button class="btn-small btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Cetak / Simpan PDF</button>
            </div>
            <div class="print-letter-page">
                ${contentHtml}
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

    _letterHeader() {
        return `
            <div class="letter-kop">
                <div class="letter-kop-left">
                    <div class="letter-kop-title">PT. TIRTA AGUNG AMUNTAI</div>
                    <div class="letter-kop-sub">(Perseroda)</div>
                </div>
            </div>
            <div class="letter-kop-divider"></div>
        `;
    },

    // ============================================================
    // 1. SURAT IZIN KELUAR KANTOR
    // ============================================================
    openIzinKeluarKantor(izinId) {
    const emp = this._getEmployee();
    const izin = window.izin?.izinData?.find(i => i.id === izinId) || {};

        const html = `
            ${this._letterHeader()}
            <h3 class="letter-title">SURAT IZIN KELUAR KANTOR</h3>

            <table class="letter-field-table">
                <tr><td class="lbl">NAMA / NIK</td><td>:</td><td><input type="text" class="letter-input" value="${emp.name || ''} / ${emp.nik || ''}"></td></tr>
                <tr><td class="lbl">PANGKAT / GOL</td><td>:</td><td><input type="text" class="letter-input" value="${emp.pangkat || ''} / ${emp.golongan || ''}"></td></tr>
                <tr><td class="lbl">JABATAN</td><td>:</td><td><input type="text" class="letter-input" value="${emp.jabatan || ''}"></td></tr>
                <tr><td class="lbl">UNIT KERJA</td><td>:</td><td><input type="text" class="letter-input" value="${emp.unitKerja || ''}"></td></tr>
                <tr><td class="lbl">KEPERLUAN</td><td>:</td><td><input type="text" class="letter-input" value="${izin.reason || ''}"></td></tr>
                <tr><td class="lbl">HARI / TGL</td><td>:</td><td><input type="text" class="letter-input" value="${this._formatTanggalIndo(izin.date)}"></td></tr>
                <tr><td class="lbl">KELUAR JAM</td><td>:</td><td><input type="text" class="letter-input" placeholder="cth. 13.00" value="${izin.jamKeluar || ''}"></td></tr>
                <tr><td class="lbl">MASUK JAM</td><td>:</td><td><input type="text" class="letter-input" placeholder="cth. 14.00" value="${izin.jamMasuk || ''}"></td></tr>
            </table>

            <div class="letter-signoff-right">
                <p>Amuntai, ${this._formatTanggalIndo(new Date().toISOString())}</p>
                <p>Direktur</p>
                <div class="signature-space"></div>
                <p class="signature-name"><input type="text" class="letter-input letter-input-center" value="${izin.directorName || ''}" placeholder="Nama Direktur"></p>
            </div>
        `;
        this._show(html);
    },

    // ============================================================
    // 2. SURAT PERMOHONAN IZIN
    // ============================================================
    openIzinPermohonan(izinId) {
        const emp = this._getEmployee();
        const izin = window.izin?.izinData?.find(i => i.id === izinId) || {};

        const html = `
            ${this._letterHeader()}
            <h3 class="letter-title">SURAT PERMOHONAN IZIN</h3>

            <p>Yang bertanda tangan dibawah ini :</p>
            <table class="letter-field-table">
                <tr><td class="lbl">N a m a</td><td>:</td><td><input type="text" class="letter-input" value="${emp.name || ''}"></td></tr>
                <tr><td class="lbl">NIK</td><td>:</td><td><input type="text" class="letter-input" value="${emp.nik || ''}"></td></tr>
                <tr><td class="lbl">Jabatan</td><td>:</td><td><input type="text" class="letter-input" value="${emp.jabatan || ''}"></td></tr>
            </table>

            <p>Dengan ini mengajukan permohonan izin selama <input type="text" class="letter-input-inline" style="width:50px" value="${izin.duration || ''}"> hari kerja pada :</p>
            <table class="letter-field-table">
                <tr><td class="lbl">Tanggal</td><td>:</td><td><input type="text" class="letter-input" value="${this._formatTanggalIndo(izin.date)}"></td></tr>
                <tr><td class="lbl">Keperluan</td><td>:</td><td><input type="text" class="letter-input" value="${izin.reason || ''}"></td></tr>
            </table>

            <p>Demikian permohonan izin ini disampaikan atas persetujuan Bapak diucapkan terimakasih.</p>

            <p class="letter-signoff-right-text">Amuntai, ${this._formatTanggalIndo(new Date().toISOString())}</p>

            <table class="letter-signoff-table">
                <tr>
                    <td>
                        <p>Diketahui Oleh :</p>
                        <p>Manager</p>
                        <div class="signature-space"></div>
                        <p class="signature-name"><input type="text" class="letter-input letter-input-center" value="${izin.managerName || ''}" placeholder="Nama Manager"></p>
                        <p>NIK. <input type="text" class="letter-input-inline" value="${izin.managerNik || ''}"></p>
                    </td>
                    <td>
                        <p>Yang Memohon Izin,</p>
                        <div class="signature-space"></div>
                        <p class="signature-name">${emp.name || ''}</p>
                        <p>NIK. <input type="text" class="letter-input-inline" value="${emp.nik || ''}" disabled></p>
                    </td>
                </tr>
            </table>

            <table class="letter-signoff-table" style="margin-top:1.5rem;">
                <tr>
                    <td>
                        <p><strong>Pertimbangan :</strong><br>Manager Umum &amp; Kepegawaian</p>
                        <textarea class="letter-textarea" rows="4"></textarea>
                    </td>
                    <td>
                        <p><strong>Keputusan Direktur :</strong></p>
                        <textarea class="letter-textarea" rows="4">${izin.directorName ? 'Disetujui oleh ' + izin.directorName : ''}</textarea>
                    </td>
                </tr>
            </table>
        `;
        this._show(html);
    },

    // ============================================================
    // 3. FORMULIR PERMOHONAN IZIN CUTI
    // ============================================================
    openCuti(leaveId) {
        const emp = this._getEmployee();
        const leave = window.cuti?.leaves?.find(l => l.id === leaveId) || {};

        const checkbox = (checked) => checked ? '☑' : '☐';
        const isType = (t) => leave.type === t;

        const html = `
            ${this._letterHeader()}
            <h3 class="letter-title">FORMULIR PERMOHONAN IZIN CUTI</h3>
            <p class="letter-center">No. ${leave.suratNumber || '851/...../..../PT.TAA/....'}</p>

            <table class="letter-field-table">
                <tr>
                    <td class="lbl">NIK</td><td>:</td><td><input type="text" class="letter-input" value="${emp.nik || ''}"></td>
                    <td class="lbl" style="padding-left:1.5rem;">UNIT/BAGIAN</td><td>:</td><td><input type="text" class="letter-input" value="${emp.unitKerja || ''}"></td>
                </tr>
                <tr>
                    <td class="lbl">NAMA</td><td>:</td><td><input type="text" class="letter-input" value="${emp.name || ''}"></td>
                    <td class="lbl" style="padding-left:1.5rem;">PANGKAT/GOL</td><td>:</td><td><input type="text" class="letter-input" value="${emp.pangkat || ''} / ${emp.golongan || ''}"></td>
                </tr>
            </table>

            <p><strong>MENGAJUKAN CUTI :</strong></p>
            <table class="letter-checkbox-table">
                <tr>
                    <td>${checkbox(isType('annual'))} CUTI TAHUNAN</td>
                    <td>${checkbox(false)} CUTI BESAR</td>
                </tr>
                <tr>
                    <td>${checkbox(isType('important'))} CUTI ALASAN PENTING</td>
                    <td>${checkbox(isType('maternity'))} CUTI BERSALIN</td>
                </tr>
                <tr>
                    <td>${checkbox(isType('sick'))} CUTI SAKIT</td>
                    <td>${checkbox(isType('other'))} KETERANGAN LAIN-LAIN</td>
                </tr>
            </table>

            <table class="letter-field-table">
                <tr><td class="lbl">Untuk keperluan</td><td>:</td><td><input type="text" class="letter-input" value="${leave.reason || ''}"></td></tr>
                <tr><td class="lbl">Jumlah Cuti</td><td>:</td><td><input type="text" class="letter-input-inline" style="width:60px" value="${leave.duration || ''}"> hari</td></tr>
                <tr><td class="lbl">Dari Tanggal</td><td>:</td><td><input type="text" class="letter-input-inline" value="${this._formatTanggalIndo(leave.startDate)}"> s/d <input type="text" class="letter-input-inline" value="${this._formatTanggalIndo(leave.endDate)}"></td></tr>
                <tr><td class="lbl">Alamat selama cuti</td><td>:</td><td><input type="text" class="letter-input" placeholder="Isi alamat..."></td></tr>
                <tr><td class="lbl">No. Telp/HP</td><td>:</td><td><input type="text" class="letter-input" placeholder="Isi no. HP..."></td></tr>
            </table>

            <p class="letter-signoff-right-text">Amuntai, ${this._formatTanggalIndo(leave.appliedAt || new Date().toISOString())}</p>

            <table class="letter-signoff-table">
                <tr>
                    <td>
                        <p>MENGETAHUI :</p>
                        <div class="signature-space"></div>
                        <p class="signature-name"><input type="text" class="letter-input letter-input-center" value="${leave.managerName || ''}" placeholder="Nama Manager"></p>
                        <p>NIK. <input type="text" class="letter-input-inline" value="${leave.managerNik || ''}"></p>
                    </td>
                    <td>
                        <p>YANG MEMOHON,</p>
                        <div class="signature-space"></div>
                        <p class="signature-name">${emp.name || ''}</p>
                        <p>NIK. ${emp.nik || ''}</p>
                    </td>
                </tr>
            </table>

            <table class="letter-signoff-table" style="margin-top:1.5rem;">
                <tr>
                    <td>
                        <p><strong>CATATAN / PERTIMBANGAN :</strong></p>
                        <textarea class="letter-textarea" rows="3"></textarea>
                        <p><strong>MANAGER UMUM &amp; KEPEG :</strong></p>
                        <textarea class="letter-textarea" rows="2"></textarea>
                    </td>
                    <td>
                        <p><strong>KEPUTUSAN DIREKTUR PT.TAA :</strong></p>
                        <p>
                            <label>${checkbox(leave.status === 'approved')} DISETUJUI</label>
                            &nbsp;&nbsp;
                            <label>${checkbox(false)} DITUNDA sampai dengan <input type="text" class="letter-input-inline" style="width:120px"></label>
                        </p>
                        <p>Tanda Tangan :</p>
                        <div class="signature-space"></div>
                        <p class="signature-name"><input type="text" class="letter-input letter-input-center" value="${leave.directorName || ''}" placeholder="Nama Direktur"></p>
                    </td>
                </tr>
            </table>
        `;
        this._show(html);
    }
};

window.printLetters = printLetters;
