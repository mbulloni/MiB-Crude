'use strict';
// AI assistant for events: writes or changes the code of one event with Claude, knowing the
// project (tables, fields, event signature, runtime helpers) and checking the PHP syntax.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5-5';

const RUNTIME_API = `Helper globali del runtime (namespace MiB già importato negli eventi):
- db($connection = null): oggetto Db con q($nome) (quota identificatori), table($nome), all($sql, $params), row($sql, $params), value($sql, $params), query($sql, $params), insert($tabella, $valori), update($tabella, $valori, $where), delete($tabella, $where), now(), begin()/commit()/rollback(), like($expr), concat([...]).
- h($s) escape HTML; t($chiave, ...$args) traduzione; user(), userId(), userName(), isAdmin(), userGroups();
- redirect($url); sendMail($to, $subject, $body, $html = true); appUrl($page, $params = []); sessionVar($k, $v = null).
- Compatibilità phpr: DB::Query/Lookup/Insert/Update/Delete/Exec, Security::getUserName()/isAdmin(), $pageObject ecc.
Usa sempre parametri preparati (?), mai concatenare valori dell'utente nell'SQL; quota tabelle/campi con db()->q().`;

function fieldsOf(t) {
  return (t.fields || []).map((f) => `${f.name} (${f.type || f.dbType || '?'}${f.editAs?.lookup?.table ? `, lookup su ${f.editAs.lookup.table}` : ''})`).join(', ');
}

function systemPrompt(proj, table, event, def) {
  const lang = def.lang === 'javascript' ? 'javascript' : 'php';
  const tables = (proj.tables || []).map((t) => `- ${t.name}${t.source?.type === 'sql' ? ' (query SQL)' : ''}: ${fieldsOf(t)}`).join('\n');
  const driver = (proj.connections || []).find((c) => c.id === (table?.connection || proj.project.defaultConnection))?.driver || 'mysql';
  return [
    'Sei l\'assistente di MiB-Crude, generatore di applicazioni web PHP simile a phpr. Scrivi il corpo di un evento.',
    lang === 'php'
      ? `Il codice è il CORPO di una funzione PHP con firma ${event}(${def.args}); inizia con "<?php" e termina con "return true;" (o false per annullare dove previsto). Deve funzionare da PHP 7.4 a PHP 8.5: niente match, nullsafe ?->, argomenti nominati, union type, readonly, enum; niente tipi nullabili impliciti né \${var} nelle stringhe.\n${RUNTIME_API}`
      : `Il codice è il corpo di una funzione JavaScript lato browser (${event}) con variabili pageObj, proxy, pageid, inlineRow, inlineObject, row. jQuery ($) e Runner.getControl(nome) sono disponibili.`,
    `Database: ${driver}. Commenti nel codice in italiano, brevi.`,
    `Descrizione dell'evento: ${def.help}`,
    table ? `Tabella corrente: ${table.name}.` : 'Evento globale dell\'applicazione.',
    `Tabelle del progetto:\n${tables || '(nessuna)'}`,
    `Rispondi con UN solo blocco di codice \`\`\`${lang} con il codice completo dell'evento, seguito da una frase che spiega cosa fa.`,
  ].join('\n\n');
}

function extractCode(text, lang) {
  const m = text.match(new RegExp('```(?:' + lang + ')?\\s*\\n([\\s\\S]*?)```')) || text.match(/```\w*\s*\n([\s\S]*?)```/);
  const code = (m ? m[1] : text).trim() + '\n';
  const note = (m ? text.slice(text.indexOf(m[0]) + m[0].length) : '').trim();
  return { code: lang === 'php' && !code.startsWith('<?php') ? `<?php\n${code}` : code, note };
}

async function ask(client, system, messages) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high' },
    system,
    messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Richiesta rifiutata dal modello' + (msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : ''));
  return msg;
}

/**
 * Writes (or changes) the event code. `lint(code)` returns {ok, message, line} or {skipped}:
 * a syntax error is sent back once to the model for a fix.
 */
async function writeEvent({ apiKey, proj, table, event, def, current, request, lint, baseURL }) {
  if (!apiKey) throw new Error('Chiave API di Anthropic non impostata (Opzioni › Assistente AI)');
  const client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });
  const lang = def.lang === 'javascript' ? 'javascript' : 'php';
  const system = systemPrompt(proj, table, event, def);
  const user = current && current.trim()
    ? `Codice attuale dell'evento:\n\`\`\`${lang}\n${current}\n\`\`\`\n\nRichiesta: ${request}`
    : `Richiesta: ${request}`;
  const messages = [{ role: 'user', content: user }];
  let msg = await ask(client, system, messages);
  const text = (m) => m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  let out = extractCode(text(msg), lang);
  if (lint && lang === 'php') {
    const r = await lint(out.code);
    if (r && !r.ok && !r.skipped) {
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: `Il controllo di sintassi (php -l) segnala: ${r.message} (riga ${r.line || '?'}). Correggi e restituisci di nuovo il codice completo.` });
      msg = await ask(client, system, messages);
      out = extractCode(text(msg), lang);
    }
  }
  return { ...out, model: msg.model, usage: msg.usage };
}

module.exports = { MODEL, writeEvent, systemPrompt, extractCode };
