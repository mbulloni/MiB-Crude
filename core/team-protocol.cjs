'use strict';
// Shared by the team server and the designer client.
// A lockable "item" groups the project files a developer edits together.

const P = require('./project.cjs');

function itemOf(rel) {
  let m;
  if ((m = rel.match(/^tables\/(.+)\.json$/))) return `table:${m[1]}`;
  if ((m = rel.match(/^events\/_global\//))) return 'events:_global';
  if ((m = rel.match(/^events\/([^/]+)\//))) return `table:${m[1]}`;
  if ((m = rel.match(/^(report|chart|dashboard)s\/(.+)\.json$/))) return `${m[1]}:${m[2]}`;
  if (rel.startsWith('connections/')) return 'connections';
  if (rel.startsWith('lang/')) return 'lang';
  if (rel === 'security.json') return 'security';
  if (rel === 'menu.json') return 'menu';
  if (rel === P.PROJECT_FILE) return 'project';
  if (rel.startsWith('custom/')) return 'custom';
  return 'other';
}

// Which project paths may travel over the wire (never local/secret/output files).
function syncable(rel) {
  if (rel.includes('..') || rel.startsWith('/') || rel.startsWith(P.LOCAL_DIR) || rel.startsWith('.git/') || rel.startsWith('output/')) return false;
  return /^(mibcrude\.json|menu\.json|security\.json|\.gitignore|(connections|tables|lang|reports|charts|dashboards)\/[^/]+\.json|events\/[^/]+\/[^/]+\.php|custom\/.+)$/.test(rel);
}

module.exports = { itemOf, syncable, hash: P.hash };
