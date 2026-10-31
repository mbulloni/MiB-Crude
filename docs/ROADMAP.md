# Roadmap — gap rispetto a generatori classici

Stato v0.9.1 (2026-10-31): roadmap iniziale completa (v0.2.0), origini REST complete (v0.3.0), temi Slim e Webarch (v0.4.0), correzione import eventi (v0.4.1), skin scura Webarch (v0.4.2), tema Material Admin (v0.5.0), riconnessione al server del team (v0.5.1), filtri REST all'API e strato AnyChart completo (v0.6.0), modifica selezionati, notifiche, clic sui grafici e PDF (v0.7.0), intestazione/piè/menu del progetto, accesso Windows NTLM e Docker di progetto (v0.8.0), Docker su Windows con Apache24 di produzione e mod_authn_ntlm (v0.9.0), controllo del sistema dei contenitori prima di avviare (v0.9.1); restano i limiti sotto.

## Fatto (v0.2.0, 2026-10-30)
1. Test end-to-end su tutti i database: MariaDB, PostgreSQL, SQL Server, Oracle, SQLite (`npm run test:db`, container Docker in docs/TESTING.md).
2. Page designer a sezioni (riquadri/schede, colonne, larghezze per pagina) con blocchi HTML e snippet PHP.
3. Modifica in linea nella lista, add/edit/view in finestra popup.
4. SAML 2.0 (SP con verifica firma XML resistente al wrapping, metadati SP).
5. Web Report & Chart Builder per gli utenti finali (mc_reports, rispetta i permessi).
6. Autenticazione a due fattori TOTP (attivazione dal profilo, reset dall'amministrazione).
7. Modelli aziendali (CRM, helpdesk, prenotazione risorse, archivio documenti) che creano tabelle e dati su qualunque database; creazione/modifica tabelle dal designer.
8. Assistente AI per gli eventi (Claude, contesto del progetto, correzione automatica dopo `php -l`).
9. Viste calendario, mappa, galleria, kanban; campi QR code e firma.
10. Pacchetti `.deb` e AppImage, icona installata, aggiornamenti integrati dalle release GitHub.
11. Mappatura gruppi OIDC e SAML nel designer.
12. Eventi JavaScript phpr (API client `pageObj`, `Runner.*`), eventi dei grafici `JS_ModifyChart` (strato AnyChart su ECharts).
13–16. Varianti di pagina come viste, dashboard, sezioni e layout delle pagine, `$xt`/`hideItem` con effetto.
18. Pulsanti personalizzati phpr (OnBefore/OnServer/OnAfter).
19. Import/export tabelle in ZIP; origini dati REST.

## Fatto (v0.3.0, 2026-10-31)
- Origini REST complete (2026-10-31): paginazione dell'API (numero di pagina o scostamento, totale, ricerca e ordinamento delegati all'API), lookup verso tabelle REST da tabelle SQL e REST (anche a cascata, modello `{campo} ({campo})`), pannello filtri, controllo valori unici, importazione, report, grafici e dashboard su origini REST; paginazione modificabile anche dopo la creazione (scheda Generale della tabella).

## Fatto (v0.4.0, 2026-10-31)
- Adattatori temi Slim (Bootstrap 4: tolto il Bootstrap incluso in slim.css, skin scura limitata a `[data-bs-theme=dark]`, menu laterale o orizzontale) e Webarch (Bootstrap 3: quattro temi colore, menu compatto, menu utente anche su mobile), con JavaScript proprio al posto di jQuery/Bootstrap 3-4 dei template (2026-10-31).

## Fatto (v0.4.1, 2026-10-31)
- Import phpr: una parola rimasta in fondo a un evento (errore di sintassi già nel progetto originale, es. `BeforeMoveNext` di "Dettaglio Gruppo") viene rimossa e segnalata nel report, solo se è l'unico errore (2026-10-31).

## Fatto (v0.4.2, 2026-10-31)
- Skin scura per Webarch (il template non ne ha una): intestazione, menu laterale, contenuti, tabelle, controlli e menu a tendina seguono la modalità scura dell'app con tutti e quattro i colori; corretto anche il colore del testo dei pulsanti outline e link, nascosto da webarch.css (2026-10-31).

