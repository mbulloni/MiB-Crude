# Roadmap

Stato v0.24.1 (2026-11-24): liste con tutte le righe visibili (correzione del CSS),  viste unite di più tabelle (join scelte a clic, senza SQL),  relazioni del diagramma create trascinando i campi,  tutte le pagine personalizzabili (pagine di sistema e pagine di tabella),  tabelle su Fabric in sola lettura,  anteprima delle pagine con dati di Fabric tramite l'account personale (token temporaneo),  SQL Server e Microsoft Fabric Warehouse (accesso Entra, dialetto DDL corretto sul server vero, Fabric solo come origine dati), documentazione per Linux e Windows (v0.20.0),  roadmap iniziale completa (v0.2.0), origini REST complete (v0.3.0), temi Slim e Webarch (v0.4.0), correzione import eventi (v0.4.1), skin scura Webarch (v0.4.2), tema Material Admin (v0.5.0), riconnessione al server del team (v0.5.1), filtri REST all'API e strato AnyChart completo (v0.6.0), modifica selezionati, notifiche, clic sui grafici e PDF (v0.7.0), intestazione/piè/menu del progetto, accesso Windows NTLM e Docker di progetto (v0.8.0), Docker su Windows con Apache24 di produzione e mod_authn_ntlm (v0.9.0), controllo del sistema dei contenitori prima di avviare (v0.9.1), stored procedure, ricerche salvate, attività pianificate, modelli email, SMS e codice di accesso, geocodifica, annulla/ripeti, cerca nel progetto, PDF Unicode, filtri REST per sintassi, aspetto scelto dall'utente (v0.10.0), crosstab, aggiunta in linea, pagine a passi, campi cifrati, Ricordami, PWA, Accedi come (v0.11.0), scrittura e filtri delle stored procedure, colore di Webarch scelto dall'utente, PDF in cinese/giapponese/arabo/ebraico/tailandese, documentazione completa (v0.12.0), impostazioni del progetto riorganizzate (v0.12.1), tutto il designer riorganizzato (v0.12.2), Tabelle e query allineato (v0.12.3), anteprima con accesso Windows simulato (v0.12.4), visualizza dati nel designer (v0.12.5), stile Equation per cruscotti, grafici, liste e accesso (v0.13.0), creazione di dashboard, report e grafici di nuovo funzionante (v0.13.1), più progetti .phpr in un'unica applicazione (v0.14.0), nessun riferimento a marchi di terzi (v0.14.1); restano i limiti sotto.

## Fatto (v0.24.1, 2026-11-24)
- **Correzione delle liste**: la regola `.mc-grid` (griglia a 12 colonne, righe da 40 px, per le pagine a layout libero, dalla v0.15.0) colpiva anche la tabella delle liste, che ha la stessa classe: la tabella diventava una griglia e l'area scorrevole restava alta una riga (se ne vedeva una su venti). Ora la regola è `.mc-grid:not(table)`; il test `tests/listgrid.test.cjs` fallisce senza la correzione. Le app generate prima vanno rigenerate (il CSS è copiato nell'app).
- **Verificato su POLARIS**: una vista unita di quattro tabelle (join sinistre) risponde e si pagina (4.744.830 righe: le join uno-a-molti moltiplicano le righe, per cliente un record per ambito e per contratto).

## Fatto (v0.24.0, 2026-11-24)
- **Vista unita** (*Tabelle e query → Vista unita*): una origine dati di sola lettura che unisce **due o più tabelle** dello stesso database, per chi non scrive SQL. Si sceglie la tabella di partenza; le tabelle collegate da una relazione del diagramma compaiono accanto, una scheda ciascuna, e **entrano nella vista quando si spunta un loro campo** (collegamento preso dalla relazione, modificabile; per ogni tabella *tutti i record di X* o *solo con corrispondenza*). Le colonne senza spunta non compaiono né in liste, ricerca, esportazioni e report; il nome visibile è modificabile. Tabelle senza relazione si aggiungono a mano. L'SQL è generato nel progetto (`core/joinview.cjs`, definizione in `source.join`, SQL in `source.sql`): nel database non si crea nulla, quindi vale anche su Fabric. Riapribile da *Modifica vista unita*. Le definizioni a due tabelle della prima versione si leggono ancora.
- **Relazioni trascinando i campi**: nel diagramma si trascina un campo su un campo di un'altra tabella e si sceglie *Master-dettaglio* oppure *Vista unita* (solo record in entrambe / tutti quelli della prima), con il dialogo già compilato. I riquadri mostrano tutti i campi in una lista scorrevole con ricerca (utile con le 533 colonne di `poste_salesproduct`).
- **Eliminare una relazione dal diagramma**: clic sulla linea → *Elimina la relazione*. Le viste unite sono disegnate con linee tratteggiate verso le loro tabelle.
- Correzione: ogni canale IPC gestito in `electron/main.cjs` deve essere nell'elenco del preload (altrimenti «Unknown channel»); un test lo controlla (`tests/joinview.test.cjs`).
- Non provata su Fabric: l'anteprima e la creazione della vista usano la stessa routine delle query SQL (`describeQuery`), mai verificata su un warehouse. Test su SQLite con tre tabelle (stella e catena, join sinistre) e sui cinque dialetti più Fabric.

