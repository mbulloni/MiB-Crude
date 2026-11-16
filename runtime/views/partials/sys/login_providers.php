<?php /** System page block. Scope: the variables of the view. @var \MiB\App $app */ ?>
<?php $prov = $sec->cfg['providers']; ?>
<?php if (!empty($prov['saml']['enabled'])): ?>
  <a class="btn btn-outline-secondary w-100 mt-2" href="<?= h($app->url('saml')) ?>"><i class="bi bi-building-lock"></i> <?= h(t('login.with', $app->label(isset($prov['saml']['label']) ? $prov['saml']['label'] : 'SSO', 'SSO'))) ?></a>
<?php endif ?>
<?php foreach ($prov['oidc'] as $p): if (empty($p['enabled'])) continue; ?>
  <a class="btn btn-outline-secondary w-100 mt-2" href="<?= h($app->url('oidc', ['id' => $p['id']])) ?>"><i class="bi bi-<?= h(!empty($p['icon']) ? $p['icon'] : 'shield-check') ?>"></i> <?= h(t('login.with', $app->label($p['label'], $p['id']))) ?></a>
<?php endforeach ?>