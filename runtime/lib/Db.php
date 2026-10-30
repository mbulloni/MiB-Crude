<?php
namespace MiB;

use PDO;

/** One PDO connection plus the SQL dialect differences of the five supported engines. */
class Db
{
    /** @var PDO */
    public $pdo;
    public $driver;
    public $id;
    public $schema;

    public function __construct($id, array $c, $password)
    {
        $this->id = $id;
        $this->driver = $c['driver'];
        $this->schema = isset($c['schema']) ? $c['schema'] : '';
        $host = isset($c['host']) && $c['host'] !== '' ? $c['host'] : 'localhost';
        $port = isset($c['port']) ? $c['port'] : '';
        $db = isset($c['database']) ? $c['database'] : '';
        $user = isset($c['user']) ? $c['user'] : null;
        switch ($this->driver) {
            case 'mysql':
                $dsn = "mysql:host=$host;" . ($port ? "port=$port;" : '') . "dbname=$db;charset=utf8mb4";
                break;
            case 'pgsql':
                $dsn = "pgsql:host=$host;" . ($port ? "port=$port;" : '') . "dbname=$db";
                break;
            case 'sqlsrv':
                $dsn = "sqlsrv:Server=$host" . ($port ? ",$port" : '') . ";Database=$db;TrustServerCertificate=1";
                break;
            case 'oracle':
                $dsn = "oci:dbname=//$host:" . ($port ?: 1521) . "/$db;charset=AL32UTF8";
                break;
            case 'sqlite':
                $file = $c['file'];
                if ($file !== '' && $file[0] !== '/' && !preg_match('~^[A-Za-z]:~', $file)) $file = App::$i->root . '/' . $file;
                $dsn = "sqlite:$file";
                $user = null;
                $password = null;
                break;
            default:
                throw new \RuntimeException("Unsupported driver {$this->driver}");
        }
        $this->pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_CASE => PDO::CASE_NATURAL,
        ]);
        if ($this->driver === 'sqlite') $this->pdo->exec('PRAGMA foreign_keys = ON');
        if ($this->driver === 'oracle') $this->pdo->exec("ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD HH24:MI:SS' NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH24:MI:SS'");
    }

    /** Quote an identifier (table/column) taken from the trusted project configuration. */
    public function q($name)
    {
        $parts = explode('.', $name);
        $out = [];
        foreach ($parts as $p) {
            switch ($this->driver) {
                case 'mysql': $out[] = '`' . str_replace('`', '``', $p) . '`'; break;
                case 'sqlsrv': $out[] = '[' . str_replace(']', ']]', $p) . ']'; break;
                default: $out[] = '"' . str_replace('"', '""', $p) . '"';
            }
        }
        return implode('.', $out);
    }

    public function table($name)
    {
        return $this->schema !== '' && strpos($name, '.') === false && $this->driver !== 'mysql' && $this->driver !== 'sqlite'
            ? $this->q($this->schema . '.' . $name) : $this->q($name);
    }

    /** Add paging to a SELECT. $orderBy must be non-empty for SQL Server/Oracle. */
    public function limit($sql, $limit, $offset, $orderBy)
    {
        $limit = (int)$limit;
        $offset = (int)$offset;
        switch ($this->driver) {
            case 'sqlsrv':
            case 'oracle':
                if ($orderBy === '') $orderBy = $this->driver === 'sqlsrv' ? '(SELECT NULL)' : '1';
                return "$sql ORDER BY $orderBy OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY";
            default:
                return $sql . ($orderBy !== '' ? " ORDER BY $orderBy" : '') . " LIMIT $limit OFFSET $offset";
        }
    }

    /** Case-insensitive LIKE expression. */
    public function like($expr)
    {
        switch ($this->driver) {
            case 'pgsql': return "CAST($expr AS TEXT) ILIKE ?";
            case 'oracle': return "UPPER(TO_CHAR($expr)) LIKE UPPER(?)";
            case 'sqlsrv': return "CAST($expr AS NVARCHAR(MAX)) LIKE ?";
            default: return "$expr LIKE ?";
        }
    }

    public function concat(array $parts)
    {
        if (count($parts) === 1) return $parts[0];
        if ($this->driver === 'mysql') return 'CONCAT(' . implode(', ', $parts) . ')';
        if ($this->driver === 'sqlsrv') return 'CONCAT(' . implode(', ', $parts) . ')';
        return implode(' || ', $parts);
    }

    public function query($sql, array $params = [])
    {
        $st = $this->pdo->prepare($sql);
        $i = 1;
        foreach ($params as $p) {
            if (is_bool($p)) $st->bindValue($i++, $p ? 1 : 0, PDO::PARAM_INT);
            elseif (is_int($p)) $st->bindValue($i++, $p, PDO::PARAM_INT);
            elseif ($p === null) $st->bindValue($i++, null, PDO::PARAM_NULL);
            elseif (is_array($p) && isset($p['__lob'])) $st->bindValue($i++, $p['__lob'], PDO::PARAM_LOB);
            else $st->bindValue($i++, $p);
        }
        $st->execute();
        return $st;
    }

    public function all($sql, array $params = [])
    {
        // LOB columns come back as streams; PDO_OCI reuses them between rows, so read each row as it is fetched.
        $st = $this->query($sql, $params);
        $rows = [];
        while (($r = $st->fetch()) !== false) {
            foreach ($r as $k => $v) if (is_resource($v)) $r[$k] = stream_get_contents($v);
            $rows[] = $r;
        }
        return $rows;
    }

    public function row($sql, array $params = [])
    {
        $r = $this->query($sql, $params)->fetch();
        if (!$r) return null;
        $n = $this->normalize([$r]);
        return $n[0];
    }

    public function value($sql, array $params = [])
    {
        $v = $this->query($sql, $params)->fetchColumn();
        if (is_resource($v)) $v = stream_get_contents($v);
        return $v === false ? null : $v;
    }

    /** Lower-case Oracle column names when the config uses lower case, read LOB streams. */
    private function normalize(array $rows)
    {
        foreach ($rows as &$r) {
            foreach ($r as $k => $v) if (is_resource($v)) $r[$k] = stream_get_contents($v);
        }
        return $rows;
    }

    /**
     * Insert a row and return the generated key of $autoField (or null).
     * @param array $values column => value
     */
    public function insert($table, array $values, $autoField = null)
    {
        $cols = [];
        $marks = [];
        foreach ($values as $k => $v) { $cols[] = $this->q($k); $marks[] = '?'; }
        $sql = 'INSERT INTO ' . $this->table($table) . ' (' . implode(', ', $cols) . ') ';
        if ($this->driver === 'pgsql' && $autoField) {
            $sql .= (count($cols) ? 'VALUES (' . implode(', ', $marks) . ')' : 'DEFAULT VALUES') . ' RETURNING ' . $this->q($autoField);
            return $this->query($sql, array_values($values))->fetchColumn();
        }
        if ($this->driver === 'sqlsrv' && $autoField) {
            $sql = 'INSERT INTO ' . $this->table($table) . (count($cols) ? ' (' . implode(', ', $cols) . ')' : '')
                . ' OUTPUT INSERTED.' . $this->q($autoField) . (count($cols) ? ' VALUES (' . implode(', ', $marks) . ')' : ' DEFAULT VALUES');
            return $this->query($sql, array_values($values))->fetchColumn();
        }
        if ($this->driver === 'oracle' && $autoField) {
            $sql .= 'VALUES (' . implode(', ', $marks) . ') RETURNING ' . $this->q($autoField) . ' INTO ?';
            $st = $this->pdo->prepare($sql);
            $i = 1;
            foreach ($values as $v) $st->bindValue($i++, $v);
            $id = ''; // PDO_OCI fills an OUT parameter only when it starts as a string
            $st->bindParam($i, $id, PDO::PARAM_STR | PDO::PARAM_INPUT_OUTPUT, 40);
            $st->execute();
            return $id;
        }
        $sql .= count($cols) ? 'VALUES (' . implode(', ', $marks) . ')' : ($this->driver === 'mysql' ? 'VALUES ()' : 'DEFAULT VALUES');
        $this->query($sql, array_values($values));
        return $autoField ? $this->pdo->lastInsertId() : null;
    }

    public function update($table, array $values, array $where)
    {
        if (!$values) return 0;
        $set = [];
        foreach ($values as $k => $v) $set[] = $this->q($k) . ' = ?';
        list($w, $wp) = $this->where($where);
        return $this->query('UPDATE ' . $this->table($table) . ' SET ' . implode(', ', $set) . " WHERE $w", array_merge(array_values($values), $wp))->rowCount();
    }

    public function delete($table, array $where)
    {
        list($w, $wp) = $this->where($where);
        return $this->query('DELETE FROM ' . $this->table($table) . " WHERE $w", $wp)->rowCount();
    }

    /** column => value map to "a = ? AND b IS NULL". */
    public function where(array $where, $alias = '')
    {
        $parts = [];
        $params = [];
        foreach ($where as $k => $v) {
            $col = ($alias !== '' ? $alias . '.' : '') . $this->q($k);
            if ($v === null) $parts[] = "$col IS NULL";
            else { $parts[] = "$col = ?"; $params[] = $v; }
        }
        return [$parts ? implode(' AND ', $parts) : '1=1', $params];
    }

    public function now()
    {
        return date('Y-m-d H:i:s');
    }

    public function begin() { $this->pdo->beginTransaction(); }
    public function commit() { $this->pdo->commit(); }
    public function rollback() { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); }
}
