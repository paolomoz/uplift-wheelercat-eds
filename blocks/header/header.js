/**
 * Loads the theme-specific header fragment from the code bus.
 * scripts.js sets main.dataset.theme = <template> in both overlay mode
 * and blocks mode (see applyTemplateOverlay). Read theme first;
 * dataset.overlay is kept as a fallback for backward compat.
 * Fragments live at /fragments/<theme>/header.html.
 */
export default async function decorate(block) {
  const main = document.querySelector('main');
  const theme = main?.dataset?.theme || main?.dataset?.overlay;
  if (!theme) return;
  const path = `/fragments/${theme}/header.html`;
  const resp = await fetch(`${window.hlx.codeBasePath}${path}`);
  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[header] fragment not found at ${path}`);
    return;
  }
  block.innerHTML = await resp.text();
}
