<?php
namespace MiB;

/**
 * Minimal PDF writer, no dependencies (PHP 7.4+): A4 pages, DejaVu Sans embedded from runtime/fonts (every
 * Unicode character the font has: accents, Greek, Cyrillic, symbols; only the glyphs used), Helvetica with
 * Windows-1252 when the font files are missing. Two layouts: a table (list export, header row repeated on every
 * page, landscape when the columns need it) and a record (label / value pairs, wrapped, with the images of the
 * image fields: JPEG and PNG as they are, other formats through GD).
 */
class Pdf
{
    const MARGIN = 36;
    const ELLIPSIS = "\u{2026}";

    private $pages = [];
    private $cur = '';
    private $pw = 595;
    private $ph = 842;
    /** @var PdfFontLike */
    private $regular;
    /** @var PdfFontLike */
    private $bold;
    private $images = [];

    private function __construct()
    {
        $dir = dirname(__DIR__) . '/fonts/';
        $r = PdfTtf::load($dir . 'DejaVuSans.ttf');
        $b = $r ? PdfTtf::load($dir . 'DejaVuSans-Bold.ttf') : null;
        $this->regular = $r ?: new PdfCoreFont(false);
        $this->bold = $b ?: ($r ?: new PdfCoreFont(true));
    }

    private static function clean($s)
    {
        return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', str_replace(["\r\n", "\r", "\t"], ["\n", "\n", ' '], (string)$s));
    }

    private function font($bold)
    {
        return $bold ? $this->bold : $this->regular;
    }

    private function width($s, $size, $bold = false)
    {
        return $this->font($bold)->width($s, $size);
    }

    /** Text cut to fit `max` points, with an ellipsis. */
    private function fit($s, $max, $size, $bold = false)
    {
        $s = str_replace("\n", ' ', $s);
        if ($this->width($s, $size, $bold) <= $max) return $s;
        // start from an estimate, then remove characters one by one
        $s = mb_substr($s, 0, max(1, (int)($max / ($size * 0.25))));
        while ($s !== '' && $this->width($s . self::ELLIPSIS, $size, $bold) > $max) $s = mb_substr($s, 0, -1);
        return $s . self::ELLIPSIS;
    }

    /** Text split in lines of at most `max` points (words kept whole when they fit). */
    private function wrap($s, $max, $size)
    {
        $out = [];
        foreach (explode("\n", $s) as $para) {
            $line = '';
            foreach (explode(' ', $para) as $word) {
                $try = $line === '' ? $word : "$line $word";
                if ($this->width($try, $size) <= $max) { $line = $try; continue; }
                if ($line !== '') $out[] = $line;
                while ($this->width($word, $size) > $max) {
                    $cut = $word;
                    while (mb_strlen($cut) > 1 && $this->width($cut, $size) > $max) $cut = mb_substr($cut, 0, -1);
                    $out[] = $cut;
                    $word = mb_substr($word, mb_strlen($cut));
                }
                $line = $word;
            }
            $out[] = $line;
        }
        return $out;
    }

    private function text($x, $y, $s, $size, $bold = false, $gray = 0)
    {
        $this->cur .= sprintf("BT /%s %.1F Tf %.3F g %.2F %.2F Td %s Tj ET\n", $bold ? 'F2' : 'F1', $size, $gray, $x, $this->ph - $y, $this->font($bold)->encode($s));
    }

    private function rect($x, $y, $w, $h, $gray)
    {
        $this->cur .= sprintf("%.3F g %.2F %.2F %.2F %.2F re f\n", $gray, $x, $this->ph - $y - $h, $w, $h);
    }

    private function line($x1, $y1, $x2, $y2, $gray = 0.75)
    {
        $this->cur .= sprintf("%.3F G 0.5 w %.2F %.2F m %.2F %.2F l S\n", $gray, $x1, $this->ph - $y1, $x2, $this->ph - $y2);
    }

    private function newPage()
    {
        if ($this->cur !== '') $this->pages[] = $this->cur;
        $this->cur = ' ';
    }

    // --- images -----------------------------------------------------------------------

