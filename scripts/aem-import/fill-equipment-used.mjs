#!/usr/bin/env node
/*
 * fill-equipment-used.mjs — verbatim-at-scale fill script for the
 * equipment-detail-used template (1,001 pages on wheelercat.com).
 *
 * Pure mechanical mapping — NO LLM at fill time. Reads a slug,
 * fetches the live wheelercat.com page via Playwright, extracts
 * captured-verbatim content via regex + DOM queries, emits DA-ready
 * HTML matching the wheelercat-equipment-used-v2 template's slot map.
 *
 * Usage:
 *   node fill-equipment-used.mjs <slug>
 *   node fill-equipment-used.mjs <slug> --push    (also PUT to DA + preview)
 *
 * <slug> is the captured page snapshot slug:
 *   used-equipment__track-excavators__2022-cat-304-c3-tha
 * The script derives the live URL by reversing the slug-to-path mapping.
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

const TEMPLATE_NAME = 'equipment-detail-used';
const THEME = 'wheelercat-equipment-used-v2';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';
const OUTPUT_DIR = `${STARDUST_ROOT}/stardust/aem-import-out/equipment-used`;
const DA_ORG = 'paolomoz';
const DA_REPO = 'uplift-wheelercat-eds';
const EDS_PREVIEW = `https://main--${DA_REPO}--${DA_ORG}.aem.page`;

/* ─────────── Helpers ─────────── */
function escapeHTML(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(s) {
  return s.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* ─────────── Extraction ─────────── */
export async function extractPage(url, browser) {
  const page = await browser.newPage();
  const startedAt = Date.now();
  let httpStatus = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    httpStatus = resp?.status() || null;
  } catch (e) {
    await page.close();
    return { ok: false, error: 'goto-failed', message: e.message };
  }

  // Scroll to trigger lazy-loads
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250));
    }
  });

  const data = await page.evaluate(() => {
    // Locate the flexbox content block (wheelercat used-equipment pattern)
    const flexbox = document.querySelector('.flexbox') || document.querySelector('main') || document.body;
    const text = flexbox.innerText || '';

    const h1 = document.querySelector('h1')?.textContent?.trim() || null;
    const price = text.match(/Price:\s*\$([\d,]+(?:\.\d{2})?)/)?.[1] || null;
    const hours = text.match(/Hours\s*\n+\s*([\d,]+)/)?.[1] || null;
    const serial = text.match(/Serial(?:\s*Num)?\s*\n+\s*([\w\d\-]+)/)?.[1] || null;
    const rating = text.match(/Rating\s*\n+\s*([\w\-\/\s]+?)\s*\n/)?.[1]?.trim() || null;
    const location = text.match(/Location\s*\n+\s*([^\n]+?)\s*\n/)?.[1]?.trim() || null;
    const usedHotline = text.match(/Used Hotline\s*\n+\s*([\w\d\-\/\s\(\)]+?)\s*\n/)?.[1]?.trim() || 'N/A';

    // Features — text between "FEATURES" heading and the next action label
    const features = [];
    const featuresMatch = text.match(/FEATURES\s*([\s\S]+?)(?:REQUEST A QUOTE|ORDER PARTS|REQUEST SERVICE|$)/);
    if (featuresMatch) {
      featuresMatch[1].split('\n').forEach((line) => {
        const trimmed = line.trim().replace(/^\*/, '').trim();
        if (trimmed && trimmed.length > 2 && trimmed.length < 90 && !trimmed.match(/^[A-Z\s]{3,}$/)) {
          features.push(trimmed);
        }
      });
    }

    // Images — captured product photos (filter logos, banners, CTAs)
    const seen = new Set();
    const images = Array.from(document.querySelectorAll('img'))
      .map(i => ({ src: i.currentSrc || i.src, alt: i.alt || '', w: i.naturalWidth, h: i.naturalHeight }))
      .filter(i => i.src && i.src.includes('wp-content/uploads'))
      .filter(i => i.w >= 240 && i.h >= 180)
      .filter(i => !i.src.match(/contact-banner|cta-|banner-/i))
      .filter(i => { if (seen.has(i.src)) return false; seen.add(i.src); return true; })
      .sort((a, b) => b.w * b.h - a.w * a.h);

    // Category from URL path
    const pathSegs = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    const category = pathSegs[1] ? pathSegs[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
    const categorySlug = pathSegs[1] || null;
    const unitSlug = pathSegs[pathSegs.length - 1] || null;

    return { h1, price, hours, serial, rating, location, usedHotline, features, images, category, categorySlug, unitSlug };
  });

  await page.close();
  return {
    ok: true,
    _provenance: { url, httpStatus, fetchedAt: new Date().toISOString(), waitMs: Date.now() - startedAt },
    ...data,
  };
}

