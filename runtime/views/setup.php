<?php /** @var \MiB\App $app */ ?>
<p class="small text-secondary"><?= h(t('setup.help')) ?></p>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('login.username')) ?></label><input class="form-control" name="username" required value="<?= h(isset($_POST['username']) ? $_POST['username'] : 'admin') ?>"></div>
  <div class="mb-3"><label class="form-label">Email</label><input class="form-control" type="email" name="email" value="<?= h(isset($_POST['email']) ? $_POST['email'] : '') ?>"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('login.password')) ?></label><input class="form-control" type="password" name="password" required autocomplete="new-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.repeat')) ?></label><input class="form-control" type="password" name="password2" required autocomplete="new-password"></div>
  <button class="btn btn-primary w-100"><?= h(t('setup.submit')) ?></button>
</form>
