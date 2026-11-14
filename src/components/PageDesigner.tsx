// Page designer of a table: Modifica/Nuovo/Visualizza use the same free-grid editor as the project pages; the other pages pick fields.
import { useEffect, useState } from 'react';
import { toast, update, useStore } from '../store';
import type { DashItem, Dashboard, Field, Table } from '../types';
import PageBuilder, { FIELD_H, normalize } from './PageBuilder';
import { Btn, Check, Modal, Row, Tabs, lbl } from './ui';

type Page = 'list' | 'view' | 'add' | 'edit' | 'delete' | 'search' | 'export' | 'import' | 'print';
const PAGES: [Page, string, string][] = [['list', 'Lista', 'list-ul'], ['view', 'Visualizza', 'eye'], ['add', 'Nuovo', 'plus-square'], ['edit', 'Modifica', 'pencil-square'], ['delete', 'Elimina', 'trash'], ['search', 'Ricerca avanzata', 'funnel'], ['export', 'Esporta', 'download'], ['import', 'Importa', 'upload'], ['print', 'Stampa', 'printer']];
const PICK_HELP: Partial<Record<Page, string>> = {
  list: 'Colonne mostrate nella lista (l\'ordine è quello della scheda Campi).',
  search: 'Campi su cui si può filtrare nella ricerca avanzata.',
  export: 'Campi inclusi nei file esportati.',
  import: 'Campi che si possono compilare importando un file.',
  print: 'Campi stampati.',
};

type OldSec = { title: Record<string, string>; fields: string[]; columns?: number; blocks?: { type: 'html' | 'snippet'; html?: Record<string, string>; event?: string }[] };

/** Section layout (or the automatic one) of a page, laid out on the grid: one row of blocks per section, fields by their old width. */
function toGrid(t: Table, page: string, lang: string): DashItem[] {
  const cols = Number(t.pages[page]?.columns) || 1;
  const visible = t.fields.filter((f) => f.show[page]);
  const secs = ((t.layout?.[page]?.sections || []) as OldSec[]);
  const placed = new Set(secs.flatMap((s) => s.fields));
  const list: OldSec[] = secs.length ? [...secs, ...(visible.some((f) => !placed.has(f.name)) ? [{ title: {}, fields: visible.filter((f) => !placed.has(f.name)).map((f) => f.name) }] : [])] : [{ title: {}, fields: visible.map((f) => f.name) }];
  const items: DashItem[] = [];
  let y = 1, n = 0;
  const id = () => `b${++n}`;
  const spanOf = (f: Field, c: number) => f.layout?.[page]?.span || (['textarea', 'richtext', 'signature'].includes(f.editAs.type) ? 12 : Math.floor(12 / c));
  for (const s of list) {
    const title = lbl(s.title, '');
    if (title) { items.push({ id: id(), type: 'html', x: 1, y, w: 12, h: 1, card: false, html: { [lang]: `<h5>${title.replace(/</g, '&lt;')}</h5>` } }); y += 1; }
    for (const b of s.blocks || []) { items.push(b.type === 'html' ? { id: id(), type: 'html', x: 1, y, w: 12, h: 2, card: false, html: b.html } : { id: id(), type: 'snippet', x: 1, y, w: 12, h: 3, event: b.event }); y += b.type === 'html' ? 2 : 3; }
    let cx = 1, rowH = 0;
    for (const name of s.fields) {
      const f = t.fields.find((q) => q.name === name);
      if (!f || !f.show[page]) continue;
      const w = Math.min(12, spanOf(f, s.columns || cols)), h = FIELD_H(f);
      if (cx + w - 1 > 12) { y += rowH; cx = 1; rowH = 0; }
      items.push({ id: id(), type: 'field', field: name, x: cx, y, w, h });
      cx += w; rowH = Math.max(rowH, h);
    }
    y += rowH;
  }
  return items;
}

