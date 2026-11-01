# Guida di MiB-Crude

MiB-Crude è un generatore visuale di applicazioni web PHP, per Linux, per Linux. Nel designer (un'applicazione desktop Electron) si descrive l'applicazione: connessioni ai database, tabelle, campi, pagine, sicurezza, report, grafici, eventi PHP. Con un clic MiB-Crude genera un'applicazione web PHP completa (PHP 7.4 – 8.5, Bootstrap 5, DataTables, ECharts), la mostra in anteprima e la pubblica sul server.

Il progetto è una cartella di piccoli file di testo: più sviluppatori lavorano insieme tramite Git o tramite il **server del team** (modifiche in tempo reale, blocco per elemento).

Questa guida descrive ogni funzione e dove si trova. Altri documenti:

- [RIFERIMENTO.md](RIFERIMENTO.md): eventi, funzioni PHP disponibili nel codice, compatibilità phpr, tabelle di sistema, formato del progetto
- [APP-GENERATA.md](APP-GENERATA.md): struttura dell'applicazione generata, requisiti del server, pubblicazione, attività pianificate, sicurezza dei file
- [TESTING.md](TESTING.md): test automatici
- [ROADMAP.md](ROADMAP.md): storia delle versioni e limiti noti

---

## Indice

1. [Installazione e aggiornamenti](#1-installazione-e-aggiornamenti)
2. [Schermata iniziale](#2-schermata-iniziale)
3. [Il designer](#3-il-designer)
4. [Connessioni](#4-connessioni)
5. [Tabelle e query (origini dati)](#5-tabelle-e-query-origini-dati)
6. [La tabella: campi, pagine, eventi](#6-la-tabella-campi-pagine-eventi)
7. [Menu](#7-menu)
8. [Sicurezza](#8-sicurezza)
9. [Eventi globali e assistente AI](#9-eventi-globali-e-assistente-ai)
10. [Report, grafici e dashboard](#10-report-grafici-e-dashboard)
11. [Impostazioni e stile](#11-impostazioni-e-stile)
12. [Lingue](#12-lingue)
13. [Genera e pubblica](#13-genera-e-pubblica)
14. [Team e versioni](#14-team-e-versioni)
15. [Importazione di progetti .phpr](#15-importazione-di-progetti-phpr)
16. [L'applicazione generata](#16-lapplicazione-generata)

---

## 1. Installazione e aggiornamenti

Dalle [release GitHub](https://github.com/mbulloni/MiB-Crude/releases):

- **.deb** (Ubuntu/Debian): `sudo apt install ./mib-crude_X_amd64.deb`
- **AppImage**: si rende eseguibile e si avvia; non serve installarla.

All'avvio MiB-Crude controlla se c'è una versione nuova (al massimo ogni 12 ore, disattivabile). L'AppImage si sostituisce da sola; il .deb si installa con `pkexec apt`. Il pulsante con la freccia in alto a destra controlla subito.

Per provare le applicazioni nel designer serve **PHP** sul computer (`php-cli` con i driver dei database usati: `pdo_mysql`, `pdo_pgsql`, `pdo_sqlite`…) oppure **Docker**.

Da sorgente:

```bash
npm install
npm run dev        # designer in sviluppo (Vite + Electron)
npm start          # build e avvio
npm run dist       # AppImage e .deb in release/
```

## 2. Schermata iniziale

- **Nuovo progetto**: nome e cartella; poi si aggiungono le connessioni e le tabelle (anche *Da modello*, vedi [5](#5-tabelle-e-query-origini-dati)).
- **Apri progetto**: una cartella di progetto MiB-Crude (contiene `mibcrude.json`).
- **Clona da Git**: lavoro in team tramite un repository.
- **Server del team**: scarica e apre un progetto condiviso in tempo reale.
- **Importa progetto .phpr**: converte un progetto `.phpr` (vedi [15](#15-importazione-di-progetti-phpr)).
- **Recenti**.

## 3. Il designer

Ogni pannello si apre con un **riepilogo** (icona, nome e i dati principali, con le azioni più usate a destra). Impostazioni e stile, Sicurezza, Genera e pubblica e l'editor della tabella hanno le **categorie a sinistra** (icona, nome e una riga di descrizione); per Campi, Designer pagine ed Eventi della tabella restano solo le icone, per lasciare tutta la larghezza alla griglia. L'ultima categoria aperta viene ricordata.

Barra laterale:

| Voce | Cosa contiene |
|---|---|
| **Impostazioni e stile** | nome, lingua, formati, cartella dei file caricati, colori e tema grafico, intestazione/piè/menu, attività pianificate, modelli email, SMS, geocodifica, funzioni avanzate, email SMTP |
| **Connessioni** | database e servizi REST |
| **Tabelle e query** | origini dati del progetto, diagramma delle relazioni; ogni tabella si apre nell'editor |
| **Menu** | voci, gruppi, icone, collegamenti |
| **Sicurezza** | accesso, utenti, gruppi, permessi, provider esterni |
| **Eventi globali** | codice PHP eseguito all'avvio, al login, alla registrazione… |
| **Report / Grafici / Dashboard** | elementi di analisi |
| **Lingue** | lingue dell'applicazione e traduzioni |
| **Genera e pubblica** | generazione, anteprima, pubblicazione, Docker |
| **Team e versioni** | Git e server del team |

Barra in alto:

- **Salva** (Ctrl+S). Il pallino accanto al nome indica modifiche non salvate.
- **Annulla / Ripeti** (frecce; Ctrl+Z, Ctrl+Y o Ctrl+Maiusc+Z): fino a 100 passi sullo stato del progetto. La digitazione continua in un campo conta come un passo; dentro un campo di testo o un editor di codice Ctrl+Z resta quello del campo. Non annulla operazioni già fatte sul database o sul disco (creazione di tabelle, importazioni). Lo storico riparte all'apertura, alla ricarica e all'arrivo di modifiche dal team.
- **Cerca** (Ctrl+Maiusc+F): cerca in tutto il progetto (nomi ed etichette di tabelle e campi, lookup, SQL, codice degli eventi con il numero di riga, menu, report, grafici, dashboard, traduzioni, intestazione/piè/menu, attività, modelli email). Un clic sul risultato apre il pannello giusto.
- **Anteprima** (F5): genera l'applicazione e la apre nel browser integrato.
- **Pubblica**: va a *Genera e pubblica*.

## 4. Connessioni

Database supportati: **MariaDB/MySQL**, **PostgreSQL**, **SQL Server**, **Oracle**, **SQLite**, più i **servizi REST JSON**.

- Le password restano solo sul computer dello sviluppatore (`.mibcrude-local/`), mai nei file condivisi del progetto.
- Una connessione è la **principale**: lì vivono le tabelle di sistema (utenti, permessi, registro…). Deve essere un database, non un servizio REST.
- **REST**: indirizzo base e autenticazione (nessuna, Bearer, Basic, chiave in un'intestazione o nell'indirizzo).
- Menu contestuale della connessione: crea tabella, nuova query SQL, nuova origine da stored procedure, crea script SQL (in qualunque dialetto), sincronizza il database (confronta le tabelle del progetto con il database), ricarica.

## 5. Tabelle e query (origini dati)

A sinistra, per ogni connessione, le tabelle del database: la spunta le aggiunge al progetto. A destra il **diagramma** delle tabelle con le relazioni (trascinabile); il menu contestuale permette di modificare la struttura, eliminare la tabella, aggiungere relazioni.

Tipi di origine dati:

| Tipo | Come si crea | Note |
|---|---|---|
| **Tabella** | spunta nell'elenco | lettura e scrittura |
| **Query SQL** (vista) | *Nuova query SQL* | sola lettura; diventa modificabile indicando la *tabella da aggiornare* |
| **REST** | *Nuova origine REST* | una risorsa di un'API JSON |
| **Stored procedure** | *Da stored procedure* | il risultato di una procedura |
| **Da modello** | *Da modello* | tabelle, dati di esempio, menu, report, grafici e dashboard pronti, su qualunque database: *CRM clienti* (aziende, contatti, attività con kanban e calendario), *Helpdesk ticket*, *Calendario risorse*, *Archivio documenti* |

**Visualizza dati** (pulsante *Dati* nella barra con una tabella selezionata, menu contestuale, o *Dati* nel riepilogo dell'editor della tabella): i record della tabella, della query SQL o della stored procedure, a pagine da 50–500, ordinabili con un clic sull'intestazione della colonna e filtrabili con una condizione SQL (es. `status = 'new' AND total > 10`), con il conteggio dei record.

Con *Crea tabella* si crea una tabella nuova sul database scelto (tipi tradotti per ogni dialetto); *Importa tabelle* / esporta in ZIP spostano tabelle tra progetti.

### Origini REST

- **Percorso elenco** (es. `/users`), **percorso dei dati** nella risposta JSON (es. `data`), **percorso record** per visualizza/modifica/elimina (`{campo}` = valore della chiave), metodo di modifica PUT o PATCH.
- **Paginazione dell'API**: numero di pagina o scostamento, dimensione, totale, parametri per ricerca e ordinamento. Lista, ricerca rapida e ordinamento vengono chiesti all'API.
- **Filtri all'API**, nella sintassi del servizio:
  - *Solo uguale*: `?campo=valore` (più valori ripetendo il parametro);
  - *json-server*: `campo`, `campo_ne`, `campo_like`, `campo_gte`, `campo_lte`;
  - *Strapi*: `filters[campo][$eq]`, `$containsi`, `$startsWithi`, `$gt`, `$lt`, `$gte`, `$lte`, `$in`, `$null`, `$notNull`;
  - *Personalizzata*: un modello di parametro per ogni operatore (`{field}` = nome del campo).

  Se tutte le condizioni sono esatte, anche la paginazione resta all'API; altrimenti l'API restringe i record e l'app controlla di nuovo.
- **Cache delle risposte** per N secondi, svuotata a ogni scrittura.
- Lookup verso risorse REST, report e grafici funzionano anche su REST (al massimo 50.000 record letti).

### Origini da stored procedure

- *Da stored procedure* elenca le procedure del database: procedure su MariaDB/MySQL e SQL Server, funzioni che restituiscono una tabella su PostgreSQL, funzioni *pipelined* su Oracle. I parametri d'ingresso vengono proposti in automatico.
- **Parametri**: valore fisso, variabile di sessione, utente collegato, parametro dell'indirizzo della pagina (`?anno=2026`) o NULL; il *valore di prova* si usa solo nel designer per leggere i campi e per l'anteprima. L'evento `ProcParams(&$params)` li può calcolare in PHP.
- Il primo risultato della procedura diventa l'elenco dei record: ricerca, filtri, ordinamento, totali, report e grafici lavorano su quel risultato.
- **Filtri**: con PostgreSQL e Oracle il filtro fisso (WHERE) e l'evento BeforeSelect si applicano in SQL (colonne come `src.nome`); con tutti i database l'evento `ProcRows(&$rows)` filtra in PHP.
- **Scrittura** (facoltativa): procedure per inserimento, modifica ed eliminazione, con parametri presi dai campi del record, dalla chiave, da valori fissi, dalla sessione o dall'utente; *Parametri dai campi* li prepara. La procedura di inserimento può restituire la nuova chiave come prima colonna del primo risultato. Senza procedure di scrittura l'origine è in sola lettura.

## 6. La tabella: campi, pagine, eventi

Un clic su una tabella apre l'editor, con le schede **Campi**, **Generale**, **Pagine**, **Designer pagine**, **Master-dettaglio**, **Eventi**.

### Campi

Per ogni campo: etichetta (in ogni lingua), dove si vede (lista, vista, nuovo, modifica, ricerca, esportazione, importazione, stampa), ordine. Il doppio clic apre la finestra del campo:

- **Visualizza come** (17 formati): testo, numero, valuta, percentuale, data, data e ora, ora, casella, email (link), link, immagine, file, testo lungo (troncato nella lista), HTML, colore, valore del lookup, codice QR, firma, codice PHP.
- **Modifica come** (19 controlli): casella di testo, area di testo, editor di testo formattato, numero, password, email, data, data e ora, ora, casella/interruttore, menu a tendina, pulsanti di scelta, caselle multiple, completamento automatico, caricamento file, caricamento immagine, selettore colore, firma a mano, sola lettura, nascosto.
- **Lookup**: da un'altra tabella (campo chiave e campo o modello visualizzato, es. `{nome} {cognome}`, condizione, ordinamento), da un elenco fisso di valori, **a cascata** (dipende da un altro campo), selezione multipla, pulsante *aggiungi nuovo* in finestra.
- **Caricamento file/immagini**: nella cartella dei file o nel database (BLOB), tipi ammessi, dimensione massima, più file, miniature e ridimensionamento delle immagini.
- **Validazione**: obbligatorio, valore unico, email, minimo/massimo, lunghezza, espressione regolare con messaggio.
- **Cifrato nel database**: il valore viene salvato cifrato con AES-256-GCM e la chiave del progetto (*Genera la chiave* nella stessa finestra). Nell'app si vede in chiaro; nel registro attività è mascherato. Un campo cifrato non si può cercare né filtrare, e il controllo di unicità non vale. **La stessa chiave deve essere sul server di produzione**: senza, i dati non si leggono più.
- **Valori predefiniti e automatici** (es. `{now}`, `{user}`), anche come codice PHP; **totale** nella lista (somma, media, conteggio, minimo, massimo); **filtro laterale** (pannello filtri con i valori distinti e il loro conteggio).

### Generale

Etichetta e icona della tabella, connessione, chiave primaria, origine (tabella, SQL, REST, procedura con i loro parametri), filtro fisso (WHERE), sola lettura, nascosta dalla home.

### Pagine

Ogni pagina (lista, vista, nuovo, modifica, ricerca, stampa, esportazione, importazione) si attiva o disattiva. Opzioni della **lista**:

- record per pagina, ordinamento predefinito, ricerca rapida, totali, pannello filtri;
- **modifica in linea** (doppio clic su una cella);
- **aggiunta in linea**: pulsante *Aggiungi riga*, una riga di campi sopra la lista per inserire record senza aprire la pagina Nuovo (stessi eventi, validazione e valori predefiniti);
- **modifica selezionati**: gli stessi valori su tutte le righe spuntate;
- nuovo e modifica **in finestra** invece che in pagina;
- **viste alternative**: calendario (campo data), kanban (campo stato, trascinando le schede si cambia stato), galleria (campo immagine), **mappa** (latitudine e longitudine).
  - **Geocodifica**: nella vista Mappa, *Indirizzo per la geocodifica* (un campo o un modello come `{via}, {cap} {citta}`). Le coordinate vengono calcolate al salvataggio, se mancano o se cambia l'indirizzo e l'utente non le ha cambiate. Il pulsante *Geocodifica* sopra la mappa ne calcola 20 alla volta. Il servizio si sceglie in *Impostazioni e stile › Geocodifica*.
- formati di esportazione: CSV, XLSX, JSON, **PDF**.

### Designer pagine

Per ogni pagina, le **sezioni** con i loro campi (trascinabili):

- **Riquadro** o **Scheda**, con 1–4 colonne e larghezza per campo;
- **Passo**: le sezioni di questo tipo diventano una procedura guidata. Nuovo e Modifica mostrano un passo alla volta con *Avanti* e *Indietro*, l'indicatore dei passi in alto, il controllo dei campi obbligatori del passo, e i pulsanti di salvataggio solo all'ultimo passo. Dopo un salvataggio rifiutato la pagina si riapre sul passo con l'errore.
- **Blocchi**: HTML e snippet PHP tra i campi.

### Master-dettaglio

Ricavato dalle chiavi esterne o aggiunto a mano: le tabelle di dettaglio compaiono come schede nella vista e nella modifica del record principale, con icone nella lista.

### Eventi

Codice PHP con editor Monaco, controllo della sintassi e azioni predefinite (es. *mostra solo i record dell'utente*). Elenco completo in [RIFERIMENTO.md](RIFERIMENTO.md#eventi). Anche eventi JavaScript (per pagina) e **pulsanti personalizzati** con codice prima, sul server e dopo.

### API

Per ogni tabella si può pubblicare un'**API REST** (elenco, lettura, inserimento, modifica, eliminazione) con chiave API personale; la descrizione **OpenAPI** è in `index.php?p=api&openapi=1`.

## 7. Menu

Albero di voci: tabelle (pagina lista, nuovo…), report, grafici, dashboard, collegamenti esterni (anche in nuova finestra), gruppi, separatori e intestazioni, con icone Bootstrap Icons. *Editor menu* è anche nella barra di Tabelle e query.

## 8. Sicurezza

**Login obbligatorio** attiva la protezione. *Origine utenti*:

| Origine | Uso |
|---|---|
| **Tabelle di sistema gestite** (consigliato) | utenti nelle tabelle `mc_*`, gestiti dall'app |
| **Tabella utenti esistente** | si indicano tabella e campi (utente, password, email, nome, gruppo, attivo); password bcrypt/argon, MD5 o in chiaro |
| **Un solo utente fisso** | per applicazioni personali |
| **Windows (NTLM, come R-LAB)** | il server web autentica l'utente Windows (vedi sotto) |

**Gruppi e permessi**: per ogni gruppo e tabella le lettere **A** aggiungi, **E** modifica, **D** elimina, **S** elenco/ricerca, **V** visualizza, **P** stampa/esporta, **I** importa. Gli amministratori hanno tutto. Con i **permessi dinamici** gruppi e permessi si gestiscono dall'app. **Record per utente**: ognuno vede solo i propri record (campo proprietario). **Accesso ospiti**: chi non ha fatto login usa i permessi del gruppo Ospiti.

**Regole**:

- registrazione degli utenti (con conferma email e gruppo dei nuovi utenti);
- recupero della password via email;
- CAPTCHA su login e registrazione;
- regole della password (lunghezza, numero, maiuscola, simbolo);
- blocco di 15 minuti dopo N tentativi falliti;
- scadenza della sessione dopo N minuti di inattività;
- **«Ricordami» (giorni)**: casella nella pagina di accesso; il browser resta collegato anche dopo la chiusura. Il cookie viene rinnovato a ogni uso; un cookie copiato e riusato scollega l'utente da tutti i dispositivi; *Esci* lo cancella.
- **Verifica in due passaggi**: codice TOTP da Google/Microsoft Authenticator, configurato dall'utente nel profilo; facoltativa o obbligatoria. *Codice per chi non ha l'app*: a ogni accesso un codice a 6 cifre via **email** o **SMS** (valido 5 minuti, 5 tentativi, nuovo invio dopo 30 secondi). Il telefono si imposta nel profilo, dall'amministratore nella pagina Utenti o con l'evento `TwoFactorPhone`.

**Provider esterni**:

- **LDAP / Active Directory**: credenziali di dominio, utente creato al primo accesso (serve `php-ldap`);
- **OpenID Connect** (Okta, Entra ID, Google, Keycloak…): più provider, mappatura dei gruppi;
- **SAML 2.0** (ADFS, Entra ID, Okta, Shibboleth): firma verificata, metadati in `?p=saml&metadata=1`.

**Accesso Windows (NTLM)**, come nei progetti R-LAB: il server web (Apache con `mod_authn_ntlm` su Windows, o `mod_auth_gssapi` su Linux) autentica l'utente e passa `REMOTE_USER`. L'app normalizza il nome (`DOMINIO\utente` → `UTENTE@suffisso`), legge gruppi e area da `rlab_profilazione_gruppo`, il nome da `rlab_venditori`, i permessi per pagina `R:W:L` da `rlab_profilazione_permission`, e scrive un registro degli accessi (`rlab_accessi`). Tabelle e colonne sono configurabili; in Amministrazione ci sono *Utenti Windows* e *Permessi pagine*.

## 9. Eventi globali e assistente AI

Eventi dell'applicazione: avvio, prima e dopo il login, login fallito, registrazione, logout, telefono per la verifica in due passaggi, più le **attività pianificate** (`Task_<nome>`).

**Assistente AI** (Claude): nell'editor degli eventi scrive o modifica il codice conoscendo tabelle e campi del progetto, e ne controlla la sintassi con `php -l`. La chiave API viene salvata cifrata nel portachiavi del sistema.

## 10. Report, grafici e dashboard

**Report**:

- tabella o query, **raggruppamenti** (anche per anno, trimestre, mese, settimana, giorno, iniziale, decine), **totali** per gruppo e generali, righe di dettaglio;
- esportazione XLSX e stampa;
- **campi incrociati (crosstab)**: le colonne diventano i valori di un campo (es. i mesi o le aree), le righe sono i raggruppamenti. Ogni cella mostra i totali; ci sono i totali di riga, di colonna e generale. Un clic su una cella apre la lista filtrata su quella riga e quella colonna.

**Grafici** (Apache ECharts): colonne, barre, linee, aree, dispersione, torta, ciambella, rosa, imbuto, treemap, gauge, radar; serie multiple, impilamento, ordinamento per valore. Un clic su barra, punto o fetta apre la lista filtrata su quel valore o periodo. Le personalizzazioni AnyChart dei progetti phpr (`JS_ModifyChart`) vengono tradotte su ECharts.

**Dashboard**: conteggi, indicatori (somma/media di un campo), grafici, report, liste e blocchi HTML in una griglia.

**Report & Chart Builder** web (opzione del progetto): gli utenti dell'app creano report e grafici propri, rispettando i loro permessi, e li possono condividere.

## 11. Impostazioni e stile

In alto il riepilogo del progetto (titolo, lingue, menu, tema, funzioni attive, attività, tema grafico); a sinistra sei categorie: **Generale**, **Aspetto**, **Funzioni** (riquadri con interruttore), **Automazione**, **Comunicazione**, **Mappe**. L'ultima categoria aperta viene ricordata.

- **Generale**: titolo dell'applicazione (per lingua), lingue, lingua predefinita, pagina iniziale.
- **Formati**: data, separatori dei numeri, valuta, fuso orario.
- **File caricati**: cartella (relativa all'app o assoluta) e dimensione massima.
- **Stile**: colore principale, menu (barra laterale o in alto), tema chiaro/scuro/automatico, densità. Il logo è il file `custom/logo.png` del progetto.
- **Temi grafici da template acquistati**: *Importa template…* riconosce **Metronic 8**, **Cork 3 / Equation 2**, **Satria** (pagine di accesso e presentazione), **Slim**, **Webarch** e **Material Design Admin**, con le loro varianti. Copia solo CSS, JS e font nella libreria locale `~/.config/MiB-Crude/themes`: i file dei template non entrano mai nel progetto né in MiB-Crude, per le licenze. *Gli utenti possono cambiare l'aspetto del tema*: con Material (colori), Webarch (colori) e Slim (menu laterale o orizzontale) ogni utente sceglie dal pulsante con la tavolozza nell'intestazione, e la scelta resta nel suo browser. Con **Equation** l'app prende anche lo stile delle pagine del template, in chiaro e in scuro: indicatori del cruscotto e schede della home come i widget di Equation (icona nel cerchio colorato, titolo colorato, numero grande), grafici con la tavolozza, il carattere Nunito, griglia tratteggiata, aree sfumate, barre arrotondate e ciambella con il totale al centro, menu «…» sulle schede dei grafici (*Scarica immagine*, *Apri il grafico*), tabelle con l'intestazione colorata, paginazione a pillole e pagina di accesso nel riquadro centrato del template.
- **Intestazione, piè di pagina e menu**: un file della cartella `public/` del progetto (come gli *include* di phpr) o codice HTML/PHP scritto qui; si può nascondere l'intestazione o il piè standard; il menu può sostituire o affiancare quello generato. Vale per tutti i temi.
- **Pagina di presentazione** pubblica con i pulsanti Accedi/Registrati.
- **Funzioni avanzate**:
  - registro attività (audit) di accessi, inserimenti, modifiche ed eliminazioni;
  - blocco dei record durante la modifica;
  - API REST (con l'origine CORS ammessa);
  - Report & Chart Builder, con i gruppi autorizzati;
  - prefisso delle tabelle di sistema (predefinito `mc_`);
  - notifiche (campanella);
  - ricerche salvate;
  - **app installabile (PWA)**: manifest, icona (logo o iniziali sul colore principale) e service worker. Il browser propone «Installa app», l'app si apre a schermo pieno; senza rete compare un messaggio. Serve https (o localhost).
- **Attività pianificate**: codice PHP a orari fissi. Per ognuna nome, titolo, quando (scelte pronte o espressione cron `minuto ora giorno mese giorno-della-settimana`) e attiva/disattiva. Il codice è l'evento `Task_<nome>(&$message)`: `return false` o un'eccezione = errore, `$message` compare nell'esito. L'app generata contiene `cron.php`, che il sistema deve lanciare ogni minuto (vedi [APP-GENERATA.md](APP-GENERATA.md#attività-pianificate)). In Amministrazione: prossima e ultima esecuzione, esito, durata ed *Esegui ora*.
- **Modelli email**: oggetto e testo HTML per lingua per la conferma della registrazione, il recupero della password e il codice di accesso, più modelli propri da inviare con `sendTemplate('nome', $destinatario, ['campo' => valore])`. Segnaposto `{campo}`, `{app}`, `{date}`, `{user}`; i valori vengono inseriti come testo (HTML protetto).
- **SMS**: Twilio, un gateway HTTP qualsiasi (indirizzo e corpo con i segnaposto `{to}` `{text}` `{from}` `{password}`, GET o POST, modulo o JSON, testo atteso nella risposta) o un file di prova. Si usa con `sendSms()`, `runner_sms()` e per i codici di accesso.
- **Geocodifica**: OpenStreetMap Nominatim (gratuito, anche un server aziendale, paesi) o Google Geocoding API (chiave).
- **Email (SMTP)**: mittente, server, porta, utente; la password resta sul computer. Senza server si usa `mail()` di PHP.

## 12. Lingue

Lingue dell'applicazione (italiano e inglese incluse, altre aggiungibili), traduzione di ogni testo dell'interfaccia e delle etichette del progetto. Nell'app l'utente cambia lingua dall'intestazione.

## 13. Genera e pubblica

- **Genera**: scrive l'applicazione nella cartella di output (`.mibcrude-local/output` o una cartella scelta). Rigenerare non perde nulla: il codice scritto a mano vive nel progetto (`events/`, `custom/`, `public/`).
- **Anteprima**: PHP locale o Docker; browser integrato. Con l'accesso Windows l'anteprima simula l'utente (l'«utente simulato» del progetto o il tuo utente del computer), perché il server di prova non autentica.
- **Pubblicazione**: incrementale via **SFTP**, **FTP/FTPS** o **cartella** (solo i file cambiati); profili salvati sul computer.
- **Docker di progetto**: un ambiente come la produzione.
  - **Linux**: Apache di Debian 12/13 o Ubuntu 22.04/24.04, PHP-FPM 7.4–8.5, MariaDB 10.4–11.8 (o database esterno), script SQL iniziale, porte. L'app viene generata in `docker/app` con la connessione principale verso il contenitore del database.
  - **Windows Server Core** 2019/2022/2025: l'Apache24 del server di produzione (stessi moduli del suo httpd.conf), PHP 8 come modulo di Apache, MariaDB per Windows. Serve un host Windows con i contenitori Windows.
  - Con l'**accesso Windows** Apache è configurato come il httpd.conf di produzione (utente valido, anonimi esclusi, intestazione `X_ISRW_PROXY_AUTH_USER`, percorsi esclusi): utente simulato senza dominio, oppure dominio Active Directory (Linux: `mod_auth_gssapi` + winbind, unione al dominio; Windows: `mod_authn_ntlm` con gMSA).
  - Prima di avviare, MiB-Crude controlla che il Docker del computer esegua lo stesso tipo di contenitori (Linux o Windows).

## 14. Team e versioni

- **Git**: il progetto è fatto di file JSON/PHP piccoli e ordinati, quindi diff leggibili e merge puliti. Il pannello fa commit, pull, push, diff e risoluzione dei conflitti.
- **Server del team** (tempo reale): chi apre una tabella, il menu, la sicurezza o gli eventi globali li **blocca** per gli altri; ogni salvataggio arriva subito agli altri designer; presenza online, chat, rilevamento dei conflitti, storico Git sul server.

```bash
npm run server -- --data ./team-data                                              # ws://0.0.0.0:7300
node server/mibcrude-server.cjs --data ./team-data --add-user mario --role admin  # crea un utente, stampa il token
```

## 15. Importazione di progetti .phpr

*Importa progetto .phpr* legge il file `.phpr` (phpr 10.x) e l'archivio delle pagine `PAGES*.sqlite`. Converte:

- connessioni, tabelle, query SQL, campi, lookup (anche a cascata);
- pagine e campi per pagina, master-dettaglio, menu, gruppi e permessi, grafici;
- eventi PHP e JavaScript, pulsanti personalizzati, varianti di pagina, dashboard.

Gli eventi funzionano senza riscriverli grazie allo strato di compatibilità (`DB::Query`, `DB::Lookup`, `Security::getUserName()`, `$pageObject`, `$xt`, `runner_mail`…). Il codice PHP 7.4 viene adeguato a PHP 8 (correzioni sicure automatiche, il resto in `import-phpr/REPORT.md`). Con *URL in stile phpr* l'app risponde anche a `tabella_list.php`, `tabella_edit.php?editid1=…`.

### Più progetti phpr in un'unica applicazione

Due modi:

- nella schermata iniziale, *Importa progetto .phpr › Altri .phpr da unire*: il primo file crea il progetto, gli altri vengono uniti;
- con un progetto aperto, *Tabelle e query › Unisci .phpr* (anche più file insieme). L'unione si annulla con Ctrl+Z finché non si salva.

Regole dell'unione (niente del progetto viene sovrascritto):

- **connessioni**: stesso server, porta, database e utente = una sola connessione; le altre si aggiungono (con le password, solo in locale);
- **tabelle con lo stesso nome**: *Automatico* le condivide se leggono la stessa tabella dello stesso database, altrimenti le importa con un prefisso (il nome del progetto); oppure *Usa sempre quella già presente* o *Importa sempre con un prefisso*. Con la rinomina si aggiornano lookup, master-dettaglio, report, grafici, dashboard, menu e permessi;
- **menu**: le voci di ogni progetto finiscono sotto un'intestazione con il suo nome; le tabelle condivise già presenti nel menu non si ripetono;
- **sicurezza**: gruppi con lo stesso codice = stesso gruppo, i permessi si sommano; il tipo di accesso resta quello del progetto (con avviso se diverso);
- **eventi**: quelli mancanti si aggiungono; se lo stesso evento esiste già con codice diverso resta quello del progetto e l'altro viene salvato in `import-phpr/<nome>/eventi-in-conflitto/` da unire a mano;
- **report, grafici, dashboard** con nome già usato vengono rinominati (`_2`); **lingue** e testi si aggiungono; i file di `custom/` e `public/` si copiano se non esistono già.

Il rapporto di ogni unione è in `import-phpr/<nome>/UNIONE.md`, insieme al rapporto di importazione del progetto unito.

## 16. L'applicazione generata

Per l'utente finale:

- **Home** con le schede delle tabelle e i conteggi; menu laterale o in alto; modalità chiara/scura; lingua.
- **Liste**:
  - ricerca rapida, ricerca avanzata (uguale, contiene, inizia con, maggiore, minore, tra, vuoto…), pannello filtri, ordinamento, colonne visibili, totali;
  - selezione multipla per eliminare o *modificare selezionati*;
  - **ricerche salvate** (menu *Ricerche salvate*: si salva la ricerca attuale con un nome, gli amministratori possono condividerla);
  - modifica e aggiunta in linea, viste alternative;
  - esportazione CSV/XLSX/JSON/**PDF**: il PDF contiene caratteri di quasi tutte le lingue, compresi cinese, giapponese, arabo, ebraico e tailandese; dal record anche le immagini.
- **Moduli** con validazione, lookup, caricamenti, firma, passi; copia di un record; blocco durante la modifica.
- **Profilo**: password, verifica in due passaggi, telefono per gli SMS, chiave API.
- **Notifiche** (campanella), **Report & Chart Builder**, **pulsante tavolozza** per l'aspetto del tema, **app installabile**.
- **Amministrazione** (amministratori):
  - utenti (con sblocco, azzeramento della verifica in due passaggi, telefono);
  - **Accedi come**: l'icona con gli occhiali usa l'app con i permessi di quell'utente; *Torna a…* nell'intestazione riporta all'amministratore; inizio e fine finiscono nel registro;
  - gruppi e permessi (se dinamici), registro attività, notifiche, attività pianificate, utenti e permessi Windows (accesso NTLM).
