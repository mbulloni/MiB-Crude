// Free-layout editor for dashboards and pages: blocks dragged and resized on a 12-column grid (rows of 40px).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Dashboard, DashItem } from '../types';
import CodeEditor from './CodeEditor';
import { PageGuide, PropagateDialog } from './PageHelp';
import { Btn, Check, I, LangText, Num, Row, Section, Select, Tabs, Text, lbl } from './ui';

const COLS = 12, ROW = 40, GAP = 12;
const FNS: [string, string][] = [['sum', 'Somma'], ['avg', 'Media'], ['count', 'Conteggio'], ['min', 'Minimo'], ['max', 'Massimo']];
type Type = DashItem['type'];
const KINDS: Record<string, { label: string; icon: string; w: number; h: number }> = {
  count: { label: 'Indicatore', icon: '123', w: 3, h: 3 }, kpi: { label: 'Indicatore', icon: '123', w: 3, h: 3 },
  field: { label: 'Campo', icon: 'input-cursor-text', w: 3, h: 3 }, chart: { label: 'Grafico', icon: 'bar-chart', w: 6, h: 7 },
  report: { label: 'Report', icon: 'file-earmark-bar-graph', w: 12, h: 9 }, list: { label: 'Tabella', icon: 'table', w: 6, h: 9 },
  html: { label: 'Testo', icon: 'type', w: 12, h: 4 }, code: { label: 'Codice', icon: 'code-slash', w: 6, h: 5 },
  image: { label: 'Immagine', icon: 'image', w: 4, h: 6 }, frame: { label: 'Pagina web', icon: 'window', w: 12, h: 9 },
  button: { label: 'Pulsante', icon: 'cursor', w: 3, h: 2 },
};

const HINTS: Record<string, string> = {
  count: 'Numero grande: conteggio dei record o somma/media/minimo/massimo di un campo. Il clic apre la lista.', kpi: 'Numero grande.',
  field: 'Valore di un campo di un record. Con «Parametro URL» il record arriva dall\'indirizzo della pagina.',
  chart: 'Un grafico del progetto (si crea in «Grafici»). Dal JavaScript: mcPage.chart(id).', report: 'Un report del progetto (si crea in «Report»).',
  list: 'Lista di una tabella con ricerca e paginazione; «Righe» = righe per pagina.', html: 'Testo formattato (HTML filtrato: niente script).',
  code: 'HTML, CSS e JavaScript scritti nella pagina senza filtri. Dai al contenuto un id e usalo dal JavaScript di pagina.',
  image: 'Immagine da un indirizzo o da un file della cartella «public/» del progetto.', frame: 'Un\'altra pagina web dentro un riquadro (alcuni siti non lo consentono).',
  button: 'Collegamento a una pagina dell\'app (index.php?p=list&t=tabella) o a un sito.',
};

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const box = (it: DashItem): Box => ({ x: it.x || 1, y: it.y || 1, w: it.w || 6, h: it.h || 6 });
const clamp = (b: Box): Box => { const w = Math.max(1, Math.min(COLS, b.w)); return { w, h: Math.max(1, b.h), x: Math.max(1, Math.min(COLS - w + 1, b.x)), y: Math.max(1, b.y) }; };

/** Items never overlap: the pinned one stays, the others are pushed down. */
function resolve(items: DashItem[], pinned?: number): DashItem[] {
  const out = items.map((it) => ({ ...it }));
  const placed: Box[] = [];
  const order = out.map((_, i) => i).sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : (out[a].y || 1) - (out[b].y || 1) || (out[a].x || 1) - (out[b].x || 1)));
  for (const i of order) {
    const b = clamp(box(out[i]));
    while (placed.some((p) => hit(p, b))) b.y++;
    placed.push(b);
    Object.assign(out[i], b);
  }
  return out;
}

/** Older dashboards (flow by width): give every block an id and a grid position. */
export function normalize(d: Dashboard): boolean {
  let changed = false;
  const used = new Set(d.items.map((i) => i.id).filter(Boolean));
  let n = 0;
  const placed: Box[] = [];
  for (const it of d.items) {
    if (!it.id) { do n++; while (used.has(`b${n}`)); it.id = `b${n}`; used.add(it.id); changed = true; }
    if (it.x === undefined || it.y === undefined || !it.w || !it.h) {
      const k = KINDS[it.type] || KINDS.html;
      const w = Math.max(1, Math.min(COLS, it.width || k.w)), h = it.h || Math.max(2, Math.round((it.height || k.h * ROW) / ROW));
      const b = { x: 1, y: 1, w, h };
      for (; ; b.y++) { let ok = false; for (b.x = 1; b.x + w - 1 <= COLS; b.x++) if (!placed.some((p) => hit(p, b))) { ok = true; break; } if (ok) break; }
      Object.assign(it, b); changed = true;
    }
    placed.push(box(it));
  }
  return changed;
}

