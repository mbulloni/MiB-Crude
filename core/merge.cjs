'use strict';
// Merge of a project (usually just imported from a phpr .phpr) into another one, to build a single
// application from several phpr projects. Works on the in-memory projects; files of custom/ and
// public/ and the import notes are copied by copyFiles(). Nothing is ever overwritten in the target:
// same names are shared (connections to the same database, identical tables) or renamed, and every
// choice ends up in the report.
const fs = require('node:fs');
const path = require('node:path');

const clone = (x) => JSON.parse(JSON.stringify(x));
const unique = (name, taken) => { let n = name, i = 2; while (taken(n)) n = `${name}_${i++}`; return n; };

// Same database: driver, server, port, database (or SQLite file) and user.
function connKey(c) {
  return [c.driver, (c.host || '').toLowerCase(), c.port || '', (c.database || c.service || '').toLowerCase(), c.file || '', (c.user || '').toLowerCase(), c.baseUrl || ''].join('|');
}

/**
 * opts.label: name of the merged application (menu header, report);
 * opts.tables: 'auto' (share a table with the same name when it reads the same database table, otherwise
 * rename), 'reuse' (always keep the one already present), 'prefix' (always import with opts.prefix);
 * opts.secrets: passwords of the source connections ({ id: password }).
 * Returns { proj, secrets, report } where secrets holds the passwords of the connections added.
 */
