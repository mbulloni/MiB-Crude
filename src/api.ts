// Typed access to the main process (see electron/preload.cjs).
declare global {
  interface Window { mc: { call: (ch: string, ...args: any[]) => Promise<any>; onClosing: (cb: () => void) => () => void; onDeployProgress: (cb: (p: any) => void) => () => void; onTeamEvent: (cb: (e: any) => void) => () => void; onUpdateProgress: (cb: (p: any) => void) => () => void } }
}
export const call = <T = any>(ch: string, ...args: any[]): Promise<T> => window.mc.call(ch, ...args);
export const mc = () => window.mc;
