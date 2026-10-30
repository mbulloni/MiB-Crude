<?php
// MiB-Crude runtime bootstrap. Generated applications include this file from index.php.
if (PHP_VERSION_ID < 70400) { http_response_code(500); exit('PHP 7.4 or newer is required'); }
require __DIR__ . '/lib/helpers.php';
foreach (['App', 'Db', 'Table', 'Format', 'Controls', 'Upload', 'Schema', 'Security', 'Services', 'Export', 'Pages', 'Admin', 'Api', 'Reports', 'Compat', 'Grid', 'Builder', 'Saml', 'Rest'] as $mcFile) {
    require __DIR__ . '/lib/' . $mcFile . '.php';
}
unset($mcFile);
