/**
 * Portal Karyawan - Pengajuan KGB (Kenaikan Gaji Berkala)
 * Backend: Kgbpengajuan.gs
 *
 * Karyawan mengunggah 5 berkas lalu mengajukan. Alur persetujuan:
 *   Asmen Umum & Kepegawaian (satu-satunya yang menyetujui/menolak + catatan)
 *   -> Manajer Umum & Kepegawaian (meninjau) -> Manajer Keuangan (meninjau) -> Direktur (meninjau).
 * Riwayat KGB di Edit Profil & hitungan gaji TIDAK diubah di sini.
 */
const kgb = {
    ctx: null,       // { me, rekap, berkas, langkah, saya, asmenAda }
    list: null,      // { saya, masuk, semua, menungguCount }
    tab: 'saya',
    loading: false,
    error: '',
    _busy: false,
    _slots: {},      // key -> { file, fileId, nama, status }

    BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    MAX_BYTES: 1024 * 1024,   // batas ukuran tiap berkas: 1 MB

    // ── Util ───────────────────────────────────────────────
    _e(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    _root() { return document.getElementById('kgb-root'); },
    _$(id) { return document.getElementById(id); },
    _tgl(v) {
        if (!v) return '-';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
        if (m) return `${parseInt(m[3], 10)} ${this.BULAN[parseInt(m[2], 10) - 1]} ${m[1]}`;
        const d = new Date(v);
        return isNaN(d) ? String(v) : `${d.getDate()} ${this.BULAN[d.getMonth()]} ${d.getFullYear()}`;
    },
    _ukuran(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },

    _statusChip(s) {
        const m = {
            Menunggu: ['wait', 'fa-hourglass-half', 'Diproses'], Disetujui: ['ok', 'fa-circle-check', 'Disetujui'],
            Ditolak: ['no', 'fa-circle-xmark', 'Ditolak']
        };
        const x = m[s] || ['wait', 'fa-clock', s];
        return `<span class="kg-chip kg-chip-${x[0]}"><i class="fas ${x[1]}"></i> ${this._e(x[2])}</span>`;
    },

    _stepper(steps) {
        const txt = { Disetujui: 'Disetujui', Ditinjau: 'Sudah ditinjau', Menunggu: 'Menunggu', Ditolak: 'Ditolak', Dilewati: 'Dilewati', Belum: 'Belum giliran' };
        const cls = { Disetujui: 'ok', Ditinjau: 'ok', Menunggu: 'wait', Ditolak: 'no', Dilewati: 'skip', Belum: 'idle' };
        const ic = { ok: 'fa-check', wait: 'fa-hourglass-half', no: 'fa-xmark', skip: 'fa-forward', idle: 'fa-circle' };
        return `<div class="kg-steps">${steps.map(s => {
            const c = cls[s.status] || 'idle';
            return `<div class="kg-step kg-st-${c}">
                <div class="kg-dot"><i class="fas ${ic[c]}"></i></div>
                <div class="kg-sl"><b>${this._e(s.label)}</b><span>${this._e(txt[s.status] || s.status)}${s.nama ? ' · ' + this._e(s.nama) : ''}</span></div>
            </div>`;
        }).join('')}</div>`;
    },

    // ── Init & muat data ───────────────────────────────────
    async init() {
        const root = this._root();
        if (!root) return;
        if (!this.ctx) root.innerHTML = '<div class="kg-empty"><i class="fas fa-spinner fa-spin"></i><p>Memuat...</p></div>';
        this.loading = true; this.error = '';
        try {
            const [c, l] = await Promise.all([api.getKgbContext(), api.getKgbList()]);
            if (!c || !c.success) throw new Error((c && c.error) || 'Gagal memuat data pengguna');
            if (!l || !l.success) throw new Error((l && l.error) || 'Gagal memuat daftar pengajuan');
            this.ctx = c.data; this.list = l.data;
        } catch (e) {
            this.error = e.message || 'Gagal memuat data';
        }
        this.loading = false;
        this.render();
    },

    async refresh() {
        try {
            const l = await api.getKgbList();
            if (l && l.success) this.list = l.data;
        } catch (e) { /* tampilan lama tetap dipakai */ }
        this.render();
    },

    // ── Tampilan utama ─────────────────────────────────────
    render() {
        const root = this._root();
        if (!root) return;
        if (this.error) {
            root.innerHTML = `<div class="kg-empty"><i class="fas fa-triangle-exclamation"></i><p>${this._e(this.error)}</p>
                <button type="button" class="kg-btn" onclick="kgb.init()"><i class="fas fa-rotate"></i> Coba lagi</button></div>`;
            return;
        }
        if (!this.ctx || !this.list) return;
        const c = this.ctx, l = this.list;
        const isApprover = (c.saya || []).length > 0;
        const tabs = [['saya', 'fa-file-circle-plus', 'Pengajuan Saya', 0]];
        if (isApprover) tabs.push(['masuk', 'fa-clipboard-check', 'Perlu Ditinjau', l.menungguCount]);
        if (c.rekap) tabs.push(['semua', 'fa-table-list', 'Semua Pengajuan', 0]);
        if (!tabs.some(t => t[0] === this.tab)) this.tab = tabs[0][0];

        root.innerHTML = `
        <div class="kg-hero">
            <div class="kg-hero-ic"><i class="fas fa-money-bill-trend-up"></i></div>
            <div><h2>Kenaikan Gaji Berkala (KGB)</h2>
            <p>Ajukan KGB dengan melampirkan berkas, lalu pantau tahap persetujuannya.</p></div>
        </div>
        <div class="kg-tabs">${tabs.map(t => `
            <button type="button" class="kg-tab${this.tab === t[0] ? ' active' : ''}" onclick="kgb.setTab('${t[0]}')">
                <i class="fas ${t[1]}"></i> ${t[2]}${t[3] ? `<span class="kg-badge">${t[3]}</span>` : ''}</button>`).join('')}
        </div>
        <div id="kg-body">${this._tabHtml()}</div>`;
    },

    setTab(t) { this.tab = t; this.render(); },

    _tabHtml() {
        const l = this.list, c = this.ctx;
        if (this.tab === 'masuk') {
            const pend = l.masuk.filter(x => x.bisaAct), done = l.masuk.filter(x => !x.bisaAct);
            return (pend.length ? `<h3 class="kg-sec">Menunggu Anda <span>${pend.length}</span></h3><div class="kg-list">${pend.map(x => this._card(x, 'masuk')).join('')}</div>` :
                `<div class="kg-empty"><i class="fas fa-circle-check"></i><p>Tidak ada pengajuan yang menunggu Anda.</p></div>`) +
                (done.length ? `<h3 class="kg-sec">Riwayat <span>${done.length}</span></h3><div class="kg-list">${done.map(x => this._card(x, 'masuk')).join('')}</div>` : '');
        }
        if (this.tab === 'semua') {
            return l.semua.length ? `<div class="kg-list">${l.semua.map(x => this._card(x, 'semua')).join('')}</div>` :
                '<div class="kg-empty"><i class="fas fa-folder-open"></i><p>Belum ada pengajuan KGB.</p></div>';
        }
        const ajukan = c.me ? `<button type="button" class="kg-btn kg-btn-primary kg-new" onclick="kgb.openForm()"><i class="fas fa-plus"></i> Ajukan KGB Baru</button>` :
            '<div class="kg-note"><i class="fas fa-circle-info"></i> Akun admin tidak terhubung ke data karyawan, jadi tidak bisa mengajukan KGB.</div>';
        return ajukan + (l.saya.length ? `<div class="kg-list">${l.saya.map(x => this._card(x, 'saya')).join('')}</div>` :
            '<div class="kg-empty"><i class="fas fa-file-circle-plus"></i><p>Belum ada pengajuan KGB. Tekan "Ajukan KGB Baru" untuk memulai.</p></div>');
    },

    _card(x, mode) {
        const catAsmen = (x.steps.filter(s => s.aksi === 'putusan' && s.catatan)[0] || {}).catatan;
        return `<div class="kg-card kg-s-${x.status === 'Disetujui' ? 'ok' : (x.status === 'Ditolak' ? 'no' : 'wait')}">
            <div class="kg-card-top">
                <div class="kg-who"><div class="kg-av">${this._e((x.pemohonNama || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                    <div><b>${this._e(x.pemohonNama)}</b><span>${this._e([x.pemohonJabatan, x.pemohonBagian].filter(Boolean).join(' · '))}</span></div></div>
                ${this._statusChip(x.status)}
            </div>
            <div class="kg-meta">
                <div><small>No. SK KGB terakhir</small><b>${this._e(x.nomorSuratLama)}</b></div>
                <div><small>TMT KGB diajukan</small><b>${this._tgl(x.tmtKgb)}</b></div>
                <div><small>Diajukan</small><b>${this._tgl(x.createdAt)}</b></div>
            </div>
            ${this._stepper(x.steps)}
            ${catAsmen ? `<div class="kg-cat"><i class="fas fa-comment-dots"></i><div><small>Catatan Asmen</small>${this._e(catAsmen)}</div></div>` : ''}
            <div class="kg-actions">
                <button type="button" class="kg-btn" onclick="kgb.openDetail('${this._e(x.id)}','${mode}')"><i class="fas fa-eye"></i> ${x.bisaAct ? 'Buka & Proses' : 'Lihat Detail'}</button>
                ${x.bisaHapus ? `<button type="button" class="kg-btn kg-btn-danger" onclick="kgb.hapus('${this._e(x.id)}', this)"><i class="fas fa-trash"></i> Hapus</button>` : ''}
            </div>
        </div>`;
    },

    // ── Overlay (modal) ────────────────────────────────────
    _openModal(html) {
        this._closeModal();
        const ov = document.createElement('div');
        ov.className = 'kg-overlay';
        ov.id = 'kg-overlay';
        ov.innerHTML = `<div class="kg-modal" role="dialog">${html}</div>`;
        ov.addEventListener('mousedown', (e) => { if (e.target === ov && !this._busy) this._closeModal(); });
        document.body.appendChild(ov);
        document.body.classList.add('kg-lock');
    },
    _closeModal() {
        const ov = this._$('kg-overlay');
        if (ov) ov.remove();
        document.body.classList.remove('kg-lock');
    },
    // Dialog konfirmasi bergaya modal (pengganti confirm() bawaan browser).
    // opsi: { judul, teks, icon, tone: 'ok'|'no'|'info', okLabel, batalLabel }
    _confirm(o) {
        return new Promise(resolve => {
            const old = this._$('kg-confirm');
            if (old) old.remove();
            const ov = document.createElement('div');
            ov.className = 'kg-confirm';
            ov.id = 'kg-confirm';
            const tone = o.tone || 'info';
            ov.innerHTML = `<div class="kg-cf kg-cf-${tone}" role="alertdialog">
                <div class="kg-cf-ic"><i class="fas ${o.icon || 'fa-circle-question'}"></i></div>
                <h4>${this._e(o.judul)}</h4>
                <p>${this._e(o.teks || '')}</p>
                ${o.catatan ? `<div class="kg-cf-note"><small>Catatan</small>${this._e(o.catatan)}</div>` : ''}
                <div class="kg-cf-btn">
                    <button type="button" class="kg-btn" data-r="0">${this._e(o.batalLabel || 'Batal')}</button>
                    <button type="button" class="kg-btn ${tone === 'no' ? 'kg-btn-dangersolid' : 'kg-btn-ok'}" data-r="1"><i class="fas ${o.okIcon || 'fa-check'}"></i> ${this._e(o.okLabel || 'Ya')}</button>
                </div></div>`;
            const done = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
            const onKey = (e) => { if (e.key === 'Escape') done(false); };
            ov.addEventListener('click', (e) => {
                const b = e.target.closest('button[data-r]');
                if (b) done(b.dataset.r === '1');
                else if (e.target === ov) done(false);
            });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(ov);
            const okBtn = ov.querySelector('[data-r="1"]');
            if (okBtn) okBtn.focus();
        });
    },

    _busyShow(teks, sub) {
        this._busy = true;
        let b = this._$('kg-busy');
        if (!b) { b = document.createElement('div'); b.id = 'kg-busy'; b.className = 'kg-busy'; document.body.appendChild(b); }
        b.innerHTML = `<div class="kg-busy-card"><div class="kg-spin"></div><b>${this._e(teks)}</b>${sub ? `<small>${this._e(sub)}</small>` : ''}</div>`;
    },
    _busyOk(teks) {
        const b = this._$('kg-busy');
        if (b) b.innerHTML = `<div class="kg-busy-card ok"><div class="kg-check"><i class="fas fa-check"></i></div><b>${this._e(teks)}</b></div>`;
    },
    _busyHide() {
        this._busy = false;
        const b = this._$('kg-busy');
        if (b) b.remove();
    },

    // ── Form pengajuan ─────────────────────────────────────
    openForm() {
        this._slots = {};
        const rows = this.ctx.berkas.map((b, i) => `
            <div class="kg-slot" id="kg-slot-${b.key}">
                <div class="kg-slot-lab"><span class="kg-num">${i + 1}</span><div><b>${this._e(b.label)}</b><small>PDF / JPG / PNG, maks. 1 MB</small></div></div>
                <div class="kg-slot-act" id="kg-slot-act-${b.key}"></div>
                <input type="file" id="kg-file-${b.key}" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onchange="kgb.pickFile('${b.key}', this)">
            </div>`).join('');
        this._openModal(`
            <div class="kg-mh"><div class="kg-mh-ic"><i class="fas fa-file-circle-plus"></i></div><h3>Ajukan KGB</h3>
                <button type="button" class="kg-x" onclick="kgb._closeModal()" aria-label="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="kg-mb">
                <div class="kg-form">
                    <label>No. SK KGB Terakhir<input type="text" id="kg-f-nomor" maxlength="120" placeholder="Contoh: 11/PDAM.HSU/VII/2022"></label>
                    <label>TMT KGB yang Diajukan<input type="date" id="kg-f-tmt"></label>
                    <label class="kg-full">Keterangan (opsional)<textarea id="kg-f-ket" rows="2" maxlength="1000" placeholder="Catatan tambahan untuk pemroses"></textarea></label>
                </div>
                <h4 class="kg-h4"><i class="fas fa-paperclip"></i> Berkas Persyaratan <small>(semua wajib)</small></h4>
                <div class="kg-slots">${rows}</div>
                <div class="kg-flow"><i class="fas fa-route"></i><span>Alur: Asmen Umum &amp; Kepegawaian (setuju/tolak) → Manajer Umum &amp; Kepegawaian → Manajer Keuangan → Direktur (meninjau)</span></div>
            </div>
            <div class="kg-mf">
                <button type="button" class="kg-btn" onclick="kgb._closeModal()">Batal</button>
                <button type="button" class="kg-btn kg-btn-primary" id="kg-submit" onclick="kgb.submit()"><i class="fas fa-paper-plane"></i> Ajukan</button>
            </div>`);
        this.ctx.berkas.forEach(b => this._paintSlot(b.key));
    },

    _paintSlot(key) {
        const el = this._$('kg-slot-act-' + key);
        const s = this._slots[key];
        if (!el) return;
        const slot = this._$('kg-slot-' + key);
        if (slot) slot.classList.toggle('has', !!s);
        if (!s) {
            el.innerHTML = `<button type="button" class="kg-pick" onclick="kgb._$('kg-file-${key}').click()"><i class="fas fa-cloud-arrow-up"></i> Pilih berkas</button>`;
            return;
        }
        const st = s.status === 'upload' ? '<span class="kg-up"><span class="kg-spin sm"></span> Mengunggah...</span>' :
            (s.status === 'done' ? '<span class="kg-upok"><i class="fas fa-circle-check"></i> Terunggah</span>' :
                (s.status === 'err' ? '<span class="kg-uperr"><i class="fas fa-circle-exclamation"></i> Gagal</span>' : ''));
        el.innerHTML = `<div class="kg-file"><i class="fas ${/pdf/i.test(s.file.type) ? 'fa-file-pdf' : 'fa-file-image'}"></i>
            <div><b>${this._e(s.file.name)}</b><small>${this._ukuran(s.file.size)} ${st}</small></div>
            ${s.status === 'upload' ? '' : `<button type="button" class="kg-rm" onclick="kgb.removeFile('${key}')" aria-label="Hapus"><i class="fas fa-xmark"></i></button>`}</div>`;
    },

    pickFile(key, input) {
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        const okType = /^(application\/pdf|image\/jpeg|image\/png)$/i.test(f.type);
        if (!okType) { toast.error('Format berkas harus PDF, JPG, atau PNG.'); return; }
        // PDF tidak bisa dikompres di browser -> ditolak kalau > 1 MB.
        // Foto/gambar dikompres otomatis ke bawah 1 MB saat diunggah (lihat _readBase64).
        if (/pdf/i.test(f.type) && f.size > this.MAX_BYTES) { toast.error(`PDF terlalu besar (${this._ukuran(f.size)}). Maksimal 1 MB, kecilkan dulu ukurannya.`); return; }
        this._slots[key] = { file: f, fileId: '', nama: f.name, status: 'pending' };
        this._paintSlot(key);
    },

    removeFile(key) { delete this._slots[key]; this._paintSlot(key); },

    // Foto/gambar dikompres dulu supaya unggahan ringan; PDF dikirim apa adanya.
    _readBase64(file) {
        return new Promise((resolve, reject) => {
            if (/pdf/i.test(file.type)) {
                const r = new FileReader();
                r.onload = () => resolve({ base64: String(r.result).split(',')[1], mime: 'application/pdf' });
                r.onerror = () => reject(new Error('Gagal membaca berkas'));
                r.readAsDataURL(file);
                return;
            }
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                // Kecilkan bertahap (dimensi & kualitas) sampai di bawah 1 MB.
                let max = 1800, q = 0.82, out = '';
                for (let i = 0; i < 12; i++) {
                    const sc = Math.min(1, max / Math.max(img.width, img.height));
                    const cv = document.createElement('canvas');
                    cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
                    const ctx = cv.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    out = cv.toDataURL('image/jpeg', q).split(',')[1];
                    if (out.length * 0.75 <= this.MAX_BYTES * 0.95) break;
                    if (q > 0.5) q -= 0.1; else max = Math.round(max * 0.8);
                }
                if (out.length * 0.75 > this.MAX_BYTES) { reject(new Error('Gambar terlalu besar, gunakan foto yang lebih kecil.')); return; }
                resolve({ base64: out, mime: 'image/jpeg' });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca')); };
            img.src = url;
        });
    },

    async submit() {
        if (this._busy) return;
        const nomor = (this._$('kg-f-nomor').value || '').trim();
        const tmt = this._$('kg-f-tmt').value;
        const ket = (this._$('kg-f-ket').value || '').trim();
        if (!nomor) { toast.error('No. SK KGB terakhir wajib diisi.'); this._$('kg-f-nomor').focus(); return; }
        if (!tmt) { toast.error('TMT KGB yang diajukan wajib diisi.'); this._$('kg-f-tmt').focus(); return; }
        const kurang = this.ctx.berkas.filter(b => !this._slots[b.key]);
        if (kurang.length) {
            toast.error(`Berkas belum lengkap: ${kurang[0].label}${kurang.length > 1 ? ' (+' + (kurang.length - 1) + ' lagi)' : ''}`);
            const el = this._$('kg-slot-' + kurang[0].key);
            if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('kg-shake'); setTimeout(() => el.classList.remove('kg-shake'), 600); }
            return;
        }

        const total = this.ctx.berkas.length;
        let n = 0;
        this._busyShow('Mengunggah berkas...', `0 dari ${total}`);
        try {
            for (const b of this.ctx.berkas) {
                const s = this._slots[b.key];
                if (!s.fileId) {
                    s.status = 'upload'; this._paintSlot(b.key);
                    const rd = await this._readBase64(s.file);
                    const res = await api.uploadKgbFile({ key: b.key, base64: rd.base64, mimeType: rd.mime, fileName: s.file.name });
                    if (!res || !res.success) { s.status = 'err'; this._paintSlot(b.key); throw new Error((res && res.error) || `Gagal mengunggah "${b.label}"`); }
                    s.fileId = res.fileId; s.nama = res.nama || s.file.name; s.status = 'done'; this._paintSlot(b.key);
                }
                n++;
                this._busyShow('Mengunggah berkas...', `${n} dari ${total}`);
            }
            this._busyShow('Mengirim pengajuan...', 'Mohon tunggu');
            const res = await api.ajukanKgb({
                nomorSuratLama: nomor, tmtKgb: tmt, keterangan: ket,
                berkas: this.ctx.berkas.map(b => ({ key: b.key, fileId: this._slots[b.key].fileId, nama: this._slots[b.key].nama }))
            });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal mengajukan KGB');
            this._busyOk('Pengajuan KGB terkirim');
            await new Promise(r => setTimeout(r, 900));
            this._busyHide();
            this._closeModal();
            this.tab = 'saya';
            await this.refresh();
            toast.success('Pengajuan KGB berhasil dikirim.');
        } catch (e) {
            this._busyHide();
            toast.error(e.message || 'Gagal mengajukan KGB');
        }
    },

    // ── Detail & proses ────────────────────────────────────
    _find(id) {
        const all = [].concat(this.list.saya, this.list.masuk, this.list.semua);
        return all.filter(x => String(x.id) === String(id))[0] || null;
    },

    openDetail(id) {
        const x = this._find(id);
        if (!x) return;
        const cfg = (this.ctx.langkah || []).filter(s => s.key === x.langkahSaya)[0];
        const files = x.berkas.map(b => `
            <a class="kg-doc" href="${this._e(b.url)}" target="_blank" rel="noopener">
                <i class="fas ${/\.pdf$/i.test(b.nama) ? 'fa-file-pdf' : 'fa-file-lines'}"></i>
                <div><b>${this._e(b.label)}</b><small>${this._e(b.nama || 'Buka berkas')}</small></div><i class="fas fa-arrow-up-right-from-square go"></i></a>`).join('');
        let aksi = '';
        if (x.bisaAct && cfg) {
            aksi = cfg.aksi === 'putusan' ? `
                <div class="kg-proc">
                    <label>Catatan Asmen <small>(wajib jika menolak)</small>
                        <textarea id="kg-catatan" rows="3" maxlength="1000" placeholder="Tulis catatan untuk pemohon..."></textarea></label>
                    <div class="kg-proc-btn">
                        <button type="button" class="kg-btn kg-btn-danger" onclick="kgb.proses('${this._e(x.id)}','tolak')"><i class="fas fa-xmark"></i> Tolak</button>
                        <button type="button" class="kg-btn kg-btn-ok" onclick="kgb.proses('${this._e(x.id)}','setuju')"><i class="fas fa-check"></i> Setujui</button>
                    </div>
                </div>` : `
                <div class="kg-proc">
                    <div class="kg-note"><i class="fas fa-circle-info"></i> Pada tahap ini Anda hanya meninjau pengajuan dan berkasnya.</div>
                    <div class="kg-proc-btn">
                        <button type="button" class="kg-btn kg-btn-ok kg-wide" onclick="kgb.proses('${this._e(x.id)}','tinjau')"><i class="fas fa-clipboard-check"></i> Tandai Sudah Ditinjau</button>
                    </div>
                </div>`;
        }
        this._openModal(`
            <div class="kg-mh"><div class="kg-mh-ic"><i class="fas fa-file-lines"></i></div><h3>Detail Pengajuan KGB</h3>
                <button type="button" class="kg-x" onclick="kgb._closeModal()" aria-label="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="kg-mb">
                <div class="kg-card-top"><div class="kg-who"><div class="kg-av">${this._e((x.pemohonNama || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                    <div><b>${this._e(x.pemohonNama)}</b><span>${this._e([x.pemohonJabatan, x.pemohonBagian].filter(Boolean).join(' · '))}</span></div></div>${this._statusChip(x.status)}</div>
                <div class="kg-meta">
                    <div><small>No. SK KGB terakhir</small><b>${this._e(x.nomorSuratLama)}</b></div>
                    <div><small>TMT KGB diajukan</small><b>${this._tgl(x.tmtKgb)}</b></div>
                    <div><small>Diajukan</small><b>${this._tgl(x.createdAt)}</b></div>
                </div>
                ${x.keterangan ? `<div class="kg-cat"><i class="fas fa-align-left"></i><div><small>Keterangan pemohon</small>${this._e(x.keterangan)}</div></div>` : ''}
                <h4 class="kg-h4"><i class="fas fa-paperclip"></i> Berkas</h4>
                <div class="kg-docs">${files}</div>
                <h4 class="kg-h4"><i class="fas fa-route"></i> Progres Persetujuan</h4>
                ${this._stepper(x.steps)}
                ${x.steps.filter(s => s.aksi === 'putusan' && s.catatan).map(s => `<div class="kg-cat"><i class="fas fa-comment-dots"></i><div><small>Catatan ${this._e(s.label)}</small>${this._e(s.catatan)}</div></div>`).join('')}
                ${aksi}
            </div>`);
    },

    async proses(id, tindakan) {
        if (this._busy) return;
        const catatan = this._$('kg-catatan') ? this._$('kg-catatan').value.trim() : '';
        if (tindakan === 'tolak' && !catatan) { toast.error('Catatan alasan penolakan wajib diisi.'); this._$('kg-catatan').focus(); return; }
        const x = this._find(id);
        const nama = x ? x.pemohonNama : 'pemohon';
        const cfgs = {
            setuju: { judul: 'Setujui pengajuan KGB?', teks: `Pengajuan KGB ${nama} akan disetujui dan diteruskan ke tahap peninjauan berikutnya.`, icon: 'fa-circle-check', tone: 'ok', okLabel: 'Ya, Setujui', okIcon: 'fa-check' },
            tolak: { judul: 'Tolak pengajuan KGB?', teks: `Pengajuan KGB ${nama} akan ditolak dan proses dihentikan. Pemohon akan menerima catatan Anda.`, icon: 'fa-circle-xmark', tone: 'no', okLabel: 'Ya, Tolak', okIcon: 'fa-xmark' },
            tinjau: { judul: 'Tandai sudah ditinjau?', teks: `Anda menyatakan telah meninjau pengajuan KGB ${nama}. Pengajuan akan diteruskan ke tahap berikutnya.`, icon: 'fa-clipboard-check', tone: 'ok', okLabel: 'Ya, Sudah Ditinjau', okIcon: 'fa-clipboard-check' }
        };
        const cf = Object.assign({}, cfgs[tindakan], catatan ? { catatan } : {});
        if (!(await this._confirm(cf))) return;
        this._busyShow('Memproses...', 'Mohon tunggu');
        try {
            const res = await api.prosesKgb({ id, tindakan, catatan });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal memproses');
            this._busyOk(res.message || 'Berhasil');
            await new Promise(r => setTimeout(r, 800));
            this._busyHide();
            this._closeModal();
            await this.refresh();
        } catch (e) {
            this._busyHide();
            toast.error(e.message || 'Gagal memproses pengajuan');
        }
    },

    async hapus(id, btn) {
        if (this._busy) return;
        if (!(await this._confirm({ judul: 'Hapus pengajuan KGB?', teks: 'Pengajuan beserta seluruh berkas yang diunggah akan dihapus dan tidak bisa dikembalikan.', icon: 'fa-trash', tone: 'no', okLabel: 'Ya, Hapus', okIcon: 'fa-trash' }))) return;
        const old = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="kg-spin sm"></span> Menghapus...'; }
        try {
            const res = await api.hapusKgb(id);
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menghapus');
            toast.success('Pengajuan dihapus.');
            await this.refresh();
        } catch (e) {
            if (btn) { btn.disabled = false; btn.innerHTML = old; }
            toast.error(e.message || 'Gagal menghapus pengajuan');
        }
    }
};

window.kgb = kgb;
window.initKgb = () => kgb.init();
