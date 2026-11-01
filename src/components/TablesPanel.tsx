// "Tables and queries": the equivalent of the classic Datasource tables screen.
// Left: connections > database tables (checkbox = in project) > custom views, SQL queries, reports, charts.
// Right: diagram of the project tables with master/detail relations. Context menu on every item.
import { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../api';
import { replaceProject, run, toast, update, useStore } from '../store';
import type { Project, RestPaging, Table } from '../types';
import CodeEditor from './CodeEditor';
import PhprMergeDialog from './PhprMerge';
import { Btn, Check, Empty, Hero, I, Modal, Row, Select, Text, ask, lbl, slug } from './ui';
import { ConnectionDialog } from './ConnectionsPanel';
import RestPagingFields, { RestSourceOptions } from './RestPaging';
import { ProcDialog } from './ProcSection';
import DataDialog, { type DataSource } from './DataDialog';

type DbTable = { name: string; type: string };
type Col = { name: string; type: string; size: number | string; scale: number | string; pk: boolean; autoInc: boolean; nullable: boolean; default: string; orig?: string | null };
type Menu = { x: number; y: number; items: ([string, string, () => void] | '-')[] } | null;

const DDL_TYPES: [string, string][] = [['int', 'INT'], ['bigint', 'BIGINT'], ['decimal', 'DECIMAL'], ['float', 'FLOAT'], ['varchar', 'VARCHAR'], ['text', 'TEXT'], ['date', 'DATE'], ['datetime', 'DATETIME'], ['time', 'TIME'], ['bool', 'BOOLEAN'], ['blob', 'BLOB']];
const baseOf = (t: Table) => (t.source.type === 'table' ? t.source.table : t.source.updateTable) || '';
const setProj = (p: Project, dir: string) => replaceProject({ ...p, dir });

// --- dialogs -------------------------------------------------------------------------

function SqlViewDialog({ onClose, conn: conn0 }: { onClose: () => void; conn: string }) {
  const p = useStore((s) => s.proj)!;
  const [name, setName] = useState('');
  const [conn, setConn] = useState(conn0);
  const [sql, setSql] = useState('SELECT\n  \nFROM ');
  const [prev, setPrev] = useState<{ columns: string[]; rows: any[]; total: number } | null>(null);
  const preview = () => run('Esecuzione…', async () => setPrev(await call('db:preview', p, conn, sql, 50)));
  const ok = () => run('Creazione…', async () => {
    const n = slug(name);
    if (!n) throw new Error('Indica un nome');
    setProj(await call<Project>('wizard:sqlview', p, conn, n, sql), p.dir);
    useStore.getState().set({ nav: { kind: 'table', id: n } });
    onClose();
  });
  return (
    <Modal wide title="Nuova query SQL" onClose={onClose}
      footer={<><Btn icon="play" onClick={preview}>Anteprima risultati</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok}>Crea</Btn></>}>
      <div className="inline"><Row label="Nome"><Text value={name} onChange={setName} placeholder="ordini_per_cliente" mono /></Row>
        <Row label="Connessione"><Select value={conn} options={p.connections.map((c) => [c.id, c.name] as [string, string])} onChange={setConn} /></Row></div>
      <CodeEditor language="sql" value={sql} onChange={setSql} height={220} />
      <p className="help">Come le classiche viste SQL: lista, ricerca, filtri, report e grafici lavorano sul risultato. Diventa modificabile indicando la tabella base in Impostazioni avanzate.</p>
      {prev && <div className="preview-grid"><table className="grid"><thead><tr>{prev.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{prev.rows.map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c}>{r[c] == null ? <i className="null">NULL</i> : String(r[c])}</td>)}</tr>)}</tbody></table>
        <small className="hint">{prev.total} righe</small></div>}
    </Modal>
  );
}

