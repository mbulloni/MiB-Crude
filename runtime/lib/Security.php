<?php
namespace MiB;

/**
 * Authentication and authorization.
 * Rights letters per table: A add, E edit, D delete, S list/search, V view, P print/export, I import.
 */
class Security
{
    const ALL = 'AEDSVPI';
    const GUEST = '<guest>';

    private $app;
    public $cfg;
    private $rightsCache = null;
    /** User authenticated for this request only (API key), never stored in the session. */
    public $requestUser = null;

    public function __construct(App $app)
    {
        $this->app = $app;
        $this->cfg = $app->config['security'];
        Schema::ensure();
        if ($this->enabled() && !empty($_SESSION['mc_user'])) {
            $idle = (int)$this->cfg['sessionMinutes'] * 60;
            if ($idle > 0 && isset($_SESSION['mc_seen']) && time() - $_SESSION['mc_seen'] > $idle) $this->logout();
            $_SESSION['mc_seen'] = time();
        }
    }

    public function enabled()
    {
        return !empty($this->cfg['enabled']) && $this->cfg['mode'] !== 'none';
    }

    private function managed()
    {
        return $this->cfg['mode'] === 'database' && !empty($this->cfg['users']['managed']);
    }

    public function user()
    {
        if ($this->requestUser) return $this->requestUser;
        return isset($_SESSION['mc_user']) ? $_SESSION['mc_user'] : null;
    }

    public function groups()
    {
        $u = $this->user();
        if (!$u) return $this->enabled() && !empty($this->cfg['guestAccess']) ? [self::GUEST] : [];
        return $u['groups'];
    }

    public function isAdmin()
    {
        if (!$this->enabled()) return true;
        $u = $this->user();
        return $u && !empty($u['admin']);
    }

    public function needsSetup()
    {
        if (!$this->enabled() || !$this->managed()) return false;
        if (!empty($_SESSION['mc_setup_done'])) return false;
        $db = $this->app->db();
        $n = (int)$db->value('SELECT COUNT(*) FROM ' . $db->table(Schema::t('users')));
        if ($n > 0) $_SESSION['mc_setup_done'] = 1;
        return $n === 0;
    }

    public function requireLogin()
    {
        if (!$this->enabled() || $this->user()) return;
        if (!empty($this->cfg['guestAccess'])) return;
        if ($this->app->wantsJson()) throw new HttpError(t('error.login'), 401);
        $_SESSION['mc_return'] = $_SERVER['REQUEST_URI'];
        redirect($this->app->url('login'));
    }

    // --- rights ---------------------------------------------------------------

    private function rights()
    {
        if ($this->rightsCache !== null) return $this->rightsCache;
        $r = [];
        if (!empty($this->cfg['dynamicPermissions'])) {
            $db = $this->app->db();
            foreach ($db->all('SELECT * FROM ' . $db->table(Schema::t('rights'))) as $row) {
                $row = array_change_key_case($row, CASE_LOWER);
                $r[$row['group_id']][$row['table_name']] = (string)$row['rights'];
            }
        } else {
            $r = $this->cfg['permissions'];
        }
        return $this->rightsCache = $r;
    }

    /** Can the current user do $letter on $table? */
    public function can($table, $letter)
    {
        if (!$this->enabled() || $this->isAdmin()) return true;
        $all = $this->rights();
        foreach ($this->groups() as $g) {
            if (isset($all[$g][$table]) && strpos($all[$g][$table], $letter) !== false) return true;
        }
        return false;
    }

    public function check($table, $letter)
    {
        if (!$this->can($table, $letter)) {
            if (!$this->user() && $this->enabled()) $this->requireLoginStrict();
            throw new HttpError(t('error.denied'), 403);
        }
    }

    private function requireLoginStrict()
    {
        if ($this->app->wantsJson()) throw new HttpError(t('error.login'), 401);
        $_SESSION['mc_return'] = $_SERVER['REQUEST_URI'];
        redirect($this->app->url('login'));
    }

