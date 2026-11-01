<?php
namespace MiB;

/**
 * Notifications (addNotification of .phpr projects): messages for one user or for everybody, shown under the
 * bell of the header. Stored in the main database; each user keeps the id of the last one seen.
 */
class Notifications
{
    /** On when users log in, unless settings.notifications is false. */
    public static function enabled()
    {
        $app = App::$i;
        return $app->security->enabled() && $app->setting('notifications', true) !== false;
    }

    /**
     * $expire: date/time string, DateTime, Unix time or null (never). $user: user name, null = everybody.
     * @return int|null id of the notification
     */
    public static function add($message, $title = '', $icon = '', $url = '', $expire = null, $user = null, $newWindow = false)
    {
        if (!self::enabled()) return null;
        $db = App::$i->db();
        if ($expire instanceof \DateTimeInterface) $expire = $expire->format('Y-m-d H:i:s');
        elseif (is_int($expire) || (is_string($expire) && ctype_digit($expire))) $expire = date('Y-m-d H:i:s', (int)$expire);
        elseif ($expire !== null && $expire !== '') $expire = date('Y-m-d H:i:s', strtotime((string)$expire));
        else $expire = null;
        return $db->insert(Schema::t('notifications'), [
            'username' => $user === null || $user === '' ? null : (string)$user,
            'title' => mb_substr((string)$title, 0, 255), 'message' => (string)$message,
            'icon' => preg_replace('/^(bi-|fa-)/', '', mb_substr((string)$icon, 0, 50)), 'url' => mb_substr((string)$url, 0, 500),
            'new_window' => $newWindow ? 1 : 0, 'created_at' => $db->now(), 'expires_at' => $expire,
        ], 'id');
    }

    private static function lastSeen(Db $db, $me)
    {
        return (int)$db->value('SELECT ' . $db->q('last_id') . ' FROM ' . $db->table(Schema::t('notif_seen')) . ' WHERE ' . $db->q('username') . ' = ?', [$me]);
    }

    /** Latest notifications of the current user: ['items' => [...], 'unread' => n]. */
    public static function forUser($limit = 20)
    {
        $db = App::$i->db();
        $me = (string)userName();
        $t = $db->table(Schema::t('notifications'));
        $where = '(' . $db->q('username') . ' IS NULL OR ' . $db->q('username') . ' = ?) AND (' . $db->q('expires_at') . ' IS NULL OR ' . $db->q('expires_at') . ' > ?)';
        $now = date('Y-m-d H:i:s');
        $seen = self::lastSeen($db, $me);
        $unread = (int)$db->value("SELECT COUNT(*) FROM $t WHERE $where AND " . $db->q('id') . ' > ?', [$me, $now, $seen]);
        $rows = $db->all($db->limit("SELECT * FROM $t WHERE $where", $limit, 0, $db->q('id') . ' DESC'), [$me, $now]);
        $items = [];
        foreach ($rows as $r) {
            $r = array_change_key_case($r, CASE_LOWER);
            $items[] = ['id' => (int)$r['id'], 'title' => (string)$r['title'], 'message' => (string)$r['message'], 'icon' => (string)$r['icon'],
                'url' => (string)$r['url'], 'newWindow' => !empty($r['new_window']), 'at' => Format::date($r['created_at'], 'dateTimeFormat'), 'unread' => (int)$r['id'] > $seen];
        }
        return ['items' => $items, 'unread' => $unread];
    }

    /** Everything up to now is seen by the current user. */
    public static function markSeen()
    {
        $db = App::$i->db();
        $me = (string)userName();
        $max = (int)$db->value('SELECT MAX(' . $db->q('id') . ') FROM ' . $db->table(Schema::t('notifications')));
        $tbl = Schema::t('notif_seen');
        if ($db->value('SELECT COUNT(*) FROM ' . $db->table($tbl) . ' WHERE ' . $db->q('username') . ' = ?', [$me])) $db->update($tbl, ['last_id' => $max], ['username' => $me]);
        else $db->insert($tbl, ['username' => $me, 'last_id' => $max]);
    }

    /** Sent list for the admin page. */
    public static function recent($limit = 50)
    {
        $db = App::$i->db();
        $rows = $db->all($db->limit('SELECT * FROM ' . $db->table(Schema::t('notifications')), $limit, 0, $db->q('id') . ' DESC'));
        return array_map(function ($r) { return array_change_key_case($r, CASE_LOWER); }, $rows);
    }

    public static function delete($id)
    {
        App::$i->db()->delete(Schema::t('notifications'), ['id' => (int)$id]);
    }
}
