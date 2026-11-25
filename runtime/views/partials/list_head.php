<?php /** Title, buttons and saved searches of the list page (scope of views/list.php). */ ?>
<?php if (!$embedded): ?>
<?php if ($master): $mt = $master['table']; $mrow = $master['row']; $mrows = [$mrow]; $mt->resolveLookups($mrows, $mt->fields('list')); $mrow = $mrows[0]; ?>
<div class="card mb-3 mc-master">
  <div class="card-header d-flex align-items-center">
    <span><i class="bi bi-diagram-2 me-2"></i><?= h($mt->caption()) ?></span>
    <a class="ms-auto btn btn-sm btn-outline-secondary" href="<?= h($app->url('list', ['t' => $mt->name])) ?>"><i class="bi bi-arrow-left"></i> <?= h(t('btn.back')) ?></a>
  </div>
  <div class="card-body py-2"><div class="row g-2 small">
    <?php foreach (array_slice($mt->fields('list'), 0, 8) as $mf): ?><div class="col-md-3"><span class="text-secondary"><?= h($mt->fieldLabel($mf)) ?>:</span> <?= \MiB\Format::html($mt, $mf, $mrow) ?></div><?php endforeach ?>
  </div></div>
</div>
<?php endif ?>
<div class="d-flex flex-wrap align-items-center gap-2 mb-3 mc-pagehead">
  <h1 class="h4 m-0 me-3"><?= h($t->caption()) ?></h1>
  <?php if (!\MiB\Compat::hidden('add') && $t->enabled('add') && $sec->can($t->name, 'A')): ?>
    <a class="btn btn-primary btn-sm<?= ($t->page('add')['mode'] ?? 'page') === 'popup' ? ' mc-popup-link' : '' ?>" href="<?= h($app->url('add', $base)) ?>"><i class="bi bi-plus-lg"></i> <?= h(t('btn.add')) ?></a>
  <?php endif ?>
  <?php if (!$embedded && $curView === 'table' && \MiB\Grid::inlineAddFields($t)): ?>
    <button type="button" class="btn btn-outline-primary btn-sm mc-ia-open"><i class="bi bi-plus-square"></i> <?= h(t('btn.add_row')) ?></button>
  <?php endif ?>
  <?php if ($canDel && !\MiB\Compat::hidden('delete')): ?>
    <button class="btn btn-outline-danger btn-sm mc-delete-selected" form="mcListForm" disabled><i class="bi bi-trash"></i> <?= h(t('btn.delete_sel')) ?></button>
  <?php endif ?>
  <?php if ($canUpd && $t->bulkFields()): ?>
    <button class="btn btn-outline-primary btn-sm mc-update-selected" form="mcListForm" formaction="<?= h($app->url('updatesel', ['t' => $t->name])) ?>" disabled><i class="bi bi-pencil-square"></i> <?= h(t('btn.update_sel')) ?></button>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('export') && $t->enabled('export') && $sec->can($t->name, 'P')): ?>
    <div class="dropdown">
      <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-download"></i> <?= h(t('btn.export')) ?></button>
      <ul class="dropdown-menu"><?php foreach ($t->def['pages']['export']['formats'] as $fmt): ?>
        <li><a class="dropdown-item mc-export" href="<?= h($app->url('export', array_merge($keep, ['fmt' => $fmt]))) ?>"><?= h(strtoupper($fmt)) ?></a></li>
      <?php endforeach ?></ul>
    </div>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('print') && $t->enabled('print') && $sec->can($t->name, 'P')): ?>
    <a class="btn btn-outline-secondary btn-sm mc-export" target="_blank" href="<?= h($app->url('print', $keep)) ?>"><i class="bi bi-printer"></i> <?= h(t('btn.print')) ?></a>
  <?php endif ?>
  <?php if (!$embedded && $sec->can($t->name, 'S')): ?>
    <a class="btn btn-outline-secondary btn-sm mc-group-calc" title="<?= h(t('list.group_hint')) ?>" href="<?= h($app->url('report', array_merge(['r' => 't:' . $t->name, 'adhoc' => 1, 'ag' => [['fn' => 'count', 'field' => '']]], array_filter(['q' => $req['q'], 's' => $req['s'], 'f' => $req['f']])))) ?>"><i class="bi bi-calculator"></i> <?= h(t('list.group_calc')) ?></a>
  <?php endif ?>
  <?= \MiB\Buttons::html($t, 'list', false) ?>
  <?php if (!\MiB\Compat::hidden('import') && $t->enabled('import') && $sec->can($t->name, 'I')): ?>
    <a class="btn btn-outline-secondary btn-sm" href="<?= h($app->url('import', ['t' => $t->name])) ?>"><i class="bi bi-upload"></i> <?= h(t('btn.import')) ?></a>
  <?php endif ?>
  <?php if (!\MiB\Compat::hidden('advsearch_link') && $t->enabled('search')): ?><a class="btn btn-sm btn-outline-secondary ms-auto" href="<?= h($app->url('search', ['t' => $t->name, 's' => $req['s']])) ?>"><i class="bi bi-funnel"></i> <?= h(t('list.advanced')) ?></a><?php endif ?>
  <?php if (\MiB\Searches::enabled()): $saved = \MiB\Searches::forTable($t->name); $curQuery = array_filter(['q' => $req['q'], 's' => $req['s'], 'f' => $req['f']]); ?>
    <div class="dropdown mc-saved-searches<?= !\MiB\Compat::hidden('advsearch_link') && $t->enabled('search') ? '' : ' ms-auto' ?>">
      <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown" data-bs-auto-close="outside"><i class="bi bi-bookmark-star"></i> <?= h(t('search.saved_menu')) ?><?= $saved ? ' <span class="badge text-bg-secondary">' . count($saved) . '</span>' : '' ?></button>
      <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:18rem">
        <?php foreach ($saved as $sv): $qs = array_merge($base, array_filter(['s' => isset($sv['query']['s']) ? $sv['query']['s'] : [], 'f' => isset($sv['query']['f']) ? $sv['query']['f'] : [], 'q' => isset($sv['query']['q']) ? $sv['query']['q'] : ''])); ?>
          <div class="d-flex align-items-center gap-1 mc-saved-item">
            <a class="dropdown-item rounded flex-grow-1 text-truncate" href="<?= h($app->url('list', $qs)) ?>"><i class="bi bi-<?= $sv['shared'] ? 'people' : 'bookmark' ?> me-1"></i><?= h($sv['title']) ?></a>
            <?php if ($sv['mine'] || ($sv['shared'] && isAdmin())): ?>
            <form method="post" action="<?= h($app->url('savedsearch', ['t' => $t->name])) ?>" class="m-0"><?= $app->csrfField() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= (int)$sv['id'] ?>"><input type="hidden" name="_back" value="<?= h($app->url('list', $base)) ?>">
              <button class="btn btn-sm btn-link text-danger p-0 px-1" title="<?= h(t('btn.delete')) ?>"><i class="bi bi-x-lg"></i></button></form>
            <?php endif ?>
          </div>
        <?php endforeach ?>
        <?php if (!$saved): ?><div class="text-secondary small px-2 pb-2"><?= h(t('search.none')) ?></div><?php endif ?>
        <form method="post" action="<?= h($app->url('savedsearch', ['t' => $t->name])) ?>" class="border-top pt-2 mt-1 mc-save-search">
          <?= $app->csrfField() ?><input type="hidden" name="query" value="<?= h(json_encode((object)$curQuery, JSON_UNESCAPED_UNICODE)) ?>"><input type="hidden" name="_back" value="<?= h($curUrl) ?>">
          <div class="small fw-semibold mb-1"><?= h(t('search.save_current')) ?></div>
          <div class="input-group input-group-sm"><input class="form-control" name="title" required maxlength="200" placeholder="<?= h(t('search.title')) ?>"><button class="btn btn-primary" title="<?= h(t('btn.save')) ?>"><i class="bi bi-floppy"></i></button></div>
          <?php if (isAdmin()): ?><div class="form-check small mt-1"><input class="form-check-input" type="checkbox" name="shared" value="1" id="mcSearchShared"><label class="form-check-label" for="mcSearchShared"><?= h(t('search.shared')) ?></label></div><?php endif ?>
        </form>
      </div>
    </div>
  <?php endif ?>
</div>
<?php if ($req['s'] || $req['f']): ?>
<div class="mb-2 small"><span class="badge text-bg-info"><i class="bi bi-funnel-fill"></i> <?= h(t('list.filtered')) ?></span>
  <a href="<?= h($app->url('list', $base)) ?>" class="ms-2"><?= h(t('list.clear')) ?></a></div>
<?php endif ?>
<?php endif ?>
