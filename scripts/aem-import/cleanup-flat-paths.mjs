#!/usr/bin/env node
/*
 * cleanup-flat-paths.mjs — delete old flat-path pages from DA + preview + live
 * before re-batching at nested paths.
 *
 * Reads both templates' _batch-results.json to discover what slugs to delete.
 * For each slug:
 *   DELETE admin.da.live/source/<org>/<repo>/<slug>.html
 *   DELETE admin.hlx.page/preview/<org>/<repo>/main/<slug>
 *   DELETE admin.hlx.page/live/<org>/<repo>/main/<slug>
 *
 * Usage:
 *   node cleanup-flat-paths.mjs               # cleanup
 *   node cleanup-flat-paths.mjs --dry-run     # print intended deletions only
 */

import { readFileSync, existsSync } from 'fs';

const DA_ORG = 'paolomoz';
const DA_REPO = 'uplift-wheelercat-eds';
const STARDUST_ROOT = '/Users/paolo/stardust/uplift-wheelercat';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = 6;

const envPath = '/Users/paolo/stardust/uplift-wheelercat-eds/.env';
const env = readFileSync(envPath, 'utf8');
const token = env.match(/^DA_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) {
  console.error('No DA_TOKEN in .env');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

function collectSlugs() {
  const slugs = new Set();
  for (const tpl of ['equipment-used', 'equipment-new']) {
    const p = `${STARDUST_ROOT}/stardust/aem-import-out/${tpl}/_batch-results.json`;
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    for (const r of j.results || []) {
      if (r.slug) slugs.add(r.slug);
      if (r.path && !r.path.includes('/')) slugs.add(r.path);
    }
  }
  // Also include the manually-authored sentinel pages.
  ['988-wheel-loader', '986-wheel-loader', '990-wheel-loader', '992-wheel-loader'].forEach(s => slugs.add(s));
  return [...slugs];
}

async function deleteOne(slug) {
  const calls = [
    `https://admin.da.live/source/${DA_ORG}/${DA_REPO}/${slug}.html`,
    `https://admin.hlx.page/live/${DA_ORG}/${DA_REPO}/main/${slug}`,
    `https://admin.hlx.page/preview/${DA_ORG}/${DA_REPO}/main/${slug}`,
  ];
  const statuses = [];
  for (const url of calls) {
    if (DRY_RUN) { statuses.push('dry'); continue; }
    try {
      const res = await fetch(url, { method: 'DELETE', headers: auth });
      statuses.push(res.status);
    } catch (e) {
      statuses.push(`err:${e.message}`);
    }
  }
  return { slug, statuses };
}

async function runPool(items, concurrency) {
  const queue = [...items];
  const results = [];
  const total = items.length;
  let processed = 0;
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      const r = await deleteOne(s);
      processed += 1;
      results.push(r);
      const ok = r.statuses.every(st => st === 'dry' || (typeof st === 'number' && (st === 204 || st === 200 || st === 404)));
      console.log(`  [${processed}/${total}] ${ok ? '✓' : '!'} ${r.slug}  ${r.statuses.join('/')}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  const slugs = collectSlugs();
  console.log(`▸ Collected ${slugs.length} slugs to clean up`);
  if (DRY_RUN) console.log('  (dry-run — no actual deletes)');
  if (!slugs.length) return;

  const startedAt = Date.now();
  const results = await runPool(slugs, CONCURRENCY);
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n▸ Done in ${elapsed}s. ${results.length} slugs processed.`);
}

main();
