<?php /** @var \MiB\App $app */ $u = $app->security->user(); $cfg = $app->config; $mcNavClass = isset($mcNavClass) ? $mcNavClass : 'nav-link'; ?>
<ul class="navbar-nav ms-auto align-items-lg-center flex-row gap-2 mc-usermenu">
  <?php if (count($cfg['languages']) > 1): ?>
  <li class="nav-item dropdown">
    <a class="<?= h($mcNavClass) ?> dropdown-toggle" href="#" data-bs-toggle="dropdown"><i class="bi bi-translate"></i> <?= h(strtoupper($app->lang)) ?></a>
    <ul class="dropdown-menu dropdown-menu-end"><?php foreach ($cfg['languages'] as $l): ?><li><a class="dropdown-item" href="?<?= h(http_build_query(array_merge($_GET, ['lang' => $l]))) ?>"><?= h(strtoupper($l)) ?></a></li><?php endforeach ?></ul>
  </li>
  <?php endif ?>
  <li class="nav-item"><button class="btn btn-link <?= h($mcNavClass) ?>" id="mcTheme" type="button" title="<?= h(t('theme.toggle')) ?>"><i class="bi bi-circle-half"></i></button></li>
  <?php if ($u && \MiB\Notifications::enabled()): ?>
  <li class="nav-item dropdown mc-notif" data-url="<?= h($app->url('notifications')) ?>">
    <a class="<?= h($mcNavClass) ?> position-relative" href="#" data-bs-toggle="dropdown" data-bs-auto-close="outside" title="<?= h(t('notif.title')) ?>"><i class="bi bi-bell"></i><span class="badge rounded-pill text-bg-danger mc-notif-count d-none"></span></a>
    <div class="dropdown-menu dropdown-menu-end mc-notif-menu"><div class="px-3 py-2 small text-secondary"><?= h(t('notif.none')) ?></div></div>
  </li>
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
