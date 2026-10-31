<?php
namespace MiB;

/**
 * Windows integrated authentication (NTLM / Negotiate), as in the R-LAB projects: the web server
 * authenticates the browser (Apache mod_auth_ntlm_winbind / mod_auth_sspi / mod_auth_gssapi, IIS) and passes
 * the account in REMOTE_USER; the app normalises it (DOMAIN\user → USER@suffix), takes groups and area
 * from the profile table, rights per page from the permission table and logs every page in the access table.
 * Tables and columns are configurable; the defaults are the R-LAB ones:
 *   rlab_profilazione_gruppo (username, gruppo, AREA), rlab_profilazione_permission (Gruppo, Pagina, Permessi "R:W:L"),
 *   rlab_venditori (Username, Nome, Cognome), r_lab_statistiche.rlab_accessi (data, ip, userid, username, gruppo,
 *   pagina, url, browser, versione).
 */
class Ntlm
{
    const DEFAULTS = [
        'connection' => '',
        'serverVars' => ['REMOTE_USER', 'REDIRECT_REMOTE_USER', 'AUTH_USER', 'LOGON_USER'],
        'trustedHeader' => '',
        'stripDomain' => true, 'uppercase' => true, 'suffix' => '',
        'match' => 'exact',
        'userTable' => 'rlab_profilazione_gruppo', 'userCol' => 'username', 'groupCol' => 'gruppo', 'areaCol' => 'AREA',
        'permTable' => 'rlab_profilazione_permission', 'permGroupCol' => 'Gruppo', 'permPageCol' => 'Pagina', 'permCol' => 'Permessi',
        'profileTable' => 'rlab_venditori', 'profileUserCol' => 'Username', 'firstNameCol' => 'Nome', 'lastNameCol' => 'Cognome',
        'accessLog' => false, 'accessTable' => 'r_lab_statistiche.rlab_accessi', 'accessVersion' => '3',
        'adminGroups' => ['AMMINISTRATORE'],
        'denyUnknown' => true,
        'createTables' => true,
        'devUser' => '',
    ];
    // classic-style page names → rights letters
    const PAGE_LETTERS = ['list' => 'S', 'search' => 'S', 'view' => 'V', 'add' => 'A', 'edit' => 'E', 'delete' => 'D', 'print' => 'P', 'export' => 'P', 'import' => 'I'];

    public static function cfg(App $app)
    {
        $c = isset($app->config['security']['ntlm']) && is_array($app->config['security']['ntlm']) ? $app->config['security']['ntlm'] : [];
        return array_merge(self::DEFAULTS, array_filter($c, function ($v) { return $v !== null; }));
    }

    public static function db(App $app)
    {
        $c = self::cfg($app);
        return $app->db($c['connection'] !== '' ? $c['connection'] : null);
    }

    /** `db.table` or `table`, quoted for the connection. */
    public static function qt(Db $db, $name)
    {
        return implode('.', array_map(function ($p) use ($db) { return $db->q($p); }, explode('.', (string)$name)));
    }

    /** Account sent by the web server; the preview's simulated user only when the app runs in debug mode. */
    public static function remoteUser(App $app)
    {
        $c = self::cfg($app);
        foreach ((array)$c['serverVars'] as $v) if (!empty($_SERVER[$v])) return (string)$_SERVER[$v];
        if ($c['trustedHeader'] !== '') {
            $h = 'HTTP_' . strtoupper(str_replace('-', '_', $c['trustedHeader']));
            if (!empty($_SERVER[$h])) return (string)$_SERVER[$h];
        }
        if ($c['devUser'] !== '' && !empty($app->config['debug'])) return (string)$c['devUser'];
        return null;
    }

    /** DOMAIN\user and user@domain → the name stored in the profile tables (R-LAB: USER@posteitaliane.it). */
    public static function normalize($raw, array $c)
    {
        $u = trim((string)$raw);
        if (!empty($c['stripDomain']) && ($p = strrpos($u, '\\')) !== false) $u = substr($u, $p + 1);
        if (strpos($u, '@') === false) {
            if (!empty($c['uppercase'])) $u = strtoupper($u);
            if ($c['suffix'] !== '') $u .= $c['suffix'];
        } elseif (!empty($c['uppercase'])) {
            $at = strpos($u, '@');
            $u = strtoupper(substr($u, 0, $at)) . substr($u, $at);
        }
        return $u;
    }

