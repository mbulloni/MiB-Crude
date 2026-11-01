import { useState } from 'react';
import { saveSecrets, update, useStore } from '../store';
import { Area, Check, I, LangText, Num, Row, Section, Select, Text } from './ui';
import ThemesSection from './ThemesSection';
import RegionsSection from './RegionsSection';
import TasksSection from './TasksSection';
import MailTemplatesSection from './MailTemplatesSection';
import SmsSection from './SmsSection';
import GeocodeSection from './GeocodeSection';

const LANGS: [string, string][] = [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['ro', 'Română'], ['pl', 'Polski']];
const COLORS = ['#0d6efd', '#2f6fd6', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#198754', '#20c997', '#0dcaf0', '#343a40', '#ffc107'];

type Cat = 'general' | 'look' | 'features' | 'automation' | 'messages' | 'maps';
const CATS: [Cat, string, string, string][] = [
  ['general', 'Generale', 'sliders', 'Titolo, lingue, formati, file'],
  ['look', 'Aspetto', 'palette', 'Colori, temi, intestazione, presentazione'],
  ['features', 'Funzioni', 'toggles', 'Audit, notifiche, PWA, API, report utenti'],
  ['automation', 'Automazione', 'clock-history', 'Attività pianificate'],
  ['messages', 'Comunicazione', 'envelope', 'Email, modelli, SMS'],
  ['maps', 'Mappe', 'geo-alt', 'Geocodifica degli indirizzi'],
];

/** One feature: icon, title, description and switch; its options under it when on. */
function Feature({ icon, title, desc, on, onChange, children }: { icon: string; title: string; desc: string; on: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={`feature ${on ? 'on' : ''}`}>
      <label className="feature-head">
        <span className="feature-icon"><I n={icon} /></span>
        <span className="grow"><b>{title}</b><small>{desc}</small></span>
        <span className="switch"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><i /></span>
      </label>
      {on && children && <div className="feature-body">{children}</div>}
    </div>
  );
}

export default function ProjectPanel() {
  const p = useStore((s) => s.proj)!;
  const secrets = useStore((s) => s.secrets);
  const m = p.project;
  const st = m.settings;
  const set = (fn: (x: typeof m) => void) => update((d) => fn(d.project));
  const [cat, setCatState] = useState<Cat>(() => { try { return (localStorage.getItem('mc-settings-cat') as Cat) || 'general'; } catch { return 'general'; } });
  const setCat = (c: Cat) => { setCatState(c); try { localStorage.setItem('mc-settings-cat', c); } catch { /* private mode */ } };
  const active = [st.audit, st.notifications !== false, !!st.pwa, st.savedSearches !== false, st.recordLocking, st.webBuilder?.enabled, st.api?.enabled].filter(Boolean).length;
  const tasks = ((st as { tasks?: unknown[] }).tasks || []).length;
  return (
    <div className="panel settings-panel">
      <div className="settings-hero" style={{ ['--pc' as any]: m.theme.primary }}>
        <div className="hero-logo">{(m.title[m.defaultLanguage] || m.name).slice(0, 1).toUpperCase()}</div>
        <div className="grow">
          <h2>{m.title[m.defaultLanguage] || m.name}</h2>
          <div className="hero-chips">
            <span><I n="translate" /> {m.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
            <span><I n={m.theme.layout === 'sidebar' ? 'layout-sidebar' : 'layout-text-window'} /> {m.theme.layout === 'sidebar' ? 'Barra laterale' : 'Barra in alto'}</span>
            <span><I n="circle-half" /> {m.theme.mode === 'dark' ? 'Scuro' : m.theme.mode === 'light' ? 'Chiaro' : 'Automatico'}</span>
            <span><I n="toggles" /> {active} funzioni attive</span>
            {tasks > 0 && <span><I n="clock-history" /> {tasks} attività</span>}
            {m.theme.pack && <span><I n="brush" /> {m.theme.pack}</span>}
          </div>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {CATS.map(([k, label, icon, desc]) => (
            <button type="button" key={k} className={`settings-nav-item ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>
              <I n={icon} /><span><b>{label}</b><small>{desc}</small></span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {cat === 'general' && <div className="cols">
            <div>
          <Section title="Generale">
            <Row label="Titolo applicazione"><LangText value={m.title} onChange={(v) => set((x) => { x.title = v; })} /></Row>
            <Row label="Lingue" hint="La prima è la predefinita. Le stringhe del runtime esistono in italiano e inglese; le altre si traducono in Lingue.">
              <span className="chips">{LANGS.map(([c, l]) => <Check key={c} label={l} value={m.languages.includes(c)} onChange={(on) => set((x) => {
                x.languages = on ? [...x.languages, c] : x.languages.filter((y) => y !== c);
                if (!x.languages.length) x.languages = ['it'];
                if (!x.languages.includes(x.defaultLanguage)) x.defaultLanguage = x.languages[0];
              })} />)}</span></Row>
            <Row label="Lingua predefinita"><Select value={m.defaultLanguage} options={m.languages} onChange={(v) => set((x) => { x.defaultLanguage = v; x.languages = [v, ...x.languages.filter((y) => y !== v)]; })} /></Row>
            <Row label="Pagina iniziale" hint="URL relativo, es. index.php?p=dashboard&d=main. Vuoto: home con le tabelle."><Text value={st.homePage} onChange={(v) => set((x) => { x.settings.homePage = v; })} mono /></Row>
          </Section>
          <Section title="File caricati">
            <Row label="Cartella upload" hint="Relativa all'applicazione oppure assoluta (fuori dalla web root è più sicuro)."><Text value={st.uploadDir} onChange={(v) => set((x) => { x.settings.uploadDir = v; })} mono /></Row>
            <Row label="Dimensione massima (MB)"><Num value={st.maxUploadMb} onChange={(v) => set((x) => { x.settings.maxUploadMb = v || 20; })} /></Row>
          </Section>
            </div>
            <div>
          <Section title="Formati">
            <Row label="Data"><Select value={st.dateFormat} options={[['d/m/Y', '31/12/2026'], ['m/d/Y', '12/31/2026'], ['Y-m-d', '2026-12-31'], ['d.m.Y', '31.12.2026']]} onChange={(v) => set((x) => { x.settings.dateFormat = v; x.settings.dateTimeFormat = v + ' H:i'; })} /></Row>
            <Row label="Separatori numeri"><Select value={st.decimalSeparator} options={[[',', '1.234,56'], ['.', '1,234.56']]} onChange={(v) => set((x) => { x.settings.decimalSeparator = v; x.settings.thousandsSeparator = v === ',' ? '.' : ','; })} /></Row>
            <Row label="Valuta"><Text value={st.currency} onChange={(v) => set((x) => { x.settings.currency = v; })} /></Row>
            <Row label="Fuso orario"><Text value={st.timezone} onChange={(v) => set((x) => { x.settings.timezone = v; })} /></Row>
          </Section>
          <Section title="Note"><Area value={st.notes} onChange={(v) => set((x) => { x.settings.notes = v; })} rows={3} placeholder="Appunti per il team…" /></Section>
            </div>
          </div>}
          {cat === 'look' && <div className="cols">
            <div>
          <Section title="Stile">
            <div className="theme-preview" style={{ ['--pc' as any]: m.theme.primary }}>
              <div className="tp-bar">{m.title[m.defaultLanguage] || m.name}</div>
              <div className="tp-body">{m.theme.layout === 'sidebar' && <div className="tp-side" />}<div className="tp-main"><span className="tp-btn">Nuovo</span><div className="tp-grid" /></div></div>
            </div>
            <Row label="Colore principale"><span className="inline">{COLORS.map((c) => <button key={c} type="button" className={`swatch ${m.theme.primary === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set((x) => { x.theme.primary = c; })} />)}
              <input type="color" value={m.theme.primary} onChange={(e) => set((x) => { x.theme.primary = e.target.value; })} /></span></Row>
            <Row label="Menu"><Select value={m.theme.layout} options={[['sidebar', 'Barra laterale'], ['topbar', 'Barra in alto']]} onChange={(v) => set((x) => { x.theme.layout = v; })} /></Row>
            <Row label="Tema"><Select value={m.theme.mode} options={[['auto', 'Automatico (sistema)'], ['light', 'Chiaro'], ['dark', 'Scuro']]} onChange={(v) => set((x) => { x.theme.mode = v; })} /></Row>
            <Row label="Densità"><Select value={m.theme.density} options={[['normal', 'Normale'], ['compact', 'Compatta']]} onChange={(v) => set((x) => { x.theme.density = v; })} /></Row>
            <p className="help">Personalizzazioni nella cartella <code>custom/</code> del progetto: <code>logo.png</code> (logo in alto), <code>custom.css</code>, <code>custom.js</code> e <code>views/*.php</code> per sostituire le viste del runtime.</p>
          </Section>
          <Section title="Pagina di presentazione" help="Pagina pubblica mostrata aprendo l'applicazione (index.php), con i pulsanti Accedi/Registrati o Entra. Usa il tema delle pagine di accesso.">
            <Row label="Attiva"><Check value={st.landing?.enabled} onChange={(v) => set((x) => { x.settings.landing = { ...(x.settings.landing || {}), enabled: v }; })} /></Row>
            {st.landing?.enabled && <>
              <Row label="Sottotitolo"><LangText value={st.landing?.subtitle} onChange={(v) => set((x) => { x.settings.landing = { ...x.settings.landing, subtitle: v }; })} /></Row>
              <Row label="Testo" hint="HTML semplice ammesso"><LangText multiline value={st.landing?.text} onChange={(v) => set((x) => { x.settings.landing = { ...x.settings.landing, text: v }; })} /></Row>
            </>}
          </Section>
            </div>
            <div>
              <ThemesSection />
              <RegionsSection />
            </div>
          </div>}
          {cat === 'features' && <>
            <div className="feature-grid">
              <Feature icon="journal-text" title="Registro attività" desc="Accessi, inserimenti, modifiche ed eliminazioni in Amministrazione" on={!!st.audit} onChange={(v) => set((x) => { x.settings.audit = v; })} />
              <Feature icon="bell" title="Notifiche" desc="Campanella nell'intestazione; messaggi dall'amministrazione o con addNotification() (serve il login)" on={st.notifications !== false} onChange={(v) => set((x) => { x.settings.notifications = v; })} />
              <Feature icon="phone" title="App installabile (PWA)" desc="Si installa su telefoni e computer e si apre a schermo pieno (serve https)" on={!!st.pwa} onChange={(v) => set((x) => { x.settings.pwa = v; })} />
              <Feature icon="bookmark-star" title="Ricerche salvate" desc="Ogni utente salva ricerche e filtri con un nome; gli amministratori le condividono (serve il login)" on={st.savedSearches !== false} onChange={(v) => set((x) => { x.settings.savedSearches = v; })} />
              <Feature icon="lock" title="Blocco record" desc="Impedisce modifiche contemporanee allo stesso record" on={!!st.recordLocking} onChange={(v) => set((x) => { x.settings.recordLocking = v; })} />
              <Feature icon="bar-chart-line" title="Report e grafici degli utenti" desc="Gli utenti creano e condividono report e grafici dall'applicazione" on={!!st.webBuilder?.enabled} onChange={(v) => set((x) => { x.settings.webBuilder = { ...(x.settings.webBuilder || {}), enabled: v }; })}>
                <Row label="Gruppi autorizzati" hint="Vuoto: tutti gli utenti; separati da virgola"><Text value={(st.webBuilder?.groups || []).join(', ')} onChange={(v) => set((x) => { x.settings.webBuilder.groups = v.split(',').map((g) => g.trim()).filter(Boolean); })} /></Row>
              </Feature>
              <Feature icon="plug" title="API REST" desc="index.php?p=api con chiave API e descrizione OpenAPI; le tabelle si abilitano nella loro scheda API" on={!!st.api?.enabled} onChange={(v) => set((x) => { x.settings.api = { ...(x.settings.api || {}), enabled: v }; })}>
                <Row label="CORS origin" hint="Vuoto: nessuna origine esterna"><Text value={st.api?.corsOrigin} onChange={(v) => set((x) => { x.settings.api.corsOrigin = v; })} mono /></Row>
              </Feature>
            </div>
            <Section title="Tecniche">
              <Row label="Prefisso tabelle di sistema"><Text value={m.systemPrefix || 'mc_'} onChange={(v) => set((x) => { x.systemPrefix = v.replace(/[^A-Za-z0-9_]/g, ''); })} mono /></Row>
              <Row label="Cartella di output" hint="Vuoto: .mibcrude-local/output (esclusa da Git)"><Text value={m.output.dir} onChange={(v) => set((x) => { x.output.dir = v; })} mono /></Row>
            </Section>
          </>}
          {cat === 'automation' && <TasksSection />}
          {cat === 'messages' && <div className="cols">
            <div>
          <Section title="Email (registrazione, recupero password, sendMail)">
            <Row label="Mittente"><Text value={m.mail?.from} onChange={(v) => set((x) => { x.mail = { ...(x.mail || {}), from: v }; })} placeholder="App <noreply@dominio.it>" /></Row>
            <Row label="Server SMTP" hint="Vuoto: funzione mail() di PHP"><Text value={m.mail?.smtpHost} onChange={(v) => set((x) => { x.mail = { ...(x.mail || {}), smtpHost: v }; })} /></Row>
            <Row label="Porta"><Num value={m.mail?.smtpPort} onChange={(v) => set((x) => { x.mail = { ...(x.mail || {}), smtpPort: v || undefined }; })} /></Row>
            <Row label="Utente SMTP"><Text value={m.mail?.smtpUser} onChange={(v) => set((x) => { x.mail = { ...(x.mail || {}), smtpUser: v }; })} /></Row>
            <Row label="Password SMTP" hint="Salvata solo sul tuo computer"><Text type="password" value={secrets.mailPassword} onChange={(v) => saveSecrets({ mailPassword: v })} /></Row>
          </Section>
              <SmsSection />
            </div>
            <div>
              <MailTemplatesSection />
            </div>
          </div>}
          {cat === 'maps' && <GeocodeSection />}
        </div>
      </div>
    </div>
  );
}
