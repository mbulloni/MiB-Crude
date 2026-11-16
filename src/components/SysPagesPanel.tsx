// "Pagine di sistema": login, registration, password, profile and home of the generated app, designed like the table pages:
// blocks on the free grid, free blocks (text, code, image, button…), page CSS and JavaScript, and the texts of the page.
import { useState } from 'react';
import type { DashItem } from '../types';
import { update, useStore } from '../store';
import { SYS_PAGES, defaultGrid, pageKeys } from '../syspages';
import { toast } from '../store';
import { Btn, Check, Hero, I, Modal, Row, Section, Tabs } from './ui';
import TextsSection from './TextsSection';
import PageBuilder, { normalize } from './PageBuilder';
import { useItemLock } from './TeamPanel';

/** Copies the free blocks (not the page's own blocks), the CSS and the JavaScript of a page to other system pages: same banner or style on every page. */
function CopyDialog({ from, onClose }: { from: string; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const src = (p.syspages || []).find((x) => x.name === from);
  const [to, setTo] = useState<Record<string, boolean>>({});
  const [what, setWhat] = useState({ blocks: true, css: true, js: true });
  const targets = SYS_PAGES.filter((x) => x.id !== from);
  const free = (src?.items || []).filter((i) => i.type !== 'sys');
  const chosen = targets.filter((x) => to[x.id]);
  const apply = () => {
    update((d) => {
      d.syspages = d.syspages || [];
      for (const tg of chosen) {
        let cur = d.syspages.find((y) => y.name === tg.id);
        if (!cur) { cur = { name: tg.id, title: {}, items: defaultGrid(tg.id) }; d.syspages.push(cur); }
        if (what.blocks) {
          const ids = new Set(cur.items.map((i) => i.id));
          let n = cur.items.length;
          let y = Math.max(0, ...cur.items.map((i) => (i.y || 1) + (i.h || 6) - 1)) + 1;
          const top = Math.min(1e9, ...free.map((i) => i.y || 1));
          for (const it of structuredClone(free) as DashItem[]) { do n++; while (ids.has(`b${n}`)); it.id = `b${n}`; ids.add(it.id); it.y = y + ((it.y || 1) - top); cur.items.push(it); }
        }
        if (what.css && src?.css) cur.css = (cur.css ? cur.css + '\n\n' : '') + src.css;
        if (what.js && src?.js) cur.js = (cur.js ? cur.js + '\n\n' : '') + src.js;
      }
    });
    toast(`Design copiato su ${chosen.length} ${chosen.length === 1 ? 'pagina' : 'pagine'}`, 'ok');
    onClose();
  };
  return <Modal title="Applica ad altre pagine" onClose={onClose} footer={<><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" disabled={!chosen.length} onClick={apply}>Copia</Btn></>}>
    <p className="help">Copia i blocchi liberi (testi, immagini, codice, indicatori…), il CSS e il JavaScript di «{SYS_PAGES.find((x) => x.id === from)!.label}» su altre pagine di sistema: i blocchi della pagina stessa (moduli, menu…) restano propri di ciascuna. Una pagina non ancora personalizzata viene personalizzata con la sua griglia standard e poi i blocchi vengono aggiunti in fondo.</p>
    <Row label="Pagine"><div><Check value={chosen.length === targets.length} onChange={(v) => setTo(Object.fromEntries(targets.map((x) => [x.id, v])))} label="Tutte" />
      {targets.map((x) => <div key={x.id} style={{ paddingLeft: 22 }}><Check value={!!to[x.id]} onChange={(v) => setTo({ ...to, [x.id]: v })} label={x.label} /></div>)}</div></Row>
    <Row label="Cosa"><div><Check value={what.blocks} onChange={(v) => setWhat({ ...what, blocks: v })} label={`Blocchi liberi (${free.length})`} />
      <Check value={what.css} onChange={(v) => setWhat({ ...what, css: v })} label={`CSS${src?.css ? '' : ' (vuoto)'}`} />
      <Check value={what.js} onChange={(v) => setWhat({ ...what, js: v })} label={`JavaScript${src?.js ? '' : ' (vuoto)'}`} /></div></Row>
  </Modal>;
}

export default function SysPagesPanel() {
  const p = useStore((s) => s.proj)!;
  const [sel, setSel] = useState(SYS_PAGES[0].id);
  const [copy, setCopy] = useState(false);
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
        <PageBuilder d={d!} set={set} sys={{ page: sel, blocks: def.blocks, onCopy: () => setCopy(true) }} />
        <p className="help">Nota: nelle pagine di accesso e registrazione il contenitore è stretto (una scheda al centro): per un layout più largo usa il CSS della pagina, es. <code>.mc-card, .container {'{'} max-width: 900px {'}'}</code>.</p>
      </>}
      {copy && <CopyDialog from={sel} onClose={() => setCopy(false)} />}
      <TextsSection keys={pageKeys(def)} readOnly={lock.readOnly} />
    </div>
  );
}
