<?php
/** Satria public landing page. @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app, 'authPack');
$base = 'theme/' . $pack['id'] . '/assets/';
$title = $app->label($cfg['title']);
?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="light" data-mc-fixed-mode="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?></title>
<?= \MiB\Theme::css($app, 'authPack') ?>
</head>
<body class="mc-satria mc-satria-welcome">
<header>
 <div class="uk-container uk-container-center mc-satria-head">
  <div id="logo"><a href="index.php"><?php if (is_file($app->root . '/assets/logo.png')): ?><img src="assets/logo.png" alt=""><?php else: ?><span class="mc-satria-brand"><?= h($title) ?></span><?php endif ?></a></div>
  <nav class="mc-satria-nav"><?= isset($welcomeNav) ? $welcomeNav : '' ?></nav>
 </div>
</header>
<section class="mc-satria-hero" style="background-image:url('<?= h($base) ?>images/bg_abstract.png'), linear-gradient(135deg, #1e88e5, #0d3c8c)">
 <div class="uk-container uk-container-center"><div class="slide-content1">
  <?= $content ?>
 </div></div>
</section>
<footer>
 <div class="uk-container uk-container-center footer-bg-img">
  <div class="uk-grid copyright-wrap"><div class="uk-width-1-1"><p class="copyright">&copy; <?= date('Y') ?> <?= h($title) ?></p></div></div>
 </div>
</footer>
<?= \MiB\Theme::js($app) ?>
</body></html>
