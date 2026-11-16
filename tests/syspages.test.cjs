'use strict';
// System pages (login, register, forgot, reset, profile, home): standard look without a design; with a design the free grid
// (system blocks rearranged, free blocks, page CSS and JavaScript) and the text overrides of the project translations.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const W = require('../core/wizard.cjs');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** Generates an app on sqlite with database security, serves it with php -S and gives a tiny cookie-keeping client. */
async function serve(dir, mutate) {
  const proj = P.createProject(path.join(dir, 'p'), 'p');
  proj.connections = [{ id: 'main', name: 'main', driver: 'sqlite', file: 'data/main.sqlite' }];
  proj.project.defaultConnection = 'main';
  Object.assign(proj.security, { enabled: true, mode: 'database' });
  proj.security.registration = { ...proj.security.registration, enabled: true };
  proj.security.passwordReset = { enabled: true };
  proj.security.captcha = { login: false, register: false };
  await mutate(proj);
  const out = path.join(dir, 'app');
  G.generate(proj, { outDir: out, secrets: { connections: {} }, preview: true });
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  const port = await freePort();
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', out], { cwd: out, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/index.php`;
  for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  const jar = {};
  const send = async (query, opts = {}) => {
    const r = await fetch(`${base}?${query}`, { redirect: 'manual', ...opts, headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } // every response may set the session cookie
    return r;
  };
  const call = async (query, data) => {
    let r;
    if (data) {
      const tok = /name="_csrf" value="([^"]*)"/.exec(await (await send(query)).text()); // the CSRF token of the form (same session)
      r = await send(query, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...data, ...(tok ? { _csrf: tok[1] } : {}) }).toString() });
    } else r = await send(query);
    if (r.status >= 300 && r.status < 400) return call(r.headers.get('location').replace(/^.*index\.php\?/, ''));
    return r.text();
  };
  await call('p=setup', { username: 'admin', email: 'a@x.it', password: 'Passw0rd1', password2: 'Passw0rd1' }); // first user
  for (const k of Object.keys(jar)) delete jar[k]; // a visitor again
  return { call, login: () => call('p=login', { username: 'admin', password: 'Passw0rd1' }), stop: () => proc.kill() };
}

