'use strict';
// Team server started from the designer (electron/teamserver.cjs): first user, address list, beacon discovery, stop.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const BEACON = 19000 + Math.floor(Math.random() * 500);
process.env.MIBCRUDE_BEACON_PORT = String(BEACON);
const fresh = () => { const id = require.resolve('../electron/teamserver.cjs'); delete require.cache[id]; return require('../electron/teamserver.cjs'); };
const free = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const open = (port) => new Promise((resolve) => { const c = net.connect(port, '127.0.0.1', () => { c.destroy(); resolve(true); }); c.on('error', () => resolve(false)); });

test('start: first administrator created with its token, status, discovery by beacon, new user, stop', async () => {
  const ts = fresh();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-ts-'));
  const port = await free();
  try {
    assert.strictEqual(ts.status().running, false);
    const r = await ts.start({ dir, port, lan: true, user: 'anna' });
    assert.strictEqual(r.running, true);
    assert.strictEqual(r.port, port);
    assert.strictEqual(r.firstUser.user, 'anna');
    assert.ok(r.firstUser.token.length >= 16, 'token shown once');
    assert.ok(r.urls.includes(`ws://127.0.0.1:${port}`));
    assert.strictEqual(await open(port), true, 'the port answers');
    const users = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    assert.strictEqual(users.anna.role, 'admin');
    assert.ok(!JSON.stringify(users).includes(r.firstUser.token), 'only the hash is kept');
    // already running: nothing is started twice
    assert.strictEqual((await ts.start({ dir, port })).already, true);
    // the beacon is heard: the server is in the list with its address
    let list = [];
    for (let i = 0; i < 4 && !list.some((x) => x.port === port); i++) list = await ts.discover(1500);
    const mine = list.find((x) => x.port === port);
    assert.ok(mine, 'found on the network');
    assert.match(mine.url, /^ws:\/\/[\d.]+:\d+$/);
    // a second user, token shown once; a name used twice or a bad one is refused
    const u = ts.addUser(dir, 'luca', 'developer');
    assert.strictEqual(u.user, 'luca');
    assert.ok(u.token);
    assert.throws(() => ts.addUser(dir, 'luca'), /esiste già/);
    assert.throws(() => ts.addUser(dir, 'a b'), /non valido/);
    assert.strictEqual(ts.stop().running, false);
    assert.strictEqual(ts.status().running, false);
    await new Promise((r2) => setTimeout(r2, 400));
    assert.strictEqual(await open(port), false, 'the port is closed after stop');
    // restart with users already there: no new first user
    const again = await ts.start({ dir, port, lan: false });
    assert.strictEqual(again.firstUser, null);
    assert.deepStrictEqual(again.urls, [`ws://127.0.0.1:${port}`], 'only this computer');
  } finally { ts.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('start: a port in use gives a clear message and leaves nothing running', async () => {
  const ts = fresh();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-ts-'));
  const busy = net.createServer();
  const port = await new Promise((resolve) => busy.listen(0, '0.0.0.0', () => resolve(busy.address().port)));
  try {
    await assert.rejects(ts.start({ dir, port, lan: true, user: 'anna' }), /già in uso|non è partito|fermato/);
    assert.strictEqual(ts.status().running, false);
  } finally { ts.stop(); busy.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
