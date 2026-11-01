<?php
namespace MiB;

/** A datasource (table, view or custom SQL) with its fields, queries, lookups and CRUD. */
class Table
{
    public $app;
    public $def;
    public $name;
    /** @var Db */
    public $db;
    /** @var Rest|null set for REST datasources */
    public $rest;
    /** Records read whole and filtered in PHP: REST and stored procedure sources */
    public $memory = false;
    private $fieldsByName = [];

    public function __construct(App $app, array $def)
    {
        $this->app = $app;
        $this->def = $def;
        $this->name = $def['name'];
        $this->db = $app->db($def['connection']);
        if ($def['source']['type'] === 'rest') $this->rest = $this->db->rest;
        $this->memory = in_array($def['source']['type'], ['rest', 'proc'], true);
        foreach ($def['fields'] as $f) $this->fieldsByName[$f['name']] = $f;
        $app->event($this->name, 'TableInit', []);
    }

    /** Method suffix for per-field generated code (Default_x, AutoUpdate_x, LookupWhere_x, ViewAs_x). */
    public static function ident($name)
    {
        $s = preg_replace('/[^A-Za-z0-9_]/', '_', $name);
        return preg_match('/^[0-9]/', $s) ? '_' . $s : $s;
    }

    /** PHP turns spaces and dots of top-level form names into underscores. */
    public static function postValue(array $post, $name)
    {
        if (array_key_exists($name, $post)) return $post[$name];
        $mangled = strtr($name, ' .', '__');
        return array_key_exists($mangled, $post) ? $post[$mangled] : null;
    }

    /** Value of a PHP default/auto-update expression imported from .phpr projects. */
    private function codeValue($kind, $f)
    {
        $r = $this->app->event($this->name, $kind . '_' . self::ident($f['name']), []);
        return $r === true ? null : $r;
    }

    public function caption()
    {
        return $this->app->label($this->def['caption'], $this->name);
    }

    public function field($name)
    {
        return isset($this->fieldsByName[$name]) ? $this->fieldsByName[$name] : null;
    }

    public function fieldLabel($f)
    {
        if (is_string($f)) $f = $this->field($f);
        return $this->app->label($f['label'], $f['name']);
    }

    /** Fields shown on a page type: list, view, add, edit, search, export, import, print. */
    public function fields($where)
    {
        $out = [];
        foreach ($this->def['fields'] as $f) if (!empty($f['show'][$where]) && !isset(Compat::$hiddenFields[$f['name']])) $out[] = $f;
        return $out;
    }

    public function page($type)
    {
        return isset($this->def['pages'][$type]) ? $this->def['pages'][$type] : ['enabled' => false];
    }

    public function enabled($type)
    {
        $p = $this->page($type);
        if (empty($p['enabled'])) return false;
        if (!empty($this->def['readOnly']) && in_array($type, ['add', 'edit', 'delete', 'import'], true)) return false;
        // stored procedure source: writable through the procedures set for insert / update / delete
        if ($this->def['source']['type'] === 'proc' && in_array($type, ['add', 'edit', 'delete', 'import'], true)) return Proc::writes($this, ['add' => 'insert', 'import' => 'insert', 'edit' => 'update', 'delete' => 'delete'][$type]);
        return true;
    }

    /** "Update selected" on the list: edit page and permission, a writable source, option not turned off. */
    public function canUpdateSelected()
    {
        return $this->enabled('edit') && $this->app->security->can($this->name, 'E') && ($this->writeTable() !== null || Proc::writes($this, 'update'))
            && (!isset($this->def['pages']['list']['updateSelected']) || $this->def['pages']['list']['updateSelected']);
    }

    /** Fields that "Update selected" can set: editable, not keys, not files or passwords. */
    public function bulkFields()
    {
        $keys = $this->def['keys'];
        return array_values(array_filter($this->fields('edit'), function ($f) use ($keys) {
            return !in_array($f['editAs']['type'], ['readonly', 'hidden', 'file', 'image', 'password'], true) && !in_array($f['name'], $keys, true);
        }));
    }

    public function writeTable()
    {
        $s = $this->def['source'];
        if ($s['type'] === 'table') return $s['table'];
        if ($s['type'] === 'rest') return empty($this->def['readOnly']) ? $s['path'] : null;
        if ($s['type'] === 'proc') return null;
        return !empty($s['updateTable']) ? $s['updateTable'] : null;
    }

