<?php
namespace MiB;

/** Base class of generated event classes. */
class Events
{
}

/** Audit trail in the mc_audit table. */
class Audit
{
    public static function enabled(Table $t = null)
    {
        $app = App::$i;
        if (!$app->setting('audit')) return false;
        return $t === null || !isset($t->def['audit']) || $t->def['audit'] !== false;
    }

    public static function log(Table $t, $action, array $keys, $old, $new)
    {
        if (!self::enabled($t)) return;
        $strip = function ($row) use ($t) {
            if ($row === null) return null;
            $out = [];
            foreach ($row as $k => $v) {
                if ($k === '__lk') continue;
                $f = $t->field($k);
                if ($f && ($t->isDbFile($f) || $f['editAs']['type'] === 'password')) $v = '***';
                if (is_array($v)) $v = '***';
                $out[$k] = $v;
            }
            return json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        };
        self::write($t->name, $action, json_encode($keys, JSON_UNESCAPED_UNICODE), $strip($old), $strip($new));
    }

    public static function raw($action, $username)
    {
        if (!self::enabled()) return;
        self::write('', $action, '', null, null, $username);
    }

    private static function write($table, $action, $keys, $old, $new, $username = null)
    {
        try {
            $db = App::$i->db();
            $db->insert(Schema::t('audit'), [
                'ts' => $db->now(), 'username' => $username !== null ? $username : (string)userName(),
                'ip' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '', 'table_name' => $table, 'action' => $action,
                'keys_json' => $keys, 'old_json' => $old, 'new_json' => $new,
            ], 'id');
        } catch (\Throwable $e) {
            error_log('[MiB-Crude] audit: ' . $e->getMessage());
        }
    }
}

/** Pessimistic record locking while a record is open in the edit page. */
class Locks
{
    const MINUTES = 10;

    public static function enabled()
    {
        return (bool)App::$i->setting('recordLocking');
    }

    /** Returns '' when the lock is taken by the current user, or the name of the holder. */
    public static function acquire(Table $t, array $keys)
    {
        if (!self::enabled()) return '';
        $db = App::$i->db();
        $tbl = Schema::t('locks');
        $k = json_encode($keys);
        $me = (string)userName();
        $row = $db->row('SELECT * FROM ' . $db->table($tbl) . ' WHERE ' . $db->q('table_name') . ' = ? AND ' . $db->q('keys_json') . ' = ?', [$t->name, $k]);
        if ($row) {
            $row = array_change_key_case($row, CASE_LOWER);
            if ($row['username'] !== $me && strtotime($row['ts']) > time() - self::MINUTES * 60) return $row['username'];
            $db->update($tbl, ['username' => $me, 'ts' => $db->now()], ['table_name' => $t->name, 'keys_json' => $k]);
            return '';
        }
        try { $db->insert($tbl, ['table_name' => $t->name, 'keys_json' => $k, 'username' => $me, 'ts' => $db->now()]); } catch (\Throwable $e) { return self::acquire($t, $keys); }
        return '';
    }

    public static function release(Table $t, array $keys)
    {
        if (!self::enabled()) return;
        $db = App::$i->db();
        $db->query('DELETE FROM ' . $db->table(Schema::t('locks')) . ' WHERE ' . $db->q('table_name') . ' = ? AND ' . $db->q('keys_json') . ' = ? AND ' . $db->q('username') . ' = ?',
            [$t->name, json_encode($keys), (string)userName()]);
    }
}

