#!/usr/bin/env node
/*
 * fill-equipment-new.mjs — verbatim-at-scale fill script for the
 * equipment-detail-new template (249 Cat catalog pages on wheelercat.com).
 *
 * Pure mechanical mapping — NO LLM at fill time. Reads a slug,
 * fetches the live wheelercat.com page via Playwright, extracts
 * captured-verbatim content from Cat's nested-accordion spec tables,
 * emits DA-ready HTML matching the wheelercat-equipment-new-v2 template.
 *
 * Usage:
 *   node fill-equipment-new.mjs <slug>                  (extract + render only)
 *   node fill-equipment-new.mjs <slug> --push           (PUT to DA + preview + index)
 *   node fill-equipment-new.mjs <slug> --push --publish (also publish to live)
 *
 * <slug> is the URL path of the model, e.g.
 *   large-wheel-loaders/988-wheel-loader
 *   small-wheel-loaders/930-small-wheel-loader
 * The output slug is the model filename only (e.g. 988-wheel-loader).
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const THEME = 'wheelercat-equipment-new-v2';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';
const OUTPUT_DIR = `${STARDUST_ROOT}/stardust/aem-import-out/equipment-new`;
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
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    httpStatus = resp?.status() || null;
  } catch (e) {
    await page.close();
    return { ok: false, error: 'goto-failed', message: e.message };
  }

  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250));
    }
  });

  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || null;

    const pathSegs = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    const categorySlug = pathSegs[2] || null;
    const modelSlug = pathSegs[3] || null;
    const categoryLabel = categorySlug
      ? categorySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : null;

    // Hero image — largest scene7 image on the page
    const heroEl = Array.from(document.querySelectorAll('img'))
      .filter(i => i.src.includes('scene7') && i.naturalWidth >= 500)
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
    const heroImage = heroEl ? heroEl.src.replace(/wid=\d+&hei=\d+/, 'wid=916&hei=574') : null;

    // Spec value normalizer: clean Cat's awkward unit encoding.
    //   "1500/rpm" → "1500 rpm"  (digit-slash-letter)
    //   "5.4in"    → "5.4 in"   (digit-letter, missing space)
    //   "2104lbf·ft" → "2104 lbf·ft"
    // Leaves "mile/h", "lbf·ft", "in²" untouched.
    const cleanValue = (v) => v
      .replace(/(\d)\/([a-zA-Z])/g, '$1 $2')
      .replace(/(\d(?:[.,]\d+)?)([a-zA-Z])/g, '$1 $2')
      .replace(/\bm3\b/g, 'm³').replace(/\bin2\b/g, 'in²').replace(/\byd3\b/g, 'yd³').replace(/\bft3\b/g, 'ft³')
      .replace(/\s+/g, ' ')
      .trim();

    // Spec categories — inside the "Specifications" parent nested-accordion,
    // each direct-child nested-accordion is one category. Note (N) rows are
    // truncated disclaimers in Cat's HTML (data-english capped at 255 chars);
    // skipped here as they break the label/value rhythm.
    const specs = [];
    const specRoot = Array.from(document.querySelectorAll('.nested-accordion'))
      .find(el => el.querySelector(':scope > h3')?.textContent?.trim() === 'Specifications');
    if (specRoot) {
      specRoot.querySelectorAll(':scope > .comment > .nested-accordion').forEach((cat) => {
        const title = cat.querySelector(':scope > h3')?.textContent?.trim();
        if (!title) return;
        const rows = [];
        cat.querySelectorAll(':scope > .comment > ul > li').forEach((li) => {
          const p = li.querySelector('p');
          if (!p) return;
          const span = p.querySelector('span');
          const rawValue = (span?.getAttribute('data-english') || span?.textContent || '').trim();
          let label = p.textContent.replace(span?.textContent || '', '').trim();
          label = label.replace(/\s+/g, ' ');
          if (!label) return;
          if (/^Note\s*\(/i.test(label)) return; // skip truncated disclaimers
          rows.push({ label, value: cleanValue(rawValue) });
        });
        if (rows.length) specs.push({ title, rows });
      });
    }

    // Standard / Optional Equipment — separate top-level accordions outside Specifications
    const equipmentLists = {};
    ['Standard Equipment', 'Optional Equipment'].forEach((label) => {
      const acc = Array.from(document.querySelectorAll('.nested-accordion'))
        .find(el => el.querySelector(':scope > h3')?.textContent?.trim() === label);
      if (!acc) return;
      const sub = [];
      acc.querySelectorAll(':scope > .comment > .nested-accordion').forEach((cat) => {
        const groupTitle = cat.querySelector(':scope > h3')?.textContent?.trim();
        const items = [];
        cat.querySelectorAll(':scope > .comment > ul > li').forEach((li) => {
          const text = li.textContent.replace(/\s+/g, ' ').trim();
          if (text) items.push(text);
        });
        if (groupTitle && items.length) sub.push({ groupTitle, items });
      });
      // Some pages have flat lists with no group
      if (!sub.length) {
        const items = Array.from(acc.querySelectorAll(':scope > .comment ul > li'))
          .map(li => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (items.length) sub.push({ groupTitle: null, items });
      }
      equipmentLists[label] = sub;
    });

    // YouTube videos in main content
    const videos = Array.from(document.querySelectorAll('main a[href*="youtube"]'))
      .map((a) => {
        const ytMatch = a.href.match(/[?&]v=([^&]+)/) || a.href.match(/youtu\.be\/([^?]+)/);
        const id = ytMatch?.[1];
        return id ? {
          id,
          href: a.href,
          title: (a.textContent.trim() || a.querySelector('img')?.alt || 'Watch on YouTube').slice(0, 120),
          thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        } : null;
      })
      .filter(Boolean)
      .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
      .slice(0, 8);

    // Related Attachments — preserve per-page (3 typical)
    const relatedAttachments = [];
    const attachH = Array.from(document.querySelectorAll('h2, h3, h4'))
      .find(el => /related\s+attachments/i.test(el.textContent.trim()));
    if (attachH) {
      let node = attachH.nextElementSibling;
      let depth = 0;
      while (node && depth < 8 && relatedAttachments.length < 6) {
        node.querySelectorAll('a[href]').forEach((a) => {
          const img = a.querySelector('img');
          if (!img) return;
          if (relatedAttachments.find(x => x.href === a.href)) return;
          const nameRaw = a.textContent.trim().split(/\s{2,}|\n/)[0];
          const name = nameRaw && nameRaw.length > 3 ? nameRaw : (img.alt || '');
          if (!a.href || !img.src) return;
          relatedAttachments.push({ href: a.href, name, img: img.src });
        });
        node = node.nextElementSibling;
        depth++;
      }
    }

    return {
      h1, categorySlug, modelSlug, categoryLabel,
      heroImage,
      specs,
      equipmentLists,
      videos,
      relatedAttachments: relatedAttachments.slice(0, 3),
    };
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
  if (!data.modelSlug) missing.push('modelSlug');
  if (!data.categorySlug) missing.push('categorySlug');
  if (!data.heroImage) missing.push('heroImage');
  if (!data.specs?.length) missing.push('specs');
  return missing;
}

/* ─────────── Slug-to-relative-href rewrite ─────────── */
function rewriteHref(href) {
  // Strip wheelercat.com origin; keep path as-is for EDS routing.
  return href.replace(/^https?:\/\/wheelercat\.com/, '');
}

