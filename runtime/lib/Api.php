<?php
namespace MiB;

/**
 * REST API: index.php?p=api&t=<table>[&k[id]=1]
 *   GET list (q, s[], f[], o, d, pg, ps) | GET one (k) | POST add | PUT/PATCH edit (k) | DELETE (k)
 *   index.php?p=api&openapi=1 -> OpenAPI 3 description
 * Auth: X-Api-Key header (users' API keys) or the browser session (writes then need X-CSRF-Token).
 */
class Api
{
    private $app;

    public function __construct(App $app)
    {
        $this->app = $app;
    }

    public function handle()
    {
        $cfg = $this->app->setting('api', []);
        if (empty($cfg['enabled'])) throw new HttpError(t('error.notfound'), 404);
        header('Access-Control-Allow-Origin: ' . (!empty($cfg['corsOrigin']) ? $cfg['corsOrigin'] : 'null'));
        header('Access-Control-Allow-Headers: Content-Type, X-Api-Key');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $method = $_SERVER['REQUEST_METHOD'];
        if ($method === 'OPTIONS') return;
        if (!empty($_GET['openapi'])) { $this->app->json($this->openapi()); return; }
        $this->authenticate($method);
        $t = $this->app->table(isset($_GET['t']) ? (string)$_GET['t'] : '');
        $api = isset($t->def['api']) ? $t->def['api'] : [];
        if (empty($api['enabled'])) throw new HttpError(t('error.notfound'), 404);
        $methods = isset($api['methods']) ? $api['methods'] : ['list', 'view'];
        $sec = $this->app->security;
        $body = [];
        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            $body = json_decode(file_get_contents('php://input'), true);
            if (!is_array($body)) $body = $_POST;
        }
        switch ($method) {
            case 'GET':
                if (isset($_GET['k'])) {
                    if (!in_array('view', $methods, true)) throw new HttpError('Method not allowed', 405);
                    $sec->check($t->name, 'V');
                    $row = $t->fetchOne($t->keysFromRequest());
                    if (!$row) throw new HttpError(t('error.notfound'), 404);
                    $rows = [$row];
                    $this->app->json(['data' => $this->out($t, $rows, 'view')[0]]);
                    return;
                }
                if (!in_array('list', $methods, true)) throw new HttpError('Method not allowed', 405);
                $sec->check($t->name, 'S');
                $req = ['q' => isset($_GET['q']) ? $_GET['q'] : '', 's' => isset($_GET['s']) ? (array)$_GET['s'] : [], 'f' => isset($_GET['f']) ? (array)$_GET['f'] : []];
                $ps = isset($_GET['ps']) ? max(1, min(1000, (int)$_GET['ps'])) : 100;
                $pg = max(1, isset($_GET['pg']) ? (int)$_GET['pg'] : 1);
                $total = $t->count($req, 'api');
                $rows = $t->fetch($req, $ps, ($pg - 1) * $ps, isset($_GET['o']) ? (string)$_GET['o'] : '', isset($_GET['d']) ? (string)$_GET['d'] : 'asc', 'api');
                $this->app->json(['data' => $this->out($t, $rows, 'list'), 'total' => $total, 'page' => $pg, 'pageSize' => $ps]);
                return;
            case 'POST':
                if (!in_array('add', $methods, true)) throw new HttpError('Method not allowed', 405);
                $sec->check($t->name, 'A');
                $vals = $this->in($t, $body, 'add');
                $errors = $t->validate($vals, 'add');
                if ($errors) { $this->app->json(['error' => 'validation', 'fields' => $errors], 422); return; }
                list($ok, $keys, $msg) = $t->insert($vals, 'api');
                if (!$ok) throw new HttpError($msg, 409);
                $this->app->json(['data' => ['keys' => $keys]], 201);
                return;
            case 'PUT':
            case 'PATCH':
                if (!in_array('edit', $methods, true)) throw new HttpError('Method not allowed', 405);
                $sec->check($t->name, 'E');
                $keys = $t->keysFromRequest();
                if (!$t->fetchOne($keys)) throw new HttpError(t('error.notfound'), 404);
                $vals = $this->in($t, $body, 'edit');
                $errors = $t->validate($vals + ($method === 'PATCH' ? $this->fillMissing($t, $keys, $vals) : []), 'edit', $keys);
                if ($errors) { $this->app->json(['error' => 'validation', 'fields' => $errors], 422); return; }
                list($ok, $msg) = $t->update($keys, $vals, 'api');
                if (!$ok) throw new HttpError($msg, 409);
                $this->app->json(['data' => ['ok' => true]]);
                return;
            case 'DELETE':
                if (!in_array('delete', $methods, true)) throw new HttpError('Method not allowed', 405);
                $sec->check($t->name, 'D');
                list($ok, $msg) = $t->delete($t->keysFromRequest(), 'api');
                if (!$ok) throw new HttpError($msg, 409);
                $this->app->json(['data' => ['ok' => true]]);
                return;
        }
        throw new HttpError('Method not allowed', 405);
    }

    /** PATCH validates only the sent fields: fill the rest from the stored row. */
    private function fillMissing(Table $t, array $keys, array $vals)
    {
        $row = $t->fetchOne($keys);
        $out = [];
        foreach ($t->fields('edit') as $f) if (!array_key_exists($f['name'], $vals) && isset($row[$f['name']])) $out[$f['name']] = $row[$f['name']];
        return $out;
    }

    private function authenticate($method)
    {
        $sec = $this->app->security;
        if (!$sec->enabled()) return;
        $key = isset($_SERVER['HTTP_X_API_KEY']) ? (string)$_SERVER['HTTP_X_API_KEY'] : '';
        if ($key !== '' && $sec->isManaged()) {
            $db = $this->app->db();
            $row = $db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('api_key') . ' = ?', [hash('sha256', $key)]);
            if (!$row) throw new HttpError('Invalid API key', 401);
            $row = array_change_key_case($row, CASE_LOWER);
            if (empty($row['active'])) throw new HttpError('Invalid API key', 401);
            $sec->requestUser = $sec->userFromRow($row);
            return;
        }
        if (!$sec->user()) throw new HttpError(t('error.login'), 401);
        if ($method !== 'GET') {
            $sent = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
            if (!hash_equals($this->app->csrf(), (string)$sent)) throw new HttpError(t('error.csrf'), 400);
        }
    }

    private function in(Table $t, array $body, $mode)
    {
        $vals = [];
        foreach ($t->fields($mode) as $f) {
            if (!array_key_exists($f['name'], $body) || in_array($f['editAs']['type'], ['readonly', 'file', 'image'], true)) continue;
            $v = $body[$f['name']];
            if (is_array($v)) $v = implode(',', $v);
            if (is_bool($v)) $v = $v ? 1 : 0;
            $vals[$f['name']] = $t->normalizeInput($f, $v === null ? null : (string)$v);
        }
        foreach ($t->def['fields'] as $f) {
            $au = isset($f['autoUpdate'][$mode]) ? $f['autoUpdate'][$mode] : '';
            if ($au !== '' && $au !== null) $vals[$f['name']] = Table::expand($au);
        }
        return $vals;
    }

    private function out(Table $t, array $rows, $where)
    {
        $fields = $t->fields($where === 'list' ? 'list' : 'view');
        $t->resolveLookups($rows, $fields);
        $out = [];
        foreach ($rows as $r) {
            $o = [];
            foreach ($t->def['keys'] as $k) $o[$k] = $r[$k];
            foreach ($fields as $f) {
                if ($f['editAs']['type'] === 'password' || $t->isDbFile($f)) continue;
                $v = isset($r[$f['name']]) ? $r[$f['name']] : null;
                if ($v !== null && in_array($f['type'], ['int'], true) && is_numeric($v)) $v = (int)$v;
                elseif ($v !== null && $f['type'] === 'decimal' && is_numeric($v)) $v = (float)$v;
                elseif ($f['type'] === 'bool' && $v !== null) $v = (bool)$v;
                $o[$f['name']] = $v;
                if (isset($r['__lk'][$f['name']])) $o[$f['name'] . '__display'] = $r['__lk'][$f['name']];
            }
            $out[] = $o;
        }
        return $out;
    }

    private function openapi()
    {
        $paths = [];
        $schemas = [];
        foreach ($this->app->config['tables'] as $name => $file) {
            $t = $this->app->table($name);
            if (empty($t->def['api']['enabled'])) continue;
            $props = [];
            foreach ($t->def['fields'] as $f) {
                $type = ['int' => 'integer', 'decimal' => 'number', 'bool' => 'boolean'];
                $props[$f['name']] = ['type' => isset($type[$f['type']]) ? $type[$f['type']] : 'string', 'description' => $t->fieldLabel($f)];
            }
            $schemas[$name] = ['type' => 'object', 'properties' => $props];
            $ref = ['$ref' => '#/components/schemas/' . $name];
            $kp = [];
            foreach ($t->def['keys'] as $k) $kp[] = ['name' => "k[$k]", 'in' => 'query', 'required' => true, 'schema' => ['type' => 'string']];
            $m = $t->def['api']['methods'];
            $base = ['name' => 't', 'in' => 'query', 'required' => true, 'schema' => ['type' => 'string', 'enum' => [$name]]];
            $item = [];
            if (in_array('list', $m, true)) $item['get'] = ['summary' => 'List ' . $t->caption(), 'parameters' => [$base,
                ['name' => 'q', 'in' => 'query', 'schema' => ['type' => 'string']], ['name' => 'pg', 'in' => 'query', 'schema' => ['type' => 'integer']],
                ['name' => 'ps', 'in' => 'query', 'schema' => ['type' => 'integer']]],
                'responses' => ['200' => ['description' => 'OK', 'content' => ['application/json' => ['schema' => ['type' => 'object', 'properties' => ['data' => ['type' => 'array', 'items' => $ref], 'total' => ['type' => 'integer']]]]]]]];
            if (in_array('add', $m, true)) $item['post'] = ['summary' => 'Add ' . $t->caption(), 'parameters' => [$base], 'requestBody' => ['content' => ['application/json' => ['schema' => $ref]]], 'responses' => ['201' => ['description' => 'Created']]];
            $paths["/index.php?p=api&t=$name"] = $item;
            $one = [];
            if (in_array('view', $m, true)) $one['get'] = ['summary' => 'Get one', 'parameters' => array_merge([$base], $kp), 'responses' => ['200' => ['description' => 'OK']]];
            if (in_array('edit', $m, true)) $one['put'] = ['summary' => 'Update', 'parameters' => array_merge([$base], $kp), 'requestBody' => ['content' => ['application/json' => ['schema' => $ref]]], 'responses' => ['200' => ['description' => 'OK']]];
            if (in_array('delete', $m, true)) $one['delete'] = ['summary' => 'Delete', 'parameters' => array_merge([$base], $kp), 'responses' => ['200' => ['description' => 'OK']]];
            if ($one) $paths["/index.php?p=api&t=$name&k"] = $one;
        }
        return ['openapi' => '3.0.3', 'info' => ['title' => $this->app->label($this->app->config['title']), 'version' => '1.0'],
            'components' => ['schemas' => $schemas, 'securitySchemes' => ['apiKey' => ['type' => 'apiKey', 'in' => 'header', 'name' => 'X-Api-Key']]],
            'security' => [['apiKey' => []]], 'paths' => $paths];
    }
}
