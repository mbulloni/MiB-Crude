import { useState } from 'react';
import { update, useStore } from '../store';
import type { Chart, Dashboard, DashItem, Report } from '../types';
import CodeEditor from './CodeEditor';
import { Btn, Check, Empty, I, LangText, Num, Row, Section, Select, lbl, slug } from './ui';

const FNS: [string, string][] = [['sum', 'Somma'], ['avg', 'Media'], ['count', 'Conteggio'], ['min', 'Minimo'], ['max', 'Massimo']];
const INTERVALS: [string, string][] = [['', 'Valore'], ['year', 'Anno'], ['quarter', 'Trimestre'], ['month', 'Mese'], ['week', 'Settimana'], ['day', 'Giorno'], ['letter', 'Iniziale'], ['tens', 'Decine']];

function useFieldsOf(table: string) {
  const p = useStore((s) => s.proj)!;
  const t = p.tables.find((x) => x.name === table);
  return (t?.fields || []).map((f) => [f.name, lbl(f.label, f.name)] as [string, string]);
}

function ListShell<T extends { name: string; title: any }>({ kind, title, items, make, editor }: { kind: 'reports' | 'charts' | 'dashboards'; title: string; items: T[]; make: (name: string) => T; editor: (it: T, set: (fn: (x: T) => void) => void) => React.ReactNode }) {
  const [cur, setCur] = useState(items[0]?.name || '');
  const it = items.find((x) => x.name === cur);
  const set = (fn: (x: T) => void) => update((d) => { const x = (d[kind] as unknown as T[]).find((y) => y.name === cur); if (x) fn(x); });
  const add = () => {
    const name = slug(prompt('Nome (identificativo)', `${kind.slice(0, -1)}${items.length + 1}`) || '');
    if (!name || items.some((x) => x.name === name)) return;
    update((d) => { (d[kind] as unknown as T[]).push(make(name)); });
    setCur(name);
  };
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="split">
        <div className="split-list">
          <Btn kind="primary" icon="plus-lg" onClick={add}>Nuovo</Btn>
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
        {r.crosstab?.field && <><Select value={r.crosstab.interval || ''} options={INTERVALS} onChange={(v) => set((x) => { x.crosstab = { ...x.crosstab!, interval: v }; })} />
          <Check label="Decrescente" value={r.crosstab.desc} onChange={(v) => set((x) => { x.crosstab = { ...x.crosstab!, desc: v }; })} /></>}
      </span></Row>
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
    <Section title="Personalizzazione JavaScript" help="Codice eseguito nel browser prima di disegnare il grafico, con l'API AnyChart di phpr (chart.getSeriesAt(0).labels()…, chart.legend()…, chart.yAxis(1)…, anychart.scales.linear()) tradotta su ECharts. Importato dagli eventi JS_ModifyChart."
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

export function DashboardsPanel() {
  const p = useStore((s) => s.proj)!;
  return <ListShell kind="dashboards" title="Dashboard" items={p.dashboards}
    make={(name) => ({ name, title: { it: name }, items: [] } as Dashboard)}
    editor={(d, set) => <DashEditor d={d} set={set} />} />;
}

function DashEditor({ d, set }: { d: Dashboard; set: (fn: (x: Dashboard) => void) => void }) {
  const p = useStore((s) => s.proj)!;
  const add = (it: DashItem) => set((x) => { x.items.push(it); });
  return <>
    <div className="inline wrap">
      <Btn small icon="123" onClick={() => add({ type: 'count', table: p.tables[0]?.name, width: 3 })}>Indicatore</Btn>
      <Btn small icon="bar-chart" disabled={!p.charts.length} onClick={() => add({ type: 'chart', ref: p.charts[0]?.name, width: 6 })}>Grafico</Btn>
      <Btn small icon="file-earmark-bar-graph" disabled={!p.reports.length} onClick={() => add({ type: 'report', ref: p.reports[0]?.name, width: 12 })}>Report</Btn>
      <Btn small icon="table" onClick={() => add({ type: 'list', table: p.tables[0]?.name, width: 6, rows: 10 })}>Lista</Btn>
      <Btn small icon="code" onClick={() => add({ type: 'html', html: { it: '<p>Testo</p>' }, width: 12 })}>Testo/HTML</Btn>
    </div>
    <div className="dash-board">
      {d.items.map((it, i) => <div className="dash-item" key={i} style={{ gridColumn: `span ${it.width || 6}` }}>
        <div className="inline"><b>{{ count: 'Indicatore', kpi: 'Indicatore', chart: 'Grafico', report: 'Report', list: 'Lista', html: 'Testo' }[it.type]}</b><span className="grow" />
          <Btn small kind="ghost" icon="arrow-left" onClick={() => set((x) => { if (i > 0) [x.items[i - 1], x.items[i]] = [x.items[i], x.items[i - 1]]; })} />
          <Btn small kind="ghost" icon="arrow-right" onClick={() => set((x) => { if (i < x.items.length - 1) [x.items[i + 1], x.items[i]] = [x.items[i], x.items[i + 1]]; })} />
          <Btn small kind="ghost" icon="x-lg" onClick={() => set((x) => { x.items.splice(i, 1); })} /></div>
        {(it.type === 'count' || it.type === 'kpi' || it.type === 'list') && <Row label="Tabella"><Select value={it.table} options={p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string])} onChange={(v) => set((x) => { x.items[i].table = v; })} /></Row>}
        {it.type === 'count' && <Row label="Valore"><span className="inline"><Select value={it.fn || 'count'} options={FNS} onChange={(v) => set((x) => { x.items[i].fn = v; })} />
          {it.fn && it.fn !== 'count' && <Select value={it.field} options={(p.tables.find((t) => t.name === it.table)?.fields || []).map((f) => [f.name, f.name] as [string, string])} onChange={(v) => set((x) => { x.items[i].field = v; })} />}</span></Row>}
        {it.type === 'chart' && <Row label="Grafico"><Select value={it.ref} options={p.charts.map((c) => [c.name, lbl(c.title, c.name)] as [string, string])} onChange={(v) => set((x) => { x.items[i].ref = v; })} /></Row>}
        {it.type === 'report' && <Row label="Report"><Select value={it.ref} options={p.reports.map((c) => [c.name, lbl(c.title, c.name)] as [string, string])} onChange={(v) => set((x) => { x.items[i].ref = v; })} /></Row>}
        {it.type === 'list' && <Row label="Righe"><Num value={it.rows} onChange={(v) => set((x) => { x.items[i].rows = v || 10; })} /></Row>}
        {it.type === 'html' && <Row label="HTML"><LangText multiline value={it.html} onChange={(v) => set((x) => { x.items[i].html = v; })} /></Row>}
        <Row label="Titolo"><LangText value={it.title} onChange={(v) => set((x) => { x.items[i].title = v; })} /></Row>
        <Row label="Larghezza"><Select value={String(it.width || 6)} options={[['3', '1/4'], ['4', '1/3'], ['6', '1/2'], ['8', '2/3'], ['12', 'Intera']]} onChange={(v) => set((x) => { x.items[i].width = Number(v); })} /></Row>
      </div>)}
    </div>
  </>;
}

export default ReportsPanel;
