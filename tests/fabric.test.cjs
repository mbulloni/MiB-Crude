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

test('a personal Entra account (MFA) is designer-only: generating the app is refused', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const P = require('../core/project.cjs');
  const G = require('../core/generator.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcentra-'));
  try {
    const proj = P.createProject(path.join(dir, 'p'), 'p');
    proj.connections = [{ id: 'main', name: 'main', driver: 'sqlsrv', host: 'x.datawarehouse.fabric.microsoft.com', sqlAuth: 'entra-user' }];
    proj.project.defaultConnection = 'main';
    const msgs = G.check(proj).filter((p) => p.level === 'error').map((p) => p.msg);
    assert.ok(msgs.some((m) => /account personale Microsoft Entra/.test(m)), msgs.join(' | '));
    proj.connections[0].sqlAuth = 'entra'; // service principal: fine
    assert.ok(!G.check(proj).some((p) => /account personale/.test(p.msg)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
