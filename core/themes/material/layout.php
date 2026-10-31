<?php
/** Material Design Admin shell: the markup AngularJS renders from header.html and sidebar.html. @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app);
$o = \MiB\Theme::options($app);
$horizontal = !empty($o['horizontal']);
$home = $app->url('home', ['menu' => 1]);
$menuHtml = function ($items, $sub = false) use (&$menuHtml, $horizontal) {
    $out = '';
    foreach ($items as $it) {
        $target = !empty($it['newWindow']) ? ' target="_blank"' : '';
        $icon = '<i class="bi bi-' . h($sub ? 'dot' : (!empty($it['icon']) ? $it['icon'] : 'dot')) . '"></i>';
        if ($it['kind'] === 'separator') $out .= '<li class="nav-divider"></li>';
        elseif ($it['kind'] === 'header') $out .= '<li class="nav-title"><span>' . h($it['label']) . '</span></li>';
        elseif ($it['kind'] === 'group') {
            $open = !empty($it['active']);
            $out .= '<li class="' . ($open ? ($horizontal ? 'active' : 'open active') : '') . '"><a href="#" class="md-button">' . $icon . '<span>' . h($it['label']) . '</span><i class="bi bi-chevron-down icon-has-ul"></i></a>'
                . '<i class="bi bi-chevron-down icon-has-ul-h"></i><ul' . ($open && !$horizontal ? ' style="display:block"' : '') . '>' . $menuHtml($it['items'], true) . '</ul></li>';
        } else {
            $out .= '<li' . (!empty($it['active']) ? ' class="active"' : '') . '><a href="' . h($it['url']) . '" class="md-button"' . $target . '>' . $icon . '<span>' . h($it['label']) . '</span></a></li>';
        }
    }
    return $out;
};
$items = array_merge([['kind' => 'link', 'label' => t('menu.home'), 'icon' => 'house', 'url' => $home, 'active' => $app->page === 'home']], \MiB\Menu::tree($app));
$logo = is_file($app->root . '/assets/logo.png') ? '<img src="assets/logo.png" class="mc-md-logo" alt="">' : '<i class="bi bi-grid-1x2-fill logo-icon"></i>';
$c = function ($k, $def) use ($o) { return isset($o[$k]) ? $o[$k] : $def; };
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
<body id="app" class="app mc-themed mc-material<?= \MiB\Regions::bodyClass($app) ?>">
<?= \MiB\Regions::html($app, 'header') ?>
<header id="header" class="header-container header-fixed <?= h($c('header', 'bg-white')) ?>">
 <div class="top-header clearfix">
  <div class="logo <?= h($c('logo', 'bg-dark')) ?>">
   <a href="<?= h($home) ?>"><?= $logo ?> <span class="logo-text"><?= h($app->label($cfg['title'])) ?></span></a>
  </div>
  <div class="menu-button" id="mcMdOffCanvas" title="Menu"><span class="icon-bar"></span><span class="icon-bar"></span><span class="icon-bar"></span></div>
  <div class="top-nav">
   <ul class="nav-left list-unstyled">
    <?php if (!$horizontal): ?><li><a href="#" class="header-btn toggle-min" id="mcMdMin" title="Menu"><i class="bi bi-list"></i></a></li><?php endif ?>
    <li class="mc-md-title"><?= h($app->title) ?></li>
   </ul>
   <div class="nav-right"><?php $mcNavClass = 'nav-link'; include $app->root . '/runtime/views/partials/usermenu.php'; ?></div>
  </div>
 </div>
</header>
<div class="main-container<?= $horizontal ? ' app-nav-horizontal' : '' ?>">
 <aside id="nav-container" class="nav-container nav-fixed <?= $horizontal ? 'nav-horizontal' : 'nav-vertical' ?> <?= h($c('nav', 'bg-dark')) ?>">
  <div class="nav-wrapper">
   <ul id="nav" class="nav"><?= \MiB\Regions::menu($app, $menuHtml($items)) ?></ul>
  </div>
 </aside>
 <div id="content" class="content-container">
  <section class="view-container">
   <div class="page mc-md-page">
    <?php include $app->root . '/runtime/views/partials/flash.php' ?>
    <?= $content ?>
   </div>
  </section>
 </div>
</div>
<?php if (($mcFooter = \MiB\Regions::html($app, 'footer')) !== ''): ?><footer class="mc-region-footer"><?= $mcFooter ?></footer><?php endif ?>
<?php include $app->root . '/runtime/views/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts), isset($needLibs) ? $needLibs : []) ?>
</body>
</html>
