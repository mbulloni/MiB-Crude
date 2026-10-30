import { update, useStore } from '../store';
import { GLOBAL_EVENTS } from '../events';
import EventEditor from './EventEditor';
import { useItemLock } from './TeamPanel';

export default function GlobalEvents() {
  const p = useStore((s) => s.proj)!;
  const lock = useItemLock('events:_global');
  return (
    <div className="panel">
      <div className="title-row"><h2>Eventi globali</h2>{lock.banner}</div>
      <EventEditor defs={GLOBAL_EVENTS} code={p.events._global || {}} readOnly={lock.readOnly}
        onChange={(ev, code) => update((d) => { d.events._global = { ...(d.events._global || {}) }; if (code == null) delete d.events._global[ev]; else d.events._global[ev] = code; })} />
    </div>
  );
}
