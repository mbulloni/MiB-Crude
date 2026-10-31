// Geocoding service of the generated app (runtime/lib/Geocode.php): coordinates of the map views from an address.
import { saveSecrets, update, useStore } from '../store';
import { Row, Section, Select, Text } from './ui';

interface GeoCfg { provider?: '' | 'nominatim' | 'google'; url?: string; countries?: string }

export default function GeocodeSection() {
  const g = useStore((s) => (s.proj?.project.settings as { geocode?: GeoCfg }).geocode) || {};
  const secrets = useStore((s) => s.secrets);
  const set = (patch: GeoCfg) => update((d) => { const st = d.project.settings as { geocode?: GeoCfg }; st.geocode = { ...(st.geocode || {}), ...patch }; if (!st.geocode.provider) delete st.geocode; });
  return (
    <Section title="Geocodifica" help="Coordinate delle viste mappa calcolate dall'indirizzo (campo «Indirizzo per la geocodifica» della vista Mappa della tabella): al salvataggio dei record, con il pulsante Geocodifica sopra la mappa o con Geocode::fill('tabella') in un'attività pianificata.">
      <Row label="Servizio"><Select value={g.provider || ''} options={[['', 'Nessuno'], ['nominatim', 'OpenStreetMap Nominatim (gratuito, 1 richiesta al secondo)'], ['google', 'Google Geocoding API (chiave)']]} onChange={(v) => set({ provider: v as GeoCfg['provider'] })} /></Row>
      {g.provider === 'nominatim' && <>
        <Row label="Server" hint="Vuoto: nominatim.openstreetmap.org; oppure un Nominatim aziendale (…/search)"><Text value={g.url} onChange={(v) => set({ url: v })} mono placeholder="https://nominatim.openstreetmap.org/search" /></Row>
        <Row label="Paesi" hint="Codici ISO separati da virgola, es. it,ch (vuoto: tutti)"><Text value={g.countries} onChange={(v) => set({ countries: v })} mono placeholder="it" /></Row>
      </>}
      {g.provider === 'google' && <Row label="Chiave API" hint="Salvata solo sul tuo computer"><Text type="password" value={secrets.geocodeKey} onChange={(v) => saveSecrets({ geocodeKey: v })} /></Row>}
    </Section>
  );
}
