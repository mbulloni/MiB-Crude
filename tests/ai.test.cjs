'use strict';
// AI event assistant against a local mock of the Messages API (SSE): request shape, code
// extraction and the php -l repair round.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const AI = require('../core/ai.cjs');

function sse(text) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: AI.MODEL, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
    + ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    + ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
    + ev('content_block_stop', { index: 0 })
    + ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } })
    + ev('message_stop', {});
}

test('writeEvent: prompt, extraction, lint repair', async () => {
  const bodies = [];
  const replies = [
    'Ecco:\n```php\n<?php\nif ($values[\'qty\'] < 0 { $errors[\'qty\'] = "no";\nreturn true;\n```\nControlla la quantità.',
    '```php\n<?php\n// quantità non negativa\nif ($values[\'qty\'] < 0) $errors[\'qty\'] = \'La quantità non può essere negativa\';\nreturn true;\n```\nImpedisce quantità negative.',
  ];
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      bodies.push({ body: JSON.parse(b), headers: req.headers });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse(replies[bodies.length - 1]));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const proj = { project: { defaultConnection: 'main' }, connections: [{ id: 'main', driver: 'mysql' }], tables: [{ name: 'orders', connection: 'main', fields: [{ name: 'qty', type: 'int' }] }] };
  const def = { args: '$values, &$errors, $page', help: 'Validazioni' };
  let lints = 0;
  const r = await AI.writeEvent({
    apiKey: 'test', baseURL: `http://127.0.0.1:${srv.address().port}`, proj, table: proj.tables[0], event: 'CustomValidate', def, current: '', request: 'quantità non negativa',
    lint: (code) => { lints++; return /\(\$values\['qty'\] < 0 \{/.test(code) ? { ok: false, message: 'syntax error', line: 2 } : { ok: true }; },
  });
  srv.close();
  assert.strictEqual(bodies.length, 2);
  const b = bodies[0].body;
  assert.strictEqual(b.model, 'claude-opus-5-5');
  assert.strictEqual(b.fallbacks, 'default');
  assert.match(bodies[0].headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.match(b.system, /orders: qty/);
  assert.match(b.system, /CustomValidate\(\$values, &\$errors, \$page\)/);
  assert.match(bodies[1].body.messages[2].content, /php -l/);
  assert.strictEqual(lints, 1);
  assert.match(r.code, /^<\?php\n\/\/ quantità/);
  assert.strictEqual(r.note, 'Impedisce quantità negative.');
});