/* ─────────── DA HTML render (pure interpolation) ─────────── */
export function renderDA(data) {
  const slug = data.modelSlug;

  /* Hero / stat-strip key facts. Only rows whose value starts with a digit
     qualify (a stat strip needs monumental numbers, not "Cat® C18"). Picked
     in priority order from Engine + Operating Specifications + Hydraulic
     Cycle, taking the first 4 numeric matches. */
  const keyFactPriority = [
    'Engine Power',
    'Operating Weight',
    'Bucket Capacity',
    'Rated Payload',
    'Hydraulic Cycle',
    'Net Power',
    'Gross Power',
    'Peak Torque',
  ];
  const isNumeric = (v) => /^[\d.,\-–]/.test(v) && v.length < 30;
  const keyFacts = [];
  const candidateCats = data.specs.filter(c => /engine|operating|hydraulic|payload/i.test(c.title));
  keyFactPriority.forEach((name) => {
    if (keyFacts.length >= 4) return;
    for (const cat of candidateCats) {
      const row = cat.rows.find(r => r.label.toLowerCase().includes(name.toLowerCase()) && isNumeric(r.value));
      if (row && !keyFacts.find(k => k.matchedName === name)) {
        keyFacts.push({ matchedName: name, label: name.toUpperCase(), value: row.value });
        break;
      }
    }
  });

  const breadcrumb = `<div>
  <div class="breadcrumb"><div><div></div></div></div>
</div>`;

  const hero = `<div>
  <div class="hero listing">
    <div>
      <div>
        <h1>${escapeHTML(data.h1)}</h1>
        <p><em><a href="javascript:window.print()">Print</a></em> <em><a href="#share">Share</a></em></p>
        ${keyFacts.length ? `<ul>${keyFacts.map(k => `<li><p>${escapeHTML(k.label)}</p><p>${escapeHTML(k.value)}</p></li>`).join('')}</ul>` : ''}
        <p><strong><a href="/machine-quote-request/?model=${escapeHTML(slug)}">Request a Quote</a></strong></p>
      </div>
      <div>
        <picture><img src="${escapeHTML(data.heroImage)}" alt="${escapeHTML(data.h1)} — primary view"></picture>
      </div>
    </div>
  </div>
</div>`;

  /* At-a-glance stat strip — display tuning:
     - Strip any "(metric alternative)" parenthetical so the split works
     - Add thousands commas to bare integers >= 1000  (Cat's data-english is unformatted)
     - Restore m³ / in² superscripts that data-english renders as m3 / in2 */
  const formatStripValue = (raw) => {
    let v = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    v = v.replace(/m3\b/g, 'm³').replace(/in2\b/g, 'in²').replace(/yd3\b/g, 'yd³');
    return v;
  };
  const withCommas = (numStr) => {
    if (numStr.includes(',') || numStr.includes('.') || /[-–]/.test(numStr)) return numStr;
    const n = parseInt(numStr, 10);
    if (Number.isNaN(n) || n < 1000) return numStr;
    return n.toLocaleString('en-US');
  };
  const statRows = keyFacts.map((k) => {
    const cleaned = formatStripValue(k.value);
    const m = cleaned.match(/^([\d.,\-–]+)\s*(.*)$/);
    const num = withCommas(m ? m[1] : cleaned);
    const unit = m && m[2] ? m[2].trim() : '';
    return `    <div>
      <div><p>${escapeHTML(num)}${unit ? `<strong>${escapeHTML(unit)}</strong>` : ''}</p><p>${escapeHTML(k.matchedName)}</p></div>
    </div>`;
  });

  const statStripBlock = keyFacts.length ? `  <div class="specs at-a-glance">
${statRows.join('\n')}
  </div>
` : '';

  /* Accordions: emit <h3> + <ul> pairs only (no <details>/<summary> — block JS wraps them). */
  const accordionRows = data.specs.map((cat) => {
    const lis = cat.rows.map(r => `              <li><p>${escapeHTML(r.label)}</p><p>${escapeHTML(r.value)}</p></li>`).join('\n');
    return `    <div>
      <div>
        <h3>${escapeHTML(cat.title)}</h3>
        <ul>
${lis}
        </ul>
      </div>
    </div>`;
  });

  // Append Standard/Optional Equipment as accordion categories too
  Object.entries(data.equipmentLists).forEach(([label, groups]) => {
    if (!groups.length) return;
    const lis = groups.flatMap((g) => {
      if (g.groupTitle) return [`              <li><p>${escapeHTML(g.groupTitle)}</p><p>${escapeHTML(g.items.join(', '))}</p></li>`];
      return g.items.map((it) => `              <li><p>—</p><p>${escapeHTML(it)}</p></li>`);
    });
    accordionRows.push(`    <div>
      <div>
        <h3>${escapeHTML(label)}</h3>
        <ul>
${lis.join('\n')}
        </ul>
      </div>
    </div>`);
  });

  const accordionsBlock = `  <div class="specs accordions">
${accordionRows.join('\n')}
  </div>`;

  const specsSection = `<div>

  <div class="text centered">
    <div>
      <div>
        <p>Product Specifications</p>
        <h2>Specifications</h2>
      </div>
    </div>
  </div>

${statStripBlock}${accordionsBlock}

  <div class="section-metadata">
    <div>
      <div>style</div>
      <div>warm-stone specs-band</div>
    </div>
  </div>

</div>`;

  const gallerySection = data.videos.length ? `<div>

  <div class="text centered">
    <div>
      <div>
        <p>Media Gallery</p>
        <h2>Watch the ${escapeHTML((data.h1 || '').replace(/\s+wheel\s+loader/i, '').trim() || data.h1)} at Work</h2>
      </div>
    </div>
  </div>

  <div class="media gallery">
${data.videos.slice(0, 4).map(v => `    <div>
      <div><picture><img src="${escapeHTML(v.thumb)}" alt="${escapeHTML(v.title)}"></picture></div>
      <div><p><strong><a href="${escapeHTML(v.href)}">Watch on YouTube</a></strong></p></div>
    </div>`).join('\n')}
  </div>

</div>` : '';

  const attachmentsSection = data.relatedAttachments.length ? `<div>

  <div class="text centered">
    <div>
      <div>
        <p>Compatible Parts</p>
        <h2>Related Attachments</h2>
      </div>
    </div>
  </div>

  <div class="cards related">
${data.relatedAttachments.map(a => `    <div>
      <div><picture><img src="${escapeHTML(a.img)}" alt="${escapeHTML(a.name)}"></picture></div>
      <div>
        <h3><a href="${escapeHTML(rewriteHref(a.href))}">${escapeHTML(a.name)}</a></h3>
        <p><strong><a href="${escapeHTML(rewriteHref(a.href))}">View Details</a></strong></p>
      </div>
    </div>`).join('\n')}
  </div>

</div>` : '';

  const relatedProductsSection = `<div>

  <div class="text centered">
    <div>
      <div>
        <p>Compare Machines</p>
        <h2>Related Products</h2>
      </div>
    </div>
  </div>

  <div class="cards related dynamic">
    <div><div><p>(filled at render time from /query-index.json)</p></div></div>
  </div>

</div>`;

  const ctaBar = `<div>

  <div class="cta-bar triple">
    <div>
      <div>
        <h2>Ready to move forward?</h2>
        <p><strong><a href="/machine-quote-request/?model=${escapeHTML(slug)}">Request a Quote</a></strong></p>
        <p><em><a href="/parts/">Order Parts</a></em></p>
        <p><em><a href="/request-service/">Request Service</a></em></p>
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

  const desc = `Cat® ${data.h1}: ${keyFacts.slice(0, 3).map(k => `${k.value} ${k.matchedName.toLowerCase()}`).join(', ')}. Request a quote from Wheeler Machinery Co.`;

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
  </div>

</div>`;

  return `<body>
<header></header>
<main>

${breadcrumb}

${hero}

${specsSection}

${gallerySection ? gallerySection + '\n\n' : ''}${attachmentsSection ? attachmentsSection + '\n\n' : ''}${relatedProductsSection}

${ctaBar}

${metadata}

</main>
<footer></footer>
</body>
`;
}

