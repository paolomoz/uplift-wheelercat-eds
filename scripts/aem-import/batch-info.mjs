#!/usr/bin/env node
/*
 * batch-info.mjs — walks page-sitemap.xml and migrates info pages.
 * Excludes paths already covered by other templates (hubs, listings,
 * detail pages, locations, catalogs). What's left is "info" pages —
 * industries, about/*, news/*, etc.
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { extractPage, renderDA, pushToDA, config } from './fill-info.mjs';

const SITEMAP = 'https://wheelercat.com/page-sitemap.xml';
const RESULTS_PATH = `${config.OUTPUT_DIR}/_batch-results.json`;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };

const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '3'), 10);
const PUBLISH = !flag('no-publish');

// Skip URLs covered by other templates / already migrated
const SKIP_PATTERNS = [
  /^https?:\/\/wheelercat\.com\/?$/,         // home (we have it)
  /\/new\//,                                  // catalogs
  /\/used-equipment\//,                       // used details
  /\/about\/locations\//,                     // locations
  /\/technology\//,                           // tech catalogs
  /\/industries\/$/,                          // industries hub itself (would be its own template)
  /\/service\/?$/,                            // /service hub
  /\/parts\/?$/,                              // /parts hub
  /\/rental\/?$/,                             // /rental hub
  /\/quotes\/?$/,                             // /quotes hub
  /\/request-service\/?$/,                    // /request-service hub
  /\/customer-value-agreements\/?$/,          // /cva hub
  /\/contact\/?$/,                            // would be its own template
  /\/cart\//,                                 // ecommerce
  /\/checkout\//,                             // ecommerce
  /\/my-account\//,                           // user
  /\/wp-/, /\/feed\//, /\.xml$/,              // wordpress junk
  /\/admin\//,                                // admin
  /\/login\/?$/, /\/logout\//,                // auth
];

async function getJobs() {
  const xml = await (await fetch(SITEMAP)).text();
  let urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  urls = urls.filter(u => !SKIP_PATTERNS.some(re => re.test(u)));
  urls = urls.filter(u => !u.includes('%') && !u.includes('?'));
  return urls.map(url => {
    const sourcePath = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
    return { url, sourcePath };
  });
}

async function processJob(job, browser) {
  try {
    const data = await extractPage(job.url, browser);
    if (!data.ok) return { ...job, ok: false, phase: 'extract', error: data.error };
    if (!data.h1) return { ...job, ok: false, phase: 'validate', error: 'no h1' };
    const html = renderDA(data, job.sourcePath);
    const outPath = `${config.OUTPUT_DIR}/${job.sourcePath}.html`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    const push = await pushToDA(job.sourcePath, outPath, { publish: PUBLISH });
    if (!push.ok) return { ...job, ok: false, phase: push.phase || 'push' };
    return { ...job, ok: true, path: job.sourcePath, h1: data.h1, headings: data.headings.length, paras: data.paragraphs.length };
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
    const label = r.path || r.sourcePath;
    const tail = r.ok ? `  paras:${r.paras} headings:${r.headings}` : `  — ${r.phase}: ${r.error || ''}`;
    console.log(`  [${processed}/${total}] ${status} ${label}${tail}`);
  };
  const worker = async () => {
    while (queue.length) {
      const j = queue.shift();
      const r = await processJob(j, browser);
      results.push(r);
      tick(r);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.close();
  return results;
}

async function main() {
  console.log('▸ Walking page-sitemap...');
  let jobs = await getJobs();
  console.log(`  Found ${jobs.length} info-page URLs (post-filter)`);
  if (LIMIT > 0) jobs = jobs.slice(0, LIMIT);
  if (!jobs.length) return;
  console.log(`\n▸ Processing ${jobs.length} at concurrency=${CONCURRENCY}${PUBLISH ? ' (publish + index)' : ''}...`);
  const t0 = Date.now();
  const results = await runPool(jobs, CONCURRENCY);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const ok = results.filter(r => r.ok).length;
  console.log(`\n▸ Done in ${elapsed}s. ${ok} success, ${results.length - ok} failed.`);
  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({ _provenance: { writtenBy: 'batch-info.mjs', writtenAt: new Date().toISOString(), elapsedSeconds: elapsed }, summary: { total: results.length, ok, fail: results.length - ok }, results }, null, 2));
}

main();