    /** Row ownership for non-admin users: ['field'=>..] or null. $forWrite: also apply on insert. */
    public function ownership($table, $forWrite = false)
    {
        if (!$this->enabled() || $this->isAdmin() || !$this->user()) return null;
        if (empty($this->cfg['ownership'][$table]['field'])) return null;
        return $this->cfg['ownership'][$table];
    }

    // --- login ----------------------------------------------------------------

    /** Returns '' on success or an error message. */
    public function login($username, $password)
    {
        $username = trim((string)$username);
        $msg = '';
        if ($this->app->event('_global', 'BeforeLogin', [&$username, &$password, &$msg]) === false) return $msg ?: t('login.failed');
        $user = null;
        if ($this->cfg['mode'] === 'hardcoded') {
            $hc = $this->cfg['hardcoded'];
            if (hash_equals((string)$hc['username'], $username) && self::verifyHash((string)$password, (string)$hc['passwordHash'])) {
                $user = ['id' => 0, 'username' => $username, 'email' => '', 'fullname' => $username, 'groups' => ['admin'], 'admin' => true];
            }
        } else {
            if (!empty($this->cfg['providers']['ldap']['enabled'])) {
                $r = Ldap::authenticate($this->cfg['providers']['ldap'], $username, $password);
                if (is_array($r)) $user = $this->upsertExternal('ldap', $username, $r);
            }
            if (!$user) {
                $res = $this->dbLogin($username, $password);
                if (is_string($res)) { $this->app->event('_global', 'AfterUnsuccessfulLogin', [$username, $res]); return $res; }
                $user = $res;
            }
        }
        if (!$user) {
            $this->app->event('_global', 'AfterUnsuccessfulLogin', [$username, t('login.failed')]);
            Audit::raw('login_failed', $username);
            return t('login.failed');
        }
        // Second factor: users with an authenticator app confirm with a code.
        if ($this->twoFactorEnabled() && !empty($user['id']) && $this->totpSecret($user['id'])) {
            $_SESSION['mc_2fa_pending'] = ['user' => $user, 'at' => time()];
            return '2fa';
        }
        $this->startUserSession($user);
        return '';
    }

    public function startUserSession(array $user)
    {
        session_regenerate_id(true);
        $_SESSION['mc_user'] = $user;
        $_SESSION['mc_seen'] = time();
        // Session variables used by phpr event code.
        $_SESSION['UserID'] = $user['username'];
        $_SESSION['UserName'] = $user['fullname'] ?: $user['username'];
        $_SESSION['GroupID'] = $user['groups'] ? $user['groups'][0] : '';
        $_SESSION['AccessLevel'] = !empty($user['admin']) ? 'Admin' : 'User';
        $this->rightsCache = null;
        if ($this->managed() && !empty($user['id'])) {
            $db = $this->app->db();
            $db->update(Schema::t('users'), ['last_login' => $db->now(), 'failed' => 0, 'locked_until' => null], ['id' => $user['id']]);
        }
        Audit::raw('login', $user['username']);
        $this->app->event('_global', 'AfterSuccessfulLogin', [$user['username'], $user]);
    }

