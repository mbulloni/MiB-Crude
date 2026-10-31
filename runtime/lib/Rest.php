<?php
namespace MiB;

/**
 * REST datasource (like the classic REST views): records come from a JSON API instead of SQL.
 * Without paging the list endpoint is read once per request and search, filters, sorting,
 * paging and totals run in memory. With source.paging the API pages the records: list pages,
 * quick search and sorting are delegated to it when it supports them, everything else (advanced
 * search, filter panel, totals, reports, charts, lookups) reads all the pages and works in memory.
 * Single records, insert, update and delete use the item endpoint when configured.
 *
 * Connection: driver "rest", url, auth (none|bearer|basic|header|query), user (basic user or
 * header/query parameter name); password from secrets = token or password.
 * Table source: {type: rest, path, dataPath, itemPath, itemDataPath, updateMethod, paging}
 * paging: {mode: page|offset, pageParam, firstPage, offsetParam, sizeParam, pageSize, totalPath,
 *          searchParam, sortParam, dirParam} (no dirParam: descending sort is sent as "-field")
 */
class Rest
{
    /** Upper bound of records read from a paged API (same as reports). */
    const MAX_ROWS = 50000;
    private $c;
    private $secret;
    private static $cache = [];
    private $get = [];

    public function __construct(array $connection, $secret)
    {
        $this->c = $connection;
        $this->secret = (string)$secret;
    }

    /** HTTP call returning decoded JSON (or null for an empty body). */
    public function request($method, $path, $body = null)
    {
        if ($method === 'GET' && $body === null && array_key_exists($path, $this->get)) return $this->get[$path];
        if ($method !== 'GET') $this->get = [];
        $url = preg_match('~^https?://~', $path) ? $path : rtrim($this->c['url'], '/') . '/' . ltrim($path, '/');
        $headers = ['Accept: application/json', 'User-Agent: MiB-Crude'];
        $auth = isset($this->c['auth']) ? $this->c['auth'] : 'none';
        $user = isset($this->c['user']) ? $this->c['user'] : '';
        if ($auth === 'bearer') $headers[] = 'Authorization: Bearer ' . $this->secret;
        elseif ($auth === 'basic') $headers[] = 'Authorization: Basic ' . base64_encode($user . ':' . $this->secret);
        elseif ($auth === 'header' && $user !== '') $headers[] = $user . ': ' . $this->secret;
        elseif ($auth === 'query' && $user !== '') $url .= (strpos($url, '?') === false ? '?' : '&') . rawurlencode($user) . '=' . rawurlencode($this->secret);
        $payload = null;
        if ($body !== null) { $payload = json_encode($body); $headers[] = 'Content-Type: application/json'; }
        $ctx = stream_context_create(['http' => [
            'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $payload, 'ignore_errors' => true, 'timeout' => 30,
        ]]);
        $text = @file_get_contents($url, false, $ctx);
        if ($text === false) throw new \RuntimeException("REST $method $url: connessione non riuscita");
        $status = 0;
        // $http_response_header is set by file_get_contents in this scope.
        if (isset($http_response_header[0]) && preg_match('~\s(\d{3})~', $http_response_header[0], $m)) $status = (int)$m[1];
        if ($status >= 400) throw new \RuntimeException("REST $method $url: HTTP $status " . mb_substr(trim(strip_tags($text)), 0, 200));
        if (trim($text) === '') return null;
        $json = json_decode($text, true);
        if ($json === null && json_last_error() !== JSON_ERROR_NONE) throw new \RuntimeException("REST $method $url: risposta non JSON");
        if ($method === 'GET') $this->get[$path] = $json;
        return $json;
    }

    /** Value at a dotted path ("data.items"); empty path = the value itself. */
    public static function at($json, $path)
    {
        if ($path === '' || $path === null) return $json;
        foreach (explode('.', $path) as $k) {
            if (!is_array($json) || !array_key_exists($k, $json)) return null;
            $json = $json[$k];
        }
        return $json;
    }

    /** Flat record: nested objects become "a.b" columns, lists become JSON text. */
    public static function flatten(array $row, $prefix = '')
    {
        $out = [];
        foreach ($row as $k => $v) {
            $name = $prefix . $k;
            if (is_array($v) && $v && array_keys($v) !== range(0, count($v) - 1)) $out += self::flatten($v, "$name.");
            elseif (is_array($v)) $out[$name] = json_encode($v);
            else $out[$name] = is_bool($v) ? (int)$v : $v;
        }
        return $out;
    }

