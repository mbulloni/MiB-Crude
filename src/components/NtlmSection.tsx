// Windows (NTLM) sign-in, as in the R-LAB projects: the web server authenticates, the app reads REMOTE_USER and
// takes groups, area and page rights from the R-LAB tables (names and columns can be changed). runtime/lib/Ntlm.php
import { update, useStore } from '../store';
import { Check, Row, Section, Select, Text } from './ui';

export interface NtlmCfg {
  connection?: string; trustedHeader?: string; stripDomain?: boolean; uppercase?: boolean; suffix?: string; match?: 'exact' | 'like';
  userTable?: string; userCol?: string; groupCol?: string; areaCol?: string;
  permTable?: string; permGroupCol?: string; permPageCol?: string; permCol?: string;
  profileTable?: string; profileUserCol?: string; firstNameCol?: string; lastNameCol?: string;
  accessLog?: boolean; accessTable?: string; accessVersion?: string;
  adminGroups?: string[]; denyUnknown?: boolean; createTables?: boolean; devUser?: string;
}
export const NTLM_DEFAULTS: NtlmCfg = {
  connection: '', trustedHeader: '', stripDomain: true, uppercase: true, suffix: '@posteitaliane.it', match: 'exact',
  userTable: 'rlab_profilazione_gruppo', userCol: 'username', groupCol: 'gruppo', areaCol: 'AREA',
  permTable: 'rlab_profilazione_permission', permGroupCol: 'Gruppo', permPageCol: 'Pagina', permCol: 'Permessi',
  profileTable: 'rlab_venditori', profileUserCol: 'Username', firstNameCol: 'Nome', lastNameCol: 'Cognome',
  accessLog: true, accessTable: 'r_lab_statistiche.rlab_accessi', accessVersion: '3',
  adminGroups: ['AMMINISTRATORE'], denyUnknown: true, createTables: true, devUser: '',
};

export default function NtlmSection({ readOnly }: { readOnly: boolean }) {
  const p = useStore((s) => s.proj)!;
  const n: NtlmCfg = { ...NTLM_DEFAULTS, ...((p.security as unknown as { ntlm?: NtlmCfg }).ntlm || {}) };
  const set = (patch: NtlmCfg) => { if (!readOnly) update((d) => { const s = d.security as unknown as { ntlm?: NtlmCfg }; s.ntlm = { ...NTLM_DEFAULTS, ...(s.ntlm || {}), ...patch }; }); };
  const t = (k: keyof NtlmCfg, label: string, hint?: string) => <Row label={label} hint={hint}><Text value={n[k] as string} onChange={(v) => set({ [k]: v } as NtlmCfg)} mono /></Row>;
  const conns: [string, string][] = [['', 'Connessione principale'], ...p.connections.filter((c) => c.driver !== 'rest').map((c) => [c.id, c.name] as [string, string])];
  return <>
    <Section title="Autenticazione Windows (NTLM)" help="Come nei progetti R-LAB: il server web (Apache con mod_auth_ntlm_winbind o mod_auth_sspi, IIS) autentica il browser e passa l'utente in REMOTE_USER; nessuna pagina di login. Il Docker di progetto prepara Apache con NTLM.">
      <Row label="Connessione dei profili"><Select value={n.connection || ''} options={conns} onChange={(v) => set({ connection: v })} /></Row>
      <Row label="Nome utente" hint="DOMINIO\utente o utente@dominio → come è salvato nelle tabelle (R-LAB: NOMECOGN@posteitaliane.it)"><span className="chips">
        <Check label="Togli il dominio (DOMINIO\)" value={n.stripDomain} onChange={(v) => set({ stripDomain: v })} />
        <Check label="Maiuscolo" value={n.uppercase} onChange={(v) => set({ uppercase: v })} /></span></Row>
      {t('suffix', 'Suffisso se manca @', 'Es. @posteitaliane.it (vuoto = nessuno)')}
      <Row label="Confronto"><Select value={n.match || 'exact'} options={[['exact', 'Nome uguale (senza maiuscole/minuscole)'], ['like', 'Contiene (LIKE %nome%, come R-LAB)']]} onChange={(v) => set({ match: v as 'exact' | 'like' })} /></Row>
      {t('trustedHeader', 'Intestazione del proxy', 'Solo dietro un reverse proxy che autentica (es. X-Remote-User); vuoto = REMOTE_USER del server')}
      <Row label="Gruppi amministratori" hint="Accesso completo e gestione utenti/permessi"><Text value={(n.adminGroups || []).join(', ')} onChange={(v) => set({ adminGroups: v.split(',').map((x) => x.trim()).filter(Boolean) })} mono /></Row>
      <Row label="Utenti non in tabella"><Check value={n.denyUnknown} onChange={(v) => set({ denyUnknown: v })} label="Accesso negato (altrimenti entrano senza gruppi)" /></Row>
      {t('devUser', 'Utente simulato (anteprima)', 'Solo nell\'anteprima del designer (php -S non autentica): es. DOMINIO\\MIOUTENTE; vuoto = il tuo utente di questo computer')}
    </Section>
    <Section title="Tabelle di profilazione" help="Nomi e colonne delle tabelle R-LAB; vengono create se mancano (si può disattivare). La gestione è nell'app: Amministrazione › Utenti Windows e Permessi pagine.">
      {t('userTable', 'Utenti e gruppi')}
      <Row label="Colonne"><span className="inline"><Text value={n.userCol} onChange={(v) => set({ userCol: v })} mono /><Text value={n.groupCol} onChange={(v) => set({ groupCol: v })} mono /><Text value={n.areaCol} onChange={(v) => set({ areaCol: v })} mono /></span></Row>
      {t('permTable', 'Permessi pagine', 'Gruppo, Pagina (nome tabella o pagina classica, es. ordini_list.php), Permessi R:W:L')}
      <Row label="Colonne"><span className="inline"><Text value={n.permGroupCol} onChange={(v) => set({ permGroupCol: v })} mono /><Text value={n.permPageCol} onChange={(v) => set({ permPageCol: v })} mono /><Text value={n.permCol} onChange={(v) => set({ permCol: v })} mono /></span></Row>
      {t('profileTable', 'Anagrafica (facoltativa)', 'Nome e cognome mostrati nell\'app')}
      <Row label="Colonne"><span className="inline"><Text value={n.profileUserCol} onChange={(v) => set({ profileUserCol: v })} mono /><Text value={n.firstNameCol} onChange={(v) => set({ firstNameCol: v })} mono /><Text value={n.lastNameCol} onChange={(v) => set({ lastNameCol: v })} mono /></span></Row>
      <Row label="Registro accessi"><Check value={n.accessLog} onChange={(v) => set({ accessLog: v })} label="Una riga per pagina visitata (data, ip, userid, username, gruppo, pagina, url, browser, versione)" /></Row>
      {n.accessLog && t('accessTable', 'Tabella accessi', 'Anche in un altro database dello stesso server: database.tabella')}
      <Row label="Crea tabelle"><Check value={n.createTables} onChange={(v) => set({ createTables: v })} label="Crea utenti e permessi se mancano" /></Row>
    </Section>
  </>;
}
