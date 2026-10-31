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

// MIBCRUDE_TEST_DB selects the database (Docker containers for pgsql/sqlsrv/oracle, see docs/TESTING.md).
const DBS = {
  mysql: [{ driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  pgsql: [{ driver: 'pgsql', host: '127.0.0.1', port: 15432, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  sqlsrv: [{ driver: 'sqlsrv', host: '127.0.0.1', port: 11433, database: 'mibcrude_demo', user: 'sa' }, 'MiBcrude!2026'],
  oracle: [{ driver: 'oracle', host: '127.0.0.1', port: 11521, database: 'FREEPDB1', user: 'mibcrude' }, 'mibcrude'],
  sqlite: [{ driver: 'sqlite', file: path.join(os.tmpdir(), `mibcrude-e2e-${process.pid}.sqlite`) }, ''],
};
const DBKIND = process.env.MIBCRUDE_TEST_DB || 'mysql';
const CONN = { id: 'main', name: 'Demo', ...DBS[DBKIND][0] };
const PW = DBS[DBKIND][1];
const S = require('./fixtures/demo-schema.cjs');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
// MIBCRUDE_TEST_PHP=8.4 runs the generated app on PHP 8.4 in Docker (image tests/docker).
const PHP8 = process.env.MIBCRUDE_TEST_PHP === '8.4';
// Drivers missing in the local PHP run in Docker images that have them.
const IMAGE = { sqlsrv: 'mibcrude-php:8.3', oracle: 'mibcrude-php-oci:8.3' }[DBKIND];
function phpServer(outDir) {
  if (IMAGE) return spawn('docker', ['run', '--rm', '--network', 'host', '--name', `mibcrude-e2e-${PORT}`, '-v', `${outDir}:${outDir}`, '-v', `${os.tmpdir()}:${os.tmpdir()}`, IMAGE, 'php', '-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', outDir], { stdio: 'ignore' });
  if (!PHP8) return spawn(process.env.MIBCRUDE_PHP_BIN || 'php', ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', outDir], { stdio: 'ignore' });
  return spawn('docker', ['run', '--rm', '--network', 'host', '--name', `mibcrude-e2e-${PORT}`, '-v', `${outDir}:${outDir}`, 'mibcrude-php-test:8.4', 'php', '-S', `127.0.0.1:${PORT}`, '-t', outDir], { stdio: 'ignore' });
}

function resetDb() {
  return S.reset(CONN, PW);
}
async function dbExec(sql) {
  const c = await require('../core/db.cjs').connect(CONN, PW);
  try { await c.query(sql.replace(/\b(orders|status|id)\b/g, (m) => require('../core/ddl.cjs').quote(CONN.driver, m))); } finally { await c.close(); }
}

// Tiny cookie-keeping HTTP client.
function client() {
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const req = async (url, opts = {}) => {
    const r = await fetch(url.startsWith('http') ? url : BASE + url, { redirect: 'manual', ...opts, headers: { cookie: cookie(), ...(opts.headers || {}) } });
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    const text = await r.text();
    // Any PHP notice/warning/deprecation printed into a page is a failure (PHP 8 strictness).
    const leak = text.match(/(Deprecated|Warning|Notice|Fatal error)<\/b>?:[^\n]{0,240}|(Deprecated|Warning|Notice|Fatal error): [^\n]{0,240}/);
    assert.ok(!leak, `PHP message in ${url}: ${leak && leak[0]}`);
    return { status: r.status, location: r.headers.get('location'), text, headers: r.headers };
  };
  const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  const post = async (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return { req, post, csrf };
}

let dir;
let server;

test.before(async () => {
  await resetDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-e2e-'));
  const proj = P.createProject(dir, 'shop');
  proj.connections.push(CONN);
  P.writeSecrets(dir, { connections: { main: PW } });
  await W.importTables(proj, CONN, PW, ['categories', 'products', 'countries', 'cities', 'customers', 'orders', 'order_items']);
  // Dependent dropdown city <- country.
  const cust = proj.tables.find((t) => t.name === 'customers');
  cust.layout = { edit: { sections: [
    { title: { it: 'Anagrafica' }, style: 'tab', fields: ['email', 'name'], blocks: [{ type: 'html', html: { it: '<p class="mc-test-block">Compila i dati</p>' } }] },
    { title: { it: 'Indirizzo' }, style: 'tab', columns: 2, fields: ['country_id', 'city_id'] },
  ] } };
  cust.fields.find((f) => f.name === 'city_id').editAs.lookup.dependsOn = { field: 'country_id', linkField: 'country_id' };
  // Status as a static list.
  const orders = proj.tables.find((t) => t.name === 'orders');
  orders.fields.find((f) => f.name === 'status').editAs = { type: 'select', lookup: { kind: 'list', values: [{ value: 'new', label: { it: 'Nuovo', en: 'New' } }, { value: 'shipped', label: { it: 'Spedito', en: 'Shipped' } }, { value: 'closed', label: { it: 'Chiuso', en: 'Closed' } }] } };
  orders.fields.find((f) => f.name === 'total').totals = 'sum';
  orders.api = { enabled: true, methods: ['list', 'view', 'add', 'edit', 'delete'] };
  orders.pages.list.filterPanel = true;
  orders.pages.list.inlineEdit = true;
  orders.pages.list.views = [{ type: 'kanban', statusField: 'status', titleField: 'customer_id' }, { type: 'calendar', dateField: 'order_date', titleField: 'customer_id' }];
  orders.fields.find((f) => f.name === 'status').filter = true;
  // Event: uppercase category names; block deleting category 1.
  proj.events.categories = {
    BeforeAdd: "<?php\n$values['name'] = strtoupper($values['name']);\nreturn true;\n",
    BeforeDelete: "<?php\nif ((int)$old['id'] === 1) { $message = 'Categoria protetta'; return false; }\nreturn true;\n",
    AfterAdd: "<?php\naddNotification('Nuova categoria ' . $values['name'], 'Categorie', 'tag', 'index.php?p=list&t=categories');\n",
  };
  proj.security.enabled = true;
  proj.security.twoFactor = { enabled: true, required: false };
  proj.security.permissions = { users: { orders: 'SV', customers: 'SVAE' } };
  proj.project.settings.audit = true;
  // project header (code, standard one hidden), footer (file of public/) and menu (code after the generated one)
  proj.project.settings.regions = {
    header: { source: 'code', code: '<div class="mc-test-header">Testata <?= h(userName()) ?></div>', hideStandard: true },
    footer: { source: 'file', file: 'inc/footer.php' },
    menu: { source: 'code', position: 'after', code: '<li class="nav-item mc-test-menu"><a class="nav-link" href="#">Voce extra</a></li>' },
  };
  fs.mkdirSync(path.join(dir, 'public', 'inc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public', 'inc', 'footer.php'), '<div class="mc-test-footer">Piede <?= date("Y") ?></div>');
  // scheduled task, run from the administration
  proj.project.settings.tasks = [{ name: 'conta_ordini', title: { it: 'Conta ordini' }, cron: '0 3 * * *', enabled: true }];
  proj.events._global = { ...(proj.events._global || {}), Task_conta_ordini: "<?php\n$message = 'ordini: ' . db()->value('SELECT COUNT(*) FROM ' . db()->table('orders'));\n" };
  proj.project.settings.api = { enabled: true };
  proj.project.settings.webBuilder = { enabled: true };
  proj.reports.push({ name: 'sales', title: { it: 'Vendite', en: 'Sales' }, table: 'orders', groups: [{ field: 'status' }], aggregates: [{ field: 'total', fn: 'sum' }], columns: ['order_date', 'customer_id', 'total'], showDetails: true });
  proj.charts.push({ name: 'bystatus', title: { it: 'Per stato' }, table: 'orders', type: 'bar', labelField: 'status', series: [{ field: 'total', fn: 'sum' }] });
  proj.charts.push({ name: 'bymonth', title: { it: 'Per mese' }, table: 'orders', type: 'line', labelField: 'order_date', labelInterval: 'month', series: [{ field: 'total', fn: 'sum' }] });
  proj.dashboards.push({ name: 'main', title: { it: 'Cruscotto' }, items: [{ type: 'count', table: 'orders', width: 4 }, { type: 'chart', ref: 'bystatus', width: 8 }, { type: 'report', ref: 'sales', width: 12 }] });
  P.saveProject(proj);
  const reloaded = P.loadProject(dir);
  const res = G.generate(reloaded, { debug: true });
  assert.deepStrictEqual(G.lint(res.outDir), []);
  server = phpServer(res.outDir);
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '?p=ping'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => {
  if (server) server.kill();
  if (PHP8 || IMAGE) try { execFileSync('docker', ['rm', '-f', `mibcrude-e2e-${PORT}`], { stdio: 'ignore' }); } catch { /* gone */ }
});

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
  assert.match(r.text, /id="mcGrid"/); // DataTables shell
  const dt = async (qs) => { const x = await c.req(`?p=dt&draw=1&start=0&length=20&${qs}`); assert.strictEqual(x.status, 200, x.text.slice(0, 500)); return JSON.parse(x.text); };
  let d = await dt('t=orders');
  const cells = JSON.stringify(d.data);
  assert.strictEqual(d.recordsTotal, 4);
  assert.match(cells, /Mario Rossi/); // lookup display
  assert.match(cells, /Spedito/); // static list label
  assert.match(d.totals.total, /139,39/); // sum 24.50+59.90+35+19.99
  d = await dt('t=orders&search[value]=Anna');
  assert.strictEqual(d.recordsFiltered, 1);
  d = await dt('t=orders&f[status][]=new');
  assert.strictEqual(d.recordsFiltered, 2);
  d = await dt('t=orders&order[0][column]=6&order[0][dir]=desc&length=1'); // column 6 = total (check, actions, id, customer, date, status, total)
  assert.match(JSON.stringify(d.data), /59,90/);

  // Add a category: BeforeAdd uppercases.
  r = await c.req('?p=add&t=categories');
  r = await c.post('?p=add&t=categories', { _csrf: c.csrf(r.text), name: 'giardino', description: 'x', _next: 'list' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 800));
  assert.match(JSON.stringify((await dt('t=categories')).data), /GIARDINO/);
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
  d = await dt('t=order_items&mt=orders&mk[id]=1&embed=1');
  assert.strictEqual(d.recordsTotal, 2);

  // Inline edit of one cell (JSON + CSRF header) and data of the kanban/calendar views.
  r = await c.req('?p=list&t=orders&v=kanban');
  assert.match(r.text, /id="mcView"/);
  const token = (r.text.match(/name="csrf-token" content="([a-f0-9]+)"/) || [])[1];
  r = await c.req('?p=inline&t=orders', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ k: { id: 3 }, f: 'status', v: 'closed' }) });
  assert.strictEqual(r.status, 200, r.text);
  assert.match(JSON.parse(r.text).html, /Chiuso/);
  r = await c.req('?p=inline&t=orders', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ k: { id: 3 }, f: 'order_date', v: '' }) });
  assert.strictEqual(r.status, 422);
  r = await c.req('?p=feed&t=orders');
  const feed = JSON.parse(r.text);
  assert.strictEqual(feed.rows.length, 4);
  assert.strictEqual(feed.rows.find((x) => String(x.k.id) === '3').v.status, 'closed');
  assert.strictEqual(feed.options.status.length, 3);
  await dbExec(`UPDATE orders SET status = 'new' WHERE id = 3`);

  // Page designer layout: tabs, field order, HTML block.
  r = await c.req('?p=edit&t=customers&k[id]=1');
  assert.match(r.text, /data-bs-toggle="tab"[^>]*>Anagrafica/);
  assert.match(r.text, /mc-test-block/);
  assert.ok(r.text.indexOf('name="email"') < r.text.indexOf('name="name"'), 'designed field order');

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

  // Web report builder: a user-built report and chart.
  r = await c.req('?p=builder&id=new&kind=report&t=orders');
  r = await c.post('?p=builder', { _csrf: c.csrf(r.text), id: '0', kind: 'report', title: 'Per stato (utente)', table: 'orders', 'g[0][field]': 'status', 'g[0][interval]': '', 'a[0][fn]': 'sum', 'a[0][field]': 'total', 'columns[]': 'order_date', showDetails: '1' });
  assert.strictEqual(r.status, 302, r.text.slice(0, 300));
  r = await c.req(r.location.replace(/^.*index\.php/, ''));
  assert.match(r.text, /Totale generale|Grand total/);
  assert.match(r.text, /139,39/);
  r = await c.req('?p=builder&id=new&kind=chart&t=orders');
  r = await c.post('?p=builder', { _csrf: c.csrf(r.text), id: '0', kind: 'chart', title: 'Grafico utente', table: 'orders', type: 'pie', labelField: 'status', labelInterval: '', 's[0][fn]': 'count', 's[0][field]': 'id' });
  const cid = (r.location.match(/c=u%3A(\d+)/) || [])[1];
  r = await c.req(`?p=chartdata&c=u:${cid}`);
  assert.strictEqual(JSON.parse(r.text).type, 'pie');

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

// RFC 6238 code for the tests.
function totp(secret, t = Date.now() / 1000) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret) bits += A.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(t / 30), 4);
  const h = require('node:crypto').createHmac('sha1', key).update(msg).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}

