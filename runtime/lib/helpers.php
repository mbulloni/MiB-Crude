<?php
// Global helpers available to generated pages and to user event code.
// Kept PHP 7.4 compatible on purpose: generated apps must run on old and new servers.

if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle) { return $needle === '' || strpos($haystack, $needle) !== false; }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) { return strncmp($haystack, $needle, strlen($needle)) === 0; }
}

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Translate a runtime/project string key. Extra args replace {0}, {1}, ... */
function t($key, ...$args)
{
    return \MiB\App::$i->t($key, ...$args);
}

/** PDO wrapper of a connection (default: the project's main connection). */
function db($connection = null)
{
    return \MiB\App::$i->db($connection);
}

/** Current user record (array) or null. */
function user()
{
    return \MiB\App::$i->security->user();
}

function userId()
{
    $u = user();
    return $u ? $u['id'] : null;
}

function userName()
{
    $u = user();
    return $u ? $u['username'] : null;
}

function isAdmin()
{
    return \MiB\App::$i->security->isAdmin();
}

function userGroups()
{
    return \MiB\App::$i->security->groups();
}

function redirect($url)
{
    header('Location: ' . $url);
    exit;
}

function sendMail($to, $subject, $body, $html = true)
{
    return \MiB\Mailer::send($to, $subject, $body, $html);
}

/** Email from a template of the project (Progetto › Modelli email): sendTemplate('ordine_spedito', $to, ['numero' => 12]). */
function sendTemplate($name, $to, array $values = [])
{
    return \MiB\MailTemplates::send($name, $to, $values);
}

/** Text message through the project's SMS settings: true when sent (errors in the PHP log). */
function sendSms($to, $text)
{
    $err = \MiB\Sms::send($to, $text);
    if ($err !== '') error_log('[MiB-Crude] sms: ' . $err);
    return $err === '';
}

function appUrl($page, $params = [])
{
    return \MiB\App::$i->url($page, $params);
}

/** Session-scoped key/value store for event code. */
function sessionVar($key, $value = null)
{
    if (func_num_args() > 1) { $_SESSION['mc_vars'][$key] = $value; return $value; }
    return isset($_SESSION['mc_vars'][$key]) ? $_SESSION['mc_vars'][$key] : null;
}
