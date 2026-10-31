// Text messages of the generated app (runtime/lib/Sms.php): sendSms(), runner_sms() and the SMS codes of the
// two-step verification, through Twilio, any HTTP gateway or a file (to try without a gateway).
import { saveSecrets, update, useStore } from '../store';
import { Row, Section, Select, Text } from './ui';

interface SmsCfg { provider?: '' | 'twilio' | 'http' | 'file'; accountSid?: string; from?: string; url?: string; method?: string; body?: string; contentType?: string; okText?: string; file?: string }

export default function SmsSection() {
  const sms = useStore((s) => (s.proj?.project.settings as { sms?: SmsCfg }).sms) || {};
  const secrets = useStore((s) => s.secrets);
  const set = (patch: SmsCfg) => update((d) => { const st = d.project.settings as { sms?: SmsCfg }; st.sms = { ...(st.sms || {}), ...patch }; if (!st.sms.provider) delete st.sms; });
  const pw = <Row label={sms.provider === 'twilio' ? 'Auth token' : 'Password / chiave'} hint="Salvata solo sul tuo computer (nel gateway HTTP: segnaposto {password})">
    <Text type="password" value={secrets.smsPassword} onChange={(v) => saveSecrets({ smsPassword: v })} /></Row>;
  return (
    <Section title="SMS" help="Invio di SMS dall'app: sendSms($numero, $testo) e runner_sms() negli eventi e nelle attività pianificate, codici della verifica in due passaggi via SMS (Sicurezza).">
      <Row label="Servizio"><Select value={sms.provider || ''} options={[['', 'Nessuno'], ['twilio', 'Twilio'], ['http', 'Gateway HTTP (Skebby, Aruba, Vonage, interno…)'], ['file', 'File di prova (nessun invio)']]} onChange={(v) => set({ provider: v as SmsCfg['provider'] })} /></Row>
      {sms.provider === 'twilio' && <>
        <Row label="Account SID"><Text value={sms.accountSid} onChange={(v) => set({ accountSid: v })} mono placeholder="AC…" /></Row>
        <Row label="Mittente" hint="Numero Twilio o nome mittente"><Text value={sms.from} onChange={(v) => set({ from: v })} mono placeholder="+1…" /></Row>
        {pw}
      </>}
      {sms.provider === 'http' && <>
        <Row label="Indirizzo" hint="Segnaposto {to} {text} {from} {password}, codificati per l'URL"><Text value={sms.url} onChange={(v) => set({ url: v })} mono placeholder="https://gateway.example.com/send?to={to}&text={text}" /></Row>
        <Row label="Metodo"><Select value={sms.method || 'POST'} options={[['POST', 'POST'], ['GET', 'GET']]} onChange={(v) => set({ method: v })} /></Row>
        {(sms.method || 'POST') === 'POST' && <>
          <Row label="Tipo del corpo"><Select value={sms.contentType || 'application/x-www-form-urlencoded'} options={[['application/x-www-form-urlencoded', 'Modulo (x-www-form-urlencoded)'], ['application/json', 'JSON']]} onChange={(v) => set({ contentType: v })} /></Row>
          <Row label="Corpo" hint="Stessi segnaposto; in JSON i valori sono protetti per JSON"><Text value={sms.body} onChange={(v) => set({ body: v })} mono placeholder={'{"to":"{to}","message":"{text}","sender":"{from}"}'} /></Row>
        </>}
        <Row label="Mittente"><Text value={sms.from} onChange={(v) => set({ from: v })} mono /></Row>
        <Row label="Risposta corretta" hint="Testo che la risposta deve contenere (vuoto: basta lo stato HTTP 2xx)"><Text value={sms.okText} onChange={(v) => set({ okText: v })} mono /></Row>
        {pw}
      </>}
      {sms.provider === 'file' && <Row label="File" hint="Una riga per messaggio (data, numero, testo). Vuoto: mibcrude-sms.log nella cartella temporanea"><Text value={sms.file} onChange={(v) => set({ file: v })} mono /></Row>}
    </Section>
  );
}
