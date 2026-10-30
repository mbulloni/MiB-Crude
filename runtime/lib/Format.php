<?php
namespace MiB;

/** "View as" formatting of field values. */
class Format
{
    public static function number($v, $decimals)
    {
        $app = App::$i;
        return number_format((float)$v, (int)$decimals, $app->setting('decimalSeparator', ','), $app->setting('thousandsSeparator', '.'));
    }

    public static function date($v, $fmtKey)
    {
        if ($v === null || $v === '') return '';
        $ts = strtotime((string)$v);
        if ($ts === false) return (string)$v;
        return date(App::$i->setting($fmtKey, $fmtKey === 'dateFormat' ? 'd/m/Y' : 'd/m/Y H:i'), $ts);
    }

    /** Plain text (export, filters, titles). */
    public static function plain(Table $t, array $f, $v, array $row = null)
    {
        if ($row && isset($row['__lk'][$f['name']])) return $row['__lk'][$f['name']];
        if ($v === null) return '';
        $va = $f['viewAs'];
        switch ($va['type']) {
            case 'number': return self::number($v, isset($va['decimals']) ? $va['decimals'] : 0);
            case 'currency': return App::$i->setting('currency', '€') . ' ' . self::number($v, isset($va['decimals']) ? $va['decimals'] : 2);
            case 'percent': return self::number($v * (empty($va['fraction']) ? 1 : 100), isset($va['decimals']) ? $va['decimals'] : 0) . '%';
            case 'date': return self::date($v, 'dateFormat');
            case 'datetime': return self::date($v, 'dateTimeFormat');
            case 'time': return substr((string)$v, 0, 5);
            case 'checkbox': return $v ? t('yes') : t('no');
            case 'file':
            case 'image':
                if ($t->isDbFile($f)) return $v !== '' ? t('file.binary') : '';
                $names = [];
                foreach (Upload::files($v) as $file) $names[] = $file['name'];
                return implode(', ', $names);
            case 'html': return trim(strip_tags((string)$v));
        }
        return (string)$v;
    }

    /** HTML for list/view pages. $context: list | view | print */
    public static function html(Table $t, array $f, array $row, $context = 'list')
    {
        $n = $f['name'];
        $v = isset($row[$n]) ? $row[$n] : null;
        $va = $f['viewAs'];
        if ($va['type'] === 'custom') {
            $r = $t->app->event($t->name, 'ViewAs_' . preg_replace('/\W/', '_', $n), [$v, $row, $context]);
            return $r === true ? h($v) : (string)$r;
        }
        if (isset($row['__lk'][$n])) {
            $text = h($row['__lk'][$n]);
            $lk = $t->lookupDef($f);
            if ($context === 'list' && $lk && $lk['kind'] === 'table' && empty($lk['multiple']) && $v !== null && $v !== ''
                && $t->app->hasTable($lk['table']) && $t->app->security->can($lk['table'], 'V')) {
                $lt = $t->app->table($lk['table']);
                if ($lt->def['keys'] === [$lk['key']] && $lt->enabled('view')) {
                    $url = $t->app->url('view', ['t' => $lk['table'], 'k' => [$lk['key'] => $v]]);
                    return '<a href="' . h($url) . '" class="mc-preview" data-preview="' . h($url . '&popup=1') . '">' . $text . '</a>';
                }
            }
            return $text;
        }
        if ($v === null || $v === '') return '';
        switch ($va['type']) {
            case 'checkbox':
                return $v ? '<i class="bi bi-check-square-fill text-success"></i>' : '<i class="bi bi-square text-secondary"></i>';
            case 'email':
                return '<a href="mailto:' . h($v) . '">' . h($v) . '</a>';
            case 'url':
                $href = preg_match('~^https?://~i', $v) ? $v : 'http://' . $v;
                return '<a href="' . h($href) . '" target="_blank" rel="noopener">' . h($v) . '</a>';
            case 'html':
                return $context === 'list' ? h(self::truncate(strip_tags((string)$v), 80)) : Sanitizer::clean((string)$v);
            case 'longtext':
                $limit = isset($va['truncate']) ? (int)$va['truncate'] : 0;
                if ($context === 'list' && $limit > 0 && mb_strlen((string)$v) > $limit) {
                    return '<span title="' . h($v) . '">' . h(self::truncate((string)$v, $limit)) . '</span>';
                }
                return nl2br(h($v));
            case 'image':
            case 'file':
                return self::files($t, $f, $row, $context);
            case 'color':
                return '<span class="mc-swatch" style="background:' . h($v) . '"></span> ' . h($v);
        }
        $text = self::plain($t, $f, $v);
        if (in_array($va['type'], ['number', 'currency', 'percent'], true)) return '<span class="mc-num">' . h($text) . '</span>';
        return h($text);
    }

    private static function truncate($s, $n)
    {
        return mb_strlen($s) > $n ? mb_substr($s, 0, $n) . '…' : $s;
    }

    private static function files(Table $t, array $f, array $row, $context)
    {
        $app = $t->app;
        $keys = $t->keysFromRow($row);
        $isImage = $f['viewAs']['type'] === 'image';
        if ($t->isDbFile($f)) {
            $url = $app->url('file', ['t' => $t->name, 'f' => $f['name'], 'k' => $keys]);
            if ($isImage) return '<a href="' . h($url) . '" target="_blank"><img src="' . h($url) . '" class="mc-thumb" alt=""></a>';
            return '<a href="' . h($url) . '"><i class="bi bi-paperclip"></i> ' . h(t('file.download')) . '</a>';
        }
        $out = [];
        foreach (Upload::files($row[$f['name']]) as $i => $file) {
            $url = $app->url('file', ['t' => $t->name, 'f' => $f['name'], 'k' => $keys, 'i' => $i]);
            $isImg = $isImage || preg_match('/\.(jpe?g|png|gif|webp|svg)$/i', $file['name']);
            if ($isImg) {
                $thumb = !empty($file['thumb']) ? $app->url('file', ['t' => $t->name, 'f' => $f['name'], 'k' => $keys, 'i' => $i, 'thumb' => 1]) : $url;
                $out[] = '<a href="' . h($url) . '" target="_blank" class="mc-gallery"><img src="' . h($thumb) . '" class="mc-thumb' . ($context === 'view' ? ' mc-thumb-lg' : '') . '" alt="' . h($file['name']) . '"></a>';
            } else {
                $out[] = '<a href="' . h($url) . '"><i class="bi bi-file-earmark"></i> ' . h($file['name']) . '</a>';
            }
        }
        return implode(' ', $out);
    }
}

/** Minimal HTML sanitizer for rich text output (allow-list of tags, no attributes except safe ones). */
class Sanitizer
{
    public static function clean($html)
    {
        $allowed = '<p><br><b><strong><i><em><u><s><ul><ol><li><h1><h2><h3><h4><h5><h6><blockquote><a><span><div><table><thead><tbody><tr><td><th><img><hr><pre><code>';
        $html = strip_tags($html, $allowed);
        // Drop event handlers, style expressions and javascript: URLs.
        $html = preg_replace('/\s+on\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
        $html = preg_replace('/(href|src)\s*=\s*("|\')\s*(javascript|vbscript|data):[^"\']*\2/i', '$1="#"', $html);
        return $html;
    }
}
