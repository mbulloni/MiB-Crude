<?php /** @var \MiB\App $app */ $theme = $app->config['theme']; ?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="<?= h($theme['mode'] === 'dark' ? 'dark' : 'light') ?>" data-mode="<?= h($theme['mode']) ?>">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="<?= h($app->csrf()) ?>">
<title><?= h($app->title) ?></title>
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap-icons.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('app.css')) ?>">
<style>:root{--mc-primary:<?= h($theme['primary']) ?>;}</style></head>
<body class="mc-popup<?= !empty($_GET['embed']) ? ' mc-embedded' : '' ?> mc-<?= h($theme['density']) ?>"><main class="p-3">
<?php foreach ($app->takeFlash() as $fl): ?><div class="alert alert-<?= h($fl[0]) ?>"><?= h($fl[1]) ?></div><?php endforeach ?>
<?= $content ?></main>
<script src="<?= h($app->asset('vendor/bootstrap.bundle.min.js')) ?>"></script>
<script>window.MC = <?= json_encode(['lang' => $app->lang, 'i18n' => ['confirmDelete' => t('confirm.delete'), 'confirmDeleteSel' => t('confirm.delete_sel'), 'noResults' => t('list.empty')]], JSON_UNESCAPED_UNICODE) ?>;</script>
<?php if (!empty($needCharts)): ?><script src="<?= h($app->asset('vendor/chart.umd.min.js')) ?>"></script><?php endif ?>
<script src="<?= h($app->asset('app.js')) ?>"></script></body></html>
