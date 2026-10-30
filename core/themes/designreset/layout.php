<?php
/** DesignReset (Cork / Equation) vertical shell. @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app);
$variant = isset($pack['options']['variant']) ? $pack['options']['variant'] : '';
$horizontal = strpos($variant, 'horizontal') === 0;
$menuHtml = function ($items) use ($horizontal) {
    $out = '';
    foreach ($items as $it) {
        $icon = '<i class="bi bi-' . h(!empty($it['icon']) ? $it['icon'] : 'dot') . '"></i>';
        if ($it['kind'] === 'separator') $out .= '<li class="menu menu-heading"><div class="heading"><span>&nbsp;</span></div></li>';
        elseif ($it['kind'] === 'header') $out .= '<li class="menu menu-heading"><div class="heading"><span>' . h($it['label']) . '</span></div></li>';
        elseif ($it['kind'] === 'group') {
            $sub = '';
            foreach ($it['items'] as $s) {
                if ($s['kind'] !== 'link') continue;
                $sub .= '<li' . (!empty($s['active']) ? ' class="active"' : '') . '><a href="' . h($s['url']) . '"' . (!empty($s['newWindow']) ? ' target="_blank"' : '') . '>' . h($s['label']) . '</a></li>';
            }
            $open = !empty($it['active']);
            // Horizontal variants open groups as dropdowns, vertical ones as accordions.
            $out .= '<li class="menu' . ($open ? ' active' : '') . '"><a href="#' . h($it['id']) . '" data-bs-toggle="' . ($horizontal ? 'dropdown' : 'collapse') . '" aria-expanded="' . ($open && !$horizontal ? 'true' : 'false') . '" class="dropdown-toggle">'
                . '<div>' . $icon . '<span>' . h($it['label']) . '</span></div><div><i class="bi bi-chevron-' . ($horizontal ? 'down' : 'right') . ' mc-chevron"></i></div></a>'
                . '<ul class="' . ($horizontal ? 'dropdown-menu' : 'collapse') . ' submenu list-unstyled' . ($open && !$horizontal ? ' show' : '') . '" id="' . h($it['id']) . '" data-bs-parent="#accordionExample">' . $sub . '</ul></li>';
        } else {
            $out .= '<li class="menu' . (!empty($it['active']) ? ' active' : '') . '"><a href="' . h($it['url']) . '" aria-expanded="' . (!empty($it['active']) ? 'true' : 'false') . '" class="dropdown-toggle"'
                . (!empty($it['newWindow']) ? ' target="_blank"' : '') . '><div>' . $icon . '<span>' . h($it['label']) . '</span></div></a></li>';
        }
    }
    return $out;
};
$home = [['kind' => 'link', 'label' => t('menu.home'), 'icon' => 'house', 'url' => $app->url('home', ['menu' => 1]), 'active' => $app->page === 'home']];
$menu = $menuHtml(array_merge($home, \MiB\Menu::tree($app)));
$logo = is_file($app->root . '/assets/logo.png') ? '<img src="assets/logo.png" class="navbar-logo" alt="">' : '';
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
<body class="mc-themed mc-designreset<?= $horizontal ? ' mc-dr-horizontal' : '' ?>">
<div class="header-container">
 <header class="header navbar navbar-expand-sm expand-header<?= $horizontal ? ' container-xxl' : '' ?>">
  <a href="javascript:void(0);" class="sidebarCollapse" title="Menu"><i class="bi bi-list fs-4"></i></a>
  <?php if ($horizontal): ?>
  <ul class="navbar-item theme-brand flex-row text-center">
   <?php if ($logo): ?><li class="nav-item theme-logo"><a href="<?= h($app->url('home', ['menu' => 1])) ?>"><?= $logo ?></a></li><?php endif ?>
   <li class="nav-item theme-text"><a href="<?= h($app->url('home', ['menu' => 1])) ?>" class="nav-link"><?= h($app->label($cfg['title'])) ?></a></li>
  </ul>
  <?php endif ?>
  <span class="mc-dr-title d-none d-md-inline"><?= h($app->title) ?></span>
  <div class="ms-auto"><?php $mcNavClass = 'nav-link'; include $app->root . '/runtime/views/partials/usermenu.php'; ?></div>
 </header>
</div>
<div class="main-container" id="container">
 <div class="overlay"></div>
 <div class="search-overlay"></div>
 <div class="sidebar-wrapper sidebar-theme">
  <nav id="sidebar">
   <div class="navbar-nav theme-brand flex-row text-center">
    <div class="nav-logo">
     <?php if ($logo): ?><div class="nav-item theme-logo"><a href="<?= h($app->url('home', ['menu' => 1])) ?>"><?= $logo ?></a></div><?php endif ?>
     <div class="nav-item theme-text"><a href="<?= h($app->url('home', ['menu' => 1])) ?>" class="nav-link"><?= h($app->label($cfg['title'])) ?></a></div>
    </div>
    <div class="nav-item sidebar-toggle"><div class="btn-toggle sidebarCollapse"><i class="bi bi-chevron-double-left"></i></div></div>
   </div>
   <div class="shadow-bottom"></div>
   <ul class="list-unstyled menu-categories" id="accordionExample"><?= $menu ?></ul>
  </nav>
 </div>
 <div id="content" class="main-content">
  <div class="layout-px-spacing">
   <div class="middle-content container-xxl p-0">
    <div class="layout-top-spacing pb-4">
     <?php include $app->root . '/runtime/views/partials/flash.php' ?>
     <?= $content ?>
    </div>
   </div>
  </div>
  <div class="footer-wrapper">
   <div class="footer-section f-section-1"><p>&copy; <?= date('Y') ?> <?= h($app->label($cfg['title'])) ?></p></div>
  </div>
 </div>
</div>
<?php include $app->root . '/runtime/views/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts), isset($needLibs) ? $needLibs : []) ?>
</body>
</html>
