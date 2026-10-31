// Scheduled tasks (runtime/lib/Tasks.php): settings.tasks holds name, title, cron expression and on/off,
// the PHP code is the global event Task_<name>(&$message). The generated cron.php runs them.
import { useState } from 'react';
import { update, useStore } from '../store';
import CodeEditor from './CodeEditor';
import { useItemLock } from './TeamPanel';
import { Btn, Check, I, Row, Section, Select, Text } from './ui';

interface Task { name: string; title?: string; cron: string; enabled?: boolean }

const PRESETS: [string, string][] = [
  ['*/5 * * * *', 'Ogni 5 minuti'], ['*/15 * * * *', 'Ogni 15 minuti'], ['0 * * * *', 'Ogni ora'],
  ['0 7 * * *', 'Ogni giorno alle 7:00'], ['0 7 * * 1-5', 'Dal lunedì al venerdì alle 7:00'], ['0 8 * * 1', 'Ogni lunedì alle 8:00'],
  ['0 6 1 * *', 'Il primo del mese alle 6:00'], ['', 'Personalizzata (espressione cron)'],
];
const SAMPLE = `<?php
// Attività pianificata: $message compare in Amministrazione › Attività pianificate.
// return false (o un'eccezione) = esito «Errore».
$n = DB::Query("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'")->fetchAssoc()['n'];
if ($n > 0) runner_mail(['to' => 'ufficio@example.com', 'subject' => 'Ordini da evadere', 'body' => "Ci sono $n ordini nuovi"]);
$message = "$n ordini nuovi";
`;
const okName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

export default function TasksSection() {
  const p = useStore((s) => s.proj)!;
  const tasks = ((p.project.settings as { tasks?: Task[] }).tasks || []);
  const lock = useItemLock('events:_global');
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const setTasks = (fn: (t: Task[]) => Task[]) => update((d) => { const st = d.project.settings as { tasks?: Task[] }; st.tasks = fn([...(st.tasks || [])]); if (!st.tasks.length) delete st.tasks; });
  const patch = (n: string, x: Partial<Task>) => setTasks((all) => all.map((t) => (t.name === n ? { ...t, ...x } : t)));
  const add = () => {
    const n = okName(name);
    if (!n || tasks.some((t) => t.name === n)) return;
    setTasks((all) => [...all, { name: n, title: name.trim(), cron: '0 7 * * *', enabled: true }]);
    update((d) => { d.events._global = { ...(d.events._global || {}), [`Task_${n}`]: SAMPLE }; });
    setName(''); setOpen(n);
  };
  const remove = (n: string) => {
    setTasks((all) => all.filter((t) => t.name !== n));
    update((d) => { if (d.events._global) { const g = { ...d.events._global }; delete g[`Task_${n}`]; d.events._global = g; } });
  };
  return (
    <Section title="Attività pianificate" help="Codice PHP eseguito a orari fissi (report via email, pulizie, sincronizzazioni). Il sistema deve lanciare ogni minuto cron.php dell'app generata: su Linux nel crontab (* * * * * php /percorso/app/cron.php), su Windows con l'Utilità di pianificazione. Esito ed «Esegui ora» in Amministrazione › Attività pianificate.">
      {tasks.map((t) => {
        const code = (p.events._global || {})[`Task_${t.name}`] || '';
        const preset = PRESETS.some(([c]) => c === t.cron) ? t.cron : '';
        return (
          <div key={t.name} className="region-box">
            <div className="inline">
              <Btn small kind="ghost" icon={open === t.name ? 'chevron-down' : 'chevron-right'} onClick={() => setOpen(open === t.name ? null : t.name)} />
              <I n="clock-history" /> <b>{t.title || t.name}</b> <code className="muted">{t.cron}</code>
              {t.enabled === false && <span className="muted">(disattivata)</span>}
              <span className="grow" />
              <Btn small kind="ghost" icon="trash" title="Elimina l'attività" onClick={() => remove(t.name)} disabled={lock.readOnly} />
            </div>
            {open === t.name && <>
              <Row label="Titolo"><Text value={t.title} onChange={(v) => patch(t.name, { title: v })} /></Row>
              <Row label="Quando" hint="Espressione cron: minuto ora giorno mese giorno-della-settimana (0 = domenica)">
                <span className="inline"><Select value={preset} options={PRESETS} onChange={(v) => { if (v) patch(t.name, { cron: v }); }} />
                  <Text value={t.cron} onChange={(v) => patch(t.name, { cron: v })} mono /></span></Row>
              <Row label=" "><Check value={t.enabled !== false} onChange={(v) => patch(t.name, { enabled: v })} label="Attiva" /></Row>
              {lock.banner}
              <CodeEditor value={code} readOnly={lock.readOnly} height={220}
                onChange={(v) => update((d) => { d.events._global = { ...(d.events._global || {}), [`Task_${t.name}`]: v }; })} />
              <p className="help">Evento <code>Task_{t.name}(&amp;$message)</code>: stesse funzioni degli altri eventi (<code>db()</code>, <code>DB::Query</code>, <code>sendMail</code>, <code>addNotification</code>…). Prova da terminale: <code>php cron.php --run {t.name}</code>.</p>
            </>}
          </div>
        );
      })}
      <div className="inline">
        <Text value={name} onChange={setName} placeholder="Nome, es. riepilogo ordini" />
        <Btn small icon="plus" onClick={add} disabled={!okName(name) || lock.readOnly}>Nuova attività</Btn>
      </div>
    </Section>
  );
}
