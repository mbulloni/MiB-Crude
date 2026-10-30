#!/usr/bin/env node
'use strict';
// MiB-Crude team server: several developers edit the same project at the same time.
//  - the canonical project lives on the server (one folder per project, versioned with Git)
//  - developers lock what they edit (a table with its events, the menu, security...)
//  - every saved change is pushed to the others immediately; stale writes become conflicts
//  - presence (who is online and on which item) and a small chat
//
// Usage:
//   node server/mibcrude-server.cjs --data ./team-data [--port 7300] [--host 0.0.0.0]
//   node server/mibcrude-server.cjs --data ./team-data --add-user mario [--role admin]
//   node server/mibcrude-server.cjs --data ./team-data --list-users
// Put it behind a TLS reverse proxy (wss://) when used over the internet.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { itemOf, syncable, hash } = require('../core/team-protocol.cjs');

const VERSION = 1;
const LOCK_TTL_MS = 4 * 60 * 60 * 1000; // stale locks of vanished clients expire

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}
const has = (name) => process.argv.includes(`--${name}`);

const DATA = path.resolve(arg('data', './team-data'));
const USERS_FILE = path.join(DATA, 'users.json');
fs.mkdirSync(path.join(DATA, 'projects'), { recursive: true });

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const readUsers = () => { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return {}; } };
const writeUsers = (u) => fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2), { mode: 0o600 });

if (has('add-user')) {
  const name = arg('add-user');
  if (!/^[A-Za-z0-9_.@-]{2,60}$/.test(name || '')) { console.error('Nome utente non valido'); process.exit(1); }
  const token = crypto.randomBytes(18).toString('base64url');
  const users = readUsers();
  users[name] = { token: sha256(token), role: arg('role', 'developer'), created: new Date().toISOString() };
  writeUsers(users);
  console.log(`Utente ${name} creato. Token (mostrato una sola volta): ${token}`);
  process.exit(0);
}
if (has('list-users')) {
  for (const [n, u] of Object.entries(readUsers())) console.log(`${n}\t${u.role}\t${u.created}`);
  process.exit(0);
}

// --- project storage --------------------------------------------------------------

function projectDir(name) {
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) throw new Error('Nome progetto non valido');
  return path.join(DATA, 'projects', name);
}

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function manifest(dir) {
  const out = {};
  for (const rel of walk(dir)) if (syncable(rel)) out[rel] = hash(fs.readFileSync(path.join(dir, rel), 'utf8'));
  return out;
}

// Git commits are serialized per project.
const gitQueues = new Map();
function gitCommit(dir, user, message) {
  const prev = gitQueues.get(dir) || Promise.resolve();
  const next = prev.then(() => new Promise((resolve) => {
    const env = { ...process.env, GIT_AUTHOR_NAME: user, GIT_AUTHOR_EMAIL: `${user}@mibcrude`, GIT_COMMITTER_NAME: 'mibcrude-server', GIT_COMMITTER_EMAIL: 'server@mibcrude' };
    const run = (args, cb) => execFile('git', args, { cwd: dir, env }, cb);
    const go = () => run(['add', '-A'], () => run(['commit', '-q', '-m', message], () => resolve()));
    if (!fs.existsSync(path.join(dir, '.git'))) run(['init', '-q', '-b', 'main'], go); else go();
  }));
  gitQueues.set(dir, next.catch(() => {}));
  return next;
}

function gitLog(dir) {
  return new Promise((resolve) => execFile('git', ['log', '-50', '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=iso'], { cwd: dir }, (e, out) => {
    resolve(e ? [] : out.split('\n').filter(Boolean).map((l) => { const [h, a, d, s] = l.split('\t'); return { hash: h, author: a, date: d, subject: s }; }));
  }));
}

// --- live state -----------------------------------------------------------------------