## Fatto (v0.23.0, 2026-11-16)
- **Fasi 2 e 3 del design di tutte le pagine**: **Ricerca avanzata, Stampa e Importa** di ogni tabella si disegnano nel Designer pagine come Nuovo/Modifica/Visualizza (blocchi della pagina, blocchi liberi, snippet PHP, CSS, JavaScript; `SysPage::showTable`); **Esporta ed Elimina** (senza pagina propria) hanno i testi modificabili. Le pagine di sistema comprendono ora anche **Codice di verifica in due passaggi, Configurazione iniziale e Amministrazione** (titolo, menu delle sezioni, contenuto). Tabella «Testi e etichette» per ogni pagina (`TextsSection`, override di `proj.lang`).
- L'aspetto standard è invariato: HTML confrontato con quello del runtime precedente su ricerca, stampa, importazione, configurazione iniziale e le sezioni utenti, registro e notifiche dell'amministrazione.

## Fatto (v0.22.0, 2026-11-16)
- **Pagine di sistema personalizzabili** (fase 1 del design di tutte le pagine): Accesso, Registrazione, Password dimenticata, Nuova password, Profilo e Home sono divise in blocchi (`runtime/views/partials/sys/`) e si disegnano nella nuova voce *Pagine di sistema*: griglia libera con i blocchi della pagina più testo, codice, immagine, pagina web e pulsante, CSS e JavaScript di pagina, testi per lingua (override di `proj.lang`). Senza design l'HTML è identico a prima (confrontato byte per byte con il runtime precedente).
- Le pagine di tabella e l'amministrazione sono arrivate nella v0.23.0.

## Fatto (v0.21.1, 2026-11-16)
- **Tabelle su Microsoft Fabric in sola lettura (per ora)**: il runtime disattiva inserimento, modifica, eliminazione, importazione, modifica in linea e modifica dei selezionati per le tabelle su una connessione Fabric (`Table::isReadOnly`, `writeTable()` nullo); il generatore avvisa una volta per connessione; nel pannello Connessioni la connessione Fabric non si può scegliere come principale.
- Verificato con il PHP locale 8.5 e `pdo_sqlsrv` 5.13.3 (compilato da PECL): anteprima del designer su POLARIS, 975.810 righe. Ogni richiesta dell'elenco richiede 14-38 s su questa tabella (Fabric: ~6 s per un `COUNT(*)`, ~6,5 s per una pagina, ricerca su più colonne più lenta).

## Fatto (v0.21.0, 2026-11-16)
- **Anteprima con dati di Fabric usando il tuo account personale** (MFA): premendo *Anteprima* il designer ottiene un token Entra e lo passa al PHP dell'anteprima come variabile d'ambiente (mai su file né nella riga di comando, anche con Docker); `Db.php` si collega con `AccessToken`. Il token dura circa un'ora. La pubblicazione continua a rifiutare l'account personale (serve il service principal); `deploy:run` pure.
- **Connessioni Fabric dall'app PHP**: il DSN imposta `MultipleActiveResultSets=false` (il driver PHP attiva MARS di default e Fabric rifiuta la connessione con un errore generico «ODBC operation failed», anche con service principal).
- **Scope del token corretto**: `https://database.windows.net/.default` con una sola barra (con due il destinatario del token cambia e il server lo rifiuta).
- Provato end-to-end su POLARIS: progetto con principale SQLite e POLARIS con account personale; generazione per anteprima, pubblicazione rifiutata, anteprima in Docker (PHP 8.3, `pdo_sqlsrv` 5.13, ODBC 18), pagina elenco di `STG_CLIENTE_COMMERCIALE` con 975.801 righe: paginazione, ricerca (152.815 risultati per «SRL») e ordinamento.

