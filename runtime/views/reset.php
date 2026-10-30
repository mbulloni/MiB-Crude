<?php /** @var \MiB\App $app */ ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.new')) ?></label><input class="form-control" type="password" name="password" required autocomplete="new-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.repeat')) ?></label><input class="form-control" type="password" name="password2" required autocomplete="new-password"></div>
  <button class="btn btn-primary w-100"><?= h(t('reset.submit')) ?></button>
</form>