## Fatto (v0.5.0, 2026-10-31)
- Adattatore Material Design Admin (AngularJS 1 + Angular Material + Bootstrap 3): intestazione e menu laterale riscritti in PHP senza AngularJS, dal main.css del template restano solo ui.css e app.css; combinazioni di colori del personalizzatore (barra scura, logo blu, intestazione blu con barra chiara, menu orizzontale), menu ridotto alle icone, menu a scomparsa su mobile, skin scura aggiunta (2026-10-31).

## Fatto (v0.5.1, 2026-10-31)
- Server del team: dopo una riconnessione la chiusura asincrona del vecchio socket non annulla più le richieste della nuova connessione né segna il designer come disconnesso (era anche il test instabile della suite).

## Fatto (v0.6.0, 2026-10-31)
- Origini REST: filtri inviati all'API (`?campo=valore`, più valori ripetendo il parametro) per master-dettaglio, pannello filtri, ricerche "uguale a" e record per utente, anche per totali, report e grafici; cache delle risposte per N secondi, svuotata dalle modifiche (2026-10-31).
- PDF: solo i caratteri di Windows-1252 (gli altri, per esempio cirillico, greco o emoji, diventano «?»); le immagini dei campi non sono incluse; testi troppo lunghi per la colonna vengono troncati con «…» (nella vista del record vanno a capo).
- Docker di progetto: l'unione al dominio Active Directory (modalità dominio) non è stata provata contro un dominio reale (verificati configurazione, caricamento di mod_auth_gssapi e richiesta Negotiate); mod_authn_ntlm, usato dall'Apache di produzione su Windows, esiste solo per Windows: in Docker (Linux) l'equivalente è mod_auth_gssapi. Le versioni di Apache sono quelle delle distribuzioni (Debian/Ubuntu), non una versione 2.4.x a scelta.
- Docker di progetto su Windows (Windows Server Core + Apache24 di produzione + mod_authn_ntlm + PHP 8, MariaDB per Windows, gMSA): solo file generati e verificati nei test, mai costruito né avviato (serve un host Windows con contenitori Windows); download di PHP da windows.php.net non verificato da qui (il sito rifiuta richieste automatiche senza browser).
- Accesso Windows: Apache su Linux con mod_auth_gssapi risponde «Negotiate» (il browser invia NTLM o Kerberos dentro Negotiate); client che accettano solo l'intestazione «NTLM» non sono supportati.
- Strato AnyChart: impilamento dei valori e al 100% (`stackMode`), marcatori delle linee, etichette esterne delle torte (`outsideLabelsCriticalAngle`), stringhe di formato AnyChart (`{%Value}{decimalsCount:2,groupsSeparator:.}`, `{%PercentValue}`, `{%SeriesName}`) in etichette, tooltip e assi, `anychart.format.number` con opzioni; nessuna chiamata dei progetti reali resta ignorata (2026-10-31).

## Fatto (v0.7.0, 2026-10-31)
- **Modifica selezionati** ("Update selected" di phpr): pulsante nella lista, campi da cambiare scelti con una spunta, ogni record passa da blocco, validazione, eventi BeforeEdit/AfterEdit, valori automatici e registro attività; opzione della pagina lista nel designer.
- **Notifiche** (phpr 10.7): `addNotification($message, $title, $icon, $url, $expire, $user, $newWindow)`, campanella nell'intestazione di tutti i temi, sezione Amministrazione › Notifiche; tabelle di sistema `mc_notifications` e `mc_notif_seen` (schema 3) provate su MariaDB, PostgreSQL, SQLite, SQL Server e Oracle.
- **Grafici con clic**: barra, punto o fetta aprono la lista filtrata (valore esatto o intervallo di date di anno, trimestre, mese, settimana, giorno).
- **PDF**: formato di esportazione della lista (A4, orizzontale se servono più colonne, intestazione su ogni pagina) e pulsante PDF nella vista del record; generatore PHP senza dipendenze, caratteri Windows-1252 (accenti italiani, €).

