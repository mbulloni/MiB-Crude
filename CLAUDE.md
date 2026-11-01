# CLAUDE.md — MiB-Crude

Generatore visuale educativo di applicazioni web PHP per Linux, multisviluppatore. UI e messaggi in italiano.

## Comandi
- `npm run dev` designer (Vite 5175 + Electron) · `npm start` build+avvio · `npm run typecheck`
- `npm test` = `node --test tests/*.test.cjs` (e2e su MariaDB `mibcrude_demo` utente `mibcrude`/`mibcrude`, server team)
- `npm run server -- --data DIR` server del team; `--add-user NOME` crea utente
- Screenshot/automazione: `MIBCRUDE_OPEN=<progetto> MIBCRUDE_SCRIPT=<script.cjs> npx electron . --no-sandbox` (script riceve `{win, app}`)

## Regole
- Il runtime PHP (`runtime/`) gira su **PHP 7.4 → 8.5**: niente sintassi solo-8 (match, nullsafe, named args, union types, readonly) e niente costrutti deprecati in 8.x (tipi nullabili impliciti `array $x = null` → `?array`, fputcsv/fgetcsv senza `$escape`, `${var}` nelle stringhe). PHP locale = 8.5 (7.4 resta in `/usr/bin/php7.4`). Test: `npm test` (8.5), `MIBCRUDE_PHP_BIN=php7.4 npm test`, `MIBCRUDE_TEST_PHP=8.4 npm test` (Docker, immagine da tests/docker).
- Formato progetto: file deterministici (`core/project.cjs` stableStringify). Segreti solo in `.mibcrude-local/`. Nuove sezioni del progetto → aggiornare `serialize`, `MANAGED_DIRS`, `team-protocol.cjs` (`itemOf`, `syncable`).
- Eventi: catalogo duplicato in `core/defaults.cjs` (generatore) e `src/events.ts` (designer): tenerli allineati.
- Stringhe runtime in `runtime/lang/{it,en}.json`; ogni `t('chiave')` nuova va in entrambi.
- Dopo modifiche a `src/` serve `npx vite build` prima di lanciare Electron senza dev server.
- Import progetti .phpr: `core/phpr-import.cjs` (XML .phpr + PAGES*.sqlite), compatibilità runtime in `runtime/lib/Compat.php`, controlli PHP 8 in `core/php8-compat.cjs`.
