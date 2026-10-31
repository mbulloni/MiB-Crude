'use strict';
// Stored procedure datasources on MariaDB: procedure list and fields in the designer, then the generated app
// calls it with constant, address and event parameters; search, filters, sorting, paging and totals in memory.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const P = require('../core/project.cjs');
const W = require('../core/wizard.cjs');
const G = require('../core/generator.cjs');
const D = require('../core/db.cjs');

// MIBCRUDE_TEST_DB as in e2e.test.cjs (sqlite has no procedures)
const DBS = {
  mysql: [{ driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  pgsql: [{ driver: 'pgsql', host: '127.0.0.1', port: 15432, database: 'mibcrude_demo', user: 'mibcrude' }, 'mibcrude'],
  sqlsrv: [{ driver: 'sqlsrv', host: '127.0.0.1', port: 11433, database: 'mibcrude_demo', user: 'sa' }, 'MiBcrude!2026'],
  oracle: [{ driver: 'oracle', host: '127.0.0.1', port: 11521, database: 'FREEPDB1', user: 'mibcrude' }, 'mibcrude'],
};
const KIND = process.env.MIBCRUDE_TEST_DB || 'mysql';
const SKIP = !DBS[KIND] && `${KIND}: niente stored procedure`;
const CONN = DBS[KIND] ? { id: 'main', name: 'Demo', ...DBS[KIND][0] } : null;
const PW = DBS[KIND] ? DBS[KIND][1] : '';
const IMAGE = { sqlsrv: 'mibcrude-php:8.3', oracle: 'mibcrude-php-oci:8.3' }[KIND];
const PORT = 19500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/index.php`;
const ROWS = "(1, 'NORD', 2025, 'Rossi', 100), (2, 'NORD', 2026, 'Bianchi', 250.5), (3, 'SUD', 2026, 'Verdi', 80), (4, 'NORD', 2026, 'Neri', 40), (5, 'NORD', 2026, 'Russo', 10)";
const TABLE = 'CREATE TABLE mc_proc_sales (id INT PRIMARY KEY, area VARCHAR(20), anno INT, venditore VARCHAR(40), importo DECIMAL(10,2))';
const ignore = (stmt) => `BEGIN EXECUTE IMMEDIATE '${stmt}'; EXCEPTION WHEN OTHERS THEN NULL; END;`;
const SETUP = {
  mysql: ['DROP PROCEDURE IF EXISTS mc_proc_vendite', 'DROP TABLE IF EXISTS mc_proc_sales', TABLE, `INSERT INTO mc_proc_sales VALUES ${ROWS}`,
    'CREATE PROCEDURE mc_proc_vendite(IN p_area VARCHAR(20), IN p_anno INT) BEGIN SELECT id, venditore, area, importo FROM mc_proc_sales WHERE area = p_area AND anno = p_anno; END'],
  pgsql: ['DROP FUNCTION IF EXISTS mc_proc_vendite(varchar, int)', 'DROP TABLE IF EXISTS mc_proc_sales', TABLE, `INSERT INTO mc_proc_sales VALUES ${ROWS}`,
    'CREATE FUNCTION mc_proc_vendite(p_area varchar, p_anno int) RETURNS TABLE(id int, venditore varchar, area varchar, importo numeric) AS $$ SELECT s.id, s.venditore, s.area, s.importo FROM mc_proc_sales s WHERE s.area = p_area AND s.anno = p_anno $$ LANGUAGE sql'],
  sqlsrv: ["IF OBJECT_ID('dbo.mc_proc_vendite') IS NOT NULL DROP PROCEDURE dbo.mc_proc_vendite", "IF OBJECT_ID('dbo.mc_proc_sales') IS NOT NULL DROP TABLE dbo.mc_proc_sales", TABLE, `INSERT INTO mc_proc_sales VALUES ${ROWS}`,
    'CREATE PROCEDURE dbo.mc_proc_vendite @p_area NVARCHAR(20), @p_anno INT AS BEGIN SET NOCOUNT ON; SELECT id, venditore, area, importo FROM mc_proc_sales WHERE area = @p_area AND anno = @p_anno END'],
  oracle: [ignore('DROP FUNCTION mc_proc_vendite'), ignore('DROP TYPE mc_proc_tab'), ignore('DROP TYPE mc_proc_row'), ignore('DROP TABLE mc_proc_sales'), TABLE,
    ...ROWS.slice(1, -1).split('), (').map((r) => `INSERT INTO mc_proc_sales VALUES (${r})`),
    'CREATE TYPE mc_proc_row AS OBJECT (id NUMBER, venditore VARCHAR2(40), area VARCHAR2(20), importo NUMBER(10,2))', 'CREATE TYPE mc_proc_tab AS TABLE OF mc_proc_row',
    `CREATE FUNCTION mc_proc_vendite(p_area VARCHAR2, p_anno NUMBER) RETURN mc_proc_tab PIPELINED AS BEGIN
       FOR r IN (SELECT id, venditore, area, importo FROM mc_proc_sales WHERE area = p_area AND anno = p_anno) LOOP PIPE ROW(mc_proc_row(r.id, r.venditore, r.area, r.importo)); END LOOP; RETURN; END;`],
};
const CLEANUP = {
  mysql: ['DROP PROCEDURE IF EXISTS mc_proc_vendite', 'DROP TABLE IF EXISTS mc_proc_sales'],
  pgsql: ['DROP FUNCTION IF EXISTS mc_proc_vendite(varchar, int)', 'DROP TABLE IF EXISTS mc_proc_sales'],
  sqlsrv: ['DROP PROCEDURE dbo.mc_proc_vendite', 'DROP TABLE dbo.mc_proc_sales'],
  oracle: [ignore('DROP FUNCTION mc_proc_vendite'), ignore('DROP TYPE mc_proc_tab'), ignore('DROP TYPE mc_proc_row'), ignore('DROP TABLE mc_proc_sales')],
};
let server;
let dir;

async function sql(statements) {
  const c = await D.connect(CONN, PW);
  try { for (const s of statements) await c.query(s); } finally { await c.close(); }
}

const get = async (url) => {
  const r = await fetch(BASE + url);
  const text = await r.text();
  const leak = text.match(/(Deprecated|Warning|Notice|Fatal error)(<\/b>)?: [^\n]{0,240}/);
  assert.ok(!leak, `PHP message in ${url}: ${leak && leak[0]}`);
  return { status: r.status, text };
};

test.before(async () => {
  if (SKIP) return;
  await sql(SETUP[KIND]);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-proc-'));
});
test.after(async () => {
  if (server) server.kill();
  if (IMAGE) try { execFileSync('docker', ['rm', '-f', `mibcrude-proc-${PORT}`], { stdio: 'ignore' }); } catch { /* gone */ }
  if (SKIP) return;
  await sql(CLEANUP[KIND]);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('stored procedure: designer list and fields, app with parameters, search, sort, paging, totals', { skip: SKIP }, async () => {
  // designer: the procedure and its IN parameters come from the database
  const procs = await W.withConnection(CONN, PW, (c) => D.listProcedures(c));
  const p0 = procs.find((x) => /(^|\.)mc_proc_vendite$/i.test(x.name));
  assert.deepStrictEqual(p0.params.map((x) => x.name.toLowerCase()), ['p_area', 'p_anno']);
  assert.throws(() => D.procSql('mysql', 'x; DROP TABLE y', 0), /non valido/);
  assert.throws(() => D.procSql('sqlite', 'p', 0), /SQLite/);

  const proj = P.createProject(dir, 'procapp');
  proj.connections.push(CONN);
  P.writeSecrets(dir, { connections: { main: PW } });
  // area from the page address (?area=..., sample NORD in the designer), year as constant then changed by the event
  const params = [{ name: 'p_area', from: 'get', value: 'area', sample: 'NORD', default: 'NORD' }, { name: 'p_anno', from: 'value', value: '2025' }];
  await W.addProcedure(proj, CONN, PW, 'vendite', p0.name, params);
  const t = proj.tables.find((x) => x.name === 'vendite');
  // Oracle names the columns in upper case
  const F = Object.fromEntries(t.fields.map((f) => [f.name.toLowerCase(), f.name]));
  assert.deepStrictEqual([t.source.type, t.readOnly, t.keys], ['proc', true, [F.id]]);
  assert.deepStrictEqual(Object.keys(F), ['id', 'venditore', 'area', 'importo']);
  t.fields.find((f) => f.name === F.importo).totals = 'sum';
  t.pages.list.pageSize = 2;
  t.pages.list.totals = true;
  proj.menu.items.push({ type: 'table', table: 'vendite' });
  proj.events.vendite = { ProcParams: "<?php\n$params['p_anno'] = 2026;\n" };
  P.saveProject(proj);
  const out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out'), debug: true }).outDir;
  assert.deepStrictEqual(G.lint(out), []);
  const php = ['php', '-d', 'display_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${PORT}`, '-t', out];
  server = IMAGE ? spawn('docker', ['run', '--rm', '--network', 'host', '--name', `mibcrude-proc-${PORT}`, '-v', `${out}:${out}`, IMAGE, ...php], { stdio: 'ignore' })
    : spawn(process.env.MIBCRUDE_PHP_BIN || 'php', php.slice(1), { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  // year 2026 from the event, area NORD by default: Bianchi, Neri, Russo
  let r = await get('?p=dt&t=vendite&draw=1&start=0&length=10&order[0][column]=0&order[0][dir]=asc');
  let j = JSON.parse(r.text);
  assert.strictEqual(j.recordsTotal, 3, r.text);
  assert.ok(!r.text.includes('Rossi'), 'year 2025 excluded by ProcParams');
  // area from the address
  j = JSON.parse((await get('?p=dt&t=vendite&area=SUD&draw=1&start=0&length=10')).text);
  assert.strictEqual(j.recordsTotal, 1);
  assert.match(JSON.stringify(j.data), /Verdi/);
  // quick search in memory
  j = JSON.parse((await get('?p=dt&t=vendite&draw=1&start=0&length=10&q=ner')).text);
  assert.strictEqual(j.recordsFiltered, 1);
  // a page of 2 sorted by amount, totals over every record
  j = JSON.parse((await get('?p=dt&t=vendite&draw=1&start=0&length=2&order[0][column]=3&order[0][dir]=desc')).text);
  assert.deepStrictEqual(j.data.length, 2);
  assert.match(JSON.stringify(j.data[0]), /Bianchi/);
  assert.match(j.totals[F.importo], /300[.,]50/);
  assert.strictEqual((await get('?p=list&t=vendite')).status, 200);
  // view page by key, no add/edit
  assert.strictEqual((await get(`?p=view&t=vendite&k[${F.id}]=2`)).status, 200);
  assert.notStrictEqual((await get('?p=add&t=vendite')).status, 200);
});
