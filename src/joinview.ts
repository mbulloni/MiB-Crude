// Vista unita: helpers shared by the dialog and the diagram (the SQL itself is built in core/joinview.cjs).
import type { JoinDef, JoinDefV1, Table } from './types';

/** Current shape of a saved definition (the first version stored only two tables). */
export function normalizeJoin(d: JoinDef | JoinDefV1 | undefined): JoinDef | undefined {
  if (!d) return undefined;
  if ('joins' in d) return d;
  return {
    base: d.left.table,
    joins: d.right.table ? [{ table: d.right.table, type: d.type, from: d.left.table, on: d.on }] : [],
    columns: d.columns.map((c) => ({ table: c.side === 'right' ? d.right.table : d.left.table, name: c.name, as: c.as })),
  };
}

/** Every table of a view, base first. */
export const joinTables = (d: JoinDef) => [d.base, ...d.joins.map((j) => j.table)];

/** Database columns of a datasource (calculated fields do not exist in the database). */
export const dbFields = (t?: Table) => (t?.fields || []).filter((f) => !(f as { calculated?: unknown }).calculated).map((f) => f.name);

/** Same-name fields of two tables, ids first: a reasonable first guess for the linking fields. */
export function guessPair(l?: Table, r?: Table): { left: string; right: string } | null {
  if (!l || !r) return null;
  const rf = dbFields(r);
  const same = dbFields(l).filter((n) => rf.some((x) => x.toLowerCase() === n.toLowerCase()));
  const pick = same.find((n) => /(^|_)(id|cod|codice)/i.test(n) || /id$/i.test(n)) || same[0];
  if (pick) return { left: pick, right: rf.find((x) => x.toLowerCase() === pick.toLowerCase())! };
  const k = (l.keys || [])[0];
  return k && rf.includes(k) ? { left: k, right: k } : null;
}

/** How a candidate table links to the ones already in the view: the project's master-detail relations first, then same-name fields. */
export function linkFor(included: Table[], cand: Table): { from: string; on: { left: string; right: string }[] } | null {
  for (const i of included) {
    const d = i.details.find((x) => x.table === cand.name && x.masterKeys.length && x.masterKeys.length === x.detailKeys.length);
    if (d) return { from: i.name, on: d.masterKeys.map((k, n) => ({ left: k, right: d.detailKeys[n] })) };
    const r = cand.details.find((x) => x.table === i.name && x.masterKeys.length && x.masterKeys.length === x.detailKeys.length);
    if (r) return { from: i.name, on: r.detailKeys.map((k, n) => ({ left: k, right: r.masterKeys[n] })) };
  }
  for (const i of included) {
    const g = guessPair(i, cand);
    if (g) return { from: i.name, on: [g] };
  }
  return null;
}
