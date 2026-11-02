/**
 * Portal Karyawan - Komponen unggah berkas (dipakai Input SPPD & Input SPK)
 * PT. Tirta Agung Amuntai
 *
 * Meniru unggah berkas di menu KGB dan Pangkat: PDF / JPG / PNG, maksimal 1 MB.
 *  - Gambar lebih dari 1 MB dikecilkan otomatis (dimensi & kualitas) sampai di bawah 1 MB,
 *    ukuran sebelum -> sesudah ditampilkan.
 *  - PDF lebih dari 1 MB tidak bisa dikecilkan di browser -> ditolak dengan modal peringatan.
 * Berkas ikut terkirim bersama form (base64), lalu disimpan ke Google Drive oleh Apps Script.
 *
 * Pakai: berkasUpload.mount('id-kotak');  ... berkasUpload.get('id-kotak')  -> { base64, mime, nama } | null
 *        berkasUpload.reset('id-kotak');  berkasUpload.isBusy('id-kotak')
 */
const berkasUpload = {
    MAX_BYTES: 1024 * 1024,
    _st: {}, // boxId -> { nama, size, packedSize, base64, mime, busy, type }

    _e(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    _ukuran(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },

    mount(boxId) {
        const box = document.getElementById(boxId);
        if (!box) return;
        box.innerHTML = `<div class="bu-view"></div>
            <input type="file" class="bu-input" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="berkasUpload.pick('${boxId}', this)">`;
        this._st[boxId] = null;
        this._paint(boxId);
    },

    reset(boxId) { this._st[boxId] = null; if (document.getElementById(boxId)) this._paint(boxId); },
    isBusy(boxId) { return !!(this._st[boxId] && this._st[boxId].busy); },
    get(boxId) {
        const s = this._st[boxId];
        return s && s.base64 ? { base64: s.base64, mime: s.mime, nama: s.nama } : null;
    },

    _paint(boxId) {
        const box = document.getElementById(boxId);
        const view = box && box.querySelector('.bu-view');
        if (!view) return;
        const s = this._st[boxId];
        if (!s) {
            view.innerHTML = `<button type="button" onclick="document.querySelector('#${boxId} .bu-input').click()"
                style="width:100%;display:flex;align-items:center;gap:10px;padding:12px;border:2px dashed var(--border-color);border-radius:10px;background:none;cursor:pointer;font-family:inherit;text-align:left;">
                <i class="fas fa-cloud-arrow-up" style="font-size:1.3rem;color:var(--color-primary);"></i>
                <span style="flex:1;"><b style="font-size:0.85rem;color:var(--text-main,inherit);">Pilih berkas</b><br><small style="font-size:0.72rem;color:var(--text-muted);">PDF / JPG / PNG, maks. 1 MB (gambar lebih besar dikecilkan otomatis)</small></span></button>`;
            return;
        }
        const ic = s.type === 'pdf' ? 'fa-file-pdf' : 'fa-image';
        const ukuran = s.busy ? 'Memproses...'
            : (s.packedSize && s.packedSize < s.size ? `${this._ukuran(s.size)} &rarr; <b>${this._ukuran(s.packedSize)}</b>` : this._ukuran(s.size));
        view.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--color-success,#10B981);background:rgba(16,185,129,0.08);border-radius:10px;">
            <i class="fas ${s.busy ? 'fa-spinner fa-spin' : ic}" style="font-size:1.2rem;color:var(--color-success,#10B981);"></i>
            <div style="min-width:0;flex:1;"><div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._e(s.nama)}</div>
            <div style="font-size:0.74rem;color:var(--text-muted);">${ukuran}</div></div>
            ${s.busy ? '' : `<button type="button" onclick="berkasUpload.reset('${boxId}')" title="Hapus" style="background:none;border:1px solid var(--border-color);border-radius:8px;padding:6px 9px;cursor:pointer;color:var(--color-danger);"><i class="fas fa-xmark"></i></button>`}
        </div>`;
    },

    // Modal peringatan sederhana (dipakai kalau berkas ditolak).
    _alert(judul, teks) {
        const old = document.getElementById('bu-alert'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'bu-alert';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10600;display:flex;align-items:center;justify-content:center;padding:16px;';
        ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px 20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.25);">
            <div style="width:52px;height:52px;border-radius:50%;background:#FEF3C7;color:#D97706;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:1.4rem;"><i class="fas fa-triangle-exclamation"></i></div>
            <h3 style="margin:0 0 6px;font-size:1.05rem;">${this._e(judul)}</h3>
            <p style="margin:0 0 16px;font-size:0.85rem;color:#64748B;line-height:1.5;">${this._e(teks)}</p>
            <button type="button" style="background:var(--color-primary);color:#fff;border:none;padding:10px 24px;border-radius:10px;font-weight:600;cursor:pointer;">Mengerti</button></div>`;
        ov.addEventListener('click', e => { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); });
        document.body.appendChild(ov);
    },

    /**
     * Pastikan `file` tidak melebihi `maxBytes` (dipakai menu yang unggahannya dibatasi,
     * mis. 500 KB untuk Lampiran Cuti, Surat Keterangan Izin, foto profil).
     *  - Gambar yang lebih besar dikecilkan otomatis (jadi JPEG) dan pengguna diberi tahu.
     *  - PDF yang lebih besar tidak bisa dikecilkan di browser -> modal peringatan, hasil null.
     * Mengembalikan File yang boleh dipakai, atau null kalau berkas ditolak.
     */
    async fit(file, maxBytes) {
        if (!file || file.size <= maxBytes) return file;
        const batas = this._ukuran(maxBytes);
        if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
            this._alert(`File lebih dari ${batas}`, `"${file.name}" berukuran ${this._ukuran(file.size)}. Ukuran maksimal berkas adalah ${batas}. Silakan kecilkan ukuran berkas terlebih dahulu (mis. kompres PDF atau scan dengan resolusi lebih rendah), lalu unggah kembali.`);
            return null;
        }
        try {
            const rd = await this._baca(file, maxBytes);
            const bin = atob(rd.base64);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            const nama = file.name.replace(/\.[^.]+$/, '') + '.jpg';
            const out = new File([buf], nama, { type: 'image/jpeg' });
            if (typeof toast !== 'undefined') toast.info(`Gambar ${this._ukuran(file.size)} (lebih dari ${batas}) dikecilkan otomatis menjadi ${this._ukuran(out.size)}.`);
            return out;
        } catch (e) {
            this._alert('Berkas tidak bisa diproses', `"${file.name}": ${e.message || 'gagal dikecilkan'} Silakan pilih berkas lain.`);
            return null;
        }
    },

    async pick(boxId, input) {
        const f = input.files && input.files[0];
        input.value = '';
        if (!f) return;
        if (!/^(application\/pdf|image\/jpeg|image\/png)$/i.test(f.type)) {
            this._alert('Format berkas tidak didukung', `"${f.name}" bukan PDF, JPG, atau PNG. Silakan pilih berkas dengan format yang sesuai.`);
            return;
        }
        const isPdf = /pdf/i.test(f.type);
        if (isPdf && f.size > this.MAX_BYTES) {
            this._alert('File lebih dari 1 MB', `"${f.name}" berukuran ${this._ukuran(f.size)}. Ukuran maksimal berkas adalah 1 MB. Silakan kecilkan ukuran PDF terlebih dahulu (mis. kompres PDF atau scan dengan resolusi lebih rendah), lalu unggah kembali.`);
            return;
        }
        const st = { nama: f.name, size: f.size, packedSize: 0, base64: '', mime: '', busy: true, type: isPdf ? 'pdf' : 'img' };
        this._st[boxId] = st;
        this._paint(boxId);
        try {
            const rd = await this._baca(f);
            if (this._st[boxId] !== st) return; // sudah dihapus/diganti
            st.base64 = rd.base64; st.mime = rd.mime; st.packedSize = Math.round(rd.base64.length * 0.75);
            if (!isPdf && f.size > this.MAX_BYTES && typeof toast !== 'undefined') {
                toast.info(`Gambar ${this._ukuran(f.size)} (lebih dari 1 MB) dikecilkan otomatis menjadi ${this._ukuran(st.packedSize)}.`);
            }
        } catch (e) {
            if (this._st[boxId] === st) this._st[boxId] = null;
            this._alert('Berkas tidak bisa diproses', `"${f.name}": ${e.message || 'gagal dibaca'} Silakan pilih berkas lain.`);
        } finally {
            if (this._st[boxId] === st) st.busy = false;
            this._paint(boxId);
        }
    },

    // PDF dikirim apa adanya; gambar dikecilkan bertahap (dimensi & kualitas) sampai di bawah 1 MB.
    _baca(file, maxBytes) {
        maxBytes = maxBytes || this.MAX_BYTES;
        return new Promise((resolve, reject) => {
            if (/pdf/i.test(file.type)) {
                const r = new FileReader();
                r.onload = () => resolve({ base64: String(r.result).split(',')[1], mime: 'application/pdf' });
                r.onerror = () => reject(new Error('Gagal membaca berkas.'));
                r.readAsDataURL(file);
                return;
            }
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let max = 1800, q = 0.82, out = '';
                for (let i = 0; i < 12; i++) {
                    const sc = Math.min(1, max / Math.max(img.width, img.height));
                    const cv = document.createElement('canvas');
                    cv.width = Math.max(1, Math.round(img.width * sc));
                    cv.height = Math.max(1, Math.round(img.height * sc));
                    const ctx = cv.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    out = cv.toDataURL('image/jpeg', q).split(',')[1];
                    if (out.length * 0.75 <= maxBytes * 0.95) break;
                    if (q > 0.5) q -= 0.1; else max = Math.round(max * 0.8);
                }
                if (out.length * 0.75 > maxBytes) { reject(new Error('Gambar terlalu besar, gunakan foto yang lebih kecil.')); return; }
                resolve({ base64: out, mime: 'image/jpeg' });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca.')); };
            img.src = url;
        });
    }
};
window.berkasUpload = berkasUpload;
