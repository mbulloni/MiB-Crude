import { useState } from 'react';
import { toast, update, useStore } from '../store';
import type { Chart, Dashboard, DashItem, Report } from '../types';
import CodeEditor from './CodeEditor';
import PageBuilder from './PageBuilder';
import { Btn, Check, Empty, Hero, I, LangText, Num, Row, Section, Select, ask, lbl, slug } from './ui';

const FNS: [string, string][] = [['sum', 'Somma'], ['avg', 'Media'], ['count', 'Conteggio'], ['min', 'Minimo'], ['max', 'Massimo']];
const INTERVALS: [string, string][] = [['', 'Valore'], ['year', 'Anno'], ['quarter', 'Trimestre'], ['month', 'Mese'], ['week', 'Settimana'], ['day', 'Giorno'], ['letter', 'Iniziale'], ['tens', 'Decine']];

function useFieldsOf(table: string) {
  const p = useStore((s) => s.proj)!;
  const t = p.tables.find((x) => x.name === table);
  return (t?.fields || []).map((f) => [f.name, lbl(f.label, f.name)] as [string, string]);
}

function ListShell<T extends { name: string; title: any }>({ kind, title, items, make, editor, all }: { kind: 'reports' | 'charts' | 'dashboards'; title: string; items: T[]; all?: T[]; make: (name: string) => T; editor: (it: T, set: (fn: (x: T) => void) => void) => React.ReactNode }) {
  const [cur, setCur] = useState(items[0]?.name || '');
  const it = items.find((x) => x.name === cur);
  const set = (fn: (x: T) => void) => update((d) => { const x = (d[kind] as unknown as T[]).find((y) => y.name === cur); if (x) fn(x); });
  const add = async () => {
    let n = items.length + 1;
    while ((all || items).some((x) => x.name === `${kind.slice(0, -1)}${n}`)) n++;
    const name = slug((await ask(`Nuov${kind === 'reports' ? 'o report' : kind === 'charts' ? 'o grafico' : title === 'Pagine' ? 'a pagina' : 'a dashboard'}: nome (identificativo)`, `${kind.slice(0, -1)}${n}`)) || '');
    if (!name) return;
    if ((all || items).some((x) => x.name === name)) { toast(`Esiste già un elemento «${name}»`, 'err'); return; }
    update((d) => { (d[kind] as unknown as T[]).push(make(name)); });
    setCur(name);
  };
  return (
    <div className="panel">
      <Hero icon={{ reports: 'file-earmark-bar-graph', charts: 'bar-chart-line', dashboards: 'speedometer2' }[kind]} title={title} chips={[
        [{ reports: 'file-earmark-bar-graph', charts: 'bar-chart-line', dashboards: 'speedometer2' }[kind], `${items.length} ${items.length === 1 && title === 'Pagine' ? 'pagina' : title.toLowerCase()}`],
        it ? ['pencil', lbl(it.title, it.name)] : null,
      ]} actions={<Btn kind="primary" icon="plus-lg" onClick={add}>Nuovo</Btn>} />
      <div className="split">
        <div className="split-list">
          {!items.length && <p className="help">Nessun elemento: usa «Nuovo».</p>}
          {items.map((x) => <button key={x.name} className={`nav-item ${x.name === cur ? 'on' : ''}`} onClick={() => setCur(x.name)}>{lbl(x.title, x.name)}</button>)}
        </div>
        <div className="split-body">{it ? <>
          <div className="inline"><Row label="Titolo"><LangText value={it.title} onChange={(v) => set((x) => { x.title = v; })} /></Row><span className="grow" />
            <Btn kind="ghost" icon="trash" onClick={() => { if (confirm('Eliminare?')) { update((d) => { (d[kind] as unknown as T[]).splice((d[kind] as unknown as T[]).findIndex((y) => y.name === cur), 1); }); setCur(''); } }}>Elimina</Btn></div>
          {editor(it, set)}
          <p className="help">Pagina: <code>index.php?p={kind.slice(0, -1)}&amp;{kind === 'reports' ? 'r' : kind === 'charts' ? 'c' : 'd'}={it.name}</code>. Aggiungila al Menu e assegna il permesso «Elenco» ai gruppi in Sicurezza.</p>
        </> : <Empty icon="plus-square" title="Crea il primo elemento" />}</div>
      </div>
    </div>
  );
}