const LAYOUT_PAGES: [Page, string][] = [['edit', 'Modifica'], ['add', 'Nuovo'], ['view', 'Visualizza']];

/** Copy the design of the current page to other pages: the table's own pages, or pages of other tables (only the fields they have). */
function CopyDesign({ t, page, onClose }: { t: Table; page: Page; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [to, setTo] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const targets = p.tables.flatMap((x) => LAYOUT_PAGES.filter(([k]) => (x.name !== t.name || k !== page) && (x.pages[k]?.enabled || k === 'edit')).map(([k, l]) => ({ key: `${x.name}:${k}`, table: x, page: k, label: l })));
  const chosen = targets.filter((x) => to[x.key]);
  const src = (t.layout?.[page]?.grid || []) as DashItem[];
  const apply = () => {
    update((d) => {
      for (const tg of chosen) {
        const x = d.tables.find((y) => y.name === tg.table.name)!;
        const mine = tg.table.name === t.name;
        let items = structuredClone(src).filter((i) => i.type !== 'field' || mine || x.fields.some((f) => f.name === i.field && f.show[tg.page]));
        if (!mine) items = items.filter((i) => i.type !== 'snippet');
        x.layout = x.layout || {};
        if (mode === 'replace') { x.layout[tg.page] = { grid: items }; continue; }
        const cur = structuredClone(x.layout[tg.page]?.grid || []);
        const have = new Set(cur.map((i) => i.id)), taken = new Set(cur.filter((i) => i.type === 'field').map((i) => i.field));
        const base = Math.max(0, ...cur.map((i) => (i.y || 1) + (i.h || 6) - 1)), top = Math.min(1e9, ...items.map((i) => i.y || 1));
        let n = cur.length;
        for (const it of items) {
          if (it.type === 'field' && taken.has(it.field)) continue;
          do n++; while (have.has(`b${n}`));
          it.id = `b${n}`; have.add(it.id); it.y = base + 1 + ((it.y || 1) - top);
          cur.push(it);
        }
        x.layout[tg.page] = { grid: cur };
      }
    });
    toast(`Design copiato su ${chosen.length} ${chosen.length === 1 ? 'pagina' : 'pagine'}`, 'ok');
    onClose();
  };
  const tables = [...new Set(targets.map((x) => x.table.name))];
  return <Modal title="Copia il design su altre pagine" onClose={onClose} footer={<><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" disabled={!chosen.length} onClick={apply}>Copia su {chosen.length}</Btn></>}>
    <p className="help">Copia il design di «{PAGES.find(([k]) => k === page)![1]}» di {lbl(t.caption, t.name)}. Le pagine di destinazione restano indipendenti. Su altre tabelle vengono copiati solo i campi che hanno lo stesso nome (e i blocchi non-campo).</p>
    <Row label="Pagine"><div>
      <Check value={chosen.length === targets.length} onChange={(v) => setTo(Object.fromEntries(targets.map((x) => [x.key, v])))} label="Tutte" />
      {tables.map((tn) => { const own = targets.filter((x) => x.table.name === tn); return <div key={tn} style={{ marginTop: 6 }}>
        <Check value={own.every((x) => to[x.key])} onChange={(v) => setTo({ ...to, ...Object.fromEntries(own.map((x) => [x.key, v])) })} label={<b>{lbl(own[0].table.caption, tn)}{tn === t.name ? ' (questa tabella)' : ''}</b>} />
        <div style={{ paddingLeft: 22 }}>{own.map((x) => <Check key={x.key} value={!!to[x.key]} onChange={(v) => setTo({ ...to, [x.key]: v })} label={x.label} />)}</div></div>; })}</div></Row>
    <Row label="Come"><div>
      <Check value={mode === 'replace'} onChange={() => setMode('replace')} label="Sostituisci il design esistente" />
      <Check value={mode === 'append'} onChange={() => setMode('append')} label="Aggiungi in fondo (i campi già collocati non si duplicano)" /></div></Row>
  </Modal>;
}

export default function PageDesigner({ t, readOnly }: { t: Table; readOnly?: boolean }) {
  const p = useStore((s) => s.proj)!;
  const enabledPages = PAGES.filter(([k]) => t.pages[k]?.enabled || k === 'edit');
  const [pageSel, setPage] = useState<Page>('edit');
  const page: Page = enabledPages.some(([k]) => k === pageSel) ? pageSel : 'edit';
  const grid = t.layout?.[page]?.grid;
  const isLayout = ['edit', 'add', 'view'].includes(page);

  // First time on a page: the old section layout (or the automatic one) becomes grid blocks.
  useEffect(() => {
    if (readOnly || !isLayout || grid) return;
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      const items = toGrid(x, page, p.project.defaultLanguage);
      x.layout = x.layout || {};
      x.layout[page] = { grid: items };
    });
  }, [t.name, page, !!grid]);

  const [copy, setCopy] = useState(false);
  const tabs = <Tabs value={page} onChange={setPage} tabs={enabledPages} />;
  if (!['edit', 'add', 'view'].includes(page)) {
    const pickable = page !== 'delete';
    return (
      <div className="pd">
        <div className="inline wrap">{tabs}</div>
        <div className="pd-canvas" style={{ padding: 16 }}>
          {pickable ? <>
            <p className="help">{PICK_HELP[page]} Qui non ci sono sezioni da disegnare: scegli i campi.</p>
            <div className="chips">
              {t.fields.map((f) => <label key={f.name} className="check"><input type="checkbox" disabled={readOnly} checked={!!f.show[page]} onChange={(e) => update((d) => { const x = d.tables.find((y) => y.name === t.name)!.fields.find((y) => y.name === f.name)!; x.show = { ...x.show, [page]: e.target.checked }; })} /> {lbl(f.label, f.name)}</label>)}
            </div>
            <div className="inline" style={{ marginTop: 12 }}>
              <Btn small disabled={readOnly} onClick={() => update((d) => { for (const x of d.tables.find((y) => y.name === t.name)!.fields) x.show = { ...x.show, [page]: true }; })}>Tutti</Btn>
              <Btn small kind="ghost" disabled={readOnly} onClick={() => update((d) => { for (const x of d.tables.find((y) => y.name === t.name)!.fields) x.show = { ...x.show, [page]: false }; })}>Nessuno</Btn>
            </div>
          </> : <p className="help">La pagina Elimina chiede conferma e rimuove il record: non ha campi né layout da configurare. I permessi stanno in Sicurezza.</p>}
        </div>
      </div>
    );
  }
  const dash: Dashboard = { name: `${t.name}:${page}`, title: {}, items: grid || [] };
  const set = (fn: (x: Dashboard) => void) => {
    if (readOnly) return;
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      const tmp: Dashboard = { name: dash.name, title: {}, items: structuredClone(x.layout?.[page]?.grid || []) };
      fn(tmp);
      normalize(tmp);
      x.layout = x.layout || {};
      x.layout[page] = { grid: tmp.items };
    });
  };
  return (
    <div className="pd">
      <div className="inline wrap">{tabs}<span className="grow" />
        {!readOnly && <Btn small icon="files" onClick={() => setCopy(true)}>Copia su altre pagine</Btn>}
        {!readOnly && <Btn small kind="ghost" icon="arrow-counterclockwise" onClick={() => { if (confirm('Rimettere tutti i campi nella disposizione automatica?')) update((d) => { const x = d.tables.find((y) => y.name === t.name)!; if (x.layout) delete x.layout[page]; }); }}>Disposizione automatica</Btn>}</div>
      {copy && <CopyDesign t={t} page={page} onClose={() => setCopy(false)} />}
      <PageBuilder d={dash} set={set} ctx={{ table: t, page, readOnly, onSnippet: () => useStore.getState().set({ nav: { kind: 'table', id: t.name, tab: 'events' } }) }} />
    </div>
  );
}
