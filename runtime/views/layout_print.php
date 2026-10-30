<?php /** @var \MiB\App $app */ ?><!doctype html>
<html lang="<?= h($app->lang) ?>"><head><meta charset="utf-8"><title><?= h($app->title) ?></title>
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('app.css')) ?>"></head>
<body class="mc-print p-3"><div class="d-print-none mb-3"><button class="btn btn-primary btn-sm" onclick="window.print()"><?= h(t('btn.print')) ?></button></div>
<h1 class="h4"><?= h($app->title) ?></h1><p class="text-secondary small"><?= h(date('d/m/Y H:i')) ?></p>
<?= $content ?></body></html>
