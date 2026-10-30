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
