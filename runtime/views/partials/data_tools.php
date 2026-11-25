<?php
/**
 * Search, filters and quick grouping / totals of a report or a chart (scope: views/report.php, views/chart.php).
 * @var \MiB\App $app @var \MiB\Table $t @var array $def @var string $name @var string $kind 'report' | 'chart'
 * Everything travels in the URL (q, s, gb, gi, ag, adhoc): the saved definition is never changed.
 */
$isChart = $kind === 'chart';
$q = isset($_GET['q']) && is_string($_GET['q']) ? $_GET['q'] : '';
$sActive = isset($_GET['s']) && is_array($_GET['s']) ? $_GET['s'] : [];
$adhoc = !empty($_GET['adhoc']);
$listFields = $t->fields('list');
$fieldOpts = [];
foreach ($listFields as $f) $fieldOpts[$f['name']] = ['label' => $t->fieldLabel($f), 'num' => in_array($f['type'], ['int', 'decimal'], true), 'date' => in_array($f['type'], ['date', 'datetime'], true)];
// filter fields: label, type and (for small fixed lists) the values
$filterMeta = [];
foreach ($t->fields('search') as $f) {
    $m = ['name' => $f['name'], 'label' => $t->fieldLabel($f), 'type' => in_array($f['type'], ['int', 'decimal'], true) ? 'number' : (in_array($f['type'], ['date', 'datetime'], true) ? 'date' : 'text')];
    $lk = $t->lookupDef($f);
    if ($lk && $lk['kind'] === 'list') {
        $m['type'] = 'list';
        $m['values'] = array_map(function ($v) use ($app) { return ['v' => (string)$v['value'], 'l' => $app->label($v['label'], (string)$v['value'])]; }, $lk['values']);
    } elseif ($f['type'] === 'bool') {
        $m['type'] = 'list';
        $m['values'] = [['v' => '1', 'l' => t('yes')], ['v' => '0', 'l' => t('no')]];
    }
    $filterMeta[] = $m;
}
$ops = ['contains', 'equals', 'notequals', 'starts', 'more', 'less', 'between', 'empty', 'notempty'];
$opLabels = [];
foreach ($ops as $o) $opLabels[$o] = t('op.' . $o);
// groups and totals as the page shows them now (the saved ones, or what the viewer asked)
$curGroups = $isChart ? [['field' => isset($def['labelField']) ? $def['labelField'] : '', 'interval' => isset($def['labelInterval']) ? $def['labelInterval'] : '']] : (isset($def['groups']) ? $def['groups'] : []);
$curAggs = array_map(function ($a) use ($t) { return \MiB\Reports::normAgg($t, $a); }, $isChart ? (isset($def['series']) ? $def['series'] : []) : (isset($def['aggregates']) ? $def['aggregates'] : []));
$nGroups = $isChart ? 1 : 3;
$nAggs = $isChart ? 3 : 4;
$intervals = ['' => t('builder.value'), 'year' => t('builder.year'), 'quarter' => t('builder.quarter'), 'month' => t('builder.month'), 'week' => t('report.week'), 'day' => t('builder.day')];
$fns = ['count' => t('agg.count'), 'sum' => t('agg.sum'), 'avg' => t('agg.avg'), 'min' => t('agg.min'), 'max' => t('agg.max')];
$fActive = isset($_GET['f']) && is_array($_GET['f']) ? $_GET['f'] : [];
$activeCount = count($sActive) + count($fActive) + ($q !== '' ? 1 : 0) + ($adhoc ? 1 : 0);
$param = $isChart ? ['c' => $name] : ['r' => $name];
$keep = [];
foreach (['embed', 'print'] as $k) if (!empty($_GET[$k])) $keep[$k] = $_GET[$k];
$pageName = $isChart ? 'chart' : 'report';
$clearUrl = $app->url($pageName, array_merge($param, $keep));
?>
<form method="get" action="index.php" class="card mb-3 mc-tools" id="mcTools">
<input type="hidden" name="p" value="<?= h($pageName) ?>">
<?php foreach (array_merge($param, $keep) as $k => $v): ?><input type="hidden" name="<?= h($k) ?>" value="<?= h($v) ?>"><?php endforeach ?>
<?php foreach ($fActive as $fn => $vals): foreach ((array)$vals as $v): if (is_string($v)): ?><input type="hidden" name="f[<?= h($fn) ?>][]" value="<?= h($v) ?>"><?php endif; endforeach; endforeach ?>
<input type="hidden" name="adhoc" value="1" id="mcAdhoc"<?= $adhoc ? '' : ' disabled' ?>>
<div class="card-body py-2">
  <div class="d-flex flex-wrap align-items-center gap-2">
    <div class="input-group input-group-sm" style="max-width:26rem">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input type="search" class="form-control" name="q" value="<?= h($q) ?>" placeholder="<?= h(t('tools.search_ph')) ?>" id="mcToolsQ" autocomplete="off">
      <button class="btn btn-primary"><?= h(t('btn.search')) ?></button>
    </div>
    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-toggle="collapse" data-bs-target="#mcToolsBody"><i class="bi bi-funnel"></i> <?= h(t('tools.options')) ?><?= $sActive || $adhoc ? ' <span class="badge text-bg-info">' . (count($sActive) + ($adhoc ? 1 : 0)) . '</span>' : '' ?></button>
    <?php if ($activeCount): ?><a class="btn btn-link btn-sm" href="<?= h($clearUrl) ?>"><?= h(t('list.clear')) ?></a><?php endif ?>
  </div>
  <div class="collapse<?= $sActive || $adhoc ? ' show' : '' ?>" id="mcToolsBody"><hr class="my-2">
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="fw-semibold small mb-1"><?= h(t('tools.filters')) ?></div>
        <div id="mcFilterRows"></div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-1" id="mcAddFilter"><i class="bi bi-plus-lg"></i> <?= h(t('tools.add_filter')) ?></button>
      </div>
      <div class="col-lg-6">
        <div class="fw-semibold small mb-1"><?= h($isChart ? t('builder.categories') : t('builder.groups')) ?></div>
        <?php for ($i = 0; $i < $nGroups; $i++): $g = isset($curGroups[$i]) ? $curGroups[$i] : []; ?>
        <div class="row g-1 mb-1"><div class="col-7"><select class="form-select form-select-sm mc-adhoc" name="gb[<?= $i ?>]"><option value=""></option>
          <?php foreach ($fieldOpts as $fn => $fo): ?><option value="<?= h($fn) ?>" data-date="<?= $fo['date'] ? 1 : 0 ?>"<?= (isset($g['field']) ? $g['field'] : '') === $fn ? ' selected' : '' ?>><?= h($fo['label']) ?></option><?php endforeach ?></select></div>
        <div class="col-5"><select class="form-select form-select-sm mc-adhoc mc-gi" name="gi[<?= $i ?>]"><?php foreach ($intervals as $k => $l): ?><option value="<?= h($k) ?>"<?= (isset($g['interval']) ? $g['interval'] : '') === $k ? ' selected' : '' ?>><?= h($l) ?></option><?php endforeach ?></select></div></div>
        <?php endfor ?>
        <div class="fw-semibold small mb-1 mt-2"><?= h($isChart ? t('builder.series') : t('tools.calc')) ?></div>
        <?php for ($i = 0; $i < $nAggs; $i++): $a = isset($curAggs[$i]) ? $curAggs[$i] : []; $isRows = !empty($a['rows']); ?>
        <div class="row g-1 mb-1"><div class="col-5"><select class="form-select form-select-sm mc-adhoc mc-fn" name="ag[<?= $i ?>][fn]"><option value=""></option>
          <?php foreach ($fns as $k => $l): ?><option value="<?= h($k) ?>"<?= (isset($a['fn']) ? $a['fn'] : '') === $k ? ' selected' : '' ?>><?= h($l) ?></option><?php endforeach ?></select></div>
        <div class="col-7"><select class="form-select form-select-sm mc-adhoc mc-af" name="ag[<?= $i ?>][field]"><option value=""><?= h(t('tools.records')) ?></option>
          <?php foreach ($fieldOpts as $fn => $fo): ?><option value="<?= h($fn) ?>" data-num="<?= $fo['num'] ? 1 : 0 ?>"<?= !$isRows && (isset($a['field']) ? $a['field'] : '') === $fn ? ' selected' : '' ?>><?= h($fo['label']) ?></option><?php endforeach ?></select></div></div>
        <?php endfor ?>
        <div class="form-text"><?= h(t('tools.calc_help')) ?></div>
      </div>
    </div>
    <div class="mt-2 d-flex gap-2"><button class="btn btn-primary btn-sm"><i class="bi bi-check-lg"></i> <?= h(t('tools.apply')) ?></button><a class="btn btn-outline-secondary btn-sm" href="<?= h($clearUrl) ?>"><?= h(t('tools.reset')) ?></a></div>
  </div>
