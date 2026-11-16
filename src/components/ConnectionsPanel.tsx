import { useEffect, useState } from 'react';
import { call, mc } from '../api';
import type { EntraPrompt } from '../api';
import { run, saveSecrets, toast, update, useStore } from '../store';
import type { Connection } from '../types';
import { isFabric } from '../dialect';
import { Btn, Check, Empty, Hero, I, Modal, Row, Section, Select, Text, slug } from './ui';

const DRIVERS: [Connection['driver'], string][] = [['mysql', 'MariaDB / MySQL'], ['pgsql', 'PostgreSQL'], ['sqlsrv', 'SQL Server'], ['oracle', 'Oracle'], ['sqlite', 'SQLite'], ['rest', 'Servizio REST (JSON)']];
const PORTS: Record<string, number> = { mysql: 3306, pgsql: 5432, sqlsrv: 1433, oracle: 1521, sqlite: 0 };

export function ConnectionDialog({ initial, onClose }: { initial: Connection | null; onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const secrets = useStore((s) => s.secrets);
  const [c, setC] = useState<Connection>(initial || { id: p.connections.length ? '' : 'main', name: '', driver: 'mysql', host: 'localhost', port: 3306, database: '', user: '' });
  const [pw, setPw] = useState((secrets.connections || {})[initial?.id || ''] || '');
  const [php, setPhp] = useState<any>(null);
  useEffect(() => { call('php:info').then(setPhp); }, []);
  const s = (patch: Partial<Connection>) => setC({ ...c, ...patch });
  const id = c.id || slug(c.name || c.database || 'db');
  const entra = c.driver === 'sqlsrv' && c.sqlAuth === 'entra';
  const personal = c.driver === 'sqlsrv' && c.sqlAuth === 'entra-user';
  const [who, setWho] = useState<{ username: string } | null>(null);
  useEffect(() => { if (personal) call('entra:account', { ...c, id: c.id || id }).then(setWho, () => setWho(null)); else setWho(null); }, [personal, c.user, c.tenant]);
  const ext = ({ mysql: 'pdo_mysql', pgsql: 'pdo_pgsql', sqlsrv: 'pdo_sqlsrv', oracle: 'pdo_oci', sqlite: 'pdo_sqlite' } as Record<string, string>)[c.driver];
  const test = () => run('Test connessione…', async () => { const r = await call('db:test', { ...c, id }, pw); toast(`Connessione riuscita (${r.ms} ms)`, 'ok'); });
  const ok = async () => {
    if (!initial && p.connections.some((x) => x.id === id)) return toast(`Esiste già una connessione "${id}"`, 'err');
    update((d) => {
      const def = { ...c, id, name: c.name || c.database || id };
      const i = d.connections.findIndex((x) => x.id === initial?.id);
      if (i >= 0) d.connections[i] = def; else d.connections.push(def);
      if (!d.connections.some((x) => x.id === d.project.defaultConnection)) d.project.defaultConnection = id;
    });
    await saveSecrets({ connections: { ...(secrets.connections || {}), [id]: pw } });
    onClose();
  };
  return (
    <Modal title={initial ? `Connessione ${initial.name}` : 'Nuova connessione'} onClose={onClose}
      footer={<><Btn icon="plug" onClick={test}>Prova</Btn><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="check-lg" onClick={ok}>OK</Btn></>}>
      <Row label="Database"><Select value={c.driver} options={DRIVERS} onChange={(v) => s({ driver: v, port: PORTS[v] || undefined })} /></Row>
      <Row label="Nome"><Text value={c.name} onChange={(v) => s({ name: v })} placeholder={c.database || 'Principale'} /></Row>
      {!initial && <Row label="ID" hint="Usato nel progetto e in db('id') negli eventi"><Text value={c.id} onChange={(v) => s({ id: slug(v) })} placeholder={id} mono /></Row>}
      {c.driver === 'rest' ? <>
        <Row label="URL di base" hint="Es. https://api.esempio.it/v1 — le risorse si aggiungono da Tabelle e query › Nuova origine REST"><Text value={c.url} onChange={(v) => s({ url: v })} mono placeholder="https://" /></Row>
        <Row label="Autenticazione"><Select value={c.auth || 'none'} options={[['none', 'Nessuna'], ['bearer', 'Token Bearer'], ['basic', 'Utente e password (Basic)'], ['header', 'Chiave in un header'], ['query', 'Chiave nell\'URL']]} onChange={(v) => s({ auth: v as any })} /></Row>
        {(c.auth === 'basic' || c.auth === 'header' || c.auth === 'query') && <Row label={c.auth === 'basic' ? 'Utente' : c.auth === 'header' ? 'Nome header' : 'Nome parametro'}><Text value={c.user} onChange={(v) => s({ user: v })} placeholder={c.auth === 'header' ? 'X-API-Key' : c.auth === 'query' ? 'api_key' : ''} /></Row>}
        {c.auth && c.auth !== 'none' && <Row label={c.auth === 'basic' ? 'Password' : 'Token / chiave'} hint="Salvato solo sul tuo computer (.mibcrude-local), mai nel progetto condiviso"><Text type="password" value={pw} onChange={setPw} /></Row>}
      </> : c.driver === 'sqlite' ? <Row label="File" hint="Percorso sul server; relativo = rispetto all'applicazione generata">
        <span className="inline"><Text value={c.file} onChange={(v) => s({ file: v })} mono /><Btn icon="folder" onClick={async () => { const f = await call('dialog:file', 'Database SQLite'); if (f) s({ file: f }); }} /></span></Row> : <>
        <Row label="Server"><span className="inline"><Text value={c.host} onChange={(v) => s({ host: v })} /><input className="inp num" type="number" value={c.port ?? ''} onChange={(e) => s({ port: Number(e.target.value) })} /></span></Row>
        <Row label={c.driver === 'oracle' ? 'Service name' : 'Database'}><Text value={c.database} onChange={(v) => s({ database: v })} /></Row>
        {(c.driver === 'pgsql' || c.driver === 'sqlsrv') && <Row label="Schema"><Text value={c.schema} onChange={(v) => s({ schema: v })} placeholder={c.driver === 'pgsql' ? 'public' : 'dbo'} /></Row>}
        {c.driver === 'sqlsrv' && <Row label="Accesso" hint="Microsoft Fabric Warehouse e Azure SQL richiedono Entra ID: l'applicazione generata accede con un'app registrata (service principal)">
          <Select value={c.sqlAuth || 'sql'} options={[['sql', 'Utente e password SQL'], ['entra', 'Microsoft Entra (service principal)'], ['entra-user', 'Microsoft Entra (account personale, MFA) — designer e anteprima']]} onChange={(v) => s({ sqlAuth: v as 'sql' | 'entra' | 'entra-user', encrypt: v !== 'sql' ? true : c.encrypt })} /></Row>}
        <Row label={entra ? 'Client ID' : personal ? 'Account (opzionale)' : 'Utente'} hint={entra ? 'ID applicazione (client) dell\'app registrata in Entra' : personal ? 'nome.cognome@azienda.it: suggerisce l\'account nella finestra di accesso' : undefined}><Text value={c.user} onChange={(v) => s({ user: v })} mono={entra} /></Row>
        {!personal && <Row label={entra ? 'Client secret' : 'Password'} hint="Salvata solo sul tuo computer (.mibcrude-local), mai nel progetto condiviso"><Text type="password" value={pw} onChange={setPw} /></Row>}
        {personal && <>
          <Row label="Accesso nel" hint="Il browser di sistema (con MFA) oppure un codice da digitare su un altro dispositivo"><Select value={c.entraMethod || 'browser'} options={[['browser', 'Browser'], ['device', 'Codice dispositivo']]} onChange={(v) => s({ entraMethod: v as 'browser' | 'device' })} /></Row>
          <Row label="Tenant (opzionale)" hint="Lascia vuoto per l'accesso aziendale standard"><Text value={c.tenant} onChange={(v) => s({ tenant: v })} mono /></Row>
          <p className="help">{who ? <>Accesso effettuato come <b>{who.username}</b>. <Btn small onClick={async () => { await call('entra:signOut', { ...c, id: c.id || id }); setWho(null); }}>Esci dall'account</Btn></> : 'Nessun accesso effettuato: Prova apre il browser per l\'accesso.'}
            {' '}Vale per il designer (prova, schema, tabelle) e per l'<b>Anteprima</b> (token di circa un'ora): per pubblicare l'app, che non ha un browser per l'MFA, serve il <i>service principal</i>.</p>
        </>}
        {entra && <Row label="Tenant" hint="ID della directory (tenant) Entra, usato dal designer per la prova di connessione"><Text value={c.tenant} onChange={(v) => s({ tenant: v })} mono placeholder="00000000-0000-0000-0000-000000000000" /></Row>}
        {c.driver === 'sqlsrv' && <Row label="Fabric Warehouse" hint="Riconosciuto dal nome del server (*.fabric.microsoft.com). Cambia le tabelle create dal designer: BIGINT IDENTITY, VARCHAR al posto di NVARCHAR, chiavi e vincoli aggiunti dopo con ALTER e NOT ENFORCED (il server non impedisce i duplicati), niente valori predefiniti né modifica del tipo di una colonna. Non può essere la connessione principale dell'app (utenti, permessi e registro) e dopo un inserimento l'ID generato non è leggibile"><Check value={isFabric(c)} onChange={(v) => s({ fabric: v })} label="Microsoft Fabric Warehouse" /></Row>}
        {c.driver === 'sqlsrv' && <Row label="Cifratura"><Check value={entra ? true : c.encrypt} onChange={(v) => !entra && s({ encrypt: v })} label={entra ? 'Encrypt (obbligatoria con Entra)' : 'Encrypt'} /></Row>}
      </>}
      {php && c.driver !== 'rest' && <p className="help">{php.ok ? <>PHP locale {php.version}: {php.modules.includes(ext) ? <span className="ok"><I n="check-circle" /> {ext} presente</span> : <span className="warn"><I n="exclamation-triangle" /> {ext} assente{php.docker ? ' — l\'anteprima userà Docker' : ' — installalo per l\'anteprima'}</span>}</> : php.error}</p>}
    </Modal>
  );
}

