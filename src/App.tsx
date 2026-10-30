import { useEffect } from 'react';
import { call, mc } from './api';
import { reloadFromDisk, run, save, toast, useStore } from './store';
import type { Nav } from './types';
import Welcome from './components/Welcome';
import { Btn, I, lbl } from './components/ui';
import ProjectPanel from './components/ProjectPanel';
import ConnectionsPanel from './components/ConnectionsPanel';
import TablesPanel from './components/TablesPanel';
import TableEditor from './components/TableEditor';
import MenuPanel from './components/MenuPanel';
import SecurityPanel from './components/SecurityPanel';
import GlobalEvents from './components/GlobalEvents';
import { ChartsPanel, DashboardsPanel, ReportsPanel } from './components/ReportsPanel';
import LanguagesPanel from './components/LanguagesPanel';
import OutputPanel from './components/OutputPanel';
import TeamPanel, { itemOfNav, useTeamLocks } from './components/TeamPanel';

const sameNav = (a: Nav, b: Nav) => a.kind === b.kind && (a as any).id === (b as any).id;

function NavItem({ nav, icon, label, badge, sub }: { nav: Nav; icon: string; label: string; badge?: string | number; sub?: boolean }) {
  const cur = useStore((s) => s.nav);
  const locks = useStore((s) => s.team.locks);
  const me = useStore((s) => s.team.user);
  const item = itemOfNav(nav);
  const lock = item ? locks[item] : undefined;
  return (
    <button className={`nav-item ${sameNav(cur, nav) ? 'on' : ''} ${sub ? 'sub' : ''}`} onClick={() => useStore.getState().set({ nav })}>
      <I n={icon} /><span className="grow">{label}</span>
      {lock && <span className={`lock ${lock.user === me ? 'mine' : ''}`} title={`In modifica: ${lock.user}`}><I n="lock-fill" /> {lock.user === me ? '' : lock.user}</span>}
      {badge !== undefined && <span className="badge">{badge}</span>}
    </button>
  );
}

function Sidebar() {
  const p = useStore((s) => s.proj)!;
  return (
    <aside className="sidebar">
      <div className="sb-group">Progetto</div>
      <NavItem nav={{ kind: 'project' }} icon="gear" label="Impostazioni e stile" />
      <NavItem nav={{ kind: 'connections' }} icon="database" label="Connessioni" badge={p.connections.length} />
      <div className="sb-group">Dati</div>
      <NavItem nav={{ kind: 'tables' }} icon="table" label="Tabelle e query" badge={p.tables.length} />
      {p.tables.map((t) => <NavItem key={t.name} sub nav={{ kind: 'table', id: t.name }} icon={t.source.type === 'sql' ? 'code-square' : t.readOnly ? 'eye' : 'grid-3x3'} label={lbl(t.caption, t.name)} />)}
      <div className="sb-group">Applicazione</div>
      <NavItem nav={{ kind: 'menu' }} icon="list-nested" label="Menu" />
      <NavItem nav={{ kind: 'security' }} icon="shield-lock" label="Sicurezza" />
      <NavItem nav={{ kind: 'events' }} icon="lightning" label="Eventi globali" />
      <NavItem nav={{ kind: 'reports' }} icon="file-earmark-bar-graph" label="Report" badge={p.reports.length || undefined} />
      <NavItem nav={{ kind: 'charts' }} icon="bar-chart" label="Grafici" badge={p.charts.length || undefined} />
      <NavItem nav={{ kind: 'dashboards' }} icon="speedometer2" label="Dashboard" badge={p.dashboards.length || undefined} />
      <NavItem nav={{ kind: 'lang' }} icon="translate" label="Lingue" />
      <div className="sb-group">Rilascio</div>
      <NavItem nav={{ kind: 'output' }} icon="rocket-takeoff" label="Genera e pubblica" />
      <NavItem nav={{ kind: 'team' }} icon="people" label="Team e versioni" />
    </aside>
  );
}

function Main() {
  const nav = useStore((s) => s.nav);
  switch (nav.kind) {
    case 'project': return <ProjectPanel />;
    case 'connections': return <ConnectionsPanel />;
    case 'tables': return <TablesPanel />;
    case 'table': return <TableEditor key={nav.id} name={nav.id} />;
    case 'menu': return <MenuPanel />;
    case 'security': return <SecurityPanel />;
    case 'events': return <GlobalEvents />;
    case 'reports': return <ReportsPanel />;
    case 'charts': return <ChartsPanel />;
    case 'dashboards': return <DashboardsPanel />;
    case 'lang': return <LanguagesPanel />;
    case 'output': return <OutputPanel />;
    case 'team': return <TeamPanel />;
  }
}

