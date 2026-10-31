// Stored procedure datasources (source.type = proc, runtime/lib/Proc.php): procedure picked from the database,
// parameters from constants, session variables, the signed-in user or the page address, preview of the result.
import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, useStore } from '../store';
import type { ProcParam, Project } from '../types';
import { Btn, I, Modal, Row, Select, Text, slug } from './ui';

type DbProc = { name: string; params: { name: string; type: string }[] };
type Preview = { columns: string[]; rows: Record<string, unknown>[]; total: number };

type From = NonNullable<ProcParam['from']>;
const FROM: [From, string][] = [['value', 'Valore fisso'], ['session', 'Variabile di sessione'], ['user', 'Utente collegato'], ['get', 'Parametro dell\'indirizzo'], ['null', 'NULL']];

/** Parameter table: name, where the value comes from, value, value to try in the designer. */
export function ProcParams({ value, onChange }: { value: ProcParam[]; onChange: (v: ProcParam[]) => void }) {
  const set = (i: number, patch: Partial<ProcParam>) => onChange(value.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  return (
    <div>
      {value.length > 0 && <table className="grid small">
        <thead><tr><th>Parametro</th><th>Valore da</th><th>Valore</th><th title="Usato solo nel designer per leggere i campi e l'anteprima">Valore di prova</th><th /></tr></thead>
        <tbody>{value.map((p, i) => <tr key={i}>
          <td><Text value={p.name} onChange={(v) => set(i, { name: v })} mono /></td>
          <td><Select<From> value={p.from || 'value'} options={FROM} onChange={(v) => set(i, { from: v })} /></td>
          <td>{p.from === 'user' || p.from === 'null' ? <span className="muted">—</span>
            : <Text value={p.value} onChange={(v) => set(i, { value: v })} mono placeholder={p.from === 'session' ? 'usr' : p.from === 'get' ? 'anno' : ''} />}</td>
          <td>{p.from === 'value' || !p.from || p.from === 'null' ? <span className="muted">—</span> : <Text value={p.sample} onChange={(v) => set(i, { sample: v })} mono />}</td>
          <td><Btn small kind="ghost" icon="x-lg" title="Togli" onClick={() => onChange(value.filter((_, n) => n !== i))} /></td>
        </tr>)}</tbody>
      </table>}
      <Btn small icon="plus" onClick={() => onChange([...value, { name: '', from: 'value', value: '' }])}>Parametro</Btn>
      <p className="help">I parametri vanno nell'ordine della procedura. L'evento <code>ProcParams(&amp;$params)</code> della tabella può calcolarli in PHP.</p>
    </div>
  );
}

export function PreviewGrid({ prev }: { prev: Preview }) {
  return <div className="preview-grid"><table className="grid"><thead><tr>{prev.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>{prev.rows.map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c}>{r[c] == null ? <i className="null">NULL</i> : String(r[c])}</td>)}</tr>)}</tbody></table>
    <small className="hint">{prev.total} righe</small></div>;
}

export function ProcDialog({ onClose, conn: conn0, onCreated }: { onClose: () => void; conn: string; onCreated: (p: Project, name: string) => void }) {
  const p = useStore((s) => s.proj)!;
  const sqlConns = p.connections.filter((c) => c.driver !== 'rest' && c.driver !== 'sqlite');
  const [conn, setConn] = useState(sqlConns.some((c) => c.id === conn0) ? conn0 : sqlConns[0]?.id || '');
  const [procs, setProcs] = useState<DbProc[] | null>(null);
  const [err, setErr] = useState('');
  const [proc, setProc] = useState('');
  const [name, setName] = useState('');
  const [params, setParams] = useState<ProcParam[]>([]);
  const [prev, setPrev] = useState<Preview | null>(null);
  useEffect(() => {
    setProcs(null); setErr('');
    if (conn) call<DbProc[]>('db:procedures', p, conn).then(setProcs).catch((e) => setErr(String(e.message || e)));
  }, [conn]);
  const choose = (n: string) => {
    setProc(n);
    const d = procs?.find((x) => x.name === n);
    if (d) setParams(d.params.map((x) => ({ name: x.name, from: 'value', value: '' })));
    if (!name) setName(slug(n.split('.').pop() || n));
  };
  const preview = () => run('Esecuzione della procedura…', async () => setPrev(await call<Preview>('db:procPreview', p, conn, proc, params)));
  const ok = () => run('Creazione…', async () => {
    const n = slug(name);
    if (!n) throw new Error('Indica un nome');
    if (!proc) throw new Error('Scegli la procedura');
    onCreated(await call<Project>('wizard:procedure', p, conn, n, proc, params), n);
    onClose();
  });
  const driver = p.connections.find((c) => c.id === conn)?.driver;
  return (
    <Modal wide title="Nuova origine da stored procedure" onClose={onClose}
      footer={<><Btn icon="play" onClick={preview} disabled={!proc}>Anteprima risultati</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok}>Crea</Btn></>}>
      {!sqlConns.length ? <p className="help"><I n="exclamation-triangle" /> Serve una connessione MariaDB/MySQL, SQL Server, PostgreSQL o Oracle.</p> : <>
        <div className="inline">
          <Row label="Connessione"><Select value={conn} options={sqlConns.map((c) => [c.id, c.name] as [string, string])} onChange={setConn} /></Row>
          <Row label="Nome"><Text value={name} onChange={setName} placeholder="vendite_per_area" mono /></Row>
        </div>
        <Row label={driver === 'pgsql' ? 'Funzione (restituisce una tabella)' : driver === 'oracle' ? 'Funzione pipelined' : 'Procedura'}
          hint={err ? `Elenco non disponibile: ${err}` : procs && !procs.length ? 'Nessuna procedura nel database: scrivi il nome' : undefined}>
          <span className="inline">
            {procs && procs.length > 0 && <Select value={procs.some((x) => x.name === proc) ? proc : ''} options={[['', '— scegli —'] as [string, string], ...procs.map((x) => [x.name, `${x.name}(${x.params.map((y) => y.name).join(', ')})`] as [string, string])]} onChange={choose} />}
            <Text value={proc} onChange={setProc} mono placeholder="nome_procedura" />
          </span></Row>
        <Row label="Parametri" wide><ProcParams value={params} onChange={setParams} /></Row>
        <p className="help">Come le origini stored procedure di phpr: la procedura viene eseguita a ogni pagina e il suo primo risultato diventa l'elenco dei record; ricerca, filtri, ordinamento, totali, report e grafici lavorano su quel risultato (in sola lettura).</p>
        {prev && <PreviewGrid prev={prev} />}
      </>}
    </Modal>
  );
}
