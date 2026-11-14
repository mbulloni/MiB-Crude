<?php /** @var \MiB\App $app */ $needCharts = true; $eq = \MiB\Theme::flavor($app) === 'equation'; $n = 0; ?>
<?php
// Free layout: every block has x/y/w/h on a 12-column grid (rows of 40px); older dashboards flow by width.
$grid = $items && count(array_filter($items, function ($i) { return isset($i['x']); })) === count($items);
$cell = function ($it) { return 'grid-column:' . max(1, min(12, (int)$it['x'])) . ' / span ' . max(1, min(12, (int)(isset($it['w']) ? $it['w'] : 6))) . ';grid-row:' . max(1, (int)$it['y']) . ' / span ' . max(1, (int)(isset($it['h']) ? $it['h'] : 6)); };
?>
<?php if (!empty($def['css'])): ?><style><?= str_replace('</style', '<\/style', $def['css']) ?></style><?php endif ?>
<?php if (empty($def['hideTitle'])): ?><h1 class="h4 mb-3"><?= h($app->label($def['title'])) ?></h1><?php endif ?>
<div class="<?= $grid ? 'mc-grid' : 'row g-3' ?>" id="mc-page">
<?php foreach ($items as $it): $w = isset($it['width']) ? max(2, min(12, (int)$it['width'])) : 6; $title = $app->label(isset($it['title']) ? $it['title'] : '', ''); $bare = isset($it['card']) && !$it['card']; ?>
  <div class="<?= $grid ? 'mc-cell' : 'col-md-' . $w ?>" data-block="<?= h($it['id']) ?>" data-type="<?= h($it['type']) ?>"<?= $grid ? ' style="' . h($cell($it)) . '"' : '' ?>>
  <?php include __DIR__ . '/partials/dash_block.php' ?>
  </div>
<?php endforeach ?>
</div>
<?php include __DIR__ . '/partials/dash_script.php' ?>
