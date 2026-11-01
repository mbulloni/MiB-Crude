import { useEffect, useRef, useState, type ReactNode } from 'react';
import { call, mc } from '../api';
import { reloadFromDisk, run, save, saveSecrets, toast, useStore } from '../store';
import type { Nav } from '../types';
import { Btn, Hero, I, Row, Section, Text } from './ui';

export function itemOfNav(nav: Nav): string | null {
  switch (nav.kind) {
    case 'table': return `table:${nav.id}`;
    case 'menu': return 'menu';
    case 'security': return 'security';
    case 'events': return 'events:_global';
    case 'lang': return 'lang';
    default: return null;
  }
}

/** Team server wiring: events from the main process + automatic lock of the item being edited. */
export function useTeamLocks() {
  const nav = useStore((s) => s.nav);
  const connected = useStore((s) => s.team.connected);
  const held = useRef<string | null>(null);
  useEffect(() => mc().onTeamEvent((e) => {
    const S = useStore.getState();
    if (e.type === 'locks') S.set({ team: { ...S.team, locks: e.locks } });
    else if (e.type === 'presence') S.set({ team: { ...S.team, presence: e.presence } });
    else if (e.type === 'disconnected') { S.set({ team: { ...S.team, connected: false } }); toast('Disconnesso dal server del team', 'err'); }
    else if (e.type === 'chat') toast(`${e.user}: ${e.text}`, 'info', 8000);
    else if (e.type === 'changed') {
      if (e.conflicts?.length) toast(`Conflitto su ${e.conflicts.join(', ')}: modificato anche da ${e.by}`, 'err');
      if (!e.files.length) return;
      if (!S.dirty) reloadFromDisk().then(() => toast(`${e.by} ha aggiornato ${e.files.length} file`, 'info'));
      else S.set({ remoteChanged: [...new Set([...S.remoteChanged, ...e.files])] });
    } else if (e.type === 'put-problems') {
      for (const d of e.denied) toast(`${d.rel}: ${d.reason}`, 'err');
      for (const c of e.conflicts) toast(`${c.rel}: modificato da un altro sviluppatore, risolvi in Team`, 'err');
    }
  }), []);
  useEffect(() => {
    if (!connected) { held.current = null; return; }
    const want = itemOfNav(nav);
    const prev = held.current;
    if (prev === want) return;
    (async () => {
      if (prev) { if (useStore.getState().dirty) await save().catch(() => {}); await call('team:unlock', prev).catch(() => {}); }
      held.current = null;
      if (want) { const r = await call('team:lock', want).catch(() => ({ ok: false })); if (r.ok) held.current = want; }
    })();
  }, [nav, connected]);
}

/** Read-only state and banner for an item locked by someone else. */
export function useItemLock(item: string): { readOnly: boolean; banner: ReactNode } {
  const team = useStore((s) => s.team);
  const l = team.connected ? team.locks[item] : undefined;
  if (!l || l.user === team.user) return { readOnly: false, banner: team.connected && l ? <span className="lock mine"><I n="lock-fill" /> In modifica da te</span> : null };
  return { readOnly: true, banner: <span className="banner-inline warn"><I n="lock-fill" /> In modifica da <b>{l.user}</b>: sola lettura</span> };
}

