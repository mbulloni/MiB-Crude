'use strict';
// REST filters sent to the API in its own syntax (json-server, Strapi, custom templates): conditions other than
// "equals" go to the API; when all of them are exact the API pages the result, otherwise the app checks again.
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

const ITEMS = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `${['Alfa', 'Beta', 'Gamma', 'Delta', 'Omega'][i % 5]} ${i + 1}`, price: (i + 1) * 10 }));
const calls = [];
// json-server and Strapi syntax, page/limit paging, total in the answer
const api = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  calls.push(decodeURIComponent(u.search));
  let list = ITEMS;
  const val = (x, f) => (f === 'price' ? Number(x) : String(x));
  for (const [k, v] of u.searchParams) {
    let m;
    if ((m = k.match(/^(name|price)(_ne|_like|_gte|_lte)?$/))) {
      const f = m[1];
      const all = u.searchParams.getAll(k);
      if (!m[2]) list = list.filter((r) => all.map((x) => val(x, f)).includes(r[f]));
      else if (m[2] === '_ne') list = list.filter((r) => r[f] !== val(v, f));
      else if (m[2] === '_like') list = list.filter((r) => new RegExp(v, 'i').test(String(r[f])));
      else if (m[2] === '_gte') list = list.filter((r) => r[f] >= val(v, f));
      else list = list.filter((r) => r[f] <= val(v, f));
    } else if ((m = k.match(/^filters\[(name|price)\]\[\$(\w+)\](\[\])?$/))) {
      const f = m[1];
      const ops = { eq: (x) => x === val(v, f), ne: (x) => x !== val(v, f), gt: (x) => x > val(v, f), lt: (x) => x < val(v, f), gte: (x) => x >= val(v, f), lte: (x) => x <= val(v, f),
        containsi: (x) => String(x).toLowerCase().includes(v.toLowerCase()), startsWithi: (x) => String(x).toLowerCase().startsWith(v.toLowerCase()), in: (x) => u.searchParams.getAll(k).map((y) => val(y, f)).includes(x) };
      list = list.filter((r) => ops[m[2]](r[f]));
    } else if ((m = k.match(/^(.+)\.(gt|cont)$/))) {
      // custom syntax: price.gt=…, name.cont=…
      list = list.filter((r) => (m[2] === 'gt' ? r[m[1]] > Number(v) : String(r[m[1]]).includes(v)));
    }
  }
  const limit = Number(u.searchParams.get('limit') || 5);
  const page = Number(u.searchParams.get('page') || 1);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ total: list.length, items: list.slice((page - 1) * limit, page * limit) }));
});

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const PORT = 19600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
let server;
let dir;