/* ─────────── Slot validation ─────────── */
export function validateSlots(data) {
  const missing = [];
  if (!data.h1) missing.push('h1');
  if (!data.unitSlug) missing.push('unitSlug');
  if (!data.images?.length) missing.push('images');
  return missing;
}

/* ─────────── DA HTML render (pure interpolation, no LLM) ─────────── */
export function renderDA(data) {
  const slug = data.unitSlug;
  const mainImg = data.images[0]?.src;
  const galleryImgs = data.images.slice(1, 13); // up to 12 thumbs

  const breadcrumb = `<div>
  <div class="breadcrumb">
    <div>
      <div>
        <p><a href="/">Home</a><em>›</em><a href="/used-equipment/">Used Equipment</a><em>›</em><a href="/used-equipment/${data.categorySlug}/">${escapeHTML(data.category)}</a><em>›</em>${escapeHTML(data.h1)}</p>
      </div>
    </div>
  </div>
</div>`;

  const specsItems = [];
  if (data.hours) specsItems.push(`<dt>Hours</dt><dd>${escapeHTML(data.hours)}</dd>`);
  if (data.serial) specsItems.push(`<dt>Serial</dt><dd>${escapeHTML(data.serial)}</dd>`);
  if (data.rating) specsItems.push(`<dt>Rating</dt><dd>${escapeHTML(data.rating)}</dd>`);
  if (data.location) specsItems.push(`<dt>Location</dt><dd>${escapeHTML(data.location)}</dd>`);
  if (data.usedHotline && data.usedHotline !== 'N/A') specsItems.push(`<dt>Used Hotline</dt><dd>${escapeHTML(data.usedHotline)}</dd>`);

  const hero = `<div>
  <div class="hero listing">
    <div>
      <div>
        <h1>${escapeHTML(data.h1)}</h1>
        <p><em><a href="javascript:window.print()">Print</a></em> <em><a href="#share">Share</a></em></p>
        ${data.price ? `<p><strong>$${escapeHTML(data.price)}</strong></p>` : ''}
        ${specsItems.length ? `<dl class="specs-inline">${specsItems.join('')}</dl>` : ''}
        <p><strong><a href="/request-quote/?unit=${escapeHTML(slug)}">Request a Quote</a></strong></p>
      </div>
      <div>
        ${mainImg ? `<picture><img src="${escapeHTML(mainImg)}" alt="${escapeHTML(data.h1)} — primary view"></picture>` : ''}
      </div>
    </div>
  </div>
</div>`;

  const gallery = galleryImgs.length ? `<div>
  <div class="text centered">
    <div>
      <div>
        <p>Media Gallery</p>
        <h2>Photos &amp; Walk-around</h2>
      </div>
    </div>
  </div>
  <div class="cards gallery">
${galleryImgs.map((img, i) => `    <div>
      <div><picture><img src="${escapeHTML(img.src)}" alt="View ${i + 1}"></picture></div>
    </div>`).join('\n')}
  </div>
</div>` : '';

  const features = data.features.length ? `<div>
  <div class="text">
    <div>
      <div>
        <p>Features</p>
        <h2>Features &amp; Equipment</h2>
      </div>
    </div>
  </div>
  <div class="features list">
    <div>
      <div>
        <ul>
${data.features.map(f => `          <li>${escapeHTML(f)}</li>`).join('\n')}
        </ul>
      </div>
    </div>
  </div>
  <div class="section-metadata">
    <div><div>style</div><div>warm-stone</div></div>
  </div>
</div>` : '';

  const ctaBar = `<div>
  <div class="cta-bar triple">
    <div>
      <div>
        <h2>Ready to move forward?</h2>
        <p><strong><a href="/request-quote/?unit=${escapeHTML(slug)}">Request a Quote</a></strong></p>
        <p><em><a href="/parts/">Order Parts</a></em></p>
        <p><em><a href="/request-service/">Request Service</a></em></p>
      </div>
    </div>
  </div>
  <div class="section-metadata">
    <div><div>style</div><div>dark</div></div>
  </div>
</div>`;

  const desc = `${data.h1}${data.hours ? ` with ${data.hours} hours` : ''}${data.location ? `, located in ${data.location}` : ''}. Request a quote from Wheeler Machinery Co.`;
  const metadata = `<div>
  <div class="metadata">
    <div><div>title</div><div>${escapeHTML(data.h1)} - Wheeler Machinery Co.</div></div>
    <div><div>description</div><div>${escapeHTML(desc)}</div></div>
    <div><div>template</div><div>${THEME}</div></div>
  </div>
</div>`;

  return `<body>
<header></header>
<main>

${breadcrumb}

${hero}

${gallery}

${features}

${ctaBar}

${metadata}

</main>
<footer></footer>
</body>
`;
}