    // --- query building --------------------------------------------------------

    public function from()
    {
        $s = $this->def['source'];
        if ($s['type'] === 'sql') {
            $sql = rtrim(trim($s['sql']), ';');
            return "($sql) src";
        }
        return $this->db->table($s['table']) . ' src';
    }

    public function col($name)
    {
        return 'src.' . $this->db->q($name);
    }

    private function selectList($withBlobs = false)
    {
        $cols = [];
        foreach ($this->def['fields'] as $f) {
            if (!$withBlobs && $this->isDbFile($f)) continue;
            $cols[] = $this->col($f['name']);
        }
        return $cols ? implode(', ', $cols) : 'src.*';
    }

    public function isDbFile($f)
    {
        return in_array($f['editAs']['type'], ['file', 'image'], true)
            && (isset($f['editAs']['upload']['storage']) ? $f['editAs']['upload']['storage'] : 'folder') === 'database';
    }

    /**
     * WHERE clause from request filters.
     * $req keys: q (quick search), s (advanced search), f (filter panel), master ['table'=>..,'keys'=>[..]]
     */
    public function buildWhere(array $req, $page = 'list')
    {
        $w = [];
        $p = [];
        // Master-detail restriction.
        if (!empty($req['master'])) {
            foreach ($req['master'] as $col => $val) { $w[] = $this->col($col) . ' = ?'; $p[] = $val; }
        }
        // Quick search over searchable fields.
        $q = isset($req['q']) ? trim((string)$req['q']) : '';
        if ($q !== '') {
            $or = [];
            foreach ($this->fields('search') as $f) {
                if ($this->isDbFile($f) || Crypto::isEncrypted($f)) continue;
                $lk = $this->lookupDef($f);
                if ($lk && $lk['kind'] === 'table' && empty($lk['multiple'])) {
                    $lt = $this->lookupTableDb($lk);
                    $or[] = $this->col($f['name']) . ' IN (SELECT ' . $lt->q($lk['key']) . ' FROM ' . $lt->table($lk['table']) . ' WHERE '
                        . $lt->like($this->lookupDisplayExpr($lk, $lt)) . ')';
                    $p[] = "%$q%";
                } elseif ($lk && $lk['kind'] === 'list') {
                    $vals = [];
                    foreach ($lk['values'] as $v) if (stripos($this->app->label($v['label'], (string)$v['value']), $q) !== false) $vals[] = $v['value'];
                    if ($vals) { $or[] = $this->col($f['name']) . ' IN (' . implode(',', array_fill(0, count($vals), '?')) . ')'; $p = array_merge($p, $vals); }
                } elseif (in_array($f['type'], ['int', 'decimal'], true)) {
                    if (is_numeric(str_replace(',', '.', $q))) { $or[] = $this->col($f['name']) . ' = ?'; $p[] = str_replace(',', '.', $q); }
                } elseif ($f['type'] !== 'bool') {
                    $or[] = $this->db->like($this->col($f['name']));
                    $p[] = "%$q%";
                }
            }
            $w[] = $or ? '(' . implode(' OR ', $or) . ')' : '1=0';
        }
        // Advanced search: s[field] = [op, v, v2]
        if (!empty($req['s']) && is_array($req['s'])) {
            foreach ($req['s'] as $name => $c) {
                $f = $this->field($name);
                if (!$f || empty($f['show']['search']) || !is_array($c)) continue;
                $op = isset($c['op']) ? $c['op'] : 'contains';
                // encrypted values differ at every save: only "empty / not empty" can be asked to the database
                if (Crypto::isEncrypted($f) && !in_array($op, ['empty', 'notempty'], true)) continue;
                $v = isset($c['v']) ? $c['v'] : '';
                $v2 = isset($c['v2']) ? $c['v2'] : '';
                if (is_array($v)) {
                    $v = array_values(array_filter($v, function ($x) { return $x !== ''; }));
                    if (!$v) continue;
                    $w[] = $this->col($name) . ' IN (' . implode(',', array_fill(0, count($v), '?')) . ')';
                    $p = array_merge($p, $v);
                    continue;
                }
                if ($v === '' && !in_array($op, ['empty', 'notempty'], true)) continue;
                $col = $this->col($name);
                switch ($op) {
                    case 'equals': $w[] = "$col = ?"; $p[] = $v; break;
                    case 'notequals': $w[] = "($col <> ? OR $col IS NULL)"; $p[] = $v; break;
                    case 'starts': $w[] = $this->db->like($col); $p[] = "$v%"; break;
                    case 'more': $w[] = "$col > ?"; $p[] = $v; break;
                    case 'less': $w[] = "$col < ?"; $p[] = $v; break;
                    case 'between':
                        $w[] = "$col >= ?"; $p[] = $v;
                        if ($v2 !== '') { $w[] = "$col <= ?"; $p[] = $this->endOfDay($f, $v2); }
                        break;
                    case 'empty': $w[] = "($col IS NULL OR " . $this->db->like($col) . ')'; $p[] = ''; break;
                    case 'notempty': $w[] = "($col IS NOT NULL AND NOT " . $this->db->like($col) . ')'; $p[] = ''; break;
                    default: $w[] = $this->db->like($col); $p[] = "%$v%";
                }
            }
        }
        // Filter panel: f[field][] = value
        if (!empty($req['f']) && is_array($req['f'])) {
            foreach ($req['f'] as $name => $vals) {
                $f = $this->field($name);
                if (!$f || empty($f['filter']) || Crypto::isEncrypted($f) || !is_array($vals) || !$vals) continue;
                $w[] = $this->col($name) . ' IN (' . implode(',', array_fill(0, count($vals), '?')) . ')';
                $p = array_merge($p, array_values($vals));
            }
        }
        // Row ownership (advanced security).
        $own = $this->app->security->ownership($this->name);
        if ($own) { $w[] = $this->col($own['field']) . ' = ?'; $p[] = userId(); }
        // Static WHERE from the designer.
        if (!empty($this->def['where'])) $w[] = '(' . $this->def['where'] . ')';
        // BeforeSelect event can add raw SQL.
        $extra = '';
        $order = '';
        $this->app->event($this->name, 'BeforeSelect', [&$extra, &$order, $page]);
        if (trim($extra) !== '') $w[] = '(' . $extra . ')';
        $order = preg_replace('/^\s*order\s+by\s+/i', '', (string)$order);
        return [$w ? implode(' AND ', $w) : '1=1', $p, $order];
    }

