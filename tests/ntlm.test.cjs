'use strict';
// Windows (NTLM) sign-in as in the R-LAB projects: account from the web server (here a trusted proxy header,
// since php -S cannot set REMOTE_USER), groups and area from rlab_profilazione_gruppo, page rights R:W:L from
// rlab_profilazione_permission, one row per page in rlab_accessi, management pages in the admin area.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const { datasourceFromSchema } = require('../core/defaults.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
const PORT = 19900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
let server;
let dir;
let dbFile;

function client(account) {
  const jar = {};
  const req = async (url, opts = {}) => {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(account ? { 'X-Remote-User': account } : {}), ...(opts.headers || {}) };
    const r = await fetch(BASE + url, { redirect: 'manual', ...opts, headers });
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

function sql(statements) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbFile);
  try { return statements.map((s) => (/^\s*select/i.test(s) ? db.prepare(s).all() : db.exec(s))); } finally { db.close(); }
}

test.before(async () => {
  if (!SQLITE) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-ntlm-'));
  dbFile = path.join(dir, 'app.sqlite');
  sql([
    'CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, total REAL)',
    "INSERT INTO orders VALUES (1, 'Rossi', 10), (2, 'Bianchi', 20)",
    'CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT)',
    "INSERT INTO customers VALUES (1, 'Rossi')",
    // R-LAB tables, same names and columns
    'CREATE TABLE rlab_profilazione_gruppo (username VARCHAR(255), gruppo VARCHAR(255) NOT NULL, AREA VARCHAR(255) NOT NULL)',
    "INSERT INTO rlab_profilazione_gruppo VALUES ('ADMIN1@posteitaliane.it', 'AMMINISTRATORE', 'ITALIA'), ('VEND1@posteitaliane.it', 'VENDITORE', 'NORD OVEST')",
    'CREATE TABLE rlab_profilazione_permission (Gruppo VARCHAR(14), Pagina VARCHAR(255), Permessi VARCHAR(25))',
    "INSERT INTO rlab_profilazione_permission VALUES ('VENDITORE', 'orders', 'R::L'), ('VENDITORE', 'index.php', 'R:W:L')",
    'CREATE TABLE rlab_venditori (Username VARCHAR(255), Nome VARCHAR(50), Cognome VARCHAR(50))',
    "INSERT INTO rlab_venditori VALUES ('VEND1@posteitaliane.it', 'Mario', 'Venditore')",
    'CREATE TABLE rlab_accessi (data TEXT, ip TEXT, userid TEXT, username TEXT, gruppo TEXT, pagina TEXT, url TEXT, browser TEXT, versione TEXT)',
  ]);
  const proj = P.createProject(dir, 'ntlmapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: dbFile });
  P.writeSecrets(dir, { connections: { main: '' } });
  const col = (name, type, pk) => ({ name, type, dbType: type === 'int' ? 'INTEGER' : 'TEXT', nullable: !pk, pk: !!pk, autoInc: !!pk });
  for (const [name, cols] of [['orders', [col('id', 'int', true), col('customer', 'varchar'), col('total', 'decimal')]], ['customers', [col('id', 'int', true), col('name', 'varchar')]]]) {
    proj.tables.push(datasourceFromSchema({ name, columns: cols, pk: ['id'], fks: [] }, { connection: 'main', languages: proj.project.languages, settings: proj.project.settings }));
    proj.menu.items.push({ type: 'table', table: name });
  }
  proj.security.enabled = true;
  proj.security.mode = 'ntlm';
  proj.security.ntlm = { trustedHeader: 'X-Remote-User', suffix: '@posteitaliane.it', accessLog: true, accessTable: 'rlab_accessi', adminGroups: ['AMMINISTRATORE'] };
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  assert.deepStrictEqual(G.lint(out), []);
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('NTLM: sign-in from the web server, R:W:L rights, unknown users, access log, admin pages', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  // no account from the server: no login form, a clear error
  let r = await client(null).req('?p=list&t=orders');
  assert.strictEqual(r.status, 401);
  assert.match(r.text, /REMOTE_USER/);
  // not in the profile table
  r = await client('DOMINIO\\intruso').req('?p=list&t=orders');
  assert.strictEqual(r.status, 403);
  assert.match(r.text, /INTRUSO@posteitaliane\.it/);
  // seller: DOMINIO\vend1 → VEND1@posteitaliane.it, group VENDITORE, orders R::L
  const v = client('DOMINIO\\vend1');
  r = await v.req('?p=list&t=orders');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /Mario Venditore/);
  assert.match(r.text, /VEND1@posteitaliane\.it/);
  assert.doesNotMatch(r.text, /p=logout/, 'no logout with Windows sign-in');
  r = await v.req('?p=dt&t=orders&draw=1&start=0&length=10');
  assert.match(r.text, /Bianchi/);
  assert.doesNotMatch(r.text, /p=edit/, 'no W: no edit links');
  assert.strictEqual((await v.req('?p=view&t=orders&k[id]=1')).status, 200);
  assert.strictEqual((await v.req('?p=edit&t=orders&k[id]=1')).status, 403);
  assert.strictEqual((await v.req('?p=list&t=customers')).status, 403);
  assert.strictEqual((await v.req('?p=admin')).status, 403);
  r = await v.req('?p=login');
  assert.strictEqual(r.status, 302, 'no login form');
  // access table: one row per page, as the R-LAB header
  const log = sql(["SELECT userid, username, gruppo, pagina, versione FROM rlab_accessi WHERE userid = 'VEND1@posteitaliane.it'"])[0];
  assert.ok(log.some((x) => x.pagina === 'orders_list.php' && x.gruppo === 'VENDITORE' && x.versione === '3' && x.username === 'Mario Venditore'), JSON.stringify(log));
  assert.ok(!log.some((x) => x.pagina === 'dt.php'), 'ajax requests are not logged');

  // administrator: management of the R-LAB tables
  const a = client('admin1@posteitaliane.it');
  r = await a.req('?p=admin&s=ntlm_users');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /rlab_profilazione_gruppo/);
  assert.match(r.text, /VEND1@posteitaliane\.it/);
  const csrf = a.csrf(r.text);
  await a.post('?p=admin&s=ntlm_users', { _csrf: csrf, action: 'add', username: 'VEND2@posteitaliane.it', gruppo: 'VENDITORE', area: 'SUD' });
  await a.post('?p=admin&s=ntlm_users', { _csrf: csrf, action: 'update', o_username: 'VEND2@posteitaliane.it', o_gruppo: 'VENDITORE', o_area: 'SUD', username: 'VEND2@posteitaliane.it', gruppo: 'VENDITORE', area: 'CENTRO' });
  assert.deepStrictEqual(sql(["SELECT username, gruppo, AREA FROM rlab_profilazione_gruppo WHERE username = 'VEND2@posteitaliane.it'"])[0].map((x) => ({ ...x })),
    [{ username: 'VEND2@posteitaliane.it', gruppo: 'VENDITORE', AREA: 'CENTRO' }]);
  // page rights: give VENDITORE list (L) and write (W) on customers; orders unchanged; other pages untouched
  r = await a.req('?p=admin&s=ntlm_rights');
  assert.match(r.text, /name="r\[orders\]\[VENDITORE\]\[R\]" value="1" checked/);
  await a.post('?p=admin&s=ntlm_rights', { _csrf: csrf, 'r[orders][VENDITORE][R]': '1', 'r[orders][VENDITORE][L]': '1', 'r[customers][VENDITORE][W]': '1', 'r[customers][VENDITORE][L]': '1' });
  const perms = Object.fromEntries(sql(["SELECT Gruppo || '|' || Pagina AS k, Permessi FROM rlab_profilazione_permission"])[0].map((x) => [x.k, x.Permessi]));
  assert.deepStrictEqual(perms, { 'VENDITORE|orders': 'R::L', 'VENDITORE|customers': ':W:L', 'VENDITORE|index.php': 'R:W:L' });
  // the new rights apply at once
  assert.strictEqual((await v.req('?p=list&t=customers')).status, 200);
  assert.strictEqual((await v.req('?p=add&t=customers')).status, 200);
  assert.strictEqual((await v.req('?p=view&t=customers&k[id]=1')).status, 403, 'no R on customers');
});
