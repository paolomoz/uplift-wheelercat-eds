export default function decorate(block) {
  if (!block.classList.contains('accordions')) return;

  const cells = Array.from(block.querySelectorAll(':scope > div > div'));
  if (cells.length === 0) return;

  // Collect existing details, plus h3+(ul|div>ul) pairs across all cells.
  const items = [];
  cells.forEach((cell) => {
    cell.querySelectorAll(':scope > details').forEach((d) => items.push({ kind: 'details', node: d }));

    const children = Array.from(cell.children);
    for (let i = 0; i < children.length; i++) {
      const ch = children[i];
      if (ch.tagName !== 'H3') continue;
      let body = children[i + 1];
      if (body && body.tagName === 'DIV') body = body.querySelector(':scope > ul, :scope > ol') || body;
      if (body && (body.tagName === 'UL' || body.tagName === 'OL' || body.tagName === 'P')) {
        items.push({ kind: 'pair', h3: ch, body });
      }
    }
  });

  if (items.length === 0) return;

  // Build the destination container — keep block's first cell shell, replace its inner.
  const firstCell = cells[0];
  firstCell.innerHTML = '';
  const wrapper = firstCell;

  items.forEach((item, i) => {
    let details;
    if (item.kind === 'details') {
      details = item.node;
    } else {
      details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.appendChild(item.h3);
      details.appendChild(summary);
      // body may have been inside a wrapping <div> — append the actual list.
      const list = item.body.closest('div') && item.body.tagName === 'UL'
        ? item.body
        : item.body;
      details.appendChild(list);
    }
    if (i === 0) details.open = true;
    else details.removeAttribute('open');
    wrapper.appendChild(details);
  });

  // Remove now-empty sibling cells.
  cells.slice(1).forEach((c) => c.parentElement.remove());
}
