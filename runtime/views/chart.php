<?php /** @var \MiB\App $app */ $needCharts = true; ?>
<?php if (empty($_GET['embed'])): ?><h1 class="h4 mb-3"><?= h($app->label($def['title'], $name)) ?></h1><?php endif ?>
<div class="card"><div class="card-body"><div class="mc-chart-box"><div class="mc-chart" data-src="<?= h($app->url('chartdata', ['c' => $name])) ?>"></div></div></div></div>
