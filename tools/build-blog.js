/* Lucid Reels Media — blog builder.
   Usage: node build-blog.js <siteDir> [--extensionless]
   Blog pages are generated INSIDE the real site shell: the header, footer and
   scripts are lifted verbatim from about.html at build time, so the blog always
   matches the site even if the site chrome changes later. Idempotent. */
const fs = require('fs'), path = require('path');

const SITE = process.argv[2];
const EXTLESS = process.argv.includes('--extensionless');
const ORIGIN = 'https://lucidreelsmedia.com';
if (!SITE || !fs.existsSync(SITE)) { console.error('usage: node build-blog.js <siteDir>'); process.exit(1); }

global.window = {};
eval(fs.readFileSync(path.join(SITE, 'js', 'blog-data.js'), 'utf8'));
const POSTS = window.BLOG.slice().sort((a, b) => b.date.localeCompare(a.date));

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const page = p => EXTLESS ? p.replace(/\.html$/,'') : p;
const postHref = (slug, fromRoot) => (fromRoot ? '' : '../') + 'blog/' + slug + (EXTLESS ? '' : '.html');
const niceDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});

// ---------- lift the real site shell out of about.html ----------
const aboutRaw = fs.readFileSync(path.join(SITE, 'about.html'), 'utf8');
const HEAD_SRC = aboutRaw.slice(aboutRaw.indexOf('<head>') + 6, aboutRaw.indexOf('</head>'));
const HEADER   = aboutRaw.slice(aboutRaw.indexOf('<body>') + 6, aboutRaw.indexOf('<main class="main-wrapper">'));
const FOOTER   = aboutRaw.slice(aboutRaw.indexOf('</main>') + 7, aboutRaw.lastIndexOf('</body>'));

