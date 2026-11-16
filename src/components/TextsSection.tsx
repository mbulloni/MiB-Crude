// Texts of a page: the runtime strings it uses, per project language, as overrides of the project translations (proj.lang).
import { update, useStore } from '../store';
import { Btn, Section, Text } from './ui';
import it from '../../runtime/lang/it.json';
import en from '../../runtime/lang/en.json';

const BUILTIN: Record<string, Record<string, string>> = { it, en };

export default function TextsSection({ keys, readOnly }: { keys: string[]; readOnly?: boolean }) {
  const p = useStore((s) => s.proj)!;
  const langs = p.project.languages;
  const text = (code: string, key: string) => p.lang[code]?.[key] ?? BUILTIN[code]?.[key] ?? BUILTIN.en[key] ?? '';
  const setText = (code: string, key: string, v: string) => {
    if (readOnly) return;
    update((x) => {
      x.lang[code] = { ...(x.lang[code] || {}) };
      if (v === '' || v === (BUILTIN[code]?.[key] ?? BUILTIN.en[key] ?? '')) delete x.lang[code][key]; else x.lang[code][key] = v;
    });
  };
  if (!keys.length) return null;
  return (
    <Section title="Testi e etichette" help="I testi di questa pagina, per lingua. Lasciare vuoto (o uguale all'originale) ripristina il testo standard. Valgono anche per le altre pagine che usano la stessa frase (es. «Indietro»).">
      <table className="grid"><thead><tr><th>Testo</th>{langs.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr></thead><tbody>
        {keys.map((k) => <tr key={k}><td className="mono">{k}</td>
          {langs.map((c) => <td key={c}><Text value={text(c, k)} placeholder={BUILTIN[c]?.[k] ?? BUILTIN.en[k] ?? ''} disabled={readOnly} onChange={(v) => setText(c, k, v)} />
            {p.lang[c]?.[k] !== undefined && <Btn small kind="ghost" icon="arrow-counterclockwise" title="Ripristina il testo standard" disabled={readOnly} onClick={() => setText(c, k, '')} />}</td>)}</tr>)}
      </tbody></table>
    </Section>
  );
}
