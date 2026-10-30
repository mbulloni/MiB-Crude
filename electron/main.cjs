'use strict';
// MiB-Crude designer: Electron main process. The renderer edits the project object;
// everything touching disk, databases, PHP, Git, deploy targets or the team server lives here.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');

// `mib-crude --team-server --data DIR [--port N] [--add-user NAME]`: run the team server headless.
const TEAM_SERVER = process.argv.includes('--team-server');
if (TEAM_SERVER) {
  app.disableHardwareAcceleration();
  require('../server/mibcrude-server.cjs').cli();
}
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const P = require('../core/project.cjs');
const D = require('../core/db.cjs');
const W = require('../core/wizard.cjs');
const G = require('../core/generator.cjs');
const preview = require('./preview.cjs');
const deploy = require('./deploy.cjs');
const git = require('./git.cjs');
const team = require('./team.cjs');

let win = null;
let current = null; // { dir, remote?: {url, project} }
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return { recent: [], user: os.userInfo().username } }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}
function addRecent(dir) {
  const s = readSettings();
  s.recent = [dir, ...(s.recent || []).filter((d) => d !== dir)].slice(0, 12);
  writeSettings(s);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 650,
    backgroundColor: '#f3f4f6', title: 'MiB-Crude', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'r' && input.shift) win.webContents.reload();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5175');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Automation hook used by screenshot/smoke scripts: MIBCRUDE_SCRIPT=/path/script.cjs
  if (process.env.MIBCRUDE_SCRIPT) win.webContents.once('did-finish-load', () => require(process.env.MIBCRUDE_SCRIPT)({ win, app }));
  win.on('close', (e) => {
    if (win.__allowClose) return;
    e.preventDefault();
    win.webContents.send('app:closing');
  });
}

// IPC helper: every handler returns {ok} or {error}.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: await fn(...args) }; } catch (err) { return { error: err && err.message ? err.message : String(err), code: err && err.code }; }
  });
}

function need() {
  if (!current) throw new Error('Nessun progetto aperto');
  return current;
}

function secrets() { return P.readSecrets(need().dir); }

function connById(proj, id) {
  const c = proj.connections.find((x) => x.id === id);
  if (!c) throw new Error(`Connessione ${id} non trovata`);
  return c;
}
const pwOf = (id) => ((secrets().connections || {})[id] || '');

// --- app / settings ---------------------------------------------------------------

handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, settings: readSettings(), home: os.homedir(), openOnStart: process.env.MIBCRUDE_OPEN || '' }));
handle('app:settings', (patch) => { const s = { ...readSettings(), ...patch }; writeSettings(s); return s; });
handle('app:quit', () => { win.__allowClose = true; preview.stopAll(); team.disconnect(); app.quit(); });
handle('shell:open', (url) => shell.openExternal(url));
handle('shell:showItem', (p) => shell.showItemInFolder(p));
handle('shell:openPath', (p) => shell.openPath(p));

