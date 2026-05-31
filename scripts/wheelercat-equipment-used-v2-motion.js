/* wheelercat-equipment-used-v2-motion.js
 * Gallery thumb-swap + Lenis smooth scroll for used-equipment pages.
 * Loaded by scripts/scripts.js when the theme matches.
 */
(function () {
  /* ───── Gallery thumb-swap ───── */
  document.querySelectorAll('.hero.listing.block').forEach((hero) => {
    const main = hero.querySelector('.gallery-main img');
    const thumbs = hero.querySelectorAll('.gallery-thumbs button');
    if (!main || !thumbs.length) return;
    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-src') || btn.querySelector('img')?.src;
        if (!src) return;
        main.src = src;
        thumbs.forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });
  });

  /* ───── Lenis bootstrap (smooth scroll) ───── */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof window.Lenis === 'function') {
    const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: !prefersReducedMotion });
    window.__lenis = lenis;
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
  }
})();
