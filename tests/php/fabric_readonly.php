<?php
namespace MiB;
// Tables on Microsoft Fabric are read only for now: enabled() refuses add/edit/delete/import and writeTable() is null.
// usage: php fabric_readonly.php <repo root> <fabric|classic>
require $argv[1] . '/runtime/lib/Db.php';
require $argv[1] . '/runtime/lib/Table.php';
$db = (new \ReflectionClass(Db::class))->newInstanceWithoutConstructor();
$db->driver = 'sqlsrv';
$db->fabric = $argv[2] === 'fabric';
$t = (new \ReflectionClass(Table::class))->newInstanceWithoutConstructor();
$t->db = $db;
$pages = [];
foreach (['list', 'view', 'add', 'edit', 'delete', 'import'] as $p) $pages[$p] = ['enabled' => true];
$t->def = ['pages' => $pages, 'source' => ['type' => 'table', 'table' => 'T'], 'name' => 'T'];
$out = [];
foreach (['list', 'view', 'add', 'edit', 'delete', 'import'] as $p) $out[] = $p . '=' . ($t->enabled($p) ? 'on' : 'off');
$out[] = 'writeTable=' . ($t->writeTable() === null ? 'null' : $t->writeTable());
$out[] = 'readOnly=' . ($t->isReadOnly() ? 'yes' : 'no');
echo implode(' ', $out), "\n";
