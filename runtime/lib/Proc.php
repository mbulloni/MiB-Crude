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
 * Writing (source.write.insert|update|delete = {procedure, params}): parameters also from "field" (value of the
 * record: the new one, else the old one) and "key" (key of the record); an insert procedure may return the new key
 * as the first column of its first row.
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

    /** Is there a procedure for insert / update / delete? */
    public static function writes(Table $t, $op)
    {
        $s = $t->def['source'];
        return $s['type'] === 'proc' && !empty($s['write'][$op]['procedure']);
    }

    /**
     * Calls the write procedure of $op. MariaDB/MySQL and SQL Server: CALL / EXEC; PostgreSQL: CALL of a
     * procedure; Oracle: an anonymous block calling it. @return array keys of the record (insert)
     */
    public static function write(Table $t, $op, array $vals, array $keys, $old)
    {
        $w = $t->def['source']['write'][$op];
        $vars = [];
        foreach (isset($w['params']) && is_array($w['params']) ? $w['params'] : [] as $p) {
            $from = isset($p['from']) ? $p['from'] : 'field';
            $v = isset($p['value']) ? (string)$p['value'] : '';
            if ($from === 'field') $vars[] = array_key_exists($v, $vals) ? $vals[$v] : ($old && array_key_exists($v, $old) ? $old[$v] : null);
            elseif ($from === 'key') $vars[] = isset($keys[$v]) ? $keys[$v] : ($old && isset($old[$v]) ? $old[$v] : null);
            elseif ($from === 'session') $vars[] = isset($_SESSION[$v]) ? $_SESSION[$v] : null;
            elseif ($from === 'user') $vars[] = userId();
            elseif ($from === 'null') $vars[] = null;
            else $vars[] = $v;
        }
        $db = $t->db;
        $name = $w['procedure'];
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_$#]*(\.[A-Za-z_][A-Za-z0-9_$#]*){0,2}$/', $name)) throw new \RuntimeException("Nome di procedura non valido: $name");
        $marks = implode(', ', array_fill(0, count($vars), '?'));
        // Oracle: unquoted (upper case like the dictionary); the name is checked above
        $qn = $db->driver === 'oracle' ? $name : $db->q($name);
        switch ($db->driver) {
            case 'mysql': $sql = "CALL $qn($marks)"; break;
            case 'sqlsrv': $sql = "SET NOCOUNT ON; EXEC $qn" . ($vars ? " $marks" : ''); break;
            case 'pgsql': $sql = "CALL $qn($marks)"; break;
            case 'oracle': $sql = "BEGIN $qn($marks); END;"; break;
            default: throw new \RuntimeException(t('proc.unsupported', $db->driver));
        }
        $st = $db->pdo->prepare($sql);
        foreach ($vars as $i => $v) $st->bindValue($i + 1, $v, $v === null ? \PDO::PARAM_NULL : \PDO::PARAM_STR);
        $st->execute();
        $first = null;
        if ($op === 'insert' && $db->driver !== 'oracle') {
            for ($g = 0; $g < 20; $g++) {
                if ($st->columnCount() > 0) { $r = $st->fetch(\PDO::FETCH_NUM); if ($r) { $first = $r[0]; break; } }
                try { if (!$st->nextRowset()) break; } catch (\PDOException $e) { break; }
            }
        }
        try { while ($st->nextRowset()) { /* skip */ } } catch (\PDOException $e) { /* no more results */ }
        $st->closeCursor();
        Rest::forget($t);
        if ($op !== 'insert') return $keys;
        $out = [];
        foreach ($t->def['keys'] as $i => $k) $out[$k] = isset($vals[$k]) && $vals[$k] !== '' ? $vals[$k] : ($i === 0 ? $first : null);
        return $out;
    }

    /** SQL calling the procedure with one placeholder per parameter. */
    public static function sql(Db $db, $name, $n)
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_$#]*(\.[A-Za-z_][A-Za-z0-9_$#]*){0,2}$/', $name)) throw new \RuntimeException("Nome di procedura non valido: $name");
        $marks = implode(', ', array_fill(0, $n, '?'));
        // Oracle: unquoted (upper case like the dictionary); the name is checked above
        $qn = $db->driver === 'oracle' ? $name : $db->q($name);
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
        $sql = self::sql($db, $t->def['source']['procedure'], count($params));
        // PostgreSQL and Oracle read the result with a SELECT: the fixed WHERE of the table and the condition of
        // BeforeSelect apply there (columns as src.name); CALL / EXEC (MariaDB, SQL Server) cannot be filtered in SQL
        if (in_array($db->driver, ['pgsql', 'oracle'], true)) {
            $w = [];
            if (!empty($t->def['where'])) $w[] = '(' . $t->def['where'] . ')';
            $extra = '';
            $order = '';
            $t->app->event($t->name, 'BeforeSelect', [&$extra, &$order, $t->app->page]);
            if (trim($extra) !== '') $w[] = '(' . $extra . ')';
            if ($w) $sql = 'SELECT * FROM (' . $sql . ') src WHERE ' . implode(' AND ', $w);
        }
        $st = $db->pdo->prepare($sql);
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
        // PHP filter for every database: function ProcRows(&$rows) { $rows = array_filter(...); }
        $t->app->event($t->name, 'ProcRows', [&$rows]);
        return array_values($rows);
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
