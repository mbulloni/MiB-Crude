<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$ops = ['contains', 'equals', 'notequals', 'starts', 'more', 'less', 'between', 'empty', 'notempty'];
?>
<h1 class="h4 mb-3"><?= h($t->caption()) ?> <small class="text-secondary fw-normal">— <?= h(t('page.search')) ?></small></h1>
<form method="get" action="index.php" class="card"><div class="card-body">
<input type="hidden" name="p" value="list"><input type="hidden" name="t" value="<?= h($t->name) ?>">
<?php foreach ($t->fields('search') as $f): $n = $f['name']; $c = isset($s[$n]) ? $s[$n] : []; $isLookup = (bool)$t->lookupDef($f);
  $defOp = $isLookup || in_array($f['type'], ['int', 'decimal', 'bool'], true) ? 'equals' : (in_array($f['type'], ['date', 'datetime'], true) ? 'between' : 'contains'); ?>
  <div class="row g-2 align-items-center mb-2 mc-search-row">
    <label class="col-md-3 col-form-label"><?= h($t->fieldLabel($f)) ?></label>
    <div class="col-md-2"><select class="form-select form-select-sm mc-op" name="s[<?= h($n) ?>][op]">
      <?php foreach ($ops as $op): ?><option value="<?= $op ?>"<?= (isset($c['op']) ? $c['op'] : $defOp) === $op ? ' selected' : '' ?>><?= h(t('op.' . $op)) ?></option><?php endforeach ?>
    </select></div>
    <div class="col-md-3"><?= \MiB\Controls::render($t, $f, isset($c['v']) ? $c['v'] : '', 'search', ['name' => "s[$n][v]"]) ?></div>
    <div class="col-md-3 mc-v2"><?= \MiB\Controls::render($t, $f, isset($c['v2']) ? $c['v2'] : '', 'search', ['name' => "s[$n][v2]"]) ?></div>
  </div>
<?php endforeach ?>
</div><div class="card-footer d-flex gap-2">
  <button class="btn btn-primary"><i class="bi bi-search"></i> <?= h(t('btn.search')) ?></button>
  <a class="btn btn-link" href="<?= h($app->url('search', ['t' => $t->name])) ?>"><?= h(t('list.clear')) ?></a>
  <a class="btn btn-link ms-auto" href="<?= h($app->url('list', ['t' => $t->name])) ?>"><?= h(t('btn.back')) ?></a>
</div></form>
