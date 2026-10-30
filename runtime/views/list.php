<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$sec = $app->security;
$base = ['t' => $t->name];
if ($master) $base = array_merge($base, $master['qs']);
$keep = array_merge($base, array_filter(['s' => $req['s'], 'f' => $req['f']]));
$canDel = $t->enabled('delete') && $sec->can($t->name, 'D');
$cols = \MiB\Grid::columns($t, $canDel, $embedded);
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
?>
<?php if (!$embedded): ?>
<?php if ($master): $mt = $master['table']; $mrow = $master['row']; $mrows = [$mrow]; $mt->resolveLookups($mrows, $mt->fields('list')); $mrow = $mrows[0]; ?>
<div class="card mb-3 mc-master">
  <div class="card-header d-flex align-items-center">
    <span><i class="bi bi-diagram-2 me-2"></i><?= h($mt->caption()) ?></span>
    <a class="ms-auto btn btn-sm btn-outline-secondary" href="<?= h($app->url('list', ['t' => $mt->name])) ?>"><i class="bi bi-arrow-left"></i> <?= h(t('btn.back')) ?></a>
  </div>
  <div class="card-body py-2"><div class="row g-2 small">
    <?php foreach (array_slice($mt->fields('list'), 0, 8) as $mf): ?><div class="col-md-3"><span class="text-secondary"><?= h($mt->fieldLabel($mf)) ?>:</span> <?= \MiB\Format::html($mt, $mf, $mrow) ?></div><?php endforeach ?>
  </div></div>
</div>
<?php endif ?>
<div class="d-flex flex-wrap align-items-center gap-2 mb-3 mc-pagehead">
  <h1 class="h4 m-0 me-3"><?= h($t->caption()) ?></h1>
  <?php if (!\MiB\Compat::hidden('add') && $t->enabled('add') && $sec->can($t->name, 'A')): ?>
    <a class="btn btn-primary btn-sm<?= ($t->page('add')['mode'] ?? 'page') === 'popup' ? ' mc-popup-link' : '' ?>" href="<?= h($app->url('add', $base)) ?>"><i class="bi bi-plus-lg"></i> <?= h(t('btn.add')) ?></a>
  <?php endif ?>
  <?php if ($canDel && !\MiB\Compat::hidden('delete')): ?>
    <button class="btn btn-outline-danger btn-sm mc-delete-selected" form="mcListForm" disabled><i class="bi bi-trash"></i> <?= h(t('btn.delete_sel')) ?></button>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('export') && $t->enabled('export') && $sec->can($t->name, 'P')): ?>
    <div class="dropdown">
      <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-download"></i> <?= h(t('btn.export')) ?></button>
      <ul class="dropdown-menu"><?php foreach ($t->def['pages']['export']['formats'] as $fmt): ?>
        <li><a class="dropdown-item mc-export" href="<?= h($app->url('export', array_merge($keep, ['fmt' => $fmt]))) ?>"><?= h(strtoupper($fmt)) ?></a></li>
      <?php endforeach ?></ul>
    </div>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('print') && $t->enabled('print') && $sec->can($t->name, 'P')): ?>
    <a class="btn btn-outline-secondary btn-sm mc-export" target="_blank" href="<?= h($app->url('print', $keep)) ?>"><i class="bi bi-printer"></i> <?= h(t('btn.print')) ?></a>
  <?php endif ?>
  <?= \MiB\Buttons::html($t, 'list', false) ?>
  <?php if (!\MiB\Compat::hidden('import') && $t->enabled('import') && $sec->can($t->name, 'I')): ?>
    <a class="btn btn-outline-secondary btn-sm" href="<?= h($app->url('import', ['t' => $t->name])) ?>"><i class="bi bi-upload"></i> <?= h(t('btn.import')) ?></a>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('advsearch_link') && $t->enabled('search')): ?><a class="btn btn-sm btn-outline-secondary ms-auto" href="<?= h($app->url('search', ['t' => $t->name, 's' => $req['s']])) ?>"><i class="bi bi-funnel"></i> <?= h(t('list.advanced')) ?></a><?php endif ?>
