<?php /** @var \MiB\App $app */ ?>
<h1 class="h4 mb-3"><?= h(t('profile.title')) ?> <small class="text-secondary"><?= h($user['username']) ?></small></h1>
<div class="row g-3">
<div class="col-lg-6"><div class="card"><div class="card-header"><?= h(t('profile.changepw')) ?></div><div class="card-body">
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.current')) ?></label><input class="form-control" type="password" name="old" required autocomplete="current-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.new')) ?></label><input class="form-control" type="password" name="password" required autocomplete="new-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.repeat')) ?></label><input class="form-control" type="password" name="password2" required autocomplete="new-password"></div>
  <button class="btn btn-primary"><?= h(t('btn.save')) ?></button>
</form></div></div></div>
<?php $sec = $app->security; if ($sec->twoFactorEnabled()): $has = $sec->totpSecret($user['id']) !== ''; $new = isset($_SESSION['mc_totp_new']) ? $_SESSION['mc_totp_new'] : ''; ?>
<div class="col-lg-6" id="twofactor"><div class="card"><div class="card-header"><i class="bi bi-phone"></i> <?= h(t('2fa.title')) ?></div><div class="card-body">
<?php if ($has): ?>
  <p class="text-success"><i class="bi bi-shield-check"></i> <?= h(t('2fa.active')) ?></p>
  <?php if (!$sec->twoFactorRequired()): ?><form method="post" class="d-flex gap-2"><?= $app->csrfField() ?><input class="form-control" name="code" inputmode="numeric" placeholder="123456" required><button class="btn btn-outline-danger text-nowrap" name="totp_disable" value="1"><?= h(t('2fa.disable')) ?></button></form><?php endif ?>
<?php elseif ($new !== ''): ?>
  <p class="small text-secondary"><?= h(t('2fa.scan')) ?></p>
  <div class="text-center mb-2"><span class="mc-qr" data-qr="<?= h(\MiB\Totp::uri($new, $user['username'], $app->label($app->config['title']))) ?>" data-size="5"></span></div>
  <p class="small text-center"><code><?= h(trim(chunk_split($new, 4, ' '))) ?></code></p>
  <form method="post" class="d-flex gap-2"><?= $app->csrfField() ?><input class="form-control" name="code" inputmode="numeric" placeholder="123456" required autofocus><button class="btn btn-primary text-nowrap" name="totp_confirm" value="1"><?= h(t('2fa.verify')) ?></button></form>
<?php else: ?>
  <p class="small text-secondary"><?= h(t('2fa.help')) ?></p>
  <form method="post"><?= $app->csrfField() ?><button class="btn btn-primary" name="totp_start" value="1"><?= h(t('2fa.setup')) ?></button></form>
<?php endif ?>
<?php if ($sec->twoFactorChannel() === 'sms'): $myPhone = \MiB\Sms::phone($user); ?>
  <form method="post" class="mt-3 border-top pt-3"><?= $app->csrfField() ?><label class="form-label small"><?= h(t('2fa.phone')) ?></label>
    <div class="d-flex gap-2"><input class="form-control" name="phone" type="tel" value="<?= h($myPhone) ?>" placeholder="+39 333 1234567"><button class="btn btn-outline-primary text-nowrap" name="phone_save" value="1"><?= h(t('btn.save')) ?></button></div>
    <div class="form-text"><?= h(t('2fa.phone_help')) ?></div></form>
<?php endif ?>
</div></div></div>
<?php endif ?>
<?php if ($app->setting('api') && !empty($app->setting('api')['enabled'])): ?>
<div class="col-lg-6"><div class="card"><div class="card-header"><?= h(t('profile.apikey')) ?></div><div class="card-body">
<p class="small text-secondary"><?= h(t('profile.apikey_help')) ?></p>
<form method="post"><?= $app->csrfField() ?><button class="btn btn-outline-primary" name="apikey" value="1"><?= h(t('profile.apikey_gen')) ?></button></form>
</div></div></div>
<?php endif ?>
</div>
