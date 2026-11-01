// One application from several .phpr projects: other .phpr files merged into the open project
// (core/merge.cjs). Same database = same connection, same table = shared or renamed, menu under a header.
import { useState } from 'react';
import { call } from '../api';
import { replaceProject, run, useStore } from '../store';
import type { Project, Secrets } from '../types';
import { Btn, I, Modal, Row, Select, Text } from './ui';

export const TABLE_MODES: [string, string][] = [
  ['auto', 'Automatico: condivise se leggono la stessa tabella, altrimenti con prefisso'],
  ['reuse', 'Usa sempre quella già presente nel progetto'],
  ['prefix', 'Importa sempre con un prefisso'],
];

export interface MergeReport {
  label: string; connections: string[]; tablesAdded: string[]; tablesShared: string[]; tablesRenamed: string[]; renamed: string[]; events: number;
  eventConflicts: { group: string; event: string }[]; groups: string[]; languages: string[]; warnings: string[]; filesKept?: string[]; filesCopied?: number;
}
const base = (f: string) => f.split('/').pop()!.replace(/\.phpr$/i, '');

/** Merges the files one after the other; returns the reports (with the file to open). */
export async function mergePhpr(proj: Project, files: string[], mode: string, prefix: string, save = false) {
  const out: { report: MergeReport; reportFile: string }[] = [];
  let cur = proj;
  for (const f of files) {
    const r = await call<{ proj: Project; report: MergeReport; reportFile: string }>('import:phprMerge', cur, f, { label: base(f), tables: mode, prefix: files.length > 1 || !prefix ? base(f) : prefix, save });
    cur = { ...r.proj, dir: proj.dir };
    out.push({ report: r.report, reportFile: r.reportFile });
  }
  return { proj: cur, reports: out };
}

export function MergeReports({ reports, onClose }: { reports: { report: MergeReport; reportFile: string }[]; onClose: () => void }) {
  return (
    <Modal wide title="Unione completata" onClose={onClose} footer={<><span className="grow" /><Btn kind="primary" onClick={onClose}>Chiudi</Btn></>}>
      {reports.map(({ report: r, reportFile }) => <div key={reportFile} className="merge-report">
        <div className="inline"><h4><I n="box-arrow-in-down" /> {r.label}</h4><span className="grow" /><Btn small icon="file-text" onClick={() => call('shell:openPath', reportFile)}>Apri il rapporto</Btn></div>
        <ul className="problems">
          <li><I n="table" /> {r.tablesAdded.length} tabelle aggiunte{r.tablesShared.length ? `, ${r.tablesShared.length} già presenti e condivise` : ''}{r.tablesRenamed.length ? `, ${r.tablesRenamed.length} rinominate` : ''}</li>
          <li><I n="database" /> Connessioni: {r.connections.join(', ') || '—'}</li>
          <li><I n="lightning" /> {r.events} eventi aggiunti{r.eventConflicts.length ? `, ${r.eventConflicts.length} in conflitto (tenuto quello del progetto, l'altro salvato nel rapporto)` : ''}</li>
          {r.renamed.length > 0 && <li><I n="pencil" /> {r.renamed.join(', ')}</li>}
          {r.groups.length > 0 && <li><I n="people" /> Gruppi aggiunti: {r.groups.join(', ')}</li>}
          {(r.filesKept || []).length > 0 && <li><I n="files" /> {r.filesKept!.length} file già presenti e diversi: tenuti quelli del progetto</li>}
          <li><I n="list" /> Menu: voci aggiunte sotto l'intestazione «{r.label}»</li>
        </ul>
        {r.tablesRenamed.length > 0 && <p className="help">Rinominate: {r.tablesRenamed.slice(0, 12).join(', ')}{r.tablesRenamed.length > 12 ? '…' : ''}</p>}
        {r.warnings.length > 0 && <ul className="problems">{r.warnings.map((w, i) => <li key={i} className="warning">{w}</li>)}</ul>}
      </div>)}
    </Modal>
  );
}

export default function PhprMergeDialog({ onClose }: { onClose: () => void }) {
  const p = useStore((s) => s.proj)!;
  const [files, setFiles] = useState<string[]>([]);
  const [mode, setMode] = useState('auto');
  const [prefix, setPrefix] = useState('');
  const [reports, setReports] = useState<{ report: MergeReport; reportFile: string }[] | null>(null);
  const pick = async () => {
    const f = await call<string[]>('dialog:files', 'Progetti .phpr da unire', [{ name: 'Progetto .phpr', extensions: ['phpr'] }]);
    if (f.length) { setFiles([...files, ...f.filter((x) => !files.includes(x))]); if (!prefix && f.length === 1) setPrefix(base(f[0])); }
  };
  const go = () => run(`Unione di ${files.length} progett${files.length === 1 ? 'o' : 'i'} .phpr…`, async () => {
    const r = await mergePhpr(p, files, mode, prefix);
    replaceProject(r.proj);
    useStore.getState().set({ secrets: await call<Secrets>('secrets:get') });
    setReports(r.reports);
  });
  if (reports) return <MergeReports reports={reports} onClose={onClose} />;
  return (
    <Modal wide title="Unisci progetti .phpr a questo progetto" onClose={onClose}
      footer={<><span className="grow" /><Btn onClick={onClose}>Annulla</Btn><Btn kind="primary" icon="box-arrow-in-down" disabled={!files.length} onClick={go}>Unisci</Btn></>}>
      <p className="help">Ogni file .phpr viene convertito e aggiunto a questo progetto, per farne un'unica applicazione: le connessioni allo stesso database diventano una sola, le voci di menu finiscono sotto un'intestazione con il nome del progetto, gruppi e permessi si sommano. Niente del progetto viene sovrascritto: nomi già usati vengono condivisi o rinominati e tutto è nel rapporto. Si può annullare con Ctrl+Z finché non salvi.</p>
      <Row label="File .phpr"><span className="inline wrap">
        {files.map((f) => <span key={f} className="chip"><I n="file-earmark-code" /> {base(f)} <button type="button" className="btn ghost sm" onClick={() => setFiles(files.filter((x) => x !== f))}><I n="x" /></button></span>)}
        <Btn icon="plus-lg" onClick={pick}>Aggiungi file</Btn></span></Row>
      <Row label="Tabelle con lo stesso nome"><Select value={mode} options={TABLE_MODES} onChange={setMode} /></Row>
      {mode !== 'reuse' && <Row label="Prefisso" hint={files.length > 1 ? 'Con più file il prefisso è il nome di ciascun progetto' : 'Aggiunto al nome delle tabelle rinominate'}>
        <Text value={files.length > 1 ? '' : prefix} onChange={(v) => setPrefix(v.replace(/[^A-Za-z0-9_]/g, '_'))} placeholder={files.length > 1 ? 'nome del progetto' : ''} /></Row>}
    </Modal>
  );
}
