<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$sec = $app->security;
$base = ['t' => $t->name];
if ($master) $base = array_merge($base, $master['qs']);
$keep = array_merge($base, array_filter(['q' => $req['q'], 's' => $req['s'], 'f' => $req['f']]));
$listUrl = function (array $extra) use ($app, $keep, $sort, $dir, $ps) {
    return $app->url('list', array_merge($keep, array_filter(['o' => $sort, 'd' => $sort ? $dir : null, 'ps' => isset($_GET['ps']) ? $_GET['ps'] : null]), $extra));
};
$pages = $ps > 0 ? max(1, (int)ceil($total / $ps)) : 1;
$canDel = $t->enabled('delete') && $sec->can($t->name, 'D');
$actions = isset($t->def['pages']['list']['rowActions']) ? $t->def['pages']['list']['rowActions'] : ['view', 'edit', 'delete'];
$details = [];
foreach ($t->details() as $d) if (in_array('list', isset($d['showIn']) ? $d['showIn'] : [], true) && $sec->can($d['table'], 'S')) $details[] = $d;
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
  <?php if ($t->enabled('add') && $sec->can($t->name, 'A')): ?>
    <a class="btn btn-primary btn-sm" href="<?= h($app->url('add', $base)) ?>"><i class="bi bi-plus-lg"></i> <?= h(t('btn.add')) ?></a>
  <?php endif ?>
  <?php if ($canDel): ?>
    <button class="btn btn-outline-danger btn-sm mc-delete-selected" form="mcListForm" disabled><i class="bi bi-trash"></i> <?= h(t('btn.delete_sel')) ?></button>
  <?php endif ?>
  <?php if ($t->enabled('export') && $sec->can($t->name, 'P')): ?>
    <div class="dropdown">
      <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-download"></i> <?= h(t('btn.export')) ?></button>
      <ul class="dropdown-menu"><?php foreach ($t->def['pages']['export']['formats'] as $fmt): ?>
        <li><a class="dropdown-item mc-export" href="<?= h($app->url('export', array_merge($keep, ['fmt' => $fmt, 'o' => $sort, 'd' => $dir]))) ?>"><?= h(strtoupper($fmt)) ?></a></li>
      <?php endforeach ?></ul>
    </div>
  <?php endif ?>
  <?php if ($t->enabled('print') && $sec->can($t->name, 'P')): ?>
    <a class="btn btn-outline-secondary btn-sm" target="_blank" href="<?= h($app->url('print', array_merge($keep, ['o' => $sort, 'd' => $dir]))) ?>"><i class="bi bi-printer"></i> <?= h(t('btn.print')) ?></a>
  <?php endif ?>
  <?php if ($t->enabled('import') && $sec->can($t->name, 'I')): ?>
    <a class="btn btn-outline-secondary btn-sm" href="<?= h($app->url('import', ['t' => $t->name])) ?>"><i class="bi bi-upload"></i> <?= h(t('btn.import')) ?></a>
  <?php endif ?>
  <form class="ms-auto d-flex gap-2" method="get" action="index.php">
    <input type="hidden" name="p" value="list"><input type="hidden" name="t" value="<?= h($t->name) ?>">
    <?php if ($master): ?><input type="hidden" name="mt" value="<?= h($master['table']->name) ?>"><?php foreach ($master['keys'] as $k => $v): ?><input type="hidden" name="mk[<?= h($k) ?>]" value="<?= h($v) ?>"><?php endforeach ?><?php endif ?>
    <?php if (!empty($t->def['pages']['list']['quickSearch'])): ?>
    <div class="input-group input-group-sm mc-quicksearch">
      <input type="search" class="form-control" name="q" value="<?= h($req['q']) ?>" placeholder="<?= h(t('list.search')) ?>">
      <button class="btn btn-outline-secondary"><i class="bi bi-search"></i></button>
    </div>
    <?php endif ?>
    <?php if ($t->enabled('search')): ?><a class="btn btn-sm btn-outline-secondary text-nowrap" href="<?= h($app->url('search', ['t' => $t->name, 's' => $req['s']])) ?>"><i class="bi bi-funnel"></i> <?= h(t('list.advanced')) ?></a><?php endif ?>
  </form>
