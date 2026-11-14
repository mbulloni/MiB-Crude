<?php /** Filters, views and the record table of the list page (scope of views/list.php). */ ?>
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
<?php if ($views && !$embedded): ?>
<ul class="nav nav-tabs mb-2 mc-viewtabs">
  <li class="nav-item"><a class="nav-link<?= $curView === 'table' ? ' active' : '' ?>" href="<?= h($app->url('list', array_merge($keep, ['v' => 'table']))) ?>"><i class="bi bi-table"></i> <?= h(t('view.table')) ?></a></li>
  <?php foreach ($views as $v): ?><li class="nav-item"><a class="nav-link<?= $curView === $v['type'] ? ' active' : '' ?>" href="<?= h($app->url('list', array_merge($keep, ['v' => $v['type']]))) ?>"><i class="bi bi-<?= h(['calendar' => 'calendar3', 'gallery' => 'grid-3x3-gap', 'kanban' => 'kanban', 'map' => 'geo-alt'][$v['type']] ?? 'eye') ?>"></i> <?= h(t('view.' . $v['type'])) ?></a></li><?php endforeach ?>
</ul>
<?php endif ?>
<?php $inlineAdd = !$embedded && $curView === 'table' ? \MiB\Grid::inlineAddFields($t) : []; if ($inlineAdd): ?>
<form method="post" action="<?= h($app->url('inlineadd', array_merge(['t' => $t->name], $master ? $master['qs'] : []))) ?>" class="card mb-2 mc-inline-add d-none" novalidate>
  <?= $app->csrfField() ?><div class="card-body p-2"><div class="row g-2 align-items-end">
  <?php foreach ($inlineAdd as $f): $def = $t->defaultFor($f); ?>
    <div class="col-sm-6 col-md mc-ia-field" data-field="<?= h($f['name']) ?>"><label class="form-label small mb-1"><?= h($t->fieldLabel($f)) ?><?= !empty($f['validation']['required']) ? ' <span class="text-danger">*</span>' : '' ?></label>
      <?= \MiB\Controls::render($t, $f, $def, 'add', ['name' => $f['name']]) ?><div class="invalid-feedback"></div></div>
  <?php endforeach ?>
    <div class="col-auto d-flex gap-1"><button class="btn btn-primary btn-sm"><i class="bi bi-check-lg"></i> <?= h(t('btn.save')) ?></button><button type="button" class="btn btn-outline-secondary btn-sm mc-ia-cancel"><?= h(t('btn.cancel')) ?></button></div>
  </div><div class="small text-danger mt-1 mc-ia-error"></div></div>
</form>
<?php endif ?>
<?php if ($curView !== 'table'): ?>
<?php if ($curView === 'map' && !empty($viewDef['addressField']) && \MiB\Geocode::views($t) && $t->writeTable() && $sec->can($t->name, 'E')): ?>
<form method="post" action="<?= h($app->url('geocode', ['t' => $t->name])) ?>" class="mb-2 d-flex align-items-center gap-2 small mc-geocode"><?= $app->csrfField() ?><input type="hidden" name="_back" value="<?= h($curUrl) ?>">
  <button class="btn btn-sm btn-outline-secondary"><i class="bi bi-geo"></i> <?= h(t('geo.fill')) ?></button><span class="text-secondary"><?= h(t('geo.fill_help')) ?></span></form>
<?php endif ?>
<div class="card"><div class="card-body"><div id="mcView" class="mc-view-<?= h($curView) ?>" data-view="<?= h($curView) ?>" data-feed="<?= h($app->url('feed', $keep)) ?>"
  data-inline="<?= h($app->url('inline', ['t' => $t->name])) ?>" data-cfg="<?= h(json_encode($viewDef, JSON_UNESCAPED_UNICODE)) ?>"></div></div></div>
<?php else: ?>
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
<?php endif ?>
  </div>
</div>
