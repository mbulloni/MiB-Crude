# PHP used by the MiB-Crude preview when the local PHP lacks a PDO driver.
FROM php:8.3-cli
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libsqlite3-dev libzip-dev libpng-dev libjpeg-dev libwebp-dev libldap2-dev unixodbc-dev gnupg curl \
 && docker-php-ext-configure gd --with-jpeg --with-webp \
 && docker-php-ext-install pdo_mysql pdo_pgsql pdo_sqlite zip gd ldap \
 && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql.list \
 && apt-get update && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
 && pecl install sqlsrv pdo_sqlsrv && docker-php-ext-enable sqlsrv pdo_sqlsrv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
