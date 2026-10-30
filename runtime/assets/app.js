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
    // Graphic themes have their own dark switch: an attribute on <html> or a class on <body>.
    var attr = root.getAttribute('data-mc-dark-attr');
    if (attr) root.setAttribute(attr, mode);
    var cls = root.getAttribute('data-mc-dark-class');
    if (cls && document.body) document.body.classList.toggle(cls, mode === 'dark');
  }
  applyTheme();
  var tbtn = $('#mcTheme');
  if (tbtn) tbtn.addEventListener('click', function () {
    var next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('mc-theme', next); } catch (e) {}
    applyTheme();
  });

  // --- list: DataTables in server-side mode ---
  var listForm = $('#mcListForm');
  var grid = $('#mcGrid');
  var dt = null;
  if (grid && window.DataTable) {
    var cfg = JSON.parse(grid.getAttribute('data-dt'));
    var setTotals = function (totals) {
      $$('[data-total]', grid).forEach(function (td) { var k = td.getAttribute('data-total'); td.textContent = k && totals && totals[k] != null ? totals[k] : ''; });
    };
    dt = new DataTable(grid, {
      serverSide: true,
      processing: true,
      ajax: { url: cfg.url, dataSrc: function (json) { setTotals(json.totals); return json.data; } },
      columns: cfg.columns.map(function (c, i) { return { data: 'cells.' + i, orderable: c.orderable, className: c.className }; }),
      order: cfg.order,
      pageLength: cfg.pageLength,
      lengthMenu: [[10, 20, 50, 100, 500, -1], [10, 20, 50, 100, 500, i18n.all]],
      search: { search: cfg.search || '' },
      searching: cfg.searching,
      searchDelay: 350,
      stateSave: !cfg.embedded && !cfg.search,
      stateDuration: 60 * 60 * 8,
      stateSaveParams: function (s, data) { data.start = 0; },
      responsive: true,
      autoWidth: false,
      layout: cfg.embedded
        ? { topStart: null, topEnd: null, bottomStart: 'info', bottomEnd: 'paging' }
        : { topStart: ['pageLength', { buttons: [{ extend: 'colvis', text: '<i class="bi bi-layout-three-columns"></i> ' + (i18n.colvis || ''), columns: ':not(.mc-col-check):not(.mc-col-actions)' }] }], topEnd: cfg.searching ? 'search' : null, bottomStart: 'info', bottomEnd: 'paging' },
      language: Object.assign({ lengthMenu: '_MENU_' }, i18n.dt || {}),
      createdRow: function (row, data) {
        if (data.rowcss) row.setAttribute('style', data.rowcss);
        if (data.css) Object.keys(data.css).forEach(function (i) { if (row.cells[i]) row.cells[i].setAttribute('style', data.css[i]); });
      },
      drawCallback: function () {
        var all = $('.mc-check-all'); if (all) all.checked = false;
        syncSel();
      }
    });
    window.MC = window.MC || {}; window.MC.grid = dt;
  }
  var delBtn = $('.mc-delete-selected');
  var syncSel = function () { if (delBtn) delBtn.disabled = !$$('.mc-check:checked').length; };
  if (listForm) {
    var all = $('.mc-check-all');
    if (all) all.addEventListener('change', function () { $$('.mc-check').forEach(function (c) { c.checked = all.checked; }); syncSel(); });
    listForm.addEventListener('change', function (e) { if (e.target.classList.contains('mc-check')) syncSel(); });
    if (delBtn) delBtn.addEventListener('click', function (e) { if (!confirm(i18n.confirmDeleteSel)) e.preventDefault(); });
    listForm.addEventListener('click', function (e) {
      var b = e.target.closest('.mc-delete-one');
      if (!b) return;
      if (!confirm(i18n.confirmDelete)) return;
      $$('.mc-check').forEach(function (c) { c.checked = false; });
      var h = document.createElement('input');
      h.type = 'hidden'; h.name = 'sel[]'; h.value = b.getAttribute('data-keys');
      listForm.appendChild(h);
      listForm.submit();
    });
  }
  // Export/print follow the grid: global search, sort column and the selected rows.
  $$('.mc-export').forEach(function (a) {
    a.addEventListener('click', function () {
      var url = a.href.split('&mcx=1')[0] + '&mcx=1';
      if (dt) {
        var q = dt.search();
        if (q) url += '&q=' + encodeURIComponent(q);
        var o = dt.order()[0];
        var hdr = o ? grid.querySelectorAll('thead th')[o[0]] : null;
        if (o && cfg.columns[o[0]] && cfg.columns[o[0]].key) url += '&o=' + encodeURIComponent(cfg.columns[o[0]].key) + '&d=' + o[1];
        void hdr;
      }
      $$('.mc-check:checked').forEach(function (c) { url += '&sel[]=' + encodeURIComponent(c.value); });
      a.href = url;
    });
  });
  $$('.mc-confirm-delete').forEach(function (f) { f.addEventListener('submit', function (e) { if (!confirm(i18n.confirmDelete)) e.preventDefault(); }); });

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

  // --- charts (Apache ECharts) ---
  if (window.echarts) {
    var cssv = getComputedStyle(document.documentElement);
    var primary = cssv.getPropertyValue('--mc-primary').trim() || '#0d6efd';
    var palette = [primary, '#20c997', '#fd7e14', '#6f42c1', '#d63384', '#0dcaf0', '#ffc107', '#198754', '#6c757d', '#dc3545'];
    var dark = function () { return root.getAttribute('data-bs-theme') === 'dark'; };
    var fmt = function (v) { return typeof v === 'number' ? v.toLocaleString(window.MC && window.MC.lang || undefined) : v; };
    var option = function (d) {
      var t = d.type, ds = d.datasets, base = {
        color: palette, backgroundColor: 'transparent', animationDuration: 600,
        tooltip: { trigger: ['pie', 'doughnut', 'rose', 'funnel', 'treemap', 'gauge'].indexOf(t) >= 0 ? 'item' : 'axis', valueFormatter: fmt },
        legend: { show: ds.length > 1 || ['pie', 'doughnut', 'rose', 'funnel'].indexOf(t) >= 0, type: 'scroll', bottom: 0 },
        toolbox: { right: 8, feature: { saveAsImage: { title: '' }, dataView: { readOnly: true, title: '' }, restore: { title: '' } } },
        grid: { left: 12, right: 24, top: 40, bottom: 40, containLabel: true }
      };
      var pairs = function (s) { return d.labels.map(function (l, i) { return { name: String(l), value: s.data[i] }; }); };
      if (t === 'pie' || t === 'doughnut' || t === 'rose' || t === 'polarArea') {
        base.series = [{ type: 'pie', radius: t === 'doughnut' ? ['45%', '72%'] : '72%', roseType: t === 'rose' || t === 'polarArea' ? 'area' : false, data: pairs(ds[0]), itemStyle: { borderRadius: 4 }, label: { formatter: '{b}: {d}%' } }];
      } else if (t === 'funnel') {
        base.series = [{ type: 'funnel', left: '10%', width: '80%', sort: 'descending', data: pairs(ds[0]) }];
      } else if (t === 'treemap') {
        base.series = [{ type: 'treemap', roam: false, data: pairs(ds[0]), breadcrumb: { show: false } }];
      } else if (t === 'gauge') {
        var total = ds[0].data.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
        base.series = [{ type: 'gauge', splitNumber: 4, progress: { show: true, width: 14 }, axisLine: { lineStyle: { width: 14 } }, axisLabel: { distance: 20, fontSize: 10, formatter: fmt },
          pointer: { width: 4, length: '55%' }, title: { offsetCenter: [0, '78%'], fontSize: 12 }, detail: { formatter: fmt, fontSize: 22, offsetCenter: [0, '48%'] }, max: d.max || Math.max(10, Math.ceil(total * 1.25)), data: [{ value: total, name: ds[0].label }] }];
      } else if (t === 'radar') {
        var max = Math.max.apply(null, ds.reduce(function (a, s) { return a.concat(s.data); }, [1]));
        base.radar = { indicator: d.labels.map(function (l) { return { name: String(l), max: max }; }) };
        base.series = [{ type: 'radar', data: ds.map(function (s) { return { name: s.label, value: s.data }; }) }];
      } else {
        var horizontal = t === 'hbar', isLine = t === 'line' || t === 'area' || t === 'scatter';
        var cat = { type: 'category', data: d.labels, axisLabel: { hideOverlap: true } }, val = { type: 'value', axisLabel: { formatter: fmt } };
        base.xAxis = horizontal ? val : cat;
        base.yAxis = horizontal ? cat : val;
        if (d.labels.length > 30) base.dataZoom = [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 24 }];
        base.toolbox.feature.magicType = { type: isLine ? ['line', 'bar'] : ['bar', 'line', 'stack'] };
        base.series = ds.map(function (s, i) {
          return { name: s.label, type: t === 'scatter' ? 'scatter' : isLine ? 'line' : 'bar', data: s.data, smooth: t === 'area' || t === 'line', areaStyle: t === 'area' ? { opacity: 0.25 } : undefined,
            stack: d.stacked ? 'tot' : undefined, itemStyle: s.color ? { color: s.color } : (isLine ? undefined : { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }), emphasis: { focus: 'series' } };
        });
      }
      return base;
    };
    $$('.mc-chart').forEach(function (el) {
      fetchJson(el.getAttribute('data-src')).then(function (d) {
        var chart = echarts.init(el, dark() ? 'dark' : null, { renderer: 'canvas' });
        chart.setOption(option(d));
        if (window.ResizeObserver) new ResizeObserver(function () { chart.resize(); }).observe(el);
        new MutationObserver(function () { chart.dispose(); chart = echarts.init(el, dark() ? 'dark' : null); chart.setOption(option(d)); }).observe(root, { attributes: true, attributeFilter: ['data-bs-theme'] });
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
