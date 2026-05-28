/**
 * hero — REDEFINING / COMMITMENT two-tone hero with white pill CTA.
 *
 * Authoring rows (positional):
 *   1. Eyebrow text (single cell)
 *   2. Headline accent — the yellow line (single cell)
 *   3. Headline main — the white line (single cell)
 *   4. Supporting paragraph (single cell, plain text)
 *   5. CTA — wrap in <em><strong><a> for the white pill (accent).
 *      The link decorator applies .btn .btn-accent.
 *   6. Background <picture>
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }
function pic(cell)  { return cell ? cell.querySelector('picture, img') : null; }

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const [eyebrowRow, accentRow, mainRow, supportingRow, ctaRow, bgRow] = rows;
  const eyebrow   = text(eyebrowRow?.firstElementChild);
  const accent    = text(accentRow?.firstElementChild);
  const mainText  = text(mainRow?.firstElementChild);
  const supporting = supportingRow?.firstElementChild?.innerHTML || '';
  const ctaSourceCell = ctaRow?.firstElementChild;
  const bgImg = pic(bgRow?.firstElementChild);

  // Build the prototype's hero structure.
  const inner = document.createElement('div');
  inner.className = 'hero__inner';

  if (eyebrow) {
    const e = document.createElement('span');
    e.className = 'label hero__eyebrow';
    e.textContent = eyebrow;
    inner.append(e);
  }

  if (accent || mainText) {
    const h1 = document.createElement('h1');
    h1.className = 'display hero__headline';
    if (accent) {
      const a = document.createElement('span');
      a.className = 'hero__headline-line hero__headline-line--accent';
      a.textContent = accent;
      h1.append(a);
    }
    if (mainText) {
      const m = document.createElement('span');
      m.className = 'hero__headline-line';
      m.textContent = mainText;
      h1.append(m);
    }
    inner.append(h1);
  }

  if (supporting) {
    const p = document.createElement('p');
    p.className = 'hero__supporting';
    p.innerHTML = supporting;
    inner.append(p);
  }

  if (ctaSourceCell && ctaSourceCell.querySelector('a')) {
    const actions = document.createElement('div');
    actions.className = 'hero__actions';
    [...ctaSourceCell.childNodes].forEach((n) => actions.append(n.cloneNode(true)));
    inner.append(actions);
  }

  // Background image: lift the <picture>'s img src into a background style.
  const heroBg = bgImg?.tagName === 'PICTURE'
    ? bgImg.querySelector('img')?.getAttribute('src')
    : bgImg?.getAttribute('src');

  if (heroBg) {
    const gradient = 'linear-gradient(to right, rgb(18 18 18 / 85%) 0%, rgb(18 18 18 / 65%) 40%, rgb(18 18 18 / 30%) 75%, rgb(18 18 18 / 10%) 100%)';
    block.style.backgroundImage = `${gradient}, url("${heroBg}")`;
  }

  block.replaceChildren(inner);
}
