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
    var mode = root.getAttribute('data-mc-fixed-mode') || pref || root.getAttribute('data-mode') || 'auto';
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
  // Height of the scrolling area: the rest of the window below the grid (min 260px), smaller inside embeds.
  function gridHeight() {
    if (!grid) return '400px';
    if (document.body.classList.contains('mc-embedded')) return Math.max(220, window.innerHeight - 150) + 'px';
    var top = grid.getBoundingClientRect().top + window.scrollY;
    return Math.max(260, window.innerHeight - top - 150) + 'px';
  }
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
      // Always scrollable in both directions: wide tables scroll sideways, long pages scroll inside the grid with a fixed header.
      scrollX: true,
      scrollY: gridHeight(),
      scrollCollapse: true,
      stateSave: !cfg.embedded && !cfg.search,
      stateDuration: 60 * 60 * 8,
      stateSaveParams: function (s, data) { data.start = 0; },
      responsive: false,
      autoWidth: false,
      layout: cfg.embedded
        ? { topStart: null, topEnd: null, bottomStart: 'info', bottomEnd: 'paging' }
        : { topStart: ['pageLength', { buttons: [{ extend: 'colvis', text: '<i class="bi bi-layout-three-columns"></i> ' + (i18n.colvis || ''), columns: ':not(.mc-col-check):not(.mc-col-actions)' }] }], topEnd: cfg.searching ? 'search' : null, bottomStart: 'info', bottomEnd: 'paging' },
      language: Object.assign({ lengthMenu: '_MENU_' }, i18n.dt || {}),
      createdRow: function (row, data) {
        if (data.rowcss) row.setAttribute('style', data.rowcss);
        if (data.k) row.setAttribute('data-keys', JSON.stringify(data.k));
        cfg.columns.forEach(function (c, i) { if (c.inline && row.cells[i]) { row.cells[i].setAttribute('data-inline', c.key); row.cells[i].classList.add('mc-inline'); } });
        if (data.css) Object.keys(data.css).forEach(function (i) { if (row.cells[i]) row.cells[i].setAttribute('style', data.css[i]); });
      },
      drawCallback: function () {
        var all = $('.mc-check-all'); if (all) all.checked = false;
        syncSel();
      }
    });
    window.MC = window.MC || {}; window.MC.grid = dt;
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var body = grid.closest('.dt-scroll') && grid.closest('.dt-scroll').querySelector('.dt-scroll-body');
        if (body) body.style.maxHeight = gridHeight();
        dt.columns.adjust();
      }, 150);
    });
  }
  var delBtn = $('.mc-delete-selected');
  var updBtn = $('.mc-update-selected');
  var syncSel = function () {
    var none = !$$('.mc-check:checked').length;
    if (delBtn) delBtn.disabled = none;
    if (updBtn) updBtn.disabled = none;
  };
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
      if (!el) {
        // Popup add/edit from a list: refresh the grid (or the page).
        if (window.MC && window.MC.grid) window.MC.grid.ajax.reload(null, false); else if (!modalTarget) location.reload();
        return;
      }
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
    var full = function (d) { var o = option(d); return d.js && window.mcAnyChart ? window.mcAnyChart(o, d.js) : o; };
    $$('.mc-chart').forEach(function (el) {
      fetchJson(el.getAttribute('data-src')).then(function (d) {
        var chart = echarts.init(el, dark() ? 'dark' : null, { renderer: 'canvas' });
        // click on a bar, point or slice: the list filtered on it
        var drill = function (c) {
          if (!d.links || !d.links.some(Boolean)) return;
          c.on('click', function (p) { var u = d.links[p.dataIndex]; if (u) window.location.href = u; });
          c.getZr().on('mousemove', function (e) { c.getZr().setCursorStyle(e.target ? 'pointer' : 'default'); });
        };
        chart.setOption(full(d));
        drill(chart);
        if (window.ResizeObserver) new ResizeObserver(function () { chart.resize(); }).observe(el);
        new MutationObserver(function () { chart.dispose(); chart = echarts.init(el, dark() ? 'dark' : null); chart.setOption(full(d)); drill(chart); }).observe(root, { attributes: true, attributeFilter: ['data-bs-theme'] });
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

/* --- popup pages, inline edit, hover preview, QR codes, signatures, alternative list views --- */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var csrf = ($('meta[name="csrf-token"]') || {}).content || '';
  var post = function (url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); return j; }); });
  };

  // Add/edit/view in a modal window ("popup" mode of the page).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.mc-popup-link');
    if (!a || e.ctrlKey || e.metaKey || !window.MCModal) return;
    e.preventDefault();
    window.MCModal.open(a.href + (a.href.indexOf('?') > 0 ? '&' : '?') + 'popup=1', a.title || a.textContent.trim(), null);
  });

  // Inline edit: double click on an editable cell.
  var grid = $('#mcGrid');
  if (grid) {
    var cfg = JSON.parse(grid.getAttribute('data-dt'));
    grid.addEventListener('dblclick', function (e) {
      var td = e.target.closest('td.mc-inline');
      if (!td || td.querySelector('input,select')) return;
      var tr = td.closest('tr');
      var keys = JSON.parse(tr.getAttribute('data-keys') || '{}');
      var field = td.getAttribute('data-inline');
      var old = td.innerHTML;
      var text = td.textContent.trim();
      var input = document.createElement('input');
      input.className = 'form-control form-control-sm';
      input.value = text;
      td.innerHTML = '';
      td.appendChild(input);
      input.focus(); input.select();
      var done = false;
      var finish = function (save) {
        if (done) return; done = true;
        if (!save || input.value === text) { td.innerHTML = old; return; }
        td.classList.add('mc-saving');
        post(cfg.inlineUrl, { k: keys, f: field, v: input.value }).then(function (r) { td.innerHTML = r.html; td.classList.remove('mc-saving'); td.classList.add('mc-saved'); setTimeout(function () { td.classList.remove('mc-saved'); }, 900); })
          .catch(function (err) { td.innerHTML = old; td.classList.remove('mc-saving'); alert(err.message); });
      };
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
      input.addEventListener('blur', function () { finish(true); });
    });
  }

  // Hover preview of linked records (lookup values).
  var tip = null, tipTimer = null;
  document.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a.mc-preview');
    if (!a) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      fetch(a.getAttribute('data-preview'), { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var dl = doc.querySelector('dl.mc-view');
        if (!dl) return;
        if (!tip) { tip = document.createElement('div'); tip.className = 'mc-tip card shadow'; document.body.appendChild(tip); }
        tip.innerHTML = '<div class="card-body small">' + dl.outerHTML + '</div>';
        var r = a.getBoundingClientRect();
        tip.style.left = Math.min(window.innerWidth - 380, r.left) + 'px';
        tip.style.top = (r.bottom + window.scrollY + 6) + 'px';
        tip.style.display = 'block';
      });
    }, 450);
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest && e.target.closest('a.mc-preview')) { clearTimeout(tipTimer); if (tip) tip.style.display = 'none'; }
  });

  // QR codes (viewAs "qrcode"), also inside grids redrawn by DataTables.
  var drawQr = function () {
    if (!window.qrcode) return;
    $$('.mc-qr:not([data-done])').forEach(function (el) {
      try { var q = qrcode(0, 'M'); q.addData(el.getAttribute('data-qr')); q.make(); el.innerHTML = q.createSvgTag(Number(el.getAttribute('data-size')) || 3, 0); } catch (e) {}
      el.setAttribute('data-done', '1');
    });
  };
  drawQr();
  if (window.MC && window.MC.grid) window.MC.grid.on('draw', drawQr);

  // Signature pad (editAs "signature").
  $$('.mc-sign').forEach(function (box) {
    var cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), input = document.getElementById(box.getAttribute('data-target'));
    var drawing = false, last = null;
    cv.style.width = '100%'; cv.style.maxWidth = '500px';
    if (input.value) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0); }; img.src = input.value; }
    var pos = function (e) { var r = cv.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * cv.width / r.width, (p.clientY - r.top) * cv.height / r.height]; };
    var start = function (e) { drawing = true; last = pos(e); e.preventDefault(); };
    var move = function (e) { if (!drawing) return; var p = pos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; e.preventDefault(); };
    var end = function () { if (drawing) { drawing = false; input.value = cv.toDataURL('image/png'); } };
    cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    cv.addEventListener('touchstart', start); cv.addEventListener('touchmove', move); cv.addEventListener('touchend', end);
    box.querySelector('.mc-sign-clear').addEventListener('click', function () { ctx.clearRect(0, 0, cv.width, cv.height); input.value = ''; });
  });

  // Alternative views of the list page.
  var view = $('#mcView');
  if (!view) return;
  var vcfg = JSON.parse(view.getAttribute('data-cfg') || '{}');
  var type = view.getAttribute('data-view');
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  var update = function (row, field, value) { return post(view.getAttribute('data-inline'), { k: row.k, f: field, v: value }); };
  fetch(view.getAttribute('data-feed'), { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
    var rows = data.rows;
    var title = function (r) { return r.d[vcfg.titleField] || ''; };
    if (type === 'calendar' && window.FullCalendar) {
      view.style.minHeight = '640px';
      var cal = new FullCalendar.Calendar(view, {
        initialView: 'dayGridMonth', locale: (window.MC && window.MC.lang) || 'it', height: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' },
        editable: !!data.canEdit,
        events: rows.filter(function (r) { return r.v[vcfg.dateField]; }).map(function (r) {
          return { title: title(r), start: String(r.v[vcfg.dateField]).replace(' ', 'T'), end: vcfg.endField && r.v[vcfg.endField] ? String(r.v[vcfg.endField]).replace(' ', 'T') : undefined, url: r.url, extendedProps: { row: r } };
        }),
        eventDrop: function (info) {
          var d = info.event.start; var pad = function (n) { return (n < 10 ? '0' : '') + n; };
          var val = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + (String(info.event.extendedProps.row.v[vcfg.dateField]).length > 10 ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00' : '');
          update(info.event.extendedProps.row, vcfg.dateField, val).catch(function (e) { alert(e.message); info.revert(); });
        }
      });
      cal.render();
    } else if (type === 'gallery') {
      view.className += ' row g-3';
      view.innerHTML = rows.map(function (r) {
        var img = r.img && r.img[vcfg.imageField];
        return '<div class="col-6 col-md-4 col-xl-3"><a class="card h-100 text-decoration-none mc-gallery-card" href="' + esc(r.url) + '">' + (img ? '<img class="card-img-top" src="' + esc(img) + '" alt="">' : '<div class="mc-noimg"><i class="bi bi-image"></i></div>')
          + '<div class="card-body"><div class="fw-semibold">' + esc(title(r)) + '</div>' + (vcfg.subtitleField ? '<div class="small text-secondary">' + esc(r.d[vcfg.subtitleField]) + '</div>' : '') + '</div></a></div>';
      }).join('');
    } else if (type === 'kanban') {
      var opts = data.options[vcfg.statusField] || [];
      if (!opts.length) { var seen = {}; rows.forEach(function (r) { var v = r.v[vcfg.statusField]; if (v != null && !seen[v]) { seen[v] = 1; opts.push({ value: String(v), label: r.d[vcfg.statusField] }); } }); }
      view.className += ' mc-kanban';
      view.innerHTML = opts.map(function (o) {
        var cards = rows.filter(function (r) { return String(r.v[vcfg.statusField]) === String(o.value); });
        return '<div class="mc-kcol" data-value="' + esc(o.value) + '"><div class="mc-khead">' + esc(o.label) + ' <span class="badge text-bg-secondary">' + cards.length + '</span></div>'
          + cards.map(function (r) { return '<div class="card mc-kcard" draggable="' + (data.canEdit ? 'true' : 'false') + '" data-k=\'' + esc(JSON.stringify(r.k)) + '\'><div class="card-body p-2"><a href="' + esc(r.url) + '">' + esc(title(r)) + '</a>'
            + (vcfg.subtitleField ? '<div class="small text-secondary">' + esc(r.d[vcfg.subtitleField]) + '</div>' : '') + '</div></div>'; }).join('') + '</div>';
      }).join('');
      var dragged = null;
      $$('.mc-kcard', view).forEach(function (c) { c.addEventListener('dragstart', function () { dragged = c; c.classList.add('dragging'); }); c.addEventListener('dragend', function () { c.classList.remove('dragging'); }); });
      $$('.mc-kcol', view).forEach(function (col) {
        col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', function () { col.classList.remove('over'); });
        col.addEventListener('drop', function (e) {
          e.preventDefault(); col.classList.remove('over');
          if (!dragged) return;
          var from = dragged.parentNode;
          col.appendChild(dragged);
          update({ k: JSON.parse(dragged.getAttribute('data-k')) }, vcfg.statusField, col.getAttribute('data-value')).catch(function (err) { from.appendChild(dragged); alert(err.message); });
        });
      });
    } else if (type === 'map' && window.L) {
      view.style.height = '600px';
      var map = L.map(view);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      var pts = [];
      rows.forEach(function (r) {
        var lat = parseFloat(r.v[vcfg.latField]), lng = parseFloat(r.v[vcfg.lngField]);
        if (isNaN(lat) || isNaN(lng)) return;
        pts.push([lat, lng]);
        L.marker([lat, lng]).addTo(map).bindPopup('<a href="' + esc(r.url) + '">' + esc(title(r)) + '</a>');
      });
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); else map.setView([42, 12.5], 5);
    }
  });
})();

