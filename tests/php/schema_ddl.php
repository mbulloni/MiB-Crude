<?php
namespace MiB;
// Prints the CREATE TABLE statements of the app's system tables for a driver (no database needed).
// usage: php schema_ddl.php <repo root> <driver> [fabric]
// stub environment: no database, only the DDL text
class App { public static $i; public $config = ['security' => ['prefix' => '']]; public $secrets = []; }
App::$i = new App;
require $argv[1] . '/runtime/lib/Db.php';
require $argv[1] . '/runtime/lib/Schema.php';
$drv = $argv[2]; $fab = ($argv[3] ?? '') === 'fabric';
$r = new \ReflectionClass(Db::class); $db = $r->newInstanceWithoutConstructor();
$db->driver = $drv; $db->fabric = $fab; $db->schema = '';
$m = new \ReflectionMethod(Schema::class, 'ddl'); $m->setAccessible(true);
foreach ($m->invoke(null, $db) as $name => $sql) echo $sql, "\n";
