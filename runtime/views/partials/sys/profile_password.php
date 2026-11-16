<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<div class="card"><div class="card-header"><?= h(t('profile.changepw')) ?></div><div class="card-body">
<?php if ($msg !== ''): ?><div class="alert alert-danger"><?= h($msg) ?></div><?php endif ?>
<form method="post"><?= $app->csrfField() ?>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.current')) ?></label><input class="form-control" type="password" name="old" required autocomplete="current-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.new')) ?></label><input class="form-control" type="password" name="password" required autocomplete="new-password"></div>
  <div class="mb-3"><label class="form-label"><?= h(t('pw.repeat')) ?></label><input class="form-control" type="password" name="password2" required autocomplete="new-password"></div>
  <button class="btn btn-primary"><?= h(t('btn.save')) ?></button>
</form></div></div>