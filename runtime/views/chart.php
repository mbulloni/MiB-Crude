<?php /** @var \MiB\App $app */ $needCharts = true;
$asked = [];
foreach (['q', 's', 'f', 'gb', 'gi', 'ag', 'adhoc'] as $k) if (isset($_GET[$k]) && $_GET[$k] !== '' && $_GET[$k] !== []) $asked[$k] = $_GET[$k];
?>
<?php if (empty($_GET['embed'])): ?><h1 class="h4 mb-3"><?= h($app->label($def['title'], $name)) ?></h1><?php endif ?>
<?php if (empty($_GET['embed']) && \MiB\Reports::toolsOn($def)): $kind = 'chart'; include __DIR__ . '/partials/data_tools.php'; endif ?>
<div class="card"><div class="card-body"><div class="mc-chart-box"><div class="mc-chart" data-src="<?= h($app->url('chartdata', array_merge(['c' => $name], $asked))) ?>"></div></div></div></div>
