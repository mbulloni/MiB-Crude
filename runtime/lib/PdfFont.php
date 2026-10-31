<?php
namespace MiB;

/**
 * Fonts of the PDF writer. PdfTtf embeds a TrueType font (runtime/fonts, DejaVu Sans) as a CID font with
 * Identity-H encoding: any Unicode character the font has, only the glyphs used (the other glyphs are emptied,
 * so glyph ids stay the same), a ToUnicode map for copy and search. PdfCoreFont is the fallback without the font
 * files: Helvetica, Windows-1252 only. Both take UTF-8 text.
 */
interface PdfFontLike
{
    /** Width in points. */
    public function width($text, $size);
    /** PDF string operand for Tj. */
    public function encode($text);
    /** Writes the font objects from $id on; returns the object number of the font dictionary. */
    public function objects(array &$objs, &$id);
}

class PdfCoreFont implements PdfFontLike
{
    // Helvetica widths (1/1000 em) for ASCII 32..126; other characters use 556.
    const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
        278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
        667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
        333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
    private $bold;

    public function __construct($bold)
    {
        $this->bold = $bold;
    }

    /** Characters outside Windows-1252 become "?". */
    private static function win($s)
    {
        $prev = mb_substitute_character();
        mb_substitute_character(0x3F);
        $out = mb_convert_encoding((string)$s, 'Windows-1252', 'UTF-8');
        mb_substitute_character($prev);
        return $out;
    }

    public function width($text, $size)
    {
        $s = self::win($text);
        $w = 0;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $c = ord($s[$i]);
            $w += $c >= 32 && $c <= 126 ? self::W[$c - 32] : ($c === 0x85 ? 1000 : 556);
        }
        return $w * $size / 1000 * ($this->bold ? 1.06 : 1);
    }

    public function encode($text)
    {
        return '(' . str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], self::win($text)) . ')';
    }

    public function objects(array &$objs, &$id)
    {
        $objs[$id] = '<< /Type /Font /Subtype /Type1 /BaseFont /' . ($this->bold ? 'Helvetica-Bold' : 'Helvetica') . ' /Encoding /WinAnsiEncoding >>';
        return $id++;
    }
}

class PdfTtf implements PdfFontLike
{
    private $data;
    private $tables = [];
    private $upm = 1000;
    private $numGlyphs = 0;
    private $longLoca = false;
    private $advance = [];
    private $cmap = [];
    private $bbox = [0, 0, 0, 0];
    private $ascent = 800;
    private $descent = -200;
    private $name;
    /** gid => codepoint of the glyphs used */
    private $used = [0 => 0];
    private $widthCache = [];

    /** @return PdfTtf|null */
    public static function load($file)
    {
        if (!is_file($file)) return null;
        try { return new self((string)file_get_contents($file), pathinfo($file, PATHINFO_FILENAME)); } catch (\Throwable $e) { error_log('[MiB-Crude] pdf font: ' . $e->getMessage()); return null; }
    }

    private function u16($o) { return unpack('n', substr($this->data, $o, 2))[1]; }
    private function s16($o) { $v = $this->u16($o); return $v >= 0x8000 ? $v - 0x10000 : $v; }
    private function u32($o) { return unpack('N', substr($this->data, $o, 4))[1]; }

