/* Material Admin menus without AngularJS (collapseNav, toggleOffCanvas, nav-collapsed-min directives). */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var nav = document.getElementById('nav-container');
  var horizontal = nav && nav.classList.contains('nav-horizontal');
  var wide = function () { return window.innerWidth >= 768; };
  var slide = function (ul, show) { if (ul) ul.style.display = show ? 'block' : 'none'; };
  // Accordion: one group open; disabled when the menu is minimised or horizontal on wide screens.
  Array.prototype.forEach.call(document.querySelectorAll('#nav > li > ul'), function (ul) {
    var li = ul.parentNode;
    var a = li.querySelector(':scope > a');
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (app.classList.contains('nav-collapsed-min') || (horizontal && wide())) return;
      var open = li.classList.contains('open');
      Array.prototype.forEach.call(document.querySelectorAll('#nav > li.open'), function (x) { x.classList.remove('open'); slide(x.querySelector(':scope > ul'), false); });
      if (!open) { li.classList.add('open'); slide(ul, true); }
    });
  });
  // Minimised menu (icons only), remembered per browser.
  var min = document.getElementById('mcMdMin');
  var setMin = function (on) {
    app.classList.toggle('nav-collapsed-min', on);
    if (on) Array.prototype.forEach.call(document.querySelectorAll('#nav > li > ul'), function (ul) { ul.style.display = ''; });
    try { localStorage.setItem('mc-material-min', on ? '1' : '0'); } catch (err) {}
  };
  if (min) min.addEventListener('click', function (e) { e.preventDefault(); setMin(!app.classList.contains('nav-collapsed-min')); });
  try { if (min && wide() && localStorage.getItem('mc-material-min') === '1') setMin(true); } catch (err) {}
  // Small screens: off-canvas menu.
  var off = document.getElementById('mcMdOffCanvas');
  if (off) off.addEventListener('click', function () { app.classList.toggle('on-canvas'); });
})();
