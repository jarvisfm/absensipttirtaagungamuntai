/**
 * Form Pengajuan Izin & Cuti tampil sebagai MODAL (pop up).
 * Halaman Izin/Cuti hanya menampilkan tombol "Tambah ...", ringkasan, dan riwayat.
 *
 * Form lama (id input, tombol, dll.) TIDAK diubah - kartu formnya hanya dipindah ke dalam
 * overlay, jadi izin.js / cuti.js tetap bekerja seperti biasa. Setelah pengajuan berhasil,
 * izin.js / cuti.js memanggil formModal.close(...) untuk menutup modal.
 */
const formModal = {
    cfg: {
        izin: { page: 'page-izin', card: '.izin-form-card', grid: '.izin-grid', hist: '.izin-history-card', list: 'izin-list', label: 'Tambah Izin',
                title: 'Form Pengajuan Izin', hint: 'Ajukan izin / sakit baru dengan verifikasi wajah', icon: 'fa-file-medical' },
        cuti: { page: 'page-cuti', card: '.cuti-form-card', grid: '.cuti-grid', hist: '.cuti-history-card', list: 'leave-list', label: 'Tambah Cuti',
                title: 'Form Pengajuan Cuti', hint: 'Ajukan cuti baru dan lampirkan dokumen bila perlu', icon: 'fa-umbrella-beach' }
    },
    _ov: {},

    setup() {
        Object.keys(this.cfg).forEach(k => {
            const c = this.cfg[k];
            const page = document.getElementById(c.page);
            const card = page && page.querySelector(c.card);
            const grid = page && page.querySelector(c.grid);
            if (!page || !card || !grid || this._ov[k]) return;

            // Tombol tambah di halaman
            const bar = document.createElement('div');
            bar.className = 'fm-actionbar fm-' + k;
            bar.innerHTML = `<div class="fm-actiontext"><b>Pengajuan baru</b><span>${c.hint}</span></div>
                <button type="button" class="fm-add"><i class="fas fa-plus"></i> ${c.label}</button>`;
            bar.querySelector('.fm-add').addEventListener('click', () => this.open(k));
            // Urutan halaman: ringkasan -> riwayat -> tombol pengajuan baru
            const hist = page.querySelector(c.hist);
            if (hist) hist.parentNode.insertBefore(bar, hist.nextSibling);
            else grid.parentNode.insertBefore(bar, grid);

            // Overlay + sheet; kartu form dipindah ke sini
            const ov = document.createElement('div');
            ov.className = 'fm-overlay fm-' + k;
            ov.id = 'fm-' + k;
            ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-modal', 'true');
            const sheet = document.createElement('div');
            sheet.className = 'fm-sheet';
            ov.appendChild(sheet);
            sheet.appendChild(card);

            const head = card.querySelector('.card-header');
            if (head) {
                head.classList.add('fm-head');
                const ic = document.createElement('span');
                ic.className = 'fm-head-ic';
                ic.innerHTML = `<i class="fas ${c.icon}"></i>`;
                head.insertBefore(ic, head.firstChild);
                const x = document.createElement('button');
                x.type = 'button'; x.className = 'fm-close'; x.title = 'Tutup'; x.setAttribute('aria-label', 'Tutup');
                x.innerHTML = '<i class="fas fa-xmark"></i>';
                x.addEventListener('click', () => this.close(k));
                head.appendChild(x);
            }
            // Klik di latar luar sheet TIDAK menutup (cegah isian hilang tak sengaja)
            document.body.appendChild(ov);
            this._ov[k] = ov;
        });

        if (!this._esc) {
            this._esc = e => {
                if (e.key !== 'Escape') return;
                // jangan menutup bila ada kalender/modal lain di atasnya
                if (document.querySelector('.flatpickr-calendar.open')) return;
                Object.keys(this._ov).forEach(k => { if (this._ov[k].classList.contains('open')) this.close(k); });
            };
            document.addEventListener('keydown', this._esc);
        }
    },

    open(k) {
        const ov = this._ov[k];
        if (!ov) return;
        ov.classList.remove('closing');
        ov.classList.add('open');
        document.body.classList.add('fm-lock');
        const body = ov.querySelector('form');
        if (body) body.scrollTop = 0;
    },

    /** ok = true bila ditutup karena pengajuan berhasil -> gulir ke riwayat. */
    close(k, ok) {
        const ov = this._ov[k];
        if (!ov || !ov.classList.contains('open')) return;
        ov.classList.add('closing');
        setTimeout(() => {
            ov.classList.remove('open', 'closing');
            if (!document.querySelector('.fm-overlay.open')) document.body.classList.remove('fm-lock');
            if (ok) {
                const list = document.getElementById(this.cfg[k].list);
                if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 220);
    }
};
window.formModal = formModal;
formModal.setup();
