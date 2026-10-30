'use strict';
// AnyChart calls of phpr chart events (JS_ModifyChart) replayed on an ECharts option.
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