## Fatto (v0.8.0, 2026-10-31)
- **Intestazione, piè di pagina e menu** del progetto: file della cartella public/ (come gli include di phpr, es. k-nav-bar-top.php) o codice HTML/PHP scritto nel designer, in tutti i layout; intestazione/piè standard nascondibili, menu che sostituisce o affianca quello generato. I layout dei temi vengono ora presi dall'adattatore attuale, non dalla copia fatta all'importazione del template.
- **Accesso Windows (NTLM)** come R-LAB (security.mode = ntlm): REMOTE_USER normalizzato (DOMINIO\utente → UTENTE@suffisso), gruppi e area da rlab_profilazione_gruppo, nome da rlab_venditori, permessi R:W:L per pagina da rlab_profilazione_permission, registro in r_lab_statistiche.rlab_accessi, variabili di sessione R-LAB; pagine di gestione Utenti Windows e Permessi pagine sulle stesse tabelle.
- **Docker di progetto**: Apache (Debian 12/13, Ubuntu 22.04/24.04), PHP-FPM 7.4–8.5, MariaDB 10.4–11.8, script SQL iniziale, app generata con la connessione verso il contenitore; NTLM come il httpd.conf di produzione (utente valido, anonimi esclusi, X_ISRW_PROXY_AUTH_USER, percorsi esclusi) con mod_auth_gssapi + gss-ntlmssp + winbind e utente simulato senza dominio; frammento httpd-ntlm.conf per Apache24 su Windows con mod_authn_ntlm. Provato con docker compose: Apache 2.4.68 + PHP 8.3 + MariaDB 11.4 e PHP 7.4 + MariaDB 10.6.
- **Docker di progetto su Windows** (v0.9.0, 2026-10-31): sistema operativo a scelta; con Windows, contenitore Windows Server Core 2019/2022/2025 con l'Apache24 di produzione copiato (senza htdocs, logs, php), httpd.conf con gli stessi moduli, PHP 8.0–8.5 thread safe come modulo Apache, mod_authn_ntlm (AuthType SSPI) con gMSA e credential spec (setup-gmsa.ps1) o utente simulato, MariaDB per Windows.

## Dopo v0.9.1 (in corso)
- **Origini da stored procedure**: procedure MariaDB/MySQL (`CALL`) e SQL Server (`EXEC`), funzioni PostgreSQL che restituiscono una tabella, funzioni pipelined Oracle; elenco e parametri letti dal database, campi dal primo risultato (tipi dai metadati del driver), parametri da valore fisso, sessione, utente, indirizzo o evento `ProcParams`; ricerca, filtri, ordinamento, paginazione, totali, report e grafici in memoria come per REST. Provato su MariaDB, PostgreSQL, SQL Server e Oracle (tests/proc.test.cjs, anche in `npm run test:db`).
- **Ricerche salvate** ("Save search" di phpr): menu nella lista, ricerca rapida + avanzata + filtri salvati per utente, condivisione da parte degli amministratori, eliminazione; tabella di sistema `mc_searches` (schema 4) provata su MariaDB, PostgreSQL, SQLite, SQL Server e Oracle; opzione del progetto per disattivarle. Servono il login.
- **Attività pianificate**: `settings.tasks` (nome, titolo, espressione cron, attiva) con il codice nell'evento globale `Task_<nome>(&$message)`; `cron.php` nell'app (solo da riga di comando: attività dovute, `--run NOME`, `--list`, blocco per non eseguirle due volte), stato in `mc_tasks` (schema 5), sezione Amministrazione con prossima/ultima esecuzione, esito ed «Esegui ora»; provato su tutti e cinque i database.
- **Modelli email**: `settings.mailTemplates` per lingua, usati dalle email di registrazione e recupero password (altrimenti i testi standard), `sendTemplate()` per i modelli propri, valori protetti nell'HTML; provato con un server SMTP di prova (tests/mail.test.cjs).
- **SMS e codice di accesso via email/SMS**: classe Sms (Twilio, gateway HTTP, file), `sendSms()`, `runner_sms()`; verifica in due passaggi con codice a 6 cifre per chi non ha l'app (5 minuti, 5 tentativi, nuovo invio dopo 30 secondi), telefono nel profilo (tabella `mc_phones`, schema 6) o dall'evento `TwoFactorPhone`, modello email «twofactor». Provati codice via SMS (file) e gateway HTTP con un server di prova.
- **Geocodifica** delle viste mappa: indirizzo da campo o modello, Nominatim (una richiesta al secondo, User-Agent, paesi) o Google; al salvataggio solo se mancano le coordinate o se cambia l'indirizzo senza che l'utente abbia cambiato le coordinate; in blocco 20 alla volta dal pulsante della mappa o `Geocode::fill()`. Provato con un Nominatim di prova (tests/geocode.test.cjs).
- **Annulla / ripeti** nel designer: storico di 100 stati del progetto (modifiche a meno di un secondo l'una dall'altra unite), azzerato all'apertura, alla ricarica e all'arrivo dei file del team; Ctrl+Z nei campi di testo e negli editor di codice resta quello del campo. Provato nell'app con uno script Electron.
- **Cerca nel progetto**: ricerca in tutto il progetto raggruppata per posizione, righe di codice con numero, apertura del pannello (per le tabelle la scheda giusta). Provata nell'app con uno script Electron.

