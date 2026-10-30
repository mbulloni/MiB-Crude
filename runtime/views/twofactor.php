<?php /** @var \MiB\App $app */ ?>
<p class="text-secondary small"><?= h(t('2fa.prompt')) ?></p>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><input class="form-control form-control-lg text-center" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*" autofocus required placeholder="123456"></div>
  <button class="btn btn-primary w-100"><?= h(t('2fa.verify')) ?></button>
</form>
<div class="text-center mt-3 small"><a href="<?= h($app->url('logout')) ?>"><?= h(t('btn.cancel')) ?></a></div>
