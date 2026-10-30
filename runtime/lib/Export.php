<?php
namespace MiB;

/** CSV / XLSX / JSON export and CSV / XLSX reading for import. */
class Export
{
    public static function send(Table $t, array $rows, array $fields, $fmt)
    {
        $name = preg_replace('/\W/', '_', $t->name) . '_' . date('Ymd_His');
        $head = [];
        foreach ($fields as $f) $head[] = $t->fieldLabel($f);
        $data = [];
        foreach ($rows as $r) {
            $line = [];
            foreach ($fields as $f) {
                $v = isset($r[$f['name']]) ? $r[$f['name']] : null;
                // Raw numbers/dates keep their type in XLSX/JSON; lookups and files become text.
                if (isset($r['__lk'][$f['name']]) || in_array($f['viewAs']['type'], ['file', 'image', 'checkbox', 'html'], true)) $v = Format::plain($t, $f, $v, $r);
                $line[] = $v;
            }
            $data[] = $line;
        }
        switch ($fmt) {
            case 'json':
                header('Content-Type: application/json; charset=utf-8');
                header("Content-Disposition: attachment; filename=\"$name.json\"");
                $out = [];
                foreach ($data as $line) { $o = []; foreach ($fields as $i => $f) $o[$f['name']] = $line[$i]; $out[] = $o; }
                echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR);
                return;
            case 'xlsx':
                if (class_exists('ZipArchive')) {
                    $file = self::xlsx($head, $data, $fields);
                    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    header("Content-Disposition: attachment; filename=\"$name.xlsx\"");
                    header('Content-Length: ' . filesize($file));
                    readfile($file);
                    @unlink($file);
                    return;
                }
                // fall through to CSV when the zip extension is missing
            default:
                header('Content-Type: text/csv; charset=utf-8');
                header("Content-Disposition: attachment; filename=\"$name.csv\"");
                $o = fopen('php://output', 'w');
                fwrite($o, "\xEF\xBB\xBF");
                $sep = App::$i->setting('decimalSeparator', ',') === ',' ? ';' : ',';
                fputcsv($o, $head, $sep, '"', '\\');
                foreach ($data as $line) fputcsv($o, array_map(function ($v) { return $v === null ? '' : (string)$v; }, $line), $sep, '"', '\\');
                fclose($o);
        }
    }

    private static function col($i)
    {
        $s = '';
        for ($i++; $i > 0; $i = intdiv($i - 1, 26)) $s = chr(65 + ($i - 1) % 26) . $s;
        return $s;
    }

    private static function x($s)
    {
        return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string)$s), ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /** Minimal XLSX writer (inline strings, numbers as numbers, bold header, frozen first row). */
    public static function xlsx(array $head, array $data, array $fields)
    {
        $rows = '<row r="1">';
        foreach ($head as $i => $h) $rows .= '<c r="' . self::col($i) . '1" t="inlineStr" s="1"><is><t>' . self::x($h) . '</t></is></c>';
        $rows .= '</row>';
        foreach ($data as $n => $line) {
            $r = $n + 2;
            $rows .= "<row r=\"$r\">";
            foreach ($line as $i => $v) {
                if ($v === null || $v === '') continue;
                $ref = self::col($i) . $r;
                $numeric = in_array($fields[$i]['type'], ['int', 'decimal'], true) && is_numeric($v) && !isset($fields[$i]['editAs']['lookup']);
                $rows .= $numeric ? "<c r=\"$ref\"><v>" . (0 + $v) . '</v></c>' : "<c r=\"$ref\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" . self::x($v) . '</t></is></c>';
            }
            $rows .= '</row>';
        }
        $file = tempnam(sys_get_temp_dir(), 'mcx');
        $z = new \ZipArchive();
        $z->open($file, \ZipArchive::OVERWRITE);
        $z->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
        $z->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $z->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        $z->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>');
        $z->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' . $rows . '</sheetData></worksheet>');
        $z->close();
        return $file;
    }

    /** Read an uploaded CSV or XLSX into [header[], rows[][]]. */
    public static function read($path, $name)
    {
        if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'xlsx') return self::readXlsx($path);
        $text = file_get_contents($path);
        if (strncmp($text, "\xEF\xBB\xBF", 3) === 0) $text = substr($text, 3);
        $first = strtok($text, "\n");
        $sep = substr_count($first, ';') > substr_count($first, ',') ? ';' : (substr_count($first, "\t") > substr_count($first, ',') ? "\t" : ',');
        $h = fopen('php://memory', 'w+');
        fwrite($h, $text);
        rewind($h);
        $rows = [];
        while (($r = fgetcsv($h, 0, $sep, '"', '\\')) !== false) if ($r !== [null]) $rows[] = $r;
        fclose($h);
        $head = $rows ? array_map('trim', array_shift($rows)) : [];
        return [$head, $rows];
    }

    private static function readXlsx($path)
    {
        $z = new \ZipArchive();
        if ($z->open($path) !== true) throw new HttpError(t('import.badfile'), 400);
        $shared = [];
        if (($s = $z->getFromName('xl/sharedStrings.xml')) !== false) {
            $x = simplexml_load_string($s);
            foreach ($x->si as $si) {
                $txt = '';
                if (isset($si->t)) $txt = (string)$si->t;
                else foreach ($si->r as $r) $txt .= (string)$r->t;
                $shared[] = $txt;
            }
        }
        $x = simplexml_load_string($z->getFromName('xl/worksheets/sheet1.xml'));
        $z->close();
        $rows = [];
        foreach ($x->sheetData->row as $row) {
            $line = [];
            foreach ($row->c as $c) {
                preg_match('/^([A-Z]+)/', (string)$c['r'], $m);
                $idx = 0;
                foreach (str_split($m[1]) as $ch) $idx = $idx * 26 + ord($ch) - 64;
                $t = (string)$c['t'];
                $v = $t === 's' ? $shared[(int)$c->v] : ($t === 'inlineStr' ? (string)$c->is->t : (string)$c->v);
                $line[$idx - 1] = $v;
            }
            if ($line) { $max = max(array_keys($line)); $rows[] = array_replace(array_fill(0, $max + 1, ''), $line); }
        }
        $head = $rows ? array_map('trim', array_shift($rows)) : [];
        return [$head, $rows];
    }
}
