/**
 * Portal Karyawan - Editor Catatan (Rich Text) & penampil catatan aman
 * PT. Tirta Agung Amuntai
 *
 * Dipakai oleh kolom "Catatan" di modal Approval (Asmen / Manajer / Direktur)
 * pada izin.js & cuti.js. Catatan sekarang boleh berformat: tebal, miring,
 * garis bawah, daftar bernomor, daftar poin, paragraf, dan menjorok
 * (indent/margin kiri) - lalu ditampilkan dengan format yang sama di:
 *   - kartu riwayat & progress persetujuan (stepper),
 *   - review "Cetak Surat" (print-letters.js).
 *
 * Catatan disimpan sebagai HTML ringkas (string biasa di kolom yang sama
 * dengan sebelumnya - TIDAK perlu mengubah struktur sheet/backend). Catatan
 * lama yang masih teks polos tetap tampil normal (otomatis di-escape &
 * baris barunya dipertahankan).
 *
 * Keamanan: apa pun yang disimpan/ditampilkan SELALU lewat sanitize()
 * (daftar tag & atribut yang diizinkan), jadi tidak ada script/atribut
 * berbahaya yang lolos walau datanya dimanipulasi.
 *
 * Cara pakai:
 *   richNote.editorHtml('id-editor')     -> string HTML editor (taruh di template)
 *   richNote.getValue('id-editor')       -> HTML bersih ('' kalau kosong)
 *   richNote.view(value)                 -> HTML aman untuk ditampilkan
 *   richNote.plain(value)                -> teks polos (aman di-inject ke HTML)
 *
 * Event editor memakai delegasi di document, jadi TIDAK perlu init manual
 * setelah innerHTML diisi.
 */
