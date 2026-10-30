'use strict';
// phpr import: PHP 8 rewrites (always) and a real project when available on this machine.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const U = require('../core/php8-compat.cjs');
const I = require('../core/phpr-import.cjs');
const G = require('../core/generator.cjs');

test('PHP 7.4 -> 8 rewrites only real code', () => {
  const r = U.upgrade('$a = $s{0}; $b = (real)$x; $c = "ciao ${nome}"; // $z{1}\n$q = "select `x{y}`"; each($arr);');
  assert.strictEqual(r.code, '$a = $s[0]; $b = (float)$x; $c = "ciao {$nome}"; // $z{1}\n$q = "select `x{y}`"; each($arr);');
  assert.ok(r.problems.some((p) => p.level === 'error' && /each/.test(p.msg)));
});

test('phpr events are wrapped with their variables', () => {
  const w = I.wrapEvent('EVENT_BEFOREEDIT', '$values["a"] = $oldvalues["a"];\nreturn true;', 'ordini');
  assert.strictEqual(w.to, 'BeforeEdit');
  assert.match(w.text, /\$oldvalues = \$old;/);
  assert.match(w.text, /if \(\$__r === false\) return false;/);
  const m = I.wrapEvent('EVENT_BEFOREMOVENEXT_LIST', '$record["css"] = "color:red";', 'ordini');
  assert.match(m.text, /applyRecord\('ordini', \$data, \$record\)/);
});

// Optional real project: MIBCRUDE_PHPR_SAMPLE=/path/project.phpr
const REAL = process.env.MIBCRUDE_PHPR_SAMPLE || '';
test('real phpr 10.3 project imports and generates valid PHP', { skip: !(REAL && fs.existsSync(REAL)) && 'progetto phpr reale non indicato (MIBCRUDE_PHPR_SAMPLE)' }, async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-phpr-')), 'p');
  const { proj, report } = await I.importPhpr(REAL, dir, { copySource: false });
  assert.strictEqual(report.tables, 8);
  assert.ok(report.events > 100);
  assert.ok(!fs.readFileSync(path.join(dir, 'connections', `${proj.connections[0].id}.json`), 'utf8').includes('password'));
  const res = G.generate(proj, { outDir: path.join(dir, 'out') });
  assert.deepStrictEqual(G.lint(res.outDir), []);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true }); // the import holds real DB passwords
});