    private function endOfDay($f, $v)
    {
        return ($f['type'] === 'datetime' && strlen($v) === 10) ? $v . ' 23:59:59' : $v;
    }

    public function orderBy($sort, $dir, $eventOrder = '')
    {
        if ($eventOrder !== '') return $eventOrder;
        if ($sort && ($f = $this->field($sort))) return $this->col($f['name']) . (strtolower($dir) === 'desc' ? ' DESC' : ' ASC');
        $ds = isset($this->def['pages']['list']['defaultSort']) ? $this->def['pages']['list']['defaultSort'] : null;
        if ($ds && !empty($ds['field']) && $this->field($ds['field'])) return $this->col($ds['field']) . (isset($ds['dir']) && $ds['dir'] === 'desc' ? ' DESC' : ' ASC');
        if ($this->def['keys']) return implode(', ', array_map([$this, 'col'], $this->def['keys']));
        return '';
    }

    public function count(array $req, $page = 'list')
    {
        if ($this->memory) return Rest::count($this, $req);
        list($w, $p) = $this->buildWhere($req, $page);
        return (int)$this->db->value('SELECT COUNT(*) FROM ' . $this->from() . " WHERE $w", $p);
    }

    public function fetch(array $req, $limit, $offset, $sort = '', $dir = 'asc', $page = 'list')
    {
        if ($this->memory) return Rest::fetch($this, $req, $limit, $offset, $sort, $dir);
        list($w, $p, $eo) = $this->buildWhere($req, $page);
        $sql = 'SELECT ' . $this->selectList() . ' FROM ' . $this->from() . " WHERE $w";
        $sql = $limit > 0 ? $this->db->limit($sql, $limit, $offset, $this->orderBy($sort, $dir, $eo))
            : $sql . (($o = $this->orderBy($sort, $dir, $eo)) !== '' ? " ORDER BY $o" : '');
        return Crypto::decryptRows($this, $this->db->all($sql, $p));
    }

