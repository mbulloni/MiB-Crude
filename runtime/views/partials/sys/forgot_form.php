<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php if ($sent): ?><div class="alert alert-success"><?= h(t('forgot.sent')) ?></div>
<?php else: ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('forgot.label')) ?></label><input class="form-control" name="email" required autofocus></div>
  <button class="btn btn-primary w-100"><?= h(t('forgot.submit')) ?></button>
</form>
<?php endif ?>