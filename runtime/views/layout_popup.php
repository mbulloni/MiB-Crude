<?php /** @var \MiB\App $app */ $theme = $app->config['theme']; ?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="<?= h($theme['mode'] === 'dark' ? 'dark' : 'light') ?>" data-mode="<?= h($theme['mode']) ?>">
<head><meta charset="utf-8"><script>(function(){try{var m=localStorage.getItem('mc-theme')||document.documentElement.getAttribute('data-mode');if(!m||m==='auto')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-bs-theme',m)}catch(e){}})()</script><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="<?= h($app->csrf()) ?>">
<title><?= h($app->title) ?></title>
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap-icons.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/dataTables.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/responsive.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/buttons.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('app.css')) ?>">
<style>:root{--mc-primary:<?= h($theme['primary']) ?>;}</style></head>
<body class="mc-popup<?= !empty($_GET['embed']) ? ' mc-embedded' : '' ?> mc-<?= h($theme['density']) ?>"><main class="p-3">
<?php foreach ($app->takeFlash() as $fl): ?><div class="alert alert-<?= h($fl[0]) ?>"><?= h($fl[1]) ?></div><?php endforeach ?>
<?= $content ?></main>
<script src="<?= h($app->asset('vendor/bootstrap.bundle.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/jquery.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/dataTables.bootstrap5.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.responsive.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/responsive.bootstrap5.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.buttons.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/buttons.bootstrap5.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/buttons.colVis.min.js')) ?>"></script>
<script>window.MC = <?= json_encode(['lang' => $app->lang, 'i18n' => ['confirmDelete' => t('confirm.delete'), 'confirmDeleteSel' => t('confirm.delete_sel'), 'noResults' => t('list.empty'), 'colvis' => t('dt.colvis'), 'all' => t('list.all'),
  'dt' => ['search' => t('dt.search'), 'lengthMenu' => t('dt.lengthMenu'), 'info' => t('dt.info'), 'infoEmpty' => t('dt.infoEmpty'), 'infoFiltered' => t('dt.infoFiltered'), 'zeroRecords' => t('list.empty'), 'emptyTable' => t('list.empty'), 'loadingRecords' => t('dt.loading'), 'processing' => t('dt.loading'),
  'paginate' => ['first' => '«', 'last' => '»', 'next' => '›', 'previous' => '‹']]]], JSON_UNESCAPED_UNICODE) ?>;</script>
<?php if (!empty($needCharts)): ?><script src="<?= h($app->asset('vendor/echarts.min.js')) ?>"></script><?php endif ?>
<script src="<?= h($app->asset('app.js')) ?>"></script></body></html>
