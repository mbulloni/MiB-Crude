<?php
/** @var \MiB\App $app */
$cfg = $app->config;
$theme = $cfg['theme'];
$u = $app->security->user();
$menuHtml = function ($items, $depth = 0) use (&$menuHtml, $app) {
    $out = '';
    foreach ($items as $it) {
        $label = h($app->label(isset($it['label']) ? $it['label'] : '', ''));
        $icon = !empty($it['icon']) ? '<i class="bi bi-' . h($it['icon']) . ' me-2"></i>' : '';
        switch ($it['type']) {
            case 'group':
                $inner = $menuHtml(isset($it['items']) ? $it['items'] : [], $depth + 1);
                if ($inner === '') break;
                $id = 'mg' . substr(md5(json_encode($it)), 0, 8);
                $out .= '<li class="nav-item"><a class="nav-link mc-group" data-bs-toggle="collapse" href="#' . $id . '">' . $icon . $label . '<i class="bi bi-chevron-down ms-auto small"></i></a>'
                    . '<ul class="nav flex-column collapse show ms-3" id="' . $id . '">' . $inner . '</ul></li>';
                break;
            case 'separator':
                $out .= '<li><hr class="my-2"></li>';
                break;
            case 'header':
                $out .= '<li class="mc-menu-header">' . $label . '</li>';
                break;
            case 'link':
                $out .= '<li class="nav-item"><a class="nav-link" href="' . h($it['url']) . '"' . (!empty($it['newWindow']) ? ' target="_blank"' : '') . '>' . $icon . $label . '</a></li>';
                break;
            case 'table':
                if (!$app->hasTable($it['table']) || !$app->security->can($it['table'], 'S')) break;
                $t = $app->table($it['table']);
                $page = isset($it['page']) ? $it['page'] : 'list';
                if (!$t->enabled($page)) break;
                if ($label === '') $label = h($t->caption());
                $active = isset($_GET['t']) && $_GET['t'] === $it['table'] ? ' active' : '';
                $out .= '<li class="nav-item"><a class="nav-link' . $active . '" href="' . h($app->url($page, ['t' => $it['table']])) . '">' . $icon . $label . '</a></li>';
                break;
            case 'report':
            case 'chart':
            case 'dashboard':
                $kind = $it['type'] . 's';
                if (!isset($app->config[$kind][$it['ref']]) || !$app->security->can($it['type'] . ':' . $it['ref'], 'S')) break;
                if ($label === '') $label = h($app->label($app->config[$kind][$it['ref']]['title'], $it['ref']));
                $param = ['report' => 'r', 'chart' => 'c', 'dashboard' => 'd'][$it['type']];
                $out .= '<li class="nav-item"><a class="nav-link" href="' . h($app->url($it['type'], [$param => $it['ref']])) . '">' . $icon . $label . '</a></li>';
                break;
        }
    }
    return $out;
};
$menu = $menuHtml($cfg['menu']);
$sidebar = $theme['layout'] !== 'topbar';
?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="<?= h($theme['mode'] === 'dark' ? 'dark' : 'light') ?>" data-mode="<?= h($theme['mode']) ?>">
<head>
<meta charset="utf-8">
<script>(function(){try{var m=localStorage.getItem('mc-theme')||document.documentElement.getAttribute('data-mode');if(!m||m==='auto')m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-bs-theme',m)}catch(e){}})()</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="<?= h($app->csrf()) ?>">
<title><?= h($app->title ? $app->title . ' · ' : '') ?><?= h($app->label($cfg['title'])) ?></title>
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap.min.css')) ?>">
<link rel="stylesheet" href="<?= h($app->asset('vendor/bootstrap-icons.min.css')) ?>">
<link rel="stylesheet" href="<?= h($app->asset('vendor/dataTables.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/responsive.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('vendor/buttons.bootstrap5.min.css')) ?>"><link rel="stylesheet" href="<?= h($app->asset('app.css')) ?>">
<style>:root{--mc-primary:<?= h($theme['primary']) ?>;}</style>
<?php if (is_file($app->root . '/custom/custom.css')): ?><link rel="stylesheet" href="custom/custom.css?v=<?= filemtime($app->root . '/custom/custom.css') ?>"><?php endif ?>
</head>
<body class="mc-<?= h($theme['density']) ?> <?= $sidebar ? 'mc-sidebar-layout' : 'mc-topbar-layout' ?>">
<nav class="navbar navbar-expand-lg mc-navbar">
  <div class="container-fluid">
    <?php if ($sidebar): ?><button class="btn btn-link text-white d-lg-none me-2" data-bs-toggle="offcanvas" data-bs-target="#mcSide"><i class="bi bi-list fs-4"></i></button><?php endif ?>
    <a class="navbar-brand" href="<?= h($app->url('home', ['menu' => 1])) ?>"><?php if (is_file($app->root . '/assets/logo.png')): ?><img src="assets/logo.png" alt="" height="28" class="me-2"><?php endif ?><?= h($app->label($cfg['title'])) ?></a>
    <?php if (!$sidebar): ?>
    <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#mcTop"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="mcTop"><ul class="navbar-nav me-auto mc-topmenu"><?= $menu ?></ul>
    <?php else: ?><div class="ms-auto d-flex align-items-center"><?php endif ?>
      <ul class="navbar-nav ms-auto align-items-lg-center flex-row gap-2">
        <?php if (count($cfg['languages']) > 1): ?>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown"><i class="bi bi-translate"></i> <?= h(strtoupper($app->lang)) ?></a>
          <ul class="dropdown-menu dropdown-menu-end"><?php foreach ($cfg['languages'] as $l): ?><li><a class="dropdown-item" href="?<?= h(http_build_query(array_merge($_GET, ['lang' => $l]))) ?>"><?= h(strtoupper($l)) ?></a></li><?php endforeach ?></ul>
        </li>
        <?php endif ?>
        <li class="nav-item"><button class="btn btn-link nav-link" id="mcTheme" title="<?= h(t('theme.toggle')) ?>"><i class="bi bi-circle-half"></i></button></li>
        <?php if ($u): ?>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown"><i class="bi bi-person-circle"></i> <?= h($u['fullname'] ?: $u['username']) ?></a>
          <ul class="dropdown-menu dropdown-menu-end">
            <?php if ($app->security->isManaged() && !empty($u['id'])): ?><li><a class="dropdown-item" href="<?= h($app->url('profile')) ?>"><i class="bi bi-key me-2"></i><?= h(t('profile.title')) ?></a></li><?php endif ?>
            <?php if ($app->security->isAdmin()): ?><li><a class="dropdown-item" href="<?= h($app->url('admin')) ?>"><i class="bi bi-shield-lock me-2"></i><?= h(t('admin.title')) ?></a></li><?php endif ?>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="<?= h($app->url('logout')) ?>"><i class="bi bi-box-arrow-right me-2"></i><?= h(t('login.logout')) ?></a></li>
          </ul>
        </li>
        <?php elseif ($app->security->enabled()): ?>
        <li class="nav-item"><a class="nav-link" href="<?= h($app->url('login')) ?>"><i class="bi bi-box-arrow-in-right"></i> <?= h(t('login.title')) ?></a></li>
        <?php endif ?>
      </ul>
    </div>
  </div>
</nav>
<div class="mc-shell">
  <?php if ($sidebar): ?>
  <aside class="offcanvas-lg offcanvas-start mc-sidebar" id="mcSide" tabindex="-1">
    <div class="offcanvas-body p-0"><ul class="nav flex-column py-2">
      <li class="nav-item"><a class="nav-link<?= $app->page === 'home' ? ' active' : '' ?>" href="<?= h($app->url('home', ['menu' => 1])) ?>"><i class="bi bi-house me-2"></i><?= h(t('menu.home')) ?></a></li>
      <?= $menu ?>
    </ul></div>
  </aside>
  <?php endif ?>
  <main class="mc-main">
    <?php foreach ($app->takeFlash() as $fl): ?>
      <div class="alert alert-<?= h($fl[0]) ?> alert-dismissible fade show"><?= h($fl[1]) ?><button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>
    <?php endforeach ?>
    <?= $content ?>
  </main>
</div>
<div class="modal fade" id="mcModal" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body p-0"><iframe class="mc-modal-frame"></iframe></div></div></div></div>
<script src="<?= h($app->asset('vendor/bootstrap.bundle.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/jquery.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/dataTables.bootstrap5.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.responsive.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/responsive.bootstrap5.min.js')) ?>"></script>
<script src="<?= h($app->asset('vendor/dataTables.buttons.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/buttons.bootstrap5.min.js')) ?>"></script><script src="<?= h($app->asset('vendor/buttons.colVis.min.js')) ?>"></script>
<script>window.MC = <?= json_encode(['lang' => $app->lang, 'i18n' => ['confirmDelete' => t('confirm.delete'), 'confirmDeleteSel' => t('confirm.delete_sel'), 'noResults' => t('list.empty'), 'colvis' => t('dt.colvis'), 'all' => t('list.all'),
  'dt' => ['search' => t('dt.search'), 'lengthMenu' => t('dt.lengthMenu'), 'info' => t('dt.info'), 'infoEmpty' => t('dt.infoEmpty'), 'infoFiltered' => t('dt.infoFiltered'), 'zeroRecords' => t('list.empty'), 'emptyTable' => t('list.empty'), 'loadingRecords' => t('dt.loading'), 'processing' => t('dt.loading'),
  'paginate' => ['first' => '«', 'last' => '»', 'next' => '›', 'previous' => '‹']]]], JSON_UNESCAPED_UNICODE) ?>;</script>
<?php if (!empty($needCharts)): ?><script src="<?= h($app->asset('vendor/echarts.min.js')) ?>"></script><?php endif ?>
<script src="<?= h($app->asset('app.js')) ?>"></script>
<?php if (is_file($app->root . '/custom/custom.js')): ?><script src="custom/custom.js?v=<?= filemtime($app->root . '/custom/custom.js') ?>"></script><?php endif ?>
</body>
</html>
