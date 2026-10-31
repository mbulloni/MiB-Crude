<?php
namespace MiB;

/**
 * File/image fields. Folder storage keeps a JSON list in the column:
 * [{"name":"a.pdf","path":"orders/doc/5f..._a.pdf","size":123,"type":"application/pdf","thumb":"..."}]
 * Database storage keeps the raw bytes in a BLOB column.
 */
class Upload
{
    const UNCHANGED = "\0unchanged";

    public static function files($value)
    {
        if ($value === null || $value === '') return [];
        $d = json_decode((string)$value, true);
        if (is_array($d)) return array_values(array_filter($d, 'is_array'));
        return [['name' => basename((string)$value), 'path' => (string)$value]];
    }

    private static function dir()
    {
        $d = App::$i->setting('uploadDir', 'files');
        return ($d[0] === '/' ? $d : App::$i->root . '/' . $d);
    }

    public static function handle(Table $t, array $f, $old)
    {
        $n = $f['name'];
        $up = isset($f['editAs']['upload']) ? $f['editAs']['upload'] : [];
        $clear = !empty(Table::postValue($_POST, $n . '__clear'));
        $incoming = self::incoming(isset($_FILES[$n]) ? $n : strtr($n, ' .', '__'));
        $isDb = $t->isDbFile($f);
        if (!$incoming) {
            if (!$clear) return self::UNCHANGED;
            if (!$isDb && $old) self::removeList(self::files($old));
            return null;
        }
        $maxMb = isset($up['maxMb']) ? (float)$up['maxMb'] : (float)App::$i->setting('maxUploadMb', 20);
        $types = !empty($up['types']) ? array_map('strtolower', array_map('trim', explode(',', $up['types']))) : [];
        foreach ($incoming as $file) {
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if ($types && !in_array($ext, $types, true)) throw new HttpError(t('file.badtype', $file['name']), 400);
            if (in_array($ext, ['php', 'phtml', 'phar', 'php7', 'php8', 'htaccess', 'cgi', 'pl'], true)) throw new HttpError(t('file.badtype', $file['name']), 400);
            if ($file['size'] > $maxMb * 1048576) throw new HttpError(t('file.toolarge', $file['name'], $maxMb), 400);
        }
        if ($isDb) return file_get_contents($incoming[0]['tmp_name']);

        $multi = !empty($up['multiple']);
        $list = ($multi && !$clear) ? self::files($old) : [];
        if ((!$multi || $clear) && $old) self::removeList(self::files($old));
        $rel = preg_replace('/\W/', '_', $t->name) . '/' . preg_replace('/\W/', '_', $n);
        $dir = self::dir() . '/' . $rel;
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        foreach ($incoming as $file) {
            $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', $file['name']);
            $stored = bin2hex(random_bytes(6)) . '_' . $safe;
            if (!move_uploaded_file($file['tmp_name'], "$dir/$stored") && !rename($file['tmp_name'], "$dir/$stored")) throw new HttpError(t('file.failed'), 500);
            $entry = ['name' => $file['name'], 'path' => "$rel/$stored", 'size' => $file['size'], 'type' => $file['type']];
            if (!empty($up['resize']['width']) || !empty($up['resize']['height'])) {
                self::resize("$dir/$stored", "$dir/$stored", (int)$up['resize']['width'], (int)$up['resize']['height']);
            }
            if (!empty($up['thumbnail']['width']) && self::isImage("$dir/$stored")) {
                $thumb = 'th_' . $stored;
                if (self::resize("$dir/$stored", "$dir/$thumb", (int)$up['thumbnail']['width'], (int)$up['thumbnail']['height'])) $entry['thumb'] = "$rel/$thumb";
            }
            $list[] = $entry;
        }
        return json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function incoming($n)
    {
        if (empty($_FILES[$n])) return [];
        $F = $_FILES[$n];
        $out = [];
        if (is_array($F['name'])) {
            foreach ($F['name'] as $i => $name) if ($F['error'][$i] === UPLOAD_ERR_OK) $out[] = ['name' => $name, 'tmp_name' => $F['tmp_name'][$i], 'size' => $F['size'][$i], 'type' => $F['type'][$i]];
        } elseif ($F['error'] === UPLOAD_ERR_OK) {
            $out[] = $F;
        } elseif ($F['error'] !== UPLOAD_ERR_NO_FILE) {
            throw new HttpError(t('file.failed'), 400);
        }
        return $out;
    }

    private static function isImage($path)
    {
        return function_exists('getimagesize') && @getimagesize($path) !== false;
    }

    /** Fit inside w x h keeping aspect ratio. Needs GD; silently skipped otherwise. */
    public static function resize($src, $dst, $w, $h)
    {
        if (!function_exists('imagecreatefromstring')) return false;
        $info = @getimagesize($src);
        if (!$info) return false;
        list($sw, $sh) = $info;
        if (!$w) $w = $sw;
        if (!$h) $h = $sh;
        $ratio = min($w / $sw, $h / $sh, 1);
        if ($ratio >= 1 && $src === $dst) return true;
        $img = @imagecreatefromstring(file_get_contents($src));
        if (!$img) return false;
        $nw = max(1, (int)round($sw * $ratio));
        $nh = max(1, (int)round($sh * $ratio));
        $out = imagecreatetruecolor($nw, $nh);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $sw, $sh);
        switch ($info[2]) {
            case IMAGETYPE_PNG: imagepng($out, $dst); break;
            case IMAGETYPE_GIF: imagegif($out, $dst); break;
            case IMAGETYPE_WEBP: function_exists('imagewebp') ? imagewebp($out, $dst) : imagejpeg($out, $dst, 85); break;
            default: imagejpeg($out, $dst, 85);
        }
        return true;
    }