const block = (id, b, x, y, w, h) => ({ id, type: 'sys', block: b, x, y, w, h });
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('system pages without a design keep the standard markup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsys-'));
  const s = await serve(dir, () => {});
  try {
    const login = await s.call('p=login');
    assert.match(login, /name="username"/);
    assert.match(login, /name="password"/);
    assert.match(login, /Password dimenticata\?/);
    assert.doesNotMatch(login, /id="mc-page"/); // no grid
    const reg = await s.call('p=register');
    assert.match(reg, /name="password2"/);
    assert.match(reg, /Indietro/);
    const forgot = await s.call('p=forgot');
    assert.match(forgot, /name="email"/);
    await s.login();
    const profile = await s.call('p=profile');
    assert.match(profile, /Il mio profilo/);
    assert.match(profile, /name="old"/);
    assert.doesNotMatch(profile, /id="mc-page"/);
    assert.match(await s.call('p=home'), /<h1 class="h4 mb-3">/);
  } finally { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a designed system page: blocks rearranged, free blocks, page CSS and JavaScript, texts overridden', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsys-'));
  const s = await serve(dir, (proj) => {
    proj.syspages = [
      { name: 'login', title: {}, css: '.zz-marker{color:red}', js: 'window.zzMarker = 42;', items: [
        { id: 'b1', type: 'html', x: 1, y: 1, w: 12, h: 3, card: false, html: { it: '<h2 class="zz-marker">Benvenuti in Acme</h2>' } },
        block('b2', 'form', 1, 4, 12, 8),
        block('b3', 'links', 1, 12, 12, 2), // «providers» left out on purpose
      ] },
      { name: 'home', title: {}, items: [block('b1', 'cards', 1, 1, 12, 6), block('b2', 'title', 1, 7, 12, 2)] },
      { name: 'admin', title: {}, items: [block('b1', 'menu', 1, 1, 12, 2), block('b2', 'title', 1, 3, 12, 2), block('b3', 'content', 1, 5, 12, 12)] },
    ];
    proj.lang = { it: { 'login.submit': 'Entra in Acme', 'admin.title': 'Pannello Acme' } };
  });
  try {
    const login = await s.call('p=login');
    assert.match(login, /id="mc-page"/);
    assert.match(login, /data-block="b2" data-type="sys"/);
    assert.ok(login.indexOf('Benvenuti in Acme') < login.indexOf('name="username"'), 'the free text sits above the form');
    assert.match(login, /\.zz-marker\{color:red\}/);
    assert.match(login, /window\.zzMarker = 42;/);
    assert.match(text(login), /Entra in Acme/); // translation override of the project
    assert.match(login, /Password dimenticata\?/); // the links block is there
    assert.doesNotMatch(login, /Accedi con/); // the providers block was not placed
    await s.login();
    const home = await s.call('p=home');
    assert.match(home, /id="mc-page"/);
    assert.ok(home.indexOf('data-block="b1"') < home.indexOf('<h1 class="h4 mb-3">'), 'cards block (b1) comes before the title (b2)');
    const admin = await s.call('p=admin&s=users');
    assert.match(admin, /id="mc-page"/);
    assert.ok(admin.indexOf('nav nav-pills') < admin.indexOf('<h1 class="h4 mb-3"><i class="bi bi-shield-lock"></i> Pannello Acme'), 'the section menu (b1) comes before the title (b2), with the text override');
    assert.match(admin, /name="username"|Nome utente/); // the content block (users table) is there
    // pages without a design are untouched
    assert.doesNotMatch(await s.call('p=profile'), /id="mc-page"/);
  } finally { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

/** A sqlite table "items" imported in the project, security off: the table pages can be fetched without signing in. */
async function withTable(proj, dir, tweak) {
  const db = path.join(dir, 'items.sqlite');
  execFileSync('php', ['-r', `$d = new PDO('sqlite:${db}'); $d->exec('create table items (id integer primary key autoincrement, name text not null, qty integer)'); for ($i = 1; $i <= 5; $i++) $d->exec("insert into items (name, qty) values ('Item $i', $i)");`]);
  proj.connections = [{ id: 'main', name: 'main', driver: 'sqlite', file: db }];
  proj.security.enabled = false;
  await W.importTables(proj, proj.connections[0], '', ['items']);
  const t = proj.tables[0];
  for (const pg of ['list', 'search', 'print', 'import', 'export', 'delete']) t.pages[pg] = { ...(t.pages[pg] || {}), enabled: true };
  for (const f of t.fields) f.show = { ...f.show, list: true, search: true, print: true, import: true };
  tweak(t, proj);
}

test('table pages (search, print, import) without a design keep the standard markup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsys-'));
  const s = await serve(dir, (proj) => withTable(proj, dir, () => {}));
  try {
    const search = await s.call('p=search&t=items');
    assert.match(search, /mc-search-row/);
    assert.match(search, /Ricerca avanzata/);
    assert.doesNotMatch(search, /id="mc-page"/);
    const print = await s.call('p=print&t=items');
    assert.match(print, /table table-sm table-bordered/);
    assert.match(print, /5 record/);
    const imp = await s.call('p=import&t=items');
    assert.match(imp, /type="file"/);
    assert.doesNotMatch(imp, /id="mc-page"/);
  } finally { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('designed table pages: blocks rearranged or left out, free blocks, PHP snippets, page CSS and JavaScript', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsys-'));
  const s = await serve(dir, (proj) => withTable(proj, dir, (t) => {
    t.layout = {
      search: { css: '.zz-search{color:blue}', js: 'window.zzSearch = 1;', grid: [
        { id: 'b1', type: 'html', x: 1, y: 1, w: 12, h: 3, card: false, html: { it: '<p class="zz-search">Cerca con calma</p>' } },
        { id: 'b2', type: 'sys', block: 'form', x: 1, y: 4, w: 12, h: 10 }, // the title block is left out
        { id: 'b3', type: 'snippet', event: 'Snippet_blocco1', x: 1, y: 14, w: 12, h: 2 },
        { id: 'b4', type: 'count', table: 't_items', fn: 'count', title: { it: 'Totale articoli' }, x: 1, y: 16, w: 4, h: 3 }, // indicator and chart: same blocks as the list's free layout
        { id: 'b5', type: 'chart', ref: 'c1', x: 5, y: 16, w: 8, h: 6 },
      ] },
      print: { grid: [{ id: 'b1', type: 'sys', block: 'count', x: 1, y: 1, w: 12, h: 1 }] }, // only the number of records
      import: { grid: [{ id: 'b1', type: 'sys', block: 'form', x: 1, y: 1, w: 12, h: 9 }, { id: 'b2', type: 'sys', block: 'title', x: 1, y: 10, w: 12, h: 2 }] },
    };
    proj.charts = [{ name: 'c1', title: { it: 'Grafico prova' }, table: t.name, type: 'bar', labelField: 'name', series: [] }];
    t.layout.search.grid.find((g) => g.id === 'b4').table = t.name;
    proj.events[t.name] = { Snippet_blocco1: "<?php\necho '<b>SNIPPET-OK</b>';\nreturn true;\n" };
  }));
  try {
    const search = await s.call('p=search&t=items');
    assert.match(search, /id="mc-page"/);
    assert.ok(search.indexOf('Cerca con calma') < search.indexOf('mc-search-row'), 'the free text sits above the form');
    assert.doesNotMatch(search, /<h1 class="h4 mb-3">/); // the title block was not placed
    assert.match(search, /\.zz-search\{color:blue\}/);
    assert.match(search, /window\.zzSearch = 1;/);
    assert.match(search, /SNIPPET-OK/);
    assert.match(search, /data-block="b4" data-type="count"/);
    assert.match(search, /Totale articoli/);
    assert.match(search, /data-block="b5" data-type="chart"/);
    assert.match(search, /echarts/i); // the layout loads the chart library for a chart block
    const print = await s.call('p=print&t=items');
    assert.match(print, /5 record/);
    assert.doesNotMatch(print, /table table-sm table-bordered/); // the table block was not placed
    const imp = await s.call('p=import&t=items');
    assert.ok(imp.indexOf('type="file"') < imp.indexOf('<h1 class="h4 mb-3">'), 'the form comes before the title');
    assert.match(imp, /data-block="b2" data-type="sys"/);
  } finally { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
