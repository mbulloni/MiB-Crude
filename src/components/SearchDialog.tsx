// "Cerca nel progetto" (Ctrl+Shift+F): results grouped by place, a click opens the panel of the result.
import { useMemo, useState } from 'react';
import { searchProject } from '../search';
import { useStore } from '../store';
import { I, Modal } from './ui';

export default function SearchDialog({ onClose }: { onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchProject(p, q), [p, q]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof hits>();
    for (const h of hits) m.set(h.where, [...(m.get(h.where) || []), h]);
    return [...m.entries()];
  }, [hits]);
  const mark = (s: string) => {
    const i = s.toLowerCase().indexOf(q.trim().toLowerCase());
    return i < 0 ? s : <>{s.slice(0, i)}<mark>{s.slice(i, i + q.trim().length)}</mark>{s.slice(i + q.trim().length)}</>;
  };
  return (
    <Modal wide title={<><I n="search" /> Cerca nel progetto</>} onClose={onClose}>
      <input className="inp" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome di tabella o campo, testo di un evento, etichetta, SQL…"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
      <div className="search-results">
        {q.trim().length >= 2 && !hits.length && <p className="muted">Nessun risultato</p>}
        {groups.map(([where, list]) => <div key={where} className="search-group">
          <div className="search-where">{where} <span className="muted">({list.length})</span></div>
          {list.map((h, i) => <button key={i} type="button" className="search-hit" onClick={() => { useStore.getState().set({ nav: h.nav }); onClose(); }}>
            <span className="search-what">{h.what}{h.line ? `:${h.line}` : ''}</span> <span className="mono">{mark(h.text)}</span>
          </button>)}
        </div>)}
        {hits.length >= 300 && <p className="muted">Mostrati i primi 300 risultati: restringi la ricerca.</p>}
      </div>
    </Modal>
  );
}
