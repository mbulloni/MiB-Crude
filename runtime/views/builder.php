<?php /** @var \MiB\App $app */
$fnOpts = ['sum' => t('agg.sum'), 'avg' => t('agg.avg'), 'count' => t('agg.count'), 'min' => t('agg.min'), 'max' => t('agg.max')];
$intervals = ['' => t('builder.value'), 'year' => t('builder.year'), 'quarter' => t('builder.quarter'), 'month' => t('builder.month'), 'day' => t('builder.day')];
$sel = function ($name, $opts, $cur, $empty = true) { $h = '<select class="form-select form-select-sm" name="' . h($name) . '">' . ($empty ? '<option value=""></option>' : ''); foreach ($opts as $k => $v) $h .= '<option value="' . h($k) . '"' . ((string)$k === (string)$cur ? ' selected' : '') . '>' . h($v) . '</option>'; return $h . '</select>'; };
?>
<div class="d-flex align-items-center gap-2 mb-3"><h1 class="h4 m-0"><i class="bi bi-magic"></i> <?= h(t('builder.title')) ?></h1>
  <a class="btn btn-primary btn-sm ms-3" href="<?= h($app->url('builder', ['id' => 'new', 'kind' => 'report'])) ?>"><i class="bi bi-file-earmark-bar-graph"></i> <?= h(t('builder.new_report')) ?></a>
  <a class="btn btn-outline-primary btn-sm" href="<?= h($app->url('builder', ['id' => 'new', 'kind' => 'chart'])) ?>"><i class="bi bi-bar-chart"></i> <?= h(t('builder.new_chart')) ?></a></div>
<?php if ($edit): $d = $edit['def']; $k = $edit['kind']; ?>
<form method="post" class="card mb-3"><div class="card-body"><?= $app->csrfField() ?>
  <input type="hidden" name="id" value="<?= (int)$edit['id'] ?>"><input type="hidden" name="kind" value="<?= h($k) ?>">
  <div class="row g-2 mb-3">
    <div class="col-md-5"><label class="form-label"><?= h(t('builder.name')) ?></label><input class="form-control" name="title" value="<?= h($edit['title']) ?>"></div>
    <div class="col-md-5"><label class="form-label"><?= h(t('builder.table')) ?></label><select class="form-select" name="table" onchange="location.href='<?= h($app->url('builder', ['id' => $edit['id'] ?: 'new', 'kind' => $k])) ?>&t='+encodeURIComponent(this.value)"><?php foreach ($tables as $tn => $tl): ?><option value="<?= h($tn) ?>"<?= $tn === $edit['table_name'] ? ' selected' : '' ?>><?= h($tl) ?></option><?php endforeach ?></select></div>
    <div class="col-md-2 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" name="shared" value="1" id="bsh"<?= $edit['shared'] ? ' checked' : '' ?>><label class="form-check-label" for="bsh"><?= h(t('builder.shared')) ?></label></div></div>
  </div>
  <?php if ($k === 'report'): ?>
  <h6><?= h(t('builder.groups')) ?></h6>
  <?php for ($i = 0; $i < 3; $i++): $g = $d['groups'][$i] ?? []; ?><div class="row g-2 mb-1"><div class="col-md-5"><?= $sel("g[$i][field]", $fields, $g['field'] ?? '') ?></div><div class="col-md-3"><?= $sel("g[$i][interval]", $intervals, $g['interval'] ?? '', false) ?></div></div><?php endfor ?>
  <h6 class="mt-3"><?= h(t('builder.totals')) ?></h6>
  <?php for ($i = 0; $i < 3; $i++): $a = $d['aggregates'][$i] ?? []; ?><div class="row g-2 mb-1"><div class="col-md-3"><?= $sel("a[$i][fn]", $fnOpts, $a['fn'] ?? '') ?></div><div class="col-md-5"><?= $sel("a[$i][field]", $fields, $a['field'] ?? '') ?></div></div><?php endfor ?>
  <h6 class="mt-3"><?= h(t('builder.columns')) ?></h6>
  <div class="d-flex flex-wrap gap-3"><?php foreach ($fields as $fn => $fl): ?><div class="form-check"><input class="form-check-input" type="checkbox" name="columns[]" value="<?= h($fn) ?>" id="bc<?= h(md5($fn)) ?>"<?= in_array($fn, $d['columns'] ?? [], true) ? ' checked' : '' ?>><label class="form-check-label" for="bc<?= h(md5($fn)) ?>"><?= h($fl) ?></label></div><?php endforeach ?></div>
  <div class="form-check mt-2"><input class="form-check-input" type="checkbox" name="showDetails" value="1" id="bsd"<?= !empty($d['showDetails']) || !$edit['id'] ? ' checked' : '' ?>><label class="form-check-label" for="bsd"><?= h(t('builder.details')) ?></label></div>
  <?php else: ?>
  <div class="row g-2 mb-2">
    <div class="col-md-3"><label class="form-label"><?= h(t('builder.type')) ?></label><?= $sel('type', ['bar' => 'Colonne / Columns', 'hbar' => 'Barre / Bars', 'line' => 'Linee / Lines', 'area' => 'Area', 'pie' => 'Torta / Pie', 'doughnut' => 'Ciambella / Doughnut', 'funnel' => 'Funnel', 'treemap' => 'Treemap', 'radar' => 'Radar', 'gauge' => 'Gauge'], $d['type'] ?? 'bar', false) ?></div>
    <div class="col-md-4"><label class="form-label"><?= h(t('builder.categories')) ?></label><?= $sel('labelField', $fields, $d['labelField'] ?? '') ?></div>
    <div class="col-md-3"><label class="form-label">&nbsp;</label><?= $sel('labelInterval', $intervals, $d['labelInterval'] ?? '', false) ?></div>
  </div>
  <h6><?= h(t('builder.series')) ?></h6>
  <?php for ($i = 0; $i < 3; $i++): $sv = $d['series'][$i] ?? []; ?><div class="row g-2 mb-1"><div class="col-md-3"><?= $sel("s[$i][fn]", $fnOpts, $sv['fn'] ?? '') ?></div><div class="col-md-5"><?= $sel("s[$i][field]", $fields, $sv['field'] ?? '') ?></div></div><?php endfor ?>
  <?php endif ?>
