<?php /** @var \MiB\App $app */ $eq = \MiB\Theme::flavor($app) === 'equation'; $n = 0; ?>
<h1 class="h4 mb-3"><?= h($app->label($app->config['title'])) ?></h1>
<?php if ($dashboards): ?><div class="mb-3 d-flex flex-wrap gap-2"><?php foreach ($dashboards as $dn => $dd): if (!$app->security->can('dashboard:' . $dn, 'S')) continue; ?>
  <a class="btn btn-outline-primary" href="<?= h($app->url('dashboard', ['d' => $dn])) ?>"><i class="bi bi-speedometer2"></i> <?= h($app->label($dd['title'], $dn)) ?></a><?php endforeach ?></div><?php endif ?>
<div class="row g-3">
<?php foreach ($cards as $c): $t = $c['table']; if ($eq): ?>
  <div class="col-sm-6 col-lg-4 col-xl-3">
    <a class="card h-100 text-decoration-none mc-home-card mc-eq-widget mc-eq-c<?= $n++ % 5 ?>" href="<?= h($app->url('list', ['t' => $t->name])) ?>">
      <div class="card-body d-flex align-items-center gap-3">
        <span class="mc-eq-icon"><i class="bi bi-<?= h(!empty($t->def['icon']) ? $t->def['icon'] : 'table') ?>"></i></span>
        <div class="ms-auto text-end text-truncate"><div class="mc-eq-title text-truncate"><?= h($t->caption()) ?></div><?php if ($c['count'] !== null): ?><div class="mc-eq-value"><?= h(\MiB\Format::number($c['count'], 0)) ?></div><?php endif ?></div>
      </div>
    </a>
  </div>
<?php continue; endif ?>
  <div class="col-sm-6 col-lg-4 col-xl-3">
    <a class="card h-100 text-decoration-none mc-home-card" href="<?= h($app->url('list', ['t' => $t->name])) ?>">
      <div class="card-body d-flex align-items-center">
        <i class="bi bi-<?= h(!empty($t->def['icon']) ? $t->def['icon'] : 'table') ?> fs-2 me-3 mc-accent"></i>
        <div><div class="fw-semibold"><?= h($t->caption()) ?></div><?php if ($c['count'] !== null): ?><div class="text-secondary small"><?= h(t('list.records', $c['count'])) ?></div><?php endif ?></div>
      </div>
    </a>
  </div>
<?php endforeach ?>
</div>
