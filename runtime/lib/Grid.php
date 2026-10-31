<?php
namespace MiB;

/**
 * List grid rendered by DataTables in server-side mode: column model, row cells and the
 * JSON endpoint (index.php?p=dt&t=...). Sorting, paging and global search run in SQL.
 */
class Grid
{
    /** Columns: [check?, actions, fields...] */
    public static function columns(Table $t, $canDel, $embedded)
    {
        $cols = [];
        if ($canDel && !$embedded) $cols[] = ['key' => '_check', 'orderable' => false, 'className' => 'mc-col-check'];
        $cols[] = ['key' => '_actions', 'orderable' => false, 'className' => 'mc-col-actions text-nowrap'];
        foreach ($t->fields('list') as $f) {
            $num = in_array($f['viewAs']['type'], ['number', 'currency', 'percent'], true);
            $cols[] = ['key' => $f['name'], 'field' => $f, 'orderable' => !$t->isDbFile($f), 'className' => $num ? 'text-end' : ''];
        }
        return $cols;
    }

    public static function details(Table $t)
    {
        $out = [];
        foreach ($t->details() as $d) if (in_array('list', isset($d['showIn']) ? $d['showIn'] : [], true) && $t->app->security->can($d['table'], 'S')) $out[] = $d;
        return $out;
    }

    public static function actions(Table $t, array $row, array $base, $embedded)
    {
        $app = $t->app;
        $sec = $app->security;
        if (!$t->def['keys']) return '';
        $keys = $t->keysFromRow($row);
        $kq = array_merge($base, ['k' => $keys]);
        $actions = isset($t->def['pages']['list']['rowActions']) ? $t->def['pages']['list']['rowActions'] : ['view', 'edit', 'delete'];
        $top = $embedded ? ' target="_top"' : '';
        $h = '';
        $pop = function ($type) use ($t) { return (isset($t->def['pages'][$type]['mode']) && $t->def['pages'][$type]['mode'] === 'popup') ? ' mc-popup-link' : ''; };
        if (in_array('view', $actions, true) && $t->enabled('view') && $sec->can($t->name, 'V')) $h .= '<a class="btn btn-sm btn-link px-1' . $pop('view') . '" title="' . h(t('btn.view')) . '" href="' . h($app->url('view', $kq)) . '"' . $top . '><i class="bi bi-eye"></i></a>';
        if (in_array('edit', $actions, true) && $t->enabled('edit') && $sec->can($t->name, 'E')) $h .= '<a class="btn btn-sm btn-link px-1' . $pop('edit') . '" title="' . h(t('btn.edit')) . '" href="' . h($app->url('edit', $kq)) . '"' . $top . '><i class="bi bi-pencil"></i></a>';
        if (in_array('copy', $actions, true) && $t->enabled('add') && $sec->can($t->name, 'A')) $h .= '<a class="btn btn-sm btn-link px-1" title="' . h(t('btn.copy')) . '" href="' . h($app->url('add', array_merge($kq, ['copy' => 1]))) . '"' . $top . '><i class="bi bi-copy"></i></a>';
        if (in_array('delete', $actions, true) && $t->enabled('delete') && $sec->can($t->name, 'D') && !$embedded) $h .= '<button class="btn btn-sm btn-link px-1 text-danger mc-delete-one" title="' . h(t('btn.delete')) . '" type="button" data-keys="' . h(json_encode($keys)) . '"><i class="bi bi-trash"></i></button>';
        $h .= Buttons::html($t, 'list', true, $keys);
        foreach (self::details($t) as $d) {
            $h .= '<a class="btn btn-sm btn-link px-1" title="' . h($app->table($d['table'])->caption()) . '" href="' . h($app->url('list', ['t' => $d['table'], 'mt' => $t->name, 'mk' => $keys])) . '"' . $top . '><i class="bi bi-diagram-3"></i></a>';
        }
        return $h;
    }

    const INLINE_TYPES = ['text', 'textarea', 'number', 'email', 'date', 'datetime', 'time', 'select', 'radio', 'checkbox', 'color'];

