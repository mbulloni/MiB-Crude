'use strict';
// PHP 7.4 -> PHP 8.x checks for code imported from .phpr projects.
// Safe rewrites are applied automatically; everything else is reported with the reason.
// Strings and comments are masked first so that only real code is changed.

// Replace string/comment contents with spaces (same length) to search code only.
function mask(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (two === '//' || c === '#') {
      const j = code.indexOf('\n', i);
      const end = j < 0 ? n : j;
      out += ' '.repeat(end - i);
      i = end;
    } else if (two === '/*') {
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      out += code.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      const end = Math.min(n, j + 1);
      // keep the quotes and ${...} markers of double-quoted strings (they matter for PHP 8.2)
      const body = code.slice(i + 1, end - 1);
      out += c + (c === '"' ? body.replace(/\$\{\w+\}|[^\n]/g, (t) => (t.length > 1 ? t : ' ')) : body.replace(/[^\n]/g, ' ')) + (end - 1 > i ? code[end - 1] : '');
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const REMOVED = [
  [/\beach\s*\(/, 'each() rimossa in PHP 8.0: usa foreach'],
  [/\bcreate_function\s*\(/, 'create_function() rimossa in PHP 8.0: usa una closure function () {}'],
  [/\bmoney_format\s*\(/, 'money_format() rimossa in PHP 8.0: usa NumberFormatter o number_format'],
  [/\b(ereg|eregi|ereg_replace|eregi_replace|split|spliti)\s*\(/, 'funzioni ereg/split rimosse: usa preg_*'],
  [/\bmysql_\w+\s*\(/, 'estensione mysql_* rimossa: usa DB::Query / DB::Exec'],
  [/\bget_magic_quotes_(gpc|runtime)\s*\(/, 'get_magic_quotes_*() rimossa in PHP 8.0'],
  [/\b__autoload\s*\(/, '__autoload() rimossa in PHP 8.0: usa spl_autoload_register'],
  [/\bfgetss\s*\(/, 'fgetss() rimossa in PHP 8.0'],
  [/\b(hebrevc|convert_cyr_string|restore_include_path|ezmlm_hash|image2wbmp|money_format)\s*\(/, 'funzione rimossa in PHP 8.0'],
  [/\bdefine\s*\([^;]*,\s*true\s*\)/, 'define() con costante case-insensitive non più ammesso in PHP 8.0'],
  [/\(\s*unset\s*\)/, 'cast (unset) rimosso in PHP 8.0'],
];
const DEPRECATED = [
  [/\b(utf8_encode|utf8_decode)\s*\(/, 'utf8_encode/utf8_decode deprecate in PHP 8.2: usa mb_convert_encoding($s, "UTF-8", "ISO-8859-1")'],
  [/\bstrftime\s*\(|\bgmstrftime\s*\(/, 'strftime() deprecata in PHP 8.1: usa date() o IntlDateFormatter'],
  [/\bFILTER_SANITIZE_STRING\b|\bFILTER_SANITIZE_STRIPPED\b/, 'FILTER_SANITIZE_STRING deprecato in PHP 8.1: usa htmlspecialchars'],
  [/\b(date_sunrise|date_sunset)\s*\(/, 'date_sunrise/sunset deprecate in PHP 8.1: usa date_sun_info'],
  [/\bmhash\w*\s*\(/, 'mhash deprecata in PHP 8.1: usa hash()'],
  [/`[^`]*`/, 'operatore backtick deprecato in PHP 8.5: usa shell_exec()'],
  [/\bcase\s+[^:;{]+;/, '"case X;" con punto e virgola deprecato in PHP 8.5: usa "case X:"'],
  [/(?<![\w$])(?:\$\w+|['"][^'"]*['"])\s*[-+*/%]\s*(?:\$\w+|\d+)|(?<![\w$])\$\w+\s*[-+*/%]=/, 'aritmetica: in PHP 8 un valore stringa non numerico (anche vuoto) causa TypeError; verificare i campi letti dal DB (usa (float)$x)'],
  [/(?<![=!<>])[!=]=\s*0(?![\d.x])|(?<![\w.])0\s*[!=]=(?!=)/, 'confronto con 0: in PHP 8 "" == 0 e "abc" == 0 sono false (in 7.4 erano true), attenzione ai campi vuoti'],
];

function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

/** Returns { code, fixes: [..], problems: [..] } */
function upgrade(code) {
  let src = String(code);
  const fixes = [];
  const problems = [];
  const apply = (re, rep, what) => {
    const m = mask(src);
    let count = 0;
    let out = '';
    let last = 0;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let x;
    while ((x = r.exec(m))) {
      const original = src.slice(x.index, x.index + x[0].length);
      out += src.slice(last, x.index) + original.replace(new RegExp(re.source, re.flags.replace('g', '')), rep);
      last = x.index + x[0].length;
      count++;
      if (x[0].length === 0) r.lastIndex++;
    }
    if (count) { src = out + src.slice(last); fixes.push(`${what} (${count})`); }
  };
  // String offset with braces: $s{0} -> $s[0] (removed in 8.0).
  apply(/(\$\w+(?:->\w+|\[[^\]\n]*\])*)\{(\$?\w+)\}/, '$1[$2]', 'accesso con graffe $s{i} → $s[i]');
  // Non-canonical casts (real removed in 8.0, the long forms deprecated in 8.5).
  apply(/\(\s*real\s*\)/, '(float)', 'cast (real) → (float)');
  apply(/\(\s*double\s*\)/, '(float)', 'cast (double) → (float)');
  apply(/\(\s*integer\s*\)/, '(int)', 'cast (integer) → (int)');
  apply(/\(\s*boolean\s*\)/, '(bool)', 'cast (boolean) → (bool)');
  apply(/\(\s*binary\s*\)/, '(string)', 'cast (binary) → (string)');
  apply(/\bis_real\s*\(/, 'is_float(', 'is_real() → is_float()');
  // Functions that throw a TypeError in PHP 8 on null/empty/non-numeric values (from the database):
  // routed to mc74_* helpers of the runtime that keep the PHP 7.4 result.
  apply(/(^|[^\w$>:\\])(?<!function\s+)(number_format|round|floor|ceil|abs|count|sizeof|implode|join|in_array|array_merge|array_key_exists|array_sum|array_search|array_keys|array_slice)(\s*\()/,
    '$1mc74_$2$3', 'chiamate rese tolleranti come in PHP 7.4 (mc74_*: valori vuoti/NULL non bloccano la pagina)');
  // "${var}" interpolation deprecated in 8.2 -> "{$var}" (masked strings keep the ${ marker).
  {
    const m = mask(src);
    let count = 0;
    let out = '';
    let last = 0;
    const r = /\$\{(\w+)\}/g;
    let x;
    while ((x = r.exec(m))) { out += src.slice(last, x.index) + '{$' + src.slice(x.index + 2, x.index + 2 + x[1].length) + '}'; last = x.index + x[0].length; count++; }
    if (count) { src = out + src.slice(last); fixes.push(`interpolazione "\${var}" → "{$var}" (${count})`); }
  }
  const m = mask(src);
  for (const [re, msg] of [...REMOVED.map((x) => [...x, 'error']), ...DEPRECATED.map((x) => [...x, 'warning'])]) {
    const r = new RegExp(re.source, 'g');
    let x;
    // One entry per kind of problem and code block: first line + number of occurrences.
    let first = null;
    let n = 0;
    while ((x = r.exec(m))) { if (first === null) first = x.index; n++; if (!x[0].length) r.lastIndex++; }
    if (n) problems.push({ level: REMOVED.some((y) => y[0] === re) ? 'error' : 'warning', line: lineOf(m, first), msg: n > 1 ? `${msg} (${n} punti)` : msg });
  }
  return { code: src, fixes, problems };
}

module.exports = { upgrade, mask };
