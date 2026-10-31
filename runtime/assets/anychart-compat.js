/*
 * MiB-Crude — "chart" and "anychart" objects for phpr chart events (JS_ModifyChart).
 * phpr draws charts with AnyChart; MiB-Crude uses Apache ECharts. This shim records the
 * AnyChart calls that customize a chart and applies them to the ECharts option: labels,
 * series colors, labels and markers, legend, tooltip, axes (also an extra right axis), scales,
 * stacking (also 100%), pie outside labels, zoom, AnyChart format strings ({%Value}...).
 * Calls without an equivalent are accepted and ignored, so imported code never breaks the page.
 */
(function () {
  'use strict';

  var arr = function (v) { return Array.isArray(v) ? v : (v ? [v] : []); };
  var pos = { center: 'inside', 'center-top': 'insideTop', 'center-bottom': 'insideBottom', 'inside-top': 'insideTop', 'inside-bottom': 'insideBottom', top: 'top', bottom: 'bottom', left: 'left', right: 'right', outside: 'outside', inside: 'inside' };

  // Chainable stand-in: any unknown method returns itself; known methods come from `impl`.
  function node(impl) {
    var self;
    var target = function () { return self; };
    self = new Proxy(target, {
      get: function (_t, k) {
        if (k === 'then') return undefined;
        if (Object.prototype.hasOwnProperty.call(impl, k)) return function () { var r = impl[k].apply(null, arguments); return r === undefined ? self : r; };
        return function () { return self; };
      }
    });
    return self;
  }

  // AnyChart number formatting: anychart.format.number(v, decimals, decSep, groupSep) or (v, {options}).
  function number(v, decimals, decSep, groupSep) {
    if (decimals && typeof decimals === 'object') { var o = decimals; decimals = o.decimalsCount; decSep = o.decimalPoint; groupSep = o.groupsSeparator; }
    var n = Number(v);
    if (v === null || v === '' || isNaN(n)) return v;
    var parts = n.toFixed(decimals === undefined ? 2 : decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, groupSep === undefined ? ',' : groupSep);
    return parts.join(decSep === undefined ? '.' : decSep);
  }

  // "{%Value}{decimalsCount:1,groupsSeparator:.} €" -> function of the ECharts formatter params.
  function tokens(str) {
    return function (p) {
      var vals = { value: p.value, x: p.name, name: p.name, category: p.name, seriesname: p.seriesName, percentvalue: p.percent, index: p.dataIndex };
      if (Array.isArray(p.value)) vals.value = p.value[p.value.length - 1];
      return String(str).replace(/\{%(\w+)\}(\{([^}]*)\})?/g, function (_m, k, _o, opts) {
        var v = vals[k.toLowerCase()];
        if (v === undefined) return '';
        if (!opts || typeof v !== 'number' && isNaN(Number(v))) return v;
        var o = {};
        // Options are comma separated; a comma inside a value is escaped as \, (e.g. decimalPoint:\,).
        opts.replace(/\\,/g, '\u0000').split(',').forEach(function (kv) { var i = kv.indexOf(':'); if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).replace(/\u0000/g, ','); });
        return number(v, o.decimalsCount !== undefined ? Number(o.decimalsCount) : undefined, o.decimalPoint, o.groupsSeparator);
      }).replace(/\\n/g, '\n');
    };
  }
  // Function or format string of a format() call.
  function anyFormat(f) { return typeof f === 'function' ? formatter(f) : tokens(f); }

  function formatter(fn) {
    return function (p) {
      var ctx = { value: p.value, x: p.name, name: p.name, seriesName: p.seriesName, index: p.dataIndex, percentValue: p.percent, getData: function (k) { return k === 'value' ? p.value : p.name; } };
      try { return fn.call(ctx); } catch (e) { return p.value; }
    };
  }

  // Label settings for one series option (or all of them).
  function labels(get) {
    var set = function (patch) { get().forEach(function (s) { s.label = Object.assign(s.label || {}, patch); }); };
    return node({
      enabled: function (b) { set({ show: b !== false }); },
      position: function (p) { set({ show: true, position: pos[p] || 'inside' }); },
      anchor: function () {},
      fontColor: function (c) { set({ color: c }); },
      fontSize: function (n) { set({ fontSize: parseFloat(n) }); },
      fontWeight: function (w) { set({ fontWeight: w }); },
      format: function (f) { set({ formatter: anyFormat(f) }); },
      rotation: function (r) { set({ rotate: -r }); },
    });
  }
  function labelsCall(get) {
    return function (v) {
      if (v === undefined) return labels(get);
      get().forEach(function (s) { s.label = Object.assign(s.label || {}, { show: typeof v === 'object' ? v.enabled !== false : v !== false }); });
    };
  }

  function scale() {
    var s = { min: undefined, max: undefined, interval: undefined };
    var n = node({
      minimum: function (v) { s.min = v; }, maximum: function (v) { s.max = v; },
      ticks: function () { return node({ interval: function (v) { s.interval = v; } }); },
      softMinimum: function (v) { s.min = v; }, softMaximum: function (v) { s.max = v; },
      stackMode: function (m) { s.stack = m; },
    });
    n.__scale = s;
    return { node: n, data: s };
  }
  var scales = [];

  function axis(opt, key, i) {
    opt[key] = arr(opt[key]);
    if (!opt[key].length) opt[key].push({ type: 'value' });
    while (opt[key].length <= i) opt[key].push({ type: 'value', position: key === 'yAxis' ? 'right' : 'top', splitLine: { show: false } });
    var a = function () { return opt[key][i]; };
    var lab = function () { a().axisLabel = a().axisLabel || {}; return a().axisLabel; };
    return node({
      enabled: function (b) { a().show = b !== false; },
      orientation: function (o) { a().position = o; },
      title: function (t) { if (t !== undefined && typeof t !== 'object') { a().name = String(t); a().nameLocation = 'middle'; a().nameGap = 40; } return node({ text: function (x) { a().name = x; } }); },
      scale: function (sc) {
        var found = null;
        scales.forEach(function (x) { if (x.node === sc) found = x.data; });
        if (found) { if (found.min !== undefined) a().min = found.min; if (found.max !== undefined) a().max = found.max; if (found.interval !== undefined) a().interval = found.interval; }
      },
      labels: function (v) {
        if (v !== undefined && typeof v !== 'function') { lab().show = v !== false; return; }
        return node({
          enabled: function (b) { lab().show = b !== false; },
          rotation: function (r) { lab().rotate = -r; },
          fontSize: function (n) { lab().fontSize = parseFloat(n); },
          fontColor: function (c) { lab().color = c; },
          format: function (f) {
            lab().formatter = typeof f === 'function'
              ? function (v) { try { return f.call({ value: v, tickValue: v }); } catch (e) { return v; } }
              : function (v) { return tokens(f)({ value: v, name: v }); };
          },
          width: function (w) { lab().width = w; lab().overflow = 'truncate'; },
        });
      },
    });
  }

  function seriesNode(opt, i) {
    var s = function () { return opt.series && opt.series[i] ? [opt.series[i]] : []; };
    return node({
      labels: labelsCall(s),
      color: function (c) { s().forEach(function (x) { x.itemStyle = Object.assign(x.itemStyle || {}, { color: c }); }); },
      fill: function (c) { if (typeof c === 'string') s().forEach(function (x) { x.itemStyle = Object.assign(x.itemStyle || {}, { color: c.split(' ')[0] }); }); },
      stroke: function (c) { if (typeof c === 'string') s().forEach(function (x) { x.lineStyle = Object.assign(x.lineStyle || {}, { color: c.split(' ')[0] }); }); },
      name: function (n) { s().forEach(function (x) { x.name = n; }); },
      yScale: function (sc) {
        // Series bound to an extra scale: use the axis that has it, else a new right axis.
        var found = null;
        scales.forEach(function (x) { if (x.node === sc) found = x; });
        if (!found) return;
        opt.yAxis = arr(opt.yAxis);
        var idx = -1;
        opt.yAxis.forEach(function (ax, j) { if (j > 0 && ax.min === found.data.min && ax.max === found.data.max) idx = j; });
        if (idx < 0) { opt.yAxis.push({ type: 'value', position: 'right', min: found.data.min, max: found.data.max, interval: found.data.interval, splitLine: { show: false } }); idx = opt.yAxis.length - 1; }
        s().forEach(function (x) { x.yAxisIndex = idx; });
      },
      tooltip: function () { return node({}); },
      enabled: function (b) { if (b === false) s().forEach(function (x) { x.data = []; }); },
      markers: function (v) {
        var set = function (patch) { s().forEach(function (x) { Object.assign(x, patch); }); };
        if (v !== undefined && typeof v !== 'object') { set({ showSymbol: v !== false, symbol: 'circle' }); return; }
        if (v && typeof v === 'object') { set({ showSymbol: v.enabled !== false, symbol: v.type || 'circle', symbolSize: v.size || 6 }); return; }
        set({ showSymbol: true, symbol: 'circle' });
        return node({
          enabled: function (b) { set({ showSymbol: b !== false }); },
          type: function (t) { set({ symbol: { circle: 'circle', square: 'rect', diamond: 'diamond', 'triangle-up': 'triangle' }[t] || 'circle' }); },
          size: function (n) { set({ symbolSize: parseFloat(n) * 2 }); },
          fill: function (c) { if (typeof c === 'string') s().forEach(function (x) { x.itemStyle = Object.assign(x.itemStyle || {}, { color: c }); }); },
        });
      },
    });
  }

  // Stacking of a value scale: "value" piles the series, "percent" also scales each category to 100%.
  function stack(opt, mode) {
    var all = opt.series || [];
    if (mode !== 'value' && mode !== 'percent') { all.forEach(function (x) { delete x.stack; }); return; }
    all.forEach(function (x) { x.stack = 'mc'; });
    if (mode !== 'percent') return;
    var val = function (d) { return d && typeof d === 'object' && !Array.isArray(d) ? d.value : d; };
    var n = 0;
    all.forEach(function (x) { n = Math.max(n, (x.data || []).length); });
    for (var i = 0; i < n; i++) {
      var sum = 0;
      all.forEach(function (x) { sum += Math.abs(Number(val((x.data || [])[i])) || 0); });
      all.forEach(function (x) {
        if (!x.data || x.data[i] === undefined) return;
        var pct = sum ? Math.round(Number(val(x.data[i]) || 0) / sum * 10000) / 100 : 0;
        if (x.data[i] && typeof x.data[i] === 'object' && !Array.isArray(x.data[i])) x.data[i].value = pct; else x.data[i] = pct;
      });
    }
    opt.yAxis = arr(opt.yAxis);
    var y = opt.yAxis[0] || (opt.yAxis[0] = { type: 'value' });
    y.min = 0; y.max = 100;
    y.axisLabel = Object.assign(y.axisLabel || {}, { formatter: '{value}%' });
  }

  // Pie labels outside for slices narrower than `angle` degrees, inside for the others.
  function outsideLabels(opt, angle) {
    (opt.series || []).forEach(function (x) {
      if (x.type !== 'pie' || !x.data) return;
      var val = function (d) { return Number(d && typeof d === 'object' ? d.value : d) || 0; };
      var sum = x.data.reduce(function (a, d) { return a + Math.abs(val(d)); }, 0);
      x.data = x.data.map(function (d) {
        var item = d && typeof d === 'object' ? d : { value: d };
        var deg = sum ? Math.abs(val(item)) / sum * 360 : 0;
        item.label = Object.assign(item.label || {}, { position: deg < angle ? 'outside' : 'inside' });
        return item;
      });
    });
  }

  /** Runs phpr chart code against an ECharts option and returns the changed option. */
  window.mcAnyChart = function (opt, code) {
    scales = [];
    var legend = function () { opt.legend = opt.legend || {}; opt.legend.textStyle = opt.legend.textStyle || {}; return opt.legend; };
    var tooltip = function () { opt.tooltip = opt.tooltip || {}; return opt.tooltip; };
    var all = function () { return opt.series || []; };
    var chart = node({
      barsPadding: function (v) { all().forEach(function (s) { s.barGap = Math.round(v * 100) + '%'; }); },
      barGroupsPadding: function (v) { all().forEach(function (s) { s.barCategoryGap = Math.round(v * 50) + '%'; }); },
      labels: labelsCall(all),
      getSeriesAt: function (i) { return seriesNode(opt, i); },
      getSeries: function (i) { return seriesNode(opt, typeof i === 'number' ? i : 0); },
      getSeriesCount: function () { return all().length; },
      title: function (t) { if (typeof t === 'string') opt.title = { text: t, left: 'center' }; return node({ text: function (x) { opt.title = { text: x, left: 'center' }; } }); },
      palette: function (p) { if (Array.isArray(p)) opt.color = p; },
      legend: function (v) {
        if (v !== undefined) { legend().show = v !== false; return; }
        return node({
          enabled: function (b) { legend().show = b !== false; },
          fontSize: function (n) { legend().textStyle.fontSize = parseFloat(n); },
          fontColor: function (c) { legend().textStyle.color = c; },
          fontWeight: function (w) { legend().textStyle.fontWeight = w; },
          position: function (p) { var l = legend(); delete l.top; delete l.bottom; delete l.left; delete l.right; l[p === 'left' || p === 'right' ? p : p === 'top' ? 'top' : 'bottom'] = p === 'center' ? 'middle' : 0; if (p === 'left' || p === 'right') l.top = 'middle'; },
          itemsLayout: function (o) { legend().orient = /vertical/.test(o) ? 'vertical' : 'horizontal'; },
          align: function (a) { legend().left = a === 'center' ? 'center' : a; },
        });
      },
      tooltip: function (v) {
        if (v !== undefined) { tooltip().show = v !== false; return; }
        return node({
          enabled: function (b) { tooltip().show = b !== false; },
          format: function (f) { tooltip().formatter = function (p) { p = Array.isArray(p) ? p[0] : p; return anyFormat(f)(p); }; },
          useHtml: function () {},
          titleFormat: function () {},
        });
      },
      xAxis: function (i) { return axis(opt, 'xAxis', i || 0); },
      yAxis: function (i) { return axis(opt, 'yAxis', i || 0); },
      yScale: function (sc) {
        if (sc) {
          scales.forEach(function (x) { if (x.node === sc && x.data.stack) stack(opt, x.data.stack); });
          return;
        }
        var s = scale();
        scales.push(s);
        var y = function () { opt.yAxis = arr(opt.yAxis); return opt.yAxis[0] || (opt.yAxis[0] = { type: 'value' }); };
        return node({
          minimum: function (v) { y().min = v; }, maximum: function (v) { y().max = v; },
          ticks: function () { return node({ interval: function (v) { y().interval = v; } }); },
          stackMode: function (m) { stack(opt, m); },
        });
      },
      outsideLabelsCriticalAngle: function (a) { outsideLabels(opt, Number(a) || 0); },
      xZoom: function () { return node({ setTo: function (a, b) { opt.dataZoom = [{ type: 'inside', start: a * 100, end: b * 100 }, { type: 'slider', height: 18, bottom: 24, start: a * 100, end: b * 100 }]; } }); },
      xScroller: function (v) { if (v !== false && !opt.dataZoom) opt.dataZoom = [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 24 }]; },
      background: function (c) { if (typeof c === 'string') opt.backgroundColor = c; },
    });
    var anychart = {
      scales: { linear: function () { var s = scale(); scales.push(s); return s.node; }, ordinal: function () { return node({}); }, log: function () { var s = scale(); scales.push(s); return s.node; } },
      format: { number: number },
      graphics: { vector: { HatchFill: {} } },
    };
    try { new Function('chart', 'anychart', code).call(chart, chart, anychart); }
    catch (e) { if (window.console) window.console.warn('[MiB-Crude] evento del grafico importato da phpr:', e); }
    return opt;
  };
})();