    /** Field names editable directly in the grid cells (pages.list.inlineEdit). */
    public static function inlineFields(Table $t)
    {
        if (empty($t->def['pages']['list']['inlineEdit']) || !$t->enabled('edit') || !$t->app->security->can($t->name, 'E') || !$t->def['keys']) return self::viewFields($t);
        $out = [];
        foreach ($t->fields('edit') as $f) if (in_array($f['editAs']['type'], self::INLINE_TYPES, true) && empty($f['editAs']['lookup']['multiple'])) $out[] = $f['name'];
        return $out;
    }

    /** Fields changed by dragging in calendar/kanban views (always allowed with the Edit right). */
    public static function viewFields(Table $t)
    {
        if (!$t->enabled('edit') || !$t->app->security->can($t->name, 'E') || !$t->def['keys']) return [];
        $out = [];
        foreach (isset($t->def['pages']['list']['views']) ? $t->def['pages']['list']['views'] : [] as $v) {
            foreach (['dateField', 'endField', 'statusField'] as $k) if (!empty($v[$k])) $out[] = $v[$k];
        }
        return $out;
    }

    /** One DataTables row: cell HTML by position, plus row/cell styles from events. */
    public static function row(Table $t, array $row, array $cols, array $base, $embedded)
    {
        $cells = [];
        $css = [];
        foreach ($cols as $i => $c) {
            if ($c['key'] === '_check') $cells[] = '<input type="checkbox" class="form-check-input mc-check" name="sel[]" value="' . h(json_encode($t->keysFromRow($row))) . '">';
            elseif ($c['key'] === '_actions') $cells[] = self::actions($t, $row, $base, $embedded);
            else {
                $cells[] = Format::html($t, $c['field'], $row, 'list');
                if (isset($row['__css'][$c['key']])) $css[$i] = $row['__css'][$c['key']];
            }
        }
        $out = ['cells' => $cells, 'k' => $t->keysFromRow($row)];
        if ($css) $out['css'] = $css;
        if (isset($row['__rowcss'])) $out['rowcss'] = $row['__rowcss'];
        return $out;
    }

    /** DataTables server-side request -> JSON. */
    public static function serve(App $app, Table $t, $master, array $req)
    {
        $page = $t->page('list');
        $embedded = !empty($_GET['embed']);
        $canDel = $t->enabled('delete') && $app->security->can($t->name, 'D');
        $cols = self::columns($t, $canDel || $t->canUpdateSelected(), $embedded);
        $draw = isset($_GET['draw']) ? (int)$_GET['draw'] : 0;
        $start = max(0, isset($_GET['start']) ? (int)$_GET['start'] : 0);
        $len = isset($_GET['length']) ? (int)$_GET['length'] : (int)$page['pageSize'];
        if ($len < 0) $len = 0; // "All"
        $len = min($len, 5000);
        if (isset($_GET['search']['value']) && $_GET['search']['value'] !== '') $req['q'] = (string)$_GET['search']['value'];
        $sort = '';
        $dir = 'asc';
        if (isset($_GET['order'][0]['column'])) {
            $ci = (int)$_GET['order'][0]['column'];
            if (isset($cols[$ci]['field']) && $cols[$ci]['orderable']) {
                $sort = $cols[$ci]['key'];
                $dir = isset($_GET['order'][0]['dir']) && $_GET['order'][0]['dir'] === 'desc' ? 'desc' : 'asc';
            }
        }
        $baseReq = ['master' => $req['master']];
        $total = $t->count($baseReq);
        $filtered = ($req['q'] !== '' || $req['s'] || $req['f']) ? $t->count($req) : $total;
        $rows = $t->fetch($req, $len, $len > 0 ? $start : 0, $sort, $dir);
        $t->resolveLookups($rows, $t->fields('list'));
        $app->event($t->name, 'BeforeShowList', [&$rows, 'list']);
        $base = ['t' => $t->name];
        if ($master) $base = array_merge($base, $master['qs']);
        $data = [];
        foreach ($rows as $r) $data[] = self::row($t, $r, $cols, $base, $embedded);
        $totals = [];
        if (!empty($page['totals'])) {
            foreach ($t->totals($req) as $name => $v) {
                $f = $t->field($name);
                $totals[$name] = t('agg.' . $f['totals']) . ' ' . ($f['totals'] === 'count' ? $v : Format::plain($t, $f, $v));
            }
        }
        $app->json(['draw' => $draw, 'recordsTotal' => $total, 'recordsFiltered' => $filtered, 'data' => $data, 'totals' => $totals]);
    }
}
