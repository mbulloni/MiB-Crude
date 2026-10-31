'use strict';
// Encrypted fields: ciphertext in the database, plain values in list, view, edit and export, old plain values
// still readable, no search on the encrypted field, masked in the audit log, clear error without the key.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const { datasourceFromSchema } = require('../core/defaults.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
const PORT = 19250 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
const KEY = crypto.randomBytes(32).toString('base64');
let dir;
let dbFile;
let out;
let server;

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
  return { status: r.status, text };
}
const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
const post = (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

function build(key) {
  const proj = P.loadProject(dir);
  return G.generate(proj, { secrets: { connections: { main: '' }, encryptionKey: key }, outDir: path.join(dir, 'out') }).outDir;
}

test.before(async () => {
  if (!SQLITE) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-crypt-'));
  dbFile = path.join(dir, 'app.sqlite');
  sql(["CREATE TABLE people (id INTEGER PRIMARY KEY, nome TEXT, iban TEXT)", "INSERT INTO people VALUES (1, 'Vecchio', 'IT00OLD')"]);
  const proj = P.createProject(dir, 'cryptapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: dbFile });
  const col = (name, type, pk) => ({ name, type, dbType: type === 'int' ? 'INTEGER' : 'TEXT', nullable: !pk, pk: !!pk, autoInc: !!pk });
  const t = datasourceFromSchema({ name: 'people', columns: [col('id', 'int', true), col('nome', 'varchar'), col('iban', 'varchar')], pk: ['id'], fks: [] },
    { connection: 'main', languages: proj.project.languages, settings: proj.project.settings });
  t.fields.find((f) => f.name === 'iban').encrypt = true;
  proj.tables.push(t);
  proj.menu.items.push({ type: 'table', table: 'people' });
  proj.project.settings.audit = true;
  P.saveProject(proj);
  out = build(KEY);
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('encrypted field', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  let r = await req('?p=add&t=people');
  await post('?p=add&t=people', { _csrf: csrf(r.text), nome: 'Rossi', iban: 'IT60X0542811101000000123456', _next: 'list' });
  const raw = sql(["SELECT iban FROM people WHERE nome = 'Rossi'"])[0][0].iban;
  assert.match(raw, /^enc1:[A-Za-z0-9+/=]+$/);
  assert.ok(!raw.includes('IT60'));
  // the app shows the plain value; the old plain row is still readable
  r = await req('?p=dt&t=people&draw=1&start=0&length=10');
  assert.match(r.text, /IT60X0542811101000000123456/);
  assert.match(r.text, /IT00OLD/);
  assert.match((await req('?p=view&t=people&k[id]=2')).text, /IT60X0542811101000000123456/);
  // no search on the encrypted field (no error, no match on ciphertext), other fields still searchable
  assert.strictEqual(JSON.parse((await req('?p=dt&t=people&draw=1&start=0&length=10&q=IT60')).text).recordsFiltered, 0);
  assert.strictEqual(JSON.parse((await req('?p=dt&t=people&draw=1&start=0&length=10&q=Ross')).text).recordsFiltered, 1);
  // edit: still encrypted, a different ciphertext; the old plain row gets encrypted at its next save
  r = await req('?p=edit&t=people&k[id]=1');
  assert.match(r.text, /value="IT00OLD"/);
  await post('?p=edit&t=people&k[id]=1', { _csrf: csrf(r.text), nome: 'Vecchio', iban: 'IT00OLD', _next: 'list' });
  assert.match(sql(['SELECT iban FROM people WHERE id = 1'])[0][0].iban, /^enc1:/);
  // CSV export decrypted
  assert.match((await req('?p=export&t=people&fmt=csv')).text, /IT60X0542811101000000123456/);
  // audit log: masked
  const audit = JSON.stringify(sql(['SELECT old_json, new_json FROM mc_audit']));
  assert.ok(!audit.includes('IT60') && !audit.includes('IT00OLD') && !audit.includes('enc1:'), audit);
  // another key: values not readable (empty), no PHP error; no key: a clear error when saving
  server.kill();
  build(crypto.randomBytes(32).toString('base64'));
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((res) => setTimeout(res, 100)); } }
  r = await req('?p=dt&t=people&draw=1&start=0&length=10');
  assert.doesNotMatch(r.text, /IT60|enc1:/);
  server.kill();
  build('');
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((res) => setTimeout(res, 100)); } }
  r = await req('?p=add&t=people');
  r = await post('?p=add&t=people', { _csrf: csrf(r.text), nome: 'Bianchi', iban: 'IT99', _next: 'list' });
  assert.match(r.text, /Chiave di cifratura mancante/);
  assert.strictEqual(sql(["SELECT COUNT(*) AS n FROM people WHERE nome = 'Bianchi'"])[0][0].n, 0);
});