    /** Form values as JSON types (numbers, booleans, null) following the field types. */
    public static function typed(Table $t, array $vals)
    {
        foreach ($vals as $k => $v) {
            $f = $t->field($k);
            if (!$f || is_array($v)) continue;
            if ($v === '' && !empty($f['nullable'])) { $vals[$k] = null; continue; }
            if ($f['type'] === 'int' && is_numeric($v)) $vals[$k] = (int)$v;
            elseif ($f['type'] === 'decimal' && is_numeric($v)) $vals[$k] = (float)$v;
            elseif ($f['type'] === 'bool') $vals[$k] = (bool)$v;
        }
        return $vals;
    }

    /** Nested record from flat "a.b" columns (for writes). */
    public static function unflatten(array $vals)
    {
        $out = [];
        foreach ($vals as $k => $v) {
            $ref = &$out;
            foreach (explode('.', $k) as $part) { if (!isset($ref[$part]) || !is_array($ref[$part])) $ref[$part] = []; $ref = &$ref[$part]; }
            $ref = $v;
            unset($ref);
        }
        return $out;
    }

    // --- datasource operations used by Table ----------------------------------

    /** Paging settings of the source, or null when the API returns everything at once. */
    public static function paging(Table $t)
    {
        $p = isset($t->def['source']['paging']) ? $t->def['source']['paging'] : null;
        return is_array($p) && !empty($p['mode']) && in_array($p['mode'], ['page', 'offset'], true) ? $p : null;
    }

    /** Path with extra query parameters (empty values are left out). */
    private static function withQuery($path, array $params)
    {
        $params = array_filter($params, function ($v) { return $v !== null && $v !== ''; });
        return $params ? $path . (strpos($path, '?') === false ? '?' : '&') . http_build_query($params) : $path;
    }

    /** Query parameters for one page of $size records starting at $offset (null: not expressible). */
    private static function pageParams(array $pg, $offset, $size)
    {
        $sizeParam = isset($pg['sizeParam']) ? $pg['sizeParam'] : '';
        $out = $sizeParam !== '' ? [$sizeParam => $size] : [];
        if ($pg['mode'] === 'offset') {
            $out[!empty($pg['offsetParam']) ? $pg['offsetParam'] : 'offset'] = $offset;
            return $out;
        }
        if ($offset % $size !== 0) return null;
        $first = isset($pg['firstPage']) && $pg['firstPage'] !== '' ? (int)$pg['firstPage'] : 1;
        $out[!empty($pg['pageParam']) ? $pg['pageParam'] : 'page'] = $first + intdiv($offset, $size);
        return $out;
    }

    private static function listOf(Table $t, $json, $path)
    {
        $s = $t->def['source'];
        $list = self::at($json, isset($s['dataPath']) ? $s['dataPath'] : '');
        if (!is_array($list)) throw new \RuntimeException("REST $path: nessun elenco in \"" . (isset($s['dataPath']) ? $s['dataPath'] : '') . '"');
        $rows = [];
        foreach ($list as $r) if (is_array($r)) $rows[] = self::flatten($r);
        return $rows;
    }

    public static function all(Table $t)
    {
        $s = $t->def['source'];
        $key = $t->name;
        if (isset(self::$cache[$key])) return self::$cache[$key];
        $pg = self::paging($t);
        if (!$pg) return self::$cache[$key] = self::listOf($t, $t->rest->request('GET', $s['path']), $s['path']);
        // Read page after page: stop on a short or empty page, at the declared total, on a page
        // equal to the previous one (API ignoring the paging parameters) or at MAX_ROWS.
        $size = !empty($pg['pageSize']) ? max(1, (int)$pg['pageSize']) : 100;
        $rows = [];
        $prev = null;
        while (count($rows) < self::MAX_ROWS) {
            $path = self::withQuery($s['path'], self::pageParams($pg, count($rows), $size));
            $json = $t->rest->request('GET', $path);
            $page = self::listOf($t, $json, $path);
            $sig = md5(json_encode($page));
            if (!$page || $sig === $prev) break;
            $prev = $sig;
            $rows = array_merge($rows, $page);
            $total = !empty($pg['totalPath']) ? self::at($json, $pg['totalPath']) : null;
            if (count($page) < $size || (is_numeric($total) && count($rows) >= $total)) break;
        }
        return self::$cache[$key] = array_slice($rows, 0, self::MAX_ROWS);
    }

