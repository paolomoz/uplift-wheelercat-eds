import { getConfig, getMetadata } from '../../scripts/ak.js';
import { loadFragment } from '../fragment/fragment.js';

const { locale } = getConfig();

const HEADER_PATH = '/fragments/nav/header';

// Verb definitions: matches text starting with keyword, attaches icon + sub-label.
const VERB_DEFS = [
  { keyword: 'Buy', icon: 'new', sub: 'New & Used' },
  { keyword: 'Rent', icon: 'rent', sub: 'Equipment, Tools, Trailers' },
  { keyword: 'Service', icon: 'service', sub: 'Field, Shop, Maintenance' },
  { keyword: 'Parts', icon: 'order', sub: 'Order & Track' },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function liLink({ text, href }) {
  return `<li><a href="${esc(href)}">${esc(text)}</a></li>`;
}

function rebuildChrome(fragment) {
  const allLinks = [...fragment.querySelectorAll('a')];
  const allImgs = [...fragment.querySelectorAll('img')];

  // Logo = first image's wrapping anchor.
  const logoImg = allImgs[0];
  const logoLink = logoImg?.closest('a');
  const logoIdx = logoLink ? allLinks.indexOf(logoLink) : -1;

  // Utility strip = everything before the logo.
  const beforeLogo = allLinks.slice(0, logoIdx).map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
  }));
  const utilityTop = beforeLogo.slice(0, 2);
  const utilityMore = beforeLogo.slice(2);

  // After logo: verbs (grouped) + phone + mega-nav.
  const afterLogo = allLinks.slice(logoIdx + 1);
  const phoneAnchor = afterLogo.find((a) => a.getAttribute('href')?.startsWith('tel:'));
  const phoneIdx = phoneAnchor ? afterLogo.indexOf(phoneAnchor) : afterLogo.length;
  const verbZone = afterLogo.slice(0, phoneIdx);
  const megaNavLinks = afterLogo.slice(phoneIdx + 1).map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
  }));

  // Group verbs: a link whose visible text starts with one of VERB_DEFS's
  // keyword begins a new verb; subsequent links are its dropdown items
  // until the next verb keyword (or end of zone).
  const verbs = [];
  let current = null;
  for (const a of verbZone) {
    const text = a.textContent.trim();
    const href = a.getAttribute('href');
    const def = VERB_DEFS.find((v) => text.startsWith(v.keyword));
    if (def) {
      current = { ...def, href, items: [] };
      verbs.push(current);
    } else if (current) {
      current.items.push({ text, href });
    }
  }

  const phoneHref = phoneAnchor?.getAttribute('href') || '';
  const phoneText = phoneAnchor?.textContent.trim() || '';
  const logoHref = logoLink?.getAttribute('href') || '/';
  const logoSrc = logoImg?.getAttribute('src') || '';
  const logoAlt = logoImg?.getAttribute('alt') || 'Wheeler Machinery Co.';

  return `
    <div class="utility-strip" data-section="utility-strip">
      <div class="container utility-strip__inner">
        <ul class="utility-strip__list">
          ${utilityTop.map(liLink).join('')}
          <li class="utility-strip__more">
            <button type="button" class="utility-strip__more-trigger" aria-haspopup="true" aria-expanded="false">More</button>
            <ul class="utility-strip__more-menu" role="menu">
              ${utilityMore.map((item) => `<li><a href="${esc(item.href)}" role="menuitem">${esc(item.text)}</a></li>`).join('')}
            </ul>
          </li>
        </ul>
      </div>
    </div>
    <div class="site-header" id="nav" data-section="header">
      <div class="main-header">
        <div class="container main-header__inner">
          <a class="main-header__logo" href="${esc(logoHref)}" aria-label="${esc(logoAlt)} — home">
            <img src="${esc(logoSrc)}" alt="${esc(logoAlt)}">
          </a>
          <button class="burger" aria-controls="primary-nav" aria-expanded="false" aria-label="Toggle navigation">
            <span class="icon-glyph icon-menu" aria-hidden="true"></span>
          </button>
          <nav class="main-nav primary-verbs" id="primary-nav" aria-label="primary intents">
            ${verbs.map((v) => `
              <a class="verb" href="${esc(v.href)}">
                <span class="icon-glyph icon-${v.icon}" aria-hidden="true"></span>
                ${esc(v.keyword)}
                <span class="verb-sub">${esc(v.sub)}</span>
                <ul class="verb__dropdown" role="menu">
                  ${v.items.map((item) => `<li><a href="${esc(item.href)}" role="menuitem">${esc(item.text)}</a></li>`).join('')}
                </ul>
              </a>
            `).join('')}
          </nav>
          ${phoneHref ? `<a class="main-nav__phone" href="${esc(phoneHref)}"><span class="icon-glyph icon-phone" aria-hidden="true"></span> ${esc(phoneText)}</a>` : ''}
        </div>
      </div>
      <div class="mega-nav" data-section="mega-nav">
        <div class="container mega-nav__inner">
          ${megaNavLinks.map((m) => `<a href="${esc(m.href)}">${esc(m.text)}</a>`).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * loads and decorates the header
 * @param {Element} el The header element
 */
export default async function init(el) {
  const headerMeta = getMetadata('header');
  if (headerMeta === 'off') { el.remove(); return; }
  const path = headerMeta || HEADER_PATH;
  try {
    const fragment = await loadFragment(`${locale.prefix}${path}`);
    el.innerHTML = rebuildChrome(fragment);
  } catch (e) {
    throw Error(e);
  }
}
