import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, toast, useStore } from '../store';
import { SNIPPETS, template, type EventDef } from '../events';
import CodeEditor from './CodeEditor';
import { Btn, I, Modal, Text } from './ui';

/** Writes or changes the event with Claude; the result is shown before replacing the code. */
function AiDialog({ event, def, table, current, onApply, onClose }: { event: string; def: EventDef; table?: string; current: string; onApply: (code: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<{ hasKey: boolean; fromEnv: boolean; encrypted: boolean; model: string } | null>(null);
  const [key, setKey] = useState('');
  const [req, setReq] = useState('');
  const [res, setRes] = useState<{ code: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('ai:status').then(setStatus); }, []);
  const saveKey = () => run('Salvataggio chiave…', async () => { await call('ai:setKey', key.trim()); setKey(''); setStatus(await call('ai:status')); toast('Chiave salvata (cifrata nel portachiavi di sistema)', 'ok'); });
  const go = async () => {
    setBusy(true);
    try { setRes(await call('ai:event', useStore.getState().proj, table || '', event, def, current, req)); }
    catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };
  return (
    <Modal wide title={<><I n="stars" /> Assistente AI — {event}</>} onClose={onClose}
      footer={<><span className="muted small grow">{status?.model}</span><Btn onClick={onClose}>Chiudi</Btn>
        {res && <Btn kind="primary" icon="check-lg" onClick={() => { onApply(res.code); onClose(); }}>{current.trim() ? 'Sostituisci il codice' : 'Usa il codice'}</Btn>}</>}>
      {status && !status.hasKey && <div className="card">
        <p className="help">Serve una chiave API di Anthropic (console.anthropic.com). Viene salvata solo su questo computer, cifrata{status.encrypted ? ' con il portachiavi di sistema' : ''}; in alternativa imposta la variabile ANTHROPIC_API_KEY.</p>
        <div className="inline"><Text type="password" value={key} onChange={setKey} placeholder="sk-ant-…" /><Btn kind="primary" onClick={saveKey} disabled={!key.trim()}>Salva chiave</Btn></div></div>}
      {status?.hasKey && <>
        <p className="help">Descrivi cosa deve fare l'evento. L'assistente conosce tabelle e campi del progetto, la firma dell'evento e le funzioni del runtime; il codice PHP viene controllato con php -l.
          {current.trim() ? ' Il codice attuale viene inviato per essere modificato.' : ''}</p>
        <textarea className="inp" rows={4} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Es.: impedisci di salvare se la data di fine è prima della data di inizio" />
        <div className="inline"><Btn kind="primary" icon="stars" onClick={go} disabled={busy || !req.trim()}>{busy ? 'Scrittura in corso…' : res ? 'Riprova' : 'Scrivi il codice'}</Btn>
          {!status.fromEnv && <Btn small kind="ghost" onClick={() => run('', async () => { await call('ai:setKey', ''); setStatus(await call('ai:status')); })}>Rimuovi chiave</Btn>}</div>
        {res && <><CodeEditor language={def.lang || 'php'} value={res.code} onChange={(v) => setRes({ ...res, code: v })} height="320px" />
          {res.note && <p className="help">{res.note}</p>}</>}
      </>}
    </Modal>
  );
}

/** Event list + code editor, used for table events and global events. */
export default function EventEditor({ defs, code, onChange, table, readOnly }: { defs: Record<string, EventDef>; code: Record<string, string>; onChange: (name: string, code: string | null) => void; table?: string; readOnly?: boolean }) {
  const names = Object.keys(defs);
  const [cur, setCur] = useState(names.find((n) => code[n]) || names[0]);
  const [marker, setMarker] = useState<{ line: number; message: string } | null>(null);
  const [ai, setAi] = useState(false);
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
          {!readOnly && <Btn small icon="stars" onClick={() => setAi(true)} title="Scrivi o modifica l'evento con Claude">Assistente AI</Btn>}
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
      {ai && <AiDialog event={cur} def={def} table={table} current={code[cur] || ''} onApply={(c) => onChange(cur, c)} onClose={() => setAi(false)} />}
    </div>
  );
}
