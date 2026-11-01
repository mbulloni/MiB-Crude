// Small form primitives shared by all panels.
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { L } from '../types';

export const I = ({ n, className = '' }: { n: string; className?: string }) => <i className={`bi bi-${n} ${className}`} />;

export function Btn({ icon, children, onClick, kind = '', disabled, title, small }: { icon?: string; children?: ReactNode; onClick?: () => void; kind?: '' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; title?: string; small?: boolean }) {
  return (
    <button type="button" className={`btn ${kind} ${small ? 'sm' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {icon && <I n={icon} />}{children && <span>{children}</span>}
    </button>
  );
}

export function Row({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`row ${wide ? 'wide' : ''}`}>
      <span className="row-label">{label}</span>
      <span className="row-ctl">{children}{hint && <small className="hint">{hint}</small>}</span>
    </label>
  );
}

export function Text({ value, onChange, placeholder, mono, type = 'text', disabled }: { value: string | number | undefined; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string; disabled?: boolean }) {
  return <input className={`inp ${mono ? 'mono' : ''}`} type={type} value={value ?? ''} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

export function Num({ value, onChange, min, max, step }: { value: number | string | undefined; onChange: (v: number | '') => void; min?: number; max?: number; step?: number }) {
  return <input className="inp num" type="number" value={value ?? ''} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
}

export function Area({ value, onChange, rows = 4, mono, placeholder }: { value: string | undefined; onChange: (v: string) => void; rows?: number; mono?: boolean; placeholder?: string }) {
  return <textarea className={`inp ${mono ? 'mono' : ''}`} rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Check({ value, onChange, label, title }: { value: boolean | undefined; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <span className="check" title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{label && <span>{label}</span>}
    </span>
  );
}

export function Select<T extends string>({ value, onChange, options, disabled }: { value: T | undefined; onChange: (v: T) => void; options: ([T, string] | T)[]; disabled?: boolean }) {
  return (
    <select className="inp" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
}

/** Multi-language text: the default language inline, the others behind a toggle. */
export function LangText({ value, onChange, multiline }: { value: L | undefined; onChange: (v: L) => void; multiline?: boolean }) {
  const langs = useStore((s) => s.proj?.project.languages || ['it']);
  const [open, setOpen] = useState(false);
  const v = value || {};
  const set = (code: string, t: string) => onChange({ ...v, [code]: t });
  const Ctl = ({ code }: { code: string }) => multiline
    ? <textarea className="inp" rows={3} value={v[code] || ''} onChange={(e) => set(code, e.target.value)} />
    : <input className="inp" value={v[code] || ''} onChange={(e) => set(code, e.target.value)} />;
  return (
    <span className="langtext">
      <span className="lt-row"><span className="lt-code">{langs[0]}</span>{Ctl({ code: langs[0] })}
        {langs.length > 1 && <button type="button" className="btn ghost sm" title="Altre lingue" onClick={() => setOpen(!open)}><I n="translate" /></button>}</span>
      {open && langs.slice(1).map((code) => <span className="lt-row" key={code}><span className="lt-code">{code}</span>{Ctl({ code })}</span>)}
    </span>
  );
}

export function Modal({ title, children, onClose, footer, wide }: { title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><b>{title}</b><button type="button" className="btn ghost sm" onClick={onClose}><I n="x-lg" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string, string?][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label, icon]) => <button type="button" key={k} className={`tab ${k === value ? 'on' : ''}`} onClick={() => onChange(k)}>{icon && <I n={icon} />} {label}</button>)}
    </div>
  );
}

export function Section({ title, children, actions, help }: { title: ReactNode; children: ReactNode; actions?: ReactNode; help?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h3>{title}</h3><span className="grow" />{actions}</div>
      {help && <p className="help">{help}</p>}
      {children}
    </section>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return <div className="empty"><I n={icon} className="big" /><h3>{title}</h3>{children}</div>;
}

export const lbl = (l: L | undefined, fallback = '') => {
  const p = useStore.getState().proj;
  const code = p?.project.defaultLanguage || 'it';
  return (l && (l[code] || Object.values(l).find(Boolean))) || fallback;
};

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'item';

/** Summary at the top of a panel: icon (or initial) on the accent colour, title, chips, actions on the right. */
export function Hero({ icon, letter, title, sub, chips, actions, color }: { icon?: string; letter?: string; title: ReactNode; sub?: ReactNode; chips?: ([string, ReactNode] | false | null | undefined)[]; actions?: ReactNode; color?: string }) {
  return (
    <div className="settings-hero" style={{ ['--pc' as string]: color || 'var(--accent)' } as React.CSSProperties}>
      <div className="hero-logo">{letter ?? <I n={icon || 'grid'} />}</div>
      <div className="grow">
        <h2>{title}{sub && <small className="hero-sub"> {sub}</small>}</h2>
        {chips && <div className="hero-chips">{chips.filter(Boolean).map((c, i) => { const [ic, txt] = c as [string, ReactNode]; return <span key={i}><I n={ic} /> {txt}</span>; })}</div>}
      </div>
      {actions && <div className="hero-actions">{actions}</div>}
    </div>
  );
}

/** Categories on the left (icon, name, one line), the content of the chosen one on the right; the choice is remembered. */
export function NavLayout<T extends string>({ id, items, value, onChange, children, narrowOn }: { id: string; items: [T, string, string, string?][]; value?: T; onChange?: (v: T) => void; children: (cat: T) => ReactNode; narrowOn?: T[] }) {
  const key = `mc-nav-${id}`;
  const [own, setOwn] = useState<T>(() => {
    try { const v = localStorage.getItem(key) as T | null; if (v && items.some(([k]) => k === v)) return v; } catch { /* private mode */ }
    return items[0][0];
  });
  const cur = value !== undefined && items.some(([k]) => k === value) ? value : items.some(([k]) => k === own) ? own : items[0][0];
  const pick = (k: T) => { setOwn(k); try { localStorage.setItem(key, k); } catch { /* private mode */ } onChange?.(k); };
  return (
    <div className={`settings-layout ${narrowOn?.includes(cur) ? 'narrow' : ''}`}>
      <nav className="settings-nav">
        {items.map(([k, label, icon, desc]) => (
          <button type="button" key={k} className={`settings-nav-item ${cur === k ? 'on' : ''}`} onClick={() => pick(k)} title={label}>
            <I n={icon} /><span><b>{label}</b>{desc && <small>{desc}</small>}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">{children(cur)}</div>
    </div>
  );
}
