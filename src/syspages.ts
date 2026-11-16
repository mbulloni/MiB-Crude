// System pages of the generated app (not tied to a table): split in blocks that the designer rearranges on the free grid.
// Block ids and the pages are the ones of runtime/views/partials/sys/<page>_<block>.php (\MiB\SysPage).
import type { DashItem } from './types';

export interface SysBlock { id: string; label: string; icon: string; hint: string; w: number; h: number; keys: string[] }
export interface SysPageDef { id: string; label: string; icon: string; help: string; blocks: SysBlock[] }

export const SYS_PAGES: SysPageDef[] = [
  { id: 'login', label: 'Accesso', icon: 'box-arrow-in-right', help: 'La pagina di login: modulo, accesso con provider esterni (SAML, OIDC) e collegamenti.', blocks: [
    { id: 'form', label: 'Modulo di accesso', icon: 'input-cursor-text', hint: 'Nome utente, password, «ricordami», verifica anti-robot e pulsante Accedi; mostra anche l\'errore di accesso.', w: 12, h: 8, keys: ['login.username', 'login.password', 'login.remember', 'captcha.label', 'login.submit'] },
    { id: 'providers', label: 'Accesso con provider', icon: 'building-lock', hint: 'I pulsanti «Accedi con…» (SAML e OpenID Connect) attivati in Sicurezza.', w: 12, h: 2, keys: ['login.with'] },
    { id: 'links', label: 'Collegamenti', icon: 'link-45deg', hint: 'Password dimenticata, Registrati, Entra come ospite (solo quelli attivi in Sicurezza).', w: 12, h: 2, keys: ['forgot.title', 'register.title', 'login.guest'] },
  ] },
  { id: 'register', label: 'Registrazione', icon: 'person-plus', help: 'La registrazione di un nuovo utente (si attiva in Sicurezza).', blocks: [
    { id: 'form', label: 'Modulo di registrazione', icon: 'input-cursor-text', hint: 'Nome utente, email, nome completo, password, verifica anti-robot; dopo l\'invio mostra l\'esito.', w: 12, h: 13, keys: ['login.username', 'register.fullname', 'login.password', 'pw.repeat', 'captcha.label', 'register.submit', 'register.done', 'register.check_mail', 'login.title'] },
    { id: 'back', label: 'Torna indietro', icon: 'arrow-left', hint: 'Il collegamento per tornare all\'accesso.', w: 12, h: 1, keys: ['btn.back'] },
  ] },
  { id: 'forgot', label: 'Password dimenticata', icon: 'envelope', help: 'La richiesta del link per reimpostare la password.', blocks: [
    { id: 'form', label: 'Modulo di richiesta', icon: 'input-cursor-text', hint: 'Email o nome utente e pulsante di invio; dopo l\'invio mostra la conferma.', w: 12, h: 5, keys: ['forgot.label', 'forgot.submit', 'forgot.sent'] },
    { id: 'back', label: 'Torna indietro', icon: 'arrow-left', hint: 'Il collegamento per tornare all\'accesso.', w: 12, h: 1, keys: ['btn.back'] },
  ] },
  { id: 'reset', label: 'Nuova password', icon: 'key', help: 'L\'impostazione della nuova password dal link ricevuto per email.', blocks: [
    { id: 'form', label: 'Modulo nuova password', icon: 'input-cursor-text', hint: 'Nuova password, ripetizione e pulsante.', w: 12, h: 6, keys: ['pw.new', 'pw.repeat', 'reset.submit'] },
  ] },
  { id: 'profile', label: 'Profilo', icon: 'person-circle', help: 'Il profilo dell\'utente collegato: cambio password, verifica in due passaggi, chiave API.', blocks: [
    { id: 'title', label: 'Titolo', icon: 'type-h1', hint: 'Il titolo «Il mio profilo» con il nome utente.', w: 12, h: 2, keys: ['profile.title'] },
    { id: 'password', label: 'Cambio password', icon: 'key', hint: 'Password attuale, nuova, ripetizione.', w: 6, h: 9, keys: ['profile.changepw', 'pw.current', 'pw.new', 'pw.repeat', 'btn.save'] },
    { id: 'twofactor', label: 'Verifica in due passaggi', icon: 'phone', hint: 'Attivazione e disattivazione (solo se attiva in Sicurezza).', w: 6, h: 11, keys: ['2fa.title', '2fa.active', '2fa.disable', '2fa.scan', '2fa.verify', '2fa.help', '2fa.setup', '2fa.phone', '2fa.phone_help'] },
    { id: 'apikey', label: 'Chiave API', icon: 'braces', hint: 'Generazione della chiave API personale (solo se l\'API è attiva).', w: 6, h: 5, keys: ['profile.apikey', 'profile.apikey_help', 'profile.apikey_gen'] },
  ] },
  { id: 'home', label: 'Home', icon: 'house', help: 'La pagina iniziale dell\'app: titolo, dashboard e riquadri delle tabelle.', blocks: [
    { id: 'title', label: 'Titolo', icon: 'type-h1', hint: 'Il titolo dell\'applicazione.', w: 12, h: 2, keys: [] },
    { id: 'dashboards', label: 'Dashboard', icon: 'speedometer2', hint: 'I pulsanti delle dashboard a cui l\'utente ha accesso.', w: 12, h: 2, keys: [] },
    { id: 'cards', label: 'Riquadri delle tabelle', icon: 'grid-3x3-gap', hint: 'Un riquadro per ogni tabella con il numero di record.', w: 12, h: 9, keys: ['list.records'] },
  ] },
];

export const sysBlock = (page: string, id: string) => SYS_PAGES.find((p) => p.id === page)?.blocks.find((b) => b.id === id);

/** Standard design of a page as grid blocks: the system blocks one under the other, in the order of the standard page. */
export function defaultGrid(page: string): DashItem[] {
  const def = SYS_PAGES.find((p) => p.id === page);
  if (!def) return [];
  let y = 1, x = 1, rowH = 0;
  const out: DashItem[] = [];
  def.blocks.forEach((b, i) => {
    if (x + b.w - 1 > 12) { y += rowH; x = 1; rowH = 0; }
    out.push({ id: `b${i + 1}`, type: 'sys', block: b.id, x, y, w: b.w, h: b.h });
    x += b.w; rowH = Math.max(rowH, b.h);
    if (x > 12) { y += rowH; x = 1; rowH = 0; }
  });
  return out;
}