/* ─────────── DA push (optional) ─────────── */
export async function pushToDA(slug, htmlPath) {
  const envPath = '/Users/paolo/stardust/uplift-wheelercat-eds/.env';
  const env = readFileSync(envPath, 'utf8');
  const token = env.match(/^DA_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!token) return { ok: false, error: 'no DA_TOKEN' };

  const daUrl = `https://admin.da.live/source/${DA_ORG}/${DA_REPO}/${slug}.html`;
  const putRes = await fetch(daUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: (() => {
      const fd = new FormData();
      fd.append('data', new Blob([readFileSync(htmlPath)], { type: 'text/html' }), `${slug}.html`);
      return fd;
    })(),
  });
  if (!putRes.ok) return { ok: false, phase: 'put', status: putRes.status, body: await putRes.text() };

  const previewUrl = `https://admin.hlx.page/preview/${DA_ORG}/${DA_REPO}/main/${slug}`;
  const previewRes = await fetch(previewUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!previewRes.ok) return { ok: false, phase: 'preview', status: previewRes.status };

  return { ok: true, livePreview: `${EDS_PREVIEW}/${slug}` };
}

export const config = { OUTPUT_DIR, EDS_PREVIEW, DA_ORG, DA_REPO };

/* ─────────── Main (CLI) ─────────── */
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node fill-equipment-used.mjs <slug> [--push]');
    process.exit(1);
  }
  const slug = args[0];
  const push = args.includes('--push');

  // Derive URL from slug (used-equipment__a__b → /used-equipment/a/b/)
  const path = slug.replace(/__/g, '/');
  const url = `https://wheelercat.com/${path}/`;

  console.log(`▸ Filling ${slug}`);
  console.log(`  Source: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const data = await extractPage(url, browser);
  await browser.close();

  if (!data.ok) {
    console.error(`✗ Extract failed: ${data.error}`, data.message);
    process.exit(1);
  }

  const missing = validateSlots(data);
  if (missing.length) {
    console.error(`✗ Missing required slots: ${missing.join(', ')}`);
    process.exit(2);
  }

  const html = renderDA(data);
  const outSlug = data.unitSlug;
  const outPath = `${OUTPUT_DIR}/${outSlug}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  console.log(`✓ ${outPath}`);
  console.log(`  Title:     ${data.h1}`);
  console.log(`  Price:     ${data.price ? '$' + data.price : '—'}`);
  console.log(`  Hours:     ${data.hours || '—'}`);
  console.log(`  Serial:    ${data.serial || '—'}`);
  console.log(`  Location:  ${data.location || '—'}`);
  console.log(`  Features:  ${data.features.length}`);
  console.log(`  Images:    ${data.images.length} unique`);

  if (push) {
    console.log(`\n▸ Pushing to DA + triggering preview...`);
    const result = await pushToDA(outSlug, outPath);
    if (result.ok) {
      console.log(`✓ Live: ${result.livePreview}`);
    } else {
      console.error(`✗ DA push failed:`, result);
      process.exit(3);
    }
  }
}

// Only run main when invoked directly (not when imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