    /** Image XObject from file bytes: ['w', 'h', 'dict', 'data'] or null when the format cannot be used. */
    private static function image($bytes)
    {
        if (substr($bytes, 0, 2) === "\xFF\xD8") {
            // JPEG: size and components from the SOF marker, data as it is
            for ($p = 2, $n = strlen($bytes); $p + 9 < $n;) {
                if ($bytes[$p] !== "\xFF") { $p++; continue; }
                $m = ord($bytes[$p + 1]);
                $len = unpack('n', substr($bytes, $p + 2, 2))[1];
                if (in_array($m, [0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF], true)) {
                    $h = unpack('n', substr($bytes, $p + 5, 2))[1];
                    $w = unpack('n', substr($bytes, $p + 7, 2))[1];
                    $c = ord($bytes[$p + 9]);
                    $cs = $c === 1 ? '/DeviceGray' : ($c === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB');
                    return ['w' => $w, 'h' => $h, 'dict' => "/ColorSpace $cs /BitsPerComponent 8 /Filter /DCTDecode", 'data' => $bytes];
                }
                $p += 2 + $len;
            }
            return null;
        }
        if (substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
            // PNG without transparency, 8 bits, not interlaced: the zlib data with the PNG predictor
            $hdr = unpack('Nw/Nh/Cdepth/Ctype/Ccomp/Cfilter/Cinterlace', substr($bytes, 16, 13));
            if ($hdr['depth'] === 8 && $hdr['interlace'] === 0 && in_array($hdr['type'], [0, 2, 3], true)) {
                $idat = '';
                $pal = '';
                for ($p = 8, $n = strlen($bytes); $p + 8 <= $n;) {
                    $len = unpack('N', substr($bytes, $p, 4))[1];
                    $type = substr($bytes, $p + 4, 4);
                    if ($type === 'IDAT') $idat .= substr($bytes, $p + 8, $len);
                    if ($type === 'PLTE') $pal = substr($bytes, $p + 8, $len);
                    if ($type === 'tRNS') { $idat = ''; break; }
                    $p += 12 + $len;
                }
                if ($idat !== '') {
                    $colors = $hdr['type'] === 2 ? 3 : 1;
                    $cs = $hdr['type'] === 0 ? '/DeviceGray' : ($hdr['type'] === 2 ? '/DeviceRGB' : '[/Indexed /DeviceRGB ' . (strlen($pal) / 3 - 1) . ' <' . bin2hex($pal) . '>]');
                    return ['w' => $hdr['w'], 'h' => $hdr['h'], 'data' => $idat,
                        'dict' => "/ColorSpace $cs /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors $colors /BitsPerComponent 8 /Columns {$hdr['w']} >>"];
                }
            }
        }
        // anything else (PNG with transparency, GIF, WebP…): JPEG on white through GD
        if (!function_exists('imagecreatefromstring')) return null;
        $im = @imagecreatefromstring($bytes);
        if (!$im) return null;
        $w = imagesx($im);
        $h = imagesy($im);
        $bg = imagecreatetruecolor($w, $h);
        imagefill($bg, 0, 0, imagecolorallocate($bg, 255, 255, 255));
        imagecopy($bg, $im, 0, 0, 0, 0, $w, $h);
        ob_start();
        imagejpeg($bg, null, 88);
        $jpg = (string)ob_get_clean();
        return self::image($jpg);
    }

    private function drawImage(array $img, $x, $y, $w, $h)
    {
        $name = 'Im' . (count($this->images) + 1);
        $this->images[$name] = $img;
        $this->cur .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $w, $h, $x, $this->ph - $y - $h, $name);
    }

    // --- layouts ----------------------------------------------------------------------

