import { useEffect, useState } from 'react';
import { call } from '../api';
import { saveSecrets, useStore } from '../store';
import type { Field, Lookup, Table } from '../types';
import CodeEditor from './CodeEditor';
import { Btn, Check, LangText, Modal, Num, Row, Section, Select, Tabs, Text } from './ui';

export const VIEW_AS: [string, string][] = [['text', 'Testo'], ['number', 'Numero'], ['currency', 'Valuta'], ['percent', 'Percentuale'], ['date', 'Data'], ['datetime', 'Data e ora'], ['time', 'Ora'],
  ['checkbox', 'Casella'], ['email', 'Email (link)'], ['url', 'Link'], ['image', 'Immagine'], ['file', 'File'], ['longtext', 'Testo lungo'], ['html', 'HTML'], ['color', 'Colore'], ['lookup', 'Valore lookup'], ['qrcode', 'Codice QR'], ['signature', 'Firma (immagine)'], ['custom', 'Codice PHP']];
export const EDIT_AS: [string, string][] = [['text', 'Casella di testo'], ['textarea', 'Area di testo'], ['richtext', 'Editor testo formattato'], ['number', 'Numero'], ['password', 'Password'], ['email', 'Email'],
  ['date', 'Data'], ['datetime', 'Data e ora'], ['time', 'Ora'], ['checkbox', 'Casella / interruttore'], ['select', 'Menu a tendina (lookup)'], ['radio', 'Pulsanti di scelta (lookup)'],
  ['checkboxes', 'Caselle multiple (lookup)'], ['autocomplete', 'Completamento automatico (lookup)'], ['file', 'Caricamento file'], ['image', 'Caricamento immagine'], ['color', 'Selettore colore'], ['signature', 'Firma a mano'], ['readonly', 'Sola lettura'], ['hidden', 'Nascosto']];
const LOOKUP_TYPES = ['select', 'radio', 'checkboxes', 'autocomplete'];

function LookupEditor({ t, lk, onChange }: { t: Table; lk: Lookup; onChange: (l: Lookup) => void }) {
  const p = useStore((s) => s.proj)!;
  const [cols, setCols] = useState<string[]>([]);
  const target = p.tables.find((x) => x.name === lk.table);
  useEffect(() => {
    if (lk.kind !== 'table' || !lk.table) return;
    if (target) { setCols(target.fields.map((f) => f.name)); return; }
    call('db:describe', p, lk.connection || t.connection, lk.table).then((d) => setCols(d.columns.map((c: any) => c.name))).catch(() => setCols([]));
  }, [lk.table, lk.kind]);
  const s = (patch: Partial<Lookup>) => onChange({ ...lk, ...patch });
  return (
    <>
      <Row label="Origine valori"><Select value={lk.kind} options={[['table', 'Tabella del database'], ['list', 'Elenco fisso']]} onChange={(v) => s({ kind: v, values: v === 'list' ? (lk.values || []) : lk.values })} /></Row>
      {lk.kind === 'list' ? <Row label="Valori" hint="Valore salvato e testo mostrato">
        <div className="list-values">
          {(lk.values || []).map((v, i) => <div className="inline" key={i}>
            <Text value={v.value} onChange={(x) => { const vals = [...(lk.values || [])]; vals[i] = { ...v, value: x }; s({ values: vals }); }} mono placeholder="valore" />
            <LangText value={v.label} onChange={(x) => { const vals = [...(lk.values || [])]; vals[i] = { ...v, label: x }; s({ values: vals }); }} />
            <Btn small kind="ghost" icon="x-lg" onClick={() => s({ values: (lk.values || []).filter((_, j) => j !== i) })} /></div>)}
          <Btn small icon="plus-lg" onClick={() => s({ values: [...(lk.values || []), { value: '', label: {} }] })}>Aggiungi valore</Btn>
        </div></Row> : <>
        <Row label="Tabella"><span className="inline"><input className="inp mono" list="mc-tables" value={lk.table || ''} onChange={(e) => s({ table: e.target.value })} />
          <datalist id="mc-tables">{p.tables.map((x) => <option key={x.name} value={x.name} />)}</datalist></span></Row>
        <Row label="Campo chiave (valore salvato)"><Select value={lk.key} options={['', ...cols]} onChange={(v) => s({ key: v })} /></Row>
        <Row label="Campo mostrato" hint="Un campo, un modello come {nome} {cognome}, oppure un'espressione SQL">
          <span className="inline"><input className="inp mono" list="mc-cols" value={lk.display || ''} onChange={(e) => s({ display: e.target.value })} /><datalist id="mc-cols">{cols.map((c) => <option key={c} value={c} />)}</datalist></span></Row>
        <Row label="Filtro WHERE" hint="SQL opzionale, es. attivo = 1"><Text value={lk.where} onChange={(v) => s({ where: v })} mono /></Row>
        <Row label="Ordinamento"><Text value={lk.orderBy} onChange={(v) => s({ orderBy: v })} mono placeholder="(campo mostrato)" /></Row>
        <Row label="Dipende da (a cascata)" hint="Es. città filtrate dalla nazione scelta">
          <span className="inline"><Select value={lk.dependsOn?.field || ''} options={[['', '— nessuno —'], ...t.fields.map((f) => [f.name, f.name] as [string, string])]} onChange={(v) => s({ dependsOn: v ? { field: v, linkField: lk.dependsOn?.linkField || v } : null })} />
            {lk.dependsOn?.field && <><span>→ campo in {lk.table}:</span><Select value={lk.dependsOn.linkField} options={cols} onChange={(v) => s({ dependsOn: { ...lk.dependsOn!, linkField: v } })} /></>}</span></Row>
        <Row label="Opzioni"><span className="chips"><Check label="Pulsante «Aggiungi nuovo»" value={lk.addNew} onChange={(v) => s({ addNew: v })} /><Check label="Selezione multipla" value={lk.multiple} onChange={(v) => s({ multiple: v })} /></span></Row>
      </>}
    </>
  );
}

