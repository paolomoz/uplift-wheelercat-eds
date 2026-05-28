/**
 * brand-logos — 5-logo partner strip with grayscale → color on hover.
 *
 * Authoring rows (positional):
 *   1. Section eyebrow (single cell)
 *   2..N. Logos — each row carries a single <picture> or <img>.
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const eyebrow = text(rows[0]?.firstElementChild);

  const head = document.createElement('div');
  head.className = 'brand-logos__head';
  if (eyebrow) {
    const e = document.createElement('span');
    e.className = 'brand-logos__eyebrow';
    e.textContent = eyebrow;
    head.append(e);
  }

  const track = document.createElement('div');
  track.className = 'logo-track';
  rows.slice(1).forEach((row) => {
    const img = row.querySelector('img');
    if (img) track.append(img.cloneNode(true));
  });

  const container = document.createElement('div');
  container.className = 'brand-logos__container';
  container.append(head, track);
  block.replaceChildren(container);
}
