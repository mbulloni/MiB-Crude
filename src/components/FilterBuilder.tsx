import type { Cond, Field } from '../types';
import { Btn, I, Select, Text, lbl } from './ui';

const OP_LABEL: Record<string, string> = {
  contains: 'contiene', equals: 'è uguale a', notequals: 'è diverso da', starts: 'inizia con',
  more: 'è maggiore di', less: 'è minore di', between: 'è compreso tra', empty: 'è vuoto', notempty: 'non è vuoto',
};

type Kind = 'text' | 'number' | 'date' | 'bool' | 'list';
const kindOf = (f: Field | undefined): Kind => {
  if (!f) return 'text';
  if (f.editAs?.lookup?.kind === 'list' && (f.editAs.lookup.values || []).length) return 'list';
  if (f.type === 'bool') return 'bool';
  if (f.type === 'date' || f.type === 'datetime') return 'date';
  if (f.type === 'int' || f.type === 'decimal') return 'number';
  return 'text';
};
const opsFor = (k: Kind): string[] => k === 'text' ? ['contains', 'equals', 'notequals', 'starts', 'empty', 'notempty']
  : k === 'bool' || k === 'list' ? ['equals', 'notequals', 'empty', 'notempty']
  : ['equals', 'notequals', 'more', 'less', 'between', 'empty', 'notempty'];
const noValue = (op: string) => op === 'empty' || op === 'notempty';

function ValueInput({ f, value, onChange }: { f: Field | undefined; value: string | undefined; onChange: (v: string) => void }) {
  const k = kindOf(f);
  if (k === 'bool') return <Select value={value || ''} options={[['', '— scegli —'], ['1', 'Sì'], ['0', 'No']] as [string, string][]} onChange={onChange} />;
  if (k === 'list') return <Select value={value || ''} options={[['', '— scegli —'], ...(f!.editAs.lookup!.values || []).map((o) => [String(o.value), lbl(o.label, String(o.value))] as [string, string])]} onChange={onChange} />;
  return <Text value={value} onChange={onChange} type={k === 'number' ? 'number' : k === 'date' ? 'date' : 'text'} placeholder={k === 'text' ? 'testo da cercare' : ''} />;
}

/**
 * Fixed filter without SQL: field + condition + value, one line per test. Used on data sources, reports and charts
 * ("Filtra i dati"): picks what the page or the report is allowed to show, always.
 */
export function FilterBuilder({ fields, value, onChange }: { fields: Field[]; value: Cond[] | undefined; onChange: (v: Cond[] | undefined) => void }) {
  const list = value || [];
  const byName = (n: string) => fields.find((f) => f.name === n);
  const save = (next: Cond[]) => onChange(next.length ? next : undefined);
  const set = (i: number, patch: Partial<Cond>) => save(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return <div className="filterbuilder">
    {!list.length && <p className="help">Nessun filtro: vengono mostrati tutti i dati.</p>}
    {list.map((c, i) => {
      const f = byName(c.field);
      const k = kindOf(f);
      return <div className="inline" key={i}>
        <span className="muted" style={{ minWidth: '2.2rem' }}>{i === 0 ? 'Solo se' : 'e'}</span>
        <Select value={c.field} options={fields.map((x) => [x.name, lbl(x.label, x.name)] as [string, string])}
          onChange={(v) => { const nk = kindOf(byName(v)); set(i, { field: v, op: opsFor(nk).includes(c.op) ? c.op : opsFor(nk)[0], v: '', v2: '' }); }} />
        <Select value={c.op} options={opsFor(k).map((o) => [o, OP_LABEL[o]] as [string, string])} onChange={(v) => set(i, { op: v })} />
        {!noValue(c.op) && <ValueInput f={f} value={c.v} onChange={(v) => set(i, { v })} />}
        {c.op === 'between' && <><span className="muted">e</span><ValueInput f={f} value={c.v2} onChange={(v) => set(i, { v2: v })} /></>}
        <Btn small kind="ghost" icon="x-lg" title="Togli la condizione" onClick={() => save(list.filter((_, j) => j !== i))} />
      </div>;
    })}
    <Btn small icon="plus-lg" onClick={() => { const f = fields[0]; if (f) save([...list, { field: f.name, op: opsFor(kindOf(f))[0], v: '' }]); }}>Aggiungi condizione</Btn>
    {list.length > 1 && <p className="help"><I n="info-circle" /> Il record si vede solo se tutte le condizioni sono vere.</p>}
  </div>;
}