test('two-step verification', async () => {
  const c = client();
  let r = await c.req('?p=login');
  await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await c.req('?p=profile');
  assert.match(r.text, /twofactor/);
  r = await c.post('?p=profile', { _csrf: c.csrf(r.text), totp_start: '1' });
  r = await c.req('?p=profile');
  const secret = (r.text.match(/secret=([A-Z2-7]+)/) || [])[1];
  assert.ok(secret, 'secret shown as QR');
  r = await c.post('?p=profile', { _csrf: c.csrf(r.text), totp_confirm: '1', code: totp(secret) });
  r = await c.req('?p=profile');
  assert.match(r.text, /Attiva sul tuo account|Active on your account/);
  const d = client();
  r = await d.req('?p=login');
  r = await d.post('?p=login', { _csrf: d.csrf(r.text), username: 'admin', password: 'Segreta123' });
  assert.match(r.location, /p=twofactor/);
  r = await d.req('?p=list&t=orders');
  assert.strictEqual(r.status, 302, 'not logged in before the code');
  r = await d.req('?p=twofactor');
  r = await d.post('?p=twofactor', { _csrf: d.csrf(r.text), code: '000000' === totp(secret) ? '111111' : '000000' });
  assert.match(r.text, /Codice non valido|Invalid code/);
  r = await d.post('?p=twofactor', { _csrf: d.csrf(r.text), code: totp(secret) });
  assert.strictEqual(r.status, 302);
  r = await d.req('?p=list&t=orders');
  assert.strictEqual(r.status, 200);
  // admin resets it again for the other tests
  r = await d.req('?p=admin&s=users');
  const id = (r.text.match(/name="action" value="reset2fa"><input type="hidden" name="id" value="(\d+)"/) || [])[1];
  await d.post('?p=admin&s=users', { _csrf: d.csrf(r.text), action: 'reset2fa', id });
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
  r = await u.req('?p=dt&t=orders&draw=1&start=0&length=10');
  assert.match(r.text, /p=view/);
  assert.doesNotMatch(r.text, /p=edit/);
  r = await u.req('?p=edit&t=orders&k[id]=1');
  assert.strictEqual(r.status, 403);
  r = await u.req('?p=list&t=products');
  assert.strictEqual(r.status, 403);
  r = await u.req('?p=admin');
  assert.strictEqual(r.status, 403);
});

