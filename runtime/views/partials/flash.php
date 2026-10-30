<?php /** @var \MiB\App $app */ foreach ($app->takeFlash() as $fl): ?>
  <div class="alert alert-<?= h($fl[0]) ?> alert-dismissible fade show"><?= h($fl[1]) ?><button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>
<?php endforeach ?>
