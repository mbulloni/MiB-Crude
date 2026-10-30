<?php
/** Satria shell for login, registration and password pages. @var \MiB\App $app */
$cfg = $app->config;
$pack = \MiB\Theme::pack($app, 'authPack');
$base = 'theme/' . $pack['id'] . '/assets/';
$title = $app->label($cfg['title']);
?><!doctype html>
<html lang="<?= h($app->lang) ?>" data-bs-theme="light" data-mc-fixed-mode="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($app->title) ?> · <?= h($title) ?></title>
<?= \MiB\Theme::css($app, 'authPack') ?>
</head>
<body class="mc-satria">
<header>
 <div class="uk-container uk-container-center mc-satria-head">
  <div id="logo"><a href="index.php"><?php if (is_file($app->root . '/assets/logo.png')): ?><img src="assets/logo.png" alt=""><?php else: ?><span class="mc-satria-brand"><?= h($title) ?></span><?php endif ?></a></div>
  <?php if (count($cfg['languages']) > 1): ?><div class="mc-satria-lang"><?php foreach ($cfg['languages'] as $l): ?><a href="?<?= h(http_build_query(array_merge($_GET, ['lang' => $l]))) ?>"<?= $l === $app->lang ? ' class="on"' : '' ?>><?= h(strtoupper($l)) ?></a><?php endforeach ?></div><?php endif ?>
 </div>
</header>
<section id="pagetitle">
 <div class="uk-container uk-container-center">
  <div class="uk-grid">
   <div class="uk-width-large-1-2 uk-width-small-1-1"><h3><?= h($app->title) ?></h3></div>
   <div class="uk-width-large-1-2 uk-hidden-small"><ul id="breadcrumb-style" class="uk-breadcrumb uk-align-right"><li><a href="index.php"><?= h($title) ?></a></li><li class="uk-active"><span><?= h($app->title) ?></span></li></ul></div>
  </div>
 </div>
</section>
<section class="uk-padding uk-margin-top">
 <div class="uk-container uk-container-center">
  <div class="mc-satria-box">
   <?php include $app->root . '/runtime/views/partials/flash.php' ?>
   <?= $content ?>
  </div>
 </div>
</section>
<footer>
 <div class="uk-container uk-container-center footer-bg-img">
  <div class="uk-grid copyright-wrap"><div class="uk-width-1-1"><p class="copyright">&copy; <?= date('Y') ?> <?= h($title) ?></p></div></div>
 </div>
</footer>
<?= \MiB\Theme::js($app) ?>
</body></html>
