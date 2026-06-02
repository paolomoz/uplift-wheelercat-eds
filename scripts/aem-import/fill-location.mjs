#!/usr/bin/env node
/*
 * fill-location.mjs — extract Wheeler branch location pages from
 * wheelercat.com/about/locations/<slug>/ and render as DA pages.
 *
 * Usage:
 *   node fill-location.mjs <slug>                  # cedar-city
 *   node fill-location.mjs <slug> --push --publish
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const THEME = 'wheelercat-equipment-new-v2';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';
const OUTPUT_DIR = `${STARDUST_ROOT}/stardust/aem-import-out/locations`;
const DA_ORG = 'paolomoz';
const DA_REPO = 'uplift-wheelercat-eds';
const EDS_PREVIEW = `https://main--${DA_REPO}--${DA_ORG}.aem.page`;

const escapeHTML = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    const text = main.innerText;
    const h1 = document.querySelector('h1')?.textContent?.trim();
    // Address: number + street keyword + UT + zip
    const address = text.match(/\d{2,5}\s+[NSEW]?\.?\s*[A-Z][\w ]+(?:Street|Road|Highway|Hwy|Ave|Avenue|Drive|Blvd|Way|Ln|Pkwy)[^,\n]*,?\s*[A-Z][a-zA-Z\s]*,\s*UT\s*\d{5}/)?.[0];
    // Branch phone: prefer one that's NOT 801-436-3672 (the HQ number)
    const allPhones = [...text.matchAll(/\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g)].map(m => `${m[1]}-${m[2]}-${m[3]}`);
    const branchPhone = allPhones.find(p => p !== '801-436-3672') || allPhones[0];
    // Hours
    const hoursMatch = text.match(/(Monday|Mon)[^.\n]{5,80}/i);
    const hours = hoursMatch?.[0]?.replace(/\s{2,}.*/, '').trim();
    // About paragraphs (substantive prose; exclude chrome/footer-y text)
    const paragraphs = Array.from(main.querySelectorAll('p'))
      .map(p => p.textContent.trim().replace(/\s+/g, ' '))
      .filter(t => t.length > 80 && t.length < 800 && !/\bSitemap\b|\bCopyright\b|\bCampbell Company\b/.test(t));
    return { h1, address, branchPhone, hours, paragraphs: paragraphs.slice(0, 6) };
  });
  await page.close();
  return { ok: true, ...data, _provenance: { url, httpStatus, fetchedAt: new Date().toISOString() } };
}

export function validateSlots(data) {
  const missing = [];
  if (!data.h1) missing.push('h1');
  return missing;
}

export function pagePath(slug) { return `about/locations/${slug}`; }

