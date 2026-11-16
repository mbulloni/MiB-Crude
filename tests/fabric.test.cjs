'use strict';
// Microsoft Fabric Warehouse: DDL dialect of the designer (core/ddl.cjs), personal Entra accounts and the main-connection rule
// of the generator, without any server. What Fabric accepts was checked on a real warehouse (see docs/ROADMAP.md, v0.20.1).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const DDL = require('../core/ddl.cjs');

const cols = [
  { name: 'id', type: 'int', pk: true, autoInc: true },
  { name: 'nome', type: 'varchar', size: 100, nullable: false },
  { name: 'note', type: 'text', nullable: true },
  { name: 'creato', type: 'datetime', nullable: true },
  { name: 'ora', type: 'time', nullable: true },
  { name: 'cli', type: 'int', nullable: true, ref: { table: 'clienti', column: 'id' } },
];

test('a profile is Fabric when it says so or when the host is a Fabric endpoint', () => {
  assert.equal(DDL.dialectOf({ driver: 'sqlsrv', host: 'abc.datawarehouse.fabric.microsoft.com' }), 'fabric');
  assert.equal(DDL.dialectOf({ driver: 'sqlsrv', host: 'abc.pbidedicated.microsoft.com' }), 'fabric');
  assert.equal(DDL.dialectOf({ driver: 'sqlsrv', host: 'srv.local' }), 'sqlsrv');
  assert.equal(DDL.dialectOf({ driver: 'sqlsrv', host: 'srv.local', fabric: true }), 'fabric');
  assert.equal(DDL.dialectOf({ driver: 'sqlsrv', host: 'x.fabric.microsoft.com', fabric: false }), 'sqlsrv'); // explicit choice wins
  assert.equal(DDL.dialectOf({ driver: 'mysql', host: 'x.fabric.microsoft.com' }), 'mysql');
});

