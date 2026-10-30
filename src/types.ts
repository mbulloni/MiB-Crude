// Project shapes (mirror of core/project.cjs and core/defaults.cjs).
export type L = Record<string, string>;

export interface Connection { id: string; name: string; driver: 'mysql' | 'pgsql' | 'sqlsrv' | 'oracle' | 'sqlite'; host?: string; port?: number | string; database?: string; user?: string; schema?: string; file?: string; encrypt?: boolean }

export interface Lookup {
  kind: 'table' | 'list'; table?: string; key?: string; display?: string; where?: string; orderBy?: string;
  values?: { value: string; label: L }[]; dependsOn?: { field: string; linkField: string } | null; addNew?: boolean; multiple?: boolean; connection?: string;
}
export interface Upload { storage?: 'folder' | 'database'; maxMb?: number; types?: string; multiple?: boolean; thumbnail?: { width: number; height: number }; resize?: { width: number; height: number } }
export interface EditAs { type: string; lookup?: Lookup; upload?: Upload; rows?: number; step?: string | number; maxLength?: number; placeholder?: L }
export interface ViewAs { type: string; decimals?: number; truncate?: number; fraction?: boolean; code?: string }
export interface Field {
  name: string; dbType: string; type: string; pk: boolean; autoInc: boolean; nullable: boolean; label: L;
  show: Record<string, boolean>; viewAs: ViewAs; editAs: EditAs;
  validation: { required?: boolean; email?: boolean; regex?: string; regexMessage?: L; min?: string | number; max?: string | number; minLength?: number; maxLength?: number; unique?: boolean };
  defaultValue: string; autoUpdate?: { add?: string; edit?: string }; hint: L; filter: boolean; totals: string;
  layout?: Record<string, { span?: number }>;
}
export interface Detail { table: string; masterKeys: string[]; detailKeys: string[]; showIn: string[]; listPreview?: boolean }
export interface Table {
  name: string; connection: string; source: { type: 'table' | 'sql'; table?: string; sql?: string; updateTable?: string };
  caption: L; keys: string[]; fields: Field[]; pages: Record<string, any>; details: Detail[]; audit: boolean;
  api: { enabled: boolean; methods: string[] }; readOnly: boolean; where?: string; icon?: string; hideFromMenu?: boolean; hideFromHome?: boolean;
  layout?: Record<string, { sections: { title: L; fields: string[] }[] }>;
}
export interface MenuItem { type: 'table' | 'group' | 'link' | 'report' | 'chart' | 'dashboard' | 'separator' | 'header'; table?: string; page?: string; ref?: string; url?: string; label?: L; icon?: string; items?: MenuItem[]; newWindow?: boolean }
export interface Group { id: string; label: L; admin?: boolean }
export interface Oidc { id: string; label: L; enabled: boolean; issuer: string; clientId: string; scopes?: string; usernameClaim?: string; groupClaim?: string; groupMap?: Record<string, string>; icon?: string }
export interface Security {
  enabled: boolean; mode: 'none' | 'hardcoded' | 'database';
  hardcoded: { username: string; passwordHash: string };
  users: { managed: boolean; table: string; usernameField: string; passwordField: string; emailField: string; fullNameField: string; groupField: string; activeField: string; idField?: string; plainPasswords?: boolean };
  guestAccess: boolean; registration: { enabled: boolean; defaultGroup: string; emailVerify: boolean }; passwordReset: { enabled: boolean };
  captcha: { login: boolean; register: boolean }; passwordPolicy: { minLength: number; requireDigit: boolean; requireUpper: boolean; requireSymbol: boolean };
  maxLoginAttempts: number; sessionMinutes: number; dynamicPermissions: boolean; groups: Group[];
  permissions: Record<string, Record<string, string>>; ownership: Record<string, { field: string }>;
  providers: { ldap: { enabled: boolean; host: string; port: number; baseDn: string; domain: string; bindDn: string; userFilter: string; useTls: boolean; groupMap: Record<string, string> }; oidc: Oidc[]; saml: any };
}
export interface Report { name: string; title: L; table: string; groups: { field: string; interval?: string; desc?: boolean }[]; aggregates: { field: string; fn: string }[]; columns: string[]; showDetails: boolean }
export interface Chart { name: string; title: L; table: string; type: string; labelField: string; labelInterval?: string; series: { field: string; fn: string; label?: L; color?: string }[]; limit?: number; sortByValue?: boolean; stacked?: boolean }
export interface DashItem { type: 'count' | 'kpi' | 'chart' | 'report' | 'list' | 'html'; table?: string; ref?: string; field?: string; fn?: string; width?: number; height?: number; rows?: number; title?: L; html?: L }
export interface Dashboard { name: string; title: L; items: DashItem[] }
export interface ProjectMeta {
  formatVersion: number; name: string; title: L; languages: string[]; defaultLanguage: string; defaultConnection: string;
  theme: { name: string; primary: string; mode: string; layout: string; density: string };
  settings: Record<string, any>; output: { dir: string }; mail?: { from?: string; smtpHost?: string; smtpPort?: number; smtpUser?: string }; systemPrefix?: string;
}
export interface Project {
  dir: string; project: ProjectMeta; connections: Connection[]; tables: Table[]; events: Record<string, Record<string, string>>;
  menu: { items: MenuItem[] }; security: Security; lang: Record<string, Record<string, string>>; reports: Report[]; charts: Chart[]; dashboards: Dashboard[];
}
export interface Secrets { connections?: Record<string, string>; oidc?: Record<string, string>; mailPassword?: string; deploy?: Record<string, string>; team?: { url: string; user: string; token: string; project: string } }
export interface TeamState { connected: boolean; user: string; project: string; role: string; locks: Record<string, { user: string; since: number }>; presence: { id: string; user: string; focus: string }[]; conflicts: string[] }

export type Nav =
  | { kind: 'project' | 'connections' | 'tables' | 'menu' | 'security' | 'events' | 'reports' | 'charts' | 'dashboards' | 'lang' | 'output' | 'team' }
  | { kind: 'table'; id: string; tab?: string };
