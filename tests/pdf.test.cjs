'use strict';
// PDF writer: Unicode text with the embedded DejaVu Sans (checked with pdftotext when installed), images of the
// record (JPEG, PNG, PNG with transparency through GD, not an image), many pages, fallback without the fonts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const LIB = path.join(__dirname, '..', 'runtime', 'lib');
const HAS_PDFTOTEXT = spawnSync('pdftotext', ['-v']).status === 0;
const HAS_GD = /^gd$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));

function makePdfs(dir, fontsDir) {
  const script = `<?php
namespace MiB;
function t($k) { return $k; }
require ${JSON.stringify(path.join(fontsDir ? fontsDir : LIB, fontsDir ? 'lib/PdfFont.php' : 'PdfFont.php'))};
require ${JSON.stringify(path.join(fontsDir ? fontsDir : LIB, fontsDir ? 'lib/Pdf.php' : 'Pdf.php'))};
$im = function ($w, $h, $png, $alpha = false) {
  $i = imagecreatetruecolor($w, $h);
  if ($alpha) { imagesavealpha($i, true); imagefill($i, 0, 0, imagecolorallocatealpha($i, 0, 0, 255, 60)); } else imagefill($i, 0, 0, imagecolorallocate($i, 200, 30, 30));
  ob_start(); $png ? imagepng($i) : imagejpeg($i); return ob_get_clean();
};
$imgs = function_exists('imagecreatetruecolor') ? [$im(120, 80, false), $im(60, 60, true), $im(50, 50, true, true), 'testo'] : ['testo'];
file_put_contents($argv[1] . '/rec.pdf', Pdf::record('Città — Ελλάδα / Москва', ['Nome' => 'Ünïcödé € “citazioni” ½', 'Cirillico' => 'Привет мир', 'Foto' => ['text' => '', 'images' => $imgs]]));
$rows = []; for ($i = 0; $i < 120; $i++) $rows[] = [(string)$i, "Ελληνικά $i", number_format($i * 1.5, 2, ',', '.')];
file_put_contents($argv[1] . '/tab.pdf', Pdf::table('Elenco Ω', 'sottotitolo', ['N', 'Nome', 'Importo'], $rows, [0, 2]));
`;
  fs.writeFileSync(path.join(dir, 'make.php'), script);
  execFileSync(PHP, [path.join(dir, 'make.php'), dir]);
  return [fs.readFileSync(path.join(dir, 'rec.pdf'), 'latin1'), fs.readFileSync(path.join(dir, 'tab.pdf'), 'latin1')];
}

test('PDF: Unicode text with the embedded font, images, pages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-pdf-'));
  const [rec, tab] = makePdfs(dir);
  for (const pdf of [rec, tab]) {
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /\/Subtype \/CIDFontType2 \/BaseFont \/[A-Z]{6}\+DejaVuSans/);
    assert.match(pdf, /startxref\n\d+\n%%EOF\n$/);
  }
  // subset: far smaller than the 700 KB font files
  assert.ok(rec.length < 120000, `record PDF ${rec.length} bytes`);
  assert.strictEqual((rec.match(/\/Subtype \/Image/g) || []).length, HAS_GD ? 3 : 0, 'JPEG, PNG and PNG with transparency; text that is not an image skipped');
  if (HAS_GD) {
    assert.match(rec, /\/Filter \/DCTDecode/);
    assert.match(rec, /\/Predictor 15 \/Colors 3/);
  }
  assert.match(tab, /\/Count 3 >>/, '120 rows on 3 pages');
  if (HAS_PDFTOTEXT) {
    const text = (f) => execFileSync('pdftotext', [path.join(dir, f), '-'], { encoding: 'utf8' });
    assert.match(text('rec.pdf'), /Città — Ελλάδα \/ Москва/);
    assert.match(text('rec.pdf'), /Ünïcödé € “citazioni” ½/);
    assert.match(text('rec.pdf'), /Привет мир/);
    assert.match(text('tab.pdf'), /Ελληνικά 119/);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('PDF without the font files: Helvetica and Windows-1252', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-pdf-'));
  fs.mkdirSync(path.join(dir, 'rt', 'lib'), { recursive: true });
  for (const f of ['PdfFont.php', 'Pdf.php']) fs.copyFileSync(path.join(LIB, f), path.join(dir, 'rt', 'lib', f));
  const [rec] = makePdfs(dir, path.join(dir, 'rt'));
  assert.match(rec, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.doesNotMatch(rec, /CIDFontType2/);
  if (HAS_PDFTOTEXT) assert.match(execFileSync('pdftotext', [path.join(dir, 'rec.pdf'), '-'], { encoding: 'utf8' }), /Città — \?+ \/ \?+/);
  fs.rmSync(dir, { recursive: true, force: true });
});
