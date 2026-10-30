<?php /** Default landing layout. @var \MiB\App $app */ ?><!doctype html>
<html lang="<?= h($app->lang) ?>"<?= \MiB\Theme::htmlAttrs($app) ?>>
<head><meta charset="utf-8"><?= \MiB\Theme::modeScript() ?><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($app->title) ?></title>
<?= \MiB\Theme::css($app) ?>
</head>
<body class="mc-welcome-page">
<nav class="navbar mc-navbar"><div class="container"><a class="navbar-brand" href="index.php"><?= h($app->label($app->config['title'])) ?></a><div class="ms-auto mc-welcome-nav"><?= isset($welcomeNav) ? $welcomeNav : '' ?></div></div></nav>
<section class="mc-hero"><div class="container py-5"><?= $content ?></div></section>
<footer class="container py-4 small text-secondary">&copy; <?= date('Y') ?> <?= h($app->label($app->config['title'])) ?></footer>
<?= \MiB\Theme::js($app) ?>
</body></html>