    /** Aggregates for list totals: field => [sum|avg|count => value] */
    public function totals(array $req, $page = 'list')
    {
        if ($this->memory) return Rest::totals($this, $req);
        $exprs = [];
        foreach ($this->fields('list') as $f) {
            if (empty($f['totals'])) continue;
            $fn = strtoupper($f['totals']);
            if (!in_array($fn, ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'], true)) continue;
            $exprs[] = "$fn(" . $this->col($f['name']) . ') AS ' . $this->db->q('t_' . $f['name']);
        }
        if (!$exprs) return [];
        list($w, $p) = $this->buildWhere($req, $page);
        $r = $this->db->row('SELECT ' . implode(', ', $exprs) . ' FROM ' . $this->from() . " WHERE $w", $p);
        $out = [];
        foreach ($this->fields('list') as $f) if (!empty($f['totals'])) {
            foreach ($r as $k => $v) if (strtolower($k) === strtolower('t_' . $f['name'])) $out[$f['name']] = $v;
        }
        return $out;
    }

    public function keysFromRow(array $row)
    {
        $k = [];
        foreach ($this->def['keys'] as $c) $k[$c] = isset($row[$c]) ? $row[$c] : null;
        return $k;
    }

    /** Keys from the k[] request parameter, validated against the key columns. */
    public function keysFromRequest($src = null)
    {
        $src = $src === null ? $_GET : $src;
        $k = isset($src['k']) && is_array($src['k']) ? $src['k'] : [];
        $out = [];
        foreach ($this->def['keys'] as $c) {
            if (!isset($k[$c]) || $k[$c] === '') throw new HttpError(t('error.notfound'), 404);
            $out[$c] = (string)$k[$c];
        }
        if (!$out) throw new HttpError(t('error.nokey'), 400);
        return $out;
    }

    public function fetchOne(array $keys, $withBlobs = false)
    {
        if ($this->memory) return Rest::fetchOne($this, $keys);
        $where = [];
        $params = [];
        foreach ($keys as $c => $v) { $where[] = $this->col($c) . ' = ?'; $params[] = $v; }
        $own = $this->app->security->ownership($this->name);
        if ($own) { $where[] = $this->col($own['field']) . ' = ?'; $params[] = userId(); }
        if (!empty($this->def['where'])) $where[] = '(' . $this->def['where'] . ')';
        // BeforeSelect also restricts single records (edit/view/delete), like the classic BeforeQueryEdit/View.
        $extra = '';
        $order = '';
        $this->app->event($this->name, 'BeforeSelect', [&$extra, &$order, $this->app->page]);
        if (trim($extra) !== '') $where[] = '(' . $extra . ')';
        return Crypto::decryptRow($this, $this->db->row('SELECT ' . $this->selectList($withBlobs) . ' FROM ' . $this->from() . ' WHERE ' . implode(' AND ', $where), $params));
    }

    // --- lookups ---------------------------------------------------------------

    public function lookupDef($f)
    {
        if (is_string($f)) $f = $this->field($f);
        if (!$f) return null;
        $t = $f['editAs']['type'];
        if (!in_array($t, ['select', 'radio', 'checkboxes', 'autocomplete'], true) || empty($f['editAs']['lookup'])) return null;
        $lk = $f['editAs']['lookup'];
        if (!isset($lk['kind'])) $lk['kind'] = 'table';
        if ($t === 'checkboxes') $lk['multiple'] = true;
        return $lk;
    }

    /** @return Db */
    private function lookupTableDb($lk)
    {
        if (!empty($lk['connection'])) return $this->app->db($lk['connection']);
        if ($this->app->hasTable($lk['table'])) return $this->app->table($lk['table'])->db;
        // A REST datasource has no SQL: lookups to plain tables go to the main database.
        return $this->rest ? $this->app->db() : $this->db;
    }

    private function lookupDisplayExpr($lk, Db $db)
    {
        $d = isset($lk['display']) && $lk['display'] !== '' ? $lk['display'] : $lk['key'];
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $d)) return $db->q($d);
        // "{first} {last}" template -> CONCAT
        if (strpos($d, '{') !== false) {
            $parts = [];
            foreach (preg_split('/(\{[A-Za-z0-9_]+\})/', $d, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) as $tok) {
                $parts[] = preg_match('/^\{([A-Za-z0-9_]+)\}$/', $tok, $m) ? 'COALESCE(' . $this->castText($db, $db->q($m[1])) . ", '')" : $db->pdo->quote($tok);
            }
            return $db->concat($parts);
        }
        return $d; // raw SQL expression from the designer
    }

