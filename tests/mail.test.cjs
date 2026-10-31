'use strict';
// Email templates: built-in mails with and without the project's template, sendTemplate() from code, per
// language, placeholders HTML-escaped in the body. Mails go to a tiny SMTP server of the test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFile } = require('node:child_process');
const P = require('../core/project.cjs');
const G = require('../core/generator.cjs');

const PHP = process.env.MIBCRUDE_PHP_BIN || 'php';
let dir;
let out;
let smtp;
const mails = [];

test.before(async () => {
  smtp = net.createServer((s) => {
    let data = false;
    let buf = '';
    s.write('220 test\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        if (data) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          mails.push(buf.slice(0, end));
          buf = buf.slice(end + 5);
          data = false;
          s.write('250 ok\r\n');
          continue;
        }
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^DATA/i.test(line)) { data = true; s.write('354 go\r\n'); } else if (/^QUIT/i.test(line)) { s.end('221 bye\r\n'); } else s.write('250 ok\r\n');
      }
    });
  });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mibcrude-mail-'));
  const proj = P.createProject(dir, 'mailapp');
  proj.connections.push({ id: 'main', name: 'Main', driver: 'sqlite', file: path.join(dir, 'app.sqlite') });
  proj.project.languages = ['it', 'en'];
  proj.project.mail = { from: 'App <app@example.com>', smtpHost: '127.0.0.1', smtpPort: smtp.address().port };
  proj.project.settings.mailTemplates = {
    forgot: { subject: { it: 'Password di {app}', en: '{app} password' }, body: { it: '<p>Ciao {username}: <a href="{link}">reimposta</a></p>', en: '<p>Hi {username}</p>' } },
    ordine_spedito: { subject: { it: 'Ordine {numero} spedito' }, body: { it: '<p>Il tuo ordine {numero} per {cliente} è partito. {sconosciuto}</p>' } },
  };
  P.saveProject(proj);
  out = G.generate(P.loadProject(dir), { secrets: {}, outDir: path.join(dir, 'out') }).outDir;
});

test.after(() => { if (smtp) smtp.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// PHP in a child process: the test's SMTP server answers in this process meanwhile
const php = (code, lang = 'it') => new Promise((resolve, reject) => execFile(PHP, ['-r', `$_SESSION = []; $_GET['lang'] = '${lang}'; require ${JSON.stringify(path.join(out, 'runtime', 'bootstrap.php'))}; new \\MiB\\App(${JSON.stringify(out)}); ${code}`],
  { encoding: 'utf8' }, (e, so, se) => (e ? reject(new Error(se || e.message)) : resolve(so))));
const subject = (m) => Buffer.from(m.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString();
const body = (m) => m.split('\r\n\r\n').slice(1).join('\r\n\r\n');

test('email templates: built-in mails, sendTemplate, languages, placeholders', async () => {
  // project template for "forgot", values escaped in the body
  await php(`var_export(\\MiB\\MailTemplates::builtin('forgot', 'a@x.it', ['username' => 'Rossi <b>', 'link' => 'http://h/?p=reset&token=1'], 'forgot.mail_subject', 'forgot.mail_body', ['Rossi', 'L']));`);
  let m = mails.pop();
  assert.strictEqual(subject(m), 'Password di mailapp');
  assert.match(body(m), /Ciao Rossi &lt;b&gt;: <a href="http:\/\/h\/\?p=reset&amp;token=1">reimposta<\/a>/);
  // English
  await php(`\\MiB\\MailTemplates::builtin('forgot', 'a@x.it', ['username' => 'Smith'], 'forgot.mail_subject', 'forgot.mail_body', ['Smith', 'L']);`, 'en');
  assert.strictEqual(subject(mails.pop()), 'mailapp password');
  // no template for "register": the standard texts
  await php(`\\MiB\\MailTemplates::builtin('register', 'a@x.it', ['username' => 'Bianchi'], 'register.mail_subject', 'register.mail_body', ['Bianchi', 'http://l']);`);
  m = mails.pop();
  assert.strictEqual(subject(m), 'Conferma la registrazione');
  assert.match(body(m), /Ciao Bianchi/);
  // from event code; an unknown placeholder stays; a missing template is false, nothing sent
  const r = await php(`var_export(sendTemplate('ordine_spedito', 'c@x.it', ['numero' => 12, 'cliente' => 'Verdi & C.'])); echo '|'; var_export(@sendTemplate('nessuno', 'c@x.it'));`);
  assert.strictEqual(r, 'true|false');
  m = mails.pop();
  assert.strictEqual(subject(m), 'Ordine 12 spedito');
  assert.match(body(m), /ordine 12 per Verdi &amp; C\. è partito\. \{sconosciuto\}/);
  assert.match(m, /^To: c@x\.it/m);
  assert.strictEqual(mails.length, 0);
});
