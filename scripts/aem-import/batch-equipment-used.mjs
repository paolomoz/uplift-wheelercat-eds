#!/usr/bin/env node
/*
 * batch-equipment-used.mjs — orchestrator for batch-migrating the
 * 1,001 used-equipment pages from wheelercat.com to EDS.
 *
 * Walks the cat_used_machine sitemap, calls fill-equipment-used per
 * URL (in-process, shared Playwright browser), pushes to DA + triggers
 * preview, captures successes + failures.
 *
 * Usage:
 *   node batch-equipment-used.mjs                    # full batch
 *   node batch-equipment-used.mjs --limit 10         # first 10 only (dry-run)
 *   node batch-equipment-used.mjs --concurrency 3    # tune parallelism (default 5)
 *   node batch-equipment-used.mjs --skip-existing    # skip pages already in output dir
 *   node batch-equipment-used.mjs --retry-failed     # re-run only previous failures
 *
 * Idempotent: re-running for the same URL just re-PUTs the same content.
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { extractPage, validateSlots, renderDA, pushToDA, config } from './fill-equipment-used.mjs';

const SITEMAP_URL = 'https://wheelercat.com/cat_used_machine-sitemap.xml';
const RESULTS_PATH = `${config.OUTPUT_DIR}/_batch-results.json`;

/* Parse CLI flags */
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '5'), 10);
const SKIP_EXISTING = flag('skip-existing');
const RETRY_FAILED = flag('retry-failed');

/* ─────────── Sitemap fetch ─────────── */
async function getSitemapUrls() {
  const resp = await fetch(SITEMAP_URL);
  if (!resp.ok) throw new Error(`Sitemap fetch failed: ${resp.status}`);
  const xml = await resp.text();
  const urls = [...xml.matchAll(/<loc>(https:\/\/wheelercat\.com\/used-equipment\/[^<]+)<\/loc>/g)]
    .map(m => m[1])
    .filter(u => !u.includes('%')); // skip WordPress placeholder URLs
  return [...new Set(urls)];
}

/* ─────────── Single-page processing (in-process, shared browser) ─────────── */
async function processUrl(url, browser) {
  try {
    const data = await extractPage(url, browser);
    if (!data.ok) return { url, ok: false, phase: 'extract', error: data.error, message: data.message };

    const missing = validateSlots(data);
    if (missing.length) return { url, ok: false, phase: 'validate', error: 'missing-slots', missing };

    const html = renderDA(data);
    const outPath = `${config.OUTPUT_DIR}/${data.unitSlug}.html`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);

    const push = await pushToDA(data.unitSlug, outPath);
    if (!push.ok) return { url, slug: data.unitSlug, ok: false, phase: push.phase || 'push', ...push };

    return { url, slug: data.unitSlug, ok: true, livePreview: push.livePreview, fields: { hours: data.hours, price: data.price, features: data.features.length, images: data.images.length } };
  } catch (e) {
    return { url, ok: false, phase: 'unhandled', error: e.message };
  }
}

/* ─────────── Worker pool ─────────── */
async function runPool(urls, concurrency) {
  const browser = await chromium.launch({ headless: true });
  const queue = [...urls];
  const results = [];
  const total = urls.length;
  let processed = 0;

  const tick = (r) => {
    processed += 1;
    const status = r.ok ? '✓' : '✗';
    const label = r.slug || (r.url ? r.url.split('/').slice(-2, -1)[0] : '?');
    console.log(`  [${processed}/${total}] ${status} ${label}${r.ok ? '' : '  — ' + (r.phase || '?') + ': ' + (r.error || '')}`);
  };

  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      const r = await processUrl(url, browser);
      results.push(r);
      tick(r);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.close();
  return results;
}

/* ─────────── Main ─────────── */
async function main() {
  console.log('▸ Fetching sitemap...');
  let urls = await getSitemapUrls();
  console.log(`  Found ${urls.length} used-equipment URLs`);

  if (RETRY_FAILED) {
    const prev = existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) : { results: [] };
    const failed = prev.results.filter(r => !r.ok).map(r => r.url);
    urls = urls.filter(u => failed.includes(u));
    console.log(`  Retry mode: ${urls.length} previously-failed URLs`);
  }

  if (SKIP_EXISTING) {
    const before = urls.length;
    urls = urls.filter(u => {
      const slug = u.split('/').filter(Boolean).pop();
      return !existsSync(`${config.OUTPUT_DIR}/${slug}.html`);
    });
    console.log(`  Skip-existing: ${before - urls.length} pages already in output dir, ${urls.length} to process`);
  }

  if (LIMIT > 0) {
    urls = urls.slice(0, LIMIT);
    console.log(`  Limit: processing first ${urls.length} only`);
  }

  if (!urls.length) { console.log('  Nothing to do.'); return; }

  console.log(`\n▸ Processing ${urls.length} pages at concurrency=${CONCURRENCY}...`);
  const startedAt = Date.now();
  const results = await runPool(urls, CONCURRENCY);
  const elapsed = Math.round((Date.now() - startedAt) / 1000);

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n▸ Done in ${elapsed}s. ${ok} success, ${fail} failed.`);

  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({
    _provenance: { writtenBy: 'batch-equipment-used.mjs', writtenAt: new Date().toISOString(), elapsedSeconds: elapsed, concurrency: CONCURRENCY, limit: LIMIT },
    summary: { total: results.length, ok, fail },
    results,
  }, null, 2));
  console.log(`  Results: ${RESULTS_PATH}`);

  if (fail) {
    console.log(`\n  Failed (${fail}):`);
    results.filter(r => !r.ok).slice(0, 10).forEach(r => console.log(`    ${r.phase}: ${r.url}`));
    if (fail > 10) console.log(`    ...+${fail - 10} more`);
    console.log(`\n  Re-run failures: node batch-equipment-used.mjs --retry-failed`);
  }
}

main();
