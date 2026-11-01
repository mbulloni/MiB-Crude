import { useEffect, useState } from 'react';
import { call, mc } from '../api';
import { run, save, saveSecrets, toast, useStore } from '../store';
import { Btn, Check, Hero, I, Modal, NavLayout, Row, Section, Select, Text } from './ui';
import DockerSection from './DockerSection';

interface Profile { id: string; name: string; type: 'folder' | 'sftp' | 'ftp'; host?: string; port?: number; user?: string; remoteDir: string; keyFile?: string; secure?: boolean; insecure?: boolean; uploadSecrets?: boolean; full?: boolean }

export default function OutputPanel() {
  const p = useStore((s) => s.proj)!;
  const secrets = useStore((s) => s.secrets);
  const [problems, setProblems] = useState<{ level: string; msg: string }[]>([]);
  const [result, setResult] = useState<any>(null);
  const [prev, setPrev] = useState<any>(null);
  const [php, setPhp] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; file: string } | null>(null);
  useEffect(() => {
    call('gen:check', p).then(setProblems);
    call('preview:status').then(setPrev);
    call('php:info').then(setPhp);
    call('local:get', 'deploy').then((d) => setProfiles(d || []));
    return mc().onDeployProgress(setProgress);
  }, []);
  const generate = (debug: boolean) => run('Generazione…', async () => {
    if (useStore.getState().dirty) await save();
    const r = await call('gen:generate', p, { debug });
    setResult(r);
    setProblems(r.problems);
    toast(`Applicazione generata in ${r.ms} ms (${r.changed.length + r.copied} file aggiornati)`, 'ok');
  });
  const startPreview = () => run('Avvio anteprima…', async () => {
    if (!result) await generate(true);
    const st = await call('preview:start', p);
    setPrev(st);
    await call('preview:open', st.url, false);
  });
  const saveProfiles = async (list: Profile[]) => { setProfiles(list); await call('local:set', 'deploy', list); };
  const deploy = (pr: Profile) => run(`Pubblicazione su ${pr.name}…`, async () => {
    if (useStore.getState().dirty) await save();
    await call('gen:generate', p, { debug: false });
    const r = await call('deploy:run', p, pr, secrets.deploy?.[pr.id] || '');
    setProgress(null);
    toast(`Pubblicato: ${r.uploaded} file caricati, ${r.unchanged} invariati (${Math.round(r.ms / 100) / 10} s)`, 'ok');
  });
  const errors = problems.filter((x) => x.level === 'error');
  return (
    <div className="panel">
      <Hero icon="rocket-takeoff" title="Genera e pubblica"
        chips={[
          errors.length ? ['x-octagon', `${errors.length} errori da correggere`] : ['check-circle', problems.length ? `${problems.length} avvisi` : 'Nessun problema'],
          php?.ok ? ['filetype-php', `PHP ${php.version}`] : ['exclamation-triangle', 'PHP non trovato'],
          php?.docker && ['box', 'Docker disponibile'],
          prev?.running && ['play-circle', `Anteprima su ${prev.url}`],
          ['cloud-upload', `${profiles.length} destinazioni`],
        ]}
        actions={<Btn kind="primary" icon="gear-wide-connected" disabled={errors.length > 0} onClick={() => generate(false)}>Genera</Btn>} />
      <NavLayout id="output" items={[['build', 'Genera e anteprima', 'gear-wide-connected', 'Verifica, generazione, prova locale'], ['publish', 'Pubblicazione', 'cloud-upload', 'SFTP, FTP, cartella'], ['docker', 'Docker di progetto', 'box', 'Ambiente come la produzione']]}>{(cat) => <>
      {cat === 'build' && <div className="cols">
        <div>
          <Section title="Verifica del progetto">
            {!problems.length ? <p className="ok"><I n="check-circle" /> Nessun problema</p> :
              <ul className="problems">{problems.map((x, i) => <li key={i} className={x.level}><I n={x.level === 'error' ? 'x-octagon' : 'exclamation-triangle'} /> {x.msg}</li>)}</ul>}
          </Section>
          <Section title="Genera">
            <div className="inline"><Btn kind="primary" icon="gear-wide-connected" disabled={errors.length > 0} onClick={() => generate(false)}>Genera</Btn>
              <Btn icon="bug" disabled={errors.length > 0} onClick={() => generate(true)} title="Mostra i dettagli degli errori PHP nelle pagine">Genera in modalità debug</Btn></div>
            {result && <div className="result">
              <p>Output: <a onClick={() => call('shell:openPath', result.outDir)} className="mono">{result.outDir}</a></p>
              {result.lint?.length ? <ul className="problems">{result.lint.map((l: any, i: number) => <li key={i} className="error"><b>{l.file}</b>: {l.error}</li>)}</ul> : <p className="ok"><I n="check-circle" /> Sintassi PHP verificata</p>}
            </div>}
            <p className="help">Il codice generato è il runtime MiB-Crude (PHP 7.4 – 8.5, nessuna dipendenza) più la configurazione del progetto. Requisiti server: PHP con PDO e il driver del database, estensioni consigliate gd (miniature), zip (Excel), ldap (Active Directory).</p>
          </Section>
        </div>
        <div>
          <Section title="Anteprima locale">
            <p>{php?.ok ? <>PHP {php.version}{php.docker ? ' · Docker disponibile' : ''}</> : <span className="warn">{php?.error}</span>}</p>
            <div className="inline">
              <Btn kind="primary" icon="play-fill" onClick={startPreview}>{prev?.running ? 'Riavvia' : 'Avvia'} anteprima</Btn>
              {prev?.running && <><Btn icon="box-arrow-up-right" onClick={() => call('preview:open', prev.url, false)}>Browser</Btn><Btn icon="window" onClick={() => call('preview:open', prev.url, true)}>Finestra interna</Btn>
                <Btn icon="stop-fill" onClick={async () => { await call('preview:stop'); setPrev(await call('preview:status')); }}>Ferma</Btn></>}
            </div>
            {prev?.running && <p className="mono small">{prev.url} · {prev.mode === 'docker' ? 'Docker PHP 8.3' : `PHP ${prev.php}`}{prev.ntlmUser ? ` · accesso Windows simulato come ${prev.ntlmUser}` : ''}</p>}
            {prev?.log && <pre className="log">{prev.log.split('\n').slice(-12).join('\n')}</pre>}
          </Section>
        </div>
      </div>}
      {cat === 'docker' && <DockerSection />}
      {cat === 'publish' && <Section title="Pubblicazione" actions={<Btn icon="plus-lg" onClick={() => setEdit({ id: `p${Date.now().toString(36)}`, name: 'Produzione', type: 'sftp', port: 22, remoteDir: '/var/www/html/app' })}>Destinazione</Btn>}
          help="Caricamento incrementale: solo i file cambiati. La cartella dei file caricati dagli utenti non viene mai sovrascritta. Le destinazioni e le password restano su questo computer.">
          {!profiles.length && <p className="help">Nessuna destinazione.</p>}
          {profiles.map((pr) => <div className="card" key={pr.id}>
            <div className="inline"><I n={pr.type === 'folder' ? 'folder' : 'hdd-network'} /><b>{pr.name}</b><small className="muted mono">{pr.type === 'folder' ? pr.remoteDir : `${pr.type}://${pr.user}@${pr.host}${pr.remoteDir}`}</small><span className="grow" />
              <Btn small icon="pencil" onClick={() => setEdit(pr)} /><Btn small kind="primary" icon="cloud-upload" onClick={() => deploy(pr)}>Pubblica</Btn></div>
            {progress && <progress max={progress.total} value={progress.done} />}
          </div>)}
        </Section>}
      </>}</NavLayout>
      {edit && <Modal title="Destinazione di pubblicazione" onClose={() => setEdit(null)} footer={<>
        <Btn kind="ghost" icon="trash" onClick={async () => { await saveProfiles(profiles.filter((x) => x.id !== edit.id)); setEdit(null); }}>Elimina</Btn>
        <Btn icon="plug" onClick={() => run('Test…', async () => { await call('deploy:test', edit, secrets.deploy?.[edit.id] || ''); toast('Connessione riuscita', 'ok'); })}>Prova</Btn><span className="grow" />
        <Btn kind="primary" onClick={async () => { await saveProfiles([...profiles.filter((x) => x.id !== edit.id), edit]); setEdit(null); }}>OK</Btn></>}>
        <Row label="Nome"><Text value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Row>
        <Row label="Tipo"><Select value={edit.type} options={[['sftp', 'SFTP (SSH)'], ['ftp', 'FTP / FTPS'], ['folder', 'Cartella locale o montata']]} onChange={(v) => setEdit({ ...edit, type: v, port: v === 'sftp' ? 22 : v === 'ftp' ? 21 : undefined })} /></Row>
        {edit.type !== 'folder' && <>
          <Row label="Server"><span className="inline"><Text value={edit.host} onChange={(v) => setEdit({ ...edit, host: v })} /><input className="inp num" type="number" value={edit.port || ''} onChange={(e) => setEdit({ ...edit, port: Number(e.target.value) })} /></span></Row>
          <Row label="Utente"><Text value={edit.user} onChange={(v) => setEdit({ ...edit, user: v })} /></Row>
          <Row label={edit.keyFile ? 'Passphrase chiave' : 'Password'}><Text type="password" value={secrets.deploy?.[edit.id]} onChange={(v) => saveSecrets({ deploy: { ...(secrets.deploy || {}), [edit.id]: v } })} /></Row>
          {edit.type === 'sftp' && <Row label="Chiave privata" hint="Facoltativa, es. ~/.ssh/id_ed25519"><span className="inline"><Text value={edit.keyFile} onChange={(v) => setEdit({ ...edit, keyFile: v })} mono /><Btn icon="folder" onClick={async () => { const f = await call('dialog:file', 'Chiave privata'); if (f) setEdit({ ...edit, keyFile: f }); }} /></span></Row>}
          {edit.type === 'ftp' && <Row label="Sicurezza"><span className="chips"><Check label="FTPS (TLS)" value={edit.secure} onChange={(v) => setEdit({ ...edit, secure: v })} /><Check label="Accetta certificati non validi" value={edit.insecure} onChange={(v) => setEdit({ ...edit, insecure: v })} /></span></Row>}
        </>}
        <Row label={edit.type === 'folder' ? 'Cartella' : 'Cartella remota'}><span className="inline"><Text value={edit.remoteDir} onChange={(v) => setEdit({ ...edit, remoteDir: v })} mono />
          {edit.type === 'folder' && <Btn icon="folder" onClick={async () => { const d = await call('dialog:dir', 'Cartella di destinazione'); if (d) setEdit({ ...edit, remoteDir: d }); }} />}</span></Row>
        <Row label="Opzioni"><span className="chips"><Check label="Carica anche config/secrets.php (password database)" value={edit.uploadSecrets} onChange={(v) => setEdit({ ...edit, uploadSecrets: v })} />
          <Check label="Ricarica tutti i file" value={edit.full} onChange={(v) => setEdit({ ...edit, full: v })} /></span></Row>
        <p className="help">Se in produzione il database ha credenziali diverse, lascia disattivato il caricamento di <code>secrets.php</code> e crealo una volta sul server.</p>
      </Modal>}
    </div>
  );
}
