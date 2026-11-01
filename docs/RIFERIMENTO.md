# Riferimento tecnico

Eventi, funzioni PHP disponibili nel codice degli eventi, compatibilità con i progetti importati, tabelle di sistema e formato del progetto. Per l'uso del designer vedi [GUIDA.md](GUIDA.md).

## Eventi

Il codice si scrive nel designer (scheda **Eventi** della tabella o **Eventi globali**) e diventa un metodo della classe degli eventi dell'app generata. I parametri con `&` si possono modificare. `return false` annulla l'operazione, dove previsto.

### Eventi della tabella

| Evento | Parametri | Quando |
|---|---|---|
| `TableInit` | — | alla prima apertura della tabella in ogni richiesta |
| `BeforeProcess` | `$page` | all'inizio di ogni pagina della tabella (`list`, `add`, `edit`, `view`, `search`, `print`, `export`, `import`) |
| `BeforeSelect` | `&$where, &$orderBy, $page` | prima di leggere i record: SQL aggiunto alla condizione e all'ordinamento |
| `ProcParams` | `&$params` | solo stored procedure: parametri della chiamata (nome => valore) |
| `ProcRows` | `&$rows` | solo stored procedure: righe restituite, da filtrare o modificare in PHP |
| `BeforeShowList` | `&$rows, $page` | prima di mostrare la lista |
| `ProcessValues` | `&$values, $page` | prima di mostrare un record in visualizza/modifica |
| `BeforeShow` | `$page` | subito prima di mostrare la pagina |
| `CustomValidate` | `$values, &$errors, $page` | validazioni personalizzate: `$errors['campo'] = 'messaggio'` |
| `BeforeAdd` | `&$values, &$message, $page` | prima di inserire |
| `AfterAdd` | `$values, $keys, $page` | dopo l'inserimento (`$keys` = chiave del nuovo record) |
| `BeforeEdit` | `&$values, $old, &$message, $page` | prima di salvare le modifiche |
| `AfterEdit` | `$values, $old, $keys, $page` | dopo il salvataggio |
| `BeforeDelete` | `$old, &$message, $page` | prima di eliminare |
| `AfterDelete` | `$old, $page` | dopo l'eliminazione |
| `BeforeImport` | `&$values, $page` | per ogni riga importata (`return false` la salta) |
| `AfterImport` | `$result, $page` | dopo un'importazione (`added`, `updated`, `skipped`, `errors`) |

Altri metodi generati: `Default_<campo>`, `AutoUpdate_<campo>`, `LookupWhere_<campo>`, `ViewAs_<campo>` (codice dei campi), `Custom_<nome>`, `Snippet_<nome>` (blocchi del designer pagine), `Button_<nome>($params, &$result, $button)` (pulsanti personalizzati). `$page` vale `inline` per la modifica e l'aggiunta in linea.

### Eventi globali

| Evento | Parametri | Quando |
|---|---|---|
| `AfterAppInit` | — | all'avvio di ogni richiesta |
| `BeforeLogin` | `&$username, &$password, &$message` | prima del login (`return false` lo blocca) |
| `AfterSuccessfulLogin` | `$username, $user` | dopo un login riuscito |
| `AfterUnsuccessfulLogin` | `$username, $message` | dopo un login fallito |
| `TwoFactorPhone` | `&$phone, $user` | numero a cui inviare il codice SMS della verifica in due passaggi |
| `BeforeRegister` | `&$values, &$message` | prima della registrazione |
| `AfterRegister` | `$values` | dopo la registrazione |
| `AfterLogout` | `$username` | dopo il logout |
| `Task_<nome>` | `&$message` | attività pianificata (`return false` o eccezione = errore) |

## Funzioni PHP

Disponibili in tutti gli eventi, nei blocchi PHP, nell'intestazione/piè/menu e nelle attività.

