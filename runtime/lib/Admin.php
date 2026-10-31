<?php
namespace MiB;

/** Admin area: users, groups, permissions (dynamic permissions), audit trail. */
class Admin
{
    private $app;
    /** @var Db */
    private $db;

    public function __construct(App $app)
    {
        $this->app = $app;
        $this->db = $app->db();
    }

    private function post() { return $_SERVER['REQUEST_METHOD'] === 'POST'; }

    private function lower(array $rows)
    {
        return array_map(function ($r) { return array_change_key_case($r, CASE_LOWER); }, $rows);
    }

    public function run($section)
    {
        $sec = $this->app->security;
        $sections = [];
        if ($sec->isManaged()) $sections['users'] = t('admin.users');
        if ($sec->cfg['mode'] === 'ntlm') { $sections['ntlm_users'] = t('ntlm.users'); $sections['ntlm_rights'] = t('ntlm.rights'); }
        // with Windows sign-in groups and rights live in the R-LAB tables (sections above)
        if (!empty($sec->cfg['dynamicPermissions']) && $sec->cfg['mode'] !== 'ntlm') { $sections['groups'] = t('admin.groups'); $sections['rights'] = t('admin.rights'); }
        if ($this->app->setting('audit')) $sections['audit'] = t('admin.audit');
        if (Notifications::enabled()) $sections['notifications'] = t('notif.title');
        if (Tasks::all()) $sections['tasks'] = t('task.title');
        if (!isset($sections[$section])) $section = key($sections);
        if (!$section) throw new HttpError(t('error.notfound'), 404);
        $data = $this->{'s_' . $section}();
        $this->app->title = t('admin.title') . ' — ' . $sections[$section];
        $this->app->render('admin', array_merge(['section' => $section, 'sections' => $sections], $data));
    }

    private function groupsList()
    {
        return $this->lower($this->db->all('SELECT * FROM ' . $this->db->table(Schema::t('groups')) . ' ORDER BY ' . $this->db->q('id')));
    }

