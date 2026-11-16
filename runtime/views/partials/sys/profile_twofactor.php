<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php $sec = $app->security; if ($sec->twoFactorEnabled()): $has = $sec->totpSecret($user['id']) !== ''; $new = isset($_SESSION['mc_totp_new']) ? $_SESSION['mc_totp_new'] : ''; ?>
<div class="card"><div class="card-header"><i class="bi bi-phone"></i> <?= h(t('2fa.title')) ?></div><div class="card-body">
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
</div></div>
<?php endif ?>