/** Mail via PHP mail() or a minimal SMTP client (STARTTLS/SSL + AUTH LOGIN). */
class Mailer
{
    public static function send($to, $subject, $body, $html = true)
    {
        $app = App::$i;
        $cfg = isset($app->config['mail']) ? $app->config['mail'] : [];
        $from = !empty($cfg['from']) ? $cfg['from'] : 'noreply@' . (isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost');
        $headers = "From: $from\r\nMIME-Version: 1.0\r\nContent-Type: " . ($html ? 'text/html' : 'text/plain') . "; charset=UTF-8\r\n";
        $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        if (empty($cfg['smtpHost'])) return @mail($to, $subj, $body, $headers);
        $pw = isset($app->secrets['mail']['password']) ? $app->secrets['mail']['password'] : '';
        return self::smtp($cfg, $pw, $from, $to, $subj, $headers, $body);
    }

    private static function smtp($cfg, $pw, $from, $to, $subj, $headers, $body)
    {
        $port = !empty($cfg['smtpPort']) ? (int)$cfg['smtpPort'] : 587;
        $host = ($port === 465 ? 'ssl://' : '') . $cfg['smtpHost'];
        $s = @stream_socket_client("$host:$port", $errno, $err, 15);
        if (!$s) { error_log("[MiB-Crude] smtp: $err"); return false; }
        $read = function () use ($s) { $r = ''; while (($l = fgets($s, 515)) !== false) { $r .= $l; if (isset($l[3]) && $l[3] === ' ') break; } return $r; };
        $cmd = function ($c) use ($s, $read) { fwrite($s, $c . "\r\n"); return $read(); };
        $read();
        $cmd('EHLO localhost');
        if ($port === 587) { $cmd('STARTTLS'); stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT); $cmd('EHLO localhost'); }
        if (!empty($cfg['smtpUser'])) { $cmd('AUTH LOGIN'); $cmd(base64_encode($cfg['smtpUser'])); $cmd(base64_encode($pw)); }
        $cmd('MAIL FROM:<' . preg_replace('/.*<|>.*/', '', $from) . '>');
        foreach (array_map('trim', explode(',', $to)) as $rcpt) $cmd("RCPT TO:<$rcpt>");
        $cmd('DATA');
        $r = $cmd("To: $to\r\nSubject: $subj\r\n$headers\r\n" . str_replace("\n.", "\n..", $body) . "\r\n.");
        $cmd('QUIT');
        fclose($s);
        return strpos($r, '250') === 0;
    }
}

/** LDAP / Active Directory bind. Returns ['email','fullname','groups'=>[cn..],'groupMap'] or null. */
class Ldap
{
    public static function authenticate(array $cfg, $username, $password)
    {
        if (!function_exists('ldap_connect') || $password === '' || $username === '') return null;
        $uri = (preg_match('~^ldaps?://~', $cfg['host']) ? $cfg['host'] : 'ldap://' . $cfg['host']) . ':' . (int)$cfg['port'];
        $c = @ldap_connect($uri);
        if (!$c) return null;
        ldap_set_option($c, LDAP_OPT_PROTOCOL_VERSION, 3);
        ldap_set_option($c, LDAP_OPT_REFERRALS, 0);
        if (!empty($cfg['useTls']) && !@ldap_start_tls($c)) return null;
        $bindName = !empty($cfg['domain']) ? $cfg['domain'] . '\\' . $username : $username;
        if (!empty($cfg['bindDn']) && strpos($cfg['bindDn'], '%s') !== false) $bindName = str_replace('%s', self::esc($username, true), $cfg['bindDn']);
        if (!@ldap_bind($c, $bindName, $password)) return null;
        $info = ['email' => '', 'fullname' => $username, 'groups' => [], 'groupMap' => isset($cfg['groupMap']) ? $cfg['groupMap'] : []];
        if (!empty($cfg['baseDn'])) {
            $filter = str_replace('%s', self::esc($username, false), $cfg['userFilter'] ?: '(sAMAccountName=%s)');
            $sr = @ldap_search($c, $cfg['baseDn'], $filter, ['mail', 'displayName', 'cn', 'memberOf']);
            $e = $sr ? ldap_get_entries($c, $sr) : null;
            if ($e && $e['count'] > 0) {
                $u = $e[0];
                $info['email'] = isset($u['mail'][0]) ? $u['mail'][0] : '';
                $info['fullname'] = isset($u['displayname'][0]) ? $u['displayname'][0] : (isset($u['cn'][0]) ? $u['cn'][0] : $username);
                if (isset($u['memberof'])) for ($i = 0; $i < $u['memberof']['count']; $i++) {
                    if (preg_match('/^CN=([^,]+)/i', $u['memberof'][$i], $m)) $info['groups'][] = $m[1];
                }
            }
        }
        ldap_unbind($c);
        return $info;
    }

    private static function esc($s, $dn)
    {
        return function_exists('ldap_escape') ? ldap_escape($s, '', $dn ? LDAP_ESCAPE_DN : LDAP_ESCAPE_FILTER) : preg_replace('/[^A-Za-z0-9._@-]/', '', $s);
    }
}

/** OpenID Connect (authorization code + PKCE). Works with Okta, Entra ID, Google, Keycloak... */
class Oidc
{
    public static function provider($id)
    {
        foreach (App::$i->config['security']['providers']['oidc'] as $p) if ($p['id'] === $id && !empty($p['enabled'])) return $p;
        throw new HttpError(t('error.notfound'), 404);
    }

