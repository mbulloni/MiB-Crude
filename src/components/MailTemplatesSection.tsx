// Email templates (runtime/lib/MailTemplates.php): the registration and password reset mails, and templates
// sent from events with sendTemplate('name', $to, [...]). Subject and HTML body per language, {placeholders}.
import { useState } from 'react';
import { update, useStore } from '../store';
import { Btn, I, LangText, Row, Section, Text } from './ui';

type L = Record<string, string>;
interface Tpl { subject?: L; body?: L }

const BUILTIN: Record<string, [string, string, L, L]> = {
  register: ['Conferma della registrazione', '{username}, {fullname}, {email}, {link}', { it: 'Conferma la registrazione a {app}' }, { it: '<p>Ciao {username},</p>\n<p>conferma la registrazione aprendo <a href="{link}">questo link</a>.</p>' }],
  twofactor: ['Codice di accesso (verifica in due passaggi)', '{username}, {code}', { it: 'Codice di accesso a {app}' }, { it: '<p>Il tuo codice di accesso è <b>{code}</b> (valido 5 minuti).</p>' }],
  forgot: ['Recupero della password', '{username}, {fullname}, {email}, {link} (valido 1 ora)', { it: 'Reimposta la password di {app}' }, { it: '<p>Ciao {username},</p>\n<p>per reimpostare la password apri <a href="{link}">questo link</a> (valido 1 ora).</p>' }],
};
const okName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

export default function MailTemplatesSection() {
  const all = useStore((s) => (s.proj?.project.settings as { mailTemplates?: Record<string, Tpl> }).mailTemplates) || {};
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const set = (n: string, patch: Tpl | null) => update((d) => {
    const st = d.project.settings as { mailTemplates?: Record<string, Tpl> };
    const m = { ...(st.mailTemplates || {}) };
    if (patch === null) delete m[n]; else m[n] = { ...(m[n] || {}), ...patch };
    if (Object.keys(m).length) st.mailTemplates = m; else delete st.mailTemplates;
  });
  const custom = Object.keys(all).filter((n) => !BUILTIN[n]).sort();
  const box = (n: string, title: string, vars: string, builtin: boolean) => {
    const t = all[n];
    return (
      <div key={n} className="region-box">
        <div className="inline">
          <Btn small kind="ghost" icon={open === n ? 'chevron-down' : 'chevron-right'} onClick={() => setOpen(open === n ? null : n)} />
          <I n="envelope" /> <b>{title}</b> {!builtin && <code className="muted">sendTemplate('{n}', $to, [...])</code>}
          {builtin && !t && <span className="muted">(testo standard)</span>}
          <span className="grow" />
          {t && <Btn small kind="ghost" icon={builtin ? 'arrow-counterclockwise' : 'trash'} title={builtin ? 'Torna al testo standard' : 'Elimina il modello'} onClick={() => set(n, null)} />}
        </div>
        {open === n && <>
          {builtin && !t && <Row label=" "><Btn small icon="pencil" onClick={() => set(n, { subject: BUILTIN[n][2], body: BUILTIN[n][3] })}>Personalizza</Btn></Row>}
          {(t || !builtin) && <>
            <Row label="Oggetto"><LangText value={t?.subject} onChange={(v) => set(n, { subject: v })} /></Row>
            <Row label="Testo (HTML)" wide><LangText multiline value={t?.body} onChange={(v) => set(n, { body: v })} /></Row>
          </>}
          <p className="help">Segnaposto: {vars}{vars ? ', ' : ''}{'{app}'} (nome dell'app), {'{date}'} (oggi), {'{user}'} (utente collegato). I valori vengono inseriti nel testo come testo semplice (HTML protetto).</p>
        </>}
      </div>
    );
  };
  return (
    <Section title="Modelli email" help="Testi delle email inviate dall'app, in ogni lingua del progetto: conferma della registrazione, recupero della password e modelli da inviare dagli eventi o dalle attività pianificate con sendTemplate('nome', $destinatario, ['campo' => valore]).">
      {Object.entries(BUILTIN).map(([n, [title, vars]]) => box(n, title, vars, true))}
      {custom.map((n) => box(n, n, 'i campi passati a sendTemplate, es. {numero}', false))}
      <div className="inline">
        <Text value={name} onChange={setName} placeholder="Nome, es. ordine_spedito" mono />
        <Btn small icon="plus" disabled={!okName(name) || !!all[okName(name)] || !!BUILTIN[okName(name)]}
          onClick={() => { const n = okName(name); set(n, { subject: { it: '' }, body: { it: '<p>Ciao,</p>\n<p>…</p>' } }); setOpen(n); setName(''); }}>Nuovo modello</Btn>
      </div>
    </Section>
  );
}
