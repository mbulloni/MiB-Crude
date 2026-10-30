<?php /** @var \MiB\App $app @var \MiB\Table $t */ ?>
<table class="table table-sm table-bordered">
<thead><tr><?php foreach ($fields as $f): ?><th><?= h($t->fieldLabel($f)) ?></th><?php endforeach ?></tr></thead>
<tbody><?php foreach ($rows as $r): ?><tr><?php foreach ($fields as $f): ?><td><?= \MiB\Format::html($t, $f, $r, 'print') ?></td><?php endforeach ?></tr><?php endforeach ?></tbody>
<?php if ($totals): ?><tfoot><tr><?php foreach ($fields as $f): ?><td class="fw-semibold"><?= isset($totals[$f['name']]) ? h(\MiB\Format::plain($t, $f, $totals[$f['name']])) : '' ?></td><?php endforeach ?></tr></tfoot><?php endif ?>
</table>
<p class="small text-secondary"><?= h(t('list.records', count($rows))) ?></p>
