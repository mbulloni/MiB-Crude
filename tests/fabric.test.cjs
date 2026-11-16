'use strict';
// Microsoft Fabric Warehouse dialect: DDL of the designer (core/ddl.cjs) and of the app's system tables (Schema.php),
// without any server. The classic engines must keep producing exactly what they produced before.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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

test('CREATE TABLE for Fabric: BIGINT IDENTITY, VARCHAR, datetime precision, NOT ENFORCED constraints', () => {
  const sql = DDL.createTable('fabric', 'ordini', cols);
  assert.match(sql, /\[id\] BIGINT IDENTITY NOT NULL/);
  assert.doesNotMatch(sql, /IDENTITY\(/);
  assert.doesNotMatch(sql, /NVARCHAR/);
  assert.match(sql, /\[nome\] VARCHAR\(100\) NOT NULL/);
  assert.match(sql, /\[note\] VARCHAR\(MAX\)/);
  assert.match(sql, /\[creato\] DATETIME2\(6\)/);
  assert.match(sql, /\[ora\] TIME\(6\)/);
  assert.match(sql, /CONSTRAINT \[PK_ordini\] PRIMARY KEY NONCLUSTERED \(\[id\]\) NOT ENFORCED/);
  assert.match(sql, /CONSTRAINT \[FK_ordini_cli\] FOREIGN KEY \(\[cli\]\) REFERENCES \[clienti\] \(\[id\]\) NOT ENFORCED/);
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

const schema = (driver, fabric) => execFileSync('php', [path.join(__dirname, 'php', 'schema_ddl.php'), path.join(__dirname, '..'), driver, ...(fabric ? ['fabric'] : [])], { encoding: 'utf8' });

test('app system tables on Fabric: no NVARCHAR, no INT IDENTITY, every key NOT ENFORCED', () => {
  const sql = schema('sqlsrv', true);
  const tables = sql.trim().split('\n');
  assert.equal(tables.length, 13);
  assert.doesNotMatch(sql, /NVARCHAR|IDENTITY\(|PRIMARY KEY\)|PRIMARY KEY,|UNIQUE \(/); // every key / unique is the NOT ENFORCED form
  for (const t of tables) {
    assert.match(t, /PRIMARY KEY NONCLUSTERED \([^)]*\) NOT ENFORCED/, t);
    assert.doesNotMatch(t, /DATETIME2[,)]/);
  }
  assert.match(tables[0], /\[id\] BIGINT IDENTITY NOT NULL/);
  assert.match(tables[0], /UNIQUE NONCLUSTERED \(\[username\]\) NOT ENFORCED/);
});

test('app system tables on classic SQL Server keep NVARCHAR and inline keys', () => {
  const sql = schema('sqlsrv', false);
  assert.match(sql, /\[id\] INT IDENTITY\(1,1\) PRIMARY KEY/);
  assert.match(sql, /NVARCHAR\(150\)/);
  assert.doesNotMatch(sql, /NOT ENFORCED|NONCLUSTERED/);
});

const usersUnique = (mode) => execFileSync('php', [path.join(__dirname, 'php', 'users_unique.php'), path.join(__dirname, '..'), mode], { encoding: 'utf8' });

test('Fabric: username uniqueness is enforced by the app (insert, rename, concurrent sign-ups)', () => {
  const out = usersUnique('fabric');
  assert.match(out, /same name again: duplicate \(23000\)/);
  assert.match(out, /rows named ana: 1/);
  assert.match(out, /other name: ok/);
  assert.match(out, /rename bob to ana: duplicate \(23000\)/);
  assert.match(out, /rename bob to bob \(itself\): ok/);
  assert.match(out, /rename bob to carl: ok/);
  assert.match(out, /race: first row keeps its place: ok/);
  assert.match(out, /race: second row is removed: duplicate \(23000\)/);
  assert.match(out, /rows named dan: 1/);
});

test('classic engines: insertUser is a plain insert, the UNIQUE constraint stays in charge', () => {
  const out = usersUnique('classic');
  assert.match(out, /first id: set/);
  assert.match(out, /same name again: ok/); // the stand-in table has no constraint; a real one would refuse here
  assert.match(out, /rename bob to ana: ok/);
});
