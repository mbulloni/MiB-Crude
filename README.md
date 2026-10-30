# MiB-Crude

Generatore visuale di applicazioni web PHP per Linux, per Linux, con lavoro **multisviluppatore** nativo. Progetto educativo.

![Designer](docs/screenshots/designer-fields.png)

## Cosa fa

Parti da un database esistente (MariaDB/MySQL, PostgreSQL, SQL Server, Oracle, SQLite), scegli le tabelle e ottieni un'applicazione web completa:

- **Pagine**: lista (ricerca rapida, ricerca avanzata, pannello filtri, ordinamento, paginazione, totali, selezione multipla), nuovo, modifica, visualizza, copia, elimina, stampa, esporta (CSV/XLSX/JSON), importa (CSV/XLSX con aggiornamento e "tutto o niente")
- **Campi**: 17 formati di visualizzazione e 19 controlli di modifica — lookup da tabella o elenco fisso, a cascata, completamento automatico, selezione multipla, "aggiungi nuovo" in finestra; upload file/immagini con miniature e ridimensionamento (cartella o BLOB); testo formattato; validazioni (obbligatorio, unico, email, min/max, regex)
- **Master-dettaglio** ricavato dalle chiavi esterne (schede nella vista/modifica, icone nella lista)
- **Eventi PHP** (BeforeAdd, AfterEdit, BeforeSelect, CustomValidate…) con editor Monaco, controllo sintassi e azioni predefinite
- **Sicurezza**: utenti gestiti o tabella esistente o utente fisso, gruppi, permessi per tabella (A/E/D/S/V/P/I), **permessi dinamici** gestibili dall'app, record per utente, registrazione con conferma email, recupero password, CAPTCHA, regole password, blocco dopo tentativi falliti, **LDAP/Active Directory**, **OpenID Connect** (Okta, Entra ID, Google, Keycloak)
- **Registro attività** (audit) e **blocco record** durante la modifica
- **Report** con raggruppamenti e totali, **grafici** (Apache ECharts), **dashboard**
- **API REST** per tabella con chiave API e descrizione **OpenAPI**
- Menu ad albero, temi (colore, barra laterale/alta, chiaro/scuro), **multilingua** con traduzioni
- **Anteprima** integrata (PHP locale o Docker) e **pubblicazione** incrementale via SFTP, FTP/FTPS o cartella

![App generata](docs/screenshots/app-list.png)

## Importazione di progetti .phpr

Pulsante **Importa progetto .phpr** nella schermata iniziale: legge il file `.phpr` (phpr 10.x) e l'archivio pagine `PAGES*.sqlite` accanto, e converte connessioni (password solo in locale), tabelle, query SQL, campi, lookup (anche a cascata), pagine e campi per pagina, master-dettaglio, menu, gruppi e permessi, grafici ed eventi PHP. Gli eventi funzionano senza riscriverli grazie allo strato di compatibilità del runtime (`DB::Query`, `DB::Lookup`, `Security::getUserName()`, `$pageObject`, `$xt`, `$record` in BeforeMoveNext, `runner_mail`…). Il codice PHP 7.4 viene adeguato a PHP 8 (correzioni automatiche sicure, il resto segnalato in `import-phpr/REPORT.md`). Eventi JavaScript e pulsanti personalizzati restano da riscrivere (salvati in `import-phpr/`).

## Liste e grafici

Le liste usano **DataTables 2 in modalità server-side** (ordinamento, ricerca e paginazione in SQL, colonne visibili, responsive, stato ricordato, totali). I grafici usano **Apache ECharts** (colonne, barre, linee, aree, dispersione, torta, ciambella, rosa, imbuto, treemap, gauge, radar; esportazione immagine, vista dati, cambio tipo).

## Temi grafici da template acquistati

In *Impostazioni e stile → Temi grafici → Importa template…* si indica la cartella dei template (es. ThemeForest). MiB-Crude riconosce i template Bootstrap 5 per cui ha un adattatore — **Metronic 8** (Keenthemes) e **Cork 3 / Equation 2** (DesignReset), con tutte le varianti di menu — e copia solo CSS/JS/font nella libreria locale `~/.config/MiB-Crude/themes`. Il layout dell'app generata usa il markup originale del template (menu laterale, intestazione, modalità scura); liste DataTables, moduli e grafici ECharts prendono lo stile del tema. I file dei template non entrano mai nel codice di MiB-Crude né nel progetto (licenze). Template Bootstrap 3/4 o AngularJS vengono segnalati come non compatibili.

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

I test end-to-end richiedono MariaDB con l'utente `mibcrude`/`mibcrude` sul database `mibcrude_demo` (schema in `tests/fixtures/demo-mysql.sql`) e `php-cli` con `pdo_mysql`.

## Architettura

| Cartella | Contenuto |
|---|---|
| `core/` | modello di progetto su file, introspezione dei 5 database, default del wizard, generatore, protocollo team |
| `runtime/` | runtime PHP dell'app generata (PHP 7.4 – 8.5, testato su 7.4, 8.4, 8.5): PDO multi-dialetto, pagine, sicurezza, API, report, compatibilità phpr |
| `electron/` | processo principale del designer: IPC, anteprima, pubblicazione, Git, client del server del team |
| `src/` | interfaccia del designer (React + Monaco) |
| `server/` | server del team (WebSocket) |

L'app generata è il runtime fisso più la configurazione del progetto (`config/*.php`) e gli eventi: rigenerare non perde mai codice scritto a mano, perché vive nel progetto (`events/`, `custom/`).