    /** The profile and permission tables, created when missing (same columns as R-LAB). */
    public static function ensureTables(App $app)
    {
        $c = self::cfg($app);
        if (empty($c['createTables'])) return;
        $db = self::db($app);
        $vc = function ($n) use ($db) { return ($db->driver === 'oracle' ? 'VARCHAR2' : ($db->driver === 'sqlsrv' ? 'NVARCHAR' : 'VARCHAR')) . "($n)"; };
        $q = function ($n) use ($db) { return $db->q($n); };
        $ddl = [
            $c['userTable'] => 'CREATE TABLE ' . self::qt($db, $c['userTable']) . " ({$q($c['userCol'])} {$vc(255)}, {$q($c['groupCol'])} {$vc(255)} NOT NULL, {$q($c['areaCol'])} {$vc(255)} NOT NULL)",
            $c['permTable'] => 'CREATE TABLE ' . self::qt($db, $c['permTable']) . " ({$q($c['permGroupCol'])} {$vc(14)}, {$q($c['permPageCol'])} {$vc(255)}, {$q($c['permCol'])} {$vc(25)})",
        ];
        foreach ($ddl as $table => $sql) {
            try { $db->query('SELECT 1 FROM ' . self::qt($db, $table) . ' WHERE 1=0'); } catch (\Throwable $e) { $db->query($sql); }
        }
    }

    /** Groups, area and display name of an account (rows of the profile table). */
    public static function lookup(App $app, $username)
    {
        $c = self::cfg($app);
        $db = self::db($app);
        $col = $db->q($c['userCol']);
        $like = $c['match'] === 'like';
        $rows = $db->all('SELECT ' . $db->q($c['groupCol']) . ' AS g, ' . $db->q($c['areaCol']) . ' AS a FROM ' . self::qt($db, $c['userTable'])
            . ' WHERE ' . ($like ? "UPPER($col) LIKE UPPER(?)" : "UPPER($col) = UPPER(?)"), [$like ? '%' . $username . '%' : $username]);
        $groups = [];
        $area = '';
        foreach ($rows as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            if ((string)$r['g'] !== '') $groups[] = trim((string)$r['g']);
            if ($area === '' && (string)$r['a'] !== '') $area = (string)$r['a'];
        }
        $first = $last = '';
        if ($c['profileTable'] !== '') {
            try {
                $p = $db->row('SELECT ' . $db->q($c['firstNameCol']) . ' AS f, ' . $db->q($c['lastNameCol']) . ' AS l FROM ' . self::qt($db, $c['profileTable'])
                    . ' WHERE UPPER(' . $db->q($c['profileUserCol']) . ') = UPPER(?)', [$username]);
                if ($p) { $p = array_change_key_case($p, CASE_LOWER); $first = (string)$p['f']; $last = (string)$p['l']; }
            } catch (\Throwable $e) { /* optional table */ }
        }
        return ['groups' => array_values(array_unique($groups)), 'area' => $area, 'first' => $first, 'last' => $last];
    }

    /** Signs in the account sent by the web server (called on the first page without a session user). */
    public static function login(App $app)
    {
        $c = self::cfg($app);
        $raw = self::remoteUser($app);
        if ($raw === null || $raw === '') throw new HttpError(t('ntlm.missing'), 401);
        self::ensureTables($app);
        $username = self::normalize($raw, $c);
        $info = self::lookup($app, $username);
        if (!$info['groups'] && !empty($c['denyUnknown'])) throw new HttpError(t('ntlm.unknown', $username), 403);
        $full = trim($info['first'] . ' ' . $info['last']);
        $app->security->startUserSession($app->security->externalUser($username, $full !== '' ? $full : $username, $info['groups']));
        // Session variables of the R-LAB pages, for imported events and included header/menu files.
        $_SESSION['REMOTE_USER_POST_ELAB'] = $username;
        $_SESSION['usr'] = $username;
        $_SESSION['USERNAME_UTENTE_LOGGATO'] = $username;
        $_SESSION['GROUP_FOR_PAGE'] = $info['groups'] ? $info['groups'][0] : '';
        $_SESSION['GROUP_FOR_PAGE_MENU'] = $_SESSION['GROUP_FOR_PAGE'];
        $_SESSION['ROLE_UTENTE_LOGGATO'] = $_SESSION['GROUP_FOR_PAGE'];
        $_SESSION['AREA_UTENTE_LOGGATO'] = $info['area'];
        $_SESSION['NOME_UTENTE_LOGGATO'] = $info['first'];
        $_SESSION['COGNOME_UTENTE_LOGGATO'] = $info['last'];
        $_SESSION['mc_ntlm_raw'] = $raw;
    }

