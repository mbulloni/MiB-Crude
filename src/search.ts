// Search in the whole project: names, labels, SQL, event code, menu, reports/charts/dashboards, translations,
// header/footer/menu code, scheduled tasks and email templates. Pure function, used by SearchDialog.
import type { Nav, Project } from './types';

export interface Hit { where: string; what: string; text: string; line?: number; nav: Nav }

type L = Record<string, string> | string | undefined | null;
const flat = (v: L) => (v == null ? '' : typeof v === 'string' ? v : [...new Set(Object.values(v).filter(Boolean))].join(' · '));

export function searchProject(p: Project, query: string, max = 300): Hit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: Hit[] = [];
  const add = (h: Hit) => { if (out.length < max) out.push(h); };
  const text = (where: string, what: string, value: L, nav: Nav) => {
    const s = flat(value);
    if (s && s.toLowerCase().includes(q)) add({ where, what, text: s.length > 160 ? s.slice(0, 160) + '…' : s, nav });
  };
  // every line of a piece of code that contains the text
  const code = (where: string, what: string, src: string | undefined, nav: Nav) => {
    if (!src || !src.toLowerCase().includes(q)) return;
    src.split('\n').forEach((l, i) => { if (l.toLowerCase().includes(q)) add({ where, what, text: l.trim().slice(0, 160), line: i + 1, nav }); });
  };

  text('Progetto', 'Nome', p.project.name, { kind: 'project' });
  for (const c of p.connections) text('Connessioni', c.name, `${c.id} ${c.name} ${(c as { database?: string }).database || ''}`, { kind: 'connections' });
  for (const t of p.tables) {
    const nav = (tab: string): Nav => ({ kind: 'table', id: t.name, tab });
    text(`Tabella ${t.name}`, 'Nome', t.name, nav('general'));
    text(`Tabella ${t.name}`, 'Etichetta', t.caption as L, nav('general'));
    code(`Tabella ${t.name}`, 'Query SQL', t.source.sql, nav('general'));
    text(`Tabella ${t.name}`, 'Origine', `${t.source.table || ''} ${t.source.path || ''} ${t.source.procedure || ''}`.trim(), nav('general'));
    text(`Tabella ${t.name}`, 'Filtro fisso', (t as { where?: string }).where, nav('general'));
    for (const f of t.fields) {
      text(`Tabella ${t.name}`, `Campo ${f.name}`, `${f.name} ${flat(f.label as L)}`, nav('fields'));
      const lk = (f.editAs as { lookup?: { table?: string; where?: string; display?: string } }).lookup;
      if (lk) text(`Tabella ${t.name}`, `Lookup di ${f.name}`, `${lk.table || ''} ${lk.display || ''} ${lk.where || ''}`.trim(), nav('fields'));
    }
    for (const [ev, src] of Object.entries(p.events[t.name] || {})) code(`Tabella ${t.name}`, `Evento ${ev}`, src, nav('events'));
  }
  for (const [ev, src] of Object.entries(p.events._global || {})) code(ev.startsWith('Task_') ? 'Attività pianificate' : 'Eventi globali', ev, src, ev.startsWith('Task_') ? { kind: 'project' } : { kind: 'events' });
  const walk = (items: { label?: L; url?: string; table?: string; items?: unknown[] }[]) => {
    for (const m of items || []) {
      text('Menu', flat(m.label) || m.table || m.url || 'voce', `${flat(m.label)} ${m.url || ''}`.trim(), { kind: 'menu' });
      walk((m.items || []) as typeof items);
    }
  };
  walk(p.menu.items as Parameters<typeof walk>[0]);
  for (const r of p.reports) text('Report', r.name, `${r.name} ${flat((r as { title?: L }).title)}`, { kind: 'reports' });
  for (const c of p.charts) text('Grafici', c.name, `${c.name} ${flat((c as { title?: L }).title)}`, { kind: 'charts' });
  for (const d of p.dashboards) text('Dashboard', d.name, `${d.name} ${flat((d as { title?: L }).title)}`, { kind: 'dashboards' });
  for (const [lang, dict] of Object.entries(p.lang || {})) for (const [k, v] of Object.entries(dict)) text(`Lingue (${lang})`, k, `${k} = ${v}`, { kind: 'lang' });
  const st = p.project.settings as { regions?: Record<string, { code?: string; file?: string }>; tasks?: { name: string; title?: string; cron: string }[]; mailTemplates?: Record<string, { subject?: L; body?: L }> };
  for (const [name, r] of Object.entries(st.regions || {})) { code('Intestazione, piè di pagina e menu', name, r.code, { kind: 'project' }); text('Intestazione, piè di pagina e menu', name, r.file, { kind: 'project' }); }
  for (const t of st.tasks || []) text('Attività pianificate', t.name, `${t.name} ${t.title || ''} ${t.cron}`, { kind: 'project' });
  for (const [name, m] of Object.entries(st.mailTemplates || {})) { text('Modelli email', `${name}: oggetto`, m.subject, { kind: 'project' }); code('Modelli email', `${name}: testo`, flat(m.body), { kind: 'project' }); }
  return out;
}