async function generateAndPreview() {
  const proj = useStore.getState().proj!;
  await run('Generazione…', async () => {
    if (useStore.getState().dirty) await save();
    const res = await call('gen:generate', proj, { debug: true });
    if (res.lint?.length) toast(`Errori PHP negli eventi: ${res.lint.map((l: any) => l.file).join(', ')}`, 'err');
    const st = await call('preview:start', proj);
    await call('preview:open', st.url, false);
    toast(`Anteprima su ${st.url} (PHP ${st.php})`, 'ok');
  });
}

export default function App() {
  const proj = useStore((s) => s.proj);
  const dirty = useStore((s) => s.dirty);
  const busy = useStore((s) => s.busy);
  const toasts = useStore((s) => s.toasts);
  const team = useStore((s) => s.team);
  const remote = useStore((s) => s.remoteChanged);
  useTeamLocks();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (useStore.getState().proj) run('Salvataggio…', save).then((r) => r && toast('Salvato', 'ok', 1500)); }
      if (e.key === 'F5' && useStore.getState().proj) { e.preventDefault(); generateAndPreview(); }
    };
    window.addEventListener('keydown', onKey);
    const off = mc().onClosing(async () => {
      if (useStore.getState().dirty && !confirm('Ci sono modifiche non salvate. Uscire senza salvare?')) return;
      call('app:quit');
    });
    return () => { window.removeEventListener('keydown', onKey); off(); };
  }, []);

  useEffect(() => { document.title = proj ? `${proj.project.name}${dirty ? ' •' : ''} — MiB-Crude` : 'MiB-Crude'; }, [proj?.project.name, dirty]);

  if (!proj) return <><Welcome />{busy && <div className="busy"><span className="spinner" /> {busy}</div>}<Toasts toasts={toasts} /></>;
  const close = async () => {
    if (dirty && !confirm('Chiudere senza salvare le modifiche?')) return;
    await call('project:close');
    useStore.getState().set({ proj: null, dirty: false, team: { connected: false, user: '', project: '', role: '', locks: {}, presence: [], conflicts: [] } });
  };
  return (
    <div className="app">
      <header className="toolbar">
        <img src="./icon.png" alt="" className="logo" />
        <b className="pname">{proj.project.name}</b>{dirty && <span className="dirty" title="Modifiche non salvate">●</span>}
        <Btn icon="save" onClick={() => run('Salvataggio…', save).then((r) => r && toast('Salvato', 'ok', 1500))} disabled={!dirty} title="Salva (Ctrl+S)">Salva</Btn>
        <span className="sep" />
        <Btn icon="play-fill" kind="primary" onClick={generateAndPreview} title="Genera e apri l'anteprima (F5)">Anteprima</Btn>
        <Btn icon="rocket-takeoff" onClick={() => useStore.getState().set({ nav: { kind: 'output' } })}>Pubblica</Btn>
        <span className="grow" />
        {team.connected
          ? <span className="team-pill" title={team.presence.map((p) => p.user + (p.focus ? ` (${p.focus})` : '')).join('\n')}><I n="people-fill" /> {team.project} · {team.presence.length} online</span>
          : null}
        <Btn icon="x-lg" kind="ghost" onClick={close} title="Chiudi progetto" />
      </header>
      {remote.length > 0 && <div className="banner warn"><I n="cloud-arrow-down" /> Modifiche ricevute dal team ({remote.slice(0, 4).join(', ')}{remote.length > 4 ? '…' : ''}).
        {dirty ? ' Hai modifiche non salvate: salva prima, poi ricarica.' : ''} <Btn small icon="arrow-clockwise" onClick={() => run('Ricarica…', reloadFromDisk)}>Ricarica</Btn></div>}
      <div className="body">
        <Sidebar />
        <main className="main"><Main /></main>
      </div>
      {busy && <div className="busy"><span className="spinner" /> {busy}</div>}
      <Toasts toasts={toasts} />
    </div>
  );
}

function Toasts({ toasts }: { toasts: { id: number; kind: string; text: string }[] }) {
  return <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}
