'use strict';
// Business templates: create tables + project on MariaDB (and SQLite), generate a valid app.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../core/project.cjs');
const T = require('../core/templates.cjs');
const G = require('../core/generator.cjs');
const D = require('../core/db.cjs');
const DDL = require('../core/ddl.cjs');

const ALL = {
  mysql: [{ id: 'main', name: 'Demo', driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  sqlite: [{ id: 'main', name: 'Demo', driver: 'sqlite', file: path.join(os.tmpdir(), `mc-tpl-${process.pid}.sqlite`) }, ''],
  pgsql: [{ id: 'main', name: 'Demo', driver: 'pgsql', host: '127.0.0.1', port: 15432, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  sqlsrv: [{ id: 'main', name: 'Demo', driver: 'sqlsrv', host: '127.0.0.1', port: 11433, database: 'mibcrude_demo', user: 'sa' }, 'MiBcrude!2026'],
  oracle: [{ id: 'main', name: 'Demo', driver: 'oracle', host: '127.0.0.1', port: 11521, database: 'FREEPDB1', user: 'mibcrude' }, 'mibcrude'],
};
// Default: MariaDB and SQLite; MIBCRUDE_TEST_DB=pgsql|sqlsrv|oracle uses the Docker containers of docs/TESTING.md.
const CONNS = process.env.MIBCRUDE_TEST_DB ? [ALL[process.env.MIBCRUDE_TEST_DB]] : [ALL.mysql, ALL.sqlite];

for (const [conn, pw] of CONNS) {
  test(`all business templates on ${conn.driver}`, async () => {
    const all = T.TEMPLATES.flatMap((t) => t.tables.map((x) => x.name)).reverse();
    const c = await D.connect(conn, pw);
    for (const t of all) { try { await c.query(DDL.dropTable(conn.driver, t)); } catch { /* missing */ } }
    await c.close();
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-tpl-')), 'p');
    const proj = P.createProject(dir, 'tpl');
    proj.connections.push(conn);
    for (const t of T.list()) {
      const r = await T.apply(proj, conn, pw, t.id);
      assert.strictEqual(r.created.length, t.tables.length, t.id);
    }
    assert.ok(proj.tables.find((t) => t.name === 'crm_activities').pages.list.views.length === 2);
    assert.strictEqual(proj.menu.items.length, 4);
    P.saveProject(proj);
    const out = G.generate(P.loadProject(dir), { secrets: { connections: { main: pw } }, outDir: path.join(dir, 'out') }).outDir;
    assert.deepStrictEqual(G.lint(out), []);
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });
}
