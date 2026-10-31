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

const C = require('../core/themes/css.cjs');

test('CSS helpers: numbered sections and dark scope', () => {
  const css = '/* ---- */\n/* ### 1. A ### */\n/* ---- */\n.a{x:1}\n/* ---- */\n/* ### 2. B ### */\n/* ---- */\n.b{x:2}\n';
  assert.deepStrictEqual(C.sections(css).map((s) => s.num), [0, 1, 2]);
  const k = C.keepSections(css, [2]);
  assert.ok(k.includes('.b{x:2}') && !k.includes('.a{'));
  const d = C.scope('body{c:1}\n.x, .y > a{c:2}\n@media (max-width:9px){.z{c:3}}\n@keyframes k{from{o:0}to{o:1}}', '[t=d]');
  assert.match(d, /\[t=d\] body \{c:1\}/);
  assert.match(d, /\[t=d\] \.x, \[t=d\] \.y > a \{/);
  assert.match(d, /@media \(max-width:9px\) \{\n\[t=d\] \.z \{c:3\}/);
  assert.match(d, /@keyframes k \{from\{o:0\}to\{o:1\}\}/);
});

const SRC = path.join(os.homedir(), 'Documenti/SVILUPPO/Progetti/Template');

test('templates are recognised, installed and used by the generator', { skip: !fs.existsSync(SRC) && 'cartella Template non presente' }, () => {
  const { found, unsupported } = T.scan(SRC);
  assert.ok(found.some((f) => f.adapter === 'metronic8'));
  assert.ok(found.filter((f) => f.adapter === 'designreset').length >= 1);
  assert.ok(found.some((f) => f.adapter === 'satria' && f.kind === 'auth'));
  assert.deepStrictEqual(found.find((f) => f.adapter === 'slim').variants.map((v) => v.id), ['sidebar', 'horizontal']);
  assert.strictEqual(found.filter((f) => f.adapter === 'webarch').length, 1, 'Webarch barebone only, not demo/HTML');
  assert.deepStrictEqual(found.find((f) => f.adapter === 'material').variants.map((v) => v.id), ['dark', 'primary', 'light', 'horizontal']);
  assert.deepStrictEqual(unsupported.map((u) => u.name), [], 'all the purchased templates have an adapter');
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
    if (m.adapter === 'material') {
      const css = fs.readFileSync(path.join(out, 'theme', m.id, 'assets', 'css', 'material.mc.css'), 'utf8');
      assert.ok(!/Bootstrap v3|AngularJS Material|normalize\.css/.test(css), 'Bootstrap 3 and Angular Material removed');
      assert.match(css, /\.nav-container/);
      assert.ok(!/ng-include|ng-class|data-ng-/.test(fs.readFileSync(layout, 'utf8')), 'no AngularJS in the layout');
    }
    if (m.adapter === 'slim') {
      const css = fs.readFileSync(path.join(out, 'theme', m.id, 'assets', 'css', 'slim.mc.css'), 'utf8');
      assert.ok(!/Bootstrap v4/.test(css) && !/\.col-md-6\s*\{/.test(css), 'Bootstrap 4 removed from slim.css');
      assert.match(css, /\.slim-header/);
      assert.match(fs.readFileSync(path.join(out, 'theme', m.id, 'assets', 'css', 'slim.dark.css'), 'utf8'), /^\[data-bs-theme=dark\] \.slim-header \{/m);
    }
    assert.ok(!fs.existsSync(path.join(out, 'theme', m.id, 'layouts', 'layout.php')), 'PHP layouts must not be web-accessible');
  }
  fs.rmSync(lib, { recursive: true, force: true });
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
