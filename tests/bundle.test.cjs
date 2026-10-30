'use strict';
const test = require('node:test');
const assert = require('node:assert');
const B = require('../core/bundle.cjs');

test('table bundle ZIP round trip keeps events as files', () => {
  const bundle = { format: 'mibcrude-tables', version: 1, from: 'x', tables: [{ name: 'my table', fields: [] }], events: { 'my table': { BeforeAdd: '<?php\nreturn true;\n', JS_OnLoad_list: 'console.log(1);' } }, reports: [], charts: [], connections: [] };
  const zip = B.toZip(bundle);
  const text = Buffer.from(zip).toString('latin1');
  assert.ok(text.includes('events/my_table/BeforeAdd.php'));
  assert.ok(text.includes('events/my_table/JS_OnLoad_list.js'));
  assert.deepStrictEqual(B.fromZip(zip), bundle);
  assert.deepStrictEqual(Buffer.from(B.toZip(bundle)), Buffer.from(zip)); // deterministic
});
