// "Vista unita": pick a starting table and tick the columns to show, from that table and from every table linked to it by a relation
// drawn in the diagram: a table joins the view as soon as one of its columns is ticked (the link comes from the relation). Tables
// without a relation can be added by hand. The SQL is generated (core/joinview.cjs) and the view lives in the project only.
// Also used to edit an existing view (t = the datasource).
import { useRef, useState } from 'react';
import { call } from '../api';
import { replaceProject, run, toast, useStore } from '../store';
import type { JoinDef, JoinStep, Project, Table } from '../types';
import { dbFields, linkFor, normalizeJoin } from '../joinview';
import CodeEditor from './CodeEditor';
import { Btn, I, Modal, Row, Select, Text, slug } from './ui';

export type JoinPre = { left: { table: string; field: string }; right: { table: string; field: string }; type: 'inner' | 'left' };
/** A table that can join the view; `force` = it joins even with no column ticked (added by hand, or saved that way). */
type Step = JoinStep & { force?: boolean };
const JOIN_TYPES = (_t: string, from: string): ['inner' | 'left', string][] => [
  ['left', `Tutti i record di ${from}`],
  ['inner', 'Solo con corrispondenza'],
];
const MAX_SHOWN = 300;

export default function JoinViewDialog({ onClose, t, pre }: { onClose: () => void; t?: Table; pre?: JoinPre }) {
  const p = useStore((s) => s.proj)!;
  const editing = normalizeJoin(t?.source.join);
  const dbTables = p.tables.filter((x) => x.source.type === 'table' && x.source.table);
  const byName = (n: string) => dbTables.find((x) => x.name === n);
  const tablesOf = (names: string[]) => names.map(byName).filter(Boolean) as Table[];

  /** Tables reachable from `have` through the relations of the diagram (either direction), each linked to the one it was found from. */
  const relatedSteps = (have: string[]): Step[] => {
    const conn = byName(have[0])?.connection;
    const pool = dbTables.filter((x) => x.connection === conn);
    let inc = tablesOf(have);
    const out: Step[] = [];
    for (let again = true; again;) {
      again = false;
      for (const c of pool.filter((x) => !inc.includes(x))) {
        if (!inc.some((i) => i.details.some((d) => d.table === c.name) || c.details.some((d) => d.table === i.name))) continue;
        const l = linkFor(inc, c);
        if (!l) continue;
        out.push({ table: c.name, type: 'left', from: l.from, on: l.on }); inc = [...inc, c]; again = true;
      }
    }
    return out;
  };

  const initial: JoinDef = editing || (pre
    ? { base: pre.left.table, joins: [{ table: pre.right.table, type: pre.type, from: pre.left.table, on: [{ left: pre.left.field, right: pre.right.field }] }], columns: [] }
    : { base: dbTables[0]?.name || '', joins: [], columns: [] });

  const [name, setName] = useState(t?.name || (pre ? slug(`${pre.left.table}_${pre.right.table}`) : ''));
  const [base, setBase] = useState(initial.base);
  const [steps, setSteps] = useState<Step[]>(() => {
    const saved: Step[] = initial.joins.map((j) => ({ ...j, force: true }));
    return [...saved, ...relatedSteps([initial.base, ...saved.map((s) => s.table)])];
  });
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(initial.columns.map((c) => [`${c.table}:${c.name}`, c.as])));
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [prev, setPrev] = useState<{ columns: string[]; rows: any[]; total: number } | null>(null);
  const [sql, setSql] = useState('');
  const opened = useRef(new Set([initial.base, ...initial.columns.map((c) => c.table)]));

  const order = [base, ...steps.map((s) => s.table)];
  const sameConn = dbTables.filter((x) => x.connection === byName(base)?.connection);
  const free = sameConn.filter((x) => !order.includes(x.name));
  const dirty = () => { setPrev(null); setSql(''); };
  const key = (table: string, n: string) => `${table}:${n}`;
  const isOn = (table: string, n: string) => key(table, n) in picked;
  const ticked = (table: string) => dbFields(byName(table)).filter((n) => isOn(table, n)).length;

  /** Steps that really join: forced ones, those with a ticked column, and every table those are linked through. */
  const used = (() => {
    const u = steps.map((s) => !!s.force || ticked(s.table) > 0);
    for (let i = steps.length - 1; i >= 0; i--) if (u[i]) { const j = steps.findIndex((x) => x.table === steps[i].from); if (j >= 0) u[j] = true; }
    return u;
  })();

  // --- tables -----------------------------------------------------------------------------
  const dropColumns = (tables: string[]) => setPicked((pk) => Object.fromEntries(Object.entries(pk).filter(([k]) => !tables.includes(k.slice(0, k.indexOf(':'))))));
  const changeBase = (n: string) => {
    opened.current.add(n);
    setBase(n); setPicked({}); setSteps(relatedSteps([n])); dirty();
    if (!t && !name) setName(slug(n));
  };
  /** A table without a relation in the diagram, added by hand. */
  const addTable = () => {
    const c = free[0];
    if (!c) return toast('Non ci sono altre tabelle dello stesso database nel progetto', 'info');
    const l = linkFor(tablesOf(order), c);
    opened.current.add(c.name);
    setSteps([...steps, { table: c.name, type: 'left', from: l?.from || base, on: l?.on || [], force: true }]); dirty();
  };
  const setStep = (i: number, patch: Partial<Step>) => { setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s))); dirty(); };
  const changeStepTable = (i: number, n: string) => {
    const cand = byName(n);
    if (!cand) return;
    dropColumns([steps[i].table]);
    const l = linkFor(tablesOf([base, ...steps.slice(0, i).map((s) => s.table)]), cand);
    setStep(i, { table: n, from: l?.from || base, on: l?.on || [] });
  };
  const removeStep = (i: number) => {
    // a table linked through the removed one goes with it
    const gone = new Set([steps[i].table]);
    for (let again = true; again;) { again = false; for (const s of steps) if (!gone.has(s.table) && gone.has(s.from)) { gone.add(s.table); again = true; } }
    setSteps(steps.filter((s) => !gone.has(s.table))); dropColumns([...gone]); dirty();
    if (gone.size > 1) toast(`Tolte anche le tabelle collegate tramite ${steps[i].table}`, 'info');
  };
  const setPair = (i: number, k: number, patch: Partial<{ left: string; right: string }>) => setStep(i, { on: steps[i].on.map((x, n) => (n === k ? { ...x, ...patch } : x)) });

  // --- columns ----------------------------------------------------------------------------
  const defaultAs = (table: string, n: string) => {
    const earlier = order.slice(0, order.indexOf(table));
    return earlier.some((e) => Object.keys(picked).some((k) => k.startsWith(`${e}:`) && k.slice(e.length + 1).toLowerCase() === n.toLowerCase())) ? `${table}_${n}` : n;
  };
  const asOf = (table: string, n: string) => picked[key(table, n)] || defaultAs(table, n);
  const setAll = (table: string, names: string[], v: boolean) => {
    const next = { ...picked };
    for (const n of names) { if (v) next[key(table, n)] = next[key(table, n)] || ''; else delete next[key(table, n)]; }
    setPicked(next); dirty();
  };

  const def = (): JoinDef => ({
    base,
    joins: steps.filter((_, i) => used[i]).map(({ force: _f, ...j }) => ({ ...j, on: j.on.filter((k) => k.left && k.right) })),
    columns: order.flatMap((tn) => dbFields(byName(tn)).filter((n) => isOn(tn, n)).map((n) => ({ table: tn, name: n, as: asOf(tn, n) }))),
  });

  const preview = () => run('Esecuzione…', async () => {
    const b = await call<{ sql: string; connection: string }>('join:sql', p, def());
    setSql(b.sql);
    setPrev(await call('db:preview', p, b.connection, b.sql, 50));
  });
  const showSql = () => run('Generazione…', async () => { setSql((await call<{ sql: string }>('join:sql', p, def())).sql); });
  const ok = () => run(t ? 'Aggiornamento…' : 'Creazione…', async () => {
    if (t) {
      const r = await call<{ proj: Project; added: string[]; removed: string[] }>('wizard:joinupdate', p, t.name, def());
      replaceProject({ ...r.proj, dir: p.dir });
      toast(`Vista aggiornata${r.added.length ? `, nuove colonne: ${r.added.join(', ')}` : ''}${r.removed.length ? `, tolte: ${r.removed.join(', ')}` : ''}`, 'ok');
    } else {
      const n = slug(name);
      if (!n) throw new Error('Indica un nome per la vista');
      replaceProject({ ...(await call<Project>('wizard:joinview', p, n, def())), dir: p.dir });
      useStore.getState().set({ nav: { kind: 'table', id: n } });
    }
    onClose();
  });

  const opts = (tb?: Table) => [['', '—'] as [string, string], ...dbFields(tb).map((n) => [n, n] as [string, string])];
  const tableOpts = (list: Table[]) => list.map((x) => [x.name, x.name] as [string, string]);
  const total = order.reduce((n, tn) => n + ticked(tn), 0);
  const joined = used.filter(Boolean).length;

  /** How a table is linked to the view, at the top of its card. */
  const linkOf = (i: number) => {
    const s = steps[i];
    const T = byName(s.table);
    const F = byName(s.from);
    const before = [base, ...steps.slice(0, i).map((x) => x.table)];
    return (
      <div className="jv-link">
        <label className="jv-lbl">Collegata a</label>
        <Select value={s.from} options={tableOpts(tablesOf(before))} onChange={(v) => { const f = byName(v); const l = T && f ? linkFor([f], T) : null; setStep(i, { from: v, on: l ? l.on : [] }); }} />
        <label className="jv-lbl">Tramite i campi</label>
        {s.on.map((k, n) => (
          <div key={n} className="jv-pair">
            <Select value={k.left} options={opts(F)} onChange={(v) => setPair(i, n, { left: v })} />
            <span className="muted">=</span>
            <Select value={k.right} options={opts(T)} onChange={(v) => setPair(i, n, { right: v })} />
            <Btn small icon="x-lg" title="Togli il collegamento" onClick={() => setStep(i, { on: s.on.filter((_, m) => m !== n) })} />
          </div>
        ))}
        {!s.on.length && <small className="hint">Scegli i campi che collegano le due tabelle.</small>}
        <Btn small icon="plus-lg" onClick={() => setStep(i, { on: [...s.on, { left: '', right: '' }] })}>Collegamento</Btn>
        <label className="jv-lbl">Quali record</label>
        <Select value={s.type} options={JOIN_TYPES(s.table, s.from)} onChange={(v) => setStep(i, { type: v as 'inner' | 'left' })} />
      </div>
    );
  };

  /** One card per table, side by side: header, link (not for the first one), search and the fields to tick. */
  const cardOf = (tn: string, i: number) => {
    const step = i >= 0 ? steps[i] : null;
    const all = dbFields(byName(tn));
    const q = (filter[tn] || '').toLowerCase();
    const shown = all.filter((n) => !q || n.toLowerCase().includes(q));
    const count = ticked(tn);
    const on = !step || used[i];
    return (
      <div key={tn} className={`jv-card ${on ? 'used' : ''} ${step ? '' : 'base'}`}>
        <div className="jv-card-head">
          <I n={step ? 'table' : 'star-fill'} />
          <b className="jv-card-name" title={tn}>{tn}</b>
          {step && <Btn small icon="trash" title="Togli questa tabella dalla vista" onClick={() => removeStep(i)} />}
        </div>
        <div className="jv-card-sub">
          <span className={`jv-badge ${on ? 'on' : ''}`}>{!step ? 'tabella di partenza' : on ? 'unita alla vista' : 'non usata'}</span>
          <span className="muted">{count} di {all.length}</span>
        </div>
        {step && linkOf(i)}
        <div className="inline">
          <input className="inp" placeholder="Cerca campo…" value={filter[tn] || ''} onChange={(e) => setFilter({ ...filter, [tn]: e.target.value })} />
          <Btn small onClick={() => setAll(tn, shown, true)} title="Spunta tutti quelli in elenco">Tutti</Btn>
          <Btn small onClick={() => setAll(tn, shown, false)} title="Toglie la spunta a quelli in elenco">Nessuno</Btn>
        </div>
        <div className="jv-list">
          {shown.slice(0, MAX_SHOWN).map((n) => (
            <div key={n} className="jv-item">
              <input type="checkbox" checked={isOn(tn, n)} onChange={(e) => { const nx = { ...picked }; if (e.target.checked) nx[key(tn, n)] = ''; else delete nx[key(tn, n)]; setPicked(nx); dirty(); }} />
              <span className="jv-name" title={n}>{n}</span>
              {isOn(tn, n) && <input className="inp jv-as" value={asOf(tn, n)} title="Nome visibile nella vista" onChange={(e) => { setPicked({ ...picked, [key(tn, n)]: e.target.value }); dirty(); }} />}
            </div>
          ))}
          {shown.length > MAX_SHOWN && <small className="hint">Altri {shown.length - MAX_SHOWN} campi: affina la ricerca.</small>}
          {!shown.length && <small className="hint">Nessun campo.</small>}
        </div>
      </div>
    );
  };

  return (
    <Modal wide title={t ? `Vista unita — ${t.name}` : 'Nuova vista unita'} onClose={onClose}
      footer={<><Btn icon="play" onClick={preview}>Anteprima risultati</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok}>{t ? 'Salva' : 'Crea'}</Btn></>}>
      {dbTables.length < 2 ? <p className="help">Servono almeno due tabelle del database nel progetto (le query, REST e procedure non si possono unire).</p> : <div className="jv">
        <div className="inline wrap jv-top">
          <Row label="Nome della vista"><Text value={name} onChange={setName} placeholder="clienti_con_contratti" mono disabled={!!t} /></Row>
          <Row label="Tabella di partenza"><Select value={base} options={tableOpts(dbTables)} onChange={changeBase} /></Row>
        </div>
        <p className="help">
          A destra della tabella di partenza ci sono le tabelle collegate a lei da una relazione del diagramma. Spunta i campi da mostrare ({total} scelti, {joined ? `${joined} tabelle unite` : 'nessuna tabella unita'}):
          una tabella entra nella vista quando ne spunti un campo. I campi senza spunta non compaiono nella vista (né in liste, ricerca, esportazioni e report); il nome visibile si può cambiare.
        </p>
        <div className="jv-board">
          {cardOf(base, -1)}
          {steps.map((s, i) => cardOf(s.table, i))}
          <div className="jv-card jv-new">
            <Btn icon="plus-lg" onClick={addTable} disabled={!free.length} title="Aggiunge una tabella che non ha relazioni nel diagramma">Aggiungi un'altra tabella</Btn>
            {!steps.length && <p className="help">Nessuna tabella è collegata a <b>{base}</b> da una relazione del diagramma: creala prima, oppure aggiungi la tabella a mano.</p>}
          </div>
        </div>

        <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !sql) showSql().catch(() => {}); }}>
          <summary>Mostra l'SQL generato</summary>
          {sql ? <CodeEditor language="sql" value={sql} onChange={() => {}} height={170} /> : <small className="hint">Spunta almeno un campo.</small>}
        </details>
        {prev && <div className="preview-grid"><table className="grid"><thead><tr>{prev.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{prev.rows.map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c}>{r[c] == null ? <i className="null">NULL</i> : String(r[c])}</td>)}</tr>)}</tbody></table>
          <small className="hint">{prev.total} righe</small></div>}
        <p className="help">La vista esiste solo nel progetto: nel database non viene creato nulla. È di sola lettura.</p>
      </div>}
    </Modal>
  );
}
