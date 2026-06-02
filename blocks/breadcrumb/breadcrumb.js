/*
 * Dynamic breadcrumb block.
 *
 * Authors don't need to write the trail by hand — the block JS derives it
 * from the URL path. Special-case label overrides handle slugs whose URL
 * shape doesn't translate cleanly to a human label.
 *
 * Authoring shape (DA):
 *   <div class="breadcrumb">
 *     <div><div></div></div>   <!-- content is ignored; can be left empty -->
 *   </div>
 *
 * Any existing content is wiped on decorate() so legacy static breadcrumbs
 * are automatically converted without re-authoring.
 */

// Slug → label overrides for segments whose Title-Case form would read wrong.
const LABEL_OVERRIDES = {
  new: 'New Equipment',
  'used-equipment': 'Used Equipment',
  'customer-value-agreements': 'Customer Value Agreements',
  'request-service': 'Request Service',
  'request-quote': 'Request a Quote',
  quotes: 'Request a Quote',
  'services-commitment': 'Services Commitment',
  'equipment-finder': 'Equipment Finder',
  'equipment-rebuilds': 'Equipment Rebuilds',
  'get-training': 'Operator Training',
  jobs: 'Careers',
  sis2: 'Cat® SIS 2.0',
  visionlink: 'Vision Link',
  'rental-portal': 'Rental Portal',
  'online-payments': 'Online Payments',
  'employee-login': 'Employee Login',
  login: 'Customer Login',
  'parts/lookup': 'Parts Lookup',
  'parts/track-order': 'Track Your Order',
  'rental/tools': 'Tool Rentals',
  'service/field': 'Field Service',
  'service/shop': 'Shop Service',
  'about/locations': 'Locations',
};

// Segments that shouldn't render in the visible trail (kept in hrefs so
// downstream URLs are still correct). Example: /new/machines/<cat>/<model>
// renders as "Home › New Equipment › <cat> › <model>" without "Machines".
const SKIP_SEGMENTS = new Set(['machines']);

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function leafLabel(fallback) {
  // Prefer document.title minus the brand suffix; fall back to H1, then slug.
  const title = (document.title || '').replace(/\s*[—–-]\s*Wheeler.*$/i, '').trim();
  if (title && title.length < 80) return title;
  const h1 = document.querySelector('main h1');
  if (h1) {
    const t = h1.textContent.trim();
    if (t) return t;
  }
  return fallback;
}

function lookupLabel(segments, idx) {
  // Try a two-segment key first (e.g., "parts/lookup"), then single segment.
  if (idx > 0) {
    const compound = `${segments[idx - 1]}/${segments[idx]}`;
    if (LABEL_OVERRIDES[compound]) return LABEL_OVERRIDES[compound];
  }
  const single = segments[idx];
  if (LABEL_OVERRIDES[single]) return LABEL_OVERRIDES[single];
  return titleCase(single);
}

export default function decorate(block) {
  const pathname = window.location.pathname.replace(/\/$/, '');
  if (!pathname || pathname === '/') {
    block.closest('.section')?.remove();
    return;
  }

  const segments = pathname.split('/').filter(Boolean);
  const items = [{ label: 'Home', href: '/' }];

  segments.forEach((seg, i) => {
    if (SKIP_SEGMENTS.has(seg)) return;
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label = lookupLabel(segments, i);
    items.push({ label, href, isLast: i === segments.length - 1 });
  });

  // Replace the leaf label with the page's actual title (often more
  // human-readable than the slug — e.g., "988 Wheel Loader" vs slug
  // "988-wheel-loader"; "Cedar City, UT" vs "cedar-city").
  if (items.length > 1) {
    const last = items[items.length - 1];
    last.label = leafLabel(last.label);
  }

  const p = document.createElement('p');
  items.forEach((item, i) => {
    if (i === items.length - 1) {
      p.appendChild(document.createTextNode(item.label));
    } else {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      p.appendChild(a);
      const sep = document.createElement('em');
      sep.textContent = '›';
      p.appendChild(sep);
    }
  });

  block.innerHTML = '';
  block.appendChild(p);
}
