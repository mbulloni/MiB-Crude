<?php
namespace MiB;

/**
 * Email templates: settings.mailTemplates = {name: {subject: {lang: text}, body: {lang: html}}}. The built-in
 * "register" and "forgot" mails use them when set (else the texts of lang/), any other name is sent from events
 * with sendTemplate('name', $to, ['campo' => valore]). Placeholders {name}: the values passed plus {app}, {date},
 * {user} (signed-in user); values are HTML-escaped in the body. An unknown placeholder stays as it is.
 */
class MailTemplates
{
    public static function get($name)
    {
        $all = App::$i->setting('mailTemplates', []);
        return is_array($all) && isset($all[$name]) && is_array($all[$name]) ? $all[$name] : null;
    }

    /** [subject, html body] of a template with the values, or null when the template does not exist / is empty. */
    public static function render($name, array $vars)
    {
        $tpl = self::get($name);
        if (!$tpl) return null;
        $app = App::$i;
        $subject = $app->label(isset($tpl['subject']) ? $tpl['subject'] : null, '');
        $body = $app->label(isset($tpl['body']) ? $tpl['body'] : null, '');
        if (trim($subject) === '' && trim($body) === '') return null;
        $vars += ['app' => $app->label($app->config['title']), 'date' => Format::date(date('Y-m-d H:i:s'), 'dateFormat'), 'user' => (string)userName()];
        $fill = function ($text, $html) use ($vars) {
            return preg_replace_callback('/\{([A-Za-z0-9_.]+)\}/', function ($m) use ($vars, $html) {
                if (!array_key_exists($m[1], $vars)) return $m[0];
                $v = is_scalar($vars[$m[1]]) || $vars[$m[1]] === null ? (string)$vars[$m[1]] : json_encode($vars[$m[1]]);
                return $html ? h($v) : $v;
            }, $text);
        };
        return [$fill($subject, false), $fill($body, true)];
    }

    /** Sends a template; false when the template is missing or the mail cannot be sent. */
    public static function send($name, $to, array $vars = [])
    {
        $m = self::render($name, $vars);
        if (!$m) { error_log("[MiB-Crude] modello email \"$name\" inesistente o vuoto"); return false; }
        return Mailer::send($to, $m[0], $m[1], true);
    }

    /** A built-in mail (register, forgot): the project's template when set, else the texts of lang/. */
    public static function builtin($name, $to, array $vars, $subjectKey, $bodyKey, array $bodyArgs)
    {
        $m = self::render($name, $vars);
        if ($m) return Mailer::send($to, $m[0], $m[1], true);
        return Mailer::send($to, t($subjectKey), t($bodyKey, ...$bodyArgs), true);
    }
}