    private function s_users()
    {
        $tu = Schema::t('users');
        $tm = Schema::t('members');
        if ($this->post()) {
            $a = isset($_POST['action']) ? $_POST['action'] : '';
            $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
            if ($a === 'save') {
                $vals = ['username' => trim((string)$_POST['username']), 'email' => trim((string)$_POST['email']), 'fullname' => trim((string)$_POST['fullname']),
                    'active' => empty($_POST['active']) ? 0 : 1, 'verified' => 1];
                if ($vals['username'] === '') { $this->app->flash('danger', t('val.required', t('login.username'))); redirect($this->app->url('admin', ['s' => 'users'])); }
                if (!empty($_POST['password'])) {
                    $err = $this->app->security->checkPasswordPolicy((string)$_POST['password']);
                    if ($err) { $this->app->flash('danger', $err); redirect($this->app->url('admin', ['s' => 'users', 'id' => $id ?: 'new'])); }
                    $vals['password'] = password_hash((string)$_POST['password'], PASSWORD_DEFAULT);
                }
                try {
                    if ($id) {
                        $old = $this->db->value('SELECT ' . $this->db->q('username') . ' FROM ' . $this->db->table($tu) . ' WHERE ' . $this->db->q('id') . ' = ?', [$id]);
                        $this->db->update($tu, $vals, ['id' => $id]);
                        $this->db->delete($tm, ['username' => $old]);
                    } else {
                        $vals['created_at'] = $this->db->now();
                        $vals['provider'] = 'local';
                        if (!isset($vals['password'])) $vals['password'] = '';
                        $this->db->insert($tu, $vals, 'id');
                    }
                    foreach (isset($_POST['groups']) ? (array)$_POST['groups'] : [] as $g) $this->db->insert($tm, ['username' => $vals['username'], 'group_id' => (string)$g]);
                    // phone for the SMS sign-in codes
                    if ($this->app->security->twoFactorChannel() === 'sms' && isset($_POST['phone'])) Sms::setPhone($vals['username'], $_POST['phone']);
                    $this->app->flash('success', t('msg.saved'));
                } catch (\PDOException $e) {
                    $this->app->flash('danger', t('register.exists'));
                }
            } elseif ($a === 'delete' && $id) {
                $u = $this->db->value('SELECT ' . $this->db->q('username') . ' FROM ' . $this->db->table($tu) . ' WHERE ' . $this->db->q('id') . ' = ?', [$id]);
                if ($u === userName()) $this->app->flash('danger', t('admin.self'));
                else { $this->db->delete($tm, ['username' => $u]); $this->db->delete($tu, ['id' => $id]); $this->app->flash('success', t('msg.deleted', 1)); }
            } elseif ($a === 'reset2fa' && $id) {
                $this->db->update($tu, ['totp_secret' => null], ['id' => $id]);
                $this->app->flash('success', t('2fa.reset_done'));
            } elseif ($a === 'unlock' && $id) {
                $this->db->update($tu, ['failed' => 0, 'locked_until' => null], ['id' => $id]);
                $this->app->flash('success', t('msg.saved'));
            }
            redirect($this->app->url('admin', ['s' => 'users']));
        }
        $users = $this->lower($this->db->all('SELECT ' . implode(', ', array_map([$this->db, 'q'], ['id', 'username', 'email', 'fullname', 'active', 'verified', 'provider', 'last_login', 'locked_until']))
            . ' FROM ' . $this->db->table($tu) . ' ORDER BY ' . $this->db->q('username')));
        $members = [];
        foreach ($this->lower($this->db->all('SELECT * FROM ' . $this->db->table($tm))) as $m) $members[$m['username']][] = $m['group_id'];
        $edit = null;
        if (isset($_GET['id'])) {
            if ($_GET['id'] === 'new') $edit = ['id' => 0, 'username' => '', 'email' => '', 'fullname' => '', 'active' => 1];
            else foreach ($users as $u) if ((string)$u['id'] === (string)$_GET['id']) $edit = $u;
            if ($edit && $this->app->security->twoFactorChannel() === 'sms') $edit['phone'] = $edit['username'] !== '' ? Sms::phone($edit) : '';
        }
        return ['users' => $users, 'members' => $members, 'groups' => $this->groupsList(), 'edit' => $edit];
    }

    private function s_groups()
    {
        $tg = Schema::t('groups');
        if ($this->post()) {
            $a = $_POST['action'];
            $id = trim((string)$_POST['id']);
            if ($a === 'save' && preg_match('/^[A-Za-z0-9_.-]{1,50}$/', $id)) {
                $vals = ['label' => trim((string)$_POST['label']), 'is_admin' => empty($_POST['is_admin']) ? 0 : 1];
                if ($this->db->value('SELECT COUNT(*) FROM ' . $this->db->table($tg) . ' WHERE ' . $this->db->q('id') . ' = ?', [$id])) $this->db->update($tg, $vals, ['id' => $id]);
                else $this->db->insert($tg, array_merge(['id' => $id], $vals));
                $this->app->flash('success', t('msg.saved'));
            } elseif ($a === 'delete') {
                $this->db->delete(Schema::t('rights'), ['group_id' => $id]);
                $this->db->delete(Schema::t('members'), ['group_id' => $id]);
                $this->db->delete($tg, ['id' => $id]);
                $this->app->flash('success', t('msg.deleted', 1));
            } else {
                $this->app->flash('danger', t('admin.badid'));
            }
            redirect($this->app->url('admin', ['s' => 'groups']));
        }
        return ['groups' => $this->groupsList()];
    }

