'use strict';
// Satria (UIkit 2 hosting site): used for the login/registration pages and the public landing page.
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  id: 'satria',
  name: 'Satria (pagine di accesso e presentazione)',
  dir: 'satria',
  detect(dir) {
    if (!fs.existsSync(path.join(dir, 'css', 'uikit.css')) || !fs.existsSync(path.join(dir, 'login.html')) || !/satria/i.test(dir)) return null;
    return { root: dir, name: 'Satria', slug: 'satria', kind: 'auth', variants: [{ id: 'auth', label: 'Accesso e presentazione' }] };
  },
  install(root, variant, dest) {
    const { copy } = require('../index.cjs');
    for (const f of ['uikit.css', 'style.css', 'mediaquery.css', 'components/nez-icon.css']) copy(path.join(root, 'css', f), path.join(dest, 'css', f));
    copy(path.join(root, 'fonts'), path.join(dest, 'fonts'));
    for (const f of ['logo.svg', 'logo_footer.svg', 'bg_footer.png', 'bg_features.png', 'bg_abstract.png', 'pre_bg.gif', 'slideshow/sld1.jpg', 'slideshow/sld2.jpg']) copy(path.join(root, 'images', f), path.join(dest, 'images', f));
    return {
      kind: 'auth', bootstrap: 0,
      css: ['assets/css/uikit.css', 'assets/css/style.css', 'assets/css/components/nez-icon.css', 'assets/css/mediaquery.css', 'layouts/theme.css'],
      jsFirst: [], js: [], providesBootstrap: false, providesJquery: false, fonts: '', dark: {}, options: {},
    };
  },
};