</div>
<?php if ($req['s'] || $req['f']): ?>
<div class="mb-2 small"><span class="badge text-bg-info"><i class="bi bi-funnel-fill"></i> <?= h(t('list.filtered')) ?></span>
  <a href="<?= h($app->url('list', $base)) ?>" class="ms-2"><?= h(t('list.clear')) ?></a></div>
<?php endif ?>
<?php endif ?>
<div class="row g-3">
<?php if ($filters && !$embedded): ?>
  <div class="col-lg-3 col-xl-2">
    <form method="get" action="index.php" class="card mc-filters">
      <input type="hidden" name="p" value="list"><input type="hidden" name="t" value="<?= h($t->name) ?>">
      <?php if ($master): ?><input type="hidden" name="mt" value="<?= h($master['table']->name) ?>"><?php foreach ($master['keys'] as $k => $v): ?><input type="hidden" name="mk[<?= h($k) ?>]" value="<?= h($v) ?>"><?php endforeach ?><?php endif ?>
      <div class="card-header small fw-semibold"><i class="bi bi-sliders"></i> <?= h(t('list.filters')) ?></div>
      <div class="card-body small">
      <?php foreach ($filters as $flt): $fn = $flt['field']['name']; $sel = isset($req['f'][$fn]) ? (array)$req['f'][$fn] : []; ?>
        <div class="mb-3"><div class="fw-semibold mb-1"><?= h($t->fieldLabel($flt['field'])) ?></div>
        <?php foreach (array_slice($flt['values'], 0, 50) as $i => $fv): ?>
          <div class="form-check"><input class="form-check-input" type="checkbox" onchange="this.form.submit()" name="f[<?= h($fn) ?>][]" value="<?= h($fv['value']) ?>" id="flt<?= h(md5($fn . $i)) ?>"<?= in_array($fv['value'], $sel, true) ? ' checked' : '' ?>>
          <label class="form-check-label d-flex" for="flt<?= h(md5($fn . $i)) ?>"><span class="text-truncate"><?= h($fv['label']) ?></span><span class="ms-auto text-secondary"><?= (int)$fv['count'] ?></span></label></div>
        <?php endforeach ?></div>
      <?php endforeach ?>
      </div>
    </form>
  </div>
  <div class="col-lg-9 col-xl-10">
<?php else: ?>
  <div class="col-12">
<?php endif ?>
<form method="post" action="<?= h($app->url('delete', ['t' => $t->name])) ?>" id="mcListForm" class="mc-list-form">
<?= $app->csrfField() ?><input type="hidden" name="_back" value="<?= h($curUrl) ?>">
<div class="card mc-grid-card"><div class="card-body p-2">
<table class="table table-hover table-sm align-middle mb-0 mc-grid w-100" id="mcGrid" data-dt="<?= h(json_encode($dtConfig, JSON_UNESCAPED_UNICODE)) ?>">
  <thead><tr>
    <?php foreach ($cols as $c): ?>
      <?php if ($c['key'] === '_check'): ?><th class="mc-col-check"><input type="checkbox" class="form-check-input mc-check-all"></th>
      <?php elseif ($c['key'] === '_actions'): ?><th class="mc-col-actions"></th>
      <?php else: ?><th class="<?= h($c['className']) ?>"><?= h($t->fieldLabel($c['field'])) ?></th><?php endif ?>
    <?php endforeach ?>
  </tr></thead>
  <tbody></tbody>
  <?php if ($dtConfig['totals']): ?>
  <tfoot><tr class="mc-totals"><?php foreach ($cols as $c): ?><td class="<?= h($c['className']) ?> fw-semibold" data-total="<?= h(isset($c['field']) ? $c['key'] : '') ?>"></td><?php endforeach ?></tr></tfoot>
  <?php endif ?>
</table>
</div></div>
</form>
  </div>
</div>