test('update selected: the same values on the chosen records only', async () => {
  const c = client();
  let r = await c.req('?p=login');
  await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await c.req('?p=list&t=orders');
  assert.match(r.text, /mc-update-selected/);
  const csrf = c.csrf(r.text);
  const q = (sql) => sql.replace(/\b(orders|status|id)\b/g, (m) => require('../core/ddl.cjs').quote(CONN.driver, m));
  // a new connection for each read: the SQLite driver of the tests (sql.js) works on an in-memory copy
  const read = async () => {
    const db = await require('../core/db.cjs').connect(CONN, PW);
    try {
      return Object.fromEntries((await db.query(q('SELECT id, status FROM orders ORDER BY id'))).map((x) => {
        const o = Object.fromEntries(Object.entries(x).map(([k, v]) => [k.toLowerCase(), v]));
        return [String(o.id), String(o.status)];
      }));
    } finally { await db.close(); }
  };
  {
    const before = await read();
    const ids = Object.keys(before).slice(0, 3);
    const sel = ids.slice(0, 2).map((id) => ['sel[]', JSON.stringify({ id: Number(id) })]);
    // first step: the form with the fields
    r = await c.post('?p=updatesel&t=orders', [['_csrf', csrf], ...sel]);
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /name="_fields\[\]" value="status"/);
    assert.doesNotMatch(r.text, /name="_fields\[\]" value="id"/, 'keys are not offered');
    // no field ticked: nothing changes, the form says why
    r = await c.post('?p=updatesel&t=orders', [['_csrf', csrf], ...sel, ['_apply', '1'], ['status', 'closed']]);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await read(), before);
    r = await c.post('?p=updatesel&t=orders', [['_csrf', csrf], ...sel, ['_apply', '1'], ['_fields[]', 'status'], ['status', 'closed'], ['_back', 'index.php?p=list&t=orders']]);
    assert.strictEqual(r.status, 302, r.text.slice(0, 500));
    const after = await read();
    assert.deepStrictEqual([after[ids[0]], after[ids[1]], after[ids[2]]], ['closed', 'closed', before[ids[2]]]);
    r = await c.req('?p=list&t=orders');
    assert.match(r.text, /2 record modificati|2 records updated/);
    r = await c.req('?p=admin&s=audit');
    assert.match(r.text, /closed/);
  }
  // a non-admin group without edit permission does not get the button
  const u = client();
  r = await u.req('?p=login');
  await u.post('?p=login', { _csrf: u.csrf(r.text), username: 'luca', password: 'Password1' });
  r = await u.req('?p=list&t=orders');
  assert.doesNotMatch(r.text, /mc-update-selected/);
  r = await u.post('?p=updatesel&t=orders', [['_csrf', u.csrf(r.text)], ['sel[]', '{"id":1}']]);
  assert.strictEqual(r.status, 404);
});

