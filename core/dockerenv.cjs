'use strict';
// Docker environment of a project, to replicate production: Apache (version of the chosen Debian/Ubuntu
// release), PHP-FPM (chosen version), MariaDB (chosen version). Files go to <project>/docker/ (docker-compose.yml,
// Dockerfiles, Apache site, entrypoints, .env with the passwords, kept out of Git) and the app is generated
// in docker/app with its main connection pointing to the "db" container.
// Windows sign-in (security mode "ntlm"): Apache with mod_auth_gssapi + gss-ntlmssp + winbind, i.e. NTLM and
// Kerberos (Negotiate) for a container joined to the Active Directory domain; or a simulated user
// (SetEnv REMOTE_USER) to try the app without a domain.

const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const APACHE = [
  ['debian:bookworm-slim', 'Apache 2.4 di Debian 12 «bookworm» (2.4.6x)'],
  ['debian:trixie-slim', 'Apache 2.4 di Debian 13 «trixie» (2.4.6x)'],
  ['ubuntu:24.04', 'Apache 2.4.58 di Ubuntu 24.04'],
  ['ubuntu:22.04', 'Apache 2.4.52 di Ubuntu 22.04'],
];
const PHP = ['7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];
const MARIADB = ['', '10.4', '10.5', '10.6', '10.11', '11.4', '11.8'];

const DEFAULTS = {
  apache: 'debian:bookworm-slim', php: '8.3', mariadb: '11.4',
  httpPort: 8080, dbPort: 3307, dbName: 'app', dbUser: 'app', initSql: '',
  ntlm: { mode: 'dev', devUser: 'DOMINIO\\UTENTE', realm: 'AZIENDA.LOCAL', workgroup: 'AZIENDA', joinUser: '', dns: '', excludePaths: [] },
};

function settings(proj) {
  const d = (proj.project && proj.project.docker) || {};
  return { ...DEFAULTS, ...d, ntlm: { ...DEFAULTS.ntlm, ...(d.ntlm || {}) } };
}

const slug = (s) => String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
const randomPw = () => require('node:crypto').randomBytes(12).toString('base64url');

/** PHP extensions for the project's database drivers (MySQL always: system tables, R-LAB tables). */
function phpExtensions(proj) {
  const drivers = new Set((proj.connections || []).map((c) => c.driver));
  const ext = ['pdo_mysql', 'mysqli', 'gd', 'zip', 'intl'];
  const pkgs = ['libzip-dev', 'libpng-dev', 'libjpeg-dev', 'libfreetype6-dev', 'libicu-dev'];
  if (drivers.has('pgsql')) { ext.push('pdo_pgsql'); pkgs.push('libpq-dev'); }
  if (drivers.has('sqlite')) { ext.push('pdo_sqlite'); pkgs.push('libsqlite3-dev'); }
  const ldap = proj.security && proj.security.providers && proj.security.providers.ldap && proj.security.providers.ldap.enabled;
  if (ldap) { ext.push('ldap'); pkgs.push('libldap2-dev'); }
  return { ext, pkgs };
}

function files(proj, s, ntlm) {
  const { ext, pkgs } = phpExtensions(proj);
  const out = {};
  const db = !!s.mariadb;
  out['docker-compose.yml'] = `# Docker environment of the MiB-Crude project "${proj.project.name}". Start: docker compose up -d --build
name: mibcrude_${slug(proj.project.name)}
services:
${db ? `  db:
    image: mariadb:\${MARIADB_VERSION}
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: \${DB_ROOT_PASSWORD}
      MARIADB_DATABASE: \${DB_NAME}
      MARIADB_USER: \${DB_USER}
      MARIADB_PASSWORD: \${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql
      - ./db/init:/docker-entrypoint-initdb.d:ro
    ports:
      - "\${DB_PORT}:3306"
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      retries: 30
` : ''}  php:
    build:
      context: ./php
      args:
        PHP_VERSION: \${PHP_VERSION}
    restart: unless-stopped
    volumes:
      - ./app:/var/www/html
${db ? `    depends_on:
      db:
        condition: service_healthy
` : ''}  web:
    build:
      context: ./apache
      args:
        BASE_IMAGE: \${APACHE_BASE}
        NTLM: "${ntlm ? 1 : 0}"
    restart: unless-stopped
${ntlm && s.ntlm.mode === 'domain' ? `    hostname: \${NTLM_HOSTNAME}
${s.ntlm.dns ? `    dns:
      - \${NTLM_DNS}
` : ''}` : ''}    environment:
      NTLM_MODE: \${NTLM_MODE}
      NTLM_DEV_USER: \${NTLM_DEV_USER}
      NTLM_REALM: \${NTLM_REALM}
      NTLM_WORKGROUP: \${NTLM_WORKGROUP}
      NTLM_JOIN_USER: \${NTLM_JOIN_USER}
      NTLM_JOIN_PASSWORD: \${NTLM_JOIN_PASSWORD}
    volumes:
      - ./app:/var/www/html:ro
${ntlm && s.ntlm.mode === 'domain' ? `      - samba-state:/var/lib/samba
` : ''}    ports:
      - "\${HTTP_PORT}:80"
    depends_on:
      - php
volumes:
${db ? '  db-data:\n' : ''}${ntlm && s.ntlm.mode === 'domain' ? '  samba-state:\n' : ''}${!db && !(ntlm && s.ntlm.mode === 'domain') ? '  {}\n' : ''}`;

  out['php/Dockerfile'] = `# PHP-FPM with the extensions the app needs
ARG PHP_VERSION=8.3
FROM php:\${PHP_VERSION}-fpm
# PHP 7.4 / 8.0 images run on Debian releases out of support: their packages are on archive.debian.org
RUN . /etc/os-release; case "$VERSION_CODENAME" in \\
      buster) printf 'deb http://archive.debian.org/debian buster main\\ndeb http://archive.debian.org/debian-security buster/updates main\\n' > /etc/apt/sources.list ;; \\
      bullseye) printf 'deb http://archive.debian.org/debian bullseye main\\ndeb http://archive.debian.org/debian-security bullseye-security main\\n' > /etc/apt/sources.list ;; \\
      *) exit 0 ;; \\
    esac; rm -f /etc/apt/sources.list.d/*; echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99archive
RUN apt-get update && apt-get install -y --no-install-recommends ${pkgs.join(' ')} \\
 && docker-php-ext-configure gd --with-freetype --with-jpeg \\
 && docker-php-ext-install -j"$(nproc)" ${ext.join(' ')} \\
 && rm -rf /var/lib/apt/lists/*
RUN { echo 'upload_max_filesize = 64M'; echo 'post_max_size = 64M'; echo 'memory_limit = 512M'; echo 'max_execution_time = 300'; echo 'date.timezone = Europe/Rome'; } > /usr/local/etc/php/conf.d/mibcrude.ini
COPY entrypoint.sh /usr/local/bin/mibcrude-entrypoint
RUN chmod +x /usr/local/bin/mibcrude-entrypoint
ENTRYPOINT ["mibcrude-entrypoint"]
CMD ["php-fpm"]
`;
  out['php/entrypoint.sh'] = `#!/bin/sh
# The upload folder must be writable by PHP
upload="/var/www/html/${(proj.project.settings && proj.project.settings.uploadDir) || 'files'}"
mkdir -p "$upload" && chown -R www-data:www-data "$upload" 2>/dev/null || true
exec docker-php-entrypoint "$@"
`;

  out['apache/Dockerfile'] = `# Apache of the chosen Debian/Ubuntu release, PHP through PHP-FPM (container "php")
ARG BASE_IMAGE=debian:bookworm-slim
FROM \${BASE_IMAGE}
ARG NTLM=0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends apache2 ca-certificates \\
 && if [ "$NTLM" = "1" ]; then apt-get install -y --no-install-recommends libapache2-mod-auth-gssapi gss-ntlmssp winbind samba-common-bin krb5-user libnss-winbind libpam-winbind; fi \\
 && rm -rf /var/lib/apt/lists/*
RUN a2enmod proxy proxy_fcgi rewrite headers setenvif env \\
 && if [ "$NTLM" = "1" ]; then a2enmod auth_gssapi; fi \\
 && a2dissite 000-default
COPY site.conf /etc/apache2/sites-available/mibcrude.conf
COPY entrypoint.sh /usr/local/bin/mibcrude-entrypoint
RUN a2ensite mibcrude && chmod +x /usr/local/bin/mibcrude-entrypoint
EXPOSE 80
CMD ["mibcrude-entrypoint"]
`;

  // Same structure as the production httpd.conf (Windows Apache24 + mod_authn_ntlm, AuthType SSPI): valid user,
  // anonymous logons refused, user name also in the X_ISRW_PROXY_AUTH_USER header. On Linux the NTLM/Kerberos
  // check is mod_auth_gssapi + gss-ntlmssp + winbind (mod_authn_ntlm uses Windows SSPI and exists only for Windows).
  const ntlmConf = !ntlm ? '' : `
  <IfDefine NTLM_DOMAIN>
    <Location ~ "(?i)^">
      AuthName "Private location"
      AuthType GSSAPI
      GssapiAllowedMech krb5
      GssapiAllowedMech ntlmssp
      GssapiCredStore keytab:/etc/krb5.keytab
      GssapiBasicAuth Off
      GssapiLocalName Off
      <RequireAll>
        <RequireAny>
          Require valid-user
        </RequireAny>
        <RequireNone>
          Require user "ANONYMOUS LOGON"
          Require user "NT-AUTORITÄT\\ANONYMOUS-ANMELDUNG"
        </RequireNone>
      </RequireAll>
      RewriteEngine On
      RewriteCond %{LA-U:REMOTE_USER} (.+)
      RewriteRule . - [E=RU:%1]
      RequestHeader set X_ISRW_PROXY_AUTH_USER %{RU}e
    </Location>
${(s.ntlm.excludePaths || []).map((x) => `  # excluded from the sign-in, as in the production httpd.conf\n  <Location ~ "(?i)^${x.replace(/"/g, '')}">\n    Require all granted\n  </Location>\n`).join('')}  </IfDefine>
  <IfDefine NTLM_DEV>
    # Simulated user (no domain): the app receives REMOTE_USER as if Windows had authenticated it
    SetEnv REMOTE_USER "\${NTLM_DEV_USER}"
    RequestHeader set X_ISRW_PROXY_AUTH_USER "\${NTLM_DEV_USER}"
  </IfDefine>
`;
  // The same for the production server (Windows Apache24): the libraries and directives of its httpd.conf.
  out['windows/httpd-ntlm.conf'] = !ntlm ? undefined : `# Windows sign-in for "${proj.project.name}" on Apache24 (Windows), as in the production httpd.conf.
# Include it from httpd.conf (Include conf/extra/httpd-ntlm.conf) with mod_rewrite and mod_headers loaded.
# mod_authn_ntlm.so: https://github.com/TQsoft-GmbH/mod_authn_ntlm (Windows SSPI), in Apache24/modules.
LoadModule auth_ntlm_module modules/mod_authn_ntlm.so
${(s.ntlm.excludePaths || []).map((x) => `\n# excluded from the sign-in\n<Location ~ "(?i)^${x.replace(/"/g, '')}">\n    Satisfy any\n    Allow from all\n    Require all granted\n</Location>\n`).join('')}
<Location ~ "(?i)^">
    AuthName "Private location"
    AuthType SSPI
    NTLMAuth On
    NTLMAuthoritative On
    <RequireAll>
        <RequireAny>
            Require valid-user
        </RequireAny>
        <RequireNone>
            Require user "ANONYMOUS LOGON"
            Require user "NT-AUTORITÄT\\ANONYMOUS-ANMELDUNG"
        </RequireNone>
    </RequireAll>
    RewriteEngine On
    RewriteCond %{LA-U:REMOTE_USER} (.+)
    RewriteRule . - [E=RU:%1]
    RequestHeader set X_ISRW_PROXY_AUTH_USER %{RU}e
</Location>
`;
  out['apache/site.conf'] = `ServerName localhost
<VirtualHost *:80>
  DocumentRoot /var/www/html
  DirectoryIndex index.php
  <Directory /var/www/html>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
  </Directory>
  # PHP files to the PHP-FPM container (same path there)
  <FilesMatch "\\.php$">
    SetHandler "proxy:fcgi://php:9000"
  </FilesMatch>
  ProxyTimeout 300
  ErrorLog /proc/self/fd/2
  CustomLog /proc/self/fd/1 combined
${ntlmConf}</VirtualHost>
`;

  out['apache/entrypoint.sh'] = `#!/bin/sh
set -e
. /etc/apache2/envvars
DEFINES=""
if [ "$NTLM_MODE" = "domain" ]; then
  # Samba / Kerberos for the domain, join once (state kept in the samba-state volume), winbind for NTLM
  cat > /etc/samba/smb.conf <<EOF
[global]
  workgroup = $NTLM_WORKGROUP
  realm = $NTLM_REALM
  security = ads
  kerberos method = secrets and keytab
  dedicated keytab file = /etc/krb5.keytab
  winbind use default domain = no
  winbind enum users = no
  winbind enum groups = no
  idmap config * : backend = tdb
  idmap config * : range = 10000-99999
EOF
  cat > /etc/krb5.conf <<EOF
[libdefaults]
  default_realm = $NTLM_REALM
  dns_lookup_realm = true
  dns_lookup_kdc = true
EOF
  if ! net ads testjoin >/dev/null 2>&1; then
    if [ -n "$NTLM_JOIN_USER" ]; then
      echo "Unione al dominio $NTLM_REALM come $NTLM_JOIN_USER"
      net ads join -U "$NTLM_JOIN_USER%$NTLM_JOIN_PASSWORD"
      net ads keytab add HTTP -U "$NTLM_JOIN_USER%$NTLM_JOIN_PASSWORD" || true
    else
      echo "Contenitore non unito al dominio: imposta NTLM_JOIN_USER e NTLM_JOIN_PASSWORD in docker/.env" >&2
    fi
  fi
  winbindd -D || true
  # Apache (www-data) must reach winbind's privileged pipe and read the keytab
  usermod -aG winbindd_priv www-data 2>/dev/null || true
  [ -f /etc/krb5.keytab ] && chgrp www-data /etc/krb5.keytab && chmod 640 /etc/krb5.keytab
  DEFINES="-D NTLM_DOMAIN"
elif [ "$NTLM_MODE" = "dev" ]; then
  DEFINES="-D NTLM_DEV"
fi
exec apache2 $DEFINES -D FOREGROUND
`;

  out['db/init/README.txt'] = `File .sql o .sql.gz copiati qui vengono eseguiti da MariaDB alla prima creazione del database (volume db-data vuoto).\n`;
  out['.gitignore'] = '.env\napp/\n';
  out['README.md'] = `# Docker del progetto ${proj.project.name}

Generato da MiB-Crude: Apache (${(APACHE.find((a) => a[0] === s.apache) || [s.apache, s.apache])[1]}), PHP ${s.php}-FPM${db ? `, MariaDB ${s.mariadb}` : ''}.

    docker compose up -d --build     # avvia (prima volta: costruisce le immagini)
    docker compose logs -f web       # log di Apache
    docker compose down              # ferma (i dati restano nel volume db-data)

- Applicazione: http://localhost:${s.httpPort}/
${db ? `- MariaDB: localhost:${s.dbPort}, database \`${s.dbName}\`, utente \`${s.dbUser}\` (password in .env); script iniziali in db/init/\n` : ''}- \`app/\` è l'app generata per questo ambiente: la rigenera MiB-Crude (Output › Docker di progetto).
${ntlm ? `
## Accesso Windows (NTLM)

- \`NTLM_MODE=dev\`: nessun dominio, Apache passa all'app l'utente \`NTLM_DEV_USER\` come se Windows lo avesse autenticato.
- \`NTLM_MODE=domain\`: il contenitore si unisce al dominio \`NTLM_REALM\` (\`NTLM_JOIN_USER\`/\`NTLM_JOIN_PASSWORD\` in .env, una volta sola) e Apache accetta NTLM e Kerberos (mod_auth_gssapi + gss-ntlmssp + winbind). Serve che il contenitore raggiunga i domain controller (DNS: NTLM_DNS) e un nome macchina valido (NTLM_HOSTNAME). Per Kerberos il browser deve considerare il sito nella intranet.
` : ''}`;
  return out;
}

/** .env: versions, ports, passwords (kept between generations) and NTLM settings. */
function envFile(dir, proj, s, ntlm) {
  const file = path.join(dir, '.env');
  const old = {};
  try { for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m) old[m[1]] = m[2]; } } catch { /* first time */ }
  const v = {
    APACHE_BASE: s.apache, PHP_VERSION: s.php, MARIADB_VERSION: s.mariadb || '',
    HTTP_PORT: String(s.httpPort), DB_PORT: String(s.dbPort), DB_NAME: s.dbName, DB_USER: s.dbUser,
    DB_PASSWORD: old.DB_PASSWORD || randomPw(), DB_ROOT_PASSWORD: old.DB_ROOT_PASSWORD || randomPw(),
    NTLM_MODE: ntlm ? s.ntlm.mode : 'off', NTLM_DEV_USER: s.ntlm.devUser, NTLM_REALM: s.ntlm.realm, NTLM_WORKGROUP: s.ntlm.workgroup,
    NTLM_JOIN_USER: s.ntlm.joinUser, NTLM_JOIN_PASSWORD: old.NTLM_JOIN_PASSWORD || '', // computer name for the domain: NetBIOS rules (at most 15 characters, letters, digits and hyphens)
    NTLM_HOSTNAME: old.NTLM_HOSTNAME || `mc-${slug(proj.project.name).replace(/_/g, '-')}`.slice(0, 15).replace(/-+$/, ''),
    NTLM_DNS: s.ntlm.dns || '',
  };
  // Docker Compose reads .env literally: a backslash needs no escaping, quotes would become part of the value
  fs.writeFileSync(file, `# Docker environment of the project (passwords: keep this file private)\n${Object.entries(v).map(([k, x]) => `${k}=${x}`).join('\n')}\n`, { mode: 0o600 });
  return v;
}

/**
 * Writes docker/ in the project and generates the app in docker/app.
 * @returns {{ dir: string, url: string, env: object, files: string[] }}
 */
function generate(proj, secrets, generator) {
  const s = settings(proj);
  const ntlm = !!(proj.security && proj.security.enabled && proj.security.mode === 'ntlm');
  const dir = path.join(proj.dir, 'docker');
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [rel, text] of Object.entries(files(proj, s, ntlm))) {
    if (text === undefined) continue;
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text, rel.endsWith('.sh') ? { mode: 0o755 } : undefined);
    written.push(rel);
  }
  if (s.initSql && fs.existsSync(s.initSql)) fs.copyFileSync(s.initSql, path.join(dir, 'db', 'init', `01-${path.basename(s.initSql)}`));
  const env = envFile(dir, proj, s, ntlm);
  // The app as deployed in the containers: main MariaDB/MySQL connection → the "db" service.
  const copy = JSON.parse(JSON.stringify({ ...proj, dir: undefined }));
  copy.dir = proj.dir;
  const sec = JSON.parse(JSON.stringify(secrets || {}));
  sec.connections = sec.connections || {};
  if (s.mariadb) {
    for (const c of copy.connections) {
      if (c.id === copy.project.defaultConnection && c.driver === 'mysql') {
        Object.assign(c, { host: 'db', port: 3306, database: s.dbName, user: s.dbUser, socket: '' });
        sec.connections[c.id] = env.DB_PASSWORD;
      }
    }
  }
  generator.generate(copy, { secrets: sec, outDir: path.join(dir, 'app') });
  return { dir, url: `http://localhost:${s.httpPort}/`, env: { ...env, DB_PASSWORD: '***', DB_ROOT_PASSWORD: '***', NTLM_JOIN_PASSWORD: env.NTLM_JOIN_PASSWORD ? '***' : '' }, files: written };
}

