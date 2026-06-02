#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { extractPage, renderDA, pushToDA, pagePath, config } from './fill-location.mjs';

const SITEMAP = 'https://wheelercat.com/location-sitemap.xml';
const RESULTS_PATH = `${config.OUTPUT_DIR}/_batch-results.json`;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };

const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '3'), 10);
const PUBLISH = !flag('no-publish');
const SKIP_DROPBOX = !flag('include-dropbox'); // drop-box pickup points are slim — skip by default

async function getJobs() {
  const xml = await (await fetch(SITEMAP)).text();
  let urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (SKIP_DROPBOX) urls = urls.filter(u => !/drop-box|store-pickup/i.test(u));
  return urls.map(url => {
    const slug = url.replace(/\/$/, '').split('/').pop();
    return { url, slug };
  });
}

async function processJob(job, browser) {
  try {
    const data = await extractPage(job.url, browser);
    if (!data.ok) return { ...job, ok: false, phase: 'extract', error: data.error };
    if (!data.h1) return { ...job, ok: false, phase: 'validate', error: 'no h1' };
    const html = renderDA(data, job.slug);
    const outPath = `${config.OUTPUT_DIR}/${job.slug}.html`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    const push = await pushToDA(pagePath(job.slug), outPath, { publish: PUBLISH });
    if (!push.ok) return { ...job, ok: false, phase: push.phase || 'push' };
    return { ...job, ok: true, path: pagePath(job.slug), city: data.h1, hasAddress: !!data.address, hasHours: !!data.hours, paras: data.paragraphs.length };
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
    const label = r.path || r.slug;
    const tail = r.ok ? `  ${r.city}  addr:${r.hasAddress ? 'Y' : '—'} hrs:${r.hasHours ? 'Y' : '—'}` : `  — ${r.phase}: ${r.error || ''}`;
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
  console.log('▸ Walking location-sitemap...');
  let jobs = await getJobs();
  console.log(`  Found ${jobs.length} location URLs${SKIP_DROPBOX ? ' (excluding drop-box pickup points)' : ''}`);
  if (LIMIT > 0) jobs = jobs.slice(0, LIMIT);
  if (!jobs.length) return;
  console.log(`\n▸ Processing ${jobs.length} at concurrency=${CONCURRENCY}${PUBLISH ? ' (publish + index)' : ''}...`);
  const t0 = Date.now();
  const results = await runPool(jobs, CONCURRENCY);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const ok = results.filter(r => r.ok).length;
  console.log(`\n▸ Done in ${elapsed}s. ${ok} success, ${results.length - ok} failed.`);
  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({ _provenance: { writtenBy: 'batch-location.mjs', writtenAt: new Date().toISOString(), elapsedSeconds: elapsed }, summary: { total: results.length, ok, fail: results.length - ok }, results }, null, 2));
}

main();
