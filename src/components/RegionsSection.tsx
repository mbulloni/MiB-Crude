// Header, footer and menu of the generated app (runtime/lib/Regions.php): a file of the project's public
// folder or code written here, shown by the standard layout and by every theme.
import { update, useStore } from '../store';
import CodeEditor from './CodeEditor';
import { Check, Row, Section, Select, Text } from './ui';

type Name = 'header' | 'footer' | 'menu';
interface Region { source?: 'none' | 'file' | 'code'; file?: string; code?: string; hideStandard?: boolean; position?: 'replace' | 'before' | 'after' }
const LABEL: Record<Name, string> = { header: 'Intestazione (header)', footer: 'Piè di pagina (footer)', menu: 'Menu' };
const SAMPLE: Record<Name, string> = {
  header: '<?php\n// $app: applicazione MiB-Crude (utente: \\MiB\\App::$i->security->user(), sessione: $_SESSION)\n?>\n<div class="px-3 py-2 bg-body-tertiary border-bottom small">Intestazione del progetto</div>\n',
  footer: '<div class="text-center small text-secondary py-3">© <?= date(\'Y\') ?> Il mio progetto</div>\n',
  menu: '<?php // markup del tema: per il layout standard voci <li class="nav-item"><a class="nav-link" href="…">…</a></li> ?>\n<li class="nav-item"><a class="nav-link" href="index.php?p=list&t=…"><i class="bi bi-star me-2"></i>Voce personalizzata</a></li>\n',
};

export default function RegionsSection() {
  const regions = useStore((s) => s.proj?.project.settings.regions) as Record<Name, Region> | undefined;
  const set = (name: Name, patch: Region) => update((d) => {
    const all = (d.project.settings.regions ||= {}) as Record<Name, Region>;
    all[name] = { ...(all[name] || {}), ...patch };
    if (patch.source === 'code' && !all[name].code) all[name].code = SAMPLE[name];
  });
  return (
    <Section title="Intestazione, piè di pagina e menu" help="Come gli «include» di phpr: un file della cartella public/ del progetto (copiato nella radice dell'app, per esempio k-nav-bar-top.php) oppure codice HTML/PHP scritto qui. Vale per il layout standard e per tutti i temi; un errore nel codice viene mostrato al suo posto senza bloccare la pagina.">
      {(['header', 'footer', 'menu'] as Name[]).map((name) => {
        const r = regions?.[name] || {};
        const src = r.source || 'none';
        return (
          <div key={name} className="region-box">
            <Row label={LABEL[name]}>
              <Select value={src} options={[['none', name === 'menu' ? 'Menu generato' : 'Nessuno'], ['file', 'File del progetto'], ['code', 'Codice']]} onChange={(v) => set(name, { source: v as Region['source'] })} />
            </Row>
            {src === 'file' && <Row label="File" hint="Percorso relativo alla radice dell'app (= cartella public/ del progetto), es. k-nav-bar-top.php o include/menu.php">
              <Text value={r.file} onChange={(v) => set(name, { file: v })} mono placeholder={name === 'menu' ? 'k-sidebar-menu-left.php' : name === 'header' ? 'k-nav-bar-top.php' : 'footer.php'} /></Row>}
            {src === 'code' && <CodeEditor value={r.code || ''} onChange={(v) => set(name, { code: v })} height={180} />}
            {src !== 'none' && name !== 'menu' && <Row label=" "><Check value={!!r.hideStandard} onChange={(v) => set(name, { hideStandard: v })}
              label={name === 'header' ? 'Nascondi l\'intestazione standard (barra con titolo e menu utente)' : 'Nascondi il piè di pagina del tema'} /></Row>}
            {src !== 'none' && name === 'menu' && <Row label="Posizione">
              <Select value={r.position || 'replace'} options={[['replace', 'Sostituisce il menu generato'], ['before', 'Prima del menu generato'], ['after', 'Dopo il menu generato']]} onChange={(v) => set(name, { position: v as Region['position'] })} /></Row>}
          </div>
        );
      })}
    </Section>
  );
}
