/**
 * services — 6-tile grid with image-fade-on-hover.
 *
 * Authoring rows (positional):
 *   1. Section eyebrow (single cell)
 *   2. Section title (single cell)
 *   3..8. Tiles — 3 cells per tile: title | icon class | link href
 *         (BEM variant class binds the per-tile background image)
 *   9. Footer CTA (wrap primary in <strong>)
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }

const VARIANTS = ['field', 'shop', 'parts', 'maint', 'rebuilds', 'online'];

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const eyebrow = text(rows[0]?.firstElementChild);
  const title = text(rows[1]?.firstElementChild);

  const head = document.createElement('div');
  head.className = 'services__head';
  if (eyebrow) {
    const e = document.createElement('span');
    e.className = 'label services__eyebrow';
    e.textContent = eyebrow;
    head.append(e);
  }
  if (title) {
    const h = document.createElement('h2');
    h.className = 'headline services__title';
    h.textContent = title;
    head.append(h);
  }

  const grid = document.createElement('div');
  grid.className = 'services__grid';

  const tileRows = rows.slice(2, 8);
  const footerRow = rows[8];

  tileRows.forEach((row, i) => {
    const cells = [...row.children];
    const tTitle = text(cells[0]);
    const tIcon = text(cells[1]) || 'service';
    const tLink = cells[2]?.querySelector('a');
    const variant = VARIANTS[i] || '';

    const tile = document.createElement('a');
    tile.className = `service-tile service-tile--${variant}`;
    tile.href = tLink?.getAttribute('href') || '#';

    const icon = document.createElement('span');
    icon.className = `service-tile__icon icon-glyph icon-${tIcon}`;
    icon.setAttribute('aria-hidden', 'true');
    tile.append(icon);

    const tTitleEl = document.createElement('span');
    tTitleEl.className = 'service-tile__title';
    tTitleEl.textContent = tTitle;
    tile.append(tTitleEl);

    grid.append(tile);
  });

  const container = document.createElement('div');
  container.className = 'services__container';
  container.append(head, grid);

  if (footerRow && footerRow.querySelector('a')) {
    const footer = document.createElement('div');
    footer.className = 'services__footer';
    const ctaCell = footerRow.firstElementChild;
    [...ctaCell.childNodes].forEach((n) => footer.append(n.cloneNode(true)));
    container.append(footer);
  }

  block.replaceChildren(container);
}
