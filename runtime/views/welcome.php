<?php
/** Landing page content. @var \MiB\App $app */
$u = $sec->user();
$links = [];
if ($u || !$sec->enabled()) $links[] = ['url' => $app->url('home', ['menu' => 1]), 'label' => t('welcome.enter'), 'primary' => true];
else {
    $links[] = ['url' => $app->url('login'), 'label' => t('login.title'), 'primary' => true];
    if ($sec->isManaged() && !empty($sec->cfg['registration']['enabled'])) $links[] = ['url' => $app->url('register'), 'label' => t('register.title'), 'primary' => false];
}
$welcomeNav = '';
foreach ($links as $l) $welcomeNav .= '<a href="' . h($l['url']) . '">' . h($l['label']) . '</a>';
?>
<h1 class="mc-welcome-title"><?= h($app->label($app->config['title'])) ?></h1>
<?php if (!empty($landing['subtitle'])): ?><p class="lead mc-welcome-sub"><?= h($app->label($landing['subtitle'])) ?></p><?php endif ?>
<?php if (!empty($landing['text'])): ?><div class="mc-welcome-text"><?= \MiB\Sanitizer::clean($app->label($landing['text'])) ?></div><?php endif ?>
<div class="mt-4"><?php foreach ($links as $l): ?><a class="btn btn-lg <?= $l['primary'] ? 'btn-primary' : 'btn-outline-light' ?> me-2" href="<?= h($l['url']) ?>"><?= h($l['label']) ?></a><?php endforeach ?></div>
