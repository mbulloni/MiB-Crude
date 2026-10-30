<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$sec = $app->security;
$qs = ['t' => $t->name];
if ($master) $qs = array_merge($qs, $master['qs']);
if ($keys) $qs['k'] = $keys;
if (!empty($_GET['popup'])) $qs['popup'] = 1;
$fields = $t->fields($mode);
$pageCfg = $t->page($mode);
$cols = isset($pageCfg['columns']) ? max(1, min(4, (int)$pageCfg['columns'])) : 1;
$sections = \MiB\Layout::sections($t, $mode, $fields);
$hasFiles = false;
foreach ($fields as $f) if (in_array($f['editAs']['type'], ['file', 'image'], true)) $hasFiles = true;
$cancel = $master ? $app->url('view', ['t' => $master['table']->name, 'k' => $master['keys']]) : $app->url('list', ['t' => $t->name]);
?>
<div class="d-flex align-items-center gap-2 mb-3 mc-pagehead">
  <h1 class="h4 m-0"><?= h($t->caption()) ?> <small class="text-secondary fw-normal">— <?= h(t($mode === 'add' ? 'page.add' : 'page.edit')) ?></small></h1>
</div>
<?php if ($lockedBy !== ''): ?><div class="alert alert-warning"><i class="bi bi-lock"></i> <?= h(t('lock.locked', $lockedBy)) ?></div><?php endif ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<?php if ($errors): ?><div class="alert alert-danger"><ul class="mb-0"><?php foreach ($errors as $e): ?><li><?= h($e) ?></li><?php endforeach ?></ul></div><?php endif ?>
<form method="post" action="<?= h($app->url($mode, $qs)) ?>"<?= $hasFiles ? ' enctype="multipart/form-data"' : '' ?> class="mc-form" novalidate>
<?= $app->csrfField() ?>
<?php foreach ($sections as $si => $sec_): ?>
<div class="card mb-3">
  <?php if ($sec_['title'] !== ''): ?><div class="card-header fw-semibold"><?= h($sec_['title']) ?></div><?php endif ?>
  <div class="card-body"><div class="row g-3">
  <?php foreach ($sec_['fields'] as $f):
      $n = $f['name'];
      $span = isset($f['layout'][$mode]['span']) ? (int)$f['layout'][$mode]['span'] : (in_array($f['editAs']['type'], ['textarea', 'richtext'], true) ? 12 : (int)(12 / $cols));
      if ($f['editAs']['type'] === 'hidden') { echo \MiB\Controls::render($t, $f, isset($row[$n]) ? $row[$n] : null, $mode, ['row' => $row]); continue; }
      $hint = isset($f['hint']) ? $app->label($f['hint']) : '';
  ?>
    <div class="col-md-<?= $span ?>">
      <label class="form-label" for="f_<?= h(preg_replace('/\W/', '_', $n)) ?>"><?= h($t->fieldLabel($f)) ?><?php if (!empty($f['validation']['required'])): ?> <span class="text-danger">*</span><?php endif ?></label>
      <?= \MiB\Controls::render($t, $f, isset($row[$n]) ? $row[$n] : null, $mode, ['row' => $row, 'error' => isset($errors[$n])]) ?>
      <?php if (isset($errors[$n])): ?><div class="invalid-feedback d-block"><?= h($errors[$n]) ?></div><?php endif ?>
      <?php if ($hint !== ''): ?><div class="form-text"><?= h($hint) ?></div><?php endif ?>
    </div>
  <?php endforeach ?>
  </div></div>
</div>
<?php endforeach ?>
<div class="d-flex flex-wrap gap-2 mc-form-buttons">
  <?php if ($lockedBy === ''): ?>
  <button class="btn btn-primary" name="_next" value="list"><i class="bi bi-check-lg"></i> <?= h(t('btn.save')) ?></button>
  <?php if (empty($_GET['popup'])): ?>
    <?php if ($t->enabled('add') && $mode === 'add'): ?><button class="btn btn-outline-primary" name="_next" value="new"><?= h(t('btn.save_new')) ?></button><?php endif ?>
    <?php if ($t->enabled('view')): ?><button class="btn btn-outline-primary" name="_next" value="view"><?= h(t('btn.save_view')) ?></button><?php endif ?>
  <?php endif ?>
  <?php endif ?>
  <a class="btn btn-link" href="<?= h($cancel) ?>"<?= !empty($_GET['popup']) ? ' onclick="parent.MCModal&&parent.MCModal.close();return false"' : '' ?>><?= h(t('btn.cancel')) ?></a>
</div>
</form>
<?php if ($mode === 'edit' && $keys && empty($_GET['popup'])):
    foreach ($t->details() as $d):
        if (!in_array('edit', isset($d['showIn']) ? $d['showIn'] : [], true) || !$sec->can($d['table'], 'S')) continue; ?>
  <div class="mt-4" id="detail-<?= h($d['table']) ?>">
    <div class="d-flex align-items-center mb-2"><h2 class="h5 m-0"><?= h($app->table($d['table'])->caption()) ?></h2>
      <a class="btn btn-sm btn-outline-secondary ms-auto" href="<?= h($app->url('list', ['t' => $d['table'], 'mt' => $t->name, 'mk' => $keys])) ?>"><i class="bi bi-box-arrow-up-right"></i> <?= h(t('btn.open')) ?></a></div>
    <iframe class="mc-embed" src="<?= h($app->url('list', ['t' => $d['table'], 'mt' => $t->name, 'mk' => $keys, 'embed' => 1])) ?>"></iframe>
  </div>
<?php endforeach; endif ?>
