# PHP with pdo_oci (Oracle Instant Client) for the preview of Oracle projects and the tests.
FROM php:8.3-cli
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl libzip-dev libpng-dev \
 && (apt-get install -y --no-install-recommends libaio1t64 && ln -sf /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1 || apt-get install -y --no-install-recommends libaio1) \
 && mkdir -p /opt/oracle && cd /opt/oracle \
 && curl -fsSLo basic.zip https://download.oracle.com/otn_software/linux/instantclient/instantclient-basiclite-linuxx64.zip \
 && curl -fsSLo sdk.zip https://download.oracle.com/otn_software/linux/instantclient/instantclient-sdk-linuxx64.zip \
 && unzip -qo basic.zip && unzip -qo sdk.zip && rm -f *.zip && mv instantclient_* instantclient \
 && echo /opt/oracle/instantclient > /etc/ld.so.conf.d/oracle.conf && ldconfig \
 && docker-php-ext-configure pdo_oci --with-pdo-oci=instantclient,/opt/oracle/instantclient \
 && docker-php-ext-install pdo_oci zip gd \
 && rm -rf /var/lib/apt/lists/*
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient
WORKDIR /app
