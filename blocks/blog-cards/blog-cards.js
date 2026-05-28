/**
 * blog-cards — 4 portrait cards on a warm-stone background.
 *
 * Authoring rows (positional):
 *   1. Section eyebrow (single cell)
 *   2. Section title (single cell)
 *   3..6. Cards — 2 cells per card: title | link href
 *         (BEM variant class binds the per-card background image)
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }

const VARIANTS = ['maint', 'aerial', 'landscape', 'cva'];

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const eyebrow = text(rows[0]?.firstElementChild);
  const title = text(rows[1]?.firstElementChild);

  const head = document.createElement('div');
  head.className = 'blog-cards__head';
  if (eyebrow) {
    const e = document.createElement('span');
    e.className = 'label blog-cards__eyebrow';
    e.textContent = eyebrow;
    head.append(e);
  }
  if (title) {
    const h = document.createElement('h2');
    h.className = 'headline blog-cards__title';
    h.textContent = title;
    head.append(h);
  }

  const grid = document.createElement('div');
  grid.className = 'blog-cards__grid';

  rows.slice(2).forEach((row, i) => {
    const cells = [...row.children];
    const cTitle = text(cells[0]);
    const cLink = cells[1]?.querySelector('a');
    const variant = VARIANTS[i] || '';

    const card = document.createElement('a');
    card.className = `blog-card blog-card--${variant}`;
    card.href = cLink?.getAttribute('href') || '#';

    const bg = document.createElement('div');
    bg.className = 'blog-card__bg';
    bg.setAttribute('aria-hidden', 'true');
    card.append(bg);

    const inner = document.createElement('div');
    inner.className = 'blog-card__inner';
    const t = document.createElement('h3');
    t.className = 'blog-card__title';
    t.textContent = cTitle;
    inner.append(t);
    const more = document.createElement('span');
    more.className = 'blog-card__more';
    more.textContent = 'Read More';
    inner.append(more);
    card.append(inner);

    grid.append(card);
  });

  const container = document.createElement('div');
  container.className = 'blog-cards__container';
  container.append(head, grid);
  block.replaceChildren(container);
}
