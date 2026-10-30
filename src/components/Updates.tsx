// Updates from the GitHub releases: startup check (at most every 12 hours), banner, release notes,
// download with progress, restart. The .deb is installed with pkexec, the AppImage is replaced in place.
import { useEffect, useState } from 'react';
import { call, mc } from '../api';
import { useStore } from '../store';
import { Btn, Check, I, Modal } from './ui';

interface Info { current: string; latest: string; newer: boolean; notes: string; url: string; published: string | null; mode: 'appimage' | 'deb' | 'manual'; asset: { name: string; size: number } | null }
const KEY = 'mibcrude.updates';
interface Prefs { auto: boolean; last: number; skip: string | null }
const prefs = (): Prefs => { try { return { auto: true, last: 0, skip: null, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { auto: true, last: 0, skip: null }; } };
const setPrefs = (p: Partial<Prefs>) => { try { localStorage.setItem(KEY, JSON.stringify({ ...prefs(), ...p })); } catch { /* ignore */ } };

let listeners: ((s: { info: Info | null; open: boolean; error: string }) => void)[] = [];
let state = { info: null as Info | null, open: false, error: '' };
const emit = (p: Partial<typeof state>) => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };
function useUpdates() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.push(setS); return () => { listeners = listeners.filter((l) => l !== setS); }; }, []);
  return s;
}

/** quiet = startup check: respects the interval, the automatic flag and the skipped version. */
export async function checkUpdates(quiet: boolean) {
  const p = prefs();
  if (quiet && (!p.auto || Date.now() - p.last < 12 * 3600 * 1000)) return;
  try {
    const info = await call<Info>('update:check');
    setPrefs({ last: Date.now() });
    if (!quiet) emit({ info, open: true, error: '' });
    else if (info.newer && p.skip !== info.latest) emit({ info });
  } catch (e: any) {
    if (!quiet) emit({ info: null, open: true, error: e.message });
  }
}

function notes(md: string) {
  return md.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l, i) => {
    const plain = l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
    if (/^#{1,6}\s/.test(l)) return <b key={i} className="rn-h">{plain.replace(/^#+\s*/, '')}</b>;
    if (/^\s*[-*]\s/.test(l)) return <div key={i}>• {plain.replace(/^\s*[-*]\s/, '')}</div>;
    return <p key={i}>{plain}</p>;
  });
}

export function UpdateBanner() {
  const { info, open } = useUpdates();
  if (!info?.newer || open) return null;
  return (
    <div className="update-banner"><I n="arrow-up-circle" /> <b>È disponibile MiB-Crude {info.latest}</b><span className="muted">(installata {info.current})</span><span className="grow" />
      <Btn small kind="primary" onClick={() => emit({ open: true })}>Novità e aggiornamento…</Btn>
      <Btn small onClick={() => emit({ info: null })}>Più tardi</Btn>
      <Btn small kind="ghost" onClick={() => { setPrefs({ skip: info.latest }); emit({ info: null }); }}>Salta questa versione</Btn></div>
  );
}

export function UpdateDialog() {
  const { info: u, open, error } = useUpdates();
  const [st, setSt] = useState<{ busy?: boolean; done?: boolean; error?: string; note?: string; bytes?: number; total?: number; installing?: boolean }>({});
  const [auto, setAuto] = useState(prefs().auto);
  useEffect(() => mc().onUpdateProgress((p) => setSt((s) => (p.phase === 'install' ? { ...s, installing: true } : { ...s, bytes: p.bytes, total: p.total }))), []);
  if (!open) return null;
  const close = () => { if (!st.busy || st.done || st.error || st.note) emit({ open: false, error: '' }); };
  const install = async () => {
    setSt({ busy: true });
    try {
      const r = await call('update:install');
      if (r.done) setSt({ busy: true, done: true });
      else if (r.reason === 'installer') setSt({ note: `Installazione automatica non riuscita: si è aperto l'installatore di sistema con ${r.file}.` });
      else if (r.reason === 'manual') setSt({ note: 'Questa copia non è un AppImage né un pacchetto .deb: si è aperta la pagina della release.' });
      else setSt({ note: 'Nessun aggiornamento da installare.' });
    } catch (e: any) { setSt({ error: e.message }); }
  };
  const restart = () => {
    if (useStore.getState().dirty && !confirm('Il progetto ha modifiche non salvate. Riavviare comunque?')) return;
    call('update:restart');
  };
  const mb = (n?: number) => ((n || 0) / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 });
  const pct = st.total ? Math.round(((st.bytes || 0) / st.total) * 100) : 0;
  return (
    <Modal title={u?.newer ? `Aggiornamento a MiB-Crude ${u.latest}` : 'Aggiornamenti'} onClose={close}
      footer={<>{u?.url && <Btn onClick={() => call('shell:open', u.url)}>Pagina della release</Btn>}<span className="grow" />
        <Btn onClick={close}>Chiudi</Btn>
        {u?.newer && !st.done && <Btn kind="primary" icon="download" disabled={st.busy && !st.error && !st.note} onClick={install}>Aggiorna ora</Btn>}
        {st.done && <Btn kind="primary" icon="arrow-clockwise" onClick={restart}>Riavvia ora</Btn>}</>}>
      {error && <div className="alert err">{error}</div>}
      {u && !u.newer && <div className="alert ok">Hai già l'ultima versione ({u.current}).</div>}
      {u?.newer && <>
        <p className="help">Installata {u.current} · nuova {u.latest}{u.published ? ` · ${new Date(u.published).toLocaleDateString('it-IT')}` : ''}</p>
        <div className="release-notes">{notes(u.notes || '—')}</div>
        <p className="help">{u.mode === 'appimage' ? `Verrà scaricato ${u.asset?.name} (${mb(u.asset?.size)} MB) e sostituito l'AppImage in uso.`
          : u.mode === 'deb' ? `Verrà scaricato ${u.asset?.name} (${mb(u.asset?.size)} MB) e installato con apt: il sistema chiede la password.`
            : 'Copia non installata da AppImage o .deb: verrà aperta la pagina della release.'}</p>
      </>}
      {st.busy && !st.done && !st.error && <div><span className="small">{st.installing ? 'Installazione…' : `Download ${mb(st.bytes)} / ${mb(st.total)} MB`}</span><progress max={100} value={st.installing ? 100 : pct} style={{ width: '100%' }} /></div>}
      {st.done && <div className="alert ok">Aggiornamento installato: riavvia per usare la nuova versione.</div>}
      {st.note && <div className="alert ok">{st.note}</div>}
      {st.error && <div className="alert err">{st.error}</div>}
      <Check label="Controlla gli aggiornamenti all'avvio (GitHub, nessun dato inviato)" value={auto} onChange={(v) => { setAuto(v); setPrefs({ auto: v }); }} />
    </Modal>
  );
}
