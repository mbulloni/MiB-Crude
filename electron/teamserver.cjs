'use strict';
// The team server run from the designer ("Avvia un server su questo computer") and the list of servers found on the network.
// The server is a child of the designer: it stops when the designer is closed (the panel says so). No Electron API here, so
// the tests can drive it with plain node.

const { spawn, spawnSync } = require('node:child_process');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server', 'mibcrude-server.cjs');
const beaconPort = () => Number(process.env.MIBCRUDE_BEACON_PORT || 7301);

let child = null;
let info = null; // { port, lan, dir, pid, since }
let tail = '';

/** IPv4 addresses of this computer on the network (not the loopback one). */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

const nodeEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: '1' });

function status() {
  if (!child || !info) return { running: false };
  return { running: true, pid: info.pid, port: info.port, lan: info.lan, dir: info.dir, since: info.since,
    urls: [`ws://127.0.0.1:${info.port}`, ...(info.lan ? lanAddresses().map((a) => `ws://${a}:${info.port}`) : [])] };
}

function readUsers(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')); } catch { return {}; } }

/** Creates a user with the server's own CLI; the token is shown only here, once. */
function addUser(dir, name, role = 'developer', exec = process.execPath) {
  if (!/^[A-Za-z0-9_.@-]{2,60}$/.test(String(name || ''))) throw new Error('Nome utente non valido (lettere, numeri, . _ - @, almeno 2 caratteri)');
  if (!['admin', 'developer'].includes(role)) role = 'developer';
  if (readUsers(dir)[name]) throw new Error(`L'utente ${name} esiste già`);
  const r = spawnSync(exec, [SERVER, '--data', dir, '--add-user', name, '--role', role], { env: nodeEnv(), encoding: 'utf8' });
  const m = /Token \(mostrato una sola volta\): (\S+)/.exec(r.stdout || '');
  if (r.status !== 0 || !m) throw new Error((r.stderr || r.stdout || 'Utente non creato').trim());
  return { user: name, role, token: m[1] };
}

/**
 * Starts the server on this computer. With no users yet, the first one (an administrator named like the person using the
 * designer) is created and its token is returned: it is the only time it is shown.
 * @param {{dir: string, port?: number, lan?: boolean, user?: string, exec?: string}} o
 */
function start(o) {
  if (child) return Promise.resolve({ ...status(), already: true });
  const dir = path.resolve(o.dir);
  const port = Number(o.port) || 7300;
  if (!(port > 0 && port < 65536)) return Promise.reject(new Error('Porta non valida'));
  const exec = o.exec || process.execPath;
  fs.mkdirSync(dir, { recursive: true });
  let first = null;
  if (!Object.keys(readUsers(dir)).length) first = addUser(dir, o.user || os.userInfo().username, 'admin', exec);
  const lan = o.lan !== false;
  const args = [SERVER, '--data', dir, '--port', String(port), '--host', lan ? '0.0.0.0' : '127.0.0.1'];
  if (lan) args.push('--announce');
  tail = '';
  const c = spawn(exec, args, { env: nodeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  child = c;
  return new Promise((resolve, reject) => {
    const fail = (msg) => { if (child === c) { child = null; info = null; } try { c.kill(); } catch { /* gone */ } reject(new Error(msg)); };
    const timer = setTimeout(() => fail(`Il server non è partito${tail ? `: ${tail.trim().slice(-300)}` : ''}`), 10000);
    c.stdout.on('data', (b) => {
      tail += String(b);
      if (/in ascolto su/.test(tail) && child === c && !info) {
        clearTimeout(timer);
        info = { port, lan, dir, pid: c.pid, since: Date.now() };
        resolve({ ...status(), firstUser: first });
      }
    });
    c.stderr.on('data', (b) => { tail += String(b); });
    c.on('exit', (code) => {
      clearTimeout(timer);
      if (child === c) { child = null; info = null; }
      if (!info) reject(new Error(/EADDRINUSE/.test(tail) ? `La porta ${port} è già in uso: scegline un'altra` : `Il server si è fermato (codice ${code})${tail ? `: ${tail.trim().slice(-300)}` : ''}`));
    });
    c.on('error', (e) => fail(e.message));
  });
}

function stop() {
  if (child) { try { child.kill(); } catch { /* gone */ } }
  child = null;
  info = null;
  return { running: false };
}

/** Listens for the beacons of the team servers for a moment: [{ name, host, port, url, projects }]. */
function discover(ms = 3500) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { sock.close(); } catch { /* closed */ } resolve([...found.values()]); };
    sock.on('error', done);
    sock.on('message', (msg, rinfo) => {
      let b; try { b = JSON.parse(String(msg)); } catch { return; }
      if (!b || b.app !== 'mibcrude-team' || !(b.port > 0)) return;
      const host = rinfo.address;
      found.set(`${host}:${b.port}`, { name: String(b.name || host).slice(0, 80), host, port: Number(b.port), url: `ws://${host}:${b.port}`, projects: Array.isArray(b.projects) ? b.projects.map(String).slice(0, 50) : [] });
    });
    sock.bind(beaconPort(), () => setTimeout(done, ms));
  });
}

module.exports = { start, stop, status, addUser, discover, lanAddresses };