type Drag = { i: number; mode: 'move' | 'resize'; x0: number; y0: number; orig: Box };

export default function PageBuilder({ d, set }: { d: Dashboard; set: (fn: (x: Dashboard) => void) => void }) {
  const p = useStore((s) => s.proj)!;
  const [tab, setTab] = useState<'layout' | 'css' | 'js'>('layout');
  const [sel, setSel] = useState('');
  const [dlg, setDlg] = useState<'' | 'guide' | 'propagate'>('');
  const seen = () => { try { return localStorage.getItem('mc-pb-guide') === '1'; } catch { return true; } };
  const closeGuide = () => { try { localStorage.setItem('mc-pb-guide', '1'); } catch { /* ignore */ } setDlg(''); };
  useEffect(() => { if (!d.items.length && !seen()) setDlg('guide'); }, [d.name]);
  const [prev, setPrev] = useState<DashItem[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => { if (d.items.some((i) => !i.id || i.x === undefined || !i.w || !i.h)) set((x) => { normalize(x); x.items = resolve(x.items); }); }, [d.name, d.items.length]);

  const items = prev || d.items;
  const cur = d.items.findIndex((i) => i.id === sel);
  const edit = (fn: (it: DashItem) => void) => set((x) => { const it = x.items.find((i) => i.id === sel); if (it) { fn(it); x.items = resolve(x.items, x.items.indexOf(it)); } });
  const tables = p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string]);
  const fieldsOf = (t?: string) => (p.tables.find((x) => x.name === t)?.fields || []).map((f) => [f.name, lbl(f.label, f.name)] as [string, string]);

  const add = (type: Type) => set((x) => {
    const k = KINDS[type];
    const ids = new Set(x.items.map((i) => i.id));
    let n = x.items.length + 1; while (ids.has(`b${n}`)) n++;
    const it: DashItem = { id: `b${n}`, type, x: 1, y: Math.max(0, ...x.items.map((i) => (i.y || 1) + (i.h || 6) - 1)) + 1, w: k.w, h: k.h };
    if (type === 'count') it.table = p.tables[0]?.name;
    if (type === 'list') { it.table = p.tables[0]?.name; it.rows = 10; }
    if (type === 'field') { it.table = p.tables[0]?.name; it.field = p.tables[0]?.fields[0]?.name; it.record = { mode: 'first' }; }
    if (type === 'chart') it.ref = p.charts[0]?.name;
    if (type === 'report') it.ref = p.reports[0]?.name;
    if (type === 'html') it.html = { it: '<p>Testo</p>' };
    if (type === 'code') it.code = '<div id="mio-blocco">Ciao</div>';
    if (type === 'button') it.title = { it: 'Apri' };
    x.items.push(it); setSel(it.id!);
  });

  const start = (e: React.PointerEvent, i: number, mode: Drag['mode']) => {
    if ((e.target as HTMLElement).closest('.pb-act')) return;
    e.preventDefault(); e.stopPropagation();
    setSel(d.items[i].id!);
    drag.current = { i, mode, x0: e.clientX, y0: e.clientY, orig: box(d.items[i]) };
    const move = (ev: PointerEvent) => {
      const g = drag.current, c = canvas.current; if (!g || !c) return;
      const stepX = (c.clientWidth + GAP) / COLS, stepY = ROW + GAP;
      const dx = Math.round((ev.clientX - g.x0) / stepX), dy = Math.round((ev.clientY - g.y0) / stepY);
      const b = g.mode === 'move' ? clamp({ ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy }) : clamp({ ...g.orig, w: g.orig.w + dx, h: g.orig.h + dy });
      setPrev(resolve(d.items.map((it, k) => (k === g.i ? { ...it, ...b } : it)), g.i));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      drag.current = null;
      setPrev((pv) => { if (pv) set((x) => { x.items = pv; }); return null; });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const summary = (it: DashItem) => {
    switch (it.type) {
      case 'count': case 'kpi': return `${lbl(p.tables.find((t) => t.name === it.table)?.caption, it.table || '')} · ${it.fn || 'count'}${it.field ? ' ' + it.field : ''}`;
      case 'field': return `${it.table || ''}.${it.field || ''}`;
      case 'list': return it.table || '';
      case 'chart': case 'report': return it.ref || '';
      case 'html': return lbl(it.html).replace(/<[^>]+>/g, ' ').slice(0, 60);
      case 'code': return (it.code || '').slice(0, 60);
      case 'image': case 'frame': case 'button': return it.url || '';
    }
    return '';
  };
  const rows = Math.max(8, ...items.map((i) => (i.y || 1) + (i.h || 6))) + 2;
  const it = d.items[cur];

  return <>
    <Tabs tabs={[['layout', 'Layout', 'layout-wtf'], ['css', 'Stile (CSS)', 'palette'], ['js', 'JavaScript', 'braces']]} value={tab} onChange={setTab} />
    {tab === 'layout' && <>
      <div className="inline wrap" style={{ margin: '8px 0' }}>
        <Btn small icon="question-circle" onClick={() => setDlg('guide')}>Guida</Btn>
        <Btn small icon="files" onClick={() => setDlg('propagate')}>Applica ad altre pagine</Btn><span style={{ width: 12 }} />
        {(['count', 'field', 'chart', 'list', 'report', 'html', 'code', 'image', 'frame', 'button'] as Type[]).map((t) =>
          <Btn key={t} small icon={KINDS[t].icon} disabled={(t === 'chart' && !p.charts.length) || (t === 'report' && !p.reports.length) || ((t === 'count' || t === 'list' || t === 'field') && !p.tables.length)} onClick={() => add(t)}>{KINDS[t].label}</Btn>)}
      </div>
      <p className="help">Trascina un blocco per spostarlo, il quadratino in basso a destra per ridimensionarlo. I blocchi non si sovrappongono: gli altri scendono.</p>
      {!d.items.length && <p className="help"><I n="lightbulb" /> Pagina vuota: aggiungi un blocco con i pulsanti qui sopra, oppure apri la <b>Guida</b>.</p>}
      <div className="pb-wrap">
        <div className="pb-canvas" ref={canvas} style={{ gridAutoRows: ROW, gap: GAP, minHeight: rows * (ROW + GAP) }} onPointerDown={() => setSel('')}>
          {items.map((b, i) => {
            const k = KINDS[b.type] || KINDS.html;
            return <div key={b.id || i} className={`pb-block ${b.id === sel ? 'on' : ''} ${prev && drag.current?.i === i ? 'drag' : ''}`}
              style={{ gridColumn: `${b.x || 1} / span ${b.w || 6}`, gridRow: `${b.y || 1} / span ${b.h || 6}` }}
              onPointerDown={(e) => { e.stopPropagation(); start(e, i, 'move'); }}>
              <div className="pb-head"><I n={k.icon} /> <b>{k.label}</b><span className="grow" />
                <button className="pb-act" title="Duplica" onClick={() => set((x) => { const c = structuredClone(x.items[i]); const ids = new Set(x.items.map((q) => q.id)); let n = x.items.length + 1; while (ids.has(`b${n}`)) n++; c.id = `b${n}`; c.y = (c.y || 1) + (c.h || 6); x.items.push(c); x.items = resolve(x.items, x.items.length - 1); })}><I n="copy" /></button>
                <button className="pb-act" title="Elimina" onClick={() => { set((x) => { x.items.splice(i, 1); }); setSel(''); }}><I n="x-lg" /></button></div>
              <div className="pb-body">{lbl(b.title) ? <b>{lbl(b.title)}</b> : <span className="muted">{summary(b)}</span>}</div>
              <div className="pb-rz" onPointerDown={(e) => start(e, i, 'resize')} />
            </div>;
          })}
        </div>
        {it && <div className="pb-insp">
          <Section title={`${(KINDS[it.type] || KINDS.html).label} · ${it.id}`} help={HINTS[it.type]}>
            {['count', 'kpi', 'list', 'field'].includes(it.type) && <Row label="Tabella"><Select value={it.table} options={tables} onChange={(v) => edit((q) => { q.table = v; if (q.type === 'field') q.field = fieldsOf(v)[0]?.[0]; })} /></Row>}
            {(it.type === 'count' || it.type === 'kpi') && <Row label="Valore"><span className="inline"><Select value={it.fn || 'count'} options={FNS} onChange={(v) => edit((q) => { q.fn = v; })} />
              {it.fn && it.fn !== 'count' && <Select value={it.field} options={fieldsOf(it.table)} onChange={(v) => edit((q) => { q.field = v; })} />}</span></Row>}
            {it.type === 'field' && <>
              <Row label="Campo"><Select value={it.field} options={fieldsOf(it.table)} onChange={(v) => edit((q) => { q.field = v; })} /></Row>
              <Row label="Record" hint="Chiave singola. «Parametro URL»: il valore arriva da index.php?p=dashboard&d=…&NOME=…"><span className="inline">
                <Select value={it.record?.mode || 'first'} options={[['first', 'Primo'], ['last', 'Ultimo'], ['key', 'Chiave fissa'], ['param', 'Parametro URL']]} onChange={(v) => edit((q) => { q.record = { mode: v as any, value: q.record?.value }; })} />
                {(it.record?.mode === 'key' || it.record?.mode === 'param') && <Text value={it.record?.value} placeholder={it.record?.mode === 'param' ? 'id' : 'valore'} onChange={(v) => edit((q) => { q.record = { mode: q.record!.mode, value: v }; })} />}</span></Row></>}
            {it.type === 'chart' && <Row label="Grafico"><Select value={it.ref} options={p.charts.map((c) => [c.name, lbl(c.title, c.name)] as [string, string])} onChange={(v) => edit((q) => { q.ref = v; })} /></Row>}
            {it.type === 'report' && <Row label="Report"><Select value={it.ref} options={p.reports.map((c) => [c.name, lbl(c.title, c.name)] as [string, string])} onChange={(v) => edit((q) => { q.ref = v; })} /></Row>}
            {it.type === 'list' && <Row label="Righe"><Num value={it.rows} onChange={(v) => edit((q) => { q.rows = v || 10; })} /></Row>}
            {it.type === 'html' && <><Row label="Testo"><LangText multiline value={it.html} onChange={(v) => edit((q) => { q.html = v; })} /></Row>
              <Row label="Riquadro"><Check value={it.card !== false} onChange={(v) => edit((q) => { q.card = v; })} label="Mostra come scheda" /></Row></>}
            {it.type === 'code' && <Row label="HTML/JS" hint="Codice non filtrato: HTML, <style> e <script> vengono scritti nella pagina così come sono."><CodeEditor language="html" value={it.code || ''} onChange={(v) => edit((q) => { q.code = v; })} height={220} /></Row>}
            {['image', 'frame', 'button'].includes(it.type) && <Row label={it.type === 'button' ? 'Indirizzo' : 'URL'} hint={it.type === 'image' ? 'Anche un file in «public/» del progetto, es. img/logo.png' : undefined}><Text value={it.url} mono onChange={(v) => edit((q) => { q.url = v; })} /></Row>}
            {it.type === 'image' && <Row label="Testo alternativo"><Text value={it.alt} onChange={(v) => edit((q) => { q.alt = v; })} /></Row>}
            {it.type === 'button' && <><Row label="Icona" hint="Nome Bootstrap Icons, es. arrow-right"><Text value={it.icon} onChange={(v) => edit((q) => { q.icon = v; })} /></Row>
              <Row label="Apri"><Check value={it.newWindow} onChange={(v) => edit((q) => { q.newWindow = v; })} label="In una nuova scheda" /></Row></>}
            {it.type !== 'code' && it.type !== 'image' && it.type !== 'frame' && <Row label={it.type === 'button' ? 'Etichetta' : 'Titolo'}><LangText value={it.title} onChange={(v) => edit((q) => { q.title = v; })} /></Row>}
            {['html', 'code', 'image'].includes(it.type) && <Row label="Stile CSS" hint="Es. background:#eef; padding:12px"><Text value={it.style} mono onChange={(v) => edit((q) => { q.style = v; })} /></Row>}
            <Row label="Posizione"><span className="inline">
              {(['x', 'y', 'w', 'h'] as const).map((k) => <span key={k} className="inline">{{ x: 'Col', y: 'Riga', w: 'Largh.', h: 'Alt.' }[k]} <Num value={it[k]} min={1} max={k === 'y' || k === 'h' ? 200 : COLS} onChange={(v) => edit((q) => { q[k] = Number(v) || 1; })} /></span>)}</span></Row>
          </Section>
        </div>}
      </div>
    </>}
    {tab === 'css' && <Section title="CSS della pagina" help="Applicato solo a questa pagina. I blocchi hanno l'attributo data-block=«id» (es. [data-block=&quot;b2&quot;]).">
      <CodeEditor language="css" value={d.css || ''} onChange={(v) => set((x) => { x.css = v; })} height={360} /></Section>}
    {tab === 'js' && <Section title="JavaScript della pagina" help="Eseguito a pagina caricata. Disponibile mcPage: mcPage.items[id].value (indicatori e campi), mcPage.el(id) (elemento del blocco), mcPage.chart(id) (Promise dell'istanza ECharts), mcPage.ready(fn).">
      <CodeEditor language="javascript" value={d.js || ''} onChange={(v) => set((x) => { x.js = v; })} height={360} /></Section>}
    <Row label="Titolo"><Check value={!d.hideTitle} onChange={(v) => set((x) => { x.hideTitle = !v; })} label="Mostra il titolo in cima alla pagina" /></Row>
    {dlg === 'guide' && <PageGuide onClose={closeGuide} onInsertJs={(code) => set((x) => { x.js = (x.js ? x.js + '\n\n' : '') + code; })} />}
    {dlg === 'propagate' && <PropagateDialog d={d} selected={sel} onClose={() => setDlg('')} />}
  </>;
}
