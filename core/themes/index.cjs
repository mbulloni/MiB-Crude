'use strict';
// Graphic themes from purchased templates (ThemeForest...). An adapter recognises a template
// package, copies only the assets the generated app needs into the local theme library
// (outside the MiB-Crude sources: template licences do not allow redistribution) and adds
// a PHP layout written with the template's own markup.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Local theme library (per developer machine, never inside the MiB-Crude sources).
const DEFAULT_LIB = process.env.MIBCRUDE_THEMES || path.join(os.homedir(), '.config', 'MiB-Crude', 'themes');

const ADAPTERS = [require('./metronic8/adapter.cjs'), require('./designreset/adapter.cjs'), require('./satria/adapter.cjs'), require('./slim/adapter.cjs'), require('./webarch/adapter.cjs')];

// Directories up to `depth` levels below root.
function dirs(root, depth, out = []) {
  if (depth < 0) return out;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.') || e.name === '__MACOSX') continue;
    const p = path.join(root, e.name);
    out.push(p);
    dirs(p, depth - 1, out);
  }
  return out;
}

/** Templates found under `root`: [{adapter, root, name, variants:[{id,label}]}], plus unsupported ones. */
function scan(root) {
  const found = [];
  const candidates = [root, ...dirs(root, 4)];
  for (const d of candidates) {
    for (const a of ADAPTERS) {
      const hit = a.detect(d);
      if (hit && !found.some((f) => f.root === hit.root)) found.push({ adapter: a.id, adapterName: a.name, ...hit });
    }
  }
  // Report the other folders as not supported (with the reason when recognisable).
  const unsupported = [];
  let tops = [];
  try { tops = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(root, e.name)); } catch { /* none */ }
  for (const t of tops) {
    if (found.some((f) => f.root.startsWith(t + path.sep) || f.root === t)) continue;
    unsupported.push({ root: t, name: path.basename(t), reason: whyNot(t) });
  }
  return { found, unsupported };
}

function whyNot(dir) {
  const sample = dirs(dir, 4).slice(0, 4000);
  const has = (re) => sample.some((d) => re.test(d));
  let text = '';
  for (const d of sample) {
    for (const f of ['bootstrap.min.css', 'bootstrap.css']) {
      const p = path.join(d, f);
      if (fs.existsSync(p)) { text = fs.readFileSync(p, 'utf8').slice(0, 400); break; }
    }
    if (text) break;
  }
  const v = (text.match(/Bootstrap v(\d+)/) || [])[1];
  if (has(/angular/i)) return 'Applicazione AngularJS: il layout dipende dal framework JavaScript';
  if (v && Number(v) < 5) return `Basato su Bootstrap ${v}: le pagine generate usano Bootstrap 5 (classi diverse)`;
  return 'Struttura non riconosciuta';
}

function adapter(id) {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`Adattatore tema sconosciuto: ${id}`);
  return a;
}

/** Install a template variant into libDir/<themeId>. Returns the theme manifest. */
function install(found, variant, libDir) {
  const a = adapter(found.adapter);
  const id = `${found.slug}-${variant}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const dest = path.join(libDir, id);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'assets'), { recursive: true });
  const manifest = a.install(found.root, variant, path.join(dest, 'assets'));
  // Layout files of the adapter (our code), parametrised by the manifest.
  fs.mkdirSync(path.join(dest, 'layouts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, a.dir)).filter((x) => /\.(php|css|js)$/.test(x))) fs.copyFileSync(path.join(__dirname, a.dir, f), path.join(dest, 'layouts', f));
  const full = { kind: found.kind || 'app', id, name: `${found.name} — ${(found.variants.find((v) => v.id === variant) || {}).label || variant}`, adapter: a.id, variant, source: found.root, installedAt: new Date().toISOString(), ...manifest };
  fs.writeFileSync(path.join(dest, 'theme.json'), JSON.stringify(full, null, 2));
  return full;
}

function list(libDir) {
  let out = [];
  try {
    out = fs.readdirSync(libDir).map((d) => { try { return JSON.parse(fs.readFileSync(path.join(libDir, d, 'theme.json'), 'utf8')); } catch { return null; } }).filter(Boolean);
  } catch { /* empty library */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function remove(libDir, id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Tema non valido');
  fs.rmSync(path.join(libDir, id), { recursive: true, force: true });
  return true;
}

// Copy helper used by the adapters.
function copy(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) if (filter(path.join(src, e))) copy(path.join(src, e), path.join(dst, e), filter);
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function load(libDir, id) {
  const f = path.join(libDir || DEFAULT_LIB, id, 'theme.json');
  if (!fs.existsSync(f)) return null;
  return { dir: path.dirname(f), manifest: JSON.parse(fs.readFileSync(f, 'utf8')) };
}

module.exports = { ADAPTERS, DEFAULT_LIB, scan, install, list, remove, copy, load };
