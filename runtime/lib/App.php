<?php
namespace MiB;

/** Front controller: configuration, routing, rendering, translations, CSRF, flash messages. */
class App
{
    /** @var App */
    public static $i;
    public $root;
    public $config;
    public $secrets;
    public $lang;
    private $strings = [];
    private $dbs = [];
    private $tables = [];
    private $events = [];
    /** @var Security */
    public $security;
    public $page = '';
    public $title = '';

    public static function run($root)
    {
        $app = new App($root);
        try {
            $app->dispatch();
        } catch (HttpError $e) {
            http_response_code($e->getCode());
            if ($app->wantsJson()) { $app->json(['error' => $e->getMessage()], $e->getCode()); return; }
            $app->render('error', ['message' => $e->getMessage(), 'code' => $e->getCode()]);
        } catch (\Throwable $e) {
            http_response_code(500);
            error_log('[MiB-Crude] ' . $e);
            $debug = !empty($app->config['debug']);
            $msg = $debug ? $e->getMessage() . "\n" . $e->getFile() . ':' . $e->getLine() : t('error.generic');
            if ($app->wantsJson()) { $app->json(['error' => $msg], 500); return; }
            $app->render('error', ['message' => $msg, 'code' => 500]);
        }
    }

    public function __construct($root)
    {
        self::$i = $this;
        $this->root = $root;
        $this->config = require $root . '/config/app.php';
        $this->secrets = is_file($root . '/config/secrets.php') ? require $root . '/config/secrets.php' : [];
        if (!empty($this->config['settings']['timezone'])) date_default_timezone_set($this->config['settings']['timezone']);
        $this->startSession();
        $this->lang = $this->pickLanguage();
        $this->strings = require $root . '/lang/' . $this->lang . '.php';
        $this->security = new Security($this);
        $this->event('_global', 'AfterAppInit', []);
    }

