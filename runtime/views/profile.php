<?php /** @var \MiB\App $app */ \MiB\SysPage::show('profile', ['title', 'password', 'twofactor', 'apikey'], get_defined_vars(), function ($p) { ?>
<?= $p('title') ?>
<div class="row g-3">
<div class="col-lg-6"><?= $p('password') ?></div>
<?php if (($h = $p('twofactor')) !== ''): ?><div class="col-lg-6" id="twofactor"><?= $h ?></div><?php endif ?>
<?php if (($h = $p('apikey')) !== ''): ?><div class="col-lg-6"><?= $h ?></div><?php endif ?>
</div>
<?php }); ?>
