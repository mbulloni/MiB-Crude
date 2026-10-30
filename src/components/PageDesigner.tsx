// Page designer: sections (cards or tabs) on a 12-column grid, fields and blocks placed by drag & drop.
import { useState } from 'react';
import { update, useStore } from '../store';
import type { Field, Table } from '../types';
import { Btn, I, LangText, Select, Tabs, lbl } from './ui';

type Page = 'edit' | 'add' | 'view';
interface Block { type: 'html' | 'snippet'; html?: Record<string, string>; event?: string }
interface Sec { title: Record<string, string>; style?: 'card' | 'tab'; columns?: number; fields: string[]; blocks?: Block[] }
type Drag = { kind: 'field'; name: string; from: number } | { kind: 'new-html' } | { kind: 'new-snippet' } | null;

const SPANS = [3, 4, 6, 8, 12];

export default function PageDesigner({ t, readOnly }: { t: Table; readOnly?: boolean }) {
  const p = useStore((s) => s.proj)!;
  const [page, setPage] = useState<Page>('edit');
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string>('');
  const visible = t.fields.filter((f) => f.show[page]);
  const sections: Sec[] = (t.layout?.[page]?.sections as Sec[]) || [];
  const placed = new Set(sections.flatMap((s) => s.fields));
  const free = visible.filter((f) => !placed.has(f.name));
  const cols = Number(t.pages[page === 'view' ? 'view' : page]?.columns) || 1;

  const write = (fn: (secs: Sec[], tbl: Table) => void) => {
    if (readOnly) return;
    update((d) => {
      const x = d.tables.find((y) => y.name === t.name)!;
      x.layout = x.layout || {};
      const secs: Sec[] = structuredClone((x.layout[page]?.sections as Sec[]) || []);
      fn(secs, x);
      x.layout[page] = { sections: secs as any };
    });
  };
  const spanOf = (f: Field, secCols?: number) => f.layout?.[page]?.span || (['textarea', 'richtext', 'signature'].includes(f.editAs.type) ? 12 : Math.floor(12 / (secCols || cols)));
  const setSpan = (name: string, dir: 1 | -1, secCols?: number) => write((_, x) => {
    const f = x.fields.find((y) => y.name === name)!;
    const cur = spanOf(f, secCols);
    const i = Math.max(0, SPANS.findIndex((s) => s >= cur));
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, i + dir))];
    f.layout = { ...(f.layout || {}), [page]: { span: next } };
  });
  // Drop a field into section `si` before field `before` (or at the end).
  const dropField = (si: number, before?: string) => {
    if (!drag) return;
    if (drag.kind === 'field') {
      write((secs) => {
        for (const s of secs) s.fields = s.fields.filter((n) => n !== drag.name);
        if (si < 0) return; // back to the palette
        const list = secs[si].fields;
        const at = before ? list.indexOf(before) : -1;
        if (at >= 0) list.splice(at, 0, drag.name); else list.push(drag.name);
      });
    } else if (si >= 0) {
      write((secs, x) => {
        if (drag.kind === 'new-html') (secs[si].blocks ||= []).push({ type: 'html', html: { [p.project.defaultLanguage]: '<p>Testo</p>' } });
        else {
          let n = 1;
          const evs = p.events[t.name] || {};
          while (evs[`Snippet_blocco${n}`]) n++;
          const ev = `Snippet_blocco${n}`;
          (secs[si].blocks ||= []).push({ type: 'snippet', event: ev });
          void x;
          setTimeout(() => update((d) => { d.events[t.name] = { ...(d.events[t.name] || {}), [ev]: "<?php\n// Codice PHP mostrato nella pagina ($page = add, edit o view)\necho '<div class=\"alert alert-info\">Blocco personalizzato</div>';\nreturn true;\n" }; }), 0);
        }
      });
    }
    setDrag(null);
    setOver('');
  };
  const addSection = () => write((secs) => {
    // First section: take the fields that are currently auto-placed.
    secs.push({ title: { [p.project.defaultLanguage]: secs.length ? `Sezione ${secs.length + 1}` : 'Dati' }, style: 'card', fields: secs.length ? [] : visible.map((f) => f.name) });
  });

  const Tile = ({ f, si, secCols }: { f: Field; si: number; secCols?: number }) => {
    const span = spanOf(f, secCols);
    return (
      <div className={`pd-tile ${over === `${si}:${f.name}` ? 'over' : ''}`} style={{ gridColumn: `span ${span}` }} draggable={!readOnly}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', f.name); setDrag({ kind: 'field', name: f.name, from: si }); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(`${si}:${f.name}`); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropField(si, f.name); }}>
        <div className="pd-label">{lbl(f.label, f.name)}{f.validation?.required && <span className="req">*</span>}</div>
        <div className={`pd-control ${f.editAs.type}`}>{page === 'view' ? <span className="muted small">{f.viewAs.type}</span> : f.editAs.type === 'checkbox' ? <I n="toggle-on" /> : f.editAs.type === 'textarea' || f.editAs.type === 'richtext' ? '' : <span className="muted small">{f.editAs.type}</span>}</div>
        {!readOnly && <div className="pd-tools">
          <button type="button" title="Più stretto" onClick={() => setSpan(f.name, -1, secCols)}><I n="dash" /></button>
          <span>{span}/12</span>
          <button type="button" title="Più largo" onClick={() => setSpan(f.name, 1, secCols)}><I n="plus" /></button>
          <button type="button" title="Togli dalla sezione" onClick={() => write((secs) => { secs[si].fields = secs[si].fields.filter((n) => n !== f.name); })}><I n="x" /></button>
        </div>}
      </div>
    );
  };

  return (
    <div className="pd">
      <div className="inline wrap">
        <Tabs value={page} onChange={setPage} tabs={[['edit', 'Modifica', 'pencil-square'], ['add', 'Nuovo', 'plus-square'], ['view', 'Visualizza', 'eye']]} />
        <span className="grow" />
        <Btn icon="plus-lg" onClick={addSection} disabled={readOnly}>Sezione</Btn>
        {sections.length > 0 && <Btn kind="ghost" icon="arrow-counterclockwise" disabled={readOnly} onClick={() => { if (confirm('Tornare al layout automatico?')) write((secs) => { secs.length = 0; }); }}>Layout automatico</Btn>}
        {page !== 'edit' && sections.length === 0 && (t.layout?.edit?.sections?.length || 0) > 0 && <Btn icon="copy" onClick={() => write((secs) => { secs.push(...structuredClone(t.layout!.edit.sections as Sec[])); })}>Copia da Modifica</Btn>}
      </div>
      <div className="pd-body">
        <div className="pd-canvas">
          {!sections.length && <div className="pd-empty"><I n="layout-text-window" className="big" /><p>Layout automatico: tutti i campi in un unico riquadro, nell'ordine della scheda Campi.<br />Aggiungi una <b>Sezione</b> per disegnare la pagina.</p></div>}
          {sections.map((s, si) => {
            const fields = s.fields.map((n) => visible.find((f) => f.name === n)).filter(Boolean) as Field[];
            return (
              <div key={si} className={`pd-section ${s.style === 'tab' ? 'tab' : ''} ${over === `${si}:` ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(`${si}:`); }} onDrop={(e) => { e.preventDefault(); dropField(si); }}>
                <div className="pd-shead">
                  <I n={s.style === 'tab' ? 'folder2' : 'card-heading'} />
                  <LangText value={s.title} onChange={(v) => write((secs) => { secs[si].title = v; })} />
                  <Select value={s.style || 'card'} options={[['card', 'Riquadro'], ['tab', 'Scheda']]} onChange={(v) => write((secs) => { secs[si].style = v as any; })} />
                  <Select value={String(s.columns || '')} options={[['', `Colonne: ${cols}`], ['1', '1 colonna'], ['2', '2 colonne'], ['3', '3 colonne'], ['4', '4 colonne']]} onChange={(v) => write((secs) => { secs[si].columns = v ? Number(v) : undefined; })} />
                  <Btn small kind="ghost" icon="chevron-up" title="Sposta su" onClick={() => write((secs) => { if (si > 0) [secs[si - 1], secs[si]] = [secs[si], secs[si - 1]]; })} />
                  <Btn small kind="ghost" icon="chevron-down" title="Sposta giù" onClick={() => write((secs) => { if (si < secs.length - 1) [secs[si + 1], secs[si]] = [secs[si], secs[si + 1]]; })} />
                  <Btn small kind="ghost" icon="trash" title="Elimina sezione (i campi tornano nella tavolozza)" onClick={() => write((secs) => { secs.splice(si, 1); })} />
                </div>
                {(s.blocks || []).map((b, bi) => <div key={bi} className="pd-block">
                  {b.type === 'html' ? <LangText multiline value={b.html} onChange={(v) => write((secs) => { secs[si].blocks![bi].html = v; })} />
                    : <div className="inline"><I n="filetype-php" /> <b>{b.event}</b><span className="muted small">codice PHP nella scheda Eventi</span>
                      <Btn small onClick={() => useStore.getState().set({ nav: { kind: 'table', id: t.name, tab: 'events' } })}>Apri</Btn></div>}
                  <Btn small kind="ghost" icon="x-lg" onClick={() => write((secs) => { secs[si].blocks!.splice(bi, 1); })} />
                </div>)}
                <div className="pd-grid">{fields.map((f) => <Tile key={f.name} f={f} si={si} secCols={s.columns} />)}
                  {!fields.length && <div className="pd-drop">Trascina qui i campi</div>}</div>
              </div>
            );
          })}
        </div>
        <div className="pd-palette" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropField(-1); }}>
          <h4>Blocchi</h4>
          <div className="pd-pitem" draggable={!readOnly} onDragStart={() => setDrag({ kind: 'new-html' })}><I n="text-paragraph" /> Testo / HTML</div>
          <div className="pd-pitem" draggable={!readOnly} onDragStart={() => setDrag({ kind: 'new-snippet' })}><I n="filetype-php" /> Snippet PHP</div>
          <h4>Campi da collocare ({free.length})</h4>
          {sections.length === 0 ? <p className="help">Prima aggiungi una sezione.</p> : free.map((f) => <div key={f.name} className="pd-pitem" draggable={!readOnly}
            onDragStart={() => setDrag({ kind: 'field', name: f.name, from: -1 })}><I n="grip-vertical" /> {lbl(f.label, f.name)}</div>)}
          {sections.length > 0 && !free.length && <p className="help">Tutti i campi sono collocati. Trascina qui un campo per toglierlo.</p>}
        </div>
      </div>
    </div>
  );
}
