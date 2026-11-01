<?php
namespace MiB;

/**
 * Saved searches of the list pages (classic "Save search"): quick search, advanced search and filter panel
 * stored under a name in mc_searches, per user; administrators can share one with everybody.
 * Available with the sign-in on (the searches belong to a user).
 */
class Searches
{
    public static function enabled()
    {
        $app = App::$i;
        return $app->security->enabled() && $app->security->user() && $app->setting('savedSearches', true) !== false;
    }

    private static function tbl(Db $db)
    {
        return $db->table(Schema::t('searches'));
    }

    /** Searches of a table visible to the current user: own ones and shared ones. */
    public static function forTable($table)
    {
        if (!self::enabled()) return [];
        $db = App::$i->db();
        $q = function ($c) use ($db) { return $db->q($c); };
        $rows = $db->all('SELECT ' . $q('id') . ', ' . $q('username') . ', ' . $q('title') . ', ' . $q('query_json') . ', ' . $q('shared') . ' FROM ' . self::tbl($db)
            . ' WHERE ' . $q('table_name') . ' = ? AND (' . $q('username') . ' = ? OR ' . $q('shared') . ' = 1) ORDER BY ' . $q('title'), [$table, userName()]);
        $out = [];
        foreach ($rows as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $query = json_decode(is_resource($r['query_json']) ? stream_get_contents($r['query_json']) : (string)$r['query_json'], true);
            $out[] = ['id' => (int)$r['id'], 'title' => (string)$r['title'], 'mine' => (string)$r['username'] === (string)userName(), 'shared' => (int)$r['shared'] === 1,
                'query' => is_array($query) ? $query : []];
        }
        return $out;
    }

    /** Only the parts of a list request that a search is made of, with field names of the table. */
    public static function clean(Table $t, array $q)
    {
        $out = [];
        if (isset($q['q']) && is_string($q['q']) && trim($q['q']) !== '') $out['q'] = trim($q['q']);
        foreach (['s', 'f'] as $k) {
            if (empty($q[$k]) || !is_array($q[$k])) continue;
            foreach ($q[$k] as $name => $v) if ($t->field($name) && (is_array($v) || is_string($v))) $out[$k][$name] = $v;
        }
        return $out;
    }

    public static function save(Table $t, $title, array $query, $shared)
    {
        $db = App::$i->db();
        $q = function ($c) use ($db) { return $db->q($c); };
        $title = mb_substr(trim((string)$title), 0, 200);
        if ($title === '') throw new HttpError(t('search.notitle'), 400);
        $json = json_encode(self::clean($t, $query), JSON_UNESCAPED_UNICODE);
        $shared = $shared && isAdmin() ? 1 : 0;
        // the same name again replaces the user's search
        $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $q('table_name') . ' = ? AND ' . $q('username') . ' = ? AND ' . $q('title') . ' = ?', [$t->name, userName(), $title]);
        $db->query('INSERT INTO ' . self::tbl($db) . ' (' . implode(', ', array_map($q, ['username', 'table_name', 'title', 'query_json', 'shared', 'created_at'])) . ') VALUES (?, ?, ?, ?, ?, ?)',
            [userName(), $t->name, $title, $json, $shared, date('Y-m-d H:i:s')]);
    }

    /** Own searches; administrators also shared ones. */
    public static function delete($id)
    {
        $db = App::$i->db();
        $q = function ($c) use ($db) { return $db->q($c); };
        $db->query('DELETE FROM ' . self::tbl($db) . ' WHERE ' . $q('id') . ' = ? AND (' . $q('username') . ' = ?' . (isAdmin() ? ' OR ' . $q('shared') . ' = 1' : '') . ')', [(int)$id, userName()]);
    }
}
