/*
 * MiB-Crude — "chart" and "anychart" objects for phpr chart events (JS_ModifyChart).
 * phpr draws charts with AnyChart; MiB-Crude uses Apache ECharts. This shim records the
 * AnyChart calls that customize a chart and applies them to the ECharts option: labels,
 * series colors and labels, legend, tooltip, axes (also an extra right axis), scales, zoom.
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
      format: function (f) { set(typeof f === 'function' ? { formatter: formatter(f) } : { formatter: String(f).replace(/\{%Value\}/g, '{c}').replace(/\{%X\}/g, '{b}') }); },
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
          format: function (f) { if (typeof f === 'function') lab().formatter = function (v) { try { return f.call({ value: v, tickValue: v }); } catch (e) { return v; } }; },
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
          format: function (f) { if (typeof f === 'function') tooltip().formatter = function (p) { p = Array.isArray(p) ? p[0] : p; return formatter(f)(p); }; },
          useHtml: function () {},
          titleFormat: function () {},
        });
      },
      xAxis: function (i) { return axis(opt, 'xAxis', i || 0); },
      yAxis: function (i) { return axis(opt, 'yAxis', i || 0); },
      yScale: function (sc) {
        if (sc) return;
        var s = scale();
        scales.push(s);
        var y = function () { opt.yAxis = arr(opt.yAxis); return opt.yAxis[0] || (opt.yAxis[0] = { type: 'value' }); };
        return node({
          minimum: function (v) { y().min = v; }, maximum: function (v) { y().max = v; },
          ticks: function () { return node({ interval: function (v) { y().interval = v; } }); },
        });
      },
      xZoom: function () { return node({ setTo: function (a, b) { opt.dataZoom = [{ type: 'inside', start: a * 100, end: b * 100 }, { type: 'slider', height: 18, bottom: 24, start: a * 100, end: b * 100 }]; } }); },
      xScroller: function (v) { if (v !== false && !opt.dataZoom) opt.dataZoom = [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 24 }]; },
      background: function (c) { if (typeof c === 'string') opt.backgroundColor = c; },
    });
    var anychart = {
      scales: { linear: function () { var s = scale(); scales.push(s); return s.node; }, ordinal: function () { return node({}); }, log: function () { var s = scale(); scales.push(s); return s.node; } },
      format: {
        number: function (v, decimals, decSep, groupSep) {
          var n = Number(v);
          if (isNaN(n)) return v;
          var parts = n.toFixed(decimals === undefined ? 2 : decimals).split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, groupSep === undefined ? ',' : groupSep);
          return parts.join(decSep === undefined ? '.' : decSep);
        }
      },
      graphics: { vector: { HatchFill: {} } },
    };
    try { new Function('chart', 'anychart', code).call(chart, chart, anychart); }
    catch (e) { if (window.console) window.console.warn('[MiB-Crude] evento del grafico importato da phpr:', e); }
    return opt;
  };
})();
