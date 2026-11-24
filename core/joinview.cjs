'use strict';
// "Vista unita": a read-only datasource built from two or more project tables, their joins and a choice of columns, all picked
// in the designer without writing SQL. The definition (source.join) is kept in the project; the SQL is generated from it for the
// dialect of the connection and stored in source.sql, so the runtime treats it like any other SQL query. Nothing is created
// in the database.
//
//   def = { base: 'tabella',                                   // first table (FROM)
//           joins: [{ table, type: 'inner' | 'left',           // one per added table, in order
//                     from: 'tabella già inclusa',             // the table it is linked to
//                     on: [{ left: 'campo di from', right: 'campo di table' }] }],   // all joined with AND
//           columns: [{ table, name, as }] }                   // as = visible name in the view
//
// Older projects stored two tables as { type, left: {table}, right: {table}, on, columns: [{ side, name, as }] }: normalize() reads both.

const DDL = require('./ddl.cjs');

const JOIN_WORD = { inner: 'INNER JOIN', left: 'LEFT JOIN' };

/** The current shape of a definition, whichever shape it was saved in. */
function normalize(def) {
  if (!def) return def;
  if (def.base !== undefined || Array.isArray(def.joins)) return { base: def.base || '', joins: def.joins || [], columns: def.columns || [] };
  const l = def.left && def.left.table;
  const r = def.right && def.right.table;
  return {
    base: l || '',
    joins: r ? [{ table: r, type: def.type, from: l, on: def.on || [] }] : [],
    columns: (def.columns || []).map((c) => ({ table: c.side === 'right' ? r : l, name: c.name, as: c.as })),
  };
}

/** Table name as written in the FROM clause: schema.table when the connection has a default schema (same rule as core/db.cjs). */
function fromName(dialect, conn, name) {
  const q = (n) => DDL.quote(dialect, n);
  const s = String(name);
  const parts = s.includes('.') ? s.split('.') : (conn.schema && conn.driver !== 'mysql' && conn.driver !== 'sqlite' ? [conn.schema, s] : [s]);
  return parts.map(q).join('.');
}

function resolve(proj, name, label) {
  const t = proj.tables.find((x) => x.name === name);
  if (!name || !t) throw new Error(`${label}: scegli una tabella`);
  if (t.source.type !== 'table' || !t.source.table) throw new Error(`${label}: "${t.name}" non è una tabella del database (query, REST e procedure non si possono unire)`);
  return t;
}

/** Check the definition against the project and return the SQL, the connection and the visible column names. */
function build(proj, input) {
  const def = normalize(input);
  if (!def || !def.base) throw new Error('Scegli la tabella di partenza');
  if (!def.joins.length) throw new Error('Spunta almeno una colonna di un\'altra tabella collegata (entra nella vista da sola), oppure aggiungine una a mano');
  const order = [def.base, ...def.joins.map((j) => j.table)];
  const tables = new Map();
  order.forEach((n, i) => {
    const t = resolve(proj, n, i === 0 ? 'Tabella di partenza' : `Tabella ${i + 1}`);
    if (tables.has(n)) throw new Error(`La tabella "${n}" è usata due volte: scegli tabelle diverse`);
    tables.set(n, t);
  });
  const first = tables.get(def.base);
  for (const t of tables.values()) {
    if (t.connection !== first.connection) throw new Error(`Le tabelle stanno su connessioni diverse (${first.connection} e ${t.connection}): si possono unire solo tabelle dello stesso database`);
  }
  const conn = proj.connections.find((c) => c.id === first.connection);
  if (!conn) throw new Error(`Connessione "${first.connection}" inesistente`);
  if (conn.driver === 'rest') throw new Error('Le origini REST non si possono unire');

  const has = (t, n) => t.fields.some((f) => f.name === n && !f.calculated);
  const alias = new Map(order.map((n, i) => [n, `t${i + 1}`]));
  const dialect = DDL.dialectOf(conn);
  const q = (n) => DDL.quote(dialect, n);

  let from = `${fromName(dialect, conn, first.source.table)} t1`;
  def.joins.forEach((j, i) => {
    if (!JOIN_WORD[j.type]) throw new Error(`${j.table}: scegli il tipo di unione`);
    if (!j.from || !alias.has(j.from) || order.indexOf(j.from) > i) throw new Error(`${j.table}: scegli una tabella già inclusa a cui collegarla`);
    const on = (j.on || []).filter((k) => k && k.left && k.right);
    if (!on.length) throw new Error(`${j.table}: indica almeno una coppia di campi collegati`);
    const t = tables.get(j.table);
    const f = tables.get(j.from);
    for (const k of on) {
      if (!has(f, k.left)) throw new Error(`"${k.left}" non è un campo di ${f.name}`);
      if (!has(t, k.right)) throw new Error(`"${k.right}" non è un campo di ${t.name}`);
    }
    const cond = on.map((k) => `${alias.get(j.from)}.${q(k.left)} = ${alias.get(j.table)}.${q(k.right)}`).join(' AND ');
    from += `\n${JOIN_WORD[j.type]} ${fromName(dialect, conn, t.source.table)} ${alias.get(j.table)}\n  ON ${cond}`;
  });

  const cols = (def.columns || []).filter((c) => c && c.name && c.table);
  if (!cols.length) throw new Error('Scegli almeno una colonna da mostrare');
  const names = new Set();
  for (const c of cols) {
    const t = tables.get(c.table);
    if (!t) throw new Error(`"${c.name}": la tabella ${c.table} non fa parte della vista`);
    if (!has(t, c.name)) throw new Error(`"${c.name}" non è un campo di ${t.name}`);
    c.as = String(c.as || '').trim() || c.name;
    const key = c.as.toLowerCase();
    if (names.has(key)) throw new Error(`Il nome "${c.as}" è usato da più colonne: cambia il nome visibile di una`);
    names.add(key);
  }
  const select = cols.map((c) => `  ${alias.get(c.table)}.${q(c.name)} AS ${q(c.as)}`).join(',\n');
  return { sql: `SELECT\n${select}\nFROM ${from}`, connection: conn.id, columns: cols.map((c) => c.as), tables: order };
}

module.exports = { build, normalize, JOIN_WORD };
