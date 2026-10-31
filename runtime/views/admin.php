<?php /** @var \MiB\App $app */ ?>
<h1 class="h4 mb-3"><i class="bi bi-shield-lock"></i> <?= h(t('admin.title')) ?></h1>
<ul class="nav nav-pills mb-3"><?php foreach ($sections as $k => $l): ?><li class="nav-item"><a class="nav-link<?= $k === $section ? ' active' : '' ?>" href="<?= h($app->url('admin', ['s' => $k])) ?>"><?= h($l) ?></a></li><?php endforeach ?></ul>

<?php if ($section === 'users'): ?>
  <?php if ($edit): $mine = isset($members[$edit['username']]) ? $members[$edit['username']] : []; ?>
  <form method="post" class="card mb-3"><div class="card-body row g-3"><?= $app->csrfField() ?>
    <input type="hidden" name="action" value="save"><input type="hidden" name="id" value="<?= (int)$edit['id'] ?>">
    <div class="col-md-4"><label class="form-label"><?= h(t('login.username')) ?></label><input class="form-control" name="username" required value="<?= h($edit['username']) ?>"></div>
    <div class="col-md-4"><label class="form-label">Email</label><input class="form-control" type="email" name="email" value="<?= h($edit['email']) ?>"></div>
    <div class="col-md-4"><label class="form-label"><?= h(t('register.fullname')) ?></label><input class="form-control" name="fullname" value="<?= h($edit['fullname']) ?>"></div>
    <div class="col-md-4"><label class="form-label"><?= h(t('login.password')) ?></label><input class="form-control" type="password" name="password" autocomplete="new-password" placeholder="<?= $edit['id'] ? h(t('form.password_keep')) : '' ?>"></div>
    <div class="col-md-6"><label class="form-label"><?= h(t('admin.groups')) ?></label><div><?php foreach ($groups as $g): ?>
      <div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="groups[]" value="<?= h($g['id']) ?>" id="g_<?= h($g['id']) ?>"<?= in_array($g['id'], $mine, true) ? ' checked' : '' ?>><label class="form-check-label" for="g_<?= h($g['id']) ?>"><?= h($g['label'] ?: $g['id']) ?></label></div>
    <?php endforeach ?></div></div>
    <div class="col-md-2"><div class="form-check form-switch mt-4"><input class="form-check-input" type="checkbox" name="active" value="1" id="uact"<?= $edit['active'] ? ' checked' : '' ?>><label class="form-check-label" for="uact"><?= h(t('admin.active')) ?></label></div></div>
  </div><div class="card-footer"><button class="btn btn-primary"><?= h(t('btn.save')) ?></button> <a class="btn btn-link" href="<?= h($app->url('admin', ['s' => 'users'])) ?>"><?= h(t('btn.cancel')) ?></a></div></form>
  <?php endif ?>
  <a class="btn btn-primary btn-sm mb-2" href="<?= h($app->url('admin', ['s' => 'users', 'id' => 'new'])) ?>"><i class="bi bi-person-plus"></i> <?= h(t('admin.newuser')) ?></a>
  <div class="card mc-scroll"><table class="table table-sm table-hover mb-0 align-middle"><thead><tr><th><?= h(t('login.username')) ?></th><th>Email</th><th><?= h(t('register.fullname')) ?></th><th><?= h(t('admin.groups')) ?></th><th><?= h(t('admin.active')) ?></th><th><?= h(t('admin.lastlogin')) ?></th><th></th></tr></thead><tbody>
  <?php foreach ($users as $u): ?><tr>
    <td><?= h($u['username']) ?> <?php if ($u['provider'] && $u['provider'] !== 'local'): ?><span class="badge text-bg-secondary"><?= h($u['provider']) ?></span><?php endif ?></td>
    <td><?= h($u['email']) ?></td><td><?= h($u['fullname']) ?></td>
    <td><?= h(implode(', ', isset($members[$u['username']]) ? $members[$u['username']] : [])) ?></td>
    <td><?= $u['active'] ? '<i class="bi bi-check-lg text-success"></i>' : '<i class="bi bi-x-lg text-danger"></i>' ?><?php if (!empty($u['locked_until']) && strtotime($u['locked_until']) > time()): ?> <span class="badge text-bg-warning"><?= h(t('admin.locked')) ?></span><?php endif ?></td>
    <td class="small"><?= h($u['last_login'] ? \MiB\Format::date($u['last_login'], 'dateTimeFormat') : '') ?></td>
    <td class="text-end text-nowrap">
      <a class="btn btn-sm btn-link" href="<?= h($app->url('admin', ['s' => 'users', 'id' => $u['id']])) ?>"><i class="bi bi-pencil"></i></a>
      <?php if ($app->security->twoFactorEnabled()): ?><form method="post" class="d-inline"><?= $app->csrfField() ?><input type="hidden" name="action" value="reset2fa"><input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><button class="btn btn-sm btn-link" title="<?= h(t('2fa.reset')) ?>"><i class="bi bi-phone-flip"></i></button></form><?php endif ?>
      <?php if (!empty($u['locked_until'])): ?><form method="post" class="d-inline"><?= $app->csrfField() ?><input type="hidden" name="action" value="unlock"><input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><button class="btn btn-sm btn-link"><i class="bi bi-unlock"></i></button></form><?php endif ?>
      <form method="post" class="d-inline mc-confirm-delete"><?= $app->csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><button class="btn btn-sm btn-link text-danger"><i class="bi bi-trash"></i></button></form>
    </td></tr><?php endforeach ?>
  </tbody></table></div>

