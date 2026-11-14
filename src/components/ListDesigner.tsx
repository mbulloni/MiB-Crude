// List page designer: the page drawn as bands of elements (title, search, buttons, filters, table with its columns, paging);
// click an element to see its properties, click a faded one to bring it back. Extra blocks around the list use the free grid (advanced).
import { useState } from 'react';
import { update, useStore } from '../store';
import type { DashItem, Dashboard, Table } from '../types';
import PageBuilder, { normalize } from './PageBuilder';
import { Btn, Check, Num, Row, Section, Select, lbl } from './ui';

const MAXCOLS = 8;
type El = { id: string; label: string; icon: string; on: boolean; band: string };

export default function ListDesigner({ t, readOnly, onCopy }: { t: Table; readOnly?: boolean; onCopy: () => void }) {
  const [sel, setSel] = useState('table');
  const L = t.pages.list || {};
  const set = (fn: (x: Table) => void) => { if (!readOnly) update((d) => { fn(d.tables.find((y) => y.name === t.name)!); }); };
  const pg = (k: string) => !!t.pages[k]?.enabled;
  const flag = (k: string, v: boolean) => set((x) => { x.pages[k] = { ...(x.pages[k] || {}), enabled: v }; });
  const list = (fn: (l: any) => void) => set((x) => { x.pages.list = { ...(x.pages.list || {}) }; fn(x.pages.list); });
  const cols = t.fields.filter((f) => f.show.list);
  const rowActs: string[] = L.rowActions || [];

  const els: El[] = [
    { id: 'title', label: 'Titolo', icon: 'type-h1', on: true, band: 'head' },
    { id: 'quick', label: 'Ricerca rapida', icon: 'search', on: !!L.quickSearch, band: 'search' },
    { id: 'adv', label: 'Ricerca avanzata', icon: 'funnel', on: pg('search'), band: 'search' },
    { id: 'filters', label: 'Pannello filtri', icon: 'sliders', on: !!L.filterPanel, band: 'search' },
    { id: 'add', label: 'Nuovo', icon: 'plus-square', on: pg('add'), band: 'btn' },
    { id: 'inlineadd', label: 'Aggiungi riga', icon: 'plus-circle', on: !!L.inlineAdd, band: 'btn' },
    { id: 'del', label: 'Elimina selezionati', icon: 'trash', on: pg('delete'), band: 'btn' },
    { id: 'updsel', label: 'Modifica selezionati', icon: 'pencil-square', on: L.updateSelected !== false, band: 'btn' },
    { id: 'export', label: 'Esporta', icon: 'download', on: pg('export'), band: 'btn' },
    { id: 'print', label: 'Stampa', icon: 'printer', on: pg('print'), band: 'btn' },
    { id: 'import', label: 'Importa', icon: 'upload', on: pg('import'), band: 'btn' },
    { id: 'totals', label: 'Totali', icon: 'calculator', on: !!L.totals, band: 'foot' },
    { id: 'paging', label: 'Paginazione', icon: 'three-dots', on: true, band: 'foot' },
    { id: 'size', label: 'Righe per pagina', icon: 'list-ol', on: true, band: 'foot' },
  ];
  const toggle = (id: string, v: boolean) => {
    if (id === 'quick') list((l) => { l.quickSearch = v; });
    else if (id === 'adv') flag('search', v);
    else if (id === 'filters') list((l) => { l.filterPanel = v; });
    else if (id === 'add') flag('add', v);
    else if (id === 'inlineadd') list((l) => { l.inlineAdd = v; });
    else if (id === 'del') flag('delete', v);
    else if (id === 'updsel') list((l) => { l.updateSelected = v; });
    else if (id === 'export') flag('export', v);
    else if (id === 'print') flag('print', v);
    else if (id === 'import') flag('import', v);
    else if (id === 'totals') list((l) => { l.totals = v; });
  };
  const fixed = (id: string) => ['title', 'paging', 'size'].includes(id);
  const Chip = ({ e }: { e: El }) => <span className={`ld-chip ${e.on ? '' : 'off'} ${sel === e.id ? 'sel' : ''}`} onClick={() => setSel(e.id)}>
    <i className={`bi bi-${e.icon}`} /> {e.label}
    {!fixed(e.id) && !readOnly && <button type="button" title={e.on ? 'Togli dalla pagina' : 'Rimetti nella pagina'} onClick={(ev) => { ev.stopPropagation(); toggle(e.id, !e.on); }}><i className={`bi bi-${e.on ? 'x' : 'plus'}`} /></button>}
  </span>;
  const band = (b: string) => els.filter((e) => e.band === b).map((e) => <Chip key={e.id} e={e} />);

  const unshown = t.fields.filter((f) => !f.show.list);
  const colSel = sel.startsWith('col:') ? t.fields.find((f) => f.name === sel.slice(4)) : undefined;
  const cur = els.find((e) => e.id === sel);

  // Free grid around the list (advanced): toolbar + record list + any block.
  const grid = t.layout?.list?.grid as DashItem[] | undefined;
  const dash: Dashboard = { name: `${t.name}:list`, title: {}, items: grid || [], css: t.layout?.list?.css, js: t.layout?.list?.js };
  const setGrid = (fn: (x: Dashboard) => void) => {
    if (readOnly) return;
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      const tmp: Dashboard = { name: dash.name, title: {}, items: structuredClone(x.layout?.list?.grid || []), css: x.layout?.list?.css, js: x.layout?.list?.js };
      fn(tmp); normalize(tmp);
      x.layout = x.layout || {};
      x.layout.list = { grid: tmp.items, ...(tmp.css ? { css: tmp.css } : {}), ...(tmp.js ? { js: tmp.js } : {}) };
    });
  };
  const goFields = () => useStore.getState().set({ nav: { kind: 'table', id: t.name, tab: 'fields' } });

  const props = () => {
    if (colSel) return <Section title={`Colonna · ${lbl(colSel.label, colSel.name)}`} help="Etichetta, formato e controlli del campo si cambiano nella scheda Campi; l'ordine delle colonne è quello della scheda Campi.">
      <Btn small icon="list-columns" onClick={goFields}>Apri Campi</Btn>{' '}
      <Btn small kind="ghost" icon="x-lg" disabled={readOnly} onClick={() => { set((x) => { x.fields.find((f) => f.name === colSel.name)!.show.list = false; }); setSel('table'); }}>Togli dalla lista</Btn></Section>;
    switch (sel) {
      case 'title': return <Section title="Titolo" help="Il nome della tabella (scheda Generale › Titolo)."><p className="help">{lbl(t.caption, t.name)}</p></Section>;
      case 'quick': case 'adv': case 'filters': case 'inlineadd': case 'del': case 'updsel': case 'import': case 'print': case 'totals': return <Section title={cur!.label} help={{
        quick: 'Casella di ricerca sopra la tabella.', adv: 'Link alla pagina di ricerca avanzata (campi con «Ricerca» nella scheda Campi).',
        filters: 'Pannello laterale con i valori dei campi marcati come filtro nella scheda Campi.', inlineadd: 'Riga di campi sopra la lista per inserire senza aprire la pagina Nuovo.',
        del: 'Pulsante «Elimina selezionati» e azione Elimina (serve il permesso di eliminazione).', updsel: 'Stessi valori su tutte le righe spuntate (serve il permesso di modifica).',
        import: 'Pulsante di importazione da file.', print: 'Pulsante di stampa della lista.', totals: 'Riga dei totali in fondo (campi con totale nella scheda Campi).' }[sel]}>
        <Check value={cur!.on} onChange={(v) => toggle(sel, v)} label="Presente nella pagina" /></Section>;
      case 'add': return <Section title="Nuovo" help="Pulsante e pagina di inserimento."><Check value={cur!.on} onChange={(v) => toggle('add', v)} label="Presente nella pagina" />
        <Row label="Si apre"><Select value={t.pages.add?.mode || 'page'} options={[['page', 'Pagina'], ['popup', 'Finestra popup sopra la lista']]} onChange={(v) => set((x) => { x.pages.add = { ...(x.pages.add || {}), mode: v }; })} /></Row></Section>;
      case 'export': return <Section title="Esporta" help="Menu di esportazione."><Check value={cur!.on} onChange={(v) => toggle('export', v)} label="Presente nella pagina" />
        <Row label="Formati"><span className="chips">{['csv', 'xlsx', 'json', 'pdf'].map((fm) => <Check key={fm} label={fm.toUpperCase()} value={(t.pages.export?.formats || []).includes(fm)} onChange={(v) => set((x) => { const c: string[] = x.pages.export?.formats || []; x.pages.export = { ...(x.pages.export || {}), formats: v ? [...c, fm] : c.filter((y) => y !== fm) }; if (!x.pages.export.formats.length) x.pages.export.formats = ['csv']; })} />)}</span></Row></Section>;
      case 'size': return <Section title="Righe per pagina"><Row label="Record per pagina"><Num value={L.pageSize} onChange={(v) => list((l) => { l.pageSize = v || 20; })} /></Row></Section>;
      case 'paging': return <Section title="Paginazione" help="Navigazione tra le pagine dei record (sempre presente)."><></></Section>;
      default: return <Section title="Tabella" help="Le colonne mostrate sono quelle con «Lista» spuntato nella scheda Campi.">
        <Row label="Azioni per riga"><span className="chips">{[['view', 'Visualizza'], ['edit', 'Modifica'], ['copy', 'Copia'], ['delete', 'Elimina']].map(([a, l]) => <Check key={a} label={l} value={rowActs.includes(a)} onChange={(v) => list((q) => { const ra: string[] = q.rowActions || []; q.rowActions = v ? [...ra, a] : ra.filter((y) => y !== a); })} />)}</span></Row>
        <Row label="Modifica in linea" hint="Doppio clic su una cella"><Check value={!!L.inlineEdit} onChange={(v) => list((q) => { q.inlineEdit = v; })} /></Row>
        <Row label="Ordinamento iniziale"><span className="inline"><Select value={L.defaultSort?.field || ''} options={[['', '(chiave)'], ...t.fields.map((f) => [f.name, f.name] as [string, string])]} onChange={(v) => list((q) => { q.defaultSort = v ? { field: v, dir: q.defaultSort?.dir || 'asc' } : null; })} />
          <Select value={L.defaultSort?.dir || 'asc'} options={[['asc', 'Crescente'], ['desc', 'Decrescente']]} onChange={(v) => list((q) => { if (q.defaultSort) q.defaultSort.dir = v; })} /></span></Row>
        <Row label="Aggiungi colonna"><Select value="" options={[['', 'Scegli un campo…'], ...unshown.map((f) => [f.name, lbl(f.label, f.name)] as [string, string])]} onChange={(v) => v && set((x) => { x.fields.find((f) => f.name === v)!.show.list = true; })} /></Row>
        <Btn small icon="list-columns" onClick={goFields}>Apri Campi</Btn></Section>;
    }
  };

  return <>
    <p className="help">La lista com'è nella pagina. Clicca un elemento per le sue proprietà; <b>×</b> lo toglie, <b>+</b> sugli elementi sbiaditi lo rimette. I campi mostrati si scelgono nella scheda <b>Campi</b> (colonna Lista).</p>
    <div className="pb-wrap">
      <div className="ld">
        <div className="ld-band">{band('head')}</div>
        <div className="ld-band">{band('search')}</div>
        <div className="ld-band">{band('btn')}</div>
        <div className={`ld-table ${sel === 'table' || colSel ? 'sel' : ''}`} onClick={() => setSel('table')}>
          <div className="ld-cols">
            {cols.length === 0 && <span className="muted">Nessuna colonna: spunta «Lista» nella scheda Campi</span>}
            {cols.slice(0, MAXCOLS).map((f) => <div key={f.name} className={`ld-colbox ${sel === `col:${f.name}` ? 'sel' : ''}`} title={`${lbl(f.label, f.name)} (${f.name})`} onClick={(ev) => { ev.stopPropagation(); setSel(`col:${f.name}`); }}>
              <div className="ld-col">{lbl(f.label, f.name)}</div><div className="ld-cell">{f.name}</div></div>)}
            {cols.length > MAXCOLS && <div className="ld-colbox more"><div className="ld-col">+{cols.length - MAXCOLS}</div><div className="ld-cell">altre</div></div>}
            {rowActs.length > 0 && <div className="ld-colbox act"><div className="ld-col"><i className="bi bi-three-dots" /></div><div className="ld-cell">azioni</div></div>}
          </div>
        </div>
        <div className="ld-band foot">{band('foot')}</div>
      </div>
      <div className="pb-insp">{props()}</div>
    </div>
    <Section title="Layout libero (avanzato)" help="Aggiungi testi, grafici, indicatori, codice, immagini sopra, sotto o accanto alla lista. Con il layout libero attivo, la barra comandi e l'elenco record diventano blocchi spostabili."
      actions={<span className="inline"><Btn small icon="files" disabled={readOnly} onClick={onCopy}>Applica ad altre pagine</Btn>
        {grid ? <Btn small kind="ghost" icon="arrow-counterclockwise" disabled={readOnly} onClick={() => { if (confirm('Ripristinare la lista standard? Il layout libero (blocchi, CSS, JavaScript) va perso.')) set((x) => { if (x.layout) delete x.layout.list; }); }}>Ripristina standard</Btn>
          : <Btn small icon="layout-wtf" disabled={readOnly} onClick={() => { setGrid((x) => { x.items = [{ id: 'b1', type: 'toolbar', x: 1, y: 1, w: 12, h: 2 }, { id: 'b2', type: 'datalist', x: 1, y: 3, w: 12, h: 12 }]; }); }}>Attiva layout libero</Btn>}</span>}>
      {grid && <PageBuilder d={dash} set={setGrid} ctx={{ table: t, page: 'list', readOnly, onCopy, onSnippet: () => useStore.getState().set({ nav: { kind: 'table', id: t.name, tab: 'events' } }) }} />}
      {!grid && <p className="help">Non attivo: la lista usa l'impaginazione standard sopra.</p>}
    </Section>
  </>;
}