// rooms[project] = { clients:Set<ws>, locks: {item: {user, client, since}} }
const rooms = new Map();
function room(name) {
  if (!rooms.has(name)) rooms.set(name, { clients: new Set(), locks: {} });
  return rooms.get(name);
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(r, msg, except) { for (const c of r.clients) if (c !== except) send(c, msg); }

function presence(r) {
  return [...r.clients].map((c) => ({ id: c.id, user: c.user, focus: c.focus || '', since: c.since }));
}

function lockList(r) {
  const now = Date.now();
  for (const [item, l] of Object.entries(r.locks)) if (now - l.since > LOCK_TTL_MS) delete r.locks[item];
  return Object.fromEntries(Object.entries(r.locks).map(([k, v]) => [k, { user: v.user, since: v.since }]));
}

function releaseAll(r, ws) {
  let changed = false;
  for (const [item, l] of Object.entries(r.locks)) if (l.client === ws.id) { delete r.locks[item]; changed = true; }
  if (changed) broadcast(r, { type: 'locks', locks: lockList(r) });
}

// --- protocol -----------------------------------------------------------------------------

async function onMessage(ws, msg) {
  const reply = (data) => send(ws, { ...data, re: msg.id });
  if (msg.type === 'hello') {
    const users = readUsers();
    const u = users[msg.user];
    if (!u || !msg.token || u.token !== sha256(msg.token)) return reply({ type: 'error', error: 'Utente o token non validi' });
    ws.user = msg.user;
    ws.role = u.role;
    if (msg.create) {
      const dir = projectDir(msg.project);
      if (fs.existsSync(dir) && walk(dir).length) return reply({ type: 'error', error: `Il progetto ${msg.project} esiste già sul server` });
      fs.mkdirSync(dir, { recursive: true });
      for (const [rel, content] of Object.entries(msg.files || {})) {
        if (!syncable(rel)) continue;
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
      }
      await gitCommit(dir, ws.user, `Progetto pubblicato da ${ws.user}`);
    }
    const dir = projectDir(msg.project);
    if (!fs.existsSync(dir)) return reply({ type: 'error', error: `Progetto ${msg.project} non trovato sul server` });
    ws.project = msg.project;
    ws.dir = dir;
    const r = room(msg.project);
    r.clients.add(ws);
    reply({ type: 'welcome', version: VERSION, user: ws.user, role: ws.role, manifest: manifest(dir), locks: lockList(r), presence: presence(r) });
    broadcast(r, { type: 'presence', presence: presence(r) }, ws);
    return;
  }
  if (!ws.project) return reply({ type: 'error', error: 'Esegui prima hello' });
  const r = room(ws.project);
  switch (msg.type) {
    case 'projects': {
      const list = fs.readdirSync(path.join(DATA, 'projects'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      return reply({ type: 'projects', projects: list });
    }
    case 'get': {
      const files = {};
      for (const rel of msg.paths || []) {
        if (!syncable(rel)) continue;
        try { files[rel] = fs.readFileSync(path.join(ws.dir, rel), 'utf8'); } catch { files[rel] = null; }
      }
      return reply({ type: 'files', files });
    }
    case 'put': {
      // files: { rel: { content: string|null, base: hash|null } }
      const applied = {};
      const conflicts = [];
      const denied = [];
      for (const [rel, f] of Object.entries(msg.files || {})) {
        if (!syncable(rel)) { denied.push({ rel, reason: 'percorso non sincronizzabile' }); continue; }
        const item = itemOf(rel);
        const lock = r.locks[item];
        if (lock && lock.client !== ws.id) { denied.push({ rel, reason: `bloccato da ${lock.user}` }); continue; }
        const abs = path.join(ws.dir, rel);
        let cur = null;
        try { cur = fs.readFileSync(abs, 'utf8'); } catch { /* new */ }
        const curHash = cur == null ? null : hash(cur);
        const newHash = f.content == null ? null : hash(f.content);
        if (curHash === newHash) { applied[rel] = newHash; continue; }
        if ((f.base || null) !== curHash && !msg.force) { conflicts.push({ rel, theirs: cur }); continue; }
        if (f.content == null) fs.rmSync(abs, { force: true });
        else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, f.content); }
        applied[rel] = newHash;
      }
      if (Object.keys(applied).length) {
        broadcast(r, { type: 'changed', by: ws.user, files: applied }, ws);
        gitCommit(ws.dir, ws.user, msg.message || `${ws.user}: ${Object.keys(applied).slice(0, 5).join(', ')}${Object.keys(applied).length > 5 ? '…' : ''}`);
      }
      return reply({ type: 'put-result', applied, conflicts, denied });
    }
    case 'lock': {
      const cur = r.locks[msg.item];
      if (cur && cur.client !== ws.id && Date.now() - cur.since < LOCK_TTL_MS) return reply({ type: 'lock-result', ok: false, holder: cur.user });
      r.locks[msg.item] = { user: ws.user, client: ws.id, since: Date.now() };
      ws.focus = msg.item;
      reply({ type: 'lock-result', ok: true });
      broadcast(r, { type: 'locks', locks: lockList(r) });
      broadcast(r, { type: 'presence', presence: presence(r) });
      return;
    }
    case 'unlock': {
      const cur = r.locks[msg.item];
      if (cur && (cur.client === ws.id || (msg.force && ws.role === 'admin'))) delete r.locks[msg.item];
      reply({ type: 'lock-result', ok: true });
      broadcast(r, { type: 'locks', locks: lockList(r) });
      return;
    }
    case 'focus':
      ws.focus = String(msg.item || '');
      broadcast(r, { type: 'presence', presence: presence(r) });
      return reply({ type: 'ok' });
    case 'chat':
      broadcast(r, { type: 'chat', user: ws.user, text: String(msg.text || '').slice(0, 2000), at: Date.now() });
      return reply({ type: 'ok' });
    case 'history':
      return reply({ type: 'history', log: await gitLog(ws.dir) });
    case 'ping':
      return reply({ type: 'pong' });
  }
  reply({ type: 'error', error: `Messaggio sconosciuto: ${msg.type}` });
}

function startServer(port, host) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`MiB-Crude team server v${VERSION}\nProgetti: ${fs.readdirSync(path.join(DATA, 'projects')).length}\n`);
  });
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 * 1024 });
  wss.on('connection', (ws, req) => {
    ws.id = crypto.randomBytes(6).toString('hex');
    ws.since = Date.now();
    ws.ip = req.socket.remoteAddress;
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return send(ws, { type: 'error', error: 'JSON non valido' }); }
      onMessage(ws, msg).catch((e) => send(ws, { type: 'error', error: e.message, re: msg.id }));
    });
    ws.on('close', () => {
      if (!ws.project) return;
      const r = room(ws.project);
      r.clients.delete(ws);
      releaseAll(r, ws);
      broadcast(r, { type: 'presence', presence: presence(r) });
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (require.main === module) {
  const port = Number(arg('port', 7300));
  const host = arg('host', '0.0.0.0');
  if (!Object.keys(readUsers()).length) console.log(`Nessun utente: crea il primo con --data ${DATA} --add-user <nome> --role admin`);
  startServer(port, host).then(() => console.log(`MiB-Crude team server in ascolto su ws://${host}:${port} (dati: ${DATA})`));
}

module.exports = { startServer };
