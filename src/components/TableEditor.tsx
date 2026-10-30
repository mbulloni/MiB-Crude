import { useState } from 'react';
import { update, useStore } from '../store';
import { TABLE_EVENTS } from '../events';
import type { Field, Table } from '../types';
import CodeEditor from './CodeEditor';
import EventEditor from './EventEditor';
import FieldDialog, { EDIT_AS, VIEW_AS } from './FieldDialog';
import { Btn, Check, I, LangText, Num, Row, Section, Select, Tabs, Text, lbl } from './ui';
import { useItemLock } from './TeamPanel';

const SHOW: [string, string][] = [['list', 'Lista'], ['view', 'Vista'], ['add', 'Nuovo'], ['edit', 'Modifica'], ['search', 'Ricerca'], ['export', 'Esporta'], ['import', 'Importa'], ['print', 'Stampa']];
type TabKey = 'general' | 'fields' | 'pages' | 'layout' | 'details' | 'events' | 'api';

export default function TableEditor({ name }: { name: string }) {
  const p = useStore((s) => s.proj)!;
  const t = p.tables.find((x) => x.name === name);
  const nav = useStore((s) => s.nav);
  const [tab, setTab] = useState<TabKey>(((nav as any).tab as TabKey) || 'fields');
  const [fieldDlg, setFieldDlg] = useState<string | null>(null);
  const lock = useItemLock(`table:${name}`);
  if (!t) return <div className="panel">Tabella non trovata</div>;
  const ro = lock.readOnly;
  const set = (fn: (x: Table) => void) => { if (!ro) update((d) => { const x = d.tables.find((y) => y.name === name)!; fn(x); }); };
  const setField = (fname: string, f: Field) => set((x) => { x.fields = x.fields.map((y) => (y.name === fname ? f : y)); });
  const move = (i: number, dir: -1 | 1) => set((x) => { const j = i + dir; if (j < 0 || j >= x.fields.length) return; [x.fields[i], x.fields[j]] = [x.fields[j], x.fields[i]]; });
  const evCount = Object.values(p.events[name] || {}).filter((c) => c && c.trim()).length;

  return (
    <div className="panel">
      <div className="title-row"><h2>{lbl(t.caption, t.name)} <small className="muted mono">{t.name}</small></h2>
        {lock.banner}</div>
      <Tabs value={tab} onChange={setTab} tabs={[['fields', `Campi (${t.fields.length})`, 'list-columns'], ['general', 'Generale', 'sliders'], ['pages', 'Pagine', 'window-stack'], ['layout', 'Layout moduli', 'layout-text-window'],
        ['details', `Master-dettaglio (${t.details.length})`, 'diagram-3'], ['events', `Eventi${evCount ? ` (${evCount})` : ''}`, 'lightning'], ['api', 'API', 'braces']]} />
      <fieldset disabled={ro} className="plain">
      {tab === 'fields' && <div className="fields-wrap">
        <table className="grid fields">
          <thead><tr><th /><th>Campo</th><th>Etichetta</th>{SHOW.map(([k, l]) => <th key={k} className="c" title={`Mostra in: ${l}`}>{l}</th>)}<th>Visualizza come</th><th>Modifica come</th><th className="c">Obbl.</th><th /></tr>
            <tr className="sub"><th /><th /><th />{SHOW.map(([k]) => <th key={k} className="c"><input type="checkbox" title="Tutti" checked={t.fields.every((f) => f.show[k])} onChange={(e) => set((x) => x.fields.forEach((f) => { f.show[k] = e.target.checked; }))} /></th>)}<th /><th /><th /><th /></tr></thead>
          <tbody>
            {t.fields.map((f, i) => <tr key={f.name}>
              <td className="mover"><button type="button" onClick={() => move(i, -1)}><I n="chevron-up" /></button><button type="button" onClick={() => move(i, 1)}><I n="chevron-down" /></button></td>
              <td className="mono">{f.pk && <I n="key-fill" className="accent" />} {f.name}<div className="muted small">{f.dbType}</div></td>
              <td><input className="inp" value={f.label[p.project.defaultLanguage] || ''} onChange={(e) => setField(f.name, { ...f, label: { ...f.label, [p.project.defaultLanguage]: e.target.value } })} /></td>
              {SHOW.map(([k]) => <td key={k} className="c"><input type="checkbox" checked={!!f.show[k]} onChange={(e) => setField(f.name, { ...f, show: { ...f.show, [k]: e.target.checked } })} /></td>)}
              <td><Select value={f.viewAs.type} options={VIEW_AS} onChange={(v) => setField(f.name, { ...f, viewAs: { ...f.viewAs, type: v } })} /></td>
              <td><Select value={f.editAs.type} options={EDIT_AS} onChange={(v) => { setFieldDlg(f.name); setField(f.name, { ...f, editAs: { ...f.editAs, type: v, lookup: ['select', 'radio', 'checkboxes', 'autocomplete'].includes(v) ? (f.editAs.lookup || { kind: 'list', values: [] }) : f.editAs.lookup } }); }} />
                {f.editAs.lookup && ['select', 'radio', 'checkboxes', 'autocomplete'].includes(f.editAs.type) && <div className="muted small">{f.editAs.lookup.kind === 'list' ? `${f.editAs.lookup.values?.length || 0} valori` : `${f.editAs.lookup.table}.${f.editAs.lookup.display}`}{f.editAs.lookup.dependsOn?.field ? ` ← ${f.editAs.lookup.dependsOn.field}` : ''}</div>}</td>
              <td className="c"><input type="checkbox" checked={!!f.validation?.required} onChange={(e) => setField(f.name, { ...f, validation: { ...f.validation, required: e.target.checked } })} /></td>
              <td><Btn small icon="gear" title="Tutte le impostazioni del campo" onClick={() => setFieldDlg(f.name)} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {tab === 'general' && <div className="cols">
        <Section title="Origine dati">
          <Row label="Etichetta"><LangText value={t.caption} onChange={(v) => set((x) => { x.caption = v; })} /></Row>
          <Row label="Icona" hint="Nome Bootstrap Icons, es. cart, people, box"><span className="inline"><Text value={t.icon} onChange={(v) => set((x) => { x.icon = v; })} mono /><I n={t.icon || 'table'} /></span></Row>
          {p.connections.length > 1 && <Row label="Connessione"><Select value={t.connection} options={p.connections.map((c) => [c.id, c.name] as [string, string])} onChange={(v) => set((x) => { x.connection = v; })} /></Row>}
          <Row label="Chiave primaria" hint="Necessaria per visualizza/modifica/elimina"><Text value={t.keys.join(', ')} onChange={(v) => set((x) => { x.keys = v.split(',').map((s) => s.trim()).filter(Boolean); })} mono /></Row>
          {t.source.type === 'sql' ? <>
            <p className="help">Query SQL dell'origine dati:</p>
            <CodeEditor language="sql" value={t.source.sql || ''} onChange={(v) => set((x) => { x.source.sql = v; })} height={180} readOnly={ro} />
            <Row label="Tabella da aggiornare" hint="Rende la query modificabile: inserimenti e modifiche vanno in questa tabella"><Text value={t.source.updateTable} onChange={(v) => set((x) => { x.source.updateTable = v; x.readOnly = !v; })} mono /></Row>
          </> : <Row label="Tabella"><Text value={t.source.table} onChange={(v) => set((x) => { x.source.table = v; })} mono /></Row>}
          <Row label="Filtro fisso (WHERE)" hint="SQL sempre applicato, es. src.cancellato = 0"><Text value={t.where} onChange={(v) => set((x) => { x.where = v; })} mono /></Row>
        </Section>
        <Section title="Opzioni">
          <Row label="Sola lettura"><Check value={t.readOnly} onChange={(v) => set((x) => { x.readOnly = v; })} /></Row>
          <Row label="Visibilità"><span className="chips"><Check label="Nascondi dal menu automatico" value={t.hideFromMenu} onChange={(v) => set((x) => { x.hideFromMenu = v; })} /><Check label="Nascondi dalla home" value={t.hideFromHome} onChange={(v) => set((x) => { x.hideFromHome = v; })} /></span></Row>
          <Row label="Registro attività"><Check value={t.audit !== false} onChange={(v) => set((x) => { x.audit = v; })} label={p.project.settings.audit ? 'Registra le modifiche di questa tabella' : 'Attiva prima il registro nelle impostazioni del progetto'} /></Row>
          <Row label="Record per utente" hint="Gli utenti non amministratori vedono e modificano solo i record con il loro ID in questo campo (impostato automaticamente)">
            <Select value={p.security.ownership[t.name]?.field || ''} options={[['', '— tutti i record —'], ...t.fields.map((f) => [f.name, f.name] as [string, string])]} onChange={(v) => update((d) => { if (v) d.security.ownership[t.name] = { field: v }; else delete d.security.ownership[t.name]; })} /></Row>
        </Section>
      </div>}

      {tab === 'pages' && <div className="cols">
        <Section title="Pagine generate">
          {(['list', 'view', 'add', 'edit', 'delete', 'search', 'export', 'import', 'print'] as const).map((k) => <Row key={k} label={{ list: 'Lista', view: 'Visualizza', add: 'Nuovo', edit: 'Modifica', delete: 'Elimina', search: 'Ricerca avanzata', export: 'Esporta', import: 'Importa', print: 'Stampa' }[k]}>
            <Check value={t.pages[k]?.enabled} onChange={(v) => set((x) => { x.pages[k] = { ...(x.pages[k] || {}), enabled: v }; })} /></Row>)}
        </Section>
        <Section title="Lista">
          <Row label="Record per pagina"><Num value={t.pages.list.pageSize} onChange={(v) => set((x) => { x.pages.list.pageSize = v || 20; })} /></Row>
          <Row label="Ricerca"><span className="chips"><Check label="Ricerca rapida" value={t.pages.list.quickSearch} onChange={(v) => set((x) => { x.pages.list.quickSearch = v; })} /><Check label="Pannello filtri" value={t.pages.list.filterPanel} onChange={(v) => set((x) => { x.pages.list.filterPanel = v; })} /><Check label="Totali" value={t.pages.list.totals} onChange={(v) => set((x) => { x.pages.list.totals = v; })} /></span></Row>
          <Row label="Azioni per riga"><span className="chips">{[['view', 'Visualizza'], ['edit', 'Modifica'], ['copy', 'Copia'], ['delete', 'Elimina']].map(([a, l]) => <Check key={a} label={l} value={(t.pages.list.rowActions || []).includes(a)} onChange={(v) => set((x) => { const ra: string[] = x.pages.list.rowActions || []; x.pages.list.rowActions = v ? [...ra, a] : ra.filter((y) => y !== a); })} />)}</span></Row>
          <Row label="Ordinamento iniziale"><span className="inline"><Select value={t.pages.list.defaultSort?.field || ''} options={[['', '(chiave)'], ...t.fields.map((f) => [f.name, f.name] as [string, string])]} onChange={(v) => set((x) => { x.pages.list.defaultSort = v ? { field: v, dir: x.pages.list.defaultSort?.dir || 'asc' } : null; })} />
            <Select value={t.pages.list.defaultSort?.dir || 'asc'} options={[['asc', 'Crescente'], ['desc', 'Decrescente']]} onChange={(v) => set((x) => { if (x.pages.list.defaultSort) x.pages.list.defaultSort.dir = v; })} /></span></Row>
        </Section>
        <Section title="Moduli ed esportazione">
          <Row label="Colonne nei moduli"><Select value={String(t.pages.edit?.columns || 1)} options={[['1', '1'], ['2', '2'], ['3', '3']]} onChange={(v) => set((x) => { x.pages.edit = { ...x.pages.edit, columns: Number(v) }; x.pages.add = { ...x.pages.add, columns: Number(v) }; })} /></Row>
          <Row label="Formati di esportazione"><span className="chips">{['csv', 'xlsx', 'json'].map((fm) => <Check key={fm} label={fm.toUpperCase()} value={(t.pages.export?.formats || []).includes(fm)} onChange={(v) => set((x) => { const cur: string[] = x.pages.export.formats || []; x.pages.export.formats = v ? [...cur, fm] : cur.filter((y) => y !== fm); if (!x.pages.export.formats.length) x.pages.export.formats = ['csv']; })} />)}</span></Row>
        </Section>
      </div>}

      {tab === 'layout' && <LayoutEditor t={t} set={set} />}

      {tab === 'details' && <Section title="Tabelle di dettaglio" actions={<Btn icon="plus-lg" onClick={() => set((x) => { x.details.push({ table: '', masterKeys: [...x.keys], detailKeys: [], showIn: ['view', 'edit'] }); })}>Aggiungi</Btn>}
        help="Il dettaglio compare come scheda nella vista/modifica del record master e come icona nella lista. I nuovi record di dettaglio ricevono automaticamente la chiave del master.">
        {!t.details.length ? <p className="help">Nessun dettaglio. Le relazioni vengono proposte in automatico dalle chiavi esterne quando importi le tabelle.</p> :
          <table className="grid"><thead><tr><th>Tabella dettaglio</th><th>Campi master</th><th>Campi dettaglio</th><th>Mostra in</th><th /></tr></thead><tbody>
            {t.details.map((d, i) => <tr key={i}>
              <td><Select value={d.table} options={[['', '—'], ...p.tables.filter((x) => x.name !== t.name).map((x) => [x.name, x.name] as [string, string])]} onChange={(v) => set((x) => { x.details[i].table = v; })} /></td>
              <td><Text value={d.masterKeys.join(', ')} onChange={(v) => set((x) => { x.details[i].masterKeys = v.split(',').map((s) => s.trim()).filter(Boolean); })} mono /></td>
              <td><Text value={d.detailKeys.join(', ')} onChange={(v) => set((x) => { x.details[i].detailKeys = v.split(',').map((s) => s.trim()).filter(Boolean); })} mono /></td>
              <td><span className="chips">{[['list', 'Lista'], ['view', 'Vista'], ['edit', 'Modifica']].map(([k, l]) => <Check key={k} label={l} value={d.showIn.includes(k)} onChange={(v) => set((x) => { x.details[i].showIn = v ? [...d.showIn, k] : d.showIn.filter((y) => y !== k); })} />)}</span></td>
              <td><Btn small kind="ghost" icon="trash" onClick={() => set((x) => { x.details.splice(i, 1); })} /></td>
            </tr>)}
          </tbody></table>}
      </Section>}

      {tab === 'events' && <EventEditor table={t.name}
        defs={{ ...TABLE_EVENTS, ...Object.fromEntries(Object.keys(p.events[name] || {}).filter((k) => k.startsWith('Snippet_')).map((k) => [k, { args: '$page', help: 'Snippet PHP inserito nella pagina (importato da phpr): stampa HTML sopra o sotto il contenuto.' }])) }} code={p.events[name] || {}} readOnly={ro}
        onChange={(ev, code) => { if (!ro) update((d) => { d.events[name] = { ...(d.events[name] || {}) }; if (code == null) delete d.events[name][ev]; else d.events[name][ev] = code; }); }} />}

      {tab === 'api' && <Section title="API REST" help={p.project.settings.api?.enabled ? `Endpoint: index.php?p=api&t=${t.name} — descrizione OpenAPI su index.php?p=api&openapi=1` : 'Attiva prima l\'API REST nelle impostazioni del progetto.'}>
        <Row label="Esponi questa tabella"><Check value={t.api?.enabled} onChange={(v) => set((x) => { x.api = { ...(x.api || { methods: ['list', 'view'] }), enabled: v }; })} /></Row>
        <Row label="Operazioni"><span className="chips">{[['list', 'GET lista'], ['view', 'GET record'], ['add', 'POST'], ['edit', 'PUT/PATCH'], ['delete', 'DELETE']].map(([k, l]) => <Check key={k} label={l} value={(t.api?.methods || []).includes(k)} onChange={(v) => set((x) => { const m = x.api.methods || []; x.api.methods = v ? [...m, k] : m.filter((y) => y !== k); })} />)}</span></Row>
        <p className="help">L'API rispetta permessi, record per utente ed eventi. Autenticazione: header <code>X-Api-Key</code> (chiave generata dall'utente nel profilo) oppure sessione del browser.</p>
      </Section>}
      </fieldset>
      {fieldDlg && t.fields.find((f) => f.name === fieldDlg) && <FieldDialog t={t} field={t.fields.find((f) => f.name === fieldDlg)!} onChange={(f) => setField(fieldDlg, f)} onClose={() => setFieldDlg(null)} />}
    </div>
  );
}

/** Form layout: sections (cards) with their fields, per page. */
function LayoutEditor({ t, set }: { t: Table; set: (fn: (x: Table) => void) => void }) {
  const [page, setPage] = useState<'edit' | 'add' | 'view'>('edit');
  const fields = t.fields.filter((f) => f.show[page]);
  const sections = t.layout?.[page]?.sections || [];
  const sectionOf = (n: string) => sections.findIndex((s) => s.fields.includes(n));
  const setSections = (fn: (s: { title: any; fields: string[] }[]) => void) => set((x) => {
    x.layout = x.layout || {};
    const cur = structuredClone(x.layout[page]?.sections || []);
    fn(cur);
    x.layout[page] = { sections: cur };
    if (page === 'edit' && !x.layout.add) x.layout.add = { sections: structuredClone(cur) };
  });
  return (
    <div>
      <div className="inline"><Tabs value={page} onChange={setPage} tabs={[['edit', 'Modifica'], ['add', 'Nuovo'], ['view', 'Visualizza']]} /><span className="grow" />
        <Btn icon="plus-lg" onClick={() => setSections((s) => { s.push({ title: { it: `Sezione ${s.length + 1}` }, fields: [] }); })}>Nuova sezione</Btn>
        {sections.length > 0 && <Btn kind="ghost" icon="arrow-counterclockwise" onClick={() => setSections((s) => { s.length = 0; })}>Layout automatico</Btn>}</div>
      <p className="help">Raggruppa i campi in sezioni (riquadri con titolo). I campi non assegnati vanno in fondo. L'ordine dei campi segue la scheda Campi; la larghezza si imposta nel campo (Altro → Larghezza).</p>
      <div className="layout-board">
        {sections.map((s, si) => <div className="lb-section" key={si}>
          <div className="lb-head"><LangText value={s.title} onChange={(v) => setSections((ss) => { ss[si].title = v; })} />
            <Btn small kind="ghost" icon="chevron-up" onClick={() => setSections((ss) => { if (si > 0) [ss[si - 1], ss[si]] = [ss[si], ss[si - 1]]; })} />
            <Btn small kind="ghost" icon="trash" onClick={() => setSections((ss) => { ss.splice(si, 1); })} /></div>
          <div className="lb-fields">{fields.filter((f) => sectionOf(f.name) === si).map((f) => <span key={f.name} className="chip">{lbl(f.label, f.name)}
            <button type="button" onClick={() => setSections((ss) => { ss[si].fields = ss[si].fields.filter((x) => x !== f.name); })}><I n="x" /></button></span>)}</div>
        </div>)}
        <div className="lb-section free"><div className="lb-head"><b>Campi non assegnati</b></div>
          <div className="lb-fields">{fields.filter((f) => sectionOf(f.name) < 0).map((f) => <span key={f.name} className="chip">{lbl(f.label, f.name)}
            {sections.length > 0 && <select className="inp sm" value="" onChange={(e) => { const si = Number(e.target.value); setSections((ss) => { ss[si].fields.push(f.name); }); }}>
              <option value="">→</option>{sections.map((s, i) => <option key={i} value={i}>{lbl(s.title, `Sezione ${i + 1}`)}</option>)}</select>}</span>)}</div></div>
      </div>
    </div>
  );
}
