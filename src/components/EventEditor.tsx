import { useState } from 'react';
import { call } from '../api';
import { run, toast } from '../store';
import { SNIPPETS, template, type EventDef } from '../events';
import CodeEditor from './CodeEditor';
import { Btn, I } from './ui';

/** Event list + code editor, used for table events and global events. */
export default function EventEditor({ defs, code, onChange, table, readOnly }: { defs: Record<string, EventDef>; code: Record<string, string>; onChange: (name: string, code: string | null) => void; table?: string; readOnly?: boolean }) {
  const names = Object.keys(defs);
  const [cur, setCur] = useState(names.find((n) => code[n]) || names[0]);
  const [marker, setMarker] = useState<{ line: number; message: string } | null>(null);
  const def = defs[cur];
  const has = (n: string) => !!(code[n] && code[n].trim());
  const lint = () => run('Controllo…', async () => {
    if (def.lang === 'javascript') {
      try { new Function('pageObj', 'proxy', 'pageid', 'inlineRow', 'inlineObject', 'row', code[cur] || ''); setMarker(null); toast('Nessun errore di sintassi', 'ok', 1500); }
      catch (e: any) { setMarker({ line: 1, message: e.message }); toast(e.message, 'err'); }
      return;
    }
    const r = await call('php:lintEvent', code[cur] || '', def.args);
    if (r.skipped) toast('PHP non installato: controllo saltato', 'info');
    else if (r.ok) { setMarker(null); toast('Nessun errore di sintassi', 'ok', 1500); }
    else { setMarker({ line: r.line || 1, message: r.message }); toast(r.message, 'err'); }
  });
  const snippets = SNIPPETS.filter((s) => s.events.includes(cur));
  return (
    <div className="events">
      <div className="ev-list">
        {names.map((n) => <button key={n} className={`ev ${n === cur ? 'on' : ''}`} onClick={() => { setCur(n); setMarker(null); }}>
          <I n={defs[n].lang === 'javascript' ? 'filetype-js' : has(n) ? 'lightning-fill' : 'lightning'} className={has(n) ? 'accent' : 'muted'} /> {n}</button>)}
      </div>
      <div className="ev-body">
        <div className="ev-head"><code>{cur}({def.args})</code><span className="grow" />
          {!has(cur) && !readOnly && <Btn small kind="primary" icon="plus-lg" onClick={() => onChange(cur, template(cur, def, table))}>Crea evento</Btn>}
          {has(cur) && <>
            {snippets.length > 0 && !readOnly && <select className="inp sm" value="" onChange={(e) => { const s = snippets[Number(e.target.value)]; if (s) onChange(cur, (code[cur] || '').replace(/\n?return true;\s*$/, '\n' + s.code + '\nreturn true;\n')); }}>
              <option value="">Inserisci azione predefinita…</option>{snippets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>}
            <Btn small icon="check2-circle" onClick={lint}>Controlla</Btn>
            {!readOnly && <Btn small icon="trash" kind="ghost" onClick={() => { if (confirm(`Eliminare l'evento ${cur}?`)) onChange(cur, null); }} />}</>}
        </div>
        <p className="help">{def.help}</p>
        {has(cur) ? <CodeEditor key={cur} language={def.lang || 'php'} value={code[cur]} onChange={(v) => onChange(cur, v)} height="calc(100vh - 330px)" readOnly={readOnly} marker={marker} />
          : <div className="empty small"><I n="lightning" className="big" /><p>Evento non definito: l'applicazione usa il comportamento standard.</p></div>}
      </div>
    </div>
  );
}
