'use strict';
// SMS: sign-in code by SMS for users without an authenticator app (phone from the profile, wrong code, five
// tries, resend), sendSms()/runner_sms() through an HTTP gateway (a local server of the test) and its errors.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFile, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
const PORT = 19800 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
let dir;
let out;
let server;
let gw;
const hits = [];

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

const smsFile = () => path.join(dir, 'sms.log');
const lastCode = () => { const l = fs.readFileSync(smsFile(), 'utf8').trim().split('\n').pop(); return l.match(/\t(\+?\d+)\t(\d{6}) /).slice(1); };

test.before(async () => {
  if (!SQLITE) return;
  gw = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { hits.push({ method: req.method, url: req.url, body, type: req.headers['content-type'] }); res.writeHead(/fail/.test(req.url) ? 500 : 200); res.end(/bad/.test(req.url) ? 'KO' : 'OK id=1'); });
  });
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-sms-'));
  const proj = P.createProject(dir, 'smsapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  P.writeSecrets(dir, { connections: { main: '' }, smsPassword: 's3gr3to' });
  proj.security.enabled = true;
  proj.security.mode = 'database';
  proj.security.twoFactor = { enabled: true, required: true, channel: 'sms' };
  proj.project.settings.sms = { provider: 'file', file: path.join(dir, 'sms.log') };
  P.saveProject(proj);
  out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); if (gw) gw.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('sign-in code by SMS', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  const c = client();
  let r = await c.req('?p=setup');
  await c.post('?p=setup', { _csrf: c.csrf(r.text), username: 'admin', email: 'a@b.it', password: 'Segreta123', password2: 'Segreta123' });
  // no phone yet: required verification, the login stops with a clear message
  r = await c.req('?p=login');
  r = await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  assert.match(r.text, /Nessun numero di telefono/);
  // phone from the profile (the event could give it too): set it as the administrator would after the first sign-in
  const P2 = path.join(out, 'runtime', 'bootstrap.php');
  execFileSync(PHP, ['-r', `require ${JSON.stringify(P2)}; new \\MiB\\App(${JSON.stringify(out)}); \\MiB\\Sms::setPhone('admin', '+39 333 1234567');`]);
  r = await c.req('?p=login');
  r = await c.post('?p=login', { _csrf: c.csrf(r.text), username: 'admin', password: 'Segreta123' });
  assert.match(r.location, /p=twofactor/);
  let [to, code] = lastCode();
  assert.strictEqual(to, '+393331234567');
  r = await c.req('?p=twofactor');
  assert.match(r.text, /SMS .* •+567:/);
  assert.strictEqual((await c.req('?p=list&t=x')).status, 302, 'not signed in before the code');
  r = await c.post('?p=twofactor', { _csrf: c.csrf(r.text), code: code === '000000' ? '111111' : '000000' });
  assert.match(r.text, /Codice non valido/);
  // resend within 30 seconds: no new message
  const lines = fs.readFileSync(smsFile(), 'utf8').trim().split('\n').length;
  await c.post('?p=twofactor', { _csrf: c.csrf(r.text), resend: '1' });
  assert.strictEqual(fs.readFileSync(smsFile(), 'utf8').trim().split('\n').length, lines);
  r = await c.post('?p=twofactor', { _csrf: c.csrf(r.text), code: code.slice(0, 3) + ' ' + code.slice(3) });
  assert.strictEqual(r.status, 302);
  r = await c.req('?p=profile');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /value="\+39 333 1234567"/);
  // five wrong codes end the attempt
  const d = client();
  r = await d.req('?p=login');
  await d.post('?p=login', { _csrf: d.csrf(r.text), username: 'admin', password: 'Segreta123' });
  [to, code] = lastCode();
  r = await d.req('?p=twofactor');
  for (let i = 0; i < 5; i++) {
    r = await d.post('?p=twofactor', { _csrf: d.csrf(r.text), code: code === '999999' ? '999998' : '999999' });
    assert.match(r.text, /Codice non valido/);
  }
  r = await d.post('?p=twofactor', { _csrf: d.csrf(r.text), code });
  assert.match(r.text, /Accesso scaduto/, 'the right code is refused after five tries');
  assert.strictEqual((await d.req('?p=profile')).status, 302);
});

test('sendSms and runner_sms through an HTTP gateway', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, async () => {
  const port = gw.address().port;
  const run = (sms, code) => new Promise((resolve, reject) => {
    const cfg = path.join(out, 'config', 'app.php');
    const orig = fs.readFileSync(cfg, 'utf8');
    execFile(PHP, ['-r', `require ${JSON.stringify(path.join(out, 'runtime', 'bootstrap.php'))}; $a = new \\MiB\\App(${JSON.stringify(out)}); $a->config['settings']['sms'] = json_decode(${JSON.stringify(JSON.stringify(sms))}, true); ${code}`],
      { encoding: 'utf8' }, (e, so, se) => { fs.writeFileSync(cfg, orig); return e ? reject(new Error(se || e.message)) : resolve(so); });
  });
  // GET with the values in the address
  assert.strictEqual(await run({ provider: 'http', method: 'GET', url: `http://127.0.0.1:${port}/send?to={to}&text={text}&key={password}`, okText: 'OK' }, "var_export(sendSms('+39 333-111', 'Ciao & arrivederci'));"), 'true');
  let h = hits.pop();
  assert.strictEqual(h.method, 'GET');
  assert.strictEqual(h.url, '/send?to=%2B39333111&text=Ciao%20%26%20arrivederci&key=s3gr3to');
  // POST JSON, values escaped for JSON
  assert.strictEqual(await run({ provider: 'http', url: `http://127.0.0.1:${port}/json`, contentType: 'application/json', body: '{"to":"{to}","msg":"{text}","from":"{from}"}', from: 'MiB' }, "var_export(runner_sms('3331', 'Dice \"ok\"'));"),
    "array (\n  'success' => true,\n  'error' => '',\n)");
  h = hits.pop();
  assert.strictEqual(h.type, 'application/json');
  assert.deepStrictEqual(JSON.parse(h.body), { to: '3331', msg: 'Dice "ok"', from: 'MiB' });
  // errors: HTTP status, unexpected answer
  assert.match(await run({ provider: 'http', url: `http://127.0.0.1:${port}/fail` }, "echo \\MiB\\Sms::send('1', 'x');"), /^HTTP 500/);
  assert.match(await run({ provider: 'http', url: `http://127.0.0.1:${port}/bad`, okText: 'OK id' }, "echo \\MiB\\Sms::send('1', 'x');"), /risposta inattesa: KO/);
  assert.match(await run({}, "echo \\MiB\\Sms::send('1', 'x');"), /SMS non configurati/);
});