    public static function removeFiles(Table $t, array $row)
    {
        foreach ($t->def['fields'] as $f) {
            if (in_array($f['editAs']['type'], ['file', 'image'], true) && !$t->isDbFile($f) && !empty($row[$f['name']])) self::removeList(self::files($row[$f['name']]));
        }
    }

    private static function removeList(array $files)
    {
        $base = realpath(self::dir());
        foreach ($files as $file) {
            foreach (['path', 'thumb'] as $k) {
                if (empty($file[$k])) continue;
                $p = realpath(self::dir() . '/' . $file[$k]);
                if ($p && $base && strpos($p, $base . DIRECTORY_SEPARATOR) === 0) @unlink($p);
            }
        }
    }

    /** Stream a stored file after permission checks done by the caller. */
    /** Bytes of the images of a field (database or upload folder), at most $max, for the PDF of the record. */
    public static function imageBytes(Table $t, array $f, array $row, $max = 6)
    {
        $v = isset($row[$f['name']]) ? $row[$f['name']] : null;
        if ($v === null || $v === '') return [];
        if ($t->isDbFile($f)) return [is_resource($v) ? stream_get_contents($v) : (string)$v];
        $out = [];
        $base = realpath(self::dir());
        foreach (array_slice(self::files($v), 0, $max) as $file) {
            $p = realpath(self::dir() . '/' . $file['path']);
            if ($p && $base && strpos($p, $base . DIRECTORY_SEPARATOR) === 0 && self::isImage($p)) $out[] = (string)file_get_contents($p);
        }
        return $out;
    }

    public static function serve(Table $t, array $f, array $row, $index, $thumb)
    {
        if ($t->isDbFile($f)) {
            $data = $row[$f['name']];
            if ($data === null || $data === '') throw new HttpError(t('error.notfound'), 404);
            $mime = function_exists('finfo_open') ? finfo_buffer(finfo_open(FILEINFO_MIME_TYPE), $data) : 'application/octet-stream';
            header('Content-Type: ' . $mime);
            header('Content-Length: ' . strlen($data));
            header('X-Content-Type-Options: nosniff');
            echo $data;
            return;
        }
        $files = self::files($row[$f['name']]);
        if (!isset($files[$index])) throw new HttpError(t('error.notfound'), 404);
        $file = $files[$index];
        $rel = $thumb && !empty($file['thumb']) ? $file['thumb'] : $file['path'];
        $base = realpath(self::dir());
        $p = realpath(self::dir() . '/' . $rel);
        if (!$p || !$base || strpos($p, $base . DIRECTORY_SEPARATOR) !== 0) throw new HttpError(t('error.notfound'), 404);
        $mime = function_exists('mime_content_type') ? mime_content_type($p) : 'application/octet-stream';
        $inline = preg_match('~^(image/|application/pdf|text/plain)~', $mime) && $mime !== 'image/svg+xml';
        header('Content-Type: ' . ($inline ? $mime : 'application/octet-stream'));
        header('Content-Length: ' . filesize($p));
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . str_replace('"', '', $file['name']) . '"');
        readfile($p);
    }
}
