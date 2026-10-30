/* MiB-Crude runtime client script (no dependencies besides Bootstrap and Chart.js). */
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var i18n = (window.MC && window.MC.i18n) || {};
  var csrf = ($('meta[name="csrf-token"]') || {}).content || '';

  // --- theme (auto / light / dark, remembered per browser) ---
  var root = document.documentElement;
  function applyTheme() {
    var pref = null;
    try { pref = localStorage.getItem('mc-theme'); } catch (e) {}
    var mode = pref || root.getAttribute('data-mode') || 'auto';
    if (mode === 'auto') mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-bs-theme', mode);
  }
  applyTheme();
  var tbtn = $('#mcTheme');
  if (tbtn) tbtn.addEventListener('click', function () {
    var next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('mc-theme', next); } catch (e) {}
    applyTheme();
  });

  // --- list: selection and delete ---
  var listForm = $('#mcListForm');
  if (listForm) {
    var delBtn = $('.mc-delete-selected');
    var sync = function () { if (delBtn) delBtn.disabled = !$$('.mc-check:checked').length; };
    var all = $('.mc-check-all');
    if (all) all.addEventListener('change', function () { $$('.mc-check').forEach(function (c) { c.checked = all.checked; }); sync(); });
    $$('.mc-check').forEach(function (c) { c.addEventListener('change', sync); });
    if (delBtn) delBtn.addEventListener('click', function (e) { if (!confirm(i18n.confirmDeleteSel)) e.preventDefault(); });
    $$('.mc-delete-one').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm(i18n.confirmDelete)) return;
        $$('.mc-check').forEach(function (c) { c.checked = false; });
        var h = document.createElement('input');
        h.type = 'hidden'; h.name = 'sel[]'; h.value = b.getAttribute('data-keys');
        listForm.appendChild(h);
        listForm.submit();
      });
    });
    // Export only the selected rows when some are checked.
    $$('.mc-export').forEach(function (a) {
      a.addEventListener('click', function () {
        var sel = $$('.mc-check:checked').map(function (c) { return 'sel[]=' + encodeURIComponent(c.value); });
        if (sel.length) a.href = a.href.split('&sel[]=')[0] + '&' + sel.join('&');
      });
    });
  }
  $$('.mc-confirm-delete').forEach(function (f) { f.addEventListener('submit', function (e) { if (!confirm(i18n.confirmDelete)) e.preventDefault(); }); });
  var psSel = $('.mc-pagesize');
  if (psSel) psSel.addEventListener('change', function () { location.href = psSel.getAttribute('data-url').replace('__PS__', psSel.value); });

  // --- advanced search: second value only for "between" ---
  $$('.mc-search-row').forEach(function (row) {
    var op = $('.mc-op', row), v2 = $('.mc-v2', row);
    var upd = function () { v2.style.visibility = op.value === 'between' ? 'visible' : 'hidden'; };
    op.addEventListener('change', upd); upd();
  });

  // --- lookups: dependent dropdowns ---
  function fetchJson(url) { return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  $$('[data-depends]').forEach(function (el) {
    var parent = document.getElementById(el.getAttribute('data-depends'));
    if (!parent) return;
    parent.addEventListener('change', function () {
      var url = el.getAttribute('data-lookup') + '&limit=500&parent=' + encodeURIComponent(parent.value);
      if (el.tagName === 'SELECT') {
        el.innerHTML = '<option value=""></option>';
        if (!parent.value) { el.dispatchEvent(new Event('change')); return; }
        fetchJson(url).then(function (opts) {
          opts.forEach(function (o) { var op = document.createElement('option'); op.value = o.value; op.textContent = o.label; el.appendChild(op); });
          el.dispatchEvent(new Event('change'));
        });
      } else if (el.classList.contains('mc-autocomplete')) {
        $('.mc-ac-text', el).value = ''; $('input[type=hidden]', el).value = '';
      }
    });
  });

  // --- lookups: autocomplete ---
  $$('.mc-autocomplete').forEach(function (box) {
    var text = $('.mc-ac-text', box), hidden = $('input[type=hidden]', box), list = $('.mc-ac-list', box), timer;
    text.addEventListener('input', function () {
      clearTimeout(timer);
      hidden.value = '';
      timer = setTimeout(function () {
        var url = box.getAttribute('data-lookup') + '&limit=20&q=' + encodeURIComponent(text.value);
        var dep = box.getAttribute('data-depends');
        if (dep && document.getElementById(dep)) url += '&parent=' + encodeURIComponent(document.getElementById(dep).value);
        fetchJson(url).then(function (opts) {
          list.innerHTML = '';
          if (!opts.length) { list.innerHTML = '<div class="list-group-item small text-secondary">' + (i18n.noResults || '') + '</div>'; }
          opts.forEach(function (o) {
            var a = document.createElement('button');
            a.type = 'button'; a.className = 'list-group-item list-group-item-action'; a.textContent = o.label;
            a.addEventListener('mousedown', function (e) { e.preventDefault(); hidden.value = o.value; text.value = o.label; list.innerHTML = ''; hidden.dispatchEvent(new Event('change')); });
            list.appendChild(a);
          });
        });
      }, 200);
    });
    text.addEventListener('blur', function () { setTimeout(function () { list.innerHTML = ''; }, 150); });
  });

  // --- modal used by "add new" lookup buttons ---
  var modalEl = $('#mcModal'), modal = null, modalTarget = null;
  window.MCModal = {
    open: function (url, title, target) {
      if (!modalEl || !window.bootstrap) { window.open(url); return; }
      modal = modal || new bootstrap.Modal(modalEl);
      modalTarget = target;
      $('.modal-title', modalEl).textContent = title || '';
      $('.mc-modal-frame', modalEl).src = url;
      modal.show();
    },
    close: function () { if (modal) modal.hide(); },
    done: function (value) {
      if (modal) modal.hide();
      var el = modalTarget && document.getElementById(modalTarget);
      if (!el) return;
      var url = el.getAttribute('data-lookup') + '&limit=2000';
      fetchJson(url).then(function (opts) {
        el.innerHTML = '<option value=""></option>';
        opts.forEach(function (o) { var op = document.createElement('option'); op.value = o.value; op.textContent = o.label; if (String(o.value) === String(value)) op.selected = true; el.appendChild(op); });
        el.dispatchEvent(new Event('change'));
      });
    }
  };
  $$('.mc-addnew').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); MCModal.open(a.href, a.title, a.getAttribute('data-target')); });
  });

  // --- minimal rich text editor (contenteditable + toolbar) ---
  $$('.mc-rte').forEach(function (box) {
    var src = document.getElementById(box.getAttribute('data-target'));
    var bar = document.createElement('div');
    bar.className = 'btn-toolbar gap-1 mb-1';
    [['bold', 'type-bold'], ['italic', 'type-italic'], ['underline', 'type-underline'], ['insertUnorderedList', 'list-ul'], ['insertOrderedList', 'list-ol'], ['createLink', 'link-45deg'], ['removeFormat', 'eraser']].forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sm btn-outline-secondary'; b.innerHTML = '<i class="bi bi-' + c[1] + '"></i>';
      b.addEventListener('click', function () { var arg = c[0] === 'createLink' ? prompt('URL') : null; if (c[0] === 'createLink' && !arg) return; document.execCommand(c[0], false, arg); ed.focus(); });
      bar.appendChild(b);
    });
    var ed = document.createElement('div');
    ed.className = 'form-control mc-rte-area'; ed.contentEditable = 'true'; ed.innerHTML = src.value;
    box.appendChild(bar); box.appendChild(ed);
    src.form.addEventListener('submit', function () { src.value = ed.innerHTML; });
  });

  // --- admin rights: select whole row ---
  $$('.mc-row-all').forEach(function (b) {
    b.addEventListener('click', function () {
      var boxes = $$('input[type=checkbox]', b.closest('tr'));
      var on = boxes.some(function (x) { return !x.checked; });
      boxes.forEach(function (x) { x.checked = on; });
    });
  });

  // --- embedded lists (detail tabs, dashboards): grow the iframe to its content ---
  function fit(fr) {
    try { var d = fr.contentDocument; if (d && d.body && !fr.style.height) fr.style.minHeight = (d.documentElement.scrollHeight + 4) + 'px'; } catch (e) {}
  }
  $$('iframe.mc-embed').forEach(function (fr) { fr.addEventListener('load', function () { fit(fr); }); });

  // --- charts ---
  if (window.Chart) {
    var css = getComputedStyle(document.documentElement);
    var primary = css.getPropertyValue('--mc-primary').trim() || '#0d6efd';
    var palette = [primary, '#20c997', '#fd7e14', '#6f42c1', '#d63384', '#0dcaf0', '#ffc107', '#198754', '#6c757d', '#dc3545'];
    $$('canvas.mc-chart').forEach(function (cv) {
      fetchJson(cv.getAttribute('data-src')).then(function (d) {
        var type = d.type, horizontal = false, area = false;
        if (type === 'hbar') { type = 'bar'; horizontal = true; }
        if (type === 'area') { type = 'line'; area = true; }
        var round = type === 'pie' || type === 'doughnut' || type === 'polarArea';
        var ds = d.datasets.map(function (s, i) {
          var c = s.color || palette[i % palette.length];
          return { label: s.label, data: s.data, fill: area, tension: 0.3,
            backgroundColor: round ? d.labels.map(function (_, j) { return palette[j % palette.length]; }) : (area ? c + '55' : c), borderColor: round ? undefined : c };
        });
        new Chart(cv, { type: type, data: { labels: d.labels, datasets: ds }, options: {
          responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
          plugins: { legend: { display: round || ds.length > 1 } },
          scales: round ? {} : { x: { stacked: d.stacked }, y: { stacked: d.stacked, beginAtZero: true } } } });
      });
    });
  }

  // --- gallery: open image links in the modal when available ---
  $$('a.mc-preview').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.ctrlKey || e.metaKey || !modalEl) return;
      e.preventDefault(); MCModal.open(a.getAttribute('data-preview'), a.textContent, null);
    });
  });
  window.MC = window.MC || {};
  window.MC.csrf = csrf;
})();
