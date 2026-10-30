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
- **Report** con raggruppamenti e totali, **grafici** (Chart.js), **dashboard**
- **API REST** per tabella con chiave API e descrizione **OpenAPI**
- Menu ad albero, temi (colore, barra laterale/alta, chiaro/scuro), **multilingua** con traduzioni
- **Anteprima** integrata (PHP locale o Docker) e **pubblicazione** incrementale via SFTP, FTP/FTPS o cartella

![App generata](docs/screenshots/app-list.png)

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
| `runtime/` | runtime PHP dell'app generata (PHP 7.4 – 8.5, nessuna dipendenza): PDO multi-dialetto, pagine, sicurezza, API, report |
| `electron/` | processo principale del designer: IPC, anteprima, pubblicazione, Git, client del server del team |
| `src/` | interfaccia del designer (React + Monaco) |
| `server/` | server del team (WebSocket) |

L'app generata è il runtime fisso più la configurazione del progetto (`config/*.php`) e gli eventi: rigenerare non perde mai codice scritto a mano, perché vive nel progetto (`events/`, `custom/`).
