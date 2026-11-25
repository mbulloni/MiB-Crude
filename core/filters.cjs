'use strict';
// Filters of the data viewer without SQL: a list of tests {field, op, v, v2, kind} and a free-text search over every column
// become one WHERE condition for core/db.cjs tableData. Values are written as escaped literals (the viewer sends a text query,
// not parameters): numbers and dates are checked, text is escaped for the driver.

const OPS = ['contains', 'equals', 'notequals', 'starts', 'more', 'less', 'between', 'empty', 'notempty'];

const quote = (driver, n) => (driver === 'mysql' ? '`' + String(n).replace(/`/g, '``') + '`' : driver === 'sqlsrv' ? '[' + String(n).replace(/]/g, ']]') + ']' : '"' + String(n).replace(/"/g, '""') + '"');

/** Text as a SQL literal; MySQL/MariaDB also read the backslash as an escape. */
function text(driver, v) {
  let s = String(v).replace(/\0/g, '').replace(/'/g, "''");
  if (driver === 'mysql') s = s.replace(/\\/g, '\\\\');
  return `'${s}'`;
}

/** Any column as text, so that LIKE works on numbers and dates too. */
function asText(driver, col) {
  switch (driver) {
    case 'mysql': return `CAST(${col} AS CHAR)`;
    case 'sqlsrv': return `CAST(${col} AS NVARCHAR(4000))`;
    case 'oracle': return `TO_CHAR(${col})`;
    default: return `CAST(${col} AS TEXT)`; // pgsql, sqlite
  }
}

function literal(driver, kind, v) {
  const s = String(v).trim();
  if (kind === 'number') {
    if (!/^-?\d+([.,]\d+)?$/.test(s)) throw new Error(`"${s}" non è un numero`);
    return s.replace(',', '.');
  }
  if (kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${s}" non è una data (aaaa-mm-gg)`);
    return `'${s}'`;
  }
  return text(driver, s);
}

// the pattern escapes %, _ and \ with a backslash; MySQL/MariaDB read the backslash twice (string, then LIKE)
const escClause = (driver) => (driver === 'mysql' ? " ESCAPE '\\\\'" : " ESCAPE '\\'");
const like = (driver, expr, pattern) => `LOWER(${asText(driver, expr)}) LIKE LOWER(${text(driver, pattern)})${escClause(driver)}`;
const esc = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);

/** One test → SQL, or '' when it has no value to compare (only "empty" and "not empty" need none). */
function test(driver, c) {
  if (!c || !c.field || !OPS.includes(c.op)) return '';
  const col = quote(driver, c.field);
  const kind = c.kind === 'number' || c.kind === 'date' ? c.kind : 'text';
  const v = c.v == null ? '' : String(c.v);
  const v2 = c.v2 == null ? '' : String(c.v2);
  if (c.op === 'empty') return `(${col} IS NULL OR ${asText(driver, col)} = '')`;
  if (c.op === 'notempty') return `(${col} IS NOT NULL AND ${asText(driver, col)} <> '')`;
  if (v === '') return '';
  switch (c.op) {
    case 'contains': return like(driver, col, '%' + esc(v) + '%');
    case 'starts': return like(driver, col, esc(v) + '%');
    case 'equals': return kind === 'text' ? `LOWER(${asText(driver, col)}) = LOWER(${text(driver, v)})` : `${col} = ${literal(driver, kind, v)}`;
    case 'notequals': return kind === 'text' ? `(LOWER(${asText(driver, col)}) <> LOWER(${text(driver, v)}) OR ${col} IS NULL)` : `(${col} <> ${literal(driver, kind, v)} OR ${col} IS NULL)`;
    case 'more': return `${col} > ${literal(driver, kind === 'text' ? 'number' : kind, v)}`;
    case 'less': return `${col} < ${literal(driver, kind === 'text' ? 'number' : kind, v)}`;
    case 'between': {
      const k = kind === 'text' ? 'number' : kind;
      return v2 === '' ? `${col} >= ${literal(driver, k, v)}` : `(${col} >= ${literal(driver, k, v)} AND ${col} <= ${literal(driver, k, v2)})`;
    }
  }
  return '';
}

/**
 * WHERE condition (without the word WHERE) from the tests, the search text and the SQL typed by hand; all of them must hold.
 * @param {string} driver mysql|pgsql|sqlsrv|oracle|sqlite
 * @param {{filters?: object[], search?: string, columns?: string[], where?: string}} o
 */
function build(driver, o = {}) {
  const parts = [];
  for (const c of Array.isArray(o.filters) ? o.filters : []) { const s = test(driver, c); if (s) parts.push(s); }
  const q = String(o.search || '').trim();
  if (q && Array.isArray(o.columns) && o.columns.length) parts.push('(' + o.columns.slice(0, 200).map((n) => like(driver, quote(driver, n), '%' + esc(q) + '%')).join(' OR ') + ')');
  const raw = String(o.where || '').trim();
  if (raw) parts.push(`(${raw})`);
  return parts.join(' AND ');
}

module.exports = { build, test, OPS };
