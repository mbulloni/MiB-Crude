# CLAUDE.md — MiB-Crude

Clone educativo di generatori classici per Linux, multisviluppatore. UI e messaggi in italiano.

## Comandi
- `npm run dev` designer (Vite 5175 + Electron) · `npm start` build+avvio · `npm run typecheck`
- `npm test` = `node --test tests/*.test.cjs` (e2e su MariaDB `mibcrude_demo` utente `mibcrude`/`mibcrude`, server team)
- `npm run server -- --data DIR` server del team; `--add-user NOME` crea utente
- Screenshot/automazione: `MIBCRUDE_OPEN=<progetto> MIBCRUDE_SCRIPT=<script.cjs> npx electron . --no-sandbox` (script riceve `{win, app}`)

## Regole
- Il runtime PHP (`runtime/`) deve restare compatibile **PHP 7.4** (niente match, nullsafe, named args, union types, readonly). Verifica con `php -l` (PHP locale 7.4).
- Formato progetto: file deterministici (`core/project.cjs` stableStringify). Segreti solo in `.mibcrude-local/`. Nuove sezioni del progetto → aggiornare `serialize`, `MANAGED_DIRS`, `team-protocol.cjs` (`itemOf`, `syncable`).
- Eventi: catalogo duplicato in `core/defaults.cjs` (generatore) e `src/events.ts` (designer): tenerli allineati.
- Stringhe runtime in `runtime/lang/{it,en}.json`; ogni `t('chiave')` nuova va in entrambi.
- Dopo modifiche a `src/` serve `npx vite build` prima di lanciare Electron senza dev server.