    private function s_rights()
    {
        $tr = Schema::t('rights');
        $groups = $this->groupsList();
        $tables = array_keys($this->app->config['tables']);
        foreach (['reports', 'charts', 'dashboards'] as $k) foreach (array_keys(isset($this->app->config[$k]) ? $this->app->config[$k] : []) as $n) $tables[] = substr($k, 0, -1) . ':' . $n;
        if ($this->post()) {
            $g = (string)$_POST['group'];
            $this->db->delete($tr, ['group_id' => $g]);
            foreach ($tables as $tn) {
                $letters = '';
                foreach (str_split(Security::ALL) as $l) if (!empty($_POST['r'][$tn][$l])) $letters .= $l;
                if ($letters !== '') $this->db->insert($tr, ['group_id' => $g, 'table_name' => $tn, 'rights' => $letters]);
            }
            $this->app->flash('success', t('msg.saved'));
            redirect($this->app->url('admin', ['s' => 'rights', 'g' => $g]));
        }
        $cur = isset($_GET['g']) ? (string)$_GET['g'] : ($groups ? $groups[0]['id'] : '');
        $rights = [];
        foreach ($this->lower($this->db->all('SELECT * FROM ' . $this->db->table($tr) . ' WHERE ' . $this->db->q('group_id') . ' = ?', [$cur])) as $r) $rights[$r['table_name']] = $r['rights'];
        return ['groups' => $groups, 'tables' => $tables, 'cur' => $cur, 'rights' => $rights];
    }

    private function s_audit()
    {
        $ta = Schema::t('audit');
        $w = [];
        $p = [];
        foreach (['username', 'table_name', 'action'] as $c) if (!empty($_GET[$c])) { $w[] = $this->db->q($c) . ' = ?'; $p[] = (string)$_GET[$c]; }
        $where = $w ? ' WHERE ' . implode(' AND ', $w) : '';
        $pg = max(1, isset($_GET['pg']) ? (int)$_GET['pg'] : 1);
        $total = (int)$this->db->value('SELECT COUNT(*) FROM ' . $this->db->table($ta) . $where, $p);
        $rows = $this->lower($this->db->all($this->db->limit('SELECT * FROM ' . $this->db->table($ta) . $where, 50, ($pg - 1) * 50, $this->db->q('id') . ' DESC'), $p));
        return ['rows' => $rows, 'total' => $total, 'pg' => $pg];
    }

    /** Send a notification to everybody or to one user; list and delete the sent ones. */
    private function s_notifications()
    {
        if ($this->post()) {
            if (!empty($_POST['delete'])) Notifications::delete((int)$_POST['delete']);
            else {
                $msg = trim((string)(isset($_POST['message']) ? $_POST['message'] : ''));
                if ($msg === '') $this->app->flash('danger', t('val.required', t('notif.message')));
                else {
                    $user = trim((string)(isset($_POST['user']) ? $_POST['user'] : ''));
                    Notifications::add($msg, trim((string)$_POST['title']), trim((string)$_POST['icon']), trim((string)$_POST['url']),
                        !empty($_POST['expire']) ? (string)$_POST['expire'] : null, $user === '' ? null : $user, !empty($_POST['new_window']));
                    $this->app->flash('success', t('notif.sent'));
                }
            }
            redirect($this->app->url('admin', ['s' => 'notifications']));
        }
        $users = $this->app->security->isManaged() ? array_column($this->lower($this->db->all('SELECT ' . $this->db->q('username') . ' FROM ' . $this->db->table(Schema::t('users')) . ' ORDER BY ' . $this->db->q('username'))), 'username') : [];
        return ['rows' => Notifications::recent(), 'users' => $users];
    }

    /** Scheduled tasks: schedule, next and last run, result; "Run now". */
    private function s_tasks()
    {
        if ($this->post() && isset($_POST['run'])) {
            list($ok, $msg) = Tasks::run((string)$_POST['run']);
            $this->app->flash($ok ? 'success' : 'danger', t($ok ? 'task.done' : 'task.failed', (string)$_POST['run']) . ($msg !== '' ? ' — ' . $msg : ''));
            redirect($this->app->url('admin', ['s' => 'tasks']));
        }
        $state = Tasks::state();
        $rows = [];
        foreach (Tasks::all() as $name => $t) {
            $rows[] = ['name' => $name, 'title' => $this->app->label($t['title'], $name), 'cron' => $t['cron'], 'enabled' => !empty($t['enabled']),
                'valid' => Tasks::parse($t['cron']) !== null, 'next' => Tasks::next($t['cron'], time()), 'state' => isset($state[$name]) ? $state[$name] : null];
        }
        return ['rows' => $rows, 'cronLine' => '* * * * * ' . (PHP_BINARY ?: 'php') . ' ' . $this->app->root . DIRECTORY_SEPARATOR . 'cron.php'];
    }

