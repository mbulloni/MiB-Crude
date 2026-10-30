// Graphic themes from purchased templates: import into the local library, choose one per project.
import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, toast, update, useStore } from '../store';
import { Btn, Check, I, Modal, Row, Section, Select, Text } from './ui';

interface ThemeInfo { id: string; name: string; adapter: string; variant: string; source: string; installedAt: string }
interface Found { adapter: string; adapterName: string; root: string; name: string; slug: string; variants: { id: string; label: string }[] }

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [dir, setDir] = useState(`${(window as any).__mcHome || '/home'}/Documenti/SVILUPPO/Progetti/Template`);
  const [res, setRes] = useState<{ found: Found[]; unsupported: { root: string; name: string; reason: string }[] } | null>(null);
  const [variant, setVariant] = useState<Record<string, string>>({});
  useEffect(() => { call('app:info').then((i) => setDir(`${i.home}/Documenti/SVILUPPO/Progetti/Template`)); }, []);
  const scan = () => run('Analisi dei template…', async () => {
    const r = await call('themes:scan', dir);
    setRes(r);
    setVariant(Object.fromEntries(r.found.map((f: Found) => [f.root, f.variants[0]?.id])));
  });
  const install = (f: Found, all = false) => run(`Importazione ${f.name}…`, async () => {
    const vs = all ? f.variants.map((v) => v.id) : [variant[f.root]];
    for (const v of vs) await call('themes:install', f, v);
    toast(`${f.name}: ${vs.length} varianti importate`, 'ok');
    onDone();
  });
  return (
    <Modal wide title="Importa template grafici" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Chiudi</Btn>}>
      <p className="help">Indica la cartella dei template acquistati. MiB-Crude riconosce i template compatibili (Bootstrap 5 con adattatore) e copia solo i file necessari nella libreria temi di questo computer (<code>~/.config/MiB-Crude/themes</code>). I file del template non entrano nel progetto né nel codice di MiB-Crude: ogni licenza ThemeForest regolare copre un prodotto finale.</p>
      <Row label="Cartella"><span className="inline"><Text value={dir} onChange={setDir} mono /><Btn icon="folder" onClick={async () => { const d = await call<string | null>('dialog:dir', 'Cartella dei template', dir); if (d) setDir(d); }} /><Btn kind="primary" icon="search" onClick={scan}>Analizza</Btn></span></Row>
      {res && <>
        <h4>Compatibili ({res.found.length})</h4>
        {res.found.map((f) => <div className="card" key={f.root}>
          <div className="inline"><I n="palette" /><b>{f.name}</b><small className="muted">{f.adapterName}</small><span className="grow" />
            <Select value={variant[f.root]} options={f.variants.map((v) => [v.id, v.label] as [string, string])} onChange={(v) => setVariant({ ...variant, [f.root]: v })} />
            <Btn kind="primary" icon="download" onClick={() => install(f)}>Importa</Btn>
            {f.variants.length > 1 && <Btn icon="collection" onClick={() => install(f, true)}>Tutte le varianti</Btn>}</div>
          <small className="muted mono">{f.root}</small>
        </div>)}
        {res.unsupported.length > 0 && <><h4>Non compatibili ({res.unsupported.length})</h4>
          <ul className="problems">{res.unsupported.map((u) => <li key={u.root} className="warning"><b>{u.name.replace(/^themeforest-[^-]+-/, '')}</b>: {u.reason}</li>)}</ul></>}
      </>}
    </Modal>
  );
}

export default function ThemesSection() {
  const p = useStore((s) => s.proj)!;
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [dlg, setDlg] = useState(false);
  const reload = () => call<ThemeInfo[]>('themes:list').then(setThemes);
  useEffect(() => { reload(); }, []);
  const cur = p.project.theme.pack || '';
  const set = (id: string) => update((d) => { d.project.theme.pack = id || undefined; });
  return (
    <Section title="Temi grafici" actions={<Btn small icon="box-arrow-in-down" onClick={() => setDlg(true)}>Importa template…</Btn>}
      help="Il tema cambia l'aspetto di tutta l'applicazione generata (menu, intestazione, pagine). Liste, moduli e grafici restano quelli di MiB-Crude, con lo stile del tema.">
      <div className="theme-list">
        <label className={`theme-opt ${!cur ? 'on' : ''}`}><input type="radio" checked={!cur} onChange={() => set('')} /> <b>Standard MiB-Crude</b> <small className="muted">Bootstrap 5</small></label>
        {themes.map((t) => <label key={t.id} className={`theme-opt ${cur === t.id ? 'on' : ''}`}>
          <input type="radio" checked={cur === t.id} onChange={() => set(t.id)} /> <b>{t.name}</b>
          <span className="grow" /><button type="button" className="btn ghost sm" title="Rimuovi dalla libreria" onClick={(e) => { e.preventDefault(); if (confirm(`Rimuovere ${t.name} dalla libreria?`)) call('themes:remove', t.id).then(reload); }}><I n="trash" /></button>
        </label>)}
      </div>
      {cur && !themes.some((t) => t.id === cur) && <p className="warn"><I n="exclamation-triangle" /> Il tema "{cur}" scelto per il progetto non è installato su questo computer: importalo per generare l'applicazione.</p>}
      {cur && <Row label="Colore principale"><Check value={!!(p.project.theme as any).primaryOverride} onChange={(v) => update((d) => { (d.project.theme as any).primaryOverride = v; })} label="Usa il colore scelto sopra invece di quello del tema" /></Row>}
      {dlg && <ImportDialog onClose={() => setDlg(false)} onDone={reload} />}
    </Section>
  );
}