/** Encrypted field and the project key (secrets.encryptionKey, also in config/secrets.php of the app). */
function EncryptRow({ f, onChange }: { f: Field; onChange: (v: boolean) => void }) {
  const secrets = useStore((st) => st.secrets);
  const on = !!(f as { encrypt?: boolean }).encrypt;
  const textual = !['int', 'decimal', 'bool', 'date', 'datetime', 'time', 'binary'].includes(f.type);
  const gen = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); saveSecrets({ encryptionKey: btoa(String.fromCharCode(...b)) }); };
  return <>
    <Row label="Cifrato nel database" hint={textual ? 'AES-256: nel database c\'è solo il valore cifrato, l\'app lo mostra in chiaro. Non si può cercare né filtrare su questo campo e la colonna deve essere un testo lungo (circa 1,4 volte il valore + 45 caratteri)' : 'Solo per campi di testo'}>
      <Check value={on} onChange={onChange} label="Cifra il valore (dati personali, IBAN, codici fiscali…)" /></Row>
    {on && <Row label="Chiave di cifratura" hint="Unica per il progetto, salvata solo su questo computer e nella configurazione dell'app generata (config/secrets.php). Senza la stessa chiave i dati cifrati non si leggono più: conservane una copia sicura e usa la stessa sul server di produzione">
      {secrets.encryptionKey
        ? <span className="inline"><code className="muted">{secrets.encryptionKey.slice(0, 6)}…</code><Btn small icon="clipboard" onClick={() => navigator.clipboard.writeText(secrets.encryptionKey!)}>Copia</Btn></span>
        : <Btn small kind="primary" icon="key" onClick={gen}>Genera la chiave</Btn>}</Row>}
  </>;
}

