<?php /** @var \MiB\App $app */ $u = $app->security->user(); $cfg = $app->config; $mcNavClass = isset($mcNavClass) ? $mcNavClass : 'nav-link'; ?>
<ul class="navbar-nav ms-auto align-items-lg-center flex-row gap-2 mc-usermenu">
  <?php if (count($cfg['languages']) > 1): ?>
  <li class="nav-item dropdown">
    <a class="<?= h($mcNavClass) ?> dropdown-toggle" href="#" data-bs-toggle="dropdown"><i class="bi bi-translate"></i> <?= h(strtoupper($app->lang)) ?></a>
    <ul class="dropdown-menu dropdown-menu-end"><?php foreach ($cfg['languages'] as $l): ?><li><a class="dropdown-item" href="?<?= h(http_build_query(array_merge($_GET, ['lang' => $l]))) ?>"><?= h(strtoupper($l)) ?></a></li><?php endforeach ?></ul>
  </li>
  <?php endif ?>
  <li class="nav-item"><button class="btn btn-link <?= h($mcNavClass) ?>" id="mcTheme" type="button" title="<?= h(t('theme.toggle')) ?>"><i class="bi bi-circle-half"></i></button></li>
  <?php $mcChoices = \MiB\Theme::choices($app); if ($mcChoices): $mcOpt = \MiB\Theme::options($app); ?>
  <li class="nav-item dropdown mc-customizer" data-cookie="<?= h(\MiB\Theme::cookie($app)) ?>">
    <a class="<?= h($mcNavClass) ?>" href="#" data-bs-toggle="dropdown" title="<?= h(t('theme.customize')) ?>"><i class="bi bi-palette"></i></a>
    <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:14rem">
      <?php foreach ($mcChoices as $mcC): ?>
        <div class="small fw-semibold text-secondary px-2 pt-1"><?= h($app->label($mcC['label'], $mcC['key'])) ?></div>
        <?php foreach ($mcC['values'] as $mcV): $mcOn = true; foreach ($mcV['set'] as $mcK => $mcX) if ((string)(isset($mcOpt[$mcK]) ? $mcOpt[$mcK] : '') !== (string)$mcX) $mcOn = false; ?>
          <button type="button" class="dropdown-item rounded mc-choice<?= $mcOn ? ' active' : '' ?>" data-key="<?= h($mcC['key']) ?>" data-value="<?= h($mcV['id']) ?>"><i class="bi bi-<?= $mcOn ? 'check2' : 'dot' ?> me-1"></i><?= h($app->label($mcV['label'], $mcV['id'])) ?></button>
        <?php endforeach ?>
      <?php endforeach ?>
      <div class="border-top mt-1 pt-1"><button type="button" class="dropdown-item rounded small text-secondary mc-choice-reset"><i class="bi bi-arrow-counterclockwise me-1"></i><?= h(t('theme.reset')) ?></button></div>
    </div>
  </li>
  <?php endif ?>
  <?php if ($u && \MiB\Notifications::enabled()): ?>
  <li class="nav-item dropdown mc-notif" data-url="<?= h($app->url('notifications')) ?>">
    <a class="<?= h($mcNavClass) ?> position-relative" href="#" data-bs-toggle="dropdown" data-bs-auto-close="outside" title="<?= h(t('notif.title')) ?>"><i class="bi bi-bell"></i><span class="badge rounded-pill text-bg-danger mc-notif-count d-none"></span></a>
    <div class="dropdown-menu dropdown-menu-end mc-notif-menu"><div class="px-3 py-2 small text-secondary"><?= h(t('notif.none')) ?></div></div>
  </li>
  <?php endif ?>
  <?php if ($u && ($mcImp = $app->security->impersonator())): ?>
  <li class="nav-item mc-impersonating"><form method="post" action="<?= h($app->url('unimpersonate')) ?>" class="m-0"><?= $app->csrfField() ?>
    <button class="btn btn-sm btn-warning text-nowrap" title="<?= h(t('admin.impersonating', $u['username'])) ?>"><i class="bi bi-incognito"></i> <?= h(t('admin.back_to', $mcImp['username'])) ?></button></form></li>
  <?php endif ?>
  <?php if ($u): ?>
  <li class="nav-item dropdown">
    <a class="<?= h($mcNavClass) ?> dropdown-toggle" href="#" data-bs-toggle="dropdown"><i class="bi bi-person-circle"></i> <?= h($u['fullname'] ?: $u['username']) ?></a>
    <ul class="dropdown-menu dropdown-menu-end">
      <?php if ($app->security->isManaged() && !empty($u['id'])): ?><li><a class="dropdown-item" href="<?= h($app->url('profile')) ?>"><i class="bi bi-key me-2"></i><?= h(t('profile.title')) ?></a></li><?php endif ?>
      <?php if (\MiB\Builder::enabled($app)): ?><li><a class="dropdown-item" href="<?= h($app->url('builder')) ?>"><i class="bi bi-magic me-2"></i><?= h(t('builder.title')) ?></a></li><?php endif ?>
      <?php if ($app->security->isAdmin() && $app->security->enabled()): ?><li><a class="dropdown-item" href="<?= h($app->url('admin')) ?>"><i class="bi bi-shield-lock me-2"></i><?= h(t('admin.title')) ?></a></li><?php endif ?>
      <li><hr class="dropdown-divider"></li>
      <?php if ($app->security->cfg['mode'] === 'ntlm'): ?><li><span class="dropdown-item-text small text-secondary"><i class="bi bi-windows me-2"></i><?= h(t('ntlm.signed', $u['username'])) ?></span></li>
      <?php else: ?><li><a class="dropdown-item" href="<?= h($app->url('logout')) ?>"><i class="bi bi-box-arrow-right me-2"></i><?= h(t('login.logout')) ?></a></li><?php endif ?>
    </ul>
  </li>
  <?php elseif ($app->security->enabled()): ?>
  <li class="nav-item"><a class="<?= h($mcNavClass) ?>" href="<?= h($app->url('login')) ?>"><i class="bi bi-box-arrow-in-right"></i> <?= h(t('login.title')) ?></a></li>
  <?php endif ?>
</ul>
