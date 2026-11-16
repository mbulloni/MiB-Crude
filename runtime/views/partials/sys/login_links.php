<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<div class="d-flex justify-content-between mt-3 small">
  <?php if ($sec->isManaged() && !empty($sec->cfg['passwordReset']['enabled'])): ?><a href="<?= h($app->url('forgot')) ?>"><?= h(t('forgot.title')) ?></a><?php endif ?>
  <?php if ($sec->isManaged() && !empty($sec->cfg['registration']['enabled'])): ?><a href="<?= h($app->url('register')) ?>"><?= h(t('register.title')) ?></a><?php endif ?>
  <?php if (!empty($sec->cfg['guestAccess'])): ?><a href="<?= h($app->url('home')) ?>"><?= h(t('login.guest')) ?></a><?php endif ?>
</div>
