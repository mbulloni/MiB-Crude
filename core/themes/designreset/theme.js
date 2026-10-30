/* Sidebar of DesignReset templates without the template's app.js (which expects its demo DOM). */
(function () {
  'use strict';
  var container = document.querySelector('.main-container');
  var header = document.querySelector('.header.navbar');
  var overlay = document.querySelector('.overlay');
  var toggle = function (e) {
    if (e) e.preventDefault();
    container.classList.toggle('sidebar-closed');
    container.classList.toggle('sbar-open');
    if (header) header.classList.toggle('expand-header');
    if (overlay) overlay.classList.toggle('show');
    try { localStorage.setItem('mc-sidebar-closed', container.classList.contains('sidebar-closed') ? '1' : '0'); } catch (err) {}
  };
  Array.prototype.forEach.call(document.querySelectorAll('.sidebarCollapse'), function (el) { el.addEventListener('click', toggle); });
  if (overlay) overlay.addEventListener('click', toggle);
  // Small screens start with the sidebar closed, like the template.
  if (window.innerWidth < 992 && container && !container.classList.contains('sidebar-closed')) { container.classList.add('sidebar-closed'); if (header) header.classList.add('expand-header'); }
})();
