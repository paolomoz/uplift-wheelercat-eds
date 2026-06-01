import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';

const QUERY_INDEX = '/query-index.json';
const DEFAULT_MAX = 3;

let cachedIndex;
async function loadIndex() {
  if (cachedIndex) return cachedIndex;
  try {
    const res = await fetch(QUERY_INDEX);
    if (!res.ok) return [];
    const json = await res.json();
    cachedIndex = json.data || [];
    return cachedIndex;
  } catch (e) {
    return [];
  }
}

function buildCard({ path, title, image, modelName }) {
  const li = document.createElement('li');
  const label = modelName || title || path;

  const imageDiv = document.createElement('div');
  imageDiv.className = 'cards-card-image';
  if (image) {
    const picture = createOptimizedPicture(image, label, false, [{ width: '750' }]);
    imageDiv.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'cards-card-body';
  body.innerHTML = `<h3><a href="${path}">${label}</a></h3>
    <p class="button-wrapper"><a href="${path}" title="View Details" class="button primary">View Details</a></p>`;

  li.append(imageDiv, body);
  return li;
}

function dedupeBySlug(rows) {
  const byModel = new Map();
  rows.forEach((row) => {
    const slug = row.path.split('/').pop();
    const isNested = row.path.split('/').filter(Boolean).length > 1;
    const existing = byModel.get(slug);
    if (!existing || (isNested && !existing.isNested)) {
      byModel.set(slug, { ...row, isNested });
    }
  });
  return [...byModel.values()];
}

export async function decorateDynamic(block) {
  const isListing = block.classList.contains('listing');
  const isHub = block.classList.contains('hub');
  const template = getMetadata('template');
  const category = getMetadata('category');
  const here = window.location.pathname.replace(/\/$/, '');

  // Hub mode: list every "listing" page nested under the current hub's URL.
  // E.g., a hub at /new lists every /new/machines/<cat> listing. The depth
  // doesn't matter — the URL prefix match is sufficient.
  if (isHub) {
    const all = await loadIndex();
    const hubPath = here.replace(/\/$/, '') + '/';
    const items = all
      .filter(r => (r.pageType || 'detail') === 'listing')
      .filter(r => r.path.startsWith(hubPath))
      .sort((a, b) => (a.modelName || a.title || a.path).localeCompare(b.modelName || b.title || b.path));

    if (items.length === 0) {
      block.closest('.section')?.remove();
      return;
    }

    // First pass: pick a candidate preview image per item, then count
    // how often each image appears. Images shared across many categories
    // are placeholders ("photo coming soon" stock) — drop them to the
    // text-only fallback so they don't visually duplicate.
    const candidates = items.map((item) => {
      let img = item.image && !item.image.includes('default-meta-image') ? item.image : null;
      if (!img) {
        const child = all.find(r => r.category === item.category
          && (r.pageType || 'detail') !== 'listing'
          && r.image && !r.image.includes('default-meta-image'));
        if (child) img = child.image;
      }
      return img;
    });
    // DA stores the same media at path-prefixed URLs (e.g.,
    // /used-equipment/<cat>/media_<hash>.jpg) — strings differ but the
    // hash is the same. Dedupe by filename + query (drop the directory).
    const imageKey = (src) => src ? (src.split('/').pop() || src) : null;
    const imageCounts = candidates.reduce((acc, src) => {
      const k = imageKey(src);
      if (k) acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const ul = document.createElement('ul');
    items.forEach((item, i) => {
      const li = document.createElement('li');
      const label = (item.modelName || item.title || item.path).replace(/\s*[—–]\s*Wheeler.*$/i, '').trim();

      // Reject placeholder images (shared across ≥3 categories)
      const candidate = candidates[i];
      const previewImage = candidate && imageCounts[imageKey(candidate)] < 3 ? candidate : null;

      if (previewImage) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'cards-card-image';
        const picture = createOptimizedPicture(previewImage, label, false, [{ width: '500' }]);
        imageDiv.append(picture);
        li.appendChild(imageDiv);
      }
      const body = document.createElement('div');
      body.className = 'cards-card-body';
      body.innerHTML = `<h3><a href="${item.path}">${label}</a></h3>
        <p class="button-wrapper"><a href="${item.path}" class="button primary">View Models</a></p>`;
      li.appendChild(body);
      ul.append(li);
    });
    block.innerHTML = '';
    block.append(ul);

    // Sticky-reveal on first hover or focus: image fades in once and stays.
    ul.querySelectorAll(':scope > li').forEach((li) => {
      if (!li.querySelector('.cards-card-image')) return;
      const reveal = () => li.classList.add('revealed');
      li.addEventListener('mouseenter', reveal, { once: true });
      li.addEventListener('focusin', reveal, { once: true });
      li.addEventListener('touchstart', reveal, { once: true, passive: true });
    });

    document.querySelectorAll('code').forEach((el) => {
      if (el.textContent.trim() === 'LISTING_COUNT') el.outerHTML = String(items.length);
    });
    return;
  }

  if (!category) {
    block.closest('.section')?.remove();
    return;
  }

  // .cards.related (detail-page sibling list) filters by same template +
  // same category. .cards.listing (category-listing page) filters by URL
  // prefix + category — listings use one theme but list pages from
  // potentially different detail templates (e.g., a /used-equipment/<cat>/
  // listing rendered with the equipment-new theme but listing pages from
  // the equipment-used template).
  const prefixMatch = here.match(/^(\/[^/]+(?:\/machines)?)\//);
  const parentPrefix = prefixMatch ? prefixMatch[1] + '/' : null;

  const all = await loadIndex();
  const candidates = all.filter((row) => {
    if (row.category !== category) return false;
    if ((row.pageType || 'detail') === 'listing') return false;
    if (row.path.replace(/\/$/, '') === here) return false;
    if (isListing) {
      return parentPrefix ? row.path.startsWith(parentPrefix) : true;
    }
    if (!template) return false;
    return row.template === template;
  });

  const items = dedupeBySlug(candidates)
    .sort((a, b) => (a.modelName || a.title || a.path).localeCompare(b.modelName || b.title || b.path))
    .slice(0, isListing ? Infinity : DEFAULT_MAX);

  if (items.length === 0) {
    block.closest('.section')?.remove();
    return;
  }

  const ul = document.createElement('ul');
  items.forEach((item) => ul.append(buildCard(item)));

  block.innerHTML = '';
  block.append(ul);

  // Surface the count by replacing the LISTING_COUNT marker token in any
  // <code> element (DA preserves <code>'s textContent but strips inline
  // data-* attributes, so a sentinel text token is the most reliable hook).
  document.querySelectorAll('code').forEach((el) => {
    if (el.textContent.trim() === 'LISTING_COUNT') {
      el.outerHTML = String(items.length);
    }
  });
}

export default function decorate() { /* no-op for non-dynamic; cards.js handles standard styling */ }
