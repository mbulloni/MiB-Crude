'use strict';
// Business templates: tables (any dialect), sample data and project settings ready to use.

const D = require('./db.cjs');
const DDL = require('./ddl.cjs');
const W = require('./wizard.cjs');

const id = { name: 'id', type: 'int', pk: true, autoInc: true };
const v = (name, size = 150, extra = {}) => ({ name, type: 'varchar', size, nullable: true, ...extra });
const list = (...vals) => ({ kind: 'list', values: vals.map(([value, it, en]) => ({ value, label: { it, en: en || it } })) });

const TEMPLATES = [
  {
    id: 'crm', icon: 'people', name: { it: 'CRM clienti', en: 'Customer CRM' },
    description: { it: 'Aziende, contatti e attività commerciali con kanban per fase e calendario degli appuntamenti.', en: 'Companies, contacts and sales activities with a stage kanban and an appointment calendar.' },
    tables: [
      { name: 'crm_companies', label: ['Aziende', 'Companies'], icon: 'building', cols: [id, v('name', 150, { nullable: false }), v('vat_number', 20), v('city', 100), v('phone', 40), v('email', 150), v('website', 200), { name: 'notes', type: 'text', nullable: true }],
        rows: [['Rossi Srl', '01234567890', 'Milano', '02 1234567', 'info@rossi.it', 'www.rossi.it', null], ['Bianchi SpA', '09876543210', 'Roma', '06 7654321', 'info@bianchi.it', 'www.bianchi.it', null]] },
      { name: 'crm_contacts', label: ['Contatti', 'Contacts'], icon: 'person-lines-fill', cols: [id, { name: 'company_id', type: 'int', nullable: true, ref: { table: 'crm_companies' } }, v('first_name', 80, { nullable: false }), v('last_name', 80, { nullable: false }), v('role', 80), v('email', 150), v('phone', 40)],
        rows: [[1, 'Mario', 'Rossi', 'Direttore', 'mario@rossi.it', '333 1111111'], [2, 'Anna', 'Bianchi', 'Acquisti', 'anna@bianchi.it', '333 2222222']] },
      { name: 'crm_activities', label: ['Attività', 'Activities'], icon: 'kanban', cols: [id, { name: 'company_id', type: 'int', ref: { table: 'crm_companies' } }, { name: 'contact_id', type: 'int', nullable: true, ref: { table: 'crm_contacts' } },
        v('subject', 200, { nullable: false }), v('stage', 20, { nullable: false }), { name: 'due_date', type: 'date', nullable: true }, { name: 'amount', type: 'decimal', size: 12, scale: 2, nullable: true }, { name: 'notes', type: 'text', nullable: true }],
        rows: [[1, 1, 'Primo contatto', 'lead', '2026-11-05', 5000, null], [2, 2, 'Offerta inviata', 'offer', '2026-11-10', 12000, null], [1, 1, 'Contratto firmato', 'won', '2026-10-20', 8000, null]] },
    ],
    tweak(p) {
      const act = p.tables.find((t) => t.name === 'crm_activities');
      const stage = act.fields.find((f) => f.name === 'stage');
      stage.editAs = { type: 'select', lookup: list(['lead', 'Contatto', 'Lead'], ['offer', 'Offerta', 'Offer'], ['negotiation', 'Trattativa', 'Negotiation'], ['won', 'Vinta', 'Won'], ['lost', 'Persa', 'Lost']) };
      stage.viewAs = { type: 'lookup' };
      stage.filter = true;
      act.fields.find((f) => f.name === 'amount').totals = 'sum';
      act.fields.find((f) => f.name === 'amount').viewAs = { type: 'currency', decimals: 2 };
      act.pages.list.filterPanel = true;
      act.pages.list.inlineEdit = true;
      act.pages.list.views = [{ type: 'kanban', statusField: 'stage', titleField: 'subject', subtitleField: 'company_id' }, { type: 'calendar', dateField: 'due_date', titleField: 'subject' }];
      const contact = act.fields.find((f) => f.name === 'contact_id');
      contact.editAs.lookup.dependsOn = { field: 'company_id', linkField: 'company_id' };
      contact.editAs.lookup.display = '{first_name} {last_name}';
      p.tables.find((t) => t.name === 'crm_contacts').fields.find((f) => f.name === 'email').viewAs = { type: 'email' };
      p.charts.push({ name: 'crm_pipeline', title: { it: 'Pipeline per fase', en: 'Pipeline by stage' }, table: 'crm_activities', type: 'funnel', labelField: 'stage', series: [{ field: 'amount', fn: 'sum' }] });
      p.dashboards.push({ name: 'crm', title: { it: 'Cruscotto commerciale', en: 'Sales dashboard' }, items: [{ type: 'count', table: 'crm_companies', width: 4 }, { type: 'count', table: 'crm_activities', width: 4 }, { type: 'count', table: 'crm_activities', fn: 'sum', field: 'amount', width: 4 }, { type: 'chart', ref: 'crm_pipeline', width: 12 }] });
      return { group: { it: 'CRM', en: 'CRM' }, icon: 'people', extra: [{ type: 'dashboard', ref: 'crm' }] };
    },
  },
  {
    id: 'helpdesk', icon: 'life-preserver', name: { it: 'Helpdesk ticket', en: 'Helpdesk tickets' },
    description: { it: 'Ticket con priorità e stato (kanban), categorie e commenti in master-dettaglio.', en: 'Tickets with priority and status (kanban), categories and comments as master-detail.' },
    tables: [
      { name: 'hd_categories', label: ['Categorie', 'Categories'], icon: 'tags', cols: [id, v('name', 100, { nullable: false })], rows: [['Hardware'], ['Software'], ['Rete']] },
      { name: 'hd_tickets', label: ['Ticket', 'Tickets'], icon: 'life-preserver', cols: [id, v('title', 200, { nullable: false }), { name: 'category_id', type: 'int', ref: { table: 'hd_categories' } }, v('priority', 10, { nullable: false }), v('status', 20, { nullable: false }),
        v('requester', 150), v('assigned_to', 150), { name: 'opened_at', type: 'datetime', nullable: true }, { name: 'description', type: 'text', nullable: true }],
        rows: [['Stampante non funziona', 1, 'high', 'open', 'mario', null, '2026-10-28 09:00:00', 'La stampante del 2° piano non stampa'], ['Accesso VPN', 3, 'normal', 'progress', 'anna', 'tecnico', '2026-10-29 14:30:00', null]] },
      { name: 'hd_comments', label: ['Commenti', 'Comments'], icon: 'chat-left-text', cols: [id, { name: 'ticket_id', type: 'int', ref: { table: 'hd_tickets' } }, v('author', 150), { name: 'created_at', type: 'datetime', nullable: true }, { name: 'body', type: 'text', nullable: false }],
        rows: [[1, 'tecnico', '2026-10-28 10:00:00', 'Verifico in giornata']] },
    ],
    tweak(p) {
      const t = p.tables.find((x) => x.name === 'hd_tickets');
      const f = (n) => t.fields.find((x) => x.name === n);
      f('priority').editAs = { type: 'radio', lookup: list(['low', 'Bassa', 'Low'], ['normal', 'Normale', 'Normal'], ['high', 'Alta', 'High'], ['urgent', 'Urgente', 'Urgent']) };
      f('status').editAs = { type: 'select', lookup: list(['open', 'Aperto', 'Open'], ['progress', 'In lavorazione', 'In progress'], ['waiting', 'In attesa', 'Waiting'], ['closed', 'Chiuso', 'Closed']) };
      for (const n of ['priority', 'status']) { f(n).viewAs = { type: 'lookup' }; f(n).filter = true; }
      f('requester').autoUpdate = { add: '{user}' };
      f('opened_at').autoUpdate = { add: '{now}' };
      f('opened_at').show.add = false;
      t.pages.list.filterPanel = true;
      t.pages.list.views = [{ type: 'kanban', statusField: 'status', titleField: 'title', subtitleField: 'priority' }];
      t.pages.list.defaultSort = { field: 'opened_at', dir: 'desc' };
      const c = p.tables.find((x) => x.name === 'hd_comments');
      c.fields.find((x) => x.name === 'author').autoUpdate = { add: '{user}' };
      c.fields.find((x) => x.name === 'created_at').autoUpdate = { add: '{now}' };
      p.charts.push({ name: 'hd_by_status', title: { it: 'Ticket per stato', en: 'Tickets by status' }, table: 'hd_tickets', type: 'doughnut', labelField: 'status', series: [] });
      return { group: { it: 'Helpdesk', en: 'Helpdesk' }, icon: 'life-preserver', extra: [{ type: 'chart', ref: 'hd_by_status' }] };
    },
  },
  {
    id: 'booking', icon: 'calendar-week', name: { it: 'Calendario risorse', en: 'Resource booking' },
    description: { it: 'Prenotazioni di sale, auto o attrezzature con vista calendario trascinabile.', en: 'Bookings of rooms, cars or equipment with a drag & drop calendar view.' },
    tables: [
      { name: 'bk_resources', label: ['Risorse', 'Resources'], icon: 'box-seam', cols: [id, v('name', 120, { nullable: false }), v('kind', 30), v('location', 120), { name: 'capacity', type: 'int', nullable: true }],
        rows: [['Sala riunioni A', 'room', 'Piano 1', 10], ['Auto aziendale', 'car', 'Garage', 5], ['Proiettore', 'equipment', 'Magazzino', null]] },
      { name: 'bk_bookings', label: ['Prenotazioni', 'Bookings'], icon: 'calendar-week', cols: [id, { name: 'resource_id', type: 'int', ref: { table: 'bk_resources' } }, v('title', 200, { nullable: false }), { name: 'starts_at', type: 'datetime' }, { name: 'ends_at', type: 'datetime' }, v('booked_by', 150), { name: 'notes', type: 'text', nullable: true }],
        rows: [[1, 'Riunione di progetto', '2026-11-03 10:00:00', '2026-11-03 11:30:00', 'mario', null], [2, 'Visita cliente', '2026-11-04 08:30:00', '2026-11-04 18:00:00', 'anna', null]] },
    ],
    tweak(p) {
      const r = p.tables.find((x) => x.name === 'bk_resources');
      r.fields.find((f) => f.name === 'kind').editAs = { type: 'select', lookup: list(['room', 'Sala', 'Room'], ['car', 'Veicolo', 'Vehicle'], ['equipment', 'Attrezzatura', 'Equipment']) };
      r.fields.find((f) => f.name === 'kind').viewAs = { type: 'lookup' };
      const b = p.tables.find((x) => x.name === 'bk_bookings');
      b.fields.find((f) => f.name === 'booked_by').autoUpdate = { add: '{user}' };
      b.pages.list.views = [{ type: 'calendar', dateField: 'starts_at', endField: 'ends_at', titleField: 'title' }];
      b.pages.list.defaultSort = { field: 'starts_at', dir: 'desc' };
      // Overlapping bookings of the same resource are refused.
      const check = "$q = 'SELECT COUNT(*) FROM ' . db()->q('bk_bookings') . ' WHERE ' . db()->q('resource_id') . ' = ? AND ' . db()->q('starts_at') . ' < ? AND ' . db()->q('ends_at') . ' > ?';\n";
      p.events.bk_bookings = {
        CustomValidate: `<?php\n// Una risorsa non può avere due prenotazioni sovrapposte.\nif (!empty($values['starts_at']) && !empty($values['ends_at'])) {\n    if ($values['ends_at'] <= $values['starts_at']) $errors['ends_at'] = 'La fine deve seguire l\\'inizio';\n    ${check.trim()}\n    $params = [$values['resource_id'], $values['ends_at'], $values['starts_at']];\n    if (!empty($_GET['k']['id'])) { $q .= ' AND ' . db()->q('id') . ' <> ?'; $params[] = $_GET['k']['id']; }\n    if (db()->value($q, $params) > 0) $errors['starts_at'] = 'Risorsa già prenotata in questo intervallo';\n}\nreturn true;\n`,
      };
      return { group: { it: 'Prenotazioni', en: 'Bookings' }, icon: 'calendar-week', extra: [] };
    },
  },
  {
    id: 'documents', icon: 'folder2-open', name: { it: 'Archivio documenti', en: 'Document archive' },
    description: { it: 'Cartelle e documenti con caricamento file, scadenze, galleria e registro attività.', en: 'Folders and documents with file upload, expiry dates, gallery and audit trail.' },
    tables: [
      { name: 'doc_folders', label: ['Cartelle', 'Folders'], icon: 'folder', cols: [id, v('name', 150, { nullable: false }), { name: 'description', type: 'text', nullable: true }], rows: [['Contratti', null], ['Fatture', null], ['Procedure', null]] },
      { name: 'doc_documents', label: ['Documenti', 'Documents'], icon: 'file-earmark-text', cols: [id, { name: 'folder_id', type: 'int', ref: { table: 'doc_folders' } }, v('title', 200, { nullable: false }), v('file', 1000), v('preview_image', 1000),
        { name: 'doc_date', type: 'date', nullable: true }, { name: 'expiry_date', type: 'date', nullable: true }, v('tags', 200), v('uploaded_by', 150), { name: 'notes', type: 'text', nullable: true }],
        rows: [[1, 'Contratto fornitura 2026', null, null, '2026-01-10', '2026-12-31', 'fornitori', 'admin', null]] },
    ],
    tweak(p) {
      const d = p.tables.find((x) => x.name === 'doc_documents');
      const f = (n) => d.fields.find((x) => x.name === n);
      f('file').editAs = { type: 'file', upload: { storage: 'folder', maxMb: 50, types: 'pdf,doc,docx,xls,xlsx,odt,ods,txt,zip,jpg,png', multiple: true } };
      f('file').viewAs = { type: 'file' };
      f('preview_image').editAs = { type: 'image', upload: { storage: 'folder', maxMb: 10, types: 'jpg,jpeg,png,webp', thumbnail: { width: 300, height: 220 } } };
      f('preview_image').viewAs = { type: 'image' };
      f('uploaded_by').autoUpdate = { add: '{user}' };
      d.audit = true;
      d.pages.list.views = [{ type: 'gallery', imageField: 'preview_image', titleField: 'title', subtitleField: 'folder_id' }, { type: 'calendar', dateField: 'expiry_date', titleField: 'title' }];
      p.project.settings.audit = true;
      return { group: { it: 'Documenti', en: 'Documents' }, icon: 'folder2-open', extra: [] };
    },
  },
];

