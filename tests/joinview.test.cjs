'use strict';
// "Vista unita" (core/joinview.cjs): SQL generated for each dialect, two or more tables, checks on the definition, the shape saved
// by the first version, and a real run on SQLite through the same path the designer uses (wizard.addSqlView).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const J = require('../core/joinview.cjs');
const W = require('../core/wizard.cjs');
const D = require('../core/db.cjs');

const tbl = (name, connection, fields, table = name, type = 'table') => ({ name, connection, details: [], source: type === 'table' ? { type, table } : { type, sql: 'select 1' }, fields: fields.map((n) => ({ name: n })) });
const proj = (conn, extra = []) => ({
  connections: [conn],
  tables: [tbl('canali', conn.id, ['IdCanale', 'Nome', 'Regione']), tbl('prodotti', conn.id, ['IdProdotto', 'IdCanale', 'Nome', 'Prezzo']), ...extra],
  project: { languages: ['it'], settings: {} },
});
const def = (over = {}) => ({
  base: 'canali',
  joins: [{ table: 'prodotti', type: 'inner', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] }],
  columns: [{ table: 'canali', name: 'Nome', as: 'Canale' }, { table: 'canali', name: 'Regione', as: 'Regione' }, { table: 'prodotti', name: 'Nome', as: 'Prodotto' }, { table: 'prodotti', name: 'Prezzo', as: 'Prezzo' }], ...over,
});
const withJoin = (over) => def({ joins: [{ table: 'prodotti', type: 'inner', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }], ...over }] });

test('SQL per dialect: quoting, aliases and join word', () => {
  const my = J.build(proj({ id: 'a', driver: 'mysql' }), def());
  assert.match(my.sql, /^SELECT\n {2}t1\.`Nome` AS `Canale`,/);
  assert.match(my.sql, /FROM `canali` t1\nINNER JOIN `prodotti` t2\n {2}ON t1\.`IdCanale` = t2\.`IdCanale`$/);
  assert.deepEqual(my.columns, ['Canale', 'Regione', 'Prodotto', 'Prezzo']);
  assert.deepEqual(my.tables, ['canali', 'prodotti']);
  assert.equal(my.connection, 'a');
  assert.match(J.build(proj({ id: 'a', driver: 'pgsql' }), withJoin({ type: 'left' })).sql, /FROM "canali" t1\nLEFT JOIN "prodotti" t2/);
  assert.match(J.build(proj({ id: 'a', driver: 'sqlsrv', host: 'srv.local' }), def()).sql, /t1\.\[Nome\] AS \[Canale\]/);
  assert.match(J.build(proj({ id: 'a', driver: 'oracle' }), def()).sql, /FROM "canali" t1/); // table alias without AS
});

test('Fabric uses the T-SQL quoting and no default schema is invented', () => {
  const b = J.build(proj({ id: 'main', driver: 'sqlsrv', host: 'x.datawarehouse.fabric.microsoft.com' }), def());
  assert.match(b.sql, /FROM \[canali\] t1\nINNER JOIN \[prodotti\] t2/);
  assert.ok(!/dbo/.test(b.sql));
});

test('connection schema and dotted names are honoured', () => {
  const p = proj({ id: 'a', driver: 'sqlsrv', host: 'srv.local', schema: 'vendite' });
  p.tables[1].source.table = 'altro.prodotti';
  const b = J.build(p, def());
  assert.match(b.sql, /FROM \[vendite\]\.\[canali\] t1/);
  assert.match(b.sql, /INNER JOIN \[altro\]\.\[prodotti\] t2/);
  assert.match(J.build(proj({ id: 'a', driver: 'mysql', schema: 'ignored' }), def()).sql, /FROM `canali` t1/); // MySQL: the schema is the database
});

test('several linking pairs are ANDed and identifiers are escaped', () => {
  const p = proj({ id: 'a', driver: 'sqlsrv', host: 'srv.local' });
  p.tables[0].fields.push({ name: 'a]b' });
  p.tables[1].fields.push({ name: 'Reg' });
  const b = J.build(p, def({ joins: [{ table: 'prodotti', type: 'inner', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }, { left: 'Regione', right: 'Reg' }] }], columns: [{ table: 'canali', name: 'a]b', as: 'x]y' }] }));
  assert.match(b.sql, /ON t1\.\[IdCanale\] = t2\.\[IdCanale\] AND t1\.\[Regione\] = t2\.\[Reg\]/);
  assert.match(b.sql, /t1\.\[a\]\]b\] AS \[x\]\]y\]/);
});

