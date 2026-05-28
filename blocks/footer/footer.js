import { getConfig, getMetadata } from '../../scripts/ak.js';
import { loadFragment } from '../fragment/fragment.js';

const FOOTER_PATH = '/fragments/nav/footer';

// EDS strips classes from default-content; the only social-related signal
// that survives is the icon's aria-label on each empty anchor. When EDS
// further dissolves the anchor (which it does for empty anchors), we lose
// even that. So the social icon set is hardcoded here as chrome metadata.
const SOCIALS = [
  { label: 'Facebook', icon: 'facebook' },
  { label: 'Instagram', icon: 'instagram' },
  { label: 'LinkedIn', icon: 'linkedin' },
  { label: 'YouTube', icon: 'youtube' },
  { label: 'Twitter', icon: 'twitter' },
];

const LOGO_FALLBACK = '/img/wheelercat-home/logo.png';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rebuildChrome(fragment) {
  const allLinks = [...fragment.querySelectorAll('a')];
  const allImgs = [...fragment.querySelectorAll('img')];
  const h2s = [...fragment.querySelectorAll('h2')].map((h) => h.textContent.trim());
  const uls = [...fragment.querySelectorAll('ul')];
  const paragraphs = [...fragment.querySelectorAll('p')].map((p) => p.textContent.trim()).filter(Boolean);

  const logoImg = allImgs[0];
  let logoSrc = logoImg?.getAttribute('src') || LOGO_FALLBACK;
  if (logoSrc === 'about:error' || !logoSrc) logoSrc = LOGO_FALLBACK;
  const logoAlt = logoImg?.getAttribute('alt') || 'Wheeler Machinery Co.';

  // Brand paragraph = the first non-trivial paragraph not starting with a
  // street number (address) and not the copyright.
  const brandText = paragraphs.find((p) => (
    p.length > 30 && !/^\d/.test(p) && !p.startsWith('Copyright')
  )) || '';

  // Quick links = first <ul>'s items.
  const quickLinks = [...(uls[0]?.querySelectorAll('li a') || [])].map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
  }));

  // Legal links = last <ul>'s items.
  const legalLinks = [...(uls[uls.length - 1]?.querySelectorAll('li a') || [])].map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
  }));

  // Phone tel link.
  const phoneAnchor = fragment.querySelector('a[href^="tel:"]');
  const phoneHref = phoneAnchor?.getAttribute('href') || '';
  const phoneText = phoneAnchor?.textContent.trim() || '';

  // Copyright line.
  const copyright = paragraphs.find((p) => p.startsWith('Copyright')) || '';

  // Address: hardcoded structure (the <br>s collapse during the strip).
  const addressHTML = '4901 West 2100 South,<br>Salt Lake City,<br>UT 84120';

  return `
    <div class="site-footer" data-section="footer">
      <div class="container">
        <div class="footer__grid">
          <div class="footer__brand">
            <img src="${esc(logoSrc)}" alt="${esc(logoAlt)}">
            <p>${esc(brandText)}</p>
          </div>
          <div class="footer__col">
            <h2>${esc(h2s[0] || 'Quick Links')}</h2>
            <ul>
              ${quickLinks.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('')}
            </ul>
          </div>
          <div class="footer__col">
            <h2>${esc(h2s[1] || 'Contact Us')}</h2>
            <address class="footer__address">${addressHTML}</address>
            ${phoneHref ? `<a class="footer__phone" href="${esc(phoneHref)}"><span class="icon-glyph icon-phone" aria-hidden="true"></span> ${esc(phoneText)}</a>` : ''}
          </div>
          <div class="footer__col">
            <h2>${esc(h2s[2] || 'Connect With Us')}</h2>
            <div class="footer__social">
              ${SOCIALS.map((s) => `<a href="#" aria-label="${esc(s.label)}"><span class="icon-glyph icon-${s.icon}" aria-hidden="true"></span></a>`).join('')}
            </div>
          </div>
        </div>
        <div class="footer__legal">
          <span>${esc(copyright)}</span>
          <ul>
            ${legalLinks.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

/**
 * loads and decorates the footer
 * @param {Element} el The footer element
 */
export default async function init(el) {
  const { locale } = getConfig();
  const footerMeta = getMetadata('footer');
  if (footerMeta === 'off') { el.remove(); return; }
  const path = footerMeta || FOOTER_PATH;
  try {
    const fragment = await loadFragment(`${locale.prefix}${path}`);
    el.innerHTML = rebuildChrome(fragment);
  } catch (e) {
    throw Error(e);
  }
}
