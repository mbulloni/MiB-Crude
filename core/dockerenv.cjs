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
// Windows containers: Apache24 of the production server (with mod_authn_ntlm), PHP 8 thread safe for Apache
const OS = [['linux', 'Linux (Apache di Debian/Ubuntu, PHP-FPM)'], ['windows', 'Windows Server Core (Apache24 di produzione + mod_authn_ntlm)']];
const WINDOWS = [
  ['mcr.microsoft.com/windows/servercore:ltsc2022', 'Windows Server 2022 Core'],
  ['mcr.microsoft.com/windows/servercore:ltsc2025', 'Windows Server 2025 Core'],
  ['mcr.microsoft.com/windows/servercore:ltsc2019', 'Windows Server 2019 Core'],
];
const PHP_WINDOWS = PHP.filter((v) => v.startsWith('8'));
const APACHE24 = '/home/bullonim/Documenti/SVILUPPO/DEVELOPER/Servizi Direzioni Centrali/Apache24';

const DEFAULTS = {
  os: 'linux', windows: WINDOWS[0][0], apache24Dir: APACHE24,
  apache: 'debian:bookworm-slim', php: '8.3', mariadb: '11.4',
  httpPort: 8080, dbPort: 3307, dbName: 'app', dbUser: 'app', initSql: '',
  ntlm: { mode: 'dev', devUser: 'DOMINIO\\UTENTE', realm: 'AZIENDA.LOCAL', workgroup: 'AZIENDA', joinUser: '', dns: '', excludePaths: [], gmsa: 'gmsa-mibcrude' },
};

function settings(proj) {
  const d = (proj.project && proj.project.docker) || {};
  const s = { ...DEFAULTS, ...d, ntlm: { ...DEFAULTS.ntlm, ...(d.ntlm || {}) } };
  // on Windows only PHP 8 (thread safe builds for Apache24)
  if (s.os === 'windows' && !PHP_WINDOWS.includes(s.php)) s.php = PHP_WINDOWS[PHP_WINDOWS.length - 1];
  return s;
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

// Modules of the production httpd.conf (used when its Apache24 folder is not readable)
const WIN_MODULES = ['access_compat', 'actions', 'alias', 'allowmethods', 'asis', 'auth_basic', 'authn_core', 'authn_file', 'authz_core', 'authz_groupfile',
  'authz_host', 'authz_user', 'autoindex', 'cgi', 'dir', 'env', 'headers', 'include', 'info', 'isapi', 'ldap', 'log_config', 'mime', 'negotiation',
  'proxy', 'proxy_http', 'rewrite', 'setenvif', 'socache_shmcb', 'ssl', 'status', 'version'].map((m) => `LoadModule ${m}_module modules/mod_${m}.so`);

/** LoadModule lines of the production httpd.conf, without PHP and mod_authn_ntlm (added by the generated file). */
function productionModules(dir) {
  try {
    const lines = fs.readFileSync(path.join(dir, 'conf', 'httpd.conf'), 'latin1').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^LoadModule\s/i.test(l));
    const out = lines.filter((l) => !/php\d*_module|auth_ntlm_module/i.test(l));
    if (out.length) return out;
  } catch { /* not on this computer */ }
  return WIN_MODULES;
}

/**
 * Windows containers: Apache24 copied from the production server (bin, modules, conf, icons, error: not htdocs,
 * logs or its PHP 7), PHP 8 thread safe from windows.php.net, MariaDB for Windows from archive.mariadb.org.
 * Sign-in as in production: mod_authn_ntlm (AuthType SSPI) in a container with a gMSA (domain), or a simulated user.
 * Windows containers need a Windows host (Docker Desktop in Windows containers mode, or Windows Server).
 */