/** Create a table or modify the structure of an existing one. */
function StructureDialog({ conn, table, onClose, onDone }: { conn: string; table: string | null; onClose: () => void; onDone: (name: string, created: boolean, addToProject: boolean) => void }) {
  const p = useStore((s) => s.proj)!;
  const driver = p.connections.find((c) => c.id === conn)?.driver || 'mysql';
  const [name, setName] = useState(table || '');
  const [cols, setCols] = useState<Col[]>(table ? [] : [{ name: 'id', type: 'int', size: '', scale: '', pk: true, autoInc: true, nullable: false, default: '', orig: null }]);
  const [before, setBefore] = useState<Col[]>([]);
  const [sql, setSql] = useState<string[] | null>(null);
  const [add, setAdd] = useState(true);
  useEffect(() => { if (table) run('Lettura struttura…', async () => { const c = await call<Col[]>('db:columns', p, conn, table); setCols(c); setBefore(c); }); }, [table]);
  const setCol = (i: number, patch: Partial<Col>) => setCols(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const build = async () => (table ? call<string[]>('ddl:build', 'alter', driver, table, before, cols) : call<string[]>('ddl:build', 'create', driver, name, cols));
  const apply = () => run('Applicazione al database…', async () => {
    const st = await build();
    if (!st.length) { toast('Nessuna modifica', 'info'); return; }
    if (table && !confirm(`Eseguire ${st.length} istruzioni su ${table}?\n\n${st.join(';\n')}`)) return;
    await call('db:exec', p, conn, st);
    toast(table ? `Struttura di ${table} aggiornata` : `Tabella ${name} creata`, 'ok');
    onDone(table || name, !table, add);
    onClose();
  });
  return (
    <Modal wide title={table ? `Struttura di ${table}` : 'Crea tabella'} onClose={onClose} footer={<>
      <Btn icon="code" onClick={() => run('SQL…', async () => setSql(await build()))}>Mostra SQL</Btn>
      {!table && <Check label="Aggiungi al progetto" value={add} onChange={setAdd} />}
      <span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={apply}>{table ? 'Applica modifiche' : 'Crea tabella'}</Btn></>}>
      {!table && <Row label="Nome tabella"><Text value={name} onChange={(v) => setName(v.replace(/[^A-Za-z0-9_]/g, '_'))} mono /></Row>}
      <table className="grid"><thead><tr><th>Campo</th><th>Tipo</th><th>Dimensione</th><th>Decimali</th><th className="c">Chiave</th><th className="c">Auto</th><th className="c">Null</th><th>Predefinito</th><th /></tr></thead>
        <tbody>{cols.map((c, i) => <tr key={i}>
          <td><input className="inp mono" value={c.name} onChange={(e) => setCol(i, { name: e.target.value })} /></td>
          <td><Select value={c.type} options={DDL_TYPES} onChange={(v) => setCol(i, { type: v })} /></td>
          <td><input className="inp num" value={c.size} disabled={!['varchar', 'decimal'].includes(c.type)} onChange={(e) => setCol(i, { size: e.target.value })} /></td>
          <td><input className="inp num" value={c.scale} disabled={c.type !== 'decimal'} onChange={(e) => setCol(i, { scale: e.target.value })} /></td>
          <td className="c"><input type="checkbox" checked={c.pk} onChange={(e) => setCol(i, { pk: e.target.checked, nullable: e.target.checked ? false : c.nullable })} /></td>
          <td className="c"><input type="checkbox" checked={c.autoInc} disabled={!['int', 'bigint'].includes(c.type)} onChange={(e) => setCol(i, { autoInc: e.target.checked })} /></td>
          <td className="c"><input type="checkbox" checked={c.nullable} disabled={c.pk} onChange={(e) => setCol(i, { nullable: e.target.checked })} /></td>
          <td><input className="inp" value={c.default} onChange={(e) => setCol(i, { default: e.target.value })} /></td>
          <td><Btn small kind="ghost" icon="x-lg" onClick={() => setCols(cols.filter((_, j) => j !== i))} /></td>
        </tr>)}</tbody></table>
      <Btn small icon="plus-lg" onClick={() => setCols([...cols, { name: `campo${cols.length + 1}`, type: 'varchar', size: 255, scale: '', pk: false, autoInc: false, nullable: true, default: '', orig: null }])}>Aggiungi campo</Btn>
      {sql && <pre className="log">{sql.join(';\n') + (sql.length ? ';' : '-- nessuna modifica')}</pre>}
    </Modal>
  );
}

function AdvancedDialog({ t, onClose }: { t: Table; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [base, setBase] = useState(baseOf(t));
  const [prefix, setPrefix] = useState((t as any).phprShort || t.name);
  const [urls, setUrls] = useState(!!p.project.settings.classicUrls);
  const ok = () => {
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      if (x.source.type === 'table') x.source.table = base; else { x.source.updateTable = base; x.readOnly = !base; }
      (x as any).phprShort = prefix;
      d.project.settings.classicUrls = urls;
    });
    onClose();
  };
  return (
    <Modal title={`Impostazioni avanzate — ${t.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" onClick={ok}>OK</Btn></>}>
      <Row label="Tabella base" hint="Dove vengono aggiunti, modificati ed eliminati i dati (per viste personalizzate e query SQL)"><Text value={base} onChange={setBase} mono /></Row>
      <Row label="Prefisso nomi file" hint={`Usato per gli URL classici: ${String(prefix).toLowerCase().replace(/[^a-z0-9_]/g, '_')}_list.php`}><Text value={prefix} onChange={setPrefix} mono /></Row>
      <Row label="URL classici"><Check value={urls} onChange={setUrls} label="Genera tabella_list.php, tabella_edit.php?editid1=… (per tutto il progetto)" /></Row>
    </Modal>
  );
}

function RelationDialog({ onClose, master: m0 }: { onClose: () => void; master?: string }) {
  const p = useStore((s) => s.proj)!;
  const [master, setMaster] = useState(m0 || p.tables[0]?.name || '');
  const [detail, setDetail] = useState(p.tables.find((t) => t.name !== master)?.name || '');
  const [mk, setMk] = useState('');
  const [dk, setDk] = useState('');
  const fieldsOf = (n: string) => (p.tables.find((t) => t.name === n)?.fields || []).map((f) => [f.name, f.name] as [string, string]);
  const ok = () => {
    if (!master || !detail || !mk || !dk) return toast('Completa tutti i campi', 'err');
    update((d) => { d.tables.find((t) => t.name === master)!.details.push({ table: detail, masterKeys: [mk], detailKeys: [dk], showIn: ['list', 'view', 'edit'] }); });
    onClose();
  };
  return (
    <Modal title="Nuova relazione master-dettaglio" onClose={onClose} footer={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" onClick={ok}>Crea</Btn></>}>
      <Row label="Tabella master"><Select value={master} options={p.tables.map((t) => [t.name, t.name] as [string, string])} onChange={setMaster} /></Row>
      <Row label="Campo master"><Select value={mk} options={[['', '—'], ...fieldsOf(master)]} onChange={setMk} /></Row>
      <Row label="Tabella dettaglio"><Select value={detail} options={p.tables.filter((t) => t.name !== master).map((t) => [t.name, t.name] as [string, string])} onChange={setDetail} /></Row>
      <Row label="Campo dettaglio"><Select value={dk} options={[['', '—'], ...fieldsOf(detail)]} onChange={setDk} /></Row>
    </Modal>
  );
}

function ScriptDialog({ onClose, conn }: { onClose: () => void; conn: string }) {
  const p = useStore((s) => s.proj)!;
  const tables = [...new Set(p.tables.filter((t) => t.connection === conn).map(baseOf).filter(Boolean))];
  const [sel, setSel] = useState<Set<string>>(new Set(tables));
  const [dialect, setDialect] = useState(p.connections.find((c) => c.id === conn)?.driver || 'mysql');
  const [data, setData] = useState(false);
  const [limit, setLimit] = useState(1000);
  const ok = () => run('Generazione script…', async () => {
    const text = await call<string>('ddl:script', p, conn, [...sel], dialect, data, limit);
    const f = await call<string | null>('file:save', 'Salva script SQL', `${p.project.name}_${dialect}.sql`, text);
    if (f) { toast(`Script salvato: ${f}`, 'ok'); onClose(); }
  });
  return (
    <Modal title="Crea script SQL" onClose={onClose} footer={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="file-earmark-code" onClick={ok}>Genera e salva</Btn></>}>
      <p className="help">Script per ricreare tabelle (e dati) su un altro server, anche di tipo diverso.</p>
      <Row label="Database di destinazione"><Select value={dialect} options={[['mysql', 'MariaDB / MySQL'], ['pgsql', 'PostgreSQL'], ['sqlsrv', 'SQL Server'], ['oracle', 'Oracle'], ['sqlite', 'SQLite']]} onChange={(v) => setDialect(v as any)} /></Row>
      <Row label="Dati"><span className="inline"><Check label="Includi i dati, righe max" value={data} onChange={setData} /><input className="inp num" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></span></Row>
      <div className="checklist">{tables.map((t) => <Check key={t} label={t} value={sel.has(t)} onChange={(v) => { const n = new Set(sel); v ? n.add(t) : n.delete(t); setSel(n); }} />)}</div>
    </Modal>
  );
}

// --- REST datasource: a JSON API resource used like a table --------------------------------

function RestDialog({ onClose, conn: conn0 }: { onClose: () => void; conn: string }) {
  const p = useStore((s) => s.proj)!;
  const rest = p.connections.filter((c) => c.driver === 'rest');
  const [conn, setConn] = useState(rest.some((c) => c.id === conn0) ? conn0 : rest[0]?.id || '');
  const [o, setO] = useState<{ name: string; path: string; dataPath: string; key: string; itemPath: string; updateMethod: string; readOnly: boolean; paging?: RestPaging; filterMode?: '' | 'equals' | 'json-server' | 'strapi' | 'custom'; filterOps?: Record<string, string>; cacheSeconds?: number }>({ name: '', path: '', dataPath: '', key: '', itemPath: '', updateMethod: 'PUT', readOnly: false });
  const [prev, setPrev] = useState<{ dataPath: string; rows: any[]; columns: { name: string }[]; total: number } | null>(null);
  const s = (patch: Partial<typeof o>) => setO({ ...o, ...patch });
  const preview = () => run('Lettura dal servizio…', async () => {
    const r = await call('rest:sample', p, conn, o.path, o.dataPath);
    setPrev(r);
    setO((x) => ({ ...x, dataPath: r.dataPath, key: x.key || (r.columns.find((c: any) => c.name === 'id') ? 'id' : ''), name: x.name || slug(x.path.split('?')[0].split('/').filter(Boolean).pop() || 'risorsa') }));
  });
  const ok = () => run('Creazione…', async () => {
    if (!o.name || !o.path) throw new Error('Indica nome e percorso');
    setProj(await call<Project>('rest:add', p, conn, o), p.dir);
    toast(`Origine REST "${o.name}" aggiunta`, 'ok');
    onClose();
  });
  const cols = prev?.columns.map((c) => c.name) || [];
  return (
    <Modal wide title="Nuova origine dati REST" onClose={onClose}
      footer={<><Btn icon="play" onClick={preview} disabled={!o.path}>Leggi e mostra i campi</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok} disabled={!prev}>Crea</Btn></>}>
      <p className="help">Una risorsa di un'API JSON diventa una tabella dell'applicazione: lista con ricerca, filtri, ordinamento e totali (eseguiti dall'app o, con la paginazione, dall'API), lookup, report e grafici, visualizza, modifica ed eliminazione tramite l'API.</p>
      <Row label="Connessione"><Select value={conn} options={rest.map((c) => [c.id, `${c.name} — ${c.url}`])} onChange={setConn} /></Row>
      <Row label="Percorso elenco" hint="GET che restituisce i record, es. /users o /orders?status=open"><Text value={o.path} onChange={(v) => s({ path: v })} mono /></Row>
      <Row label="Percorso dei dati" hint="Dove si trova l'elenco nella risposta JSON (es. data, result.items); vuoto = rilevato automaticamente"><Text value={o.dataPath} onChange={(v) => s({ dataPath: v })} mono /></Row>
      <Row label="Nome"><Text value={o.name} onChange={(v) => s({ name: slug(v) })} mono /></Row>
      <Row label="Campo chiave"><Select value={o.key} options={[['', '(nessuno: sola lettura)'], ...cols.map((c) => [c, c] as [string, string])]} onChange={(v) => s({ key: v })} /></Row>
      <Row label="Percorso record" hint="Per visualizza/modifica/elimina; {campo} = valore della chiave. Vuoto = percorso elenco/{chiave}"><Text value={o.itemPath} onChange={(v) => s({ itemPath: v })} mono placeholder={o.key ? `${o.path.split('?')[0].replace(/\/$/, '')}/{${o.key}}` : ''} /></Row>
      <Row label="Modifica con"><span className="inline"><Select value={o.updateMethod} options={[['PUT', 'PUT (record completo)'], ['PATCH', 'PATCH (solo campi cambiati)']]} onChange={(v) => s({ updateMethod: v })} />
        <Check label="Sola lettura" value={o.readOnly} onChange={(v) => s({ readOnly: v })} /></span></Row>
      <RestPagingFields value={o.paging} onChange={(v) => s({ paging: v })} />
      <RestSourceOptions filterMode={o.filterMode} filterOps={o.filterOps} cacheSeconds={o.cacheSeconds} onChange={(patch) => s(patch)} />
      {prev && <><p className="help">{prev.total} record letti, {cols.length} campi{prev.dataPath ? ` (dati in "${prev.dataPath}")` : ''}.</p>
        <div className="preview-table"><table className="grid"><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{prev.rows.slice(0, 10).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table></div></>}
    </Modal>
  );
}

// --- business templates: create tables + configured pages in one click -------------------

interface Tpl { id: string; icon: string; name: Record<string, string>; description: Record<string, string>; tables: string[] }

function TemplateDialog({ onClose, conn: conn0 }: { onClose: () => void; conn: string }) {
  const p = useStore((s) => s.proj)!;
  const [list, setList] = useState<Tpl[]>([]);
  const [sel, setSel] = useState('');
  const [conn, setConn] = useState(conn0);
  const [sample, setSample] = useState(true);
  useEffect(() => { call<Tpl[]>('templates:list').then((l) => { setList(l); setSel(l[0]?.id || ''); }); }, []);
  const ok = () => run('Creazione dal modello…', async () => {
    const r = await call<{ proj: Project; created: string[]; tables: string[] }>('templates:apply', p, conn, sel, { sample });
    setProj(r.proj, p.dir);
    toast(`Modello applicato: ${r.created.length} tabelle create nel database, ${r.tables.length} configurate nel progetto`, 'ok');
    onClose();
  });
  const cur = list.find((t) => t.id === sel);
  return (
    <Modal title="Nuove tabelle da modello" onClose={onClose} footer={<><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="magic" onClick={ok} disabled={!sel}>Crea</Btn></>}>
      <p className="help">Crea nel database le tabelle di un'applicazione gestionale pronta (con dati di esempio) e configura pagine, viste, menu, grafici ed eventi. Le tabelle già presenti non vengono toccate.</p>
      <div className="tpl-grid">{list.map((t) => <button type="button" key={t.id} className={`tpl-card ${sel === t.id ? 'on' : ''}`} onClick={() => setSel(t.id)}>
        <I n={t.icon} className="big" /><b>{lbl(t.name)}</b><small>{lbl(t.description)}</small></button>)}</div>
      {cur && <p className="help">Tabelle: {cur.tables.join(', ')}</p>}
      <Row label="Connessione"><Select value={conn} options={p.connections.map((c) => [c.id, c.name])} onChange={setConn} /></Row>
      <Row label=""><Check label="Inserisci dati di esempio" value={sample} onChange={setSample} /></Row>
    </Modal>
  );
}

// --- export / import of tables between projects ---------------------------------------------

function exportBundle(p: Project, names: string[]) {
  const tables = p.tables.filter((t) => names.includes(t.name));
  // related tables that the exported ones need: details and lookups
  const related = new Set<string>();
  for (const t of tables) {
    for (const d of t.details) related.add(d.table);
    for (const f of t.fields) if (f.editAs.lookup?.kind === 'table' && f.editAs.lookup.table) related.add(f.editAs.lookup.table);
  }
  for (const n of names) related.delete(n);
  const conns = new Set(tables.map((t) => t.connection));
  return {
    bundle: {
      format: 'mibcrude-tables', version: 1, from: p.project.name, exportedAt: new Date().toISOString(),
      tables, events: Object.fromEntries(names.filter((n) => p.events[n]).map((n) => [n, p.events[n]])),
      reports: p.reports.filter((r) => names.includes(r.table)), charts: p.charts.filter((c) => names.includes(c.table)),
      connections: p.connections.filter((c) => conns.has(c.id)),
    },
    related: [...related].filter((r) => p.tables.some((t) => t.name === r)),
  };
}

function importBundle(b: any) {
  if (b?.format !== 'mibcrude-tables') throw new Error('File non valido: atteso un export di tabelle MiB-Crude');
  let added = 0;
  update((d) => {
    for (const c of b.connections || []) if (!d.connections.some((x) => x.id === c.id)) d.connections.push(c);
    const rename: Record<string, string> = {};
    for (const t of b.tables as Table[]) {
      let name = t.name;
      if (d.tables.some((x) => x.name === name)) {
        if (confirm(`La tabella "${name}" esiste già nel progetto.\nOK = sostituiscila, Annulla = importala con un nuovo nome.`)) d.tables = d.tables.filter((x) => x.name !== name);
        else { let i = 2; while (d.tables.some((x) => x.name === `${t.name}_${i}`)) i++; name = `${t.name}_${i}`; }
      }
      rename[t.name] = name;
      d.tables.push({ ...t, name });
      if (b.events?.[t.name]) d.events[name] = b.events[t.name];
      added++;
    }
    for (const r of b.reports || []) if (!d.reports.some((x) => x.name === r.name)) d.reports.push({ ...r, table: rename[r.table] || r.table });
    for (const c of b.charts || []) if (!d.charts.some((x) => x.name === c.name)) d.charts.push({ ...c, table: rename[c.table] || c.table });
  });
  return added;
}

// --- diagram ----------------------------------------------------------------------------------

function Diagram({ selected, onSelect, expanded, onOpen, onMenu }: { selected: string; onSelect: (n: string) => void; expanded: Set<string>; onOpen: (n: string) => void; onMenu: (e: React.MouseEvent, t: Table) => void }) {
  const p = useStore((s) => s.proj)!;
  const drag = useRef<{ name: string; dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const W = 200;
  const at = (t: Table, i: number) => pos[t.name] || (t as any).diagram || { x: 20 + (i % 4) * (W + 40), y: 20 + Math.floor(i / 4) * 230 };
  const boxH = (t: Table) => 30 + (expanded.has(t.name) ? Math.min(t.fields.length, 14) * 18 + (t.fields.length > 14 ? 18 : 0) : 0);
  const tables = p.tables;
  const idx = Object.fromEntries(tables.map((t, i) => [t.name, i]));
  const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (const t of tables) for (const d of t.details) {
    const dt = tables.find((x) => x.name === d.table);
    if (!dt) continue;
    const a = at(t, idx[t.name]);
    const b = at(dt, idx[dt.name]);
    // Leave from the side facing the detail box.
    const right = b.x >= a.x + W / 2;
    lines.push({ x1: right ? a.x + W : a.x, y1: a.y + 15, x2: right ? b.x : b.x + W, y2: b.y + 15, key: `${t.name}>${d.table}`, dir: right ? 1 : -1 } as any);
  }
  const maxX = Math.max(800, ...tables.map((t, i) => at(t, i).x + W + 40));
  const maxY = Math.max(500, ...tables.map((t, i) => at(t, i).y + boxH(t) + 40));
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sc = (e.currentTarget as HTMLElement).scrollLeft;
    const st = (e.currentTarget as HTMLElement).scrollTop;
    setPos({ ...pos, [d.name]: { x: Math.max(0, e.clientX - r.left + sc - d.dx), y: Math.max(0, e.clientY - r.top + st - d.dy) } });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && pos[d.name]) update((pr) => { const t = pr.tables.find((x) => x.name === d.name); if (t) (t as any).diagram = pos[d.name]; });
  };
  return (
    <div className="diagram" onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
      <svg width={maxX} height={maxY} className="diagram-lines">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
        {lines.map((l: any) => <path key={l.key} d={`M${l.x1},${l.y1} C${l.x1 + 60 * l.dir},${l.y1} ${l.x2 - 60 * l.dir},${l.y2} ${l.x2},${l.y2}`} markerEnd="url(#arr)" />)}
      </svg>
      {tables.map((t, i) => {
        const a = at(t, i);
        return (
          <div key={t.name} className={`dg-box ${selected === t.name ? 'on' : ''} ${t.source.type === 'sql' ? 'sql' : ''}`} style={{ left: a.x, top: a.y, width: W }}
            onMouseDown={(e) => { onSelect(t.name); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); drag.current = { name: t.name, dx: e.clientX - r.left, dy: e.clientY - r.top }; }}
            onDoubleClick={() => onOpen(t.name)} onContextMenu={(e) => onMenu(e, t)}>
            <div className="dg-head"><I n={t.source.type === 'sql' ? 'code-square' : 'table'} /> <span className="grow">{t.name}</span></div>
            {expanded.has(t.name) && <div className="dg-fields">{t.fields.slice(0, 14).map((f) => <div key={f.name}>{f.pk ? <I n="key-fill" className="accent" /> : <span className="dg-dot" />} {f.name} <small className="muted">{f.type}</small></div>)}
              {t.fields.length > 14 && <div className="muted">… altri {t.fields.length - 14}</div>}</div>}
          </div>
        );
      })}
    </div>
  );
}

// --- main panel ----------------------------------------------------------------------------------

export default function TablesPanel() {
  const p = useStore((s) => s.proj)!;
  const [dbt, setDbt] = useState<Record<string, DbTable[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set(p.connections.map((c) => c.id)));
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Menu>(null);
  const [merging, setMerging] = useState(false);
  const [dlg, setDlg] = useState<null | { kind: 'sql' | 'proc' | 'data' | 'structure' | 'advanced' | 'relation' | 'script' | 'conn' | 'template' | 'rest'; conn?: string; table?: string | null; t?: Table; src?: DataSource }>(null);

  const load = (connId: string) => call<DbTable[]>('db:tables', p, connId).then((r) => setDbt((x) => ({ ...x, [connId]: r }))).catch((e) => toast(`${connId}: ${e.message}`, 'err'));
  useEffect(() => { p.connections.forEach((c) => load(c.id)); }, [p.connections.length]);
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, []);

  const goTable = (name: string) => useStore.getState().set({ nav: { kind: 'table', id: name } });
  const addToProject = (connId: string, names: string[]) => run('Aggiunta al progetto…', async () => {
    const r = await call<{ proj: Project; added: string[] }>('wizard:import', p, connId, names);
    setProj(r.proj, p.dir);
    toast(`${r.added.length} aggiunte: lookup e master-dettaglio dalle chiavi esterne`, 'ok');
  });
  const removeFromProject = (name: string) => {
    if (!confirm(`Togliere "${name}" dal progetto? Impostazioni ed eventi della tabella andranno persi (il database non viene toccato).`)) return;
    update((d) => {
      d.tables = d.tables.filter((t) => t.name !== name);
      delete d.events[name];
      for (const t of d.tables) t.details = t.details.filter((x) => x.table !== name);
      const strip = (items: any[]): any[] => items.filter((i) => !(i.type === 'table' && i.table === name)).map((i) => (i.items ? { ...i, items: strip(i.items) } : i));
      d.menu.items = strip(d.menu.items);
    });
  };
  const dropTable = (connId: string, name: string) => run('Eliminazione…', async () => {
    if (!confirm(`ATTENZIONE: eliminare definitivamente la tabella "${name}" e tutti i suoi dati dal database ${connId}?`)) return;
    const st = await call<string[]>('ddl:build', 'drop', p.connections.find((c) => c.id === connId)!.driver, name);
    await call('db:exec', p, connId, st);
    if (p.tables.some((t) => t.name === name)) update((d) => { d.tables = d.tables.filter((t) => t.name !== name); });
    load(connId);
    toast(`Tabella ${name} eliminata`, 'ok');
  });
  const sync = () => run('Sincronizzazione con il database…', async () => {
    let cur = useStore.getState().proj!;
    const changes: string[] = [];
    for (const t of cur.tables) {
      try {
        const r = await call('wizard:refresh', cur, t.name);
        cur = { ...r.proj, dir: p.dir };
        if (r.added.length || r.removed.length) changes.push(`${t.name}: +${r.added.join(', ') || '—'} −${r.removed.join(', ') || '—'}`);
      } catch (e: any) { changes.push(`${t.name}: ${e.message}`); }
    }
    setProj(cur, p.dir);
    p.connections.forEach((c) => load(c.id));
    toast(changes.length ? `Differenze:\n${changes.slice(0, 12).join('\n')}` : 'Progetto e database già allineati', 'ok', 8000);
  });
  const customView = async (t: Table) => {
    const name = await ask('Nome della vista personalizzata', `${t.name}_vista`);
    if (!name || p.tables.some((x) => x.name === name)) return;
    update((d) => {
      // A custom view copies all settings except events and layout (as in .phpr projects).
      const copy: Table = JSON.parse(JSON.stringify(d.tables.find((x) => x.name === t.name)));
      copy.name = name;
      copy.caption = Object.fromEntries(Object.keys(copy.caption).map((k) => [k, name]));
      delete (copy as any).layout;
      delete (copy as any).diagram;
      d.tables.push(copy);
    });
    goTable(name);
  };
  const newReport = (t: Table) => { update((d) => { d.reports.push({ name: slug(`report_${t.name}`), title: { [d.project.defaultLanguage]: `Report ${lbl(t.caption, t.name)}` }, table: t.name, groups: [], aggregates: [], columns: t.fields.slice(0, 5).map((f) => f.name), showDetails: true }); }); useStore.getState().set({ nav: { kind: 'reports' } }); };
  const newChart = (t: Table) => { update((d) => { d.charts.push({ name: slug(`grafico_${t.name}`), title: { [d.project.defaultLanguage]: `Grafico ${lbl(t.caption, t.name)}` }, table: t.name, type: 'bar', labelField: t.fields[1]?.name || t.fields[0]?.name, series: [] }); }); useStore.getState().set({ nav: { kind: 'charts' } }); };
  const doExport = (names: string[]) => run('Esportazione…', async () => {
    const { bundle, related } = exportBundle(p, names);
    if (related.length && confirm(`Le tabelle esportate usano anche: ${related.join(', ')}.\nIncluderle nell'export?`)) {
      const all = exportBundle(p, [...names, ...related]);
      Object.assign(bundle, all.bundle);
    }
    const f = await call<string | null>('tables:exportZip', `${p.project.name}_tabelle.zip`, bundle);
    if (f) toast(`${bundle.tables.length} tabelle esportate in ${f}`, 'ok');
  });
  const doImport = () => run('Importazione…', async () => {
    const b = await call('tables:importFile');
    if (!b) return;
    const n = importBundle(b);
    toast(`${n} tabelle importate`, 'ok');
  });

  const tableMenu = (e: React.MouseEvent, t: Table) => {
    e.preventDefault(); e.stopPropagation();
    const names = multi.size > 1 && multi.has(t.name) ? [...multi] : [t.name];
    const isView = t.source.type === 'sql' || baseOf(t) !== t.name;
    setMenu({ x: e.clientX, y: e.clientY, items: [
      ['gear', 'Apri impostazioni', () => goTable(t.name)],
      ['table', 'Visualizza dati', () => openData(t)],
      ...(t.source.type === 'table' ? [['pencil-square', 'Modifica struttura tabella', () => setDlg({ kind: 'structure', conn: t.connection, table: baseOf(t) })] as [string, string, () => void]] : []),
      ['window-stack', 'Crea vista personalizzata', () => customView(t)],
      ...(isView ? [['copy', 'Copia', () => customView(t)] as [string, string, () => void]] : []),
      ['sliders', 'Impostazioni avanzate', () => setDlg({ kind: 'advanced', t })],
      '-',
      ['file-earmark-bar-graph', 'Nuovo report', () => newReport(t)],
      ['bar-chart', 'Nuovo grafico', () => newChart(t)],
      ['diagram-3', 'Nuova relazione', () => setDlg({ kind: 'relation', table: t.name })],
      '-',
      ['box-arrow-up', names.length > 1 ? `Esporta ${names.length} tabelle` : 'Esporta tabella', () => doExport(names)],
      ['arrow-repeat', 'Sincronizza database', sync],
      '-',
      ['x-circle', 'Rimuovi dal progetto', () => removeFromProject(t.name)],
    ] });
  };
  // records of a project datasource or of a database table
  const openData = (t: Table | null, connId?: string, name?: string) => {
    if (!t) { setDlg({ kind: 'data', src: { conn: connId!, table: name, title: name! } }); return; }
    if (t.source.type === 'rest') { toast('Per le origini REST i dati si vedono nell\'anteprima dell\'applicazione', 'info'); return; }
    setDlg({ kind: 'data', src: { conn: t.connection, title: lbl(t.caption, t.name), ...(t.source.type === 'sql' ? { sql: t.source.sql } : t.source.type === 'proc' ? { procedure: t.source.procedure, params: t.source.params } : { table: t.source.table || t.name }) } });
  };
  const dbMenu = (e: React.MouseEvent, connId: string, name: string) => {
    e.preventDefault(); e.stopPropagation();
    const inProj = p.tables.find((t) => t.connection === connId && t.source.type === 'table' && t.source.table === name && t.name === name);
    if (inProj) return tableMenu(e, inProj);
    setMenu({ x: e.clientX, y: e.clientY, items: [
      ['table', 'Visualizza dati', () => openData(null, connId, name)],
      ['box-arrow-in-right', 'Aggiungi al progetto', () => addToProject(connId, [name])],
      ['pencil-square', 'Modifica struttura tabella', () => setDlg({ kind: 'structure', conn: connId, table: name })],
      '-',
      ['trash', 'Elimina tabella dal database', () => dropTable(connId, name)],
    ] });
  };
  const connMenu = (e: React.MouseEvent, connId: string) => {
    e.preventDefault(); e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items: [
      ['star', 'Rendi connessione principale', () => update((d) => { d.project.defaultConnection = connId; })],
      ['plus-square', 'Crea tabella', () => setDlg({ kind: 'structure', conn: connId, table: null })],
      ['code-square', 'Nuova query SQL', () => setDlg({ kind: 'sql', conn: connId })],
      ['gear-wide-connected', 'Nuova da stored procedure', () => setDlg({ kind: 'proc', conn: connId })],
      ['file-earmark-code', 'Crea script SQL', () => setDlg({ kind: 'script', conn: connId })],
      ['arrow-repeat', 'Sincronizza database', sync],
      ['arrow-clockwise', 'Ricarica elenco tabelle', () => load(connId)],
    ] });
  };
  const pick = (e: React.MouseEvent, name: string) => {
    if (e.ctrlKey || e.metaKey) { const n = new Set(multi); n.has(name) ? n.delete(name) : n.add(name); setMulti(n); }
    else setMulti(new Set([name]));
    setSelected(name);
  };

  const byConn = useMemo(() => Object.fromEntries(p.connections.map((c) => {
    const list = (dbt[c.id] || []).filter((t) => !t.name.startsWith(p.project.systemPrefix || 'mc_'));
    const known = new Set(list.map((t) => t.name));
    const projTables = p.tables.filter((t) => t.connection === c.id);
    const orphans = projTables.filter((t) => !known.has(baseOf(t)) || !baseOf(t));
    return [c.id, { list, projTables, orphans }];
  })), [p, dbt]);
  const f = filter.toLowerCase();
  const match = (s: string) => !f || s.toLowerCase().includes(f);
  const Item = ({ t, depth }: { t: Table; depth: number }) => (
    <div className={`tt-item ${selected === t.name ? 'on' : ''} ${multi.has(t.name) && multi.size > 1 ? 'multi' : ''}`} style={{ paddingLeft: 10 + depth * 16 }}
      onClick={(e) => pick(e, t.name)} onDoubleClick={() => goTable(t.name)} onContextMenu={(e) => tableMenu(e, t)}>
      <I n={t.source.type === 'sql' ? 'code-square' : t.source.type === 'rest' ? 'cloud' : t.source.type === 'proc' ? 'gear-wide-connected' : 'window-stack'} className="muted" /> <span className="grow">{t.name}</span>
      {p.reports.filter((r) => r.table === t.name).length > 0 && <I n="file-earmark-bar-graph" className="muted" />}
      {p.charts.filter((r) => r.table === t.name).length > 0 && <I n="bar-chart" className="muted" />}
      <button type="button" className="tt-more" onClick={(e) => tableMenu(e, t)}><I n="three-dots-vertical" /></button>
    </div>
  );

  if (!p.connections.length) return <div className="panel"><Empty icon="database-add" title="Prima aggiungi una connessione"><Btn kind="primary" onClick={() => setDlg({ kind: 'conn' })}>Aggiungi connessione</Btn> <Btn icon="file-earmark-plus" onClick={() => setMerging(true)}>Unisci .phpr</Btn></Empty>
    {dlg?.kind === 'conn' && <ConnectionDialog initial={null} onClose={() => setDlg(null)} />}{merging && <PhprMergeDialog onClose={() => setMerging(false)} />}</div>;

  return (
    <div className="ds-screen">
      <Hero icon="table" title="Tabelle e query" sub={selected ? `· ${selected}` : undefined}
        chips={[
          ['table', `${p.tables.filter((t) => t.source.type === 'table').length} tabelle`],
          p.tables.some((t) => t.source.type === 'sql') && ['code-square', `${p.tables.filter((t) => t.source.type === 'sql').length} query SQL`],
          p.tables.some((t) => t.source.type === 'rest') && ['cloud', `${p.tables.filter((t) => t.source.type === 'rest').length} REST`],
          p.tables.some((t) => t.source.type === 'proc') && ['gear-wide-connected', `${p.tables.filter((t) => t.source.type === 'proc').length} procedure`],
          ['diagram-3', `${p.tables.reduce((n, t) => n + t.details.length, 0)} relazioni`],
          ['database', `${p.connections.length} connessioni`],
        ]}
        actions={<><Btn icon="file-earmark-plus" title="Unisci a questo progetto le tabelle, il menu, i permessi e gli eventi di altri progetti .phpr" onClick={() => setMerging(true)}>Unisci .phpr</Btn><Btn icon="box-arrow-in-down" onClick={doImport}>Importa tabelle</Btn><Btn kind="primary" icon="plus-square" onClick={() => setDlg({ kind: 'structure', conn: p.project.defaultConnection, table: null })}>Crea tabella</Btn></>} />
      <div className="ds-toolbar">
        <span className="ds-group">Nuova origine</span>
        <Btn small icon="code-square" onClick={() => setDlg({ kind: 'sql', conn: p.project.defaultConnection })}>Query SQL</Btn>
        <Btn small icon="gear-wide-connected" onClick={() => setDlg({ kind: 'proc', conn: p.project.defaultConnection })} title="Nuova origine da stored procedure">Procedura</Btn>
        {p.connections.some((c) => c.driver === 'rest') && <Btn small icon="cloud" onClick={() => setDlg({ kind: 'rest', conn: '' })}>REST</Btn>}
        <Btn small icon="magic" onClick={() => setDlg({ kind: 'template', conn: p.project.defaultConnection })}>Da modello</Btn>
        <Btn small icon="database-add" onClick={() => setDlg({ kind: 'conn' })} title="Aggiungi connessione" />
        <span className="sep" />
        <Btn small icon="table" disabled={!selected} title={selected ? `Dati di ${selected}` : 'Seleziona una tabella'} onClick={() => {
          const t = p.tables.find((x) => x.name === selected);
          if (t) openData(t); else if (selected) { const c = p.connections.find((x) => (dbt[x.id] || []).some((y: { name: string }) => y.name === selected)); if (c) openData(null, c.id, selected); }
        }}>Dati</Btn>
        <span className="sep" />
        <span className="ds-group">Diagramma</span>
        <Btn small icon="grid" onClick={() => update((d) => { d.tables.forEach((t) => { delete (t as any).diagram; }); d.tables.sort((a, b) => a.name.localeCompare(b.name)); })}>Disponi</Btn>
        <Btn small icon="arrows-expand" onClick={() => setExpanded(new Set(p.tables.map((t) => t.name)))} title="Mostra tutti i campi" />
        <Btn small icon="arrows-collapse" onClick={() => setExpanded(new Set())} title="Nascondi tutti i campi" />
        <Btn small icon="diagram-3" onClick={() => setDlg({ kind: 'relation' })} disabled={p.tables.length < 2}>Relazione</Btn>
        <span className="sep" />
        <span className="ds-group">Database</span>
        <Btn small icon="arrow-repeat" onClick={sync} title="Allinea il progetto alla struttura del database">Sincronizza</Btn>
        <Btn small icon="file-earmark-code" onClick={() => setDlg({ kind: 'script', conn: p.project.defaultConnection })}>Script SQL</Btn>
      </div>
      <div className="ds-body">
        <div className="ds-tree">
          <input className="inp" placeholder="Filtra…" title="Doppio clic: impostazioni della tabella · tasto destro: menu" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {p.connections.map((c) => {
            const g = byConn[c.id];
            const isOpen = open.has(c.id);
            return (
              <div key={c.id}>
                <div className="tt-conn" onClick={() => { const n = new Set(open); isOpen ? n.delete(c.id) : n.add(c.id); setOpen(n); }} onContextMenu={(e) => connMenu(e, c.id)}>
                  <I n={isOpen ? 'chevron-down' : 'chevron-right'} /> <I n="database" /> <b className="grow">{c.name}</b>
                  {p.project.defaultConnection === c.id && <span className="badge" title="Connessione principale"><I n="star-fill" /></span>}
                  <button type="button" className="tt-more" onClick={(e) => connMenu(e, c.id)}><I n="three-dots-vertical" /></button>
                </div>
                {isOpen && <>
                  {!dbt[c.id] && <div className="tt-item muted" style={{ paddingLeft: 26 }}>Caricamento…</div>}
                  {g.list.map((t) => {
                    const own = g.projTables.filter((x) => baseOf(x) === t.name);
                    const main = own.find((x) => x.name === t.name && x.source.type === 'table');
                    const views = own.filter((x) => x !== main);
                    if (!match(t.name) && !views.some((v) => match(v.name))) return null;
                    return (
                      <div key={t.name}>
                        <div className={`tt-item ${selected === t.name ? 'on' : ''} ${multi.has(t.name) && multi.size > 1 ? 'multi' : ''}`} style={{ paddingLeft: 22 }}
                          onClick={(e) => { if (main) pick(e, t.name); else setSelected(t.name); }} onDoubleClick={() => (main ? goTable(t.name) : addToProject(c.id, [t.name]))} onContextMenu={(e) => dbMenu(e, c.id, t.name)}>
                          <input type="checkbox" checked={!!main} onClick={(e) => e.stopPropagation()} onChange={(e) => (e.target.checked ? addToProject(c.id, [t.name]) : main && removeFromProject(main.name))} />
                          <I n={t.type === 'view' ? 'eye' : 'table'} /> <span className={`grow ${main ? '' : 'muted'}`}>{t.name}</span>
                          <button type="button" className="tt-more" onClick={(e) => dbMenu(e, c.id, t.name)}><I n="three-dots-vertical" /></button>
                        </div>
                        {views.map((v) => <Item key={v.name} t={v} depth={2} />)}
                      </div>
                    );
                  })}
                  {g.orphans.filter((t) => match(t.name)).length > 0 && <div className="tt-group">{c.driver === 'rest' ? 'Risorse REST' : 'Query SQL e viste senza tabella base'}</div>}
                  {g.orphans.filter((t) => match(t.name)).map((t) => <Item key={t.name} t={t} depth={1} />)}
                </>}
              </div>
            );
          })}
          {(p.reports.length > 0 || p.charts.length > 0 || p.dashboards.length > 0) && <div className="tt-group">Report, grafici e dashboard</div>}
          {p.reports.map((r) => <div key={'r' + r.name} className="tt-item" style={{ paddingLeft: 22 }} onDoubleClick={() => useStore.getState().set({ nav: { kind: 'reports' } })}><I n="file-earmark-bar-graph" /> {lbl(r.title, r.name)} <small className="muted">· {r.table}</small></div>)}
          {p.charts.map((r) => <div key={'c' + r.name} className="tt-item" style={{ paddingLeft: 22 }} onDoubleClick={() => useStore.getState().set({ nav: { kind: 'charts' } })}><I n="bar-chart" /> {lbl(r.title, r.name)} <small className="muted">· {r.table}</small></div>)}
          {p.dashboards.map((r) => <div key={'d' + r.name} className="tt-item" style={{ paddingLeft: 22 }} onDoubleClick={() => useStore.getState().set({ nav: { kind: 'dashboards' } })}><I n="speedometer2" /> {lbl(r.title, r.name)}</div>)}
          <div className="tt-actions">
            <Btn small icon="file-earmark-bar-graph" onClick={() => p.tables[0] && newReport(p.tables.find((t) => t.name === selected) || p.tables[0])} disabled={!p.tables.length}>Report</Btn>
            <Btn small icon="bar-chart" onClick={() => p.tables[0] && newChart(p.tables.find((t) => t.name === selected) || p.tables[0])} disabled={!p.tables.length}>Grafico</Btn>
            <Btn small icon="speedometer2" onClick={() => useStore.getState().set({ nav: { kind: 'dashboards' } })}>Dashboard</Btn>
          </div>
        </div>
        <div className="ds-main">
          {p.tables.length ? <Diagram selected={selected} onSelect={setSelected} expanded={expanded} onOpen={goTable} onMenu={tableMenu} />
            : <Empty icon="ui-checks" title="Seleziona le tabelle"><p>Spunta a sinistra le tabelle da gestire nell'applicazione, oppure crea una nuova tabella.</p></Empty>}
        </div>
      </div>
      {menu && <div className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
        {menu.items.map((it, i) => it === '-' ? <hr key={i} /> : <button key={i} type="button" onClick={() => { setMenu(null); it[2](); }}><I n={it[0]} /> {it[1]}</button>)}
      </div>}
      {merging && <PhprMergeDialog onClose={() => setMerging(false)} />}
      {dlg?.kind === 'sql' && <SqlViewDialog conn={dlg.conn!} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'data' && dlg.src && <DataDialog src={dlg.src} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'proc' && <ProcDialog conn={dlg.conn!} onClose={() => setDlg(null)} onCreated={(np, n) => { setProj(np, p.dir); useStore.getState().set({ nav: { kind: 'table', id: n } }); }} />}
      {dlg?.kind === 'structure' && <StructureDialog conn={dlg.conn!} table={dlg.table ?? null} onClose={() => setDlg(null)} onDone={(name, created, add) => {
        load(dlg.conn!);
        if (created && add) addToProject(dlg.conn!, [name]);
        else if (p.tables.some((t) => t.name === name)) run('Aggiornamento…', async () => { const r = await call('wizard:refresh', useStore.getState().proj, name); setProj(r.proj, p.dir); });
      }} />}
      {dlg?.kind === 'advanced' && dlg.t && <AdvancedDialog t={dlg.t} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'relation' && <RelationDialog master={dlg.table || undefined} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'script' && <ScriptDialog conn={dlg.conn!} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'rest' && <RestDialog conn={dlg.conn!} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'template' && <TemplateDialog conn={dlg.conn!} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'conn' && <ConnectionDialog initial={null} onClose={() => setDlg(null)} />}
    </div>
  );
}
