/* Lucid Reels Media — pre-deploy quality gate.
   Usage: node qa-blog.js <siteDir>
   Exit 0 = safe to deploy. Exit 1 = blocking problem found. */
const fs = require('fs'), path = require('path');
const SITE = process.argv[2];
if (!SITE || !fs.existsSync(SITE)) { console.error('usage: node qa-blog.js <siteDir>'); process.exit(1); }

const fail = [], warn = [];
const F = m => fail.push(m), W = m => warn.push(m);
const read = p => fs.readFileSync(p, 'utf8');
const one = (h, re) => { const m = h.match(re); return m ? m[1].trim() : null; };

// ---- gather pages ----
const rootPages = fs.readdirSync(SITE).filter(f => f.endsWith('.html'));
const blogDir = path.join(SITE, 'blog');
const blogPages = fs.existsSync(blogDir) ? fs.readdirSync(blogDir).filter(f => f.endsWith('.html')).map(f => 'blog/' + f) : [];
const pages = rootPages.concat(blogPages).filter(p => p !== 'portfolio-index.html');

// ---- blog data ----
global.window = {};
eval(read(path.join(SITE, 'js', 'blog-data.js')));
const POSTS = window.BLOG;

// 1. slugs unique + page exists
const slugs = new Set();
for (const p of POSTS) {
  if (slugs.has(p.slug)) F(`duplicate slug: ${p.slug}`);
  slugs.add(p.slug);
  if (!fs.existsSync(path.join(blogDir, p.slug + '.html'))) F(`missing page for slug: ${p.slug}`);
  if (!/^[a-z0-9-]+$/.test(p.slug)) F(`slug not url-safe: ${p.slug}`);
  if (!p.date || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) F(`bad date on ${p.slug}: ${p.date}`);
  const words = p.body.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (words < 350) F(`${p.slug}: body only ${words} words (min 350)`);
  if (!p.body.some(b => b.startsWith('<h2'))) W(`${p.slug}: no <h2> sections`);
}

// 2. title / description uniqueness + length
const titles = new Map(), descs = new Map();
for (const rel of pages) {
  const h = read(path.join(SITE, rel));
  const t = one(h, /<title>([\s\S]*?)<\/title>/i);
  const d = one(h, /<meta name="description" content="([^"]*)"/i);
  if (!t) { F(`${rel}: no <title>`); continue; }
  if (titles.has(t)) F(`duplicate <title> in ${rel} and ${titles.get(t)}: "${t}"`);
  titles.set(t, rel);
  if (t.length > 65) W(`${rel}: title ${t.length} chars (>65 may truncate)`);
  if (rel.startsWith('blog')) {
    if (!d) { F(`${rel}: no meta description`); }
    else {
      if (descs.has(d)) F(`duplicate meta description in ${rel} and ${descs.get(d)}`);
      descs.set(d, rel);
      if (d.length < 120 || d.length > 160) F(`${rel}: meta description ${d.length} chars (want 120-160)`);
    }
    const h1s = (h.match(/<h1[\s>]/gi) || []).length;
    if (h1s !== 1) F(`${rel}: ${h1s} <h1> tags (want exactly 1)`);
    if (!/rel="canonical"/.test(h)) F(`${rel}: missing canonical`);
    if (!/application\/ld\+json/.test(h)) F(`${rel}: missing JSON-LD schema`);
  }
}

// 3. placeholder / fabricated-claim markers
const BAD = [/lorem ipsum/i, /\bTODO\b/, /\bTKTK\b/, /\[insert/i, /coming soon/i, /XX%/,
             /\bas seen on\b/i, /award[- ]winning/i, /\b#1 (?:rated|choice)\b/i];
for (const rel of pages.filter(p => p.startsWith('blog'))) {
  const h = read(path.join(SITE, rel));
  for (const re of BAD) if (re.test(h)) F(`${rel}: suspicious copy matches ${re}`);
}

// 4. internal links resolve
let checked = 0;
for (const rel of pages) {
  const abs = path.join(SITE, rel), dir = path.dirname(abs);
  const h = read(abs);
  for (const m of h.matchAll(/(?:href|src)="((?!https?:|#|mailto:|tel:|data:|javascript:)[^"'+]+)"/g)) {
    const t = m[1].split('#')[0].split('?')[0];
    if (!t || t.includes("'")) continue;
    checked++;
    const cand = path.normalize(path.join(dir, t));
    if (!fs.existsSync(cand) && !fs.existsSync(cand + '.html')) F(`${rel}: broken link -> ${t}`);
  }
}

// 5. sitemap covers every post
if (fs.existsSync(path.join(SITE, 'sitemap.xml'))) {
  const sm = read(path.join(SITE, 'sitemap.xml'));
  for (const p of POSTS) if (!sm.includes(p.slug)) F(`sitemap missing ${p.slug}`);
} else F('sitemap.xml missing');

// 6. private reference sheet must never be linked or deployed
for (const rel of pages) {
  if (/portfolio-index/.test(read(path.join(SITE, rel)))) F(`${rel} links to the private portfolio-index`);
}

console.log(`QA on ${SITE}: ${pages.length} pages, ${POSTS.length} posts, ${checked} internal links checked`);
warn.forEach(w => console.log('  WARN  ' + w));
fail.forEach(f => console.log('  FAIL  ' + f));
if (fail.length) { console.log(`\nBLOCKED: ${fail.length} problem(s). Deploy aborted.`); process.exit(1); }
console.log(warn.length ? `\nPASS with ${warn.length} warning(s).` : '\nPASS — clean.');
