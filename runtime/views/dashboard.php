<?php /** @var \MiB\App $app */ $needCharts = true; $eq = \MiB\Theme::flavor($app) === 'equation'; $n = 0; ?>
<h1 class="h4 mb-3"><?= h($app->label($def['title'])) ?></h1>
<div class="row g-3">
<?php foreach ($items as $it): $w = isset($it['width']) ? max(2, min(12, (int)$it['width'])) : 6; $title = $app->label(isset($it['title']) ? $it['title'] : '', ''); ?>
  <div class="col-md-<?= $w ?>">
  <?php if (($it['type'] === 'count' || $it['type'] === 'kpi') && $eq): $kt = $app->table($it['table']); ?>
    <a class="card h-100 text-decoration-none mc-kpi mc-eq-widget mc-eq-c<?= $n++ % 5 ?>" href="<?= h($it['link']) ?>"><div class="card-body">
      <div class="d-flex align-items-start gap-3">
        <span class="mc-eq-icon"><i class="bi bi-<?= h(!empty($it['icon']) ? $it['icon'] : (!empty($kt->def['icon']) ? $kt->def['icon'] : 'graph-up')) ?>"></i></span>
        <div class="ms-auto text-end text-truncate"><div class="mc-eq-title text-truncate"><?= h($title ?: $kt->caption()) ?></div><div class="mc-eq-value"><?= h($it['display']) ?></div></div>
      </div>
      <div class="mc-eq-foot text-truncate"><i class="bi bi-arrow-right-short"></i> <?= h($kt->caption()) ?></div></div></a>
  <?php elseif ($it['type'] === 'count' || $it['type'] === 'kpi'): ?>
    <a class="card h-100 text-decoration-none mc-kpi" href="<?= h($it['link']) ?>"><div class="card-body">
      <div class="text-secondary small"><?= h($title ?: $app->table($it['table'])->caption()) ?></div>
      <div class="display-6 fw-semibold mc-accent"><?= h($it['display']) ?></div></div></a>
  <?php elseif ($it['type'] === 'chart'): ?>
    <div class="card h-100<?= $eq ? ' mc-eq-chart-card' : '' ?>"><?php $ct = $title ?: $app->label($app->config['charts'][$it['ref']]['title'], $it['ref']); if ($eq): ?>
      <div class="card-header mc-eq-head d-flex align-items-center"><span class="text-truncate"><?= h($ct) ?></span>
        <div class="dropdown ms-auto"><button type="button" class="btn btn-link mc-eq-dots" data-bs-toggle="dropdown" aria-label="Menu"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end"><li><a class="dropdown-item mc-chart-png" href="#" data-name="<?= h($ct) ?>"><i class="bi bi-download"></i> <?= h(t('chart.save_image')) ?></a></li>
            <li><a class="dropdown-item" href="<?= h($app->url('chart', ['c' => $it['ref']])) ?>"><i class="bi bi-box-arrow-up-right"></i> <?= h(t('chart.open')) ?></a></li></ul></div></div>
    <?php else: ?><div class="card-header small fw-semibold"><?= h($ct) ?></div><?php endif ?>
      <div class="card-body"><div class="mc-chart-box" style="height:<?= isset($it['height']) ? (int)$it['height'] : 280 ?>px"><div class="mc-chart" data-src="<?= h($app->url('chartdata', ['c' => $it['ref']])) ?>"></div></div></div></div>
  <?php elseif ($it['type'] === 'html'): ?>
    <div class="card h-100"><?php if ($title !== ''): ?><div class="card-header <?= $eq ? 'mc-eq-head' : 'small fw-semibold' ?>"><?= h($title) ?></div><?php endif ?><div class="card-body"><?= \MiB\Sanitizer::clean($app->label(isset($it['html']) ? $it['html'] : '')) ?></div></div>
  <?php else: ?>
    <div class="card h-100"><div class="card-header <?= $eq ? 'mc-eq-head' : 'small fw-semibold' ?>"><?= h($title ?: ($it['type'] === 'list' ? $app->table($it['table'])->caption() : $app->label($app->config['reports'][$it['ref']]['title'], $it['ref']))) ?></div>
      <iframe class="mc-embed" style="height:<?= isset($it['height']) ? (int)$it['height'] : 360 ?>px" src="<?= h($it['src']) ?>"></iframe></div>
  <?php endif ?>
  </div>
<?php endforeach ?>
</div>
