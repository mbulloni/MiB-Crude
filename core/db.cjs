'use strict';
// Designer-side database access: one tiny client interface over five drivers, used for
// testing connections, reading the schema and previewing SQL. The generated app talks to
// the database through PHP PDO, not through this module.

const fs = require('node:fs');

const DRIVERS = {
  mysql: { label: 'MariaDB / MySQL', port: 3306 },
  pgsql: { label: 'PostgreSQL', port: 5432 },
  sqlsrv: { label: 'SQL Server', port: 1433 },
  oracle: { label: 'Oracle', port: 1521 },
  sqlite: { label: 'SQLite', port: 0 },
};

// Generic column types used by the designer to pick defaults.
function genericType(dbType) {
  const t = String(dbType || '').toLowerCase();
  if (/^(tinyint\(1\)|bit|bool|boolean)/.test(t)) return 'bool';
  if (/int|serial|^number\(\d+(,0)?\)$|^integer/.test(t)) return 'int';
  if (/dec|numeric|float|double|real|money|^number/.test(t)) return 'decimal';
  if (/^(datetime|timestamp|smalldatetime|datetime2|datetimeoffset)/.test(t)) return 'datetime';
  if (/^date/.test(t)) return 'date';
  if (/^time/.test(t)) return 'time';
  if (/blob|binary|bytea|image|raw/.test(t)) return 'binary';
  if (/json/.test(t)) return 'json';
  if (/text|clob|ntext|long/.test(t)) return 'text';
  return 'string';
}

async function connect(conn, password) {
  const pw = password || '';
  switch (conn.driver) {
    case 'mysql': {
      const mariadb = require('mariadb');
      const c = await mariadb.createConnection({
        host: conn.host || 'localhost', port: Number(conn.port) || 3306, user: conn.user, password: pw,
        database: conn.database, dateStrings: true, bigIntAsNumber: true, decimalAsNumber: false, connectTimeout: 8000,
      });
      return {
        driver: 'mysql',
        query: async (sql, params = []) => { const r = await c.query(sql, params); return Array.isArray(r) ? r.map((x) => ({ ...x })) : []; },
        close: () => c.end(),
      };
    }
    case 'pgsql': {
      const { Client } = require('pg');
      const c = new Client({ host: conn.host || 'localhost', port: Number(conn.port) || 5432, user: conn.user, password: pw, database: conn.database, connectionTimeoutMillis: 8000 });
      await c.connect();
      return {
        driver: 'pgsql',
        query: async (sql, params = []) => {
          let i = 0;
          const r = await c.query(sql.replace(/\?/g, () => `$${++i}`), params);
          return r.rows;
        },
        close: () => c.end(),
      };
    }
    case 'sqlsrv': {
      const mssql = require('mssql');
      const pool = await new mssql.ConnectionPool({
        server: conn.host || 'localhost', port: Number(conn.port) || 1433, user: conn.user, password: pw, database: conn.database,
        options: { trustServerCertificate: true, encrypt: !!conn.encrypt }, connectionTimeout: 8000,
      }).connect();
      return {
        driver: 'sqlsrv',
        query: async (sql, params = []) => {
          const req = pool.request();
          let i = 0;
          params.forEach((p, n) => req.input(`p${n}`, p));
          const r = await req.query(sql.replace(/\?/g, () => `@p${i++}`));
          return r.recordset || [];
        },
        close: () => pool.close(),
      };
    }
    case 'oracle': {
      const oracledb = require('oracledb');
      oracledb.autoCommit = true; // otherwise inserts/DDL from the designer are rolled back on close
      const c = await oracledb.getConnection({ user: conn.user, password: pw, connectString: `${conn.host || 'localhost'}:${Number(conn.port) || 1521}/${conn.database}` });
      return {
        driver: 'oracle',
        query: async (sql, params = []) => {
          let i = 0;
          const r = await c.execute(sql.replace(/\?/g, () => `:${++i}`), params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
          return r.rows || [];
        },
        close: () => c.close(),
      };
    }
    case 'sqlite': {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      const db = new SQL.Database(fs.existsSync(conn.file) ? fs.readFileSync(conn.file) : undefined);
      // sql.js works in memory: changes are written back to the file on save()/close().
      let dirty = false;
      const save = async () => { if (conn.file) fs.writeFileSync(conn.file, Buffer.from(db.export())); dirty = false; };
      return {
        driver: 'sqlite',
        save,
        query: async (sql, params = []) => {
          if (!/^\s*(select|pragma|with)\b/i.test(sql)) dirty = true;
          const st = db.prepare(sql);
          st.bind(params);
          const rows = [];
          while (st.step()) rows.push(st.getAsObject());
          st.free();
          return rows;
        },
        close: async () => { if (dirty) await save(); db.close(); },
      };
    }
    default:
      throw new Error(`Driver non supportato: ${conn.driver}`);
  }
}

const lc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));