function mergeProjects(target, source, opts = {}) {
  const t = clone(target);
  const s = clone(source);
  const label = opts.label || s.project.name || 'importato';
  const mode = opts.tables || 'auto';
  const prefix = (opts.prefix || label).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+$/, '') + '_';
  const report = { label, connections: [], tablesAdded: [], tablesShared: [], tablesRenamed: [], renamed: [], events: 0, eventConflicts: [], groups: [], languages: [], warnings: [] };
  const secrets = {};

  // Connections: the same database is shared, otherwise the connection is added (renamed if the id is taken).
  const connMap = {};
  for (const c of s.connections) {
    const same = t.connections.find((x) => connKey(x) === connKey(c));
    if (same) { connMap[c.id] = same.id; report.connections.push(`${c.id} → ${same.id} (stesso database)`); continue; }
    const id = unique(c.id, (n) => t.connections.some((x) => x.id === n));
    t.connections.push({ ...c, id });
    connMap[c.id] = id;
    if (opts.secrets && opts.secrets[c.id]) secrets[id] = opts.secrets[c.id];
    report.connections.push(id === c.id ? `${id} aggiunta` : `${c.id} aggiunta come ${id}`);
  }
  const conn = (id) => (id && connMap[id]) || id;
  if (!t.project.defaultConnection && t.connections.length) t.project.defaultConnection = t.connections[0].id;

  // Tables: decide first, so every reference can be renamed in one pass.
  const tableMap = {};
  const skip = new Set();
  const sameSource = (a, b) => a.connection === conn(b.connection) && JSON.stringify(a.source) === JSON.stringify(b.source);
  for (const x of s.tables) {
    const cur = t.tables.find((y) => y.name === x.name);
    if (!cur) { tableMap[x.name] = x.name; continue; }
    if (mode === 'reuse' || (mode === 'auto' && sameSource(cur, x))) { tableMap[x.name] = x.name; skip.add(x.name); report.tablesShared.push(x.name); continue; }
    const name = unique(prefix + x.name, (n) => t.tables.some((y) => y.name === n) || s.tables.some((y) => y.name === n && y !== x));
    tableMap[x.name] = name;
    report.tablesRenamed.push(`${x.name} → ${name}`);
  }
  const tbl = (n) => (n && tableMap[n]) || n;
  // URL-style file names (<short>_list.php) must stay unique too.
  const shorts = new Set(t.tables.map((x) => String(x.phprShort || x.name).toLowerCase()));

  // Reports, charts and dashboards: renamed when the name is taken.
  const refMap = { reports: {}, charts: {}, dashboards: {} };
  for (const kind of ['reports', 'charts', 'dashboards']) {
    t[kind] = t[kind] || [];
    for (const r of s[kind] || []) {
      const name = unique(r.name, (n) => t[kind].some((y) => y.name === n));
      refMap[kind][r.name] = name;
      if (name !== r.name) report.renamed.push(`${kind === 'reports' ? 'report' : kind === 'charts' ? 'grafico' : 'dashboard'} ${r.name} → ${name}`);
    }
  }
  const PERM_PREFIX = { 'report:': 'reports', 'chart:': 'charts', 'dashboard:': 'dashboards' };
  const permKey = (k) => {
    for (const [p, kind] of Object.entries(PERM_PREFIX)) if (k.startsWith(p)) return p + (refMap[kind][k.slice(p.length)] || k.slice(p.length));
    return tbl(k);
  };

  // Tables and their events.
  for (const x of s.tables) {
    const evs = (s.events || {})[x.name] || {};
    if (skip.has(x.name)) {
      // shared table: the events it does not have yet are added, the others are kept aside
      const mine = (t.events[x.name] ||= {});
      for (const [ev, code] of Object.entries(evs)) {
        if (!mine[ev] || !mine[ev].trim()) { mine[ev] = code; report.events++; } else if (mine[ev].trim() !== code.trim()) report.eventConflicts.push({ group: x.name, event: ev, code });
      }
      continue;
    }
    const n = clone(x);
    n.name = tableMap[x.name];
    n.connection = conn(n.connection);
    for (const f of n.fields || []) {
      const lk = f.editAs && f.editAs.lookup;
      if (lk) { if (lk.kind === 'table') lk.table = tbl(lk.table); if (lk.connection) lk.connection = conn(lk.connection); }
    }
    for (const d of n.details || []) d.table = tbl(d.table);
    const short = (n.name !== x.name ? prefix : '') + String(n.phprShort || x.name);
    if (n.name !== x.name || shorts.has(short.toLowerCase())) n.phprShort = unique(short, (v) => shorts.has(v.toLowerCase()));
    shorts.add(String(n.phprShort || n.name).toLowerCase());
    t.tables.push(n);
    report.tablesAdded.push(n.name);
    if (Object.keys(evs).length) { t.events[n.name] = { ...evs }; report.events += Object.keys(evs).length; }
  }

  // Global events (application events, scheduled tasks): added when missing, kept aside when different.
  const g = (t.events._global ||= {});
  for (const [ev, code] of Object.entries((s.events || {})._global || {})) {
    if (!g[ev] || !g[ev].trim()) { g[ev] = code; report.events++; } else if (g[ev].trim() !== code.trim()) report.eventConflicts.push({ group: '_global', event: ev, code });
  }
  if (!Object.keys(g).length) delete t.events._global;

  for (const kind of ['reports', 'charts', 'dashboards']) {
    for (const r of s[kind] || []) {
      const n = clone(r);
      n.name = refMap[kind][r.name];
      if (n.table) n.table = tbl(n.table);
      for (const it of n.items || []) {
        if (it.table) it.table = tbl(it.table);
        if (it.type === 'chart' && it.ref) it.ref = refMap.charts[it.ref] || it.ref;
        if (it.type === 'report' && it.ref) it.ref = refMap.reports[it.ref] || it.ref;
      }
      t[kind].push(n);
    }
  }

  // Menu: the application's items under a header with its name.
  const menuItem = (m) => {
    const n = clone(m);
    if (n.table) n.table = tbl(n.table);
    if (n.ref && n.type === 'report') n.ref = refMap.reports[n.ref] || n.ref;
    if (n.ref && n.type === 'chart') n.ref = refMap.charts[n.ref] || n.ref;
    if (n.ref && n.type === 'dashboard') n.ref = refMap.dashboards[n.ref] || n.ref;
    if (n.items) n.items = n.items.map(menuItem);
    return n;
  };
  // shared tables already in the menu are not repeated; groups left empty disappear
  const inMenu = (name) => (t.menu.items || []).some(function has(x) { return (x.type === 'table' && x.table === name) || (x.items || []).some(has); });
  const prune = (list) => list.reduce((out, m) => {
    if (m.type === 'table' && skip.has(m.table) && inMenu(m.table)) return out;
    if (m.type === 'group') { const sub = prune(m.items || []); if (!sub.some((x) => !['separator', 'header'].includes(x.type))) return out; out.push({ ...m, items: sub }); return out; }
    out.push(m);
    return out;
  }, []);
  const items = prune(((s.menu && s.menu.items) || []).map(menuItem));
  if (!items.some((x) => !['separator', 'header'].includes(x.type))) items.length = 0;
  if (items.length) {
    t.menu.items = t.menu.items || [];
    t.menu.items.push({ type: 'header', label: Object.fromEntries((t.project.languages || ['it']).map((l) => [l, label])) }, ...items);
  }

  // Security: groups with the same id are the same group, permissions are added up.
  const sec = t.security, ssec = s.security || {};
  for (const gr of ssec.groups || []) {
    if (!sec.groups.some((x) => x.id === gr.id)) { sec.groups.push(clone(gr)); report.groups.push(gr.id); }
  }
  for (const [gid, perms] of Object.entries(ssec.permissions || {})) {
    const mine = (sec.permissions[gid] ||= {});
    for (const [k, letters] of Object.entries(perms)) {
      const key = permKey(k);
      mine[key] = 'AEDSVPI'.split('').filter((c) => (mine[key] || '').includes(c) || letters.includes(c)).join('');
    }
  }
  for (const [k, v] of Object.entries(ssec.ownership || {})) if (!sec.ownership[tbl(k)]) sec.ownership[tbl(k)] = clone(v);
  if (ssec.enabled && !sec.enabled) report.warnings.push(`«${label}» usa l'accesso con login, il progetto no: attivalo in Sicurezza se serve`);
  else if (ssec.enabled && sec.enabled && ssec.mode !== sec.mode) report.warnings.push(`«${label}» usa un accesso diverso (${ssec.mode}): resta quello del progetto (${sec.mode})`);
  if (ssec.users && ssec.users.table && sec.users && sec.users.table && tbl(ssec.users.table) !== sec.users.table) report.warnings.push(`«${label}» legge gli utenti da ${ssec.users.table}: resta la tabella utenti del progetto (${sec.users.table})`);

  // Languages and texts: the target's translations win.
  for (const l of s.project.languages || []) if (!t.project.languages.includes(l)) { t.project.languages.push(l); report.languages.push(l); }
  t.lang = t.lang || {};
  for (const [code, dict] of Object.entries(s.lang || {})) t.lang[code] = { ...dict, ...(t.lang[code] || {}) };

  t.project.mergedFrom = [...(t.project.mergedFrom || []), { label, file: (s.project.importedFrom && s.project.importedFrom.file) || '', at: new Date().toISOString() }];
  if (report.tablesRenamed.length) report.warnings.push('Tabelle rinominate: il codice degli eventi che usa i vecchi nomi delle origini dati (non delle tabelle del database) va controllato');
  return { proj: t, secrets, report };
}