    private function castText(Db $db, $expr)
    {
        switch ($db->driver) {
            case 'mysql': return "CAST($expr AS CHAR)";
            case 'sqlsrv': return "CAST($expr AS NVARCHAR(4000))";
            case 'oracle': return "TO_CHAR($expr)";
            default: return "CAST($expr AS TEXT)";
        }
    }

    /** Options for a lookup field: [['value'=>..,'label'=>..], ...] */
    public function lookupOptions($f, $q = '', $parent = null, $limit = 0, ?array $only = null)
    {
        if (is_string($f)) $f = $this->field($f);
        $lk = $this->lookupDef($f);
        if (!$lk) return [];
        if ($lk['kind'] === 'list') {
            $out = [];
            foreach ($lk['values'] as $v) {
                $lab = $this->app->label($v['label'], (string)$v['value']);
                if ($only !== null && !in_array((string)$v['value'], array_map('strval', $only), true)) continue;
                if ($q !== '' && stripos($lab, $q) === false) continue;
                $out[] = ['value' => (string)$v['value'], 'label' => $lab];
            }
            return $out;
        }
        if (empty($lk['connection']) && $this->app->hasTable($lk['table']) && ($src = $this->app->table($lk['table'])) && $src->memory) {
            if ($only !== null && !$only) return [];
            return Rest::lookupOptions($src, $lk, $q, $parent, $limit, $only);
        }
        $db = $this->lookupTableDb($lk);
        $disp = $this->lookupDisplayExpr($lk, $db);
        $w = [];
        $p = [];
        if (!empty($lk['where'])) $w[] = '(' . $lk['where'] . ')';
        if (!empty($lk['whereCode'])) {
            $code = $this->app->event($this->name, 'LookupWhere_' . self::ident($f['name']), []);
            if (is_string($code) && trim($code) !== '') $w[] = '(' . $code . ')';
        }
        if (!empty($lk['dependsOn']['field']) && $parent !== null) { $w[] = $db->q($lk['dependsOn']['linkField']) . ' = ?'; $p[] = $parent; }
        if ($q !== '') { $w[] = $db->like($disp); $p[] = "%$q%"; }
        if ($only !== null) {
            if (!$only) return [];
            $w[] = $db->q($lk['key']) . ' IN (' . implode(',', array_fill(0, count($only), '?')) . ')';
            $p = array_merge($p, array_values($only));
        }
        $sql = 'SELECT ' . $db->q($lk['key']) . ' AS mc_v, ' . $disp . ' AS mc_l FROM ' . $db->table($lk['table']) . ($w ? ' WHERE ' . implode(' AND ', $w) : '');
        $order = !empty($lk['orderBy']) ? $lk['orderBy'] : $disp;
        $sql = $limit > 0 ? $db->limit($sql, $limit, 0, $order) : "$sql ORDER BY $order";
        $out = [];
        foreach ($db->all($sql, $p) as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $out[] = ['value' => (string)$r['mc_v'], 'label' => (string)$r['mc_l']];
        }
        return $out;
    }

    /** Add $row['__lk'][field] = display text for lookup fields of the given rows. */
    public function resolveLookups(array &$rows, array $fields)
    {
        foreach ($fields as $f) {
            $lk = $this->lookupDef($f);
            if (!$lk) continue;
            $vals = [];
            foreach ($rows as $r) {
                $v = isset($r[$f['name']]) ? $r[$f['name']] : null;
                if ($v === null || $v === '') continue;
                foreach (!empty($lk['multiple']) ? explode(',', (string)$v) : [(string)$v] as $x) $vals[trim($x)] = true;
            }
            $map = [];
            if ($vals) foreach (array_chunk(array_keys($vals), 500) as $chunk) {
                foreach ($this->lookupOptions($f, '', null, 0, array_map('strval', $chunk)) as $o) $map[$o['value']] = $o['label'];
            }
            foreach ($rows as &$r) {
                $v = isset($r[$f['name']]) ? (string)$r[$f['name']] : '';
                if ($v === '') { $r['__lk'][$f['name']] = ''; continue; }
                $parts = [];
                foreach (!empty($lk['multiple']) ? explode(',', $v) : [$v] as $x) $parts[] = isset($map[trim($x)]) ? $map[trim($x)] : trim($x);
                $r['__lk'][$f['name']] = implode(', ', $parts);
            }
            unset($r);
        }
    }

