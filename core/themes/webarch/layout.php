<?php
/** Webarch shell (Revox markup): fixed header, left sidebar, condensed mode. @var \MiB\App $app */
$cfg = $app->config;
$home = $app->url('home', ['menu' => 1]);
$pack = \MiB\Theme::pack($app);
$color = isset($pack['options']['color']) ? $pack['options']['color'] : 'default';
$menuHtml = function ($items, $sub = false) use (&$menuHtml) {
    $out = '';
    foreach ($items as $i => $it) {
        $target = !empty($it['newWindow']) ? ' target="_blank"' : '';
        if ($it['kind'] === 'separator') $out .= '<li class="mc-wa-sep"></li>';
        elseif ($it['kind'] === 'header') $out .= '<li class="mc-wa-head"><p class="menu-title">' . h($it['label']) . '</p></li>';
        elseif ($it['kind'] === 'group') {
            $open = !empty($it['active']);
            $out .= '<li class="' . ($open ? 'active open' : '') . '"><a href="javascript:;">' . ($sub ? '' : '<i class="bi bi-' . h($it['icon']) . '"></i> ')
                . '<span class="title">' . h($it['label']) . '</span> <span class="arrow' . ($open ? ' open' : '') . '"></span></a>'
                . '<ul class="sub-menu"' . ($open ? ' style="display:block"' : '') . '>' . $menuHtml($it['items'], true) . '</ul></li>';
        } else {
            $cls = trim(($i === 0 && !$sub ? 'start ' : '') . (!empty($it['active']) ? 'active' : ''));
            $out .= '<li' . ($cls ? ' class="' . $cls . '"' : '') . '><a href="' . h($it['url']) . '"' . $target . '>' . ($sub ? '' : '<i class="bi bi-' . h(!empty($it['icon']) ? $it['icon'] : 'dot') . '"></i> ')
                . '<span class="title">' . h($it['label']) . '</span>' . (!empty($it['active']) && !$sub ? ' <span class="selected"></span>' : '') . '</a></li>';
        }
    }
    return $out;
};
$items = array_merge([['kind' => 'link', 'label' => t('menu.home'), 'icon' => 'house', 'url' => $home, 'active' => $app->page === 'home']], \MiB\Menu::tree($app));
$logo = is_file($app->root . '/assets/logo.png') ? '<img src="assets/logo.png" class="logo mc-wa-logo" alt="">' : '';
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
<body class="mc-themed mc-webarch<?= in_array($color, ['corporate', 'simple'], true) ? ' mc-wa-light' : '' ?><?= \MiB\Regions::bodyClass($app) ?>">
<?= \MiB\Regions::html($app, 'header') ?>
<div class="header navbar navbar-inverse">
 <div class="navbar-inner">
  <div class="header-seperation">
   <a href="#main-menu" class="mc-wa-mobile" data-webarch="toggle-left-side" title="Menu"><i class="bi bi-list"></i></a>
   <a href="<?= h($home) ?>" class="mc-wa-brand"><?= $logo ?: h($app->label($cfg['title'])) ?></a>
  </div>
  <div class="header-quick-nav">
   <div class="pull-left">
    <ul class="nav quick-section">
     <li class="quicklinks"><a href="#" id="layout-condensed-toggle" title="Menu"><i class="bi bi-list"></i></a></li>
     <li class="quicklinks"><span class="h-seperate"></span></li>
     <li class="quicklinks mc-wa-title"><?= h($app->title) ?></li>
    </ul>
   </div>
   <div class="pull-right"><?php $mcNavClass = 'nav-link'; include $app->root . '/runtime/views/partials/usermenu.php'; ?></div>
  </div>
 </div>
</div>
<div class="page-container row-fluid">
 <div class="page-sidebar" id="main-menu">
  <div class="page-sidebar-wrapper" id="main-menu-wrapper">
   <ul><?= \MiB\Regions::menu($app, $menuHtml($items)) ?></ul>
  </div>
 </div>
 <div class="page-content">
  <div class="content">
   <?php include $app->root . '/runtime/views/partials/flash.php' ?>
   <?= $content ?>
  </div>
 </div>
</div>
<?php if (($mcFooter = \MiB\Regions::html($app, 'footer')) !== ''): ?><footer class="mc-region-footer"><?= $mcFooter ?></footer><?php endif ?>
<?php include $app->root . '/runtime/views/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts), isset($needLibs) ? $needLibs : []) ?>
</body>
</html>