<?php elseif ($section === 'groups'): ?>
  <form method="post" class="card mb-3"><div class="card-body row g-2 align-items-end"><?= $app->csrfField() ?><input type="hidden" name="action" value="save">
    <div class="col-md-3"><label class="form-label">ID</label><input class="form-control" name="id" required pattern="[A-Za-z0-9_.-]+"></div>
    <div class="col-md-5"><label class="form-label"><?= h(t('admin.label')) ?></label><input class="form-control" name="label"></div>
    <div class="col-md-2"><div class="form-check"><input class="form-check-input" type="checkbox" name="is_admin" value="1" id="gadm"><label class="form-check-label" for="gadm">Admin</label></div></div>
    <div class="col-md-2"><button class="btn btn-primary w-100"><?= h(t('btn.save')) ?></button></div>
  </div></form>
  <div class="card mc-scroll"><table class="table table-sm mb-0"><thead><tr><th>ID</th><th><?= h(t('admin.label')) ?></th><th>Admin</th><th></th></tr></thead><tbody>
  <?php foreach ($groups as $g): ?><tr><td><?= h($g['id']) ?></td><td><?= h($g['label']) ?></td><td><?= $g['is_admin'] ? '<i class="bi bi-check-lg"></i>' : '' ?></td>
    <td class="text-end"><a class="btn btn-sm btn-link" href="<?= h($app->url('admin', ['s' => 'rights', 'g' => $g['id']])) ?>"><i class="bi bi-ui-checks-grid"></i></a>
    <form method="post" class="d-inline mc-confirm-delete"><?= $app->csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= h($g['id']) ?>"><button class="btn btn-sm btn-link text-danger"><i class="bi bi-trash"></i></button></form></td></tr><?php endforeach ?>
  </tbody></table></div>

<?php elseif ($section === 'rights'): $letters = str_split(\MiB\Security::ALL); ?>
  <form method="get" class="mb-2"><input type="hidden" name="p" value="admin"><input type="hidden" name="s" value="rights">
    <select class="form-select w-auto" name="g" onchange="this.form.submit()"><?php foreach ($groups as $g): ?><option value="<?= h($g['id']) ?>"<?= $g['id'] === $cur ? ' selected' : '' ?>><?= h($g['label'] ?: $g['id']) ?></option><?php endforeach ?></select></form>
  <form method="post" class="card"><?= $app->csrfField() ?><input type="hidden" name="group" value="<?= h($cur) ?>">
  <div class="mc-scroll"><table class="table table-sm mb-0 mc-rights"><thead><tr><th></th><?php foreach ($letters as $l): ?><th class="text-center" title="<?= h(t('right.' . $l)) ?>"><?= h(t('right.' . $l)) ?></th><?php endforeach ?><th></th></tr></thead><tbody>
  <?php foreach ($tables as $tn): $has = isset($rights[$tn]) ? $rights[$tn] : ''; $isT = strpos($tn, ':') === false;
    $label = $isT ? $app->table($tn)->caption() : $tn; ?>
    <tr><td><?= h($label) ?></td>
    <?php foreach ($letters as $l): ?><td class="text-center"><?php if ($isT || $l === 'S'): ?><input class="form-check-input" type="checkbox" name="r[<?= h($tn) ?>][<?= $l ?>]" value="1"<?= strpos($has, $l) !== false ? ' checked' : '' ?>><?php endif ?></td><?php endforeach ?>
    <td><button type="button" class="btn btn-sm btn-link mc-row-all"><?= h(t('admin.all')) ?></button></td></tr>
  <?php endforeach ?></tbody></table></div>
  <div class="card-footer"><button class="btn btn-primary"><?= h(t('btn.save')) ?></button></div></form>

