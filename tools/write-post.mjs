/* Lucid Reels Media — draft one blog post with the Claude API.
   Runs in GitHub Actions. Reads js/blog-data.js, asks Claude for one new post,
   validates it hard, inserts it at the top of window.BLOG, and writes three
   side files the workflow uses to open the pull request.
   Never publishes anything: the PR is the gate. */
import fs from 'node:fs';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY is not set'); process.exit(1); }

const MODEL = 'claude-sonnet-5-5';
const DATA = 'js/blog-data.js';

// ---------- read what already exists ----------
const raw = fs.readFileSync(DATA, 'utf8');
global.window = {};
eval(raw);
const POSTS = window.BLOG.slice().sort((a, b) => b.date.localeCompare(a.date));
const newest = POSTS[0];
const market = newest && newest.market === 'Tampa' ? 'St. Petersburg' : 'Tampa';
const taken = POSTS.map(p => `- ${p.title}  (${p.market})`).join('\n');
const slugs = new Set(POSTS.map(p => p.slug));
const today = new Date().toISOString().slice(0, 10);

// ---------- ask for one post ----------
const prompt = `You write the blog for Lucid Reels Media, a real estate photography and video company serving Tampa, St. Petersburg and New Port Richey, Florida. The audience is real estate agents hiring a media company.

Write ONE new post for the market: ${market}

Posts that already exist — do not repeat these topics or anything close to them:
${taken || '(none yet)'}

Return ONLY a JSON object, no prose around it, with exactly these keys:
  slug         kebab-case, lowercase, ends with the market slug, unique
  title        <= 65 characters INCLUDING the market name
  h1           the on-page heading, may differ slightly from title
  description  120-160 characters, written for a search result snippet
  market       exactly "${market}"
  date         "${today}"
  readMins     integer, realistic for the length
  excerpt      2 sentences, plain text, no HTML
  body         an ARRAY of strings, 600-900 words in total. Each array element is ONE
               complete HTML block: either "<p>...</p>" or "<h2>...</h2>". Use 4-6 <h2>
               sections, each followed by one or more <p>. <strong> may appear inside a <p>.
               No other tags. Do not return the body as a single string.

Rules for the body:
- Concrete and useful to a working agent. Specific advice, not filler.
- NEVER invent statistics, percentages, dollar figures, client names, awards, testimonials or case studies.
- No first-person claims about jobs Lucid Reels has done.
- Do not mention turnaround times or prices as facts; speak in ranges the reader should ask about.
- Plain confident prose. No marketing hype, no exclamation marks, no emoji.`;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
});
if (!res.ok) { console.error(`API ${res.status}: ${(await res.text()).slice(0, 500)}`); process.exit(1); }
const out = await res.json();
const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

let post;
try { post = JSON.parse(text.replace(/^[\s\S]*?```(?:json)?\s*/, '').replace(/```[\s\S]*$/, '').trim() || text); }
catch { try { post = JSON.parse(text.trim()); } catch (e) { console.error('Model did not return JSON:\n' + text.slice(0, 800)); process.exit(1); } }

// body must be an array of HTML blocks, matching the existing schema.
// Accept a single string too and split it, so one stray format does not waste a run.
if (typeof post.body === 'string') {
  post.body = post.body.replace(/>\s*</g, '>\n<').split('\n').map(s => s.trim()).filter(Boolean);
}

// ---------- validate before it can ever reach a human ----------
const problems = [];
const need = ['slug','title','h1','description','market','date','readMins','excerpt','body'];
for (const k of need) if (!post[k] && post[k] !== 0) problems.push(`missing field: ${k}`);
if (post.slug && slugs.has(post.slug)) problems.push(`slug already exists: ${post.slug}`);
if (post.title && post.title.length > 65) problems.push(`title ${post.title.length} chars (max 65)`);
if (post.description && (post.description.length < 120 || post.description.length > 160))
  problems.push(`description ${post.description.length} chars (want 120-160)`);
if (!Array.isArray(post.body)) problems.push('body is not an array of HTML blocks');
const bodyText = Array.isArray(post.body) ? post.body.join('\n') : '';
const words = bodyText.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
if (words < 550 || words > 1000) problems.push(`body ${words} words (want 600-900)`);
if (/<(?!\/?(p|h2|strong)\b)[a-z]/i.test(bodyText)) problems.push('body uses tags other than p/h2/strong');
if (Array.isArray(post.body) && !post.body.every(b => /^<(p|h2)>[\s\S]*<\/(p|h2)>$/.test(String(b).trim())))
  problems.push('every body element must be one complete <p> or <h2> block');
if (Array.isArray(post.body) && !post.body.some(b => /^<h2>/.test(String(b).trim())))
  problems.push('body has no <h2> sections');
if (POSTS.some(p => p.title.toLowerCase() === String(post.title || '').toLowerCase())) problems.push('duplicate title');
if (problems.length) { console.error('Draft rejected:\n  ' + problems.join('\n  ')); process.exit(1); }

// ---------- insert at the top of window.BLOG ----------
const S = v => JSON.stringify(v);
const entry = `{
 slug: ${S(post.slug)},
 title: ${S(post.title)},
 h1: ${S(post.h1)},
 description: ${S(post.description)},
 market: ${S(post.market)},
 date: ${S(post.date)},
 readMins: ${Number(post.readMins) || 6},
 excerpt: ${S(post.excerpt)},
 body: [
${post.body.map(b => '  ' + S(b)).join(',\n')}
 ]
},
`;
const anchor = raw.indexOf('window.BLOG = [');
if (anchor === -1) { console.error('could not find "window.BLOG = [" in ' + DATA); process.exit(1); }
const at = raw.indexOf('[', anchor) + 1;
fs.writeFileSync(DATA, raw.slice(0, at) + '\n' + entry + raw.slice(at).replace(/^\n/, ''));

// ---------- side files for the pull request ----------
const readable = post.body.join('\n')
  .replace(/<h2>/g, '\n## ').replace(/<\/h2>/g, '\n')
  .replace(/<\/?strong>/g, '**').replace(/<p>/g, '\n').replace(/<\/p>/g, '\n')
  .replace(/\n{3,}/g, '\n\n').trim();
fs.writeFileSync('.post-slug', post.slug);
fs.writeFileSync('.post-title', post.title);
fs.writeFileSync('.post-pr.md',
`**${post.title}**

*${post.market} · ${words} words · ~${post.readMins} min read · ${post.date}*

Search snippet:
> ${post.description}

---

${readable}

---

Merge to publish. Close to discard. Nothing goes live until you merge.`);
console.log(`drafted: ${post.title}  (${words} words, ${post.market})`);
