<?php
namespace MiB;

/** Page controllers. Each page_x method serves index.php?p=x */
class Pages
{
    private $app;

    public function __construct(App $app)
    {
        $this->app = $app;
    }

    private function table()
    {
        $name = isset($_GET['t']) ? (string)$_GET['t'] : '';
        $t = $this->app->table($name);
        if (in_array($this->app->page, ['list', 'add', 'edit', 'view', 'search', 'print', 'export', 'import'], true)) $this->app->event($t->name, 'BeforeProcess', [$this->app->page]);
        return $t;
    }

    private function layout()
    {
        return !empty($_GET['popup']) ? 'layout_popup' : 'layout';
    }

    private function post()
    {
        return $_SERVER['REQUEST_METHOD'] === 'POST';
    }

    /** Master/detail context from mt (master table) and mk[] (master keys). */
    private function master(Table $t)
    {
        if (empty($_GET['mt']) || !$this->app->hasTable((string)$_GET['mt'])) return null;
        $m = $this->app->table((string)$_GET['mt']);
        $link = null;
        foreach ($m->details() as $d) if ($d['table'] === $t->name) $link = $d;
        if (!$link) return null;
        $this->app->security->check($m->name, 'V');
        // phpr URLs pass master keys by position (masterkey1, masterkey2...).
        if (empty($_GET['mk']) && !empty($_GET['mkv']) && is_array($_GET['mkv'])) {
            foreach ($m->def['keys'] as $i => $k) if (isset($_GET['mkv'][$i])) $_GET['mk'][$k] = (string)$_GET['mkv'][$i];
        }
        $mkeys = $m->keysFromRequest(['k' => isset($_GET['mk']) ? $_GET['mk'] : []]);
        $mrow = $m->fetchOne($mkeys);
        if (!$mrow) throw new HttpError(t('error.notfound'), 404);
        $filter = [];
        foreach ($link['detailKeys'] as $i => $dk) $filter[$dk] = $mrow[$link['masterKeys'][$i]];
        return ['table' => $m, 'row' => $mrow, 'keys' => $mkeys, 'filter' => $filter, 'qs' => ['mt' => $m->name, 'mk' => $mkeys]];
    }

    private function listRequest(Table $t, $master)
    {
        return [
            'q' => isset($_GET['q']) ? $_GET['q'] : '',
            's' => isset($_GET['s']) && is_array($_GET['s']) ? $_GET['s'] : [],
            'f' => isset($_GET['f']) && is_array($_GET['f']) ? $_GET['f'] : [],
            'master' => $master ? $master['filter'] : [],
        ];
    }

    // --- home -----------------------------------------------------------------

    public function page_home()
    {
        $home = $this->app->setting('homePage');
        if ($home && empty($_GET['menu'])) redirect($home);
        $cards = [];
        foreach ($this->app->config['tables'] as $name => $file) {
            if (!$this->app->security->can($name, 'S')) continue;
            $t = $this->app->table($name);
            if (!$t->enabled('list') || !empty($t->def['hideFromHome'])) continue;
            $count = null;
            try { $count = $t->count([]); } catch (\Throwable $e) { $count = null; }
            $cards[] = ['table' => $t, 'count' => $count];
        }
        $this->app->title = $this->app->label($this->app->config['title']);
        $this->app->render('home', ['cards' => $cards, 'dashboards' => $this->app->config['dashboards'] ?? []]);
    }

    // --- list -----------------------------------------------------------------

    public function page_list()
    {
        $t = $this->table();
        if (!$t->enabled('list')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'S');
        $master = $this->master($t);
        $req = $this->listRequest($t, $master);
        $page = $t->page('list');
        $ps = isset($_GET['ps']) ? (int)$_GET['ps'] : (int)$page['pageSize'];
        $this->app->event($t->name, 'BeforeShow', ['list']);
        $filters = [];
        if (!empty($page['filterPanel'])) {
            foreach ($t->def['fields'] as $f) if (!empty($f['filter'])) $filters[] = ['field' => $f, 'values' => $t->filterValues($f, $req)];
        }
        $this->app->title = $t->caption();
        $this->app->render('list', [
            't' => $t, 'ps' => $ps, 'req' => $req, 'master' => $master, 'filters' => $filters, 'embedded' => !empty($_GET['embed']),
        ], !empty($_GET['embed']) ? 'layout_popup' : $this->layout());
    }

