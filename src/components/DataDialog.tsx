// Data viewer of the designer: the records of a database table, of a SQL query of the project or of a stored
// procedure, page by page, sorted by a column, filtered with a SQL condition (core/db.cjs tableData).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { useStore } from '../store';
import { Btn, I, Modal, Select } from './ui';

export interface DataSource { conn: string; title: string; table?: string; sql?: string; procedure?: string; params?: unknown[] }
interface Page { columns: string[]; rows: Record<string, unknown>[]; total: number | null; sql?: string }

export default function DataDialog({ src, onClose }: { src: DataSource; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [page, setPage] = useState(0);
  const [size, setSize] = useState('100');
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [where, setWhere] = useState('');
  const [applied, setApplied] = useState('');
  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = Number(size);
  useEffect(() => {
    setBusy(true);
    setErr('');
    const load = src.procedure
      ? call<{ columns: string[]; rows: Record<string, unknown>[]; total: number }>('db:procPreview', p, src.conn, src.procedure, src.params || []).then((r) => ({ ...r, rows: r.rows }))
      : call<Page>('db:data', p, src.conn, src.sql ? { sql: src.sql } : { table: src.table }, { offset: page * limit, limit, sort: sort?.col, dir: sort?.dir, where: applied });
    load.then(setData).catch((e) => setErr(String(e.message || e))).finally(() => setBusy(false));
  }, [page, limit, sort?.col, sort?.dir, applied]);
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
      {!src.procedure && <form className="inline data-filter" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(where); }}>
        <I n="funnel" /><input className="inp mono" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Condizione SQL, es. status = 'new' AND total > 10" />
        <Btn icon="search">Filtra</Btn>{applied && <Btn kind="ghost" icon="x-lg" onClick={() => { setWhere(''); setApplied(''); setPage(0); }}>Togli</Btn>}
      </form>}
      {err && <p className="err"><I n="exclamation-triangle" /> {err}</p>}
      {data && <div className="data-grid">
        <table className="grid">
          <thead><tr><th className="rownum">#</th>{data.columns.map((c) => <th key={c} onClick={() => !src.procedure && clickSort(c)} className={src.procedure ? '' : 'sortable'}>
            {c}{sort?.col === c && <I n={sort.dir === 'asc' ? 'caret-up-fill' : 'caret-down-fill'} />}</th>)}</tr></thead>
          <tbody>{data.rows.map((r, i) => <tr key={i}><td className="rownum">{page * limit + i + 1}</td>{data.columns.map((c) => <td key={c} title={r[c] == null ? '' : String(r[c])}>{cell(r[c])}</td>)}</tr>)}</tbody>
        </table>
        {!data.rows.length && <p className="muted" style={{ padding: 12 }}>Nessun record{applied ? ' con questo filtro' : ''}.</p>}
      </div>}
    </Modal>
  );
}
