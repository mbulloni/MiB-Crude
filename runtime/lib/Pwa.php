<?php
namespace MiB;

/**
 * Installable app (settings.pwa): web manifest (?p=manifest), icons (?p=appicon&s=192|512: the project logo,
 * or the initials of the app on the primary colour, drawn with GD and the PDF font), service worker sw.js at the
 * root of the app (generated): assets from the cache, pages from the network with an offline page.
 * Browsers install it from https:// (or localhost).
 */
class Pwa
{
    public static function enabled()
    {
        return (bool)App::$i->setting('pwa', false);
    }

    /** <head> tags of every layout. */
    public static function head(App $app)
    {
        if (!self::enabled()) return '';
        $color = isset($app->config['theme']['primary']) ? (string)$app->config['theme']['primary'] : '#0d6efd';
        return '<link rel="manifest" href="' . h($app->url('manifest')) . '">' . "\n"
            . '<meta name="theme-color" content="' . h($color) . '">' . "\n"
            . '<link rel="apple-touch-icon" href="' . h($app->url('appicon', ['s' => 192])) . '">' . "\n"
            . '<meta name="mobile-web-app-capable" content="yes">' . "\n";
    }

    public static function manifest(App $app)
    {
        $title = $app->label($app->config['title']);
        $color = isset($app->config['theme']['primary']) ? (string)$app->config['theme']['primary'] : '#0d6efd';
        $m = [
            'name' => $title, 'short_name' => mb_substr($title, 0, 12), 'lang' => $app->lang,
            'start_url' => 'index.php', 'scope' => './', 'display' => 'standalone', 'theme_color' => $color, 'background_color' => '#ffffff',
            'icons' => [
                ['src' => $app->url('appicon', ['s' => 192]), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $app->url('appicon', ['s' => 512]), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'],
            ],
        ];
        header('Content-Type: application/manifest+json; charset=utf-8');
        echo json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** PNG icon of $size pixels (cached in the system temporary folder). */
    public static function icon(App $app, $size)
    {
        $size = (int)$size === 512 ? 512 : 192;
        $logo = $app->root . '/assets/logo.png';
        $color = isset($app->config['theme']['primary']) ? (string)$app->config['theme']['primary'] : '#0d6efd';
        $title = $app->label($app->config['title']);
        $cache = sys_get_temp_dir() . '/mibcrude-icon-' . md5($app->root . $size . $color . $title . (is_file($logo) ? filemtime($logo) : '')) . '.png';
        if (!is_file($cache) && function_exists('imagecreatetruecolor')) {
            $im = imagecreatetruecolor($size, $size);
            $hex = ltrim($color, '#');
            if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
            $bg = imagecolorallocate($im, hexdec(substr($hex, 0, 2)) ?: 13, hexdec(substr($hex, 2, 2)) ?: 110, hexdec(substr($hex, 4, 2)) ?: 253);
            imagefill($im, 0, 0, $bg);
            $src = is_file($logo) ? @imagecreatefromstring((string)file_get_contents($logo)) : false;
            if ($src) {
                // the logo centred on the colour, 70% of the icon (room for the masks of Android)
                $w = imagesx($src);
                $h = imagesy($src);
                $k = 0.7 * $size / max($w, $h);
                imagecopyresampled($im, $src, (int)(($size - $w * $k) / 2), (int)(($size - $h * $k) / 2), 0, 0, (int)($w * $k), (int)($h * $k), $w, $h);
            } else {
                $words = preg_split('/[\s_-]+/u', trim($title)) ?: ['A'];
                $ini = mb_strtoupper(mb_substr($words[0], 0, 1) . (isset($words[1]) ? mb_substr($words[1], 0, 1) : ''));
                $font = dirname(__DIR__) . '/fonts/DejaVuSans-Bold.ttf';
                $white = imagecolorallocate($im, 255, 255, 255);
                if (function_exists('imagettftext') && is_file($font)) {
                    $fs = $size * (mb_strlen($ini) > 1 ? 0.30 : 0.40);
                    $b = imagettfbbox($fs, 0, $font, $ini);
                    imagettftext($im, $fs, 0, (int)(($size - ($b[2] - $b[0])) / 2 - $b[0]), (int)(($size - ($b[1] - $b[7])) / 2 - $b[7]), $white, $font, $ini);
                } else {
                    imagestring($im, 5, (int)($size / 2 - 9), (int)($size / 2 - 8), $ini, $white);
                }
            }
            imagepng($im, $cache);
        }
        header('Content-Type: image/png');
        header('Cache-Control: public, max-age=86400');
        if (is_file($cache)) readfile($cache);
        else echo base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='); // no GD: 1 pixel
    }
}