## Limiti aperti
- Annulla/ripeti: non annulla operazioni già eseguite sul database o sul disco (creazione tabelle, importazioni di file, salvataggio), solo lo stato del progetto nel designer.
- Geocodifica: Google non provato con una chiave reale; il pulsante della mappa elabora 20 record per clic (con Nominatim pubblico circa 20 secondi), per molti record conviene un'attività pianificata.
- SMS: Twilio non provato con un account reale (stessa chiamata documentata da Twilio); il codice via email è provato solo nell'invio del modello, non in un accesso completo.
- Attività pianificate: servono un cron di sistema (o l'Utilità di pianificazione) che lanci cron.php ogni minuto; nessun avvio da pagina web; un'attività molto lunga fa attendere le altre del minuto successivo (una alla volta).
- Stored procedure: sola lettura (niente inserimento/modifica tramite procedure), al massimo 50.000 righe lette a ogni pagina, il filtro fisso WHERE e l'evento BeforeSelect non si applicano; SQLite non ha procedure.
- Origini REST: con API a pagine e filtri `?campo=valore` lista, ricerca rapida, ordinamento, master-dettaglio, pannello filtri e ricerche "uguale a" sono eseguiti dall'API; le altre condizioni (contiene, maggiore/minore, intervalli, vuoto) e i totali, report e grafici senza filtri leggono tutte le pagine (massimo 50.000 record), con la cache delle risposte facoltativa per non rileggerle a ogni richiesta. Le condizioni SQL dei lookup (`where`) non si applicano ai lookup verso tabelle REST; l'importazione su REST non può essere annullata in blocco (ogni record è una chiamata all'API).
- PDF: solo i caratteri di Windows-1252 (gli altri, per esempio cirillico, greco o emoji, diventano «?»); le immagini dei campi non sono incluse; testi troppo lunghi per la colonna vengono troncati con «…» (nella vista del record vanno a capo).
- Strato AnyChart: copre tutte le chiamate dei 55 eventi grafico del progetto reale di prova e in più formati `{%Value}{...}`, impilamento e marcatori; altre chiamate AnyChart vengono ignorate senza errori.
- Temi: adattatori per Metronic 8, DesignReset (Cork/Equation), Satria, Slim, Webarch e Material Admin. Slim, Webarch e Material Admin girano sul Bootstrap 5 delle pagine: restano gli stili del tema, non i componenti JavaScript del template (grafici demo, chat, pannello impostazioni; per Material Admin anche i componenti Angular Material, il pannello di personalizzazione e le animazioni a onda dei pulsanti). Il tema va importato su ogni computer del team.
- Aggiornamenti integrati: puntano a `mbulloni/MiB-Crude` su GitHub; senza release pubblicate il controllo segnala l'errore. Aggiornamento del .deb dall'app provato con successo (0.4.0 → 0.4.1, 2026-10-31).
