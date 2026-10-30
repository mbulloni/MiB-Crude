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
        if (!empty($sec->cfg['dynamicPermissions'])) { $sections['groups'] = t('admin.groups'); $sections['rights'] = t('admin.rights'); }
        if ($this->app->setting('audit')) $sections['audit'] = t('admin.audit');
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
}
