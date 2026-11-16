<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php /** @var \MiB\App $app */ $eq = \MiB\Theme::flavor($app) === 'equation'; $n = 0; ?>
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
