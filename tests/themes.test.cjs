'use strict';
// Graphic themes from purchased templates (runs only where the templates are available).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const T = require('../core/themes/index.cjs');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const SRC = path.join(os.homedir(), 'Documenti/SVILUPPO/Progetti/Template');

test('templates are recognised, installed and used by the generator', { skip: !fs.existsSync(SRC) && 'cartella Template non presente' }, () => {
  const { found, unsupported } = T.scan(SRC);
  assert.ok(found.some((f) => f.adapter === 'metronic8'));
  assert.ok(found.filter((f) => f.adapter === 'designreset').length >= 1);
  assert.ok(found.some((f) => f.adapter === 'satria' && f.kind === 'auth'));
  assert.ok(found.some((f) => f.variants.some((v) => v.id.startsWith('horizontal'))));
  assert.ok(unsupported.every((u) => u.reason));
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lib-'));
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-thp-')), 'p');
  for (const f of found) {
    const m = T.install(f, f.variants[0].id, lib);
    const proj = P.createProject(path.join(dir, m.id), 'x');
    proj.connections.push({ id: 'main', name: 'x', driver: 'sqlite', file: 'x.db' });
    if (m.kind === 'auth') proj.project.theme.authPack = m.id; else proj.project.theme.pack = m.id;
    const out = G.generate(proj, { themesDir: lib, outDir: path.join(dir, m.id, 'out') }).outDir;
    for (const c of m.css) assert.ok(fs.existsSync(path.join(out, 'theme', m.id, c)), `${m.id}: ${c}`);
    const layout = path.join(out, 'runtime', 'themes', m.id, m.kind === 'auth' ? 'layout_bare.php' : 'layout.php');
    assert.ok(fs.existsSync(layout));
    execFileSync('php', ['-l', layout], { stdio: 'pipe' });
    assert.ok(!fs.existsSync(path.join(out, 'theme', m.id, 'layouts', 'layout.php')), 'PHP layouts must not be web-accessible');
  }
  fs.rmSync(lib, { recursive: true, force: true });
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