test('notifications: from events and from the admin page, per user and for everybody', async () => {
  const admin = client();
  let r = await admin.req('?p=login');
  await admin.post('?p=login', { _csrf: admin.csrf(r.text), username: 'admin', password: 'Segreta123' });
  const json = async (cl, method = 'GET', csrf = '') => {
    const x = await cl.req('?p=notifications', { method, headers: { Accept: 'application/json', 'X-CSRF-Token': csrf } });
    assert.strictEqual(x.status, 200, x.text.slice(0, 300));
    return JSON.parse(x.text);
  };
  r = await admin.req('?p=list&t=orders');
  assert.match(r.text, /mc-notif/);
  // the AfterAdd event of categories (earlier test) sent one to everybody
  let n = await json(admin);
  assert.ok(n.items.some((i) => /Nuova categoria/.test(i.message) && i.icon === 'tag'), JSON.stringify(n));
  const csrfA = admin.csrf(r.text);
  // the admin page sends one to luca only and one to everybody
  r = await admin.req('?p=admin&s=notifications');
  assert.strictEqual(r.status, 200);
  await admin.post('?p=admin&s=notifications', { _csrf: csrfA, user: 'luca', title: 'Solo Luca', message: 'per te', icon: '', url: '' });
  await admin.post('?p=admin&s=notifications', { _csrf: csrfA, user: '', title: 'Tutti', message: 'manutenzione alle 18', icon: 'tools', url: '' });
  n = await json(admin);
  assert.ok(!n.items.some((i) => i.title === 'Solo Luca'));
  assert.ok(n.items.some((i) => i.title === 'Tutti'));
  const u = client();
  r = await u.req('?p=login');
  await u.post('?p=login', { _csrf: u.csrf(r.text), username: 'luca', password: 'Password1' });
  r = await u.req('?p=list&t=orders');
  n = await json(u);
  assert.ok(n.items.some((i) => i.title === 'Solo Luca') && n.items.some((i) => i.title === 'Tutti'));
  assert.ok(n.unread >= 2);
  // opening the bell marks them seen, for luca only
  n = await json(u, 'POST', u.csrf(r.text));
  assert.strictEqual(n.unread, 0);
  assert.strictEqual((await json(u)).unread, 0);
  assert.ok((await json(admin)).unread > 0);
  // without the token the POST is refused
  const bad = await u.req('?p=notifications', { method: 'POST', headers: { Accept: 'application/json' } });
  assert.strictEqual(bad.status, 400);
});