    /** Inline edit of one cell: JSON {k:{..}, f, v} -> {html} or {error}. */
    public function page_inline()
    {
        $t = $this->table();
        $this->app->security->check($t->name, 'E');
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) throw new HttpError(t('error.notfound'), 400);
        $name = isset($in['f']) ? (string)$in['f'] : '';
        if (!in_array($name, Grid::inlineFields($t), true)) throw new HttpError(t('error.denied'), 403);
        $keys = $t->keysFromRequest(['k' => isset($in['k']) ? $in['k'] : []]);
        $old = $t->fetchOne($keys);
        if (!$old) throw new HttpError(t('error.notfound'), 404);
        $f = $t->field($name);
        $v = $f['editAs']['type'] === 'checkbox' ? (!empty($in['v']) ? 1 : 0) : $t->normalizeInput($f, isset($in['v']) ? (string)$in['v'] : '');
        $errors = $t->validateField($f, $v, $keys);
        if ($errors) { $this->app->json(['error' => implode(' ', $errors)], 422); return; }
        try {
            list($ok, $msg) = $t->update($keys, [$name => $v], 'inline');
        } catch (\PDOException $e) {
            $this->app->json(['error' => $this->dbError($e)], 409);
            return;
        }
        if (!$ok) { $this->app->json(['error' => $msg], 409); return; }
        $row = $t->fetchOne($keys);
        $rows = [$row];
        $t->resolveLookups($rows, [$f]);
        $this->app->json(['html' => Format::html($t, $f, $rows[0], 'list'), 'raw' => $rows[0][$name]]);
    }

    /** Inline add (row above the list): the fields of the row, defaults for the other add fields. JSON answer. */
    public function page_inlineadd()
    {
        $t = $this->table();
        $fields = Grid::inlineAddFields($t);
        if (!$this->post() || !$fields) throw new HttpError(t('error.notfound'), 404);
        $master = $this->master($t);
        $shown = array_map(function ($f) { return $f['name']; }, $fields);
        try {
            $vals = $t->valuesFromPost('add', $_POST);
            // add fields that are not in the row: their default, or nothing (the database default)
            foreach ($t->fields('add') as $f) {
                if (in_array($f['name'], $shown, true) || !array_key_exists($f['name'], $vals) || Table::postValue($_POST, $f['name']) !== null) continue;
                $d = $t->defaultFor($f);
                if ($d !== null) $vals[$f['name']] = $d; else unset($vals[$f['name']]);
            }
            if ($master) $vals = array_merge($vals, $master['filter']);
            $errors = $t->validate($vals, 'add');
            if ($errors) { $this->app->json(['errors' => $errors, 'error' => implode(' ', $errors)], 422); return; }
            list($ok, $keys, $msg) = $t->insert($vals, 'inline');
            if (!$ok) { $this->app->json(['error' => $msg], 409); return; }
            $this->app->json(['ok' => true, 'keys' => $keys]);
        } catch (HttpError $e) {
            $this->app->json(['error' => $e->getMessage()], 400);
        } catch (\PDOException $e) {
            $this->app->json(['error' => $this->dbError($e)], 409);
        }
    }

    /** Data for the calendar, gallery, kanban and map views of the list page. */
    public function page_feed()
    {
        $t = $this->table();
        $this->app->security->check($t->name, 'S');
        $master = $this->master($t);
        $req = $this->listRequest($t, $master);
        $rows = $t->fetch($req, 2000, 0);
        $t->resolveLookups($rows, $t->def['fields']);
        $out = [];
        foreach ($rows as $r) {
            $keys = $t->keysFromRow($r);
            $item = ['k' => $keys, 'url' => $t->enabled('view') ? $this->app->url('view', ['t' => $t->name, 'k' => $keys]) : '', 'v' => [], 'd' => []];
            foreach ($t->def['fields'] as $f) {
                if ($t->isDbFile($f)) continue;
                $item['v'][$f['name']] = isset($r[$f['name']]) ? $r[$f['name']] : null;
                $item['d'][$f['name']] = Format::plain($t, $f, isset($r[$f['name']]) ? $r[$f['name']] : null, $r);
            }
            foreach ($t->def['fields'] as $f) if (in_array($f['viewAs']['type'], ['image', 'file'], true) && !$t->isDbFile($f)) {
                $files = Upload::files(isset($r[$f['name']]) ? $r[$f['name']] : null);
                if ($files) $item['img'][$f['name']] = $this->app->url('file', ['t' => $t->name, 'f' => $f['name'], 'k' => $keys, 'i' => 0, 'thumb' => empty($files[0]['thumb']) ? null : 1]);
            }
            $out[] = $item;
        }
        $lists = [];
        foreach ($t->def['fields'] as $f) if ($t->lookupDef($f)) $lists[$f['name']] = $t->lookupOptions($f, '', null, 200);
        $this->app->json(['rows' => $out, 'options' => $lists, 'canEdit' => $t->enabled('edit') && $this->app->security->can($t->name, 'E')]);
    }

    /** DataTables server-side data for the list page. */
    public function page_dt()
    {
        $t = $this->table();
        if (!$t->enabled('list')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'S');
        $master = $this->master($t);
        Grid::serve($this->app, $t, $master, $this->listRequest($t, $master));
    }

    // --- add / edit -----------------------------------------------------------

    public function page_add()
    {
        $t = $this->table();
        if (!$t->enabled('add')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'A');
        $master = $this->master($t);
        $errors = [];
        $msg = '';
        $row = [];
        foreach ($t->fields('add') as $f) {
            if (($d = $t->defaultFor($f)) !== null) $row[$f['name']] = $d;
            if (isset($_GET['v'][$f['name']])) $row[$f['name']] = (string)$_GET['v'][$f['name']];
        }
        // Copy an existing record ("Copy" button).
        if (!empty($_GET['copy']) && $t->enabled('view')) {
            $src = $t->fetchOne($t->keysFromRequest());
            if ($src) foreach ($t->fields('add') as $f) if (!$f['pk'] && !in_array($f['editAs']['type'], ['file', 'image', 'password'], true)) $row[$f['name']] = $src[$f['name']];
        }
        if ($master) $row = array_merge($row, $master['filter']);
        if ($this->post()) {
            try {
                $vals = $t->valuesFromPost('add', $_POST);
                if ($master) $vals = array_merge($vals, $master['filter']);
                $errors = $t->validate($vals, 'add');
                if (!$errors) {
                    list($ok, $keys, $msg) = $t->insert($vals);
                    if ($ok) return $this->afterSave($t, $keys, 'add', $master);
                }
                $row = array_merge($row, $_POST);
            } catch (HttpError $e) {
                $msg = $e->getMessage();
                $row = array_merge($row, $_POST);
            } catch (\PDOException $e) {
                $msg = $this->dbError($e);
                $row = array_merge($row, $_POST);
            }
        }
        $this->app->event($t->name, 'ProcessValues', [&$row, 'add']);
        $this->app->event($t->name, 'BeforeShow', ['add']);
        $this->app->title = $t->caption() . ' — ' . t('page.add');
        $this->app->render('form', ['t' => $t, 'mode' => 'add', 'row' => $row, 'errors' => $errors, 'msg' => $msg, 'master' => $master, 'keys' => null, 'lockedBy' => ''], $this->layout());
    }

    public function page_edit()
    {
        $t = $this->table();
        if (!$t->enabled('edit')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'E');
        $master = $this->master($t);
        $keys = $t->keysFromRequest();
        $row = $t->fetchOne($keys);
        if (!$row) throw new HttpError(t('error.notfound'), 404);
        $lockedBy = Locks::acquire($t, $keys);
        $errors = [];
        $msg = '';
        if ($this->post() && $lockedBy === '') {
            try {
                $vals = $t->valuesFromPost('edit', $_POST, $row);
                $errors = $t->validate($vals, 'edit', $keys);
                if (!$errors) {
                    list($ok, $msg) = $t->update($keys, $vals);
                    if ($ok) {
                        Locks::release($t, $keys);
                        foreach ($keys as $k => $v) if (array_key_exists($k, $vals)) $keys[$k] = $vals[$k];
                        return $this->afterSave($t, $keys, 'edit', $master);
                    }
                }
            } catch (HttpError $e) {
                $msg = $e->getMessage();
            } catch (\PDOException $e) {
                $msg = $this->dbError($e);
            }
            $row = array_merge($row, $_POST);
        }
        $this->app->event($t->name, 'ProcessValues', [&$row, 'edit']);
        $this->app->event($t->name, 'BeforeShow', ['edit']);
        $this->app->title = $t->caption() . ' — ' . t('page.edit');
        $this->app->render('form', ['t' => $t, 'mode' => 'edit', 'row' => $row, 'errors' => $errors, 'msg' => $msg, 'master' => $master, 'keys' => $keys, 'lockedBy' => $lockedBy], $this->layout());
    }

    private function afterSave(Table $t, array $keys, $mode, $master)
    {
        if (!empty($_GET['popup'])) {
            // Popup "add new" from a lookup: hand the new value back to the opener.
            $this->app->render('popup_done', ['keys' => $keys, 'table' => $t], null);
            return;
        }
        $this->app->flash('success', $mode === 'add' ? t('msg.added') : t('msg.saved'));
        $qs = $master ? $master['qs'] : [];
        $next = isset($_POST['_next']) ? $_POST['_next'] : 'list';
        if ($next === 'new' && $t->enabled('add')) redirect($this->app->url('add', array_merge(['t' => $t->name], $qs)));
        if ($next === 'edit' && $t->enabled('edit')) redirect($this->app->url('edit', array_merge(['t' => $t->name, 'k' => $keys], $qs)));
        if ($next === 'view' && $t->enabled('view')) redirect($this->app->url('view', array_merge(['t' => $t->name, 'k' => $keys], $qs)));
        if ($master) redirect($this->app->url('view', ['t' => $master['table']->name, 'k' => $master['keys']]) . '#detail-' . $t->name);
        redirect($this->app->url('list', ['t' => $t->name]));
    }

    private function dbError(\PDOException $e)
    {
        error_log('[MiB-Crude] ' . $e->getMessage());
        if (!empty($this->app->config['debug'])) return $e->getMessage();
        $code = (string)$e->getCode();
        if ($code === '23000' || $code === '23505' || $code === '23503') return t('error.constraint');
        return t('error.db');
    }

    // --- view / print ---------------------------------------------------------

    public function page_view()
    {
        $t = $this->table();
        if (!$t->enabled('view')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'V');
        $master = $this->master($t);
        $keys = $t->keysFromRequest();
        $row = $t->fetchOne($keys);
        if (!$row) throw new HttpError(t('error.notfound'), 404);
        $rows = [$row];
        $t->resolveLookups($rows, $t->fields('view'));
        $row = $rows[0];
        $this->app->event($t->name, 'ProcessValues', [&$row, 'view']);
        $this->app->event($t->name, 'BeforeShow', ['view']);
        $details = [];
        foreach ($t->details() as $d) {
            if (!in_array('view', isset($d['showIn']) ? $d['showIn'] : ['view'], true) || !$this->app->security->can($d['table'], 'S')) continue;
            $details[] = $d;
        }
        // Previous / next record navigation inside the current list order.
        $this->app->title = $t->caption();
        $this->app->render('view', ['t' => $t, 'row' => $row, 'keys' => $keys, 'details' => $details, 'master' => $master], $this->layout());
    }

    public function page_print()
    {
        $t = $this->table();
        if (!$t->enabled('print')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'P');
        $master = $this->master($t);
        $req = $this->listRequest($t, $master);
        $rows = $t->fetch($req, 5000, 0, isset($_GET['o']) ? (string)$_GET['o'] : '', isset($_GET['d']) ? (string)$_GET['d'] : 'asc', 'print');
        $fields = $t->fields('print');
        $t->resolveLookups($rows, $fields);
        $this->app->event($t->name, 'BeforeShowList', [&$rows, 'print']);
        $this->app->event($t->name, 'BeforeShow', ['print']);
        $this->app->title = $t->caption();
        $this->app->render('print', ['t' => $t, 'rows' => $rows, 'fields' => $fields, 'totals' => $t->totals($req)], 'layout_print');
    }

    // --- delete ---------------------------------------------------------------

    public function page_delete()
    {
        $t = $this->table();
        if (!$t->enabled('delete') || !$this->post()) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'D');
        $sets = [];
        if (!empty($_POST['sel']) && is_array($_POST['sel'])) {
            foreach ($_POST['sel'] as $json) { $k = json_decode((string)$json, true); if (is_array($k)) $sets[] = $t->keysFromRequest(['k' => $k]); }
        } else {
            $sets[] = $t->keysFromRequest($_POST);
        }
        $done = 0;
        $errors = [];
        foreach ($sets as $keys) {
            try {
                list($ok, $msg) = $t->delete($keys);
                if ($ok) $done++; else $errors[] = $msg;
            } catch (\PDOException $e) {
                $errors[] = $this->dbError($e);
            }
        }
        if ($done) $this->app->flash('success', t('msg.deleted', $done));
        foreach (array_unique($errors) as $e) $this->app->flash('danger', $e);
        $back = isset($_POST['_back']) && strpos($_POST['_back'], 'index.php?') === 0 ? $_POST['_back'] : $this->app->url('list', ['t' => $t->name]);
        redirect($back);
    }

    // --- notifications -----------------------------------------------------------

    /** Bell of the header: GET = latest notifications and unread count, POST = mark them seen. */
    public function page_notifications()
    {
        if (!Notifications::enabled() || !$this->app->security->user()) throw new HttpError(t('error.notfound'), 404);
        if ($this->post()) Notifications::markSeen();
        $this->app->json(Notifications::forUser());
    }

    // --- saved searches -----------------------------------------------------------

    /** Save (name, current search of the list) or delete a saved search, then back to the list. */
    public function page_savedsearch()
    {
        $t = $this->table();
        if (!$this->post() || !Searches::enabled() || !$this->app->security->can($t->name, 'S')) throw new HttpError(t('error.notfound'), 404);
        $back = isset($_POST['_back']) && strpos($_POST['_back'], 'index.php?') === 0 ? $_POST['_back'] : $this->app->url('list', ['t' => $t->name]);
        if (isset($_POST['action']) && $_POST['action'] === 'delete') {
            Searches::delete(isset($_POST['id']) ? $_POST['id'] : 0);
            redirect($back);
        }
        $query = json_decode(isset($_POST['query']) ? (string)$_POST['query'] : '', true);
        Searches::save($t, isset($_POST['title']) ? $_POST['title'] : '', is_array($query) ? $query : [], !empty($_POST['shared']));
        $this->app->flash('success', t('search.saved'));
        redirect($back);
    }

    /** Map view: coordinates for the records without them, from their address (20 per click). */
    public function page_geocode()
    {
        $t = $this->table();
        if (!$this->post() || !Geocode::views($t) || !$t->writeTable() || !$this->app->security->can($t->name, 'E')) throw new HttpError(t('error.notfound'), 404);
        @set_time_limit(120);
        list($done, $missing) = Geocode::fill($t, 20);
        $this->app->flash($done || !$missing ? 'success' : 'warning', t('geo.filled', $done, $missing));
        $back = isset($_POST['_back']) && strpos($_POST['_back'], 'index.php?') === 0 ? $_POST['_back'] : $this->app->url('list', ['t' => $t->name, 'v' => 'map']);
        redirect($back);
    }

    // --- update selected --------------------------------------------------------

    /** "Update selected" (phpr): the same values on every selected record, through the normal edit path. */
    public function page_updatesel()
    {
        $t = $this->table();
        if (!$this->post() || !$t->canUpdateSelected()) throw new HttpError(t('error.notfound'), 404);
        $sel = [];
        $selJson = [];
        foreach (isset($_POST['sel']) && is_array($_POST['sel']) ? $_POST['sel'] : [] as $json) {
            $k = json_decode((string)$json, true);
            if (is_array($k)) { $sel[] = $t->keysFromRequest(['k' => $k]); $selJson[] = (string)$json; }
        }
        $back = isset($_POST['_back']) && strpos($_POST['_back'], 'index.php?') === 0 ? $_POST['_back'] : $this->app->url('list', ['t' => $t->name]);
        if (!$sel) redirect($back);
        $fields = $t->bulkFields();
        $names = array_map(function ($f) { return $f['name']; }, $fields);
        $chosen = array_values(array_intersect(isset($_POST['_fields']) && is_array($_POST['_fields']) ? array_map('strval', $_POST['_fields']) : [], $names));
        $error = '';
        if (!empty($_POST['_apply'])) {
            if (!$chosen) $error = t('updsel.none');
            else {
                $all = $t->valuesFromPost('edit', $_POST, null);
                $editNames = array_map(function ($f) { return $f['name']; }, $t->fields('edit'));
                $vals = [];
                // the chosen fields, plus automatic values (updated_at = {now}, updated_by = {user}…)
                foreach ($all as $n => $v) if (in_array($n, $chosen, true) || !in_array($n, $editNames, true)) $vals[$n] = $v;
                $done = 0;
                $fail = [];
                foreach ($sel as $keys) {
                    $label = implode('/', array_map('strval', $keys));
                    $row = $t->fetchOne($keys);
                    if (!$row) { $fail[] = $label . ': ' . t('error.notfound'); continue; }
                    $by = Locks::acquire($t, $keys);
                    if ($by !== '') { $fail[] = $label . ': ' . t('updsel.locked', $by); continue; }
                    try {
                        $errs = $t->validate(array_merge($row, $vals), 'edit', $keys);
                        if ($errs) $fail[] = $label . ': ' . implode('; ', $errs);
                        else {
                            list($ok, $msg) = $t->update($keys, $vals);
                            if ($ok) $done++; else $fail[] = $label . ': ' . $msg;
                        }
                    } catch (\PDOException $e) {
                        $fail[] = $label . ': ' . $this->dbError($e);
                    } catch (\RuntimeException $e) {
                        $fail[] = $label . ': ' . $e->getMessage();
                    }
                    Locks::release($t, $keys);
                }
                if ($done) $this->app->flash('success', t('msg.updated', $done));
                foreach (array_slice($fail, 0, 20) as $f) $this->app->flash('danger', $f);
                if (count($fail) > 20) $this->app->flash('danger', t('updsel.more', count($fail) - 20));
                redirect($back);
            }
        }
        $this->app->title = $t->caption() . ' — ' . t('updsel.title', count($sel));
        $this->app->render('updatesel', ['t' => $t, 'fields' => $fields, 'chosen' => $chosen, 'selJson' => $selJson, 'back' => $back, 'error' => $error, 'count' => count($sel)], $this->layout());
    }

    // --- search ---------------------------------------------------------------

    public function page_search()
    {
        $t = $this->table();
        if (!$t->enabled('search')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'S');
        $this->app->event($t->name, 'BeforeShow', ['search']);
        $this->app->title = $t->caption() . ' — ' . t('page.search');
        $this->app->render('search', ['t' => $t, 's' => isset($_GET['s']) && is_array($_GET['s']) ? $_GET['s'] : []], $this->layout());
    }

    // --- export / import ------------------------------------------------------

    public function page_export()
    {
        $t = $this->table();
        if (!$t->enabled('export')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'P');
        $master = $this->master($t);
        $req = $this->listRequest($t, $master);
        $fmt = isset($_GET['fmt']) ? (string)$_GET['fmt'] : 'csv';
        $allowed = isset($t->def['pages']['export']['formats']) ? $t->def['pages']['export']['formats'] : ['csv'];
        if (!in_array($fmt, $allowed, true)) $fmt = $allowed[0];
        $rows = $t->fetch($req, 0, 0, isset($_GET['o']) ? (string)$_GET['o'] : '', isset($_GET['d']) ? (string)$_GET['d'] : 'asc', 'export');
        if (!empty($_GET['sel'])) {
            $want = array_map('strval', (array)$_GET['sel']);
            $rows = array_values(array_filter($rows, function ($r) use ($t, $want) { return in_array(json_encode($t->keysFromRow($r)), $want, true); }));
        }
        $fields = $t->fields('export');
        $t->resolveLookups($rows, $fields);
        Audit::raw('export ' . $t->name, (string)userName());
        Export::send($t, $rows, $fields, $fmt);
    }

    /** One record as PDF (button on the view page when the PDF export is enabled). */
    public function page_pdf()
    {
        $t = $this->table();
        if (!$t->enabled('view') || !$t->enabled('export') || !in_array('pdf', $t->def['pages']['export']['formats'], true)) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'V');
        $this->app->security->check($t->name, 'P');
        $keys = $t->keysFromRequest();
        $row = $t->fetchOne($keys, true);
        if (!$row) throw new HttpError(t('error.notfound'), 404);
        $rows = [$row];
        $fields = $t->fields('view');
        // images of the image fields, read before the values are formatted
        $imgs = [];
        foreach ($fields as $f) if ($f['editAs']['type'] === 'image' || (isset($f['viewAs']['type']) && $f['viewAs']['type'] === 'image')) $imgs[$f['name']] = Upload::imageBytes($t, $f, $row);
        $t->resolveLookups($rows, $fields);
        $row = $rows[0];
        $this->app->event($t->name, 'ProcessValues', [&$row, 'view']);
        $pairs = [];
        foreach ($fields as $f) {
            $text = !empty($imgs[$f['name']]) ? '' : Format::plain($t, $f, isset($row[$f['name']]) ? $row[$f['name']] : null, $row);
            $pairs[$t->fieldLabel($f)] = !empty($imgs[$f['name']]) ? ['text' => $text, 'images' => $imgs[$f['name']]] : $text;
        }
        Audit::raw('export ' . $t->name, (string)userName());
        $pdf = Pdf::record($t->caption() . ' — ' . implode(' / ', array_map('strval', $keys)), $pairs);
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . preg_replace('/\W/', '_', $t->name) . '_' . preg_replace('/\W/', '_', implode('_', $keys)) . '.pdf"');
        header('Content-Length: ' . strlen($pdf));
        echo $pdf;
    }

    public function page_import()
    {
        $t = $this->table();
        if (!$t->enabled('import')) throw new HttpError(t('error.notfound'), 404);
        $this->app->security->check($t->name, 'I');
        $fields = $t->fields('import');
        $result = null;
        $preview = null;
        if ($this->post() && !empty($_FILES['file']['tmp_name'])) {
            list($head, $data) = Export::read($_FILES['file']['tmp_name'], $_FILES['file']['name']);
            // Map columns by field name or label (case-insensitive).
            $map = [];
            foreach ($head as $i => $h) {
                foreach ($fields as $f) {
                    if (strcasecmp($h, $f['name']) === 0 || strcasecmp($h, $t->fieldLabel($f)) === 0) { $map[$i] = $f; break; }
                }
            }
            $result = ['added' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => [], 'mapped' => count($map), 'columns' => count($head)];
            $update = !empty($_POST['update']);
            $db = $t->db;
            $db->begin();
            try {
                foreach ($data as $n => $line) {
                    $vals = [];
                    foreach ($map as $i => $f) $vals[$f['name']] = $t->normalizeInput($f, isset($line[$i]) ? $line[$i] : '');
                    if ($this->app->event($t->name, 'BeforeImport', [&$vals, 'import']) === false) { $result['skipped']++; continue; }
                    $keys = [];
                    foreach ($t->def['keys'] as $k) if (isset($vals[$k]) && $vals[$k] !== '' && $vals[$k] !== null) $keys[$k] = $vals[$k];
                    try {
                        if ($update && count($keys) === count($t->def['keys']) && $keys && $t->fetchOne($keys)) {
                            list($ok, $msg) = $t->update($keys, $vals, 'import');
                            if ($ok) $result['updated']++; else $result['errors'][] = t('import.row', $n + 2) . ': ' . $msg;
                        } else {
                            $errs = $t->validate($vals, 'import');
                            if ($errs) { $result['errors'][] = t('import.row', $n + 2) . ': ' . implode('; ', $errs); continue; }
                            list($ok, , $msg) = $t->insert($vals, 'import');
                            if ($ok) $result['added']++; else $result['errors'][] = t('import.row', $n + 2) . ': ' . $msg;
                        }
                    } catch (\PDOException $e) {
                        $result['errors'][] = t('import.row', $n + 2) . ': ' . $this->dbError($e);
                    } catch (\RuntimeException $e) {
                        // REST datasources: API error for this record.
                        $result['errors'][] = t('import.row', $n + 2) . ': ' . $e->getMessage();
                    }
                    if (count($result['errors']) > 200) break;
                }
                if (!empty($_POST['atomic']) && $result['errors'] && $db->pdo) { $db->rollback(); $result['added'] = $result['updated'] = 0; $result['rolledBack'] = true; }
                else { $db->commit(); $this->app->event($t->name, 'AfterImport', [$result, 'import']); }
            } catch (\Throwable $e) {
                $db->rollback();
                throw $e;
            }
        }
        $this->app->title = $t->caption() . ' — ' . t('page.import');
        $this->app->render('import', ['t' => $t, 'fields' => $fields, 'result' => $result], $this->layout());
    }

    // --- ajax -----------------------------------------------------------------

    public function page_lookup()
    {
        $t = $this->table();
        $this->app->security->check($t->name, 'S');
        $f = $t->field(isset($_GET['f']) ? (string)$_GET['f'] : '');
        if (!$f || !$t->lookupDef($f)) throw new HttpError(t('error.notfound'), 404);
        $q = isset($_GET['q']) ? (string)$_GET['q'] : '';
        $parent = isset($_GET['parent']) ? (string)$_GET['parent'] : null;
        $limit = isset($_GET['limit']) ? min(500, (int)$_GET['limit']) : 50;
        $this->app->json($t->lookupOptions($f, $q, $parent === '' ? null : $parent, $limit));
    }

    public function page_file()
    {
        $t = $this->table();
        $this->app->security->check($t->name, 'V');
        $f = $t->field(isset($_GET['f']) ? (string)$_GET['f'] : '');
        if (!$f || !in_array($f['editAs']['type'], ['file', 'image'], true)) throw new HttpError(t('error.notfound'), 404);
        $row = $t->fetchOne($t->keysFromRequest(), true);
        if (!$row) throw new HttpError(t('error.notfound'), 404);
        Upload::serve($t, $f, $row, isset($_GET['i']) ? (int)$_GET['i'] : 0, !empty($_GET['thumb']));
    }

    // --- authentication -------------------------------------------------------

    public function page_login()
    {
        $sec = $this->app->security;
        if (!$sec->enabled()) redirect($this->app->url('home'));
        // Windows authentication has no login form: the next page signs the browser's account in
        if ($sec->cfg['mode'] === 'ntlm') redirect($this->app->url('home'));
        $msg = '';
        $useCaptcha = !empty($sec->cfg['captcha']['login']);
        if ($this->post()) {
            if ($useCaptcha && !$sec->captchaOk('login', isset($_POST['captcha']) ? $_POST['captcha'] : '')) $msg = t('captcha.wrong');
            else $msg = $sec->login(isset($_POST['username']) ? $_POST['username'] : '', isset($_POST['password']) ? $_POST['password'] : '');
            if ($msg === '2fa') redirect($this->app->url('twofactor'));
            if ($msg === '') {
                if ($sec->twoFactorRequired() && $sec->twoFactorChannel() === '' && !$sec->totpSecret($sec->user()['id'])) { $this->app->flash('warning', t('2fa.setup_required')); redirect($this->app->url('profile')); }
                $ret = isset($_SESSION['mc_return']) ? $_SESSION['mc_return'] : '';
                unset($_SESSION['mc_return']);
                redirect($ret !== '' && strpos($ret, '//') === false ? $ret : $this->app->url('home'));
            }
        }
        $this->app->title = t('login.title');
        $this->app->render('login', ['msg' => $msg, 'captcha' => $useCaptcha ? $sec->captchaQuestion('login') : '', 'sec' => $sec], 'layout_bare');
    }

    public function page_twofactor()
    {
        $sec = $this->app->security;
        if (empty($_SESSION['mc_2fa_pending'])) redirect($this->app->url('login'));
        $msg = '';
        // a new code by email/SMS, at most one every 30 seconds
        if ($this->post() && isset($_POST['resend'])) {
            $p = $_SESSION['mc_2fa_pending'];
            if (isset($p['mode']) && $p['mode'] === 'code' && time() - (isset($p['sent']) ? $p['sent'] : 0) >= 30) {
                $err = $sec->sendTwoFactorCode();
                $this->app->flash($err === '' ? 'success' : 'danger', $err === '' ? t('2fa.resent') : $err);
            }
            redirect($this->app->url('twofactor'));
        }
        if ($this->post()) {
            $msg = $sec->completeTwoFactor(isset($_POST['code']) ? $_POST['code'] : '');
            if ($msg === '') {
                $ret = isset($_SESSION['mc_return']) ? $_SESSION['mc_return'] : '';
                unset($_SESSION['mc_return']);
                redirect($ret !== '' && strpos($ret, '//') === false ? $ret : $this->app->url('home'));
            }
        }
        $this->app->title = t('2fa.title');
        $p = isset($_SESSION['mc_2fa_pending']) ? $_SESSION['mc_2fa_pending'] : [];
        $this->app->render('twofactor', ['msg' => $msg, 'mode' => isset($p['mode']) ? $p['mode'] : 'totp', 'to' => isset($p['to']) ? $p['to'] : '', 'channel' => $sec->twoFactorChannel()], 'layout_bare');
    }

    public function page_logout()
    {
        $this->app->security->logout();
        redirect($this->app->url('login'));
    }

    public function page_oidc()
    {
        if (!empty($_GET['cb'])) {
            list($username, $info) = Oidc::callback();
            $user = $this->app->security->upsertExternal('oidc', $username, $info);
            if (!$user) throw new HttpError(t('login.inactive'), 403);
            $this->app->security->startUserSession($user);
            redirect($this->app->url('home'));
        }
        Oidc::start(isset($_GET['id']) ? (string)$_GET['id'] : '');
    }

    /** SAML 2.0: ?p=saml (start), ?p=saml&acs=1 (POST from the IdP), ?p=saml&metadata=1 (SP metadata). */
    public function page_saml()
    {
        if (!empty($_GET['metadata'])) { Saml::metadata(); return; }
        if (!empty($_GET['acs'])) { Saml::acs(); return; }
        Saml::start();
    }

    public function page_setup()
    {
        $sec = $this->app->security;
        if (!$sec->needsSetup()) redirect($this->app->url('home'));
        $msg = '';
        if ($this->post()) {
            $u = trim((string)$_POST['username']);
            $p = (string)$_POST['password'];
            $msg = $u === '' ? t('val.required', t('login.username')) : $sec->checkPasswordPolicy($p);
            if ($msg === '' && $p !== (string)$_POST['password2']) $msg = t('pw.mismatch');
            if ($msg === '') {
                $db = $this->app->db();
                $db->insert(Schema::t('users'), ['username' => $u, 'password' => password_hash($p, PASSWORD_DEFAULT), 'email' => trim((string)$_POST['email']),
                    'fullname' => $u, 'active' => 1, 'verified' => 1, 'provider' => 'local', 'created_at' => $db->now()], 'id');
                $admin = 'admin';
                foreach ($sec->cfg['groups'] as $g) if (!empty($g['admin'])) { $admin = $g['id']; break; }
                $db->insert(Schema::t('members'), ['username' => $u, 'group_id' => $admin]);
                $_SESSION['mc_setup_done'] = 1;
                $this->app->flash('success', t('setup.done'));
                redirect($this->app->url('login'));
            }
        }
        $this->app->title = t('setup.title');
        $this->app->render('setup', ['msg' => $msg], 'layout_bare');
    }

    public function page_register()
    {
        $sec = $this->app->security;
        if (!$sec->enabled() || !$sec->isManaged() || empty($sec->cfg['registration']['enabled'])) throw new HttpError(t('error.notfound'), 404);
        $msg = '';
        $done = false;
        $vals = ['username' => '', 'email' => '', 'fullname' => ''];
        if ($this->post()) {
            foreach ($vals as $k => $v) $vals[$k] = trim((string)(isset($_POST[$k]) ? $_POST[$k] : ''));
            $pw = (string)$_POST['password'];
            $db = $this->app->db();
            if (!empty($sec->cfg['captcha']['register']) && !$sec->captchaOk('register', isset($_POST['captcha']) ? $_POST['captcha'] : '')) $msg = t('captcha.wrong');
            elseif ($vals['username'] === '' || !filter_var($vals['email'], FILTER_VALIDATE_EMAIL)) $msg = t('register.invalid');
            elseif (($m = $sec->checkPasswordPolicy($pw)) !== '') $msg = $m;
            elseif ($pw !== (string)$_POST['password2']) $msg = t('pw.mismatch');
            elseif ((int)$db->value('SELECT COUNT(*) FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('username') . ' = ? OR ' . $db->q('email') . ' = ?', [$vals['username'], $vals['email']]) > 0) $msg = t('register.exists');
            if ($msg === '') {
                $values = $vals;
                if ($this->app->event('_global', 'BeforeRegister', [&$values, &$msg]) !== false) {
                    $verify = !empty($sec->cfg['registration']['emailVerify']);
                    $token = $verify ? bin2hex(random_bytes(16)) : null;
                    $db->insert(Schema::t('users'), ['username' => $values['username'], 'password' => password_hash($pw, PASSWORD_DEFAULT), 'email' => $values['email'],
                        'fullname' => $values['fullname'], 'active' => 1, 'verified' => $verify ? 0 : 1, 'provider' => 'local', 'token' => $token, 'created_at' => $db->now()], 'id');
                    $db->insert(Schema::t('members'), ['username' => $values['username'], 'group_id' => $sec->cfg['registration']['defaultGroup']]);
                    if ($verify) {
                        $link = Oidc::redirectUri();
                        $link = str_replace('p=oidc&cb=1', 'p=verify&token=' . $token, $link);
                        MailTemplates::builtin('register', $values['email'], ['username' => $values['username'], 'fullname' => $values['fullname'], 'email' => $values['email'], 'link' => $link],
                            'register.mail_subject', 'register.mail_body', [h($values['username']), h($link)]);
                    }
                    $this->app->event('_global', 'AfterRegister', [$values]);
                    $done = true;
                }
            }
        }
        $this->app->title = t('register.title');
        $this->app->render('register', ['msg' => $msg, 'done' => $done, 'vals' => $vals,
            'captcha' => !empty($sec->cfg['captcha']['register']) ? $sec->captchaQuestion('register') : ''], 'layout_bare');
    }

    public function page_verify()
    {
        $db = $this->app->db();
        $token = isset($_GET['token']) ? (string)$_GET['token'] : '';
        $n = $token === '' ? 0 : $db->query('UPDATE ' . $db->table(Schema::t('users')) . ' SET ' . $db->q('verified') . ' = 1, ' . $db->q('token') . ' = NULL WHERE ' . $db->q('token') . ' = ?', [$token])->rowCount();
        $this->app->flash($n ? 'success' : 'danger', $n ? t('register.verified') : t('register.badtoken'));
        redirect($this->app->url('login'));
    }

    public function page_forgot()
    {
        $sec = $this->app->security;
        if (!$sec->isManaged() || empty($sec->cfg['passwordReset']['enabled'])) throw new HttpError(t('error.notfound'), 404);
        $sent = false;
        if ($this->post()) {
            $db = $this->app->db();
            $email = trim((string)$_POST['email']);
            $row = $db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('email') . ' = ? OR ' . $db->q('username') . ' = ?', [$email, $email]);
            if ($row) {
                $row = array_change_key_case($row, CASE_LOWER);
                $token = bin2hex(random_bytes(16));
                $db->update(Schema::t('users'), ['token' => hash('sha256', $token), 'token_expires' => date('Y-m-d H:i:s', time() + 3600)], ['id' => $row['id']]);
                $link = str_replace('p=oidc&cb=1', 'p=reset&token=' . $token, Oidc::redirectUri());
                MailTemplates::builtin('forgot', $row['email'], ['username' => $row['username'], 'fullname' => isset($row['fullname']) ? $row['fullname'] : '', 'email' => $row['email'], 'link' => $link],
                    'forgot.mail_subject', 'forgot.mail_body', [h($row['username']), h($link)]);
            }
            $sent = true; // same answer whether or not the user exists
        }
        $this->app->title = t('forgot.title');
        $this->app->render('forgot', ['sent' => $sent], 'layout_bare');
    }

    public function page_reset()
    {
        $sec = $this->app->security;
        $db = $this->app->db();
        $token = isset($_GET['token']) ? (string)$_GET['token'] : '';
        $row = $token === '' ? null : $db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('token') . ' = ?', [hash('sha256', $token)]);
        if ($row) $row = array_change_key_case($row, CASE_LOWER);
        if (!$row || strtotime($row['token_expires']) < time()) { $this->app->flash('danger', t('register.badtoken')); redirect($this->app->url('login')); }
        $msg = '';
        if ($this->post()) {
            $pw = (string)$_POST['password'];
            $msg = $sec->checkPasswordPolicy($pw);
            if ($msg === '' && $pw !== (string)$_POST['password2']) $msg = t('pw.mismatch');
            if ($msg === '') {
                $db->update(Schema::t('users'), ['password' => password_hash($pw, PASSWORD_DEFAULT), 'token' => null, 'token_expires' => null, 'failed' => 0, 'locked_until' => null], ['id' => $row['id']]);
                $this->app->flash('success', t('reset.done'));
                redirect($this->app->url('login'));
            }
        }
        $this->app->title = t('reset.title');
        $this->app->render('reset', ['msg' => $msg], 'layout_bare');
    }

    public function page_profile()
    {
        $sec = $this->app->security;
        $u = $sec->user();
        if (!$u || !$sec->isManaged() || empty($u['id'])) throw new HttpError(t('error.notfound'), 404);
        $db = $this->app->db();
        $msg = '';
        if ($this->post()) {
            $row = array_change_key_case($db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('id') . ' = ?', [$u['id']]), CASE_LOWER);
            if (isset($_POST['totp_start'])) {
                $_SESSION['mc_totp_new'] = Totp::secret();
                redirect($this->app->url('profile') . '#twofactor');
            }
            if (isset($_POST['totp_confirm'])) {
                $secret = isset($_SESSION['mc_totp_new']) ? $_SESSION['mc_totp_new'] : '';
                if ($secret !== '' && Totp::verify($secret, $_POST['code'])) {
                    $sec->setTotpSecret($u['id'], $secret);
                    unset($_SESSION['mc_totp_new']);
                    Audit::raw('2fa_enabled', $u['username']);
                    $this->app->flash('success', t('2fa.enabled'));
                } else $this->app->flash('danger', t('2fa.wrong'));
                redirect($this->app->url('profile') . '#twofactor');
            }
            if (isset($_POST['totp_disable'])) {
                if (!$sec->twoFactorRequired() && Totp::verify($sec->totpSecret($u['id']), $_POST['code'])) {
                    $sec->setTotpSecret($u['id'], '');
                    $this->app->flash('success', t('2fa.disabled'));
                } else $this->app->flash('danger', t('2fa.wrong'));
                redirect($this->app->url('profile'));
            }
            if (isset($_POST['phone_save'])) {
                Sms::setPhone($u['username'], isset($_POST['phone']) ? $_POST['phone'] : '');
                $this->app->flash('success', t('msg.saved'));
                redirect($this->app->url('profile') . '#twofactor');
            }
            if (isset($_POST['apikey'])) {
                $db->update(Schema::t('users'), ['api_key' => hash('sha256', $key = bin2hex(random_bytes(20)))], ['id' => $u['id']]);
                $this->app->flash('success', t('profile.apikey_new', $key));
                redirect($this->app->url('profile'));
            }
            if (!password_verify((string)$_POST['old'], (string)$row['password'])) $msg = t('profile.wrongpw');
            elseif (($m = $sec->checkPasswordPolicy((string)$_POST['password'])) !== '') $msg = $m;
            elseif ($_POST['password'] !== $_POST['password2']) $msg = t('pw.mismatch');
            else {
                $db->update(Schema::t('users'), ['password' => password_hash((string)$_POST['password'], PASSWORD_DEFAULT)], ['id' => $u['id']]);
                $this->app->flash('success', t('reset.done'));
                redirect($this->app->url('profile'));
            }
        }
        $this->app->title = t('profile.title');
        $this->app->render('profile', ['msg' => $msg, 'user' => $u]);
    }

    // --- admin area (users, groups, permissions, audit) ------------------------

    public function page_admin()
    {
        $sec = $this->app->security;
        if (!$sec->enabled() || !$sec->isAdmin()) throw new HttpError(t('error.denied'), 403);
        $admin = new Admin($this->app);
        $admin->run(isset($_GET['s']) ? (string)$_GET['s'] : 'users');
    }

    // --- REST API ---------------------------------------------------------------

    public function page_api()
    {
        (new Api($this->app))->handle();
    }

    // --- reports, charts, dashboards -------------------------------------------

    public function page_report()
    {
        (new Reports($this->app))->report(isset($_GET['r']) ? (string)$_GET['r'] : '');
    }

    public function page_chart()
    {
        (new Reports($this->app))->chart(isset($_GET['c']) ? (string)$_GET['c'] : '');
    }

    public function page_dashboard()
    {
        (new Reports($this->app))->dashboard(isset($_GET['d']) ? (string)$_GET['d'] : '');
    }

    public function page_chartdata()
    {
        (new Reports($this->app))->chartData(isset($_GET['c']) ? (string)$_GET['c'] : '');
    }

    /** Custom buttons (phpr OnServer): JSON {params, keys, selected[]} -> {result}. */
    public function page_button()
    {
        $t = $this->table();
        $this->app->security->check($t->name, 'S');
        $id = isset($_GET['b']) ? preg_replace('/\W/', '_', (string)$_GET['b']) : '';
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = $_POST;
        $params = isset($in['params']) && is_array($in['params']) ? $in['params'] : [];
        $keys = isset($in['keys']) && is_array($in['keys']) ? $in['keys'] : [];
        $selected = isset($in['selected']) && is_array($in['selected']) ? $in['selected'] : [];
        $result = [];
        $button = new \CompatButton($t->name, $keys, $selected);
        $r = $this->app->event($t->name, 'Button_' . $id, [$params, &$result, $button]);
        $this->app->json(['result' => $result]);
    }

    /** Public landing page (Project settings → Landing page). */
    public function page_welcome()
    {
        $l = $this->app->setting('landing', []);
        if (empty($l['enabled'])) redirect($this->app->url('home'));
        $this->app->title = $this->app->label($this->app->config['title']);
        $this->app->render('welcome', ['landing' => $l, 'sec' => $this->app->security], 'layout_welcome');
    }

    /** Web report & chart builder (Project settings -> webBuilder). */
    public function page_builder()
    {
        Builder::page($this->app);
    }

    public function page_ping()
    {
        $this->app->json(['ok' => true, 'user' => userName()]);
    }
}
