<?php /** mcPage helper and page JavaScript. Scope: $items, $name, $def. */ ?>
<script>
window.mcPage = (function () {
  var items = <?= json_encode(array_reduce($items, function ($c, $i) { $c[$i['id']] = ['type' => $i['type'], 'value' => isset($i['value']) ? $i['value'] : null, 'display' => isset($i['display']) ? $i['display'] : null]; return $c; }, []), JSON_HEX_TAG | JSON_HEX_AMP) ?>;
  return {
    name: <?= json_encode($name, JSON_HEX_TAG | JSON_HEX_AMP) ?>, items: items,
    ready: function (fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); },
    el: function (id) { return document.querySelector('#mc-page [data-block="' + id + '"]'); },
    value: function (id) { return items[id] ? items[id].value : null; },
    // Promise of the ECharts instance of a chart block (charts load asynchronously)
    chart: function (id) {
      return new Promise(function (ok, ko) {
        var n = 0, t = setInterval(function () {
          var c = window.mcPage.el(id), e = c && c.querySelector('.mc-chart');
          if (e && e.mcChart) { clearInterval(t); ok(e.mcChart()); } else if (++n > 100) { clearInterval(t); ko(new Error('chart ' + id)); }
        }, 100);
      });
    }
  };
})();
</script>
<?php if (!empty($def['js'])): ?><script>mcPage.ready(function () {
<?= str_replace('</script', '<\/script', $def['js']) ?>

});</script><?php endif ?>
