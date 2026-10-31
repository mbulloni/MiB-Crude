/* Slim menus without the template's slim.js (jQuery, Bootstrap 4 tooltips, demo settings panel). */
(function () {
  'use strict';
  var slide = function (el, show) { if (el) el.style.display = show ? 'block' : 'none'; };
  // Sidebar: one group open at a time, third level inside it.
  Array.prototype.forEach.call(document.querySelectorAll('.slim-sidebar .sidebar-nav-link'), function (a) {
    var sub = a.nextElementSibling;
    if (!sub) return;
    if (a.classList.contains('active')) slide(sub, true);
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var open = sub.style.display === 'block';
      Array.prototype.forEach.call(document.querySelectorAll('.slim-sidebar .sidebar-nav-sub'), function (s) { slide(s, false); });
      slide(sub, !open);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.slim-sidebar .sub-with-sub > .nav-sub-link'), function (a) {
    var sub = a.nextElementSibling;
    if (a.classList.contains('active')) slide(sub, true);
    a.addEventListener('click', function (e) { e.preventDefault(); slide(sub, sub.style.display !== 'block'); });
  });
  var toggle = document.getElementById('slimSidebarMenu');
  if (toggle) toggle.addEventListener('click', function (e) {
    e.preventDefault();
    var wide = window.matchMedia('(min-width: 1200px)').matches;
    document.body.classList.toggle(wide ? 'hide-sidebar' : 'show-sidebar');
    try { if (wide) localStorage.setItem('mc-slim-hide', document.body.classList.contains('hide-sidebar') ? '1' : '0'); } catch (err) {}
  });
  try { if (toggle && localStorage.getItem('mc-slim-hide') === '1' && window.matchMedia('(min-width: 1200px)').matches) document.body.classList.add('hide-sidebar'); } catch (err) {}
  // Horizontal navbar: button on small screens, click opens a group.
  var navBtn = document.getElementById('mcSlimNav');
  if (navBtn) navBtn.addEventListener('click', function () { document.body.classList.toggle('mc-slim-nav-open'); });
  Array.prototype.forEach.call(document.querySelectorAll('.slim-navbar .nav-item.with-sub > .nav-link'), function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); a.parentNode.classList.toggle('mc-open'); });
  });
})();
