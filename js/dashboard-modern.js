/**
 * Dashboard Karyawan - pelengkap tampilan modern (HANYA TAMBAHAN).
 * File ini tidak mengubah/menimpa fungsi apa pun di dashboard.js, auth.js,
 * dll. Tugasnya cuma MENYALIN (read-only) foto, jabatan, dan tanggal yang
 * sudah dikelola kode lama ke elemen hero baru di dashboard:
 *   #user-avatar          -> #dm-avatar-img
 *   #user-role            -> #dm-role-text
 *   #current-time .date   -> #dm-date
 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };

    function syncProfile() {
        var img = $('dm-avatar-img'), role = $('dm-role-text');
        var srcImg = $('user-avatar'), srcRole = $('user-role');
        if (img && srcImg) {
            var s = srcImg.getAttribute('src');
            if (s && img.getAttribute('src') !== s) img.setAttribute('src', s);
        }
        if (role && srcRole) {
            var t = (srcRole.textContent || '').trim();
            if (t && role.textContent !== t) role.textContent = t;
        }
    }

    function syncDate() {
        var el = $('dm-date');
        if (!el) return;
        var src = document.querySelector('#current-time .date');
        var t = src ? (src.textContent || '').trim() : '';
        if (!t) {
            try {
                t = new Date().toLocaleDateString('id-ID', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar'
                });
            } catch (e) { t = ''; }
        }
        if (t && el.textContent !== t) el.textContent = t;
    }

    function init() {
        syncProfile();
        syncDate();
        if (window.MutationObserver) {
            var a = $('user-avatar'), r = $('user-role'), c = $('current-time');
            if (a) new MutationObserver(syncProfile).observe(a, { attributes: true, attributeFilter: ['src'] });
            if (r) new MutationObserver(syncProfile).observe(r, { childList: true, characterData: true, subtree: true });
            if (c) new MutationObserver(syncDate).observe(c, { childList: true, characterData: true, subtree: true });
        }
        setInterval(function () { syncProfile(); syncDate(); }, 60000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
