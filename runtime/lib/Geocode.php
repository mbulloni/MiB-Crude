<?php
namespace MiB;

/**
 * Geocoding for the map view: a map view with addressField ("indirizzo" or "{via}, {cap} {citta}") gets its
 * latitude/longitude from the address when a record is added, when the address changes, and in bulk
 * (button of the map view, or Geocode::fill('tabella') in a scheduled task). settings.geocode:
 *   provider "nominatim" (OpenStreetMap, free, at most one request a second, url for a server of your own)
 *   provider "google"    (Geocoding API, key in the secrets)
 */
class Geocode
{
    const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
    private static $cache = [];
    private static $lastCall = 0.0;

    public static function cfg()
    {
        $c = App::$i->setting('geocode', []);
        return is_array($c) ? $c : [];
    }

    public static function enabled()
    {
        $c = self::cfg();
        return !empty($c['provider']);
    }

    /** Map views of the table that take the coordinates from an address. */
    public static function views(Table $t)
    {
        if (!self::enabled()) return [];
        $out = [];
        foreach (isset($t->def['pages']['list']['views']) ? $t->def['pages']['list']['views'] : [] as $v) {
            if (isset($v['type']) && $v['type'] === 'map' && !empty($v['addressField']) && !empty($v['latField']) && !empty($v['lngField'])) $out[] = $v;
        }
        return $out;
    }

    /** Address of a record: a field name or a "{field}" template. */
    public static function address(array $view, array $row)
    {
        $a = (string)$view['addressField'];
        if (strpos($a, '{') === false) return trim((string)(isset($row[$a]) ? $row[$a] : ''));
        $s = preg_replace_callback('/\{([^}]+)\}/', function ($m) use ($row) { return isset($row[$m[1]]) ? (string)$row[$m[1]] : ''; }, $a);
        return trim(preg_replace('/\s+/', ' ', preg_replace('/(\s*,\s*)+/', ', ', $s)), " ,");
    }

    /** [lat, lng] of an address, or null (not found, provider error: written to the PHP log). */
    public static function query($address)
    {
        $address = trim((string)$address);
        if ($address === '') return null;
        if (array_key_exists($address, self::$cache)) return self::$cache[$address];
        $c = self::cfg();
        $app = App::$i;
        $ua = 'MiB-Crude (' . $app->label($app->config['title']) . ')';
        try {
            if ($c['provider'] === 'google') {
                $key = isset($app->secrets['geocode']['key']) ? (string)$app->secrets['geocode']['key'] : '';
                $j = self::get('https://maps.googleapis.com/maps/api/geocode/json?' . http_build_query(['address' => $address, 'key' => $key]), $ua);
                if (!isset($j['status']) || $j['status'] !== 'OK') {
                    if (isset($j['status']) && $j['status'] !== 'ZERO_RESULTS') error_log('[MiB-Crude] geocode google: ' . $j['status'] . (isset($j['error_message']) ? ' ' . $j['error_message'] : ''));
                    return self::$cache[$address] = null;
                }
                $loc = $j['results'][0]['geometry']['location'];
                return self::$cache[$address] = [(float)$loc['lat'], (float)$loc['lng']];
            }
            // Nominatim usage policy: an identifying User-Agent and at most one request per second
            $wait = 1.0 - (microtime(true) - self::$lastCall);
            if ($wait > 0 && empty($c['url'])) usleep((int)($wait * 1e6));
            self::$lastCall = microtime(true);
            $params = ['format' => 'jsonv2', 'limit' => 1, 'q' => $address];
            if (!empty($c['countries'])) $params['countrycodes'] = (string)$c['countries'];
            $j = self::get((!empty($c['url']) ? (string)$c['url'] : self::NOMINATIM) . '?' . http_build_query($params), $ua);
            if (!is_array($j) || !isset($j[0]['lat'], $j[0]['lon'])) return self::$cache[$address] = null;
            return self::$cache[$address] = [(float)$j[0]['lat'], (float)$j[0]['lon']];
        } catch (\Throwable $e) {
            error_log('[MiB-Crude] geocode: ' . $e->getMessage());
            return null;
        }
    }

    private static function get($url, $ua)
    {
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => "User-Agent: $ua\r\nAccept: application/json", 'timeout' => 10, 'ignore_errors' => true]]);
        $fp = @fopen($url, 'r', false, $ctx);
        if (!$fp) throw new \RuntimeException('servizio di geocodifica non raggiungibile');
        $body = stream_get_contents($fp);
        fclose($fp);
        return json_decode((string)$body, true);
    }

    private static function blank($v)
    {
        return $v === null || $v === '' || (is_numeric($v) && (float)$v === 0.0);
    }

    /**
     * Before writing a record: coordinates from the address when they are empty, or when the address changed
     * and the user did not change them. $old = null for a new record.
     */
    public static function apply(Table $t, array &$vals, $old = null)
    {
        foreach (self::views($t) as $v) {
            $row = $old ? array_merge($old, $vals) : $vals;
            $addr = self::address($v, $row);
            if ($addr === '') continue;
            $lat = isset($row[$v['latField']]) ? $row[$v['latField']] : null;
            $lng = isset($row[$v['lngField']]) ? $row[$v['lngField']] : null;
            $need = self::blank($lat) || self::blank($lng);
            if (!$need && $old) {
                $moved = self::address($v, $old) !== $addr;
                $userSet = (string)$lat !== (string)(isset($old[$v['latField']]) ? $old[$v['latField']] : '') || (string)$lng !== (string)(isset($old[$v['lngField']]) ? $old[$v['lngField']] : '');
                $need = $moved && !$userSet;
            }
            if (!$need) continue;
            $p = self::query($addr);
            if ($p) { $vals[$v['latField']] = $p[0]; $vals[$v['lngField']] = $p[1]; }
        }
    }

    /** Records without coordinates (at most $limit): fills them. @return array [filled, not found] */
    public static function fill($table, $limit = 50)
    {
        $t = $table instanceof Table ? $table : App::$i->table($table);
        $done = 0;
        $missing = 0;
        $wt = $t->writeTable();
        if (!$wt) return [0, 0];
        foreach (self::views($t) as $v) {
            $rows = array_filter($t->fetch([], 5000, 0), function ($r) use ($v) { return self::blank(isset($r[$v['latField']]) ? $r[$v['latField']] : null) || self::blank(isset($r[$v['lngField']]) ? $r[$v['lngField']] : null); });
            foreach (array_slice(array_values($rows), 0, max(1, (int)$limit)) as $r) {
                $p = self::query(self::address($v, $r));
                if (!$p) { $missing++; continue; }
                $t->db->update($wt, [$v['latField'] => $p[0], $v['lngField'] => $p[1]], $t->keysFromRow($r));
                $done++;
            }
        }
        return [$done, $missing];
    }
}
