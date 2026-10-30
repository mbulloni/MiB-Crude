<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$sec = $app->security;
$qs = ['t' => $t->name, 'k' => $keys];
if ($master) $qs = array_merge($qs, $master['qs']);
$fields = $t->fields('view');
$sections = \MiB\Layout::sections($t, 'view', $fields);
?>
<div class="d-flex flex-wrap align-items-center gap-2 mb-3 mc-pagehead">
  <h1 class="h4 m-0 me-2"><?= h($t->caption()) ?></h1>
  <?php if ($t->enabled('edit') && $sec->can($t->name, 'E')): ?><a class="btn btn-primary btn-sm" href="<?= h($app->url('edit', $qs)) ?>"><i class="bi bi-pencil"></i> <?= h(t('btn.edit')) ?></a><?php endif ?>
  <?php if ($t->enabled('add') && $sec->can($t->name, 'A') && in_array('copy', isset($t->def['pages']['list']['rowActions']) ? $t->def['pages']['list']['rowActions'] : [], true)): ?><a class="btn btn-outline-secondary btn-sm" href="<?= h($app->url('add', array_merge($qs, ['copy' => 1]))) ?>"><i class="bi bi-copy"></i> <?= h(t('btn.copy')) ?></a><?php endif ?>
  <?php if ($t->enabled('delete') && $sec->can($t->name, 'D')): ?>
    <form method="post" action="<?= h($app->url('delete', ['t' => $t->name])) ?>" class="d-inline mc-confirm-delete"><?= $app->csrfField() ?>
      <?php foreach ($keys as $k => $v): ?><input type="hidden" name="k[<?= h($k) ?>]" value="<?= h($v) ?>"><?php endforeach ?>
      <button class="btn btn-outline-danger btn-sm"><i class="bi bi-trash"></i> <?= h(t('btn.delete')) ?></button></form>
  <?php endif ?>
  <?= \MiB\Buttons::html($t, 'view', false, $keys) ?>
  <button class="btn btn-outline-secondary btn-sm" onclick="window.print()"><i class="bi bi-printer"></i></button>
  <a class="btn btn-link btn-sm ms-auto" href="<?= h($master ? $app->url('list', array_merge(['t' => $t->name], $master['qs'])) : $app->url('list', ['t' => $t->name])) ?>"><i class="bi bi-arrow-left"></i> <?= h(t('btn.back')) ?></a>
</div>
<?php foreach ($sections as $s): ?>
<div class="card mb-3">
  <?php if ($s['title'] !== ''): ?><div class="card-header fw-semibold"><?= h($s['title']) ?></div><?php endif ?>
  <?php foreach ($s['blocks'] as $blk): ?><div class="card-body pb-0"><?= \MiB\Layout::block($t, $blk, 'view') ?></div><?php endforeach ?>
  <div class="card-body mc-scroll-x"><dl class="row mb-0 mc-view">
    <?php foreach ($s['fields'] as $f): ?>
      <dt class="col-sm-4 col-lg-3 text-secondary fw-normal"><?= h($t->fieldLabel($f)) ?></dt>
      <dd class="col-sm-8 col-lg-9"><?= \MiB\Format::html($t, $f, $row, 'view') ?></dd>
    <?php endforeach ?>
  </dl></div>
</div>
<?php endforeach ?>
<?php if ($details): ?>
<ul class="nav nav-tabs mt-4" role="tablist">
  <?php foreach ($details as $i => $d): ?><li class="nav-item"><button class="nav-link<?= $i === 0 ? ' active' : '' ?>" data-bs-toggle="tab" data-bs-target="#detail-<?= h($d['table']) ?>" type="button"><?= h($app->table($d['table'])->caption()) ?></button></li><?php endforeach ?>
</ul>
<div class="tab-content border border-top-0 rounded-bottom p-2 mc-details">
  <?php foreach ($details as $i => $d): $dt = $app->table($d['table']); ?>
  <div class="tab-pane fade<?= $i === 0 ? ' show active' : '' ?>" id="detail-<?= h($d['table']) ?>">
    <div class="d-flex gap-2 mb-2">
      <?php if ($dt->enabled('add') && $sec->can($dt->name, 'A')): ?><a class="btn btn-sm btn-primary" href="<?= h($app->url('add', ['t' => $dt->name, 'mt' => $t->name, 'mk' => $keys])) ?>"><i class="bi bi-plus-lg"></i> <?= h(t('btn.add')) ?></a><?php endif ?>
      <a class="btn btn-sm btn-outline-secondary" href="<?= h($app->url('list', ['t' => $dt->name, 'mt' => $t->name, 'mk' => $keys])) ?>"><i class="bi bi-box-arrow-up-right"></i> <?= h(t('btn.open')) ?></a>
    </div>
    <iframe class="mc-embed" src="<?= h($app->url('list', ['t' => $dt->name, 'mt' => $t->name, 'mk' => $keys, 'embed' => 1])) ?>"></iframe>
  </div>
  <?php endforeach ?>
</div>
<?php endif ?>