/** Files of the source project: custom/ and public/ (existing files are kept), import notes, conflicts. */
function copyFiles(srcDir, dstDir, label, report) {
  const slug = label.replace(/[^A-Za-z0-9_.-]/g, '_');
  report.filesKept = [];
  report.filesCopied = 0;
  const walk = (dir, base = dir, out = []) => {
    let es = [];
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of es) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p)); }
    return out;
  };
  for (const d of ['custom', 'public']) {
    for (const rel of walk(path.join(srcDir, d))) {
      const to = path.join(dstDir, d, rel);
      if (fs.existsSync(to)) {
        if (!fs.readFileSync(to).equals(fs.readFileSync(path.join(srcDir, d, rel)))) report.filesKept.push(`${d}/${rel}`);
        continue;
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(srcDir, d, rel), to);
      report.filesCopied++;
    }
  }
  // import notes of the merged application and the events kept aside
  const notes = path.join(dstDir, 'import-phpr', slug);
  for (const rel of walk(path.join(srcDir, 'import-phpr'))) {
    fs.mkdirSync(path.dirname(path.join(notes, rel)), { recursive: true });
    fs.copyFileSync(path.join(srcDir, 'import-phpr', rel), path.join(notes, rel));
  }
  for (const c of report.eventConflicts) {
    const f = path.join(notes, 'eventi-in-conflitto', c.group.replace(/[^A-Za-z0-9_.-]/g, '_'), `${c.event}.${c.event.startsWith('JS_') ? 'js' : 'php'}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, c.code);
  }
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'UNIONE.md'), reportText(report));
  return path.join(notes, 'UNIONE.md');
}

function reportText(r) {
  const list = (title, xs) => (xs && xs.length ? `\n## ${title}\n\n${xs.map((x) => `- ${x}`).join('\n')}\n` : '');
  return `# Unione di «${r.label}»\n\n`
    + `Tabelle aggiunte: ${r.tablesAdded.length}, condivise: ${r.tablesShared.length}, rinominate: ${r.tablesRenamed.length}. Eventi aggiunti: ${r.events}.\n`
    + list('Connessioni', r.connections)
    + list('Tabelle rinominate', r.tablesRenamed)
    + list('Tabelle già presenti (usata quella del progetto)', r.tablesShared)
    + list('Report, grafici e dashboard rinominati', r.renamed)
    + list('Eventi in conflitto (tenuto quello del progetto, l\'altro è in eventi-in-conflitto/)', r.eventConflicts.map((c) => `${c.group === '_global' ? 'eventi globali' : c.group}: ${c.event}`))
    + list('Gruppi aggiunti', r.groups)
    + list('Lingue aggiunte', r.languages)
    + list('File già presenti e diversi (tenuto quello del progetto)', r.filesKept)
    + list('Avvisi', r.warnings);
}

module.exports = { mergeProjects, copyFiles, reportText, connKey };
