// Data viewer of the designer: the records of a database table, of a SQL query of the project or of a stored
// procedure, page by page, sorted by a column, searched in every column and filtered with conditions picked field by field
// (no SQL needed; a SQL condition is still there for who wants it). core/db.cjs tableData + core/filters.cjs.
import { useEffect, useState } from 'react';
import { call } from '../api';
import { useStore } from '../store';
import type { Cond, Field } from '../types';
import { FilterBuilder } from './FilterBuilder';
import { Btn, I, Modal, Select } from './ui';

export interface DataSource { conn: string; title: string; table?: string; sql?: string; procedure?: string; params?: unknown[] }
interface Page { columns: string[]; rows: Record<string, unknown>[]; total: number | null; sql?: string }
interface Applied { search: string; filters: (Cond & { kind: string })[]; where: string }
const NONE: Applied = { search: '', filters: [], where: '' };

/** The kind of a column, guessed from its first filled value (the viewer has no schema for a query). */
const kindOfValue = (v: unknown) => (typeof v === 'number' ? 'number' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? 'date' : 'text');

export default function DataDialog({ src, onClose }: { src: DataSource; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [page, setPage] = useState(0);
  const [size, setSize] = useState('100');
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [where, setWhere] = useState('');
  const [search, setSearch] = useState('');
  const [conds, setConds] = useState<Cond[]>([]);
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<Applied>(NONE);
  const [cols, setCols] = useState<{ name: string; kind: string }[]>([]);
  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = Number(size);
  useEffect(() => {
    setBusy(true);
    setErr('');
    const load = src.procedure
      ? call<{ columns: string[]; rows: Record<string, unknown>[]; total: number }>('db:procPreview', p, src.conn, src.procedure, src.params || []).then((r) => ({ ...r, rows: r.rows }))
      : call<Page>('db:data', p, src.conn, src.sql ? { sql: src.sql } : { table: src.table }, { offset: page * limit, limit, sort: sort?.col, dir: sort?.dir, where: applied.where, search: applied.search, filters: applied.filters, columns: cols.map((c) => c.name) });
    load.then((r) => {
      setData(r);
      // the columns are known from the first records; a filter with no result must not lose them
      if (r.columns.length && !cols.length) setCols(r.columns.map((n) => ({ name: n, kind: kindOfValue(r.rows.map((x) => x[n]).find((v) => v != null && v !== '')) })));
    }).catch((e) => setErr(String(e.message || e))).finally(() => setBusy(false));
  }, [page, limit, sort?.col, sort?.dir, applied]);
  const asFields = cols.map((c) => ({ name: c.name, label: { it: c.name }, type: c.kind === 'number' ? 'decimal' : c.kind === 'date' ? 'date' : 'string', editAs: { type: 'text' } }) as unknown as Field);
  const apply = () => { setPage(0); setApplied({ search: search.trim(), where: where.trim(), filters: conds.filter((c) => c.field).map((c) => ({ ...c, kind: cols.find((x) => x.name === c.field)?.kind || 'text' })) }); };
  const clear = () => { setSearch(''); setWhere(''); setConds([]); setApplied(NONE); setPage(0); };
  const active = !!(applied.search || applied.where || applied.filters.some((c) => c.v || c.op === 'empty' || c.op === 'notempty'));
  const total = data?.total ?? null;
  const pages = total == null ? null : Math.max(1, Math.ceil(total / limit));
  const clickSort = (col: string) => { setPage(0); setSort(sort?.col === col ? (sort.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' }); };
  const cell = (v: unknown) => (v == null ? <i className="null">NULL</i> : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <Modal wide title={<><I n="table" /> Dati di {src.title}</>} onClose={onClose}
      footer={<>
        <span className="muted small">{total != null ? `${total.toLocaleString('it-IT')} record` : data ? `${data.rows.length} record` : ''}{busy ? ' · caricamento…' : ''}</span>
        <span className="grow" />
        {!src.procedure && <>
          <Select value={size} options={[['50', '50 per pagina'], ['100', '100 per pagina'], ['250', '250 per pagina'], ['500', '500 per pagina']]} onChange={(v) => { setSize(v); setPage(0); }} />
          <Btn small icon="chevron-double-left" disabled={page === 0} onClick={() => setPage(0)} />
          <Btn small icon="chevron-left" disabled={page === 0} onClick={() => setPage(page - 1)} />
          <span className="small">Pagina {page + 1}{pages ? ` di ${pages.toLocaleString('it-IT')}` : ''}</span>
          <Btn small icon="chevron-right" disabled={pages != null ? page + 1 >= pages : (data?.rows.length || 0) < limit} onClick={() => setPage(page + 1)} />
          {pages != null && <Btn small icon="chevron-double-right" disabled={page + 1 >= pages} onClick={() => setPage(pages - 1)} />}
        </>}
        <Btn onClick={onClose}>Chiudi</Btn>
      </>}>
      {!src.procedure && <form className="data-filter" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="inline">
          <I n="search" /><input className="inp" style={{ flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca in tutte le colonne…" />
          <Btn icon="search">Cerca</Btn>
          <Btn kind={open || conds.length ? 'primary' : ''} icon="funnel" onClick={() => setOpen(!open)}>Filtri{conds.length ? ` (${conds.length})` : ''}</Btn>
          {active && <Btn kind="ghost" icon="x-lg" onClick={clear}>Togli tutto</Btn>}
        </div>
        {open && <div className="data-filter-box">
          {cols.length ? <FilterBuilder fields={asFields} value={conds} onChange={(v) => setConds(v || [])} /> : <p className="help">Le colonne compaiono dopo il primo caricamento.</p>}
          <details className="mt"><summary className="small muted">Condizione SQL (per esperti)</summary>
            <input className="inp mono" style={{ width: '100%' }} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="es. status = 'new' AND total > 10" /></details>
          <div className="inline mt"><Btn kind="primary" icon="check-lg">Applica i filtri</Btn></div>
        </div>}
      </form>}
      {err && <p className="err"><I n="exclamation-triangle" /> {err}</p>}
      {data && <div className="data-grid">
        <table className="grid">
          <thead><tr><th className="rownum">#</th>{data.columns.map((c) => <th key={c} onClick={() => !src.procedure && clickSort(c)} className={src.procedure ? '' : 'sortable'}>
            {c}{sort?.col === c && <I n={sort.dir === 'asc' ? 'caret-up-fill' : 'caret-down-fill'} />}</th>)}</tr></thead>
          <tbody>{data.rows.map((r, i) => <tr key={i}><td className="rownum">{page * limit + i + 1}</td>{data.columns.map((c) => <td key={c} title={r[c] == null ? '' : String(r[c])}>{cell(r[c])}</td>)}</tr>)}</tbody>
        </table>
        {!data.rows.length && <p className="muted" style={{ padding: 12 }}>Nessun record{active ? ' con questi filtri' : ''}.</p>}
      </div>}
    </Modal>
  );
}