const richNote = {

    // Tag yang diizinkan (selain ini akan "dibuka bungkusnya" - teks isinya
    // tetap dipertahankan, tag-nya dibuang).
    _ALLOWED_TAGS: ['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'BR', 'P', 'DIV', 'BLOCKQUOTE'],
    // Tag yang dibuang total beserta isinya
    _DROP_TAGS: ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH', 'TEMPLATE'],

    _escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    _looksLikeHtml(s) {
        return /<\/?(b|strong|i|em|u|ol|ul|li|br|p|div|blockquote|span|font)\b[^>]*>/i.test(s);
    },

    // Ambil hanya properti gaya yang aman: margin-left (hasil tombol indent)
    // & text-align. Nilai divalidasi ketat.
    _cleanStyle(styleText) {
        const out = [];
        String(styleText || '').split(';').forEach(decl => {
            const idx = decl.indexOf(':');
            if (idx < 0) return;
            const prop = decl.slice(0, idx).trim().toLowerCase();
            const val = decl.slice(idx + 1).trim().toLowerCase();
            const len = /^\d+(\.\d+)?(px|em|rem|%)$/;
            if (prop === 'margin-left' || prop === 'padding-left') {
                if (len.test(val)) out.push('margin-left:' + val);
            } else if (prop === 'margin') {
                // Chrome menulis indent sebagai "margin: 0 0 0 40px" -> ambil sisi kiri
                const parts = val.split(/\s+/);
                let left = null;
                if (parts.length === 4) left = parts[3];
                else if (parts.length === 2) left = parts[1];
                else if (parts.length === 1) left = parts[0];
                else if (parts.length === 3) left = parts[1];
                if (left && len.test(left) && parseFloat(left) > 0) out.push('margin-left:' + left);
            } else if (prop === 'text-align') {
                if (['left', 'right', 'center', 'justify'].indexOf(val) > -1) out.push('text-align:' + val);
            }
        });
        return out.join(';');
    },

    _cleanNode(node, doc) {
        const frag = doc.createDocumentFragment();
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === 3) { // teks
                frag.appendChild(doc.createTextNode(child.nodeValue));
                return;
            }
            if (child.nodeType !== 1) return; // komentar dll dibuang
            const tag = child.tagName.toUpperCase();
            if (this._DROP_TAGS.indexOf(tag) > -1) return;

            // <span style="font-weight:bold"> dst. dari paste/browser lama -> petakan ke tag semantik
            let wrapTag = null;
            if (tag === 'SPAN' || tag === 'FONT') {
                const st = (child.getAttribute('style') || '').toLowerCase();
                if (/font-weight\s*:\s*(bold|[6-9]00)/.test(st)) wrapTag = 'strong';
                else if (/font-style\s*:\s*italic/.test(st)) wrapTag = 'em';
                else if (/text-decoration[^;]*underline/.test(st)) wrapTag = 'u';
            }

            const inner = this._cleanNode(child, doc);
            if (wrapTag) {
                const el = doc.createElement(wrapTag);
                el.appendChild(inner);
                frag.appendChild(el);
                return;
            }
            if (this._ALLOWED_TAGS.indexOf(tag) === -1) {
                frag.appendChild(inner); // buka bungkus, pertahankan isi
                return;
            }
            const el = doc.createElement(tag.toLowerCase());
            if (tag !== 'BR') {
                const st = this._cleanStyle(child.getAttribute('style'));
                if (st) el.setAttribute('style', st);
                el.appendChild(inner);
            }
            frag.appendChild(el);
        });
        return frag;
    },

    /** HTML mentah -> HTML bersih (hanya tag/atribut yang diizinkan). */
    sanitize(html) {
        const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
        const holder = doc.createElement('div');
        holder.appendChild(this._cleanNode(doc.body, doc));
        // Blok kosong total (tanpa isi sama sekali) tidak berguna - buang
        return holder.innerHTML.replace(/<(p|div)(\s[^>]*)?><\/\1>/gi, '');
    },

    /** Nilai dari database -> HTML aman untuk ditampilkan. */
    view(value) {
        const s = String(value == null ? '' : value);
        if (!s.trim()) return '';
        if (!this._looksLikeHtml(s)) {
            // Catatan lama (teks polos): escape + pertahankan baris baru
            return this._escape(s).replace(/\r?\n/g, '<br>');
        }
        return this.sanitize(s);
    },

    /** Nilai dari database -> teks polos satu baris (sudah di-escape). */
    plain(value) {
        const s = String(value == null ? '' : value);
        if (!s.trim()) return '';
        if (!this._looksLikeHtml(s)) return this._escape(s);
        const doc = new DOMParser().parseFromString(
            '<body>' + s.replace(/<\/(p|div|li|blockquote)>|<br\s*\/?>/gi, ' $&') + '</body>', 'text/html');
        return this._escape((doc.body.textContent || '').replace(/\s+/g, ' ').trim());
    },

    /** Panjang teks tanpa tag (untuk logika rata kiri/justify, dll). */
    textLength(value) {
        const s = String(value == null ? '' : value);
        if (!this._looksLikeHtml(s)) return s.trim().length;
        const doc = new DOMParser().parseFromString('<body>' + s + '</body>', 'text/html');
        return (doc.body.textContent || '').trim().length;
    },

    // ── Editor ──────────────────────────────────────────────────

    /** String HTML untuk editor (toolbar + area ketik). */
    editorHtml(id, opts) {
        opts = opts || {};
        const ph = this._escape(opts.placeholder || 'Tulis catatan/pertimbangan Anda di sini...');
        const btn = (cmd, title, inner, extra) =>
            `<button type="button" class="rn-btn" data-rn-cmd="${cmd}" title="${title}" aria-label="${title}" tabindex="-1"${extra || ''}>${inner}</button>`;
        return `
            <div class="rn-editor-wrap" data-rn-wrap="${id}">
                <div class="rn-toolbar" role="toolbar" aria-label="Format catatan">
                    ${btn('bold', 'Tebal (Ctrl+B)', '<b>B</b>')}
                    ${btn('italic', 'Miring (Ctrl+I)', '<i>I</i>')}
                    ${btn('underline', 'Garis bawah (Ctrl+U)', '<u>U</u>')}
                    <span class="rn-sep"></span>
                    ${btn('insertOrderedList', 'Daftar bernomor', '<i class="fas fa-list-ol"></i>')}
                    ${btn('insertUnorderedList', 'Daftar poin', '<i class="fas fa-list-ul"></i>')}
                    <span class="rn-sep"></span>
                    ${btn('indent', 'Geser ke kanan / menjorok (Tab)', '<i class="fas fa-indent"></i>')}
                    ${btn('outdent', 'Geser ke kiri (Shift+Tab)', '<i class="fas fa-outdent"></i>')}
                    <span class="rn-sep"></span>
                    ${btn('undo', 'Urungkan', '<i class="fas fa-rotate-left"></i>')}
                    ${btn('redo', 'Ulangi', '<i class="fas fa-rotate-right"></i>')}
                </div>
                <div id="${id}" class="rn-editor rn-view" contenteditable="true" role="textbox"
                     aria-multiline="true" spellcheck="true" data-placeholder="${ph}"></div>
            </div>`;
    },

    /** Isi editor dari nilai tersimpan (opsional - mis. untuk edit ulang). */
    setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = this.view(value);
    },

    /** Ambil isi editor sebagai HTML bersih. '' kalau tidak ada teks sama sekali. */
    getValue(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        const hasText = (el.textContent || '').replace(/​/g, '').trim() !== '';
        if (!hasText) return '';
        let html = this.sanitize(el.innerHTML);
        // Buang baris kosong di awal/akhir
        const emptyBlock = '(?:<br>|\\s|&nbsp;)*';
        html = html
            .replace(new RegExp('^(?:<(p|div)>' + emptyBlock + '</\\1>|<br>|\\s)+', 'i'), '')
            .replace(new RegExp('(?:<(p|div)>' + emptyBlock + '</\\1>|<br>|\\s)+$', 'i'), '');
        return html.trim();
    },

    _exec(cmd) {
        try {
            document.execCommand('styleWithCSS', false, false);
            document.execCommand(cmd, false, null);
        } catch (e) { /* abaikan - browser lama */ }
    },

    _activeEditor() {
        const sel = window.getSelection && window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let n = sel.anchorNode;
        if (n && n.nodeType === 3) n = n.parentNode;
        return n && n.closest ? n.closest('.rn-editor') : null;
    },

    _refreshButtons() {
        const ed = this._activeEditor();
        document.querySelectorAll('.rn-btn.active').forEach(b => b.classList.remove('active'));
        if (!ed) return;
        const wrap = ed.closest('.rn-editor-wrap');
        ['bold', 'italic', 'underline', 'insertOrderedList', 'insertUnorderedList'].forEach(cmd => {
            let on = false;
            try { on = document.queryCommandState(cmd); } catch (e) { /* abaikan */ }
            const b = wrap.querySelector('[data-rn-cmd="' + cmd + '"]');
            if (b) b.classList.toggle('active', !!on);
        });
    },

    _bound: false,
    _bind() {
        if (this._bound) return;
        this._bound = true;

        // mousedown (bukan click) + preventDefault: fokus & seleksi di editor tidak hilang
        document.addEventListener('mousedown', (e) => {
            const btn = e.target.closest && e.target.closest('.rn-btn');
            if (!btn) return;
            e.preventDefault();
            const wrap = btn.closest('.rn-editor-wrap');
            const ed = wrap && wrap.querySelector('.rn-editor');
            if (!ed) return;
            if (document.activeElement !== ed) ed.focus();
            this._exec(btn.getAttribute('data-rn-cmd'));
            this._refreshButtons();
        });

        // Sentuhan di HP: tombol tidak boleh mencuri fokus keyboard
        document.addEventListener('touchstart', (e) => {
            const btn = e.target.closest && e.target.closest('.rn-btn');
            if (btn) e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchend', (e) => {
            const btn = e.target.closest && e.target.closest('.rn-btn');
            if (!btn) return;
            e.preventDefault();
            const ed = btn.closest('.rn-editor-wrap').querySelector('.rn-editor');
            if (document.activeElement !== ed) ed.focus();
            this._exec(btn.getAttribute('data-rn-cmd'));
            this._refreshButtons();
        }, { passive: false });

        document.addEventListener('selectionchange', () => this._refreshButtons());

        document.addEventListener('focusin', (e) => {
            if (e.target.classList && e.target.classList.contains('rn-editor')) {
                // Enter menghasilkan <p> (paragraf), bukan <div>
                try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) { /* abaikan */ }
            }
        });

        // Tab = indent, Shift+Tab = outdent (di dalam editor saja)
        document.addEventListener('keydown', (e) => {
            if (!(e.target.classList && e.target.classList.contains('rn-editor'))) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                this._exec(e.shiftKey ? 'outdent' : 'indent');
            }
        });

        // Paste: buang format dari luar (Word/web), pertahankan baris baru
        document.addEventListener('paste', (e) => {
            if (!(e.target.closest && e.target.closest('.rn-editor'))) return;
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
            const html = text.split(/\r?\n/).map(l => '<p>' + (this._escape(l) || '<br>') + '</p>').join('');
            try { document.execCommand('insertHTML', false, html); } catch (err) { /* abaikan */ }
        });
    }
};

richNote._bind();
window.richNote = richNote;
