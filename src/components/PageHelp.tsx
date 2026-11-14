// Page builder helpers: new-page wizard with starting layouts, step-by-step guide, copy the layout to other pages.
import { useState } from 'react';
import { toast, update, useStore } from '../store';
import type { Dashboard, DashItem, Project } from '../types';
import { Btn, Check, I, LangText, Modal, Row, Select, Text, lbl, slug } from './ui';

const isNum = (f: { dbType: string; pk: boolean }) => !f.pk && /int|dec|num|float|double|money/i.test(f.dbType);

export const STARTERS: { id: string; icon: string; name: string; desc: string; needsTable?: boolean }[] = [
  { id: 'empty', icon: 'file-earmark', name: 'Vuota', desc: 'Griglia vuota: aggiungi tu i blocchi.' },
  { id: 'kpi', icon: 'speedometer2', name: 'Cruscotto indicatori', desc: 'Tre indicatori, un grafico e una tabella di una tabella a scelta.', needsTable: true },
  { id: 'landing', icon: 'house', name: 'Pagina iniziale', desc: 'Banner di benvenuto, pulsanti verso le tabelle e un testo.' },
  { id: 'record', icon: 'person-vcard', name: 'Scheda record', desc: 'I campi di un record in griglia; il record arriva dall\'URL (&id=…).', needsTable: true },
  { id: 'analysis', icon: 'graph-up', name: 'Analisi', desc: 'Grafici e report del progetto affiancati.' },
];

/** Blocks of a starting layout, placed on the 12-column grid. */
export function starterItems(id: string, p: Project, table?: string): DashItem[] {
  const t = p.tables.find((x) => x.name === table) || p.tables[0];
  const items: DashItem[] = [];
  const add = (it: Omit<DashItem, 'id'>) => items.push({ ...it, id: `b${items.length + 1}` });
  if (id === 'kpi' && t) {
    const num = t.fields.find(isNum);
    add({ type: 'count', x: 1, y: 1, w: 4, h: 3, table: t.name });
    if (num) add({ type: 'count', x: 5, y: 1, w: 4, h: 3, table: t.name, fn: 'sum', field: num.name });
    if (num) add({ type: 'count', x: 9, y: 1, w: 4, h: 3, table: t.name, fn: 'avg', field: num.name });
    const ch = p.charts.find((c) => c.table === t.name) || p.charts[0];
    if (ch) add({ type: 'chart', x: 1, y: 4, w: 6, h: 8, ref: ch.name });
    add({ type: 'list', x: ch ? 7 : 1, y: 4, w: ch ? 6 : 12, h: 8, table: t.name, rows: 8 });
  } else if (id === 'landing') {
    add({ type: 'code', x: 1, y: 1, w: 12, h: 3, code: '<div style="height:100%;border-radius:10px;padding:18px;color:#fff;background:linear-gradient(135deg,#4f7cff,#8a5cf6)"><h3 class="m-0">Benvenuto</h3><div>Scrivi qui una presentazione.</div></div>' });
    p.tables.slice(0, 3).forEach((tb, i) => add({ type: 'button', x: 1 + i * 4, y: 4, w: 4, h: 2, url: `index.php?p=list&t=${tb.name}`, icon: tb.icon || 'table', title: { it: lbl(tb.caption, tb.name) } }));
    add({ type: 'html', x: 1, y: 6, w: 12, h: 4, html: { it: '<p>Testo libero della pagina.</p>' } });
  } else if (id === 'record' && t) {
    t.fields.filter((f) => !f.pk).slice(0, 9).forEach((f, i) => add({ type: 'field', x: 1 + (i % 3) * 4, y: 1 + Math.floor(i / 3) * 3, w: 4, h: 3, table: t.name, field: f.name, record: { mode: 'param', value: 'id' } }));
  } else if (id === 'analysis') {
    p.charts.slice(0, 2).forEach((c, i) => add({ type: 'chart', x: 1 + i * 6, y: 1, w: 6, h: 8, ref: c.name }));
    p.reports.slice(0, 1).forEach((r) => add({ type: 'report', x: 1, y: 9, w: 12, h: 9, ref: r.name }));
  }
  return items;
}

