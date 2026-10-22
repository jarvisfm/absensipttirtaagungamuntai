/**
 * Portal Karyawan - Jadwal Jaga Operator: TAMPILAN MODERN
 *
 * File ini HANYA mengganti cara jadwal DITAMPILKAN & DIISI (tabel dengan
 * kotak centang kecil -> kartu per hari + pemilih petugas). Semua logika lama
 * di js/jadwal-jaga-operator.js TIDAK diubah dan tetap dipakai apa adanya:
 * muat/simpan jadwal, Upload Excel, Cetak, Export Excel, hak akses Asmen,
 * pencocokan absen. Format data yang disimpan JUGA TIDAK berubah (days[d]
 * .sessions[key] = [id,...] / id, atau days[d].petugas), jadi jadwal lama
 * otomatis tampil, dan jadwal yang diatur di sini tetap terbaca proses absen.
 *
 * Cara kerja: file ini dimuat SETELAH jadwal-jaga-operator.js, lalu menimpa
 * 2 fungsi render (_renderMultiSesi & _renderKontinu), dan membungkus
 * _markDirty & saveData untuk memperbarui bar "belum disimpan".
 * Kalau file ini dihapus dari index.html, tampilan otomatis kembali ke tabel lama.
 *
 * Fitur: kartu hari (akhir pekan/hari ini ditandai), klik sesi -> pemilih
 * petugas (cari nama, hitung jumlah jaga, peringatan bentrok), MODE KUAS
 * (pilih petugas di panel lalu klik sesi untuk pasang/lepas cepat), ISI CEPAT
 * (rentang tanggal/hari + rotasi bergantian), SALIN dari bulan lalu, salin
 * ke hari berikutnya, kosongkan hari/bulan, catatan per hari.
 */