    // --- Windows (NTLM) profiles: the R-LAB tables, edited in place --------------------------------

    /** Groups known to the profile and permission tables plus the admin groups. */
    private function ntlmGroups(Db $db, array $c)
    {
        $g = (array)$c['adminGroups'];
        foreach ([[$c['userTable'], $c['groupCol']], [$c['permTable'], $c['permGroupCol']]] as list($tbl, $col)) {
            try { foreach ($db->all('SELECT DISTINCT ' . $db->q($col) . ' AS g FROM ' . Ntlm::qt($db, $tbl)) as $r) { $r = array_change_key_case($r, CASE_LOWER); if ((string)$r['g'] !== '') $g[] = trim((string)$r['g']); } } catch (\Throwable $e) { /* missing */ }
        }
        $g = array_values(array_unique($g));
        sort($g);
        return $g;
    }

    /** Users of the profile table (username, group, area): add, change, delete. Rows have no key: matched on all columns. */
    private function s_ntlm_users()
    {
        Ntlm::ensureTables($this->app);
        $c = Ntlm::cfg($this->app);
        $db = Ntlm::db($this->app);
        $t = Ntlm::qt($db, $c['userTable']);
        $cols = [$c['userCol'], $c['groupCol'], $c['areaCol']];
        $where = implode(' AND ', array_map(function ($col) use ($db) { return $db->q($col) . ' = ?'; }, $cols));
        if ($this->post()) {
            $val = function ($k) { return trim((string)(isset($_POST[$k]) ? $_POST[$k] : '')); };
            $new = [$val('username'), $val('gruppo'), $val('area')];
            $old = [$val('o_username'), $val('o_gruppo'), $val('o_area')];
            $a = isset($_POST['action']) ? $_POST['action'] : '';
            try {
                if ($a === 'delete') $db->query("DELETE FROM $t WHERE $where", $old);
                elseif ($new[0] === '' || $new[1] === '') $this->app->flash('danger', t('val.required', t('login.username') . ' / ' . t('ntlm.group')));
                else {
                    $db->begin();
                    if ($a === 'update') $db->query("DELETE FROM $t WHERE $where", $old);
                    $db->query("INSERT INTO $t (" . implode(', ', array_map([$db, 'q'], $cols)) . ') VALUES (?, ?, ?)', $new);
                    $db->commit();
                    $this->app->flash('success', t('msg.saved'));
                }
            } catch (\Throwable $e) {
                $db->rollback();
                $this->app->flash('danger', $e->getMessage());
            }
            redirect($this->app->url('admin', ['s' => 'ntlm_users', 'q' => isset($_GET['q']) ? $_GET['q'] : '']));
        }
        $q = trim((string)(isset($_GET['q']) ? $_GET['q'] : ''));
        $sel = 'SELECT ' . $db->q($c['userCol']) . ' AS u, ' . $db->q($c['groupCol']) . ' AS g, ' . $db->q($c['areaCol']) . ' AS a FROM ' . $t;
        $p = [];
        if ($q !== '') { $sel .= ' WHERE UPPER(' . $db->q($c['userCol']) . ') LIKE UPPER(?) OR UPPER(' . $db->q($c['groupCol']) . ') LIKE UPPER(?) OR UPPER(' . $db->q($c['areaCol']) . ') LIKE UPPER(?)'; $p = ["%$q%", "%$q%", "%$q%"]; }
        $total = (int)$db->value('SELECT COUNT(*) FROM (' . $sel . ') x', $p);
        $rows = $this->lower($db->all($db->limit($sel, 200, 0, $db->q($c['userCol'])), $p));
        return ['rows' => $rows, 'total' => $total, 'q' => $q, 'groups' => $this->ntlmGroups($db, $c), 'cfg' => $c,
            'me' => isset($_SESSION['mc_ntlm_raw']) ? $_SESSION['mc_ntlm_raw'] : ''];
    }