function compose(dir, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', ...args], { cwd: dir });
    let out = '';
    const take = (d) => { const t = d.toString(); out += t; if (onLine) t.split('\n').filter(Boolean).forEach(onLine); };
    p.stdout.on('data', take);
    p.stderr.on('data', take);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out.split('\n').filter(Boolean).slice(-8).join('\n') || `docker compose ${args[0]}: ${code}`))));
  });
}

/** Containers of the environment with their state, and the versions really installed. */
async function status(dir) {
  if (!fs.existsSync(path.join(dir, 'docker-compose.yml'))) return { generated: false, services: [] };
  let services = [];
  try {
    const out = await compose(dir, ['ps', '--all', '--format', 'json']);
    services = out.trim().split('\n').filter(Boolean).flatMap((l) => { try { const j = JSON.parse(l); return Array.isArray(j) ? j : [j]; } catch { return []; } })
      .map((j) => ({ service: j.Service, state: j.State, status: j.Status }));
  } catch { /* docker not running */ }
  const versions = {};
  const ask = (svc, cmd) => new Promise((res) => execFile('docker', ['compose', 'exec', '-T', svc, ...cmd], { cwd: dir, timeout: 15000 }, (e, so) => res(e ? '' : so.trim().split('\n')[0])));
  if (services.some((x) => x.service === 'web' && x.state === 'running')) versions.apache = (await ask('web', ['apache2', '-v'])).replace(/^Server version:\s*/, '');
  if (services.some((x) => x.service === 'php' && x.state === 'running')) versions.php = await ask('php', ['php', '-r', 'echo PHP_VERSION;']);
  if (services.some((x) => x.service === 'db' && x.state === 'running')) versions.mariadb = await ask('db', ['mariadb', '--version']);
  return { generated: true, services, versions };
}

module.exports = { APACHE, PHP, MARIADB, DEFAULTS, settings, generate, compose, status, files, phpExtensions };
