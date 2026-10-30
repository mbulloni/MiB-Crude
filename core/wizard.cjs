'use strict';
// Schema import and refresh: adds or updates datasources from the live database while
// keeping every setting the developer already changed.

const D = require('./db.cjs');
const { datasourceFromSchema, suggestDetails, defaultField } = require('./defaults.cjs');

async function withConnection(conn, password, fn) {
  const c = await D.connect(conn, password);
  try { return await fn(c); } finally { try { await c.close(); } catch { /* ignore */ } }
}

// Add tables to the project. `names` are table/view names of connection `conn`.
async function importTables(proj, conn, password, names) {
  return withConnection(conn, password, async (c) => {
    const listed = await D.listTables(c, conn);
    const types = Object.fromEntries(listed.map((t) => [t.name, t.type]));
    const described = [];
    for (const n of names) described.push(await D.describeTable(c, conn, n));
    // Lookups can point to tables not imported: describe them for display-field guessing.
    const refs = new Set(described.flatMap((d) => d.fks.map((f) => f.refTable)).filter((r) => !names.includes(r)));
    const extra = [];
    for (const r of refs) { try { extra.push(await D.describeTable(c, conn, r)); } catch { /* ignore */ } }
    const all = [...described, ...extra];
    const added = [];
    for (const d of described) {
      if (proj.tables.some((t) => t.name === d.name)) continue;
      const ds = datasourceFromSchema(d, {
        connection: conn.id, languages: proj.project.languages, settings: proj.project.settings, allTables: all, type: types[d.name] === 'view' ? 'view' : 'table',
      });
      ds.details = suggestDetails(d.name, described);
      proj.tables.push(ds);
      added.push(d.name);
    }
    // New tables may be details of tables imported earlier.
    for (const t of proj.tables) {
      if (added.includes(t.name)) continue;
      for (const s of suggestDetails(t.name, described)) if (!t.details.some((x) => x.table === s.table)) t.details.push(s);
    }
    return added;
  });
}

// Custom SQL datasource ("SQL view" in phpr terms).
async function addSqlView(proj, conn, password, name, sql) {
  if (proj.tables.some((t) => t.name === name)) throw new Error(`Esiste già un'origine dati "${name}"`);
  return withConnection(conn, password, async (c) => {
    const cols = await D.describeQuery(c, sql);
    const ds = datasourceFromSchema({ name, columns: cols, pk: [], fks: [] }, {
      connection: conn.id, languages: proj.project.languages, settings: proj.project.settings, type: 'sql', sql,
    });
    ds.readOnly = true;
    proj.tables.push(ds);
    return ds;
  });
}

// Compare a datasource with the database: add new columns, flag dropped ones, refresh types.
async function refreshTable(proj, conn, password, table) {
  if (conn.driver === 'rest') {
    const ds = proj.tables.find((t) => t.name === table);
    const s = await require('./rest.cjs').sample(conn, password, ds.source.path, ds.source.dataPath);
    const added = [];
    for (const col of s.columns) if (!ds.fields.some((f) => f.name === col.name)) { ds.fields.push(defaultField(col, proj.project.languages)); added.push(col.name); }
    return { added, removed: [] };
  }
  return withConnection(conn, password, async (c) => {
    const ds = proj.tables.find((t) => t.name === table);
    if (!ds) throw new Error(`Origine dati ${table} non trovata`);
    const cols = ds.source.type === 'sql' ? await D.describeQuery(c, ds.source.sql) : (await D.describeTable(c, conn, ds.source.table)).columns;
    const names = new Set(cols.map((x) => x.name));
    const added = [];
    const removed = [];
    for (const col of cols) {
      const f = ds.fields.find((x) => x.name === col.name);
      if (f) { f.dbType = col.dbType; f.type = col.type; f.nullable = col.nullable; if (ds.source.type !== 'sql') { f.pk = col.pk; f.autoInc = col.autoInc; } }
      else { ds.fields.push(defaultField(col, proj.project.languages)); added.push(col.name); }
    }
    for (const f of [...ds.fields]) if (!names.has(f.name) && !f.calculated) { removed.push(f.name); ds.fields = ds.fields.filter((x) => x !== f); }
    if (ds.source.type !== 'sql') ds.keys = cols.filter((x) => x.pk).map((x) => x.name);
    return { added, removed };
  });
}

module.exports = { withConnection, importTables, addSqlView, refreshTable };