    private function __construct($data, $name)
    {
        $this->data = $data;
        $this->name = preg_replace('/[^A-Za-z0-9-]/', '', $name);
        $n = $this->u16(4);
        for ($i = 0; $i < $n; $i++) {
            $r = 12 + $i * 16;
            $this->tables[substr($data, $r, 4)] = [$this->u32($r + 8), $this->u32($r + 12)];
        }
        foreach (['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'loca', 'glyf'] as $t) if (!isset($this->tables[$t])) throw new \RuntimeException("tabella $t mancante");
        $h = $this->tables['head'][0];
        $this->upm = $this->u16($h + 18);
        $this->bbox = [$this->s16($h + 36), $this->s16($h + 38), $this->s16($h + 40), $this->s16($h + 42)];
        $this->longLoca = $this->s16($h + 50) === 1;
        $this->numGlyphs = $this->u16($this->tables['maxp'][0] + 4);
        $hh = $this->tables['hhea'][0];
        $this->ascent = $this->s16($hh + 4);
        $this->descent = $this->s16($hh + 6);
        $nm = $this->u16($hh + 34);
        $hm = $this->tables['hmtx'][0];
        for ($g = 0; $g < $nm; $g++) $this->advance[$g] = $this->u16($hm + $g * 4);
        $this->readCmap();
    }

    /** Unicode cmap: format 12 (full Unicode) or format 4 (BMP). */
    private function readCmap()
    {
        $c = $this->tables['cmap'][0];
        $best = null;
        for ($i = 0, $n = $this->u16($c + 2); $i < $n; $i++) {
            $pid = $this->u16($c + 4 + $i * 8);
            $eid = $this->u16($c + 6 + $i * 8);
            $off = $c + $this->u32($c + 8 + $i * 8);
            $fmt = $this->u16($off);
            if ($pid === 3 && $eid === 10 && $fmt === 12) { $best = $off; break; }
            if ((($pid === 3 && $eid === 1) || $pid === 0) && $fmt === 4 && $best === null) $best = $off;
        }
        if ($best === null) throw new \RuntimeException('cmap Unicode mancante');
        if ($this->u16($best) === 12) {
            for ($i = 0, $n = $this->u32($best + 12); $i < $n; $i++) {
                $g = $best + 16 + $i * 12;
                $start = $this->u32($g);
                $end = $this->u32($g + 4);
                $gid = $this->u32($g + 8);
                for ($cp = $start; $cp <= $end && $cp - $start < 70000; $cp++) $this->cmap[$cp] = $gid + $cp - $start;
            }
            return;
        }
        $segX2 = $this->u16($best + 6);
        $ends = $best + 14;
        $starts = $ends + $segX2 + 2;
        $deltas = $starts + $segX2;
        $ranges = $deltas + $segX2;
        for ($s = 0; $s < $segX2 / 2; $s++) {
            $end = $this->u16($ends + $s * 2);
            $start = $this->u16($starts + $s * 2);
            $delta = $this->u16($deltas + $s * 2);
            $ro = $this->u16($ranges + $s * 2);
            for ($cp = $start; $cp <= $end && $cp !== 0xFFFF; $cp++) {
                if ($ro === 0) $gid = ($cp + $delta) & 0xFFFF;
                else {
                    $gid = $this->u16($ranges + $s * 2 + $ro + ($cp - $start) * 2);
                    if ($gid) $gid = ($gid + $delta) & 0xFFFF;
                }
                if ($gid) $this->cmap[$cp] = $gid;
            }
        }
    }

    private static function codepoints($text)
    {
        $out = [];
        foreach (preg_split('//u', (string)$text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) $out[] = mb_ord($ch, 'UTF-8');
        return $out;
    }

    /** Does the font have the character? */
    public function has($cp)
    {
        return isset($this->cmap[$cp]);
    }

    private function gid($cp)
    {
        return isset($this->cmap[$cp]) ? $this->cmap[$cp] : (isset($this->cmap[0xFFFD]) ? $this->cmap[0xFFFD] : 0);
    }

    private function adv($gid)
    {
        if (isset($this->advance[$gid])) return $this->advance[$gid];
        return $this->advance ? end($this->advance) : $this->upm / 2;
    }

    public function width($text, $size)
    {
        $w = 0;
        foreach (self::codepoints($text) as $cp) {
            if (!isset($this->widthCache[$cp])) $this->widthCache[$cp] = $this->adv($this->gid($cp)) * 1000 / $this->upm;
            $w += $this->widthCache[$cp];
        }
        return $w * $size / 1000;
    }

    public function encode($text)
    {
        $hex = '';
        foreach (self::codepoints($text) as $cp) {
            $g = $this->gid($cp);
            if (!isset($this->used[$g])) $this->used[$g] = $cp;
            $hex .= sprintf('%04X', $g);
        }
        return "<$hex>";
    }

    /** Glyph data of one glyph and the components of a composite glyph. */
    private function glyph($gid, &$components)
    {
        $loca = $this->tables['loca'][0];
        if ($gid >= $this->numGlyphs) return '';
        $a = $this->longLoca ? $this->u32($loca + $gid * 4) : $this->u16($loca + $gid * 2) * 2;
        $b = $this->longLoca ? $this->u32($loca + $gid * 4 + 4) : $this->u16($loca + $gid * 2 + 2) * 2;
        if ($b <= $a) return '';
        $g = substr($this->data, $this->tables['glyf'][0] + $a, $b - $a);
        if (unpack('n', substr($g, 0, 2))[1] >= 0x8000) {
            // composite: flags, glyphIndex, arguments, transform
            $p = 10;
            do {
                $flags = unpack('n', substr($g, $p, 2))[1];
                $components[] = unpack('n', substr($g, $p + 2, 2))[1];
                $p += 4 + (($flags & 1) ? 4 : 2) + (($flags & 8) ? 2 : (($flags & 0x40) ? 4 : (($flags & 0x80) ? 8 : 0)));
            } while ($flags & 0x20);
        }
        return $g;
    }

    private static function checksum($s)
    {
        $s .= str_repeat("\0", (4 - strlen($s) % 4) % 4);
        $sum = 0;
        foreach (unpack('N*', $s) as $v) $sum = ($sum + $v) & 0xFFFFFFFF;
        return $sum;
    }

    /** TrueType file with the used glyphs only (same glyph ids), long loca, the tables a PDF reader needs. */
    private function subset()
    {
        $keep = [];
        $todo = array_keys($this->used);
        while ($todo) {
            $g = array_pop($todo);
            if (isset($keep[$g])) continue;
            $comp = [];
            $keep[$g] = $this->glyph($g, $comp);
            foreach ($comp as $c) if (!isset($keep[$c])) $todo[] = $c;
        }
        $glyf = '';
        $loca = '';
        for ($g = 0; $g < $this->numGlyphs; $g++) {
            $loca .= pack('N', strlen($glyf));
            if (isset($keep[$g]) && $keep[$g] !== '') { $glyf .= $keep[$g]; $glyf .= str_repeat("\0", (4 - strlen($glyf) % 4) % 4); }
        }
        $loca .= pack('N', strlen($glyf));
        $tables = [];
        foreach (['cvt ', 'fpgm', 'head', 'hhea', 'hmtx', 'maxp', 'prep'] as $t) if (isset($this->tables[$t])) $tables[$t] = substr($this->data, $this->tables[$t][0], $this->tables[$t][1]);
        $tables['head'] = substr_replace($tables['head'], pack('N', 0), 8, 4); // checkSumAdjustment, set below
        $tables['head'] = substr_replace($tables['head'], pack('n', 1), 50, 2); // long loca
        $tables['loca'] = $loca;
        $tables['glyf'] = $glyf;
        ksort($tables, SORT_STRING);
        $n = count($tables);
        $sel = (int)floor(log($n, 2));
        $out = pack('Nnnnn', 0x00010000, $n, 16 * (1 << $sel), $sel, $n * 16 - 16 * (1 << $sel));
        $offset = 12 + 16 * $n;
        $body = '';
        $headAt = 0;
        foreach ($tables as $tag => $d) {
            $out .= $tag . pack('NNN', self::checksum($d), $offset + strlen($body), strlen($d));
            if ($tag === 'head') $headAt = $offset + strlen($body);
            $body .= $d . str_repeat("\0", (4 - strlen($d) % 4) % 4);
        }
        $font = $out . $body;
        $adj = (0xB1B0AFBA - self::checksum($font)) & 0xFFFFFFFF;
        return substr_replace($font, pack('N', $adj), $headAt + 8, 4);
    }

    private static function utf16hex($cp)
    {
        if ($cp < 0x10000) return sprintf('%04X', $cp);
        $cp -= 0x10000;
        return sprintf('%04X%04X', 0xD800 | ($cp >> 10), 0xDC00 | ($cp & 0x3FF));
    }

    public function objects(array &$objs, &$id)
    {
        ksort($this->used);
        $file = $this->subset();
        $tag = substr(strtoupper(md5(implode(',', array_keys($this->used)) . $this->name)), 0, 6);
        $tag = strtr($tag, '0123456789', 'GHIJKLMNOP');
        $base = $tag . '+' . $this->name;
        $k = 1000 / $this->upm;
        $font = $id++;
        $cid = $id++;
        $desc = $id++;
        $ff = $id++;
        $tu = $id++;
        $w = '';
        foreach ($this->used as $g => $cp) $w .= $g . ' [' . round($this->adv($g) * $k) . '] ';
        $z = function_exists('gzcompress') ? gzcompress($file) : $file;
        $objs[$ff] = '<< /Length ' . strlen($z) . ' /Length1 ' . strlen($file) . (function_exists('gzcompress') ? ' /Filter /FlateDecode' : '') . " >>\nstream\n$z\nendstream";
        $objs[$desc] = "<< /Type /FontDescriptor /FontName /$base /Flags 32 /FontBBox [" . implode(' ', array_map(function ($v) use ($k) { return round($v * $k); }, $this->bbox)) . ']'
            . ' /ItalicAngle 0 /Ascent ' . round($this->ascent * $k) . ' /Descent ' . round($this->descent * $k) . ' /CapHeight ' . round($this->ascent * $k) . " /StemV 80 /FontFile2 $ff 0 R >>";
        $objs[$cid] = "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /$base /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor $desc 0 R"
            . ' /DW ' . round($this->adv(0) * $k) . " /W [$w] /CIDToGIDMap /Identity >>";
        $map = '';
        $lines = [];
        foreach ($this->used as $g => $cp) if ($cp > 0) $lines[] = sprintf('<%04X> <%s>', $g, self::utf16hex($cp));
        foreach (array_chunk($lines, 100) as $chunk) $map .= count($chunk) . " beginbfchar\n" . implode("\n", $chunk) . "\nendbfchar\n";
        $cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"
            . "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n{$map}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
        $objs[$tu] = '<< /Length ' . strlen($cmap) . " >>\nstream\n$cmap\nendstream";
        $objs[$font] = "<< /Type /Font /Subtype /Type0 /BaseFont /$base /Encoding /Identity-H /DescendantFonts [$cid 0 R] /ToUnicode $tu 0 R >>";
        return $font;
    }
}
