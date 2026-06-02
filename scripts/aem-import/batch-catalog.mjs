#!/usr/bin/env node
/*
 * batch-catalog.mjs — walk allied/power/technology sitemaps and run
 * fill-catalog per URL in a worker pool.
 *
 * Usage:
 *   node batch-catalog.mjs                  # all 3 sitemaps
 *   node batch-catalog.mjs --only allied    # one sitemap
 *   node batch-catalog.mjs --concurrency 4
 *   node batch-catalog.mjs --limit 5        # smoke-test
 *   node batch-catalog.mjs --no-publish
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fillOne, parseUrl } from './fill-catalog.mjs';
import { config } from './fill-equipment-new.mjs';

const SITEMAPS = {
  allied:     'https://wheelercat.com/cat_new_allied-sitemap.xml',
  power:      'https://wheelercat.com/cat_new_power-sitemap.xml',
  technology: 'https://wheelercat.com/cat_new_technology-sitemap.xml',
};
const RESULTS_PATH = `${config.OUTPUT_DIR}/_batch-catalog-results.json`;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };

const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '4'), 10);
const PUBLISH = !flag('no-publish');
const ONLY = value('only', null);

async function getUrls() {
  const urls = [];
  for (const [name, sm] of Object.entries(SITEMAPS)) {
    if (ONLY && name !== ONLY) continue;
    try {
      const xml = await (await fetch(sm)).text();
      const found = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map(m => m[1])
        .filter(u => !u.includes('%') && !u.includes('__cat_type_slug')); // stale templates
      found.forEach(u => urls.push(u));
    } catch (e) { console.error(`sitemap ${sm} failed:`, e.message); }
  }
  return [...new Set(urls)];
}

async function runPool(urls, concurrency) {
  const browser = await chromium.launch({ headless: true });
  const queue = [...urls];
  const results = [];
  const total = urls.length;
  let processed = 0;
  const tick = (r) => {
    processed += 1;
    const status = r.ok ? '✓' : '✗';
    const label = r.path || r.url;
    const tail = r.ok ? `  ${r.fields?.specs || 0}cats  hero:${r.fields?.hero ? 'Y' : '—'}` : `  — ${r.phase}: ${r.error || ''}`;
    console.log(`  [${processed}/${total}] ${status} ${label}${tail}`);
  };
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const r = await fillOne(url, browser, { publish: PUBLISH });
        results.push(r);
        tick(r);
      } catch (e) {
        const r = { url, ok: false, phase: 'unhandled', error: e.message };
        results.push(r);
        tick(r);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.close();
  return results;
}

async function main() {
  console.log('▸ Walking allied/power/technology sitemaps...');
  let urls = await getUrls();
  // Drop unparseable
  urls = urls.filter(u => parseUrl(u));
  console.log(`  Found ${urls.length} usable URLs`);
  if (LIMIT > 0) { urls = urls.slice(0, LIMIT); console.log(`  Limit: ${urls.length}`); }
  if (!urls.length) { console.log('  Nothing.'); return; }

  console.log(`\n▸ Processing ${urls.length} at concurrency=${CONCURRENCY}${PUBLISH ? ' (publish + index)' : ''}...`);
  const t0 = Date.now();
  const results = await runPool(urls, CONCURRENCY);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const ok = results.filter(r => r.ok).length;
  console.log(`\n▸ Done in ${elapsed}s. ${ok} success, ${results.length - ok} failed.`);

  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({ _provenance: { writtenBy: 'batch-catalog.mjs', writtenAt: new Date().toISOString(), elapsedSeconds: elapsed }, summary: { total: results.length, ok, fail: results.length - ok }, results }, null, 2));
  console.log(`  Results: ${RESULTS_PATH}`);
}

main();
