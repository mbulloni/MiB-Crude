<?php /** @var \MiB\App $app */ $prov = $sec->cfg['providers']; ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('login.username')) ?></label><input class="form-control" name="username" autofocus required autocomplete="username" value="<?= h(isset($_POST['username']) ? $_POST['username'] : '') ?>"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('login.password')) ?></label><input class="form-control" type="password" name="password" required autocomplete="current-password"></div>
  <?php if ($captcha): ?><div class="mb-3"><label class="form-label"><?= h(t('captcha.label')) ?> <strong><?= h($captcha) ?></strong></label><input class="form-control" name="captcha" required inputmode="numeric"></div><?php endif ?>
  <button class="btn btn-primary w-100"><?= h(t('login.submit')) ?></button>
</form>
<?php if (!empty($prov['saml']['enabled'])): ?>
  <a class="btn btn-outline-secondary w-100 mt-2" href="<?= h($app->url('saml')) ?>"><i class="bi bi-building-lock"></i> <?= h(t('login.with', $app->label(isset($prov['saml']['label']) ? $prov['saml']['label'] : 'SSO', 'SSO'))) ?></a>
<?php endif ?>
<?php foreach ($prov['oidc'] as $p): if (empty($p['enabled'])) continue; ?>
  <a class="btn btn-outline-secondary w-100 mt-2" href="<?= h($app->url('oidc', ['id' => $p['id']])) ?>"><i class="bi bi-<?= h(!empty($p['icon']) ? $p['icon'] : 'shield-check') ?>"></i> <?= h(t('login.with', $app->label($p['label'], $p['id']))) ?></a>
<?php endforeach ?>
<div class="d-flex justify-content-between mt-3 small">
  <?php if ($sec->isManaged() && !empty($sec->cfg['passwordReset']['enabled'])): ?><a href="<?= h($app->url('forgot')) ?>"><?= h(t('forgot.title')) ?></a><?php endif ?>
  <?php if ($sec->isManaged() && !empty($sec->cfg['registration']['enabled'])): ?><a href="<?= h($app->url('register')) ?>"><?= h(t('register.title')) ?></a><?php endif ?>
  <?php if (!empty($sec->cfg['guestAccess'])): ?><a href="<?= h($app->url('home')) ?>"><?= h(t('login.guest')) ?></a><?php endif ?>
</div>