## Fatto (v0.20.1, 2026-11-16)
Correzione della v0.20.0 dopo la prova su un warehouse Fabric vero (sola lettura per tutto, scrittura rifiutata dai permessi dell'account: i messaggi di sintassi del server sono comunque attendibili):
- **Dialetto Fabric riscritto**: `CREATE TABLE` senza `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE` né `DEFAULT` (Fabric li rifiuta nel `CREATE TABLE`; i default non esistono nemmeno con `ALTER`); le chiavi vengono aggiunte dopo con `ALTER TABLE … ADD CONSTRAINT … NOT ENFORCED` (`DDL.createStatements`, usato da designer, script SQL e modelli); `BIGINT IDENTITY` nella forma documentata.
- **Fabric non può essere la connessione principale** (la generazione lo rifiuta con un messaggio): le tabelle di sistema non si possono creare lì. Rimossi il codice Fabric di `Schema.php` e il controllo di unicità utenti della v0.20.0, che non servono più. Fabric resta utilizzabile come **origine dati** accanto a una principale su MariaDB, PostgreSQL o SQL Server.
- **Inserimento su Fabric**: niente `OUTPUT`, `SCOPE_IDENTITY()`, `@@IDENTITY`, `IDENT_CURRENT` né `INSERT … DEFAULT VALUES` (tutti non supportati dal server): `Db::insert` fa un `INSERT` semplice e non restituisce la chiave generata.
- **Designer**: timeout delle richieste SQL Server portato a 120 s (il predefinito di 15 s interrompeva le scansioni di tabelle da quasi un milione di righe).
- Verificato in lettura su POLARIS: accesso Entra (browser/MFA), `CAST … NVARCHAR`, `COUNT(*)`, paginazione `ORDER BY (SELECT NULL) OFFSET/FETCH`, ricerca `LIKE`, `CONCAT`, `TOP` su sottoquery, elenco e struttura delle tabelle, `sys.foreign_keys`, `COLUMNPROPERTY`.
- Non verificato (l'account non può creare tabelle): `BIGINT IDENTITY`, `ALTER TABLE … ADD CONSTRAINT … PRIMARY KEY NONCLUSTERED … NOT ENFORCED`, il comportamento dei duplicati con le chiavi non imposte; accesso Entra dall'app PHP (serve `pdo_sqlsrv` con ODBC Driver 17/18 e un'app registrata).

## Fatto (v0.20.0, 2026-11-16)
- **SQL Server e Microsoft Fabric Warehouse**: la connessione sceglie l'accesso (utente SQL, **Microsoft Entra service principal**, **account personale con MFA** solo per il designer); la cifratura è sempre attiva con Entra; il flag `encrypt` ora arriva davvero all'app generata (prima veniva scartato dal generatore).
- **Accesso con account personale** nel designer: browser di sistema o codice dispositivo, cache del token cifrata, «Esci dall'account»; la generazione dell'app è rifiutata se la connessione lo usa (l'app non ha un browser per l'MFA).
- **Documentazione e pacchetti per Linux e Windows**: README, guida, CLAUDE.md e test aggiornati; `npm run dist` (AppImage, .deb) e `npm run dist:win` (installer NSIS, zip).
- Nota: in questa versione il dialetto DDL Fabric, le tabelle di sistema su Fabric e il controllo di unicità utenti erano sbagliati (non verificati sul server): corretti o rimossi nella v0.20.1.

## Fatto (v0.19.0, 2026-11-14)
- **Campo come filtro nella Lista**: nel layout libero della Lista il blocco **Campo** sceglie un campo della tabella e ne fa un filtro (ricerca avanzata `s[campo]`: contiene, uguale, tra per le date…) da posizionare dove si vuole; il campo viene spuntato «Ricerca» da solo.

## Fatto (v0.18.1, 2026-11-14)
- **Designer della Lista come schema della pagina**: bande con gli elementi (titolo, ricerca rapida/avanzata, pannello filtri, pulsanti Nuovo/Aggiungi riga/Elimina/Modifica selezionati/Esporta/Stampa/Importa, tabella con le colonne, totali, paginazione); clic su un elemento per le proprietà, × lo toglie, + lo rimette. Il layout libero (blocchi intorno alla lista) è nella sezione «avanzato».
- L'elenco dei campi di Lista, Ricerca, Esporta, Importa e Stampa non è più duplicato nel Designer pagine: si sceglie solo nella scheda Campi.

## Fatto (v0.18.0, 2026-11-14)
- **Design della pagina Lista**: stesso editor a griglia delle altre pagine, con due blocchi propri, **Barra comandi** (titolo e pulsanti) ed **Elenco record** (la lista della tabella, con filtri, viste e paginazione), più tutti gli altri blocchi (testi, grafici, indicatori, codice…) sopra, sotto o accanto; le colonne si scelgono sotto l'editor. Senza design resta la lista standard. Le liste incorporate (dettagli, dashboard) non usano il design.
- **Ripristina standard** in ogni scheda del Designer pagine: scarta il design personalizzato (blocchi, CSS, JavaScript) e torna al layout standard; nelle pagine con scelta dei campi rimette i campi di default.

## Fatto (v0.17.1, 2026-11-14)
- **Stessi elementi delle pagine nel design delle tabelle**: Modifica/Nuovo/Visualizza hanno gli stessi blocchi (Indicatore, Campo, Grafico, Tabella, Report, Testo, Codice, Immagine, Pagina web, Pulsante, Snippet PHP), la Guida, «Applica ad altre pagine» e le schede Stile (CSS) e JavaScript (con `mcPage`). Il runtime usa lo stesso codice delle dashboard (`partials/dash_block.php`, `Reports::resolveItem`).

## Fatto (v0.17.0, 2026-11-14)
- **Design delle pagine unico**: Modifica/Nuovo/Visualizza di una tabella usano lo stesso editor a griglia libera delle pagine e dashboard (blocchi Campo, Testo, Immagine, Codice, Pagina web, Pulsante, Snippet PHP). Il layout a sezioni esistente si converte da solo alla prima apertura (titoli di sezione → testo, campi collocati per larghezza); i campi non collocati compaiono comunque in fondo al modulo.
- **Copia su altre pagine**: dal designer della tabella, scelta di tutte o solo alcune pagine (della stessa tabella o di altre; sulle altre solo i campi con lo stesso nome), sostituendo o aggiungendo in fondo. «Disposizione automatica» rimette il layout automatico.
- Limite: schede (tab) e passi (Avanti/Indietro) non esistono nel layout a griglia; i layout che li usavano perdono quel comportamento alla conversione (restano finché non si apre il designer).

## Fatto (v0.16.2, 2026-11-14)
- **Designer pagine**: «Sezione» aggiunge la nuova sezione in cima; i blocchi di testo/HTML mostrano l'anteprima; nuovo blocco **Immagine** nella tavolozza.

## Fatto (v0.16.1, 2026-11-14)
- **Designer pagine**: una scheda per ogni pagina attiva della tabella (Lista, Visualizza, Nuovo, Modifica, Elimina, Ricerca avanzata, Esporta, Importa, Stampa). Modifica/Nuovo/Visualizza hanno il disegno a sezioni; le altre la scelta dei campi della pagina.

## Fatto (v0.16.0, 2026-11-14)
- **Pagine e dashboard**: wizard «Nuovo» con cinque punti di partenza, guida a passi nell'editor (`PageHelp.tsx`) con esempi di JavaScript e aiuti per ogni blocco, **Applica ad altre pagine** (CSS, JavaScript, titolo, blocchi). Provati nel designer (trascinamento, wizard, propagazione).
- **Designer pagine delle tabelle**: il layout automatico mostra la distribuzione dei campi, «Modifica la distribuzione» crea la sezione da cui partire, istruzioni d'uso sopra la griglia.

## Fatto (v0.15.1, 2026-11-14)
- Editor di pagine: pannello delle proprietà più largo con campi su una colonna, riepilogo dei blocchi senza duplicati, «1 pagina» al singolare; indicatori delle pagine a griglia su una riga (testo adattato alla larghezza). Screenshot nel README.
- **Build per Windows**: `npm run dist:win` (installer NSIS per utente e zip portatile, x64, cross-compilata da Linux con wine; `npmRebuild` disattivato per i moduli nativi opzionali). Nata dopo la versione Linux, da cui è partito il progetto; dalla v0.20.0 documentata insieme a quella Linux. Gli aggiornamenti integrati su Windows sono manuali (si apre la pagina della release).

## Fatto (v0.15.0, 2026-11-14)
- **Dashboard e Pagine a layout libero**: editor a griglia di 12 colonne con trascinamento e ridimensionamento (`PageBuilder.tsx`), blocchi Indicatore, Campo, Grafico, Tabella, Report, Testo, Codice (HTML/JS non filtrato), Immagine, Pagina web, Pulsante; CSS e JavaScript di pagina con l'API `mcPage`. Nuova voce *Pagine* (dashboard con `page: true`: menu, permessi e URL invariati). Le dashboard esistenti si convertono alla griglia all'apertura; senza posizioni il runtime le mostra a flusso come prima. Provato in tests/e2e.test.cjs.

## Fatto (v0.14.1, 2026-11-01)
- Nessun nome di prodotti di terzi nell'interfaccia, nella documentazione e nel codice: si parla di progetti `.phpr` e di URL classici. Opzione `classicUrls` (i progetti salvati con il nome precedente vengono convertiti all'apertura), `runtime/classic-route.php`, note di importazione in `import-phpr/`.

## Fatto (v0.14.0, 2026-11-01)
- Più `.phpr` in un'unica applicazione: *Altri .phpr da unire* nell'importazione iniziale e *Tabelle e query › Unisci .phpr* nel progetto aperto (`core/merge.cjs`): connessioni allo stesso database condivise, tabelle omonime condivise o rinominate con tutti i riferimenti, menu sotto un'intestazione per progetto, gruppi e permessi sommati, eventi in conflitto salvati a parte, rapporto `UNIONE.md`.

## Fatto (v0.13.1, 2026-11-01)
- Corretto: «Nuovo» in Dashboard, Report e Grafici e «Vista personalizzata» non facevano niente (`prompt()` non esiste in Electron): ora il nome si chiede in una finestra del designer. Editor delle dashboard leggibile anche nei riquadri da 1/4.

## Fatto (v0.13.0, 2026-11-01)
- Tema Equation: CSS proprio di MiB-Crude ispirato al template (chiaro e scuro) per indicatori del cruscotto e home a widget, schede con titolo e menu «…», tabelle, pulsanti, badge, paginazione, moduli e pagina di accesso; grafici ECharts in stile Equation (tavolozza, Nunito, griglia tratteggiata, aree sfumate, barre arrotondate, ciambella con totale); niente più barra di scorrimento orizzontale inutile nei temi DesignReset.

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
12. Eventi JavaScript dei progetti importati (API client `pageObj`, `Runner.*`), eventi dei grafici `JS_ModifyChart` (strato AnyChart su ECharts).
13–16. Varianti di pagina come viste, dashboard, sezioni e layout delle pagine, `$xt`/`hideItem` con effetto.
18. Pulsanti personalizzati dei progetti importati (OnBefore/OnServer/OnAfter).
19. Import/export tabelle in ZIP; origini dati REST.

## Fatto (v0.3.0, 2026-10-31)
- Origini REST complete (2026-10-31): paginazione dell'API (numero di pagina o scostamento, totale, ricerca e ordinamento delegati all'API), lookup verso tabelle REST da tabelle SQL e REST (anche a cascata, modello `{campo} ({campo})`), pannello filtri, controllo valori unici, importazione, report, grafici e dashboard su origini REST; paginazione modificabile anche dopo la creazione (scheda Generale della tabella).

## Fatto (v0.4.0, 2026-10-31)
- Adattatori temi Slim (Bootstrap 4: tolto il Bootstrap incluso in slim.css, skin scura limitata a `[data-bs-theme=dark]`, menu laterale o orizzontale) e Webarch (Bootstrap 3: quattro temi colore, menu compatto, menu utente anche su mobile), con JavaScript proprio al posto di jQuery/Bootstrap 3-4 dei template (2026-10-31).

## Fatto (v0.4.1, 2026-10-31)
- Import progetti .phpr: una parola rimasta in fondo a un evento (errore di sintassi già nel progetto originale, es. `BeforeMoveNext` di "Dettaglio Gruppo") viene rimossa e segnalata nel report, solo se è l'unico errore (2026-10-31).

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
- **Modifica selezionati** ("Update selected"): pulsante nella lista, campi da cambiare scelti con una spunta, ogni record passa da blocco, validazione, eventi BeforeEdit/AfterEdit, valori automatici e registro attività; opzione della pagina lista nel designer.
- **Notifiche** (come nella versione 10.7 dei progetti .phpr): `addNotification($message, $title, $icon, $url, $expire, $user, $newWindow)`, campanella nell'intestazione di tutti i temi, sezione Amministrazione › Notifiche; tabelle di sistema `mc_notifications` e `mc_notif_seen` (schema 3) provate su MariaDB, PostgreSQL, SQLite, SQL Server e Oracle.
- **Grafici con clic**: barra, punto o fetta aprono la lista filtrata (valore esatto o intervallo di date di anno, trimestre, mese, settimana, giorno).
- **PDF**: formato di esportazione della lista (A4, orizzontale se servono più colonne, intestazione su ogni pagina) e pulsante PDF nella vista del record; generatore PHP senza dipendenze, caratteri Windows-1252 (accenti italiani, €).

## Fatto (v0.8.0, 2026-10-31)
- **Intestazione, piè di pagina e menu** del progetto: file della cartella public/ (come gli include dei progetti .phpr, es. k-nav-bar-top.php) o codice HTML/PHP scritto nel designer, in tutti i layout; intestazione/piè standard nascondibili, menu che sostituisce o affianca quello generato. I layout dei temi vengono ora presi dall'adattatore attuale, non dalla copia fatta all'importazione del template.
- **Accesso Windows (NTLM)** come R-LAB (security.mode = ntlm): REMOTE_USER normalizzato (DOMINIO\utente → UTENTE@suffisso), gruppi e area da rlab_profilazione_gruppo, nome da rlab_venditori, permessi R:W:L per pagina da rlab_profilazione_permission, registro in r_lab_statistiche.rlab_accessi, variabili di sessione R-LAB; pagine di gestione Utenti Windows e Permessi pagine sulle stesse tabelle.
- **Docker di progetto**: Apache (Debian 12/13, Ubuntu 22.04/24.04), PHP-FPM 7.4–8.5, MariaDB 10.4–11.8, script SQL iniziale, app generata con la connessione verso il contenitore; NTLM come il httpd.conf di produzione (utente valido, anonimi esclusi, X_ISRW_PROXY_AUTH_USER, percorsi esclusi) con mod_auth_gssapi + gss-ntlmssp + winbind e utente simulato senza dominio; frammento httpd-ntlm.conf per Apache24 su Windows con mod_authn_ntlm. Provato con docker compose: Apache 2.4.68 + PHP 8.3 + MariaDB 11.4 e PHP 7.4 + MariaDB 10.6.
- **Docker di progetto su Windows** (v0.9.0, 2026-10-31): sistema operativo a scelta; con Windows, contenitore Windows Server Core 2019/2022/2025 con l'Apache24 di produzione copiato (senza htdocs, logs, php), httpd.conf con gli stessi moduli, PHP 8.0–8.5 thread safe come modulo Apache, mod_authn_ntlm (AuthType SSPI) con gMSA e credential spec (setup-gmsa.ps1) o utente simulato, MariaDB per Windows.

## Fatto (v0.10.0, 2026-10-31)
- **Origini da stored procedure**: procedure MariaDB/MySQL (`CALL`) e SQL Server (`EXEC`), funzioni PostgreSQL che restituiscono una tabella, funzioni pipelined Oracle; elenco e parametri letti dal database, campi dal primo risultato (tipi dai metadati del driver), parametri da valore fisso, sessione, utente, indirizzo o evento `ProcParams`; ricerca, filtri, ordinamento, paginazione, totali, report e grafici in memoria come per REST. Provato su MariaDB, PostgreSQL, SQL Server e Oracle (tests/proc.test.cjs, anche in `npm run test:db`).
- **Ricerche salvate** ("Save search"): menu nella lista, ricerca rapida + avanzata + filtri salvati per utente, condivisione da parte degli amministratori, eliminazione; tabella di sistema `mc_searches` (schema 4) provata su MariaDB, PostgreSQL, SQLite, SQL Server e Oracle; opzione del progetto per disattivarle. Servono il login.
- **Attività pianificate**: `settings.tasks` (nome, titolo, espressione cron, attiva) con il codice nell'evento globale `Task_<nome>(&$message)`; `cron.php` nell'app (solo da riga di comando: attività dovute, `--run NOME`, `--list`, blocco per non eseguirle due volte), stato in `mc_tasks` (schema 5), sezione Amministrazione con prossima/ultima esecuzione, esito ed «Esegui ora»; provato su tutti e cinque i database.
- **Modelli email**: `settings.mailTemplates` per lingua, usati dalle email di registrazione e recupero password (altrimenti i testi standard), `sendTemplate()` per i modelli propri, valori protetti nell'HTML; provato con un server SMTP di prova (tests/mail.test.cjs).
- **SMS e codice di accesso via email/SMS**: classe Sms (Twilio, gateway HTTP, file), `sendSms()`, `runner_sms()`; verifica in due passaggi con codice a 6 cifre per chi non ha l'app (5 minuti, 5 tentativi, nuovo invio dopo 30 secondi), telefono nel profilo (tabella `mc_phones`, schema 6) o dall'evento `TwoFactorPhone`, modello email «twofactor». Provati codice via SMS (file) e gateway HTTP con un server di prova.
- **Geocodifica** delle viste mappa: indirizzo da campo o modello, Nominatim (una richiesta al secondo, User-Agent, paesi) o Google; al salvataggio solo se mancano le coordinate o se cambia l'indirizzo senza che l'utente abbia cambiato le coordinate; in blocco 20 alla volta dal pulsante della mappa o `Geocode::fill()`. Provato con un Nominatim di prova (tests/geocode.test.cjs).
- **Annulla / ripeti** nel designer: storico di 100 stati del progetto (modifiche a meno di un secondo l'una dall'altra unite), azzerato all'apertura, alla ricarica e all'arrivo dei file del team; Ctrl+Z nei campi di testo e negli editor di codice resta quello del campo. Provato nell'app con uno script Electron.
- **Cerca nel progetto**: ricerca in tutto il progetto raggruppata per posizione, righe di codice con numero, apertura del pannello (per le tabelle la scheda giusta). Provata nell'app con uno script Electron.
- **PDF Unicode e immagini**: DejaVu Sans incorporato come font CID (Identity-H, solo i glifi usati, ToUnicode per copia e ricerca), Helvetica/Windows-1252 se mancano i file dei font; immagini dei campi immagine nel PDF del record (JPEG e PNG così come sono, altri formati e PNG trasparenti con GD). Provato con pdftotext (tests/pdf.test.cjs) su PHP 8.5 e 7.4.
- **Filtri REST nella sintassi dell'API**: oltre a `?campo=valore`, json-server (`_ne`, `_like`, `_gte`, `_lte`), Strapi (`filters[campo][$op]`) e modelli personalizzati per operatore; condizioni esatte → l'API pagina anche il risultato, condizioni approssimate (es. maggiore con solo `_gte`) restringono i record e l'app ricontrolla. Provato con un'API di prova (tests/rest-filters.test.cjs).
- **Personalizzazione del tema da parte degli utenti** (il «pannello impostazioni» dei template): pulsante con la tavolozza nell'intestazione, colori di Material Admin e menu laterale/orizzontale di Slim, scelta salvata nel browser dell'utente (cookie) e verificata sui valori ammessi; disattivabile nel progetto. Provato su Material e Slim (tests/themes.test.cjs) e con uno screenshot.

## Fatto (v0.11.0, 2026-10-31)
- **Report crosstab**: `crosstab: {field, interval, desc}` nel report; righe dai raggruppamenti (con subtotali), più totali per cella, totali di riga/colonna/generale, celle collegate alla lista filtrata, XLSX. Provato su tutti e cinque i database.
- **Aggiunta in linea** nella lista (opzione della pagina lista): campi semplici della lista in una riga sopra la griglia, salvataggio in JSON con BeforeAdd/AfterAdd e validazione, valori predefiniti per gli altri campi, lista ricaricata. Provato su tutti i database e nel browser.
- **Pagine a passi**: stile di sezione «Passo» nel designer delle pagine; indicatore dei passi, Avanti/Indietro, controllo dei campi del passo, salvataggio all'ultimo passo, riapertura sul passo con l'errore dopo un salvataggio rifiutato. Provato nel browser e nell'e2e.
- **Campi cifrati**: `field.encrypt`, AES-256-GCM con `encryptionKey` nei segreti (generata nel designer, finestra del campo), cifratura dopo gli eventi Before*, decifratura in lettura, valori in chiaro preesistenti cifrati al salvataggio successivo, esclusi da ricerca/filtri/unicità, mascherati nel registro; errore chiaro senza chiave. Provato su SQLite (tests/crypto.test.cjs).
- **«Ricordami»**: `security.rememberDays`, token selettore/verificatore in `mc_remember` (schema 7), verificatore rinnovato a ogni uso, riuso di un cookie vecchio = tutti i token dell'utente cancellati, «Esci» cancella il cookie, emesso solo dopo l'accesso completo (anche con verifica in due passaggi). Solo per gli utenti gestiti dall'app. Provato (tests/remember.test.cjs) e tabella creata su tutti i database.
- **App installabile (PWA)**: `settings.pwa`; `?p=manifest`, `?p=appicon` (logo del progetto o iniziali con DejaVu Sans), `sw.js` alla radice con cache dei file statici e messaggio offline (le pagine non vengono mai salvate: contengono i dati dell'utente). Provato nel browser (service worker attivo) e nell'e2e.
- **Accedi come**: pulsante nella pagina Utenti (utenti gestiti dall'app), sessione con i diritti dell'utente scelto, pulsante «Torna a…» nell'intestazione di tutti i temi, inizio e fine nel registro attività, nessun aggiornamento dell'ultimo accesso dell'utente. Provato su tutti i database.

## Fatto (v0.12.0, 2026-11-01)
- **Scrittura tramite stored procedure**: procedure di inserimento, modifica ed eliminazione per le origini da procedura (parametri da campo, chiave, valore fisso, sessione, utente), nuova chiave restituita dalla procedura di inserimento; MariaDB/MySQL e SQL Server `CALL`/`EXEC`, PostgreSQL `CALL`, Oracle blocco anonimo. Provato su tutti e quattro i database.
- **Filtri delle stored procedure**: con PostgreSQL e Oracle il filtro fisso WHERE e la condizione di BeforeSelect si applicano nella SELECT che legge il risultato; nuovo evento `ProcRows(&$rows)` per filtrare in PHP con tutti i database. Provato su tutti e quattro i database.
- **Colore di Webarch scelto dall'utente**: tutti i colori del template installati accanto a webarch.css (anche nei temi importati prima, dalla cartella del template), scelta dalla tavolozza dell'intestazione che sostituisce il foglio di stile. Provato (tests/themes.test.cjs).
- **PDF in altre scritture**: caratteri che DejaVu non ha presi da Droid Sans Fallback (cinese, giapponese) e Noto Sans Thai, caricati solo se servono; arabo con le forme unite (alif-lam incluso) e da destra a sinistra, ebraico da destra a sinistra. Provato con pdftotext su PHP 8.5 e 7.4.
- Pagine a passi: i campi non assegnati a una sezione vanno nell'ultimo passo (prima restavano in un riquadro sempre visibile); niente spazio vuoto al posto di «Indietro» nel primo passo.
- **Documentazione**: [GUIDA.md](GUIDA.md) (tutte le funzioni e dove si trovano), [RIFERIMENTO.md](RIFERIMENTO.md) (eventi, funzioni PHP, compatibilità con i progetti importati, tabelle di sistema), [APP-GENERATA.md](APP-GENERATA.md) (struttura, server, pubblicazione, cron, PWA, API), README riorganizzato con nuovi screenshot.

## Fatto (v0.12.1, 2026-11-01)
- **Impostazioni e stile riorganizzate**: riepilogo del progetto in alto, sei categorie nella navigazione a sinistra, funzioni come riquadri con icona e interruttore (le opzioni compaiono quando la funzione è attiva), sezioni su più colonne, colori che vanno a capo, elenco dei temi scorrevole.

## Fatto (v0.12.2, 2026-11-01)
- **Designer riorganizzato** come Impostazioni e stile: riepilogo in alto in tutti i pannelli; categorie a sinistra in Sicurezza (con l'interruttore «Login obbligatorio» nel riepilogo), Genera e pubblica, editor della tabella (sole icone per Campi, Designer pagine, Eventi); pagine generate come riquadri; editor di report, grafici e dashboard su più colonne; etichette più strette nelle sezioni affiancate; niente pulsanti doppi.

## Fatto (v0.12.3, 2026-11-01)
- **Tabelle e query** come gli altri pannelli: riepilogo (tabelle, query, REST, procedure, relazioni, connessioni) con «Importa tabelle» e «Crea tabella», barra dei comandi a gruppi (Nuova origine, Diagramma, Database) su una riga, elenco e diagramma in riquadri arrotondati al posto della barra blu.

## Fatto (v0.12.4, 2026-11-01)
- **Anteprima con accesso Windows**: `php -S` non autentica, quindi per i progetti NTLM l'anteprima del designer passa `REMOTE_USER` con l'«utente simulato» del progetto o, se vuoto, con l'utente del computer (file eseguito prima di ogni pagina, fuori dall'output generato); lo stato dell'anteprima mostra l'utente.

## Fatto (v0.12.5, 2026-11-01)
- **Visualizza dati** nel designer: record di tabelle del database, query SQL e stored procedure del progetto, a pagine (paginazione nella sintassi di ogni database), ordinamento per colonna, filtro con condizione SQL, conteggio; da Tabelle e query (pulsante Dati e menu contestuale) e dall'editor della tabella. Provato su MariaDB e SQLite (tests/data.test.cjs).

## Limiti aperti
- Pagine e dashboard: il blocco Campo è di sola lettura (niente input che salva) e vale per tabelle con chiave singola; nessun evento PHP «onLoad» di pagina (solo JavaScript); l'editor mostra i blocchi come riquadri con riepilogo, senza anteprima dal vivo; il blocco Codice non è filtrato.
- App installabile: nessun funzionamento offline dei dati (solo il messaggio); i browser la propongono solo su https o localhost.
- Campi cifrati: solo campi di testo e solo tabelle e query SQL (non REST né stored procedure); niente ricerca, filtro, ordinamento sensato né controllo di unicità; un lookup che mostra un campo cifrato di un'altra tabella mostra il valore cifrato; perdere la chiave significa perdere i dati.
- Annulla/ripeti: non annulla operazioni già eseguite sul database o sul disco (creazione tabelle, importazioni di file, salvataggio), solo lo stato del progetto nel designer.
- Geocodifica: Google non provato con una chiave reale; il pulsante della mappa elabora 20 record per clic (con Nominatim pubblico circa 20 secondi), per molti record conviene un'attività pianificata.
- SMS: Twilio non provato con un account reale (stessa chiamata documentata da Twilio); il codice via email è provato solo nell'invio del modello, non in un accesso completo.
- Attività pianificate: servono un cron di sistema (o l'Utilità di pianificazione) che lanci cron.php ogni minuto; nessun avvio da pagina web; un'attività molto lunga fa attendere le altre del minuto successivo (una alla volta).
- Stored procedure: al massimo 50.000 righe lette a ogni pagina; con MariaDB/MySQL e SQL Server (CALL/EXEC) il filtro fisso WHERE e BeforeSelect non si possono applicare in SQL (c'è l'evento ProcRows); SQLite non ha procedure.
- Origini REST: le condizioni che la sintassi scelta non esprime esattamente (per esempio «contiene» con caratteri speciali in json-server, intervalli di sole date, più condizioni sullo stesso campo) e i totali, report e grafici senza filtri leggono tutte le pagine (massimo 50.000 record), con la cache delle risposte facoltativa per non rileggerle a ogni richiesta. Le condizioni SQL dei lookup (`where`) non si applicano ai lookup verso tabelle REST; l'importazione su REST non può essere annullata in blocco (ogni record è una chiamata all'API).
- PDF: niente coreano (nessun font TrueType coreano libero disponibile: Noto CJK è OpenType CFF); arabo ed ebraico con una gestione semplice della direzione (le frasi miste con numeri o parole latine possono uscire in ordine diverso); niente segni diacritici posizionati per tailandese e arabo vocalizzato; testi troppo lunghi per la colonna troncati con «…» nella lista; immagini solo nel PDF del record (al massimo 6 per campo).
- Strato AnyChart: copre tutte le chiamate dei 55 eventi grafico del progetto reale di prova e in più formati `{%Value}{...}`, impilamento e marcatori; altre chiamate AnyChart vengono ignorate senza errori.
- Temi: adattatori per Metronic 8, DesignReset (Cork/Equation), Satria, Slim, Webarch e Material Admin. Slim, Webarch e Material Admin girano sul Bootstrap 5 delle pagine: restano gli stili del tema, non i componenti JavaScript del template (grafici e chat dimostrativi; per Material Admin i componenti Angular Material e le animazioni a onda dei pulsanti). La personalizzazione da parte degli utenti c'è per Material (colori), Slim (menu) e Webarch (colori; per un tema importato prima serve ancora la cartella del template). Il tema va importato su ogni computer del team.
- Aggiornamenti integrati: puntano a `mbulloni/MiB-Crude` su GitHub; senza release pubblicate il controllo segnala l'errore. Aggiornamento del .deb dall'app provato con successo (0.4.0 → 0.4.1, 2026-10-31).
