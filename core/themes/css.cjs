'use strict';
// CSS helpers for adapters of Bootstrap 3/4 templates: the generated pages use Bootstrap 5,
// so the framework bundled in the template stylesheet is removed and only the template's own
// rules are kept; a dark skin can be scoped to the app's dark mode ([data-bs-theme=dark]).

/** Split at "/* ### N. TITLE ### *\/" banners: [{num, title, css}] (num 0 = text before the first). */
function sections(css) {
  const re = /\/\*\s*#+\s*(\d+)\.\s*([^#*]*?)\s*#+\s*\*\//g;
  const out = [];
  let last = { num: 0, title: '', start: 0 };
  let m;
  while ((m = re.exec(css))) {
    // The banner is framed by "/* ---- */" lines: cut before the frame above it.
    const frame = css.lastIndexOf('/*', m.index - 1);
    const cut = frame >= 0 && /^\/\*\s*-+\s*\*\/\s*$/.test(css.slice(frame, m.index)) ? frame : m.index;
    out.push({ num: last.num, title: last.title, css: css.slice(last.start, cut) });
    last = { num: Number(m[1]), title: m[2], start: cut };
  }
  out.push({ num: last.num, title: last.title, css: css.slice(last.start) });
  return out;
}

/** Only the numbered sections in `keep` (the banners stay as comments). */
function keepSections(css, keep) {
  return sections(css).filter((s) => keep.includes(s.num)).map((s) => s.css).join('\n');
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function prefixSelector(sel, prefix) {
  return sel.split(',').map((s) => {
    s = s.trim();
    if (!s) return s;
    if (/^html\b/.test(s)) return s.replace(/^html/, `html${prefix}`);
    if (/^:root\b/.test(s)) return s.replace(/^:root/, `:root${prefix}`);
    return `${prefix} ${s}`;
  }).join(', ');
}

/** Every rule of `css` limited to `prefix` (e.g. "[data-bs-theme=dark]"), @media/@supports included. */
function scope(css, prefix) {
  css = stripComments(css);
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // Matching closing brace.
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(head)) out += `${head} {\n${scope(body, prefix)}}\n`;
    else if (head.startsWith('@')) out += `${head} {${body}}\n`; // @keyframes, @font-face
    else if (head) out += `${prefixSelector(head, prefix)} {${body}}\n`;
    i = j;
  }
  return out;
}

module.exports = { sections, keepSections, scope };
