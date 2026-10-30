'use strict';
// Built-in preview server: `php -S` on the generated output. When the local PHP lacks the
// PDO driver the project needs, a Docker image with PHP 8.3 and all drivers is used instead.

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const PDO_EXT = { mysql: 'pdo_mysql', pgsql: 'pdo_pgsql', sqlsrv: 'pdo_sqlsrv', oracle: 'pdo_oci', sqlite: 'pdo_sqlite' };
const IMAGE = 'mibcrude-php:8.3';
let proc = null;
let info = null;
let state = { running: false, url: '', mode: '', log: '' };

function phpInfo(refresh) {
  if (info && !refresh) return info;
  try {
    const bin = process.env.MIBCRUDE_PHP || 'php';
    const version = execFileSync(bin, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' }).trim();
    const modules = execFileSync(bin, ['-m'], { encoding: 'utf8' }).split('\n').map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith('['));
    info = { ok: true, bin, version, modules };
  } catch (e) {
    info = { ok: false, bin: 'php', version: '', modules: [], error: 'PHP non trovato: installa php-cli oppure Docker' };
  }
  try { execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe' }); info.docker = true; } catch { info.docker = false; }
  return info;
}

// php -l on an event body wrapped in a function with the event's arguments.
function lintSnippet(code, args) {
  const i = phpInfo();
  if (!i.ok) return { ok: true, skipped: true };
  const body = String(code).replace(/^\s*<\?php\s*/, '');
  const file = path.join(os.tmpdir(), `mibcrude-lint-${process.pid}.php`);
  fs.writeFileSync(file, `<?php\nfunction __mc_event(${args || ''}) {\n${body}\n}\n`);
  try {
    execFileSync(i.bin, ['-l', file], { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stdout || e.stderr || '').replace(file, 'evento').trim();
    const m = msg.match(/on line (\d+)/);
    return { ok: false, message: msg.split('\n')[0], line: m ? Math.max(1, Number(m[1]) - 2) : null };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function freePort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(start + 1)));
    s.listen(start, '127.0.0.1', () => s.close(() => resolve(start)));
  });
}

function dockerImage() {
  try { execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'pipe' }); return; } catch { /* build */ }
  execFileSync('docker', ['build', '-t', IMAGE, path.join(__dirname, 'docker').replace('app.asar', 'app.asar.unpacked')], { stdio: 'pipe', timeout: 15 * 60 * 1000 });
}

async function start(proj, outDir) {
  stopAll();
  if (!fs.existsSync(path.join(outDir, 'index.php'))) throw new Error('Genera prima l\'applicazione');
  const i = phpInfo(true);
  const drivers = [...new Set(proj.connections.map((c) => c.driver))];
  const missing = drivers.filter((d) => !i.modules.includes(PDO_EXT[d]));
  const port = await freePort(8090);
  const url = `http://127.0.0.1:${port}/index.php`;
  let mode = 'php';
  if (i.ok && !missing.length) {
    proc = spawn(i.bin, ['-S', `127.0.0.1:${port}`, '-t', outDir], { cwd: outDir });
  } else if (i.docker) {
    mode = 'docker';
    dockerImage();
    proc = spawn('docker', ['run', '--rm', '--network', 'host', '-v', `${outDir}:/app`, '-w', '/app', IMAGE, 'php', '-S', `127.0.0.1:${port}`, '-t', '/app']);
  } else {
    throw new Error(i.ok ? `Il PHP locale (${i.version}) non ha i driver ${missing.map((d) => PDO_EXT[d]).join(', ')} e Docker non è disponibile` : i.error);
  }
  state = { running: true, url, mode, log: '', php: mode === 'php' ? i.version : '8.3 (Docker)' };
  const onData = (d) => { state.log = (state.log + d.toString()).slice(-20000); };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('exit', () => { state.running = false; proc = null; });
  for (let n = 0; n < 60; n++) {
    try { await fetch(url.replace('index.php', '')); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  return state;
}

function stopAll() {
  if (proc) { try { proc.kill(); } catch { /* gone */ } proc = null; }
  state = { ...state, running: false };
  return true;
}

function status() { return state; }

module.exports = { phpInfo, lintSnippet, start, stopAll, status, PDO_EXT };
