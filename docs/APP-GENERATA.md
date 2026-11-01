# L'applicazione generata

Cosa produce MiB-Crude, cosa serve sul server e come si mette in produzione. Per il designer vedi [GUIDA.md](GUIDA.md).

## Struttura

```
index.php                  punto d'ingresso unico (index.php?p=<pagina>&t=<tabella>)
cron.php                   attività pianificate (solo da riga di comando)
sw.js                      service worker (solo con «App installabile»)
<tabella>_list.php …       con «URL classici»
config/app.php             configurazione generata dal progetto
config/secrets.php         password e chiavi (fuori dal controllo di versione)
config/tables/*.php        definizione di ogni origine dati
events/*.php               eventi PHP del progetto (una classe per tabella, Ev__global per gli eventi globali)
lang/*.php                 testi dell'interfaccia per lingua
runtime/                   runtime di MiB-Crude: lib/ (classi PHP), views/ (pagine), fonts/ (font dei PDF), themes/ (layout dei temi)
assets/                    CSS e JavaScript (Bootstrap 5, DataTables, ECharts, Leaflet…), logo
theme/<id>/                file del tema grafico importato
custom/                    file del progetto (custom.css, codice di intestazione/piè/menu…)
<cartella upload>/         file caricati (predefinita: files/)
.htaccess, */.htaccess     Apache: cartelle interne non raggiungibili dal web
web.config                 IIS: stesse protezioni
nginx.conf.example         nginx: blocchi da copiare nella configurazione del sito
```

Rigenerare sovrascrive solo i file generati: il codice scritto a mano vive nel progetto (eventi, `custom/`, `public/`) e viene ricopiato a ogni generazione.

## Requisiti del server

- **PHP 7.4 – 8.5** (provato su 7.4, 8.4 e 8.5), come modulo di Apache, PHP-FPM o con IIS/nginx.
- Estensioni: `pdo` più il driver del database (`pdo_mysql`, `pdo_pgsql`, `pdo_sqlsrv`, `pdo_oci`, `pdo_sqlite`), `mbstring`, `json`, `openssl` (campi cifrati, SMTP con TLS), `zip` (esportazione XLSX), `gd` (miniature, icona dell'app installabile, immagini nei PDF), `fileinfo`; `ldap` per l'accesso LDAP; `intl` consigliata.
- Scrittura nella cartella dei file caricati (e nella cartella temporanea di sistema per le cache).

## Configurazione e segreti

`config/app.php` contiene la configurazione del progetto; `config/secrets.php` le password delle connessioni, i client secret OIDC, la password SMTP, la password SMS, la chiave di geocodifica e la **chiave di cifratura**. Il designer li scrive dai segreti locali dello sviluppatore; sul server si possono correggere a mano. La chiave di cifratura deve essere la stessa usata per i dati già cifrati.

## Prima esecuzione

Con il login gestito dall'app, la prima pagina è la **configurazione iniziale** (`?p=setup`): si crea l'amministratore. Le tabelle di sistema vengono create automaticamente, anche dopo un aggiornamento (solo quelle mancanti).

## Pubblicazione

Dal designer (*Genera e pubblica*) via SFTP, FTP/FTPS o copia in una cartella: vengono inviati solo i file cambiati. In alternativa si copia la cartella di output.

### Docker

*Genera e pubblica › Docker di progetto* scrive nella cartella `docker/` del progetto un ambiente pronto:

```bash
cd <progetto>/docker
docker compose up -d --build      # avvio (la prima volta costruisce le immagini)
docker compose logs -f            # log
docker compose down               # arresto (i dati restano nel volume)
```

- **Linux**: Apache (Debian/Ubuntu) + PHP-FPM + MariaDB nelle versioni scelte.
- **Windows Server Core**: Apache24 del server di produzione + PHP 8 + MariaDB per Windows (serve un host Windows con i contenitori Windows).
- Le password sono in `docker/.env`, escluso da Git.

## Attività pianificate

`cron.php` va lanciato **ogni minuto** dall'utente del server web:

```bash
# Linux (crontab -e dell'utente del server web)
* * * * * php /var/www/app/cron.php
```

Su Windows: Utilità di pianificazione, azione `php.exe C:\percorso\app\cron.php`, ripetuta ogni minuto.

```bash
php cron.php                # esegue le attività dovute
php cron.php --list         # elenco con prossima e ultima esecuzione
php cron.php --run nome     # esegue subito un'attività
```

Un blocco su file impedisce due esecuzioni contemporanee; l'esito di ogni attività è in `mc_tasks` e in *Amministrazione › Attività pianificate*. Dal web `cron.php` risponde 404.

## App installabile (PWA)

Con l'opzione attiva l'app pubblica `?p=manifest`, l'icona (`?p=appicon&s=192|512`: il logo del progetto o le iniziali sul colore principale) e `sw.js`. Il service worker tiene in cache solo i file statici (CSS, JS, font, immagini del tema); le pagine vengono sempre dal server, perché contengono i dati dell'utente. Senza rete compare un messaggio. I browser propongono l'installazione solo su **https** (o localhost).

## Sicurezza dei file

- `config/`, `runtime/`, `events/`, `lang/` non sono raggiungibili dal web (`.htaccess`, `web.config`, esempio nginx).
- I file PHP di `custom/` non si eseguono direttamente; il codice di intestazione/piè/menu ha anche una protezione interna.
- Tutte le richieste POST sono protette da token CSRF; le query usano parametri PDO.
- Password con `password_hash`; chiavi API, token di recupero e di «Ricordami» salvati solo come hash.

## API REST

`index.php?p=api&t=<tabella>`: `GET` elenco (parametri `q`, `s[]`, `f[]`, ordinamento, pagina), `GET` con `k[chiave]` un record, `POST` inserimento, `PUT`/`PATCH` modifica, `DELETE` eliminazione. Autenticazione con l'intestazione `X-Api-Key` (chiave personale dal profilo) o con la sessione del browser (le scritture richiedono `X-CSRF-Token`). Descrizione OpenAPI 3: `index.php?p=api&openapi=1`.