| Funzione | Descrizione |
|---|---|
| `db($connessione = null)` | connessione PDO dell'app (`->pdo`, `->all($sql, $p)`, `->row()`, `->value()`, `->query()`, `->insert($tabella, $valori)`, `->update($tabella, $valori, $chiavi)`, `->delete()`, `->table($nome)`, `->q($identificatore)`) |
| `user()`, `userId()`, `userName()`, `userGroups()`, `isAdmin()` | utente collegato |
| `t($chiave, ...$valori)` | testo tradotto dell'interfaccia |
| `h($testo)` | protezione HTML |
| `appUrl($pagina, $parametri)` | indirizzo di una pagina dell'app (`appUrl('list', ['t' => 'ordini'])`) |
| `redirect($url)` | reindirizza e termina |
| `sessionVar($chiave[, $valore])` | variabile di sessione dell'app |
| `sendMail($a, $oggetto, $testo, $html = true)` | email con le impostazioni SMTP del progetto |
| `sendTemplate($nome, $a, ['campo' => valore])` | email da un modello del progetto |
| `sendSms($numero, $testo)` | SMS con il servizio del progetto (`true` se inviato) |
| `addNotification($messaggio, $titolo, $icona, $url, $scadenza, $utente, $nuovaFinestra)` | notifica nella campanella (a tutti o a un utente) |
| `\MiB\Geocode::fill('tabella', $limite)` | coordinate dei record senza coordinate (per esempio in un'attività) |
| `\MiB\Tasks::run('nome')` | esegue subito un'attività pianificata |

## Compatibilità con i progetti importati

Per eseguire gli eventi importati senza riscriverli:

- `DB::Query($sql)` (risultato con `fetchAssoc()`, `fetchNumeric()`, `value()`), `DB::Exec`, `DB::Lookup` / `DB::DBLookup`, `DB::Select`, `DB::Insert`, `DB::Update`, `DB::Delete`, `DB::PrepareSQL`, `DB::LastId`, `DB::LastError`, `DB::SetConnection`, `DB::ConnectionByID`;
- `Security::getUserName()`, `getDisplayName()`, `getUserGroup()`, `getUserGroups()`, `isAdmin()`, `isLoggedIn()`, `isGuest()`, `getUserData()`, `getPermissions($tabella)`, `logout()`;
- `$pageObject` (con `getCurrentRecord()`, `hideItem()`, `setProxyValue()`…), `$xt->assign()` (anche `campo_fieldblock` per nascondere un campo), `$record` in BeforeMoveNext;
- `runner_mail($params)`, `runner_sms($numero, $messaggio)`, `runner_htmlspecialchars()`;
- variabili di sessione `$_SESSION['UserID']`, `UserName`, `GroupID`, `AccessLevel`;
- funzioni `mc74_*`: semantica di PHP 7.4 per le chiamate che in PHP 8 genererebbero errori con valori vuoti (`count`, `implode`, `number_format`, `round`…), inserite dall'importazione;
- eventi JavaScript: `pageObj`, `Runner.getControl()`, `Runner.*`; personalizzazioni AnyChart dei grafici (`JS_ModifyChart`) tradotte su ECharts.

## Permessi

Lettere dei permessi per gruppo e tabella: **A** aggiungi · **E** modifica · **D** elimina · **S** elenco e ricerca · **V** visualizza · **P** stampa ed esportazione · **I** importazione. Report, grafici e dashboard usano solo **S**.

Accesso Windows (R-LAB): permessi per pagina nella forma posizionale `R:W:L` (lettura, scrittura, elenco) in `rlab_profilazione_permission`.

## Tabelle di sistema

Create dall'app al primo avvio nel database della connessione principale (prefisso predefinito `mc_`), su MariaDB/MySQL, PostgreSQL, SQL Server, Oracle e SQLite. Una versione nuova dell'app crea solo le tabelle mancanti.

| Tabella | Contenuto |
|---|---|
| `mc_users` | utenti gestiti (password bcrypt, email, attivo, verificato, provider, chiave API, segreto TOTP, tentativi falliti, blocco) |
| `mc_groups`, `mc_members`, `mc_rights` | gruppi, appartenenza, permessi (con i permessi dinamici) |
| `mc_audit` | registro attività (valori vecchi e nuovi; password, file e campi cifrati mascherati) |
| `mc_locks` | blocco dei record durante la modifica |
| `mc_reports` | report e grafici creati dagli utenti |
| `mc_notifications`, `mc_notif_seen` | notifiche e ultime lette |
| `mc_searches` | ricerche salvate |
| `mc_tasks` | ultima esecuzione delle attività pianificate (esito, messaggio, durata) |
| `mc_phones` | telefoni per i codici SMS |
| `mc_remember` | token di «Ricordami» (selettore e hash del verificatore) |

## Formato del progetto

Una cartella di piccoli file deterministici (chiavi ordinate), adatta a Git:

```
mibcrude.json              impostazioni del progetto
connections/<id>.json      connessioni (senza password)
tables/<nome>.json         un'origine dati con campi e pagine
events/_global/<Ev>.php    eventi globali e attività (Task_<nome>.php)
events/<tabella>/<Ev>.php  eventi della tabella
menu.json                  menu
security.json              accesso, gruppi, permessi, provider
lang/<codice>.json         traduzioni
reports/, charts/, dashboards/   un file per elemento
custom/                    file copiati nell'app (custom.css, logo.png…)
public/                    file serviti dalla radice dell'app (include dei progetti .phpr)
.mibcrude-local/           solo sul computer dello sviluppatore: password, chiavi, output, profili di pubblicazione
```

I segreti (`.mibcrude-local/secrets.json`): password delle connessioni, client secret OIDC, password SMTP, password o token SMS, chiave di geocodifica, **chiave di cifratura** dei campi cifrati, profili di pubblicazione, credenziali del server del team.
