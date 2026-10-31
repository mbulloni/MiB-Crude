/* Webarch sidebar without webarch.js (jQuery 1.11, Bootstrap 3 plugins, demo widgets). */
(function () {
  'use strict';
  var body = document.body;
  var menu = document.getElementById('main-menu');
  var content = document.querySelector('.page-content');
  // Accordion: one open group per level.
  Array.prototype.forEach.call(document.querySelectorAll('.page-sidebar li > a'), function (a) {
    var sub = a.nextElementSibling;
    if (!sub || !sub.classList.contains('sub-menu')) return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var li = a.parentNode;
      var open = li.classList.contains('open');
      Array.prototype.forEach.call(li.parentNode.children, function (x) {
        x.classList.remove('open');
        var s = x.querySelector(':scope > .sub-menu'); if (s) s.style.display = 'none';
        var ar = x.querySelector(':scope > a > .arrow'); if (ar) ar.classList.remove('open');
      });
      if (!open) { li.classList.add('open'); sub.style.display = 'block'; var ar = a.querySelector('.arrow'); if (ar) ar.classList.add('open'); }
    });
  });
  // Condensed menu (icons only), remembered per browser.
  var condense = function (on) {
    body.classList.toggle('grey', on);
    body.classList.toggle('condense-menu', on);
    if (menu) menu.classList.toggle('mini', on);
    if (content) content.classList.toggle('condensed', on);
    try { localStorage.setItem('mc-webarch-mini', on ? '1' : '0'); } catch (err) {}
  };
  var tog = document.getElementById('layout-condensed-toggle');
  if (tog) tog.addEventListener('click', function (e) { e.preventDefault(); condense(!(menu && menu.classList.contains('mini'))); });
  try { if (localStorage.getItem('mc-webarch-mini') === '1' && window.innerWidth >= 992) condense(true); } catch (err) {}
  // Small screens: sidebar slides in.
  Array.prototype.forEach.call(document.querySelectorAll('[data-webarch="toggle-left-side"]'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (body.classList.contains('open-menu-left')) { body.classList.remove('open-menu-left'); setTimeout(function () { menu.classList.remove('visible'); }, 300); }
      else { menu.classList.add('visible'); setTimeout(function () { body.classList.add('open-menu-left'); }, 50); }
    });
  });
})();
