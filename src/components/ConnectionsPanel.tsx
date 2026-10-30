import { useEffect, useState } from 'react';
import { call } from '../api';
import { run, saveSecrets, toast, update, useStore } from '../store';
import type { Connection } from '../types';
import { Btn, Check, Empty, I, Modal, Row, Section, Select, Text, slug } from './ui';

const DRIVERS: [Connection['driver'], string][] = [['mysql', 'MariaDB / MySQL'], ['pgsql', 'PostgreSQL'], ['sqlsrv', 'SQL Server'], ['oracle', 'Oracle'], ['sqlite', 'SQLite']];
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
  const ext = { mysql: 'pdo_mysql', pgsql: 'pdo_pgsql', sqlsrv: 'pdo_sqlsrv', oracle: 'pdo_oci', sqlite: 'pdo_sqlite' }[c.driver];
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
      {c.driver === 'sqlite' ? <Row label="File" hint="Percorso sul server; relativo = rispetto all'applicazione generata">
        <span className="inline"><Text value={c.file} onChange={(v) => s({ file: v })} mono /><Btn icon="folder" onClick={async () => { const f = await call('dialog:file', 'Database SQLite'); if (f) s({ file: f }); }} /></span></Row> : <>
        <Row label="Server"><span className="inline"><Text value={c.host} onChange={(v) => s({ host: v })} /><input className="inp num" type="number" value={c.port ?? ''} onChange={(e) => s({ port: Number(e.target.value) })} /></span></Row>
        <Row label={c.driver === 'oracle' ? 'Service name' : 'Database'}><Text value={c.database} onChange={(v) => s({ database: v })} /></Row>
        {(c.driver === 'pgsql' || c.driver === 'sqlsrv') && <Row label="Schema"><Text value={c.schema} onChange={(v) => s({ schema: v })} placeholder={c.driver === 'pgsql' ? 'public' : 'dbo'} /></Row>}
        <Row label="Utente"><Text value={c.user} onChange={(v) => s({ user: v })} /></Row>
        <Row label="Password" hint="Salvata solo sul tuo computer (.mibcrude-local), mai nel progetto condiviso"><Text type="password" value={pw} onChange={setPw} /></Row>
        {c.driver === 'sqlsrv' && <Row label="Cifratura"><Check value={c.encrypt} onChange={(v) => s({ encrypt: v })} label="Encrypt" /></Row>}
      </>}
      {php && <p className="help">{php.ok ? <>PHP locale {php.version}: {php.modules.includes(ext) ? <span className="ok"><I n="check-circle" /> {ext} presente</span> : <span className="warn"><I n="exclamation-triangle" /> {ext} assente{php.docker ? ' — l\'anteprima userà Docker' : ' — installalo per l\'anteprima'}</span>}</> : php.error}</p>}
    </Modal>
  );
}

export default function ConnectionsPanel() {
  const p = useStore((s) => s.proj)!;
  const [edit, setEdit] = useState<Connection | null | 'new'>(null);
  const used = (id: string) => p.tables.filter((t) => t.connection === id).length;
  return (
    <div className="panel">
      <h2>Connessioni</h2>
      <Section title="Database" actions={<Btn kind="primary" icon="plus-lg" onClick={() => setEdit('new')}>Nuova connessione</Btn>}
        help="Un progetto può usare più database (anche di tipo diverso): ogni tabella sceglie la sua connessione.">
        {!p.connections.length ? <Empty icon="database-add" title="Nessuna connessione"><Btn kind="primary" icon="plus-lg" onClick={() => setEdit('new')}>Aggiungi il database</Btn></Empty> :
          <table className="grid"><thead><tr><th>ID</th><th>Nome</th><th>Tipo</th><th>Server / file</th><th>Database</th><th>Tabelle</th><th>Predefinita</th><th /></tr></thead><tbody>
            {p.connections.map((c) => <tr key={c.id}>
              <td className="mono">{c.id}</td><td>{c.name}</td><td>{DRIVERS.find((d) => d[0] === c.driver)?.[1]}</td>
              <td className="mono">{c.driver === 'sqlite' ? c.file : `${c.host}:${c.port}`}</td><td>{c.database}</td><td>{used(c.id)}</td>
              <td><input type="radio" checked={p.project.defaultConnection === c.id} onChange={() => update((d) => { d.project.defaultConnection = c.id; })} /></td>
              <td className="actions"><Btn small icon="pencil" onClick={() => setEdit(c)} />
                <Btn small icon="trash" kind="ghost" disabled={used(c.id) > 0} title={used(c.id) ? 'In uso da alcune tabelle' : 'Elimina'} onClick={() => update((d) => { d.connections = d.connections.filter((x) => x.id !== c.id); })} /></td>
            </tr>)}
          </tbody></table>}
      </Section>
      {edit && <ConnectionDialog initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
