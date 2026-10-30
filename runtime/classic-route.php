<?php
// Entry point for classic-style URLs of imported projects:
//   <table>_list.php, <table>_edit.php?editid1=5, ..._list.php?mastertable=X&masterkey1=7, menu.php, login.php
// $mcRoute = ['p' => page, 't' => table, 'keys' => [key columns]] is set by the generated stub.
$_GET['p'] = $mcRoute['p'];
if ($mcRoute['t'] !== '') $_GET['t'] = $mcRoute['t'];
foreach ($mcRoute['keys'] as $i => $col) {
    if (isset($_GET['editid' . ($i + 1)]) && !isset($_GET['k'][$col])) $_GET['k'][$col] = $_GET['editid' . ($i + 1)];
}
if (isset($_GET['mastertable']) && !isset($_GET['mt'])) {
    $_GET['mt'] = $_GET['mastertable'];
    for ($i = 1; isset($_GET['masterkey' . $i]); $i++) $_GET['mkv'][] = $_GET['masterkey' . $i];
}
require dirname(__DIR__) . '/index.php';
