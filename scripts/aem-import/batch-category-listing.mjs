#!/usr/bin/env node
/*
 * batch-category-listing.mjs — orchestrator for batch-migrating category
 * listing pages from both new + used family sitemaps.
 *
 * Walks both sitemaps, runs fill-category-listing per URL in a shared-browser
 * worker pool, pushes + publishes + indexes each page.
 *
 * Usage:
 *   node batch-category-listing.mjs                    # full batch (new + used)
 *   node batch-category-listing.mjs --new-only
 *   node batch-category-listing.mjs --used-only
 *   node batch-category-listing.mjs --concurrency 3
 *   node batch-category-listing.mjs --limit 5
 *   node batch-category-listing.mjs --no-publish
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { extractCategory, renderDA, pagePath, pushToDA, config } from './fill-category-listing.mjs';

const SITEMAPS = {
  new: 'https://wheelercat.com/cat_new_machine_family-sitemap.xml',
  used: 'https://wheelercat.com/cat_used_machine_family-sitemap.xml',
};
const RESULTS_PATH = `${config.OUTPUT_DIR}/_batch-results.json`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '4'), 10);
const PUBLISH = !flag('no-publish');
const NEW_ONLY = flag('new-only');
const USED_ONLY = flag('used-only');
const RETRY_FAILED = flag('retry-failed');

function parseUrl(url) {
  const path = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
  const segs = path.split('/');
  if (segs[0] === 'new' && segs[1] === 'machines') {
    return { section: 'new', categorySlug: segs[2] };
  }
  if (segs[0] === 'used-equipment') {
    return { section: 'used', categorySlug: segs[1] };
  }
  return null;
}

async function getJobs() {
  const jobs = [];
  for (const [section, url] of Object.entries(SITEMAPS)) {
    if (NEW_ONLY && section !== 'new') continue;
    if (USED_ONLY && section !== 'used') continue;
    const xml = await (await fetch(url)).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(m => m[1])
      .filter(u => !u.includes('%'));
    urls.forEach((u) => {
      const parsed = parseUrl(u);
      if (parsed) jobs.push({ ...parsed, sourceUrl: u });
    });
  }
  return [...new Map(jobs.map(j => [`${j.section}/${j.categorySlug}`, j])).values()];
}

async function processJob(job, browser) {
  try {
    const data = await extractCategory(job.section, job.categorySlug, browser);
    if (!data.ok) return { ...job, ok: false, phase: 'extract', error: data.error };

    const html = renderDA(data);
    const path = pagePath(data);
    const outPath = `${config.OUTPUT_DIR}/${path}.html`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);

    const push = await pushToDA(path, outPath, { publish: PUBLISH });
    if (!push.ok) return { ...job, path, ok: false, phase: push.phase || 'push', ...push };

    return { ...job, path, ok: true, livePreview: push.livePreview, published: push.livePublished, hasIntro: !!data.intro, hasHero: !!data.heroImage };
  } catch (e) {
    return { ...job, ok: false, phase: 'unhandled', error: e.message };
  }
}

async function runPool(jobs, concurrency) {
  const browser = await chromium.launch({ headless: true });
  const queue = [...jobs];
  const results = [];
  const total = jobs.length;
  let processed = 0;

  const tick = (r) => {
    processed += 1;
    const status = r.ok ? '✓' : '✗';
    const label = r.path || `${r.section}/${r.categorySlug}`;
    const tail = r.ok ? `  intro:${r.hasIntro ? 'Y' : '—'} hero:${r.hasHero ? 'Y' : '—'}` : `  — ${r.phase || '?'}: ${r.error || ''}`;
    console.log(`  [${processed}/${total}] ${status} ${label}${tail}`);
  };

  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      const r = await processJob(job, browser);
      results.push(r);
      tick(r);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.close();
  return results;
}

async function main() {
  console.log('▸ Walking family sitemaps...');
  let jobs = await getJobs();
  console.log(`  Found ${jobs.length} category-listing URLs`);

  if (RETRY_FAILED) {
    const prev = existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) : { results: [] };
    const failed = new Set(prev.results.filter(r => !r.ok).map(r => `${r.section}/${r.categorySlug}`));
    jobs = jobs.filter(j => failed.has(`${j.section}/${j.categorySlug}`));
    console.log(`  Retry mode: ${jobs.length} previously-failed jobs`);
  }

  if (LIMIT > 0) {
    jobs = jobs.slice(0, LIMIT);
    console.log(`  Limit: ${jobs.length}`);
  }

  if (!jobs.length) { console.log('  Nothing to do.'); return; }

  console.log(`\n▸ Processing ${jobs.length} at concurrency=${CONCURRENCY}${PUBLISH ? ' (publish + index)' : ''}...`);
  const startedAt = Date.now();
  const results = await runPool(jobs, CONCURRENCY);
  const elapsed = Math.round((Date.now() - startedAt) / 1000);

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n▸ Done in ${elapsed}s. ${ok} success, ${fail} failed.`);

  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({
    _provenance: { writtenBy: 'batch-category-listing.mjs', writtenAt: new Date().toISOString(), elapsedSeconds: elapsed },
    summary: { total: results.length, ok, fail },
    results,
  }, null, 2));
  console.log(`  Results: ${RESULTS_PATH}`);

  if (fail) {
    console.log(`\n  Failed (${fail}):`);
    results.filter(r => !r.ok).slice(0, 10).forEach(r => console.log(`    ${r.phase}: ${r.section}/${r.categorySlug} — ${r.error || ''}`));
  }
}

main();