</div>
<?php if ($req['s'] || $req['q'] !== '' || $req['f']): ?>
<div class="mb-2 small"><span class="badge text-bg-info"><i class="bi bi-funnel-fill"></i> <?= h(t('list.filtered')) ?></span>
  <a href="<?= h($app->url('list', $base)) ?>" class="ms-2"><?= h(t('list.clear')) ?></a></div>
<?php endif ?>
<?php endif ?>
<div class="row g-3">
<?php if ($filters && !$embedded): ?>
  <div class="col-lg-3 col-xl-2">
    <form method="get" action="index.php" class="card mc-filters">
      <input type="hidden" name="p" value="list"><input type="hidden" name="t" value="<?= h($t->name) ?>"><input type="hidden" name="q" value="<?= h($req['q']) ?>">
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
<div class="card mc-grid-card">
<div class="table-responsive">
<table class="table table-hover table-sm align-middle mb-0 mc-grid">
  <thead><tr>
    <?php if ($canDel && !$embedded): ?><th class="mc-col-check"><input type="checkbox" class="form-check-input mc-check-all"></th><?php endif ?>
    <th class="mc-col-actions"></th>
    <?php foreach ($fields as $f): $isSort = $sort === $f['name']; ?>
      <th class="<?= in_array($f['viewAs']['type'], ['number', 'currency', 'percent'], true) ? 'text-end' : '' ?>">
        <a class="mc-sort" href="<?= h($listUrl(['o' => $f['name'], 'd' => $isSort && $dir === 'asc' ? 'desc' : 'asc', 'pg' => 1])) ?>"><?= h($t->fieldLabel($f)) ?><?php if ($isSort): ?> <i class="bi bi-caret-<?= $dir === 'asc' ? 'up' : 'down' ?>-fill"></i><?php endif ?></a>
      </th>
    <?php endforeach ?>
  </tr></thead>
  <tbody>
  <?php if (!$rows): ?><tr><td colspan="<?= count($fields) + 2 ?>" class="text-center text-secondary py-4"><?= h(t('list.empty')) ?></td></tr><?php endif ?>
  <?php foreach ($rows as $row): $keys = $t->keysFromRow($row); $kq = array_merge($base, ['k' => $keys]); ?>
    <tr>
      <?php if ($canDel && !$embedded): ?><td class="mc-col-check"><input type="checkbox" class="form-check-input mc-check" name="sel[]" value="<?= h(json_encode($keys)) ?>"></td><?php endif ?>
      <td class="mc-col-actions text-nowrap">
        <?php if ($t->def['keys']): ?>
        <?php if (in_array('view', $actions, true) && $t->enabled('view') && $sec->can($t->name, 'V')): ?><a class="btn btn-sm btn-link px-1" title="<?= h(t('btn.view')) ?>" href="<?= h($app->url('view', $kq)) ?>"<?= $embedded ? ' target="_top"' : '' ?>><i class="bi bi-eye"></i></a><?php endif ?>
        <?php if (in_array('edit', $actions, true) && $t->enabled('edit') && $sec->can($t->name, 'E')): ?><a class="btn btn-sm btn-link px-1" title="<?= h(t('btn.edit')) ?>" href="<?= h($app->url('edit', $kq)) ?>"<?= $embedded ? ' target="_top"' : '' ?>><i class="bi bi-pencil"></i></a><?php endif ?>
        <?php if (in_array('copy', $actions, true) && $t->enabled('add') && $sec->can($t->name, 'A')): ?><a class="btn btn-sm btn-link px-1" title="<?= h(t('btn.copy')) ?>" href="<?= h($app->url('add', array_merge($kq, ['copy' => 1]))) ?>"><i class="bi bi-copy"></i></a><?php endif ?>
        <?php if (in_array('delete', $actions, true) && $canDel && !$embedded): ?><button class="btn btn-sm btn-link px-1 text-danger mc-delete-one" title="<?= h(t('btn.delete')) ?>" type="button" data-keys="<?= h(json_encode($keys)) ?>"><i class="bi bi-trash"></i></button><?php endif ?>
        <?php foreach ($details as $d): $dq = ['t' => $d['table'], 'mt' => $t->name, 'mk' => $keys]; ?>
          <a class="btn btn-sm btn-link px-1" title="<?= h($app->table($d['table'])->caption()) ?>" href="<?= h($app->url('list', $dq)) ?>"<?= $embedded ? ' target="_top"' : '' ?>><i class="bi bi-diagram-3"></i></a>
        <?php endforeach ?>
        <?php endif ?>
      </td>
      <?php foreach ($fields as $f): ?>
        <td class="<?= in_array($f['viewAs']['type'], ['number', 'currency', 'percent'], true) ? 'text-end' : '' ?>"><?= \MiB\Format::html($t, $f, $row, 'list') ?></td>
      <?php endforeach ?>
    </tr>
  <?php endforeach ?>
  </tbody>
  <?php if ($totals): ?>
  <tfoot><tr class="mc-totals"><?php if ($canDel && !$embedded): ?><td></td><?php endif ?><td class="small text-secondary"><?= h(t('list.totals')) ?></td>
    <?php foreach ($fields as $f): ?><td class="text-end fw-semibold"><?php if (isset($totals[$f['name']])): ?><span class="small text-secondary"><?= h(t('agg.' . $f['totals'])) ?></span> <?= h($f['totals'] === 'count' ? $totals[$f['name']] : \MiB\Format::plain($t, $f, $totals[$f['name']])) ?><?php endif ?></td><?php endforeach ?>
  </tr></tfoot>
  <?php endif ?>