/* ─────────── Path helper ─────────── */
// Mirror the source URL structure: /new/machines/<category>/<model>
export function pagePath(data) {
  return `new/machines/${data.categorySlug}/${data.modelSlug}`;
}

/* ─────────── DA push (PUT + preview + index) ─────────── */
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

  await new Promise(r => setTimeout(r, 1500));
  const previewRes = await fetch(`https://admin.hlx.page/preview/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
  if (!previewRes.ok) return { ok: false, phase: 'preview', status: previewRes.status };

  let livePublished = false;
  if (publish) {
    const liveRes = await fetch(`https://admin.hlx.page/live/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
    livePublished = liveRes.ok;
    await fetch(`https://admin.hlx.page/index/${DA_ORG}/${DA_REPO}/main/${pagePathStr}`, { method: 'POST', headers: auth });
  }

  return {
    ok: true,
    livePreview: `${EDS_PREVIEW}/${pagePathStr}`,
    livePublished,
  };
}

export const config = { THEME, OUTPUT_DIR, EDS_PREVIEW, DA_ORG, DA_REPO };

/* ─────────── Main (CLI) ─────────── */
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node fill-equipment-new.mjs <category-slug>/<model-slug> [--push] [--publish]');
    console.error('Example: node fill-equipment-new.mjs large-wheel-loaders/986-wheel-loader --push --publish');
    process.exit(1);
  }
  const subPath = args[0]; // e.g. large-wheel-loaders/986-wheel-loader
  const push = args.includes('--push');
  const publish = args.includes('--publish');
  const url = `https://wheelercat.com/new/machines/${subPath}/`;

  console.log(`▸ Filling ${subPath}`);
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
    console.error('Data captured:', JSON.stringify({ h1: data.h1, specs: data.specs?.length, heroImage: !!data.heroImage }, null, 2));
    process.exit(2);
  }

  const html = renderDA(data);
  const path = pagePath(data);
  const outPath = `${OUTPUT_DIR}/${path}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  console.log(`✓ ${outPath}`);
  console.log(`  Title:     ${data.h1}`);
  console.log(`  Path:      /${path}`);
  console.log(`  Specs:     ${data.specs.length} categories, ${data.specs.reduce((s, c) => s + c.rows.length, 0)} rows`);
  console.log(`  Videos:    ${data.videos.length}`);
  console.log(`  Attach:    ${data.relatedAttachments.length}`);

  if (push) {
    console.log(`\n▸ Pushing to DA + triggering preview${publish ? ' + publish + index' : ''}...`);
    const result = await pushToDA(path, outPath, { publish });
    if (result.ok) {
      console.log(`✓ Live: ${result.livePreview}`);
      if (publish && result.livePublished) console.log(`✓ Published to .live + indexed`);
    } else {
      console.error(`✗ DA push failed:`, result);
      process.exit(3);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
