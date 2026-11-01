<?php
namespace MiB;

/**
 * Text messages (sendSms, runner_sms of .phpr projects, codes of the two-step verification). settings.sms:
 *   provider "twilio": accountSid, from (number or sender id); auth token in the secrets
 *   provider "http":   url with {to} {text} {from} {password} (URL-encoded), method GET or POST, body (POST, same
 *                      placeholders, JSON-escaped when contentType is application/json), contentType, okText
 *                      (text the answer must contain; empty = any 2xx)
 *   provider "file":   file path: one line per message, to try the app without a gateway
 * Phone numbers of the users for the verification codes: mc_phones (set in the profile) or the TwoFactorPhone event.
 */
class Sms
{
    public static function cfg()
    {
        $c = App::$i->setting('sms', []);
        return is_array($c) ? $c : [];
    }

    public static function enabled()
    {
        $c = self::cfg();
        return !empty($c['provider']);
    }

    /** Sends one message. @return string '' when sent, else the error */
    public static function send($to, $text)
    {
        $c = self::cfg();
        $to = preg_replace('/[^\d+]/', '', (string)$to);
        if ($to === '') return 'numero mancante';
        $pw = isset(App::$i->secrets['sms']['password']) ? (string)App::$i->secrets['sms']['password'] : '';
        $from = isset($c['from']) ? (string)$c['from'] : '';
        try {
            switch (isset($c['provider']) ? $c['provider'] : '') {
                case 'twilio':
                    $sid = isset($c['accountSid']) ? (string)$c['accountSid'] : '';
                    list($code, $body) = self::http('POST', 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json',
                        http_build_query(['To' => $to, 'From' => $from, 'Body' => $text]), 'application/x-www-form-urlencoded', $sid . ':' . $pw);
                    return $code >= 200 && $code < 300 ? '' : "Twilio $code: " . self::short($body);
                case 'http':
                    $enc = function ($tpl, $json) use ($to, $text, $from, $pw) {
                        $v = ['to' => $to, 'text' => $text, 'from' => $from, 'password' => $pw];
                        return preg_replace_callback('/\{(to|text|from|password)\}/', function ($m) use ($v, $json) {
                            return $json ? substr(json_encode((string)$v[$m[1]], JSON_UNESCAPED_UNICODE), 1, -1) : rawurlencode((string)$v[$m[1]]);
                        }, (string)$tpl);
                    };
                    $ct = !empty($c['contentType']) ? (string)$c['contentType'] : 'application/x-www-form-urlencoded';
                    $method = isset($c['method']) && strtoupper($c['method']) === 'GET' ? 'GET' : 'POST';
                    list($code, $body) = self::http($method, $enc(isset($c['url']) ? $c['url'] : '', false), $method === 'POST' ? $enc(isset($c['body']) ? $c['body'] : '', stripos($ct, 'json') !== false) : null, $ct, '');
                    if ($code < 200 || $code >= 300) return "HTTP $code: " . self::short($body);
                    if (!empty($c['okText']) && strpos($body, (string)$c['okText']) === false) return 'risposta inattesa: ' . self::short($body);
                    return '';
                case 'file':
                    $f = !empty($c['file']) ? (string)$c['file'] : sys_get_temp_dir() . '/mibcrude-sms.log';
                    return @file_put_contents($f, date('c') . "\t$to\t" . str_replace(["\r", "\n"], ' ', $text) . "\n", FILE_APPEND | LOCK_EX) === false ? "file $f non scrivibile" : '';
                default:
                    return 'SMS non configurati';
            }
        } catch (\Throwable $e) {
            return $e->getMessage();
        }
    }

    private static function short($s)
    {
        return mb_substr(trim(strip_tags((string)$s)), 0, 200);
    }

    /** @return array [status, body] */
    private static function http($method, $url, $body, $contentType, $basic)
    {
        if (!preg_match('~^https?://~i', $url)) throw new \RuntimeException('indirizzo del gateway SMS non valido');
        $headers = ["Accept: application/json, text/plain, */*"];
        if ($body !== null) $headers[] = "Content-Type: $contentType";
        if ($basic !== '') $headers[] = 'Authorization: Basic ' . base64_encode($basic);
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body === null ? '' : $body, 'timeout' => 15, 'ignore_errors' => true]]);
        // headers from the stream metadata: works from PHP 7.4 to 8.5 ($http_response_header is deprecated in 8.5)
        $fp = @fopen($url, 'r', false, $ctx);
        if (!$fp) throw new \RuntimeException('gateway SMS non raggiungibile');
        $meta = stream_get_meta_data($fp);
        $res = (string)stream_get_contents($fp);
        fclose($fp);
        $status = 0;
        foreach (isset($meta['wrapper_data']) ? (array)$meta['wrapper_data'] : [] as $h) if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) $status = (int)$m[1];
        return [$status, $res];
    }

    // --- phone numbers of the users ---------------------------------------------------

    public static function phone(array $user)
    {
        $phone = '';
        try {
            $db = App::$i->db();
            $phone = (string)$db->value('SELECT ' . $db->q('phone') . ' FROM ' . $db->table(Schema::t('phones')) . ' WHERE ' . $db->q('username') . ' = ?', [$user['username']]);
        } catch (\Throwable $e) { /* table not created yet */ }
        // event code can take it from another table: function TwoFactorPhone(&$phone, $user)
        App::$i->event('_global', 'TwoFactorPhone', [&$phone, $user]);
        return trim((string)$phone);
    }

    public static function setPhone($username, $phone)
    {
        $db = App::$i->db();
        $db->query('DELETE FROM ' . $db->table(Schema::t('phones')) . ' WHERE ' . $db->q('username') . ' = ?', [$username]);
        $phone = trim((string)$phone);
        if ($phone !== '') $db->query('INSERT INTO ' . $db->table(Schema::t('phones')) . ' (' . $db->q('username') . ', ' . $db->q('phone') . ') VALUES (?, ?)', [$username, $phone]);
    }

    /** +39 333 1234567 → +39 ••• ••••567 */
    public static function mask($phone)
    {
        $d = preg_replace('/\D/', '', $phone);
        return strlen($d) > 3 ? str_repeat('•', strlen($d) - 3) . substr($d, -3) : $phone;
    }
}
