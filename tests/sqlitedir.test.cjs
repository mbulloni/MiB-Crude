'use strict';
// A SQLite connection with a relative file (the app's system database is data/sys.sqlite) must create the folder:
// PDO does not, and on a freshly generated output the preview answered 500 "unable to open database file".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Db.php creates the folder of the SQLite file before opening it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'runtime/lib/Db.php'), 'utf8');
  const i = src.indexOf("case 'sqlite':");
  assert.ok(i > 0, 'sqlite branch not found');
  const branch = src.slice(i, src.indexOf('break;', i));
  assert.match(branch, /mkdir\(dirname\(\$file\)/);
  assert.ok(branch.indexOf('mkdir') < branch.indexOf('$dsn = "sqlite:'), 'folder must be created before the DSN is used');
});