test.before(async () => {
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-restf-'));
  const proj = P.createProject(dir, 'restf');
  const rest = { id: 'api', name: 'API', driver: 'rest', url: `http://127.0.0.1:${api.address().port}`, auth: 'none' };
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  proj.connections.push(rest);
  P.writeSecrets(dir, { connections: { main: '', api: '' } });
  const paging = { mode: 'page', pageParam: 'page', firstPage: 1, sizeParam: 'limit', pageSize: 5, totalPath: 'total' };
  for (const [name, mode] of [['js', 'json-server'], ['st', 'strapi'], ['cu', 'custom'], ['eq', 'equals']]) {
    const ds = await R.addRestView(proj, rest, '', { name, path: '/items', paging, readOnly: true, filterMode: mode });
    if (mode === 'custom') ds.source.filterOps = { more: '{field}.gt', contains: '{field}.cont' };
    proj.menu.items.push({ type: 'table', table: name });
  }
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  server = spawn(PHP, ['-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});

test.after(() => { if (server) server.kill(); api.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

/** Rows of the first page (5) and the API calls made for it. */
async function page(t, s) {
  calls.length = 0;
  const qs = Object.entries(s).map(([k, v]) => `s[${k.split('.')[0]}][${k.split('.')[1]}]=${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${BASE}?p=dt&t=${t}&draw=1&start=0&length=5&order[0][column]=0&order[0][dir]=asc&${qs}`);
  const text = await r.text();
  assert.doesNotMatch(text, /(Deprecated|Warning|Notice|Fatal error)/, text.slice(0, 300));
  const j = JSON.parse(text);
  // the first call is the total without conditions (recordsTotal)
  return { total: j.recordsFiltered, calls: calls.filter((c) => c !== '?limit=5&page=1') };
}

test('json-server: exact conditions paged by the API, inexact ones checked again by the app', async () => {
  // price between 100 and 200: _gte/_lte are exact, one call for the page and one for the count
  let r = await page('js', { 'price.op': 'between', 'price.v': '100', 'price.v2': '200' });
  assert.strictEqual(r.total, 11);
  assert.ok(r.calls.every((c) => /price_gte=100&price_lte=200/.test(c)), r.calls.join(' | '));
  assert.ok(r.calls.length && !r.calls.some((c) => /page=2/.test(c)), 'the API pages it: ' + r.calls.join(' | '));
  // price more than 100: only _gte exists, sent to narrow the records, the app excludes 100
  r = await page('js', { 'price.op': 'more', 'price.v': '100' });
  assert.strictEqual(r.total, 15);
  assert.ok(r.calls.some((c) => /price_gte=100/.test(c)));
  // contains: _like (regular expression) for plain words, nothing for special characters
  r = await page('js', { 'name.op': 'contains', 'name.v': 'mega' });
  assert.strictEqual(r.total, 5);
  assert.ok(r.calls.some((c) => /name_like=mega/.test(c)));
  r = await page('js', { 'name.op': 'contains', 'name.v': 'a (' });
  assert.strictEqual(r.total, 0);
  assert.ok(!r.calls.some((c) => /_like/.test(c)));
  // not equal
  r = await page('js', { 'price.op': 'notequals', 'price.v': '10' });
  assert.strictEqual(r.total, 24);
  assert.ok(r.calls.some((c) => /price_ne=10&limit=5&page=1/.test(c)));
});

test('Strapi: every operator in the API, paged', async () => {
  let r = await page('st', { 'price.op': 'more', 'price.v': '200' });
  assert.strictEqual(r.total, 5);
  assert.ok(r.calls.every((c) => /filters\[price\]\[\$gt\]=200/.test(c)) && !r.calls.some((c) => /page=2/.test(c)), r.calls.join(' | '));
  r = await page('st', { 'name.op': 'starts', 'name.v': 'gam' });
  assert.strictEqual(r.total, 5);
  assert.ok(r.calls.some((c) => /filters\[name\]\[\$startsWithi\]=gam/.test(c)));
  r = await page('st', { 'name.op': 'contains', 'name.v': 'A 1' });
  // Alfa 1, 11, 16, Beta 12, 17, Gamma 13, 18, Delta 14, 19, Omega 10, 15 (case-insensitive)
  assert.strictEqual(r.total, 11);
  assert.ok(r.calls.some((c) => /filters\[name\]\[\$containsi\]=A 1/.test(c)));
});

test('custom templates and plain "equals"', async () => {
  let r = await page('cu', { 'price.op': 'more', 'price.v': '230' });
  assert.strictEqual(r.total, 2);
  assert.ok(r.calls.some((c) => /price\.gt=230/.test(c)));
  // no template for "less": all pages read, filtered by the app
  r = await page('cu', { 'price.op': 'less', 'price.v': '30' });
  assert.strictEqual(r.total, 2);
  assert.ok(r.calls.some((c) => /page=5/.test(c)), 'read all the pages');
  r = await page('eq', { 'price.op': 'more', 'price.v': '230' });
  assert.strictEqual(r.total, 2);
  assert.ok(!r.calls.some((c) => /gt/.test(c)));
});
