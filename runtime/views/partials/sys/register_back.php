<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php if (!$done): ?>
<div class="text-center mt-3 small"><a href="<?= h($app->url('login')) ?>"><?= h(t('btn.back')) ?></a></div>
<?php endif ?>