<?php
namespace MiB;

/**
 * "Remember me" (security.rememberDays > 0, users managed by the app): after a complete sign-in (two-step
 * verification included) a cookie selector:validator; mc_remember keeps the selector and the SHA-256 of the
 * validator. The cookie signs the browser in again when the session is gone and is replaced at every use;
 * "Esci" deletes it, a token used twice (stolen cookie) deletes every token of the user.
 */
class Remember
{
    public static function days()
    {
        $c = App::$i->config['security'];
        return isset($c['rememberDays']) ? max(0, (int)$c['rememberDays']) : 0;
    }

    public static function enabled(?Security $s = null)
    {
        $s = $s ?: App::$i->security;
        return self::days() > 0 && $s && $s->enabled() && $s->isManaged();
    }

    private static function cookie()
    {
        return 'mc_rem_' . substr(md5(App::$i->root), 0, 8);
    }

    private static function tbl(Db $db)
    {
        return $db->table(Schema::t('remember'));
    }

    private static function setCookie($value, $expires)
    {
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        if (!headers_sent()) setcookie(self::cookie(), $value, ['expires' => $expires, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
        if ($expires > time()) $_COOKIE[self::cookie()] = $value; else unset($_COOKIE[self::cookie()]);
    }

    /** New token for the user just signed in. */
    public static function issue($username, ?Security $sec = null)
    {
        if (!self::enabled($sec)) return;
        $db = App::$i->db();
        $sel = bin2hex(random_bytes(12));
        $val = bin2hex(random_bytes(32));
        $exp = time() + self::days() * 86400;
        $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $db->q('expires') . ' < ?', [date('Y-m-d H:i:s')]);
        $db->query('INSERT INTO ' . self::tbl($db) . ' (' . implode(', ', array_map([$db, 'q'], ['selector', 'username', 'hash', 'expires'])) . ') VALUES (?, ?, ?, ?)',
            [$sel, $username, hash('sha256', $val), date('Y-m-d H:i:s', $exp)]);
        self::setCookie("$sel:$val", $exp);
    }

    /** Signs the browser in from the cookie when there is no session user. */
    public static function restore(Security $sec)
    {
        if (!self::enabled($sec) || empty($_COOKIE[self::cookie()])) return;
        $parts = explode(':', (string)$_COOKIE[self::cookie()]);
        if (count($parts) !== 2 || !ctype_xdigit($parts[0]) || !ctype_xdigit($parts[1])) { self::setCookie('', time() - 3600); return; }
        list($sel, $val) = $parts;
        $db = App::$i->db();
        $row = $db->row('SELECT * FROM ' . self::tbl($db) . ' WHERE ' . $db->q('selector') . ' = ?', [$sel]);
        if (!$row) { self::setCookie('', time() - 3600); return; }
        $row = array_change_key_case($row, CASE_LOWER);
        if (!hash_equals((string)$row['hash'], hash('sha256', $val))) {
            // right selector, wrong validator: the cookie was copied and already used; sign the user out everywhere
            $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $db->q('username') . ' = ?', [$row['username']]);
            Audit::raw('remember_reused', (string)$row['username']);
            self::setCookie('', time() - 3600);
            return;
        }
        $drop = function () use ($db, $sel) { $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $db->q('selector') . ' = ?', [$sel]); self::setCookie('', time() - 3600); };
        if (strtotime((string)$row['expires']) < time()) { $drop(); return; }
        $u = $db->row('SELECT * FROM ' . $db->table(Schema::t('users')) . ' WHERE ' . $db->q('username') . ' = ?', [$row['username']]);
        $u = $u ? array_change_key_case($u, CASE_LOWER) : null;
        if (!$u || empty($u['active']) || empty($u['verified']) || (!empty($u['locked_until']) && strtotime($u['locked_until']) > time())) { $drop(); return; }
        $sec->startUserSession($sec->userFromRow($u));
        // same selector, new validator: a copy of the old cookie is recognised when it comes back
        $new = bin2hex(random_bytes(32));
        $exp = time() + self::days() * 86400;
        $db->query('UPDATE ' . self::tbl($db) . ' SET ' . $db->q('hash') . ' = ?, ' . $db->q('expires') . ' = ? WHERE ' . $db->q('selector') . ' = ?', [hash('sha256', $new), date('Y-m-d H:i:s', $exp), $sel]);
        self::setCookie("$sel:$new", $exp);
    }

    /** "Esci": the token of this browser goes away. */
    public static function forget()
    {
        if (empty($_COOKIE[self::cookie()])) return;
        $sel = explode(':', (string)$_COOKIE[self::cookie()])[0];
        try { $db = App::$i->db(); $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $db->q('selector') . ' = ?', [$sel]); } catch (\Throwable $e) { /* no table */ }
        self::setCookie('', time() - 3600);
    }
}
