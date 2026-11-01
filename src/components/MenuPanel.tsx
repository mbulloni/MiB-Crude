import { useState } from 'react';
import { update, useStore } from '../store';
import type { MenuItem } from '../types';
import { Btn, Check, Empty, Hero, I, LangText, Row, Section, Select, Text, lbl } from './ui';
import { useItemLock } from './TeamPanel';

type Path = number[];
const getList = (items: MenuItem[], path: Path) => path.slice(0, -1).reduce((l, i) => l[i].items!, items);

export default function MenuPanel() {
  const p = useStore((s) => s.proj)!;
  const items = p.menu.items;
  const [sel, setSel] = useState<Path | null>(null);
  const lock = useItemLock('menu');
  const ro = lock.readOnly;
  const set = (fn: (items: MenuItem[]) => void) => { if (!ro) update((d) => fn(d.menu.items)); };
  const selected = sel ? getList(items, sel)[sel[sel.length - 1]] : null;

  const add = (it: MenuItem) => set((root) => {
    if (selected?.type === 'group' && sel) { const g = getList(root, sel)[sel[sel.length - 1]]; g.items = [...(g.items || []), it]; }
    else root.push(it);
  });
  const move = (dir: -1 | 1) => sel && set((root) => {
    const list = getList(root, sel); const i = sel[sel.length - 1]; const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; setSel([...sel.slice(0, -1), j]);
  });
  const indent = () => sel && set((root) => {
    const list = getList(root, sel); const i = sel[sel.length - 1];
    const prev = list[i - 1];
    if (!prev || prev.type !== 'group') return;
    const [it] = list.splice(i, 1); prev.items = [...(prev.items || []), it];
    setSel([...sel.slice(0, -1), i - 1, prev.items.length - 1]);
  });
  const outdent = () => sel && sel.length > 1 && set((root) => {
    const list = getList(root, sel); const [it] = list.splice(sel[sel.length - 1], 1);
    const parentPath = sel.slice(0, -1);
    const plist = getList(root, parentPath); plist.splice(parentPath[parentPath.length - 1] + 1, 0, it);
    setSel([...parentPath.slice(0, -1), parentPath[parentPath.length - 1] + 1]);
  });
  const remove = () => sel && set((root) => { getList(root, sel).splice(sel[sel.length - 1], 1); setSel(null); });
  const edit = (patch: Partial<MenuItem>) => sel && set((root) => { Object.assign(getList(root, sel)[sel[sel.length - 1]], patch); });
  const auto = () => set((root) => { root.length = 0; for (const t of p.tables) if (t.pages.list?.enabled && !t.hideFromMenu) root.push({ type: 'table', table: t.name, page: 'list', icon: t.icon || 'table' }); });

  const label = (it: MenuItem) => {
    if (it.label && lbl(it.label)) return lbl(it.label);
    if (it.type === 'table') return lbl(p.tables.find((t) => t.name === it.table)?.caption, it.table);
    if (it.type === 'report') return lbl(p.reports.find((r) => r.name === it.ref)?.title, it.ref);
    if (it.type === 'chart') return lbl(p.charts.find((r) => r.name === it.ref)?.title, it.ref);
    if (it.type === 'dashboard') return lbl(p.dashboards.find((r) => r.name === it.ref)?.title, it.ref);
    return { separator: '———', header: 'Intestazione', group: 'Gruppo', link: it.url }[it.type as string] || it.type;
  };
  const Tree = ({ list, path }: { list: MenuItem[]; path: Path }) => <ul className="tree">{list.map((it, i) => {
    const pth = [...path, i];
    const on = sel && sel.join('.') === pth.join('.');
    return <li key={i}><div className={`tree-item ${on ? 'on' : ''}`} onClick={() => setSel(pth)}><I n={it.icon || { group: 'folder', link: 'link-45deg', separator: 'dash', header: 'type', report: 'file-earmark-bar-graph', chart: 'bar-chart', dashboard: 'speedometer2', table: 'table' }[it.type] || 'dot'} /> {label(it)}<small className="muted"> · {it.type}</small></div>
      {it.items && it.items.length > 0 && <Tree list={it.items} path={pth} />}</li>;
  })}</ul>;

  return (
    <div className="panel">
      <Hero icon="list-nested" title="Menu" chips={[
        ['list-ul', `${p.menu.items.length} voci principali`],
        ['folder', `${p.menu.items.filter((x) => x.type === 'group').length} gruppi`],
        !p.menu.items.length && ['magic', 'Vuoto: l\'app elenca tutte le tabelle'],
      ]} actions={lock.banner} />
      <div className="cols">
        <Section title="Struttura" actions={<Btn small icon="magic" onClick={auto}>Dalle tabelle</Btn>} help="Senza voci, il menu elenca automaticamente tutte le tabelle. Le voci senza permesso non vengono mostrate all'utente.">
          <div className="inline wrap">
            <Btn small icon="table" onClick={() => add({ type: 'table', table: p.tables[0]?.name, page: 'list' })}>Tabella</Btn>
            <Btn small icon="folder-plus" onClick={() => add({ type: 'group', label: { it: 'Gruppo' }, items: [] })}>Gruppo</Btn>
            <Btn small icon="link-45deg" onClick={() => add({ type: 'link', label: { it: 'Link' }, url: 'https://' })}>Link</Btn>
            <Btn small icon="file-earmark-bar-graph" disabled={!p.reports.length} onClick={() => add({ type: 'report', ref: p.reports[0]?.name })}>Report</Btn>
            <Btn small icon="bar-chart" disabled={!p.charts.length} onClick={() => add({ type: 'chart', ref: p.charts[0]?.name })}>Grafico</Btn>
            <Btn small icon="speedometer2" disabled={!p.dashboards.length} onClick={() => add({ type: 'dashboard', ref: p.dashboards[0]?.name })}>Dashboard</Btn>
            <Btn small icon="type" onClick={() => add({ type: 'header', label: { it: 'Sezione' } })}>Intestazione</Btn>
            <Btn small icon="dash" onClick={() => add({ type: 'separator' })}>Separatore</Btn>
          </div>
          {items.length ? <Tree list={items} path={[]} /> : <Empty icon="list-nested" title="Menu automatico" />}
          {sel && <div className="inline"><Btn small icon="arrow-up" onClick={() => move(-1)} /><Btn small icon="arrow-down" onClick={() => move(1)} />
            <Btn small icon="arrow-bar-right" title="Sposta nel gruppo precedente" onClick={indent} /><Btn small icon="arrow-bar-left" title="Esci dal gruppo" onClick={outdent} />
            <Btn small kind="ghost" icon="trash" onClick={remove} /></div>}
        </Section>
        <Section title="Voce selezionata">
          <fieldset disabled={ro} className="plain">
          {!selected ? <p className="help">Seleziona una voce.</p> : <>
            {selected.type === 'table' && <><Row label="Tabella"><Select value={selected.table} options={p.tables.map((t) => [t.name, lbl(t.caption, t.name)] as [string, string])} onChange={(v) => edit({ table: v })} /></Row>
              <Row label="Pagina"><Select value={selected.page || 'list'} options={[['list', 'Lista'], ['add', 'Nuovo'], ['search', 'Ricerca']]} onChange={(v) => edit({ page: v })} /></Row></>}
            {['report', 'chart', 'dashboard'].includes(selected.type) && <Row label="Elemento"><Select value={selected.ref} options={(selected.type === 'report' ? p.reports : selected.type === 'chart' ? p.charts : p.dashboards).map((r) => [r.name, lbl(r.title, r.name)] as [string, string])} onChange={(v) => edit({ ref: v })} /></Row>}
            {selected.type === 'link' && <><Row label="URL"><Text value={selected.url} onChange={(v) => edit({ url: v })} mono /></Row><Row label="Nuova finestra"><Check value={selected.newWindow} onChange={(v) => edit({ newWindow: v })} /></Row></>}
            {selected.type !== 'separator' && <Row label="Etichetta" hint={selected.type === 'table' ? 'Vuota: etichetta della tabella' : undefined}><LangText value={selected.label} onChange={(v) => edit({ label: v })} /></Row>}
            {!['separator', 'header'].includes(selected.type) && <Row label="Icona"><span className="inline"><Text value={selected.icon} onChange={(v) => edit({ icon: v })} mono /><I n={selected.icon || 'dot'} /></span></Row>}
          </>}
          </fieldset>
        </Section>
      </div>
    </div>
  );
}
