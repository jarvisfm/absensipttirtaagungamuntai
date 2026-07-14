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

    /** Deteksi format surat. UTAMAKAN field `role` asli (staff/asmen/manajer/
     *  direktur) karena itu yang benar-benar dipakai alur approval - teks
     *  jabatan cuma fallback untuk kasus emp.role tidak tersedia. Ini penting
     *  untuk jabatan seperti "Jabatan Fungsional Kehilangan Air (NRW)..." yang
     *  tidak mengandung kata "asmen"/"asisten" sama sekali walau orangnya
     *  memang ber-role Asmen di sistem.
     *  PENTING (fallback teks): cek 'asisten'/'asmen' DULU sebelum 'manajer' —
     *  karena jabatan Asmen biasanya berbunyi "Asisten Manajer ..." yang JUGA
     *  mengandung kata "manajer" sebagai substring. Kalau urutannya dibalik,
     *  semua Asmen akan salah terdeteksi sebagai format Manajer.
     */
    _getLetterFormat(jabatan, role) {
        const r = (role || '').toLowerCase().trim();
        if (r === 'asmen') return 'asmen';
        if (r === 'manajer') return 'manajer';
        if (r === 'staff' || r === 'direktur' || r === 'admin') return 'staff';

        // Fallback teks jabatan (role tidak tersedia/tidak dikenali)
        const j = (jabatan || '').toLowerCase();
        if (j.includes('asmen') || j.includes('asisten')) return 'asmen';
        if (j.includes('manajer') || j.includes('manager')) return 'manajer';
        return 'staff';
    },

    // ── Overlay / Render ─────────────────────────────────────────
    // ── Mode "silent capture" untuk kirim PDF email ────────────────
    // Saat true, _show() TIDAK menampilkan overlay ke layar - alih-alih
    // merender ke elemen tersembunyi (offscreen) yang nanti diambil oleh
    // captureAsPdfBlob() dan diubah jadi PDF lewat html2pdf.js.
    // PENTING: ini SENGAJA tidak mengubah satupun fungsi _openXxx (format
    // suratnya) - jadi PDF yang dihasilkan dijamin identik dengan tampilan
    // "Cetak Surat" yang biasa dilihat user, bukan format terpisah.
    _captureMode: false,
    _captureContainer: null,

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
        const pageHtml = `
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

        if (this._captureMode) {
            // Render offscreen (bukan ke overlay), supaya tidak kelihatan
            // berkedip di layar approver saat proses kirim email berjalan
            // di belakang layar.
            const container = document.createElement('div');
            container.style.cssText = 'position:fixed; left:-9999px; top:0; background:#fff; width:800px;';
            container.innerHTML = pageHtml;
            document.body.appendChild(container);
            this._captureContainer = container;
            return;
        }

        const overlay = this._ensureOverlay();
        overlay.innerHTML = `
            <div class="print-letter-toolbar no-print">
                <button class="btn-small" onclick="printLetters.close()">
                    <i class="fas fa-times"></i> Tutup
                </button>
                <button class="btn-small btn-primary" onclick="printLetters.printNow()">
                    <i class="fas fa-print"></i> Cetak / Simpan PDF
                </button>
            </div>
            ${pageHtml}
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    // ── Tunggu semua <img> di dalam elemen selesai loading ─────────
    // Perlu ditunggu manual karena elemen capture-nya offscreen dan baru
    // saja disisipkan ke DOM - html2canvas bisa saja mulai "memotret"
    // sebelum gambar kop/footer selesai dimuat kalau tidak ditunggu dulu.
    _waitForImages(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        return Promise.all(imgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true }); // tetap lanjut walau 1 gambar gagal
            });
        }));
    },

    /**
     * Jalankan salah satu fungsi open*() (mis. openIzinPermohonan atau
     * openCuti) dalam mode silent, lalu ambil hasilnya sebagai PDF Blob.
     * Dipakai untuk lampiran email - PDF-nya PERSIS sama dengan yang
     * muncul kalau user klik tombol "Cetak Surat" secara manual.
     */
    async captureAsPdfBlob(renderFn) {
        this._captureMode = true;
        this._captureContainer = null;
        try {
            renderFn();

            // Kasih waktu 1 frame supaya browser selesai reflow dulu sebelum
            // dicek - _show() di atas sudah synchronous, tapi jaga-jaga.
            await new Promise(r => setTimeout(r, 50));

            const container = this._captureContainer;
            if (!container) throw new Error('Gagal membuat tampilan surat untuk PDF');

            await this._waitForImages(container);

            const pageEl = container.querySelector('.print-letter-page');

            // Pakai html2canvas + jsPDF LANGSUNG (bukan lewat wrapper
            // html2pdf().set({...}).from(...)). Wrapper-nya kalau dipakai
            // bareng scale>1 + custom format, ukurannya suka tidak sinkron -
            // itu yang bikin footer surat "meluber" ke halaman ke-2 padahal
            // isinya cuma 1 halaman. Dengan cara ini, ukuran halaman PDF
            // dihitung PERSIS dari ukuran canvas hasil render, jadi dijamin
            // selalu 1 halaman utuh (termasuk footer-nya).
            const canvas = await html2canvas(pageEl, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
            if (!jsPDFCtor) throw new Error('jsPDF tidak tersedia (cek pemuatan library jspdf.umd.min.js)');

            const pdfWidth = canvas.width / 2;   // balik ke ukuran CSS px (scale 2x tadi -> bagi 2)
            const pdfHeight = canvas.height / 2;
            const pdf = new jsPDFCtor({
                unit: 'px',
                format: [pdfWidth, pdfHeight],
                orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait'
            });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, pdfWidth, pdfHeight);

            return pdf.output('blob');
        } finally {
            if (this._captureContainer) {
                this._captureContainer.remove();
                this._captureContainer = null;
            }
            this._captureMode = false;
        }
    },

    close() {
        const overlay = document.getElementById('print-letter-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.innerHTML = '';
        }
        document.body.style.overflow = '';
    },

    // ── Cetak / Simpan PDF ───────────────────────────────────────
    // Dipisah dari onclick="window.print()" langsung karena di sebagian HP
    // (terutama Android) dialog cetak gagal muncul kalau window.print()
    // dipanggil persis di saat konten baru selesai di-render — perlu jeda
    // sedikit dulu. try/catch juga menampilkan pesan yang jelas kalau
    // browser/aplikasi yang dipakai memang tidak mendukung cetak (mis.
    // dibuka dari dalam aplikasi lain, bukan browser seperti Chrome/Safari).
    printNow() {
        setTimeout(() => {
            try {
                window.print();
            } catch (e) {
                alert('Gagal membuka dialog Cetak / Simpan PDF. Coba buka halaman ini di aplikasi browser (Chrome/Safari), lalu tekan tombol ini lagi.');
            }
        }, 150);
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
                <button class="btn-small btn-primary" onclick="printLetters.printNow()">
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
                    <td>Amuntai, ${this._formatTanggalIndo(izin.appliedAt || new Date().toISOString())}</td>
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

    // ── Baris garis tanda tangan — dipakai format Staff/Asmen/Manajer Surat
    //    Permohonan Izin.
    _ttdRowStaff(label, subLabel, name, nik) {
        return `
            <td>
                <p style="margin:0 0 2px;">${label}</p>
                <p style="margin:0 0 2px; min-height:1.4em;">${subLabel || '&nbsp;'}</p>
                <div class="signature-space"></div>
                <div class="signature-line"></div>
                <p style="text-align:center; margin:4px 0 2px;">
                    <input type="text" class="letter-input-plain letter-input-center"
                        value="${name || ''}" placeholder="......................">
                </p>
                <p style="text-align:center;">NIK. ${nik || '63 08 ......'}</p>
            </td>
        `;
    },

    // ── Kotak catatan read-only (Pertimbangan Manajer & Keputusan Direktur) —
    //    dipakai format Staff/Asmen/Manajer. Isi catatan ditampilkan apa
    //    adanya (rata kiri/justify), tanpa garis titik-titik.
    _noteBoxStaff(text) {
        const safeText = String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const align = safeText.length > 40 ? 'justify' : 'left';
        return `
            <div style="min-height:22px; margin-bottom:4px; text-align:${align};">${safeText || '&nbsp;'}</div>
        `;
    },

    // ── Label "Manager <Bidang>" OTOMATIS berdasarkan field `bagian` karyawan —
    //    dipakai di kotak Pertimbangan pada format Staff, supaya tidak lagi
    //    hardcode teks "Manager Umum & Kepegawaian" untuk semua bagian.
    //    Peta eksplisit untuk 6 bagian yang ada di master data karyawan;
    //    kalau ada bagian baru yang belum terdaftar, fallback ke Title Case
    //    otomatis (kata "DAN" -> "&").
    _MANAGER_LABEL_BY_BAGIAN: {
        'SPI':                      'Manager SPI',
        'UMUM DAN KEPEGAWAIAN':     'Manager Umum &amp; Kepegawaian',
        'KEUANGAN':                 'Manager Keuangan',
        'HUBUNGAN LANGGANAN':       'Manager Hubungan Langganan',
        'TEKNIK DAN PENGAWASAN':    'Manager Teknik &amp; Pengawasan',
        'OPERASI DAN JARINGAN':     'Manager Operasi &amp; Jaringan'
    },
    _managerLabelForBagian(bagian) {
        const key = String(bagian || '').trim().toUpperCase();
        if (this._MANAGER_LABEL_BY_BAGIAN[key]) {
            return this._MANAGER_LABEL_BY_BAGIAN[key];
        }
        if (!key) return 'Manager Umum &amp; Kepegawaian'; // fallback kalau bagian kosong
        // Fallback generik untuk bagian yang belum ada di peta di atas
        const titled = key.split(/\s+/)
            .map(w => (w === 'DAN' ? '&amp;' : w.charAt(0) + w.slice(1).toLowerCase()))
            .join(' ');
        return `Manager ${titled}`;
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
                <p>Amuntai, ${this._formatTanggalIndo(izin.appliedAt || new Date().toISOString())}</p>
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
                    ${this._ttdRowStaff('Diketahui Oleh :', 'Asmen', asmenName, asmenNik)}
                    ${this._ttdRowStaff('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <table class="letter-signoff-table letter-note-table" style="margin-top:24px;">
                <tr>
                    <td style="vertical-align:top;">
                        <p><strong>Pertimbangan :</strong></p>
                        <p><strong>${this._managerLabelForBagian(emp.bagian)}</strong></p>
                        ${this._noteBoxStaff(pertimbangan)}
                    </td>
                    <td style="vertical-align:top;">
                        <p><strong>Keputusan Direktur :</strong></p>
                        <p>&nbsp;</p>
                        ${this._noteBoxStaff(keputusan)}
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
        // Kotak "Pertimbangan: Manager Umum & Kepegawaian" HARUS isi catatan
        // Manajer Umum & Kepegawaian (hrManagerNote, tahap 2 untuk Asmen bagian
        // lain) - BUKAN catatan Manajer Bidang (managerNote, tahap 1). Fallback
        // ke managerNote hanya untuk kasus Asmen dari Umum & Kepegawaian sendiri,
        // yang cuma 1 tahap approval (disimpan di managerNote, hrManagerNote
        // kosong karena tidak dipakai - lihat approveIzinData di Izin.gs).
        const pertimbangan = izin.hrManagerNote || izin.managerNote || '';
        const keputusan    = izin.directorNote   || '';
        const mgrName      = izin.managerName    || '';
        const mgrNik       = izin.managerNik     || '';

        const html = `
            ${this._izinPermohonanTop(emp, izin)}

            <table class="letter-signoff-table">
                <tr>
                    ${this._ttdRowStaff('Diketahui Oleh :', 'Manager', mgrName, mgrNik)}
                    ${this._ttdRowStaff('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <table class="letter-signoff-table letter-note-table" style="margin-top:24px;">
                <tr>
                    <td style="vertical-align:top;">
                        <p><strong>Pertimbangan :</strong></p>
                        <p><strong>Manager Umum &amp; Kepegawaian</strong></p>
                        ${this._noteBoxStaff(pertimbangan)}
                    </td>
                    <td style="vertical-align:top;">
                        <p><strong>Keputusan Direktur :</strong></p>
                        <p>&nbsp;</p>
                        ${this._noteBoxStaff(keputusan)}
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
                    ${this._ttdRowStaff('Yang Memohon Izin,', '', emp.name, emp.nik)}
                </tr>
            </table>

            <div style="margin-top:24px; text-align:left;">
                <p><strong>Keputusan Direktur :</strong></p>
                ${this._noteBoxStaff(keputusan)}
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

        // Akun rangkap (mis. M. Azemi = Admin sekaligus Asmen) punya emp.role
        // selalu 'admin' di level atas; identitas karyawan aslinya ada di
        // emp.employeeRole (lihat Auth.gs/auth.js). Utamakan employeeRole kalau
        // ada, supaya cetak surat MILIK SENDIRI lewat Mode Karyawan tetap benar.
        const format = this._getLetterFormat(emp.jabatan, emp.employeeRole || emp.role);

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
    openCuti(leaveId, empOverride, leaveOverride) {
        const emp   = empOverride || this._getEmployee();
        const leave = leaveOverride || window.cuti?.leaves?.find(l => l.id == leaveId) || {};

        const chk    = (checked) => `<span class="cuti-chk${checked ? ' checked' : ''}"></span>`;
        const isType = (t) => leave.type === t;

        // Kalau bagian pemohon = UMUM DAN KEPEGAWAIAN, Manajer bidang dan Manajer
        // Umum & Kepegawaian adalah orang yang sama -> cukup 1x approval, jadi
        // catatan di kedua baris (atas & bawah) sama-sama pakai leave.managerNote.
        // Kalau bukan, ada 2 tahap manajer berbeda -> baris bawah pakai
        // catatan Manajer Umum & Kepegawaian yang tersimpan di leave.hrManagerNote.
        const isBagianUmumKepeg = String(leave.bagian || '').toUpperCase().trim() === 'UMUM DAN KEPEGAWAIAN';
        const mgrUmumNote = isBagianUmumKepeg ? (leave.managerNote || '') : (leave.hrManagerNote || '');

        // Keputusan Direktur: centang otomatis sesuai status surat.
        const isDisetujui = leave.status === 'approved';
        const isDitunda   = leave.status === 'ditunda';

        // Blok tanda tangan "MENGETAHUI :" (Asmen) di bawah ini HANYA berlaku
        // untuk pemohon Staff — karena Asmen & Manajer tidak melalui approval
        // Asmen sesuai bidang saat mengajukan cuti untuk diri sendiri.
        // Sama seperti di openIzinPermohonan: utamakan employeeRole untuk akun
        // rangkap Admin+Karyawan (mis. M. Azemi) supaya cetak surat sendiri
        // lewat Mode Karyawan tetap benar.
        const letterFormat = this._getLetterFormat(emp.jabatan, emp.employeeRole || emp.role);
        const mengetahuiCell = letterFormat === 'staff'
            ? `<td>
                    <p>MENGETAHUI :</p>
                    <div class="signature-space"></div>
                    <p style="text-align:center; margin:4px 0 2px;">
                        <input type="text" class="letter-input-plain letter-input-center"
                            value="${leave.asmenName || ''}" placeholder="......................">
                    </p>
                    <p style="text-align:center;">NIK. ${leave.asmenNik || '63 08 ......'}</p>
                </td>`
            : `<td></td>`;

        const html = `
            <h3 class="letter-title" style="margin-bottom:6px;">FORMULIR PERMOHONAN IZIN CUTI</h3>
            <p class="letter-center" style="margin:0 0 14px;">No. ${leave.suratNumber || '851/...../..../PT.TAA/....'}</p>

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
                             <td>Amuntai, ${this._formatTanggalIndo(leave.appliedAt || new Date().toISOString())}</td>
                         </tr>
                    <tr>
                        ${mengetahuiCell}
                        <td>
                            <p>YANG MEMOHON,</p>
                            <div class="signature-space"></div>
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
                        <td style="padding-top:10px;"><input type="text" class="letter-input" value="${mgrUmumNote}"></td></tr>
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
                         <td><span class="keputusan-lbl">DIREKTUR PT.TAA :</span> ${chk(isDisetujui)} DISETUJUI</td>
                         <td></td>
                     </tr>
                     <tr>
                         <td><span class="keputusan-lbl">&nbsp;</span> ${chk(isDitunda)} DITUNDA</td>
                         <td>
                             <div class="cuti-sampai-dengan">
                                 <span>SAMPAI DENGAN&nbsp;:</span>
                                 <input type="text" class="letter-input-inline" style="flex:1; min-width:80px;"
                                     value="${isDitunda ? this._formatTanggalIndo(leave.tundaSampai) : ''}">
                             </div>
                         </td>
                     </tr>
                 </table>
             </div>
        `;
        this._show(html, { showFooter: false });
    },

    // =============================================================
    // 4. KIRIM PDF SURAT VIA EMAIL (setelah approval final)
    //    PDF yang dikirim adalah HASIL TANGKAPAN LANGSUNG dari tampilan
    //    "Cetak Surat" di atas (lewat captureAsPdfBlob) - BUKAN format
    //    terpisah yang dibuat ulang di backend. Backend cuma jadi
    //    "tukang kirim" (terima PDF base64, kirim via Gmail).
    // =============================================================
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    _suratJenisLabel(kind, type) {
        if (kind === 'cuti') {
            const map = {
                annual: 'Cuti Tahunan', important: 'Cuti Alasan Penting', sick: 'Cuti Sakit',
                besar: 'Cuti Besar', maternity: 'Cuti Bersalin', other: 'Keterangan Lain-lain'
            };
            return map[type] || 'Cuti';
        }
        const map = {
            sick: 'Surat Keterangan Sakit', izin_harian: 'Surat Permohonan Izin',
            keluar_kantor: 'Surat Izin Keluar Kantor'
        };
        return map[type] || 'Izin';
    },

    /**
     * Dipanggil dari izin.js/cuti.js SETELAH approval berhasil DAN status
     * hasilnya sudah 'approved' (tuntas/final - bukan tahap tengah seperti
     * asmen_approved/manajer_approved). Berjalan diam-diam di belakang layar
     * (mode capture, tidak nongol ke layar approver).
     *
     * kind: 'izin' | 'cuti'
     * record: data Izin/Leave hasil approve (result.data dari api.approveIzin/
     *         api.approveLeave), status-nya harus sudah 'approved'.
     */
    async sendSuratEmailIfApproved(kind, record) {
        if (!record || record.status !== 'approved') return;

        try {
            const empRes = await api.getKaryawanDetail(record.userId);
            if (!empRes || !empRes.success || !empRes.data) return;
            const emp = empRes.data;
            // PENTING: api.getKaryawanDetail() mengembalikan field MENTAH
            // sesuai kolom sheet ("nama"), sedangkan semua template surat di
            // atas (_izinPermohonanTop, _ttdRowStaff, dst) membaca "emp.name"
            // (field ini biasanya sudah dinormalisasi di tempat lain, mis.
            // auth.getCurrentUser()). Tanpa baris ini, nama akan kosong di
            // seluruh surat PDF (NIK/Jabatan tetap muncul karena nama field-
            // nya kebetulan sama di kedua sisi).
            emp.name = emp.name || emp.nama || '';
            // Log diagnostik - buka Console browser (F12) di device yang
            // dipakai approve, kalau nama masih kosong di PDF setelah ini,
            // cek angka yang tercetak di sini: kalau emp.nama juga kosong,
            // berarti datanya memang kosong di sheet Employees (bukan bug
            // kode) - kalau emp.nama ada isinya tapi PDF tetap kosong,
            // berarti masih ada cache lama, bukan masalah data.
            console.log('[sendSuratEmailIfApproved] emp:', emp.name, '| emp.nama (raw):', emp.nama, '| userId:', record.userId);

            // Kalau belum isi email di profil, jangan lanjut generate PDF
            // sama sekali (hemat proses) - peringatan "Isi email supaya
            // surat dikirimkan" ditampilkan di halaman Edit Profil milik
            // pemohon sendiri, bukan di sini (approver bukan pemiliknya).
            if (!emp.email || !String(emp.email).trim()) return;

            let pdfBlob;
            if (kind === 'cuti') {
                pdfBlob = await this.captureAsPdfBlob(() => this.openCuti(record.id, emp, record));
            } else if (record.type === 'keluar_kantor') {
                pdfBlob = await this.captureAsPdfBlob(() => this.openIzinKeluarKantor(record.id, emp, record));
            } else {
                pdfBlob = await this.captureAsPdfBlob(() => this.openIzinPermohonan(record.id, emp, record));
            }

            const pdfBase64 = await this._blobToBase64(pdfBlob);
            const jenisLabel = this._suratJenisLabel(kind, record.type);
            const fileName = `${jenisLabel} - ${emp.name || emp.nama || 'Karyawan'}`.replace(/[\\/:*?"<>|]/g, '-');

            await api.sendSuratEmail({
                id: record.id,
                sheet: kind === 'cuti' ? 'Leaves' : 'Izin',
                email: emp.email,
                namaPemohon: emp.name || emp.nama || 'Karyawan',
                jenisLabel,
                kind,
                fileName,
                pdfBase64
            });
        } catch (e) {
            // Sengaja tidak ditampilkan sebagai error ke approver - approval-
            // nya sendiri SUDAH BERHASIL tersimpan, ini cuma proses tambahan
            // (kirim email) yang berjalan di belakang layar.
            console.error('Gagal generate/kirim PDF surat:', e);
        }
    }
};

window.printLetters = printLetters;