    /** Distinct values for the filter panel with counts. */
    public function filterValues($f, array $req)
    {
        unset($req['f'][$f['name']]);
        if ($this->memory) $rows = Rest::distinct($this, $req, $f['name']);
        else {
            list($w, $p) = $this->buildWhere($req, 'filter');
            $col = $this->col($f['name']);
            $rows = $this->db->all("SELECT $col AS mc_v, COUNT(*) AS mc_n FROM " . $this->from() . " WHERE $w GROUP BY $col ORDER BY $col", $p);
            $rows = array_map(function ($r) { return array_change_key_case($r, CASE_LOWER); }, $rows);
        }
        $fake = [];
        foreach ($rows as $r) $fake[] = [$f['name'] => $r['mc_v']];
        $this->resolveLookups($fake, [$f]);
        $out = [];
        foreach ($rows as $i => $r) {
            if ($r['mc_v'] === null) continue;
            $label = isset($fake[$i]['__lk'][$f['name']]) ? $fake[$i]['__lk'][$f['name']] : Format::plain($this, $f, $r['mc_v']);
            $out[] = ['value' => (string)$r['mc_v'], 'label' => $label, 'count' => (int)$r['mc_n']];
        }
        return $out;
    }

    // --- write -----------------------------------------------------------------

    /** Read submitted values for add/edit. Files are handled by Upload. */
    public function valuesFromPost($mode, array $post, $old = null)
    {
        $vals = [];
        foreach ($this->fields($mode) as $f) {
            $type = $f['editAs']['type'];
            $n = $f['name'];
            if ($type === 'readonly') continue;
            if (in_array($type, ['file', 'image'], true)) {
                $v = Upload::handle($this, $f, $old ? (isset($old[$n]) ? $old[$n] : null) : null);
                if ($v !== Upload::UNCHANGED) $vals[$n] = $v;
                continue;
            }
            $raw = self::postValue($post, $n);
            if ($type === 'password' && $mode === 'edit' && ($raw === null || $raw === '')) continue;
            if ($type === 'checkbox') { $vals[$n] = $raw ? 1 : 0; continue; }
            if (is_array($raw)) $raw = implode(',', array_map('strval', $raw));
            $vals[$n] = $this->normalizeInput($f, $raw);
        }
        // Auto values (e.g. created_at = {now} on add, updated_by = {user} on edit).
        foreach ($this->def['fields'] as $f) {
            $au = isset($f['autoUpdate'][$mode]) ? $f['autoUpdate'][$mode] : '';
            if ($au !== '' && $au !== null) $vals[$f['name']] = self::expand($au);
            if (!empty($f['autoUpdateCode']) && ($mode === 'edit' || $mode === 'add')) $vals[$f['name']] = $this->codeValue('AutoUpdate', $f);
        }
        return $vals;
    }

    /** Default value for the add form and for inserts. */
    public function defaultFor($f)
    {
        if (!empty($f['defaultCode'])) return $this->codeValue('Default', $f);
        if (isset($f['defaultValue']) && $f['defaultValue'] !== '') return self::expand($f['defaultValue']);
        return null;
    }

    public function normalizeInput($f, $raw)
    {
        if ($raw === null) return null;
        $raw = is_string($raw) ? trim($raw) : $raw;
        if ($raw === '') return $f['nullable'] ? null : ($f['type'] === 'int' || $f['type'] === 'decimal' ? null : '');
        switch ($f['type']) {
            case 'int': return is_numeric($raw) ? (string)(int)$raw : $raw;
            case 'decimal': return str_replace(',', '.', $raw);
            case 'datetime':
                $raw = str_replace('T', ' ', $raw);
                return strlen($raw) === 16 ? $raw . ':00' : $raw;
            case 'bool': return $raw ? 1 : 0;
        }
        if ($f['editAs']['type'] === 'password') return password_hash($raw, PASSWORD_DEFAULT);
        return $raw;
    }

    /** {now} {today} {user} {userid} {ip} tokens used in default and auto-update values. */
    public static function expand($expr)
    {
        $map = [
            '{now}' => date('Y-m-d H:i:s'), '{today}' => date('Y-m-d'), '{user}' => (string)userName(),
            '{userid}' => (string)userId(), '{ip}' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '',
        ];
        return strtr((string)$expr, $map);
    }

