'use strict';
// Publish the generated app to a folder, an SFTP server or an FTP(S) server.
// Incremental: a per-profile state file remembers the hash of every uploaded file.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const sha = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

function plan(outDir, profile, stateFile) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first deploy */ }
  if (profile.full) state = {};
  const upload = (profile.settings && profile.settings.uploadDir) || 'files';
  const files = walk(outDir).filter((rel) => {
    if (rel === 'config/secrets.php') return !!profile.uploadSecrets;
    if (rel.startsWith(upload + '/') && rel !== `${upload}/.htaccess`) return false; // user uploads stay on the server
    return !rel.startsWith('.mc_');
  });
  const todo = [];
  const hashes = {};
  for (const rel of files) {
    hashes[rel] = sha(path.join(outDir, rel));
    if (state[rel] !== hashes[rel]) todo.push(rel);
  }
  return { todo, hashes, total: files.length };
}

async function withTarget(profile, password, fn) {
  if (profile.type === 'folder') {
    return fn({
      mkdir: async (d) => fs.mkdirSync(path.join(profile.remoteDir, d), { recursive: true }),
      put: async (local, rel) => fs.copyFileSync(local, path.join(profile.remoteDir, rel)),
    });
  }
  if (profile.type === 'sftp') {
    const { Client } = require('ssh2');
    const conn = new Client();
    await new Promise((resolve, reject) => {
      conn.on('ready', resolve).on('error', reject).connect({
        host: profile.host, port: Number(profile.port) || 22, username: profile.user,
        password: profile.keyFile ? undefined : password, privateKey: profile.keyFile ? fs.readFileSync(profile.keyFile) : undefined,
        passphrase: profile.keyFile ? password || undefined : undefined, readyTimeout: 15000,
      });
    });
    try {
      const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
      const made = new Set();
      const mkdirp = async (d) => {
        const parts = path.posix.join(profile.remoteDir, d).split('/');
        let cur = '';
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : (p === '' ? '/' : p);
          if (!p || made.has(cur)) continue;
          await new Promise((res) => sftp.mkdir(cur, () => res()));
          made.add(cur);
        }
      };
      return await fn({
        mkdir: mkdirp,
        put: (local, rel) => new Promise((res, rej) => sftp.fastPut(local, path.posix.join(profile.remoteDir, rel), (e) => (e ? rej(e) : res()))),
      });
    } finally { conn.end(); }
  }
  if (profile.type === 'ftp') {
    const ftp = require('basic-ftp');
    const client = new ftp.Client(20000);
    await client.access({ host: profile.host, port: Number(profile.port) || 21, user: profile.user, password, secure: !!profile.secure, secureOptions: { rejectUnauthorized: !profile.insecure } });
    try {
      return await fn({
        mkdir: async (d) => { await client.ensureDir(path.posix.join(profile.remoteDir, d)); await client.cd('/'); },
        put: async (local, rel) => client.uploadFrom(local, path.posix.join(profile.remoteDir, rel)),
      });
    } finally { client.close(); }
  }
  throw new Error(`Tipo di destinazione sconosciuto: ${profile.type}`);
}

async function test(profile, password) {
  await withTarget(profile, password, async (t) => { await t.mkdir(''); });
  return true;
}

async function run(outDir, profile, password, stateFile, progress = () => {}) {
  if (!fs.existsSync(path.join(outDir, 'index.php'))) throw new Error('Genera prima l\'applicazione');
  const { todo, hashes, total } = plan(outDir, profile, stateFile);
  const started = Date.now();
  let done = 0;
  await withTarget(profile, password, async (t) => {
    const dirs = [...new Set(todo.map((rel) => path.posix.dirname(rel)))].sort();
    for (const d of dirs) await t.mkdir(d === '.' ? '' : d);
    const upload = (profile.settings && profile.settings.uploadDir) || 'files';
    await t.mkdir(upload);
    for (const rel of todo) {
      await t.put(path.join(outDir, rel), rel);
      done++;
      progress({ done, total: todo.length, file: rel });
    }
  });
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(hashes));
  return { uploaded: done, unchanged: total - todo.length, ms: Date.now() - started };
}

module.exports = { run, test, plan };
