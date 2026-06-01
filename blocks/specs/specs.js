export default function decorate(block) {
  if (!block.classList.contains('accordions')) return;

  const inner = block.querySelector(':scope > div > div') || block.querySelector(':scope > div');
  if (!inner) return;

  const pairs = [];
  let h3 = null;
  for (const child of Array.from(inner.children)) {
    if (child.tagName === 'H3') {
      h3 = child;
    } else if (h3 && (child.tagName === 'UL' || child.tagName === 'OL' || child.tagName === 'P')) {
      pairs.push({ h3, body: child });
      h3 = null;
    }
  }

  pairs.forEach(({ h3, body }, i) => {
    const details = document.createElement('details');
    if (i === 0) details.open = true;
    const summary = document.createElement('summary');
    h3.parentNode.insertBefore(details, h3);
    summary.appendChild(h3);
    details.appendChild(summary);
    details.appendChild(body);
  });
}
