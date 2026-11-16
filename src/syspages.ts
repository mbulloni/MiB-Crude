// System pages of the generated app (not tied to a table): split in blocks that the designer rearranges on the free grid.
// Block ids and the pages are the ones of runtime/views/partials/sys/<page>_<block>.php (\MiB\SysPage).
import type { DashItem } from './types';

export interface SysBlock { id: string; label: string; icon: string; hint: string; w: number; h: number; keys: string[] }
export interface SysPageDef { id: string; label: string; icon: string; help: string; blocks: SysBlock[]; keys?: string[] }

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
  { id: 'twofactor', label: 'Codice di verifica', icon: 'shield-check', help: 'La pagina dove si inserisce il codice della verifica in due passaggi dopo la password (si attiva in Sicurezza).', blocks: [
    { id: 'form', label: 'Modulo del codice', icon: 'input-cursor-text', hint: 'La richiesta del codice, il pulsante Verifica, il nuovo invio del codice e Annulla.', w: 12, h: 9, keys: ['2fa.prompt', '2fa.prompt_sms', '2fa.prompt_email', '2fa.verify', '2fa.resend', 'btn.cancel'] },
  ] },
  { id: 'setup', label: 'Configurazione iniziale', icon: 'gear', help: 'La pagina che crea il primo amministratore al primo avvio dell\'app.', blocks: [
    { id: 'form', label: 'Modulo del primo utente', icon: 'input-cursor-text', hint: 'Spiegazione, nome utente, email, password e pulsante.', w: 12, h: 11, keys: ['setup.help', 'login.username', 'login.password', 'pw.repeat', 'setup.submit'] },
  ] },
  { id: 'admin', label: 'Amministrazione', icon: 'shield-lock', help: 'L\'area di amministrazione (utenti, gruppi e permessi, registro, notifiche, attività pianificate): titolo, menu delle sezioni e contenuto della sezione scelta.', blocks: [
    { id: 'title', label: 'Titolo', icon: 'type-h1', hint: 'Il titolo «Amministrazione».', w: 12, h: 2, keys: ['admin.title'] },
    { id: 'menu', label: 'Menu delle sezioni', icon: 'list-nested', hint: 'I pulsanti per passare da una sezione all\'altra (solo quelle attive).', w: 12, h: 2, keys: ['admin.users', 'ntlm.users', 'ntlm.rights', 'admin.groups', 'admin.rights', 'admin.audit', 'notif.title', 'task.title'] },
    { id: 'content', label: 'Contenuto della sezione', icon: 'layout-text-window', hint: 'La tabella o il modulo della sezione scelta nel menu. Si adatta in altezza solo se il blocco è abbastanza alto: usa un\'altezza generosa.', w: 12, h: 18, keys: ['login.username', 'register.fullname', '2fa.phone', 'login.password', 'form.password_keep', 'admin.active', 'btn.save', 'btn.cancel', 'admin.newuser', 'admin.lastlogin', 'admin.locked', 'admin.impersonate', '2fa.reset', 'admin.label', 'admin.all', 'audit.when', 'audit.table', 'audit.action', 'audit.keys', 'audit.changes', 'notif.to', 'notif.everybody', 'notif.titlef', 'notif.icon', 'notif.message', 'notif.url', 'notif.expire', 'notif.newwin', 'notif.send', 'btn.delete', 'task.help', 'task.task', 'task.schedule', 'task.next', 'task.last', 'task.result', 'task.invalid', 'task.off', 'task.run', 'ntlm.users_help', 'ntlm.you', 'ntlm.group', 'ntlm.area', 'btn.add', 'dt.search', 'ntlm.count', 'confirm.delete', 'ntlm.more', 'ntlm.rights_help', 'ntlm.others', 'ntlm.page', 'ntlm.admin', 'ntlm.newgroup', 'ntlm.legend'] },
  ] },
];

