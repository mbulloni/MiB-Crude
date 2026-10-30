<?php /** @var \MiB\App $app */ $theme = $app->config['theme']; ?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="<?= h($theme['mode'] === 'dark' ? 'dark' : 'light') ?>" data-mode="<?= h($theme['mode']) ?>">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($app->title) ?> · <?= h($app->label($app->config['title'])) ?></title>
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap-icons.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('app.css')) ?>">
<style>:root{--mc-primary:<?= h($theme['primary']) ?>;}</style></head>
<body class="mc-bare">
<div class="mc-auth-card card shadow-sm">
  <div class="card-body p-4">
    <h1 class="h4 mb-1 text-center"><?php if (is_file($app->root . '/assets/logo.png')): ?><img src="assets/logo.png" alt="" height="40" class="d-block mx-auto mb-2"><?php endif ?><?= h($app->label($app->config['title'])) ?></h1>
    <p class="text-secondary text-center mb-4"><?= h($app->title) ?></p>
    <?php foreach ($app->takeFlash() as $fl): ?><div class="alert alert-<?= h($fl[0]) ?>"><?= h($fl[1]) ?></div><?php endforeach ?>
    <?= $content ?>
    <?php if (count($app->config['languages']) > 1): ?><div class="text-center mt-3 small"><?php foreach ($app->config['languages'] as $l): ?><a class="mx-1" href="?<?= h(http_build_query(array_merge($_GET, ['lang' => $l]))) ?>"><?= h(strtoupper($l)) ?></a><?php endforeach ?></div><?php endif ?>
  </div>
</div>
<script src="<?= h($app->asset('app.js')) ?>"></script>
</body></html>
