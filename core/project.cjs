'use strict';
// Project model. A project is a folder of small, deterministic text files so that
// several developers can work on it through Git (clean diffs, few conflicts) or through
// the MiB-Crude team server (locks per item, live sync).
//
//   mibcrude.json              project settings
//   connections/<id>.json      database connections (no passwords)
//   tables/<name>.json         one datasource (table, view or custom SQL) with fields and pages
//   events/_global/<Ev>.php    global events
//   events/<table>/<Ev>.php    table events
//   menu.json                  application menu
//   security.json              login, groups, permissions, providers
//   lang/<code>.json           custom translations
//   reports/, charts/, dashboards/   one file each
//   custom/                    files copied as-is into the generated app
//   .mibcrude-local/           per-developer, never committed (secrets, output, ui state)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT_VERSION = 1;
const PROJECT_FILE = 'mibcrude.json';
const LOCAL_DIR = '.mibcrude-local';

// Stable JSON: sorted object keys (arrays keep their order), 2 spaces, trailing newline.
function stableStringify(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

// File names for item ids: keep letters, digits, _ - . ; everything else becomes _
function safeName(name) {
  return String(name).replace(/[^A-Za-z0-9_.-]/g, '_');
}

function defaultProject(name) {
  return {
    formatVersion: FORMAT_VERSION,
    name,
    title: { it: name, en: name },
    languages: ['it', 'en'],
    defaultLanguage: 'it',
    defaultConnection: 'main',
    theme: { name: 'default', primary: '#0d6efd', mode: 'auto', layout: 'sidebar', density: 'normal' },
    settings: {
      pageSize: 20,
      dateFormat: 'd/m/Y',
      dateTimeFormat: 'd/m/Y H:i',
      decimalSeparator: ',',
      thousandsSeparator: '.',
      currency: '€',
      uploadDir: 'files',
      maxUploadMb: 20,
      timezone: 'Europe/Rome',
      homePage: '',
      audit: false,
      recordLocking: false,
      api: { enabled: false, auth: 'apikey' },
    },
    output: { dir: '' },
  };
}

function defaultSecurity() {
  return {
    enabled: false,
    mode: 'database', // none | hardcoded | database
    hardcoded: { username: 'admin', passwordHash: '' },
    users: { managed: true, table: '', usernameField: '', passwordField: '', emailField: '', fullNameField: '', groupField: '', activeField: '' },
    guestAccess: false,
    registration: { enabled: false, defaultGroup: 'users', emailVerify: false },
    passwordReset: { enabled: true },
    captcha: { login: false, register: true },
    passwordPolicy: { minLength: 8, requireDigit: true, requireUpper: false, requireSymbol: false },
    maxLoginAttempts: 5,
    sessionMinutes: 120,
    twoFactor: { enabled: false },
    dynamicPermissions: true,
    groups: [
      { id: 'admin', label: { it: 'Amministratori', en: 'Administrators' }, admin: true },
      { id: 'users', label: { it: 'Utenti', en: 'Users' } },
    ],
    // permissions[group][table] = letters: A add, E edit, D delete, S list/search, V view, P print/export, I import
    permissions: {},
    // ownership: table -> { field, mode: 'view'|'edit' } (rows limited to the owner)
    ownership: {},
    providers: {
      ldap: { enabled: false, host: '', port: 389, baseDn: '', domain: '', bindDn: '', userFilter: '(sAMAccountName=%s)', useTls: false, groupMap: {} },
      oidc: [],
      saml: { enabled: false, idpEntityId: '', idpSsoUrl: '', idpCert: '', spEntityId: '' },
    },
  };
}

function defaultMenu() {
  return { items: [] };
}

// --- I/O ---------------------------------------------------------------------

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeIfChanged(file, text) {
  try { if (fs.readFileSync(file, 'utf8') === text) return false; } catch { /* new file */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

function listJson(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(dir, f), null)).filter(Boolean);
  } catch { return []; }
}

function readEvents(dir) {
  const out = {};
  let groups = [];
  try { groups = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const g of groups.sort()) {
    for (const f of fs.readdirSync(path.join(dir, g)).filter((x) => x.endsWith('.php')).sort()) {
      (out[g] ||= {})[f.slice(0, -4)] = fs.readFileSync(path.join(dir, g, f), 'utf8');
    }
  }
  return out;
}

function isProject(dir) {
  return fs.existsSync(path.join(dir, PROJECT_FILE));
}

