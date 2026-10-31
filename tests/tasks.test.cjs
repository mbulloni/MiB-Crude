'use strict';
// Scheduled tasks: cron expressions (next run), cron.php from the command line (due tasks, --run, --list,
// failures), state in mc_tasks, never reachable from the web.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
const SQLITE = /^pdo_sqlite$/m.test(execFileSync(PHP, ['-m'], { encoding: 'utf8' }));
let dir;
let out;

test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-tasks-'));
  const proj = P.createProject(dir, 'taskapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  P.writeSecrets(dir, { connections: { main: '' } });
  proj.project.settings.tasks = [
    { name: 'scrivi', title: 'Scrive un file', cron: '* * * * *', enabled: true },
    { name: 'rotta', title: 'Fallisce', cron: '* * * * *', enabled: true },
    { name: 'spenta', cron: '* * * * *', enabled: false },
    { name: 'notte', cron: '30 2 * * *', enabled: true },
  ];
  proj.events._global = {
    Task_scrivi: `<?php\nfile_put_contents(${JSON.stringify(path.join(dir, 'ran.txt'))}, date('c') . "\\n", FILE_APPEND);\n$message = 'scritto';\n`,
    Task_rotta: "<?php\nthrow new \\RuntimeException('connessione persa');\n",
    Task_spenta: "<?php\n$message = 'mai';\n",
    Task_notte: "<?php\n$message = 'notte';\n",
  };
  P.saveProject(proj);
  out = G.generate(P.loadProject(dir), { secrets: P.readSecrets(dir), outDir: path.join(dir, 'out') }).outDir;
  assert.deepStrictEqual(G.lint(out), []);
});

test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

const php = (code) => execFileSync(PHP, ['-r', `require ${JSON.stringify(path.join(out, 'runtime', 'bootstrap.php'))}; ${code}`], { encoding: 'utf8' });
const cron = (...args) => spawnSync(PHP, [path.join(out, 'cron.php'), ...args], { encoding: 'utf8', cwd: out });

test('cron expressions: next run', () => {
  const next = (expr, from) => php(`date_default_timezone_set('UTC'); $n = \\MiB\\Tasks::next(${JSON.stringify(expr)}, strtotime(${JSON.stringify(from)} . ' UTC')); echo $n === null ? 'null' : gmdate('Y-m-d H:i', $n);`);
  assert.strictEqual(next('*/15 * * * *', '2026-10-31 10:07'), '2026-10-31 10:15');
  assert.strictEqual(next('0 7 * * *', '2026-10-31 07:00'), '2026-11-01 07:00');
  assert.strictEqual(next('0 7 * * 1-5', '2026-10-31 08:00'), '2026-11-02 07:00', 'Saturday → Monday');
  assert.strictEqual(next('0 6 1 * *', '2026-10-31 10:00'), '2026-11-01 06:00');
  assert.strictEqual(next('0 9 * * 0', '2026-10-31 10:00'), '2026-11-01 09:00', 'Sunday as 0');
  assert.strictEqual(next('0 9 * * 7', '2026-10-31 10:00'), '2026-11-01 09:00', 'Sunday as 7');
  assert.strictEqual(next('15 8-18/2 * * *', '2026-10-31 09:00'), '2026-10-31 10:15');
  assert.strictEqual(next('0 0 29 2 *', '2026-03-01 00:00'), '2028-02-29 00:00', 'leap year');
  assert.strictEqual(next('0 0 31 2 *', '2026-03-01 00:00'), 'null', 'never');
  assert.strictEqual(next('61 * * * *', '2026-10-31 10:00'), 'null', 'invalid');
  assert.strictEqual(next('* * *', '2026-10-31 10:00'), 'null', 'invalid');
});

test('cron.php: due tasks once per minute, failures, --run, --list; not reachable from the web', { skip: !SQLITE && `${PHP} senza pdo_sqlite` }, () => {
  let r = cron();
  assert.strictEqual(r.status, 1, 'a failed task gives exit code 1');
  assert.match(r.stdout, /^scrivi ok .* scritto$/m);
  assert.match(r.stdout, /^rotta ERROR .* connessione persa$/m);
  assert.doesNotMatch(r.stdout, /spenta|notte/);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'ran.txt'), 'utf8').split('\n').filter(Boolean).length, 1);
  // same minute again: nothing due
  r = cron();
  assert.strictEqual(r.stdout.trim(), '');
  // run one now, even when disabled
  r = cron('--run', 'spenta');
  assert.match(r.stdout, /^spenta ok .* mai$/m);
  r = cron('--list');
  assert.match(r.stdout, /^notte\s+30 2 \* \* \*\s+on\s+next \d{4}-\d\d-\d\d 02:30/m);
  assert.match(r.stdout, /^rotta .* ERROR connessione persa/m);
  assert.match(r.stdout, /^spenta .* off /m);
  // state in mc_tasks
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(dir, 'app.sqlite'));
  const rows = Object.fromEntries(db.prepare('SELECT name, ok, message FROM mc_tasks').all().map((x) => [x.name, [x.ok, x.message]]));
  db.close();
  assert.deepStrictEqual(rows, { scrivi: [1, 'scritto'], rotta: [0, 'connessione persa'], spenta: [1, 'mai'] });
  // the web server gets a 404 (PHP_SAPI is "cli" only from the command line)
  assert.match(fs.readFileSync(path.join(out, 'cron.php'), 'utf8'), /if \(PHP_SAPI !== 'cli'\) \{ http_response_code\(404\); exit; \}/);
});