function winFiles(proj, s, ntlm) {
  const out = {};
  const db = !!s.mariadb;
  const domain = ntlm && s.ntlm.mode === 'domain';
  const upload = (proj.project.settings && proj.project.settings.uploadDir) || 'files';
  const shell = `SHELL ["powershell", "-NoProfile", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]`;
  out['docker-compose.yml'] = `# Docker environment (Windows containers) of the MiB-Crude project "${proj.project.name}".
# Needs a Windows host with Docker in Windows containers mode. Start: docker compose up -d --build
name: mibcrude_${slug(proj.project.name)}
services:
${db ? `  db:
    build:
      context: ./windows/db
      args:
        WIN_BASE: \${WIN_BASE}
        MARIADB_VERSION: \${MARIADB_VERSION}
    restart: unless-stopped
    environment:
      DB_ROOT_PASSWORD: \${DB_ROOT_PASSWORD}
      DB_NAME: \${DB_NAME}
      DB_USER: \${DB_USER}
      DB_PASSWORD: \${DB_PASSWORD}
    volumes:
      - db-data:C:/data
      - ./db/init:C:/init:ro
    ports:
      - "\${DB_PORT}:3306"
` : ''}  web:
    build:
      context: ./windows/web
      args:
        WIN_BASE: \${WIN_BASE}
        PHP_VERSION: \${PHP_VERSION}
    restart: unless-stopped
${domain ? `    # gMSA: the container signs in to the domain with the group managed service account (see windows/setup-gmsa.ps1)
    hostname: \${NTLM_GMSA}
    credential_spec:
      file: \${NTLM_GMSA}.json
` : ''}    environment:
      NTLM_MODE: \${NTLM_MODE}
      NTLM_DEV_USER: \${NTLM_DEV_USER}
      UPLOAD_DIR: ${upload}
    volumes:
      - ./app:C:/app
      - ./logs:C:/Apache24/logs
    ports:
      - "\${HTTP_PORT}:80"
${db ? `    depends_on:
      - db
` : ''}${db ? 'volumes:\n  db-data:\n' : ''}`;

  out['windows/web/Dockerfile'] = `# escape=\`
# Apache24 of the production server + PHP 8 (thread safe, module for Apache) on Windows Server Core
ARG WIN_BASE=mcr.microsoft.com/windows/servercore:ltsc2022
FROM \${WIN_BASE}
${shell}
ARG PHP_VERSION=8.3
# Visual C++ runtime for Apache Lounge and PHP builds
RUN Invoke-WebRequest https://aka.ms/vs/17/release/vc_redist.x64.exe -OutFile C:\\vc_redist.exe; \`
    Start-Process C:\\vc_redist.exe -ArgumentList '/install', '/quiet', '/norestart' -Wait; \`
    Remove-Item C:\\vc_redist.exe
COPY get-php.ps1 start.ps1 C:/setup/
RUN C:\\setup\\get-php.ps1 -Version $env:PHP_VERSION
COPY Apache24 C:/Apache24
COPY httpd.conf C:/Apache24/conf/httpd.conf
COPY php.ini C:/php/php.ini
RUN setx /M PATH ($env:PATH + ';C:\\php;C:\\Apache24\\bin')
EXPOSE 80
CMD ["powershell", "-NoProfile", "-File", "C:\\\\setup\\\\start.ps1"]
`;
  out['windows/web/get-php.ps1'] = `# Latest PHP <Version>.x thread safe x64 from windows.php.net (current releases, then the archives)
param([string]$Version)
$base = 'https://windows.php.net/downloads/releases/'
$url = $null
try {
  $rel = Invoke-RestMethod ($base + 'releases.json')
  $v = $rel.$Version
  if ($v) {
    $key = $v.PSObject.Properties.Name | Where-Object { $_ -like 'ts-*-x64' } | Select-Object -First 1
    if ($key) { $url = $base + $v.$key.zip.path }
  }
} catch { }
if (-not $url) {
  $list = (Invoke-WebRequest ($base + 'archives/') -UseBasicParsing).Content
  $re = 'php-(' + [regex]::Escape($Version) + '\\.\\d+)-Win32-v[sc]1\\d-x64\\.zip'
  $found = [regex]::Matches($list, $re) | Sort-Object { [version]$_.Groups[1].Value } | Select-Object -Last 1
  if (-not $found) { throw "PHP $Version per Windows non trovato" }
  $url = $base + 'archives/' + $found.Value
}
Write-Host "PHP: $url"
Invoke-WebRequest $url -OutFile C:\\php.zip
Expand-Archive C:\\php.zip C:\\php
Remove-Item C:\\php.zip
`;
  out['windows/web/start.ps1'] = `# Apache in foreground; -D NTLM_DOMAIN (mod_authn_ntlm with the gMSA) or -D NTLM_DEV (simulated user)
New-Item -ItemType Directory -Force -Path ("C:\\app\\" + $env:UPLOAD_DIR), C:\\Apache24\\logs | Out-Null
$defines = @()
if ($env:NTLM_MODE -eq 'domain') { $defines = @('-D', 'NTLM_DOMAIN') }
elseif ($env:NTLM_MODE -eq 'dev') { $defines = @('-D', 'NTLM_DEV') }
& C:\\Apache24\\bin\\httpd.exe @defines
exit $LASTEXITCODE
`;
  const php8 = 'LoadModule php_module "C:/php/php8apache2_4.dll"';
  const excluded = (s.ntlm.excludePaths || []).map((x) => `\n    # excluded from the sign-in, as in the production httpd.conf\n    <Location ~ "(?i)^${x.replace(/"/g, '')}">\n        Satisfy any\n        Allow from all\n        Require all granted\n    </Location>\n`).join('');
  out['windows/web/httpd.conf'] = `# Apache24 for "${proj.project.name}": modules of the production httpd.conf, PHP 8 as Apache module.
Define SRVROOT "C:/Apache24"
ServerRoot "\${SRVROOT}"
Listen 80
ServerName localhost
${productionModules(s.apache24Dir).join('\n')}
${php8}
PHPIniDir "C:/php"
AddHandler application/x-httpd-php .php
<IfModule unixd_module>
User daemon
Group daemon
</IfModule>
DocumentRoot "C:/app"
DirectoryIndex index.php index.html
<Directory />
    AllowOverride none
    Require all denied
</Directory>
<Directory "C:/app">
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
<Files ".ht*">
    Require all denied
</Files>
ErrorLog "logs/error.log"
LogLevel warn
LogFormat "%h %l %u %t \\"%r\\" %>s %b \\"%{Referer}i\\" \\"%{User-Agent}i\\"" combined
CustomLog "logs/access.log" combined
TypesConfig conf/mime.types
Timeout 300
${ntlm ? `
<IfDefine NTLM_DOMAIN>
    # Windows sign-in as in the production httpd.conf (mod_authn_ntlm, Windows SSPI)
    LoadModule auth_ntlm_module modules/mod_authn_ntlm.so
${excluded}
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
</IfDefine>
<IfDefine NTLM_DEV>
    # Simulated user (no domain): the app receives REMOTE_USER as if Windows had authenticated it
    SetEnv REMOTE_USER "\${NTLM_DEV_USER}"
    RequestHeader set X_ISRW_PROXY_AUTH_USER "\${NTLM_DEV_USER}"
</IfDefine>
` : ''}`;
  const drivers = new Set((proj.connections || []).map((c) => c.driver));
  const ext = ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'exif', 'mysqli', 'openssl', 'pdo_mysql', 'zip'];
  if (drivers.has('pgsql')) ext.push('pdo_pgsql');
  if (drivers.has('sqlite')) ext.push('pdo_sqlite');
  if (proj.security && proj.security.providers && proj.security.providers.ldap && proj.security.providers.ldap.enabled) ext.push('ldap');
  out['windows/web/php.ini'] = `; PHP 8 for the app (from php.ini-production, essentials)
extension_dir = "C:/php/ext"
${ext.map((e) => `extension=${e}`).join('\n')}
zend_extension=opcache
opcache.enable=1
upload_max_filesize = 64M
post_max_size = 64M
memory_limit = 512M
max_execution_time = 300
date.timezone = Europe/Rome
display_errors = Off
log_errors = On
error_log = "C:/Apache24/logs/php_errors.log"
`;
  out['windows/web/.dockerignore'] = 'Apache24/logs\nApache24/htdocs\n';

  if (db) {
    out['windows/db/Dockerfile'] = `# escape=\`
# MariaDB for Windows (zip from archive.mariadb.org) on Windows Server Core
ARG WIN_BASE=mcr.microsoft.com/windows/servercore:ltsc2022
FROM \${WIN_BASE}
${shell}
ARG MARIADB_VERSION=11.4
RUN Invoke-WebRequest https://aka.ms/vs/17/release/vc_redist.x64.exe -OutFile C:\\vc_redist.exe; \`
    Start-Process C:\\vc_redist.exe -ArgumentList '/install', '/quiet', '/norestart' -Wait; \`
    Remove-Item C:\\vc_redist.exe
COPY get-mariadb.ps1 start.ps1 C:/setup/
RUN C:\\setup\\get-mariadb.ps1 -Version $env:MARIADB_VERSION
EXPOSE 3306
CMD ["powershell", "-NoProfile", "-File", "C:\\\\setup\\\\start.ps1"]
`;
    out['windows/db/get-mariadb.ps1'] = `# Latest MariaDB <Version>.x for Windows x64
param([string]$Version)
$list = (Invoke-WebRequest 'https://archive.mariadb.org/' -UseBasicParsing).Content
$re = 'mariadb-(' + [regex]::Escape($Version) + '\\.\\d+)/'
$v = [regex]::Matches($list, $re) | ForEach-Object { $_.Groups[1].Value } | Sort-Object { [version]$_ } -Unique | Select-Object -Last 1
if (-not $v) { throw "MariaDB $Version per Windows non trovato" }
$url = "https://archive.mariadb.org/mariadb-$v/winx64-packages/mariadb-$v-winx64.zip"
Write-Host "MariaDB: $url"
Invoke-WebRequest $url -OutFile C:\\mariadb.zip
Expand-Archive C:\\mariadb.zip C:\\
Move-Item "C:\\mariadb-$v-winx64" C:\\mariadb
Remove-Item C:\\mariadb.zip
`;
    out['windows/db/start.ps1'] = `# First start: data folder, database, user and the scripts of db/init (C:\\init); then the server in foreground
$bin = 'C:\\mariadb\\bin'
$first = -not (Test-Path C:\\data\\mysql)
if ($first) {
  $tool = if (Test-Path "$bin\\mariadb-install-db.exe") { "$bin\\mariadb-install-db.exe" } else { "$bin\\mysql_install_db.exe" }
  & $tool "--datadir=C:\\data" "--password=$env:DB_ROOT_PASSWORD"
}
$server = if (Test-Path "$bin\\mariadbd.exe") { "$bin\\mariadbd.exe" } else { "$bin\\mysqld.exe" }
$p = Start-Process $server -ArgumentList '--datadir=C:\\data', '--bind-address=0.0.0.0', '--port=3306', '--console' -NoNewWindow -PassThru
$client = if (Test-Path "$bin\\mariadb.exe") { "$bin\\mariadb.exe" } else { "$bin\\mysql.exe" }
for ($i = 0; $i -lt 60; $i++) { & $client -uroot "-p$env:DB_ROOT_PASSWORD" -e 'SELECT 1' 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep 1 }
if ($first) {
  $q = [char]96
  $sql = "CREATE DATABASE IF NOT EXISTS $q$env:DB_NAME$q CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; " +
    "CREATE USER IF NOT EXISTS '$env:DB_USER'@'%' IDENTIFIED BY '$env:DB_PASSWORD'; GRANT ALL ON $q$env:DB_NAME$q.* TO '$env:DB_USER'@'%'; FLUSH PRIVILEGES;"
  & $client -uroot "-p$env:DB_ROOT_PASSWORD" -e $sql
  Get-ChildItem C:\\init -Filter *.sql -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
    Write-Host "Script iniziale: $($_.Name)"
    Get-Content $_.FullName -Raw | & $client -uroot "-p$env:DB_ROOT_PASSWORD" $env:DB_NAME
  }
}
Wait-Process -Id $p.Id
`;
  }
  out['windows/setup-gmsa.ps1'] = !domain ? undefined : `# Once, on the Windows host joined to the domain (administrator PowerShell, RSAT AD module):
# gMSA "${s.ntlm.gmsa}" for the container, its credential spec for Docker and the HTTP service name.
# A domain administrator creates the gMSA and allows this host to use it, e.g.:
#   New-ADServiceAccount -Name ${s.ntlm.gmsa} -DNSHostName ${s.ntlm.gmsa}.<dominio> -PrincipalsAllowedToRetrieveManagedPassword "<gruppo host container>"
#   setspn -S HTTP/${s.ntlm.gmsa}.<dominio> <DOMINIO>\\${s.ntlm.gmsa}$
Install-Module CredentialSpec -Force
Install-ADServiceAccount ${s.ntlm.gmsa}
Test-ADServiceAccount ${s.ntlm.gmsa}
New-CredentialSpec -AccountName ${s.ntlm.gmsa} -Path "C:\\ProgramData\\Docker\\CredentialSpecs\\${s.ntlm.gmsa}.json"
`;
  out['db/init/README.txt'] = `File .sql copiati qui vengono eseguiti da MariaDB alla prima creazione del database (volume db-data vuoto).\n`;
  out['.gitignore'] = '.env\napp/\nlogs/\nwindows/web/Apache24/\n';
  out['README.md'] = `# Docker del progetto ${proj.project.name} (contenitori Windows)

Generato da MiB-Crude: ${(WINDOWS.find((w) => w[0] === s.windows) || [s.windows, s.windows])[1]}, Apache24 copiato dal server di produzione (${s.apache24Dir}), PHP ${s.php} thread safe come modulo di Apache${db ? `, MariaDB ${s.mariadb} per Windows` : ''}.

Serve un host Windows: Docker Desktop in modalità «contenitori Windows» (Windows 10/11 Pro) o Windows Server con Docker. Su Linux questi contenitori non partono.

    docker compose up -d --build     # avvia (prima volta: scarica Windows Server Core e costruisce le immagini)
    docker compose logs -f           # log
    docker compose down              # ferma (i dati restano nel volume db-data)

- Applicazione: http://localhost:${s.httpPort}/ — log di Apache e PHP in \`logs/\`
${db ? `- MariaDB: localhost:${s.dbPort}, database \`${s.dbName}\`, utente \`${s.dbUser}\` (password in .env); script iniziali in db/init/\n` : ''}- \`app/\` è l'app generata per questo ambiente; \`windows/web/Apache24\` la copia di Apache24 di produzione (senza htdocs, logs e php): le rigenera MiB-Crude (Output › Docker di progetto).
${ntlm ? `
## Accesso Windows (NTLM)

