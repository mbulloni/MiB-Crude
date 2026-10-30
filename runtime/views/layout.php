<?php
/** @var \MiB\App $app */
$cfg = $app->config;
$theme = $cfg['theme'];
$u = $app->security->user();
$menuHtml = function ($items) use (&$menuHtml) {
    $out = '';
    foreach ($items as $it) {
        $icon = !empty($it['icon']) ? '<i class="bi bi-' . h($it['icon']) . ' me-2"></i>' : '';
        if ($it['kind'] === 'separator') $out .= '<li><hr class="my-2"></li>';
        elseif ($it['kind'] === 'header') $out .= '<li class="mc-menu-header">' . h($it['label']) . '</li>';
        elseif ($it['kind'] === 'group') {
            $out .= '<li class="nav-item"><a class="nav-link mc-group" data-bs-toggle="collapse" href="#' . h($it['id']) . '">' . $icon . h($it['label']) . '<i class="bi bi-chevron-down ms-auto small"></i></a>'
                . '<ul class="nav flex-column collapse show ms-3" id="' . h($it['id']) . '">' . $menuHtml($it['items']) . '</ul></li>';
        } else {
            $out .= '<li class="nav-item"><a class="nav-link' . (!empty($it['active']) ? ' active' : '') . '" href="' . h($it['url']) . '"' . (!empty($it['newWindow']) ? ' target="_blank"' : '') . '>' . $icon . h($it['label']) . '</a></li>';
        }
    }
    return $out;
};
$menu = $menuHtml(\MiB\Menu::tree($app));
$sidebar = $theme['layout'] !== 'topbar';
?><!doctype html>
<html lang="<?= h($app->lang) ?>"<?= \MiB\Theme::htmlAttrs($app) ?>>
<head>
<meta charset="utf-8">
<?= \MiB\Theme::modeScript() ?>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="<?= h($app->csrf()) ?>">
<title><?= h($app->title ? $app->title . ' · ' : '') ?><?= h($app->label($cfg['title'])) ?></title>
<?= \MiB\Theme::css($app) ?>
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
      <?php include __DIR__ . '/partials/usermenu.php' ?>
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
    <?php include __DIR__ . '/partials/flash.php' ?>
    <?= $content ?>
  </main>
</div>
<?php include __DIR__ . '/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts)) ?>
</body>
</html>