export default function ConnectionsPanel() {
  const p = useStore((s) => s.proj)!;
  const [edit, setEdit] = useState<Connection | null | 'new'>(null);
  const used = (id: string) => p.tables.filter((t) => t.connection === id).length;
  return (
    <div className="panel">
      <Hero icon="database" title="Connessioni" chips={[
        ['database', `${p.connections.length} connessioni`],
        ...[...new Set(p.connections.map((c) => c.driver))].map((d) => ['hdd-stack', ({ mysql: 'MariaDB/MySQL', pgsql: 'PostgreSQL', sqlsrv: 'SQL Server', oracle: 'Oracle', sqlite: 'SQLite', rest: 'REST' } as Record<string, string>)[d] || d] as [string, string]),
        ['star', `Principale: ${p.connections.find((c) => c.id === p.project.defaultConnection)?.name || '—'}`],
      ]} actions={<Btn kind="primary" icon="plus-lg" onClick={() => setEdit('new')}>Nuova connessione</Btn>} />
      <Section title="Database"
        help="Un progetto può usare più database (anche di tipo diverso): ogni tabella sceglie la sua connessione.">
        {!p.connections.length ? <Empty icon="database-add" title="Nessuna connessione"><Btn kind="primary" icon="plus-lg" onClick={() => setEdit('new')}>Aggiungi il database</Btn></Empty> :
          <table className="grid"><thead><tr><th>ID</th><th>Nome</th><th>Tipo</th><th>Server / file</th><th>Database</th><th>Tabelle</th><th>Predefinita</th><th /></tr></thead><tbody>
            {p.connections.map((c) => <tr key={c.id}>
              <td className="mono">{c.id}</td><td>{c.name}</td><td>{DRIVERS.find((d) => d[0] === c.driver)?.[1]}</td>
              <td className="mono">{c.driver === 'sqlite' ? c.file : `${c.host}:${c.port}`}</td><td>{c.database}</td><td>{used(c.id)}</td>
              <td><input type="radio" disabled={isFabric(c)} title={isFabric(c) ? 'Fabric non può essere la connessione principale' : undefined} checked={p.project.defaultConnection === c.id} onChange={() => update((d) => { d.project.defaultConnection = c.id; })} /></td>
              <td className="actions"><Btn small icon="pencil" onClick={() => setEdit(c)} />
                <Btn small icon="trash" kind="ghost" disabled={used(c.id) > 0} title={used(c.id) ? 'In uso da alcune tabelle' : 'Elimina'} onClick={() => update((d) => { d.connections = d.connections.filter((x) => x.id !== c.id); })} /></td>
            </tr>)}
          </tbody></table>}
      </Section>
      {edit && <ConnectionDialog initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Microsoft Entra sign-in in progress (personal account): the system browser is open, or a code is to be typed on another device. */
export function EntraPromptDialog() {
  const [p, setP] = useState<EntraPrompt | null>(null);
  useEffect(() => mc().onEntraPrompt((x) => setP(x.kind === 'done' ? null : x)), []);
  if (!p || p.kind === 'done') return null;
  return (
    <Modal title={`Accesso Microsoft per ${p.name}`} onClose={() => setP(null)}
      footer={<>{p.kind === 'device' && <><Btn onClick={() => navigator.clipboard.writeText(p.code)}>Copia codice</Btn>
        <Btn onClick={() => { navigator.clipboard.writeText(p.code); call('entra:openUrl', p.url); }}>Copia e apri la pagina</Btn></>}<span className="grow" /><Btn onClick={() => setP(null)}>Nascondi</Btn></>}>
      {p.kind === 'browser' ? <p>Completa l'accesso nella finestra del browser che si è aperta. La connessione prosegue da sola appena l'accesso è riuscito.</p> : <>
        <p>Apri {p.url} e inserisci il codice:</p>
        <div className="device-code">{p.code}</div>
      </>}
    </Modal>
  );
}
