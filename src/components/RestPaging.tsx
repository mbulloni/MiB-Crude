// API paging of a REST datasource: shared by "Nuova origine REST" and the table's General tab.
import type { RestPaging } from '../types';
import { Num, Row, Select, Text } from './ui';

export default function RestPagingFields({ value, onChange }: { value: RestPaging | undefined; onChange: (v: RestPaging | undefined) => void }) {
  const pg: RestPaging = value || { mode: '' };
  const s = (patch: Partial<RestPaging>) => onChange({ ...pg, ...patch });
  return <>
    <Row label="Paginazione dell'API" hint="Se il servizio restituisce i record a pagine. Lista, ricerca rapida e ordinamento vengono chiesti all'API; filtri, totali, report, grafici e lookup leggono tutte le pagine (fino a 50.000 record)">
      <Select value={pg.mode} options={[['', 'Nessuna: l\'elenco arriva tutto insieme'], ['page', 'Numero di pagina (?page=2&limit=20)'], ['offset', 'Scostamento (?offset=40&limit=20)']]}
        onChange={(v) => onChange(v ? { pageParam: 'page', firstPage: 1, offsetParam: 'offset', sizeParam: 'limit', pageSize: 100, ...pg, mode: v } : undefined)} /></Row>
    {pg.mode && <>
      {pg.mode === 'page'
        ? <Row label="Parametro pagina"><span className="inline"><Text value={pg.pageParam} onChange={(v) => s({ pageParam: v })} mono placeholder="page" /> prima pagina <Num value={pg.firstPage} min={0} onChange={(v) => s({ firstPage: v === '' ? 1 : v })} /></span></Row>
        : <Row label="Parametro scostamento"><Text value={pg.offsetParam} onChange={(v) => s({ offsetParam: v })} mono placeholder="offset" /></Row>}
      <Row label="Parametro dimensione" hint="Vuoto se l'API usa una dimensione fissa"><span className="inline"><Text value={pg.sizeParam} onChange={(v) => s({ sizeParam: v })} mono placeholder="limit" /> record per pagina letta <Num value={pg.pageSize} min={1} onChange={(v) => s({ pageSize: v === '' ? 100 : v })} /></span></Row>
      <Row label="Percorso del totale" hint="Numero complessivo di record nella risposta, es. meta.total. Senza totale il conteggio legge tutte le pagine"><Text value={pg.totalPath} onChange={(v) => s({ totalPath: v })} mono placeholder="meta.total" /></Row>
      <Row label="Parametro ricerca" hint="Ricerca rapida eseguita dall'API, es. q o search. Vuoto = ricerca nell'app"><Text value={pg.searchParam} onChange={(v) => s({ searchParam: v })} mono /></Row>
      <Row label="Ordinamento" hint="Parametro del campo e della direzione (es. sort + order). Senza parametro direzione il discendente si invia come -campo"><span className="inline">
        <Text value={pg.sortParam} onChange={(v) => s({ sortParam: v })} mono placeholder="sort" /><Text value={pg.dirParam} onChange={(v) => s({ dirParam: v })} mono placeholder="order" /></span></Row>
    </>}
  </>;
}