(function () {
    if (typeof jadwalJagaOperator === 'undefined') return;
    const J = jadwalJagaOperator;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    J._jx = J._jx || { activeOp: null, filter: 'all', palSearch: '', slots: [], picker: null };

    // ------------------------------------------------------------------
    //  Data helper (bentuk data PERSIS sama dengan versi tabel lama)
    // ------------------------------------------------------------------
    J._jxSlotsFor = function (unit) {
        if (unit.pattern === 'multi-grup' || unit.pattern === 'multi-solo') {
            const multi = unit.pattern === 'multi-grup';
            return unit.sessions.map(s => ({ key: s.key, label: s.label, time: s.time || '', multi, kind: 'session' }));
        }
        return [{ key: 'petugas', label: 'Petugas Jaga', time: unit.jamLabel || '', multi: !!unit.multiPetugas, kind: 'field' }];
    };

    J._jxRawFrom = function (days, d, slot) {
        const day = days && days[d];
        if (!day) return [];
        const raw = slot.kind === 'session' ? (day.sessions || {})[slot.key] : day.petugas;
        if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
        return raw ? [String(raw)] : [];
    };

    J._jxGet = function (d, slot) { return this._jxRawFrom(this.data.days, d, slot); };

    J._jxSet = function (d, slot, ids, silent) {
        const uniq = Array.from(new Set(ids.map(String).filter(Boolean)));
        if (!this.data.days[d]) this.data.days[d] = {};
        const day = this.data.days[d];
        const val = slot.multi ? uniq : (uniq[0] || '');
        if (slot.kind === 'session') {
            if (!day.sessions) day.sessions = {};
            day.sessions[slot.key] = val;
        } else {
            day.petugas = val;
        }
        if (!silent) this._markDirty();
    };

    J._jxToggle = function (d, slot, id) {
        id = String(id);
        const cur = this._jxGet(d, slot);
        let next;
        if (slot.multi) next = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
        else next = cur.includes(id) ? [] : [id];
        this._jxSet(d, slot, next);
    };

    J._jxName = function (id) {
        const n = this._employeeName(id);
        return n || null;
    };

    J._jxHue = function (id) {
        const list = this._employeesForUnit(this.unitKey);
        let i = list.findIndex(e => String(e.id) === String(id));
        if (i < 0) i = Number(id) || 0;
        return (i * 47 + 200) % 360;
    };

    J._jxDayStatus = function (d) {
        const slots = this._jx.slots;
        const seen = {};
        let filled = 0;
        slots.forEach((s, i) => {
            const ids = this._jxGet(d, s);
            if (ids.length) filled++;
            ids.forEach(id => { (seen[id] = seen[id] || new Set()).add(i); });
        });
        const conflictIds = slots.length > 1 && slots[0].kind === 'session'
            ? Object.keys(seen).filter(id => seen[id].size > 1) : [];
        return { empty: filled === 0, conflict: conflictIds.length > 0, conflictIds };
    };

    J._jxCounts = function () {
        const counts = {};
        const days = this._daysInMonth();
        for (let d = 1; d <= days; d++) {
            this._jx.slots.forEach(s => this._jxGet(d, s).forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
        }
        return counts;
    };

    J._jxStats = function () {
        const days = this._daysInMonth();
        let empty = 0, conflict = 0, slotsTotal = days * this._jx.slots.length, slotsFilled = 0;
        for (let d = 1; d <= days; d++) {
            const st = this._jxDayStatus(d);
            if (st.empty) empty++;
            if (st.conflict) conflict++;
            this._jx.slots.forEach(s => { if (this._jxGet(d, s).length) slotsFilled++; });
        }
        return { days, empty, conflict, slotsTotal, slotsFilled };
    };

    // ------------------------------------------------------------------
    //  Render utama (menggantikan _renderMultiSesi & _renderKontinu)
    // ------------------------------------------------------------------
    J._renderMultiSesi = function (unit) { this._jxRender(unit); };
    J._renderKontinu = function (unit) { this._jxRender(unit); };

    J._jxRender = function (unit) {
        const wrap = document.getElementById('jjo-table-wrap');
        if (!wrap) return;
        const ui = this._jx;
        ui.unit = unit;
        ui.slots = this._jxSlotsFor(unit);
        const now = new Date();
        ui.today = (now.getFullYear() === this.year && now.getMonth() === this.month) ? now.getDate() : 0;

        const emps = this._employeesForUnit(this.unitKey);
        if (ui.activeOp && !emps.some(e => String(e.id) === String(ui.activeOp))) ui.activeOp = null;
        if (!this.data.days) this.data.days = {};

        wrap.innerHTML = `
            <div class="jjx-app">
                <div class="jjx-stats" id="jjx-stats"></div>
                <div class="jjx-toolbar">
                    <button type="button" class="jjx-btn primary" data-act="bulk"><i class="fas fa-wand-magic-sparkles"></i> Isi Cepat</button>
                    <button type="button" class="jjx-btn" data-act="copyprev"><i class="fas fa-copy"></i> Salin Bulan Lalu</button>
                    <button type="button" class="jjx-btn danger-ghost" data-act="clearmonth"><i class="fas fa-eraser"></i> Kosongkan Bulan</button>
                    <div class="jjx-filter">
                        <button type="button" class="jjx-fchip" data-act="filter" data-v="all">Semua</button>
                        <button type="button" class="jjx-fchip" data-act="filter" data-v="empty">Belum terisi</button>
                        <button type="button" class="jjx-fchip" data-act="filter" data-v="conflict">Bentrok</button>
                    </div>
                </div>
                <div class="jjx-paint" id="jjx-paint"></div>
                <div class="jjx-layout">
                    <aside class="jjx-palette">
                        <div class="jjx-pal-head"><b>Petugas</b><small>Klik nama untuk MODE KUAS, lalu klik sesi di kalender</small></div>
                        <input type="search" class="jjx-search" id="jjx-pal-search" placeholder="Cari petugas..." value="${esc(ui.palSearch)}" autocomplete="off">
                        <div class="jjx-pal-list" id="jjx-pal-list"></div>
                    </aside>
                    <section class="jjx-days" id="jjx-days"></section>
                </div>
                <div class="jjx-savebar" id="jjx-savebar" hidden>
                    <span><i class="fas fa-circle"></i> Ada perubahan yang belum disimpan</span>
                    <span class="jjx-savebar-btns">
                        <button type="button" class="jjx-btn" data-act="discard">Batalkan</button>
                        <button type="button" class="jjx-btn primary" data-act="save"><i class="fas fa-save"></i> Simpan</button>
                    </span>
                </div>
            </div>`;

        wrap.onclick = (e) => this._jxOnClick(e);
        wrap.oninput = (e) => this._jxOnInput(e);

        this._jxEnsureModal();
        this._jxRenderPalette();
        this._jxRenderDays();
        this._jxRenderStats();
        this._jxRenderPaint();
        this._jxUpdateBar();
    };

    J._jxRenderStats = function () {
        const el = document.getElementById('jjx-stats');
        if (!el) return;
        const s = this._jxStats();
        const pct = s.slotsTotal ? Math.round(s.slotsFilled / s.slotsTotal * 100) : 0;
        el.innerHTML = `
            <div class="jjx-stat"><span class="jjx-stat-val">${s.slotsFilled}/${s.slotsTotal}</span><span class="jjx-stat-lbl">Sesi terisi</span>
                <div class="jjx-bar"><i style="width:${pct}%"></i></div></div>
            <div class="jjx-stat ${s.empty ? 'warn' : 'ok'}"><span class="jjx-stat-val">${s.empty}</span><span class="jjx-stat-lbl">Hari belum ada petugas</span></div>
            <div class="jjx-stat ${s.conflict ? 'bad' : 'ok'}"><span class="jjx-stat-val">${s.conflict}</span><span class="jjx-stat-lbl">Hari bentrok</span></div>`;
        document.querySelectorAll('#jjo-table-wrap .jjx-fchip').forEach(b => {
            b.classList.toggle('on', b.dataset.v === this._jx.filter);
        });
    };

    J._jxRenderPaint = function () {
        const el = document.getElementById('jjx-paint');
        if (!el) return;
        const id = this._jx.activeOp;
        if (!id) { el.innerHTML = ''; el.classList.remove('on'); return; }
        el.classList.add('on');
        el.style.setProperty('--h', this._jxHue(id));
        el.innerHTML = `<span><i class="fas fa-paintbrush"></i> Mode kuas: klik sesi untuk memasang/melepas <b>${esc(this._jxName(id) || id)}</b></span>
            <button type="button" class="jjx-btn sm" data-act="paint-off">Selesai</button>`;
    };

    J._jxRenderPalette = function () {
        const list = document.getElementById('jjx-pal-list');
        if (!list) return;
        const q = (this._jx.palSearch || '').toLowerCase().trim();
        const counts = this._jxCounts();
        const emps = this._employeesForUnit(this.unitKey)
            .filter(e => !q || String(e.nama || '').toLowerCase().includes(q))
            .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        if (!emps.length) {
            list.innerHTML = `<div class="jjx-empty-sm">${this._employeesForUnit(this.unitKey).length ? 'Tidak ada yang cocok.' : 'Belum ada karyawan Operator di unit ini.'}</div>`;
            return;
        }
        list.innerHTML = emps.map(e => `
            <button type="button" class="jjx-op${String(this._jx.activeOp) === String(e.id) ? ' on' : ''}" data-act="op" data-id="${esc(e.id)}" style="--h:${this._jxHue(e.id)}">
                <i class="jjx-dot"></i><span class="jjx-op-name">${esc(e.nama)}</span>
                <span class="jjx-op-count" data-count-for="${esc(e.id)}" title="Jumlah sesi jaga bulan ini">${counts[String(e.id)] || 0}</span>
            </button>`).join('');
    };

    J._jxUpdateCounts = function () {
        const counts = this._jxCounts();
        document.querySelectorAll('#jjx-pal-list [data-count-for]').forEach(el => {
            el.textContent = counts[el.dataset.countFor] || 0;
        });
    };

    J._jxSlotHtml = function (d, slot, i, conflictIds) {
        const ids = this._jxGet(d, slot);
        const chips = ids.map(id => {
            const name = this._jxName(id);
            const bad = conflictIds.includes(id);
            return `<span class="jjx-chip${bad ? ' warn' : ''}${name ? '' : ' unknown'}" style="--h:${this._jxHue(id)}" title="${bad ? 'Bertugas di lebih dari 1 sesi pada hari ini' : ''}">
                <i class="jjx-dot"></i><span class="jjx-chip-name">${esc(name || ('Petugas #' + id + ' (tidak dikenal)'))}</span>
                <button type="button" class="jjx-x" data-act="rm" data-day="${d}" data-slot="${i}" data-id="${esc(id)}" aria-label="Hapus petugas">&times;</button>
            </span>`;
        }).join('');
        return `
            <div class="jjx-slot${ids.length ? '' : ' is-blank'}" data-act="slot" data-day="${d}" data-slot="${i}" tabindex="0">
                <div class="jjx-slot-label"><b>${esc(slot.label)}</b>${slot.time ? `<small>${esc(slot.time)}</small>` : ''}</div>
                <div class="jjx-chips">${chips}${(!ids.length || slot.multi) ? `<span class="jjx-add"><i class="fas fa-plus"></i>${ids.length ? '' : ' Pilih petugas'}</span>` : ''}</div>
            </div>`;
    };

    J._jxDayHtml = function (d) {
        const info = this._dayInfo(d);
        const st = this._jxDayStatus(d);
        const note = (this.data.days[d] && this.data.days[d].keterangan) || '';
        const cls = ['jjx-day'];
        if (info.dow === 0) cls.push('is-minggu');
        if (info.dow === 6) cls.push('is-sabtu');
        if (this._jx.today === d) cls.push('is-today');
        if (st.empty) cls.push('is-empty');
        if (st.conflict) cls.push('is-conflict');
        const tgl = `${String(d).padStart(2, '0')} ${BULAN_NAMA[this.month]} ${this.year}`;
        return `
        <article class="${cls.join(' ')}" data-day="${d}">
            <header class="jjx-day-head">
                <div class="jjx-day-num">${d}</div>
                <div class="jjx-day-meta"><b>${esc(info.hariName)}</b><small>${esc(tgl)}</small></div>
                ${this._jx.today === d ? '<span class="jjx-badge today">Hari ini</span>' : ''}
                ${st.conflict ? '<span class="jjx-badge bad" title="Ada petugas yang bertugas di lebih dari 1 sesi hari ini">Bentrok</span>' : ''}
                ${st.empty ? '<span class="jjx-badge warn">Kosong</span>' : ''}
                <span class="jjx-day-tools">
                    <button type="button" class="jjx-icon-btn" data-act="copynext" data-day="${d}" title="Salin isi hari ini ke hari berikutnya"${d >= this._daysInMonth() ? ' disabled' : ''}><i class="fas fa-arrow-right"></i></button>
                    <button type="button" class="jjx-icon-btn" data-act="clearday" data-day="${d}" title="Kosongkan hari ini"><i class="fas fa-eraser"></i></button>
                </span>
            </header>
            <div class="jjx-slots">${this._jx.slots.map((s, i) => this._jxSlotHtml(d, s, i, st.conflictIds)).join('')}</div>
            <div class="jjx-note${note ? ' open' : ''}">
                <button type="button" class="jjx-note-btn" data-act="note" data-day="${d}"><i class="fas fa-pen"></i> Catatan</button>
                <input type="text" class="jjx-note-input" data-day="${d}" value="${esc(note)}" placeholder="Catatan (opsional)">
            </div>
        </article>`;
    };

    J._jxRenderDays = function () {
        const el = document.getElementById('jjx-days');
        if (!el) return;
        const total = this._daysInMonth();
        const f = this._jx.filter;
        let html = '';
        for (let d = 1; d <= total; d++) {
            if (f !== 'all') {
                const st = this._jxDayStatus(d);
                if (f === 'empty' && !st.empty) continue;
                if (f === 'conflict' && !st.conflict) continue;
            }
            html += this._jxDayHtml(d);
        }
        el.innerHTML = html || `<div class="jjx-empty-lg"><i class="fas fa-circle-check"></i><p>${f === 'empty' ? 'Semua hari sudah ada petugasnya.' : 'Tidak ada hari yang bentrok.'}</p></div>`;
    };

    // Segarkan 1 kartu hari + statistik + hitungan (tanpa render ulang semua)
    J._jxRefreshDay = function (d) {
        const old = document.querySelector(`#jjx-days .jjx-day[data-day="${d}"]`);
        if (old) {
            const tmp = document.createElement('div');
            tmp.innerHTML = this._jxDayHtml(d).trim();
            old.replaceWith(tmp.firstElementChild);
        }
        this._jxRenderStats();
        this._jxUpdateCounts();
    };

    J._jxRefreshAll = function () {
        this._jxRenderPalette();
        this._jxRenderDays();
        this._jxRenderStats();
        this._jxRenderPaint();
        this._jxUpdateBar();
    };

    J._jxUpdateBar = function () {
        const bar = document.getElementById('jjx-savebar');
        if (bar) bar.hidden = !this._dirty;
    };

    // ------------------------------------------------------------------
    //  Event (delegasi)
    // ------------------------------------------------------------------
    J._jxOnInput = function (e) {
        const t = e.target;
        if (t.id === 'jjx-pal-search') {
            this._jx.palSearch = t.value;
            this._jxRenderPalette();
        } else if (t.classList.contains('jjx-note-input')) {
            const d = t.dataset.day;
            if (!this.data.days[d]) this.data.days[d] = {};
            this.data.days[d].keterangan = t.value;
            this._markDirty();
        }
    };

    J._jxOnClick = function (e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const d = parseInt(btn.dataset.day, 10);
        const ui = this._jx;

        switch (act) {
            case 'rm': {
                e.stopPropagation();
                const slot = ui.slots[btn.dataset.slot];
                this._jxSet(d, slot, this._jxGet(d, slot).filter(x => x !== String(btn.dataset.id)));
                this._jxRefreshDay(d);
                break;
            }
            case 'slot': {
                const slot = ui.slots[btn.dataset.slot];
                if (ui.activeOp) {
                    this._jxToggle(d, slot, ui.activeOp);
                    this._jxRefreshDay(d);
                } else {
                    this._jxOpenPicker(d, parseInt(btn.dataset.slot, 10));
                }
                break;
            }
            case 'op':
                ui.activeOp = String(ui.activeOp) === String(btn.dataset.id) ? null : String(btn.dataset.id);
                this._jxRenderPalette();
                this._jxRenderPaint();
                break;
            case 'paint-off':
                ui.activeOp = null;
                this._jxRenderPalette();
                this._jxRenderPaint();
                break;
            case 'filter':
                ui.filter = btn.dataset.v;
                this._jxRenderDays();
                this._jxRenderStats();
                break;
            case 'note': {
                const box = btn.closest('.jjx-note');
                if (box) { box.classList.add('open'); const inp = box.querySelector('input'); if (inp) inp.focus(); }
                break;
            }
            case 'copynext': {
                const total = this._daysInMonth();
                if (d >= total) break;
                ui.slots.forEach(s => this._jxSet(d + 1, s, this._jxGet(d, s), true));
                this._markDirty();
                this._jxRefreshDay(d + 1);
                toast.success(`Isi tanggal ${d} disalin ke tanggal ${d + 1}.`);
                break;
            }
            case 'clearday':
                ui.slots.forEach(s => this._jxSet(d, s, [], true));
                this._markDirty();
                this._jxRefreshDay(d);
                break;
            case 'bulk': this._jxOpenBulk(); break;
            case 'copyprev': this._jxCopyPrevMonth(); break;
            case 'clearmonth': {
                if (!confirm('Kosongkan SEMUA petugas di bulan ini? (Catatan harian tidak ikut dihapus. Belum tersimpan sebelum Anda menekan Simpan.)')) break;
                const total = this._daysInMonth();
                for (let i = 1; i <= total; i++) ui.slots.forEach(s => this._jxSet(i, s, [], true));
                this._markDirty();
                this._jxRefreshAll();
                break;
            }
            case 'save': this.saveData(); break;
            case 'discard':
                if (confirm('Buang semua perubahan yang belum disimpan dan muat ulang jadwal tersimpan?')) this.loadAndRender();
                break;
        }
    };

    // ------------------------------------------------------------------
    //  Modal bersama (pemilih petugas & Isi Cepat)
    // ------------------------------------------------------------------
    J._jxEnsureModal = function () {
        let m = document.getElementById('jjx-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'jjx-modal';
        m.className = 'jjx-modal';
        m.addEventListener('click', (e) => {
            if (e.target === m) return this._jxCloseModal();
            this._jxOnModalClick(e);
        });
        m.addEventListener('input', (e) => {
            if (e.target.id === 'jjx-picker-search') this._jxFillPickerList(e.target.value);
        });
        document.body.appendChild(m);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && m.classList.contains('open')) this._jxCloseModal();
        });
        return m;
    };

    J._jxCloseModal = function () {
        const m = document.getElementById('jjx-modal');
        if (m) { m.classList.remove('open'); m.innerHTML = ''; }
        this._jx.picker = null;
    };

    J._jxOpenPicker = function (d, slotIdx) {
        const ui = this._jx, slot = ui.slots[slotIdx], info = this._dayInfo(d);
        ui.picker = { d, slotIdx };
        const m = this._jxEnsureModal();
        m.innerHTML = `
            <div class="jjx-sheet" role="dialog" aria-modal="true">
                <div class="jjx-sheet-head">
                    <div><b>${esc(info.hariName)}, ${esc(info.tanggalStr)}</b>
                        <small>${esc(slot.label)}${slot.time ? ' &middot; ' + esc(slot.time) : ''} &middot; ${slot.multi ? 'boleh lebih dari 1 petugas' : '1 petugas'}</small></div>
                    <button type="button" class="jjx-icon-btn" data-act="close" aria-label="Tutup">&times;</button>
                </div>
                <input type="search" class="jjx-search" id="jjx-picker-search" placeholder="Cari nama petugas..." autocomplete="off">
                <div class="jjx-sheet-list" id="jjx-picker-list"></div>
                <div class="jjx-sheet-foot">
                    <button type="button" class="jjx-btn" data-act="clear-slot">Kosongkan sesi ini</button>
                    <button type="button" class="jjx-btn primary" data-act="close">Selesai</button>
                </div>
            </div>`;
        m.classList.add('open');
        this._jxFillPickerList('');
    };

    J._jxFillPickerList = function (q) {
        const ui = this._jx;
        const list = document.getElementById('jjx-picker-list');
        if (!list || !ui.picker) return;
        const { d, slotIdx } = ui.picker;
        const slot = ui.slots[slotIdx];
        const selected = this._jxGet(d, slot);
        const counts = this._jxCounts();
        const needle = String(q || '').toLowerCase().trim();

        const emps = this._employeesForUnit(this.unitKey).slice()
            .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        const known = new Set(emps.map(e => String(e.id)));
        const extra = selected.filter(id => !known.has(id)).map(id => ({ id, nama: 'Petugas #' + id + ' (tidak dikenal)' }));

        const rows = emps.concat(extra)
            .filter(e => !needle || String(e.nama || '').toLowerCase().includes(needle))
            .map(e => {
                const id = String(e.id);
                const on = selected.includes(id);
                const others = ui.slots.length > 1 && slot.kind === 'session'
                    ? ui.slots.filter((s, i) => i !== slotIdx && this._jxGet(d, s).includes(id)).map(s => s.label) : [];
                return `
                <button type="button" class="jjx-pick${on ? ' on' : ''}" data-act="pick" data-id="${esc(id)}" style="--h:${this._jxHue(id)}">
                    <i class="jjx-dot"></i>
                    <span class="jjx-pick-name">${esc(e.nama)}
                        ${others.length ? `<small class="jjx-pick-warn"><i class="fas fa-triangle-exclamation"></i> Sudah bertugas: ${esc(others.join(', '))}</small>` : ''}</span>
                    <span class="jjx-pick-count">${counts[id] || 0}x</span>
                    <span class="jjx-pick-check"><i class="fas fa-${slot.multi ? 'square-check' : 'circle-check'}"></i></span>
                </button>`;
            }).join('');
        list.innerHTML = rows || '<div class="jjx-empty-sm">Tidak ada petugas yang cocok.</div>';
    };

    J._jxOnModalClick = function (e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const ui = this._jx;
        switch (btn.dataset.act) {
            case 'close': this._jxCloseModal(); break;
            case 'pick': {
                if (!ui.picker) break;
                const { d, slotIdx } = ui.picker;
                const slot = ui.slots[slotIdx];
                this._jxToggle(d, slot, btn.dataset.id);
                this._jxRefreshDay(d);
                if (slot.multi) this._jxFillPickerList((document.getElementById('jjx-picker-search') || {}).value || '');
                else this._jxCloseModal();
                break;
            }
            case 'clear-slot': {
                if (!ui.picker) break;
                const { d, slotIdx } = ui.picker;
                this._jxSet(d, ui.slots[slotIdx], []);
                this._jxRefreshDay(d);
                this._jxFillPickerList((document.getElementById('jjx-picker-search') || {}).value || '');
                break;
            }
            case 'bulk-preset': this._jxBulkPreset(btn.dataset.v); break;
            case 'bulk-apply': this._jxApplyBulk(); break;
        }
    };

    // ------------------------------------------------------------------
    //  ISI CEPAT (rentang tanggal/hari + rotasi bergantian)
    // ------------------------------------------------------------------
    J._jxOpenBulk = function () {
        const ui = this._jx;
        const emps = this._employeesForUnit(this.unitKey).slice()
            .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
        if (!emps.length) { toast.warning('Belum ada karyawan Operator di unit ini.'); return; }
        const total = this._daysInMonth();
        const m = this._jxEnsureModal();
        ui.picker = null;
        m.innerHTML = `
            <div class="jjx-sheet jjx-sheet-lg" role="dialog" aria-modal="true">
                <div class="jjx-sheet-head">
                    <div><b>Isi Cepat Jadwal</b><small>${esc(BULAN_NAMA[this.month])} ${this.year} &middot; hasilnya baru tersimpan setelah Anda menekan Simpan</small></div>
                    <button type="button" class="jjx-icon-btn" data-act="close" aria-label="Tutup">&times;</button>
                </div>
                <div class="jjx-form">
                    ${ui.slots.length > 1 ? `
                    <div class="jjx-fg"><label>1. Sesi yang diisi</label>
                        <div class="jjx-checks">${ui.slots.map((s, i) => `<label class="jjx-check"><input type="checkbox" class="jjx-b-slot" value="${i}" checked> ${esc(s.label)}</label>`).join('')}</div></div>` : ''}
                    <div class="jjx-fg"><label>${ui.slots.length > 1 ? '2' : '1'}. Petugas</label>
                        <div class="jjx-checks">${emps.map(e => `<label class="jjx-check" style="--h:${this._jxHue(e.id)}"><input type="checkbox" class="jjx-b-op" value="${esc(e.id)}"> <i class="jjx-dot"></i> ${esc(e.nama)}</label>`).join('')}</div></div>
                    <div class="jjx-fg"><label>${ui.slots.length > 1 ? '3' : '2'}. Hari &amp; tanggal</label>
                        <div class="jjx-presets">
                            <button type="button" class="jjx-fchip" data-act="bulk-preset" data-v="all">Semua hari</button>
                            <button type="button" class="jjx-fchip" data-act="bulk-preset" data-v="weekday">Senin&ndash;Jumat</button>
                            <button type="button" class="jjx-fchip" data-act="bulk-preset" data-v="weekend">Sabtu&ndash;Minggu</button>
                        </div>
                        <div class="jjx-checks">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="jjx-check"><input type="checkbox" class="jjx-b-dow" value="${w}" checked> ${HARI_SINGKAT[w]}</label>`).join('')}</div>
                        <div class="jjx-range">Tanggal <input type="number" id="jjx-b-from" min="1" max="${total}" value="1"> s/d <input type="number" id="jjx-b-to" min="1" max="${total}" value="${total}"></div>
                    </div>
                    <div class="jjx-fg"><label>${ui.slots.length > 1 ? '4' : '3'}. Cara mengisi</label>
                        <label class="jjx-radio"><input type="radio" name="jjx-b-mode" value="add" checked> <span><b>Tambahkan</b> ke yang sudah ada</span></label>
                        <label class="jjx-radio"><input type="radio" name="jjx-b-mode" value="replace"> <span><b>Ganti</b> isi sesi dengan petugas terpilih</span></label>
                        <label class="jjx-radio"><input type="radio" name="jjx-b-mode" value="rotate"> <span><b>Rotasi bergantian</b> &mdash; tiap hari petugas berikutnya, mengulang dari awal. Ganti setiap
                            <input type="number" id="jjx-b-block" min="1" max="31" value="1" class="jjx-mini"> hari</span></label>
                    </div>
                </div>
                <div class="jjx-sheet-foot">
                    <button type="button" class="jjx-btn" data-act="close">Batal</button>
                    <button type="button" class="jjx-btn primary" data-act="bulk-apply"><i class="fas fa-check"></i> Terapkan</button>
                </div>
            </div>`;
        m.classList.add('open');
    };

    J._jxBulkPreset = function (v) {
        const set = (list) => document.querySelectorAll('#jjx-modal .jjx-b-dow').forEach(cb => { cb.checked = list.includes(parseInt(cb.value, 10)); });
        if (v === 'all') set([0, 1, 2, 3, 4, 5, 6]);
        if (v === 'weekday') set([1, 2, 3, 4, 5]);
        if (v === 'weekend') set([0, 6]);
    };

    J._jxApplyBulk = function () {
        const ui = this._jx;
        const q = (sel) => Array.from(document.querySelectorAll('#jjx-modal ' + sel));
        const slotIdx = ui.slots.length > 1 ? q('.jjx-b-slot').filter(c => c.checked).map(c => parseInt(c.value, 10)) : [0];
        const ops = q('.jjx-b-op').filter(c => c.checked).map(c => c.value);
        const dows = q('.jjx-b-dow').filter(c => c.checked).map(c => parseInt(c.value, 10));
        const total = this._daysInMonth();
        let from = parseInt(document.getElementById('jjx-b-from').value, 10) || 1;
        let to = parseInt(document.getElementById('jjx-b-to').value, 10) || total;
        from = Math.max(1, Math.min(total, from));
        to = Math.max(1, Math.min(total, to));
        if (from > to) { const t = from; from = to; to = t; }
        const mode = (document.querySelector('#jjx-modal input[name="jjx-b-mode"]:checked') || {}).value || 'add';
        const block = Math.max(1, parseInt((document.getElementById('jjx-b-block') || {}).value, 10) || 1);

        if (!slotIdx.length) { toast.warning('Pilih minimal 1 sesi.'); return; }
        if (!ops.length) { toast.warning('Pilih minimal 1 petugas.'); return; }
        if (!dows.length) { toast.warning('Pilih minimal 1 hari dalam pekan.'); return; }

        const targets = [];
        for (let d = from; d <= to; d++) {
            if (dows.includes(new Date(this.year, this.month, d).getDay())) targets.push(d);
        }
        if (!targets.length) { toast.warning('Tidak ada tanggal yang cocok dengan pilihan hari tersebut.'); return; }

        let changed = 0;
        targets.forEach((d, i) => {
            slotIdx.forEach(si => {
                const slot = ui.slots[si];
                let next;
                if (mode === 'rotate') next = [ops[Math.floor(i / block) % ops.length]];
                else if (mode === 'replace') next = slot.multi ? ops : [ops[0]];
                else next = slot.multi ? this._jxGet(d, slot).concat(ops) : [ops[0]];
                this._jxSet(d, slot, next, true);
                changed++;
            });
        });
        this._markDirty();
        this._jxCloseModal();
        this._jxRefreshAll();
        toast.success(`${changed} sesi di ${targets.length} hari terisi. Jangan lupa tekan Simpan.`);
    };

    // ------------------------------------------------------------------
    //  SALIN dari bulan lalu (Senin ke-1 -> Senin ke-1, dst.)
    // ------------------------------------------------------------------
    J._jxNthWeekday = function (year, month, dow, n) {
        const last = new Date(year, month + 1, 0).getDate();
        let count = 0, lastMatch = 0;
        for (let d = 1; d <= last; d++) {
            if (new Date(year, month, d).getDay() === dow) {
                count++; lastMatch = d;
                if (count === n) return d;
            }
        }
        return lastMatch; // kalau bulan itu tidak punya kemunculan ke-n, pakai yang terakhir
    };

    J._jxCopyPrevMonth = async function () {
        const ui = this._jx;
        let pm = this.month - 1, py = this.year;
        if (pm < 0) { pm = 11; py--; }
        if (!confirm(`Salin pola petugas dari ${BULAN_NAMA[pm]} ${py}?\n\nDicocokkan menurut hari dalam pekan (mis. Senin pertama -> Senin pertama). Isi petugas bulan ini akan DIGANTI (catatan harian tidak diubah). Belum tersimpan sebelum Anda menekan Simpan.`)) return;

        const slug = this.unitKey === 'TRD' && this.cabangTrd ? `TRD-${this.cabangTrd}` : this.unitKey;
        const key = `jaga_operator_${slug}_${py}-${String(pm + 1).padStart(2, '0')}`.replace(/\s+/g, '_');
        let prev = null;
        try {
            const res = await api.getSettingByKey(key);
            if (res && res.success && res.data) prev = JSON.parse(res.data);
        } catch (e) {
            console.error('Gagal memuat jadwal bulan lalu:', e);
        }
        if (!prev || !prev.days || !Object.keys(prev.days).length) {
            toast.warning(`Jadwal ${BULAN_NAMA[pm]} ${py} belum ada / kosong untuk unit ini.`);
            return;
        }

        const total = this._daysInMonth();
        let copied = 0;
        for (let d = 1; d <= total; d++) {
            const dow = new Date(this.year, this.month, d).getDay();
            const nth = Math.ceil(d / 7);
            const pd = this._jxNthWeekday(py, pm, dow, nth);
            ui.slots.forEach(s => {
                const ids = this._jxRawFrom(prev.days, pd, s);
                this._jxSet(d, s, ids, true);
                if (ids.length) copied++;
            });
        }
        this._markDirty();
        this._jxRefreshAll();
        toast.success(`${copied} sesi disalin dari ${BULAN_NAMA[pm]} ${py}. Periksa lalu tekan Simpan.`);
    };

    // ------------------------------------------------------------------
    //  Bungkus fungsi lama agar bar "belum disimpan" ikut sinkron
    // ------------------------------------------------------------------
    const origMark = J._markDirty;
    J._markDirty = function () {
        origMark.apply(this, arguments);
        if (this._jxUpdateBar) this._jxUpdateBar();
    };
    const origSave = J.saveData;
    J.saveData = async function () {
        const r = await origSave.apply(this, arguments);
        if (this._jxUpdateBar) this._jxUpdateBar();
        return r;
    };
})();