async function listTables(c, conn) {
  switch (c.driver) {
    case 'mysql':
      return (await c.query("SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"))
        .map((r) => ({ name: r.name, type: r.type === 'VIEW' ? 'view' : 'table' }));
    case 'pgsql':
      return (await c.query("SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name", [conn.schema || 'public']))
        .map((r) => ({ name: r.name, type: r.type === 'VIEW' ? 'view' : 'table' }));
    case 'sqlsrv':
      return (await c.query("SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [conn.schema || 'dbo']))
        .map((r) => ({ name: r.name, type: r.type === 'VIEW' ? 'view' : 'table' }));
    case 'oracle':
      return (await c.query("SELECT table_name AS name, 'table' AS type FROM user_tables UNION ALL SELECT view_name, 'view' FROM user_views ORDER BY 1"))
        .map((r) => ({ name: lc(r).name, type: lc(r).type }));
    case 'sqlite':
      return (await c.query("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"))
        .map((r) => ({ name: r.name, type: r.type }));
  }
  return [];
}

async function describeTable(c, conn, table) {
  let columns = [];
  let fks = [];
  switch (c.driver) {
    case 'mysql': {
      const rows = await c.query(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS dbType, IS_NULLABLE AS nullable, COLUMN_KEY AS ckey, EXTRA AS extra,
                COLUMN_DEFAULT AS def, CHARACTER_MAXIMUM_LENGTH AS len, COLUMN_COMMENT AS comment
           FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [table]);
      columns = rows.map((r) => ({
        name: r.name, dbType: r.dbType, nullable: r.nullable === 'YES', pk: r.ckey === 'PRI',
        autoInc: /auto_increment/i.test(r.extra || ''), default: r.def, length: r.len == null ? null : Number(r.len), comment: r.comment || '',
      }));
      const fk = await c.query(
        `SELECT CONSTRAINT_NAME AS cname, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS rt, REFERENCED_COLUMN_NAME AS rc
           FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`, [table]);
      fks = groupFks(fk);
      break;
    }
    case 'pgsql': {
      const schema = conn.schema || 'public';
      const rows = await c.query(
        `SELECT c.column_name AS name, c.data_type AS dbtype, c.udt_name AS udt, c.is_nullable AS nullable, c.column_default AS def,
                c.character_maximum_length AS len, c.is_identity AS ident,
                EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k
                          ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                         WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY'
                           AND k.column_name = c.column_name) AS pk
           FROM information_schema.columns c WHERE c.table_schema = ? AND c.table_name = ? ORDER BY c.ordinal_position`, [schema, table]);
      columns = rows.map((r) => ({
        name: r.name, dbType: r.dbtype === 'USER-DEFINED' ? r.udt : r.dbtype, nullable: r.nullable === 'YES', pk: !!r.pk,
        autoInc: r.ident === 'YES' || /nextval\(/.test(r.def || ''), default: /nextval\(/.test(r.def || '') ? null : r.def,
        length: r.len == null ? null : Number(r.len), comment: '',
      }));
      const fk = await c.query(
        `SELECT tc.constraint_name AS cname, kcu.column_name AS col, ccu.table_name AS rt, ccu.column_name AS rc
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ? AND tc.table_name = ? ORDER BY tc.constraint_name, kcu.ordinal_position`, [schema, table]);
      fks = groupFks(fk);
      break;
    }
    case 'sqlsrv': {
      const schema = conn.schema || 'dbo';
      const rows = await c.query(
        `SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS dbType, c.IS_NULLABLE AS nullable, c.COLUMN_DEFAULT AS def, c.CHARACTER_MAXIMUM_LENGTH AS len,
                COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS ident,
                CASE WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
                         ON k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND k.TABLE_SCHEMA = tc.TABLE_SCHEMA
                         WHERE tc.TABLE_SCHEMA = c.TABLE_SCHEMA AND tc.TABLE_NAME = c.TABLE_NAME AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                           AND k.COLUMN_NAME = c.COLUMN_NAME) THEN 1 ELSE 0 END AS pk
           FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION`, [schema, table]);
      columns = rows.map((r) => ({
        name: r.name, dbType: r.dbType, nullable: r.nullable === 'YES', pk: !!r.pk, autoInc: r.ident === 1, default: r.def,
        length: r.len == null ? null : Number(r.len), comment: '',
      }));
      const fk = await c.query(
        `SELECT fk.name AS cname, pc.name AS col, rt.name AS rt, rc.name AS rc
           FROM sys.foreign_keys fk
           JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
           JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
           JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
           JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
          WHERE fk.parent_object_id = OBJECT_ID(? + '.' + ?) ORDER BY fk.name, fkc.constraint_column_id`, [schema, table]);
      fks = groupFks(fk);
      break;
    }
    case 'oracle': {
      const rows = (await c.query(
        `SELECT c.column_name AS name, c.data_type AS dbtype, c.data_precision AS prec, c.data_scale AS scale, c.nullable AS nullable,
                c.char_length AS len, c.identity_column AS ident,
                (SELECT COUNT(*) FROM user_constraints uc JOIN user_cons_columns ucc ON ucc.constraint_name = uc.constraint_name
                  WHERE uc.table_name = c.table_name AND uc.constraint_type = 'P' AND ucc.column_name = c.column_name) AS pk
           FROM user_tab_columns c WHERE c.table_name = ? ORDER BY c.column_id`, [table])).map(lc);
      columns = rows.map((r) => ({
        name: r.name, dbType: r.dbtype === 'NUMBER' && r.prec != null ? `NUMBER(${r.prec},${r.scale || 0})` : r.dbtype,
        nullable: r.nullable === 'Y', pk: Number(r.pk) > 0, autoInc: r.ident === 'YES', default: null, length: r.len ? Number(r.len) : null, comment: '',
      }));
      const fk = (await c.query(
        `SELECT a.constraint_name AS cname, a.column_name AS col, rcol.table_name AS rt, rcol.column_name AS rc
           FROM user_cons_columns a
           JOIN user_constraints c ON c.constraint_name = a.constraint_name
           JOIN user_cons_columns rcol ON rcol.constraint_name = c.r_constraint_name AND rcol.position = a.position
          WHERE c.constraint_type = 'R' AND a.table_name = ? ORDER BY a.constraint_name, a.position`, [table])).map(lc);
      fks = groupFks(fk);
      break;
    }
    case 'sqlite': {
      const q = (s) => s.replace(/'/g, "''");
      const rows = await c.query(`PRAGMA table_info('${q(table)}')`);
      const pkCount = rows.filter((r) => r.pk > 0).length;
      columns = rows.map((r) => ({
        name: r.name, dbType: r.type || 'TEXT', nullable: !r.notnull && !r.pk, pk: r.pk > 0,
        autoInc: r.pk > 0 && pkCount === 1 && /^integer$/i.test(r.type), default: r.dflt_value, length: null, comment: '',
      }));
      const fk = await c.query(`PRAGMA foreign_key_list('${q(table)}')`);
      fks = groupFks(fk.map((r) => ({ cname: `fk${r.id}`, col: r.from, rt: r.table, rc: r.to })));
      break;
    }
  }
  for (const col of columns) col.type = genericType(col.dbType);
  return { name: table, columns, pk: columns.filter((x) => x.pk).map((x) => x.name), fks };
}

function groupFks(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.cname;
    if (!map.has(k)) map.set(k, { name: k, columns: [], refTable: r.rt, refColumns: [] });
    map.get(k).columns.push(r.col);
    map.get(k).refColumns.push(r.rc);
  }
  return [...map.values()];
}

// Column list of an arbitrary SELECT (custom SQL datasources).
async function describeQuery(c, sql) {
  const wrapped = c.driver === 'sqlsrv' ? `SELECT TOP 1 * FROM (${sql}) q` :
    c.driver === 'oracle' ? `SELECT * FROM (${sql}) WHERE ROWNUM <= 1` : `SELECT * FROM (${sql}) q LIMIT 1`;
  const rows = await c.query(wrapped);
  if (!rows.length) throw new Error('La query non restituisce righe: impossibile ricavare i campi (aggiungi dati o usa una vista)');
  return Object.keys(rows[0]).map((name) => {
    const v = rows[0][name];
    const type = typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'decimal') : v instanceof Date ? 'datetime' : 'string';
    return { name, dbType: type, type, nullable: true, pk: false, autoInc: false, default: null, length: null, comment: '' };
  });
}

async function preview(c, sql, limit = 100) {
  const rows = await c.query(sql);
  return { columns: rows.length ? Object.keys(rows[0]) : [], rows: rows.slice(0, limit), total: rows.length };
}

module.exports = { DRIVERS, genericType, connect, listTables, describeTable, describeQuery, preview };
