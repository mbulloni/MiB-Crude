'use strict';
// REST datasource end to end: a mock JSON API (bearer auth), designer inference of fields,
// generated app on SQLite (users/permissions) listing, searching, sorting, editing and
// deleting records of the API through php -S; a paged resource (page/limit/q/sort/order),
// lookups from SQL and REST tables to REST tables, filter panel, unique check, report and chart.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const R = require('../core/rest.cjs');
const { datasourceFromSchema } = require('../core/defaults.cjs');

const TOKEN = 'tok-123';
let users = [
  { id: 1, name: 'Mario Rossi', email: 'mario@example.org', age: 41, address: { city: 'Milano' } },
  { id: 2, name: 'Anna Bianchi', email: 'anna@example.org', age: 29, address: { city: 'Roma' } },
  { id: 3, name: 'Luca Verdi', email: 'luca@example.org', age: 35, address: { city: 'Torino' } },
];
const cities = [
  ['Milano', 'Lombardia'], ['Roma', 'Lazio'], ['Torino', 'Piemonte'], ['Napoli', 'Campania'],
  ['Bergamo', 'Lombardia'], ['Latina', 'Lazio'], ['Novara', 'Piemonte'],
].map(([name, region], i) => ({ id: i + 1, name, region }));
const calls = [];
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls.push(`${req.method} ${req.url}`);
    const send = (code, json) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: 'unauthorized' });
    const u0 = new URL(req.url, 'http://x');
    if (u0.pathname === '/api/cities') {
      // Paged API: ?page=1&limit=3&q=&sort=name&order=desc, total in the response.
      const qp = u0.searchParams;
      let list = cities.filter((c) => !qp.get('q') || `${c.name} ${c.region}`.toLowerCase().includes(qp.get('q').toLowerCase()));
      if (qp.get('sort')) list = [...list].sort((a, b) => String(a[qp.get('sort')]).localeCompare(String(b[qp.get('sort')])) * (qp.get('order') === 'desc' ? -1 : 1));
      const limit = Number(qp.get('limit') || 3);
      const page = Number(qp.get('page') || 1);
      return send(200, { total: list.length, items: list.slice((page - 1) * limit, page * limit) });
    }
    const m = req.url.match(/^\/api\/users(?:\/(\d+))?$/);
    if (!m) return send(404, { error: 'not found' });
    const id = m[1] && Number(m[1]);
    if (req.method === 'GET' && !id) return send(200, { meta: { count: users.length }, data: users });
    const u = users.find((x) => x.id === id);
    if (req.method === 'GET') return u ? send(200, u) : send(404, {});
    if (req.method === 'PUT') { Object.assign(u, JSON.parse(body)); return send(200, u); }
    if (req.method === 'DELETE') { users = users.filter((x) => x.id !== id); return send(204); }
    if (req.method === 'POST') { const n = { ...JSON.parse(body), id: Math.max(...users.map((x) => x.id)) + 1 }; users.push(n); return send(201, n); }
    send(405, {});
  });
});

const PORT = 19000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
let server;
let dir;
const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
// The SQL -> REST lookup needs pdo_sqlite for the main database (missing in some PHP 7.4 builds).
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));

