<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$sec = $app->security;
$base = ['t' => $t->name];
if ($master) $base = array_merge($base, $master['qs']);
$keep = array_merge($base, array_filter(['s' => $req['s'], 'f' => $req['f']]));
$canDel = $t->enabled('delete') && $sec->can($t->name, 'D');
$canUpd = $t->canUpdateSelected() && !\MiB\Compat::hidden('updatesel');
$cols = \MiB\Grid::columns($t, $canDel || $canUpd, $embedded);
$page = $t->page('list');
$hasTotals = false;
foreach ($cols as $c) if (!empty($c['field']['totals'])) $hasTotals = true;
$order = [];
$ds = isset($page['defaultSort']) ? $page['defaultSort'] : null;
foreach ($cols as $i => $c) if ($ds && isset($c['field']) && $c['key'] === $ds['field']) $order = [[$i, isset($ds['dir']) && $ds['dir'] === 'desc' ? 'desc' : 'asc']];
$dtConfig = [
    'url' => $app->url('dt', array_merge($keep, $embedded ? ['embed' => 1] : [])),
    'columns' => array_map(function ($c) { return ['key' => isset($c['field']) ? $c['key'] : '', 'orderable' => $c['orderable'], 'className' => $c['className']]; }, $cols),
    'order' => $order,
    'pageLength' => $ps > 0 ? $ps : 20,
    'search' => $req['q'],
    'searching' => !empty($page['quickSearch']),
    'stateKey' => 'mc-dt-' . $t->name . ($master ? '-m' : '') . ($embedded ? '-e' : ''),
    'embedded' => (bool)$embedded,
    'totals' => $hasTotals && !empty($page['totals']),
];
$curUrl = $_SERVER['REQUEST_URI'];
$inline = \MiB\Grid::inlineFields($t);
foreach ($dtConfig['columns'] as $i => $c) $dtConfig['columns'][$i]['inline'] = in_array($c['key'], $inline, true);
$dtConfig['inlineUrl'] = $app->url('inline', ['t' => $t->name]);
// Alternative views: calendar, gallery, kanban, map (pages.list.views)
$views = array_values(array_filter(isset($page['views']) ? $page['views'] : [], function ($v) { return !empty($v['type']); }));
$curView = isset($_GET['v']) ? (string)$_GET['v'] : 'table';
$viewDef = null;
foreach ($views as $v) if ($v['type'] === $curView) $viewDef = $v;
if (!$viewDef) $curView = 'table';
if ($viewDef && in_array($curView, ['calendar', 'map'], true)) $needLibs = [$curView];
?>
<?php $lgrid = !$embedded ? \MiB\Layout::grid($t, 'list') : null;
if ($lgrid && \MiB\Layout::needsCharts($lgrid)) $needCharts = true;
if ($lgrid): $hasBody = false; ?>
<div class="mc-grid mc-formgrid mc-listgrid">
<?php foreach ($lgrid as $it): $ty = isset($it['type']) ? $it['type'] : ''; ?>
  <div class="mc-cell" data-block="<?= h(isset($it['id']) ? $it['id'] : '') ?>" style="<?= h(\MiB\Layout::cellStyle($it)) ?>">
  <?php if ($ty === 'toolbar'): include __DIR__ . '/partials/list_head.php';
  elseif ($ty === 'datalist'): $hasBody = true; include __DIR__ . '/partials/list_body.php';
  else: echo \MiB\Layout::gridBlock($t, $it, 'list'); endif ?>
  </div>
<?php endforeach ?>
</div>
<?php if (!$hasBody) include __DIR__ . '/partials/list_body.php'; ?>
<?= \MiB\Layout::gridAssets($t, 'list', $lgrid) ?>
<?php else: include __DIR__ . '/partials/list_head.php'; include __DIR__ . '/partials/list_body.php'; endif ?>