export default function TeamPanel() {
  const p = useStore((s) => s.proj)!;
  const secrets = useStore((s) => s.secrets);
  const team = useStore((s) => s.team);
  const [git, setGit] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [diff, setDiff] = useState<{ file: string; text: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [remote, setRemote] = useState('');
  const [srv, setSrv] = useState(secrets.team || { url: 'ws://localhost:7300', user: '', token: '', project: p.project.name });
  const [chat, setChat] = useState('');
  const refresh = async () => { const st = await call('git:status'); setGit(st); setRemote(st.remote || ''); setLog(await call('git:log')); };
  useEffect(() => { refresh(); }, []);
  const connect = () => run('Connessione al server…', async () => {
    if (useStore.getState().dirty) await save();
    await saveSecrets({ team: srv });
    const st = await call('team:connect', srv.url, srv.user, srv.token, srv.project);
    useStore.getState().set({ team: st });
    if (st.sync.downloaded.length) await reloadFromDisk();
    toast(`Connesso: ${st.sync.downloaded.length} file ricevuti, ${st.sync.uploaded.length} inviati${st.sync.conflicts.length ? `, ${st.sync.conflicts.length} conflitti` : ''}`, st.sync.conflicts.length ? 'err' : 'ok');
  });
  const publish = () => run('Pubblicazione sul server…', async () => {
    if (useStore.getState().dirty) await save();
    await saveSecrets({ team: srv });
    const st = await call('team:publish', srv.url, srv.user, srv.token, srv.project);
    useStore.getState().set({ team: st });
    toast(`Progetto ${srv.project} pubblicato sul server: gli altri sviluppatori possono aprirlo`, 'ok');
  });

  return (
    <div className="panel">
      <Hero icon="people" title="Team e versioni" chips={[
        team.connected ? ['broadcast', `Server: ${team.project} · ${team.presence.length} online`] : ['wifi-off', 'Server del team non collegato'],
        git?.repo ? ['git', `Git: ${git.branch}${git.files?.length ? ` · ${git.files.length} modifiche` : ''}${git.ahead ? ` · ${git.ahead} da inviare` : ''}`] : ['git', 'Nessun repository Git'],
      ]} />
      <div className="cols">
        <Section title={<><I n="broadcast" /> Server del team (tempo reale)</>} help="Come phpr MultiDev, ma più fine: chi apre una tabella, il menu, la sicurezza o gli eventi globali li blocca per gli altri; ogni salvataggio arriva subito agli altri sviluppatori. Lo storico è versionato con Git sul server.">
          {!team.connected ? <>
            <Row label="Server"><Text value={srv.url} onChange={(v) => setSrv({ ...srv, url: v })} mono /></Row>
            <Row label="Utente"><Text value={srv.user} onChange={(v) => setSrv({ ...srv, user: v })} /></Row>
            <Row label="Token"><Text type="password" value={srv.token} onChange={(v) => setSrv({ ...srv, token: v })} /></Row>
            <Row label="Progetto sul server"><Text value={srv.project} onChange={(v) => setSrv({ ...srv, project: v })} mono /></Row>
            <div className="inline"><Btn kind="primary" icon="plug" onClick={connect}>Connetti</Btn><Btn icon="cloud-upload" onClick={publish}>Pubblica questo progetto sul server</Btn></div>
            <p className="help">Avvio del server: <code>npm run server -- --data ./team-data</code> · utenti: <code>node server/mibcrude-server.cjs --data ./team-data --add-user nome</code></p>
          </> : <>
            <p className="ok"><I n="check-circle" /> Connesso come <b>{team.user}</b> al progetto <b>{team.project}</b> <Btn small onClick={async () => { await call('team:disconnect'); useStore.getState().set({ team: { ...team, connected: false } }); }}>Disconnetti</Btn></p>
            <h4>Online</h4>
            <ul className="people">{team.presence.map((x) => <li key={x.id}><I n="person-circle" /> <b>{x.user}</b> {x.focus && <small className="muted">· {x.focus}</small>}</li>)}</ul>
            <h4>Elementi bloccati</h4>
            {Object.keys(team.locks).length ? <ul className="people">{Object.entries(team.locks).map(([k, l]) => <li key={k}><I n="lock-fill" /> {k} — {l.user}</li>)}</ul> : <p className="help">Nessuno</p>}
            {team.conflicts.length > 0 && <><h4 className="warn">Conflitti</h4><ul className="problems">{team.conflicts.map((c) => <li key={c} className="error">{c}</li>)}</ul>
              <p className="help">Il file è stato modificato sia da te sia sul server. Usa Git (a destra) per confrontare oppure ricarica dal server riconnettendoti dopo aver annullato la tua modifica.</p></>}
            <div className="inline"><input className="inp" placeholder="Messaggio al team…" value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && chat.trim()) { call('team:chat', chat); setChat(''); } }} /></div>
          </>}
        </Section>
        <Section title={<><I n="git" /> Git</>} actions={<Btn small icon="arrow-clockwise" onClick={refresh} />} help="Il progetto è fatto di piccoli file JSON e PHP ordinati: diff leggibili e merge puliti. Password e output sono esclusi (.gitignore).">
          {git && !git.repo ? <Btn icon="git" onClick={() => run('git init', async () => { await call('git:init'); await refresh(); })}>Inizializza repository</Btn> : git && <>
            <p>Branch <b>{git.branch}</b>{git.ahead ? ` · ${git.ahead} da inviare` : ''}{git.behind ? ` · ${git.behind} da ricevere` : ''}</p>
            <Row label="Remoto"><span className="inline"><Text value={remote} onChange={setRemote} mono placeholder="git@github.com:team/progetto.git" /><Btn small onClick={() => run('Remoto…', async () => { await call('git:setRemote', remote); await refresh(); })}>Imposta</Btn></span></Row>
            {git.conflicts.length > 0 && <div className="card warn"><b>Conflitti di merge</b>{git.conflicts.map((f: string) => <div className="inline" key={f}><span className="mono">{f}</span><span className="grow" />
              <Btn small onClick={() => run('Risoluzione…', async () => { await call('git:resolve', f, 'ours'); await refresh(); await reloadFromDisk(); })}>Tieni la mia</Btn>
              <Btn small onClick={() => run('Risoluzione…', async () => { await call('git:resolve', f, 'theirs'); await refresh(); await reloadFromDisk(); })}>Tieni la loro</Btn></div>)}</div>}
            <h4>Modifiche ({git.files.length})</h4>
            <ul className="git-files">{git.files.map((f: any) => <li key={f.file}><code>{f.code}</code> <a onClick={async () => setDiff({ file: f.file, text: await call('git:diff', f.file) })}>{f.file}</a></li>)}</ul>
            <div className="inline"><input className="inp" placeholder="Descrizione della modifica" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <Btn kind="primary" icon="check2" disabled={!git.files.length} onClick={() => run('Commit…', async () => { if (useStore.getState().dirty) await save(); await call('git:commit', msg); setMsg(''); await refresh(); })}>Commit</Btn></div>
            <div className="inline"><Btn icon="cloud-download" onClick={() => run('Pull…', async () => { const r = await call('git:pull'); await refresh(); await reloadFromDisk(); toast(r.conflicts.length ? `Conflitti: ${r.conflicts.join(', ')}` : 'Aggiornato', r.conflicts.length ? 'err' : 'ok'); })}>Ricevi (pull)</Btn>
              <Btn icon="cloud-upload" onClick={() => run('Push…', async () => { await call('git:push'); await refresh(); toast('Inviato', 'ok'); })}>Invia (push)</Btn></div>
            {diff && <div className="diff"><div className="inline"><b className="mono">{diff.file}</b><span className="grow" /><Btn small kind="ghost" icon="x-lg" onClick={() => setDiff(null)} /></div>
              <pre>{diff.text.split('\n').map((l, i) => <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}</div>)}</pre></div>}
            <h4>Storico</h4>
            <ul className="log-list">{log.map((c) => <li key={c.hash}><code>{c.hash}</code> {c.subject} <small className="muted">— {c.author}, {c.date}</small></li>)}</ul>
          </>}
        </Section>
      </div>
    </div>
  );
}
