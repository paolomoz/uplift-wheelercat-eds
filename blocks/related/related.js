import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';

const QUERY_INDEX = '/query-index.json';
const MAX_ITEMS = 3;

let cachedIndex;
async function loadIndex() {
  if (cachedIndex) return cachedIndex;
  try {
    const res = await fetch(QUERY_INDEX);
    if (!res.ok) return [];
    const json = await res.json();
    cachedIndex = json.data || [];
    return cachedIndex;
  } catch (e) {
    return [];
  }
}

function buildCard({ path, title, image, modelName }) {
  const li = document.createElement('li');
  const label = modelName || title || path;

  const imageDiv = document.createElement('div');
  imageDiv.className = 'cards-card-image';
  if (image) {
    const picture = createOptimizedPicture(image, label, false, [{ width: '750' }]);
    imageDiv.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'cards-card-body';
  body.innerHTML = `<h3><a href="${path}">${label}</a></h3>
    <p class="button-wrapper"><a href="${path}" title="View Details" class="button primary">View Details</a></p>`;

  li.append(imageDiv, body);
  return li;
}

export async function decorateDynamic(block) {
  const template = getMetadata('template');
  const category = getMetadata('category');
  const here = window.location.pathname.replace(/\/$/, '');

  if (!template || !category) {
    block.closest('.section')?.remove();
    return;
  }

  const items = (await loadIndex())
    .filter((row) => row.template === template
      && row.category === category
      && row.path.replace(/\/$/, '') !== here)
    .slice(0, MAX_ITEMS);

  if (items.length === 0) {
    block.closest('.section')?.remove();
    return;
  }

  const ul = document.createElement('ul');
  items.forEach((item) => ul.append(buildCard(item)));

  block.innerHTML = '';
  block.append(ul);
}

export default function decorate() { /* no-op for non-dynamic; cards.js handles standard styling */ }