Apache usa lo stesso modulo di produzione, mod_authn_ntlm (AuthType SSPI), con le stesse direttive del httpd.conf.

- \`NTLM_MODE=dev\`: nessun dominio, Apache passa all'app l'utente \`NTLM_DEV_USER\` come se Windows lo avesse autenticato.
- \`NTLM_MODE=domain\`: il contenitore entra nel dominio con il gMSA \`${s.ntlm.gmsa}\` (account di servizio gestito di gruppo). Una volta, sull'host unito al dominio: \`windows/setup-gmsa.ps1\` (crea \`C:\\ProgramData\\Docker\\CredentialSpecs\\${s.ntlm.gmsa}.json\`). Il nome macchina del contenitore è quello del gMSA; il browser deve considerare il sito nella intranet.
` : ''}`;
  return out;
}

/** Copies the production Apache24 (no htdocs, logs, PHP, backups) into docker/windows/web/Apache24. */
function copyApache24(src, dest) {
  if (!fs.existsSync(path.join(src, 'bin', 'httpd.exe'))) throw new Error(`Apache24 non trovato in ${src} (serve bin/httpd.exe)`);
  fs.rmSync(dest, { recursive: true, force: true });
  for (const d of ['bin', 'modules', 'conf', 'error', 'icons']) {
    if (!fs.existsSync(path.join(src, d))) continue;
    fs.cpSync(path.join(src, d), path.join(dest, d), { recursive: true, filter: (f) => !/\.(rar|zip|bak)$/i.test(f) });
  }
  fs.mkdirSync(path.join(dest, 'logs'), { recursive: true });
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
    WIN_BASE: s.windows, NTLM_GMSA: s.ntlm.gmsa,
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
  const win = s.os === 'windows';
  if (win) copyApache24(s.apache24Dir, path.join(dir, 'windows', 'web', 'Apache24'));
  const written = [];
  for (const [rel, text] of Object.entries((win ? winFiles : files)(proj, s, ntlm))) {
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

/** Linux or Windows containers: the Docker of this computer must match the generated environment. */
function hostCheck(dir) {
  const win = fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8').includes('./windows/web');
  return new Promise((resolve, reject) => execFile('docker', ['info', '--format', '{{.OSType}}'], { timeout: 15000 }, (e, so) => {
    if (e) return reject(new Error('Docker non risponde su questo computer: è installato e avviato?'));
    const host = so.trim();
    if (win && host !== 'windows') return reject(new Error(`L'ambiente è per contenitori Windows, ma il Docker di questo computer esegue contenitori ${host}: avvialo su un host Windows (Docker Desktop in modalità «contenitori Windows» o Windows Server) copiando la cartella docker/, oppure scegli Linux come sistema operativo per provarlo qui.`));
    if (!win && host === 'windows') return reject(new Error('L\'ambiente è per contenitori Linux, ma Docker è in modalità «contenitori Windows»: passa ai contenitori Linux o scegli Windows come sistema operativo.'));
    resolve(host);
  }));
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
  const win = fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8').includes('./windows/web');
  const up = (svc) => services.some((x) => x.service === svc && x.state === 'running');
  if (win) {
    if (up('web')) {
      versions.apache = (await ask('web', ['C:\\Apache24\\bin\\httpd.exe', '-v'])).replace(/^Server version:\s*/, '');
      versions.php = await ask('web', ['C:\\php\\php.exe', '-r', 'echo PHP_VERSION;']);
    }
    if (up('db')) versions.mariadb = await ask('db', ['C:\\mariadb\\bin\\mysql.exe', '--version']);
    return { generated: true, services, versions };
  }
  if (up('web')) versions.apache = (await ask('web', ['apache2', '-v'])).replace(/^Server version:\s*/, '');
  if (services.some((x) => x.service === 'php' && x.state === 'running')) versions.php = await ask('php', ['php', '-r', 'echo PHP_VERSION;']);
  if (services.some((x) => x.service === 'db' && x.state === 'running')) versions.mariadb = await ask('db', ['mariadb', '--version']);
  return { generated: true, services, versions };
}

module.exports = { hostCheck, APACHE, PHP, MARIADB, OS, WINDOWS, PHP_WINDOWS, winFiles, productionModules, DEFAULTS, settings, generate, compose, status, files, phpExtensions };