// Notifications: unread count under the bell (every minute), list when opened, seen once shown.
(function () {
  'use strict';
  var box = document.querySelector('.mc-notif');
  if (!box) return;
  var url = box.getAttribute('data-url');
  var count = box.querySelector('.mc-notif-count');
  var menu = box.querySelector('.mc-notif-menu');
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  var show = function (r) {
    count.textContent = r.unread > 99 ? '99+' : String(r.unread);
    count.classList.toggle('d-none', !r.unread);
    if (!r.items.length) return;
    menu.innerHTML = r.items.map(function (n) {
      var body = '<div class="d-flex gap-2"><i class="bi bi-' + esc(n.icon || 'info-circle') + ' mt-1"></i><div class="flex-grow-1">'
        + (n.title ? '<div class="fw-semibold">' + esc(n.title) + '</div>' : '') + '<div class="small mc-notif-text">' + esc(n.message) + '</div>'
        + '<div class="small text-secondary">' + esc(n.at) + '</div></div></div>';
      var cls = 'dropdown-item mc-notif-item' + (n.unread ? ' mc-notif-unread' : '');
      return n.url ? '<a class="' + cls + '" href="' + esc(n.url) + '"' + (n.newWindow ? ' target="_blank" rel="noopener"' : '') + '>' + body + '</a>'
        : '<div class="' + cls + '">' + body + '</div>';
    }).join('');
  };
  var load = function () { fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) { if (r) show(r); }).catch(function () {}); };
  box.addEventListener('shown.bs.dropdown', function () {
    fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': csrf } }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) { if (r) { show(r); count.classList.add('d-none'); } }).catch(function () {});
  });
  load();
  setInterval(load, 60000);
})();