    /**
     * Query parameters when the API itself can answer the request (paging configured, only quick
     * search and sorting it supports, no ownership restriction); null means in-memory processing.
     */
    private static function delegated(Table $t, array $req, $sort, $dir)
    {
        $pg = self::paging($t);
        if (!$pg || !empty($req['master']) || !empty($req['f']) || $t->app->security->ownership($t->name)) return null;
        if (!empty($req['s']) && is_array($req['s'])) foreach ($req['s'] as $c) {
            if (!is_array($c)) continue;
            $v = isset($c['v']) ? $c['v'] : '';
            if ((is_array($v) ? array_filter($v, 'strlen') : $v !== '') || (isset($c['op']) && in_array($c['op'], ['empty', 'notempty'], true))) return null;
        }
        $params = [];
        $q = isset($req['q']) ? trim((string)$req['q']) : '';
        if ($q !== '') {
            if (empty($pg['searchParam'])) return null;
            $params[$pg['searchParam']] = $q;
        }
        if (!$sort) {
            $ds = isset($t->def['pages']['list']['defaultSort']) ? $t->def['pages']['list']['defaultSort'] : null;
            if ($ds && !empty($ds['field'])) { $sort = $ds['field']; $dir = isset($ds['dir']) ? $ds['dir'] : 'asc'; }
        }
        if ($sort && $t->field($sort)) {
            if (empty($pg['sortParam'])) return null;
            $desc = strtolower((string)$dir) === 'desc';
            if (!empty($pg['dirParam'])) { $params[$pg['sortParam']] = $sort; $params[$pg['dirParam']] = $desc ? 'desc' : 'asc'; }
            else $params[$pg['sortParam']] = ($desc ? '-' : '') . $sort;
        }
        return $params;
    }

    public static function count(Table $t, array $req)
    {
        $pg = self::paging($t);
        $params = !empty($pg['totalPath']) ? self::delegated($t, $req, '', 'asc') : null;
        if ($params !== null) {
            $size = !empty($pg['pageSize']) ? max(1, (int)$pg['pageSize']) : 100;
            $path = self::withQuery($t->def['source']['path'], $params + self::pageParams($pg, 0, $size));
            $total = self::at($t->rest->request('GET', $path), $pg['totalPath']);
            if (is_numeric($total)) return (int)$total;
        }
        return count(self::filter($t, $req));
    }

    private static function contains($v, $needle)
    {
        return $v !== null && !is_array($v) && mb_stripos((string)$v, $needle) !== false;
    }

    /** In-memory equivalent of Table::buildWhere for master, quick search, advanced search and filters. */
    public static function filter(Table $t, array $req)
    {
        $rows = self::all($t);
        $q = isset($req['q']) ? trim((string)$req['q']) : '';
        $searchable = $t->fields('search');
        $own = $t->app->security->ownership($t->name);
        return array_values(array_filter($rows, function ($r) use ($t, $req, $q, $searchable, $own) {
            if (!empty($req['master'])) foreach ($req['master'] as $c => $v) if ((string)(isset($r[$c]) ? $r[$c] : '') !== (string)$v) return false;
            if ($own && (string)(isset($r[$own['field']]) ? $r[$own['field']] : '') !== (string)userId()) return false;
            if ($q !== '') {
                $hit = false;
                foreach ($searchable as $f) {
                    $v = isset($r[$f['name']]) ? $r[$f['name']] : null;
                    $lk = $t->lookupDef($f);
                    if ($lk && $lk['kind'] === 'list') {
                        foreach ($lk['values'] as $lv) if ((string)$lv['value'] === (string)$v && stripos($t->app->label($lv['label'], (string)$lv['value']), $q) !== false) $hit = true;
                    } elseif (self::contains($v, $q)) $hit = true;
                    if ($hit) break;
                }
                if (!$hit) return false;
            }
            if (!empty($req['s']) && is_array($req['s'])) {
                foreach ($req['s'] as $name => $c) {
                    if (!$t->field($name) || !is_array($c)) continue;
                    $op = isset($c['op']) ? $c['op'] : 'contains';
                    $v = isset($c['v']) ? $c['v'] : '';
                    $v2 = isset($c['v2']) ? $c['v2'] : '';
                    $x = isset($r[$name]) ? $r[$name] : null;
                    if (is_array($v)) { $v = array_filter($v, 'strlen'); if ($v && !in_array((string)$x, array_map('strval', $v), true)) return false; continue; }
                    if ($v === '' && !in_array($op, ['empty', 'notempty'], true)) continue;
                    switch ($op) {
                        case 'equals': if ((string)$x !== (string)$v) return false; break;
                        case 'notequals': if ((string)$x === (string)$v) return false; break;
                        case 'starts': if (mb_stripos((string)$x, $v) !== 0) return false; break;
                        case 'more': if (!(self::cmp($x, $v) > 0)) return false; break;
                        case 'less': if (!(self::cmp($x, $v) < 0)) return false; break;
                        case 'between': if (self::cmp($x, $v) < 0 || ($v2 !== '' && self::cmp($x, strlen($v2) === 10 ? $v2 . ' 23:59:59' : $v2) > 0)) return false; break;
                        case 'empty': if ($x !== null && $x !== '') return false; break;
                        case 'notempty': if ($x === null || $x === '') return false; break;
                        default: if (!self::contains($x, $v)) return false;
                    }
                }
            }
            if (!empty($req['f']) && is_array($req['f'])) {
                foreach ($req['f'] as $name => $vals) {
                    if (!$t->field($name) || !is_array($vals) || !$vals) continue;
                    if (!in_array((string)(isset($r[$name]) ? $r[$name] : ''), array_map('strval', $vals), true)) return false;
                }
            }
            return true;
        }));
    }

