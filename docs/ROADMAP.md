# Roadmap — gap rispetto a generatori classici

Stato v0.5.0 (2026-10-31): roadmap iniziale completa (v0.2.0), origini REST complete (v0.3.0), temi Slim e Webarch (v0.4.0), correzione import eventi (v0.4.1), skin scura Webarch (v0.4.2), tema Material Admin (v0.5.0); restano i limiti sotto.

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

## Limiti aperti
- Query SQL del progetto reale di prova non provate in esecuzione: richiedono i database di produzione del progetto (non raggiungibili dall'ambiente di sviluppo).
- Origini REST: senza paginazione dell'API ogni richiesta legge l'intero elenco; con la paginazione solo lista, ricerca rapida e ordinamento sono eseguiti dall'API, mentre ricerca avanzata, pannello filtri, totali, report, grafici e lookup leggono tutte le pagine (massimo 50.000 record). Le condizioni SQL dei lookup (`where`) non si applicano ai lookup verso tabelle REST; l'importazione su REST non può essere annullata in blocco (ogni record è una chiamata all'API).
- Strato AnyChart: copre le chiamate usate dai progetti reali (etichette, serie, legenda, tooltip, assi e scale, zoom); le altre vengono ignorate senza errori.
- Temi: adattatori per Metronic 8, DesignReset (Cork/Equation), Satria, Slim, Webarch e Material Admin. Slim, Webarch e Material Admin girano sul Bootstrap 5 delle pagine: restano gli stili del tema, non i componenti JavaScript del template (grafici demo, chat, pannello impostazioni; per Material Admin anche i componenti Angular Material, il pannello di personalizzazione e le animazioni a onda dei pulsanti). Il tema va importato su ogni computer del team.
- Aggiornamenti integrati: puntano a `mbulloni/MiB-Crude` su GitHub; senza release pubblicate il controllo segnala l'errore. Aggiornamento del .deb dall'app provato con successo (0.4.0 → 0.4.1, 2026-10-31).
