'use strict';
// PHP unit tests of the runtime (SAML) on the local PHP and, when present, on PHP 7.4.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
for (const bin of ['php', 'php7.4']) {
  let ok = true;
  try { execFileSync(bin, ['-v'], { stdio: 'pipe' }); } catch { ok = false; }
  test(`SAML signature checks (${bin})`, { skip: !ok && `${bin} non installato` }, () => {
    const out = execFileSync(bin, [path.join(__dirname, 'php', 'saml_test.php')]).toString().trim();
    assert.strictEqual(out, 'OK');
  });
}
