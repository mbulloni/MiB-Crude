'use strict';
// DesignReset templates (Cork 3, Equation 2): Bootstrap 5, layouts/<variant>/css/{light,dark}.
const fs = require('node:fs');
const path = require('node:path');

const LABELS = {
  'vertical-light-menu': 'Menu verticale chiaro', 'vertical-dark-menu': 'Menu verticale scuro',
  'collapsible-menu': 'Menu verticale compatto', 'semi-dark-menu': 'Menu semi-scuro',
};

module.exports = {
  id: 'designreset',
  name: 'DesignReset (Cork, Equation)',
  dir: 'designreset',
  detect(dir) {
    if (path.basename(dir) !== 'html') return null;
    if (!fs.existsSync(path.join(dir, 'layouts', 'vertical-light-menu', 'css', 'light', 'plugins.css')) || !fs.existsSync(path.join(dir, 'src', 'bootstrap', 'css', 'bootstrap.min.css'))) return null;
    const pkg = path.basename(path.dirname(dir)); // cork-v3.0, equation-v2.2.0
    const [, base, version] = pkg.match(/^([a-z]+)-v?([\d.]+)/i) || [null, pkg, ''];
    const name = base.charAt(0).toUpperCase() + base.slice(1) + (version ? ` ${version}` : '');
    const variants = fs.readdirSync(path.join(dir, 'layouts')).filter((v) => LABELS[v]).map((v) => ({ id: v, label: LABELS[v] }));
    return { root: dir, name, slug: `${base.toLowerCase()}${version.split('.')[0]}`, variants };
  },
  install(root, variant, dest) {
    const { copy } = require('../index.cjs');
    const skip = (p) => !/\.(scss|map|md)$/.test(p);
    copy(path.join(root, 'src', 'bootstrap'), path.join(dest, 'src', 'bootstrap'), skip);
    copy(path.join(root, 'src', 'assets', 'css'), path.join(dest, 'src', 'assets', 'css'), skip);
    copy(path.join(root, 'src', 'assets', 'img'), path.join(dest, 'src', 'assets', 'img'), skip);
    copy(path.join(root, 'src', 'plugins', 'css'), path.join(dest, 'src', 'plugins', 'css'), skip);
    copy(path.join(root, 'layouts', variant), path.join(dest, 'layouts', variant), skip);
    return {
      bootstrap: 5,
      css: ['assets/src/bootstrap/css/bootstrap.min.css', `assets/layouts/${variant}/css/light/plugins.css`, `assets/layouts/${variant}/css/dark/plugins.css`, 'layouts/theme.css'],
      jsFirst: [],
      js: ['assets/src/bootstrap/js/bootstrap.bundle.min.js', 'layouts/theme.js'],
      providesBootstrap: true, providesJquery: false,
      fonts: 'https://fonts.googleapis.com/css?family=Nunito:400,600,700',
      dark: { bodyClass: 'dark' },
      options: { variant },
    };
  },
};
