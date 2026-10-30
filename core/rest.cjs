'use strict';
// REST datasources in the designer: connection test, sample records and field inference.
// The generated app reads the API at runtime (runtime/lib/Rest.php).

const { datasourceFromSchema } = require('./defaults.cjs');

async function request(conn, secret, method, p) {
  let url = /^https?:\/\//.test(p) ? p : `${String(conn.url || '').replace(/\/$/, '')}/${String(p || '').replace(/^\//, '')}`;
  const headers = { Accept: 'application/json', 'User-Agent': 'MiB-Crude' };
  const auth = conn.auth || 'none';
  if (auth === 'bearer') headers.Authorization = `Bearer ${secret}`;
  else if (auth === 'basic') headers.Authorization = `Basic ${Buffer.from(`${conn.user || ''}:${secret}`).toString('base64')}`;
  else if (auth === 'header' && conn.user) headers[conn.user] = secret;
  else if (auth === 'query' && conn.user) url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(conn.user)}=${encodeURIComponent(secret)}`;
  const r = await fetch(url, { method, headers, signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${url}: ${text.slice(0, 200)}`);
  try { return text.trim() ? JSON.parse(text) : null; } catch { throw new Error(`Risposta non JSON da ${url}`); }
}

const at = (json, p) => (p ? String(p).split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), json) : json);

function flatten(row, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(row)) {
    const name = prefix + k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v, `${name}.`, out);
    else out[name] = Array.isArray(v) ? JSON.stringify(v) : typeof v === 'boolean' ? Number(v) : v;
  }
  return out;
}

/** First array found in the response when no data path is given ("", "data", "items", ...). */
function guessDataPath(json) {
  if (Array.isArray(json)) return '';
  for (const [k, v] of Object.entries(json || {})) {
    if (Array.isArray(v)) return k;
    if (v && typeof v === 'object') { const sub = guessDataPath(v); if (sub !== null) return sub ? `${k}.${sub}` : k; }
  }
  return null;
}

function inferType(vals) {
  const v = vals.filter((x) => x !== null && x !== undefined && x !== '');
  if (!v.length) return ['varchar', 'string'];
  if (v.every((x) => typeof x === 'number' && Number.isInteger(x))) return ['int', 'integer'];
  if (v.every((x) => typeof x === 'number')) return ['decimal', 'number'];
  if (v.every((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))) return ['date', 'date'];
  if (v.every((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x))) return ['datetime', 'datetime'];
  if (v.some((x) => typeof x === 'string' && x.length > 255)) return ['text', 'text'];
  return ['varchar', 'string'];
}

async function sample(conn, secret, p, dataPath) {
  const json = await request(conn, secret, 'GET', p);
  const dp = dataPath !== undefined && dataPath !== null && dataPath !== '' ? dataPath : guessDataPath(json);
  const list = at(json, dp || '');
  if (!Array.isArray(list)) throw new Error('La risposta non contiene un elenco di record: indica il percorso dei dati (es. data o result.items)');
  const rows = list.filter((r) => r && typeof r === 'object').map((r) => flatten(r));
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const columns = names.map((name) => {
    const [type, dbType] = inferType(rows.map((r) => r[name]));
    return { name, type, dbType, nullable: true, pk: false, autoInc: false };
  });
  return { dataPath: dp || '', rows: rows.slice(0, 50), columns, total: rows.length };
}

/** opts: {name, path, dataPath, key, itemPath, updateMethod, readOnly} */
async function addRestView(proj, conn, secret, opts) {
  if (proj.tables.some((t) => t.name === opts.name)) throw new Error(`Esiste già un'origine dati "${opts.name}"`);
  const s = await sample(conn, secret, opts.path, opts.dataPath);
  const key = opts.key || (s.columns.find((c) => c.name === 'id') || {}).name || '';
  // The API assigns the key: like an auto-increment column it is not edited in forms.
  for (const c of s.columns) { c.pk = c.name === key; c.autoInc = c.pk; }
  const ds = datasourceFromSchema({ name: opts.name, columns: s.columns, pk: key ? [key] : [], fks: [] }, {
    connection: conn.id, languages: proj.project.languages, settings: proj.project.settings,
  });
  ds.source = { type: 'rest', path: opts.path, dataPath: s.dataPath, itemPath: opts.itemPath || '', itemDataPath: opts.itemDataPath || '', updateMethod: opts.updateMethod || 'PUT' };
  ds.keys = key ? [key] : [];
  ds.readOnly = !!opts.readOnly || !key;
  proj.tables.push(ds);
  return ds;
}

module.exports = { request, sample, addRestView, flatten, guessDataPath };
