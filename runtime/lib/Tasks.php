<?php
namespace MiB;

/**
 * Scheduled tasks: settings.tasks = [{name, title, cron, enabled}], code in the global event Task_<name>(&$message)
 * (return false or throw for a failure, $message is shown in the administration). The system runs
 * `php cron.php` every minute (crontab, Windows Task Scheduler); due tasks run one at a time under a file lock.
 * Last run, result, message and duration are kept in mc_tasks. Cron syntax: minute hour day month weekday,
 * with *, lists (1,15), ranges (1-5), steps (* /10, 8-18/2); weekday 0 or 7 = Sunday.
 */
class Tasks
{
    /** Tasks of the project (enabled or not). */
    public static function all()
    {
        $out = [];
        foreach ((array)App::$i->setting('tasks', []) as $t) {
            if (!is_array($t) || empty($t['name'])) continue;
            $out[$t['name']] = $t + ['title' => $t['name'], 'cron' => '0 * * * *', 'enabled' => true];
        }
        return $out;
    }

    // --- cron expressions ---------------------------------------------------------

    /** Values of one cron field, or null when it is not valid. */
    private static function field($expr, $min, $max)
    {
        $vals = [];
        foreach (explode(',', $expr) as $part) {
            if (!preg_match('~^(\*|(\d+)(?:-(\d+))?)(?:/(\d+))?$~', $part, $m)) return null;
            $step = isset($m[4]) && $m[4] !== '' ? (int)$m[4] : 1;
            if ($step < 1) return null;
            if ($m[1] === '*') { $a = $min; $b = $max; }
            else { $a = (int)$m[2]; $b = isset($m[3]) && $m[3] !== '' ? (int)$m[3] : ($step > 1 ? $max : $a); }
            if ($a < $min || $b > $max || $a > $b) return null;
            for ($v = $a; $v <= $b; $v += $step) $vals[$v] = true;
        }
        return $vals;
    }

    /** Parsed expression: [minutes, hours, days, months, weekdays, dayRestricted, weekdayRestricted] or null. */
    public static function parse($cron)
    {
        $p = preg_split('/\s+/', trim((string)$cron));
        if (count($p) !== 5) return null;
        $f = [self::field($p[0], 0, 59), self::field($p[1], 0, 23), self::field($p[2], 1, 31), self::field($p[3], 1, 12), self::field($p[4], 0, 7)];
        foreach ($f as $x) if ($x === null) return null;
        if (isset($f[4][7])) $f[4][0] = true;
        $f[] = $p[2] !== '*';
        $f[] = $p[4] !== '*';
        return $f;
    }

    /** Does the minute of $ts match the expression? (day and weekday both restricted: either one, as cron) */
    public static function matches(array $c, $ts)
    {
        list($mi, $h, $d, $mo, $wd, $dr, $wr) = $c;
        if (!isset($mi[(int)date('i', $ts)], $h[(int)date('G', $ts)], $mo[(int)date('n', $ts)])) return false;
        $dayOk = isset($d[(int)date('j', $ts)]);
        $wdOk = isset($wd[(int)date('w', $ts)]);
        if ($dr && $wr) return $dayOk || $wdOk;
        return $dayOk && $wdOk;
    }

    /** First matching minute after $after (within five years: 29 February too), or null. */
    public static function next($cron, $after)
    {
        $c = self::parse($cron);
        if (!$c) return null;
        $ts = (int)(floor($after / 60) * 60) + 60;
        $end = $after + 5 * 366 * 86400;
        for (; $ts <= $end; $ts += 60) {
            // skip whole hours/days that cannot match
            if (!isset($c[3][(int)date('n', $ts)])) { $ts = mktime(0, 0, 0, (int)date('n', $ts) + 1, 1, (int)date('Y', $ts)) - 60; continue; }
            if (!isset($c[1][(int)date('G', $ts)])) { $ts = mktime((int)date('G', $ts) + 1, 0, 0, (int)date('n', $ts), (int)date('j', $ts), (int)date('Y', $ts)) - 60; continue; }
            if (self::matches($c, $ts)) return $ts;
        }
        return null;
    }

    // --- state ------------------------------------------------------------------------

    private static function db()
    {
        return App::$i->db();
    }

