/* MiB-Crude: client API compatible with .phpr projects for imported "JavaScript OnLoad" events.
   Supported: Runner.getControl(pageid, field) with getValue/setValue/on/off/makeReadonly/makeReadWrite/
   setDisabled/setEnabled/hide/show/addValidation/removeValidation/setFocus/clear/getDispElem/isEmpty;
   pageObj (also "this") with on/hideField/showField/hideItem/showItem/getItem/setProxyValue; proxy values. */
(function () {
  'use strict';
  var page = (window.MC && window.MC.page) || {};
  var good = function (n) { return String(n).replace(/[^A-Za-z0-9_]/g, '_'); };
  var findInput = function (name) {
    var sel = '[name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]';
    return document.querySelector(sel) || document.querySelector(sel.replace(/"\]$/, '[]"]')) || document.getElementById('f_' + good(name));
  };
  var group = function (el) { return el && (el.closest('[class*="col-md-"]') || el.closest('.mb-3') || el.parentElement); };

  function Control(name, el) { this.fieldName = name; this.el = el; this.handlers = []; }
  Control.prototype = {
    getValue: function () {
      var el = this.el; if (!el) return '';
      if (el.type === 'checkbox') return el.checked ? 'on' : '';
      if (el.multiple) return Array.prototype.map.call(el.selectedOptions, function (o) { return o.value; });
      return el.value;
    },
    getStringValue: function () { var v = this.getValue(); return Array.isArray(v) ? v.join(',') : String(v); },
    setValue: function (v, triggerChange) {
      var el = this.el; if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v && v !== '0';
      else el.value = v == null ? '' : v;
      if (triggerChange) el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    clear: function () { this.setValue(''); },
    isEmpty: function () { var v = this.getValue(); return v === '' || v == null || (Array.isArray(v) && !v.length); },
    on: function (ev, fn) {
      var el = this.el, self = this; if (!el) return;
      var h = function (e) { return fn.call(self, e); };
      this.handlers.push([ev, h]);
      el.addEventListener(ev, h);
    },
    off: function (ev) { var el = this.el; this.handlers = this.handlers.filter(function (x) { if (!ev || x[0] === ev) { el.removeEventListener(x[0], x[1]); return false; } return true; }); },
    makeReadonly: function () { if (!this.el) return; this.el.readOnly = true; if (this.el.tagName === 'SELECT' || this.el.type === 'checkbox') { this.el.style.pointerEvents = 'none'; this.el.tabIndex = -1; } this.el.classList.add('bg-body-secondary'); },
    makeReadWrite: function () { if (!this.el) return; this.el.readOnly = false; this.el.style.pointerEvents = ''; this.el.tabIndex = 0; this.el.classList.remove('bg-body-secondary'); },
    isReadonly: function () { return !!(this.el && this.el.readOnly); },
    setDisabled: function () { if (this.el) this.el.disabled = true; },
    setEnabled: function () { if (this.el) this.el.disabled = false; },
    hide: function () { var g = group(this.el); if (g) g.style.display = 'none'; },
    show: function () { var g = group(this.el); if (g) g.style.display = ''; },
    addValidation: function (type) { if (this.el && /required/i.test(type)) this.el.required = true; },
    removeValidation: function (type) { if (this.el && /required/i.test(type)) this.el.required = false; },
    setFocus: function () { if (this.el) this.el.focus(); },
    getDispElem: function () { return window.jQuery ? jQuery(this.el) : this.el; },
    getFieldName: function () { return this.fieldName; },
    setMessage: function () {},
    invalid: function () { return this.el && !this.el.checkValidity(); }
  };

  var controls = {};
  var Runner = window.Runner = window.Runner || {};
  Runner.getControl = function (pageid, name) {
    if (!controls[name]) controls[name] = new Control(name, findInput(name));
    return controls[name];
  };
  Runner.getControls = function (pageid, name) { return [Runner.getControl(pageid, name)]; };
  Runner.pages = Runner.pages || { PageManager: { getById: function () { return pageObj; } } };

  var events = {};
  var pageObj = {
    pageType: page.type, tName: page.table, pageId: 1, id: 1,
    on: function (name, fn) { (events[name] = events[name] || []).push(fn); },
    fireEvent: function (name) { var args = Array.prototype.slice.call(arguments, 1); (events[name] || []).forEach(function (fn) { fn.apply(pageObj, args); }); },
    hideField: function (f) { Runner.getControl(1, f).hide(); },
    showField: function (f) { Runner.getControl(1, f).show(); },
    hideItem: function (id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; },
    showItem: function (id) { var e = document.getElementById(id); if (e) e.style.display = ''; },
    getItem: function (id) { return window.jQuery ? jQuery('#' + id) : document.getElementById(id); },
    getProxyValue: function (n) { return (page.proxy || {})[n]; }
  };
  window.pageObj = pageObj;
  window.pageid = 1;

  // Custom buttons (classic): Client Before -> Server (index.php?p=button) -> Client After.
  var btnCode = (window.MCJS && window.MCJS[page.table] && window.MCJS[page.table].__buttons) || {};
  var compile = function (src, args) { try { return src ? new Function(args, src) : null; } catch (e) { console.warn('[MiB-Crude] pulsante:', e); return null; } };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.mc-cbtn');
    if (!b) return;
    e.preventDefault();
    var id = b.getAttribute('data-btn'), table = b.getAttribute('data-table') || page.table;
    var code = btnCode[id] || {};
    var params = {};
    var keys = b.getAttribute('data-keys') ? JSON.parse(b.getAttribute('data-keys')) : null;
    var rowData = keys ? { keys: keys } : {};
    var ctrl = {
      setMessage: function (m) { b.setAttribute('title', m); b.dataset.msg = m; },
      setDisabled: function () { b.disabled = true; }, setEnabled: function () { b.disabled = false; },
      hide: function () { b.style.display = 'none'; }, show: function () { b.style.display = ''; },
      getDispElem: function () { return window.jQuery ? jQuery(b) : b; }
    };
    var before = compile(code.before, 'params, ctrl, pageObj, proxy, pageid, rowData, row, submit');
    if (before) { try { if (before.call(pageObj, params, ctrl, pageObj, page.proxy || {}, 1, rowData, null, function () {}) === false) return; } catch (err) { console.warn(err); return; } }
    var selected = Array.prototype.map.call(document.querySelectorAll('.mc-check:checked'), function (c) { return JSON.parse(c.value); });
    var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
    b.disabled = true;
    fetch('index.php?p=button&t=' + encodeURIComponent(table) + '&b=' + encodeURIComponent(id), {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ params: params, keys: keys, selected: selected })
    }).then(function (r) { return r.json(); }).then(function (res) {
      b.disabled = false;
      var after = compile(code.after, 'result, ctrl, pageObj, proxy, pageid, rowData, params');
      if (after) after.call(pageObj, res.result || {}, ctrl, pageObj, page.proxy || {}, 1, rowData, params);
      else if (res.error) alert(res.error);
      if (window.MC && window.MC.grid) window.MC.grid.ajax.reload(null, false);
    }).catch(function (err) { b.disabled = false; console.warn(err); });
  });

  var code = window.MCJS && window.MCJS[page.table] && window.MCJS[page.table][page.type];
  if (!code) return;
  var run = function () {
    try {
      var fn = new Function('pageObj', 'proxy', 'pageid', 'inlineRow', 'inlineObject', 'row', code);
      fn.call(pageObj, pageObj, page.proxy || {}, 1, null, null, null);
    } catch (e) {
      if (window.console) console.warn('[MiB-Crude] evento JavaScript importato dal progetto .phpr:', e);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // List refresh after the grid reloads, for code listening to imported list events.
  if (window.MC && window.MC.grid && window.MC.grid.on) window.MC.grid.on('draw', function () { pageObj.fireEvent('afterPageReady'); });
})();