// Saved searches: the quick search typed in the list (DataTables) is part of the saved search.
document.addEventListener('submit', function (e) {
  var f = e.target;
  if (!f.classList || !f.classList.contains('mc-save-search')) return;
  try {
    var input = f.elements['query'];
    var q = JSON.parse(input.value || '{}');
    var dt = window.jQuery && jQuery.fn.dataTable ? jQuery.fn.dataTable.tables({ api: true }) : null;
    if (dt && dt.context.length) { var s = dt.search(); if (s) q.q = s; else delete q.q; }
    input.value = JSON.stringify(q);
  } catch (x) { /* keep the search from the address */ }
}, true);

// Theme customizer (user menu): the user's choice in a cookie read by the layout, then a reload.
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('.mc-choice, .mc-choice-reset');
  if (!b) return;
  var box = b.closest('.mc-customizer');
  var name = box.getAttribute('data-cookie');
  var cur = {};
  try { var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); if (m) cur = JSON.parse(decodeURIComponent(m[1])) || {}; } catch (x) { cur = {}; }
  if (b.classList.contains('mc-choice-reset')) cur = {};
  else cur[b.getAttribute('data-key')] = b.getAttribute('data-value');
  document.cookie = name + '=' + encodeURIComponent(JSON.stringify(cur)) + '; path=/; max-age=31536000; samesite=lax';
  location.reload();
});

