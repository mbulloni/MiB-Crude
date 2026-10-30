# Test

`npm test` — MariaDB locale (utente `mibcrude`/`mibcrude`, database `mibcrude_demo`), PHP locale (8.5).

## Altri database (Docker)

```bash
docker run -d --name mc-pg -e POSTGRES_PASSWORD=mibcrude -e POSTGRES_USER=mibcrude -e POSTGRES_DB=mibcrude_demo -p 15432:5432 postgres:16-alpine
docker run -d --name mc-mssql -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=MiBcrude!2026' -p 11433:1433 mcr.microsoft.com/mssql/server:2022-latest
docker exec mc-mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P 'MiBcrude!2026' -Q "CREATE DATABASE mibcrude_demo"
docker run -d --name mc-ora -e ORACLE_PASSWORD=mibcrude -e APP_USER=mibcrude -e APP_USER_PASSWORD=mibcrude -p 11521:1521 gvenzl/oracle-free:23-slim-faststart
docker build -t mibcrude-php:8.3 electron/docker          # PHP con pdo_sqlsrv
docker build -t mibcrude-php-oci:8.3 electron/docker-oci  # PHP con pdo_oci

npm run test:db   # e2e su mysql, pgsql, sqlite, sqlsrv, oracle
```

Il test crea lo schema demo (`tests/fixtures/demo-schema.cjs`) nel dialetto scelto, genera l'app, la avvia (`php -S` locale o nell'immagine Docker con il driver) e prova setup, login, CRUD, eventi, master-dettaglio, lookup, export, report, grafici, audit, API e permessi.

## Versioni PHP

`MIBCRUDE_PHP_BIN=php7.4 npm test` (PHP 7.4) · `MIBCRUDE_TEST_PHP=8.4 npm test` (PHP 8.4 in Docker, immagine da `tests/docker`).
