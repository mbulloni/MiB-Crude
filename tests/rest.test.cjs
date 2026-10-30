'use strict';
// REST datasource end to end: a mock JSON API (bearer auth), designer inference of fields,
// generated app on SQLite (users/permissions) listing, searching, sorting, editing and
// deleting records of the API through php -S.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const R = require('../core/rest.cjs');

const TOKEN = 'tok-123';
let users = [
  { id: 1, name: 'Mario Rossi', email: 'mario@example.org', age: 41, address: { city: 'Milano' } },
  { id: 2, name: 'Anna Bianchi', email: 'anna@example.org', age: 29, address: { city: 'Roma' } },
  { id: 3, name: 'Luca Verdi', email: 'luca@example.org', age: 35, address: { city: 'Torino' } },
];
const calls = [];
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls.push(`${req.method} ${req.url}`);
    const send = (code, json) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: 'unauthorized' });
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
  proj.menu.items.push({ type: 'table', table: 'users' });
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  assert.deepStrictEqual(G.lint(out), []);
  server = spawn(process.env.MIBCRUDE_PHP_BIN || 'php', ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
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