</div><div class="card-footer d-flex gap-2"><button class="btn btn-primary"><i class="bi bi-check-lg"></i> <?= h(t('builder.save_show')) ?></button>
  <a class="btn btn-link" href="<?= h($app->url('builder')) ?>"><?= h(t('btn.cancel')) ?></a>
  <?php if ($edit['id']): ?><button class="btn btn-outline-danger ms-auto" name="delete" value="1" onclick="return confirm('<?= h(t('confirm.delete')) ?>')"><i class="bi bi-trash"></i></button><?php endif ?></div></form>
<?php endif ?>
<div class="row g-3"><?php foreach ($items as $r): ?>
  <div class="col-sm-6 col-lg-4 col-xl-3"><div class="card h-100"><div class="card-body">
    <div class="d-flex"><i class="bi bi-<?= $r['kind'] === 'chart' ? 'bar-chart' : 'file-earmark-bar-graph' ?> fs-3 me-2 mc-accent"></i><div>
      <a class="fw-semibold" href="<?= h($app->url($r['kind'], [$r['kind'] === 'chart' ? 'c' : 'r' => 'u:' . $r['id']])) ?>"><?= h($r['title']) ?></a>
      <div class="small text-secondary"><?= h($app->table($r['table_name'])->caption()) ?> · <?= h($r['owner']) ?><?= $r['shared'] ? ' · ' . h(t('builder.shared')) : '' ?></div></div></div>
    <?php if ($r['owner'] === $me): ?><a class="btn btn-sm btn-link px-0 mt-2" href="<?= h($app->url('builder', ['id' => $r['id']])) ?>"><i class="bi bi-pencil"></i> <?= h(t('btn.edit')) ?></a><?php endif ?>
  </div></div></div>
<?php endforeach ?>
<?php if (!$items && !$edit): ?><p class="text-secondary"><?= h(t('builder.empty')) ?></p><?php endif ?></div>