    private static function cmp($a, $b)
    {
        if (is_numeric($a) && is_numeric($b)) return $a <=> $b;
        return strcmp((string)$a, (string)$b);
    }

    public static function fetch(Table $t, array $req, $limit, $offset, $sort, $dir)
    {
        $params = $limit > 0 ? self::delegated($t, $req, $sort, $dir) : null;
        $pp = $params !== null ? self::pageParams(self::paging($t), $offset, $limit) : null;
        if ($pp !== null) {
            $path = self::withQuery($t->def['source']['path'], $params + $pp);
            return self::listOf($t, $t->rest->request('GET', $path), $path);
        }
        $rows = self::filter($t, $req);
        if (!$sort) {
            $ds = isset($t->def['pages']['list']['defaultSort']) ? $t->def['pages']['list']['defaultSort'] : null;
            if ($ds && !empty($ds['field'])) { $sort = $ds['field']; $dir = isset($ds['dir']) ? $ds['dir'] : 'asc'; }
        }
        if ($sort && $t->field($sort)) {
            $m = strtolower($dir) === 'desc' ? -1 : 1;
            usort($rows, function ($a, $b) use ($sort, $m) {
                return $m * self::cmp(isset($a[$sort]) ? $a[$sort] : null, isset($b[$sort]) ? $b[$sort] : null);
            });
        }
        return $limit > 0 ? array_slice($rows, $offset, $limit) : $rows;
    }

    public static function totals(Table $t, array $req)
    {
        $fields = array_filter($t->fields('list'), function ($f) { return !empty($f['totals']); });
        if (!$fields) return [];
        $rows = self::filter($t, $req);
        $out = [];
        foreach ($fields as $f) {
            $vals = [];
            foreach ($rows as $r) if (isset($r[$f['name']]) && $r[$f['name']] !== '') $vals[] = $r[$f['name']];
            $num = array_map('floatval', $vals);
            switch ($f['totals']) {
                case 'sum': $out[$f['name']] = array_sum($num); break;
                case 'avg': $out[$f['name']] = $num ? array_sum($num) / count($num) : null; break;
                case 'count': $out[$f['name']] = count($vals); break;
                case 'min': $out[$f['name']] = $num ? min($num) : null; break;
                case 'max': $out[$f['name']] = $num ? max($num) : null; break;
            }
        }
        return $out;
    }

    private static function itemPath(Table $t, array $keys)
    {
        $s = $t->def['source'];
        $p = !empty($s['itemPath']) ? $s['itemPath'] : rtrim($s['path'], '/') . '/{' . implode('}/{', array_keys($keys)) . '}';
        foreach ($keys as $k => $v) $p = str_replace('{' . $k . '}', rawurlencode((string)$v), $p);
        return $p;
    }

    public static function fetchOne(Table $t, array $keys)
    {
        // A paged API would be read entirely: ask the item endpoint first.
        if (self::paging($t) && !empty($t->def['source']['itemPath'])) {
            $one = self::fetchItem($t, $keys);
            if ($one) return $one;
        }
        foreach (self::filter($t, []) as $r) {
            $ok = true;
            foreach ($keys as $k => $v) if ((string)(isset($r[$k]) ? $r[$k] : '') !== (string)$v) $ok = false;
            if ($ok) return $r;
        }
        return empty($t->def['source']['itemPath']) || self::paging($t) ? null : self::fetchItem($t, $keys);
    }

    private static function fetchItem(Table $t, array $keys)
    {
        try { $json = $t->rest->request('GET', self::itemPath($t, $keys)); } catch (\RuntimeException $e) { return null; }
        $item = self::at($json, isset($t->def['source']['itemDataPath']) ? $t->def['source']['itemDataPath'] : '');
        return is_array($item) ? self::flatten($item) : null;
    }