test('more than two tables: a star around the base and a chain, each with its own join type', () => {
  const p = proj({ id: 'a', driver: 'mysql' }, [tbl('contratti', 'a', ['IdContratto', 'IdCanale']), tbl('righe', 'a', ['IdRiga', 'IdContratto', 'Qta'])]);
  const b = J.build(p, {
    base: 'canali',
    joins: [
      { table: 'prodotti', type: 'left', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] },
      { table: 'contratti', type: 'inner', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] }, // star
      { table: 'righe', type: 'left', from: 'contratti', on: [{ left: 'IdContratto', right: 'IdContratto' }] }, // chain
    ],
    columns: [{ table: 'canali', name: 'Nome', as: 'Canale' }, { table: 'prodotti', name: 'Prezzo', as: 'Prezzo' }, { table: 'righe', name: 'Qta', as: 'Qta' }],
  });
  assert.match(b.sql, /FROM `canali` t1\nLEFT JOIN `prodotti` t2\n {2}ON t1\.`IdCanale` = t2\.`IdCanale`\nINNER JOIN `contratti` t3\n {2}ON t1\.`IdCanale` = t3\.`IdCanale`\nLEFT JOIN `righe` t4\n {2}ON t3\.`IdContratto` = t4\.`IdContratto`$/);
  assert.match(b.sql, /t4\.`Qta` AS `Qta`/);
  assert.deepEqual(b.tables, ['canali', 'prodotti', 'contratti', 'righe']);
});

test('the definition is checked', () => {
  const p = proj({ id: 'a', driver: 'mysql' }, [tbl('altra', 'b', ['IdCanale']), tbl('qry', 'a', ['IdCanale'], 'x', 'sql')]);
  const bad = (d, re) => assert.throws(() => J.build(p, d), re);
  bad(def({ base: '' }), /tabella di partenza/);
  bad(def({ joins: [] }), /colonna di un'altra tabella/);
  bad(withJoin({ type: 'full' }), /tipo di unione/);
  bad(withJoin({ table: 'canali' }), /usata due volte/);
  bad(withJoin({ table: 'altra' }), /connessioni diverse/);
  bad(withJoin({ table: 'qry' }), /non è una tabella del database/);
  bad(withJoin({ table: '' }), /scegli una tabella/);
  bad(withJoin({ from: 'nessuna' }), /già inclusa/);
  bad(withJoin({ on: [] }), /almeno una coppia/);
  bad(withJoin({ on: [{ left: 'Manca', right: 'IdCanale' }] }), /"Manca" non è un campo di canali/);
  bad(def({ columns: [] }), /almeno una colonna/);
  bad(def({ columns: [{ table: 'prodotti', name: 'Nope', as: 'Nope' }] }), /"Nope" non è un campo di prodotti/);
  bad(def({ columns: [{ table: 'altra', name: 'IdCanale', as: 'x' }] }), /non fa parte della vista/);
  bad(def({ columns: [{ table: 'canali', name: 'Nome', as: 'N' }, { table: 'prodotti', name: 'Nome', as: 'n' }] }), /usato da più colonne/);
  // a table can only be linked to one that came before it
  const q = proj({ id: 'a', driver: 'mysql' }, [tbl('contratti', 'a', ['IdContratto', 'IdCanale'])]);
  assert.throws(() => J.build(q, { base: 'canali', joins: [
    { table: 'contratti', type: 'left', from: 'prodotti', on: [{ left: 'IdCanale', right: 'IdCanale' }] },
    { table: 'prodotti', type: 'left', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] },
  ], columns: [{ table: 'canali', name: 'Nome', as: 'Nome' }] }), /già inclusa/);
});

test('empty visible name falls back to the column name; calculated fields cannot be joined', () => {
  const p = proj({ id: 'a', driver: 'mysql' });
  assert.deepEqual(J.build(p, def({ columns: [{ table: 'canali', name: 'Nome', as: '  ' }] })).columns, ['Nome']);
  p.tables[0].fields.push({ name: 'Calc', calculated: true });
  assert.throws(() => J.build(p, def({ columns: [{ table: 'canali', name: 'Calc', as: 'Calc' }] })), /non è un campo/);
});

