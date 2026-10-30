'use strict';
// Designer side of the team server: keeps the local project folder in sync with the
// server copy (three-way via a baseline of the last known server hashes), forwards locks,
// presence and chat to the renderer.

const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const P = require('../core/project.cjs');
const { syncable, hash } = require('../core/team-protocol.cjs');

let ws = null;
let cfg = null;
let seq = 0;
const pending = new Map();
let live = { connected: false, user: '', project: '', locks: {}, presence: [], conflicts: [], role: '' };

const baselineFile = (dir) => P.localPath(dir, 'team.json');
function readBaseline(dir) { try { return JSON.parse(fs.readFileSync(baselineFile(dir), 'utf8')); } catch { return { files: {} }; } }
function writeBaseline(dir, b) {
  fs.mkdirSync(path.dirname(baselineFile(dir)), { recursive: true });
  fs.writeFileSync(baselineFile(dir), JSON.stringify(b, null, 1));
}

function localFiles(dir) {
  const out = {};
  for (const rel of P.walk(dir)) if (syncable(rel)) out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  return out;
}

function request(msg, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error('Non connesso al server del team'));
    const id = ++seq;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('Il server non risponde')); }, timeout);
    pending.set(id, (r) => { clearTimeout(t); r.type === 'error' ? reject(new Error(r.error)) : resolve(r); });
    ws.send(JSON.stringify({ ...msg, id }));
  });
}

function open(url) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 64 * 1024 * 1024 });
    sock.once('open', () => resolve(sock));
    sock.once('error', (e) => reject(new Error(`Server del team non raggiungibile: ${e.message}`)));
  });
}

function emit(ev) { if (cfg && cfg.onEvent) cfg.onEvent(ev); }

function attach(sock) {
  ws = sock;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.re && pending.has(msg.re)) { const cb = pending.get(msg.re); pending.delete(msg.re); cb(msg); return; }
    if (msg.type === 'locks') { live.locks = msg.locks; emit({ type: 'locks', locks: msg.locks }); }
    else if (msg.type === 'presence') { live.presence = msg.presence; emit({ type: 'presence', presence: msg.presence }); }
    else if (msg.type === 'chat') emit(msg);
    else if (msg.type === 'changed') onRemoteChange(msg).catch((e) => emit({ type: 'error', error: e.message }));
  });
  ws.on('close', () => {
    live.connected = false;
    for (const cb of pending.values()) cb({ type: 'error', error: 'Connessione chiusa' });
    pending.clear();
    emit({ type: 'disconnected' });
  });
}

// Another developer saved: download, write to disk, tell the renderer to reload those items.
async function onRemoteChange(msg) {
  const dir = cfg.dir;
  const base = readBaseline(dir);
  const want = [];
  const conflicts = [];
  for (const [rel, h] of Object.entries(msg.files)) {
    let local = null;
    try { local = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { /* missing */ }
    const lh = local == null ? null : hash(local);
    if (lh === h) { base.files[rel] = h; continue; }
    if (lh !== (base.files[rel] || null)) conflicts.push(rel); // we changed it too (unsaved upload)
    else want.push(rel);
  }
  if (want.length) {
    const r = await request({ type: 'get', paths: want });
    for (const [rel, content] of Object.entries(r.files)) {
      const abs = path.join(dir, rel);
      if (content == null) { fs.rmSync(abs, { force: true }); delete base.files[rel]; }
      else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); base.files[rel] = hash(content); }
    }
  }
  writeBaseline(dir, base);
  if (conflicts.length) live.conflicts = [...new Set([...live.conflicts, ...conflicts])];
  emit({ type: 'changed', by: msg.by, files: want, conflicts });
}