    /**
     * Table of rows (already formatted strings). $right: column indexes aligned right (numbers).
     * @return string PDF bytes
     */
    public static function table($title, $subtitle, array $head, array $data, array $right = [])
    {
        $pdf = new self();
        $size = 8;
        $head = array_map([self::class, 'clean'], $head);
        $data = array_map(function ($r) { return array_map([self::class, 'clean'], $r); }, $data);
        $n = count($head);
        // natural column widths: header, and the 90th percentile of the cells (a few long values do not win)
        $nat = [];
        for ($i = 0; $i < $n; $i++) {
            $ws = [];
            foreach ($data as $r) $ws[] = $pdf->width(str_replace("\n", ' ', isset($r[$i]) ? $r[$i] : ''), $size);
            sort($ws);
            $p90 = $ws ? $ws[(int)floor((count($ws) - 1) * 0.9)] : 0;
            $nat[$i] = max($pdf->width($head[$i], $size, true), $p90, 24) + 8;
        }
        $total = array_sum($nat);
        if ($total > 595 - 2 * self::MARGIN) { $pdf->pw = 842; $pdf->ph = 595; }
        $avail = $pdf->pw - 2 * self::MARGIN;
        // fit the page: shrink the widest columns first
        if ($total > $avail) {
            $cap = max($nat);
            while (array_sum(array_map(function ($w) use ($cap) { return min($w, $cap); }, $nat)) > $avail && $cap > 30) $cap -= 2;
            $nat = array_map(function ($w) use ($cap) { return min($w, $cap); }, $nat);
            if (array_sum($nat) > $avail) { $k = $avail / array_sum($nat); $nat = array_map(function ($w) use ($k) { return $w * $k; }, $nat); }
        } elseif ($total < $avail) {
            $k = $avail / $total;
            $nat = array_map(function ($w) use ($k) { return $w * $k; }, $nat);
        }
        $rowH = 13;
        $top = self::MARGIN + 34;
        $bottom = $pdf->ph - self::MARGIN - 16;
        $perPage = max(1, (int)floor(($bottom - $top - $rowH) / $rowH));
        $pageCount = max(1, (int)ceil(count($data) / $perPage));
        $title = self::clean($title);
        $subtitle = self::clean($subtitle);
        for ($p = 0; $p < $pageCount; $p++) {
            $pdf->newPage();
            $pdf->text(self::MARGIN, self::MARGIN + 14, $pdf->fit($title, $avail, 14, true), 14, true);
            if ($subtitle !== '') $pdf->text(self::MARGIN, self::MARGIN + 27, $pdf->fit($subtitle, $avail, 8), 8, false, 0.4);
            $y = $top;
            $pdf->rect(self::MARGIN, $y, $avail, $rowH, 0.88);
            $x = self::MARGIN;
            foreach ($head as $i => $h) {
                $s = $pdf->fit($h, $nat[$i] - 6, $size, true);
                $pdf->text(in_array($i, $right, true) ? $x + $nat[$i] - 3 - $pdf->width($s, $size, true) : $x + 3, $y + 9.5, $s, $size, true);
                $x += $nat[$i];
            }
            $y += $rowH;
            foreach (array_slice($data, $p * $perPage, $perPage) as $ri => $r) {
                if ($ri % 2) $pdf->rect(self::MARGIN, $y, $avail, $rowH, 0.965);
                $x = self::MARGIN;
                for ($i = 0; $i < $n; $i++) {
                    $s = $pdf->fit(isset($r[$i]) ? $r[$i] : '', $nat[$i] - 6, $size);
                    $pdf->text(in_array($i, $right, true) ? $x + $nat[$i] - 3 - $pdf->width($s, $size) : $x + 3, $y + 9.5, $s, $size);
                    $x += $nat[$i];
                }
                $y += $rowH;
            }
            $pdf->line(self::MARGIN, $y, self::MARGIN + $avail, $y);
            $foot = sprintf('%s  ·  %d / %d', date('d/m/Y H:i'), $p + 1, $pageCount);
            $pdf->text($pdf->pw - self::MARGIN - $pdf->width($foot, 7), $pdf->ph - self::MARGIN + 4, $foot, 7, false, 0.45);
        }
        return $pdf->output();
    }

