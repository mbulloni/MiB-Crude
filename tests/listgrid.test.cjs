'use strict';
// The 12-column page grid (.mc-grid, rows of 40px) must not apply to the list table, which carries the same class: as a grid the
// table lost its row heights and the scroll body of the list showed one row out of twenty.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const runtime = path.join(__dirname, '..', 'runtime');

test('the list table has the class mc-grid and the page-grid rule leaves tables alone', () => {
  const body = fs.readFileSync(path.join(runtime, 'views/partials/list_body.php'), 'utf8');
  assert.match(body, /<table class="[^"]*\bmc-grid\b[^"]*" id="mcGrid"/);
  const css = fs.readFileSync(path.join(runtime, 'assets/app.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*display:\s*grid[^{}]*)\}/g)].filter((m) => /(^|[\s,])\.mc-grid\b/.test(m[1]));
  assert.ok(rules.length, 'page grid rule not found');
  for (const m of rules) assert.match(m[1], /\.mc-grid:not\(table\)/, `rule "${m[1].trim()}" also matches the list table`);
});