export default function FieldDialog({ t, field, onChange, onClose }: { t: Table; field: Field; onChange: (f: Field) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'view' | 'edit' | 'val' | 'more'>('edit');
  const f = field;
  const s = (patch: Partial<Field>) => onChange({ ...f, ...patch });
  const ea = f.editAs;
  const va = f.viewAs;
  const setEa = (patch: any) => s({ editAs: { ...ea, ...patch } });
  const setVa = (patch: any) => s({ viewAs: { ...va, ...patch } });
  const val = f.validation || {};
  const setVal = (patch: any) => s({ validation: { ...val, ...patch } });
  return (
    <Modal wide title={<>Campo <code>{f.name}</code> <small className="muted">{f.dbType}{f.pk ? ' · chiave' : ''}{f.autoInc ? ' · auto' : ''}</small></>} onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Chiudi</Btn>}>
      <Row label="Etichetta"><LangText value={f.label} onChange={(v) => s({ label: v })} /></Row>
      <Tabs value={tab} onChange={setTab} tabs={[['edit', 'Modifica come', 'pencil-square'], ['view', 'Visualizza come', 'eye'], ['val', 'Validazione', 'check2-square'], ['more', 'Altro', 'three-dots']]} />
      {tab === 'edit' && <Section title="">
        <Row label="Controllo"><Select value={ea.type} options={EDIT_AS} onChange={(v) => {
          const patch: any = { type: v };
          if (LOOKUP_TYPES.includes(v) && !ea.lookup) patch.lookup = { kind: 'list', values: [] };
          if ((v === 'file' || v === 'image') && !ea.upload) patch.upload = { storage: 'folder', maxMb: 20, types: v === 'image' ? 'jpg,jpeg,png,gif,webp' : '', thumbnail: v === 'image' ? { width: 150, height: 150 } : undefined };
          s({ editAs: { ...ea, ...patch }, viewAs: LOOKUP_TYPES.includes(v) ? { type: 'lookup' } : (v === 'image' || v === 'file') ? { type: v } : va });
        }} /></Row>
        {LOOKUP_TYPES.includes(ea.type) && ea.lookup && <LookupEditor t={t} lk={ea.lookup} onChange={(l) => setEa({ lookup: l })} />}
        {(ea.type === 'file' || ea.type === 'image') && <>
          <Row label="Salvataggio"><Select value={ea.upload?.storage || 'folder'} options={[['folder', 'Cartella (nel campo: elenco JSON dei file)'], ['database', 'Nel database (BLOB)']]} onChange={(v) => setEa({ upload: { ...ea.upload, storage: v } })} /></Row>
          <Row label="Estensioni ammesse" hint="Separate da virgola; vuoto = tutte (eccetto eseguibili)"><Text value={ea.upload?.types} onChange={(v) => setEa({ upload: { ...ea.upload, types: v } })} mono /></Row>
          <Row label="Dimensione max (MB)"><Num value={ea.upload?.maxMb} onChange={(v) => setEa({ upload: { ...ea.upload, maxMb: v || undefined } })} /></Row>
          {ea.upload?.storage !== 'database' && <Row label="Più file"><Check value={ea.upload?.multiple} onChange={(v) => setEa({ upload: { ...ea.upload, multiple: v } })} /></Row>}
          {ea.type === 'image' && <>
            <Row label="Miniatura (px)"><span className="inline"><Num value={ea.upload?.thumbnail?.width} onChange={(v) => setEa({ upload: { ...ea.upload, thumbnail: v ? { width: v, height: ea.upload?.thumbnail?.height || v } : undefined } })} /> × <Num value={ea.upload?.thumbnail?.height} onChange={(v) => setEa({ upload: { ...ea.upload, thumbnail: { width: ea.upload?.thumbnail?.width || 150, height: v || 150 } } })} /></span></Row>
            <Row label="Ridimensiona al caricamento"><span className="inline"><Num value={ea.upload?.resize?.width} onChange={(v) => setEa({ upload: { ...ea.upload, resize: v ? { width: v, height: ea.upload?.resize?.height || v } : undefined } })} /> × <Num value={ea.upload?.resize?.height} onChange={(v) => setEa({ upload: { ...ea.upload, resize: { width: ea.upload?.resize?.width || 1600, height: v || 1600 } } })} /></span></Row>
          </>}
        </>}
        {ea.type === 'textarea' && <Row label="Righe"><Num value={ea.rows} onChange={(v) => setEa({ rows: v || 5 })} /></Row>}
        {ea.type === 'text' && <Row label="Lunghezza massima"><Num value={ea.maxLength} onChange={(v) => setEa({ maxLength: v || undefined })} /></Row>}
        {['text', 'textarea', 'number', 'email', 'autocomplete'].includes(ea.type) && <Row label="Segnaposto"><LangText value={ea.placeholder} onChange={(v) => setEa({ placeholder: v })} /></Row>}
      </Section>}
      {tab === 'view' && <Section title="">
        <Row label="Formato"><Select value={va.type} options={VIEW_AS} onChange={(v) => setVa({ type: v, code: v === 'custom' && !va.code ? '<?php\n// $value, $row, $context (list|view|print). Restituisci HTML.\nreturn h($value);\n' : va.code })} /></Row>
        {['number', 'currency', 'percent'].includes(va.type) && <Row label="Decimali"><Num value={va.decimals} onChange={(v) => setVa({ decimals: v === '' ? undefined : v })} /></Row>}
        {va.type === 'percent' && <Row label="Valore frazionario"><Check value={va.fraction} onChange={(v) => setVa({ fraction: v })} label="0,25 → 25%" /></Row>}
        {va.type === 'longtext' && <Row label="Tronca in lista (caratteri)"><Num value={va.truncate} onChange={(v) => setVa({ truncate: v || undefined })} /></Row>}
        {va.type === 'custom' && <CodeEditor value={va.code || ''} onChange={(v) => setVa({ code: v })} height={200} />}
        <Row label="Totale in lista"><Select value={f.totals} options={[['', '—'], ['sum', 'Somma'], ['avg', 'Media'], ['count', 'Conteggio'], ['min', 'Minimo'], ['max', 'Massimo']]} onChange={(v) => s({ totals: v })} /></Row>
        <Row label="Filtro laterale"><Check value={f.filter} onChange={(v) => s({ filter: v })} label="Mostra nel pannello filtri della lista (valori distinti con conteggio)" /></Row>
      </Section>}
      {tab === 'val' && <Section title="">
        <Row label="Obbligatorio"><Check value={val.required} onChange={(v) => setVal({ required: v })} /></Row>
        <Row label="Valore unico"><Check value={val.unique} onChange={(v) => setVal({ unique: v })} label="Controlla che non esista già nella tabella" /></Row>
        <EncryptRow f={f} onChange={(encrypt) => s({ encrypt } as Partial<Field>)} />
        <Row label="Email"><Check value={val.email} onChange={(v) => setVal({ email: v })} /></Row>
        <Row label="Minimo / massimo"><span className="inline"><Text value={val.min as any} onChange={(v) => setVal({ min: v })} /><Text value={val.max as any} onChange={(v) => setVal({ max: v })} /></span></Row>
        <Row label="Lunghezza min / max"><span className="inline"><Num value={val.minLength} onChange={(v) => setVal({ minLength: v || undefined })} /><Num value={val.maxLength} onChange={(v) => setVal({ maxLength: v || undefined })} /></span></Row>
        <Row label="Espressione regolare" hint="Es. ^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$ per il codice fiscale"><Text value={val.regex} onChange={(v) => setVal({ regex: v })} mono /></Row>
        {val.regex && <Row label="Messaggio errore"><LangText value={val.regexMessage} onChange={(v) => setVal({ regexMessage: v })} /></Row>}
      </Section>}
      {tab === 'more' && <Section title="">
        <Row label="Valore predefinito" hint="Testo fisso o {now} {today} {user} {userid} {ip}"><Text value={f.defaultValue} onChange={(v) => s({ defaultValue: v })} mono /></Row>
        <Row label="Imposta all'inserimento" hint="Sovrascrive sempre il valore, es. {user} o {now}"><Text value={f.autoUpdate?.add} onChange={(v) => s({ autoUpdate: { ...f.autoUpdate, add: v } })} mono /></Row>
        <Row label="Imposta alla modifica"><Text value={f.autoUpdate?.edit} onChange={(v) => s({ autoUpdate: { ...f.autoUpdate, edit: v } })} mono /></Row>
        <Row label="Suggerimento"><LangText value={f.hint} onChange={(v) => s({ hint: v })} /></Row>
        <Row label="Larghezza nei moduli" hint="Colonne su 12"><Select value={String(f.layout?.edit?.span || '')} options={[['', 'Automatica'], ['3', '1/4'], ['4', '1/3'], ['6', '1/2'], ['8', '2/3'], ['12', 'Intera']]}
          onChange={(v) => { const span = v ? Number(v) : undefined; s({ layout: { ...f.layout, add: { span }, edit: { span } } }); }} /></Row>
      </Section>}
    </Modal>
  );
}
