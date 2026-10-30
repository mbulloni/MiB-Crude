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
<?php endif ?>
