'use strict';
// One application from several projects (core/merge.cjs): connections, tables, references, menu, security, events, files.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../core/project.cjs');
const M = require('../core/merge.cjs');

const field = (name, lookup) => ({ name, label: { it: name }, type: 'string', editAs: lookup ? { type: 'lookup', lookup: { kind: 'table', table: lookup, key: 'id', display: 'name' } } : { type: 'text' } });
const table = (name, conn, src, fields = [field('id')]) => ({ name, connection: conn, source: { type: 'table', table: src }, caption: { it: name }, keys: ['id'], fields, pages: {}, details: [], audit: false, api: { enabled: false, methods: [] }, readOnly: false });

function make(dir, name, conn) {
  const p = P.createProject(path.join(dir, name), name);
  p.connections.push(conn);
  p.project.defaultConnection = conn.id;
  return p;
}

test('merge: same database shared, tables shared or renamed with every reference', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-merge-'));
  const a = make(dir, 'a', { id: 'main', driver: 'mysql', host: 'db', port: 3306, database: 'shop', user: 'u' });
  a.tables.push(table('customers', 'main', 'customers'), table('orders', 'main', 'orders'));
  a.menu.items = [{ type: 'table', table: 'customers', page: 'list' }];
  a.events = { orders: { BeforeAdd: 'return true;' }, _global: { AfterAppInit: '$x = 1;' } };
  a.security.permissions = { users: { customers: 'S' } };
  a.reports = [{ name: 'sales', title: { it: 'Vendite' }, table: 'orders', groups: [], aggregates: [], columns: [], showDetails: true }];

  const b = make(dir, 'b', { id: 'shop_db', driver: 'mysql', host: 'DB', port: 3306, database: 'shop', user: 'u' });
  b.connections.push({ id: 'crm', driver: 'pgsql', host: 'pg', port: 5432, database: 'crm', user: 'x' });
  b.project.languages = ['it', 'en'];
  b.tables.push(
    table('customers', 'shop_db', 'customers'), // same database table: shared
    table('orders', 'crm', 'orders', [field('id'), field('customer', 'customers'), field('agent', 'agents')]), // same name, other database: renamed
    table('agents', 'crm', 'agents'));
  b.tables[1].details = [{ table: 'agents', masterKeys: ['id'], detailKeys: ['id'], showIn: [] }];
  b.events = { customers: { BeforeAdd: 'return false;', AfterAdd: '$y = 2;' }, orders: { BeforeAdd: '$z = 3;' }, _global: { AfterAppInit: '$w = 4;', BeforeLogin: 'return true;' } };
  b.reports = [{ name: 'sales', title: { it: 'Vendite CRM' }, table: 'orders', groups: [], aggregates: [], columns: [], showDetails: true }];
  b.charts = [{ name: 'perAgent', title: { it: 'Per agente' }, table: 'orders', type: 'bar', labelField: 'agent', series: [] }];
  b.dashboards = [{ name: 'main', title: { it: 'Cruscotto' }, items: [{ type: 'report', ref: 'sales' }, { type: 'chart', ref: 'perAgent' }, { type: 'count', table: 'orders' }] }];
  b.menu.items = [{ type: 'table', table: 'customers', page: 'list' }, { type: 'group', label: { it: 'CRM' }, items: [{ type: 'table', table: 'orders', page: 'list' }, { type: 'report', ref: 'sales' }] }];
  b.security.groups.push({ id: 'agents', label: { it: 'Agenti' } });
  b.security.permissions = { users: { customers: 'AE', orders: 'S', 'report:sales': 'S' }, agents: { agents: 'SV' } };
  b.lang = { en: { hello: 'Hello' } };

  const r = M.mergeProjects(a, b, { label: 'CRM', secrets: { shop_db: 'p1', crm: 'p2' } });
  const p = r.proj;
  assert.deepStrictEqual(p.connections.map((c) => c.id), ['main', 'crm']);
  assert.deepStrictEqual(r.secrets, { crm: 'p2' }, 'only the passwords of the added connections');
  assert.deepStrictEqual(r.report.tablesShared, ['customers']);
  assert.deepStrictEqual(p.tables.map((t) => t.name), ['customers', 'orders', 'CRM_orders', 'agents']);
  const o = p.tables.find((t) => t.name === 'CRM_orders');
  assert.strictEqual(o.connection, 'crm');
  assert.strictEqual(o.fields[1].editAs.lookup.table, 'customers');
  assert.strictEqual(o.fields[2].editAs.lookup.table, 'agents');
  assert.ok(o.phprShort && /^CRM_/.test(o.phprShort));
  // events: missing ones added, different ones kept aside, renamed table keeps its own
  assert.strictEqual(p.events.customers.AfterAdd, '$y = 2;');
  assert.strictEqual(p.events.customers.BeforeAdd, 'return false;', 'a had no event: added');
  assert.strictEqual(p.events.orders.BeforeAdd, 'return true;');
  assert.strictEqual(p.events.CRM_orders.BeforeAdd, '$z = 3;');
  assert.strictEqual(p.events._global.AfterAppInit, '$x = 1;');
  assert.strictEqual(p.events._global.BeforeLogin, 'return true;');
  assert.deepStrictEqual(r.report.eventConflicts.map((c) => `${c.group}.${c.event}`), ['_global.AfterAppInit']);
  // reports, charts, dashboards
  assert.deepStrictEqual(p.reports.map((x) => [x.name, x.table]), [['sales', 'orders'], ['sales_2', 'CRM_orders']]);
  assert.strictEqual(p.charts[0].table, 'CRM_orders');
  assert.deepStrictEqual(p.dashboards[0].items.map((i) => i.ref || i.table), ['sales_2', 'perAgent', 'CRM_orders']);
  // menu: header + new items, the shared table already in the menu is not repeated
  assert.deepStrictEqual(p.menu.items.map((m) => m.type), ['table', 'header', 'group']);
  assert.deepStrictEqual(p.menu.items[2].items.map((m) => m.table || m.ref), ['CRM_orders', 'sales_2']);
  // security: groups and permissions added up, renamed keys
  assert.ok(p.security.groups.some((g) => g.id === 'agents'));
  assert.deepStrictEqual(p.security.permissions.users, { customers: 'AES', CRM_orders: 'S', 'report:sales_2': 'S' });
  assert.deepStrictEqual(p.security.permissions.agents, { agents: 'SV' });
  assert.deepStrictEqual(p.project.languages, ['it', 'en']);
  assert.strictEqual(p.lang.en.hello, 'Hello');
  // the target is not modified
  assert.strictEqual(a.tables.length, 2);
});

