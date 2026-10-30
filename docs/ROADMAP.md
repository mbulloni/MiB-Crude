# Roadmap — gap rispetto a generatori classici

Stato v0.2.0 (2026-10-30): tutti i punti della roadmap iniziale implementati e testati; restano i limiti sotto.

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

## Limiti aperti
- Query SQL del progetto reale di prova non provate in esecuzione: richiedono i database di produzione del progetto (non raggiungibili dall'ambiente di sviluppo).
- Progetto reale di prova: un evento `BeforeMoveNext` ha un errore di sintassi già nel progetto originale; resta disattivato.
- Origini REST: ricerca, filtri, ordinamento e totali sono eseguiti dall'app dopo aver letto l'intero elenco (adatto a risorse di qualche migliaio di record); lookup verso tabelle REST, report e grafici su origini REST non supportati.
- Strato AnyChart: copre le chiamate usate dai progetti reali (etichette, serie, legenda, tooltip, assi e scale, zoom); le altre vengono ignorate senza errori.
- Temi: adattatori per Metronic 8, DesignReset (Cork/Equation) e Satria; non compatibili Slim (Bootstrap 4), Webarch (Bootstrap 3), Material Admin (AngularJS). Il tema va importato su ogni computer del team.
- Aggiornamenti integrati: puntano a `mbulloni/MiB-Crude` su GitHub; senza release pubblicate il controllo segnala l'errore.
