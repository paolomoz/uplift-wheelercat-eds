#!/usr/bin/env node
/*
 * Build /redirects.json mapping `<path>/` → `<path>` for every page
 * in /query-index.json. Closes the trailing-slash 404 across all
 * 2,000+ pages without touching any existing content.
 */
import { writeFileSync, readFileSync } from 'fs';

const idx = await (await fetch('https://main--uplift-wheelercat-eds--paolomoz.aem.page/query-index.json')).json();

// For every indexed path that isn't root, generate /<path>/ → /<path>
const rows = [];
const seen = new Set();
idx.data.forEach((r) => {
  const path = r.path.replace(/\/$/, '');
  if (!path || path === '/') return;
  const source = `${path}/`;
  if (seen.has(source)) return;
  seen.add(source);
  rows.push({ Source: source, Destination: path });
});

const payload = {
  total: rows.length,
  offset: 0,
  limit: rows.length,
  data: rows,
  ':type': 'sheet',
};
writeFileSync('/tmp/redirects.json', JSON.stringify(payload, null, 2));
console.log(`Built ${rows.length} redirect entries.`);
console.log('Sample:');
rows.slice(0, 5).forEach(r => console.log(`  ${r.Source} → ${r.Destination}`));
