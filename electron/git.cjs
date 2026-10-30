'use strict';
// Git integration for the project folder (multi-developer workflow without the team server).

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function run(dir, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: dir, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) } }, (err, stdout, stderr) => {
      if (err && !opts.allowFail) reject(new Error((stderr || stdout || err.message).trim()));
      else resolve({ out: stdout, err: stderr, code: err ? err.code : 0 });
    });
  });
}

function isRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

async function init(dir) {
  if (isRepo(dir)) return true;
  await run(dir, ['init', '-b', 'main']);
  return true;
}

async function status(dir) {
  if (!isRepo(dir)) return { repo: false };
  const br = (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })).out.trim();
  const remote = (await run(dir, ['remote', 'get-url', 'origin'], { allowFail: true })).out.trim();
  const st = (await run(dir, ['status', '--porcelain=v1', '-b'])).out.split('\n').filter(Boolean);
  const head = st[0] && st[0].startsWith('##') ? st.shift() : '';
  const ahead = Number((head.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = Number((head.match(/behind (\d+)/) || [])[1] || 0);
  const files = st.map((l) => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }));
  const conflicts = files.filter((f) => ['UU', 'AA', 'DU', 'UD'].includes(f.code)).map((f) => f.file);
  return { repo: true, branch: br, remote, ahead, behind, files, conflicts };
}

async function log(dir) {
  if (!isRepo(dir)) return [];
  const r = await run(dir, ['log', '-40', '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=format:%d/%m/%Y %H:%M'], { allowFail: true });
  return r.out.split('\n').filter(Boolean).map((l) => { const [hash, author, date, subject] = l.split('\t'); return { hash, author, date, subject }; });
}

async function diff(dir, file) {
  const r = await run(dir, ['diff', 'HEAD', '--', file], { allowFail: true });
  if (r.out.trim()) return r.out;
  // untracked file: show it as an addition
  try { return fs.readFileSync(path.join(dir, file), 'utf8').split('\n').map((l) => '+' + l).join('\n'); } catch { return ''; }
}

async function commit(dir, msg, author) {
  await run(dir, ['add', '-A']);
  const env = author && author.name ? { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email || '', GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email || '' } : {};
  await run(dir, ['commit', '-m', msg || 'Aggiornamento progetto'], { env });
  return true;
}

async function pull(dir) {
  const r = await run(dir, ['pull', '--no-rebase', '--no-edit'], { allowFail: true });
  const st = await status(dir);
  return { output: (r.out + r.err).trim(), conflicts: st.conflicts };
}

async function push(dir) {
  const r = await run(dir, ['push', '-u', 'origin', 'HEAD']);
  return (r.out + r.err).trim();
}

async function setRemote(dir, url) {
  const has = (await run(dir, ['remote'], { allowFail: true })).out.split('\n').includes('origin');
  await run(dir, has ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url]);
  return true;
}

// Resolve a conflicted file keeping our or their version.
async function resolve(dir, file, side) {
  await run(dir, ['checkout', side === 'theirs' ? '--theirs' : '--ours', '--', file]);
  await run(dir, ['add', '--', file]);
  return true;
}

async function clone(url, dir) {
  await run(path.dirname(dir), ['clone', url, dir]);
  return true;
}

module.exports = { init, status, log, diff, commit, pull, push, setRemote, resolve, clone, isRepo };
