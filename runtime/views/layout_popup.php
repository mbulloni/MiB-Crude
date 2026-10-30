<?php /** @var \MiB\App $app */ $theme = $app->config['theme']; ?><!doctype html>
<html lang="<?= h($app->lang) ?>"<?= \MiB\Theme::htmlAttrs($app) ?>>
<head><meta charset="utf-8"><?= \MiB\Theme::modeScript() ?><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="<?= h($app->csrf()) ?>">
<title><?= h($app->title) ?></title>
<?= \MiB\Theme::css($app) ?>
</head>
<body class="mc-popup mc-themed-content<?= !empty($_GET['embed']) ? ' mc-embedded' : '' ?> mc-<?= h($theme['density']) ?>"><main class="p-3">
<?php include __DIR__ . '/partials/flash.php' ?>
<?= $content ?></main>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts)) ?>
</body></html>
