import { create } from 'zustand';
import { call } from './api';
import type { Nav, Project, Secrets, TeamState } from './types';

export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }

interface State {
  proj: Project | null;
  dirty: boolean;
  nav: Nav;
  secrets: Secrets;
  team: TeamState;
  toasts: Toast[];
  busy: string;
  remoteChanged: string[];
  set: (p: Partial<State>) => void;
}

export const useStore = create<State>((set) => ({
  proj: null,
  dirty: false,
  nav: { kind: 'project' },
  secrets: {},
  team: { connected: false, user: '', project: '', role: '', locks: {}, presence: [], conflicts: [] },
  toasts: [],
  busy: '',
  remoteChanged: [],
  set: (p) => set(p),
}));

const S = () => useStore.getState();

/** Immutable update of the project: fn mutates a deep copy. */
export function update(fn: (p: Project) => void) {
  const cur = S().proj;
  if (!cur) return;
  const next = structuredClone(cur);
  fn(next);
  S().set({ proj: next, dirty: true });
}

let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4000) {
  const t = { id: ++toastSeq, kind, text };
  S().set({ toasts: [...S().toasts, t] });
  setTimeout(() => S().set({ toasts: S().toasts.filter((x) => x.id !== t.id) }), kind === 'err' ? Math.max(ms, 8000) : ms);
}

export async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  S().set({ busy: label });
  try { return await fn(); } catch (e: any) { toast(e.message || String(e), 'err'); return undefined; } finally { S().set({ busy: '' }); }
}

export async function openProject(proj: Project) {
  const secrets = await call<Secrets>('secrets:get');
  S().set({ proj, dirty: false, secrets, nav: { kind: proj.connections.length ? (proj.tables.length ? 'tables' : 'tables') : 'connections' }, remoteChanged: [] });
}

export async function save() {
  const p = S().proj;
  if (!p) return;
  const r = await call('project:save', p);
  S().set({ dirty: false });
  return r;
}

export async function saveSecrets(patch: Partial<Secrets>) {
  const next = { ...S().secrets, ...patch };
  await call('secrets:set', next);
  S().set({ secrets: next });
}

export async function reloadFromDisk() {
  const proj = await call<Project>('project:reload');
  S().set({ proj, dirty: false, remoteChanged: [] });
}

export const lang = () => S().proj?.project.defaultLanguage || 'it';
