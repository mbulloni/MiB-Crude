<?php
/** Slim shell (ThemePixels markup): sidebar or horizontal navbar. @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app);
$horizontal = isset($pack['options']['menu']) && $pack['options']['menu'] === 'horizontal';
$home = $app->url('home', ['menu' => 1]);
$icon = function ($it) { return '<i class="bi bi-' . h(!empty($it['icon']) ? $it['icon'] : 'dot') . '"></i>'; };
$target = function ($it) { return !empty($it['newWindow']) ? ' target="_blank"' : ''; };
// Sidebar: groups open as accordions (third level as nested list, like the template).
$sideSub = function ($items) use (&$sideSub, $target) {
    $out = '';
    foreach ($items as $s) {
        if ($s['kind'] === 'group') {
            $out .= '<li class="nav-sub-item sub-with-sub"><a href="#" class="nav-sub-link' . (!empty($s['active']) ? ' active' : '') . '">' . h($s['label']) . '</a><ul>';
            foreach ($s['items'] as $x) if ($x['kind'] === 'link') $out .= '<li><a href="' . h($x['url']) . '"' . $target($x) . (!empty($x['active']) ? ' class="active"' : '') . '>' . h($x['label']) . '</a></li>';
            $out .= '</ul></li>';
        } elseif ($s['kind'] === 'link') {
            $out .= '<li class="nav-sub-item"><a href="' . h($s['url']) . '" class="nav-sub-link' . (!empty($s['active']) ? ' active' : '') . '"' . $target($s) . '>' . h($s['label']) . '</a></li>';
        }
    }
    return $out;
};
$sideMenu = function ($items) use ($sideSub, $icon, $target) {
    $out = '';
    foreach ($items as $it) {
        if ($it['kind'] === 'separator') $out .= '<li class="sidebar-nav-item mc-slim-sep"></li>';
        elseif ($it['kind'] === 'header') $out .= '<li class="sidebar-nav-item"><label class="sidebar-label pd-x-15 mg-t-20 mg-b-10">' . h($it['label']) . '</label></li>';
        elseif ($it['kind'] === 'group') {
            $out .= '<li class="sidebar-nav-item with-sub"><a href="#" class="sidebar-nav-link' . (!empty($it['active']) ? ' active' : '') . '">' . $icon($it) . ' ' . h($it['label']) . '</a>'
                . '<ul class="nav sidebar-nav-sub">' . $sideSub($it['items']) . '</ul></li>';
        } else {
            $out .= '<li class="sidebar-nav-item"><a href="' . h($it['url']) . '" class="sidebar-nav-link' . (!empty($it['active']) ? ' active' : '') . '"' . $target($it) . '>' . $icon($it) . ' ' . h($it['label']) . '</a></li>';
        }
    }
    return $out;
};
// Navbar: groups open on hover (desktop) or click (small screens).
$topSub = function ($items) use (&$topSub, $target) {
    $out = '';
    foreach ($items as $s) {
        if ($s['kind'] === 'group') $out .= '<li class="mc-slim-subhead">' . h($s['label']) . '</li>' . $topSub($s['items']);
        elseif ($s['kind'] === 'link') $out .= '<li><a href="' . h($s['url']) . '"' . $target($s) . (!empty($s['active']) ? ' class="active"' : '') . '>' . h($s['label']) . '</a></li>';
    }
    return $out;
};
$topMenu = function ($items) use ($topSub, $icon, $target) {
    $out = '';
    foreach ($items as $it) {
        if ($it['kind'] === 'group') {
            $out .= '<li class="nav-item with-sub' . (!empty($it['active']) ? ' active' : '') . '"><a class="nav-link" href="#">' . $icon($it) . ' <span>' . h($it['label']) . '</span></a>'
                . '<div class="sub-item"><ul>' . $topSub($it['items']) . '</ul></div></li>';
        } elseif ($it['kind'] === 'link') {
            $out .= '<li class="nav-item' . (!empty($it['active']) ? ' active' : '') . '"><a class="nav-link" href="' . h($it['url']) . '"' . $target($it) . '>' . $icon($it) . ' <span>' . h($it['label']) . '</span></a></li>';
        }
    }
    return $out;
};
$items = array_merge([['kind' => 'link', 'label' => t('menu.home'), 'icon' => 'house', 'url' => $home, 'active' => $app->page === 'home']], \MiB\Menu::tree($app));
$logo = is_file($app->root . '/assets/logo.png') ? '<img src="assets/logo.png" class="mc-slim-logo" alt=""> ' : '';
$container = $horizontal ? 'container' : 'container-fluid';
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
<body class="mc-themed mc-slim<?= $horizontal ? ' mc-slim-horizontal' : ' mc-slim-sidebar' ?>">
<div class="slim-header<?= $horizontal ? '' : ' with-sidebar' ?>">
 <div class="<?= $container ?>">
  <div class="slim-header-left">
   <h2 class="slim-logo"><a href="<?= h($home) ?>"><?= $logo ?><?= h($app->label($cfg['title'])) ?></a></h2>
   <?php if (!$horizontal): ?><a href="#" id="slimSidebarMenu" class="slim-sidebar-menu" title="Menu"><span></span></a><?php endif ?>
  </div>
  <div class="slim-header-right"><?php $mcNavClass = 'nav-link'; include $app->root . '/runtime/views/partials/usermenu.php'; ?></div>
 </div>
</div>
<?php if ($horizontal): ?>
<div class="slim-navbar">
 <div class="container">
  <button type="button" class="btn btn-sm btn-outline-secondary d-lg-none mb-2" id="mcSlimNav"><i class="bi bi-list"></i> Menu</button>
  <ul class="nav" id="mcSlimNavList"><?= $topMenu($items) ?></ul>
 </div>
</div>
<div class="slim-mainpanel">
 <div class="container pd-t-30 pb-4">
  <?php include $app->root . '/runtime/views/partials/flash.php' ?>
  <?= $content ?>
 </div>
</div>
<div class="slim-footer"><div class="container"><p>&copy; <?= date('Y') ?> <?= h($app->label($cfg['title'])) ?></p></div></div>
<?php else: ?>
<div class="slim-body">
 <div class="slim-sidebar">
  <ul class="nav nav-sidebar"><?= $sideMenu($items) ?></ul>
 </div>
 <div class="slim-mainpanel">
  <div class="container-fluid pd-t-30 pb-4">
   <?php include $app->root . '/runtime/views/partials/flash.php' ?>
   <?= $content ?>
  </div>
  <div class="slim-footer mg-t-0"><div class="container-fluid"><p>&copy; <?= date('Y') ?> <?= h($app->label($cfg['title'])) ?></p></div></div>
 </div>
</div>
<?php endif ?>
<?php include $app->root . '/runtime/views/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts), isset($needLibs) ? $needLibs : []) ?>
</body>
</html>
