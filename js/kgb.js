/**
 * Portal Karyawan - Pengajuan KGB (Kenaikan Gaji Berkala)
 * Backend: Kgbpengajuan.gs
 *
 * Karyawan mengunggah 5 berkas lalu mengajukan. Alur persetujuan:
 *   Asmen Umum & Kepegawaian (satu-satunya yang menyetujui/menolak + catatan)
 *   -> Manajer Umum & Kepegawaian (meninjau) -> Direktur (meninjau).
 * Riwayat KGB di Edit Profil & hitungan gaji TIDAK diubah di sini.
 *
 * Halaman ini melayani 2 jenis pengajuan lewat switch KGB | Pangkat (alur persetujuan sama):
 *   - KGB    -> SK dicatat ke Riwayat KGB
 *   - Pangkat -> SK Golongan dicatat ke Riwayat Pangkat (Riwayat Golongan di Edit Profil)
 */
const kgb = {
    ctx: null,       // { me, rekap, berkas, langkah, saya, asmenAda }
    list: null,      // { saya, masuk, semua, menungguCount }
    tab: 'saya',
    jenis: 'kgb',    // 'kgb' | 'pangkat' (switch di atas halaman)
    loading: false,
    error: '',
    _busy: false,
    _slots: {},      // key -> { file, fileId, nama, status }

    BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    MAX_BYTES: 1024 * 1024,   // batas ukuran tiap berkas: 1 MB

    // Teks per jenis pengajuan. kata = dipakai di kalimat; catat = nama SK; riwayat = tujuan pencatatan.
    JENIS: {
        kgb: {
            label: 'KGB', kata: 'KGB', full: 'Kenaikan Gaji Berkala', icon: 'fa-money-bill-trend-up',
            hero: 'Kenaikan Gaji Berkala (KGB)', heroDesc: 'Ajukan KGB dengan melampirkan berkas, lalu pantau tahap persetujuannya.',
            ajukan: 'Ajukan KGB Baru', formJudul: 'Ajukan KGB', catat: 'SK KGB', riwayat: 'Riwayat KGB'
        },
        pangkat: {
            label: 'Pangkat', kata: 'Kenaikan Pangkat', full: 'Kenaikan Pangkat', icon: 'fa-layer-group',
            hero: 'Kenaikan Pangkat', heroDesc: 'Ajukan kenaikan pangkat dengan melampirkan berkas, lalu pantau tahap persetujuannya.',
            ajukan: 'Ajukan Kenaikan Pangkat Baru', formJudul: 'Ajukan Kenaikan Pangkat', catat: 'SK Pangkat', riwayat: 'Riwayat Pangkat'
        }
    },
    JENIS_KENAIKAN: ['Reguler', 'Jabatan Struktural', 'Jabatan Fungsional Tertentu', 'Penyesuaian Ijazah'],
    _j() { return this.JENIS[this.jenis]; },
    _jenisOf(x) { return x && x.jenis === 'pangkat' ? 'pangkat' : 'kgb'; },   // data lama tanpa jenis = KGB
    _byJenis(arr) { return (arr || []).filter(x => this._jenisOf(x) === this.jenis); },
    _pending(j) { return this.list ? (this.list.masuk || []).filter(x => this._jenisOf(x) === j && (x.bisaAct || x.bisaCatat)).length : 0; },
    _kata(id) { const x = this._find(id); return this.JENIS[this._jenisOf(x)].kata; },

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
            root.className = '';
            root.innerHTML = `<div class="kg-empty"><i class="fas fa-triangle-exclamation"></i><p>${this._e(this.error)}</p>
                <button type="button" class="kg-btn" onclick="kgb.init()"><i class="fas fa-rotate"></i> Coba lagi</button></div>`;
            return;
        }
        if (!this.ctx || !this.list) return;
        root.className = 'kg-j-' + this.jenis;
        root.innerHTML = `<div id="kg-hero-wrap">${this._heroHtml()}</div>${this._switchHtml()}<div id="kg-main">${this._mainHtml()}</div>`;
    },

    _heroHtml() {
        const J = this._j();
        return `<div class="kg-hero">
            <div class="kg-hero-ic"><i class="fas ${J.icon}"></i></div>
            <div><h2>${this._e(J.hero)}</h2><p>${this._e(J.heroDesc)}</p></div>
        </div>`;
    },

    // Switch KGB | Pangkat: kapsul geser dengan badge jumlah pengajuan yang menunggu Anda.
    _switchHtml() {
        const opt = (k) => {
            const J = this.JENIS[k], n = this._pending(k), on = this.jenis === k;
            return `<button type="button" class="kg-sw-opt${on ? ' active' : ''}" data-j="${k}" role="tab" aria-selected="${on}" onclick="kgb.setJenis('${k}')">
                <span class="kg-sw-ic"><i class="fas ${J.icon}"></i></span>
                <span class="kg-sw-tx"><b>${this._e(J.label)}</b><small>${this._e(J.full)}</small></span>
                ${n ? `<span class="kg-badge">${n}</span>` : ''}
            </button>`;
        };
        return `<div class="kg-switch" id="kg-switch" data-j="${this.jenis}" role="tablist" aria-label="Jenis pengajuan">
            <span class="kg-sw-thumb"></span>${opt('kgb')}${opt('pangkat')}
        </div>`;
    },

    // Ganti jenis: switch diperbarui di tempat (supaya kapsulnya bergeser halus), isi halaman dimuat ulang.
    setJenis(k) {
        if (k === this.jenis || !this.JENIS[k]) return;
        this.jenis = k;
        const root = this._root(), sw = this._$('kg-switch');
        if (!root || !sw || !this.ctx || !this.list) { this.render(); return; }
        root.className = 'kg-j-' + k;
        sw.dataset.j = k;
        sw.querySelectorAll('.kg-sw-opt').forEach(b => {
            const on = b.dataset.j === k;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        this._$('kg-hero-wrap').innerHTML = this._heroHtml();
        this._$('kg-main').innerHTML = this._mainHtml();
    },

    _mainHtml() {
        const c = this.ctx, l = this.list;
        const isApprover = (c.saya || []).length > 0;
        const tabs = [['saya', 'fa-file-circle-plus', 'Pengajuan Saya', 0]];
        if (isApprover) tabs.push(['masuk', 'fa-clipboard-check', 'Perlu Ditinjau', this._pending(this.jenis)]);
        if (c.rekap) tabs.push(['semua', 'fa-table-list', 'Semua Pengajuan', 0]);
        if (!tabs.some(t => t[0] === this.tab)) this.tab = tabs[0][0];
        return `<div class="kg-tabs">${tabs.map(t => `
            <button type="button" class="kg-tab${this.tab === t[0] ? ' active' : ''}" onclick="kgb.setTab('${t[0]}')">
                <i class="fas ${t[1]}"></i> ${t[2]}${t[3] ? `<span class="kg-badge">${t[3]}</span>` : ''}</button>`).join('')}
        </div>
        <div id="kg-body">${this._tabHtml()}</div>`;
    },

    setTab(t) {
        this.tab = t;
        const m = this._$('kg-main');
        if (m && this.ctx && this.list) m.innerHTML = this._mainHtml(); else this.render();
    },

    _tabHtml() {
        const c = this.ctx, J = this._j();
        const masuk = this._byJenis(this.list.masuk), semua = this._byJenis(this.list.semua), saya = this._byJenis(this.list.saya);
        if (this.tab === 'masuk') {
            const pend = masuk.filter(x => x.bisaAct || x.bisaCatat), done = masuk.filter(x => !(x.bisaAct || x.bisaCatat));
            return (pend.length ? `<h3 class="kg-sec">Menunggu Anda <span>${pend.length}</span></h3><div class="kg-list">${pend.map(x => this._card(x, 'masuk')).join('')}</div>` :
                `<div class="kg-empty"><i class="fas fa-circle-check"></i><p>Tidak ada pengajuan ${this._e(J.kata)} yang menunggu Anda.</p></div>`) +
                (done.length ? `<h3 class="kg-sec">Riwayat <span>${done.length}</span></h3><div class="kg-list">${done.map(x => this._card(x, 'masuk')).join('')}</div>` : '');
        }
        if (this.tab === 'semua') {
            return semua.length ? `<div class="kg-list">${semua.map(x => this._card(x, 'semua')).join('')}</div>` :
                `<div class="kg-empty"><i class="fas fa-folder-open"></i><p>Belum ada pengajuan ${this._e(J.kata)}.</p></div>`;
        }
        const ajukan = c.me ? `<button type="button" class="kg-btn kg-btn-primary kg-new" onclick="kgb.openForm()"><i class="fas fa-plus"></i> ${this._e(J.ajukan)}</button>` :
            `<div class="kg-note"><i class="fas fa-circle-info"></i> Akun admin tidak terhubung ke data karyawan, jadi tidak bisa mengajukan ${this._e(J.kata)}.</div>`;
        return ajukan + (saya.length ? `<div class="kg-list">${saya.map(x => this._card(x, 'saya')).join('')}</div>` :
            `<div class="kg-empty"><i class="fas ${J.icon}"></i><p>Belum ada pengajuan ${this._e(J.kata)}. Tekan "${this._e(J.ajukan)}" untuk memulai.</p></div>`);
    },

    // Baris ringkas gaji + status pencatatan di Riwayat KGB (detail=true: hanya status riwayat).
    _gajiBaris(x, detail) {
        let h = '';
        if (!detail && x.gajiBaru) {
        }
        if (x.status === 'Disetujui') {
            const J = this.JENIS[this._jenisOf(x)];
            h += x.masukRiwayat
                ? `<div class="kg-gaji-line kg-gaji-ok"><i class="fas fa-link"></i> Sudah tercatat di ${J.riwayat}</div>`
                : `<div class="kg-gaji-line kg-gaji-todo"><i class="fas fa-circle-info"></i> ${x.bisaCatat ? `Silakan unggah ${J.catat} dan isi datanya agar tercatat di ${J.riwayat}.` : `Menunggu Asmen mengunggah ${J.catat} dan mencatatnya di ${J.riwayat}.`}</div>`;
        }
        return h;
    },

    // No. SK & TMT baru terisi setelah Asmen/Admin mencatat SK KGB; sebelumnya hanya tanggal pengajuan.
    _meta(x) {
        if (this._jenisOf(x) === 'pangkat') {
            const sk = x.nomorSuratLama
                ? `<div><small>No. SK Pangkat</small><b>${this._e(x.nomorSuratLama)}</b></div>
                    <div><small>TMT Golongan</small><b>${this._tgl(x.tmtKgb)}</b></div>
                    <div><small>Golongan Baru</small><b>${this._e(x.golongan || '-')}</b></div>` : '';
            return `<div class="kg-meta" style="grid-template-columns:${sk ? 'repeat(2,minmax(0,1fr))' : '1fr'}">${sk}
                    <div><small>Diajukan tanggal</small><b>${this._tgl(x.createdAt)}</b></div></div>`;
        }
        const sk = x.nomorSuratLama
            ? `<div><small>No. SK KGB terakhir</small><b>${this._e(x.nomorSuratLama)}</b></div>
                <div><small>TMT KGB diajukan</small><b>${this._tgl(x.tmtKgb)}</b></div>` : '';
        return `<div class="kg-meta"${sk ? '' : ' style="grid-template-columns:1fr"'}>${sk}
                <div><small>Diajukan tanggal</small><b>${this._tgl(x.createdAt)}</b></div></div>`;
    },

    _card(x, mode) {
        const catAsmen = (x.steps.filter(s => s.aksi === 'putusan' && s.catatan)[0] || {}).catatan;
        return `<div class="kg-card kg-s-${x.status === 'Disetujui' ? 'ok' : (x.status === 'Ditolak' ? 'no' : 'wait')}">
            <div class="kg-card-top">
                <div class="kg-who"><div class="kg-av">${this._e((x.pemohonNama || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                    <div><b>${this._e(x.pemohonNama)}</b><span>${this._e([x.pemohonJabatan, x.pemohonBagian].filter(Boolean).join(' · '))}</span></div></div>
                ${this._statusChip(x.status)}
            </div>
            ${this._meta(x)}
            ${this._gajiBaris(x)}
            ${this._stepper(x.steps)}
            ${catAsmen ? `<div class="kg-cat"><i class="fas fa-comment-dots"></i><div><small>Catatan Asmen</small>${this._e(catAsmen)}</div></div>` : ''}
            <div class="kg-actions">
                <button type="button" class="kg-btn" onclick="kgb.openDetail('${this._e(x.id)}','${mode}')"><i class="fas fa-eye"></i> ${x.bisaAct ? 'Buka & Proses' : (x.bisaCatat ? 'Catat ' + this.JENIS[this._jenisOf(x)].catat : 'Lihat Detail')}</button>
                ${x.bisaHapus ? `<button type="button" class="kg-btn kg-btn-danger" onclick="kgb.hapus('${this._e(x.id)}', this)"><i class="fas fa-trash"></i> Hapus</button>` : ''}
            </div>
        </div>`;
    },

    // ── Overlay (modal) ────────────────────────────────────
    _openModal(html) {
        this._closeModal();
        const ov = document.createElement('div');
        ov.className = 'kg-overlay kg-j-' + this.jenis;
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
                    ${o.hanyaOk ? '' : `<button type="button" class="kg-btn" data-r="0">${this._e(o.batalLabel || 'Batal')}</button>`}
                    <button type="button" class="kg-btn ${tone === 'no' ? 'kg-btn-dangersolid' : (tone === 'warn' ? 'kg-btn-warn' : 'kg-btn-ok')}" data-r="1"><i class="fas ${o.okIcon || 'fa-check'}"></i> ${this._e(o.okLabel || 'Ya')}</button>
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

    // Peringatan 1 tombol (mis. ukuran/format berkas tidak sesuai).
    _alert(judul, teks) {
        return this._confirm({ judul, teks, icon: 'fa-triangle-exclamation', tone: 'warn', hanyaOk: true, okLabel: 'Mengerti', okIcon: 'fa-check' });
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

    // ── Perhitungan gaji pokok dari tabel gaji (backend: Gajipokok.gs) ─────────
    _rp(n) { return 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },

    // Kotak ringkasan perhitungan. o: { golongan, mkg, sumber, gajiLamaText, gajiBaruText, selisih, pesan, ok }
    _gajiHtml(o) {
        if (!o || !o.ok) {
            return `<div class="kg-gaji kg-gaji-warn"><div class="kg-gaji-h"><i class="fas fa-calculator"></i> Perhitungan Gaji Pokok</div>
                <p class="kg-gaji-n">${this._e((o && o.pesan) || 'Belum bisa dihitung.')}</p></div>`;
        }
        const naik = Number(o.selisih) > 0 ? `<em>+${this._rp(o.selisih).replace('Rp ', '')}</em>` : '';
        return `<div class="kg-gaji">
            <div class="kg-gaji-h"><i class="fas fa-calculator"></i> Perhitungan Gaji Pokok (Tabel Gaji)</div>
            <div class="kg-gaji-g">
                <div><small>Golongan</small><b>${this._e(o.golongan || '-')}</b></div>
                <div><small>MKG</small><b>${o.mkg === null || o.mkg === '' || o.mkg === undefined ? '-' : this._e(o.mkg) + ' th'}</b></div>
                <div><small>Gaji saat ini</small><b>${o.gajiLamaText ? 'Rp ' + this._e(o.gajiLamaText) : '-'}</b></div>
                <div class="kg-gaji-new"><small>Gaji pokok baru</small><b>Rp ${this._e(o.gajiBaruText || '-')} ${naik}</b></div>
            </div>
            ${(o.sumber || o.pesan) ? `<p class="kg-gaji-n">${o.sumber ? 'MKG dari: ' + this._e(o.sumber) + '. ' : ''}${this._e(o.pesan || '')}</p>` : ''}
        </div>`;
    },

    async _hitungApi(tmt, mkg, targetId) {
        const res = await api.hitungGajiKgb({ tmtKgb: tmt, mkg: mkg === undefined || mkg === null ? '' : String(mkg), targetId: targetId || '' });
        if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menghitung gaji');
        return res.data;
    },

    // Form pengajuan: hitung ulang saat TMT / MKG berubah.
    hitungForm() {
        clearTimeout(this._tHitung);
        this._tHitung = setTimeout(async () => {
            const box = this._$('kg-gaji-box'), tmt = this._$('kg-f-tmt');
            if (!box || !tmt) return;
            if (!tmt.value) { box.innerHTML = '<p class="kg-hint"><i class="fas fa-circle-info"></i> Isi TMT KGB untuk melihat perkiraan gaji pokok baru dari tabel gaji.</p>'; return; }
            const mkgEl = this._$('kg-f-mkg');
            const manual = this._mkgManual && mkgEl.value !== '';
            box.innerHTML = '<p class="kg-hint"><span class="kg-spin sm"></span> Menghitung...</p>';
            try {
                const h = await this._hitungApi(tmt.value, manual ? mkgEl.value : '');
                if (!this._$('kg-gaji-box')) return;
                if (!manual && h.mkg !== null && h.mkg !== undefined) mkgEl.value = h.mkg;
                this._$('kg-gaji-box').innerHTML = this._gajiHtml(h);
            } catch (e) {
                if (this._$('kg-gaji-box')) this._$('kg-gaji-box').innerHTML = `<p class="kg-hint kg-hint-err"><i class="fas fa-triangle-exclamation"></i> ${this._e(e.message)}</p>`;
            }
        }, 350);
    },

    // ── Form Riwayat KGB (Edit Profil & Edit Karyawan admin) ─────────────────
    // p = awalan id elemen: 'pf-kgb' (Edit Profil) atau 'k-kgb' (admin). targetId = id karyawan.
    // Elemen: {p}-pengajuan-wrap/-pengajuan/-pengajuanId, {p}-gaji-hint, {p}-gajiPokokBaru, dst.
    _rk(p, s) { return document.getElementById(p + '-' + s); },

    async riwayatReset(p, targetId) {
        const g = this._rk(p, 'gajiPokokBaru'), h = this._rk(p, 'gaji-hint'), pid = this._rk(p, 'pengajuanId');
        if (g) g.dataset.auto = '1';
        if (h) h.innerHTML = '';
        if (pid) pid.value = '';
        const wrap = this._rk(p, 'pengajuan-wrap'), sel = this._rk(p, 'pengajuan');
        if (!wrap || !sel) return;
        wrap.style.display = 'none';
        sel.innerHTML = '<option value="">-- Isi manual (tanpa pengajuan) --</option>';
        try {
            const res = await api.getKgbPengajuanRiwayat(targetId);
            const list = (res && res.success && res.data) || [];
            this._pengajuanRiwayat = list;
            if (!list.length) return;
            sel.innerHTML += list.map(x => `<option value="${this._e(x.id)}">TMT ${this._e(this._tgl(x.tmtKgb))}${x.golongan ? ' · Gol ' + this._e(x.golongan) : ''}${x.gajiBaruText ? ' · Rp ' + this._e(x.gajiBaruText) : ''}</option>`).join('');
            wrap.style.display = '';
        } catch (e) { /* tanpa pilihan pengajuan, form tetap bisa diisi manual */ }
    },

    // Form dibuka untuk MENGEDIT: jangan menimpa gaji yang sudah tersimpan & sembunyikan pilihan pengajuan.
    riwayatMuatEdit(p, pengajuanId) {
        const g = this._rk(p, 'gajiPokokBaru'), h = this._rk(p, 'gaji-hint'), pid = this._rk(p, 'pengajuanId'), wrap = this._rk(p, 'pengajuan-wrap');
        if (g) g.dataset.auto = '0';
        if (h) h.innerHTML = pengajuanId ? '<i class="fas fa-link"></i> Terhubung ke Pengajuan KGB.' : '';
        if (pid) pid.value = pengajuanId || '';
        if (wrap) wrap.style.display = 'none';
    },

    riwayatPilih(p) {
        const sel = this._rk(p, 'pengajuan');
        const x = (this._pengajuanRiwayat || []).filter(r => String(r.id) === String(sel.value))[0];
        const pid = this._rk(p, 'pengajuanId'), g = this._rk(p, 'gajiPokokBaru'), h = this._rk(p, 'gaji-hint');
        if (pid) pid.value = x ? x.id : '';
        if (!x) { if (g) g.dataset.auto = '1'; if (h) h.innerHTML = ''; return; }
        if (x.tmtKgb) this._rk(p, 'tmtKgb').value = x.tmtKgb;
        if (x.mkgTahun !== '' && x.mkgTahun !== undefined) {
            this._rk(p, 'masaKerjaTahun').value = x.mkgTahun;
            if (!this._rk(p, 'masaKerjaBulan').value) this._rk(p, 'masaKerjaBulan').value = '0';
        }
        if (g) { g.value = x.gajiBaruText || ''; g.dataset.auto = '0'; }
        if (h) h.innerHTML = `<i class="fas fa-link"></i> Terisi dari Pengajuan KGB (SK terakhir: ${this._e(x.nomorSuratLama || '-')}). Isi nomor &amp; tanggal SK KGB yang baru terbit.`;
    },

    // force=true: tombol "Hitung dari tabel" (menimpa gaji & mengisi masa kerja kalau kosong).
    async riwayatHitung(p, targetId, force) {
        const tmt = this._rk(p, 'tmtKgb').value;
        const g = this._rk(p, 'gajiPokokBaru'), h = this._rk(p, 'gaji-hint'), mk = this._rk(p, 'masaKerjaTahun');
        if (!tmt) { if (force) toast.error('Isi TMT Kenaikan Gaji Berkala terlebih dahulu.'); return; }
        if (!force && g.dataset.auto === '0' && g.value) return;   // gaji sudah diisi/diubah manual
        try {
            const d = await this._hitungApi(tmt, mk.value, targetId);
            if (!d.ok) { if (h) h.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${this._e(d.pesan || 'Belum bisa dihitung dari tabel gaji.')}`; return; }
            if (force && mk.value === '' && d.mkg !== null) mk.value = d.mkg;
            g.value = d.gajiBaruText; g.dataset.auto = '1';
            if (h) h.innerHTML = `<i class="fas fa-calculator"></i> Dari tabel gaji: Golongan ${this._e(d.golongan)}, MKG ${this._e(d.mkg)} th${d.mkgTabel !== undefined && d.mkgTabel !== d.mkg ? ' (baris tabel ' + this._e(d.mkgTabel) + ')' : ''}. ${d.sumber ? 'MKG dari: ' + this._e(d.sumber) + '.' : ''}`;
        } catch (e) {
            if (force) toast.error(e.message || 'Gagal menghitung gaji');
        }
    },

    // ── Form pengajuan ─────────────────────────────────────
    _hariIni() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    openForm() {
        const J = this._j();
        this._slots = {};
        this._mkgManual = false;
        const rows = this.ctx.berkas.map((b, i) => `
            <div class="kg-slot" id="kg-slot-${b.key}">
                <div class="kg-slot-lab"><span class="kg-num">${i + 1}</span><div><b>${this._e(b.label)}</b><small>PDF / JPG / PNG, maks. 1 MB</small></div></div>
                <div class="kg-slot-act" id="kg-slot-act-${b.key}"></div>
                <input type="file" id="kg-file-${b.key}" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onchange="kgb.pickFile('${b.key}', this)">
            </div>`).join('');
        this._openModal(`
            <div class="kg-mh"><div class="kg-mh-ic"><i class="fas fa-file-circle-plus"></i></div><h3>${this._e(J.formJudul)}</h3>
                <button type="button" class="kg-x" onclick="kgb._closeModal()" aria-label="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="kg-mb">
                <div class="kg-jenis-tag"><i class="fas ${J.icon}"></i> ${this._e(J.full)}</div>
                <div class="kg-form">
                    <label class="kg-full">Diajukan Tanggal<input type="text" id="kg-f-tgl" value="${this._e(this._tgl(this._hariIni()))}" readonly></label>
                    <label class="kg-full">Keterangan (opsional)<textarea id="kg-f-ket" rows="2" maxlength="1000" placeholder="Catatan tambahan untuk pemroses"></textarea></label>
                </div>
                <h4 class="kg-h4"><i class="fas fa-paperclip"></i> Berkas Persyaratan <small>(semua wajib)</small></h4>
                <div class="kg-slots">${rows}</div>
                <div class="kg-flow"><i class="fas fa-route"></i><span>Alur: Asmen Umum &amp; Kepegawaian (setuju/tolak) → Manajer Umum &amp; Kepegawaian → Direktur (meninjau) → Asmen mengunggah ${this._e(J.catat)}</span></div>
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
        // Foto: tampilkan "ukuran asli -> ukuran setelah dikecilkan" (hasil nyata yang akan diunggah).
        const pk = s.packing ? '<span class="kg-up"><span class="kg-spin sm"></span> Mengecilkan...</span>' : '';
        const ukr = (s.packed && s.packed.size < s.file.size)
            ? `${this._ukuran(s.file.size)} &rarr; <b>${this._ukuran(s.packed.size)}</b>`
            : this._ukuran(s.file.size);
        el.innerHTML = `<div class="kg-file"><i class="fas ${/pdf/i.test(s.file.type) ? 'fa-file-pdf' : 'fa-file-image'}"></i>
            <div><b>${this._e(s.file.name)}</b><small>${ukr} ${st}${pk}</small></div>
            ${s.status === 'upload' ? '' : `<button type="button" class="kg-rm" onclick="kgb.removeFile('${key}')" aria-label="Hapus"><i class="fas fa-xmark"></i></button>`}</div>`;
    },

    async pickFile(key, input) {
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        const okType = /^(application\/pdf|image\/jpeg|image\/png)$/i.test(f.type);
        if (!okType) { this._alert('Format berkas tidak didukung', `"${f.name}" bukan PDF, JPG, atau PNG. Silakan pilih berkas dengan format yang sesuai.`); return; }
        // PDF tidak bisa dikompres di browser -> ditolak kalau > 1 MB.
        // Foto/gambar dikompres otomatis ke bawah 1 MB saat diunggah (lihat _readBase64).
        if (/pdf/i.test(f.type) && f.size > this.MAX_BYTES) {
            this._alert('File lebih dari 1 MB', `"${f.name}" berukuran ${this._ukuran(f.size)}. Ukuran maksimal tiap berkas adalah 1 MB. Silakan kecilkan ukuran PDF terlebih dahulu (mis. kompres PDF atau scan dengan resolusi lebih rendah), lalu unggah kembali.`);
            return;
        }
        // Foto/gambar > 1 MB: beri peringatan dulu. Boleh dilanjutkan (nanti dikecilkan
        // otomatis saat diunggah) atau pilih file lain. PDF > 1 MB sudah ditolak di atas.
        if (!/pdf/i.test(f.type) && f.size > this.MAX_BYTES) {
            const lanjut = await this._confirm({
                judul: 'File lebih dari 1 MB',
                teks: `"${f.name}" berukuran ${this._ukuran(f.size)}. Ukuran maksimal tiap berkas adalah 1 MB. Foto ini akan dikecilkan otomatis saat diunggah (kualitas bisa sedikit menurun). Lanjutkan?`,
                icon: 'fa-triangle-exclamation', tone: 'warn',
                okLabel: 'Kecilkan & Pakai', okIcon: 'fa-compress', batalLabel: 'Pilih File Lain'
            });
            if (!lanjut) return;
        }
        this._slots[key] = { file: f, fileId: '', nama: f.name, status: 'pending' };
        this._paintSlot(key);
        if (!/pdf/i.test(f.type)) this._pack(key);
    },

    // Kecilkan foto SEKARANG (bukan menunggu tombol Ajukan) supaya ukuran hasilnya bisa
    // ditampilkan. Hasilnya disimpan di slot (s.packed) dan dipakai ulang saat submit().
    async _pack(key) {
        const s = this._slots[key];
        if (!s) return;
        s.packing = true;
        this._paintSlot(key);
        s.packPromise = this._readBase64(s.file);
        try {
            const rd = await s.packPromise;
            if (this._slots[key] !== s) return; // sudah dihapus/diganti user
            s.packed = { base64: rd.base64, mime: rd.mime, size: Math.round(rd.base64.length * 0.75) };
        } catch (e) {
            if (this._slots[key] === s) {
                delete this._slots[key];
                this._paintSlot(key);
                this._alert('Gambar tidak bisa diproses', `"${s.file.name}": ${e.message || 'gagal dikecilkan'} Silakan pilih foto lain.`);
            }
            return;
        } finally {
            s.packing = false;
            if (this._slots[key] === s) this._paintSlot(key);
        }
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
        const ket = (this._$('kg-f-ket').value || '').trim();
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
                    const rd = s.packed || await (s.packPromise || this._readBase64(s.file));
                    const res = await api.uploadKgbFile({ key: b.key, base64: rd.base64, mimeType: rd.mime, fileName: s.file.name });
                    if (!res || !res.success) { s.status = 'err'; this._paintSlot(b.key); throw new Error((res && res.error) || `Gagal mengunggah "${b.label}"`); }
                    s.fileId = res.fileId; s.nama = res.nama || s.file.name; s.status = 'done'; this._paintSlot(b.key);
                }
                n++;
                this._busyShow('Mengunggah berkas...', `${n} dari ${total}`);
            }
            this._busyShow('Mengirim pengajuan...', 'Mohon tunggu');
            const res = await api.ajukanKgb({
                jenis: this.jenis,
                keterangan: ket,
                berkas: this.ctx.berkas.map(b => ({ key: b.key, fileId: this._slots[b.key].fileId, nama: this._slots[b.key].nama }))
            });
            if (!res || !res.success) throw new Error((res && res.error) || ('Gagal mengajukan ' + this._j().kata));
            this._busyOk('Pengajuan ' + this._j().kata + ' terkirim');
            await new Promise(r => setTimeout(r, 900));
            this._busyHide();
            this._closeModal();
            this.tab = 'saya';
            await this.refresh();
            toast.success('Pengajuan ' + this._j().kata + ' berhasil dikirim.');
        } catch (e) {
            this._busyHide();
            toast.error(e.message || ('Gagal mengajukan ' + this._j().kata));
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
        this._detailId = x.id;
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
        // Setelah semua tahap selesai: Asmen/Admin mengunggah SK KGB & mengisi datanya (otomatis masuk Riwayat KGB pemohon).
        let catat = '';
        if (x.bisaCatat && this._jenisOf(x) === 'pangkat') {
            delete this._slots.sk;
            catat = this._catatPangkatHtml();
        } else if (x.bisaCatat) {
            delete this._slots.sk;
            catat = `
                <div class="kg-proc" id="kg-catat">
                    <h4 class="kg-h4"><i class="fas fa-file-signature"></i> Catat SK KGB</h4>
                    <div class="kg-note"><i class="fas fa-circle-info"></i> Pengajuan sudah selesai ditinjau. Unggah SK KGB dan isi data berikut; hasilnya otomatis tampil di Riwayat KGB pemohon.</div>
                    <div class="kg-form" style="margin-top:12px">
                        <label>No. SK KGB Terakhir<input type="text" id="kg-c-nomor" maxlength="120" placeholder="Contoh: 11/PDAM.HSU/VII/2022"></label>
                        <label>TMT KGB Diajukan<input type="date" id="kg-c-tmt"></label>
                        <label>Masa Kerja (Tahun/Bulan) <input type="text" id="kg-c-mk" maxlength="5" inputmode="text" autocomplete="off" placeholder="Contoh: 6/9" oninput="this.value=this.value.replace(/[^0-9\/]/g,'')"></label>
                        <label>Gaji Pokok Baru (Rp) <input type="text" id="kg-c-gaji" inputmode="numeric" placeholder="Contoh: 3.500.000" oninput="this.value=this.value.replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.')"></label>
                    </div>
                    <div class="kg-slots" style="margin-top:12px">
                        <div class="kg-slot" id="kg-slot-sk">
                            <div class="kg-slot-lab"><span class="kg-num"><i class="fas fa-file-signature"></i></span><div><b>Berkas SK KGB</b><small>PDF / JPG / PNG, maks. 1 MB</small></div></div>
                            <div class="kg-slot-act" id="kg-slot-act-sk"></div>
                            <input type="file" id="kg-file-sk" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onchange="kgb.pickFile('sk', this)">
                        </div>
                    </div>
                    <div class="kg-proc-btn">
                        <button type="button" class="kg-btn kg-btn-ok kg-wide" onclick="kgb.catat('${this._e(x.id)}')"><i class="fas fa-floppy-disk"></i> Simpan ke Riwayat KGB</button>
                    </div>
                </div>`;
        }
        this._openModal(`
            <div class="kg-mh"><div class="kg-mh-ic"><i class="fas fa-file-lines"></i></div><h3>Detail Pengajuan ${this._e(this.JENIS[this._jenisOf(x)].kata)}</h3>
                <button type="button" class="kg-x" onclick="kgb._closeModal()" aria-label="Tutup"><i class="fas fa-xmark"></i></button></div>
            <div class="kg-mb">
                <div class="kg-card-top"><div class="kg-who"><div class="kg-av">${this._e((x.pemohonNama || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                    <div><b>${this._e(x.pemohonNama)}</b><span>${this._e([x.pemohonJabatan, x.pemohonBagian].filter(Boolean).join(' · '))}</span></div></div>${this._statusChip(x.status)}</div>
                ${this._meta(x)}
                ${this._gajiBaris(x, true)}
                ${x.keterangan ? `<div class="kg-cat"><i class="fas fa-align-left"></i><div><small>Keterangan pemohon</small>${this._e(x.keterangan)}</div></div>` : ''}
                <h4 class="kg-h4"><i class="fas fa-paperclip"></i> Berkas</h4>
                <div class="kg-docs">${files}</div>
                <h4 class="kg-h4"><i class="fas fa-route"></i> Progres Persetujuan</h4>
                ${this._stepper(x.steps)}
                ${x.steps.filter(s => s.aksi === 'putusan' && s.catatan).map(s => `<div class="kg-cat"><i class="fas fa-comment-dots"></i><div><small>Catatan ${this._e(s.label)}</small>${this._e(s.catatan)}</div></div>`).join('')}
                ${aksi}
                ${catat}
            </div>`);
        if (x.bisaCatat) this._paintSlot('sk');
    },

    async proses(id, tindakan) {
        if (this._busy) return;
        const catatan = this._$('kg-catatan') ? this._$('kg-catatan').value.trim() : '';
        if (tindakan === 'tolak' && !catatan) { toast.error('Catatan alasan penolakan wajib diisi.'); this._$('kg-catatan').focus(); return; }
        const x = this._find(id);
        const nama = x ? x.pemohonNama : 'pemohon';
        const jn = this.JENIS[this._jenisOf(x)].kata;
        const cfgs = {
            setuju: { judul: `Setujui pengajuan ${jn}?`, teks: `Pengajuan ${jn} ${nama} akan disetujui dan diteruskan ke tahap peninjauan berikutnya.`, icon: 'fa-circle-check', tone: 'ok', okLabel: 'Ya, Setujui', okIcon: 'fa-check' },
            tolak: { judul: `Tolak pengajuan ${jn}?`, teks: `Pengajuan ${jn} ${nama} akan ditolak dan proses dihentikan. Pemohon akan menerima catatan Anda.`, icon: 'fa-circle-xmark', tone: 'no', okLabel: 'Ya, Tolak', okIcon: 'fa-xmark' },
            tinjau: { judul: 'Tandai sudah ditinjau?', teks: `Anda menyatakan telah meninjau pengajuan ${jn} ${nama}. Pengajuan akan diteruskan ke tahap berikutnya.`, icon: 'fa-clipboard-check', tone: 'ok', okLabel: 'Ya, Sudah Ditinjau', okIcon: 'fa-clipboard-check' }
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

    // Asmen/Admin: unggah SK KGB + isi datanya -> otomatis tercatat di Riwayat KGB pemohon.
    async catat(id) {
        if (this._busy) return;
        if (this._jenisOf(this._find(id)) === 'pangkat') return this.catatPangkat(id);
        const v = (k) => (this._$(k) ? this._$(k).value.trim() : '');
        const nomor = v('kg-c-nomor'), tmt = v('kg-c-tmt'), mk = v('kg-c-mk'), gaji = v('kg-c-gaji');
        const s = this._slots.sk;
        if (!nomor) { toast.error('No. SK KGB terakhir wajib diisi.'); this._$('kg-c-nomor').focus(); return; }
        if (!tmt) { toast.error('TMT KGB wajib diisi.'); this._$('kg-c-tmt').focus(); return; }
        const mkm = /^(\d{1,2})\/(\d{1,2})$/.exec(mk);
        if (!mkm || Number(mkm[2]) > 11) { toast.error('Masa kerja wajib diisi format tahun/bulan, contoh 6/9 (bulan 0-11).'); this._$('kg-c-mk').focus(); return; }
        if (!gaji) { toast.error('Gaji pokok wajib diisi.'); this._$('kg-c-gaji').focus(); return; }
        if (!s) { toast.error('Berkas SK KGB wajib diunggah.'); return; }
        const x = this._find(id);
        const nama = x ? x.pemohonNama : 'pemohon';
        if (!(await this._confirm({ judul: 'Simpan SK KGB?', teks: `SK KGB ${nama} akan dicatat dan langsung tampil di Riwayat KGB pemohon.`, icon: 'fa-file-signature', tone: 'ok', okLabel: 'Ya, Simpan', okIcon: 'fa-floppy-disk' }))) return;
        this._busyShow('Menyimpan SK KGB...', 'Mengunggah berkas');
        try {
            const rd = s.packed || await (s.packPromise || this._readBase64(s.file));
            const res = await api.catatSkKgb({
                id, nomorSurat: nomor, tmtKgb: tmt, masaKerja: mk, gajiPokokBaru: gaji,
                base64: rd.base64, mimeType: rd.mime, fileName: s.file.name
            });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menyimpan SK KGB');
            this._busyOk(res.message || 'SK KGB tersimpan');
            await new Promise(r => setTimeout(r, 900));
            this._busyHide();
            this._closeModal();
            delete this._slots.sk;
            await this.refresh();
        } catch (e) {
            this._busyHide();
            toast.error(e.message || 'Gagal menyimpan SK KGB');
        }
    },

    // Form Catat SK Pangkat -> otomatis jadi Riwayat Golongan (Riwayat Pangkat) pemohon.
    _catatPangkatHtml() {
        return `
                <div class="kg-proc" id="kg-catat">
                    <h4 class="kg-h4"><i class="fas fa-file-signature"></i> Catat SK Pangkat</h4>
                    <div class="kg-note"><i class="fas fa-circle-info"></i> Pengajuan sudah selesai ditinjau. Unggah SK Golongan dan isi data berikut; hasilnya otomatis tampil di Riwayat Pangkat pemohon.</div>
                    <div class="kg-form" style="margin-top:12px">
                        <label>Golongan<input type="text" id="kg-p-gol" maxlength="20" autocomplete="off" placeholder="Contoh: III/b"></label>
                        <label>TMT Golongan<input type="date" id="kg-p-tmt"></label>
                        <label>Jenis Kenaikan<select id="kg-p-jenis"><option value="">-- Pilih Jenis Kenaikan --</option>${this.JENIS_KENAIKAN.map(o => `<option value="${this._e(o)}">${this._e(o)}</option>`).join('')}</select></label>
                        <label>Nomor SK<input type="text" id="kg-p-nomor" maxlength="120" autocomplete="off" placeholder="Contoh: 824/038-SI/BKPSDM/2022"></label>
                        <label>Masa Kerja Golongan (Tahun)<input type="number" id="kg-p-mkt" min="0" max="60" inputmode="numeric" placeholder="Contoh: 2"></label>
                        <label>Masa Kerja Golongan (Bulan)<input type="number" id="kg-p-mkb" min="0" max="11" inputmode="numeric" placeholder="Contoh: 0"></label>
                        <label class="kg-full">Tanggal SK<input type="date" id="kg-p-tglsk"></label>
                    </div>
                    <div class="kg-slots" style="margin-top:12px">
                        <div class="kg-slot" id="kg-slot-sk">
                            <div class="kg-slot-lab"><span class="kg-num"><i class="fas fa-file-signature"></i></span><div><b>Berkas SK Golongan</b><small>PDF / JPG / PNG, maks. 1 MB</small></div></div>
                            <div class="kg-slot-act" id="kg-slot-act-sk"></div>
                            <input type="file" id="kg-file-sk" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onchange="kgb.pickFile('sk', this)">
                        </div>
                    </div>
                    <div class="kg-proc-btn">
                        <button type="button" class="kg-btn kg-btn-ok kg-wide" onclick="kgb.catat('${this._e(this._detailId)}')"><i class="fas fa-floppy-disk"></i> Simpan ke Riwayat Pangkat</button>
                    </div>
                </div>`;
    },

    // Asmen/Admin: unggah SK Golongan + isi datanya -> otomatis tercatat di Riwayat Pangkat pemohon.
    async catatPangkat(id) {
        const v = (k) => (this._$(k) ? this._$(k).value.trim() : '');
        const f = { gol: v('kg-p-gol'), tmt: v('kg-p-tmt'), jenis: v('kg-p-jenis'), nomor: v('kg-p-nomor'), mkt: v('kg-p-mkt'), mkb: v('kg-p-mkb'), tglsk: v('kg-p-tglsk') };
        const s = this._slots.sk;
        const salah = (msg, el) => { toast.error(msg); if (this._$(el)) this._$(el).focus(); };
        if (!f.gol) return salah('Golongan wajib diisi.', 'kg-p-gol');
        if (!f.tmt) return salah('TMT Golongan wajib diisi.', 'kg-p-tmt');
        if (!f.jenis) return salah('Jenis Kenaikan wajib dipilih.', 'kg-p-jenis');
        if (!f.nomor) return salah('Nomor SK wajib diisi.', 'kg-p-nomor');
        if (!/^\d{1,2}$/.test(f.mkt)) return salah('Masa Kerja Golongan (Tahun) wajib diisi.', 'kg-p-mkt');
        if (!/^\d{1,2}$/.test(f.mkb) || Number(f.mkb) > 11) return salah('Masa Kerja Golongan (Bulan) wajib diisi (0-11).', 'kg-p-mkb');
        if (!f.tglsk) return salah('Tanggal SK wajib diisi.', 'kg-p-tglsk');
        if (!s) { toast.error('Berkas SK Golongan wajib diunggah.'); return; }
        const x = this._find(id);
        const nama = x ? x.pemohonNama : 'pemohon';
        if (!(await this._confirm({ judul: 'Simpan SK Pangkat?', teks: `SK Pangkat ${nama} akan dicatat dan langsung tampil di Riwayat Pangkat pemohon.`, icon: 'fa-file-signature', tone: 'ok', okLabel: 'Ya, Simpan', okIcon: 'fa-floppy-disk' }))) return;
        this._busyShow('Menyimpan SK Pangkat...', 'Mengunggah berkas');
        try {
            const rd = s.packed || await (s.packPromise || this._readBase64(s.file));
            const res = await api.catatSkKgb({
                id, golongan: f.gol, tmtGolongan: f.tmt, jenisKenaikan: f.jenis, nomorSK: f.nomor,
                masaKerjaTahun: f.mkt, masaKerjaBulan: f.mkb, tanggalSK: f.tglsk,
                base64: rd.base64, mimeType: rd.mime, fileName: s.file.name
            });
            if (!res || !res.success) throw new Error((res && res.error) || 'Gagal menyimpan SK Pangkat');
            this._busyOk(res.message || 'SK Pangkat tersimpan');
            await new Promise(r => setTimeout(r, 900));
            this._busyHide();
            this._closeModal();
            delete this._slots.sk;
            await this.refresh();
        } catch (e) {
            this._busyHide();
            toast.error(e.message || 'Gagal menyimpan SK Pangkat');
        }
    },

    async hapus(id, btn) {
        if (this._busy) return;
        if (!(await this._confirm({ judul: 'Hapus pengajuan ' + this._kata(id) + '?', teks: 'Pengajuan beserta seluruh berkas yang diunggah akan dihapus dan tidak bisa dikembalikan.', icon: 'fa-trash', tone: 'no', okLabel: 'Ya, Hapus', okIcon: 'fa-trash' }))) return;
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
