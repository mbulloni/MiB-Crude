'use strict';
// Import of phpr projects (.phpr, phpr 10.x XML) into a MiB-Crude project.
//  - connections (passwords go to .mibcrude-local/secrets.json, never into the project files)
//  - tables, SQL views, charts, field settings (labels, view/edit formats, lookups, validation)
//  - pages and the fields shown on each page, read from the PAGES*.sqlite store next to the .phpr
//  - master/detail links, menu, user groups and permissions, login settings
//  - PHP events, wrapped so that phpr variables ($values, $oldvalues, $keys, $where, $data,
//    $record, $pageObject, $xt...) exist; the runtime adds DB::, Security:: and helper functions.
// Everything that cannot be converted is listed in the report and saved under import-phpr/.

const fs = require('node:fs');
const path = require('node:path');
const { XMLParser } = require('fast-xml-parser');
const P = require('./project.cjs');
const { genericType, } = require('./db.cjs');
const { defaultPages } = require('./defaults.cjs');
const php8 = require('./php8-compat.cjs');

// PHP 7.4 code from phpr -> PHP 8: safe rewrites, the rest goes to the report.
function up8(code, where, ctx) {
  const r = php8.upgrade(code);
  if (r.fixes.length || r.problems.length) ctx.php8.push({ where, fixes: r.fixes, problems: r.problems });
  return r.code;
}

const LANGS = { Italian: 'it', English: 'en', French: 'fr', German: 'de', Spanish: 'es', Portuguese: 'pt', Dutch: 'nl', Romanian: 'ro', Polish: 'pl' };
const DRIVER = { mysql: 'mysql', mariadb: 'mysql', postgre: 'pgsql', postgresql: 'pgsql', mssql: 'sqlsrv', sqlserver: 'sqlsrv', oracle: 'oracle', sqlite: 'sqlite', sqlite3: 'sqlite' };
const DB_TYPE = { 0: 'mysql', 1: 'sqlsrv', 2: 'oracle', 3: 'pgsql', 6: 'sqlite' };

// ADO data types used by phpr -> generic type + SQL-ish label.
function adoType(n) {
  const t = Number(n);
  if ([2, 3, 16, 17, 18, 19, 20, 21].includes(t)) return 'int';
  if ([4, 5, 6, 14, 131, 139].includes(t)) return 'decimal';
  if (t === 11) return 'bool';
  if ([7, 133].includes(t)) return 'date';
  if (t === 134) return 'time';
  if (t === 135) return 'datetime';
  if ([201, 203].includes(t)) return 'text';
  if ([128, 204, 205].includes(t)) return 'binary';
  return 'string';
}

const arr = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const str = (x) => (x == null ? '' : typeof x === 'object' ? (x['#text'] != null ? String(x['#text']) : '') : String(x));
const bool = (x) => str(x) === '1';
const textOf = (x) => (x && typeof x === 'object' ? str(x.text) : str(x));

function parseXml(file) {
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: false,
    isArray: (name) => name === 'v' || name === 'MenuNode',
  });
  return parser.parse(fs.readFileSync(file, 'utf8')).project;
}

// Newest PAGES*.sqlite of the project (phpr 10 keeps page layouts there).
async function readPages(phprFile) {
  const dir = path.dirname(phprFile);
  // phpr 10 keeps the live store in subversion/PAGES.sqlite; PAGES_<date>.sqlite are backups.
  const live = path.join(dir, 'subversion', 'PAGES.sqlite');
  const backups = fs.readdirSync(dir).filter((f) => /^PAGES.*\.sqlite3?$/i.test(f)).map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const cands = [...(fs.existsSync(live) ? [live] : []), ...backups];
  if (!cands.length) return null;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(cands[0]));
  const out = {};
  try {
    const st = db.prepare('SELECT "ID", "TABLE", "TYPE", "DISABLED", "PAGEINFO", "DELETED", "default" FROM PAGES');
    while (st.step()) {
      const r = st.getAsObject();
      if (Number(r.DELETED)) continue;
      let info = {};
      try { info = JSON.parse(r.PAGEINFO || '{}'); } catch { /* ignore */ }
      (out[r.TABLE] ||= []).push({ id: r.ID, type: r.TYPE, disabled: Number(r.DISABLED) === 1 || info.disabled === 1, isDefault: String(r.default) === '1' || info.default === 1, info });
    }
    st.free();
  } finally { db.close(); }
  return { file: cands[0], tables: out };
}

// Latest source of every event file in subversion/EVENTS.sqlite (page snippets, button events).
async function readEventStore(phprFile) {
  const f = path.join(path.dirname(phprFile), 'subversion', 'EVENTS.sqlite');
  if (!fs.existsSync(f)) return {};
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(f));
  const out = {};
  try {
    const st = db.prepare(`SELECT f.NAME AS name, r.SOURCE AS src FROM FILES f JOIN REVISIONDATA r ON r.FILEID = f.ID
      WHERE r.NUMBER = (SELECT MAX(NUMBER) FROM REVISIONDATA x WHERE x.FILEID = f.ID)`);
    while (st.step()) { const r = st.getAsObject(); out[r.name] = String(r.src || ''); }
    st.free();
  } finally { db.close(); }
  return out;
}

// Page snippets: [{ eventId, position: 'top' | 'bottom' }]
function pageSnippets(info) {
  const out = [];
  for (const [formName, form] of Object.entries(info.forms || {})) {
    for (const cell of Object.values(form.cells || {})) {
      for (const id of cell.items || []) {
        const it = (info.items || {})[id];
        if (it && it.type === 'snippet' && it.eventId) out.push({ eventId: it.eventId, position: /footer|below|bottom/.test(formName) ? 'bottom' : 'top' });
      }
    }
  }
  return out;
}

