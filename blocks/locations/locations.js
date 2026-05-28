/**
 * locations — yellow eyebrow band + proof + 15-branch grid + more link.
 *
 * Authoring rows (positional):
 *   1. Eyebrow band text (single cell)
 *   2. Proof paragraph (single cell, allows <strong>)
 *   3..N. Branch list — single cell of comma-separated branches OR a <ul>
 *   N+1 (last row). "More" link (single cell with <a>)
 */

function text(cell) { return cell ? cell.textContent.trim() : ''; }

export default async function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const eyebrowBand = text(rows[0]?.firstElementChild);
  const proof = rows[1]?.firstElementChild?.innerHTML || '';

  // Last row is "more" CTA (single cell with anchor).
  // Middle rows (2..N-1) carry branches.
  const moreRow = rows[rows.length - 1];
  const branchRows = rows.slice(2, -1);

  const band = document.createElement('div');
  band.className = 'locations__eyebrow-band';
  band.textContent = eyebrowBand;

  const container = document.createElement('div');
  container.className = 'locations__container';

  if (proof) {
    const p = document.createElement('p');
    p.className = 'locations__proof';
    p.innerHTML = proof;
    container.append(p);
  }

  const grid = document.createElement('ul');
  grid.className = 'branch-grid';
  grid.setAttribute('aria-label', 'Wheeler Cat branch locations');

  branchRows.forEach((row) => {
    const branchText = text(row.firstElementChild);
    if (!branchText) return;
    // A row may carry multiple branches comma-separated.
    branchText.split(',').map((s) => s.trim()).filter(Boolean).forEach((b) => {
      const li = document.createElement('li');
      const icon = document.createElement('span');
      icon.className = 'icon-glyph icon-map-pin';
      icon.setAttribute('aria-hidden', 'true');
      li.append(icon, document.createTextNode(b));
      grid.append(li);
    });
  });
  container.append(grid);

  if (moreRow && moreRow.querySelector('a')) {
    const more = document.createElement('p');
    more.className = 'locations__more';
    more.innerHTML = moreRow.firstElementChild.innerHTML;
    container.append(more);
  }

  block.replaceChildren(band, container);
}
