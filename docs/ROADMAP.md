# Roadmap — gap rispetto a generatori classici

Stato v0.1.0 (2026-10-30): nucleo completo e testato end-to-end su MariaDB.

## Da fare (ordine proposto)
1. **Test sugli altri database**: PostgreSQL, SQL Server (immagine Docker mssql presente), Oracle (gvenzl/oracle-free), SQLite — introspezione designer + runtime PDO. Oracle nell'anteprima Docker non è supportato (serve pdo_oci con Instant Client).
2. **Page designer WYSIWYG** drag & drop (oggi: sezioni + larghezze campo), pagine personalizzate, blocchi di codice/HTML nelle pagine.
3. **Modifica in linea** nella lista e add/edit in finestra popup; anteprima record al passaggio del mouse.
4. **SAML 2.0** (Enterprise): SP con firma XML (openssl + DOM C14N).
5. **Web Report & Chart Builder** per gli utenti finali dentro l'app (tabelle mc_reports), rispettando la sicurezza.
6. **Autenticazione a due fattori** (TOTP; il campo `totp_secret` esiste già in mc_users).
7. **Template aziendali** pronti (anagrafiche, ticket, calendario risorse, documenti) e **creazione/modifica tabelle** dal designer.
8. **Assistente AI** per scrivere eventi (Claude API) con contesto del progetto.
9. Viste aggiuntive: calendario, mappa, galleria, kanban; campi QR code e firma.
10. Pacchetti `.deb`/AppImage, icona installata, aggiornamenti integrati.
11. Mappatura gruppi OIDC nel designer (il runtime la supporta già: `groupMap`).

## Import phpr — limiti noti (2026-10-30)
12. Eventi JavaScript (`EVENT_JS_*`, 641 solo nel progetto reale di prova) e pulsanti/campi personalizzati: salvati in `import-phpr/`, da riscrivere; serve un'API client compatibile (`pageObj`, `ctrl`, `Runner.*`).
13. Pagine phpr con più varianti (es. `list`, `list1`): importata solo la principale.
14. Dashboard phpr (tipo 4) non convertite; grafici convertiti con aggregazione "somma".
15. Layout grafici delle pagine (celle, tab, stili per pagina) non importati: si usa il layout standard.
16. `$xt->assign`, `$pageObject->hideItem` e simili sono accettati ma senza effetto.
17. Query SQL del progetto reale di prova non provate in esecuzione: richiedono i database di produzione del progetto.
18. Pulsanti personalizzati phpr (OnBefore/OnServer/OnAfter in subversion/EVENTS.sqlite) non ancora convertiti.
19. Tabelle e query: import/export tabelle in formato JSON (.mibtables.json), non ZIP come phpr; connessioni REST non supportate.
20. Temi grafici: adattatori per Metronic 8, DesignReset (Cork/Equation, anche menu orizzontali) e Satria (pagine di accesso e presentazione). Non compatibili: Slim (Bootstrap 4), Webarch (Bootstrap 3), Material Admin (AngularJS). Il tema va importato su ogni computer del team (la libreria è locale).