<?php elseif ($section === 'audit'): ?>
  <div class="card"><div class="mc-scroll"><table class="table table-sm mb-0 small"><thead><tr><th><?= h(t('audit.when')) ?></th><th><?= h(t('login.username')) ?></th><th>IP</th><th><?= h(t('audit.table')) ?></th><th><?= h(t('audit.action')) ?></th><th><?= h(t('audit.keys')) ?></th><th><?= h(t('audit.changes')) ?></th></tr></thead><tbody>
  <?php foreach ($rows as $r):
      $old = json_decode((string)$r['old_json'], true) ?: []; $new = json_decode((string)$r['new_json'], true) ?: []; $diff = [];
      foreach ($new as $k => $v) if (!array_key_exists($k, $old) || (string)$old[$k] !== (string)$v) $diff[] = $k . ': ' . (array_key_exists($k, $old) ? $old[$k] . ' → ' : '') . $v; ?>
    <tr><td class="text-nowrap"><?= h(\MiB\Format::date($r['ts'], 'dateTimeFormat')) ?></td><td><?= h($r['username']) ?></td><td><?= h($r['ip']) ?></td><td><?= h($r['table_name']) ?></td>
    <td><span class="badge text-bg-<?= ['add' => 'success', 'edit' => 'primary', 'delete' => 'danger'][$r['action']] ?? 'secondary' ?>"><?= h($r['action']) ?></span></td><td><?= h($r['keys_json']) ?></td>
    <td class="text-break"><?= h(implode(' · ', array_slice($diff, 0, 12))) ?></td></tr>
  <?php endforeach ?></tbody></table></div></div>
  <?php $pages = max(1, (int)ceil($total / 50)); if ($pages > 1): ?><nav class="mt-2"><ul class="pagination pagination-sm">
    <?php for ($i = max(1, $pg - 4); $i <= min($pages, $pg + 4); $i++): ?><li class="page-item<?= $i === $pg ? ' active' : '' ?>"><a class="page-link" href="<?= h($app->url('admin', ['s' => 'audit', 'pg' => $i])) ?>"><?= $i ?></a></li><?php endfor ?>
  </ul></nav><?php endif ?>
<?php elseif ($section === 'notifications'): ?>
  <form method="post" class="card mb-3"><?= $app->csrfField() ?><div class="card-body"><div class="row g-2">
    <div class="col-md-4"><label class="form-label"><?= h(t('notif.to')) ?></label><select name="user" class="form-select"><option value=""><?= h(t('notif.everybody')) ?></option><?php foreach ($users as $un): ?><option><?= h($un) ?></option><?php endforeach ?></select></div>
    <div class="col-md-5"><label class="form-label"><?= h(t('notif.titlef')) ?></label><input name="title" class="form-control" maxlength="255"></div>
    <div class="col-md-3"><label class="form-label"><?= h(t('notif.icon')) ?></label><input name="icon" class="form-control" placeholder="info-circle"></div>
    <div class="col-12"><label class="form-label"><?= h(t('notif.message')) ?> <span class="text-danger">*</span></label><textarea name="message" class="form-control" rows="2" required></textarea></div>
    <div class="col-md-6"><label class="form-label"><?= h(t('notif.url')) ?></label><input name="url" class="form-control" placeholder="index.php?p=list&amp;t=…"></div>
    <div class="col-md-3"><label class="form-label"><?= h(t('notif.expire')) ?></label><input name="expire" type="datetime-local" class="form-control"></div>
    <div class="col-md-3 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" name="new_window" value="1" id="nw"><label class="form-check-label" for="nw"><?= h(t('notif.newwin')) ?></label></div></div>
  </div></div><div class="card-footer"><button class="btn btn-primary"><i class="bi bi-send"></i> <?= h(t('notif.send')) ?></button></div></form>
  <div class="card"><div class="mc-scroll"><table class="table table-sm mb-0 small"><thead><tr><th><?= h(t('audit.when')) ?></th><th><?= h(t('notif.to')) ?></th><th><?= h(t('notif.titlef')) ?></th><th><?= h(t('notif.message')) ?></th><th><?= h(t('notif.expire')) ?></th><th></th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?>
    <tr><td class="text-nowrap"><?= h(\MiB\Format::date($r['created_at'], 'dateTimeFormat')) ?></td><td><?= h($r['username'] !== null && $r['username'] !== '' ? $r['username'] : t('notif.everybody')) ?></td>
    <td><?php if ($r['icon']): ?><i class="bi bi-<?= h($r['icon']) ?>"></i> <?php endif ?><?= h($r['title']) ?></td><td class="text-break"><?= h($r['message']) ?></td>
    <td class="text-nowrap"><?= $r['expires_at'] ? h(\MiB\Format::date($r['expires_at'], 'dateTimeFormat')) : '' ?></td>
    <td><form method="post"><?= $app->csrfField() ?><button class="btn btn-sm btn-link text-danger" name="delete" value="<?= (int)$r['id'] ?>" title="<?= h(t('btn.delete')) ?>"><i class="bi bi-trash"></i></button></form></td></tr>
  <?php endforeach ?></tbody></table></div></div>
