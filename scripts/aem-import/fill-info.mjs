#!/usr/bin/env node
/*
 * fill-info.mjs — extract misc info pages from page-sitemap (industries,
 * about, news, etc.) and render as DA pages with a simple
 * hero + body-paragraphs + CTA layout.
 *
 * Usage:
 *   node fill-info.mjs <path>           # path = source-site path, e.g. "industries/heavy-construction"
 *   node fill-info.mjs <path> --push --publish
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const THEME = 'wheelercat-equipment-new-v2';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';
const OUTPUT_DIR = `${STARDUST_ROOT}/stardust/aem-import-out/info`;
const DA_ORG = 'paolomoz';
const DA_REPO = 'uplift-wheelercat-eds';
const EDS_PREVIEW = `https://main--${DA_REPO}--${DA_ORG}.aem.page`;

const escapeHTML = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const titleCase = (s) => s.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export async function extractPage(url, browser) {
  const page = await browser.newPage();
  let httpStatus = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    httpStatus = resp?.status() || null;
  } catch (e) { await page.close(); return { ok: false, error: 'goto-failed', message: e.message }; }
  await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,150));}});

  const data = await page.evaluate(() => {
    const main = document.querySelector('main, #main, .entry-content, article') || document.body;
    const h1 = document.querySelector('h1')?.textContent?.trim();
    const headings = Array.from(main.querySelectorAll('h2, h3')).map(h => ({ tag: h.tagName, text: h.textContent.trim() })).filter(x => x.text && x.text.length < 200);
    const paragraphs = Array.from(main.querySelectorAll('p'))
      .map(p => p.textContent.trim().replace(/\s+/g, ' '))
      .filter(t => t.length > 60 && t.length < 1500 && !/\bSitemap\b|\bCopyright\b|\bCampbell Company\b|All Rights Reserved/.test(t));
    // List items (for resource pages with bullets)
    const lists = Array.from(main.querySelectorAll('ul, ol'))
      .filter(ul => !ul.closest('header') && !ul.closest('footer') && !ul.closest('nav'))
      .map(ul => Array.from(ul.querySelectorAll('li')).map(li => li.textContent.trim().replace(/\s+/g, ' ')).filter(t => t.length > 2 && t.length < 300))
      .filter(arr => arr.length >= 2 && arr.length <= 30);
    const heroImg = Array.from(main.querySelectorAll('img'))
      .filter(i => (i.naturalWidth || 0) >= 500 && !/contact-banner|logo|icon|nav-|footer|gravatar/i.test(i.src))
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0]?.src;
    return { h1, headings, paragraphs: paragraphs.slice(0, 12), lists: lists.slice(0, 3), heroImg };
  });
  await page.close();
  return { ok: true, ...data, _provenance: { url, httpStatus, fetchedAt: new Date().toISOString() } };
}

export function renderDA(data, sourcePath) {
  const title = data.h1 || titleCase(sourcePath.split('/').pop());
  const segs = sourcePath.split('/').filter(Boolean);
  // Build breadcrumb trail from path segments (skip last — that's the current page)
  const crumbs = segs.slice(0, -1).map((seg, i) => {
    const href = '/' + segs.slice(0, i + 1).join('/');
    return `<a href="${escapeHTML(href)}">${escapeHTML(titleCase(seg))}</a><em>›</em>`;
  }).join('');

  const desc = (data.paragraphs[0] || '').slice(0, 200);

  // Build body sections by walking headings + interleaving paragraphs
  let bodySections = '';
  if (data.headings.length && data.paragraphs.length) {
    // First paragraph is intro (no preceding heading)
    bodySections = `<div>

  <div class="text centered">
    <div>
      <div>
        <p>About</p>
        <h2>${escapeHTML(data.headings[0]?.text || title)}</h2>
${data.paragraphs.slice(0, 3).map(p => `        <p>${escapeHTML(p)}</p>`).join('\n')}
      </div>
    </div>
  </div>

  <div class="section-metadata">
    <div><div>style</div><div>warm-stone</div></div>
  </div>

</div>`;
    // Additional sections if more headings exist
    data.headings.slice(1).forEach((h, idx) => {
      const paraStart = 3 + idx * 2;
      const para = data.paragraphs.slice(paraStart, paraStart + 2);
      if (!para.length) return;
      bodySections += `\n\n<div>

  <div class="text centered">
    <div>
      <div>
        <h2>${escapeHTML(h.text)}</h2>
${para.map(p => `        <p>${escapeHTML(p)}</p>`).join('\n')}
      </div>
    </div>
  </div>

</div>`;
    });
  } else if (data.paragraphs.length) {
    bodySections = `<div>

  <div class="text centered">
    <div>
      <div>
${data.paragraphs.map(p => `        <p>${escapeHTML(p)}</p>`).join('\n')}
      </div>
    </div>
  </div>

</div>`;
  }

  return `<body>
<header></header>
<main>

<div>
  <div class="breadcrumb"><div><div></div></div></div>
</div>

<div>

  <div class="text centered">
    <div>
      <div>
        <p>${escapeHTML(segs[0] ? titleCase(segs[0]) : 'Wheeler')}</p>
        <h1>${escapeHTML(title.toUpperCase())}</h1>
        ${data.paragraphs[0] ? `<p>${escapeHTML(data.paragraphs[0])}</p>` : ''}
      </div>
    </div>
  </div>

</div>

${bodySections}

<div>

  <div class="cta-bar triple">
    <div>
      <div>
        <h2>Questions about ${escapeHTML(title)}?</h2>
        <p><strong><a href="/contact">Contact Sales</a></strong></p>
        <p><em><a href="/quotes">Request a Quote</a></em></p>
        <p><em><a href="tel:801-436-3672">Call 801-436-3672</a></em></p>
      </div>
    </div>
  </div>

  <div class="section-metadata">
    <div><div>style</div><div>dark</div></div>
  </div>

</div>

<div>

  <div class="metadata">
    <div>
      <div>title</div>
      <div>${escapeHTML(title)} — Wheeler Machinery Co.</div>
    </div>
    <div>
      <div>description</div>
      <div>${escapeHTML(desc || `${title} — Wheeler Machinery Co.`)}</div>
    </div>
    <div>
      <div>template</div>
      <div>${THEME}</div>
    </div>
    <div>
      <div>pageType</div>
      <div>info</div>
    </div>
  </div>

</div>

</main>
<footer></footer>
</body>
`;
}

export async function pushToDA(pathStr, htmlPath, { publish = false } = {}) {
  const env = readFileSync('/Users/paolo/stardust/uplift-wheelercat-eds/.env', 'utf8');
  const token = env.match(/^DA_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!token) return { ok: false, error: 'no DA_TOKEN' };
  const auth = { Authorization: `Bearer ${token}` };
  const daUrl = `https://admin.da.live/source/${DA_ORG}/${DA_REPO}/${pathStr}.html`;
  const fd = new FormData();
  fd.append('data', new Blob([readFileSync(htmlPath)], { type: 'text/html' }), `${pathStr.split('/').pop()}.html`);
  const putRes = await fetch(daUrl, { method: 'PUT', headers: auth, body: fd });
  if (!putRes.ok) return { ok: false, phase: 'put', status: putRes.status };
  await new Promise(r => setTimeout(r, 1200));
  const previewRes = await fetch(`https://admin.hlx.page/preview/${DA_ORG}/${DA_REPO}/main/${pathStr}`, { method: 'POST', headers: auth });
  if (!previewRes.ok) return { ok: false, phase: 'preview', status: previewRes.status };
  let livePublished = false;
  if (publish) {
    const liveRes = await fetch(`https://admin.hlx.page/live/${DA_ORG}/${DA_REPO}/main/${pathStr}`, { method: 'POST', headers: auth });
    livePublished = liveRes.ok;
    await fetch(`https://admin.hlx.page/index/${DA_ORG}/${DA_REPO}/main/${pathStr}`, { method: 'POST', headers: auth });
  }
  return { ok: true, livePreview: `${EDS_PREVIEW}/${pathStr}`, livePublished };
}

export const config = { OUTPUT_DIR, DA_ORG, DA_REPO, EDS_PREVIEW };

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node fill-info.mjs <source-path> [--push] [--publish]'); process.exit(1); }
  const sourcePath = args[0].replace(/^\/+/, '').replace(/\/$/, '');
  const url = `https://wheelercat.com/${sourcePath}/`;
  const browser = await chromium.launch({ headless: true });
  const data = await extractPage(url, browser);
  await browser.close();
  if (!data.ok) { console.error('extract:', data); process.exit(1); }
  const html = renderDA(data, sourcePath);
  const outPath = `${OUTPUT_DIR}/${sourcePath}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`✓ ${outPath}`, JSON.stringify({ h1: data.h1, headings: data.headings.length, paras: data.paragraphs.length }));
  if (args.includes('--push')) {
    const r = await pushToDA(sourcePath, outPath, { publish: args.includes('--publish') });
    console.log(JSON.stringify(r));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