test('chart drill-down: each bar links to the list filtered on it', async () => {
  const c = client();
  let r = await c.req('?p=login');
  await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await c.req('?p=chartdata&c=bystatus');
  const chart = JSON.parse(r.text);
  assert.strictEqual(chart.links.length, chart.labels.length);
  for (const link of chart.links) {
    const status = new URLSearchParams(link.split('?')[1]).get('f[status][0]');
    assert.ok(status, link);
    // the same filter through the grid endpoint: only that status
    const qs = link.split('?')[1].replace(/^p=list&/, '');
    const d = JSON.parse((await c.req(`?p=dt&draw=1&start=0&length=100&${qs}`)).text);
    assert.ok(d.recordsFiltered > 0, link);
    const db = await require('../core/db.cjs').connect(CONN, PW);
    try {
      const q = (sql) => sql.replace(/\b(orders|status)\b/g, (m) => require('../core/ddl.cjs').quote(CONN.driver, m));
      const n = Object.values((await db.query(q(`SELECT COUNT(*) AS n FROM orders WHERE status = '${status}'`)))[0])[0];
      assert.strictEqual(Number(d.recordsFiltered), Number(n), status);
    } finally { await db.close(); }
  }
  // date buckets: a month becomes a between filter on that month
  const m = JSON.parse((await c.req('?p=chartdata&c=bymonth')).text);
  const p = new URLSearchParams(m.links[0].split('?')[1]);
  assert.strictEqual(p.get('s[order_date][op]'), 'between');
  assert.match(p.get('s[order_date][v]'), /^\d{4}-\d{2}-01$/);
  assert.match(p.get('s[order_date][v2]'), /^\d{4}-\d{2}-(28|29|30|31)$/);
});