<?php elseif ($section === 'tasks'): ?>
  <p class="small text-secondary"><i class="bi bi-clock-history"></i> <?= h(t('task.help')) ?></p>
  <pre class="small bg-body-tertiary border rounded p-2 mc-cron-line"><?= h($cronLine) ?></pre>
  <div class="card"><div class="mc-scroll"><table class="table table-sm mb-0 small align-middle"><thead><tr><th><?= h(t('task.task')) ?></th><th><?= h(t('task.schedule')) ?></th><th><?= h(t('task.next')) ?></th><th><?= h(t('task.last')) ?></th><th><?= h(t('task.result')) ?></th><th></th></tr></thead><tbody>
  <?php foreach ($rows as $r): $st = $r['state']; ?>
    <tr class="mc-task-row" data-task="<?= h($r['name']) ?>"><td><strong><?= h($r['title']) ?></strong><div class="text-secondary"><?= h($r['name']) ?></div></td>
    <td><code><?= h($r['cron']) ?></code><?php if (!$r['valid']): ?> <span class="badge text-bg-danger"><?= h(t('task.invalid')) ?></span><?php elseif (!$r['enabled']): ?> <span class="badge text-bg-secondary"><?= h(t('task.off')) ?></span><?php endif ?></td>
    <td class="text-nowrap"><?= $r['enabled'] && $r['next'] ? h(\MiB\Format::date(date('Y-m-d H:i:s', $r['next']), 'dateTimeFormat')) : '—' ?></td>
    <td class="text-nowrap"><?= $st ? h(\MiB\Format::date($st['last_run'], 'dateTimeFormat')) . ' <span class="text-secondary">(' . h(number_format($st['duration'], 2)) . ' s)</span>' : '—' ?></td>
    <td class="text-break"><?php if ($st): ?><span class="badge text-bg-<?= $st['ok'] ? 'success' : 'danger' ?>"><?= h(t($st['ok'] ? 'task.ok' : 'task.error')) ?></span> <?= h($st['message']) ?><?php endif ?></td>
    <td><form method="post"><?= $app->csrfField() ?><button class="btn btn-sm btn-outline-primary text-nowrap" name="run" value="<?= h($r['name']) ?>"><i class="bi bi-play-fill"></i> <?= h(t('task.run')) ?></button></form></td></tr>
  <?php endforeach ?></tbody></table></div></div>
