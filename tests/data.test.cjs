'use strict';
// Data viewer of the designer: a page of a table or of a SQL query, sorted, filtered, counted.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('../core/db.cjs');

const MYSQL = { driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'mibcrude_demo', user: 'mibcrude' };

async function check(conn, pw, table) {
  const c = await D.connect(conn, pw);
  try {
    let r = await D.tableData(c, conn, { table }, { limit: 2, offset: 0, sort: 'n', dir: 'desc' });
    assert.deepStrictEqual(r.rows.map((x) => Number(x.n)), [5, 4]);
    assert.strictEqual(r.total, 5);
    r = await D.tableData(c, conn, { table }, { limit: 2, offset: 4, sort: 'n', dir: 'desc' });
    assert.deepStrictEqual(r.rows.map((x) => Number(x.n)), [1], 'last page');
    r = await D.tableData(c, conn, { table }, { limit: 10, where: 'n > 2', sort: 'n' });
    assert.deepStrictEqual([r.total, r.rows.length, Number(r.rows[0].n)], [3, 3, 3]);
    r = await D.tableData(c, conn, { sql: `SELECT n * 10 AS d FROM ${table};` }, { limit: 10, sort: 'd', dir: 'asc' });
    assert.deepStrictEqual(r.rows.map((x) => Number(x.d)), [10, 20, 30, 40, 50]);
    assert.deepStrictEqual(r.columns, ['d']);
  } finally { await c.close(); }
}

test('data viewer: MariaDB', async () => {
  const c = await D.connect(MYSQL, 'mibcrude');
  await c.query('DROP TABLE IF EXISTS mc_data_t');
  await c.query('CREATE TABLE mc_data_t (n INT, s VARCHAR(10))');
  await c.query("INSERT INTO mc_data_t VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e')");
  await c.close();
  try { await check(MYSQL, 'mibcrude', 'mc_data_t'); } finally {
    const c2 = await D.connect(MYSQL, 'mibcrude'); await c2.query('DROP TABLE mc_data_t'); await c2.close();
  }
});

test('data viewer: SQLite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-data-'));
  const conn = { driver: 'sqlite', file: path.join(dir, 'a.sqlite') };
  const c = await D.connect(conn, '');
  await c.query('CREATE TABLE t (n INTEGER, s TEXT)');
  for (let i = 1; i <= 5; i++) await c.query('INSERT INTO t VALUES (?, ?)', [i, String(i)]);
  await c.close();
  await check(conn, '', 't');
  fs.rmSync(dir, { recursive: true, force: true });
});