// Fields placed on a page: walk the cells of every form, then nested item lists.
function pageFields(info) {
  const items = info.items || {};
  const used = new Set();
  const visit = (id) => {
    if (used.has(id) || !items[id]) return;
    used.add(id);
    for (const sub of items[id].items || []) visit(sub);
  };
  for (const form of Object.values(info.forms || {})) for (const cell of Object.values(form.cells || {})) for (const id of cell.items || []) visit(id);
  const fields = [];
  for (const id of used) {
    const it = items[id];
    if (it && it.field && !/label|tooltip|totals/.test(it.type) && !fields.includes(it.field)) fields.push(it.field);
  }
  return fields;
}

// --- events -----------------------------------------------------------------------

const pageOf = { LIST: 'list', EDIT: 'edit', ADD: 'add', VIEW: 'view', SEARCH: 'search', PRINT: 'print', EXPORT: 'export', IMPORT: 'import', CHART: 'report', REPORT: 'report' };
const PO = (t) => `$pageObject = \\MiB\\Compat::page($page, ${phpStr(t)});`;
function phpStr(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

// phpr event -> { to, use, setup, pages, cancel, loop }
function mapEvent(name, table) {
  let m;
  const T = phpStr(table || '');
  const keysWhere = `$keys = \\MiB\\Compat::keys(${T}, $old); $where = \\MiB\\Compat::where(${T}, $keys);`;
  switch (name) {
    case 'EVENT_BEFOREADD': return { to: 'BeforeAdd', use: '&$values, &$message, $page', setup: `$inline = false; ${PO(table)}`, cancel: true };
    case 'EVENT_AFTERADD': return { to: 'AfterAdd', use: '$values, $keys, $page', setup: `$inline = false; ${PO(table)}` };
    case 'EVENT_BEFOREEDIT': return { to: 'BeforeEdit', use: '&$values, $old, &$message, $page', setup: `$oldvalues = $old; ${keysWhere} $inline = false; ${PO(table)}`, cancel: true };
    case 'EVENT_AFTEREDIT': return { to: 'AfterEdit', use: '$values, $old, $keys, $page', setup: `$oldvalues = $old; $where = \\MiB\\Compat::where(${T}, $keys); $inline = false; ${PO(table)}` };
    case 'EVENT_BEFOREDELETE': return { to: 'BeforeDelete', use: '$old, &$message, $page', setup: `$deleted_values = $old; ${keysWhere} ${PO(table)}`, cancel: true };
    case 'EVENT_AFTERDELETE': return { to: 'AfterDelete', use: '$old, $page', setup: `$deleted_values = $old; $message = ''; ${keysWhere} ${PO(table)}` };
    case 'EVENT_INIT_TABLE': return { to: 'TableInit', use: '', setup: '' };
    case 'EVENT_AFTER_IMPORT': return { to: 'AfterImport', use: '$result, $page', setup: `$count = $result['added'] + $result['updated']; $skipCount = $result['skipped']; ${PO(table)}` };
    case 'EVENT_CUSTOMVALIDATE': return null;
    case 'EVENT_AFTERAPPINIT': return { to: 'AfterAppInit', use: '', setup: '' };
    case 'EVENT_BEFORELOGIN': return { to: 'BeforeLogin', use: '&$username, &$password, &$message', setup: '$pageObject = \\MiB\\Compat::page(\'login\', \'\'); $userData = [];', cancel: true };
    case 'EVENT_AFTERSUCCESSFULLOGIN': return { to: 'AfterSuccessfulLogin', use: '$username, $user', setup: '$password = \'\'; $data = $user; $pageObject = \\MiB\\Compat::page(\'login\', \'\');' };
    case 'EVENT_AFTERUNSUCCESSFULLOGIN': return { to: 'AfterUnsuccessfulLogin', use: '$username, $message', setup: '$password = \'\'; $pageObject = \\MiB\\Compat::page(\'login\', \'\');' };
    case 'EVENT_BEFOREREGISTER': return { to: 'BeforeRegister', use: '&$values, &$message', setup: '$pageObject = \\MiB\\Compat::page(\'register\', \'\');', cancel: true };
    case 'EVENT_AFTERSUCCESSFULREGISTRATION': return { to: 'AfterRegister', use: '$values', setup: '$pageObject = \\MiB\\Compat::page(\'register\', \'\');' };
    case 'EVENT_AFTERLOGOUT': return { to: 'AfterLogout', use: '$username', setup: '' };
  }
  if ((m = name.match(/^EVENT_BEFOREQUERY_(LIST|PRINT|EXPORT|CHART|REPORT|EDIT|VIEW)$/))) {
    const pages = m[1] === 'LIST' ? ['list', 'dt', 'filter', 'api'] : [pageOf[m[1]]];
    return { to: 'BeforeSelect', use: '&$where, &$orderBy, $page', setup: `$strSQL = ''; $strWhereClause = &$where; $strOrderBy = &$orderBy; ${PO(table)}`, pages };
  }
  if ((m = name.match(/^EVENT_PROCESSVALUES_(ADD|EDIT|VIEW)$/))) return { to: 'ProcessValues', use: '&$values, $page', setup: PO(table), pages: [pageOf[m[1]]] };
  if ((m = name.match(/^EVENT_BEFOREMOVENEXT_(LIST|PRINT)$/))) return { to: 'BeforeShowList', loop: true, pages: [pageOf[m[1]]] };
  if ((m = name.match(/^EVENT_BEFORESHOW_(LIST|EDIT|ADD|VIEW|SEARCH|PRINT|EXPORT|IMPORT)$/))) return { to: 'BeforeShow', use: '$page', setup: `$xt = \\MiB\\Compat::xt(); $templatefile = ''; ${PO(table)}`, pages: [pageOf[m[1]]] };
  if ((m = name.match(/^EVENT_BEFOREPROCESS_(LIST|EDIT|ADD|VIEW|SEARCH|PRINT|EXPORT|IMPORT)$/))) return { to: 'BeforeProcess', use: '$page', setup: PO(table), pages: [pageOf[m[1]]] };
  return null;
}

function indent(code, pad) {
  return String(code).replace(/\r\n/g, '\n').split('\n').map((l) => (l.trim() ? pad + l : l)).join('\n');
}

function wrapEvent(name, code, table) {
  const m = mapEvent(name, table);
  if (!m) return null;
  const cond = m.pages ? `in_array($page, ${'[' + m.pages.map(phpStr).join(', ') + ']'}, true)` : '';
  let block;
  if (m.loop) {
    block = `foreach ($rows as $__i => &$data) {\n    $record = [];\n    $row = [];\n    $recordId = $__i;\n`
      + `    (function () use (&$data, &$record, &$row, $recordId, $page) {\n        ${PO(table)}\n${indent(code, '        ')}\n    })();\n`
      + `    \\MiB\\Compat::applyRecord(${phpStr(table)}, $data, $record);\n}\nunset($data);`;
  } else {
    const use = m.use ? ` use (${m.use})` : '';
    block = `$__r = (function ()${use} {\n${m.setup ? '    ' + m.setup + '\n' : ''}${indent(code, '    ')}\n})();\n`
      + (m.cancel ? 'if ($__r === false) return false;' : '');
  }
  const body = cond ? `if (${cond}) {\n${indent(block, '    ')}\n}` : block;
  return { to: m.to, text: `// phpr: ${name}\n${body}\n` };
}

// --- field settings -----------------------------------------------------------------

const VIEW = { Number: 'number', Currency: 'currency', Percent: 'percent', 'Short Date': 'date', 'Long Date': 'date', 'Date and time': 'datetime', Datetime: 'datetime', Time: 'time',
  Checkbox: 'checkbox', 'Email Hyperlink': 'email', Hyperlink: 'url', 'File-based Image': 'image', 'Database Image': 'image', 'Document Download': 'file', 'Database File': 'file',
  HTML: 'html', Custom: 'custom', 'Phone number': 'text', 'Map': 'text', 'Audio': 'file', 'Video': 'file', 'Colorpicker': 'color' };
const EDIT = { 'Text field': 'text', 'Text area': 'textarea', Readonly: 'readonly', Date: 'date', Time: 'time', Checkbox: 'checkbox', Password: 'password', Hidden: 'hidden',
  'Document upload': 'file', 'File-based Image': 'image', 'Database Image': 'image', 'Database File': 'file', 'Lookup wizard': 'select', 'Colorpicker': 'color' };

function convertField(fo, ctx) {
  const name = str(fo.m_strName);
  const type = adoType(str(fo.m_nDataType));
  const ve = arr(fo.m_viewFormats && fo.m_viewFormats.v)[0] || {};
  const ee = arr(fo.m_editFormats && fo.m_editFormats.v)[0] || {};
  const lk = ee.m_pLookupObj || {};
  const viewFmt = str(ve.m_strViewFormat);
  const editFmt = str(ee.m_strEditFormat);
  const label = ctx.labels[name] || name;
  const f = {
    name, dbType: type, type, pk: ctx.keys.includes(name), autoInc: bool(fo.m_bAutoInc), nullable: !bool(ee.m_bRequired),
    label: Object.fromEntries(ctx.languages.map((l) => [l, label])),
    show: { list: true, view: true, add: !bool(fo.m_bAutoInc), edit: !bool(fo.m_bAutoInc), search: true, export: true, import: !bool(fo.m_bAutoInc), print: true },
    viewAs: { type: 'text' }, editAs: { type: 'text' }, validation: { required: bool(ee.m_bRequired) && !bool(fo.m_bAutoInc) },
    defaultValue: '', hint: {}, filter: false, totals: bool(fo.m_bSum) ? 'sum' : bool(fo.m_bAvg) ? 'avg' : bool(fo.m_bMax) ? 'max' : bool(fo.m_bMin) ? 'min' : '',
  };
  // Alias / calculated columns of SQL datasources.
  const expr = str(fo.m_strSQLExpression);
  const column = str(fo.m_strField);
  if (column && column !== name) f.column = column;
  if (expr && !/^[`"[]?[\w ()-]+[`"\]]?$/.test(expr) && expr !== name) f.calculated = true;
  // View format.
  f.viewAs.type = VIEW[viewFmt] || (type === 'date' ? 'date' : type === 'datetime' ? 'datetime' : type === 'bool' ? 'checkbox' : 'text');
  if (['number', 'currency', 'percent'].includes(f.viewAs.type)) f.viewAs.decimals = Number(str(ve.m_nDecimalDigits)) || (f.viewAs.type === 'number' ? 0 : 2);
  if (viewFmt === 'Custom') {
    // phpr adds the final ";" itself when the expression lacks it.
    let code = up8(String(str(ve.m_strCustomExpr)).replace(/\r\n/g, '\n').trimEnd(), `${ctx.table}.${name} (formato Custom)`, ctx);
    if (code && !/[;}]$/.test(code)) code += ';';
    f.viewAs.code = `<?php\n// Formato "Custom" importato da phpr: $value, $data\n$data = $row;\n${code}\nreturn $value;\n`;
  }
  if (viewFmt === '' && type === 'text') f.viewAs = { type: 'longtext', truncate: Number(str(ve.m_nNumberOfChars)) || 80 };
  // Edit format.
  let et = EDIT[editFmt] || 'text';
  if (editFmt === 'Date' && bool(ee.m_bShowTime)) et = 'datetime';
  if (editFmt === 'Text area' && bool(ee.m_bUseRTE)) et = 'richtext';
  if (editFmt === 'Text field' && ['int', 'decimal'].includes(type)) et = 'number';
  if (et === 'select') {
    const ltype = str(lk.m_nLookupType);
    const ctrl = str(lk.m_nControlType);
    et = { 1: 'autocomplete', 2: 'checkboxes', 3: 'select', 4: 'radio' }[ctrl] || 'select';
    if (ltype === '0') {
      f.editAs = { type: et, lookup: { kind: 'list', values: arr(lk.m_arrListOfValues && lk.m_arrListOfValues.v).map((v) => ({ value: str(v), label: { [ctx.languages[0]]: str(v) } })) } };
    } else {
      const where = str(lk.m_strWhere).trim();
      const dep = arr(lk.m_arrDependentFields && lk.m_arrDependentFields.v)[0];
      if (!str(lk.m_strTable)) {
        ctx.warnings.push(`${ctx.table}.${name}: lookup senza tabella nel progetto phpr, convertito in casella di testo`);
        f.editAs = { type: 'text' };
        return f;
      }
      const lookup = {
        kind: 'table', table: str(lk.m_strTable), key: str(lk.m_strLinkField), display: str(lk.m_strDisplayField) || str(lk.m_strLinkField),
        where: '', orderBy: str(lk.m_strOrderBy) ? str(lk.m_strOrderBy) + (bool(lk.m_bDesc) ? ' DESC' : '') : '',
        dependsOn: dep ? { field: str(dep.m_strMasterField), linkField: str(dep.m_strLookupField) } : null,
        addNew: bool(lk.m_bAllowToAdd), multiple: bool(ee.m_bAllowMultipleSelection) || et === 'checkboxes', unique: bool(lk.m_bUnique),
      };
      const connId = str(lk.m_strConnectionID);
      if (connId && connId !== ctx.tableConn) lookup.connection = ctx.connMap[connId] || connId;
      if (bool(lk.m_bCustomDisplay)) { lookup.display = str(lk.m_strDisplayField); }
      if (where) {
        // Older projects store a PHP expression (quoted string with concatenations), newer ones plain SQL.
        if (/["']\s*\.|\.\s*["']|\$/.test(where)) lookup.whereCode = up8(where, `${ctx.table}.${name} (WHERE lookup)`, ctx);
        else lookup.where = where.replace(/^"(.*)"$/s, '$1');
      }
      f.editAs = { type: et, lookup };
    }
    f.viewAs = { type: 'lookup' };
  } else {
    f.editAs = { type: et };
  }
  if (et === 'textarea') f.editAs.rows = Math.max(3, Math.min(20, Math.round((Number(str(ee.m_nRows)) || 100) / 20)));
  if (et === 'text' && Number(str(ee.m_nMaxLength))) f.editAs.maxLength = Number(str(ee.m_nMaxLength));
  if (et === 'file' || et === 'image') {
    f.editAs.upload = { storage: /^Database/.test(editFmt) ? 'database' : 'folder', multiple: Number(str(ee.m_MaxNumberOfFiles)) !== 1, maxMb: Number(str(ee.m_MaxFileSize)) ? Math.ceil(Number(str(ee.m_MaxFileSize)) / 1024) : 20,
      types: str(ee.m_allowedFileTypes).replace(/\|/g, ',') };
    if (bool(ee.m_bCreateThumbnail)) f.editAs.upload.thumbnail = { width: Number(str(ee.m_nThumbnailSize)) || 150, height: Number(str(ee.m_nThumbnailSize)) || 150 };
    if (bool(ee.m_bResizeOnUpload)) f.editAs.upload.resize = { width: Number(str(ee.m_nNewSize)) || 1600, height: Number(str(ee.m_nNewSize)) || 1600 };
    if (/Image/.test(viewFmt)) f.viewAs = { type: 'image' }; else f.viewAs = { type: 'file' };
  }
  // Validation.
  const va = str(ee.m_strValidateAs);
  if (va === 'Email') f.validation.email = true;
  if (va === 'Regular expression' || str(ee.m_strRegex)) { f.validation.regex = str(ee.m_strRegex); const rm = textOf(ee.m_strRegexMessage); if (rm) f.validation.regexMessage = { [ctx.languages[0]]: rm }; }
  if (bool(ee.m_bDenyDuplicates)) f.validation.unique = true;
  // Default and auto-update values are PHP expressions in phpr.
  const def = str(ee.m_strDefaultValue).trim();
  if (def) f.defaultCode = up8(def.replace(/;\s*$/, ''), `${ctx.table}.${name} (valore predefinito)`, ctx);
  const au = str(ee.m_strAutoUpdateValue).trim();
  if (au && bool(ee.m_bAutoUpdate)) f.autoUpdateCode = up8(au.replace(/;\s*$/, ''), `${ctx.table}.${name} (aggiornamento automatico)`, ctx);
  if (ctx.filterFields.has(name)) f.filter = true;
  return f;
}

// --- main ------------------------------------------------------------------------------

async function importPhpr(phprFile, targetDir, opts = {}) {
  const x = parseXml(phprFile);
  const pagesStore = await readPages(phprFile).catch(() => null);
  const eventStore = await readEventStore(phprFile).catch(() => ({}));
  const report = { php8: [], snippets: 0, jsEvents: 0, tables: 0, sqlViews: 0, charts: 0, events: 0, eventsSkipped: [], warnings: [], pagesFile: pagesStore ? pagesStore.file : null, connections: [] };
  const name = opts.name || path.basename(phprFile, '.phpr').replace(/[^A-Za-z0-9_.-]/g, '_');
  const proj = P.createProject(targetDir, name);
  const languages = [...new Set(arr(x.m_arrLanguages && x.m_arrLanguages.v).map((l) => LANGS[str(l)] || 'en'))];
  if (!languages.length) languages.push(LANGS[str(x.m_strDefaultLanguage)] || 'it');
  const defLang = LANGS[str(x.m_strDefaultLanguage)] || languages[0];
  proj.project.languages = [defLang, ...languages.filter((l) => l !== defLang)];
  proj.project.defaultLanguage = defLang;
  proj.project.title = Object.fromEntries(proj.project.languages.map((l) => [l, name]));
  proj.project.settings.pageSize = 20;
  proj.project.settings.classicUrls = true;
  proj.project.importedFrom = { app: 'phpr', version: x['@version'] || '', file: path.basename(phprFile), at: new Date().toISOString() };
  const savedFiles = [];
  const keep = (rel, text) => {
    const f = path.join(targetDir, 'import-phpr', rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    savedFiles.push(rel);
  };

  // Connections.
  const secrets = { connections: {} };
  const connMap = {};
  const usedIds = new Set();
  for (const c of arr(x.m_arrConnections && x.m_arrConnections.v)) {
    const pid = str(c.m_strID);
    let id = pid.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase() || 'main';
    while (usedIds.has(id)) id += '_';
    usedIds.add(id);
    connMap[pid] = id;
    const kind = DRIVER[str(c.m_connStringType).toLowerCase()] || DB_TYPE[str(c.m_nDatabaseType)] || 'mysql';
    const conn = { id, name: str(c.m_strName) || pid, driver: kind };
    if (kind === 'sqlite') conn.file = str(c.m_strConnectInfo1) || str(c.m_strDBPath);
    else {
      const [host, port] = str(c.m_strConnectInfo1).split(':');
      Object.assign(conn, { host, port: Number(port) || Number(str(c.m_strConnectInfo4)) || { mysql: 3306, pgsql: 5432, sqlsrv: 1433, oracle: 1521 }[kind], user: str(c.m_strConnectInfo2), database: str(c.m_strConnectInfo5) || str(c.m_strConnectInfo4) });
      if (str(c.m_strConnectInfo3)) secrets.connections[id] = str(c.m_strConnectInfo3);
    }
    proj.connections.push(conn);
    report.connections.push(`${conn.name} (${kind} ${conn.host || conn.file || ''}/${conn.database || ''})`);
  }
  proj.project.defaultConnection = connMap[str(x.m_strDefaultConnID)] || (proj.connections[0] && proj.connections[0].id) || 'main';
  P.writeSecrets(targetDir, secrets);

  // Labels.
  const labels = {};
  for (const lang of arr(x.m_ProjectLabels && x.m_ProjectLabels.m_arrLanguageLabels && x.m_ProjectLabels.m_arrLanguageLabels.v)) {
    if (LANGS[str(lang.m_strLanguage)] !== defLang && arr(x.m_ProjectLabels.m_arrLanguageLabels.v).length > 1) continue;
    for (const tl of arr(lang.m_arrTableLabels && lang.m_arrTableLabels.v)) {
      const t = (labels[str(tl.m_strTableName)] ||= { caption: str(tl.m_strTableLabel), fields: {} });
      for (const fl of arr(tl.m_arrFieldLabels && tl.m_arrFieldLabels.v)) t.fields[str(fl.m_strField)] = str(fl.m_strLabel);
    }
  }

  // Tables.
  const pXml = arr(x.tables && x.tables.v);
  const masters = [];
  const chartTables = [];
  for (const t of pXml) {
    const tname = str(t.m_strDataSourceTable);
    const ttype = str(t.m_nType);
    const original = str(t.m_strOriginalTable);
    const keys = arr(t.m_arrKeyFields && t.m_arrKeyFields.v).map(str);
    const conn = connMap[str(t.m_strConnectionID)] || proj.project.defaultConnection;
    if (ttype === '4') { report.warnings.push(`${tname}: dashboard phpr non convertita (ricreala in Dashboard)`); continue; }
    const pagesOf = (pagesStore && pagesStore.tables[tname]) || [];
    const filterFields = new Set();
    for (const pg of pagesOf) for (const it of Object.values(pg.info.items || {})) if (it.type === 'filter_panel_field' && it.field) filterFields.add(it.field);
    const ctx = { keys, languages: proj.project.languages, labels: (labels[tname] || {}).fields || {}, connMap, tableConn: str(t.m_strConnectionID), filterFields, warnings: report.warnings, table: tname, php8: report.php8 };
    const fields = arr(t.m_arrFieldObj && t.m_arrFieldObj.v).map((fo) => convertField(fo, ctx));
    // Dependent lookups: phpr matches master fields case-insensitively.
    for (const f of fields) {
      const dep = f.editAs.lookup && f.editAs.lookup.dependsOn;
      if (!dep) continue;
      const real = fields.find((x) => x.name.toLowerCase() === dep.field.toLowerCase());
      if (real) dep.field = real.name;
      else { report.warnings.push(`${tname}.${f.name}: dipende da "${dep.field}" che non è nella tabella, dipendenza rimossa`); f.editAs.lookup.dependsOn = null; }
    }
    const sql = str(t.m_strSQL).replace(/\r\n/g, '\n').trim();
    const plainTable = ttype === '0' && /^select\b[\s\S]*\bfrom\s+[`"[]?[\w.]+[`"\]]?\s*$/i.test(sql) && !/\bjoin\b|\bwhere\b|\bgroup\b/i.test(sql) && !fields.some((f) => f.calculated || f.column);
    const caption = (labels[tname] && labels[tname].caption) || tname;
    const ds = {
      name: tname, connection: conn,
      source: plainTable ? { type: 'table', table: original || tname } : { type: 'sql', sql, updateTable: keys.length && ttype !== '3' ? original : '' },
      caption: Object.fromEntries(proj.project.languages.map((l) => [l, caption])),
      keys, fields, pages: defaultPages({ pageSize: Number(str(t.m_nNumberOfRecords)) || 20 }), details: [], audit: true,
      api: { enabled: false, methods: ['list', 'view', 'add', 'edit', 'delete'] }, readOnly: !plainTable && !(keys.length && original && ttype !== '3'),
    };
    if (str(t.m_strOrderBy).trim()) {
      const m = str(t.m_strOrderBy).trim().replace(/^order\s+by\s+/i, '').match(/^[`"[]?([^`"\],]+?)[`"\]]?(\s+desc)?$/i);
      if (m && fields.some((f) => f.name === m[1])) ds.pages.list.defaultSort = { field: m[1], dir: m[2] ? 'desc' : 'asc' };
    }
    if (ds.source.type === 'sql' && ttype !== '3') report.sqlViews++;
    // Pages and the fields on each page.
    if (pagesOf.length) {
      const types = { list: 'list', add: 'add', edit: 'edit', view: 'view', search: 'search', export: 'export', import: 'import', print: 'print' };
      for (const [pt, our] of Object.entries(types)) {
        const variants = pagesOf.filter((pg) => pg.type === pt);
        if (!variants.length) { if (ds.pages[our]) ds.pages[our].enabled = false; continue; }
        const pg = variants.find((v) => v.isDefault && !v.disabled) || variants.find((v) => !v.disabled);
        if (!pg) { if (ds.pages[our]) ds.pages[our].enabled = false; continue; }
        const onPage = new Set(pageFields(pg.info));
        const showKey = { list: 'list', add: 'add', edit: 'edit', view: 'view', search: 'search', export: 'export', import: 'import', print: 'print' }[pt];
        if (onPage.size) for (const f of fields) f.show[showKey] = onPage.has(f.name);
        if (variants.length > 1) report.warnings.push(`${tname}: ${variants.length} varianti della pagina ${pt}, importata solo la principale`);
      }
      ds.pages.delete.enabled = ds.pages.list.enabled && ds.pages.edit.enabled;
      const list = pagesOf.find((pg) => pg.type === 'list' && !pg.disabled);
      if (list) {
        const types = new Set(Object.values(list.info.items || {}).map((i) => i.type));
        ds.pages.list.filterPanel = types.has('filter_panel_field') || filterFields.size > 0;
        ds.pages.list.quickSearch = types.has('simple_search') || true;
      }
    } else {
      report.warnings.push(`${tname}: nessun archivio pagine (PAGES*.sqlite), tutti i campi mostrati in tutte le pagine`);
    }
    if (ttype === '3') {
      // Chart: keep the datasource (hidden) and create a MiB chart on it.
      ds.hideFromMenu = true;
      ds.hideFromHome = true;
      ds.readOnly = true;
      const series = arr(t.m_arrChartDataSeries && t.m_arrChartDataSeries.v).map((s) => ({ field: str(s.m_strDataField), fn: 'sum' })).filter((s) => s.field);
      const ctype = str(t.m_strChartType);
      const type = /Pie|Doughnut|Donut/i.test(ctype) ? (/Doughnut|Donut/i.test(ctype) ? 'doughnut' : 'pie') : /Bar/.test(ctype) ? 'hbar' : /Line|Spline/.test(ctype) ? 'line' : /Area/.test(ctype) ? 'area' : /Gauge/.test(ctype) ? 'gauge' : /Funnel/.test(ctype) ? 'funnel' : 'bar';
      chartTables.push({ name: tname.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase(), title: ds.caption, table: tname, type, labelField: str(t.m_strChartLabelField), series, stacked: bool(t.m_bIsChartStacked) });
      report.charts++;
    } else report.tables++;
    // Events.
    const evGroup = {};
    for (const ev of arr(t.m_arrEventHandlers && t.m_arrEventHandlers.v)) {
      const en = str(ev.m_strName);
      const code = str(ev.m_strEventCode);
      if (!code.trim()) continue;
      const jsPage = { 'List page': 'list', 'Add page': 'add', 'Edit page': 'edit', 'View page': 'view', 'Search page': 'search', 'Printer-friendly page': 'print', 'Export page': 'export', 'Import page': 'import' }[str(ev.m_strPage)];
      if (en === 'EVENT_JS_ONLOAD' && jsPage) {
        // Client code runs on the generated page through runner-compat.js (Runner.getControl, pageObj.on...).
        (proj.events[tname] ||= {})[`JS_OnLoad_${jsPage}`] = `// phpr: EVENT_JS_ONLOAD (${str(ev.m_strPage)})\n// Variabili: pageObj (anche this), proxy, pageid, inlineRow, inlineObject, row\n${code.replace(/\r\n/g, '\n')}\n`;
        report.jsEvents++;
        continue;
      }
      if (/^EVENT_JS_|^EVENT_CUSTOM|^EVENT_BUTTON|^EVENT_FIELD/.test(en) || !mapEvent(en, tname)) {
        keep(`events/${tname.replace(/[^\w.-]/g, '_')}/${en}.${/^EVENT_JS_/.test(en) ? 'js' : 'php'}`, code);
        report.eventsSkipped.push(`${tname}: ${en}`);
        continue;
      }
      const w = wrapEvent(en, up8(code, `${tname}: ${en}`, report), tname);
      (evGroup[w.to] ||= []).push(w.text);
      report.events++;
    }
    // PHP code snippets placed on the pages (live source in subversion/EVENTS.sqlite).
    const snips = {};
    for (const pg of pagesOf) {
      if (pg.disabled) continue;
      const ours = { list: 'list', add: 'add', edit: 'edit', view: 'view', search: 'search', print: 'print', export: 'export', import: 'import' }[pg.type];
      if (!ours) continue;
      for (const sn of pageSnippets(pg.info)) {
        const code = eventStore[`${sn.eventId}~EVENT_ONSCREEN`];
        if (code == null) { report.warnings.push(`${tname}: snippet ${sn.eventId} senza codice in EVENTS.sqlite`); continue; }
        const key = `${sn.eventId}|${sn.position}`;
        if (!snips[key]) {
          snips[key] = { event: 'Snippet_' + sn.eventId.replace(/[^A-Za-z0-9_]/g, '_'), position: sn.position, pages: [] };
          (proj.events[tname] ||= {})[snips[key].event] = `<?php\n// phpr: snippet ${sn.eventId} (codice PHP inserito nella pagina)\n\n$__r = (function () use ($page) {\n    ${PO(tname)}\n${indent(up8(code.replace(/\r\n/g, '\n'), `${tname}: snippet ${sn.eventId}`, report), '    ')}\n})();\nreturn true;\n`;
          report.snippets++;
        }
        if (!snips[key].pages.includes(ours)) snips[key].pages.push(ours);
      }
    }
    if (Object.keys(snips).length) ds.snippets = Object.values(snips);
    ds.phprShort = str(t.m_strShortTableName) || tname;
    const dc = t.DiagramCoordinates;
    if (dc && str(dc.x1) !== '') ds.diagram = { x: Number(str(dc.x1)) || 0, y: Number(str(dc.y1)) || 0 };
    for (const [to, blocks] of Object.entries(evGroup)) {
      (proj.events[tname] ||= {})[to] = `<?php\n// Importato da phpr: le variabili phpr sono ricreate dal runtime MiB-Crude (Compat).\n\n${blocks.join('\n')}\nreturn true;\n`;
    }
    for (const m of arr(t.m_arrMasterTables && t.m_arrMasterTables.v)) masters.push({ master: str(m.m_strMasterTable), detail: tname, masterKeys: arr(m.m_arrMasterKeys && m.m_arrMasterKeys.v).map(str), detailKeys: arr(m.m_arrDetailKeys && m.m_arrDetailKeys.v).map(str) });
    proj.tables.push(ds);
  }
  for (const m of masters) {
    const mt = proj.tables.find((t) => t.name === m.master);
    if (mt && proj.tables.some((t) => t.name === m.detail)) mt.details.push({ table: m.detail, masterKeys: m.masterKeys, detailKeys: m.detailKeys, showIn: ['list', 'view', 'edit'] });
  }
  for (const c of chartTables) { if (!proj.charts.some((x) => x.name === c.name)) proj.charts.push(c); }

  // Global events.
  const gGroup = {};
  for (const ev of arr(x.m_arrEventHandlers && x.m_arrEventHandlers.v)) {
    const en = str(ev.m_strName);
    const code = str(ev.m_strEventCode);
    if (!code.trim()) continue;
    const w = mapEvent(en, '') && wrapEvent(en, up8(code, `globale: ${en}`, report), '');
    if (!w) { keep(`events/_global/${en}.php`, code); report.eventsSkipped.push(`globale: ${en}`); continue; }
    (gGroup[w.to] ||= []).push(w.text);
    report.events++;
  }
  for (const [to, blocks] of Object.entries(gGroup)) (proj.events._global ||= {})[to] = `<?php\n// Importato da phpr\n\n${blocks.join('\n')}\nreturn true;\n`;

  // Menu.
  const nodes = arr(x.MenuNodes && x.MenuNodes.MenuNode);
  const byId = {};
  const roots = [];
  for (const n of nodes) {
    const id = str(n.id);
    const tname = str(n.table);
    const text = textOf(n.name);
    const type = str(n.type);
    let item;
    if (type === 'Group') item = { type: 'group', label: { [defLang]: text || 'Gruppo' }, items: [] };
    else if (str(n.linkType) === 'External' || (!tname && str(n.href))) item = { type: 'link', url: str(n.href), label: { [defLang]: text || str(n.href) }, newWindow: str(n.openType) === 'NewWindow' };
    else if (tname && proj.tables.some((t) => t.name === tname)) {
      const ct = chartTables.find((c) => c.table === tname);
      item = ct ? { type: 'chart', ref: ct.name } : { type: 'table', table: tname, page: { Add: 'add', Search: 'search' }[str(n.pageType)] || 'list' };
      if (text) item.label = { [defLang]: text };
    } else continue;
    const icon = str(n.iconName).replace(/^(glyphicon|fa|bi)-/, '');
    if (icon) item.icon = icon;
    byId[id] = item;
    item.__parent = str(n.parent);
  }
  for (const item of Object.values(byId)) {
    const parent = byId[item.__parent];
    delete item.__parent;
    if (parent && parent.type === 'group') parent.items.push(item); else roots.push(item);
  }
  proj.menu.items = roots;

  // Security.
  const loginMethod = str(x.m_nLoginMethod);
  const sec = proj.security;
  if (loginMethod !== '-1' && loginMethod !== '') {
    sec.enabled = true;
    if (loginMethod === '0') {
      sec.mode = 'hardcoded';
      sec.hardcoded.username = str(x.m_strUserName) || 'admin';
      if (str(x.m_strPassword)) sec.hardcoded.passwordHash = require('./generator.cjs').hashPassword(str(x.m_strPassword));
    } else if (loginMethod === '1') {
      sec.mode = 'database';
      sec.users = { managed: false, table: str(x.m_strLoginTable), usernameField: str(x.m_strUserNameField), passwordField: str(x.m_strPasswordField), emailField: str(x.Registration && x.Registration.m_strUserEmailField),
        fullNameField: str(x.m_strDisplayNameField), groupField: str(x.m_strUserGroupField), activeField: str(x.Registration && x.Registration.m_strActivationField), idField: '', plainPasswords: !bool(x.Registration && x.Registration.m_bEncryptPasswords) };
      if (!proj.tables.some((t) => t.name === sec.users.table)) report.warnings.push(`Sicurezza: la tabella utenti "${sec.users.table}" non è nel progetto: aggiungila da Tabelle prima di generare`);
    } else {
      sec.mode = 'database';
      sec.providers.ldap.enabled = true;
      sec.providers.ldap.host = str(x.m_ADServer);
      sec.providers.ldap.domain = str(x.m_ADDomain);
      sec.providers.ldap.baseDn = str(x.m_ADBaseDN);
      report.warnings.push('Sicurezza: login Active Directory convertito in LDAP: verifica server e dominio');
    }
    sec.guestAccess = bool(x.m_bGuestLogin);
    sec.dynamicPermissions = bool(x.m_bDynamicPermissions);
    sec.captcha.login = false;
    if (x.Registration) {
      sec.registration.enabled = bool(x.Registration.m_bNewUserPage);
      sec.passwordReset.enabled = bool(x.Registration.m_bRemindPwdPage);
      if (bool(x.Registration.m_bStrongPassword)) sec.passwordPolicy = { minLength: Number(str(x.Registration.m_nPwdLen)) || 8, requireDigit: Number(str(x.Registration.m_nPwdDigits)) > 0, requireUpper: bool(x.Registration.m_bPwdUpperLower), requireSymbol: false };
    }
    // Groups and permissions (static user groups of the project).
    const groups = arr(x.UserGroups && x.UserGroups.v);
    if (groups.length) {
      sec.groups = [{ id: 'admin', label: { [defLang]: 'Amministratori' }, admin: true }];
      for (const g of groups) {
        const gid = str(g.m_strUserName).replace(/[^A-Za-z0-9_.-]/g, '_') || 'gruppo';
        if (gid === '<Guest>' || gid === '_Guest_') continue;
        if (!sec.groups.some((x2) => x2.id === gid)) sec.groups.push({ id: gid, label: { [defLang]: str(g.m_strUserName) } });
        for (const tp of arr(g.m_TablePermissions && g.m_TablePermissions.v)) {
          const tn = str(tp.m_strTableName);
          const mask = str(tp.m_strPermissionMask).replace(/M/g, '');
          const target = proj.tables.some((t) => t.name === tn) ? tn : (chartTables.find((c) => c.table === tn.replace(/ Chart$/, '')) ? `chart:${chartTables.find((c) => c.table === tn.replace(/ Chart$/, '')).name}` : null);
          if (!target || !mask) continue;
          const letters = target.startsWith('chart:') ? 'S' : [...new Set((mask + (mask.includes('S') ? 'V' : '')).split(''))].filter((l) => 'AEDSVPI'.includes(l)).join('');
          (sec.permissions[gid] ||= {})[target] = letters;
        }
      }
    }
  }

  // Theme.
  const theme = str(x.m_styleManager && x.m_styleManager.projectBootstrapTheme);
  const colors = { journal: '#eb6864', cerulean: '#2fa4e7', cosmo: '#2780e3', cyborg: '#2a9fd6', darkly: '#375a7f', flatly: '#2c3e50', lumen: '#158cba', paper: '#2196f3', readable: '#4582ec', sandstone: '#325d88', simplex: '#d9230f', slate: '#3a3f44', spacelab: '#446e9b', superhero: '#df691a', united: '#e95420', yeti: '#008cba', materia: '#2196f3', lux: '#1a1a1a', minty: '#78c2ad', pulse: '#593196', sketchy: '#333', solar: '#b58900', quartz: '#e83283', morph: '#378dfc', vapor: '#6f42c1', zephyr: '#3459e6' };
  if (colors[theme]) proj.project.theme.primary = colors[theme];
  if (['cyborg', 'darkly', 'slate', 'superhero', 'solar', 'vapor'].includes(theme)) proj.project.theme.mode = 'dark';

  // Landing page.
  const landing = str(x.m_strLandingTable);
  if (landing && proj.tables.some((t) => t.name === landing)) proj.project.settings.homePage = `index.php?p=${str(x.m_strLandingPage) === 'add' ? 'add' : 'list'}&t=${encodeURIComponent(landing)}`;

  // Custom files shipped with the phpr project (source/) go to custom/ for reference.
  const src = path.join(path.dirname(phprFile), 'source');
  if (fs.existsSync(src) && opts.copySource !== false) {
    fs.cpSync(src, path.join(targetDir, 'public'), { recursive: true, filter: (s) => !/\.(exe|dll)$/i.test(s) });
    report.warnings.push('File personalizzati di phpr (source/) copiati in public/: vengono pubblicati nella radice dell\'applicazione come in phpr');
  }

  P.saveProject(proj);
  const lines = [
    `# Importazione di progetti .phpr`, '', `File: ${phprFile}`, `Archivio pagine: ${report.pagesFile || 'assente'}`, '',
    `- Tabelle: ${report.tables} (di cui query SQL: ${report.sqlViews})`, `- Grafici: ${report.charts}`, `- Eventi convertiti: ${report.events}`, `- Eventi JavaScript (onload) convertiti: ${report.jsEvents}`, `- Snippet PHP nelle pagine: ${report.snippets}`,
    `- Eventi non convertiti (salvati in import-phpr/events/): ${report.eventsSkipped.length}`, '',
    '## Avvisi', ...report.warnings.map((w) => `- ${w}`), '',
    '## Compatibilità PHP 8', `Correzioni automatiche in ${report.php8.filter((x) => x.fixes.length).length} blocchi di codice, problemi da rivedere in ${report.php8.filter((x) => x.problems.length).length}.`, '',
    ...report.php8.flatMap((x) => [`### ${x.where}`, ...x.fixes.map((f) => `- corretto: ${f}`), ...x.problems.map((p) => `- ${p.level === 'error' ? 'ERRORE' : 'da verificare'} (riga ${p.line}): ${p.msg}`), '']), '## Eventi non convertiti', ...report.eventsSkipped.map((e) => `- ${e}`), '',
    '## Note', '- Le password dei database sono state spostate in .mibcrude-local/secrets.json (non condiviso).',
    '- Gli eventi JavaScript "onload" girano con lo strato runner-compat.js (Runner.getControl, pageObj.on, proxy): verificare i plugin jQuery usati.',
    '- I link in stile phpr (tabella_list.php, _edit.php?editid1=...) funzionano grazie alle pagine di inoltro generate.',
  ];
  fs.mkdirSync(path.join(targetDir, 'import-phpr'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'import-phpr', 'REPORT.md'), lines.join('\n') + '\n');
  return { proj: P.loadProject(targetDir), report };
}

module.exports = { importPhpr, parseXml, readPages, pageFields, wrapEvent, mapEvent, adoType };
