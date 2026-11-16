<?php
namespace MiB;
// Fabric does not enforce UNIQUE (username): the application does. A sqlite file without the constraint plays the server.
// usage: php users_unique.php <repo root> <fabric|classic>   -> prints one result per line
class App { public static $i; public $root = '/tmp'; public $config = ['systemPrefix' => 'mc_', 'security' => []]; public $secrets = []; }
App::$i = new App;
require $argv[1] . '/runtime/lib/Db.php';
require $argv[1] . '/runtime/lib/Schema.php';

$file = tempnam(sys_get_temp_dir(), 'mcusers');
$db = new Db('main', ['driver' => 'sqlite', 'file' => $file], null);
$db->fabric = $argv[2] === 'fabric';
$db->pdo->exec('CREATE TABLE mc_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, email TEXT)'); // no UNIQUE, like Fabric
$count = function ($u) use ($db) { return (int)$db->value('SELECT COUNT(*) FROM mc_users WHERE username = ?', [$u]); };
$try = function ($label, callable $f) {
    try { $f(); echo "$label: ok\n"; } catch (\PDOException $e) { echo "$label: duplicate (", $e->getCode(), ")\n"; }
};

$ana = Schema::insertUser($db, ['username' => 'ana', 'email' => 'a@x']);
echo 'first id: ', $ana ? 'set' : 'missing', "\n";
$try('same name again', function () use ($db) { Schema::insertUser($db, ['username' => 'ana', 'email' => 'b@x']); });
echo 'rows named ana: ', $count('ana'), "\n";
$try('other name', function () use ($db) { Schema::insertUser($db, ['username' => 'bob', 'email' => 'b@x']); });
$bob = (int)$db->value('SELECT id FROM mc_users WHERE username = ?', ['bob']);
$try('rename bob to ana', function () use ($db, $bob) { Schema::requireFreeUsername($db, 'ana', $bob); });
$try('rename bob to bob (itself)', function () use ($db, $bob) { Schema::requireFreeUsername($db, 'bob', $bob); });
$try('rename bob to carl', function () use ($db, $bob) { Schema::requireFreeUsername($db, 'carl', $bob); });

// two sign-ups that both passed the check: two rows with the same name, the higher id must go
$db->pdo->exec("INSERT INTO mc_users (username) VALUES ('dan')");
$db->pdo->exec("INSERT INTO mc_users (username) VALUES ('dan')");
$ids = $db->all("SELECT id FROM mc_users WHERE username = 'dan' ORDER BY id");
$try('race: first row keeps its place', function () use ($db, $ids) { Schema::keepFirstUser($db, 'dan', $ids[0]['id']); });
$try('race: second row is removed', function () use ($db, $ids) { Schema::keepFirstUser($db, 'dan', $ids[1]['id']); });
echo 'rows named dan: ', $count('dan'), "\n";
unlink($file);
