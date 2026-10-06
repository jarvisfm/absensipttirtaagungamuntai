/**
 * Portal Karyawan - Paraf (tanda paraf + tanggal paraf) pada Approval
 * PT. Tirta Agung Amuntai
 *
 * Dipakai modal Approval Izin (Izin Harian, Izin Keluar Kantor, dst) dan
 * modal Approval Cuti. Approver BOLEH (opsional) menggambar paraf di kotak
 * kanvas dan mengatur tanggal parafnya, lalu paraf + tanggal itu ikut
 * tercetak di surat (lihat print-letters.js), sama seperti paraf tulisan
 * tangan pada formulir kertas.
 *
 * Paraf disimpan sebagai DATA GARIS (path SVG, ruang koordinat 300 x 120),
 * BUKAN gambar - ukurannya cuma ~1-3 KB, tajam di ukuran cetak berapa pun,
 * dan tidak membebani daftar pengajuan yang dimuat sekaligus.
 *
 * Cara pakai:
 *   paraf.editorHtml('id-unik')   -> HTML kotak paraf (taruh di modal)
 *   paraf.init('id-unik')         -> aktifkan kanvas SETELAH HTML dipasang
 *   paraf.getValue('id-unik')     -> { path, date } atau null (tidak diparaf)
 *   paraf.render(path, date, {height, align}) -> HTML untuk surat cetak
 */
const paraf = {
    W: 300,
    H: 120,
    _state: {},

    _today() {
        try {
            if (window.dateTime && typeof dateTime.getLocalDate === 'function') {
                return dateTime.getLocalDate();
            }
        } catch (e) { /* pakai fallback di bawah */ }
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    editorHtml(id) {
        return `
            <div id="${id}-wrap" style="margin-top:14px;border:1px dashed var(--border-color,#d1d5db);border-radius:10px;padding:10px 12px;background:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
                    <span style="font-size:0.85rem;font-weight:600;">&#9997;&#65039; Paraf <span style="font-weight:400;color:var(--text-muted,#6b7280);">(opsional, untuk Setuju)</span></span>
                    <a href="javascript:void(0)" onclick="paraf.clear('${id}')" style="font-size:0.82rem;">Hapus</a>
                </div>
                <canvas id="${id}-canvas" width="${this.W * 2}" height="${this.H * 2}"
                    style="width:100%;aspect-ratio:${this.W} / ${this.H};background:#f9fafb;border-radius:8px;touch-action:none;cursor:crosshair;display:block;"></canvas>
                <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
                    <label for="${id}-date" style="font-size:0.8rem;color:var(--text-muted,#6b7280);margin:0;">Tanggal paraf</label>
                    <input type="date" id="${id}-date" value="${this._today()}"
                        style="padding:4px 8px;border:1px solid var(--border-color,#d1d5db);border-radius:6px;font-size:0.85rem;">
                </div>
            </div>`;
    },

    init(id) {
        const canvas = document.getElementById(`${id}-canvas`);
        if (!canvas) return;

        const st = { strokes: [], cur: null, canvas };
        this._state[id] = st;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(2, 0, 0, 2, 0, 0); // gambar dalam koordinat 300 x 120
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';

        const pos = (e) => {
            const r = canvas.getBoundingClientRect();
            return [
                Math.round(((e.clientX - r.left) * (this.W / r.width)) * 10) / 10,
                Math.round(((e.clientY - r.top) * (this.H / r.height)) * 10) / 10
            ];
        };

        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
            const p = pos(e);
            st.cur = [p];
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(p[0] + 0.01, p[1]);
            ctx.stroke();
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!st.cur) return;
            e.preventDefault();
            const p = pos(e);
            const last = st.cur[st.cur.length - 1];
            if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
            st.cur.push(p);
            ctx.beginPath();
            ctx.moveTo(last[0], last[1]);
            ctx.lineTo(p[0], p[1]);
            ctx.stroke();
        });

        const end = () => {
            if (!st.cur) return;
            st.strokes.push(st.cur);
            st.cur = null;
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('pointerleave', end);
    },

    clear(id) {
        const st = this._state[id];
        if (!st) return;
        st.strokes = [];
        st.cur = null;
        const ctx = st.canvas.getContext('2d');
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, st.canvas.width, st.canvas.height);
        ctx.restore();
    },

    // Kembalikan { path, date } kalau approver menggambar paraf, null kalau
    // tidak (paraf OPSIONAL - tanpa paraf approval berjalan seperti biasa).
    getValue(id) {
        const st = this._state[id];
        if (!st || !st.strokes.length) return null;

        let strokes = st.strokes;
        const build = (list) => list.map((s) => {
            return 'M' + s[0][0] + ' ' + s[0][1] +
                s.slice(1).map((p) => 'L' + p[0] + ' ' + p[1]).join('');
        }).join('');

        // Batasi ukuran (jaga-jaga coretan sangat panjang): buang tiap titik
        // ke-2 sampai cukup kecil - bentuk paraf tetap terjaga.
        let path = build(strokes);
        let guard = 0;
        while (path.length > 12000 && guard++ < 4) {
            strokes = strokes.map((s) => s.filter((p, i) => i === 0 || i === s.length - 1 || i % 2 === 0));
            path = build(strokes);
        }

        const dateEl = document.getElementById(`${id}-date`);
        const date = (dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)) ? dateEl.value : '';
        return { path, date };
    },

    _fmtDate(ymd) {
        const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}` : '';
    },

    // HTML paraf + tanggal untuk surat cetak. Mengembalikan '' kalau tidak
    // ada paraf/tanggal, jadi aman dipasang di template surat mana pun
    // (surat lama tanpa paraf tampil persis seperti sebelumnya).
    render(path, date, opts) {
        opts = opts || {};
        const h = opts.height || 44;
        const align = opts.align || 'center';
        const safePath = /^[MLml0-9 .,\-]+$/.test(String(path || '')) ? String(path) : '';
        const dateText = this._fmtDate(date);
        if (!safePath && !dateText) return '';

        let img = '';
        if (safePath) {
            const w = Math.round(h * this.W / this.H);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${this.W} ${this.H}">` +
                `<path d="${safePath}" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            img = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="${w}" height="${h}" alt="paraf" style="display:inline-block;vertical-align:bottom;">`;
        }
        return `<div class="letter-paraf" style="text-align:${align};line-height:1.15;">${img}` +
            `${dateText ? `<div style="font-size:10px;">${dateText}</div>` : ''}</div>`;
    }
};

window.paraf = paraf;