// Upload local changes (after a save). rels: changed or removed project paths.
async function pushFiles(dir, rels, force = false) {
  if (!ws || !live.connected) return null;
  const base = readBaseline(dir);
  const files = {};
  for (const rel of rels) {
    if (!syncable(rel)) continue;
    let content = null;
    try { content = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { /* removed */ }
    files[rel] = { content, base: base.files[rel] || null };
  }
  if (!Object.keys(files).length) return null;
  const r = await request({ type: 'put', files, force });
  for (const [rel, h] of Object.entries(r.applied)) { if (h == null) delete base.files[rel]; else base.files[rel] = h; }
  writeBaseline(dir, base);
  if (r.conflicts.length || r.denied.length) {
    live.conflicts = [...new Set([...live.conflicts, ...r.conflicts.map((c) => c.rel)])];
    emit({ type: 'put-problems', conflicts: r.conflicts, denied: r.denied });
  }
  return r;
}

// First sync after connecting: three-way compare local / baseline / server.
async function reconcile(dir, manifest) {
  const base = readBaseline(dir);
  const local = localFiles(dir);
  const download = [];
  const upload = [];
  const conflicts = [];
  const all = new Set([...Object.keys(manifest), ...Object.keys(local)]);
  for (const rel of all) {
    const s = manifest[rel] || null;
    const l = local[rel] != null ? hash(local[rel]) : null;
    const b = base.files[rel] || null;
    if (s === l) { if (s) base.files[rel] = s; else delete base.files[rel]; continue; }
    if (l === b) download.push(rel);
    else if (s === b) upload.push(rel);
    else conflicts.push(rel);
  }
  if (download.length) {
    const r = await request({ type: 'get', paths: download });
    for (const [rel, content] of Object.entries(r.files)) {
      const abs = path.join(dir, rel);
      if (content == null) { fs.rmSync(abs, { force: true }); delete base.files[rel]; }
      else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); base.files[rel] = hash(content); }
    }
  }
  writeBaseline(dir, base);
  if (upload.length) await pushFiles(dir, upload);
  live.conflicts = conflicts;
  return { downloaded: download, uploaded: upload, conflicts };
}

async function connect(opts) {
  disconnect();
  cfg = opts;
  attach(await open(opts.url));
  const w = await request({ type: 'hello', user: opts.user, token: opts.token, project: opts.project });
  live = { connected: true, user: w.user, role: w.role, project: opts.project, locks: w.locks, presence: w.presence, conflicts: [] };
  const sync = await reconcile(opts.dir, w.manifest);
  return { ...state(), sync };
}

// Download a server project into an empty folder.
async function checkout(opts) {
  if (fs.existsSync(opts.dir) && fs.readdirSync(opts.dir).length) throw new Error('La cartella di destinazione non è vuota');
  fs.mkdirSync(opts.dir, { recursive: true });
  return connect(opts);
}

// Create the project on the server from the local folder.
async function publish(opts) {
  disconnect();
  cfg = opts;
  attach(await open(opts.url));
  const files = localFiles(opts.dir);
  const w = await request({ type: 'hello', user: opts.user, token: opts.token, project: opts.project, create: true, files });
  live = { connected: true, user: w.user, role: w.role, project: opts.project, locks: w.locks, presence: w.presence, conflicts: [] };
  writeBaseline(opts.dir, { files: w.manifest });
  return state();
}

async function lock(item) {
  const r = await request({ type: 'lock', item });
  return r.ok ? { ok: true } : { ok: false, holder: r.holder };
}
async function unlock(item) { if (live.connected) await request({ type: 'unlock', item }); return true; }
async function chat(text) { await request({ type: 'chat', text }); return true; }

function state() { return { ...live }; }
function isConnected() { return live.connected; }

function disconnect() {
  if (ws) { try { ws.close(); } catch { /* closed */ } }
  ws = null;
  live = { connected: false, user: '', project: '', locks: {}, presence: [], conflicts: [], role: '' };
  return true;
}

module.exports = { connect, checkout, publish, pushFiles: (dir, rels) => pushFiles(dir, rels).catch(() => null), pushNow: pushFiles, lock, unlock, chat, state, isConnected, disconnect, reconcile };