export function ReportsPanel() {
  const p = useStore((s) => s.proj)!;
  return <ListShell kind="reports" title="Report" items={p.reports}
    make={(name) => ({ name, title: { it: name }, table: p.tables[0]?.name || '', groups: [], aggregates: [], columns: [], showDetails: true } as Report)}
    editor={(r, set) => <ReportEditor r={r} set={set} />} />;
}

function ReportEditor({ r, set }: { r: Report; set: (fn: (x: Report) => void) => void }) {
  const p = useStore((s) => s.proj)!;
  const fields = useFieldsOf(r.table);
  return <>
    <Section title="Dati"><Row label="Tabella / query"><Select value={r.table} options={p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string])} onChange={(v) => set((x) => { x.table = v; x.groups = []; x.aggregates = []; x.columns = []; })} /></Row></Section>
    <Section title="Raggruppamenti" actions={<Btn small icon="plus-lg" onClick={() => set((x) => { x.groups.push({ field: fields[0]?.[0] || '' }); })}>Livello</Btn>}>
      {r.groups.map((g, i) => <div className="inline" key={i}><span className="muted">{i + 1}.</span>
        <Select value={g.field} options={fields} onChange={(v) => set((x) => { x.groups[i].field = v; })} />
        <Select value={g.interval || ''} options={INTERVALS} onChange={(v) => set((x) => { x.groups[i].interval = v; })} />
        <Check label="Decrescente" value={g.desc} onChange={(v) => set((x) => { x.groups[i].desc = v; })} />
        <Btn small kind="ghost" icon="x-lg" onClick={() => set((x) => { x.groups.splice(i, 1); })} /></div>)}
    </Section>
    <Section title="Totali (per gruppo e generale)" actions={<Btn small icon="plus-lg" onClick={() => set((x) => { x.aggregates.push({ field: fields[0]?.[0] || '', fn: 'sum' }); })}>Totale</Btn>}>
      {r.aggregates.map((a, i) => <div className="inline" key={i}><Select value={a.fn} options={FNS} onChange={(v) => set((x) => { x.aggregates[i].fn = v; })} /> di
        <Select value={a.field} options={fields} onChange={(v) => set((x) => { x.aggregates[i].field = v; })} />
        <Btn small kind="ghost" icon="x-lg" onClick={() => set((x) => { x.aggregates.splice(i, 1); })} /></div>)}
    </Section>
    <Section title="Campi incrociati (crosstab)" help="Le colonne del report diventano i valori di un campo (per esempio i mesi o le aree): ogni cella mostra i totali per riga (raggruppamenti) e colonna, con i totali di riga e di colonna; un clic su una cella apre la lista filtrata">
      <Row label="Colonne da"><span className="inline">
        <Select value={r.crosstab?.field || ''} options={[['', 'Nessuno: report a gruppi'] as [string, string], ...fields]} onChange={(v) => set((x) => { if (v) x.crosstab = { ...(x.crosstab || {}), field: v }; else delete x.crosstab; })} />
        {r.crosstab?.field && <Select value={r.crosstab.interval || ''} options={INTERVALS} onChange={(v) => set((x) => { x.crosstab = { ...x.crosstab!, interval: v }; })} />}
      </span></Row>
      {r.crosstab?.field && <Row label="Ordine colonne"><Check label="Decrescente" value={r.crosstab.desc} onChange={(v) => set((x) => { x.crosstab = { ...x.crosstab!, desc: v }; })} /></Row>}
      {r.crosstab?.field && !r.groups.length && <p className="help warn"><I n="exclamation-triangle" /> Aggiungi almeno un raggruppamento: sono le righe della tabella incrociata.</p>}
      {r.crosstab?.field && !r.aggregates.length && <p className="help warn"><I n="exclamation-triangle" /> Aggiungi almeno un totale: è il valore delle celle.</p>}
    </Section>
    {!r.crosstab?.field && <Section title="Righe di dettaglio">
      <Row label="Mostra le righe"><Check value={r.showDetails} onChange={(v) => set((x) => { x.showDetails = v; })} /></Row>
      <Row label="Colonne"><span className="chips">{fields.map(([f, l]) => <Check key={f} label={l} value={r.columns.includes(f)} onChange={(v) => set((x) => { x.columns = v ? [...x.columns, f] : x.columns.filter((y) => y !== f); })} />)}</span></Row>
    </Section>}
  </>;
}