    /** classic-style page names of a table ("<short>_list.php" and similar) and the table names they stand for. */
    private static function pageIndex(App $app)
    {
        $idx = [];
        foreach ($app->config['tables'] as $name => $file) {
            $idx[strtolower($name)] = $name;
            $short = isset($app->config['tableShort'][$name]) ? $app->config['tableShort'][$name] : preg_replace('/[^a-z0-9_]/', '_', strtolower($name));
            $idx[$short] = $name;
        }
        foreach (['reports' => 'report:', 'charts' => 'chart:', 'dashboards' => 'dashboard:'] as $k => $prefix) {
            foreach (isset($app->config[$k]) ? array_keys($app->config[$k]) : [] as $n) $idx[strtolower($n)] = $prefix . $n;
        }
        return $idx;
    }

    /** Rights [group][table] from the permission table: R → view/print, W → add/edit/delete/import, L → list/search. */
    public static function rights(App $app)
    {
        $c = self::cfg($app);
        $db = self::db($app);
        $idx = self::pageIndex($app);
        $out = [];
        try {
            $rows = $db->all('SELECT ' . $db->q($c['permGroupCol']) . ' AS g, ' . $db->q($c['permPageCol']) . ' AS p, ' . $db->q($c['permCol']) . ' AS r FROM ' . self::qt($db, $c['permTable']));
        } catch (\Throwable $e) { return []; }
        foreach ($rows as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $g = trim((string)$r['g']);
            $page = strtolower(trim((string)$r['p']));
            $flags = strtoupper((string)$r['r']);
            $letters = '';
            if (preg_match('/^(.+)_(list|view|add|edit|delete|search|print|export|import)\.php$/', $page, $m) && isset($idx[$m[1]])) {
                // one phpr page: any flag grants that page
                if (preg_match('/[RWL]/', $flags)) $letters = self::PAGE_LETTERS[$m[2]];
                $target = $idx[$m[1]];
            } else {
                $key = preg_replace('/\.php$/', '', $page);
                if (!isset($idx[$key])) continue; // pages of other applications (index.php, k-…php)
                $target = $idx[$key];
                if (strpos($flags, 'L') !== false) $letters .= 'S';
                if (strpos($flags, 'R') !== false) $letters .= 'SVP';
                if (strpos($flags, 'W') !== false) $letters .= 'AEDI';
            }
            if ($letters === '') continue;
            $out[$g][$target] = count_chars((isset($out[$g][$target]) ? $out[$g][$target] : '') . $letters, 3);
        }
        return $out;
    }

    /** One row of the access table per page, as the R-LAB header does. */
    public static function logAccess(App $app)
    {
        $c = self::cfg($app);
        $u = $app->security->user();
        if (empty($c['accessLog']) || !$u || $app->wantsJson()) return;
        try {
            $db = self::db($app);
            $page = isset($_GET['t']) && $_GET['t'] !== '' ? preg_replace('/[^a-z0-9_]/', '_', strtolower((string)$_GET['t'])) . '_' . $app->page . '.php' : $app->page . '.php';
            $ip = getenv('HTTP_CLIENT_IP') ?: (getenv('HTTP_X_FORWARDED_FOR') ?: (getenv('REMOTE_ADDR') ?: ''));
            $cols = ['data' => date('Y-m-d H:i:s'), 'ip' => $ip, 'userid' => $u['username'], 'username' => (string)$u['fullname'],
                'gruppo' => isset($_SESSION['GROUP_FOR_PAGE']) ? $_SESSION['GROUP_FOR_PAGE'] : '', 'pagina' => $page,
                'url' => isset($_SERVER['REQUEST_URI']) ? mb_substr($_SERVER['REQUEST_URI'], 0, 1000) : '',
                'browser' => isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : '', 'versione' => (string)$c['accessVersion']];
            $db->query('INSERT INTO ' . self::qt($db, $c['accessTable']) . ' (' . implode(', ', array_map([$db, 'q'], array_keys($cols))) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($cols));
        } catch (\Throwable $e) {
            error_log('MiB-Crude NTLM access log: ' . $e->getMessage());
        }
    }
}