    private function dbLogin($username, $password)
    {
        $db = $this->app->db();
        if ($this->managed()) {
            $row = $db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('username') . ' = ?', [$username]);
            if (!$row) { password_verify('x', '$2y$10$abcdefghijklmnopqrstuuDxvJ1a1b1f1O3y8l1w3q0b2E4cY7m6S'); return null; }
            $row = array_change_key_case($row, CASE_LOWER);
            if (!empty($row['locked_until']) && strtotime($row['locked_until']) > time()) return t('login.locked');
            if (!password_verify((string)$password, (string)$row['password'])) {
                $failed = (int)$row['failed'] + 1;
                $max = (int)$this->cfg['maxLoginAttempts'];
                $upd = ['failed' => $failed];
                if ($max > 0 && $failed >= $max) { $upd['locked_until'] = date('Y-m-d H:i:s', time() + 900); $upd['failed'] = 0; }
                $db->update(Schema::t('users'), $upd, ['id' => $row['id']]);
                return null;
            }
            if (empty($row['active'])) return t('login.inactive');
            if (empty($row['verified'])) return t('login.unverified');
            return $this->userFromRow($row);
        }
        // Custom users table defined in the designer.
        $u = $this->cfg['users'];
        $row = $db->row('SELECT * FROM ' . $db->table($u['table']) . ' WHERE ' . $db->q($u['usernameField']) . ' = ?', [$username]);
        if (!$row) return null;
        $stored = (string)$row[$u['passwordField']];
        $ok = (strpos($stored, '$2y$') === 0 || strpos($stored, '$argon2') === 0) ? password_verify((string)$password, $stored)
            : (!empty($u['plainPasswords']) && hash_equals($stored, (string)$password)) || hash_equals($stored, md5((string)$password));
        if (!$ok) return null;
        if (!empty($u['activeField']) && empty($row[$u['activeField']])) return t('login.inactive');
        $groups = [];
        if (!empty($u['groupField']) && isset($row[$u['groupField']]) && $row[$u['groupField']] !== '') $groups = array_map('trim', explode(',', (string)$row[$u['groupField']]));
        return $this->makeUser(
            isset($row[$u['idField'] ?? '']) ? $row[$u['idField']] : $row[$u['usernameField']],
            $row[$u['usernameField']],
            !empty($u['emailField']) ? $row[$u['emailField']] : '',
            !empty($u['fullNameField']) ? $row[$u['fullNameField']] : $row[$u['usernameField']],
            array_merge($groups, $this->memberGroups($row[$u['usernameField']])),
            $row
        );
    }

    private function memberGroups($username)
    {
        if (!Schema::needed()) return [];
        $db = $this->app->db();
        $out = [];
        foreach ($db->all('SELECT ' . $db->q('group_id') . ' AS g FROM ' . $db->table(Schema::t('members')) . ' WHERE ' . $db->q('username') . ' = ?', [$username]) as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $out[] = $r['g'];
        }
        return $out;
    }

    private function adminGroups()
    {
        $out = [];
        foreach ($this->cfg['groups'] as $g) if (!empty($g['admin'])) $out[] = $g['id'];
        if (!empty($this->cfg['dynamicPermissions']) && Schema::needed()) {
            $db = $this->app->db();
            foreach ($db->all('SELECT ' . $db->q('id') . ' AS id FROM ' . $db->table(Schema::t('groups')) . ' WHERE ' . $db->q('is_admin') . ' = 1') as $r) {
                $r = array_change_key_case($r, CASE_LOWER);
                $out[] = $r['id'];
            }
        }
        return array_unique($out);
    }

    private function makeUser($id, $username, $email, $fullname, array $groups, array $row = [])
    {
        $groups = array_values(array_unique($groups));
        return [
            'id' => $id, 'username' => $username, 'email' => (string)$email, 'fullname' => (string)$fullname,
            'groups' => $groups, 'admin' => (bool)array_intersect($groups, $this->adminGroups()),
        ];
    }

    public function userFromRow(array $row)
    {
        return $this->makeUser($row['id'], $row['username'], $row['email'], $row['fullname'] ?: $row['username'], $this->memberGroups($row['username']));
    }

    /** Create/update a local user for LDAP/OIDC logins. $info: email, fullname, groups[] */
    public function upsertExternal($provider, $username, array $info)
    {
        $db = $this->app->db();
        $t = Schema::t('users');
        $row = $db->row('SELECT * FROM ' . $db->table($t) . ' WHERE ' . $db->q('username') . ' = ?', [$username]);
        if ($row) {
            $row = array_change_key_case($row, CASE_LOWER);
            if (empty($row['active'])) return null;
            $db->update($t, ['email' => $info['email'] ?? $row['email'], 'fullname' => $info['fullname'] ?? $row['fullname']], ['id' => $row['id']]);
            $id = $row['id'];
        } else {
            $id = $db->insert($t, ['username' => $username, 'password' => '', 'email' => $info['email'] ?? '', 'fullname' => $info['fullname'] ?? $username,
                'active' => 1, 'verified' => 1, 'provider' => $provider, 'created_at' => $db->now()], 'id');
            $def = $this->cfg['registration']['defaultGroup'] ?? '';
            if ($def !== '') $db->insert(Schema::t('members'), ['username' => $username, 'group_id' => $def]);
        }
        $mapped = [];
        foreach ($info['groups'] ?? [] as $g) if (isset($info['groupMap'][$g])) $mapped[] = $info['groupMap'][$g];
        $user = $this->userFromRow(['id' => $id, 'username' => $username, 'email' => $info['email'] ?? '', 'fullname' => $info['fullname'] ?? $username]);
        $user['groups'] = array_values(array_unique(array_merge($user['groups'], $mapped)));
        $user['admin'] = (bool)array_intersect($user['groups'], $this->adminGroups());
        return $user;
    }

    public function logout()
    {
        $u = $this->user();
        $_SESSION = [];
        session_regenerate_id(true);
        if ($u) $this->app->event('_global', 'AfterLogout', [$u['username']]);
    }

    public function checkPasswordPolicy($pw)
    {
        $p = $this->cfg['passwordPolicy'];
        if (mb_strlen($pw) < (int)$p['minLength']) return t('pw.minlength', $p['minLength']);
        if (!empty($p['requireDigit']) && !preg_match('/\d/', $pw)) return t('pw.digit');
        if (!empty($p['requireUpper']) && !preg_match('/[A-Z]/', $pw)) return t('pw.upper');
        if (!empty($p['requireSymbol']) && !preg_match('/[^A-Za-z0-9]/', $pw)) return t('pw.symbol');
        return '';
    }

    // --- simple arithmetic CAPTCHA ---------------------------------------------

    public function captchaQuestion($form)
    {
        $a = random_int(1, 9);
        $b = random_int(1, 9);
        $_SESSION['mc_captcha'][$form] = $a + $b;
        return "$a + $b = ?";
    }

    public function captchaOk($form, $answer)
    {
        $ok = isset($_SESSION['mc_captcha'][$form]) && (string)$_SESSION['mc_captcha'][$form] === trim((string)$answer);
        unset($_SESSION['mc_captcha'][$form]);
        return $ok;
    }

    /** password_hash() hashes and the designer's "pbkdf2:sha256:iter:salt:hex" format. */
    public static function verifyHash($password, $stored)
    {
        if (strpos($stored, 'pbkdf2:') === 0) {
            $p = explode(':', $stored);
            if (count($p) !== 5) return false;
            return hash_equals($p[4], hash_pbkdf2($p[1], $password, $p[3], (int)$p[2], 64));
        }
        return password_verify($password, $stored);
    }

    public function twoFactorEnabled()
    {
        return $this->enabled() && $this->managed() && !empty($this->cfg['twoFactor']['enabled']);
    }

    public function twoFactorRequired()
    {
        return $this->twoFactorEnabled() && !empty($this->cfg['twoFactor']['required']);
    }

    public function totpSecret($userId)
    {
        $db = $this->app->db();
        return (string)$db->value('SELECT ' . $db->q('totp_secret') . ' FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('id') . ' = ?', [$userId]);
    }

    public function setTotpSecret($userId, $secret)
    {
        $this->app->db()->update(Schema::t('users'), ['totp_secret' => $secret === '' ? null : $secret], ['id' => $userId]);
    }

    /** Second step of the login. Returns '' or an error. */
    public function completeTwoFactor($code)
    {
        $p = isset($_SESSION['mc_2fa_pending']) ? $_SESSION['mc_2fa_pending'] : null;
        if (!$p || time() - $p['at'] > 300) { unset($_SESSION['mc_2fa_pending']); return t('2fa.expired'); }
        if (!Totp::verify($this->totpSecret($p['user']['id']), $code)) { Audit::raw('2fa_failed', $p['user']['username']); return t('2fa.wrong'); }
        unset($_SESSION['mc_2fa_pending']);
        $this->startUserSession($p['user']);
        return '';
    }

    public function isManaged()
    {
        return $this->managed();
    }
}
