'use strict';
// The demo database of the tests, defined once and created in any of the five dialects.
const D = require('../../core/db.cjs');
const DDL = require('../../core/ddl.cjs');

const id = { name: 'id', type: 'int', pk: true, autoInc: true };
const TABLES = [
  { name: 'categories', cols: [id, { name: 'name', type: 'varchar', size: 100 }, { name: 'description', type: 'text', nullable: true }],
    rows: [['Libri', 'Carta e ebook'], ['Elettronica', 'Gadget'], ['Casa', 'Arredo']] },
  { name: 'products', cols: [id, { name: 'category_id', type: 'int', ref: { table: 'categories' } }, { name: 'name', type: 'varchar', size: 150 }, { name: 'price', type: 'decimal', size: 10, scale: 2 },
    { name: 'in_stock', type: 'bool' }, { name: 'photo', type: 'varchar', size: 500, nullable: true }, { name: 'created_at', type: 'datetime', nullable: true }],
    rows: [[1, 'Il nome della rosa', 12.5, true, null, '2026-10-01 10:00:00'], [1, 'Gomorra', 11, true, null, '2026-10-01 10:00:00'], [2, 'Cuffie BT', 59.9, true, null, '2026-10-01 10:00:00'], [2, 'Mouse', 19.99, false, null, '2026-10-01 10:00:00'], [3, 'Lampada', 35, true, null, '2026-10-01 10:00:00']] },
  { name: 'countries', cols: [id, { name: 'name', type: 'varchar', size: 100 }], rows: [['Italia'], ['Francia']] },
  { name: 'cities', cols: [id, { name: 'country_id', type: 'int', ref: { table: 'countries' } }, { name: 'name', type: 'varchar', size: 100 }], rows: [[1, 'Roma'], [1, 'Milano'], [2, 'Parigi'], [2, 'Lione']] },
  { name: 'customers', cols: [id, { name: 'name', type: 'varchar', size: 150 }, { name: 'email', type: 'varchar', size: 200, nullable: true }, { name: 'country_id', type: 'int', nullable: true, ref: { table: 'countries' } },
    { name: 'city_id', type: 'int', nullable: true, ref: { table: 'cities' } }, { name: 'notes', type: 'text', nullable: true }],
    rows: [['Mario Rossi', 'mario@example.com', 1, 1, null], ['Anna Bianchi', 'anna@example.com', 1, 2, null], ['Jean Dupont', 'jean@example.fr', 2, 3, null]] },
  { name: 'orders', cols: [id, { name: 'customer_id', type: 'int', ref: { table: 'customers' } }, { name: 'order_date', type: 'date' }, { name: 'status', type: 'varchar', size: 20 }, { name: 'total', type: 'decimal', size: 10, scale: 2, nullable: true }],
    rows: [[1, '2026-09-01', 'new', 24.5], [1, '2026-10-02', 'shipped', 59.9], [2, '2026-10-15', 'new', 35], [3, '2026-10-20', 'closed', 19.99]] },
  { name: 'order_items', cols: [id, { name: 'order_id', type: 'int', ref: { table: 'orders' } }, { name: 'product_id', type: 'int', ref: { table: 'products' } }, { name: 'qty', type: 'int' }, { name: 'price', type: 'decimal', size: 10, scale: 2 }],
    rows: [[1, 1, 1, 12.5], [1, 2, 1, 11], [2, 3, 1, 59.9], [3, 5, 1, 35], [4, 4, 1, 19.99]] },
];
const SYSTEM = ['mc_users', 'mc_groups', 'mc_members', 'mc_rights', 'mc_audit', 'mc_locks', 'mc_reports', 'mc_totp'];

function lit(dialect, v, col) {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return dialect === 'pgsql' ? (v ? 'TRUE' : 'FALSE') : v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  if (dialect === 'oracle' && col && col.type === 'date') return `DATE '${v}'`;
  if (dialect === 'oracle' && col && col.type === 'datetime') return `TIMESTAMP '${v}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function reset(conn, password) {
  const dialect = conn.driver;
  const c = await D.connect(conn, password);
  try {
    for (const t of [...TABLES].reverse().map((x) => x.name).concat(SYSTEM)) {
      try { await c.query(DDL.dropTable(dialect, t) + (dialect === 'pgsql' ? ' CASCADE' : dialect === 'oracle' ? ' CASCADE CONSTRAINTS' : '')); } catch { /* missing */ }
    }
    for (const t of TABLES) {
      await c.query(DDL.createTable(dialect, t.name, t.cols.map((x) => ({ nullable: false, ...x }))));
      const cols = t.cols.filter((x) => !x.autoInc);
      for (const r of t.rows) await c.query(`INSERT INTO ${DDL.quote(dialect, t.name)} (${cols.map((x) => DDL.quote(dialect, x.name)).join(', ')}) VALUES (${r.map((v, i) => lit(dialect, v, cols[i])).join(', ')})`);
    }
    if (dialect === 'sqlite') await c.save();
  } finally { await c.close(); }
}

module.exports = { TABLES, reset };