export function ChartsPanel() {
  const p = useStore((s) => s.proj)!;
  return <ListShell kind="charts" title="Grafici" items={p.charts}
    make={(name) => ({ name, title: { it: name }, table: p.tables[0]?.name || '', type: 'bar', labelField: p.tables[0]?.fields[1]?.name || '', series: [] } as Chart)}
    editor={(c, set) => <ChartEditor c={c} set={set} />} />;
}

function ChartEditor({ c, set }: { c: Chart; set: (fn: (x: Chart) => void) => void }) {
  const p = useStore((s) => s.proj)!;
  const fields = useFieldsOf(c.table);
  return <>
    <Section title="Grafico">
      <Row label="Tabella / query"><Select value={c.table} options={p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string])} onChange={(v) => set((x) => { x.table = v; x.series = []; })} /></Row>
      <Row label="Tipo"><Select value={c.type} options={[['bar', 'Colonne'], ['hbar', 'Barre orizzontali'], ['line', 'Linee'], ['area', 'Area'], ['scatter', 'Dispersione'], ['pie', 'Torta'], ['doughnut', 'Ciambella'], ['rose', 'Rosa (Nightingale)'], ['funnel', 'Imbuto'], ['treemap', 'Treemap'], ['gauge', 'Indicatore (gauge)'], ['radar', 'Radar']]} onChange={(v) => set((x) => { x.type = v; })} /></Row>
      <Row label="Categorie (asse X)"><span className="inline"><Select value={c.labelField} options={fields} onChange={(v) => set((x) => { x.labelField = v; })} /><Select value={c.labelInterval || ''} options={INTERVALS} onChange={(v) => set((x) => { x.labelInterval = v; })} /></span></Row>
      <Row label="Opzioni"><span className="chips"><Check label="Ordina per valore" value={c.sortByValue} onChange={(v) => set((x) => { x.sortByValue = v; })} /><Check label="Serie impilate" value={c.stacked} onChange={(v) => set((x) => { x.stacked = v; })} /></span></Row>
      <Row label="Mostra solo i primi"><Num value={c.limit} onChange={(v) => set((x) => { x.limit = v || undefined; })} /></Row>
    </Section>
    <Section title="Personalizzazione JavaScript" help="Codice eseguito nel browser prima di disegnare il grafico, con l'API AnyChart dei progetti .phpr (chart.getSeriesAt(0).labels()…, chart.legend()…, chart.yAxis(1)…, anychart.scales.linear()) tradotta su ECharts. Importato dagli eventi JS_ModifyChart."
      actions={!c.modifyJs ? <Btn small icon="plus-lg" onClick={() => set((x) => { x.modifyJs = '// chart: grafico, anychart: utilità (format.number, scales.linear)\nchart.legend().position("bottom");\n'; })}>Aggiungi codice</Btn>
        : <Btn small kind="ghost" icon="trash" onClick={() => set((x) => { delete x.modifyJs; })}>Rimuovi</Btn>}>
      {c.modifyJs !== undefined && <CodeEditor language="javascript" value={c.modifyJs} onChange={(v) => set((x) => { x.modifyJs = v; })} height="220px" />}
    </Section>
    <Section title="Serie (valori)" actions={<Btn small icon="plus-lg" onClick={() => set((x) => { x.series.push({ field: fields[0]?.[0] || '', fn: 'sum' }); })}>Serie</Btn>} help="Senza serie: conteggio dei record per categoria.">
      {c.series.map((s, i) => <div className="inline" key={i}><Select value={s.fn} options={FNS} onChange={(v) => set((x) => { x.series[i].fn = v; })} /> di
        <Select value={s.field} options={fields} onChange={(v) => set((x) => { x.series[i].field = v; })} />
        <input type="color" value={s.color || '#2f6fd6'} onChange={(e) => set((x) => { x.series[i].color = e.target.value; })} />
        <Btn small kind="ghost" icon="x-lg" onClick={() => set((x) => { x.series.splice(i, 1); })} /></div>)}
    </Section>
  </>;
}

export function DashboardsPanel({ pages }: { pages?: boolean } = {}) {
  const p = useStore((s) => s.proj)!;
  return <ListShell kind="dashboards" title={pages ? 'Pagine' : 'Dashboard'} items={p.dashboards.filter((d) => !!d.page === !!pages)} all={p.dashboards}
    make={(name) => ({ name, title: { it: name }, items: [], ...(pages ? { page: true } : {}) } as Dashboard)}
    editor={(d, set) => <PageBuilder d={d} set={set} />} />;
}

export function PagesPanel() { return <DashboardsPanel pages />; }

export default ReportsPanel;
