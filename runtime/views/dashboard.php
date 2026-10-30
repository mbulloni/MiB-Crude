<?php /** @var \MiB\App $app */ $needCharts = true; ?>
<h1 class="h4 mb-3"><?= h($app->label($def['title'])) ?></h1>
<div class="row g-3">
<?php foreach ($items as $it): $w = isset($it['width']) ? max(2, min(12, (int)$it['width'])) : 6; $title = $app->label(isset($it['title']) ? $it['title'] : '', ''); ?>
  <div class="col-md-<?= $w ?>">
  <?php if ($it['type'] === 'count' || $it['type'] === 'kpi'): ?>
    <a class="card h-100 text-decoration-none mc-kpi" href="<?= h($it['link']) ?>"><div class="card-body">
      <div class="text-secondary small"><?= h($title ?: $app->table($it['table'])->caption()) ?></div>
      <div class="display-6 fw-semibold mc-accent"><?= h($it['display']) ?></div></div></a>
  <?php elseif ($it['type'] === 'chart'): ?>
    <div class="card h-100"><div class="card-header small fw-semibold"><?= h($title ?: $app->label($app->config['charts'][$it['ref']]['title'], $it['ref'])) ?></div>
      <div class="card-body"><div class="mc-chart-box" style="height:<?= isset($it['height']) ? (int)$it['height'] : 280 ?>px"><canvas class="mc-chart" data-src="<?= h($app->url('chartdata', ['c' => $it['ref']])) ?>"></canvas></div></div></div>
  <?php elseif ($it['type'] === 'html'): ?>
    <div class="card h-100"><?php if ($title !== ''): ?><div class="card-header small fw-semibold"><?= h($title) ?></div><?php endif ?><div class="card-body"><?= \MiB\Sanitizer::clean($app->label(isset($it['html']) ? $it['html'] : '')) ?></div></div>
  <?php else: ?>
    <div class="card h-100"><div class="card-header small fw-semibold"><?= h($title ?: ($it['type'] === 'list' ? $app->table($it['table'])->caption() : $app->label($app->config['reports'][$it['ref']]['title'], $it['ref']))) ?></div>
      <iframe class="mc-embed" style="height:<?= isset($it['height']) ? (int)$it['height'] : 360 ?>px" src="<?= h($it['src']) ?>"></iframe></div>
  <?php endif ?>
  </div>
<?php endforeach ?>
</div>