    /** Validation of a single field (inline edit, kanban moves). */
    public function validateField(array $f, $v, $keys = null)
    {
        $vals = [$f['name'] => $v];
        $all = $this->validate($vals, 'edit', $keys);
        return isset($all[$f['name']]) ? [$all[$f['name']]] : [];
    }

    /** Validation errors: field => message */
    public function validate(array $vals, $mode, $keys = null)
    {
        $errors = [];
        foreach ($this->fields($mode) as $f) {
            $n = $f['name'];
            $v = array_key_exists($n, $vals) ? $vals[$n] : null;
            $val = isset($f['validation']) ? $f['validation'] : [];
            $label = $this->fieldLabel($f);
            $isFile = in_array($f['editAs']['type'], ['file', 'image'], true);
            if (!empty($val['required']) && ($v === null || $v === '') && !in_array($f['editAs']['type'], ['readonly', 'checkbox'], true)) {
                if (!($isFile && $mode === 'edit' && !array_key_exists($n, $vals))) $errors[$n] = t('val.required', $label);
                continue;
            }
            if ($v === null || $v === '' || $isFile) continue;
            if (in_array($f['type'], ['int', 'decimal'], true) && !is_numeric($v)) $errors[$n] = t('val.number', $label);
            elseif (!empty($val['email']) || $f['editAs']['type'] === 'email') { if (!filter_var($v, FILTER_VALIDATE_EMAIL)) $errors[$n] = t('val.email', $label); }
            if (isset($errors[$n])) continue;
            if (isset($val['min']) && $val['min'] !== '' && is_numeric($v) && $v < $val['min']) $errors[$n] = t('val.min', $label, $val['min']);
            if (isset($val['max']) && $val['max'] !== '' && is_numeric($v) && $v > $val['max']) $errors[$n] = t('val.max', $label, $val['max']);
            if (!empty($val['minLength']) && mb_strlen((string)$v) < $val['minLength']) $errors[$n] = t('val.minlength', $label, $val['minLength']);
            if (!empty($val['maxLength']) && mb_strlen((string)$v) > $val['maxLength']) $errors[$n] = t('val.maxlength', $label, $val['maxLength']);
            if (!empty($val['regex']) && @preg_match('~' . str_replace('~', '\~', $val['regex']) . '~u', (string)$v) !== 1) {
                $errors[$n] = !empty($val['regexMessage']) ? $this->app->label($val['regexMessage']) : t('val.format', $label);
            }
            // an encrypted value is different at every save: the database cannot compare it
            if (!empty($val['unique']) && Crypto::isEncrypted($f)) {
                // not checked
            } elseif (!empty($val['unique']) && $this->memory) {
                if (Rest::exists($this, $n, $v, $keys)) $errors[$n] = t('val.unique', $label);
            } elseif (!empty($val['unique']) && ($wt = $this->writeTable())) {
                $sql = 'SELECT COUNT(*) FROM ' . $this->db->table($wt) . ' WHERE ' . $this->db->q($n) . ' = ?';
                $p = [$v];
                if ($keys) { list($kw, $kp) = $this->db->where($keys); $sql .= " AND NOT ($kw)"; $p = array_merge($p, $kp); }
                if ((int)$this->db->value($sql, $p) > 0) $errors[$n] = t('val.unique', $label);
            }
        }
        $this->app->event($this->name, 'CustomValidate', [$vals, &$errors, $mode]);
        return $errors;
    }

    private function onlyWritable(array $vals)
    {
        // Alias columns of SQL datasources are written to their real column.
        $out = [];
        foreach ($vals as $k => $v) {
            $f = $this->field($k);
            if ($f && empty($f['autoInc']) && empty($f['calculated'])) $out[!empty($f['column']) ? $f['column'] : $k] = $v;
        }
        return $out;
    }

    public function autoField()
    {
        foreach ($this->def['fields'] as $f) if (!empty($f['autoInc'])) return $f['name'];
        return null;
    }

