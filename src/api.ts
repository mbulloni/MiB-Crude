// Typed access to the main process (see electron/preload.cjs).
/** Microsoft Entra sign-in in progress: the system browser is open ('browser') or a code is to be typed on another device ('device'). */
export type EntraPrompt = { kind: 'browser'; connId: string; name: string } | { kind: 'device'; connId: string; name: string; url: string; code: string; message: string } | { kind: 'done'; connId: string };

declare global {
  interface Window { mc: { call: (ch: string, ...args: any[]) => Promise<any>; onClosing: (cb: () => void) => () => void; onDeployProgress: (cb: (p: any) => void) => () => void; onTeamEvent: (cb: (e: any) => void) => () => void; onEntraPrompt: (cb: (p: EntraPrompt) => void) => () => void; onUpdateProgress: (cb: (p: any) => void) => () => void } }
}
export const call = <T = any>(ch: string, ...args: any[]): Promise<T> => window.mc.call(ch, ...args);
export const mc = () => window.mc;