/** Pages of a table that can be designed like the system pages (search, print, import) and those with texts only (export, delete). */
export const TABLE_PAGES: Record<string, SysPageDef> = {
  search: { id: 'search', label: 'Ricerca avanzata', icon: 'funnel', help: 'La pagina di ricerca avanzata della tabella. I campi su cui si può cercare si scelgono nella scheda Campi.', blocks: [
    { id: 'title', label: 'Titolo', icon: 'type-h1', hint: 'Il nome della tabella e «Ricerca avanzata».', w: 12, h: 2, keys: ['page.search'] },
    { id: 'form', label: 'Modulo di ricerca', icon: 'funnel', hint: 'Una riga per ogni campo (confronto e valori) e i pulsanti Cerca, Azzera filtri, Indietro.', w: 12, h: 12, keys: ['op.contains', 'op.equals', 'op.notequals', 'op.starts', 'op.more', 'op.less', 'op.between', 'op.empty', 'op.notempty', 'btn.search', 'list.clear', 'btn.back'] },
  ] },
  print: { id: 'print', label: 'Stampa', icon: 'printer', help: 'La pagina di stampa della lista. Le colonne stampate si scelgono nella scheda Campi; il titolo e la data in cima sono fissi.', keys: ['btn.print'], blocks: [
    { id: 'table', label: 'Tabella da stampare', icon: 'table', hint: 'I record con le colonne di stampa e i totali.', w: 12, h: 12, keys: [] },
    { id: 'count', label: 'Numero di record', icon: 'hash', hint: 'La riga «N record» in fondo.', w: 12, h: 1, keys: ['list.records'] },
  ] },
  import: { id: 'import', label: 'Importa', icon: 'upload', help: 'La pagina di importazione di file CSV o Excel. I campi importabili si scelgono nella scheda Campi.', blocks: [
    { id: 'title', label: 'Titolo', icon: 'type-h1', hint: 'Il nome della tabella e «Importa».', w: 12, h: 2, keys: ['page.import'] },
    { id: 'result', label: 'Esito', icon: 'check2-circle', hint: 'Il riepilogo dopo l\'importazione (aggiunti, aggiornati, saltati, errori); vuoto prima.', w: 12, h: 4, keys: ['import.result', 'import.mapped', 'import.rolledback'] },
    { id: 'form', label: 'Modulo di importazione', icon: 'upload', hint: 'Istruzioni, scelta del file, opzioni e pulsante Importa.', w: 12, h: 9, keys: ['import.help', 'import.update', 'import.atomic', 'btn.import', 'btn.back'] },
  ] },
  export: { id: 'export', label: 'Esporta', icon: 'download', help: 'Esporta scarica un file (formati scelti nel designer della Lista): non ha una pagina da disegnare. Qui si cambiano i testi.', blocks: [], keys: ['btn.export'] },
  delete: { id: 'delete', label: 'Elimina', icon: 'trash', help: 'Elimina chiede conferma e rimuove il record: non ha una pagina da disegnare. I permessi stanno in Sicurezza. Qui si cambiano i testi.', blocks: [], keys: ['btn.delete', 'btn.delete_sel', 'confirm.delete', 'confirm.delete_sel', 'msg.deleted'] },
};

/** Text keys of a page: its own plus those of its blocks. */
export const pageKeys = (def: SysPageDef) => [...new Set([...(def.keys || []), ...def.blocks.flatMap((b) => b.keys)])];

export const sysBlock = (page: string, id: string) => SYS_PAGES.find((p) => p.id === page)?.blocks.find((b) => b.id === id);

/** Standard design as grid blocks: the blocks of a page one under the other (side by side when they fit), in the order of the standard page. */
export function gridOf(blocks: SysBlock[]): DashItem[] {
  let y = 1, x = 1, rowH = 0;
  const out: DashItem[] = [];
  blocks.forEach((b, i) => {
    if (x + b.w - 1 > 12) { y += rowH; x = 1; rowH = 0; }
    out.push({ id: `b${i + 1}`, type: 'sys', block: b.id, x, y, w: b.w, h: b.h });
    x += b.w; rowH = Math.max(rowH, b.h);
    if (x > 12) { y += rowH; x = 1; rowH = 0; }
  });
  return out;
}

export const defaultGrid = (page: string): DashItem[] => gridOf(SYS_PAGES.find((p) => p.id === page)?.blocks || []);
