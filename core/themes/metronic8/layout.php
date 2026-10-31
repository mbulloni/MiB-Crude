<?php
/** Metronic 8 shell (demo1 markup). @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app);
$sidebarMode = isset($pack['options']['sidebar']) ? $pack['options']['sidebar'] : 'dark-sidebar';
$menuHtml = function ($items, $sub = false) use (&$menuHtml) {
    $out = '';
    foreach ($items as $it) {
        $icon = $sub ? '<span class="menu-bullet"><span class="bullet bullet-dot"></span></span>'
            : '<span class="menu-icon"><i class="bi bi-' . h(!empty($it['icon']) ? $it['icon'] : 'dot') . ' fs-3"></i></span>';
        if ($it['kind'] === 'separator') $out .= '<div class="menu-item"><div class="menu-content"><div class="separator mx-1 my-4"></div></div></div>';
        elseif ($it['kind'] === 'header') $out .= '<div class="menu-item pt-5"><div class="menu-content"><span class="menu-heading fw-bold text-uppercase fs-7">' . h($it['label']) . '</span></div></div>';
        elseif ($it['kind'] === 'group') {
            $out .= '<div data-kt-menu-trigger="click" class="menu-item menu-accordion' . (!empty($it['active']) ? ' here show' : '') . '"><span class="menu-link">' . $icon
                . '<span class="menu-title">' . h($it['label']) . '</span><span class="menu-arrow"></span></span><div class="menu-sub menu-sub-accordion">' . $menuHtml($it['items'], true) . '</div></div>';
        } else {
            $out .= '<div class="menu-item"><a class="menu-link' . (!empty($it['active']) ? ' active' : '') . '" href="' . h($it['url']) . '"' . (!empty($it['newWindow']) ? ' target="_blank"' : '') . '>'
                . $icon . '<span class="menu-title">' . h($it['label']) . '</span></a></div>';
        }
    }
    return $out;
};
$home = [['kind' => 'link', 'label' => t('menu.home'), 'icon' => 'house', 'url' => $app->url('home', ['menu' => 1]), 'active' => $app->page === 'home']];
$menu = \MiB\Regions::menu($app, $menuHtml(array_merge($home, \MiB\Menu::tree($app))));
$logo = is_file($app->root . '/assets/logo.png') ? '<img alt="" src="assets/logo.png" class="h-30px me-2">' : '';
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
<body id="kt_app_body" data-kt-app-layout="<?= h($sidebarMode) ?>" data-kt-app-header-fixed="true" data-kt-app-sidebar-enabled="true" data-kt-app-sidebar-fixed="true" data-kt-app-sidebar-hoverable="true"
  data-kt-app-sidebar-push-header="true" data-kt-app-sidebar-push-toolbar="true" data-kt-app-sidebar-push-footer="true" class="app-default mc-themed mc-metronic<?= \MiB\Regions::bodyClass($app) ?>">
<?= \MiB\Regions::html($app, 'header') ?>
<div class="d-flex flex-column flex-root app-root" id="kt_app_root">
 <div class="app-page flex-column flex-column-fluid" id="kt_app_page">
  <div id="kt_app_header" class="app-header">
   <div class="app-container container-fluid d-flex align-items-stretch justify-content-between" id="kt_app_header_container">
    <div class="d-flex align-items-center d-lg-none ms-n3 me-1" title="Menu">
     <div class="btn btn-icon btn-active-color-primary w-35px h-35px" id="kt_app_sidebar_mobile_toggle"><i class="bi bi-list fs-1"></i></div>
    </div>
    <div class="d-flex align-items-center flex-grow-1 flex-lg-grow-0 d-lg-none"><a href="<?= h($app->url('home', ['menu' => 1])) ?>" class="fw-bold fs-4 text-gray-800"><?= h($app->label($cfg['title'])) ?></a></div>
    <div class="d-flex align-items-center flex-lg-grow-1">
     <span class="d-none d-lg-block fs-4 fw-bold text-gray-800 ms-2"><?= h($app->title) ?></span>
    </div>
    <div class="app-navbar flex-shrink-0 align-items-center">
     <?php $mcNavClass = 'nav-link btn btn-active-light-primary px-3'; include $app->root . '/runtime/views/partials/usermenu.php'; ?>
    </div>
   </div>
  </div>
  <div class="app-wrapper flex-column flex-row-fluid" id="kt_app_wrapper">
   <div id="kt_app_sidebar" class="app-sidebar flex-column" data-kt-drawer="true" data-kt-drawer-name="app-sidebar" data-kt-drawer-activate="{default: true, lg: false}"
     data-kt-drawer-overlay="true" data-kt-drawer-width="250px" data-kt-drawer-direction="start" data-kt-drawer-toggle="#kt_app_sidebar_mobile_toggle">
    <div class="app-sidebar-logo px-6" id="kt_app_sidebar_logo">
     <a href="<?= h($app->url('home', ['menu' => 1])) ?>" class="d-flex align-items-center text-truncate mc-brand"><?= $logo ?><span class="fs-4 fw-bold text-truncate"><?= h($app->label($cfg['title'])) ?></span></a>
    </div>
    <div class="app-sidebar-menu overflow-hidden flex-column-fluid">
     <div id="kt_app_sidebar_menu_wrapper" class="app-sidebar-wrapper hover-scroll-overlay-y my-5" data-kt-scroll="true" data-kt-scroll-activate="true" data-kt-scroll-height="auto"
       data-kt-scroll-dependencies="#kt_app_sidebar_logo" data-kt-scroll-wrappers="#kt_app_sidebar_menu" data-kt-scroll-offset="5px">
      <div class="menu menu-column menu-rounded menu-sub-indention px-3" id="kt_app_sidebar_menu" data-kt-menu="true" data-kt-menu-expand="false"><?= $menu ?></div>
     </div>
    </div>
   </div>
   <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
    <div class="d-flex flex-column flex-column-fluid">
     <div id="kt_app_content" class="app-content flex-column-fluid pt-6">
      <div id="kt_app_content_container" class="app-container container-fluid">
       <?php include $app->root . '/runtime/views/partials/flash.php' ?>
       <?= $content ?>
      </div>
     </div>
    </div>
    <div id="kt_app_footer" class="app-footer">
     <div class="app-container container-fluid d-flex flex-column flex-md-row flex-center flex-md-stack py-3">
      <div class="text-dark order-2 order-md-1"><span class="text-muted fw-semibold me-1">&copy; <?= date('Y') ?></span><span class="text-gray-800"><?= h($app->label($cfg['title'])) ?></span></div>
     </div>
    </div>
   </div>
  </div>
 </div>
</div>
<?php if (($mcFooter = \MiB\Regions::html($app, 'footer')) !== ''): ?><footer class="mc-region-footer"><?= $mcFooter ?></footer><?php endif ?>
<?php include $app->root . '/runtime/views/partials/modal.php' ?>
<?= \MiB\Theme::js($app, isset($t) ? $t : null, !empty($needCharts), isset($needLibs) ? $needLibs : []) ?>
</body>
</html>
