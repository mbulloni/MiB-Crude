'use strict';
// Docker environment of a project (no Docker needed here; the full stack was verified with docker compose).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');
const DK = require('../core/dockerenv.cjs');

test('docker/: versions, app pointed to the db container, passwords kept, NTLM like the production httpd.conf', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-docker-')), 'p');
  const proj = P.createProject(dir, 'Prova Docker');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'mysql', host: 'prod-db', port: 3306, database: 'prod', user: 'produser' });
  proj.security.enabled = true;
  proj.security.mode = 'ntlm';
  proj.project.docker = { apache: 'ubuntu:24.04', php: '7.4', mariadb: '10.6', httpPort: 18090, ntlm: { mode: 'domain', realm: 'AZIENDA.LOCAL', workgroup: 'AZIENDA', joinUser: 'admin', excludePaths: ['/genera'] } };
  P.saveProject(proj);
  const r = DK.generate(P.loadProject(dir), { connections: { main: 'segreto-prod' } }, G);
  const read = (f) => fs.readFileSync(path.join(dir, 'docker', f), 'utf8');
  const env = Object.fromEntries(read('.env').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  assert.strictEqual(r.url, 'http://localhost:18090/');
  assert.deepStrictEqual([env.APACHE_BASE, env.PHP_VERSION, env.MARIADB_VERSION, env.NTLM_MODE], ['ubuntu:24.04', '7.4', '10.6', 'domain']);
  assert.match(env.NTLM_HOSTNAME, /^[a-z0-9-]{1,15}$/, 'NetBIOS computer name');
  assert.ok(env.DB_PASSWORD.length >= 12);
  assert.match(read('.gitignore'), /^\.env$/m);
  // the app in docker/app uses the db container, never the production database or its password
  const cfg = fs.readFileSync(path.join(dir, 'docker', 'app', 'config', 'app.php'), 'utf8');
  assert.match(cfg, /'host' => 'db'/);
  assert.doesNotMatch(cfg, /prod-db/);
  const sec = fs.readFileSync(path.join(dir, 'docker', 'app', 'config', 'secrets.php'), 'utf8');
  assert.ok(sec.includes(env.DB_PASSWORD) && !sec.includes('segreto-prod'));
  // compose: three services, hostname and samba state for the domain join
  const compose = read('docker-compose.yml');
  for (const s of ['db:', 'php:', 'web:', 'hostname: ${NTLM_HOSTNAME}', 'samba-state:/var/lib/samba', 'image: mariadb:${MARIADB_VERSION}']) assert.ok(compose.includes(s), s);
  // PHP 7.4 / 8.0: Debian archive
  assert.match(read('php/Dockerfile'), /archive\.debian\.org\/debian bullseye main/);
  // Apache on Linux: same directives as production, GSSAPI instead of SSPI
  const site = read('apache/site.conf');
  for (const s of ['AuthType GSSAPI', 'GssapiAllowedMech ntlmssp', 'Require valid-user', 'Require user "ANONYMOUS LOGON"', 'RequestHeader set X_ISRW_PROXY_AUTH_USER %{RU}e', '<Location ~ "(?i)^/genera">']) assert.ok(site.includes(s), s);
  // production on Windows: the same library as the production httpd.conf
  const win = read('windows/httpd-ntlm.conf');
  for (const s of ['LoadModule auth_ntlm_module modules/mod_authn_ntlm.so', 'AuthType SSPI', 'NTLMAuth On', 'NTLMAuthoritative On']) assert.ok(win.includes(s), s);
  // a second generation keeps the passwords
  DK.generate(P.loadProject(dir), {}, G);
  assert.match(read('.env'), new RegExp(`^DB_PASSWORD=${env.DB_PASSWORD.replace(/[-]/g, '\\-')}$`, 'm'));
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('without Windows sign-in no NTLM, without MariaDB no db service', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-docker-')), 'p');
  const proj = P.createProject(dir, 'semplice');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'a.sqlite') });
  proj.project.docker = { mariadb: '' };
  P.saveProject(proj);
  DK.generate(P.loadProject(dir), {}, G);
  const d = path.join(dir, 'docker');
  assert.ok(!fs.existsSync(path.join(d, 'windows', 'httpd-ntlm.conf')));
  assert.doesNotMatch(fs.readFileSync(path.join(d, 'apache', 'site.conf'), 'utf8'), /Gssapi/);
  assert.doesNotMatch(fs.readFileSync(path.join(d, 'docker-compose.yml'), 'utf8'), /^ {2}db:/m);
  assert.match(fs.readFileSync(path.join(d, 'php', 'Dockerfile'), 'utf8'), /pdo_sqlite/);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