    /** Returns [ok, keys|null, message] */
    public function insert(array $vals, $page = 'add')
    {
        $wt = $this->writeTable();
        $viaProc = Proc::writes($this, 'insert');
        if (!$wt && !$viaProc) return [false, null, t('error.readonly')];
        foreach ($this->def['fields'] as $f) {
            if (!array_key_exists($f['name'], $vals) && empty($f['autoInc']) && ($d = $this->defaultFor($f)) !== null) $vals[$f['name']] = $d;
        }
        $own = $this->app->security->ownership($this->name, true);
        if ($own) $vals[$own['field']] = userId();
        $msg = '';
        if ($this->app->event($this->name, 'BeforeAdd', [&$vals, &$msg, $page]) === false) return [false, null, $msg ?: t('msg.cancelled')];
        Geocode::apply($this, $vals);
        $plain = $vals;
        Crypto::encryptValues($this, $vals);
        $vals = $this->onlyWritable($vals);
        $auto = $this->autoField();
        if ($viaProc) $keys = Proc::write($this, 'insert', $vals, [], null);
        elseif ($this->rest) $keys = Rest::insert($this, $vals);
        else {
            $id = $this->db->insert($wt, $this->blobs($vals), $auto);
            $keys = [];
            foreach ($this->def['keys'] as $k) $keys[$k] = ($k === $auto) ? $id : (isset($vals[$k]) ? $vals[$k] : null);
        }
        Audit::log($this, 'add', $keys, null, $vals);
        $this->app->event($this->name, 'AfterAdd', [array_merge($vals, array_intersect_key($plain, $vals)), $keys, $page]);
        return [true, $keys, ''];
    }

    public function update(array $keys, array $vals, $page = 'edit')
    {
        $wt = $this->writeTable();
        $viaProc = Proc::writes($this, 'update');
        if (!$wt && !$viaProc) return [false, t('error.readonly')];
        $old = $this->fetchOne($keys, true);
        if (!$old) return [false, t('error.notfound')];
        $msg = '';
        if ($this->app->event($this->name, 'BeforeEdit', [&$vals, $old, &$msg, $page]) === false) return [false, $msg ?: t('msg.cancelled')];
        Geocode::apply($this, $vals, $old);
        $plain = $vals;
        Crypto::encryptValues($this, $vals);
        $vals = $this->onlyWritable($vals);
        if ($viaProc) Proc::write($this, 'update', $vals, $keys, $old);
        elseif ($this->rest) Rest::update($this, $keys, $vals, $old);
        else $this->db->update($wt, $this->blobs($vals), $keys);
        $newKeys = $keys;
        foreach ($keys as $k => $v) if (array_key_exists($k, $vals)) $newKeys[$k] = $vals[$k];
        Audit::log($this, 'edit', $keys, $old, $vals);
        $this->app->event($this->name, 'AfterEdit', [array_merge($vals, array_intersect_key($plain, $vals)), $old, $newKeys, $page]);
        return [true, ''];
    }

    public function delete(array $keys, $page = 'list')
    {
        $wt = $this->writeTable();
        $viaProc = Proc::writes($this, 'delete');
        if (!$wt && !$viaProc) return [false, t('error.readonly')];
        $old = $this->fetchOne($keys);
        if (!$old) return [false, t('error.notfound')];
        $msg = '';
        if ($this->app->event($this->name, 'BeforeDelete', [$old, &$msg, $page]) === false) return [false, $msg ?: t('msg.cancelled')];
        if ($viaProc) Proc::write($this, 'delete', [], $keys, $old);
        elseif ($this->rest) Rest::delete($this, $keys);
        else $this->db->delete($wt, $keys);
        Upload::removeFiles($this, $old);
        Audit::log($this, 'delete', $keys, $old, null);
        $this->app->event($this->name, 'AfterDelete', [$old, $page]);
        return [true, ''];
    }

    private function blobs(array $vals)
    {
        foreach ($vals as $k => $v) {
            $f = $this->field($k);
            if ($f && $this->isDbFile($f) && $v !== null) $vals[$k] = ['__lob' => $v];
        }
        return $vals;
    }

    /** Master links where this table is the detail: [['master'=>..,'masterKeys'=>..,'detailKeys'=>..], ..] */
    public function masters()
    {
        return isset($this->def['masters']) ? $this->def['masters'] : [];
    }

    public function details()
    {
        $out = [];
        foreach (isset($this->def['details']) ? $this->def['details'] : [] as $d) if ($this->app->hasTable($d['table'])) $out[] = $d;
        return $out;
    }
}
