<?php /** @var \MiB\App $app @var \MiB\Table $t */ ?>
<h1 class="h4 mb-3"><?= h($t->caption()) ?> <small class="text-secondary fw-normal">— <?= h(t('page.import')) ?></small></h1>
<?php if ($result): ?>
<div class="alert alert-<?= $result['errors'] ? 'warning' : 'success' ?>">
  <?= h(t('import.result', $result['added'], $result['updated'], $result['skipped'])) ?> · <?= h(t('import.mapped', $result['mapped'], $result['columns'])) ?>
  <?php if (!empty($result['rolledBack'])): ?><div class="fw-semibold"><?= h(t('import.rolledback')) ?></div><?php endif ?>
  <?php if ($result['errors']): ?><ul class="small mb-0 mt-2"><?php foreach (array_slice($result['errors'], 0, 50) as $e): ?><li><?= h($e) ?></li><?php endforeach ?></ul><?php endif ?>
</div>
<?php endif ?>
<form method="post" enctype="multipart/form-data" class="card"><div class="card-body">
<?= $app->csrfField() ?>
<p class="text-secondary"><?= h(t('import.help')) ?></p>
<p class="small"><?php foreach ($fields as $f): ?><code class="me-2"><?= h($f['name']) ?></code><?php endforeach ?></p>
<input type="file" name="file" class="form-control mb-3" accept=".csv,.txt,.xlsx" required>
<div class="form-check"><input class="form-check-input" type="checkbox" name="update" value="1" id="imu"><label class="form-check-label" for="imu"><?= h(t('import.update')) ?></label></div>
<div class="form-check"><input class="form-check-input" type="checkbox" name="atomic" value="1" id="ima" checked><label class="form-check-label" for="ima"><?= h(t('import.atomic')) ?></label></div>
</div><div class="card-footer d-flex gap-2"><button class="btn btn-primary"><i class="bi bi-upload"></i> <?= h(t('btn.import')) ?></button>
<a class="btn btn-link" href="<?= h($app->url('list', ['t' => $t->name])) ?>"><?= h(t('btn.back')) ?></a></div></form>