</div>
</form>
<script>
(function () {
  var meta = <?= json_encode($filterMeta, JSON_UNESCAPED_UNICODE) ?>, ops = <?= json_encode($opLabels, JSON_UNESCAPED_UNICODE) ?>, active = <?= json_encode((object)$sActive, JSON_UNESCAPED_UNICODE) ?>;
  var box = document.getElementById('mcFilterRows'), form = document.getElementById('mcTools');
  if (!box || !form) { return; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function valueInput(m, name, val) {
    var i;
    if (m.type === 'list') {
      i = el('select', 'form-select form-select-sm'); i.appendChild(el('option', '', ''));
      m.values.forEach(function (o) { var op = el('option'); op.value = o.v; op.textContent = o.l; if (String(val) === o.v) { op.selected = true; } i.appendChild(op); });
    } else { i = el('input', 'form-control form-control-sm'); i.type = m.type === 'number' ? 'number' : (m.type === 'date' ? 'date' : 'text'); if (m.type === 'number') { i.step = 'any'; } i.value = val || ''; }
    i.setAttribute('data-name', name); return i;
  }
  function addRow(field, c) {
    var m = meta.filter(function (x) { return x.name === field; })[0] || meta[0];
    if (!m) { return; }
    c = c || {};
    var row = el('div', 'row g-1 mb-1 align-items-center mc-frow'), cf = el('div', 'col-4'), co = el('div', 'col-3'), cv = el('div', 'col'), cx = el('div', 'col-auto');
    var sf = el('select', 'form-select form-select-sm');
    meta.forEach(function (x) { var o = el('option'); o.value = x.name; o.textContent = x.label; if (x.name === m.name) { o.selected = true; } sf.appendChild(o); });
    var so = el('select', 'form-select form-select-sm');
    Object.keys(ops).forEach(function (k) { var o = el('option'); o.value = k; o.textContent = ops[k]; so.appendChild(o); });
    so.value = c.op || (m.type === 'text' ? 'contains' : (m.type === 'date' ? 'between' : 'equals'));
    var rm = el('button', 'btn btn-sm btn-link text-danger p-0', '<i class="bi bi-x-lg"></i>'); rm.type = 'button';
    cf.appendChild(sf); co.appendChild(so); cx.appendChild(rm); row.appendChild(cf); row.appendChild(co); row.appendChild(cv); row.appendChild(cx);
    function draw() {
      var mm = meta.filter(function (x) { return x.name === sf.value; })[0]; cv.innerHTML = '';
      if (so.value === 'empty' || so.value === 'notempty') { return; }
      cv.appendChild(valueInput(mm, 'v', c.v));
      if (so.value === 'between') { var w = valueInput(mm, 'v2', c.v2); w.className += ' mt-1'; cv.appendChild(w); }
    }
    sf.addEventListener('change', function () { c = {}; draw(); }); so.addEventListener('change', draw); rm.addEventListener('click', function () { row.remove(); });
    row._get = function () { return { f: sf.value, o: so.value, v: cv.querySelector('[data-name=v]') ? cv.querySelector('[data-name=v]').value : '', v2: cv.querySelector('[data-name=v2]') ? cv.querySelector('[data-name=v2]').value : '' }; };
    draw(); box.appendChild(row);
  }
  Object.keys(active).forEach(function (f) { addRow(f, active[f]); });
  document.getElementById('mcAddFilter').addEventListener('click', function () { addRow(meta[0] && meta[0].name); });
  // totals: sum / average only on numbers; intervals only on dates
  function sync() {
    Array.prototype.forEach.call(form.querySelectorAll('.mc-fn'), function (fn) {
      var af = fn.closest('.row').querySelector('.mc-af'), needNum = fn.value === 'sum' || fn.value === 'avg';
      Array.prototype.forEach.call(af.options, function (o) { if (o.value) { o.hidden = needNum && o.getAttribute('data-num') !== '1'; } });
      if (af.selectedOptions[0] && af.selectedOptions[0].hidden) { af.value = ''; }
    });
    Array.prototype.forEach.call(form.querySelectorAll('.mc-gi'), function (gi) {
      var gb = gi.closest('.row').querySelector('select[name^="gb"]'), isDate = gb.selectedOptions[0] && gb.selectedOptions[0].getAttribute('data-date') === '1';
      gi.disabled = !isDate; if (!isDate) { gi.value = ''; }
    });
  }
  Array.prototype.forEach.call(form.querySelectorAll('.mc-adhoc'), function (s) { s.addEventListener('change', function () { document.getElementById('mcAdhoc').disabled = false; sync(); }); });
  sync();
  form.addEventListener('submit', function () {
    Array.prototype.forEach.call(form.querySelectorAll('input[data-gen]'), function (x) { x.remove(); });
    Array.prototype.forEach.call(box.querySelectorAll('.mc-frow'), function (row) {
      var g = row._get(); if (!g.v && g.o !== 'empty' && g.o !== 'notempty') { return; }
      [['op', g.o], ['v', g.v], ['v2', g.v2]].forEach(function (p) { if (p[1] === '' && p[0] !== 'op') { return; } var h = document.createElement('input'); h.type = 'hidden'; h.name = 's[' + g.f + '][' + p[0] + ']'; h.value = p[1]; h.setAttribute('data-gen', '1'); form.appendChild(h); });
    });
    // totals with no function are not sent
    Array.prototype.forEach.call(form.querySelectorAll('.mc-fn'), function (fn) { if (!fn.value) { fn.closest('.row').querySelector('.mc-af').disabled = true; fn.disabled = true; } });
  });
  // the searched text is highlighted in the report
  var term = <?= json_encode($q, JSON_UNESCAPED_UNICODE) ?>;
  if (term.length > 1) {
    var scope = document.querySelector('.mc-report');
    if (scope) {
      var re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT), nodes = [], n;
      while ((n = w.nextNode())) { if (re.test(n.nodeValue)) { nodes.push(n); } re.lastIndex = 0; }
      nodes.forEach(function (node) {
        var span = document.createElement('span'); span.innerHTML = node.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(re, function (m) { return '<mark>' + m + '</mark>'; });
        node.parentNode.replaceChild(span, node);
      });
    }
  }
})();
</script>