    /**
     * One record: label / value pairs, values wrapped over several lines and pages. A value can be
     * ['text' => string, 'images' => [file bytes, ...]]: the images go under the text, scaled to the column.
     */
    public static function record($title, array $pairs)
    {
        $pdf = new self();
        $pdf->newPage();
        $avail = $pdf->pw - 2 * self::MARGIN;
        $size = 9;
        $labelW = 150;
        $colW = $avail - $labelW - 6;
        $pdf->text(self::MARGIN, self::MARGIN + 14, $pdf->fit(self::clean($title), $avail, 14, true), 14, true);
        $y = self::MARGIN + 34;
        $bottom = $pdf->ph - self::MARGIN - 20;
        foreach ($pairs as $label => $value) {
            $images = is_array($value) && isset($value['images']) ? $value['images'] : [];
            $text = is_array($value) ? (isset($value['text']) ? $value['text'] : '') : $value;
            $lines = $pdf->wrap(self::clean($text), $colW, $size);
            if ($images && count($lines) === 1 && $lines[0] === '') $lines = [];
            $first = true;
            $drawLabel = function () use ($pdf, $label, $labelW, $size, &$y, &$first) {
                if ($first) $pdf->text(self::MARGIN, $y + 10, $pdf->fit(self::clean($label), $labelW - 8, $size, true), $size, true, 0.3);
                $first = false;
            };
            foreach ($lines as $ln) {
                if ($y > $bottom) { $pdf->newPage(); $y = self::MARGIN; }
                $drawLabel();
                $pdf->text(self::MARGIN + $labelW, $y + 10, $ln, $size);
                $y += 13;
            }
            foreach ($images as $bytes) {
                $img = self::image((string)$bytes);
                if (!$img || $img['w'] < 1 || $img['h'] < 1) continue;
                // at most the column width and 220 points high, never enlarged beyond 1 pixel = 0.75 points
                $k = min($colW / $img['w'], 220 / $img['h'], 0.75);
                $w = $img['w'] * $k;
                $h = $img['h'] * $k;
                if ($y + $h > $bottom + 14) { $pdf->newPage(); $y = self::MARGIN; }
                $drawLabel();
                $pdf->drawImage($img, self::MARGIN + $labelW, $y + 3, $w, $h);
                $y += $h + 6;
            }
            if ($first) { $drawLabel(); $y += 13; }
            $pdf->line(self::MARGIN, $y + 2, self::MARGIN + $avail, $y + 2, 0.88);
            $y += 6;
        }
        return $pdf->output();
    }

    private function output()
    {
        $this->newPage();
        $objs = [];
        $objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $id = 3;
        $f1 = $this->regular->objects($objs, $id);
        $f2 = $this->bold === $this->regular ? $f1 : $this->bold->objects($objs, $id);
        $xobj = '';
        foreach ($this->images as $name => $img) {
            $objs[$id] = "<< /Type /XObject /Subtype /Image /Width {$img['w']} /Height {$img['h']} {$img['dict']} /Length " . strlen($img['data']) . " >>\nstream\n{$img['data']}\nendstream";
            $xobj .= "/$name $id 0 R ";
            $id++;
        }
        $res = "/Resources << /Font << /F1 $f1 0 R /F2 $f2 0 R >>" . ($xobj !== '' ? " /XObject << $xobj>>" : '') . ' >>';
        $kids = [];
        foreach ($this->pages as $content) {
            $stream = function_exists('gzcompress') ? gzcompress($content) : $content;
            $filter = function_exists('gzcompress') ? ' /Filter /FlateDecode' : '';
            $objs[$id] = '<< /Length ' . strlen($stream) . "$filter >>\nstream\n$stream\nendstream";
            $objs[$id + 1] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {$this->pw} {$this->ph}] $res /Contents $id 0 R >>";
            $kids[] = ($id + 1) . ' 0 R';
            $id += 2;
        }
        $objs[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($kids) . ' >>';
        ksort($objs);
        $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objs as $n => $body) {
            $offsets[$n] = strlen($out);
            $out .= "$n 0 obj\n$body\nendobj\n";
        }
        $xref = strlen($out);
        $out .= 'xref' . "\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $off) $out .= sprintf("%010d 00000 n \n", $off);
        $out .= 'trailer' . "\n<< /Size " . (count($objs) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";
        return $out;
    }
}