<?php elseif ($section === 'ntlm_users'): ?>
  <p class="small text-secondary"><i class="bi bi-windows"></i> <?= h(t('ntlm.users_help', $cfg['userTable'])) ?><?php if ($me !== ''): ?> · <?= h(t('ntlm.you', $me)) ?><?php endif ?></p>
  <form method="post" class="card mb-3"><?= $app->csrfField() ?><input type="hidden" name="action" value="add"><div class="card-body row g-2 align-items-end">
    <div class="col-md-4"><label class="form-label"><?= h(t('login.username')) ?> <small class="text-secondary">(<?= h($cfg['userCol']) ?>)</small></label><input class="form-control" name="username" required placeholder="NOMECOGN<?= h($cfg['suffix']) ?>"></div>
    <div class="col-md-3"><label class="form-label"><?= h(t('ntlm.group')) ?> <small class="text-secondary">(<?= h($cfg['groupCol']) ?>)</small></label><input class="form-control" name="gruppo" required list="mcNtlmGroups"></div>
    <div class="col-md-3"><label class="form-label"><?= h(t('ntlm.area')) ?> <small class="text-secondary">(<?= h($cfg['areaCol']) ?>)</small></label><input class="form-control" name="area"></div>
    <div class="col-md-2"><button class="btn btn-primary w-100"><i class="bi bi-person-plus"></i> <?= h(t('btn.add')) ?></button></div>
  </div></form>
  <datalist id="mcNtlmGroups"><?php foreach ($groups as $g): ?><option value="<?= h($g) ?>"><?php endforeach ?></datalist>
  <form method="get" class="mb-2 d-flex gap-2"><input type="hidden" name="p" value="admin"><input type="hidden" name="s" value="ntlm_users">
    <input class="form-control form-control-sm" style="max-width:320px" name="q" value="<?= h($q) ?>" placeholder="<?= h(rtrim(t('dt.search'), ': ')) ?>"><button class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button>
    <span class="small text-secondary align-self-center"><?= h(t('ntlm.count', $total)) ?></span></form>
  <div class="card mc-scroll"><table class="table table-sm table-hover mb-0 align-middle"><thead><tr><th><?= h(t('login.username')) ?></th><th><?= h(t('ntlm.group')) ?></th><th><?= h(t('ntlm.area')) ?></th><th></th></tr></thead><tbody>
  <?php foreach ($rows as $i => $r): ?>
    <tr><form method="post"><?= $app->csrfField() ?><input type="hidden" name="o_username" value="<?= h($r['u']) ?>"><input type="hidden" name="o_gruppo" value="<?= h($r['g']) ?>"><input type="hidden" name="o_area" value="<?= h($r['a']) ?>">
      <td><input class="form-control form-control-sm" name="username" value="<?= h($r['u']) ?>"></td>
      <td><input class="form-control form-control-sm" name="gruppo" value="<?= h($r['g']) ?>" list="mcNtlmGroups"></td>
      <td><input class="form-control form-control-sm" name="area" value="<?= h($r['a']) ?>"></td>
      <td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" name="action" value="update" title="<?= h(t('btn.save')) ?>"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-sm btn-link text-danger" name="action" value="delete" title="<?= h(t('btn.delete')) ?>" onclick="return confirm(<?= h(json_encode(t('confirm.delete'))) ?>)"><i class="bi bi-trash"></i></button></td>
    </form></tr>
  <?php endforeach ?></tbody></table></div>
  <?php if ($total > count($rows)): ?><p class="small text-secondary mt-2"><?= h(t('ntlm.more', $total - count($rows))) ?></p><?php endif ?>

<?php elseif ($section === 'ntlm_rights'): ?>
  <p class="small text-secondary"><i class="bi bi-windows"></i> <?= h(t('ntlm.rights_help', $cfg['permTable'])) ?><?php if ($others): ?> <?= h(t('ntlm.others', $others)) ?><?php endif ?></p>
  <form method="post"><?= $app->csrfField() ?>
  <div class="card mc-scroll"><table class="table table-sm mb-0 align-middle"><thead><tr><th><?= h(t('ntlm.page')) ?></th><?php foreach ($groups as $g): ?><th class="text-center"><?= h($g) ?><?php if (in_array($g, (array)$cfg['adminGroups'], true)): ?> <i class="bi bi-shield-check text-success" title="<?= h(t('ntlm.admin')) ?>"></i><?php endif ?></th><?php endforeach ?></tr></thead><tbody>
  <?php foreach ($pages as $key => $label): ?>
    <tr><td><?= h($label) ?> <small class="text-secondary"><?= h($key) ?></small></td>
    <?php foreach ($groups as $g): $v = isset($cur[$key][$g]) ? $cur[$key][$g] : ''; ?><td class="text-center text-nowrap">
      <?php foreach (['R', 'W', 'L'] as $l): ?><label class="me-1 small" title="<?= h(t('ntlm.flag_' . strtolower($l))) ?>"><input class="form-check-input" type="checkbox" name="r[<?= h($key) ?>][<?= h($g) ?>][<?= $l ?>]" value="1"<?= strpos($v, $l) !== false ? ' checked' : '' ?>> <?= $l ?></label><?php endforeach ?>
    </td><?php endforeach ?></tr>
  <?php endforeach ?></tbody></table></div>
  <div class="d-flex gap-2 align-items-center mt-2"><button class="btn btn-primary"><?= h(t('btn.save')) ?></button>
    <input class="form-control form-control-sm" style="max-width:220px" name="newgroup" maxlength="14" placeholder="<?= h(t('ntlm.newgroup')) ?>">
    <span class="small text-secondary"><?= h(t('ntlm.legend')) ?></span></div>
  </form>
<?php endif ?>
