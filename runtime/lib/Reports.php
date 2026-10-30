<?php
namespace MiB;

/**
 * Reports (grouping with subtotals), charts (Chart.js) and dashboards.
 * Grouping happens in PHP on the filtered rows so it behaves the same on every database.
 */
class Reports
{
    const MAX_ROWS = 50000;
    private $app;

    public function __construct(App $app)
    {
        $this->app = $app;
    }

    /** Definition from the project, or from mc_reports for user-built items ("u:<id>"). */
    private function def($kind, $name)
    {
        if (strpos($name, 'u:') === 0) return Builder::load(substr($name, 2), $kind === 'reports' ? 'report' : 'chart');
        $all = isset($this->app->config[$kind]) ? $this->app->config[$kind] : [];
        if (!isset($all[$name])) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check(substr($kind, 0, -1) . ':' . $name, 'S');
        return $all[$name];
    }

    private function rows(Table $t, array $def)
    {
        $req = ['q' => isset($_GET['q']) ? $_GET['q'] : '', 's' => isset($_GET['s']) && is_array($_GET['s']) ? $_GET['s'] : [], 'f' => []];
        $rows = $t->fetch($req, self::MAX_ROWS, 0, '', 'asc', 'report');
        $t->resolveLookups($rows, $t->def['fields']);
        return $rows;
    }

    public static function bucket(Table $t, $field, $interval, array $row)
    {
        $f = $t->field($field);
        $v = isset($row[$field]) ? $row[$field] : null;
        if ($v === null || $v === '') return ['', t('report.empty')];
        $ts = in_array($interval, ['year', 'quarter', 'month', 'week', 'day'], true) ? strtotime((string)$v) : false;
        switch ($interval) {
            case 'year': return [date('Y', $ts), date('Y', $ts)];
            case 'quarter': $q = (int)ceil(date('n', $ts) / 3); return [date('Y', $ts) . "-Q$q", "Q$q " . date('Y', $ts)];
            case 'month': return [date('Y-m', $ts), date('m/Y', $ts)];
            case 'week': return [date('o-W', $ts), t('report.week') . ' ' . date('W/o', $ts)];
            case 'day': return [date('Y-m-d', $ts), Format::date($v, 'dateFormat')];
            case 'letter': $l = mb_strtoupper(mb_substr(Format::plain($t, $f, $v, $row), 0, 1)); return [$l, $l];
            case 'tens': $b = floor($v / 10) * 10; return [sprintf('%020.4f', $b), $b . '–' . ($b + 9)];
        }
        return [is_numeric($v) ? sprintf('%020.4f', $v) : mb_strtolower(Format::plain($t, $f, $v, $row)), Format::plain($t, $f, $v, $row)];
    }

    public static function aggregate($fn, array $values)
    {
        $nums = array_values(array_filter($values, 'is_numeric'));
        switch ($fn) {
            case 'count': return count(array_filter($values, function ($v) { return $v !== null && $v !== ''; }));
            case 'sum': return array_sum($nums);
            case 'avg': return $nums ? array_sum($nums) / count($nums) : null;
            case 'min': return $nums ? min($nums) : null;
            case 'max': return $nums ? max($nums) : null;
        }
        return null;
    }

    /** Recursive grouping: [['key','label','rows','children','totals'], ...] */
    private function group(Table $t, array $rows, array $groups, array $aggs)
    {
        $totals = [];
        foreach ($aggs as $a) $totals[$a['field'] . ':' . $a['fn']] = self::aggregate($a['fn'], array_column($rows, $a['field']));
        if (!$groups) return ['rows' => $rows, 'totals' => $totals, 'children' => []];
        $g = array_shift($groups);
        $buckets = [];
        foreach ($rows as $r) {
            list($k, $label) = self::bucket($t, $g['field'], isset($g['interval']) ? $g['interval'] : '', $r);
            if (!isset($buckets[$k])) $buckets[$k] = ['key' => $k, 'label' => $label, 'rows' => []];
            $buckets[$k]['rows'][] = $r;
        }
        ksort($buckets, SORT_STRING);
        if (!empty($g['desc'])) $buckets = array_reverse($buckets, true);
        $children = [];
        foreach ($buckets as $b) $children[] = array_merge(['key' => $b['key'], 'label' => $b['label'], 'field' => $g['field']], $this->group($t, $b['rows'], $groups, $aggs));
        return ['rows' => [], 'totals' => $totals, 'children' => $children];
    }

    public function report($name, $embedded = false)
    {
        $def = $this->def('reports', $name);
        $t = $this->app->table($def['table']);
        $this->app->security->check($t->name, 'S');
        $rows = $this->rows($t, $def);
        $tree = $this->group($t, $rows, isset($def['groups']) ? $def['groups'] : [], isset($def['aggregates']) ? $def['aggregates'] : []);
        $columns = [];
        foreach (isset($def['columns']) ? $def['columns'] : [] as $c) if ($t->field($c)) $columns[] = $t->field($c);
        $this->app->title = $this->app->label($def['title'], $name);
        $vars = ['def' => $def, 't' => $t, 'tree' => $tree, 'columns' => $columns, 'count' => count($rows), 'name' => $name, 'embedded' => $embedded || !empty($_GET['embed'])];
        if (!empty($_GET['fmt']) && $_GET['fmt'] === 'xlsx') return $this->exportReport($t, $def, $tree, $columns);
        $layout = !empty($_GET['embed']) || $embedded ? 'layout_popup' : (!empty($_GET['print']) ? 'layout_print' : 'layout');
        $this->app->render('report', $vars, $layout);
    }