function list_() {
  return TEMPLATES.map(({ id: tid, icon, name, description, tables }) => ({ id: tid, icon, name, description, tables: tables.map((t) => t.name) }));
}

function lit(dialect, val, col) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (dialect === 'oracle' && col.type === 'date') return `DATE '${val}'`;
  if (dialect === 'oracle' && col.type === 'datetime') return `TIMESTAMP '${val}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Creates the tables (unless they exist), sample data, and configures the project. */
async function apply(proj, conn, password, templateId, opts = {}) {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) throw new Error(`Modello sconosciuto: ${templateId}`);
  const dialect = conn.driver;
  const created = [];
  const c = await D.connect(conn, password);
  try {
    const existing = new Set((await D.listTables(c, conn)).map((t) => t.name));
    for (const t of tpl.tables) {
      if (existing.has(t.name)) continue;
      await c.query(DDL.createTable(dialect, t.name, t.cols.map((x) => ({ nullable: false, ...x }))));
      created.push(t.name);
      if (opts.sample !== false) {
        const cols = t.cols.filter((x) => !x.autoInc);
        for (const r of t.rows || []) await c.query(`INSERT INTO ${DDL.quote(dialect, t.name)} (${cols.map((x) => DDL.quote(dialect, x.name)).join(', ')}) VALUES (${r.map((val, i) => lit(dialect, val, cols[i])).join(', ')})`);
      }
    }
  } finally { await c.close(); }
  await W.importTables(proj, conn, password, tpl.tables.map((t) => t.name).filter((n) => !proj.tables.some((x) => x.name === n)));
  for (const t of tpl.tables) {
    const ds = proj.tables.find((x) => x.name === t.name);
    if (!ds) continue;
    const [it, en] = t.label;
    ds.caption = Object.fromEntries(proj.project.languages.map((l) => [l, l === 'en' ? en : it]));
    ds.icon = t.icon;
  }
  const menu = tpl.tweak(proj);
  proj.menu.items.push({ type: 'group', label: menu.group, icon: menu.icon, items: [...tpl.tables.map((t) => ({ type: 'table', table: t.name, icon: t.icon })), ...menu.extra] });
  return { created, tables: tpl.tables.map((t) => t.name) };
}

module.exports = { TEMPLATES, list: list_, apply };
