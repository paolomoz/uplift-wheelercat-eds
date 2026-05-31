/* wheelercat-equipment-used-v2-motion.js
 * - Lenis smooth scroll
 * - Lightbox media gallery (click thumb → full-screen with prev/next/close)
 * Loaded by scripts/scripts.js when the theme matches.
 */
(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───── Lenis bootstrap ───── */
  if (typeof window.Lenis === 'function') {
    const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: !prefersReducedMotion });
    window.__lenis = lenis;
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
  }

  /* ───── Lightbox media gallery ─────
     Collect all gallery images (hero main + gallery grid).
     Click any → open full-screen overlay; arrow keys or buttons navigate;
     ESC or click-outside or × closes. */
  function initLightbox() {
    const sources = [];
    document.querySelectorAll('.hero.listing.block img, .cards.gallery.block img').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (src && !sources.includes(src)) sources.push(src);
    });
    if (!sources.length) return;

    // Build overlay once
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close gallery">&times;</button>
      <button class="lightbox-prev" aria-label="Previous photo">&lsaquo;</button>
      <button class="lightbox-next" aria-label="Next photo">&rsaquo;</button>
      <div class="lightbox-stage">
        <img class="lightbox-img" alt="">
        <div class="lightbox-counter"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const overlayImg = overlay.querySelector('.lightbox-img');
    const counter = overlay.querySelector('.lightbox-counter');
    let currentIdx = 0;

    function show(idx) {
      currentIdx = (idx + sources.length) % sources.length;
      overlayImg.src = sources[currentIdx];
      counter.textContent = `${currentIdx + 1} / ${sources.length}`;
    }
    function open(idx) {
      show(idx);
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (window.__lenis) try { window.__lenis.stop(); } catch (e) {}
    }
    function close() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (window.__lenis) try { window.__lenis.start(); } catch (e) {}
    }

    // Wire thumbnails
    document.querySelectorAll('.hero.listing.block img, .cards.gallery.block img').forEach((img) => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => {
        const src = img.currentSrc || img.src;
        const idx = sources.indexOf(src);
        open(idx >= 0 ? idx : 0);
      });
    });

    // Controls
    overlay.querySelector('.lightbox-close').addEventListener('click', close);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => show(currentIdx - 1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => show(currentIdx + 1));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(currentIdx - 1);
      if (e.key === 'ArrowRight') show(currentIdx + 1);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
  } else {
    initLightbox();
  }
})();
