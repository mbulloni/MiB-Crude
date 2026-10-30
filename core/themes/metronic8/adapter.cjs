'use strict';
// Keenthemes Metronic 8 (HTML, demo1): Bootstrap 5 + plugins bundle (jQuery, Bootstrap JS).
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  id: 'metronic8',
  name: 'Metronic 8 (Keenthemes)',
  dir: 'metronic8',
  detect(dir) {
    const dist = path.join(dir, 'html', 'demo1', 'dist');
    if (!/metronic/i.test(dir) || !fs.existsSync(path.join(dist, 'assets', 'css', 'style.bundle.css'))) return null;
    const version = (path.basename(dir).match(/v([\d.]+)/) || [])[1] || '8';
    return {
      root: dist, name: `Metronic ${version}`, slug: `metronic${version.split('.')[0]}`,
      variants: [{ id: 'dark-sidebar', label: 'Barra laterale scura' }, { id: 'light-sidebar', label: 'Barra laterale chiara' }],
    };
  },
  install(root, variant, dest) {
    const { copy } = require('../index.cjs');
    copy(path.join(root, 'assets', 'css', 'style.bundle.css'), path.join(dest, 'css', 'style.bundle.css'));
    copy(path.join(root, 'assets', 'js', 'scripts.bundle.js'), path.join(dest, 'js', 'scripts.bundle.js'));
    copy(path.join(root, 'assets', 'plugins', 'global'), path.join(dest, 'plugins', 'global'), (p) => !/sourcemaps/.test(p));
    copy(path.join(root, 'assets', 'media', 'logos'), path.join(dest, 'media', 'logos'));
    return {
      bootstrap: 5,
      css: ['assets/plugins/global/plugins.bundle.css', 'assets/css/style.bundle.css', 'layouts/theme.css'],
      jsFirst: ['assets/plugins/global/plugins.bundle.js'],
      js: ['assets/js/scripts.bundle.js'],
      providesBootstrap: true, providesJquery: true,
      fonts: 'https://fonts.googleapis.com/css?family=Inter:300,400,500,600,700',
      dark: { attr: 'data-theme' },
      options: { sidebar: variant },
    };
  },
};
