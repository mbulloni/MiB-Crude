<?php
namespace MiB;

/**
 * Encrypted fields (field.encrypt): values stored as "enc1:" + base64(iv | tag | AES-256-GCM ciphertext) with the
 * project key (secrets: encryptionKey, base64 of 32 bytes). The app decrypts what it reads; values written before
 * the field was encrypted stay readable and are encrypted at the next save. Encrypted fields cannot be searched,
 * filtered or checked for uniqueness by the database.
 */
class Crypto
{
    const PREFIX = 'enc1:';

    private static function key()
    {
        $k = isset(App::$i->secrets['encryptionKey']) ? base64_decode((string)App::$i->secrets['encryptionKey'], true) : false;
        return $k !== false && strlen($k) === 32 ? $k : null;
    }

    public static function isEncrypted($f)
    {
        return is_array($f) && !empty($f['encrypt']);
    }

    public static function encrypt($plain)
    {
        if ($plain === null || $plain === '' || (is_string($plain) && strpos($plain, self::PREFIX) === 0)) return $plain;
        $key = self::key();
        if ($key === null) throw new HttpError(t('crypt.nokey'), 500);
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt((string)$plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($ct === false) throw new \RuntimeException('cifratura non riuscita');
        return self::PREFIX . base64_encode($iv . $tag . $ct);
    }

    /** Plain value; null with a missing/wrong key or damaged data (logged). */
    public static function decrypt($v)
    {
        if (!is_string($v) || strpos($v, self::PREFIX) !== 0) return $v;
        $key = self::key();
        $raw = base64_decode(substr($v, strlen(self::PREFIX)), true);
        if ($key === null || $raw === false || strlen($raw) < 29) { error_log('[MiB-Crude] decrypt: ' . ($key === null ? 'chiave mancante' : 'dato non valido')); return null; }
        $out = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($out === false) { error_log('[MiB-Crude] decrypt: chiave diversa o dato alterato'); return null; }
        return $out;
    }

    /** Names of the encrypted fields of a table. */
    public static function fields(Table $t)
    {
        $out = [];
        foreach ($t->def['fields'] as $f) if (self::isEncrypted($f)) $out[] = $f['name'];
        return $out;
    }

    public static function encryptValues(Table $t, array &$vals)
    {
        foreach (self::fields($t) as $n) if (array_key_exists($n, $vals)) $vals[$n] = self::encrypt($vals[$n]);
    }

    public static function decryptRow(Table $t, $row)
    {
        if (!is_array($row)) return $row;
        foreach (self::fields($t) as $n) if (array_key_exists($n, $row)) $row[$n] = self::decrypt($row[$n]);
        return $row;
    }

    public static function decryptRows(Table $t, array $rows)
    {
        if (!self::fields($t)) return $rows;
        foreach ($rows as $i => $r) $rows[$i] = self::decryptRow($t, $r);
        return $rows;
    }
}
