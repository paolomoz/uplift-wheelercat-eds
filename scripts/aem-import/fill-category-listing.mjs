#!/usr/bin/env node
/*
 * fill-category-listing.mjs — author category-listing pages for both
 * /new/machines/<category>/ and /used-equipment/<category>/.
 *
 * The page IS the directory's listing. Body content is minimal — a hero
 * banner with category title + extracted intro paragraph + hero image, and
 * a <div class="cards listing dynamic"> placeholder that the block JS
 * fills from /query-index.json at render time. Detail pages must already
 * exist in the index (published + indexed) for the block to find them;
 * for partially-migrated categories the block self-hides cleanly.
 *
 * Usage:
 *   node fill-category-listing.mjs new large-wheel-loaders
 *   node fill-category-listing.mjs used track-excavators --push --publish
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const THEME = 'wheelercat-equipment-new-v2';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';
const OUTPUT_DIR = `${STARDUST_ROOT}/stardust/aem-import-out/category-listing`;
const DA_ORG = 'paolomoz';
const DA_REPO = 'uplift-wheelercat-eds';
const EDS_PREVIEW = `https://main--${DA_REPO}--${DA_ORG}.aem.page`;

function escapeHTML(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(s) {
  return s.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const SECTION_SHAPES = {
  new: {
    sectionLabel: 'New Equipment',
    parentPath: '/new/',
    listingPathFn: (slug) => `new/machines/${slug}`,
    sourcePath: (slug) => `new/machines/${slug}`,
  },
  used: {
    sectionLabel: 'Used Equipment',
    parentPath: '/used-equipment/',
    listingPathFn: (slug) => `used-equipment/${slug}`,
    sourcePath: (slug) => `used-equipment/${slug}`,
  },
};

export async function extractCategory(section, categorySlug, browser) {
  const cfg = SECTION_SHAPES[section];
  if (!cfg) return { ok: false, error: 'unknown-section', section };
  const url = `https://wheelercat.com/${cfg.sourcePath(categorySlug)}/`;
  const page = await browser.newPage();
  const startedAt = Date.now();
  let httpStatus = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    httpStatus = resp?.status() || null;
  } catch (e) {
    await page.close();
    return { ok: false, error: 'goto-failed', message: e.message, url };
  }

  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200));
    }
  });

  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || null;

    // Intro paragraph: sentence-ish prose, NOT a spec row.
    // Heuristics that reject spec rows like "Maximum Gross Power N/A":
    //   - contains "N/A" → spec
    //   - 2+ runs of 5+ consecutive whitespace chars → table cell rendered as text
    //   - no period/colon → not a sentence
    //   - all-uppercase words > 40% → spec heading row
    const isSpecRow = (s) => {
      if (/\bN\/A\b/i.test(s)) return true;
      if ((s.match(/\s{5,}/g) || []).length > 1) return true;
      if (!/[.:!?]/.test(s)) return true;
      const words = s.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
      const upper = words.filter(w => w === w.toUpperCase() && w.length > 1).length;
      if (words.length && upper / words.length > 0.4) return true;
      return false;
    };
    let intro = null;
    const candidates = Array.from(document.querySelectorAll('main p, .entry-content p, article p'));
    for (const p of candidates) {
      const text = p.textContent?.trim().replace(/\s+/g, ' ');
      if (text && text.length > 80 && text.length < 800 && !isSpecRow(text)) {
        intro = text;
        break;
      }
    }

    // Hero image: largest scene7-or-uploaded image with a category-y aspect
    // (wider than tall). Excludes the sitewide CTA/contact banners and
    // square-ish thumbnails.
    const heroEl = Array.from(document.querySelectorAll('img'))
      .filter(i => i.src.includes('scene7') || i.src.match(/wp-content\/uploads\/.*\/[A-Z]/))
      .filter(i => i.naturalWidth >= 600)
      .filter(i => !/contact-banner|cta-|footer-|nav-|logo|icon/i.test(i.src))
      .filter(i => i.naturalWidth / i.naturalHeight > 1.2)
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
    const heroImage = heroEl ? heroEl.src : null;

    return { h1, intro, heroImage };
  });

  await page.close();

  // Fall back to slug-derived title if h1 missing
  if (!data.h1) data.h1 = titleCase(categorySlug);

  return {
    ok: true,
    _provenance: { url, httpStatus, fetchedAt: new Date().toISOString(), waitMs: Date.now() - startedAt },
    section,
    categorySlug,
    ...data,
  };
}

export function renderDA(data) {
  const cfg = SECTION_SHAPES[data.section];
  const listingPath = cfg.listingPathFn(data.categorySlug);

  const breadcrumb = `<div>
  <div class="breadcrumb"><div><div></div></div></div>
</div>`;

  const headerBand = `<div>
  <div class="text centered">
    <div>
      <div>
        <p>${escapeHTML(cfg.sectionLabel)}</p>
        <h1>${escapeHTML(data.h1.toUpperCase())}</h1>
        <p><strong><code>LISTING_COUNT</code></strong> models available</p>
${data.intro ? `        <p>${escapeHTML(data.intro)}</p>\n` : ''}      </div>
    </div>
  </div>
</div>`;

  const listingBlock = `<div>

  <div class="cards listing dynamic">
    <div><div><p>(filled at render time from /query-index.json)</p></div></div>
  </div>

</div>`;

  const ctaBar = `<div>

  <div class="cta-bar triple">
    <div>
      <div>
        <h2>Don't see what you need?</h2>
        <p><strong><a href="/contact/">Contact Sales</a></strong></p>
        <p><em><a href="/machine-quote-request/">Request a Quote</a></em></p>
        <p><em><a href="/equipment-finder/">Find Equipment</a></em></p>
      </div>
    </div>
  </div>

  <div class="section-metadata">
    <div>
      <div>style</div>
      <div>dark</div>
    </div>
  </div>

</div>`;

  const desc = data.intro
    ? data.intro.slice(0, 200) + (data.intro.length > 200 ? '…' : '')
    : `Browse ${data.h1} from Wheeler Machinery Co. View specs, request a quote, and compare models.`;

  const metadata = `<div>

  <div class="metadata">
    <div>
      <div>title</div>
      <div>${escapeHTML(data.h1)} — Wheeler Machinery Co.</div>
    </div>
    <div>
      <div>description</div>
      <div>${escapeHTML(desc)}</div>
    </div>
    <div>
      <div>template</div>
      <div>${THEME}</div>
    </div>
    <div>
      <div>category</div>
      <div>${escapeHTML(data.categorySlug)}</div>
    </div>
    <div>
      <div>pageType</div>
      <div>listing</div>
    </div>
  </div>

</div>`;

  return `<body>
<header></header>
<main>

${breadcrumb}

${headerBand}

${listingBlock}

${ctaBar}

${metadata}

</main>
<footer></footer>
</body>
`;
}

export function pagePath(data) {
  return SECTION_SHAPES[data.section].listingPathFn(data.categorySlug);
}

export async function pushToDA(pagePathStr, htmlPath, { publish = false } = {}) {
  const envPath = '/Users/paolo/stardust/uplift-wheelercat-eds/.env';
  const env = readFileSync(envPath, 'utf8');
  const token = env.match(/^DA_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!token) return { ok: false, error: 'no DA_TOKEN' };
  const auth = { Authorization: `Bearer ${token}` };

  const daUrl = `https://admin.da.live/source/${DA_ORG}/${DA_REPO}/${pagePathStr}.html`;
  const fd = new FormData();
  fd.append('data', new Blob([readFileSync(htmlPath)], { type: 'text/html' }), `${pagePathStr.split('/').pop()}.html`);
  const putRes = await fetch(daUrl, { method: 'PUT', headers: auth, body: fd });
  if (!putRes.ok) return { ok: false, phase: 'put', status: putRes.status, body: await putRes.text() };

  await new Promise(r => setTimeout(r, 1200));
  const previewRes = await fetch(`https://admin.hlx.page/preview/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
  if (!previewRes.ok) return { ok: false, phase: 'preview', status: previewRes.status };

  let livePublished = false;
  if (publish) {
    const liveRes = await fetch(`https://admin.hlx.page/live/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
    livePublished = liveRes.ok;
    await fetch(`https://admin.hlx.page/index/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
  }

  return { ok: true, livePreview: `${EDS_PREVIEW}/${pagePathStr}`, livePublished };
}

export const config = { THEME, OUTPUT_DIR, EDS_PREVIEW, DA_ORG, DA_REPO };

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node fill-category-listing.mjs <new|used> <category-slug> [--push] [--publish]');
    process.exit(1);
  }
  const section = args[0];
  const slug = args[1];
  const push = args.includes('--push');
  const publish = args.includes('--publish');

  console.log(`▸ Filling ${section}/${slug}`);

  const browser = await chromium.launch({ headless: true });
  const data = await extractCategory(section, slug, browser);
  await browser.close();

  if (!data.ok) {
    console.error(`✗ Extract failed: ${data.error}`, data.message || '');
    process.exit(1);
  }

  const html = renderDA(data);
  const path = pagePath(data);
  const outPath = `${OUTPUT_DIR}/${path}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  console.log(`✓ ${outPath}`);
  console.log(`  Path:    /${path}`);
  console.log(`  Title:   ${data.h1}`);
  console.log(`  Intro:   ${data.intro ? data.intro.slice(0, 80) + '…' : '—'}`);
  console.log(`  Hero:    ${data.heroImage || '—'}`);

  if (push) {
    console.log(`\n▸ Pushing${publish ? ' + publish + index' : ''}...`);
    const r = await pushToDA(path, outPath, { publish });
    if (r.ok) {
      console.log(`✓ Live: ${r.livePreview}`);
      if (publish && r.livePublished) console.log(`✓ Published + indexed`);
    } else {
      console.error(`✗ Push failed:`, r);
      process.exit(3);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
