<?php
/** @var \MiB\App $app @var \MiB\Table $t */
$aggs = isset($def['aggregates']) ? $def['aggregates'] : [];
$showDetails = !empty($def['showDetails']) && $columns;
$fmtAgg = function ($a, $v) use ($t) {
    if ($v === null) return '';
    $f = $t->field($a['field']);
    return $a['fn'] === 'count' ? \MiB\Format::number($v, 0) : \MiB\Format::plain($t, $f, $a['fn'] === 'avg' ? round($v, 2) : $v);
};
$renderNode = function ($node, $depth) use (&$renderNode, $t, $aggs, $columns, $showDetails, $fmtAgg) {
    $html = '';
    foreach ($node['children'] as $c) {
        $html .= '<tr class="mc-rg mc-rg-' . $depth . '"><td colspan="' . max(1, count($columns)) . '" style="padding-left:' . (0.5 + $depth * 1.25) . 'rem">'
            . '<span class="text-secondary small">' . h($t->fieldLabel($c['field'])) . ':</span> <strong>' . h($c['label']) . '</strong> <span class="badge text-bg-light">' . count($c['rows'] ?: []) . '</span></td>';
        foreach ($aggs as $a) $html .= '<td class="text-end">' . h($fmtAgg($a, $c['totals'][$a['field'] . ':' . $a['fn']])) . '</td>';
        $html .= '</tr>';
        if ($c['children']) $html .= $renderNode($c, $depth + 1);
        elseif ($showDetails) foreach ($c['rows'] as $r) {
            $html .= '<tr class="mc-rd">';
            foreach ($columns as $f) $html .= '<td style="padding-left:' . (0.5 + ($depth + 1) * 1.25) . 'rem">' . \MiB\Format::html($t, $f, $r, 'list') . '</td>';
            foreach ($aggs as $a) $html .= '<td></td>';
            $html .= '</tr>';
        }
    }
    return $html;
};
?>
<?php if (empty($embedded)): ?>
<div class="d-flex align-items-center gap-2 mb-3"><h1 class="h4 m-0"><?= h($app->label($def['title'], $name)) ?></h1>
  <a class="btn btn-sm btn-outline-secondary ms-auto" href="<?= h($app->url('report', ['r' => $name, 'fmt' => 'xlsx'])) ?>"><i class="bi bi-file-earmark-excel"></i> XLSX</a>
  <a class="btn btn-sm btn-outline-secondary" target="_blank" href="<?= h($app->url('report', ['r' => $name, 'print' => 1])) ?>"><i class="bi bi-printer"></i></a></div>
<?php endif ?>
<div class="card"><div class="mc-scroll"><table class="table table-sm mb-0 mc-report">
<thead><tr><?php if ($columns): foreach ($columns as $f): ?><th><?= h($t->fieldLabel($f)) ?></th><?php endforeach; else: ?><th></th><?php endif ?>
<?php foreach ($aggs as $a): ?><th class="text-end"><?= h(t('agg.' . $a['fn'])) ?> <?= h($t->fieldLabel($a['field'])) ?></th><?php endforeach ?></tr></thead>
<tbody><?php if ($tree['children']): echo $renderNode($tree, 0); else: foreach ($tree['rows'] as $r): ?><tr><?php foreach ($columns as $f): ?><td><?= \MiB\Format::html($t, $f, $r, 'list') ?></td><?php endforeach ?><?php foreach ($aggs as $a): ?><td></td><?php endforeach ?></tr><?php endforeach; endif ?></tbody>
<tfoot><tr class="mc-totals"><td colspan="<?= max(1, count($columns)) ?>"><?= h(t('report.grandtotal')) ?> <span class="badge text-bg-light"><?= (int)$count ?></span></td>
<?php foreach ($aggs as $a): ?><td class="text-end fw-semibold"><?= h($fmtAgg($a, $tree['totals'][$a['field'] . ':' . $a['fn']])) ?></td><?php endforeach ?></tr></tfoot>
</table></div></div>
