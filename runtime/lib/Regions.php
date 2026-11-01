<?php
namespace MiB;

/**
 * Header, footer and menu of the project (classic "header/footer/menu" includes): a file of the
 * application (e.g. one copied from the project's public folder) or code written in the designer
 * (generated as custom/regions/<name>.php). Shown by the standard layout and by every theme layout.
 * config.settings.regions.<header|footer|menu> = {source: none|file|code, file, hideStandard, position}
 */
class Regions
{
    private static $cache = [];

    private static function def(App $app, $name)
    {
        $r = isset($app->config['settings']['regions'][$name]) ? $app->config['settings']['regions'][$name] : null;
        return is_array($r) && !empty($r['source']) && $r['source'] !== 'none' ? $r : null;
    }

    /** File to include, only inside the application folder. */
    private static function file(App $app, $name)
    {
        $r = self::def($app, $name);
        if (!$r) return null;
        $f = $r['source'] === 'code' ? $app->root . '/custom/regions/' . $name . '.php' : $app->root . '/' . ltrim(str_replace('\\', '/', (string)$r['file']), '/');
        $real = realpath($f);
        $root = realpath($app->root);
        return $real && $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0 && is_file($real) ? $real : null;
    }

    /** Output of a region ('' when not configured); errors are shown in place instead of breaking the page. */
    public static function html(App $app, $name)
    {
        if (array_key_exists($name, self::$cache)) return self::$cache[$name];
        $f = self::file($app, $name);
        if (!$f) return self::$cache[$name] = '';
        $level = ob_get_level();
        ob_start();
        try {
            (static function ($__file, $app) { include $__file; })($f, $app);
            $out = ob_get_clean();
        } catch (\Throwable $e) {
            while (ob_get_level() > $level) ob_end_clean();
            $out = '<div class="alert alert-danger m-2 small">' . h(t('region.error', $name, $e->getMessage())) . '</div>';
        }
        return self::$cache[$name] = $out;
    }

    /** The menu of a layout: the generated one, replaced by the project's or with it before/after. */
    public static function menu(App $app, $generated)
    {
        $html = self::html($app, 'menu');
        if ($html === '') return $generated;
        $pos = isset(self::def($app, 'menu')['position']) ? self::def($app, 'menu')['position'] : 'replace';
        return $pos === 'before' ? $html . $generated : ($pos === 'after' ? $generated . $html : $html);
    }

    /** Classes for <body>: the standard header/footer hidden when the project's replaces them. */
    public static function bodyClass(App $app)
    {
        $c = '';
        foreach (['header', 'footer'] as $n) {
            $r = self::def($app, $n);
            if ($r && !empty($r['hideStandard']) && self::file($app, $n)) $c .= " mc-hide-$n";
        }
        return $c;
    }
}
