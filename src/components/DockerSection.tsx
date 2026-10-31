// Docker environment of the project (core/dockerenv.cjs): Apache, PHP and MariaDB in the chosen versions, to
// replicate production; with the Windows sign-in, Apache gets NTLM/Kerberos as in the production httpd.conf.
import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, toast, update, useStore } from '../store';
import { Btn, I, Num, Row, Section, Select, Text } from './ui';

interface DockerCfg {
  os?: 'linux' | 'windows'; windows?: string; apache24Dir?: string;
  apache?: string; php?: string; mariadb?: string; httpPort?: number; dbPort?: number; dbName?: string; dbUser?: string; initSql?: string;
  ntlm?: { mode?: 'dev' | 'domain'; devUser?: string; realm?: string; workgroup?: string; joinUser?: string; dns?: string; excludePaths?: string[]; gmsa?: string };
}
interface Options { apache: [string, string][]; php: string[]; mariadb: string[]; os: [string, string][]; windows: [string, string][]; phpWindows: string[]; defaults: DockerCfg }
interface Status { generated: boolean; services: { service: string; state: string; status: string }[]; versions?: Record<string, string> }

export default function DockerSection() {
  const p = useStore((s) => s.proj)!;
  const [opt, setOpt] = useState<Options | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [log, setLog] = useState('');
  const [joinPw, setJoinPw] = useState('');
  useEffect(() => { call<Options>('docker:options').then(setOpt); call<Status>('docker:status').then(setSt).catch(() => {}); }, []);
  if (!opt) return null;
  const d: DockerCfg = { ...opt.defaults, ...((p.project as unknown as { docker?: DockerCfg }).docker || {}) };
  const n = { ...opt.defaults.ntlm, ...(d.ntlm || {}) };
  const set = (patch: DockerCfg) => update((x) => { const pr = x.project as unknown as { docker?: DockerCfg }; pr.docker = { ...d, ...(pr.docker || {}), ...patch }; });
  const setN = (patch: DockerCfg['ntlm']) => set({ ntlm: { ...n, ...patch } });
  const ntlm = p.security.enabled && (p.security.mode as string) === 'ntlm';
  const main = p.connections.find((c) => c.id === p.project.defaultConnection);
  const refresh = async () => setSt(await call<Status>('docker:status'));
  const generate = () => run('Generazione dell\'ambiente Docker…', async () => {
    const r = await call<{ dir: string; url: string }>('docker:generate', p);
    if (joinPw) { await call('docker:joinPassword', joinPw); setJoinPw(''); }
    toast(`File Docker in ${r.dir}`, 'ok');
    await refresh();
  });
  const up = () => run('Avvio dei contenitori (la prima volta costruisce le immagini: qualche minuto)…', async () => {
    await call('docker:generate', p);
    setLog(await call<string>('docker:up'));
    await refresh();
  });
  const running = st?.services.some((s) => s.state === 'running');
  const url = `http://localhost:${d.httpPort}/`;
  const win = d.os === 'windows';
  const phpList = win ? opt.phpWindows : opt.php;
  const php = phpList.includes(d.php || '') ? d.php : phpList[phpList.length - 1];
  return (
    <Section title="Docker di progetto" help="Un ambiente come quello di produzione su questo computer: Apache (versione della distribuzione scelta), PHP-FPM e MariaDB nelle versioni scelte. I file vanno nella cartella docker/ del progetto (password in docker/.env, fuori da Git), l'app viene generata in docker/app con la connessione principale verso il contenitore del database.">
      <Row label="Sistema operativo" hint={win ? 'Contenitori Windows: servono Docker Desktop in modalità «contenitori Windows» o Windows Server; su Linux non partono' : undefined}>
        <Select value={d.os || 'linux'} options={opt.os} onChange={(v) => set({ os: v as 'linux' | 'windows' })} /></Row>
      {win ? <>
        <Row label="Windows"><Select value={d.windows} options={opt.windows} onChange={(v) => set({ windows: v })} /></Row>
        <Row label="Apache24 di produzione" hint="Cartella copiata nel contenitore (bin, modules, conf: senza htdocs, logs e php); httpd.conf generato con gli stessi moduli">
          <Text value={d.apache24Dir} onChange={(v) => set({ apache24Dir: v })} mono /></Row>
      </> : <Row label="Apache"><Select value={d.apache} options={opt.apache} onChange={(v) => set({ apache: v })} /></Row>}
      <Row label="PHP" hint={win ? 'Thread safe da windows.php.net, come modulo di Apache (php8apache2_4.dll)' : undefined}>
        <Select value={php} options={phpList.map((v) => [v, `PHP ${v}`] as [string, string])} onChange={(v) => set({ php: v })} /></Row>
      <Row label="MariaDB" hint={main?.driver === 'mysql' ? 'La connessione principale dell\'app punta a questo database' : 'La connessione principale non è MariaDB/MySQL: resta quella del progetto'}>
        <Select value={d.mariadb || ''} options={opt.mariadb.map((v) => [v, v ? `MariaDB ${v}` : 'Nessuno (database esterno)'] as [string, string])} onChange={(v) => set({ mariadb: v })} /></Row>
      <Row label="Porte" hint="Sito e database su questo computer"><span className="inline">http <Num value={d.httpPort} min={1} onChange={(v) => set({ httpPort: v === '' ? 8080 : v })} />
        {d.mariadb && <>MariaDB <Num value={d.dbPort} min={1} onChange={(v) => set({ dbPort: v === '' ? 3307 : v })} /></>}</span></Row>
      {d.mariadb && <>
        <Row label="Database / utente"><span className="inline"><Text value={d.dbName} onChange={(v) => set({ dbName: v })} mono /><Text value={d.dbUser} onChange={(v) => set({ dbUser: v })} mono /></span></Row>
        <Row label="Script SQL iniziale" hint="Eseguito alla prima creazione del database (es. un dump di produzione)"><Text value={d.initSql} onChange={(v) => set({ initSql: v })} mono placeholder="/percorso/dump.sql" /></Row>
      </>}
      {ntlm && <>
        <p className="help"><I n="windows" /> Accesso Windows attivo nel progetto: Apache è configurato come il httpd.conf di produzione (utente valido, anonimi esclusi, intestazione X_ISRW_PROXY_AUTH_USER). {win
          ? 'Su Windows lo stesso modulo di produzione: mod_authn_ntlm (AuthType SSPI); nel dominio il contenitore usa un gMSA.'
          : 'In produzione su Windows si usa mod_authn_ntlm (SSPI): il file docker/windows/httpd-ntlm.conf contiene le stesse direttive da includere in Apache24. In Docker (Linux) l\'equivalente è mod_auth_gssapi con NTLM e Kerberos tramite winbind.'}</p>
        <Row label="Autenticazione"><Select value={n.mode} options={[['dev', 'Utente simulato (senza dominio)'], ['domain', win ? 'Dominio Active Directory (gMSA, mod_authn_ntlm)' : 'Dominio Active Directory (NTLM e Kerberos)']]} onChange={(v) => setN({ mode: v as 'dev' | 'domain' })} /></Row>
        {n.mode === 'dev' && <Row label="Utente simulato" hint="Arriva all'app come REMOTE_USER"><Text value={n.devUser} onChange={(v) => setN({ devUser: v })} mono /></Row>}
        {n.mode === 'domain' && win && <Row label="gMSA" hint="Account di servizio gestito del contenitore: docker/windows/setup-gmsa.ps1 prepara la credential spec sull'host">
          <Text value={n.gmsa} onChange={(v) => setN({ gmsa: v })} mono /></Row>}
        {n.mode === 'domain' && !win && <>
          <Row label="Dominio" hint="Realm Kerberos e nome NetBIOS"><span className="inline"><Text value={n.realm} onChange={(v) => setN({ realm: v })} mono placeholder="AZIENDA.LOCAL" /><Text value={n.workgroup} onChange={(v) => setN({ workgroup: v })} mono placeholder="AZIENDA" /></span></Row>
          <Row label="DNS" hint="Server DNS che risolve i domain controller (vuoto = quello di Docker)"><Text value={n.dns} onChange={(v) => setN({ dns: v })} mono /></Row>
          <Row label="Unione al dominio" hint="Account autorizzato ad aggiungere computer; la password va solo in docker/.env su questo computer"><span className="inline">
            <Text value={n.joinUser} onChange={(v) => setN({ joinUser: v })} mono placeholder="amministratore" /><Text type="password" value={joinPw} onChange={setJoinPw} placeholder="password" /></span></Row>
        </>}
        <Row label="Percorsi esclusi" hint="Senza autenticazione, come /genera nel httpd.conf di produzione (uno per riga)">
          <textarea className="inp mono" rows={2} value={(n.excludePaths || []).join('\n')} onChange={(e) => setN({ excludePaths: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></Row>
      </>}
      <div className="inline">
        <Btn icon="file-earmark-code" onClick={generate}>Genera file Docker</Btn>
        <Btn kind="primary" icon="play-fill" onClick={up}>{running ? 'Aggiorna e riavvia' : 'Avvia'}</Btn>
        {running && <><Btn icon="box-arrow-up-right" onClick={() => call('preview:open', url, false)}>Apri {url}</Btn>
          <Btn icon="stop-fill" onClick={() => run('Arresto…', async () => { await call('docker:down'); await refresh(); })}>Ferma</Btn></>}
        <Btn icon="arrow-clockwise" onClick={refresh} title="Stato dei contenitori" />
        {st?.generated && <Btn icon="journal-text" onClick={async () => setLog(await call<string>('docker:logs'))}>Log</Btn>}
        {st?.generated && <Btn icon="folder2-open" onClick={() => call('shell:openPath', `${p.dir}/docker`)}>Cartella</Btn>}
      </div>
      {st?.services.length ? <p className="small mono">{st.services.map((s) => `${s.service}: ${s.status}`).join(' · ')}</p> : null}
      {st?.versions && Object.keys(st.versions).length ? <p className="small">Installati: {Object.values(st.versions).join(' · ')}</p> : null}
      {log && <pre className="log">{log.split('\n').slice(-25).join('\n')}</pre>}
    </Section>
  );
}
