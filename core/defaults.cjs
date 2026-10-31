'use strict';
// Sensible defaults for a datasource built from the database schema, like the classic wizard:
// labels from column names, edit controls from types, lookups from foreign keys,
// master-detail links from incoming foreign keys.

const PAGES = ['list', 'add', 'edit', 'view', 'delete', 'search', 'export', 'import', 'print'];
const SHOW_IN = ['list', 'view', 'add', 'edit', 'search', 'export', 'import', 'print'];

function prettify(name) {
  const s = String(name).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function label(name, languages) {
  const l = prettify(name);
  return Object.fromEntries(languages.map((code) => [code, l]));
}

function guessDisplayField(columns) {
  const names = columns.map((c) => c.name);
  const pref = ['name', 'nome', 'title', 'titolo', 'description', 'descrizione', 'label', 'code', 'codice', 'email', 'username'];
  for (const p of pref) { const hit = names.find((n) => n.toLowerCase() === p); if (hit) return hit; }
  for (const p of pref) { const hit = names.find((n) => n.toLowerCase().includes(p)); if (hit) return hit; }
  return null; // no descriptive column: show the key itself
}

function defaultViewAs(col) {
  switch (col.type) {
    case 'bool': return { type: 'checkbox' };
    case 'int': return { type: 'number', decimals: 0 };
    case 'decimal': return { type: 'number', decimals: 2 };
    case 'date': return { type: 'date' };
    case 'datetime': return { type: 'datetime' };
    case 'time': return { type: 'time' };
    case 'text': return { type: 'longtext', truncate: 80 };
    case 'binary': return { type: 'file' };
  }
  const n = col.name.toLowerCase();
  if (/e?mail/.test(n)) return { type: 'email' };
  if (/url|website|sito/.test(n)) return { type: 'url' };
  if (/(image|immagine|photo|foto|picture|avatar|logo)/.test(n)) return { type: 'image' };
  if (/(file|document|allegato|attachment)/.test(n)) return { type: 'file' };
  return { type: 'text' };
}

function defaultEditAs(col) {
  if (col.autoInc) return { type: 'readonly' };
  switch (col.type) {
    case 'bool': return { type: 'checkbox' };
    case 'int': return { type: 'number', step: 1 };
    case 'decimal': return { type: 'number', step: 'any' };
    case 'date': return { type: 'date' };
    case 'datetime': return { type: 'datetime' };
    case 'time': return { type: 'time' };
    case 'text': return { type: 'textarea', rows: 5 };
    case 'binary': return { type: 'file', upload: { storage: 'database', maxMb: 10, types: '' } };
  }
  const n = col.name.toLowerCase();
  if (/password|passwd|pwd/.test(n)) return { type: 'password' };
  if (/e?mail/.test(n)) return { type: 'email' };
  if (/colou?r|colore/.test(n)) return { type: 'color' };
  if (/(image|immagine|photo|foto|picture|avatar|logo)/.test(n)) return { type: 'image', upload: { storage: 'folder', maxMb: 10, types: 'jpg,jpeg,png,gif,webp', thumbnail: { width: 150, height: 150 } } };
  if (/(file|document|allegato|attachment)/.test(n)) return { type: 'file', upload: { storage: 'folder', maxMb: 20, types: '' } };
  return { type: 'text', maxLength: col.length || undefined };
}

function defaultField(col, languages) {
  const hidden = col.type === 'binary' || /password|passwd|pwd/i.test(col.name);
  const longText = col.type === 'text';
  return {
    name: col.name,
    dbType: col.dbType,
    type: col.type,
    pk: !!col.pk,
    autoInc: !!col.autoInc,
    nullable: !!col.nullable,
    label: label(col.name, languages),
    show: {
      list: !hidden && !longText,
      view: !/password|passwd|pwd/i.test(col.name),
      add: !col.autoInc,
      edit: !col.autoInc,
      search: !hidden && col.type !== 'binary',
      export: !hidden,
      import: !col.autoInc && col.type !== 'binary',
      print: !hidden && !longText,
    },
    viewAs: defaultViewAs(col),
    editAs: defaultEditAs(col),
    validation: { required: !col.nullable && !col.autoInc && col.default == null && col.type !== 'bool' },
    defaultValue: '',
    hint: {},
    filter: false,
    totals: '',
  };
}

function defaultPages(cfg = {}) {
  return {
    list: { enabled: true, pageSize: cfg.pageSize || 20, quickSearch: true, searchPanel: true, filterPanel: false, inlineAdd: false, inlineEdit: false, updateSelected: true, defaultSort: null, rowActions: ['view', 'edit', 'delete'], selectable: true, totals: true },
    add: { enabled: true, mode: 'page' },
    edit: { enabled: true, mode: 'page' },
    view: { enabled: true },
    delete: { enabled: true },
    search: { enabled: true },
    export: { enabled: true, formats: ['csv', 'xlsx', 'json', 'pdf'] },
    import: { enabled: false },
    print: { enabled: true },
  };
}

// Build a datasource definition from describeTable() output.
function datasourceFromSchema(desc, opts) {
  const { connection, languages = ['it', 'en'], settings = {}, allTables = [], type = 'table' } = opts;
  const fields = desc.columns.map((c) => defaultField(c, languages));
  // Foreign keys -> lookup dropdowns.
  for (const fk of desc.fks || []) {
    if (fk.columns.length !== 1) continue;
    const f = fields.find((x) => x.name === fk.columns[0]);
    const target = allTables.find((t) => t.name === fk.refTable);
    if (!f) continue;
    f.editAs = {
      type: 'select',
      lookup: {
        kind: 'table', table: fk.refTable, key: fk.refColumns[0],
        display: (target && guessDisplayField(target.columns)) || fk.refColumns[0],
        where: '', orderBy: '', dependsOn: null, addNew: false, multiple: false,
      },
    };
    f.viewAs = { type: 'lookup' };
    // customer_id -> "Customer"
    const short = f.name.replace(/[_ ]?(id|ID|Id)$/, '');
    if (short && short !== f.name) f.label = label(short, languages);
  }
  return {
    name: desc.name,
    connection,
    source: type === 'sql' ? { type: 'sql', sql: opts.sql || '' } : type === 'proc' ? { type: 'proc', procedure: opts.procedure, params: opts.params || [] } : { type: 'table', table: desc.name },
    caption: label(desc.name, languages),
    keys: desc.pk && desc.pk.length ? desc.pk : [],
    fields,
    pages: defaultPages(settings),
    details: [],
    audit: true, // follows the project-wide audit setting; false opts this table out
    api: { enabled: false, methods: ['list', 'view', 'add', 'edit', 'delete'] },
    readOnly: type === 'view',
  };
}

// Incoming foreign keys of `master` among `described` tables -> master/detail links.
function suggestDetails(masterName, described) {
  const out = [];
  for (const d of described) {
    for (const fk of d.fks || []) {
      if (fk.refTable === masterName) out.push({ table: d.name, masterKeys: fk.refColumns, detailKeys: fk.columns, showIn: ['view', 'edit'], listPreview: false });
    }
  }
  return out;
}

const TABLE_EVENTS = {
  BeforeSelect: { args: '&$where, &$orderBy, $page', help: 'Modifica WHERE/ORDER BY prima di leggere i record. $where è una stringa SQL (vuota = nessun filtro).' },
  ProcParams: { args: '&$params', help: 'Solo origini stored procedure: parametri della chiamata (nome => valore), modificabili prima di eseguirla, es. $params[\'anno\'] = date(\'Y\').' },
  ProcRows: { args: '&$rows', help: 'Solo origini stored procedure: righe restituite dalla procedura, da filtrare o modificare in PHP prima di lista, ricerca e totali (vale per tutti i database).' },
  BeforeShowList: { args: '&$rows, $page', help: 'Prima di mostrare la lista: puoi modificare $rows (array di record).' },
  ProcessValues: { args: '&$values, $page', help: 'Prima di mostrare un record in visualizza/modifica.' },
  BeforeAdd: { args: '&$values, &$message, $page', help: 'Prima di inserire. return false per annullare (con $message).' },
  AfterAdd: { args: '$values, $keys, $page', help: 'Dopo l\'inserimento. $keys contiene la chiave del nuovo record.' },
  BeforeEdit: { args: '&$values, $old, &$message, $page', help: 'Prima di salvare le modifiche. return false per annullare.' },
  AfterEdit: { args: '$values, $old, $keys, $page', help: 'Dopo il salvataggio delle modifiche.' },
  BeforeDelete: { args: '$old, &$message, $page', help: 'Prima di eliminare un record. return false per annullare.' },
  AfterDelete: { args: '$old, $page', help: 'Dopo l\'eliminazione.' },
  BeforeImport: { args: '&$values, $page', help: 'Per ogni riga importata. return false per saltarla.' },
  CustomValidate: { args: '$values, &$errors, $page', help: 'Validazioni personalizzate: $errors[campo] = "messaggio".' },
  TableInit: { args: '', help: 'Alla prima apertura della tabella in ogni richiesta.' },
  BeforeProcess: { args: '$page', help: 'All\'inizio di ogni pagina della tabella ($page = list, add, edit, view, search, print, export, import).' },
  BeforeShow: { args: '$page', help: 'Subito prima di mostrare la pagina.' },
  AfterImport: { args: '$result, $page', help: 'Dopo un\'importazione: $result con added, updated, skipped, errors.' },
};

const GLOBAL_EVENTS = {
  AfterAppInit: { args: '', help: 'All\'avvio di ogni richiesta (dopo il caricamento della configurazione).' },
  BeforeLogin: { args: '&$username, &$password, &$message', help: 'Prima del login. return false per bloccarlo.' },
  AfterSuccessfulLogin: { args: '$username, $user', help: 'Dopo un login riuscito.' },
  AfterUnsuccessfulLogin: { args: '$username, $message', help: 'Dopo un login fallito.' },
  TwoFactorPhone: { args: '&$phone, $user', help: 'Numero a cui inviare il codice SMS della verifica in due passaggi (es. da una tabella anagrafica); $phone arriva con quello del profilo.' },
  BeforeRegister: { args: '&$values, &$message', help: 'Prima della registrazione di un utente. return false per annullare.' },
  AfterRegister: { args: '$values', help: 'Dopo la registrazione.' },
  AfterLogout: { args: '$username', help: 'Dopo il logout.' },
};

function eventTemplate(name, def, table) {
  return `<?php\n// ${name}(${def.args})${table ? ` — tabella ${table}` : ''}\n// ${def.help}\n// Helper: db(), user(), userId(), isAdmin(), sendMail($to, $subject, $body), redirect($url), t($key)\n\nreturn true;\n`;
}

module.exports = {
  PAGES, SHOW_IN, prettify, label, guessDisplayField, defaultField, defaultPages, defaultViewAs, defaultEditAs,
  datasourceFromSchema, suggestDetails, TABLE_EVENTS, GLOBAL_EVENTS, eventTemplate,
};
