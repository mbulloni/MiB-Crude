<?php /** @var \MiB\App $app */ ?>
<?php if ($done): ?>
  <div class="alert alert-success"><?= h(t(!empty($app->security->cfg['registration']['emailVerify']) ? 'register.check_mail' : 'register.done')) ?></div>
  <a class="btn btn-primary w-100" href="<?= h($app->url('login')) ?>"><?= h(t('login.title')) ?></a>
<?php else: ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('login.username')) ?></label><input class="form-control" name="username" required value="<?= h($vals['username']) ?>"></div>
  <div class="mb-3"><label class="form-label">Email</label><input class="form-control" type="email" name="email" required value="<?= h($vals['email']) ?>"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('register.fullname')) ?></label><input class="form-control" name="fullname" value="<?= h($vals['fullname']) ?>"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('login.password')) ?></label><input class="form-control" type="password" name="password" required autocomplete="new-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.repeat')) ?></label><input class="form-control" type="password" name="password2" required autocomplete="new-password"></div>
  <?php if ($captcha): ?><div class="mb-3"><label class="form-label"><?= h(t('captcha.label')) ?> <strong><?= h($captcha) ?></strong></label><input class="form-control" name="captcha" required inputmode="numeric"></div><?php endif ?>
  <button class="btn btn-primary w-100"><?= h(t('register.submit')) ?></button>
</form>
<div class="text-center mt-3 small"><a href="<?= h($app->url('login')) ?>"><?= h(t('btn.back')) ?></a></div>
<?php endif ?>
