<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('login.username')) ?></label><input class="form-control" name="username" autofocus required autocomplete="username" value="<?= h(isset($_POST['username']) ? $_POST['username'] : '') ?>"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('login.password')) ?></label><input class="form-control" type="password" name="password" required autocomplete="current-password"></div>
  <?php if (\MiB\Remember::enabled()): ?><div class="form-check mb-3"><input class="form-check-input" type="checkbox" name="remember" value="1" id="mcRemember"><label class="form-check-label" for="mcRemember"><?= h(t('login.remember', \MiB\Remember::days())) ?></label></div><?php endif ?>
  <?php if ($captcha): ?><div class="mb-3"><label class="form-label"><?= h(t('captcha.label')) ?> <strong><?= h($captcha) ?></strong></label><input class="form-control" name="captcha" required inputmode="numeric"></div><?php endif ?>
  <button class="btn btn-primary w-100"><?= h(t('login.submit')) ?></button>
</form>