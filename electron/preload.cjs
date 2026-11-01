const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r.error) {
    const err = new Error(r.error);
    err.code = r.code;
    throw err;
  }
  return r.ok;
};
const on = (channel) => (cb) => {
  const fn = (_e, p) => cb(p);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

const channels = [
  'app:info', 'app:settings', 'app:quit', 'shell:open', 'shell:showItem', 'shell:openPath', 'dialog:dir', 'dialog:file', 'dialog:files',
  'project:new', 'project:open', 'import:phpr', 'import:phprMerge', 'project:save', 'project:close', 'project:reload', 'secrets:get', 'secrets:set', 'local:get', 'local:set',
  'themes:list', 'themes:scan', 'themes:install', 'themes:remove',
  'ddl:build', 'db:columns', 'db:exec', 'ddl:script', 'file:save', 'file:read', 'tables:exportZip', 'tables:importFile',
  'db:drivers', 'db:test', 'db:tables', 'db:describe', 'db:preview', 'db:data', 'wizard:import', 'wizard:sqlview', 'wizard:procedure', 'db:procedures', 'db:procPreview', 'wizard:refresh', 'rest:sample', 'rest:add', 'templates:list', 'templates:apply', 'ai:status', 'ai:setKey', 'ai:event', 'update:check', 'update:install', 'update:restart',
  'gen:check', 'gen:generate', 'gen:hash', 'php:info', 'php:lintEvent', 'preview:start', 'preview:stop', 'preview:status', 'preview:open', 'docker:options', 'docker:generate', 'docker:status', 'docker:up', 'docker:down', 'docker:logs', 'docker:joinPassword',
  'deploy:run', 'deploy:test',
  'git:status', 'git:log', 'git:diff', 'git:commit', 'git:pull', 'git:push', 'git:init', 'git:setRemote', 'git:resolve', 'git:clone',
  'team:connect', 'team:disconnect', 'team:lock', 'team:unlock', 'team:state', 'team:chat', 'team:checkout', 'team:publish',
];

const api = {};
for (const ch of channels) api[ch] = (...args) => call(ch, ...args);

contextBridge.exposeInMainWorld('mc', {
  call: (ch, ...args) => {
    if (!api[ch]) throw new Error(`Unknown channel ${ch}`);
    return api[ch](...args);
  },
  onClosing: on('app:closing'),
  onDeployProgress: on('deploy:progress'),
  onTeamEvent: on('team:event'),
  onUpdateProgress: on('update:progress'),
});