function createProject(dir, name) {
  if (isProject(dir)) throw new Error('Esiste già un progetto in questa cartella');
  fs.mkdirSync(dir, { recursive: true });
  const proj = {
    dir,
    project: defaultProject(name || path.basename(dir)),
    connections: [],
    tables: [],
    events: {},
    menu: defaultMenu(),
    security: defaultSecurity(),
    lang: {},
    reports: [],
    charts: [],
    dashboards: [],
  };
  saveProject(proj);
  writeIfChanged(path.join(dir, '.gitignore'), `${LOCAL_DIR}/\noutput/\n`);
  return proj;
}

function loadProject(dir) {
  if (!isProject(dir)) throw new Error(`Nessun progetto MiB-Crude in ${dir}`);
  const project = { ...defaultProject(path.basename(dir)), ...readJson(path.join(dir, PROJECT_FILE), {}) };
  project.settings = { ...defaultProject('').settings, ...project.settings };
  project.theme = { ...defaultProject('').theme, ...project.theme };
  const sec = readJson(path.join(dir, 'security.json'), {});
  const security = { ...defaultSecurity(), ...sec };
  security.providers = { ...defaultSecurity().providers, ...(sec.providers || {}) };
  const lang = {};
  try {
    for (const f of fs.readdirSync(path.join(dir, 'lang')).filter((x) => x.endsWith('.json'))) lang[f.slice(0, -5)] = readJson(path.join(dir, 'lang', f), {});
  } catch { /* none */ }
  return {
    dir,
    project,
    connections: listJson(path.join(dir, 'connections')),
    tables: listJson(path.join(dir, 'tables')),
    events: readEvents(path.join(dir, 'events')),
    menu: readJson(path.join(dir, 'menu.json'), defaultMenu()),
    security,
    lang,
    reports: listJson(path.join(dir, 'reports')),
    charts: listJson(path.join(dir, 'charts')),
    dashboards: listJson(path.join(dir, 'dashboards')),
  };
}

// Serialize the in-memory project to { relPath: text }. Used for saving and for team sync.
function serialize(proj) {
  const files = {};
  files[PROJECT_FILE] = stableStringify(proj.project);
  files['menu.json'] = stableStringify(proj.menu);
  files['security.json'] = stableStringify(proj.security);
  for (const c of proj.connections) files[`connections/${safeName(c.id)}.json`] = stableStringify(c);
  for (const t of proj.tables) files[`tables/${safeName(t.name)}.json`] = stableStringify(t);
  for (const [code, dict] of Object.entries(proj.lang || {})) files[`lang/${safeName(code)}.json`] = stableStringify(dict);
  for (const kind of ['reports', 'charts', 'dashboards']) for (const r of proj[kind] || []) files[`${kind}/${safeName(r.name)}.json`] = stableStringify(r);
  for (const [group, evs] of Object.entries(proj.events || {})) {
    for (const [name, code] of Object.entries(evs)) if (code != null && code.trim() !== '') files[`events/${safeName(group)}/${safeName(name)}.php`] = code.endsWith('\n') ? code : code + '\n';
  }
  return files;
}

// Folders whose contents are fully owned by the serializer (stale files are deleted).
const MANAGED_DIRS = ['connections', 'tables', 'lang', 'reports', 'charts', 'dashboards', 'events'];

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function saveProject(proj) {
  const files = serialize(proj);
  const changed = [];
  for (const [rel, text] of Object.entries(files)) if (writeIfChanged(path.join(proj.dir, rel), text)) changed.push(rel);
  const removed = [];
  for (const d of MANAGED_DIRS) {
    for (const rel of walk(path.join(proj.dir, d)).map((r) => `${d}/${r}`)) {
      if (!(rel in files) && /\.(json|php)$/.test(rel)) { fs.unlinkSync(path.join(proj.dir, rel)); removed.push(rel); }
    }
  }
  return { changed, removed };
}

// --- per-developer local data (never committed) --------------------------------

function localPath(dir, ...p) { return path.join(dir, LOCAL_DIR, ...p); }

function readSecrets(dir) { return readJson(localPath(dir, 'secrets.json'), {}); }

function writeSecrets(dir, secrets) {
  const file = localPath(dir, 'secrets.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableStringify(secrets), { mode: 0o600 });
}

function outputDir(proj) {
  const d = proj.project.output && proj.project.output.dir;
  return d ? path.resolve(proj.dir, d) : localPath(proj.dir, 'output');
}

module.exports = {
  FORMAT_VERSION, PROJECT_FILE, LOCAL_DIR, MANAGED_DIRS,
  stableStringify, hash, safeName,
  defaultProject, defaultSecurity, defaultMenu,
  isProject, createProject, loadProject, saveProject, serialize, walk,
  readSecrets, writeSecrets, localPath, outputDir,
};
