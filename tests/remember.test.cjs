'use strict';
// "Remember me": cookie after the sign-in, new session from the cookie, cookie replaced at every use, an old
// cookie used again signs the user out everywhere, "Esci" deletes it; no cookie without the tick.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
const PORT = 19210 + Math.floor(Math.random() * 30);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
let dir;
let server;

function client(start = {}) {
  const jar = { ...start };
  const req = async (url, opts = {}) => {
    const r = await fetch(BASE + url, { redirect: 'manual', ...opts, headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c) || v === 'deleted' || v === '') delete jar[k]; else jar[k] = v;
    }
    const text = await r.text();
    const leak = text.match(/(Deprecated|Warning|Notice|Fatal error)(<\/b>)?: [^\n]{0,240}/);
    assert.ok(!leak, `PHP message in ${url}: ${leak && leak[0]}`);
    return { status: r.status, text, location: r.headers.get('location') };
  };
  const csrf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  const post = (url, form) => req(url, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return { req, post, csrf, jar };
}
const remCookie = (jar) => Object.keys(jar).find((k) => k.startsWith('mc_rem_'));
const onlyRemember = (jar) => { const k = remCookie(jar); return k ? { [k]: jar[k] } : {}; };

test.before(async () => {
  if (!SQLITE) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-rem-'));
  const proj = P.createProject(dir, 'remapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  proj.security.enabled = true;
  proj.security.mode = 'database';
  proj.security.rememberDays = 30;
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: { connections: { main: '' } }, outDir: path.join(dir, 'out') }).outDir;
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('remember me', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  const a = client();
  let r = await a.req('?p=setup');
  await a.post('?p=setup', { _csrf: a.csrf(r.text), username: 'admin', email: 'a@b.it', password: 'Segreta123', password2: 'Segreta123' });
  // without the tick: no cookie
  const n = client();
  r = await n.req('?p=login');
  assert.match(r.text, /name="remember"/);
  assert.match(r.text, /Ricordami su questo dispositivo \(30 giorni\)/);
  await n.post('?p=login', { _csrf: n.csrf(r.text), username: 'admin', password: 'Segreta123' });
  assert.strictEqual(remCookie(n.jar), undefined);
  // with the tick
  const c = client();
  r = await c.req('?p=login');
  r = await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123', remember: '1' });
  assert.strictEqual(r.status, 302);
  const first = onlyRemember(c.jar);
  assert.ok(Object.keys(first).length, 'remember cookie');
  // a browser with the cookie only (session gone) is signed in, and gets a new cookie
  const b = client(first);
  r = await b.req('?p=profile');
  assert.strictEqual(r.status, 200, 'signed in from the cookie');
  const second = onlyRemember(b.jar);
  assert.notDeepStrictEqual(second, first, 'cookie replaced at every use');
  // the old cookie again (copied): refused, and the new one stops working too
  const thief = client(first);
  assert.strictEqual((await thief.req('?p=profile')).status, 302);
  assert.strictEqual((await client(second).req('?p=profile')).status, 302, 'every token of the user deleted');
  // "Esci" deletes the cookie of the browser
  const d = client();
  r = await d.req('?p=login');
  await d.post('?p=login', { _csrf: d.csrf(r.text), username: 'admin', password: 'Segreta123', remember: '1' });
  const third = onlyRemember(d.jar);
  await d.req('?p=logout');
  assert.strictEqual(remCookie(d.jar), undefined);
  assert.strictEqual((await client(third).req('?p=profile')).status, 302);
});