export function renderDA(data, slug) {
  const city = data.h1 || '';
  const addrParts = data.address ? data.address.split(',').map(s => s.trim()) : [];
  const addrLine1 = addrParts[0] || '';
  const addrLine2 = addrParts.length > 1 ? addrParts.slice(1).join(', ') : '';
  const mapsHref = data.address ? `https://maps.google.com/?q=${encodeURIComponent(data.address)}` : '';
  const phone = data.branchPhone || '801-436-3672';
  const phoneHref = phone.replace(/-/g, '');

  const aboutBlocks = data.paragraphs.map(p => `        <p>${escapeHTML(p)}</p>`).join('\n');

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
        <p>Wheeler Branch</p>
        <h1>${escapeHTML(city.toUpperCase())}</h1>
        ${data.address ? `<p>Located at ${escapeHTML(addrLine1)} in ${escapeHTML(addrParts[1] || '')}. Stop by or call the local team for equipment sales, rentals, parts, and service.</p>` : `<p>Wheeler Machinery Co. branch serving the local community with equipment sales, rentals, parts, and service.</p>`}
      </div>
    </div>
  </div>

  <div class="cards services">
    ${data.address ? `<div>
      <div>
        <h3>Address</h3>
        <p><strong><a href="${escapeHTML(mapsHref)}">${escapeHTML(addrLine1)}<br>${escapeHTML(addrLine2)}</a></strong></p>
      </div>
    </div>` : ''}
    <div>
      <div>
        <h3>Phone</h3>
        <p><strong><a href="tel:${escapeHTML(phoneHref)}">(${phone.slice(0,3)}) ${phone.slice(4,7)}-${phone.slice(8)}</a></strong></p>
      </div>
    </div>
    ${data.hours ? `<div>
      <div>
        <h3>Hours</h3>
        <p><strong>${escapeHTML(data.hours)}</strong></p>
      </div>
    </div>` : ''}
    ${mapsHref ? `<div>
      <div>
        <h3><a href="${escapeHTML(mapsHref)}">Get Directions</a></h3>
        <p><strong><a href="${escapeHTML(mapsHref)}">Open in Google Maps</a></strong></p>
      </div>
    </div>` : ''}
  </div>

</div>

<div>

  <div class="text centered">
    <div>
      <div>
        <p>What We Offer</p>
        <h2>Services at This Branch</h2>
      </div>
    </div>
  </div>

  <div class="cards services">
    <div>
      <div>
        <h3><a href="/new">Equipment Sales</a></h3>
        <p><strong><a href="/new">New &amp; Used Cat® Machines</a></strong></p>
      </div>
    </div>
    <div>
      <div>
        <h3><a href="/rental">Equipment Rental</a></h3>
        <p><strong><a href="/rental">Daily, Weekly &amp; Monthly</a></strong></p>
      </div>
    </div>
    <div>
      <div>
        <h3><a href="/parts">Genuine Cat® Parts</a></h3>
        <p><strong><a href="/parts">In-Stock &amp; Quick-Ship</a></strong></p>
      </div>
    </div>
    <div>
      <div>
        <h3><a href="/service">Service &amp; Repair</a></h3>
        <p><strong><a href="/service">Field, Shop &amp; Maintenance</a></strong></p>
      </div>
    </div>
  </div>

  <div class="section-metadata">
    <div>
      <div>style</div>
      <div>warm-stone</div>
    </div>
  </div>

</div>

${data.paragraphs.length ? `<div>

  <div class="text centered">
    <div>
      <div>
        <p>About This Branch</p>
        <h2>Wheeler Machinery Co. — ${escapeHTML(city)} Branch</h2>
${aboutBlocks}
      </div>
    </div>
  </div>

</div>` : ''}

<div>

  <div class="cta-bar triple">
    <div>
      <div>
        <h2>Need help today?</h2>
        <p><strong><a href="tel:${escapeHTML(phoneHref)}">Call This Branch</a></strong></p>
        <p><em><a href="/quotes">Request a Quote</a></em></p>
        <p><em><a href="/about/locations">All Locations</a></em></p>
      </div>
    </div>
  </div>

  <div class="section-metadata">
    <div>
      <div>style</div>
      <div>dark</div>
    </div>
  </div>

</div>

<div>

  <div class="metadata">
    <div>
      <div>title</div>
      <div>${escapeHTML(city)} Branch — Wheeler Machinery Co.</div>
    </div>
    <div>
      <div>description</div>
      <div>${escapeHTML(`Wheeler Machinery Co. ${city} branch. ${data.address || ''} Cat® equipment sales, rentals, parts, and service.`.replace(/\s+/g, ' ').trim().slice(0, 200))}</div>
    </div>
    <div>
      <div>template</div>
      <div>${THEME}</div>
    </div>
    <div>
      <div>pageType</div>
      <div>location</div>
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
  if (!args.length) { console.error('Usage: node fill-location.mjs <slug> [--push] [--publish]'); process.exit(1); }
  const slug = args[0];
  const url = `https://wheelercat.com/about/locations/${slug}/`;
  const browser = await chromium.launch({ headless: true });
  const data = await extractPage(url, browser);
  await browser.close();
  if (!data.ok) { console.error('extract:', data); process.exit(1); }
  const html = renderDA(data, slug);
  const outPath = `${OUTPUT_DIR}/${slug}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`✓ ${outPath}`, JSON.stringify({ city: data.h1, address: data.address, phone: data.branchPhone, paras: data.paragraphs.length }));
  if (args.includes('--push')) {
    const r = await pushToDA(pagePath(slug), outPath, { publish: args.includes('--publish') });
    console.log(JSON.stringify(r));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
