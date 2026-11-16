// Search, print, import (design on the free grid) and export, delete (texts only) of a table, in the page designer of the table.
import type { ReactNode } from 'react';
import { update, useStore } from '../store';
import type { Dashboard, Table } from '../types';
import { TABLE_PAGES, gridOf, pageKeys } from '../syspages';
import { Btn, I, Section } from './ui';
import PageBuilder, { normalize } from './PageBuilder';
import TextsSection from './TextsSection';

export default function TablePageSys({ t, page, tabs, readOnly, onCopy }: { t: Table; page: string; tabs: ReactNode; readOnly?: boolean; onCopy: () => void }) {
  const def = TABLE_PAGES[page];
  const layout = t.layout?.[page];
  const designed = !!layout?.grid?.length;
  const setTable = (fn: (x: Table) => void) => { if (!readOnly) update((d) => { fn(d.tables.find((y) => y.name === t.name)!); }); };
  const personalize = () => setTable((x) => { x.layout = x.layout || {}; x.layout[page] = { grid: gridOf(def.blocks) }; });
  const restore = () => { if (!readOnly && confirm(`Ripristinare l'aspetto standard della pagina «${def.label}»? Blocchi, CSS e JavaScript personalizzati vanno persi (i testi modificati restano).`)) setTable((x) => { if (x.layout) delete x.layout[page]; }); };
  const dash: Dashboard = { name: `${t.name}:${page}`, title: {}, items: layout?.grid || [], css: layout?.css, js: layout?.js };
  const set = (fn: (x: Dashboard) => void) => {
    if (readOnly) return;
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      const tmp: Dashboard = { name: dash.name, title: {}, items: structuredClone(x.layout?.[page]?.grid || []), css: x.layout?.[page]?.css, js: x.layout?.[page]?.js };
      fn(tmp);
      normalize(tmp);
      x.layout = x.layout || {};
      x.layout[page] = { grid: tmp.items, ...(tmp.css ? { css: tmp.css } : {}), ...(tmp.js ? { js: tmp.js } : {}) };
    });
  };
  const open = (tab: string) => useStore.getState().set({ nav: { kind: 'table', id: t.name, tab } });
  return (
    <div className="pd">
      <div className="inline wrap">{tabs}{designed && <><span className="grow" />
        {!readOnly && <Btn small kind="ghost" icon="arrow-counterclockwise" onClick={restore} title="Scarta il design e torna all'aspetto standard">Ripristina l'aspetto standard</Btn>}</>}</div>
      <p className="help" style={{ margin: '8px 0' }}>{def.help} {page !== 'export' && page !== 'delete' && <Btn small icon="list-columns" onClick={() => open('fields')}>Apri Campi</Btn>}</p>
      {def.blocks.length > 0 && (designed
        ? <PageBuilder d={dash} set={set} sys={{ page, blocks: def.blocks, table: t, onSnippet: () => open('events'), onCopy }} />
        : <Section title="Aspetto" help="Senza un design la pagina esce come standard.">
          <p><I n="check-circle" /> Questa pagina usa l'aspetto standard. Personalizzandola ottieni una griglia libera con i blocchi della pagina ({def.blocks.map((b) => b.label).join(', ')}) più testi, immagini, codice, pulsanti e snippet PHP, CSS e JavaScript.</p>
          <Btn kind="primary" icon="layout-wtf" disabled={readOnly} onClick={personalize}>Personalizza questa pagina</Btn>
        </Section>)}
      <TextsSection keys={pageKeys(def)} readOnly={readOnly} />
    </div>
  );
}