function client() {
  const jar = {};
  const req = async (url, opts = {}) => {
    const r = await fetch(BASE + url, { redirect: 'manual', ...opts, headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); jar[k] = v; }
    const text = await r.text();
    const leak = text.match(/(Deprecated|Warning|Notice|Fatal error)(<\/b>)?: [^\n]{0,240}/);
    assert.ok(!leak, `PHP message in ${url}: ${leak && leak[0]}`);
    return { status: r.status, location: r.headers.get('location'), text };
  };
  const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  const post = (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return { req, post, csrf };
}

test.before(async () => {
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-rest-'));
  const proj = P.createProject(dir, 'restapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  const rest = { id: 'api', name: 'API', driver: 'rest', url: `http://127.0.0.1:${api.address().port}/api`, auth: 'bearer' };
  proj.connections.push(rest);
  P.writeSecrets(dir, { connections: { main: '', api: TOKEN } });
  const ds = await R.addRestView(proj, rest, TOKEN, { name: 'users', path: '/users' });
  assert.strictEqual(ds.source.dataPath, 'data');
  assert.deepStrictEqual(ds.keys, ['id']);
  assert.ok(ds.fields.some((f) => f.name === 'address.city'));
  assert.strictEqual(ds.fields.find((f) => f.name === 'age').type, 'int');
  ds.fields.find((f) => f.name === 'age').totals = 'sum';
  ds.pages.list.totals = true;
  ds.fields.find((f) => f.name === 'email').validation = { unique: true };
  // REST -> REST lookup on a paged resource; filter panel on the same field.
  const city = ds.fields.find((f) => f.name === 'address.city');
  city.editAs = { type: 'select', lookup: { kind: 'table', table: 'cities', key: 'name', display: '{name} ({region})', where: '', orderBy: '', dependsOn: null } };
  city.viewAs = { type: 'lookup' };
  city.filter = true;
  ds.pages.list.filterPanel = true;
  const paging = { mode: 'page', pageParam: 'page', firstPage: 1, sizeParam: 'limit', pageSize: 3, totalPath: 'total', searchParam: 'q', sortParam: 'sort', dirParam: 'order' };
  const cds = await R.addRestView(proj, rest, TOKEN, { name: 'cities', path: '/cities', paging, readOnly: true });
  assert.strictEqual(cds.source.dataPath, 'items');
  assert.deepStrictEqual(cds.source.paging, paging);
  // SQL table -> REST lookup.
  if (SQLITE) {
    const { DatabaseSync } = require('node:sqlite');
    const sq = new DatabaseSync(path.join(dir, 'app.sqlite'));
    sq.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, amount REAL); INSERT INTO orders VALUES (1, 1, 10), (2, 2, 20), (3, 1, 5);');
    sq.close();
    const ods = datasourceFromSchema({ name: 'orders', columns: [
      { name: 'id', type: 'int', dbType: 'INTEGER', nullable: false, pk: true, autoInc: true },
      { name: 'user_id', type: 'int', dbType: 'INTEGER', nullable: true, pk: false, autoInc: false },
      { name: 'amount', type: 'decimal', dbType: 'REAL', nullable: true, pk: false, autoInc: false },
    ], pk: ['id'], fks: [{ columns: ['user_id'], refTable: 'users', refColumns: ['id'] }] }, { connection: 'main', languages: proj.project.languages, settings: proj.project.settings });
    ods.fields.find((f) => f.name === 'user_id').editAs.lookup.display = 'name';
    proj.tables.push(ods);
    proj.menu.items.push({ type: 'table', table: 'orders' });
  }
  proj.reports.push({ name: 'bycity', title: { it: 'Per città' }, table: 'users', groups: [{ field: 'address.city' }], aggregates: [{ field: 'age', fn: 'sum' }], columns: ['name', 'age'] });
  proj.charts.push({ name: 'agebycity', title: { it: 'Età per città' }, table: 'users', type: 'bar', labelField: 'address.city', series: [{ field: 'age', fn: 'sum' }] });
  proj.menu.items.push({ type: 'table', table: 'users' }, { type: 'table', table: 'cities' });
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  assert.deepStrictEqual(G.lint(out), []);
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); api.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('REST datasource: list, search, sort, totals, view, edit, delete', async () => {
  const c = client();
  let r;
  const dt = async (qs) => { const x = await c.req(`?p=dt&draw=1&start=0&length=20&t=users&${qs}`); assert.strictEqual(x.status, 200, x.text.slice(0, 600)); return JSON.parse(x.text); };
  let d = await dt('');
  assert.strictEqual(d.recordsTotal, 3);
  assert.match(JSON.stringify(d.data), /Milano/);
  assert.match(d.totals.age, /105/);
  d = await dt('search[value]=anna');
  assert.strictEqual(d.recordsFiltered, 1);
  const ageCol = 2 + ['id', 'name', 'email', 'age'].indexOf('age'); // check, actions, fields...
  d = await dt(`order[0][column]=${ageCol}&order[0][dir]=desc&length=1`);
  assert.match(JSON.stringify(d.data), /Mario/);
  r = await c.req('?p=view&t=users&k[id]=2');
  assert.match(r.text, /anna@example.org/);
  r = await c.req('?p=edit&t=users&k[id]=2');
  r = await c.post('?p=edit&t=users&k[id]=2', { _csrf: c.csrf(r.text), name: 'Anna Neri', email: 'anna@example.org', age: '30', 'address.city': 'Napoli', _next: 'list' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 600));
  assert.deepStrictEqual(users.find((u) => u.id === 2), { id: 2, name: 'Anna Neri', email: 'anna@example.org', age: 30, address: { city: 'Napoli' } });
  assert.ok(calls.includes('PUT /api/users/2'));
  r = await c.req('?p=list&t=users');
  r = await c.post('?p=delete&t=users', { _csrf: c.csrf(r.text), 'k[id]': '3' });
  assert.ok(calls.includes('DELETE /api/users/3'));
  assert.strictEqual(users.length, 2);
});

test('REST paging, lookups, filter panel, unique, report and chart', async (t) => {
  const c = client();
  const dt = async (t, qs) => { const x = await c.req(`?p=dt&draw=1&t=${t}&${qs}`); assert.strictEqual(x.status, 200, x.text.slice(0, 600)); return JSON.parse(x.text); };
  // Paged resource: the page is asked to the API, the count comes from "total".
  calls.length = 0;
  let d = await dt('cities', 'start=3&length=3');
  assert.strictEqual(d.recordsTotal, 7);
  assert.strictEqual(d.data.length, 3);
  assert.ok(calls.includes('GET /api/cities?limit=3&page=2'), calls.join(' | '));
  assert.ok(!calls.some((x) => /page=3/.test(x)), 'list page must not read every page: ' + calls.join(' | '));
  calls.length = 0;
  d = await dt('cities', 'start=0&length=3&search[value]=lazio');
  assert.strictEqual(d.recordsFiltered, 2);
  assert.ok(calls.some((x) => x.includes('q=lazio')), calls.join(' | '));
  const nameCol = 1 + ['id', 'name', 'region'].indexOf('name'); // read-only: no check column
  d = await dt('cities', `start=0&length=3&order[0][column]=${nameCol}&order[0][dir]=desc`);
  assert.match(JSON.stringify(d.data[0]), /Torino/);
  assert.ok(calls.some((x) => x.includes('sort=name&order=desc')), calls.join(' | '));
  // Advanced search is not an API feature: all pages are read and filtered by the app.
  calls.length = 0;
  d = await dt('cities', 'start=0&length=10&s[region][op]=equals&s[region][v]=Piemonte');
  assert.strictEqual(d.recordsFiltered, 2);
  assert.ok(calls.includes('GET /api/cities?limit=3&page=3'), calls.join(' | '));

  // REST -> REST lookup (all pages, display template, search).
  let r = await c.req('?p=lookup&t=users&f=address.city&q=lomb');
  assert.deepStrictEqual(JSON.parse(r.text).map((o) => o.label), ['Bergamo (Lombardia)', 'Milano (Lombardia)']);
  // Lookup values resolved in the list and in the filter panel.
  d = await dt('users', 'start=0&length=10');
  assert.match(JSON.stringify(d.data), /Milano \(Lombardia\)/);
  r = await c.req('?p=list&t=users');
  assert.match(r.text, /Napoli \(Campania\)/);

  // SQL table -> REST lookup: options and labels in the list.
  if (SQLITE) {
    r = await c.req('?p=lookup&t=orders&f=user_id');
    assert.deepStrictEqual(JSON.parse(r.text).map((o) => o.label), ['Anna Neri', 'Mario Rossi']);
    d = await dt('orders', 'start=0&length=10');
    assert.match(JSON.stringify(d.data), /Mario Rossi/);
  } else t.diagnostic(`${PHP} senza pdo_sqlite: lookup SQL -> REST non provato`);

  // Unique check on the API records.
  r = await c.req('?p=add&t=users');
  r = await c.post('?p=add&t=users', { _csrf: c.csrf(r.text), name: 'Dup', email: 'mario@example.org', age: '50', 'address.city': 'Roma' });
  assert.notStrictEqual(r.status, 302);
  assert.ok(!users.some((u) => u.name === 'Dup'));

  // Report and chart on a REST datasource.
  r = await c.req('?p=report&r=bycity');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /Milano \(Lombardia\)/);
  r = await c.req('?p=chartdata&c=agebycity');
  const chart = JSON.parse(r.text);
  assert.deepStrictEqual(chart.labels, ['Milano (Lombardia)', 'Napoli (Campania)']);
  assert.deepStrictEqual(chart.datasets[0].data, [41, 30]);
});