    private function startSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        session_name('mc_' . substr(md5($this->root), 0, 8));
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $secure]);
        session_start();
    }

    private function pickLanguage()
    {
        $langs = $this->config['languages'];
        if (isset($_GET['lang']) && in_array($_GET['lang'], $langs, true)) $_SESSION['mc_lang'] = $_GET['lang'];
        if (!empty($_SESSION['mc_lang']) && in_array($_SESSION['mc_lang'], $langs, true)) return $_SESSION['mc_lang'];
        if (!empty($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
            $want = strtolower(substr($_SERVER['HTTP_ACCEPT_LANGUAGE'], 0, 2));
            if (in_array($want, $langs, true) && empty($this->config['forceDefaultLanguage'])) return $want;
        }
        return $this->config['defaultLanguage'];
    }

    // --- translations ---------------------------------------------------------

    public function t($key, ...$args)
    {
        $s = isset($this->strings[$key]) ? $this->strings[$key] : $key;
        foreach ($args as $n => $a) $s = str_replace('{' . $n . '}', (string)$a, $s);
        return $s;
    }

    /** Pick the current language from a {lang: text} map. */
    public function label($map, $fallback = '')
    {
        if (is_string($map)) return $map;
        if (!is_array($map)) return $fallback;
        if (isset($map[$this->lang]) && $map[$this->lang] !== '') return $map[$this->lang];
        $d = $this->config['defaultLanguage'];
        if (isset($map[$d]) && $map[$d] !== '') return $map[$d];
        foreach ($map as $v) if ($v !== '') return $v;
        return $fallback;
    }

    // --- services -------------------------------------------------------------

    /** @return Db */
    public function db($id = null)
    {
        if ($id === null || $id === '') $id = $this->config['defaultConnection'];
        if (!isset($this->dbs[$id])) {
            if (!isset($this->config['connections'][$id])) throw new \RuntimeException("Unknown connection $id");
            $pw = isset($this->secrets['connections'][$id]['password']) ? $this->secrets['connections'][$id]['password'] : '';
            $this->dbs[$id] = new Db($id, $this->config['connections'][$id], $pw);
        }
        return $this->dbs[$id];
    }

    /** @return Table */
    public function table($name)
    {
        if (!isset($this->tables[$name])) {
            if (!isset($this->config['tables'][$name])) throw new HttpError(t('error.notfound'), 404);
            $def = require $this->root . '/config/tables/' . $this->config['tables'][$name] . '.php';
            $this->tables[$name] = new Table($this, $def);
        }
        return $this->tables[$name];
    }

    public function hasTable($name)
    {
        return isset($this->config['tables'][$name]);
    }

    /** Call a user event. Returns the event return value, or true when it is not defined. */
    public function event($group, $name, array $args)
    {
        if (!isset($this->config['events'][$group])) return true;
        if (!isset($this->events[$group])) {
            $class = $this->config['events'][$group];
            require_once $this->root . '/events/' . $class . '.php';
            $this->events[$group] = new $class();
        }
        $obj = $this->events[$group];
        if (!method_exists($obj, $name)) return true;
        $r = call_user_func_array([$obj, $name], $args);
        return $r === null ? true : $r;
    }

    // --- routing --------------------------------------------------------------

    public function dispatch()
    {
        $p = isset($_GET['p']) ? (string)$_GET['p'] : 'home';
        if (!preg_match('/^[a-z_]+$/', $p)) throw new HttpError(t('error.notfound'), 404);
        $this->page = $p;
        $public = ['login', 'logout', 'register', 'forgot', 'reset', 'verify', 'setup', 'asset', 'oidc', 'saml', 'api'];
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && $p !== 'api') $this->checkCsrf();
        if ($p !== 'setup' && $this->security->needsSetup()) redirect($this->url('setup'));
        if (!in_array($p, $public, true)) $this->security->requireLogin();
        $pages = new Pages($this);
        $method = 'page_' . $p;
        if (!method_exists($pages, $method)) throw new HttpError(t('error.notfound'), 404);
        $pages->$method();
    }

    public function url($page, array $params = [])
    {
        $q = array_merge(['p' => $page], $params);
        return 'index.php?' . http_build_query($q);
    }

    public function asset($path)
    {
        $f = $this->root . '/assets/' . $path;
        return 'assets/' . $path . (is_file($f) ? '?v=' . filemtime($f) : '');
    }

    public function render($view, array $vars = [], $layout = 'layout')
    {
        $app = $this;
        extract($vars);
        ob_start();
        $custom = $this->root . '/custom/views/' . $view . '.php';
        include is_file($custom) ? $custom : $this->root . '/runtime/views/' . $view . '.php';
        $content = ob_get_clean();
        if ($layout) include $this->root . '/runtime/views/' . $layout . '.php';
        else echo $content;
    }

    public function json($data, $code = 200)
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    }

    public function wantsJson()
    {
        return (isset($_GET['p']) && in_array($_GET['p'], ['api', 'lookup'], true))
            || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') === 0);
    }

    // --- CSRF and flash -------------------------------------------------------

    public function csrf()
    {
        if (empty($_SESSION['mc_csrf'])) $_SESSION['mc_csrf'] = bin2hex(random_bytes(16));
        return $_SESSION['mc_csrf'];
    }

    public function csrfField()
    {
        return '<input type="hidden" name="_csrf" value="' . h($this->csrf()) . '">';
    }

    private function checkCsrf()
    {
        $sent = isset($_POST['_csrf']) ? $_POST['_csrf'] : (isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '');
        if (!is_string($sent) || !hash_equals($this->csrf(), $sent)) throw new HttpError(t('error.csrf'), 400);
    }

    public function flash($type, $msg)
    {
        $_SESSION['mc_flash'][] = [$type, $msg];
    }

    public function takeFlash()
    {
        $f = isset($_SESSION['mc_flash']) ? $_SESSION['mc_flash'] : [];
        unset($_SESSION['mc_flash']);
        return $f;
    }

    public function setting($key, $default = null)
    {
        return isset($this->config['settings'][$key]) ? $this->config['settings'][$key] : $default;
    }
}

class HttpError extends \RuntimeException
{
}
