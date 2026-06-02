#!/usr/bin/env node
/*
 * migrate-breadcrumbs.mjs — strip static breadcrumb content from every
 * migrated DA page. The block JS now derives the trail from URL + page
 * title; the static <a>Home</a><em>›</em>… content is dead weight.
 *
 * For each page in /query-index.json (except root):
 *   1. GET the DA source
 *   2. Replace the breadcrumb block's inner content with an empty cell
 *   3. PUT back, preview, publish, index
 *
 * Idempotent: re-running on already-migrated pages is a no-op.
 *
 * Usage:
 *   node migrate-breadcrumbs.mjs                      # all indexed pages
 *   node migrate-breadcrumbs.mjs --limit 5            # smoke-test
 *   node migrate-breadcrumbs.mjs --concurrency 6      # default 5
 *   node migrate-breadcrumbs.mjs --dry-run            # show what would change
 */

import { readFileSync, writeFileSync } from 'fs';

const env = readFileSync('/Users/paolo/stardust/uplift-wheelercat-eds/.env', 'utf8');
const TOKEN = env.match(/^DA_TOKEN=(.+)$/m)[1].trim();
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const DA = 'paolomoz/uplift-wheelercat-eds';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };
const LIMIT = parseInt(value('limit', '0'), 10);
const CONCURRENCY = parseInt(value('concurrency', '5'), 10);
const DRY_RUN = flag('dry-run');

const EMPTY_BREADCRUMB = '<div class="breadcrumb"><div><div></div></div></div>';

// Match the breadcrumb block with any inner content. The block JS wipes
// content at render time, but the DA-side body still carries the static
// trail HTML — that's what we're stripping.
//
// Pattern accepts the variants emitted across all fill scripts:
//   <div class="breadcrumb"> ... <div> ... <div> ... <p>...</p> ... </div> ... </div> ... </div>
// Captures the entire .breadcrumb block.
const BREADCRUMB_RE = /<div class="breadcrumb">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

async function fetchRetry(url, opts, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}

async function migrateOne(path) {
  const slug = path.replace(/^\//, '');
  const daUrl = `https://admin.da.live/source/${DA}/${slug}.html`;
  let res;
  try { res = await fetchRetry(daUrl, { headers: AUTH }); }
  catch (e) { return { path, ok: false, phase: 'get', error: e.message }; }
  if (!res.ok) {
    // 404 means the DA source doesn't exist — it's an orphan still in the
    // query-index. Skip it; no migration needed.
    if (res.status === 404) return { path, ok: true, action: 'skipped (orphan/no source)' };
    return { path, ok: false, phase: 'get', status: res.status };
  }

  const html = await res.text();
  if (!BREADCRUMB_RE.test(html)) {
    return { path, ok: true, action: 'skipped (no breadcrumb block)' };
  }

  // Check if already migrated (empty breadcrumb)
  const match = html.match(BREADCRUMB_RE)[0];
  if (match.replace(/\s+/g, '').length < 70) {
    return { path, ok: true, action: 'skipped (already empty)' };
  }

  const newHtml = html.replace(BREADCRUMB_RE, EMPTY_BREADCRUMB);

  if (DRY_RUN) {
    return { path, ok: true, action: 'would-strip', before: match.slice(0, 80), after: EMPTY_BREADCRUMB.slice(0, 80) };
  }

  const fd = new FormData();
  fd.append('data', new Blob([newHtml], { type: 'text/html' }), `${slug.split('/').pop()}.html`);
  try {
    const putRes = await fetchRetry(daUrl, { method: 'PUT', headers: AUTH, body: fd });
    if (!putRes.ok) return { path, ok: false, phase: 'put', status: putRes.status };
    await new Promise(r => setTimeout(r, 600));
    await fetchRetry(`https://admin.hlx.page/preview/${DA}/main/${slug}`, { method: 'POST', headers: AUTH });
    await fetchRetry(`https://admin.hlx.page/live/${DA}/main/${slug}`, { method: 'POST', headers: AUTH });
    return { path, ok: true, action: 'stripped' };
  } catch (e) { return { path, ok: false, phase: 'network', error: e.message }; }
}

async function main() {
  console.log('▸ Loading query-index...');
  const idx = await (await fetch('https://main--uplift-wheelercat-eds--paolomoz.aem.page/query-index.json')).json();
  let paths = idx.data.map(r => r.path).filter(p => p && p !== '/');
  if (LIMIT > 0) paths = paths.slice(0, LIMIT);
  console.log(`  ${paths.length} pages to consider`);
  if (DRY_RUN) console.log('  (dry-run — no PUTs)');

  const queue = [...paths];
  const results = [];
  let processed = 0;
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      const r = await migrateOne(p);
      results.push(r);
      processed += 1;
      if (processed % 50 === 0 || processed === paths.length) {
        const stripped = results.filter(x => x.action === 'stripped' || x.action === 'would-strip').length;
        const skipped = results.filter(x => x.action?.startsWith('skipped')).length;
        const failed = results.filter(x => !x.ok).length;
        console.log(`  [${processed}/${paths.length}] stripped:${stripped} skipped:${skipped} failed:${failed}`);
      }
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = Math.round((Date.now() - t0) / 1000);

  const stripped = results.filter(x => x.action === 'stripped').length;
  const skipped = results.filter(x => x.action?.startsWith('skipped')).length;
  const failed = results.filter(x => !x.ok).length;
  console.log(`\n▸ Done in ${elapsed}s. Stripped: ${stripped} | Skipped: ${skipped} | Failed: ${failed}`);

  writeFileSync('/tmp/migrate-breadcrumbs.json', JSON.stringify(results, null, 2));
  if (failed) {
    console.log('\nFirst 5 failures:');
    results.filter(x => !x.ok).slice(0, 5).forEach(r => console.log(`  ${r.path}: ${r.phase} ${r.status || r.error || ''}`));
  }
}

main();
