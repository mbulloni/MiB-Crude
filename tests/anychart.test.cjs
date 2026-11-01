'use strict';
// AnyChart calls of imported chart events (JS_ModifyChart) replayed on an ECharts option.
const test = require('node:test');
const assert = require('node:assert');

test('anychart-compat translates the common customizations', () => {
  const warnings = [];
  global.window = { console: { warn: (...a) => warnings.push(a.join(' ')) } };
  delete require.cache[require.resolve('../runtime/assets/anychart-compat.js')];
  require('../runtime/assets/anychart-compat.js');
  const opt = { series: [{ type: 'bar', data: [1200.5] }, { type: 'bar', data: [3] }], xAxis: { type: 'category', data: ['a'] }, yAxis: { type: 'value' }, legend: {}, tooltip: {} };
  const o = window.mcAnyChart(opt, `
    chart.barsPadding(-0.3);
    chart.labels().format(function () { return anychart.format.number(this.value, 1, ",", "."); });
    var s = chart.getSeriesAt(1); s.labels(true); s.labels().position("center"); s.labels().fontColor("#fff"); s.color("#f00");
    chart.legend().fontSize(14).fontWeight(600); chart.legend().position("right"); chart.legend().itemsLayout("vertical");
    var sc = anychart.scales.linear(); sc.minimum(0); sc.maximum(60); sc.ticks().interval(20);
    var ax = chart.yAxis(1); ax.orientation("right"); ax.scale(sc); ax.title("OGGI");
    chart.xAxis().labels().rotation(-45);
    chart.xZoom().setTo(0, 0.5); chart.outsideLabelsCriticalAngle(60).foo().bar(1);
  `);
  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(o.series[0].barGap, '-30%');
  assert.strictEqual(o.series[0].label.formatter({ value: 1200.5, name: 'a' }), '1.200,5');
  assert.deepStrictEqual({ ...o.series[1].label, formatter: undefined }, { show: true, position: 'inside', color: '#fff', formatter: undefined });
  assert.strictEqual(o.series[1].itemStyle.color, '#f00');
  assert.deepStrictEqual(o.legend.textStyle, { fontSize: 14, fontWeight: 600 });
  assert.strictEqual(o.legend.orient, 'vertical');
  assert.strictEqual(o.legend.right, 0);
  assert.deepStrictEqual([o.yAxis[1].position, o.yAxis[1].min, o.yAxis[1].max, o.yAxis[1].interval, o.yAxis[1].name], ['right', 0, 60, 20, 'OGGI']);
  assert.strictEqual(o.xAxis[0].axisLabel.rotate, 45);
  assert.strictEqual(o.dataZoom[0].end, 50);
  // Broken code is reported, the chart still renders.
  window.mcAnyChart({ series: [] }, 'chart.(');
  assert.strictEqual(warnings.length, 1);
});

test('anychart-compat: stacking, markers, pie outside labels, format strings', () => {
  global.window = { console: { warn: () => {} } };
  delete require.cache[require.resolve('../runtime/assets/anychart-compat.js')];
  require('../runtime/assets/anychart-compat.js');
  // 100% stacking (classic: chart.yScale().stackMode("percent")).
  let o = window.mcAnyChart({ series: [{ type: 'bar', data: [1, 30] }, { type: 'bar', data: [3, { value: 10 }] }], yAxis: { type: 'value' } }, 'var y = chart.yScale(); y.stackMode("percent");');
  assert.deepStrictEqual([o.series[0].stack, o.series[1].stack], ['mc', 'mc']);
  assert.deepStrictEqual(o.series[0].data, [25, 75]);
  assert.deepStrictEqual([o.series[1].data[0], o.series[1].data[1].value], [75, 25]);
  assert.deepStrictEqual([o.yAxis[0].min, o.yAxis[0].max, o.yAxis[0].axisLabel.formatter], [0, 100, '{value}%']);
  o = window.mcAnyChart({ series: [{ type: 'bar', data: [1] }, { type: 'bar', data: [2] }] }, 'var s = anychart.scales.linear(); s.stackMode("value"); chart.yScale(s);');
  assert.deepStrictEqual([o.series[0].stack, o.series[0].data[0]], ['mc', 1]);
  // Line markers.
  o = window.mcAnyChart({ series: [{ type: 'line', data: [1] }, { type: 'line', data: [2] }] }, 'chart.getSeriesAt(0).markers(true); var m = chart.getSeriesAt(1).markers(); m.type("square"); m.size(4);');
  assert.deepStrictEqual([o.series[0].showSymbol, o.series[1].symbol, o.series[1].symbolSize], [true, 'rect', 8]);
  // Pie: slices under 160 degrees get the label outside.
  o = window.mcAnyChart({ series: [{ type: 'pie', data: [{ name: 'a', value: 50 }, { name: 'b', value: 10 }] }] }, 'chart.outsideLabelsCriticalAngle(160);');
  assert.deepStrictEqual(o.series[0].data.map((d) => d.label.position), ['inside', 'outside']);
  // AnyChart format strings.
  o = window.mcAnyChart({ series: [{ type: 'bar', data: [1234.5] }], yAxis: { type: 'value' }, tooltip: {} }, `
    chart.labels().format("{%Value}{decimalsCount:1,groupsSeparator:.,decimalPoint:\\\\,} €");
    chart.tooltip().format("{%SeriesName}: {%Value}");
    chart.yAxis().labels().format("{%Value}%");`);
  assert.strictEqual(o.series[0].label.formatter({ value: 1234.5, name: 'x' }), '1.234,5 €');
  assert.strictEqual(o.tooltip.formatter([{ value: 3, seriesName: 'Vendite' }]), 'Vendite: 3');
  assert.strictEqual(o.yAxis[0].axisLabel.formatter(40), '40%');
  assert.strictEqual(window.mcAnyChart({ series: [] }, 'chart.title(anychart.format.number(1234.5, {decimalsCount: 0, groupsSeparator: "."}));').title.text, '1.235');
});
