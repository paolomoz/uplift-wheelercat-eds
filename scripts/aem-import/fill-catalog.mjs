#!/usr/bin/env node
/*
 * fill-catalog.mjs — sibling of fill-equipment-new that handles non-/machines/
 * Cat catalog pages: allied equipment, power systems, technology.
 *
 * These pages share the nested-accordion spec structure of /new/machines/<...>/
 * (when they're Cat-native — JLG/allied pages have lighter HTML), so the
 * extract/render logic is reused. Only difference is the URL pattern + the
 * pagePath we emit.
 *
 * Usage:
 *   node fill-catalog.mjs <url>                       # render-only
 *   node fill-catalog.mjs <url> --push --publish      # PUT + publish + index
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { extractPage, renderDA, validateSlots, pushToDA, config } from './fill-equipment-new.mjs';

// Parse the source URL to derive the DA path + category/model.
// All buckets follow /<section>/<sub>/<category>/<model> — 4 path segments.
//   /new/site-support/boom-lifts/1250ajp
//   /new/power-systems/well-service-engines/c9-acert-dry-manifold-engine
//   /technology/edge/cat-minestar-edge   (3 segments — section/category/model)
export function parseUrl(url) {
  const segs = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').split('/').filter(Boolean);
  if (segs[0] === 'technology' && segs.length === 3) {
    return { daPath: segs.join('/'), categorySlug: segs[1], modelSlug: segs[2], categoryLabel: titleCase(segs[1]) };
  }
  if (segs.length >= 4) {
    return { daPath: segs.join('/'), categorySlug: segs[2], modelSlug: segs[3], categoryLabel: titleCase(segs[2]) };
  }
  return null;
}

function titleCase(s) {
  return s.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function fillOne(url, browser, { publish = false } = {}) {
  const parsed = parseUrl(url);
  if (!parsed) return { url, ok: false, phase: 'parse-url', error: 'unrecognized-url-shape' };

  const data = await extractPage(url, browser);
  if (!data.ok) return { url, ok: false, phase: 'extract', error: data.error };

  // Override slugs from URL (extractPage assumes /new/machines/ structure)
  data.categorySlug = parsed.categorySlug;
  data.modelSlug = parsed.modelSlug;
  data.categoryLabel = parsed.categoryLabel;

  const missing = validateSlots(data);
  if (missing.length && missing.includes('heroImage')) {
    // Allied/tech pages sometimes lack a clean hero — proceed anyway
  }

  const html = renderDA(data)
    // renderDA hard-codes /new/machines/<cat>/ for category links; rewrite
    // to the actual path from the URL.
    .replace(new RegExp(`/new/machines/${parsed.categorySlug}/`, 'g'), `/${parsed.daPath.split('/').slice(0, -1).join('/')}/`);

  const outPath = `${config.OUTPUT_DIR}/${parsed.daPath}.html`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  const result = { url, path: parsed.daPath, ok: true, fields: { specs: data.specs.length, hero: !!data.heroImage, videos: data.videos.length } };

  const push = await pushToDA(parsed.daPath, outPath, { publish });
  if (!push.ok) return { ...result, ok: false, phase: push.phase, status: push.status };
  return { ...result, livePreview: push.livePreview, published: push.livePublished };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node fill-catalog.mjs <url> [--push] [--publish]');
    process.exit(1);
  }
  const url = args[0];
  const push = args.includes('--push');
  const publish = args.includes('--publish');
  const browser = await chromium.launch({ headless: true });
  const r = await fillOne(url, browser, { publish: push && publish });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
