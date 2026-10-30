'use strict';
// Two developers on the team server: publish, checkout, live sync, locks, conflicts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');

const SERVER = path.join(__dirname, '..', 'server', 'mibcrude-server.cjs');
const PORT = 17300 + Math.floor(Math.random() * 500);
const URL = `ws://127.0.0.1:${PORT}`;

// Each developer needs its own copy of the (singleton) client module.
function freshClient() {
  const id = require.resolve('../electron/team.cjs');
  delete require.cache[id];
  const mod = require('../electron/team.cjs');
  delete require.cache[id];
  return mod;
}

const wait = (cond, ms = 4000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => (cond() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout')) : setTimeout(tick, 30));
  tick();
});

let data, srv, tokA, tokB;

test.before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-team-'));
  const tok = (u) => execFileSync('node', [SERVER, '--data', data, '--add-user', u]).toString().match(/: (\S+)$/m)[1];
  tokA = tok('anna');
  tokB = tok('bruno');
  srv = spawn('node', [SERVER, '--data', data, '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
test.after(() => srv && srv.kill());

test('publish, checkout, live sync, locks and conflicts', async () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-a-'));
  const projA = P.createProject(dirA, 'team');
  projA.tables.push({ name: 'orders', connection: 'main', source: { type: 'table', table: 'orders' }, caption: { it: 'Ordini' }, keys: ['id'], fields: [], pages: {}, details: [] });
  P.saveProject(projA);

  const A = freshClient();
  const B = freshClient();
  const eventsB = [];
  await A.publish({ url: URL, user: 'anna', token: tokA, project: 'shop', dir: dirA, onEvent: () => {} });

  const dirB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-b-')), 'shop');
  const res = await B.checkout({ url: URL, user: 'bruno', token: tokB, project: 'shop', dir: dirB, onEvent: (e) => eventsB.push(e) });
  assert.ok(res.sync.downloaded.includes('tables/orders.json'));
  assert.strictEqual(P.loadProject(dirB).tables[0].caption.it, 'Ordini');

  // Anna locks the table; Bruno cannot write it.
  assert.deepStrictEqual(await A.lock('table:orders'), { ok: true });
  const l = await B.lock('table:orders');
  assert.strictEqual(l.ok, false);
  assert.strictEqual(l.holder, 'anna');
  const projB = P.loadProject(dirB);
  projB.tables[0].caption.it = 'Ordini di Bruno';
  const saved = P.saveProject(projB);
  const r = await B.pushNow(dirB, saved.changed);
  assert.strictEqual(r.denied.length, 1);

  // Anna saves: Bruno receives the change on disk.
  const pa = P.loadProject(dirA);
  pa.tables[0].caption.it = 'Ordini clienti';
  await A.pushNow(dirA, P.saveProject(pa).changed);
  await wait(() => eventsB.some((e) => e.type === 'changed'));
  const ev = eventsB.find((e) => e.type === 'changed');
  assert.strictEqual(ev.by, 'anna');
  // Bruno had a local unsaved-on-server edit of the same file: reported as conflict, not overwritten.
  assert.deepStrictEqual(ev.conflicts, ['tables/orders.json']);

  // Bruno discards his copy, Anna releases the lock, Bruno edits the menu (no lock needed).
  await A.unlock('table:orders');
  const pb = P.loadProject(dirB);
  pb.menu.items.push({ type: 'table', table: 'orders' });
  const eventsA = [];
  // re-connect A with an event sink
  await A.connect({ url: URL, user: 'anna', token: tokA, project: 'shop', dir: dirA, onEvent: (e) => eventsA.push(e) });
  await B.pushNow(dirB, P.saveProject(pb).changed);
  await wait(() => eventsA.some((e) => e.type === 'changed'));
  assert.strictEqual(P.loadProject(dirA).menu.items.length, 1);

  // Server keeps history in Git.
  const log = execFileSync('git', ['log', '--pretty=%an'], { cwd: path.join(data, 'projects', 'shop') }).toString();
  assert.match(log, /anna/);
  assert.match(log, /bruno/);
  A.disconnect();
  B.disconnect();
});
