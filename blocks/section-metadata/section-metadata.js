export default async function init(el) {
  el.remove();
}

// No-op export so header.js's import at this commit can resolve.
export function setColorScheme() {}
