import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const ORIGIN = 'https://main--uplift-wheelercat-eds--paolomoz.aem.page';

// 1. Load query-index to know what exists + get sample pages per template.
const idx = await (await fetch(`${ORIGIN}/query-index.json`)).json();
const existing = new Set(idx.data.map(r => r.path.replace(/\/$/, '')));
existing.add(''); existing.add('/');
console.log(`Index has ${idx.total} pages`);

// Bucket pages by (template, pageType) for sampling
const buckets = new Map();
for (const r of idx.data) {
  const key = `${r.template || '?'}|${r.pageType || 'detail'}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(r.path);
}
// 1 sample per (template,pageType) bucket; plus '/' explicitly
const samples = ['/', ...[...buckets.values()].map(arr => arr[0])];
console.log(`Sampling ${samples.length} pages across ${buckets.size} (template, pageType) buckets`);

// 2. Visit + extract all internal links + chrome
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const linkSources = new Map(); // href -> Set(source paths)
const allHrefs = new Map();    // href -> first seen text label

for (const path of samples) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim().slice(0, 40),
      region: a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : a.closest('.breadcrumb') ? 'breadcrumb' : a.closest('.cards.related.dynamic, .cards.listing.dynamic') ? 'dynamic' : 'main',
    })));
    hrefs.forEach(({ href, text, region }) => {
      if (!href) return;
      if (/^(https?:)?\/\//.test(href) && !href.includes('uplift-wheelercat-eds--paolomoz')) return; // external
      if (/^(mailto:|tel:|javascript:|#)/.test(href)) return;
      // Normalize: strip query string + trailing slash; absolute paths only
      let norm = href.replace(/^https?:\/\/[^/]+/, '').split('?')[0].split('#')[0].replace(/\/$/, '');
      if (!norm.startsWith('/')) norm = '/' + norm;
      if (norm === '' || norm === '/index.html') norm = '/';
      if (!linkSources.has(norm)) linkSources.set(norm, new Set());
      linkSources.get(norm).add(`${region}:${path}`);
      if (!allHrefs.has(norm)) allHrefs.set(norm, { text, region });
    });
  } catch (e) { console.log(`  ✗ ${path}: ${e.message}`); }
  await page.close();
}
await browser.close();

// 3. Classify each link as exists / missing, with cross-page weight
// Chrome links (header/footer/dynamic) appear on every page, so multiply by total pages.
const TOTAL_PAGES = idx.total;
const rows = [];
for (const [href, sources] of linkSources) {
  const fromChrome = [...sources].some(s => s.startsWith('header:') || s.startsWith('footer:'));
  const fromDynamic = [...sources].some(s => s.startsWith('dynamic:'));
  const sampledRegions = [...new Set([...sources].map(s => s.split(':')[0]))];
  // Estimate true inbound count
  let inbound;
  if (fromChrome) inbound = TOTAL_PAGES;  // appears on every page via chrome
  else if (fromDynamic) inbound = 1;       // dynamic, generated per-page, low
  else {
    // Main-content link from N sampled pages — scale by bucket sizes for source pages
    const sourcePaths = [...sources].map(s => s.split(':')[1]);
    inbound = sourcePaths.reduce((sum, p) => {
      const bucket = [...buckets.values()].find(b => b.includes(p));
      return sum + (bucket ? bucket.length : 1);
    }, 0);
  }
  // Check existence
  const normalized = href.replace(/\/$/, '');
  let exists = existing.has(normalized) || existing.has(href);
  // Try ending with / too
  if (!exists) exists = existing.has(normalized + '/') || existing.has(href + '/');
  rows.push({
    href,
    inbound,
    exists,
    region: sampledRegions.join('+'),
    text: allHrefs.get(href)?.text,
  });
}

// 4. Sort + output
rows.sort((a, b) => {
  if (a.exists !== b.exists) return a.exists ? 1 : -1;
  return b.inbound - a.inbound;
});

const missing = rows.filter(r => !r.exists);
const present = rows.filter(r => r.exists);
console.log(`\nUnique link destinations: ${rows.length}`);
console.log(`  Missing: ${missing.length}`);
console.log(`  Live:    ${present.length}`);

console.log('\n=== TOP 30 MISSING (sorted by estimated inbound link count) ===');
console.log('inbound  region            text                          → href');
missing.slice(0, 30).forEach(r => {
  console.log(`${String(r.inbound).padStart(6)}   ${r.region.padEnd(17)} ${(r.text || '').padEnd(28)} → ${r.href}`);
});

// Write full CSV
const csv = ['href,exists,inbound,region,text', ...rows.map(r => `"${r.href}",${r.exists},${r.inbound},"${r.region}","${(r.text || '').replace(/"/g, '""')}"`)].join('\n');
writeFileSync('/tmp/link-audit.csv', csv);
console.log(`\nFull CSV: /tmp/link-audit.csv`);