// Inline add: the row above the list is saved without leaving the page, then the list is reloaded.
(function () {
  var form = document.querySelector('form.mc-inline-add');
  var open = document.querySelector('.mc-ia-open');
  if (!form || !open) return;
  var first = function () { var i = form.querySelector('.mc-ia-field input, .mc-ia-field select, .mc-ia-field textarea'); if (i) i.focus(); };
  open.addEventListener('click', function () { form.classList.toggle('d-none'); if (!form.classList.contains('d-none')) first(); });
  form.querySelector('.mc-ia-cancel').addEventListener('click', function () { form.classList.add('d-none'); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button.btn-primary');
    var err = form.querySelector('.mc-ia-error');
    form.querySelectorAll('.is-invalid').forEach(function (x) { x.classList.remove('is-invalid'); });
    err.textContent = '';
    btn.disabled = true;
    fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok || !res.j.ok) {
          var errs = res.j.errors || {};
          Object.keys(errs).forEach(function (k) {
            var box = form.querySelector('.mc-ia-field[data-field="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
            if (!box) return;
            var c = box.querySelector('input, select, textarea');
            if (c) c.classList.add('is-invalid');
            box.querySelector('.invalid-feedback').textContent = errs[k];
          });
          err.textContent = Object.keys(errs).length ? '' : (res.j.error || 'Error');
          return;
        }
        form.reset();
        if (window.jQuery && jQuery.fn.dataTable) jQuery('#mcGrid').DataTable().ajax.reload(null, false);
        first();
      })
      .catch(function (x) { btn.disabled = false; err.textContent = x.message; });
  });
})();
