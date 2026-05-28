/**
 * finance — 3 finance offer cards on a dark surface.
 *
 * Authoring rows (positional):
 *   1. Section eyebrow (single cell)
 *   2. Section headline (single cell)
 *   3..5. Cards — 4 cells per card:
 *         eyebrow | title | body | CTA (wrap primary in <strong>)
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const sectionEyebrow = text(rows[0]?.firstElementChild);
  const sectionTitle = text(rows[1]?.firstElementChild);

  const head = document.createElement('div');
  head.className = 'finance__head';
  if (sectionEyebrow) {
    const e = document.createElement('span');
    e.className = 'label';
    e.textContent = sectionEyebrow;
    head.append(e);
  }
  if (sectionTitle) {
    const h = document.createElement('h2');
    h.className = 'headline';
    h.textContent = sectionTitle;
    head.append(h);
  }

  const grid = document.createElement('div');
  grid.className = 'finance__grid';

  rows.slice(2).forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const [eyebrowCell, titleCell, bodyCell, ctaCell] = cells;

    const card = document.createElement('article');
    card.className = 'finance-card';

    if (eyebrowCell && text(eyebrowCell)) {
      const ce = document.createElement('span');
      ce.className = 'label finance-card__eyebrow';
      ce.textContent = text(eyebrowCell);
      card.append(ce);
    }
    if (titleCell && text(titleCell)) {
      const ct = document.createElement('h3');
      ct.className = 'title finance-card__title';
      ct.innerHTML = titleCell.innerHTML;
      card.append(ct);
    }
    if (bodyCell && bodyCell.textContent.trim()) {
      const cb = document.createElement('p');
      cb.className = 'body-copy finance-card__body';
      cb.innerHTML = bodyCell.innerHTML;
      card.append(cb);
    }
    if (ctaCell && ctaCell.querySelector('a')) {
      const actions = document.createElement('div');
      actions.className = 'finance-card__cta-wrap';
      [...ctaCell.childNodes].forEach((n) => actions.append(n.cloneNode(true)));
      card.append(actions);
    }

    grid.append(card);
  });

  const container = document.createElement('div');
  container.className = 'finance__container';
  container.append(head, grid);
  block.replaceChildren(container);
}