    private static function http($url, array $post = null, array $headers = [])
    {
        $opts = ['http' => ['method' => $post === null ? 'GET' : 'POST', 'timeout' => 15, 'ignore_errors' => true,
            'header' => implode("\r\n", array_merge($headers, $post === null ? [] : ['Content-Type: application/x-www-form-urlencoded']))]];
        if ($post !== null) $opts['http']['content'] = http_build_query($post);
        $r = @file_get_contents($url, false, stream_context_create($opts));
        $d = json_decode((string)$r, true);
        if (!is_array($d)) throw new HttpError('OIDC: risposta non valida da ' . parse_url($url, PHP_URL_HOST), 502);
        return $d;
    }

    private static function discovery(array $p)
    {
        return self::http(rtrim($p['issuer'], '/') . '/.well-known/openid-configuration');
    }

    public static function redirectUri()
    {
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        $base = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
        return $base . '?p=oidc&cb=1';
    }

    public static function start($id)
    {
        $p = self::provider($id);
        $d = self::discovery($p);
        $state = bin2hex(random_bytes(16));
        $verifier = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $_SESSION['mc_oidc'] = ['id' => $id, 'state' => $state, 'verifier' => $verifier, 'nonce' => bin2hex(random_bytes(8))];
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        redirect($d['authorization_endpoint'] . '?' . http_build_query([
            'response_type' => 'code', 'client_id' => $p['clientId'], 'redirect_uri' => self::redirectUri(),
            'scope' => !empty($p['scopes']) ? $p['scopes'] : 'openid email profile', 'state' => $state, 'nonce' => $_SESSION['mc_oidc']['nonce'],
            'code_challenge' => $challenge, 'code_challenge_method' => 'S256',
        ]));
    }

    public static function callback()
    {
        $s = isset($_SESSION['mc_oidc']) ? $_SESSION['mc_oidc'] : null;
        unset($_SESSION['mc_oidc']);
        if (!$s || !isset($_GET['state']) || !hash_equals($s['state'], (string)$_GET['state']) || empty($_GET['code'])) throw new HttpError(t('login.failed'), 400);
        $p = self::provider($s['id']);
        $d = self::discovery($p);
        $secret = isset(App::$i->secrets['oidc'][$p['id']]) ? App::$i->secrets['oidc'][$p['id']] : '';
        $tok = self::http($d['token_endpoint'], [
            'grant_type' => 'authorization_code', 'code' => $_GET['code'], 'redirect_uri' => self::redirectUri(),
            'client_id' => $p['clientId'], 'client_secret' => $secret, 'code_verifier' => $s['verifier'],
        ]);
        if (empty($tok['access_token'])) throw new HttpError(t('login.failed'), 401);
        $info = self::http($d['userinfo_endpoint'], null, ['Authorization: Bearer ' . $tok['access_token']]);
        $claim = !empty($p['usernameClaim']) ? $p['usernameClaim'] : 'email';
        $username = isset($info[$claim]) ? $info[$claim] : (isset($info['sub']) ? $info['sub'] : '');
        if ($username === '') throw new HttpError(t('login.failed'), 401);
        $groups = [];
        if (!empty($p['groupClaim']) && isset($info[$p['groupClaim']])) $groups = (array)$info[$p['groupClaim']];
        return [$username, ['email' => isset($info['email']) ? $info['email'] : '', 'fullname' => isset($info['name']) ? $info['name'] : $username,
            'groups' => $groups, 'groupMap' => isset($p['groupMap']) ? $p['groupMap'] : []]];
    }
}

/** Page layout from the designer: sections (cards/tabs) with ordered fields. */
class Layout
{
    /** @return array [['title'=>string,'fields'=>[field defs]], ...] */
    public static function sections(Table $t, $page, array $fields)
    {
        $def = isset($t->def['layout'][$page]) ? $t->def['layout'][$page] : null;
        if (!$def || empty($def['sections'])) return [['title' => '', 'fields' => $fields]];
        $byName = [];
        foreach ($fields as $f) $byName[$f['name']] = $f;
        $out = [];
        foreach ($def['sections'] as $s) {
            // Field order follows the designer's field list, not the order of assignment.
            $want = array_flip(isset($s['fields']) ? $s['fields'] : []);
            $list = [];
            foreach ($fields as $f) if (isset($want[$f['name']], $byName[$f['name']])) { $list[] = $f; unset($byName[$f['name']]); }
            if ($list) $out[] = ['title' => $t->app->label(isset($s['title']) ? $s['title'] : '', ''), 'fields' => $list];
        }
        // Fields not placed by the designer go to the end.
        if ($byName) $out[] = ['title' => '', 'fields' => array_values($byName)];
        return $out;
    }
}