/** New dashboard/page: name and title, then the starting layout. */
export function PageWizard({ pages, onClose, onCreated }: { pages: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const p = useStore((s) => s.proj)!;
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [start, setStart] = useState('empty');
  const [table, setTable] = useState(p.tables[0]?.name || '');
  const lang = p.project.defaultLanguage;
  const shownName = name || slug(title[lang] || '');
  const taken = p.dashboards.some((d) => d.name === shownName);
  const st = STARTERS.find((s) => s.id === start)!;
  const create = () => {
    if (!shownName || taken) return;
    const d: Dashboard = { name: shownName, title: Object.keys(title).length ? title : { [lang]: shownName }, items: [], ...(pages ? { page: true } : {}) };
    d.items = starterItems(start, p, table);
    update((x) => { x.dashboards.push(d); });
    onCreated(shownName);
  };
  return <Modal wide title={`${pages ? 'Nuova pagina' : 'Nuova dashboard'} · passo ${step} di 2`} onClose={onClose}
    footer={<>{step === 2 && <Btn icon="arrow-left" onClick={() => setStep(1)}>Indietro</Btn>}<span className="grow" />
      {step === 1 ? <Btn kind="primary" icon="arrow-right" disabled={!shownName || taken} onClick={() => setStep(2)}>Avanti</Btn> : <Btn kind="primary" icon="check-lg" onClick={create}>Crea</Btn>}</>}>
    {step === 1 && <>
      <p className="help">{pages ? 'Una pagina non è legata a una tabella: puoi metterci indicatori, grafici, tabelle, testi, immagini, pulsanti e codice.' : 'Una dashboard raccoglie indicatori, grafici e tabelle in un colpo d\'occhio.'} Dopo la creazione la trovi nel Menu e nei permessi di Sicurezza.</p>
      <Row label="Titolo" hint="Quello che vede l'utente, in tutte le lingue del progetto."><LangText value={title} onChange={(v) => setTitle(v)} /></Row>
      <Row label="Identificativo" hint="Usato nell'indirizzo (d=…); solo lettere, numeri e _."><Text mono value={name} placeholder={slug(title[lang] || '')} onChange={(v) => setName(slug(v))} /></Row>
      {taken && <p className="help" style={{ color: 'var(--danger, #d33)' }}>Esiste già una pagina o dashboard «{shownName}».</p>}
    </>}
    {step === 2 && <>
      <p className="help">Scegli da dove partire: potrai cambiare tutto.</p>
      <div className="inline wrap" style={{ gap: 10, alignItems: 'stretch' }}>
        {STARTERS.map((s) => <button key={s.id} type="button" className={`nav-item ${start === s.id ? 'on' : ''}`} style={{ width: 200, textAlign: 'left', padding: 12, display: 'block' }} onClick={() => setStart(s.id)}>
          <I n={s.icon} /> <b>{s.name}</b><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.desc}</div></button>)}
      </div>
      {st.needsTable && <Row label="Tabella"><Select value={table} options={p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string])} onChange={setTable} /></Row>}
    </>}
  </Modal>;
}

