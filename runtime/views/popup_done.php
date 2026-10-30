<?php /** @var \MiB\App $app @var \MiB\Table $table */ $v = count($keys) === 1 ? (string)reset($keys) : json_encode($keys); ?>
<!doctype html><html><body><script>
if (parent && parent.MCModal) parent.MCModal.done(<?= json_encode($v) ?>); else window.close();
</script></body></html>
