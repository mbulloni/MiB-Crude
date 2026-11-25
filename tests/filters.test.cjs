'use strict';
// Data viewer filters without SQL (core/filters.cjs): tests picked field by field, free-text search, hand-written SQL, run on SQLite.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('../core/db.cjs');
const F = require('../core/filters.cjs');

async function withTable(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-filters-'));
  const conn = { driver: 'sqlite', file: path.join(dir, 'f.sqlite') };
  const c = await D.connect(conn, '');
  try {
    await c.query('CREATE TABLE t (id INTEGER, name TEXT, city TEXT, total REAL, day TEXT, note TEXT)');
    await c.query(`INSERT INTO t VALUES (1,'Rossi Mario','Roma',10.5,'2026-01-10','50% sconto'),(2,'Bianchi Anna','Milano',99,'2026-02-15',NULL),(3,'O''Brien Sean','Roma',200,'2026-03-20',''),(4,'Verdi Luca','Napoli',5,'2026-04-01','a_b')`);
    await fn(c, conn);
  } finally { await c.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const ids = (r) => r.rows.map((x) => Number(x.id)).sort((a, b) => a - b);
const view = (c, conn, opts) => D.tableData(c, conn, { table: 't' }, { limit: 50, ...opts });

test('picked tests: text, number, date, empty — all must hold', async () => {
  await withTable(async (c, conn) => {
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'city', op: 'equals', v: 'roma', kind: 'text' }] })), [1, 3], 'equals is not case sensitive');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'name', op: 'contains', v: 'ANN', kind: 'text' }] })), [2], 'contains');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'name', op: 'starts', v: 'ver', kind: 'text' }] })), [4], 'starts with');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'total', op: 'more', v: '10', kind: 'number' }] })), [1, 2, 3]);
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'total', op: 'between', v: '10', v2: '100', kind: 'number' }] })), [1, 2]);
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'day', op: 'between', v: '2026-02-01', v2: '2026-03-31', kind: 'date' }] })), [2, 3]);
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'note', op: 'empty', kind: 'text' }] })), [2, 3], 'NULL and empty text');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'note', op: 'notempty', kind: 'text' }] })), [1, 4]);
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'city', op: 'notequals', v: 'Roma', kind: 'text' }] })), [2, 4]);
    const both = await view(c, conn, { filters: [{ field: 'city', op: 'equals', v: 'Roma', kind: 'text' }, { field: 'total', op: 'less', v: '100', kind: 'number' }] });
    assert.deepStrictEqual([ids(both), both.total], [[1], 1], 'two tests: both must hold, the count follows');
    // a test with no value is ignored, not an error
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'city', op: 'equals', v: '', kind: 'text' }] })), [1, 2, 3, 4]);
  });
});

test('wildcards and quotes typed by the user are plain text; bad numbers and dates are refused', async () => {
  await withTable(async (c, conn) => {
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'note', op: 'contains', v: '50%', kind: 'text' }] })), [1], '% is not a wildcard');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'note', op: 'contains', v: '_', kind: 'text' }] })), [4], '_ is not a wildcard');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'name', op: 'contains', v: "O'Brien", kind: 'text' }] })), [3], 'apostrophe');
    assert.deepStrictEqual(ids(await view(c, conn, { filters: [{ field: 'name', op: 'equals', v: "x' OR '1'='1", kind: 'text' }] })), [], 'injection stays text');
    await assert.rejects(view(c, conn, { filters: [{ field: 'total', op: 'more', v: '1; DROP TABLE t', kind: 'number' }] }), /non è un numero/);
    await assert.rejects(view(c, conn, { filters: [{ field: 'day', op: 'equals', v: "2026-01-01' OR 1=1", kind: 'date' }] }), /non è una data/);
    assert.strictEqual((await view(c, conn, {})).total, 4, 'the table is untouched');
  });
});

test('search in every column, together with the tests and the SQL condition', async () => {
  await withTable(async (c, conn) => {
    const columns = ['id', 'name', 'city', 'total', 'day', 'note'];
    assert.deepStrictEqual(ids(await view(c, conn, { search: 'roma', columns })), [1, 3], 'text column');
    assert.deepStrictEqual(ids(await view(c, conn, { search: '2026-02', columns })), [2], 'a date column');
    assert.deepStrictEqual(ids(await view(c, conn, { search: '99', columns })), [2], 'a number column');
    assert.deepStrictEqual(ids(await view(c, conn, { search: 'ROMA', columns, filters: [{ field: 'total', op: 'more', v: '100', kind: 'number' }] })), [3]);
    assert.deepStrictEqual(ids(await view(c, conn, { search: 'roma', columns, where: 'total < 100' })), [1], 'hand-written SQL still works, ANDed');
    assert.deepStrictEqual(ids(await view(c, conn, { search: '' , columns })), [1, 2, 3, 4], 'empty search = everything');
  });
});

test('SQL text for the other drivers: quoting, casts and the LIKE escape', () => {
  const f = [{ field: 'a b', op: 'contains', v: "o'x\\y", kind: 'text' }];
  assert.match(F.build('mysql', { filters: f }), /LOWER\(CAST\(`a b` AS CHAR\)\) LIKE LOWER\('%o''x\\\\\\\\y%'\) ESCAPE '\\\\'/);
  assert.match(F.build('sqlsrv', { filters: f }), /CAST\(\[a b\] AS NVARCHAR\(4000\)\)/);
  assert.match(F.build('oracle', { filters: f }), /TO_CHAR\("a b"\)/);
  assert.match(F.build('pgsql', { filters: f }), /CAST\("a b" AS TEXT\)/);
  assert.strictEqual(F.build('sqlite', {}), '');
});
