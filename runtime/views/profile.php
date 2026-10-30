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
<?php if ($app->setting('api') && !empty($app->setting('api')['enabled'])): ?>
<div class="col-lg-6"><div class="card"><div class="card-header"><?= h(t('profile.apikey')) ?></div><div class="card-body">
<p class="small text-secondary"><?= h(t('profile.apikey_help')) ?></p>
<form method="post"><?= $app->csrfField() ?><button class="btn btn-outline-primary" name="apikey" value="1"><?= h(t('profile.apikey_gen')) ?></button></form>
</div></div></div>
<?php endif ?>
</div>
