<?php
/** "Update selected": pick the fields to change, then the same values go to every selected record.
 * @var \MiB\App $app @var \MiB\Table $t @var array $fields @var array $chosen @var array $selJson */
?>
<div class="d-flex flex-wrap align-items-center gap-2 mb-3 mc-pagehead">
  <h1 class="h4 m-0 me-3"><?= h($t->caption()) ?> <small class="text-secondary">— <?= h(t('updsel.title', $count)) ?></small></h1>
</div>
<form method="post" action="<?= h($app->url('updatesel', ['t' => $t->name])) ?>" class="mc-updatesel" enctype="multipart/form-data">
<?= $app->csrfField() ?><input type="hidden" name="_back" value="<?= h($back) ?>"><input type="hidden" name="_apply" value="1">
<?php foreach ($selJson as $j): ?><input type="hidden" name="sel[]" value="<?= h($j) ?>"><?php endforeach ?>
<?php if ($error !== ''): ?><div class="alert alert-warning"><?= h($error) ?></div><?php endif ?>
<p class="text-secondary small"><?= h(t('updsel.help')) ?></p>
<div class="card mb-3"><div class="card-body"><div class="row g-3">
<?php foreach ($fields as $f): $n = $f['name']; $id = 'f_' . preg_replace('/\W/', '_', $n); $on = in_array($n, $chosen, true); ?>
  <div class="col-md-6 mc-bulk-field<?= $on ? ' mc-bulk-on' : '' ?>">
    <div class="form-check mb-1">
      <input class="form-check-input mc-bulk-pick" type="checkbox" name="_fields[]" value="<?= h($n) ?>" id="pick_<?= h($id) ?>"<?= $on ? ' checked' : '' ?>>
      <label class="form-check-label fw-semibold" for="pick_<?= h($id) ?>"><?= h($t->fieldLabel($f)) ?></label>
    </div>
    <?= \MiB\Controls::render($t, $f, isset($_POST[$n]) ? $_POST[$n] : null, 'edit', ['row' => []]) ?>
  </div>
<?php endforeach ?>
</div></div></div>
<div class="d-flex gap-2">
  <button class="btn btn-primary" type="submit"><i class="bi bi-check-lg"></i> <?= h(t('updsel.apply', $count)) ?></button>
  <a class="btn btn-link" href="<?= h($back) ?>"><?= h(t('btn.cancel')) ?></a>
</div>
</form>
<script>
// Changing a value marks its field as one to update.
document.querySelectorAll('.mc-bulk-field').forEach(function (box) {
  var pick = box.querySelector('.mc-bulk-pick');
  var mark = function () { box.classList.toggle('mc-bulk-on', pick.checked); };
  box.addEventListener('input', function (e) { if (e.target !== pick) { pick.checked = true; mark(); } });
  box.addEventListener('change', function (e) { if (e.target !== pick) pick.checked = true; mark(); });
});
</script>
