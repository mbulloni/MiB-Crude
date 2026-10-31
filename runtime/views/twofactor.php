<?php /** @var \MiB\App $app */ ?>
<p class="text-secondary small"><?= h($mode === 'code' ? t($channel === 'sms' ? '2fa.prompt_sms' : '2fa.prompt_email', $to) : t('2fa.prompt')) ?></p>
<?php foreach ($app->takeFlash() as $fl): ?><div class="alert alert-<?= h($fl[0]) ?> py-2 small"><?= h($fl[1]) ?></div><?php endforeach ?>
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><input class="form-control form-control-lg text-center" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*" autofocus required placeholder="123456"></div>
  <button class="btn btn-primary w-100"><?= h(t('2fa.verify')) ?></button>
</form>
<?php if ($mode === 'code'): ?><form method="post" class="text-center mt-2"><?= $app->csrfField() ?><button class="btn btn-link btn-sm" name="resend" value="1"><?= h(t('2fa.resend')) ?></button></form><?php endif ?>
<div class="text-center mt-3 small"><a href="<?= h($app->url('logout')) ?>"><?= h(t('btn.cancel')) ?></a></div>