    private function exportReport(Table $t, array $def, array $tree, array $columns)
    {
        $head = [];
        $data = [];
        $fields = [];
        foreach (isset($def['groups']) ? $def['groups'] : [] as $g) { $head[] = $t->fieldLabel($g['field']); $fields[] = ['type' => 'string']; }
        foreach (isset($def['aggregates']) ? $def['aggregates'] : [] as $a) { $head[] = t('agg.' . $a['fn']) . ' ' . $t->fieldLabel($a['field']); $fields[] = ['type' => 'decimal']; }
        $walk = function ($node, $path) use (&$walk, &$data, $def) {
            if (!$node['children']) {
                $line = $path;
                foreach (isset($def['aggregates']) ? $def['aggregates'] : [] as $a) $line[] = $node['totals'][$a['field'] . ':' . $a['fn']];
                $data[] = $line;
                return;
            }
            foreach ($node['children'] as $c) $walk($c, array_merge($path, [$c['label']]));
        };
        $walk($tree, []);
        $file = Export::xlsx($head, $data, $fields);
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="report_' . date('Ymd_His') . '.xlsx"');
        readfile($file);
        @unlink($file);
    }

    public function chart($name)
    {
        $def = $this->def('charts', $name);
        $this->app->title = $this->app->label($def['title'], $name);
        $this->app->render('chart', ['def' => $def, 'name' => $name], !empty($_GET['embed']) ? 'layout_popup' : 'layout');
    }

    /** Chart.js data: {type, labels, datasets} */
    public function chartData($name)
    {
        $def = $this->def('charts', $name);
        $t = $this->app->table($def['table']);
        $this->app->security->check($t->name, 'S');
        $rows = $this->rows($t, $def);
        $buckets = [];
        foreach ($rows as $r) {
            list($k, $label) = self::bucket($t, $def['labelField'], isset($def['labelInterval']) ? $def['labelInterval'] : '', $r);
            if (!isset($buckets[$k])) $buckets[$k] = ['label' => $label, 'rows' => []];
            $buckets[$k]['rows'][] = $r;
        }
        ksort($buckets, SORT_STRING);
        $series = isset($def['series']) && $def['series'] ? $def['series'] : [['field' => $def['labelField'], 'fn' => 'count']];
        $labels = [];
        $values = [];
        foreach ($buckets as $b) {
            $labels[] = $b['label'];
            foreach ($series as $i => $s) $values[$i][] = round((float)self::aggregate($s['fn'], array_column($b['rows'], $s['field'])), 4);
        }
        // Optional "top N by first series".
        if (!empty($def['sortByValue']) || !empty($def['limit'])) {
            $idx = array_keys($labels);
            if (!empty($def['sortByValue'])) usort($idx, function ($a, $b) use ($values) { return $values[0][$b] <=> $values[0][$a]; });
            if (!empty($def['limit'])) $idx = array_slice($idx, 0, (int)$def['limit']);
            $labels = array_map(function ($i) use ($labels) { return $labels[$i]; }, $idx);
            foreach ($values as $s => $vals) $values[$s] = array_map(function ($i) use ($vals) { return $vals[$i]; }, $idx);
        }
        $datasets = [];
        foreach ($series as $i => $s) {
            $datasets[] = ['label' => !empty($s['label']) ? $this->app->label($s['label']) : t('agg.' . $s['fn']) . ' ' . $t->fieldLabel($s['field']),
                'data' => isset($values[$i]) ? $values[$i] : [], 'color' => isset($s['color']) ? $s['color'] : ''];
        }
        $out = ['type' => $def['type'], 'labels' => $labels, 'datasets' => $datasets, 'stacked' => !empty($def['stacked'])];
        // JS_ModifyChart (phpr chart event, AnyChart API) applied in the browser by anychart-compat.js.
        if (!empty($def['modifyJs'])) $out['js'] = $def['modifyJs'];
        $this->app->json($out);
    }

    public function dashboard($name)
    {
        $def = $this->def('dashboards', $name);
        $items = [];
        foreach (isset($def['items']) ? $def['items'] : [] as $it) {
            $type = $it['type'];
            if ($type === 'count' || $type === 'kpi') {
                $t = $this->app->table($it['table']);
                if (!$this->app->security->can($t->name, 'S')) continue;
                $fn = isset($it['fn']) ? $it['fn'] : 'count';
                if ($fn === 'count') $it['value'] = $t->count([]);
                else {
                    $rows = $t->fetch([], self::MAX_ROWS, 0);
                    $it['value'] = self::aggregate($fn, array_column($rows, $it['field']));
                }
                $f = !empty($it['field']) ? $t->field($it['field']) : null;
                $it['display'] = $f && $fn !== 'count' ? Format::plain($t, $f, $it['value']) : Format::number($it['value'], 0);
                $it['link'] = $t->enabled('list') ? $this->app->url('list', ['t' => $t->name]) : '';
            } elseif ($type === 'list') {
                if (!$this->app->security->can($it['table'], 'S')) continue;
                $it['src'] = $this->app->url('list', ['t' => $it['table'], 'embed' => 1, 'ps' => isset($it['rows']) ? (int)$it['rows'] : 10]);
            } elseif ($type === 'report') {
                if (!$this->app->security->can('report:' . $it['ref'], 'S')) continue;
                $it['src'] = $this->app->url('report', ['r' => $it['ref'], 'embed' => 1]);
            } elseif ($type === 'chart') {
                if (!$this->app->security->can('chart:' . $it['ref'], 'S')) continue;
            }
            $items[] = $it;
        }
        $this->app->title = $this->app->label($def['title'], $name);
        $this->app->render('dashboard', ['def' => $def, 'items' => $items]);
    }
}
