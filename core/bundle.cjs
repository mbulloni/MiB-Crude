'use strict';
// Table export/import as ZIP: manifest (tables, reports, charts, connections without secrets)
// plus each event as its own readable file, like in the project folder.

const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const { stableStringify } = require('./project.cjs');

const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_');

/** bundle = { format: 'mibcrude-tables', tables, events: {table: {Event: code}}, ... } -> zip bytes */
function toZip(bundle) {
  const { events = {}, ...rest } = bundle;
  const files = {};
  const index = {};
  for (const [table, evs] of Object.entries(events)) {
    for (const [name, code] of Object.entries(evs || {})) {
      const p = `events/${safe(table)}/${name}.${name.startsWith('JS_') ? 'js' : 'php'}`;
      files[p] = strToU8(code);
      (index[table] ||= {})[name] = p;
    }
  }
  files['mibcrude-tables.json'] = strToU8(stableStringify({ ...rest, eventFiles: index }));
  return zipSync(files, { level: 6, mtime: new Date('2026-01-01') });
}

function fromZip(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const manifest = files['mibcrude-tables.json'];
  if (!manifest) throw new Error('Archivio non valido: manca mibcrude-tables.json');
  const { eventFiles = {}, ...bundle } = JSON.parse(strFromU8(manifest));
  bundle.events = {};
  for (const [table, evs] of Object.entries(eventFiles)) {
    for (const [name, p] of Object.entries(evs)) if (files[p]) (bundle.events[table] ||= {})[name] = strFromU8(files[p]);
  }
  return bundle;
}

module.exports = { toZip, fromZip };
