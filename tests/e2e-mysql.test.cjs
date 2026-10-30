'use strict';
// End-to-end: build a project on the demo MariaDB database, generate the PHP app,
// serve it with `php -S` and drive it over HTTP (setup, login, CRUD, export, API).
// Needs: MariaDB with tests/fixtures/demo-mysql.sql loaded as mibcrude/mibcrude, php-cli with pdo_mysql.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const W = require('../core/wizard.cjs');
const G = require('../core/generator.cjs');

const CONN = { id: 'main', name: 'Demo', driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'mibcrude_demo', user: 'mibcrude' };
const PW = 'mibcrude';
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/index.php`;

function resetDb() {
  execFileSync('sh', ['-c', `mysql -h 127.0.0.1 -u mibcrude -pmibcrude mibcrude_demo < ${path.join(__dirname, 'fixtures', 'demo-mysql.sql')}`]);
}

// Tiny cookie-keeping HTTP client.
function client() {
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const req = async (url, opts = {}) => {
    const r = await fetch(url.startsWith('http') ? url : BASE + url, { redirect: 'manual', ...opts, headers: { cookie: cookie(), ...(opts.headers || {}) } });
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    const text = await r.text();
    return { status: r.status, location: r.headers.get('location'), text, headers: r.headers };
  };
  const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  const post = async (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return { req, post, csrf };
}

let dir;
let server;

test.before(async () => {
  resetDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-e2e-'));
  const proj = P.createProject(dir, 'shop');
  proj.connections.push(CONN);
  P.writeSecrets(dir, { connections: { main: PW } });
  await W.importTables(proj, CONN, PW, ['categories', 'products', 'countries', 'cities', 'customers', 'orders', 'order_items']);
  // Dependent dropdown city <- country.
  const cust = proj.tables.find((t) => t.name === 'customers');
  cust.fields.find((f) => f.name === 'city_id').editAs.lookup.dependsOn = { field: 'country_id', linkField: 'country_id' };
  // Status as a static list.
  const orders = proj.tables.find((t) => t.name === 'orders');
  orders.fields.find((f) => f.name === 'status').editAs = { type: 'select', lookup: { kind: 'list', values: [{ value: 'new', label: { it: 'Nuovo', en: 'New' } }, { value: 'shipped', label: { it: 'Spedito', en: 'Shipped' } }, { value: 'closed', label: { it: 'Chiuso', en: 'Closed' } }] } };
  orders.fields.find((f) => f.name === 'total').totals = 'sum';
  orders.api = { enabled: true, methods: ['list', 'view', 'add', 'edit', 'delete'] };
  orders.pages.list.filterPanel = true;
  orders.fields.find((f) => f.name === 'status').filter = true;
  // Event: uppercase category names; block deleting category 1.
  proj.events.categories = {
    BeforeAdd: "<?php\n$values['name'] = strtoupper($values['name']);\nreturn true;\n",
    BeforeDelete: "<?php\nif ((int)$old['id'] === 1) { $message = 'Categoria protetta'; return false; }\nreturn true;\n",
  };
  proj.security.enabled = true;
  proj.security.permissions = { users: { orders: 'SV', customers: 'SVAE' } };
  proj.project.settings.audit = true;
  proj.project.settings.api = { enabled: true };
  proj.reports.push({ name: 'sales', title: { it: 'Vendite', en: 'Sales' }, table: 'orders', groups: [{ field: 'status' }], aggregates: [{ field: 'total', fn: 'sum' }], columns: ['order_date', 'customer_id', 'total'], showDetails: true });
  proj.charts.push({ name: 'bystatus', title: { it: 'Per stato' }, table: 'orders', type: 'bar', labelField: 'status', series: [{ field: 'total', fn: 'sum' }] });
  proj.dashboards.push({ name: 'main', title: { it: 'Cruscotto' }, items: [{ type: 'count', table: 'orders', width: 4 }, { type: 'chart', ref: 'bystatus', width: 8 }, { type: 'report', ref: 'sales', width: 12 }] });
  P.saveProject(proj);
  const reloaded = P.loadProject(dir);
  const res = G.generate(reloaded, { debug: true });
  assert.deepStrictEqual(G.lint(res.outDir), []);
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', res.outDir], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '?p=ping'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); });

test('project round-trips through files deterministically', () => {
  const a = P.serialize(P.loadProject(dir));
  const b = P.serialize(P.loadProject(dir));
  assert.deepStrictEqual(a, b);
  assert.ok(a['tables/orders.json'].includes('"filterPanel": true'));
  assert.ok(a['events/categories/BeforeAdd.php'].startsWith('<?php'));
});

test('setup, login, CRUD, events, export, report, api', async () => {
  const c = client();
  let r = await c.req('?p=home');
  assert.strictEqual(r.status, 302);
  assert.match(r.location, /p=setup/);
  r = await c.req('?p=setup');
  r = await c.post('?p=setup', { _csrf: c.csrf(r.text), username: 'admin', email: 'a@b.it', password: 'Segreta123', password2: 'Segreta123' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 500));
  r = await c.req('?p=login');
  r = await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'wrong' });
  assert.match(r.text, /non validi|Invalid/);
  r = await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  assert.strictEqual(r.status, 302);

  r = await c.req('?p=list&t=orders');
  assert.strictEqual(r.status, 200, r.text.slice(0, 800));
  assert.match(r.text, /Mario Rossi/); // lookup display
  assert.match(r.text, /Spedito/); // static list label
  assert.match(r.text, /139,39/); // sum total 24.50+59.90+35+19.99

  r = await c.req('?p=list&t=orders&q=Anna');
  assert.match(r.text, /1 record/);
  r = await c.req('?p=list&t=orders&f[status][]=new');
  assert.match(r.text, /2 record/);

  // Add a category: BeforeAdd uppercases.
  r = await c.req('?p=add&t=categories');
  r = await c.post('?p=add&t=categories', { _csrf: c.csrf(r.text), name: 'giardino', description: 'x', _next: 'list' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 800));
  r = await c.req('?p=list&t=categories');
  assert.match(r.text, /GIARDINO/);
  // Required field validation.
  r = await c.req('?p=add&t=categories');
  r = await c.post('?p=add&t=categories', { _csrf: c.csrf(r.text), name: '', _next: 'list' });
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /obbligatorio|required/);
  // Protected delete via event.
  r = await c.req('?p=list&t=categories');
  r = await c.post('?p=delete&t=categories', { _csrf: c.csrf(r.text), 'k[id]': '1' });
  r = await c.req('?p=list&t=categories');
  assert.match(r.text, /Categoria protetta/);

  // Edit a product.
  r = await c.req('?p=edit&t=products&k[id]=4');
  assert.match(r.text, /Mouse/);
  r = await c.post('?p=edit&t=products&k[id]=4', { _csrf: c.csrf(r.text), category_id: '2', name: 'Mouse wireless', price: '24,90', in_stock: '1', _next: 'view' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 800));
  r = await c.req('?p=view&t=products&k[id]=4');
  assert.match(r.text, /Mouse wireless/);
  assert.match(r.text, /24,90/);

  // Master-detail: order lines inside the order view.
  r = await c.req('?p=view&t=orders&k[id]=1');
  assert.match(r.text, /mt=orders/);
  r = await c.req('?p=list&t=order_items&mt=orders&mk[id]=1&embed=1');
  assert.match(r.text, /2 record/);

  // Dependent lookup.
  r = await c.req('?p=lookup&t=customers&f=city_id&parent=2');
  assert.deepStrictEqual(JSON.parse(r.text).map((o) => o.label).sort(), ['Lione', 'Parigi']);

  // Export.
  r = await c.req('?p=export&t=orders&fmt=csv');
  assert.match(r.text, /Mario Rossi/);
  r = await c.req('?p=export&t=orders&fmt=xlsx');
  assert.strictEqual(r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // Report, chart data, dashboard.
  r = await c.req('?p=report&r=sales');
  assert.match(r.text, /Totale generale/);
  r = await c.req('?p=chartdata&c=bystatus');
  const chart = JSON.parse(r.text);
  assert.strictEqual(chart.labels.length, 3);
  r = await c.req('?p=dashboard&d=main');
  assert.strictEqual(r.status, 200);

  // Audit trail recorded the edit.
  r = await c.req('?p=admin&s=audit');
  assert.match(r.text, /Mouse wireless/);

  // API with session + CSRF, then with API key.
  r = await c.req('?p=api&t=orders&ps=2');
  const list = JSON.parse(r.text);
  assert.strictEqual(list.total, 4);
  assert.strictEqual(list.data.length, 2);
  r = await c.req('?p=profile');
  r = await c.post('?p=profile', { _csrf: c.csrf(r.text), apikey: '1' });
  r = await c.req('?p=profile');
  const key = (r.text.match(/: ([a-f0-9]{40})/) || [])[1];
  assert.ok(key, 'api key shown once');
  const api = client();
  r = await api.req('?p=api&t=orders', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: 2, order_date: '2026-10-30', status: 'new', total: 10 }) });
  assert.strictEqual(r.status, 201, r.text);
  const newId = JSON.parse(r.text).data.keys.id;
  r = await api.req(`?p=api&t=orders&k[id]=${newId}`, { headers: { 'x-api-key': key } });
  assert.strictEqual(JSON.parse(r.text).data.customer_id__display, 'Anna Bianchi');
  r = await api.req('?p=api&t=orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 401);
  r = await api.req('?p=api&openapi=1');
  assert.strictEqual(JSON.parse(r.text).openapi, '3.0.3');
});

test('permissions for a non-admin group', async () => {
  const admin = client();
  let r = await admin.req('?p=login');
  await admin.post('?p=login', { _csrf: admin.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await admin.req('?p=admin&s=users&id=new');
  r = await admin.post('?p=admin&s=users', { _csrf: admin.csrf(r.text), action: 'save', id: '0', username: 'luca', email: 'l@x.it', fullname: 'Luca', password: 'Password1', active: '1', 'groups[]': 'users' });
  assert.strictEqual(r.status, 302);
  const u = client();
  r = await u.req('?p=login');
  r = await u.post('?p=login', { _csrf: u.csrf(r.text), username: 'luca', password: 'Password1' });
  assert.strictEqual(r.status, 302);
  r = await u.req('?p=list&t=orders');
  assert.strictEqual(r.status, 200);
  assert.doesNotMatch(r.text, /p=edit&amp;t=orders/);
  r = await u.req('?p=edit&t=orders&k[id]=1');
  assert.strictEqual(r.status, 403);
  r = await u.req('?p=list&t=products');
  assert.strictEqual(r.status, 403);
  r = await u.req('?p=admin');
  assert.strictEqual(r.status, 403);
});