handle('dialog:dir', async (title, defaultPath) => {
  const r = await dialog.showOpenDialog(win, { title, defaultPath: defaultPath || os.homedir(), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('dialog:file', async (title, filters) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: filters || [] });
  return r.canceled ? null : r.filePaths[0];
});

// --- project ----------------------------------------------------------------------

handle('project:new', (dir, name) => {
  const proj = P.createProject(dir, name);
  current = { dir };
  addRecent(dir);
  try { git.init(dir); } catch { /* git optional */ }
  return proj;
});
handle('import:phpr', async (file, parentDir) => {
  const { importPhpr } = require('../core/phpr-import.cjs');
  const name = path.basename(file, '.phpr').replace(/[^A-Za-z0-9_.-]/g, '_');
  let dir = path.join(parentDir, name);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(parentDir, `${name}_${i}`);
  const r = await importPhpr(file, dir);
  current = { dir };
  addRecent(dir);
  try { await git.init(dir); } catch { /* git optional */ }
  return { proj: r.proj, report: r.report, reportFile: path.join(dir, 'import-phpr', 'REPORT.md') };
});
handle('project:open', (dir) => {
  const proj = P.loadProject(dir);
  current = { dir };
  addRecent(dir);
  return proj;
});
handle('project:save', (proj) => {
  const c = need();
  const res = P.saveProject({ ...proj, dir: c.dir });
  if (team.isConnected()) team.pushFiles(c.dir, [...res.changed, ...res.removed]);
  return res;
});
handle('project:close', () => { current = null; preview.stopAll(); team.disconnect(); return true; });
handle('project:reload', () => P.loadProject(need().dir));

handle('secrets:get', () => secrets());
handle('secrets:set', (s) => { P.writeSecrets(need().dir, s); return true; });
handle('local:get', (name) => { try { return JSON.parse(fs.readFileSync(P.localPath(need().dir, name + '.json'), 'utf8')); } catch { return null; } });
handle('local:set', (name, data) => {
  const f = P.localPath(need().dir, name + '.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2), { mode: 0o600 });
  return true;
});

// --- database -----------------------------------------------------------------------

handle('db:drivers', () => D.DRIVERS);
handle('db:test', async (conn, password) => {
  const started = Date.now();
  await W.withConnection(conn, password, async (c) => { await D.listTables(c, conn); });
  return { ms: Date.now() - started };
});
handle('db:tables', async (proj, connId) => {
  const conn = connById(proj, connId);
  return W.withConnection(conn, pwOf(connId), (c) => D.listTables(c, conn));
});
handle('db:describe', async (proj, connId, table) => {
  const conn = connById(proj, connId);
  return W.withConnection(conn, pwOf(connId), (c) => D.describeTable(c, conn, table));
});
handle('db:preview', async (proj, connId, sql, limit) => {
  const conn = connById(proj, connId);
  return W.withConnection(conn, pwOf(connId), (c) => D.preview(c, sql, limit || 100));
});
handle('wizard:import', async (proj, connId, names) => {
  const added = await W.importTables(proj, connById(proj, connId), pwOf(connId), names);
  return { proj, added };
});
const TPL = require('../core/templates.cjs');
handle('templates:list', () => TPL.list());
handle('templates:apply', async (proj, connId, id, opts) => {
  const r = await TPL.apply(proj, connById(proj, connId), pwOf(connId), id, opts || {});
  return { proj, ...r };
});
handle('wizard:sqlview', async (proj, connId, name, sql) => {
  await W.addSqlView(proj, connById(proj, connId), pwOf(connId), name, sql);
  return proj;
});
handle('wizard:refresh', async (proj, table) => {
  const t = proj.tables.find((x) => x.name === table);
  const res = await W.refreshTable(proj, connById(proj, t.connection), pwOf(t.connection), table);
  return { proj, ...res };
});

// --- table structure (create/alter/drop), SQL scripts --------------------------------------

const DDL = require('../core/ddl.cjs');
handle('ddl:build', (kind, ...args) => {
  if (kind === 'create') return [DDL.createTable(...args)];
  if (kind === 'alter') return DDL.alterTable(...args);
  if (kind === 'drop') return [DDL.dropTable(...args)];
  throw new Error(`DDL sconosciuto: ${kind}`);
});
handle('db:columns', async (proj, connId, table) => {
  const conn = connById(proj, connId);
  const d = await W.withConnection(conn, pwOf(connId), (c) => D.describeTable(c, conn, table));
  return d.columns.map(DDL.fromDb);
});
handle('db:exec', async (proj, connId, statements) => {
  const conn = connById(proj, connId);
  return W.withConnection(conn, pwOf(connId), async (c) => {
    let n = 0;
    for (const sql of statements) { if (!/^\s*--/.test(sql)) { await c.query(sql); n++; } }
    return n;
  });
});
handle('ddl:script', async (proj, connId, tables, dialect, withData, limit) => {
  const conn = connById(proj, connId);
  return W.withConnection(conn, pwOf(connId), async (c) => {
    const out = [];
    for (const name of tables) {
      const d = await D.describeTable(c, conn, name);
      const t = { name, columns: d.columns.map(DDL.fromDb) };
      if (withData) {
        const q = DDL.quote(conn.driver === 'oracle' ? 'oracle' : conn.driver, name);
        const sql = conn.driver === 'sqlsrv' ? `SELECT TOP ${Number(limit) || 1000} * FROM ${q}` : conn.driver === 'oracle' ? `SELECT * FROM ${q} WHERE ROWNUM <= ${Number(limit) || 1000}` : `SELECT * FROM ${q} LIMIT ${Number(limit) || 1000}`;
        t.rows = await c.query(sql);
      }
      out.push(t);
    }
    return DDL.script(dialect, out, { drop: true });
  });
});
handle('file:save', async (title, defaultName, content) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath: path.join(os.homedir(), defaultName) });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content);
  return r.filePath;
});
handle('file:read', async (title, filters) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: filters || [] });
  if (r.canceled) return null;
  return { path: r.filePaths[0], content: fs.readFileSync(r.filePaths[0], 'utf8') };
});

