<?php
namespace MiB;

/** Web report & chart builder for end users: definitions stored in mc_reports. */
class Builder
{
    public static function enabled(App $app)
    {
        $b = $app->setting('webBuilder', []);
        if (empty($b['enabled']) || !$app->security->user() && $app->security->enabled()) return false;
        if (empty($b['groups']) || $app->security->isAdmin()) return true;
        return (bool)array_intersect($b['groups'], $app->security->groups());
    }

    /** Definition of a saved item visible to the current user, in the format of project reports/charts. */
    public static function load($id, $kind)
    {
        $app = App::$i;
        $db = $app->db();
        $row = $db->row('SELECT * FROM ' . $db->table(Schema::t('reports')) . ' WHERE ' . $db->q('id') . ' = ? AND ' . $db->q('kind') . ' = ?', [(int)$id, $kind]);
        if (!$row) throw new HttpError(t('error.notfound'), 404);
        $row = array_change_key_case($row, CASE_LOWER);
        if ($row['owner'] !== (string)userName() && empty($row['shared']) && !isAdmin()) throw new HttpError(t('error.denied'), 403);
        $def = json_decode((string)$row['def'], true) ?: [];
        $def['title'] = $row['title'];
        $def['table'] = $row['table_name'];
        $app->security->check($def['table'], 'S');
        return $def;
    }

    private static function lower(array $rows)
    {
        return array_map(function ($r) { return array_change_key_case($r, CASE_LOWER); }, $rows);
    }

    public static function page(App $app)
    {
        if (!self::enabled($app)) throw new HttpError(t('error.denied'), 403);
        $db = $app->db();
        $tbl = Schema::t('reports');
        $me = (string)userName();
        $tables = [];
        foreach ($app->config['tables'] as $name => $file) if ($app->security->can($name, 'S') && $app->table($name)->enabled('list')) $tables[$name] = $app->table($name)->caption();
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
            if (!empty($_POST['delete'])) {
                $db->query('DELETE FROM ' . $db->table($tbl) . ' WHERE ' . $db->q('id') . ' = ? AND (' . $db->q('owner') . ' = ? OR ?)', [$id, $me, isAdmin() ? 1 : 0]);
                $app->flash('success', t('msg.deleted', 1));
                redirect($app->url('builder'));
            }
            $table = (string)$_POST['table'];
            if (!isset($tables[$table])) throw new HttpError(t('error.denied'), 403);
            $t = $app->table($table);
            $okField = function ($f) use ($t) { return $f !== '' && $t->field($f) !== null; };
            $kind = $_POST['kind'] === 'chart' ? 'chart' : 'report';
            $def = [];
            if ($kind === 'report') {
                $def['groups'] = [];
                foreach ((array)($_POST['g'] ?? []) as $g) if ($okField($g['field'] ?? '')) $def['groups'][] = ['field' => $g['field'], 'interval' => (string)($g['interval'] ?? '')];
                $def['aggregates'] = [];
                foreach ((array)($_POST['a'] ?? []) as $a) if ($okField($a['field'] ?? '') && in_array($a['fn'] ?? '', ['sum', 'avg', 'count', 'min', 'max'], true)) $def['aggregates'][] = ['field' => $a['field'], 'fn' => $a['fn']];
                $def['columns'] = array_values(array_filter((array)($_POST['columns'] ?? []), $okField));
                $def['showDetails'] = !empty($_POST['showDetails']);
            } else {
                $def['type'] = in_array($_POST['type'] ?? '', ['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'rose', 'funnel', 'treemap', 'radar', 'gauge'], true) ? $_POST['type'] : 'bar';
                $def['labelField'] = $okField($_POST['labelField'] ?? '') ? $_POST['labelField'] : $t->def['fields'][0]['name'];
                $def['labelInterval'] = (string)($_POST['labelInterval'] ?? '');
                $def['series'] = [];
                foreach ((array)($_POST['s'] ?? []) as $sv) if ($okField($sv['field'] ?? '') && in_array($sv['fn'] ?? '', ['sum', 'avg', 'count', 'min', 'max'], true)) $def['series'][] = ['field' => $sv['field'], 'fn' => $sv['fn']];
            }
            $vals = ['owner' => $me, 'kind' => $kind, 'title' => trim((string)$_POST['title']) ?: $tables[$table], 'table_name' => $table, 'def' => json_encode($def), 'shared' => empty($_POST['shared']) ? 0 : 1];
            if ($id) {
                $db->query('UPDATE ' . $db->table($tbl) . ' SET ' . $db->q('title') . ' = ?, ' . $db->q('table_name') . ' = ?, ' . $db->q('def') . ' = ?, ' . $db->q('shared') . ' = ?, ' . $db->q('kind') . ' = ? WHERE ' . $db->q('id') . ' = ? AND ' . $db->q('owner') . ' = ?',
                    [$vals['title'], $table, $vals['def'], $vals['shared'], $kind, $id, $me]);
            } else {
                $vals['created_at'] = $db->now();
                $id = $db->insert($tbl, $vals, 'id');
            }
            $app->flash('success', t('msg.saved'));
            redirect($app->url($kind === 'chart' ? 'chart' : 'report', [$kind === 'chart' ? 'c' : 'r' => 'u:' . $id]));
        }
        $items = self::lower($db->all('SELECT * FROM ' . $db->table($tbl) . ' WHERE ' . $db->q('owner') . ' = ? OR ' . $db->q('shared') . ' = 1 ORDER BY ' . $db->q('title'), [$me]));
        $items = array_values(array_filter($items, function ($r) use ($app) { return $app->hasTable($r['table_name']) && $app->security->can($r['table_name'], 'S'); }));
        $edit = null;
        if (isset($_GET['id'])) {
            if ($_GET['id'] === 'new') $edit = ['id' => 0, 'kind' => isset($_GET['kind']) && $_GET['kind'] === 'chart' ? 'chart' : 'report', 'title' => '', 'table_name' => isset($_GET['t']) ? (string)$_GET['t'] : key($tables), 'def' => [], 'shared' => 0, 'owner' => $me];
            else foreach ($items as $r) if ((string)$r['id'] === (string)$_GET['id'] && $r['owner'] === $me) { $edit = $r; $edit['def'] = json_decode((string)$r['def'], true) ?: []; }
        }
        $app->title = t('builder.title');
        $fields = [];
        if ($edit && isset($tables[$edit['table_name']])) foreach ($app->table($edit['table_name'])->fields('list') as $f) $fields[$f['name']] = $app->table($edit['table_name'])->fieldLabel($f);
        $app->render('builder', ['items' => $items, 'edit' => $edit, 'tables' => $tables, 'fields' => $fields, 'me' => $me]);
    }
}
