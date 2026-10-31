# MiB-Crude

Generatore visuale di applicazioni web PHP per Linux, per Linux, con lavoro **multisviluppatore** nativo. Progetto educativo.

![Designer](docs/screenshots/designer-fields.png)

## Cosa fa

Parti da un database esistente (MariaDB/MySQL, PostgreSQL, SQL Server, Oracle, SQLite) o da un **servizio REST JSON**, scegli le tabelle — oppure crea tabelle e dati da un **modello pronto** (CRM, helpdesk, prenotazioni risorse, archivio documenti) — e ottieni un'applicazione web completa:

- **Pagine**: lista (ricerca rapida, ricerca avanzata, pannello filtri, ordinamento, paginazione, totali, selezione multipla), nuovo, modifica, visualizza, copia, elimina, **modifica selezionati** (stessi valori su tutte le righe spuntate), stampa, esporta (CSV/XLSX/JSON/**PDF** con i caratteri di quasi tutte le lingue (DejaVu Sans, più Droid Sans Fallback per cinese e giapponese e Noto Sans Thai; arabo ed ebraico da destra a sinistra), anche il singolo record dalla vista con le immagini dei campi), importa (CSV/XLSX con aggiornamento e "tutto o niente")
- **Campi**: 17 formati di visualizzazione e 19 controlli di modifica — lookup da tabella o elenco fisso, a cascata, completamento automatico, selezione multipla, "aggiungi nuovo" in finestra; upload file/immagini con miniature e ridimensionamento (cartella o BLOB); testo formattato; validazioni (obbligatorio, unico, email, min/max, regex)
- **Master-dettaglio** ricavato dalle chiavi esterne (schede nella vista/modifica, icone nella lista)
- **Viste della lista**: calendario, kanban, galleria, mappa; modifica in linea; nuovo/modifica in finestra; campi QR code e firma
- **Page designer** a sezioni (riquadri o schede, colonne, larghezze per campo) con blocchi HTML e snippet PHP
- **Eventi PHP** (BeforeAdd, AfterEdit, BeforeSelect, CustomValidate…) con editor Monaco, controllo sintassi, azioni predefinite e **Assistente AI** (Claude: scrive o modifica l'evento conoscendo tabelle e campi del progetto, controlla la sintassi con `php -l`; chiave API cifrata nel portachiavi di sistema)
- **Accedi come**: dalla pagina Utenti l'amministratore usa l'app con i permessi di un utente per controllare cosa vede, poi «Torna a…» dall'intestazione; tutto nel registro attività
- **App installabile (PWA)**: opzione del progetto; manifest, icona (logo o iniziali sul colore principale) e service worker, l'app si installa su telefoni e computer e si apre a schermo pieno
- **«Ricordami»** nella pagina di accesso (giorni configurabili): il browser resta collegato, cookie rinnovato a ogni uso, un cookie copiato e riusato scollega l'utente ovunque
- **Campi cifrati**: opzione «Cifrato nel database» del campo (AES-256-GCM con la chiave del progetto): nel database solo il valore cifrato, nell'app il valore in chiaro; mascherati nel registro attività
- **Pagine a passi**: nel designer delle pagine una sezione può essere un «Passo»; Nuovo e Modifica mostrano un passo alla volta con Avanti/Indietro, controllo dei campi obbligatori del passo e salvataggio all'ultimo
- **Aggiunta in linea**: pulsante «Aggiungi riga» nella lista per inserire record senza aprire la pagina Nuovo (eventi, validazione e valori predefiniti come la pagina Nuovo)
- **Report a campi incrociati (crosstab)**: righe = raggruppamenti, colonne = valori di un campo (anche per anno, trimestre, mese…), totali di riga e di colonna, clic su una cella per aprire la lista filtrata, esportazione XLSX
- **Aspetto scelto dall'utente**: con i temi Material Admin, Webarch e Slim ogni utente cambia colori o posizione del menu dal pulsante con la tavolozza nell'intestazione
- **Cerca nel progetto** (pulsante Cerca o Ctrl+Maiusc+F): tabelle, campi, lookup, SQL, codice degli eventi (con il numero di riga), menu, report, grafici, dashboard, traduzioni, intestazione/piè/menu, attività pianificate e modelli email; un clic apre il pannello del risultato
- **Annulla / ripeti** nel designer: pulsanti nella barra in alto, Ctrl+Z e Ctrl+Y (o Ctrl+Maiusc+Z), fino a 100 passi; la digitazione continua in un campo conta come un passo
- **Geocodifica** della vista mappa: coordinate calcolate dall'indirizzo (campo o modello `{via}, {cap} {citta}`) con OpenStreetMap Nominatim (anche un server aziendale) o Google, al salvataggio, con il pulsante «Geocodifica» sopra la mappa o con `Geocode::fill('tabella')` in un'attività pianificata
- **SMS**: `sendSms($numero, $testo)` e `runner_sms()` di phpr tramite Twilio, un gateway HTTP qualsiasi (indirizzo e corpo con segnaposto, GET/POST, modulo o JSON) o un file di prova (Progetto › SMS); **codice di accesso via email o SMS** per chi non usa l'app di autenticazione (Sicurezza › Verifica in due passaggi), numero di telefono dal profilo o dall'evento `TwoFactorPhone`
- **Modelli email**: oggetto e testo HTML in ogni lingua per conferma della registrazione e recupero della password, più modelli propri da inviare da eventi e attività con `sendTemplate('nome', $destinatario, ['campo' => valore])`; segnaposto `{campo}`, `{app}`, `{date}`, `{user}` (Progetto › Modelli email)
- **Attività pianificate**: codice PHP a orari fissi (espressioni cron con scelte pronte: ogni 5 minuti, ogni giorno, dal lunedì al venerdì…) scritto nel designer (Progetto › Attività pianificate); l'app generata ha `cron.php` da lanciare ogni minuto (crontab o Utilità di pianificazione di Windows), con esito, messaggio, durata ed «Esegui ora» in Amministrazione
- **Ricerche salvate**: menu «Ricerche salvate» in ogni lista per salvare con un nome ricerca rapida, ricerca avanzata e filtri, e richiamarli con un clic; gli amministratori possono condividerle con tutti (tabella di sistema `mc_searches`)
- **Origini da stored procedure** (come phpr): pulsante «Da stored procedure» in Tabelle e query, procedura scelta dall'elenco del database (MariaDB/MySQL e SQL Server: procedure; PostgreSQL: funzioni che restituiscono una tabella; Oracle: funzioni pipelined), parametri da valore fisso, variabile di sessione, utente collegato, indirizzo della pagina o evento `ProcParams`; lista, ricerca, filtri, ordinamento, totali, report e grafici sul risultato; inserimento, modifica ed eliminazione tramite altre procedure (facoltativi)
- **Origini dati REST**: una risorsa di un'API JSON (autenticazione Bearer, Basic, chiave in header o URL) diventa una tabella con lista, ricerca, filtri, ordinamento, totali, visualizza/modifica/elimina tramite l'API; paginazione lato API (pagina o scostamento, ricerca, ordinamento e filtri delegati nella sintassi dell'API: `?campo=valore`, json-server, Strapi o modelli personalizzati per operatore), cache delle risposte, lookup verso risorse REST, report e grafici
- **Sicurezza**: utenti gestiti o tabella esistente o utente fisso, gruppi, permessi per tabella (A/E/D/S/V/P/I), **permessi dinamici** gestibili dall'app, record per utente, registrazione con conferma email, recupero password, CAPTCHA, regole password, blocco dopo tentativi falliti, **LDAP/Active Directory**, **OpenID Connect** (Okta, Entra ID, Google, Keycloak) con mappatura gruppi, **SAML 2.0** (firma XML verificata), **autenticazione a due fattori** (TOTP)
- **Accesso Windows (NTLM)** come nei progetti R-LAB: il server web autentica, l'app legge `REMOTE_USER`, gruppi e area da `rlab_profilazione_gruppo`, permessi per pagina `R:W:L` da `rlab_profilazione_permission`, registro accessi in `rlab_accessi`; gestione di utenti e permessi in Amministrazione › Utenti Windows / Permessi pagine
- **Intestazione, piè di pagina e menu** del progetto (file della cartella public/ o codice scritto nel designer), in tutti i temi
- **Docker di progetto** (Output › Docker di progetto): Apache, PHP e MariaDB nelle versioni scelte per replicare la produzione; con l'accesso Windows Apache è configurato come il httpd.conf di produzione (NTLM/Kerberos in Linux con mod_auth_gssapi, più il frammento per Apache24 su Windows con mod_authn_ntlm)
- **Registro attività** (audit) e **blocco record** durante la modifica
- **Notifiche**: campanella nell'intestazione con le non lette; messaggi dalla sezione Amministrazione › Notifiche (a tutti o a un utente, con collegamento e scadenza) o dagli eventi con `addNotification()` come in phpr
- **Report** con raggruppamenti e totali, **grafici** (Apache ECharts; un clic su barra, punto o fetta apre la lista filtrata su quel valore o periodo), **dashboard**; **Report & Chart Builder** web per gli utenti finali
- **API REST** per tabella con chiave API e descrizione **OpenAPI**
- Menu ad albero, temi (colore, barra laterale/alta, chiaro/scuro), **multilingua** con traduzioni
- **Anteprima** integrata (PHP locale o Docker) e **pubblicazione** incrementale via SFTP, FTP/FTPS o cartella

![App generata](docs/screenshots/app-list.png)

## Importazione di progetti .phpr

Pulsante **Importa progetto .phpr** nella schermata iniziale: legge il file `.phpr` (phpr 10.x) e l'archivio pagine `PAGES*.sqlite` accanto, e converte connessioni (password solo in locale), tabelle, query SQL, campi, lookup (anche a cascata), pagine e campi per pagina, master-dettaglio, menu, gruppi e permessi, grafici ed eventi PHP. Gli eventi funzionano senza riscriverli grazie allo strato di compatibilità del runtime (`DB::Query`, `DB::Lookup`, `Security::getUserName()`, `$pageObject`, `$xt`, `$record` in BeforeMoveNext, `runner_mail`…). Il codice PHP 7.4 viene adeguato a PHP 8 (correzioni automatiche sicure, il resto segnalato in `import-phpr/REPORT.md`). Anche eventi JavaScript (`pageObj`, `Runner.getControl`), pulsanti personalizzati (OnBefore/OnServer/OnAfter), varianti di pagina, dashboard e personalizzazioni AnyChart dei grafici (`JS_ModifyChart`, tradotte su ECharts) vengono convertiti.

## Liste e grafici

Le liste usano **DataTables 2 in modalità server-side** (ordinamento, ricerca e paginazione in SQL, colonne visibili, stato ricordato, totali), sempre con scroll orizzontale e verticale e intestazione fissa. Anche report, amministrazione, stampa e le altre pagine scorrono in entrambe le direzioni. I grafici usano **Apache ECharts** (colonne, barre, linee, aree, dispersione, torta, ciambella, rosa, imbuto, treemap, gauge, radar; esportazione immagine, vista dati, cambio tipo).

## Temi grafici da template acquistati

In *Impostazioni e stile → Temi grafici → Importa template…* si indica la cartella dei template (es. ThemeForest). MiB-Crude riconosce i template Bootstrap 5 per cui ha un adattatore — **Metronic 8** (Keenthemes) e **Cork 3 / Equation 2** (DesignReset), con tutte le varianti di menu verticali e orizzontali, e **Satria** per le pagine di accesso e la pagina di presentazione pubblica; anche i template Bootstrap 4/3 **Slim** (menu laterale o orizzontale, skin scura legata alla modalità scura dell'app) e **Webarch** (colori Predefinito, Corporate, Elegant, Simple, con skin scura aggiunta da MiB-Crude), dei quali si tiene solo lo stile del tema senza il vecchio Bootstrap, e **Material Design Admin** (AngularJS: intestazione e menu riscritti senza AngularJS, quattro combinazioni di colori anche con menu orizzontale, skin scura aggiunta) — e copia solo CSS/JS/font nella libreria locale `~/.config/MiB-Crude/themes`. Il layout dell'app generata usa il markup originale del template (menu laterale, intestazione, modalità scura); liste DataTables, moduli e grafici ECharts prendono lo stile del tema. I file dei template non entrano mai nel codice di MiB-Crude né nel progetto (licenze). Template senza adattatore vengono segnalati come non compatibili.

## Multisviluppatore

Due modalità, usabili insieme:

1. **Git** — il progetto è una cartella di piccoli file JSON/PHP ordinati in modo deterministico (`tables/ordini.json`, `events/ordini/BeforeAdd.php`, …): diff leggibili, merge puliti, branch. Il pannello *Team e versioni* fa commit, pull, push, diff e risoluzione conflitti.
2. **Server del team** (tempo reale, come phpr MultiDev ma a grana più fine) — chi apre una tabella, il menu, la sicurezza o gli eventi globali li **blocca** per gli altri; ogni salvataggio arriva subito agli altri designer; presenza online, chat, rilevamento conflitti a tre vie, storico Git sul server.

```bash
npm run server -- --data ./team-data                       # avvia il server (ws://0.0.0.0:7300)
node server/mibcrude-server.cjs --data ./team-data --add-user mario --role admin   # crea utente, stampa il token
```

Password di database, chiavi e destinazioni di pubblicazione restano in `.mibcrude-local/` sul computer di ciascuno sviluppatore, mai nel progetto condiviso.

## Avvio

```bash
npm install
npm run dev        # designer in sviluppo
npm start          # build + avvio
npm test           # test end-to-end (MariaDB demo + server del team)
npm run dist       # AppImage e .deb
```

L'app controlla gli aggiornamenti sulle release GitHub all'avvio (al massimo ogni 12 ore, disattivabile): l'AppImage si sostituisce da sola, il `.deb` si installa con `pkexec apt`.

Esportazione/importazione di tabelle tra progetti in ZIP (impostazioni, report, grafici ed eventi come file leggibili). I test end-to-end richiedono MariaDB con l'utente `mibcrude`/`mibcrude` sul database `mibcrude_demo` (schema in `tests/fixtures/demo-mysql.sql`) e `php-cli` con `pdo_mysql`.

## Architettura

| Cartella | Contenuto |
|---|---|
| `core/` | modello di progetto su file, introspezione dei 5 database, default del wizard, generatore, protocollo team |
| `runtime/` | runtime PHP dell'app generata (PHP 7.4 – 8.5, testato su 7.4, 8.4, 8.5): PDO multi-dialetto, pagine, sicurezza, API, report, compatibilità phpr |
| `electron/` | processo principale del designer: IPC, anteprima, pubblicazione, Git, client del server del team |
| `src/` | interfaccia del designer (React + Monaco) |
| `server/` | server del team (WebSocket) |

L'app generata è il runtime fisso più la configurazione del progetto (`config/*.php`) e gli eventi: rigenerare non perde mai codice scritto a mano, perché vive nel progetto (`events/`, `custom/`).