    /** Rights per page and group, saved as R:W:L like the R-LAB permission table (rows of other pages untouched). */
    private function s_ntlm_rights()
    {
        Ntlm::ensureTables($this->app);
        $c = Ntlm::cfg($this->app);
        $db = Ntlm::db($this->app);
        $t = Ntlm::qt($db, $c['permTable']);
        // pages of this app: tables (phpr short name), reports, charts, dashboards
        $pages = [];
        foreach ($this->app->config['tables'] as $name => $file) {
            $key = isset($this->app->config['tableShort'][$name]) ? $this->app->config['tableShort'][$name] : preg_replace('/[^a-z0-9_]/', '_', strtolower($name));
            $pages[$key] = $this->app->table($name)->caption();
        }
        foreach (['reports' => 'report.title', 'charts' => 'chart.title', 'dashboards' => 'dashboard.title'] as $k => $lk) {
            foreach (isset($this->app->config[$k]) ? $this->app->config[$k] : [] as $n => $d) $pages[strtolower($n)] = $this->app->label(isset($d['title']) ? $d['title'] : '', $n);
        }
        $groups = $this->ntlmGroups($db, $c);
        $cur = [];
        foreach ($db->all('SELECT ' . $db->q($c['permGroupCol']) . ' AS g, ' . $db->q($c['permPageCol']) . ' AS p, ' . $db->q($c['permCol']) . ' AS r FROM ' . $t) as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $cur[strtolower(preg_replace('/\.php$/i', '', trim((string)$r['p'])))][trim((string)$r['g'])] = strtoupper((string)$r['r']);
        }
        if ($this->post()) {
            $in = isset($_POST['r']) && is_array($_POST['r']) ? $_POST['r'] : [];
            if (!empty($_POST['newgroup'])) $groups[] = trim((string)$_POST['newgroup']);
            try {
                $db->begin();
                foreach (array_keys($pages) as $page) {
                    foreach ($groups as $g) {
                        $f = isset($in[$page][$g]) && is_array($in[$page][$g]) ? $in[$page][$g] : [];
                        $val = (!empty($f['R']) ? 'R' : '') . ':' . (!empty($f['W']) ? 'W' : '') . ':' . (!empty($f['L']) ? 'L' : '');
                        $had = isset($cur[$page][$g]);
                        if ($had) $db->query('DELETE FROM ' . $t . ' WHERE ' . $db->q($c['permGroupCol']) . ' = ? AND (LOWER(' . $db->q($c['permPageCol']) . ') = ? OR LOWER(' . $db->q($c['permPageCol']) . ') = ?)', [$g, $page, $page . '.php']);
                        if ($val !== '::') $db->query('INSERT INTO ' . $t . ' (' . implode(', ', array_map([$db, 'q'], [$c['permGroupCol'], $c['permPageCol'], $c['permCol']])) . ') VALUES (?, ?, ?)', [mb_substr($g, 0, 14), $page, $val]);
                    }
                }
                $db->commit();
                $this->app->flash('success', t('msg.saved'));
            } catch (\Throwable $e) {
                $db->rollback();
                $this->app->flash('danger', $e->getMessage());
            }
            redirect($this->app->url('admin', ['s' => 'ntlm_rights']));
        }
        $others = array_diff(array_keys($cur), array_keys($pages));
        return ['pages' => $pages, 'groups' => $groups, 'cur' => $cur, 'others' => count($others), 'cfg' => $c];
    }
}