</table>
</div>
</div>
</form>
<?php if (!$embedded): ?>
<div class="d-flex flex-wrap align-items-center gap-2 mt-2 small mc-pager">
  <span class="text-secondary"><?= h(t('list.records', $total)) ?></span>
  <?php if ($pages > 1): ?>
  <nav class="ms-auto"><ul class="pagination pagination-sm m-0">
    <li class="page-item<?= $pg <= 1 ? ' disabled' : '' ?>"><a class="page-link" href="<?= h($listUrl(['pg' => $pg - 1])) ?>">&laquo;</a></li>
    <?php for ($i = max(1, $pg - 3); $i <= min($pages, $pg + 3); $i++): ?>
      <li class="page-item<?= $i === $pg ? ' active' : '' ?>"><a class="page-link" href="<?= h($listUrl(['pg' => $i])) ?>"><?= $i ?></a></li>
    <?php endfor ?>
    <li class="page-item<?= $pg >= $pages ? ' disabled' : '' ?>"><a class="page-link" href="<?= h($listUrl(['pg' => $pg + 1])) ?>">&raquo;</a></li>
  </ul></nav>
  <?php endif ?>
  <select class="form-select form-select-sm w-auto <?= $pages > 1 ? '' : 'ms-auto' ?> mc-pagesize" data-url="<?= h($listUrl(['pg' => 1, 'ps' => '__PS__'])) ?>">
    <?php foreach ([10, 20, 50, 100, 500] as $n): ?><option value="<?= $n ?>"<?= $ps === $n ? ' selected' : '' ?>><?= h(t('list.perpage', $n)) ?></option><?php endforeach ?>
    <option value="all"<?= $ps === 0 ? ' selected' : '' ?>><?= h(t('list.all')) ?></option>
  </select>
</div>
<?php else: ?>
<div class="small text-secondary mt-1"><?= h(t('list.records', $total)) ?></div>
<?php endif ?>
  </div>
</div>
