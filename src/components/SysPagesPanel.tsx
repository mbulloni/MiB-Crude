// "Pagine di sistema": login, registration, password, profile and home of the generated app, designed like the table pages:
// blocks on the free grid, free blocks (text, code, image, button…), page CSS and JavaScript, and the texts of the page.
import { useState } from 'react';
import { update, useStore } from '../store';
import { SYS_PAGES, defaultGrid, pageKeys } from '../syspages';
import { Btn, Hero, I, Section, Tabs } from './ui';
import TextsSection from './TextsSection';
import PageBuilder, { normalize } from './PageBuilder';
import { useItemLock } from './TeamPanel';

export default function SysPagesPanel() {
  const p = useStore((s) => s.proj)!;
  const [sel, setSel] = useState(SYS_PAGES[0].id);
  const def = SYS_PAGES.find((x) => x.id === sel)!;
  const lock = useItemLock(`syspage:${sel}`);
  const d = (p.syspages || []).find((x) => x.name === sel);
  const designed = !!d && d.items.length > 0;

  const personalize = () => {
    if (lock.readOnly) return;
    update((x) => {
      x.syspages = x.syspages || [];
      const cur = x.syspages.find((y) => y.name === sel);
      if (cur) cur.items = defaultGrid(sel); else x.syspages.push({ name: sel, title: {}, items: defaultGrid(sel) });
    });
  };
  const restore = () => {
    if (lock.readOnly || !confirm(`Ripristinare l'aspetto standard della pagina «${def.label}»? Blocchi, CSS e JavaScript personalizzati vanno persi (i testi modificati restano).`)) return;
    update((x) => { x.syspages = (x.syspages || []).filter((y) => y.name !== sel); });
  };
  const set = (fn: (x: NonNullable<typeof d>) => void) => {
    if (lock.readOnly) return;
    update((x) => { const t = (x.syspages || []).find((y) => y.name === sel); if (!t) return; fn(t); normalize(t); });
  };

  return (
    <div className="panel">
      <Hero icon="window-stack" title="Pagine di sistema" sub="Accesso, registrazione, password, profilo e home dell'app: layout a blocchi, testi, CSS e JavaScript come nelle pagine delle tabelle."
        chips={[['layout-wtf', `${(p.syspages || []).filter((x) => x.items.length).length} personalizzate`]]} actions={lock.banner} />
      <Tabs tabs={SYS_PAGES.map((x) => [x.id, x.label, x.icon] as [string, string, string])} value={sel} onChange={setSel} />
      <p className="help">{def.help}</p>
      {!designed ? <Section title="Aspetto" help="Senza un design la pagina esce come standard, uguale per tutte le app.">
        <p><I n="check-circle" /> Questa pagina usa l'aspetto standard. Personalizzandola ottieni una griglia libera con i blocchi della pagina ({def.blocks.map((b) => b.label).join(', ')}) più testi, immagini, codice e pulsanti, CSS e JavaScript.</p>
        <Btn kind="primary" icon="layout-wtf" disabled={lock.readOnly} onClick={personalize}>Personalizza questa pagina</Btn>
      </Section> : <>
        <div className="inline wrap" style={{ margin: '4px 0 8px' }}><span className="grow" />
          <Btn small kind="ghost" icon="arrow-counterclockwise" disabled={lock.readOnly} onClick={restore} title="Scarta il design e torna all'aspetto standard">Ripristina l'aspetto standard</Btn></div>
        <PageBuilder d={d!} set={set} sys={{ page: sel, blocks: def.blocks }} />
        <p className="help">Nota: nelle pagine di accesso e registrazione il contenitore è stretto (una scheda al centro): per un layout più largo usa il CSS della pagina, es. <code>.mc-card, .container {'{'} max-width: 900px {'}'}</code>.</p>
      </>}
      <TextsSection keys={pageKeys(def)} readOnly={lock.readOnly} />
    </div>
  );
}
