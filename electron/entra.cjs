'use strict';
// Microsoft Entra ID sign-in of the designer for SQL Server / Fabric connections with a personal account (MFA in the
// system browser, or device code): MSAL public client, same approach as MiB-SQL. The token cache (refresh tokens) lives in
// <userData>/entra-cache.bin encrypted with safeStorage, so a sign-in lasts across restarts; without a real keyring it
// stays in memory for the session. Only the designer uses this (test connection, schema, DDL): the generated app has no
// browser and signs in with a service principal (sqlAuth 'entra').
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage, shell } = require('electron');
const msal = require('@azure/msal-node');

// Public client of the Azure CLI: accepted by most tenants for Azure SQL / Fabric with a loopback redirect.
const DEFAULT_CLIENT = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const SQL_SCOPE = 'https://database.windows.net/.default'; // the audience the SQL drivers ask for (a double slash gives a different one, rejected)
const cacheFile = () => path.join(app.getPath('userData'), 'entra-cache.bin');

let memory = null; // serialized cache when the keyring is unavailable
const apps = new Map(); // tenant -> PublicClientApplication
const locks = new Map(); // same key -> pending interactive sign-in (one browser window at a time)
const chosen = new Map(); // connection id -> homeAccountId picked at the last interactive sign-in
let notify = () => {};

/** Main process hook: device code prompts and sign-in progress reach the renderer through it. */
const onPrompt = (fn) => { notify = fn; };

const keyring = () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');

const cachePlugin = {
  async beforeCacheAccess(ctx) {
    if (!keyring()) { if (memory) ctx.tokenCache.deserialize(memory); return; }
    try { ctx.tokenCache.deserialize(safeStorage.decryptString(fs.readFileSync(cacheFile()))); } catch { /* no cache yet, or written with another key */ }
  },
  async afterCacheAccess(ctx) {
    if (!ctx.cacheHasChanged) return;
    const text = ctx.tokenCache.serialize();
    if (!keyring()) { memory = text; return; }
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), safeStorage.encryptString(text), { mode: 0o600 });
  },
};

const tenantOf = (def) => def.tenant || 'organizations';

function clientFor(def) {
  const tenant = tenantOf(def);
  if (!apps.has(tenant)) {
    apps.set(tenant, new msal.PublicClientApplication({
      auth: { clientId: DEFAULT_CLIENT, authority: `https://login.microsoftonline.com/${tenant}` },
      cache: { cachePlugin },
    }));
  }
  return { pca: apps.get(tenant), key: tenant };
}

/** Cached account of a connection: the one picked at the last sign-in, else the one named in the profile (login hint), else the only one. */
async function accountFor(pca, def) {
  const all = await pca.getAllAccounts();
  const picked = all.find((a) => a.homeAccountId === chosen.get(def.id));
  if (picked) return picked;
  const hint = (def.user || '').toLowerCase();
  if (hint) return all.find((a) => a.username.toLowerCase() === hint) ?? null;
  return all.length === 1 ? all[0] : null;
}

const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>MiB-Crude</title>
<body style="font:15px system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#222"><div><h2>${title}</h2><p>${text}</p></div>`;

function signInError(err) {
  const code = err.errorCode || err.code || '';
  const e = new Error(`Accesso Microsoft Entra non riuscito: ${(err.errorMessage || err.message || String(err)).split('\n')[0]}`);
  e.code = /user_cancelled|access_denied/.test(code) ? 'ENTRA_CANCELLED' : 'ENTRA';
  return e;
}

/**
 * Access token for scopes: silently from the cache (refresh token) when possible, otherwise an interactive
 * sign-in (system browser, or device code when the connection asks for it) only if `interactive`.
 */
async function token(def, scopes = [SQL_SCOPE], { interactive = true } = {}) {
  const { pca, key } = clientFor(def);
  const account = await accountFor(pca, def);
  if (account) {
    try { return await pca.acquireTokenSilent({ account, scopes }); } catch (err) {
      if (!(err instanceof msal.InteractionRequiredAuthError) && !/interaction_required|invalid_grant|no_tokens_found/i.test(err.errorCode ?? err.message)) throw signInError(err);
    }
  }
  if (!interactive) throw new Error('Accesso Microsoft Entra scaduto: riconnettersi.');
  if (locks.has(key)) { await locks.get(key).catch(() => {}); return token(def, scopes, { interactive }); }
  const run = (async () => {
    try {
      if (def.entraMethod === 'device') {
        return await pca.acquireTokenByDeviceCode({
          scopes,
          deviceCodeCallback: (r) => notify({ kind: 'device', connId: def.id, name: def.name, url: r.verificationUri, code: r.userCode, message: r.message }),
        });
      }
      notify({ kind: 'browser', connId: def.id, name: def.name });
      return await pca.acquireTokenInteractive({
        scopes,
        loginHint: def.user || undefined,
        prompt: def.user ? undefined : 'select_account',
        openBrowser: async (url) => { await shell.openExternal(url); },
        successTemplate: page('Accesso completato', 'Puoi chiudere questa scheda e tornare a MiB-Crude.'),
        errorTemplate: page('Accesso non riuscito', 'Torna a MiB-Crude per i dettagli.'),
      });
    } catch (err) {
      throw signInError(err);
    } finally {
      notify({ kind: 'done', connId: def.id });
    }
  })();
  locks.set(key, run);
  try {
    const r = await run;
    if (r?.account) chosen.set(def.id, r.account.homeAccountId);
    return r;
  } finally { locks.delete(key); }
}

/** TokenCredential for tedious (mssql 'token-credential'): called on every new TDS connection with the scope the server announces. */
function credential(def, { interactive = true } = {}) {
  return {
    async getToken(scopes) {
      const r = await token(def, Array.isArray(scopes) ? scopes : [scopes], { interactive });
      return { token: r.accessToken, expiresOnTimestamp: r.expiresOn ? new Date(r.expiresOn).getTime() : Date.now() + 3000 * 1000 };
    },
  };
}

/** Account signed in for a connection (null = none in the cache). */
async function account(def) {
  const a = await accountFor(clientFor(def).pca, def);
  return a ? { username: a.username, name: a.name ?? '' } : null;
}

/** Forgets the connection's account: the next connection asks to sign in again. */
async function signOut(def) {
  const { pca } = clientFor(def);
  const a = await accountFor(pca, def);
  chosen.delete(def.id);
  if (a) await pca.getTokenCache().removeAccount(a);
  return !!a;
}

module.exports = { token, credential, account, signOut, onPrompt, DEFAULT_CLIENT, SQL_SCOPE };