// rewrite relative paths + strip "current page" state for a page one level deep
const PAGES = ['index','about','pricing','contact','exterior','interior','book-media-shoot','book-discovery-call','blog'];
function depth1(html) {
  let h = html
    .replace(/(href|src)="(css|js|images|fonts)\//g, '$1="../$2/')
    .replace(/\s(?:aria-current="page"|class="([^"]*?)\s*w--current")/g, (m, cls) => cls !== undefined ? ` class="${cls}"` : '');
  for (const p of PAGES) {
    const target = EXTLESS ? p : p + '.html';
    h = h.replace(new RegExp(`href="${target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`, 'g'), `href="../${target}"`);
  }
  return h;
}

function head(o) {
  const up = o.depth ? '../' : '';
  let h = HEAD_SRC
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(o.title)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/g, '')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '')
    .replace(/\s*<meta property="og:(?:title|description|url|type)"[^>]*>/g, '');
  if (o.depth) h = h.replace(/(href|src)="(css|js|images|fonts)\//g, '$1="../$2/');
  if (!/css\/blog\.css/.test(h)) h = h.replace(/(<link href="[^"]*css\/lucidreelsmedia\.css"[^>]*>)/, `$1\n  <link href="${up}css/blog.css" rel="stylesheet" type="text/css">`);
  const heroCss = `
  <style>
  /* hero backdrop - the site's own page-header style (exterior/interior/contact/book pages) */
  .lrm-herobg{position:relative;overflow:clip;}
  .lrm-herobg>.lrm-hero-inner{position:relative;z-index:2;padding-bottom:1rem;}
  .lrm-herobg>.background{z-index:0;opacity:.3;background-image:url('${up}images/Background.svg');background-position:50%;background-repeat:no-repeat;background-size:cover;position:absolute;inset:0;}
  .lrm-herobg>.header-opacity{z-index:1;background-image:linear-gradient(180deg,rgba(7,7,7,0),#070707);width:100%;height:3rem;position:absolute;inset:auto 0 0;pointer-events:none;}
  .lrm-ghead{text-align:center;padding:5rem 20px 2.5rem;}
  .lrm-ghead h1{font-family:'Bebas Neue',Impact,sans-serif;letter-spacing:.03em;color:#fff;font-size:6vw;line-height:1;margin:0;text-transform:uppercase;}
  .lrm-ghead h1 span{color:#D4AF37;}
  .lrm-ghead p{font-family:'Inter',Arial,sans-serif;color:#c9cdd6;margin:14px 0 0;font-size:15px;letter-spacing:.04em;}
  @media(max-width:767px){.lrm-ghead h1{font-size:12vw;}}
  </style>`;
  const extra = `
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${o.canonical}">
  <meta property="og:type" content="${o.ogType || 'website'}">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:url" content="${o.canonical}">
${o.schema ? '  <script type="application/ld+json">' + JSON.stringify(o.schema) + '</script>' : ''}`;
  return `<!DOCTYPE html>\n<html lang="en">\n<head>${h}${heroCss}${extra}\n</head>`;
}

const shellOpen  = d => (d ? depth1(HEADER) : HEADER) + '\n    <main class="main-wrapper">';
const shellClose = d => '    </main>' + (d ? depth1(FOOTER) : FOOTER) + '</body>\n</html>';

function card(p, fromRoot) {
  return `<a class="lrmb-card" href="${postHref(p.slug, fromRoot)}">
<div class="lrmb-meta"><span>${esc(p.market)}</span><span class="dot">/</span><time datetime="${p.date}">${niceDate(p.date)}</time></div>
<h3>${esc(p.h1)}</h3><p>${esc(p.excerpt)}</p><div class="lrmb-more">Read the post &rarr;</div></a>`;
}
const sec = inner => `<section class="section-blog"><div class="padding-global"><div class="container-large"><div class="padding-section-large">${inner}</div></div></div></section>`;

// ---------- post pages ----------
fs.mkdirSync(path.join(SITE, 'blog'), { recursive: true });
for (const p of POSTS) {
  const canonical = `${ORIGIN}/blog/${p.slug}`;
  const related = POSTS.filter(x => x.slug !== p.slug).slice(0, 3);
  const inner = `
<a class="lrmb-back" href="../${page('blog.html')}">&larr; All posts</a>
<div class="lrmb-meta"><span>${esc(p.market)}</span><span class="dot">/</span><time datetime="${p.date}">${niceDate(p.date)}</time><span class="dot">/</span><span>${p.readMins} min read</span></div>
<h1 class="lrmb-title">${esc(p.h1)}</h1>
<div class="lrmb-body">${p.body.join('\n')}</div>
<div class="lrmb-rule"></div>
<div class="lrmb-cta">
  <h3>See the work behind the advice</h3>
  <p>Every post here comes out of shoots we run across Tampa Bay. Browse recent listing photography, video and drone work, or book a short discovery call.</p>
  <div class="lrmb-actions"><a class="lrmb-btn" href="../${page('index.html')}">View our work</a><a class="lrmb-btn ghost" href="../${page('book-discovery-call.html')}">Book a discovery call</a></div>
</div>
<div class="lrmb-rule"></div>
<p class="lrmb-eyebrow">Keep reading</p>
<div class="lrmb-grid">${related.map(r => card(r, false)).join('\n')}</div>`;
  fs.writeFileSync(path.join(SITE, 'blog', p.slug + '.html'),
    `${head({ title: p.title, description: p.description, canonical, ogType: 'article', depth: 1,
      schema: { '@context':'https://schema.org','@type':'BlogPosting', headline:p.title, description:p.description,
        datePublished:p.date, dateModified:p.date, author:{'@type':'Organization',name:'Lucid Reels Media'},
        publisher:{'@type':'Organization',name:'Lucid Reels Media',url:ORIGIN},
        mainEntityOfPage:{'@type':'WebPage','@id':canonical}, about:{'@type':'Place',name:p.market},
        articleSection:'Real Estate Media' } })}
<body>${shellOpen(1)}
${sec(inner)}
${shellClose(1)}`);
}

// ---------- blog index ----------
const idxDesc = 'Field notes on real estate photography, video and drone work across Tampa, St. Petersburg and the Gulf Beaches, from the team at Lucid Reels Media.';
fs.writeFileSync(path.join(SITE, 'blog.html'),
  `${head({ title: 'Real Estate Media Blog — Tampa & St. Pete | Lucid Reels', description: idxDesc, canonical: `${ORIGIN}/blog`, depth: 0,
    schema: {'@context':'https://schema.org','@type':'Blog',name:'Lucid Reels Media Blog',url:`${ORIGIN}/blog`,description:idxDesc} })}
<body>${shellOpen(0)}
<header class="lrm-herobg"><div class="background"></div><div class="lrm-hero-inner"><div class="lrm-ghead"><h1>Real estate media, <span>Tampa Bay</span></h1><p>Field notes on listing photography, video &amp; drone work</p></div></div><div class="header-opacity"></div></header>
${sec(`<a class="lrmb-back" href="${page('about.html')}">&larr; Back to About Us</a>
<div class="lrmb-grid">${POSTS.map(p => card(p, true)).join('\n')}</div>`)}
${shellClose(0)}`);

// ---------- About teaser ----------
const aboutPath = path.join(SITE, 'about.html');
let about = fs.readFileSync(aboutPath, 'utf8');
const teaser = `<!-- LRM-BLOG-TEASER:START -->
      <section class="section-about-blog">
        <div class="padding-global"><div class="container-large"><div class="padding-section-large">
          <p class="lrmb-eyebrow">Field notes</p>
          <h2 class="lrmb-title">From the field</h2>
          <p class="lrmb-sub">Practical notes on listing photography, video and drone work across Tampa, St. Petersburg and the Gulf Beaches. New post every couple of days.</p>
          <div class="lrmb-grid">${POSTS.slice(0, 3).map(p => card(p, true)).join('\n')}</div>
          <div class="lrmb-actions"><a class="lrmb-btn ghost" href="${page('blog.html')}">Read all posts</a></div>
        </div></div></div>
      </section>
<!-- LRM-BLOG-TEASER:END -->`;
about = /<!-- LRM-BLOG-TEASER:START -->[\s\S]*?<!-- LRM-BLOG-TEASER:END -->/.test(about)
  ? about.replace(/<!-- LRM-BLOG-TEASER:START -->[\s\S]*?<!-- LRM-BLOG-TEASER:END -->/, teaser)
  : about.replace('      <section class="cta">', teaser + '\n      <section class="cta">');
if (!about.includes('css/blog.css')) about = about.replace('<link href="css/lucidreelsmedia.css" rel="stylesheet" type="text/css">',
  '<link href="css/lucidreelsmedia.css" rel="stylesheet" type="text/css">\n  <link href="css/blog.css" rel="stylesheet" type="text/css">');
fs.writeFileSync(aboutPath, about);

// (Blog is deliberately NOT in the site nav — four pills only.)
const navAdded = 0;

// ---------- sitemap + robots ----------
const statics = ['index.html','about.html','pricing.html','contact.html','exterior.html','interior.html','book-media-shoot.html','book-discovery-call.html','blog.html'];
const urls = statics.map(p => ({ loc: `${ORIGIN}/${p === 'index.html' ? '' : page(p)}`, pri: p === 'index.html' ? '1.0' : '0.8' }))
  .concat(POSTS.map(p => ({ loc: `${ORIGIN}/blog/${page(p.slug + '.html')}`, pri: '0.7', lastmod: p.date })));
fs.writeFileSync(path.join(SITE, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n') + `\n</urlset>\n`);
fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /portfolio-index.html\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

console.log(`built ${POSTS.length} posts in the real site shell -> ${SITE}`);
console.log(`  header/footer lifted from about.html | sitemap ${urls.length} urls | nav untouched (${navAdded} added)`);