test('the two-table shape saved by the first version still builds the same SQL', () => {
  const p = proj({ id: 'a', driver: 'mysql' });
  const old = { type: 'left', left: { table: 'canali' }, right: { table: 'prodotti' }, on: [{ left: 'IdCanale', right: 'IdCanale' }],
    columns: [{ side: 'left', name: 'Nome', as: 'Canale' }, { side: 'right', name: 'Prezzo', as: 'Prezzo' }] };
  const now = { base: 'canali', joins: [{ table: 'prodotti', type: 'left', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] }],
    columns: [{ table: 'canali', name: 'Nome', as: 'Canale' }, { table: 'prodotti', name: 'Prezzo', as: 'Prezzo' }] };
  assert.equal(J.build(p, old).sql, J.build(p, now).sql);
  assert.deepEqual(J.normalize(old), now);
  assert.deepEqual(J.normalize(now), now);
});

test('runs on SQLite through wizard.addSqlView and keeps only the chosen columns', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-join-')), 'j.sqlite');
  const conn = { id: 'lite', driver: 'sqlite', file };
  const c = await D.connect(conn, '');
  await c.query('CREATE TABLE canali (IdCanale INTEGER, Nome TEXT, Regione TEXT)');
  await c.query('CREATE TABLE prodotti (IdProdotto INTEGER, IdCanale INTEGER, Nome TEXT, Prezzo REAL)');
  await c.query('CREATE TABLE contratti (IdContratto INTEGER, IdCanale INTEGER, Stato TEXT)');
  await c.query("INSERT INTO canali VALUES (1,'Web','Nord'),(2,'Negozio','Sud'),(3,'Vuoto','Centro')");
  await c.query("INSERT INTO prodotti VALUES (10,1,'Libro',9.5),(11,1,'Penna',1.2),(12,2,'Quaderno',3)");
  await c.query("INSERT INTO contratti VALUES (100,1,'attivo'),(101,2,'chiuso')");
  await c.save();
  await c.close();

  const p = proj(conn, [tbl('contratti', 'lite', ['IdContratto', 'IdCanale', 'Stato'])]);
  for (const [type, rows] of [['inner', 3], ['left', 4]]) {
    const { sql } = J.build(p, withJoin({ type }));
    const q = await D.connect(conn, '');
    const res = await q.query(sql);
    await q.close();
    assert.equal(res.length, rows, type);
    assert.deepEqual(Object.keys(res[0]), ['Canale', 'Regione', 'Prodotto', 'Prezzo']);
  }
  // three tables: every channel with its products and contracts
  const three = def({
    joins: [
      { table: 'prodotti', type: 'left', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] },
      { table: 'contratti', type: 'left', from: 'canali', on: [{ left: 'IdCanale', right: 'IdCanale' }] },
    ],
    columns: [{ table: 'canali', name: 'Nome', as: 'Canale' }, { table: 'prodotti', name: 'Nome', as: 'Prodotto' }, { table: 'contratti', name: 'Stato', as: 'Stato' }],
  });
  const q = await D.connect(conn, '');
  const res = await q.query(J.build(p, three).sql);
  await q.close();
  assert.equal(res.length, 4); // Web x2 products, Negozio, Vuoto (no match)
  assert.deepEqual(res.find((r) => r.Canale === 'Vuoto'), { Canale: 'Vuoto', Prodotto: null, Stato: null });

  const ds = await W.addSqlView(p, conn, '', 'canali_prodotti', J.build(p, three).sql);
  assert.deepEqual(ds.fields.map((f) => f.name), ['Canale', 'Prodotto', 'Stato']);
  assert.equal(ds.readOnly, true);
  assert.equal(ds.source.type, 'sql');
});

test('every IPC channel handled in main.cjs is allowed by the preload (a missing one shows up as "Unknown channel")', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'electron', f), 'utf8');
  const preload = read('preload.cjs');
  const missing = [...read('main.cjs').matchAll(/\bhandle\('([^']+)'/g)].map((m) => m[1]).filter((c) => !preload.includes(`'${c}'`));
  assert.deepEqual(missing, []);
});
