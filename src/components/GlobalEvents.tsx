import { update, useStore } from '../store';
import { GLOBAL_EVENTS } from '../events';
import EventEditor from './EventEditor';
import { useItemLock } from './TeamPanel';
import { Hero } from './ui';

export default function GlobalEvents() {
  const p = useStore((s) => s.proj)!;
  const lock = useItemLock('events:_global');
  return (
    <div className="panel">
      <Hero icon="lightning-charge" title="Eventi globali" chips={[
        ['code-slash', `${Object.entries(p.events._global || {}).filter(([k, c]) => !k.startsWith('Task_') && c && c.trim()).length} eventi scritti`],
        ['clock-history', `${Object.keys(p.events._global || {}).filter((k) => k.startsWith('Task_')).length} attività pianificate`],
      ]} actions={lock.banner} />
      <EventEditor defs={GLOBAL_EVENTS} code={p.events._global || {}} readOnly={lock.readOnly}
        onChange={(ev, code) => update((d) => { d.events._global = { ...(d.events._global || {}) }; if (code == null) delete d.events._global[ev]; else d.events._global[ev] = code; })} />
    </div>
  );
}
