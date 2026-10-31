import { useState } from 'react';
import { call } from '../api';
import { saveSecrets, toast, update, useStore } from '../store';
import type { Security } from '../types';
import { Btn, Check, LangText, Num, Row, Section, Select, Tabs, Text, lbl, slug } from './ui';
import { useItemLock } from './TeamPanel';
import NtlmSection, { NTLM_DEFAULTS } from './NtlmSection';

const LETTERS: [string, string][] = [['S', 'Elenco'], ['V', 'Vista'], ['A', 'Nuovo'], ['E', 'Modifica'], ['D', 'Elimina'], ['P', 'Stampa/Esp.'], ['I', 'Importa']];

function GroupMap({ value, onChange }: { value?: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return <textarea className="inp mono" rows={3} value={Object.entries(value || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
    onChange={(e) => onChange(Object.fromEntries(e.target.value.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter((x) => x[0] && x[1])))} />;
}

export default function SecurityPanel() {
  const p = useStore((s) => s.proj)!;
  const secrets = useStore((s) => s.secrets);
  const sec = p.security;
  const [tab, setTab] = useState<'login' | 'groups' | 'rights' | 'providers'>('login');
  const [hcPw, setHcPw] = useState('');
  const lock = useItemLock('security');
  const ro = lock.readOnly;
  const set = (fn: (s: Security) => void) => { if (!ro) update((d) => fn(d.security)); };
  const custom = sec.mode === 'database' && !sec.users.managed;
  const userTable = p.tables.find((t) => t.name === sec.users.table);
  const ufields: [string, string][] = [['', '—'], ...(userTable?.fields || []).map((f) => [f.name, f.name] as [string, string])];
  const objects = [...p.tables.map((t) => [t.name, lbl(t.caption, t.name)]), ...p.reports.map((r) => [`report:${r.name}`, `Report: ${lbl(r.title, r.name)}`]),
    ...p.charts.map((r) => [`chart:${r.name}`, `Grafico: ${lbl(r.title, r.name)}`]), ...p.dashboards.map((r) => [`dashboard:${r.name}`, `Dashboard: ${lbl(r.title, r.name)}`])];
  const groups = [...sec.groups, ...(sec.guestAccess ? [{ id: '<guest>', label: { it: 'Ospiti (non autenticati)' } }] : [])];

  return (
    <div className="panel">
      <div className="title-row"><h2>Sicurezza</h2>{lock.banner}</div>
      <fieldset disabled={ro} className="plain">
      <Row label="Login obbligatorio"><Check value={sec.enabled} onChange={(v) => set((s) => { s.enabled = v; if (v && s.mode === 'none') s.mode = 'database'; })} label="Protegge l'applicazione con utenti e permessi" /></Row>
      {sec.enabled && <>
        <Tabs value={tab} onChange={setTab} tabs={[['login', 'Accesso', 'box-arrow-in-right'], ['groups', 'Gruppi', 'people'], ['rights', 'Permessi', 'ui-checks-grid'], ['providers', 'LDAP / SSO', 'building-lock']]} />
        {tab === 'login' && <div className="cols">
          <Section title="Utenti">
            <Row label="Origine utenti"><Select value={(sec.mode as string) === 'ntlm' ? 'ntlm' : sec.mode === 'hardcoded' ? 'hardcoded' : sec.users.managed ? 'managed' : 'custom'} options={[['managed', 'Tabelle di sistema gestite (consigliato)'], ['custom', 'Tabella utenti esistente'], ['hardcoded', 'Un solo utente fisso'], ['ntlm', 'Windows (NTLM, come R-LAB)']]}
              onChange={(v) => set((s) => {
                (s as { mode: string }).mode = v === 'hardcoded' ? 'hardcoded' : v === 'ntlm' ? 'ntlm' : 'database';
                s.users.managed = v === 'managed';
                if (v === 'ntlm') { const x = s as unknown as { ntlm?: object }; x.ntlm = { ...NTLM_DEFAULTS, ...(x.ntlm || {}) }; }
              })} /></Row>
            {(sec.mode as string) === 'ntlm' && <NtlmSection readOnly={ro} />}
            {sec.mode === 'hardcoded' && <>
              <Row label="Nome utente"><Text value={sec.hardcoded.username} onChange={(v) => set((s) => { s.hardcoded.username = v; })} /></Row>
              <Row label="Password" hint={sec.hardcoded.passwordHash ? 'Impostata (salvata come hash PBKDF2)' : 'Non impostata'}><span className="inline"><Text type="password" value={hcPw} onChange={setHcPw} />
                <Btn onClick={async () => { const h = await call('gen:hash', hcPw); set((s) => { s.hardcoded.passwordHash = h; }); setHcPw(''); toast('Password impostata', 'ok'); }} disabled={hcPw.length < 6}>Imposta</Btn></span></Row>
            </>}
            {sec.mode === 'database' && sec.users.managed && <p className="help">L'app crea le tabelle <code>{p.project.systemPrefix || 'mc_'}users</code>, <code>groups</code>, <code>members</code>, <code>rights</code>, <code>audit</code> e <code>locks</code> al primo avvio, poi chiede di creare il primo amministratore.</p>}
            {custom && <>
              <Row label="Tabella utenti"><Select value={sec.users.table} options={[['', '—'], ...p.tables.map((t) => [t.name, t.name] as [string, string])]} onChange={(v) => set((s) => { s.users.table = v; })} /></Row>
              <Row label="Campo nome utente"><Select value={sec.users.usernameField} options={ufields} onChange={(v) => set((s) => { s.users.usernameField = v; })} /></Row>
              <Row label="Campo password" hint="Hash bcrypt/argon (password_hash) o MD5 legacy"><Select value={sec.users.passwordField} options={ufields} onChange={(v) => set((s) => { s.users.passwordField = v; })} /></Row>
              <Row label="Campo ID"><Select value={sec.users.idField || ''} options={ufields} onChange={(v) => set((s) => { s.users.idField = v; })} /></Row>
              <Row label="Campo email"><Select value={sec.users.emailField} options={ufields} onChange={(v) => set((s) => { s.users.emailField = v; })} /></Row>
              <Row label="Campo nome completo"><Select value={sec.users.fullNameField} options={ufields} onChange={(v) => set((s) => { s.users.fullNameField = v; })} /></Row>
              <Row label="Campo gruppo" hint="ID gruppo, anche più separati da virgola"><Select value={sec.users.groupField} options={ufields} onChange={(v) => set((s) => { s.users.groupField = v; })} /></Row>
              <Row label="Campo attivo"><Select value={sec.users.activeField} options={ufields} onChange={(v) => set((s) => { s.users.activeField = v; })} /></Row>
              <Row label="Password in chiaro"><Check value={sec.users.plainPasswords} onChange={(v) => set((s) => { s.users.plainPasswords = v; })} label="Sconsigliato: solo per database legacy" /></Row>
            </>}
            <Row label="Accesso ospiti"><Check value={sec.guestAccess} onChange={(v) => set((s) => { s.guestAccess = v; })} label="Chi non ha fatto login usa i permessi del gruppo Ospiti" /></Row>
          </Section>
          <Section title="Regole">
            {sec.users.managed && sec.mode === 'database' && <>
              <Row label="Registrazione"><Check value={sec.registration.enabled} onChange={(v) => set((s) => { s.registration.enabled = v; })} label="Gli utenti possono registrarsi" /></Row>
              {sec.registration.enabled && <><Row label="Gruppo dei nuovi utenti"><Select value={sec.registration.defaultGroup} options={sec.groups.map((g) => [g.id, lbl(g.label, g.id)] as [string, string])} onChange={(v) => set((s) => { s.registration.defaultGroup = v; })} /></Row>
                <Row label="Conferma email"><Check value={sec.registration.emailVerify} onChange={(v) => set((s) => { s.registration.emailVerify = v; })} /></Row></>}
              <Row label="Recupero password"><Check value={sec.passwordReset.enabled} onChange={(v) => set((s) => { s.passwordReset.enabled = v; })} label="Link via email" /></Row>
            </>}
            <Row label="CAPTCHA"><span className="chips"><Check label="Login" value={sec.captcha.login} onChange={(v) => set((s) => { s.captcha.login = v; })} /><Check label="Registrazione" value={sec.captcha.register} onChange={(v) => set((s) => { s.captcha.register = v; })} /></span></Row>
            <Row label="Password: lunghezza minima"><Num value={sec.passwordPolicy.minLength} onChange={(v) => set((s) => { s.passwordPolicy.minLength = v || 8; })} /></Row>
            <Row label="Password: deve contenere"><span className="chips"><Check label="Numero" value={sec.passwordPolicy.requireDigit} onChange={(v) => set((s) => { s.passwordPolicy.requireDigit = v; })} /><Check label="Maiuscola" value={sec.passwordPolicy.requireUpper} onChange={(v) => set((s) => { s.passwordPolicy.requireUpper = v; })} /><Check label="Simbolo" value={sec.passwordPolicy.requireSymbol} onChange={(v) => set((s) => { s.passwordPolicy.requireSymbol = v; })} /></span></Row>
            {sec.users.managed && sec.mode === 'database' && <Row label="Verifica in due passaggi" hint="Codice TOTP da Google/Microsoft Authenticator, configurato dall'utente nel profilo">
              <span className="chips"><Check label="Attiva" value={(sec as any).twoFactor?.enabled} onChange={(v) => set((s) => { (s as any).twoFactor = { ...((s as any).twoFactor || {}), enabled: v }; })} />
                <Check label="Obbligatoria per tutti" value={(sec as any).twoFactor?.required} onChange={(v) => set((s) => { (s as any).twoFactor = { ...((s as any).twoFactor || {}), required: v }; })} /></span></Row>}
            {sec.users.managed && sec.mode === 'database' && (sec as any).twoFactor?.enabled && <Row label="Codice per chi non ha l'app" hint="Senza app di autenticazione l'utente riceve a ogni accesso un codice a 6 cifre (valido 5 minuti). SMS: numero dal profilo dell'utente o dall'evento globale TwoFactorPhone; servizio SMS in Progetto › SMS">
              <Select value={(sec as any).twoFactor?.channel || ''} options={[['', 'Nessuno: solo app di autenticazione'], ['email', 'Codice via email'], ['sms', 'Codice via SMS']]} onChange={(v) => set((s) => { (s as any).twoFactor = { ...((s as any).twoFactor || {}), channel: v }; })} /></Row>}
            <Row label="Tentativi prima del blocco" hint="Blocco di 15 minuti; 0 = mai"><Num value={sec.maxLoginAttempts} onChange={(v) => set((s) => { s.maxLoginAttempts = Number(v) || 0; })} /></Row>
            <Row label="Scadenza sessione (minuti di inattività)"><Num value={sec.sessionMinutes} onChange={(v) => set((s) => { s.sessionMinutes = Number(v) || 0; })} /></Row>
            {sec.users.managed && sec.mode === 'database' && <Row label="«Ricordami» (giorni)" hint="Casella nella pagina di accesso: il browser resta collegato per questi giorni anche dopo la chiusura (cookie rinnovato a ogni uso, cancellato da «Esci»); 0 = nessuna casella">
              <Num value={(sec as { rememberDays?: number }).rememberDays || 0} min={0} onChange={(v) => set((s) => { (s as { rememberDays?: number }).rememberDays = Number(v) || 0; })} /></Row>}
          </Section>
        </div>}
        {tab === 'groups' && <Section title="Gruppi" actions={<Btn icon="plus-lg" onClick={() => set((s) => { s.groups.push({ id: `gruppo${s.groups.length + 1}`, label: { it: 'Nuovo gruppo' } }); })}>Nuovo gruppo</Btn>}
          help="Con i permessi dinamici attivi, gruppi e permessi qui sotto sono i valori iniziali: poi l'amministratore li gestisce dall'applicazione (Amministrazione → Gruppi/Permessi) senza rigenerare.">
          <Row label="Permessi dinamici"><Check value={sec.dynamicPermissions} onChange={(v) => set((s) => { s.dynamicPermissions = v; })} label="Gestibili dall'applicazione in esecuzione" /></Row>
          <table className="grid"><thead><tr><th>ID</th><th>Nome</th><th>Amministratore</th><th /></tr></thead><tbody>
            {sec.groups.map((g, i) => <tr key={i}><td><Text value={g.id} onChange={(v) => set((s) => { s.groups[i].id = slug(v); })} mono /></td>
              <td><LangText value={g.label} onChange={(v) => set((s) => { s.groups[i].label = v; })} /></td>
              <td><Check value={g.admin} onChange={(v) => set((s) => { s.groups[i].admin = v; })} /></td>
              <td><Btn small kind="ghost" icon="trash" disabled={g.admin && sec.groups.filter((x) => x.admin).length === 1} onClick={() => set((s) => { s.groups.splice(i, 1); delete s.permissions[g.id]; })} /></td></tr>)}
          </tbody></table>
        </Section>}
        {tab === 'rights' && <Section title="Permessi per gruppo" help="Gli amministratori hanno sempre tutti i permessi. Report, grafici e dashboard usano solo «Elenco».">
          <div className="rights-wrap"><table className="grid rights"><thead><tr><th />{groups.filter((g) => !g.admin).map((g) => <th key={g.id} colSpan={LETTERS.length} className="c grp">{lbl(g.label, g.id)}</th>)}</tr>
            <tr className="sub"><th />{groups.filter((g) => !g.admin).map((g) => LETTERS.map(([l, n]) => <th key={g.id + l} className="c" title={n}>{l}</th>))}</tr></thead>
            <tbody>{objects.map(([obj, name]) => <tr key={obj}><td>{name}</td>
              {groups.filter((g) => !g.admin).map((g) => LETTERS.map(([l]) => {
                const cur = sec.permissions[g.id]?.[obj] || '';
                const isTable = !obj.includes(':');
                return <td key={g.id + l} className="c">{(isTable || l === 'S') && <input type="checkbox" checked={cur.includes(l)} onChange={(e) => set((s) => {
                  s.permissions[g.id] = s.permissions[g.id] || {};
                  const next = e.target.checked ? cur + l : cur.replace(l, '');
                  if (next) s.permissions[g.id][obj] = 'AEDSVPI'.split('').filter((x) => next.includes(x)).join(''); else delete s.permissions[g.id][obj];
                })} />}</td>;
              }))}</tr>)}</tbody></table></div>
          <p className="help">S elenco/ricerca · V visualizza · A aggiungi · E modifica · D elimina · P stampa/esporta · I importa</p>
        </Section>}
        {tab === 'providers' && <div className="cols">
          <Section title="LDAP / Active Directory" help="Gli utenti accedono con le credenziali di dominio; al primo accesso vengono creati tra gli utenti dell'app. Serve l'estensione php-ldap sul server.">
            <Row label="Attivo"><Check value={sec.providers.ldap.enabled} onChange={(v) => set((s) => { s.providers.ldap.enabled = v; })} /></Row>
            <Row label="Server"><span className="inline"><Text value={sec.providers.ldap.host} onChange={(v) => set((s) => { s.providers.ldap.host = v; })} placeholder="ldaps://dc.azienda.local" /><Num value={sec.providers.ldap.port} onChange={(v) => set((s) => { s.providers.ldap.port = Number(v) || 389; })} /></span></Row>
            <Row label="Dominio (NetBIOS)" hint="Login come DOMINIO\utente"><Text value={sec.providers.ldap.domain} onChange={(v) => set((s) => { s.providers.ldap.domain = v; })} /></Row>
            <Row label="Bind DN" hint="In alternativa al dominio, es. uid=%s,ou=people,dc=azienda,dc=it"><Text value={sec.providers.ldap.bindDn} onChange={(v) => set((s) => { s.providers.ldap.bindDn = v; })} mono /></Row>
            <Row label="Base DN (ricerca dati/gruppi)"><Text value={sec.providers.ldap.baseDn} onChange={(v) => set((s) => { s.providers.ldap.baseDn = v; })} mono /></Row>
            <Row label="Filtro utente"><Text value={sec.providers.ldap.userFilter} onChange={(v) => set((s) => { s.providers.ldap.userFilter = v; })} mono /></Row>
            <Row label="STARTTLS"><Check value={sec.providers.ldap.useTls} onChange={(v) => set((s) => { s.providers.ldap.useTls = v; })} /></Row>
            <Row label="Gruppi AD → gruppi app" hint="Una riga per mappatura: GruppoAD=idgruppo"><textarea className="inp mono" rows={3} value={Object.entries(sec.providers.ldap.groupMap || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
              onChange={(e) => set((s) => { s.providers.ldap.groupMap = Object.fromEntries(e.target.value.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter((x) => x[0] && x[1])); })} /></Row>
          </Section>
          <Section title="SAML 2.0 (ADFS, Entra ID, Okta, Shibboleth…)" help="Metadati da registrare presso il provider: https://tuo-sito/percorso/index.php?p=saml&metadata=1 (risposte su ?p=saml&acs=1). La firma della risposta o dell'asserzione è obbligatoria.">
            <Row label="Attivo"><Check value={sec.providers.saml?.enabled} onChange={(v) => set((s) => { s.providers.saml = { ...(s.providers.saml || {}), enabled: v }; })} /></Row>
            <Row label="Etichetta pulsante"><LangText value={sec.providers.saml?.label} onChange={(v) => set((s) => { s.providers.saml.label = v; })} /></Row>
            <Row label="Entity ID del provider"><Text value={sec.providers.saml?.idpEntityId} onChange={(v) => set((s) => { s.providers.saml.idpEntityId = v; })} mono /></Row>
            <Row label="URL SSO del provider"><Text value={sec.providers.saml?.idpSsoUrl} onChange={(v) => set((s) => { s.providers.saml.idpSsoUrl = v; })} mono placeholder="https://login.microsoftonline.com/<tenant>/saml2" /></Row>
            <Row label="Certificato del provider" hint="PEM o base64 del certificato di firma"><textarea className="inp mono" rows={4} value={sec.providers.saml?.idpCert || ''} onChange={(e) => set((s) => { s.providers.saml.idpCert = e.target.value; })} /></Row>
            <Row label="Entity ID dell'app" hint="Vuoto: URL dei metadati"><Text value={sec.providers.saml?.spEntityId} onChange={(v) => set((s) => { s.providers.saml.spEntityId = v; })} mono /></Row>
            <Row label="Attributi" hint="Nomi degli attributi SAML: utente (vuoto = NameID), email, nome, gruppi">
              <span className="inline"><Text value={sec.providers.saml?.usernameAttr} onChange={(v) => set((s) => { s.providers.saml.usernameAttr = v; })} placeholder="utente" /><Text value={sec.providers.saml?.emailAttr} onChange={(v) => set((s) => { s.providers.saml.emailAttr = v; })} placeholder="email" />
                <Text value={sec.providers.saml?.nameAttr} onChange={(v) => set((s) => { s.providers.saml.nameAttr = v; })} placeholder="nome" /><Text value={sec.providers.saml?.groupAttr} onChange={(v) => set((s) => { s.providers.saml.groupAttr = v; })} placeholder="gruppi" /></span></Row>
            <Row label="Gruppi provider → gruppi app"><GroupMap value={sec.providers.saml?.groupMap} onChange={(v) => set((s) => { s.providers.saml.groupMap = v; })} /></Row>
          </Section>
          <Section title="OpenID Connect (Okta, Entra ID, Google, Keycloak…)" actions={<Btn small icon="plus-lg" onClick={() => set((s) => { s.providers.oidc.push({ id: `sso${s.providers.oidc.length + 1}`, label: { it: 'Azienda' }, enabled: true, issuer: '', clientId: '', scopes: 'openid email profile', usernameClaim: 'email' }); })}>Provider</Btn>}
            help="Redirect URI da registrare presso il provider: https://tuo-sito/percorso/index.php?p=oidc&cb=1">
            {sec.providers.oidc.map((o, i) => <div className="card" key={i}>
              <div className="inline"><Check value={o.enabled} onChange={(v) => set((s) => { s.providers.oidc[i].enabled = v; })} label={<b>{lbl(o.label, o.id)}</b>} /><span className="grow" /><Btn small kind="ghost" icon="trash" onClick={() => set((s) => { s.providers.oidc.splice(i, 1); })} /></div>
              <Row label="ID"><Text value={o.id} onChange={(v) => set((s) => { s.providers.oidc[i].id = slug(v); })} mono /></Row>
              <Row label="Etichetta pulsante"><LangText value={o.label} onChange={(v) => set((s) => { s.providers.oidc[i].label = v; })} /></Row>
              <Row label="Issuer"><Text value={o.issuer} onChange={(v) => set((s) => { s.providers.oidc[i].issuer = v; })} mono placeholder="https://login.microsoftonline.com/<tenant>/v2.0" /></Row>
              <Row label="Client ID"><Text value={o.clientId} onChange={(v) => set((s) => { s.providers.oidc[i].clientId = v; })} mono /></Row>
              <Row label="Client secret" hint="Salvato solo sul tuo computer"><Text type="password" value={secrets.oidc?.[o.id]} onChange={(v) => saveSecrets({ oidc: { ...(secrets.oidc || {}), [o.id]: v } })} /></Row>
              <Row label="Claim nome utente"><Text value={o.usernameClaim} onChange={(v) => set((s) => { s.providers.oidc[i].usernameClaim = v; })} mono /></Row>
              <Row label="Claim gruppi"><Text value={o.groupClaim} onChange={(v) => set((s) => { s.providers.oidc[i].groupClaim = v; })} mono placeholder="groups" /></Row>
              <Row label="Gruppi provider → gruppi app" hint="Una riga per mappatura: GruppoProvider=idgruppo"><GroupMap value={o.groupMap} onChange={(v) => set((s) => { s.providers.oidc[i].groupMap = v; })} /></Row>
            </div>)}
          </Section>
        </div>}
      </>}
      </fieldset>
    </div>
  );
}
