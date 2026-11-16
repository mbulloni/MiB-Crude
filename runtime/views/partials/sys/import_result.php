<?php /** Table page block. Scope: the variables of the view. @var \MiB\App $app @var \MiB\Table $t */ ?>
<?php if ($result): ?>
<div class="alert alert-<?= $result['errors'] ? 'warning' : 'success' ?>">
  <?= h(t('import.result', $result['added'], $result['updated'], $result['skipped'])) ?> · <?= h(t('import.mapped', $result['mapped'], $result['columns'])) ?>
  <?php if (!empty($result['rolledBack'])): ?><div class="fw-semibold"><?= h(t('import.rolledback')) ?></div><?php endif ?>
  <?php if ($result['errors']): ?><ul class="small mb-0 mt-2"><?php foreach (array_slice($result['errors'], 0, 50) as $e): ?><li><?= h($e) ?></li><?php endforeach ?></ul><?php endif ?>
</div>
<?php endif ?>