test('PDF: list export and a single record', async () => {
  const c = client();
  let r = await c.req('?p=login');
  await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await c.req('?p=list&t=orders');
  assert.match(r.text, /fmt=pdf/);
  const pdf = await c.req('?p=export&t=orders&fmt=pdf');
  assert.strictEqual(pdf.status, 200);
  assert.match(pdf.text, /^%PDF-1\.4/);
  assert.match(pdf.text, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count [1-9]/);
  assert.match(pdf.text, /startxref\n\d+\n%%EOF\n$/);
  // DejaVu Sans embedded (subset, Unicode)
  assert.match(pdf.text, /\/Subtype \/CIDFontType2 \/BaseFont \/[A-Z]{6}\+DejaVuSans/);
  assert.match(pdf.text, /\/ToUnicode \d+ 0 R/);
  r = await c.req('?p=view&t=orders&k[id]=1');
  assert.match(r.text, /p=pdf&amp;t=orders/);
  const one = await c.req('?p=pdf&t=orders&k[id]=1');
  assert.strictEqual(one.status, 200);
  assert.match(one.text, /^%PDF-1\.4/);
  // a table without the PDF format has no button and no page
  r = await c.req('?p=pdf&t=no_such_table&k[id]=1');
  assert.notStrictEqual(r.status, 200);
});

test('project header, footer and menu (code and file)', async () => {
  const c = client();
  let r = await c.req('?p=login');
  await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await c.req('?p=list&t=orders');
  assert.match(r.text, /<div class="mc-test-header">Testata admin<\/div>/);
  assert.match(r.text, /mc-hide-header/);
  assert.match(r.text, new RegExp(`mc-test-footer">Piede ${new Date().getFullYear()}`));
  // the generated menu is kept, the project's item comes after it
  const menu = r.text.indexOf('mc-test-menu');
  assert.ok(menu > 0 && r.text.indexOf('t=orders') < menu);
  // the code is not reachable directly
  const direct = await fetch(BASE.replace('index.php', 'custom/regions/header.php'));
  assert.strictEqual(direct.status, 404);
});

