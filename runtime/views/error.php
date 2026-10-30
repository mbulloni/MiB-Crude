<?php /** @var \MiB\App $app */ ?>
<div class="text-center py-5">
  <div class="display-4 text-secondary mb-3"><?= (int)$code ?></div>
  <p class="lead" style="white-space:pre-wrap"><?= h($message) ?></p>
  <a class="btn btn-primary" href="<?= h($app->url('home', ['menu' => 1])) ?>"><?= h(t('menu.home')) ?></a>
</div>
