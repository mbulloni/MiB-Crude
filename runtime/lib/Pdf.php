<?php
namespace MiB;

/**
 * Minimal PDF writer, no dependencies (PHP 7.4+): A4 pages with the standard Helvetica fonts in WinAnsi
 * encoding (characters outside Windows-1252 become "?"). Two layouts: a table (list export, header row
 * repeated on every page, landscape when the columns need it) and a record (label / value pairs, wrapped).
 */
class Pdf
{
    // Helvetica widths (1/1000 em) for ASCII 32..126; other characters use 556.
    const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
        278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
        667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
        333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
    const MARGIN = 36;

    private $pages = [];
    private $cur = '';
    private $pw = 595;
    private $ph = 842;

    /** Text in the PDF's single-byte encoding. */
    private static function enc($s)
    {
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', str_replace(["\r\n", "\r", "\t"], ["\n", "\n", ' '], (string)$s));
        $prev = mb_substitute_character();
        mb_substitute_character(0x3F);
        $out = mb_convert_encoding($s, 'Windows-1252', 'UTF-8');
        mb_substitute_character($prev);
        return $out;
    }

    /** Width in points of an encoded string. */
    private static function width($s, $size, $bold = false)
    {
        $w = 0;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $c = ord($s[$i]);
            $w += $c >= 32 && $c <= 126 ? self::W[$c - 32] : ($c === 0x85 ? 1000 : 556);
        }
        return $w * $size / 1000 * ($bold ? 1.06 : 1);
    }

    /** Encoded text cut to fit `max` points, with an ellipsis. */
    private static function fit($s, $max, $size, $bold = false)
    {
        $s = str_replace("\n", ' ', $s);
        if (self::width($s, $size, $bold) <= $max) return $s;
        while ($s !== '' && self::width($s . "\x85", $size, $bold) > $max) $s = substr($s, 0, -1);
        return $s . "\x85";
    }

    /** Encoded text split in lines of at most `max` points (words kept whole when they fit). */
    private static function wrap($s, $max, $size)
    {
        $out = [];
        foreach (explode("\n", $s) as $para) {
            $line = '';
            foreach (preg_split('/ /', $para) as $word) {
                $try = $line === '' ? $word : "$line $word";
                if (self::width($try, $size) <= $max) { $line = $try; continue; }
                if ($line !== '') $out[] = $line;
                while (self::width($word, $size) > $max) {
                    $cut = $word;
                    while (strlen($cut) > 1 && self::width($cut, $size) > $max) $cut = substr($cut, 0, -1);
                    $out[] = $cut;
                    $word = substr($word, strlen($cut));
                }
                $line = $word;
            }
            $out[] = $line;
        }
        return $out;
    }

    private static function esc($s)
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $s);
    }

    private function text($x, $y, $s, $size, $bold = false, $gray = 0)
    {
        $this->cur .= sprintf("BT /%s %.1F Tf %.3F g %.2F %.2F Td (%s) Tj ET\n", $bold ? 'F2' : 'F1', $size, $gray, $x, $this->ph - $y, self::esc($s));
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

    /**
     * Table of rows (already formatted strings). $right: column indexes aligned right (numbers).
     * @return string PDF bytes
     */
    public static function table($title, $subtitle, array $head, array $data, array $right = [])
    {
        $pdf = new self();
        $size = 8;
        $head = array_map([self::class, 'enc'], $head);
        $data = array_map(function ($r) { return array_map([self::class, 'enc'], $r); }, $data);
        $n = count($head);
        // natural column widths: header, and the 90th percentile of the cells (a few long values do not win)
        $nat = [];
        for ($i = 0; $i < $n; $i++) {
            $ws = [];
            foreach ($data as $r) $ws[] = self::width(str_replace("\n", ' ', isset($r[$i]) ? $r[$i] : ''), $size);
            sort($ws);
            $p90 = $ws ? $ws[(int)floor((count($ws) - 1) * 0.9)] : 0;
            $nat[$i] = max(self::width($head[$i], $size, true), $p90, 24) + 8;
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
        $title = self::enc($title);
        $subtitle = self::enc($subtitle);
        for ($p = 0; $p < $pageCount; $p++) {
            $pdf->newPage();
            $pdf->text(self::MARGIN, self::MARGIN + 14, self::fit($title, $avail, 14, true), 14, true);
            if ($subtitle !== '') $pdf->text(self::MARGIN, self::MARGIN + 27, self::fit($subtitle, $avail, 8), 8, false, 0.4);
            $y = $top;
            $pdf->rect(self::MARGIN, $y, $avail, $rowH, 0.88);
            $x = self::MARGIN;
            foreach ($head as $i => $h) {
                $s = self::fit($h, $nat[$i] - 6, $size, true);
                $pdf->text(in_array($i, $right, true) ? $x + $nat[$i] - 3 - self::width($s, $size, true) : $x + 3, $y + 9.5, $s, $size, true);
                $x += $nat[$i];
            }
            $y += $rowH;
            foreach (array_slice($data, $p * $perPage, $perPage) as $ri => $r) {
                if ($ri % 2) $pdf->rect(self::MARGIN, $y, $avail, $rowH, 0.965);
                $x = self::MARGIN;
                for ($i = 0; $i < $n; $i++) {
                    $s = self::fit(isset($r[$i]) ? $r[$i] : '', $nat[$i] - 6, $size);
                    $pdf->text(in_array($i, $right, true) ? $x + $nat[$i] - 3 - self::width($s, $size) : $x + 3, $y + 9.5, $s, $size);
                    $x += $nat[$i];
                }
                $y += $rowH;
            }
            $pdf->line(self::MARGIN, $y, self::MARGIN + $avail, $y);
            $foot = self::enc(sprintf('%s  ·  %d / %d', date('d/m/Y H:i'), $p + 1, $pageCount));
            $pdf->text($pdf->pw - self::MARGIN - self::width($foot, 7), $pdf->ph - self::MARGIN + 4, $foot, 7, false, 0.45);
        }
        return $pdf->output();
    }

    /** One record: label / value pairs, values wrapped over several lines and pages. */
    public static function record($title, array $pairs)
    {
        $pdf = new self();
        $pdf->newPage();
        $avail = $pdf->pw - 2 * self::MARGIN;
        $size = 9;
        $labelW = 150;
        $pdf->text(self::MARGIN, self::MARGIN + 14, self::fit(self::enc($title), $avail, 14, true), 14, true);
        $y = self::MARGIN + 34;
        foreach ($pairs as $label => $value) {
            $lines = self::wrap(self::enc($value), $avail - $labelW - 6, $size);
            foreach ($lines as $li => $ln) {
                if ($y > $pdf->ph - self::MARGIN - 20) { $pdf->newPage(); $y = self::MARGIN; }
                if ($li === 0) $pdf->text(self::MARGIN, $y + 10, self::fit(self::enc($label), $labelW - 8, $size, true), $size, true, 0.3);
                $pdf->text(self::MARGIN + $labelW, $y + 10, $ln, $size);
                $y += 13;
            }
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
        $font = function ($name) { return "<< /Type /Font /Subtype /Type1 /BaseFont /$name /Encoding /WinAnsiEncoding >>"; };
        $objs[3] = $font('Helvetica');
        $objs[4] = $font('Helvetica-Bold');
        $kids = [];
        $id = 5;
        foreach ($this->pages as $content) {
            $stream = function_exists('gzcompress') ? gzcompress($content) : $content;
            $filter = function_exists('gzcompress') ? ' /Filter /FlateDecode' : '';
            $objs[$id] = '<< /Length ' . strlen($stream) . "$filter >>\nstream\n$stream\nendstream";
            $objs[$id + 1] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {$this->pw} {$this->ph}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $id 0 R >>";
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