    /** name => [last_run, ok, message, duration] */
    public static function state()
    {
        $db = self::db();
        $out = [];
        try {
            foreach ($db->all('SELECT * FROM ' . $db->table(Schema::t('tasks'))) as $r) {
                $r = array_change_key_case($r, CASE_LOWER);
                $msg = $r['message'];
                $out[$r['name']] = ['last_run' => $r['last_run'], 'ok' => (int)$r['ok'] === 1, 'message' => is_resource($msg) ? stream_get_contents($msg) : (string)$msg, 'duration' => (float)$r['duration']];
            }
        } catch (\Throwable $e) { /* table not created yet */ }
        return $out;
    }

    private static function record($name, $start, $ok, $message, $duration)
    {
        $db = self::db();
        $tbl = $db->table(Schema::t('tasks'));
        $q = function ($c) use ($db) { return $db->q($c); };
        $db->query("DELETE FROM $tbl WHERE {$q('name')} = ?", [$name]);
        $db->query("INSERT INTO $tbl ({$q('name')}, {$q('last_run')}, {$q('ok')}, {$q('message')}, {$q('duration')}) VALUES (?, ?, ?, ?, ?)",
            [$name, date('Y-m-d H:i:s', $start), $ok ? 1 : 0, mb_substr((string)$message, 0, 4000), round($duration, 3)]);
    }

    // --- running ----------------------------------------------------------------------

    /** Runs one task now. @return array [ok, message, seconds] */
    public static function run($name)
    {
        $tasks = self::all();
        if (!isset($tasks[$name])) throw new HttpError(t('error.notfound'), 404);
        $start = time();
        $t0 = microtime(true);
        $message = '';
        try {
            $r = App::$i->event('_global', 'Task_' . Table::ident($name), [&$message]);
            $ok = $r !== false;
        } catch (\Throwable $e) {
            $ok = false;
            $message = trim($message . ' ' . $e->getMessage());
            error_log('[MiB-Crude] task ' . $name . ': ' . $e);
        }
        $dur = microtime(true) - $t0;
        self::record($name, $start, $ok, $message, $dur);
        return [$ok, $message, $dur];
    }

    /** Tasks due now: the first scheduled minute after the last run (or the previous minute, the first time) has come. */
    public static function due($now = null)
    {
        $now = $now === null ? time() : $now;
        $state = self::state();
        $out = [];
        foreach (self::all() as $name => $t) {
            if (empty($t['enabled'])) continue;
            $last = isset($state[$name]) ? strtotime($state[$name]['last_run']) : $now - 60;
            $next = self::next($t['cron'], $last);
            if ($next !== null && $next <= $now) $out[] = $name;
        }
        return $out;
    }

    /** One lock per application: two cron.php started together do not run the same tasks twice. */
    private static function lock()
    {
        $f = fopen(sys_get_temp_dir() . '/mibcrude-tasks-' . md5(App::$i->root) . '.lock', 'c');
        return $f && flock($f, LOCK_EX | LOCK_NB) ? $f : null;
    }

    /** Entry point of cron.php: no arguments = due tasks; --run NAME; --list. Returns the exit code. */
    public static function cli($root, array $args)
    {
        new App($root);
        Schema::ensure();
        $out = function ($s) { fwrite(STDOUT, $s . "\n"); };
        if ($args && $args[0] === '--list') {
            $state = self::state();
            foreach (self::all() as $name => $t) {
                $st = isset($state[$name]) ? $state[$name] : null;
                $next = self::next($t['cron'], time());
                $out(sprintf('%-24s %-16s %s  next %s  last %s %s', $name, $t['cron'], empty($t['enabled']) ? 'off' : 'on ', $next ? date('Y-m-d H:i', $next) : '-',
                    $st ? $st['last_run'] : '-', $st ? ($st['ok'] ? 'ok' : 'ERROR ' . $st['message']) : ''));
            }
            return 0;
        }
        $lock = self::lock();
        if (!$lock) { $out('busy: another cron.php is running'); return 0; }
        $names = $args && $args[0] === '--run' && isset($args[1]) ? [$args[1]] : self::due();
        $code = 0;
        foreach ($names as $name) {
            list($ok, $msg, $dur) = self::run($name);
            $out(sprintf('%s %s %.2fs %s', $name, $ok ? 'ok' : 'ERROR', $dur, $msg));
            if (!$ok) $code = 1;
        }
        flock($lock, LOCK_UN);
        return $code;
    }
}