test('CREATE TABLE for Fabric: no key/default inside, keys added with ALTER ... NOT ENFORCED', () => {
  const [create, ...after] = DDL.createStatements('fabric', 'ordini', cols.map((c) => (c.name === 'nome' ? { ...c, default: 'x' } : c)));
  assert.match(create, /\[id\] BIGINT IDENTITY,/); // the documented form, no seed, no NOT NULL
  assert.doesNotMatch(create, /IDENTITY\(|NVARCHAR|PRIMARY KEY|FOREIGN KEY|DEFAULT|NOT ENFORCED/); // none of these is accepted by CREATE TABLE
  assert.match(create, /\[nome\] VARCHAR\(100\) NOT NULL,/);
  assert.match(create, /\[note\] VARCHAR\(MAX\)/);
  assert.match(create, /\[creato\] DATETIME2\(6\)/);
  assert.match(create, /\[ora\] TIME\(6\)/);
  assert.deepEqual(after, [
    'ALTER TABLE [ordini] ADD CONSTRAINT [PK_ordini] PRIMARY KEY NONCLUSTERED ([id]) NOT ENFORCED',
    'ALTER TABLE [ordini] ADD CONSTRAINT [FK_ordini_cli] FOREIGN KEY ([cli]) REFERENCES [clienti] ([id]) NOT ENFORCED',
  ]);
  assert.equal(DDL.createTable('fabric', 'ordini', cols), create.replace(/DEFAULT 'x'/, ''));
  assert.match(DDL.script('fabric', [{ name: 'ordini', columns: cols }]), /CREATE TABLE \[ordini\][^;]*;\nALTER TABLE \[ordini\] ADD CONSTRAINT \[PK_ordini\]/);
});

test('SQL Server classic DDL is unchanged', () => {
  const sql = DDL.createTable('sqlsrv', 'ordini', cols);
  assert.match(sql, /\[id\] INT IDENTITY\(1,1\) NOT NULL/);
  assert.match(sql, /\[nome\] NVARCHAR\(100\) NOT NULL/);
  assert.match(sql, /\[creato\] DATETIME2,/);
  assert.match(sql, /\n  PRIMARY KEY \(\[id\]\),\n  FOREIGN KEY \(\[cli\]\) REFERENCES \[clienti\] \(\[id\]\)\n/);
  assert.doesNotMatch(sql, /NOT ENFORCED/);
});

test('ALTER TABLE for Fabric: nullable ADD only, no ALTER COLUMN, no IDENTITY on an existing table', () => {
  const before = [{ name: 'id', type: 'int', pk: true }, { name: 'a', type: 'int' }];
  assert.deepEqual(DDL.alterTable('fabric', 't', before, [...before, { name: 'n', type: 'varchar', size: 10, nullable: false, default: 'x' }]), ['ALTER TABLE [t] ADD [n] VARCHAR(10)']);
  assert.throws(() => DDL.alterTable('fabric', 't', before, [before[0], { name: 'a', type: 'bigint' }]), /ALTER COLUMN|modificare una colonna/);
  assert.throws(() => DDL.alterTable('fabric', 't', before, [...before, { name: 'k', type: 'int', autoInc: true }]), /IDENTITY/);
  assert.deepEqual(DDL.alterTable('fabric', 't', before, [before[0]]), ['ALTER TABLE [t] DROP COLUMN [a]']);
  // a new primary key is metadata only
  assert.deepEqual(DDL.alterTable('fabric', 't', [{ name: 'a', type: 'int' }], [{ name: 'a', type: 'int', pk: true }]),
    ['ALTER TABLE [t] ADD CONSTRAINT [PK_t] PRIMARY KEY NONCLUSTERED ([a]) NOT ENFORCED']);
});

test('a personal Entra account (MFA): fine for the designer preview, refused for publishing', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const P = require('../core/project.cjs');
  const G = require('../core/generator.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcentra-'));
  try {
    const proj = P.createProject(path.join(dir, 'p'), 'p');
    proj.connections = [
      { id: 'main', name: 'main', driver: 'mysql', host: 'localhost' },
      { id: 'polaris', name: 'POLARIS', driver: 'sqlsrv', host: 'x.datawarehouse.fabric.microsoft.com', sqlAuth: 'entra-user' },
    ];
    proj.project.defaultConnection = 'main';
    const publish = G.check(proj).filter((p) => p.level === 'error').map((p) => p.msg);
    assert.ok(publish.some((m) => /per pubblicare.*account personale Microsoft Entra/.test(m)), publish.join(' | '));
    const preview = G.check(proj, { preview: true });
    assert.ok(!preview.some((p) => p.level === 'error' && /account personale/.test(p.msg)));
    assert.ok(preview.some((p) => p.level === 'warning' && /anteprima usa il tuo account/.test(p.msg)));
    assert.throws(() => G.generate(proj, { outDir: path.join(dir, 'out'), secrets: {} }), /per pubblicare/); // publishing refuses
    proj.connections[1].sqlAuth = 'entra'; // service principal: fine for publishing
    assert.ok(!G.check(proj).some((p) => /account personale/.test(p.msg)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the access token of a connection travels in MIBCRUDE_TOKEN_<ID> (same rule in Db.php)', () => {
  const G = require('../core/generator.cjs');
  assert.equal(G.tokenEnvName('polaris'), 'MIBCRUDE_TOKEN_POLARIS');
  assert.equal(G.tokenEnvName('my-dwh.1'), 'MIBCRUDE_TOKEN_MY_DWH_1');
  const php = require('node:fs').readFileSync(path.join(__dirname, '..', 'runtime', 'lib', 'Db.php'), 'utf8');
  assert.match(php, /getenv\('MIBCRUDE_TOKEN_' \. strtoupper\(preg_replace\('\/\[\^A-Za-z0-9\]\/', '_', \$id\)\)\)/);
  assert.match(php, /MultipleActiveResultSets=false/); // Fabric does not support MARS, which the PHP driver turns on by default
});

test('Fabric cannot be the main connection of an app (system tables need keys, defaults and a generated id)', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const P = require('../core/project.cjs');
  const G = require('../core/generator.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcfab-'));
  try {
    const proj = P.createProject(path.join(dir, 'p'), 'p');
    proj.connections = [{ id: 'main', name: 'main', driver: 'sqlsrv', host: 'x.datawarehouse.fabric.microsoft.com', sqlAuth: 'entra' }];
    proj.project.defaultConnection = 'main';
    assert.ok(G.check(proj).some((p) => p.level === 'error' && /connessione principale.*Fabric/.test(p.msg)));
    proj.connections.push({ id: 'dwh', name: 'dwh', driver: 'mysql', host: 'localhost' });
    proj.project.defaultConnection = 'dwh'; // Fabric as a data source next to a regular main database: fine
    assert.ok(!G.check(proj).some((p) => /connessione principale.*Fabric/.test(p.msg)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tables on Fabric are read only for now (runtime), other engines are unchanged', () => {
  const run = (mode) => require('node:child_process').execFileSync('php', [path.join(__dirname, 'php', 'fabric_readonly.php'), path.join(__dirname, '..'), mode], { encoding: 'utf8' }).trim();
  assert.equal(run('fabric'), 'list=on view=on add=off edit=off delete=off import=off writeTable=null readOnly=yes');
  assert.equal(run('classic'), 'list=on view=on add=on edit=on delete=on import=on writeTable=T readOnly=no');
});

test('the generator says that tables on a Fabric connection are read only', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const P = require('../core/project.cjs');
  const G = require('../core/generator.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcro-'));
  try {
    const proj = P.createProject(path.join(dir, 'p'), 'p');
    proj.connections = [
      { id: 'main', name: 'main', driver: 'mysql', host: 'localhost' },
      { id: 'dwh', name: 'dwh', driver: 'sqlsrv', host: 'x.datawarehouse.fabric.microsoft.com', sqlAuth: 'entra' },
    ];
    proj.project.defaultConnection = 'main';
    proj.tables = [{ name: 'A', connection: 'dwh', fields: [], keys: [], pages: {}, source: { type: 'table', table: 'A' } }];
    const warn = G.check(proj).filter((p) => p.level === 'warning' && /Fabric.*sola lettura/.test(p.msg));
    assert.equal(warn.length, 1, JSON.stringify(G.check(proj).map((p) => p.msg)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
