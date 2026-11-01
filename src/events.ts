// Event catalogue shown in the designer (mirror of core/defaults.cjs TABLE_EVENTS/GLOBAL_EVENTS).
export interface EventDef { args: string; help: string; lang?: 'javascript' }

export const TABLE_EVENTS: Record<string, EventDef> = {
  BeforeSelect: { args: '&$where, &$orderBy, $page', help: 'Modifica WHERE/ORDER BY prima di leggere i record. $where è una stringa SQL (vuota = nessun filtro).' },
  ProcParams: { args: '&$params', help: 'Solo origini stored procedure: parametri della chiamata (nome => valore), modificabili prima di eseguirla, es. $params[\'anno\'] = date(\'Y\').' },
  ProcRows: { args: '&$rows', help: 'Solo origini stored procedure: righe restituite dalla procedura, da filtrare o modificare in PHP prima di lista, ricerca e totali (vale per tutti i database).' },
  BeforeShowList: { args: '&$rows, $page', help: 'Prima di mostrare la lista: puoi modificare $rows (array di record).' },
  ProcessValues: { args: '&$values, $page', help: 'Prima di mostrare un record in visualizza/modifica.' },
  BeforeAdd: { args: '&$values, &$message, $page', help: 'Prima di inserire. return false per annullare (con $message).' },
  AfterAdd: { args: '$values, $keys, $page', help: "Dopo l'inserimento. $keys contiene la chiave del nuovo record." },
  BeforeEdit: { args: '&$values, $old, &$message, $page', help: 'Prima di salvare le modifiche. return false per annullare.' },
  AfterEdit: { args: '$values, $old, $keys, $page', help: 'Dopo il salvataggio delle modifiche.' },
  BeforeDelete: { args: '$old, &$message, $page', help: 'Prima di eliminare un record. return false per annullare.' },
  AfterDelete: { args: '$old, $page', help: "Dopo l'eliminazione." },
  BeforeImport: { args: '&$values, $page', help: 'Per ogni riga importata. return false per saltarla.' },
  CustomValidate: { args: '$values, &$errors, $page', help: 'Validazioni personalizzate: $errors[campo] = "messaggio".' },
  TableInit: { args: '', help: 'Alla prima apertura della tabella in ogni richiesta.' },
  BeforeProcess: { args: '$page', help: 'All\'inizio di ogni pagina della tabella ($page = list, add, edit, view, search, print, export, import).' },
  BeforeShow: { args: '$page', help: 'Subito prima di mostrare la pagina.' },
  AfterImport: { args: '$result, $page', help: 'Dopo un\'importazione: $result con added, updated, skipped, errors.' },
  ...Object.fromEntries(['list', 'add', 'edit', 'view', 'search', 'print'].map((p) => [`JS_OnLoad_${p}`, {
    args: 'pageObj, proxy, pageid', lang: 'javascript' as const,
    help: `JavaScript eseguito al caricamento della pagina "${p}" (API compatibile con i progetti .phpr: Runner.getControl(pageid, 'campo'), pageObj.on/hideField/showField, proxy).`,
  }])),
};

export const GLOBAL_EVENTS: Record<string, EventDef> = {
  AfterAppInit: { args: '', help: "All'avvio di ogni richiesta (dopo il caricamento della configurazione)." },
  BeforeLogin: { args: '&$username, &$password, &$message', help: 'Prima del login. return false per bloccarlo.' },
  AfterSuccessfulLogin: { args: '$username, $user', help: 'Dopo un login riuscito.' },
  AfterUnsuccessfulLogin: { args: '$username, $message', help: 'Dopo un login fallito.' },
  TwoFactorPhone: { args: '&$phone, $user', help: 'Numero a cui inviare il codice SMS della verifica in due passaggi (es. da una tabella anagrafica); $phone arriva con quello del profilo.' },
  BeforeRegister: { args: '&$values, &$message', help: 'Prima della registrazione di un utente. return false per annullare.' },
  AfterRegister: { args: '$values', help: 'Dopo la registrazione.' },
  AfterLogout: { args: '$username', help: 'Dopo il logout.' },
};

export const template = (name: string, def: EventDef, table?: string) => def.lang === 'javascript'
  ? `// ${name}${table ? ` — tabella ${table}` : ''}\n// ${def.help}\n\nvar ctrl = Runner.getControl(pageid, 'campo');\n`
  : `<?php\n// ${name}(${def.args})${table ? ` — tabella ${table}` : ''}\n// ${def.help}\n// Helper: db(), user(), userId(), isAdmin(), sendMail($to, $subject, $body), redirect($url), t($key)\n\nreturn true;\n`;

/** Ready-made snippets, like the classic "predefined actions". */
export const SNIPPETS: { name: string; events: string[]; code: string }[] = [
  { name: 'Invia email con i dati del record', events: ['AfterAdd', 'AfterEdit'], code: "$body = '';\nforeach ($values as $k => $v) $body .= h($k) . ': ' . h($v) . '<br>';\nsendMail('destinatario@dominio.it', 'Nuovo record', $body);\n" },
  { name: 'Salva una copia in un\'altra tabella', events: ['AfterAdd', 'AfterEdit'], code: "db()->insert('storico', ['riferimento' => $keys['id'] ?? null, 'dati' => json_encode($values), 'utente' => userName(), 'quando' => date('Y-m-d H:i:s')]);\n" },
  { name: 'Verifica che un valore sia unico', events: ['BeforeAdd'], code: "if (db()->value('SELECT COUNT(*) FROM tabella WHERE campo = ?', [$values['campo']]) > 0) {\n    $message = 'Valore già presente';\n    return false;\n}\n" },
  { name: 'Mostra solo i record dell\'utente', events: ['BeforeSelect'], code: "if (!isAdmin()) $where = \"src.creato_da = \" . db()->pdo->quote(userName());\n" },
  { name: 'Impedisci la cancellazione se ci sono record collegati', events: ['BeforeDelete'], code: "if (db()->value('SELECT COUNT(*) FROM dettaglio WHERE master_id = ?', [$old['id']]) > 0) {\n    $message = 'Ci sono record collegati';\n    return false;\n}\n" },
  { name: 'Imposta campi automatici', events: ['BeforeAdd', 'BeforeEdit'], code: "$values['modificato_da'] = userName();\n$values['modificato_il'] = date('Y-m-d H:i:s');\n" },
  { name: 'Validazione personalizzata tra due campi', events: ['CustomValidate'], code: "if (!empty($values['data_fine']) && $values['data_fine'] < $values['data_inizio']) {\n    $errors['data_fine'] = 'La data di fine precede quella di inizio';\n}\n" },
  { name: 'Registra in un log', events: ['AfterSuccessfulLogin', 'AfterDelete', 'AfterEdit', 'AfterAdd'], code: "error_log('[app] ' . userName() . ' ' . __FUNCTION__);\n" },
];