test('saved searches: per user, shared by an administrator, applied from the list menu', async () => {
  const a = client();
  let r = await a.req('?p=login');
  await a.post('?p=login', { _csrf: a.csrf(r.text), username: 'admin', password: 'Segreta123' });
  // system tables survive between runs: start from no saved searches
  await dbExec(`DELETE FROM ${require('../core/ddl.cjs').quote(CONN.driver, 'mc_searches')}`);
  r = await a.req('?p=list&t=orders&s[status][op]=equals&s[status][v]=shipped');
  assert.match(r.text, /mc-saved-searches/);
  const csrf = a.csrf(r.text);
  const query = JSON.stringify({ s: { status: { op: 'equals', v: 'shipped' } }, q: 'x', bogus: 1 });
  r = await a.post('?p=savedsearch&t=orders', { _csrf: csrf, title: 'Spediti', query, shared: '1', _back: 'index.php?p=list&t=orders' });
  assert.strictEqual(r.status, 302);
  await a.post('?p=savedsearch&t=orders', { _csrf: csrf, title: 'Solo mia', query: JSON.stringify({ f: { status: ['new'] } }), _back: 'index.php?p=list&t=orders' });
  r = await a.req('?p=list&t=orders');
  assert.match(r.text, /Spediti/);
  assert.match(r.text, /Solo mia/);
  // the link brings back the search; unknown keys are dropped
  const href = (r.text.match(/href="([^"]*)"><i class="bi bi-people me-1"><\/i>Spediti/) || [])[1].replace(/&amp;/g, '&');
  assert.match(decodeURIComponent(href), /s\[status\]\[op\]=equals&s\[status\]\[v\]=shipped/);
  assert.match(href, /q=x/);
  assert.doesNotMatch(href, /bogus/);
  // another user sees the shared search only and cannot share
  const u = client();
  r = await u.req('?p=login');
  await u.post('?p=login', { _csrf: u.csrf(r.text), username: 'luca', password: 'Password1' });
  r = await u.req('?p=list&t=orders');
  assert.match(r.text, /Spediti/);
  assert.doesNotMatch(r.text, /Solo mia/);
  assert.doesNotMatch(r.text, /mcSearchShared/);
  await u.post('?p=savedsearch&t=orders', { _csrf: u.csrf(r.text), title: 'Di Luca', query: '{}', shared: '1', _back: 'index.php?p=list&t=orders' });
  // he cannot delete the administrator's shared search
  const sharedId = (r.text.match(/name="id" value="(\d+)"/) || [])[1];
  assert.strictEqual(sharedId, undefined, 'no delete button on a shared search of somebody else');
  r = await a.req('?p=list&t=orders');
  assert.doesNotMatch(r.text, /Di Luca/, 'private to luca, not shared');
  // the administrator deletes "Solo mia"
  const id = [...r.text.matchAll(/name="id" value="(\d+)"[\s\S]*?<\/form>/g)].map((m) => m[1]);
  assert.strictEqual(id.length, 2);
  const mine = r.text.match(/Solo mia<\/a>\s*<form[^>]*>[\s\S]*?name="id" value="(\d+)"/)[1];
  await a.post('?p=savedsearch&t=orders', { _csrf: a.csrf(r.text), action: 'delete', id: mine, _back: 'index.php?p=list&t=orders' });
  r = await a.req('?p=list&t=orders');
  assert.doesNotMatch(r.text, /Solo mia/);
  assert.match(r.text, /Spediti/);
});

test('scheduled tasks: administration page and "Run now"', async () => {
  const a = client();
  let r = await a.req('?p=login');
  await a.post('?p=login', { _csrf: a.csrf(r.text), username: 'admin', password: 'Segreta123' });
  r = await a.req('?p=admin&s=tasks');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /Conta ordini/);
  assert.match(r.text, /0 3 \* \* \*/);
  assert.match(r.text, /cron\.php/);
  r = await a.post('?p=admin&s=tasks', { _csrf: a.csrf(r.text), run: 'conta_ordini' });
  assert.strictEqual(r.status, 302);
  r = await a.req('?p=admin&s=tasks');
  assert.match(r.text, /ordini: \d+/);
  assert.match(r.text, /text-bg-success/);
  // not for other users
  const u = client();
  r = await u.req('?p=login');
  await u.post('?p=login', { _csrf: u.csrf(r.text), username: 'luca', password: 'Password1' });
  assert.strictEqual((await u.req('?p=admin&s=tasks')).status, 403);
});
