<?php
namespace MiB;

/**
 * Stored procedure datasource (source.type = proc): the procedure is called once per request with its
 * parameters and its first result set becomes the records; quick search, filters, sorting, paging, totals
 * and lookups then work in memory as for REST sources (Rest::filter). Read only.
 *   MariaDB/MySQL  CALL name(?, ...)
 *   SQL Server     EXEC name ?, ...
 *   PostgreSQL     SELECT * FROM name(?, ...)          (function returning a table)
 *   Oracle         SELECT * FROM TABLE(name(?, ...))   (pipelined function)
 * Parameters: [{name, from: value|session|user|get|event, value}]; the ProcParams event can change them.
 */
class Proc
{
    const MAX_ROWS = 50000;

    /** Values of the parameters, in order. */
    public static function params(Table $t)
    {
        $s = $t->def['source'];
        $vals = [];
        foreach (isset($s['params']) && is_array($s['params']) ? $s['params'] : [] as $p) {
            $name = isset($p['name']) ? (string)$p['name'] : '';
            $v = isset($p['value']) ? $p['value'] : '';
            switch (isset($p['from']) ? $p['from'] : 'value') {
                case 'session': $v = isset($_SESSION[$v]) ? $_SESSION[$v] : null; break;
                case 'user': $v = userId(); break;
                case 'get': $v = isset($_GET[$v]) && !is_array($_GET[$v]) ? (string)$_GET[$v] : (isset($p['default']) ? $p['default'] : null); break;
                case 'null': $v = null; break;
                default: break;
            }
            $vals[$name !== '' ? $name : count($vals)] = $v;
        }
        // PHP code can compute or override them: function ProcParams(&$params) { $params['anno'] = date('Y'); }
        $t->app->event($t->name, 'ProcParams', [&$vals]);
        return $vals;
    }

    /** SQL calling the procedure with one placeholder per parameter. */
    public static function sql(Db $db, $name, $n)
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_$#]*(\.[A-Za-z_][A-Za-z0-9_$#]*){0,2}$/', $name)) throw new \RuntimeException("Nome di procedura non valido: $name");
        $marks = implode(', ', array_fill(0, $n, '?'));
        $qn = $db->q($name);
        switch ($db->driver) {
            case 'mysql': return "CALL $qn($marks)";
            case 'sqlsrv': return "SET NOCOUNT ON; EXEC $qn" . ($n ? " $marks" : '');
            case 'pgsql': return "SELECT * FROM $qn($marks)";
            case 'oracle': return "SELECT * FROM TABLE($qn($marks))";
            default: throw new \RuntimeException(t('proc.unsupported', $db->driver));
        }
    }

    /** Records returned by the procedure (first result set with columns). */
    public static function rows(Table $t)
    {
        $db = $t->db;
        $params = array_values(self::params($t));
        $st = $db->pdo->prepare(self::sql($db, $t->def['source']['procedure'], count($params)));
        foreach ($params as $i => $v) $st->bindValue($i + 1, $v, $v === null ? \PDO::PARAM_NULL : \PDO::PARAM_STR);
        $st->execute();
        // SQL Server and MySQL may return empty results (counts, messages) before the data
        $guard = 0;
        while ($st->columnCount() === 0 && $guard++ < 20) {
            if (!$st->nextRowset()) break;
        }
        $rows = [];
        if ($st->columnCount() > 0) {
            while (count($rows) < self::MAX_ROWS && ($r = $st->fetch(\PDO::FETCH_ASSOC)) !== false) $rows[] = self::names($t, $r);
        }
        // the rest of the results must be read before the connection can run other statements
        try { while ($st->nextRowset()) { /* skip */ } } catch (\PDOException $e) { /* driver without more results */ }
        $st->closeCursor();
        return $rows;
    }

    /** Column names as declared in the fields (Oracle returns them in upper case). */
    private static function names(Table $t, array $r)
    {
        static $map = [];
        if (!isset($map[$t->name])) {
            $map[$t->name] = [];
            foreach ($t->def['fields'] as $f) $map[$t->name][strtolower($f['name'])] = $f['name'];
        }
        $out = [];
        foreach ($r as $k => $v) {
            $lk = strtolower($k);
            $out[isset($map[$t->name][$lk]) ? $map[$t->name][$lk] : $k] = is_resource($v) ? stream_get_contents($v) : $v;
        }
        return $out;
    }
}