test('merge: modes "reuse" and "prefix", identical project merged twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-merge-'));
  const a = make(dir, 'a', { id: 'main', driver: 'sqlite', file: 'x.db' });
  a.tables.push(table('t1', 'main', 't1'));
  a.menu.items = [{ type: 'group', label: { it: 'G' }, items: [{ type: 'table', table: 't1', page: 'list' }] }];
  const auto = M.mergeProjects(a, a, { label: 'Bis' });
  assert.strictEqual(auto.proj.tables.length, 1);
  assert.strictEqual(auto.proj.menu.items.length, 1, 'nothing new: no header, no duplicated group');
  const b = make(dir, 'b', { id: 'other', driver: 'sqlite', file: 'y.db' });
  b.tables.push(table('t1', 'other', 't1'));
  assert.deepStrictEqual(M.mergeProjects(a, b, { tables: 'reuse' }).proj.tables.map((t) => t.name), ['t1']);
  assert.deepStrictEqual(M.mergeProjects(a, b, { tables: 'prefix', prefix: 'Old App' }).proj.tables.map((t) => t.name), ['t1', 'Old_App_t1']);
  assert.deepStrictEqual(M.mergeProjects(a, a, { tables: 'prefix', label: 'x' }).proj.tables.map((t) => t.name), ['t1', 'x_t1']);
});

test('merge: files of custom/ and public/ copied, existing ones kept, conflicts and report saved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-merge-'));
  const src = path.join(dir, 'src'), dst = path.join(dir, 'dst');
  for (const [f, text] of [['src/custom/custom.css', 'b{}'], ['src/public/new.php', '<?php'], ['src/public/same.txt', '1'], ['src/import-phpr/REPORT.md', '# r'], ['dst/custom/custom.css', 'a{}'], ['dst/public/same.txt', '1']]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  const report = { label: 'Old app', connections: [], tablesAdded: [], tablesShared: [], tablesRenamed: [], renamed: [], events: 0, eventConflicts: [{ group: '_global', event: 'AfterAppInit', code: '$a = 1;' }], groups: [], languages: [], warnings: [] };
  const file = M.copyFiles(src, dst, 'Old app', report);
  assert.strictEqual(fs.readFileSync(path.join(dst, 'custom/custom.css'), 'utf8'), 'a{}');
  assert.ok(fs.existsSync(path.join(dst, 'public/new.php')));
  assert.deepStrictEqual(report.filesKept, ['custom/custom.css']);
  assert.strictEqual(report.filesCopied, 1);
  assert.ok(fs.existsSync(path.join(dst, 'import-phpr/Old_app/REPORT.md')));
  assert.strictEqual(fs.readFileSync(path.join(dst, 'import-phpr/Old_app/eventi-in-conflitto/_global/AfterAppInit.php'), 'utf8'), '$a = 1;');
  assert.match(fs.readFileSync(file, 'utf8'), /eventi globali: AfterAppInit/);
});
