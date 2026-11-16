<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php if ($app->setting('api') && !empty($app->setting('api')['enabled'])): ?>
<div class="card"><div class="card-header"><?= h(t('profile.apikey')) ?></div><div class="card-body">
<p class="small text-secondary"><?= h(t('profile.apikey_help')) ?></p>
<form method="post"><?= $app->csrfField() ?><button class="btn btn-outline-primary" name="apikey" value="1"><?= h(t('profile.apikey_gen')) ?></button></form>
</div></div>
<?php endif ?>