// --- graphic themes (purchased templates) -------------------------------------------------------

const Themes = require('../core/themes/index.cjs');
handle('themes:list', () => Themes.list(Themes.DEFAULT_LIB));
handle('themes:scan', (dir) => Themes.scan(dir));
handle('themes:install', (found, variant) => Themes.install(found, variant, Themes.DEFAULT_LIB));
handle('themes:remove', (id) => Themes.remove(Themes.DEFAULT_LIB, id));

// --- generate, preview, deploy ---------------------------------------------------------

handle('gen:check', (proj) => G.check(proj));
handle('gen:generate', (proj, opts = {}) => {
  const c = need();
  const res = G.generate({ ...proj, dir: c.dir }, { secrets: secrets(), debug: !!opts.debug, force: !!opts.force });
  const php = preview.phpInfo();
  res.lint = php.ok ? G.lint(res.outDir, php.bin) : [];
  return res;
});
handle('gen:hash', (pw) => G.hashPassword(pw));
handle('php:info', () => preview.phpInfo(true));
handle('php:lintEvent', (code, args) => preview.lintSnippet(code, args));
handle('preview:start', (proj) => preview.start({ ...proj, dir: need().dir }, P.outputDir({ ...proj, dir: need().dir })));
handle('preview:stop', () => preview.stopAll());
handle('preview:status', () => preview.status());
handle('preview:open', (url, internal) => {
  if (!internal) return shell.openExternal(url);
  const w = new BrowserWindow({ width: 1280, height: 860, title: 'Anteprima', icon: path.join(__dirname, 'icon.png'), webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'preview' } });
  w.setMenuBarVisibility(false);
  w.loadURL(url);
  return true;
});
handle('deploy:run', async (proj, profile, password) => {
  const out = P.outputDir({ ...proj, dir: need().dir });
  return deploy.run(out, profile, password, P.localPath(need().dir, `deploy-state-${profile.id}.json`), (p) => win.webContents.send('deploy:progress', p));
});
handle('deploy:test', (profile, password) => deploy.test(profile, password));

// --- git ---------------------------------------------------------------------------------

handle('git:status', () => git.status(need().dir));
handle('git:log', () => git.log(need().dir));
handle('git:diff', (file) => git.diff(need().dir, file));
handle('git:commit', (msg, author) => git.commit(need().dir, msg, author));
handle('git:pull', () => git.pull(need().dir));
handle('git:push', () => git.push(need().dir));
handle('git:init', () => git.init(need().dir));
handle('git:setRemote', (url) => git.setRemote(need().dir, url));
handle('git:resolve', (file, side) => git.resolve(need().dir, file, side));
handle('git:clone', async (url, dir) => { await git.clone(url, dir); return P.loadProject(dir); });

// --- team server -----------------------------------------------------------------------------

handle('team:connect', async (url, user, token, projectName) => {
  const c = need();
  return team.connect({ url, user, token, project: projectName, dir: c.dir, onEvent: (ev) => win && win.webContents.send('team:event', ev) });
});
handle('team:disconnect', () => team.disconnect());
handle('team:lock', (item) => team.lock(item));
handle('team:unlock', (item) => team.unlock(item));
handle('team:state', () => team.state());
handle('team:chat', (text) => team.chat(text));
handle('team:checkout', async (url, user, token, projectName, dir) => {
  await team.checkout({ url, user, token, project: projectName, dir });
  current = { dir };
  addRecent(dir);
  return P.loadProject(dir);
});
handle('team:publish', async (url, user, token, projectName) => team.publish({ url, user, token, project: projectName, dir: need().dir }));

if (!TEAM_SERVER) app.whenReady().then(createWindow);
if (!TEAM_SERVER) app.on('window-all-closed', () => { preview.stopAll(); app.quit(); });
