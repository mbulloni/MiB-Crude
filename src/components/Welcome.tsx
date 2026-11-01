import { useEffect, useState } from 'react';
import { MergeReports, TABLE_MODES, mergePhpr } from './PhprMerge';
import { call } from '../api';
import { openProject, run, toast } from '../store';
import type { Project } from '../types';
import { Btn, I, Modal, Row, Select, Text } from './ui';
import { checkUpdates } from './Updates';

export default function Welcome() {
  const [info, setInfo] = useState<any>(null);
  const [dlg, setDlg] = useState<'' | 'new' | 'git' | 'team' | 'phpr'>('');
  const [report, setReport] = useState<any>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [mergeMode, setMergeMode] = useState('auto');
  const [merged, setMerged] = useState<any[] | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { call('app:info').then((i) => { setInfo(i); if (i.openOnStart) open(i.openOnStart); }); }, []);
  const recent: string[] = info?.settings?.recent || [];
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const pickDir = async (k: string, title: string) => { const d = await call<string | null>('dialog:dir', title, f[k] || info?.home); if (d) setF({ ...f, [k]: d }); };

  const open = (dir?: string) => run('Apertura…', async () => {
    const d = dir || await call<string | null>('dialog:dir', 'Apri progetto MiB-Crude');
    if (!d) return;
    await openProject(await call<Project>('project:open', d));
  });
  const create = () => run('Creazione…', async () => {
    if (!f.dir || !f.name) throw new Error('Indica nome e cartella');
    const dir = `${f.dir.replace(/\/$/, '')}/${f.name}`;
    await openProject(await call<Project>('project:new', dir, f.name));
    toast('Progetto creato: aggiungi una connessione al database', 'ok');
  });
  const importPhpr = () => run(extra.length ? `Importazione e unione di ${extra.length + 1} progetti phpr…` : 'Importazione progetto phpr…', async () => {
    if (!f.phpr || !f.dir) throw new Error('Indica il file .phpr e la cartella di destinazione');
    const r = await call<any>('import:phpr', f.phpr, f.dir);
    // other .phpr files: merged into the new project, one application (saved, the project is not open yet)
    if (extra.length) {
      const m = await mergePhpr(r.proj, extra, mergeMode, '', true);
      r.proj = m.proj;
      r.merged = m.reports;
    }
    setDlg('');
    setReport(r);
  });
  const clone = () => run('Clonazione…', async () => {
    if (!f.url || !f.dir) throw new Error('Indica URL e cartella');
    const name = f.url.split('/').pop()!.replace(/\.git$/, '');
    const proj = await call<Project>('git:clone', f.url, `${f.dir.replace(/\/$/, '')}/${name}`);
    await openProject(await call<Project>('project:open', proj.dir));
  });
  const checkout = () => run('Download dal server…', async () => {
    if (!f.server || !f.user || !f.token || !f.project || !f.dir) throw new Error('Compila tutti i campi');
    const dir = `${f.dir.replace(/\/$/, '')}/${f.project}`;
    const proj = await call<Project>('team:checkout', f.server, f.user, f.token, f.project, dir);
    await openProject(proj);
    await call('secrets:set', { ...(await call('secrets:get')), team: { url: f.server, user: f.user, token: f.token, project: f.project } });
    await openProject(await call<Project>('project:open', dir));
    toast(`Connesso al progetto di team ${f.project}`, 'ok');
  });

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand"><img src="./icon.png" alt="" /><div><h1>MiB-Crude</h1><p>Generatore visuale di applicazioni web PHP · multisviluppatore · v{__APP_VERSION__} · <a onClick={() => checkUpdates(false)}>controlla aggiornamenti</a></p></div></div>
        <div className="welcome-actions">
          <button className="big-action" onClick={() => setDlg('new')}><I n="plus-square" /><b>Nuovo progetto</b><span>Parti da un database esistente</span></button>
          <button className="big-action" onClick={() => open()}><I n="folder2-open" /><b>Apri progetto</b><span>Cartella con mibcrude.json</span></button>
          <button className="big-action" onClick={() => setDlg('git')}><I n="git" /><b>Clona da Git</b><span>Lavoro in team via repository</span></button>
          <button className="big-action" onClick={() => setDlg('team')}><I n="people" /><b>Server del team</b><span>Modifica condivisa in tempo reale</span></button>
          <button className="big-action" onClick={() => setDlg('phpr')}><I n="box-arrow-in-down" /><b>Importa progetto .phpr</b><span>Converte un progetto .phpr</span></button>
        </div>
        {recent.length > 0 && <>
          <h3>Recenti</h3>
          <ul className="recent">{recent.map((d) => <li key={d}><button onClick={() => open(d)}><I n="folder" /> <b>{d.split('/').pop()}</b> <small>{d}</small></button></li>)}</ul>
        </>}
      </div>
      {dlg === 'new' && <Modal title="Nuovo progetto" onClose={() => setDlg('')} footer={<><Btn onClick={() => setDlg('')}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={create}>Crea</Btn></>}>
        <Row label="Nome"><Text value={f.name} onChange={(v) => set('name')(v.replace(/[^A-Za-z0-9_.-]/g, '_'))} placeholder="gestionale" /></Row>
        <Row label="Cartella padre" hint={f.dir && f.name ? `Il progetto sarà in ${f.dir}/${f.name}` : 'Il progetto è una cartella di file di testo: mettila sotto Git per lavorare in team'}>
          <span className="inline"><Text value={f.dir} onChange={set('dir')} /><Btn icon="folder" onClick={() => pickDir('dir', 'Cartella padre')} /></span></Row>
      </Modal>}
      {dlg === 'phpr' && <Modal title="Importa un progetto phpr" onClose={() => setDlg('')} footer={<><Btn onClick={() => setDlg('')}>Annulla</Btn><Btn kind="primary" icon="box-arrow-in-down" onClick={importPhpr}>Importa</Btn></>}>
        <p className="help">Converte tabelle, query SQL, campi, lookup, pagine (dall'archivio PAGES*.sqlite accanto al file), master-dettaglio, menu, gruppi e permessi, grafici ed eventi PHP. Gli eventi phpr funzionano grazie allo strato di compatibilità (DB::Query, Security::getUserName, $pageObject…). Il progetto originale non viene modificato.</p>
        <Row label="File .phpr"><span className="inline"><Text value={f.phpr} onChange={set('phpr')} mono /><Btn icon="file-earmark" onClick={async () => { const p = await call<string | null>('dialog:file', 'Progetto phpr', [{ name: 'phpr', extensions: ['phpr'] }]); if (p) setF({ ...f, phpr: p }); }} /></span></Row>
        <Row label="Altri .phpr da unire" hint="Facoltativo: diventano un'unica applicazione con il primo (stesso database = stessa connessione, menu sotto il nome di ciascun progetto)"><span className="inline wrap">
          {extra.map((x) => <span key={x} className="chip"><I n="file-earmark-code" /> {x.split('/').pop()} <button type="button" className="btn ghost sm" onClick={() => setExtra(extra.filter((y) => y !== x))}><I n="x" /></button></span>)}
          <Btn icon="plus-lg" onClick={async () => { const fs = await call<string[]>('dialog:files', 'Progetti phpr da unire', [{ name: 'phpr', extensions: ['phpr'] }]); setExtra([...extra, ...fs.filter((x) => !extra.includes(x) && x !== f.phpr)]); }}>Aggiungi</Btn></span></Row>
        {extra.length > 0 && <Row label="Tabelle con lo stesso nome"><Select value={mergeMode} options={TABLE_MODES} onChange={setMergeMode} /></Row>}
        <Row label="Cartella padre" hint="Verrà creata una nuova cartella con il nome del progetto"><span className="inline"><Text value={f.dir} onChange={set('dir')} /><Btn icon="folder" onClick={() => pickDir('dir', 'Cartella padre')} /></span></Row>
      </Modal>}
      {report && <Modal wide title="Importazione completata" onClose={() => setReport(null)} footer={<><Btn icon="file-text" onClick={() => call('shell:openPath', report.reportFile)}>Apri il rapporto</Btn>{report.merged && <Btn icon="intersect" onClick={() => setMerged(report.merged)}>Unione ({report.merged.length})</Btn>}<Btn kind="primary" onClick={async () => { const r = report; setReport(null); await openProject(r.proj); }}>Apri il progetto</Btn></>}>
        <ul className="problems">
          <li><I n="table" /> {report.report.tables} tabelle (di cui {report.report.sqlViews} query SQL), {report.report.charts} grafici</li>
          <li><I n="lightning" /> {report.report.events} eventi convertiti, {report.report.eventsSkipped.length} da rivedere (JavaScript o non supportati, salvati in import-phpr/)</li>
          <li><I n="database" /> Connessioni: {report.report.connections.join(', ')} — password salvate solo in .mibcrude-local</li>
          {report.merged && <li><I n="intersect" /> Uniti: {report.merged.map((m: any) => `${m.report.label} (${m.report.tablesAdded.length} tabelle)`).join(', ')} — un'unica applicazione</li>}
          <li><I n="window-stack" /> Pagine: {report.report.pagesFile ? report.report.pagesFile.split('/').pop() : 'archivio assente, tutti i campi in tutte le pagine'}</li>
        </ul>
        {report.report.warnings.length > 0 && <><h4>Avvisi ({report.report.warnings.length})</h4><ul className="problems">{report.report.warnings.slice(0, 40).map((w: string, i: number) => <li key={i} className="warning">{w}</li>)}</ul></>}
      </Modal>}
      {merged && <MergeReports reports={merged} onClose={() => setMerged(null)} />}
      {dlg === 'git' && <Modal title="Clona un progetto da Git" onClose={() => setDlg('')} footer={<><Btn onClick={() => setDlg('')}>Annulla</Btn><Btn kind="primary" icon="download" onClick={clone}>Clona</Btn></>}>
        <Row label="URL repository"><Text value={f.url} onChange={set('url')} placeholder="git@github.com:team/gestionale.git" mono /></Row>
        <Row label="Cartella padre"><span className="inline"><Text value={f.dir} onChange={set('dir')} /><Btn icon="folder" onClick={() => pickDir('dir', 'Cartella padre')} /></span></Row>
      </Modal>}
      {dlg === 'team' && <Modal title="Apri un progetto dal server del team" onClose={() => setDlg('')} footer={<><Btn onClick={() => setDlg('')}>Annulla</Btn><Btn kind="primary" icon="cloud-download" onClick={checkout}>Scarica e apri</Btn></>}>
        <p className="help">Il server si avvia con <code>node server/mibcrude-server.cjs --data cartella</code>; l'amministratore crea gli utenti con <code>--add-user nome</code>. Per pubblicare un progetto locale sul server usa la sezione <b>Team</b> del progetto.</p>
        <Row label="Server"><Text value={f.server} onChange={set('server')} placeholder="ws://server:7300" mono /></Row>
        <Row label="Utente"><Text value={f.user} onChange={set('user')} /></Row>
        <Row label="Token"><Text value={f.token} onChange={set('token')} type="password" /></Row>
        <Row label="Progetto"><Text value={f.project} onChange={set('project')} /></Row>
        <Row label="Cartella padre"><span className="inline"><Text value={f.dir} onChange={set('dir')} /><Btn icon="folder" onClick={() => pickDir('dir', 'Cartella padre')} /></span></Row>
      </Modal>}
    </div>
  );
}
