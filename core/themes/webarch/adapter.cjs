'use strict';
// Webarch 2 (Bootstrap 3): webarch.css styles the template on top of a separate Bootstrap 3,
// which is not used (the pages use Bootstrap 5); theme.css restores the Bootstrap 3 helpers
// the shell needs. Variants = the template's colour themes.
const fs = require('node:fs');
const path = require('node:path');

const THEMES = { default: ['webarch.css', 'Predefinito'], corporate: ['themes/webarch.coporate.css', 'Corporate'], elegant: ['themes/webarch.elegant.css', 'Elegant'], simple: ['themes/webarch.simple.css', 'Simple'] };

module.exports = {
  id: 'webarch',
  name: 'Webarch (Revox)',
  dir: 'webarch',
  detect(dir) {
    const css = path.join(dir, 'webarch', 'css', 'webarch.css');
    if (!fs.existsSync(css) || !fs.existsSync(path.join(dir, 'assets', 'plugins', 'bootstrapv3'))) return null;
    // The package has the same files in barebone/ and demo/HTML/: use barebone only.
    if (path.basename(dir) === 'HTML' && fs.existsSync(path.join(dir, '..', '..', 'barebone', 'webarch', 'css', 'webarch.css'))) return null;
    const version = (fs.readFileSync(css, 'utf8').slice(0, 300).match(/Webarch v([\d.]+)/) || [])[1] || '2';
    const variants = Object.entries(THEMES).filter(([, [f]]) => fs.existsSync(path.join(dir, 'webarch', 'css', f))).map(([id, [, label]]) => ({ id, label }));
    return { root: dir, name: `Webarch ${version}`, slug: `webarch${version.split('.')[0]}`, variants };
  },
  install(root, variant, dest) {
    const { copy } = require('../index.cjs');
    const [file] = THEMES[variant] || THEMES.default;
    // Always webarch/css/webarch.css so that ../img and ../fonts resolve.
    copy(path.join(root, 'webarch', 'css', file), path.join(dest, 'webarch', 'css', 'webarch.css'));
    copy(path.join(root, 'webarch', 'img'), path.join(dest, 'webarch', 'img'));
    copy(path.join(root, 'webarch', 'fonts'), path.join(dest, 'webarch', 'fonts'));
    return {
      bootstrap: 3,
      css: ['assets/webarch/css/webarch.css', 'layouts/theme.css'],
      jsFirst: [],
      js: ['layouts/theme.js'],
      providesBootstrap: false, providesJquery: false,
      fonts: 'https://fonts.googleapis.com/icon?family=Material+Icons', // menu arrows
      options: { color: variant },
    };
  },
};
