import { useMemo, useState } from 'react';
import { update, useStore } from '../store';
import { Hero, Section } from './ui';
import it from '../../runtime/lang/it.json';
import en from '../../runtime/lang/en.json';
import { useItemLock } from './TeamPanel';

const BUILTIN: Record<string, Record<string, string>> = { it, en };

/** Translations: labels of tables/fields per language + overrides of the runtime strings. */
export default function LanguagesPanel() {
  const p = useStore((s) => s.proj)!;
  const langs = p.project.languages;
  const [filter, setFilter] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const lock = useItemLock('lang');
  const rows = useMemo(() => {
    const out: { key: string; kind: 'label' | 'string'; get: (code: string) => string; base: string }[] = [];
    for (const t of p.tables) {
      out.push({ key: `${t.name}`, kind: 'label', get: (c) => t.caption[c] || '', base: t.name });
      for (const f of t.fields) out.push({ key: `${t.name}.${f.name}`, kind: 'label', get: (c) => f.label[c] || '', base: f.name });
    }
    for (const k of Object.keys(BUILTIN.it)) out.push({ key: k, kind: 'string', get: (c) => p.lang[c]?.[k] ?? BUILTIN[c]?.[k] ?? '', base: BUILTIN.en[k] });
    return out;
  }, [p]);
  const setVal = (key: string, kind: string, code: string, v: string) => {
    if (lock.readOnly) return;
    update((d) => {
      if (kind === 'label') {
        const [tn, fn] = key.split('.');
        const t = d.tables.find((x) => x.name === tn)!;
        if (fn) t.fields.find((x) => x.name === fn)!.label[code] = v; else t.caption[code] = v;
      } else {
        d.lang[code] = { ...(d.lang[code] || {}) };
        if (v === (BUILTIN[code]?.[key] ?? '')) delete d.lang[code][key]; else d.lang[code][key] = v;
      }
    });
  };
  const shown = rows.filter((r) => (!filter || r.key.toLowerCase().includes(filter.toLowerCase()) || langs.some((c) => r.get(c).toLowerCase().includes(filter.toLowerCase())))
    && (!onlyMissing || langs.some((c) => !r.get(c))));
  return (
    <div className="panel">
      <Hero icon="translate" title="Lingue" chips={[
        ['translate', langs.map((l) => l.toUpperCase()).join(' · ')],
        ['star', `Predefinita: ${p.project.defaultLanguage.toUpperCase()}`],
        ['card-text', `${rows.length} testi`],
        ['exclamation-circle', `${rows.filter((r) => langs.some((c) => !r.get(c))).length} da tradurre`],
      ]} actions={lock.banner} />
      <Section title={`Traduzioni (${langs.join(', ')})`} help="Etichette di tabelle e campi, e testi dell'applicazione (pulsanti, messaggi). Le stringhe modificate prevalgono su quelle predefinite.">
        <div className="inline"><input className="inp" placeholder="Cerca…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Solo mancanti</label></div>
        <div className="lang-wrap"><table className="grid"><thead><tr><th>Chiave</th>{langs.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr></thead><tbody>
          {shown.slice(0, 600).map((r) => <tr key={r.kind + r.key}><td className="mono small">{r.kind === 'label' ? <b>{r.key}</b> : r.key}</td>
            {langs.map((c) => <td key={c}><input className={`inp ${r.get(c) ? '' : 'missing'}`} value={r.get(c)} placeholder={r.base} onChange={(e) => setVal(r.key, r.kind, c, e.target.value)} /></td>)}</tr>)}
        </tbody></table></div>
      </Section>
    </div>
  );
}
