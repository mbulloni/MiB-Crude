import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, toast, update, useStore } from '../store';
import type { Project } from '../types';
import CodeEditor from './CodeEditor';
import { Btn, Check, Empty, I, Modal, Row, Section, Select, Text, lbl, slug } from './ui';

function SqlViewDialog({ onClose }: { onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [name, setName] = useState('');
  const [conn, setConn] = useState(p.project.defaultConnection);
  const [sql, setSql] = useState('SELECT\n  \nFROM ');
  const [prev, setPrev] = useState<{ columns: string[]; rows: any[]; total: number } | null>(null);
  const preview = () => run('Esecuzione…', async () => setPrev(await call('db:preview', p, conn, sql, 50)));
  const ok = () => run('Creazione…', async () => {
    const n = slug(name);
    if (!n) throw new Error('Indica un nome');
    const next = await call<Project>('wizard:sqlview', p, conn, n, sql);
    useStore.getState().set({ proj: { ...next, dir: p.dir }, dirty: true, nav: { kind: 'table', id: n } });
    onClose();
  });
  return (
    <Modal wide title="Nuova query SQL (origine dati personalizzata)" onClose={onClose}
      footer={<><Btn icon="play" onClick={preview}>Anteprima risultati</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok}>Crea</Btn></>}>
      <div className="inline"><Row label="Nome"><Text value={name} onChange={setName} placeholder="ordini_per_cliente" mono /></Row>
        <Row label="Connessione"><Select value={conn} options={p.connections.map((c) => [c.id, c.name] as [string, string])} onChange={setConn} /></Row></div>
      <CodeEditor language="sql" value={sql} onChange={setSql} height={220} />
      <p className="help">Come le "SQL view" di phpr: lista, ricerca, filtri, report e grafici funzionano sul risultato. È in sola lettura salvo indicare una tabella di aggiornamento nella scheda Generale.</p>
      {prev && <div className="preview-grid"><table className="grid"><thead><tr>{prev.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{prev.rows.map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c}>{r[c] == null ? <i className="null">NULL</i> : String(r[c])}</td>)}</tr>)}</tbody></table>
        <small className="hint">{prev.total} righe</small></div>}
    </Modal>
  );
}

export default function TablesPanel() {
  const p = useStore((s) => s.proj)!;
  const [conn, setConn] = useState(p.project.defaultConnection);
  const [db, setDb] = useState<{ name: string; type: string }[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [sqlDlg, setSqlDlg] = useState(false);
  const load = () => run('Lettura tabelle…', async () => { setDb(await call('db:tables', p, conn)); setSel(new Set()); });
  useEffect(() => { if (p.connections.some((c) => c.id === conn)) load(); }, [conn]);
  const have = new Set(p.tables.filter((t) => t.connection === conn).map((t) => t.source.table || t.name));
  const avail = (db || []).filter((t) => !have.has(t.name) && !t.name.startsWith(p.project.systemPrefix || 'mc_') && t.name.toLowerCase().includes(filter.toLowerCase()));
  const doImport = () => run('Importazione…', async () => {
    const r = await call<{ proj: Project; added: string[] }>('wizard:import', p, conn, [...sel]);
    useStore.getState().set({ proj: { ...r.proj, dir: p.dir }, dirty: true });
    toast(`${r.added.length} tabelle aggiunte: lookup e master-dettaglio ricavati dalle chiavi esterne`, 'ok');
    setSel(new Set());
  });
  const remove = (name: string) => {
    if (!confirm(`Togliere "${name}" dal progetto? Le impostazioni e gli eventi della tabella andranno persi (il database non viene toccato).`)) return;
    update((d) => {
      d.tables = d.tables.filter((t) => t.name !== name);
      delete d.events[name];
      for (const t of d.tables) t.details = t.details.filter((x) => x.table !== name);
      const strip = (items: any[]): any[] => items.filter((i) => !(i.type === 'table' && i.table === name)).map((i) => (i.items ? { ...i, items: strip(i.items) } : i));
      d.menu.items = strip(d.menu.items);
    });
  };
  if (!p.connections.length) return <div className="panel"><Empty icon="database-add" title="Prima aggiungi una connessione"><Btn kind="primary" onClick={() => useStore.getState().set({ nav: { kind: 'connections' } })}>Connessioni</Btn></Empty></div>;
  return (
    <div className="panel">
      <h2>Tabelle e query</h2>
      <div className="cols">
        <Section title="Dal database" actions={<><Select value={conn} options={p.connections.map((c) => [c.id, c.name] as [string, string])} onChange={setConn} /><Btn small icon="arrow-clockwise" onClick={load} /></>}
          help="Seleziona tabelle e viste da gestire nell'applicazione. Le chiavi esterne diventano menu a tendina e relazioni master-dettaglio.">
          <input className="inp" placeholder="Filtra…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="checklist">
            {avail.length > 1 && <Check label={<b>Seleziona tutte ({avail.length})</b>} value={avail.every((t) => sel.has(t.name))} onChange={(v) => setSel(new Set(v ? avail.map((t) => t.name) : []))} />}
            {avail.map((t) => <Check key={t.name} label={<><I n={t.type === 'view' ? 'eye' : 'table'} /> {t.name}</>} value={sel.has(t.name)} onChange={(v) => { const n = new Set(sel); v ? n.add(t.name) : n.delete(t.name); setSel(n); }} />)}
            {db && !avail.length && <p className="help">Tutte le tabelle sono già nel progetto.</p>}
          </div>
          <Btn kind="primary" icon="box-arrow-in-right" disabled={!sel.size} onClick={doImport}>Aggiungi {sel.size || ''} al progetto</Btn>
        </Section>
        <Section title="Nel progetto" actions={<Btn icon="code-square" onClick={() => setSqlDlg(true)}>Nuova query SQL</Btn>}>
          {!p.tables.length ? <p className="help">Nessuna tabella ancora.</p> :
            <table className="grid"><thead><tr><th>Nome</th><th>Etichetta</th><th>Tipo</th><th>Campi</th><th>Dettagli</th><th /></tr></thead><tbody>
              {p.tables.map((t) => <tr key={t.name}>
                <td className="mono"><a onClick={() => useStore.getState().set({ nav: { kind: 'table', id: t.name } })}>{t.name}</a></td><td>{lbl(t.caption)}</td>
                <td>{t.source.type === 'sql' ? 'Query SQL' : t.readOnly ? 'Vista' : 'Tabella'}{p.connections.length > 1 ? ` · ${t.connection}` : ''}</td>
                <td>{t.fields.length}</td><td>{t.details.map((d) => d.table).join(', ')}</td>
                <td className="actions">
                  <Btn small icon="arrow-repeat" title="Aggiorna dalla struttura del database" onClick={() => run('Aggiornamento…', async () => {
                    const r = await call('wizard:refresh', p, t.name);
                    useStore.getState().set({ proj: { ...r.proj, dir: p.dir }, dirty: true });
                    toast(r.added.length || r.removed.length ? `Campi aggiunti: ${r.added.join(', ') || '—'} · rimossi: ${r.removed.join(', ') || '—'}` : 'Nessuna differenza', 'ok');
                  })} />
                  <Btn small icon="trash" kind="ghost" onClick={() => remove(t.name)} /></td>
              </tr>)}
            </tbody></table>}
        </Section>
      </div>
      {sqlDlg && <SqlViewDialog onClose={() => setSqlDlg(false)} />}
    </div>
  );
}
