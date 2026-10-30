# PHP 8.4 used by the tests to check the runtime and imported code on PHP 8 (local PHP is 7.4).
FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev && docker-php-ext-install pdo_mysql zip && rm -rf /var/lib/apt/lists/* && printf "error_reporting=E_ALL\ndisplay_errors=On\n" > /usr/local/etc/php/conf.d/dev.ini
