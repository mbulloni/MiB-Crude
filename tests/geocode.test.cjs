'use strict';
// Geocoding of the map view: coordinates from the address on add, on address change (not over coordinates the
// user typed), in bulk from the map view button; a local fake Nominatim answers.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const { datasourceFromSchema } = require('../core/defaults.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
const PORT = 19700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
const PLACES = { 'Via Roma 1, Milano': [45.4642, 9.19], 'Piazza Duomo, Firenze': [43.7731, 11.256], 'Corso Italia 5, Napoli': [40.83, 14.24] };
let dir;
let dbFile;
let server;
let geo;
const asked = [];

function sql(statements) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile);
  try { return statements.map((s) => (/^\s*select/i.test(s) ? db.prepare(s).all().map((r) => ({ ...r })) : db.exec(s))); } finally { db.close(); }
}

const jar = {};
async function req(url, opts = {}) {
  const r = await fetch(BASE + url, { redirect: 'manual', ...opts, headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
  for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); jar[k] = v; }
  const text = await r.text();
  const leak = text.match(/(Deprecated|Warning|Notice|Fatal error)(<\/b>)?: [^\n]{0,240}/);
  assert.ok(!leak, `PHP message in ${url}: ${leak && leak[0]}`);
  return { status: r.status, text, location: r.headers.get('location') };
}
const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
const post = (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

test.before(async () => {
  if (!SQLITE) return;
  geo = http.createServer((rq, res) => {
    const u = new URL(rq.url, 'http://x');
    asked.push({ q: u.searchParams.get('q'), cc: u.searchParams.get('countrycodes'), ua: rq.headers['user-agent'] });
    const p = PLACES[u.searchParams.get('q')];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(p ? [{ lat: String(p[0]), lon: String(p[1]), display_name: 'x' }] : []));
  });
  await new Promise((r) => geo.listen(0, '127.0.0.1', r));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-geo-'));
  dbFile = path.join(dir, 'app.sqlite');
  sql(['CREATE TABLE places (id INTEGER PRIMARY KEY, name TEXT, via TEXT, citta TEXT, lat REAL, lng REAL)']);
  const proj = P.createProject(dir, 'geoapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: dbFile });
  P.writeSecrets(dir, { connections: { main: '' } });
  const col = (name, type, pk) => ({ name, type, dbType: type === 'int' ? 'INTEGER' : type === 'decimal' ? 'REAL' : 'TEXT', nullable: !pk, pk: !!pk, autoInc: !!pk });
  const t = datasourceFromSchema({ name: 'places', columns: [col('id', 'int', true), col('name', 'varchar'), col('via', 'varchar'), col('citta', 'varchar'), col('lat', 'decimal'), col('lng', 'decimal')], pk: ['id'], fks: [] },
    { connection: 'main', languages: proj.project.languages, settings: proj.project.settings });
  t.pages.list.views = [{ type: 'map', titleField: 'name', latField: 'lat', lngField: 'lng', addressField: '{via}, {citta}' }];
  proj.tables.push(t);
  proj.menu.items.push({ type: 'table', table: 'places' });
  proj.project.settings.geocode = { provider: 'nominatim', url: `http://127.0.0.1:${geo.address().port}/search`, countries: 'it' };
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); if (geo) geo.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

const row = (id) => sql([`SELECT lat, lng FROM places WHERE id = ${id}`])[0][0];

test('geocoding: on add, on address change, not over typed coordinates, in bulk', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  let r = await req('?p=add&t=places');
  await post('?p=add&t=places', { _csrf: csrf(r.text), name: 'Sede', via: 'Via Roma 1', citta: 'Milano', lat: '', lng: '', _next: 'list' });
  assert.deepStrictEqual(row(1), { lat: 45.4642, lng: 9.19 });
  assert.deepStrictEqual(asked.pop(), { q: 'Via Roma 1, Milano', cc: 'it', ua: 'MiB-Crude (geoapp)' });
  // new address, coordinates left as they were: recomputed
  r = await req('?p=edit&t=places&k[id]=1');
  await post('?p=edit&t=places&k[id]=1', { _csrf: csrf(r.text), name: 'Sede', via: 'Piazza Duomo', citta: 'Firenze', lat: '45.4642', lng: '9.19', _next: 'list' });
  assert.deepStrictEqual(row(1), { lat: 43.7731, lng: 11.256 });
  // coordinates typed by the user win
  r = await req('?p=edit&t=places&k[id]=1');
  await post('?p=edit&t=places&k[id]=1', { _csrf: csrf(r.text), name: 'Sede', via: 'Corso Italia 5', citta: 'Napoli', lat: '41.9', lng: '12.5', _next: 'list' });
  assert.deepStrictEqual(row(1), { lat: 41.9, lng: 12.5 });
  // bulk from the map view
  sql(["INSERT INTO places (id, name, via, citta) VALUES (2, 'Napoli', 'Corso Italia 5', 'Napoli'), (3, 'Boh', 'Via Inesistente', 'Nessuna')"]);
  r = await req('?p=list&t=places&v=map');
  assert.match(r.text, /mc-geocode/);
  r = await post('?p=geocode&t=places', { _csrf: csrf(r.text), _back: 'index.php?p=list&t=places&v=map' });
  assert.strictEqual(r.status, 302);
  assert.deepStrictEqual(row(2), { lat: 40.83, lng: 14.24 });
  assert.deepStrictEqual(row(3), { lat: null, lng: null });
  r = await req('?p=list&t=places&v=map');
  assert.match(r.text, /Coordinate trovate: 1; indirizzi non trovati: 1/);
});