const STEPS: { icon: string; title: string; body: React.ReactNode }[] = [
  { icon: 'plus-square', title: '1 · Aggiungi i blocchi', body: <>Usa i pulsanti sopra la griglia: <b>Indicatore</b> (conteggio, somma, media…), <b>Campo</b> (valore di un campo di un record), <b>Grafico</b>, <b>Tabella</b>, <b>Report</b>, <b>Testo</b>, <b>Codice</b> (HTML/JS), <b>Immagine</b>, <b>Pagina web</b>, <b>Pulsante</b>. Ogni blocco nasce in fondo alla pagina.</> },
  { icon: 'arrows-move', title: '2 · Sposta e ridimensiona', body: <>Trascina un blocco per spostarlo; il triangolo in basso a destra lo ridimensiona. La griglia ha 12 colonne e righe da 40 px. I blocchi non si sovrappongono: quelli sotto scendono. Con <b>Duplica</b> ed <b>Elimina</b> nell'intestazione del blocco, o i numeri esatti nel pannello «Posizione».</> },
  { icon: 'sliders', title: '3 · Proprietà del blocco', body: <>Clicca un blocco: a destra compaiono le sue proprietà (tabella, campo, grafico, titolo, stile CSS…). Il <b>Campo</b> mostra un record scelto per «primo», «ultimo», chiave fissa o <b>parametro URL</b>: con <code>index.php?p=dashboard&amp;d=scheda&amp;id=7</code> mostra il record 7.</> },
  { icon: 'code-slash', title: '4 · Codice, CSS e JavaScript', body: <>Il blocco <b>Codice</b> scrive HTML, <code>&lt;style&gt;</code> e <code>&lt;script&gt;</code> nella pagina senza filtri. Le schede <b>Stile (CSS)</b> e <b>JavaScript</b> valgono per tutta la pagina. Nel JavaScript c'è <code>mcPage</code>: <code>mcPage.items['b2'].value</code>, <code>mcPage.el('b2')</code>, <code>mcPage.chart('b3').then(c =&gt; …)</code> (istanza ECharts), <code>mcPage.ready(fn)</code>. Gli id dei blocchi sono nel pannello a destra.</> },
  { icon: 'files', title: '5 · Applica ad altre pagine', body: <>Con <b>Applica ad altre pagine</b> copi CSS, JavaScript, titolo e blocchi (selezionato, tutti in coda o sostituendo) su dashboard e pagine che scegli. È una copia: le pagine restano indipendenti.</> },
  { icon: 'signpost-split', title: '6 · Menu e permessi', body: <>Aggiungi la pagina al <b>Menu</b> con «Dashboard/Pagina» e dai il permesso «Elenco» ai gruppi in <b>Sicurezza</b>. L'indirizzo è <code>index.php?p=dashboard&amp;d=nome</code>.</> },
];

const EXAMPLES: { label: string; code: string }[] = [
  { label: 'Aggiorna ogni 60 s', code: "setInterval(function () { location.reload(); }, 60000);" },
  { label: 'Colora un indicatore', code: "var v = mcPage.value('b2');\nif (v > 1000) mcPage.el('b2').style.outline = '3px solid #2ecc71';" },
  { label: 'Cambia il grafico', code: "mcPage.chart('b3').then(function (c) {\n  c.setOption({ title: { text: 'Titolo mio' } });\n});" },
];

export function PageGuide({ onClose, onInsertJs }: { onClose: () => void; onInsertJs: (code: string) => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return <Modal wide title={<><I n="question-circle" /> Guida a pagine e dashboard</>} onClose={onClose}
    footer={<><Btn icon="arrow-left" disabled={i === 0} onClick={() => setI(i - 1)}>Indietro</Btn><span className="grow" /><span className="muted">{i + 1} / {STEPS.length}</span><span className="grow" />
      {i < STEPS.length - 1 ? <Btn kind="primary" icon="arrow-right" onClick={() => setI(i + 1)}>Avanti</Btn> : <Btn kind="primary" icon="check-lg" onClick={onClose}>Chiudi</Btn>}</>}>
    <h3 style={{ marginTop: 0 }}><I n={s.icon} /> {s.title}</h3>
    <p>{s.body}</p>
    {i === 3 && <><p className="help">Esempi da inserire nel JavaScript della pagina (adatta gli id dei blocchi):</p>
      <div className="inline wrap">{EXAMPLES.map((e) => <Btn key={e.label} small icon="plus" onClick={() => { onInsertJs(e.code); toast('Esempio aggiunto al JavaScript della pagina', 'ok'); }}>{e.label}</Btn>)}</div></>}
  </Modal>;
}

/** Copy parts of the current page to other dashboards/pages. */
export function PropagateDialog({ d, selected, onClose }: { d: Dashboard; selected?: string; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const others = p.dashboards.filter((x) => x.name !== d.name);
  const [to, setTo] = useState<Record<string, boolean>>({});
  const [css, setCss] = useState(true), [js, setJs] = useState(true), [hide, setHide] = useState(false), [titleToo, setTitleToo] = useState(false);
  const [blocks, setBlocks] = useState<'none' | 'selected' | 'append' | 'replace'>('none');
  const chosen = others.filter((x) => to[x.name]);
  const apply = () => {
    update((proj) => {
      for (const t of proj.dashboards.filter((x) => to[x.name])) {
        if (css) t.css = d.css;
        if (js) t.js = d.js;
        if (hide) t.hideTitle = d.hideTitle;
        if (titleToo) t.title = structuredClone(d.title);
        const src = blocks === 'selected' ? d.items.filter((i) => i.id === selected) : blocks === 'none' ? [] : d.items;
        if (blocks === 'replace') t.items = structuredClone(src);
        else if (src.length) {
          const used = new Set(t.items.map((i) => i.id));
          const top = Math.min(...src.map((i) => i.y || 1));
          const base = Math.max(0, ...t.items.map((i) => (i.y || 1) + (i.h || 6) - 1)) + 1;
          let n = t.items.length;
          for (const it of structuredClone(src)) {
            do n++; while (used.has(`b${n}`));
            it.id = `b${n}`; used.add(it.id);
            it.y = base + ((it.y || 1) - top);
            t.items.push(it);
          }
        }
      }
    });
    toast(`Layout applicato a ${chosen.length} ${chosen.length === 1 ? 'pagina' : 'pagine'}`, 'ok');
    onClose();
  };
  const sel = d.items.find((i) => i.id === selected);
  return <Modal title="Applica ad altre pagine" onClose={onClose} footer={<><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" disabled={!chosen.length} onClick={apply}>Applica a {chosen.length}</Btn></>}>
    {!others.length && <p className="help">Non ci sono altre pagine o dashboard nel progetto.</p>}
    {!!others.length && <>
      <p className="help">Copia da «{lbl(d.title, d.name)}». È una copia una tantum: le pagine di destinazione restano indipendenti.</p>
      <Row label="Destinazioni"><div>
        <Check value={chosen.length === others.length} onChange={(v) => setTo(Object.fromEntries(others.map((x) => [x.name, v])))} label="Tutte" />
        {others.map((x) => <div key={x.name}><Check value={!!to[x.name]} onChange={(v) => setTo({ ...to, [x.name]: v })} label={<>{lbl(x.title, x.name)} <span className="muted">· {x.page ? 'pagina' : 'dashboard'}</span></>} /></div>)}</div></Row>
      <Row label="Cosa copiare"><div>
        <Check value={css} onChange={setCss} label="Stile (CSS)" />
        <Check value={js} onChange={setJs} label="JavaScript" />
        <Check value={hide} onChange={setHide} label="Titolo in cima (mostra/nascondi)" />
        <Check value={titleToo} onChange={setTitleToo} label="Titolo della pagina" /></div></Row>
      <Row label="Blocchi"><Select value={blocks} onChange={setBlocks} options={[['none', 'Nessuno'], ['selected', sel ? `Solo il blocco selezionato (${sel.id}), in coda` : 'Solo il blocco selezionato (nessuno selezionato)'], ['append', 'Tutti i blocchi, in coda'], ['replace', 'Tutti i blocchi, sostituendo quelli esistenti']]} /></Row>
      {blocks === 'replace' && <p className="help" style={{ color: 'var(--danger, #d33)' }}>I blocchi attuali delle pagine scelte verranno persi (si può annullare con «Annulla» in alto).</p>}
    </>}
  </Modal>;
}