    // --- lookups, filter panel, unique check (SQL-free equivalents) ----------------

    /** Display text of a lookup row: field name or "{first} {last}" template. */
    private static function display(array $lk, array $r)
    {
        $d = isset($lk['display']) && $lk['display'] !== '' ? $lk['display'] : $lk['key'];
        if (strpos($d, '{') === false) return isset($r[$d]) ? (string)$r[$d] : '';
        return preg_replace_callback('/\{([A-Za-z0-9_.]+)\}/', function ($m) use ($r) { return isset($r[$m[1]]) ? (string)$r[$m[1]] : ''; }, $d);
    }

    /** Lookup options from a REST datasource. SQL conditions of the lookup (where) do not apply. */
    public static function lookupOptions(Table $src, array $lk, $q, $parent, $limit, $only)
    {
        $rows = self::all($src);
        $out = [];
        $key = $lk['key'];
        $only = $only === null ? null : array_flip(array_map('strval', $only));
        $link = !empty($lk['dependsOn']['field']) && $parent !== null ? $lk['dependsOn']['linkField'] : null;
        foreach ($rows as $r) {
            $v = isset($r[$key]) ? (string)$r[$key] : '';
            if ($only !== null && !isset($only[$v])) continue;
            if ($link !== null && (string)(isset($r[$link]) ? $r[$link] : '') !== (string)$parent) continue;
            $label = self::display($lk, $r);
            if ($q !== '' && mb_stripos($label, $q) === false) continue;
            $out[$v] = ['value' => $v, 'label' => $label, 'o' => !empty($lk['orderBy']) && isset($r[$lk['orderBy']]) ? $r[$lk['orderBy']] : $label];
        }
        $out = array_values($out);
        usort($out, function ($a, $b) { return self::cmp($a['o'], $b['o']); });
        if ($limit > 0) $out = array_slice($out, 0, $limit);
        return array_map(function ($o) { return ['value' => $o['value'], 'label' => $o['label']]; }, $out);
    }

    /** Distinct values with counts for the filter panel: [['mc_v'=>..,'mc_n'=>..], ...] */
    public static function distinct(Table $t, array $req, $field)
    {
        $n = [];
        foreach (self::filter($t, $req) as $r) {
            $v = isset($r[$field]) ? $r[$field] : null;
            $k = $v === null ? "\0" : (string)$v;
            if (!isset($n[$k])) $n[$k] = ['mc_v' => $v, 'mc_n' => 0];
            $n[$k]['mc_n']++;
        }
        $out = array_values($n);
        usort($out, function ($a, $b) { return self::cmp($a['mc_v'], $b['mc_v']); });
        return $out;
    }

    /** True when another record (keys excluded) already has this value. */
    public static function exists(Table $t, $field, $value, $keys)
    {
        foreach (self::all($t) as $r) {
            if ((string)(isset($r[$field]) ? $r[$field] : '') !== (string)$value) continue;
            $same = (bool)$keys;
            if ($keys) foreach ($keys as $k => $kv) if ((string)(isset($r[$k]) ? $r[$k] : '') !== (string)$kv) $same = false;
            if (!$same) return true;
        }
        return false;
    }

    /** Returns the new keys (from the response when the API returns the created record). */
    public static function insert(Table $t, array $vals)
    {
        $s = $t->def['source'];
        $json = $t->rest->request('POST', $s['path'], self::unflatten(self::typed($t, $vals)));
        unset(self::$cache[$t->name]);
        $item = is_array($json) ? self::at($json, isset($s['itemDataPath']) ? $s['itemDataPath'] : '') : null;
        $flat = is_array($item) ? self::flatten($item) : [];
        $keys = [];
        foreach ($t->def['keys'] as $k) $keys[$k] = isset($flat[$k]) ? $flat[$k] : (isset($vals[$k]) ? $vals[$k] : null);
        return $keys;
    }

    public static function update(Table $t, array $keys, array $vals, array $old)
    {
        $s = $t->def['source'];
        $method = !empty($s['updateMethod']) ? strtoupper($s['updateMethod']) : 'PUT';
        // PUT replaces the resource: send the whole record, PATCH only the changed fields.
        $t->rest->request($method, self::itemPath($t, $keys), self::unflatten(self::typed($t, $method === 'PUT' ? array_merge($old, $vals) : $vals)));
        unset(self::$cache[$t->name]);
    }

    public static function delete(Table $t, array $keys)
    {
        $t->rest->request('DELETE', self::itemPath($t, $keys));
        unset(self::$cache[$t->name]);
    }
}
