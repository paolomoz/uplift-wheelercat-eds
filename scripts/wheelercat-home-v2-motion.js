/* wheelercat-home-v2-motion.js
 * Lenis smooth scroll + canonical motion runtime ported from the
 * stardust prototype. Applies data-anim / data-flip attributes onto
 * EDS-decorated elements via CSS selectors (DA pipeline doesn't
 * reliably preserve data-* attributes).
 *
 * Loaded by scripts/scripts.js when the theme name is wheelercat-home-v2.
 */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───── Apply data-anim to EDS-decorated elements ──────────────── */
  const animSelectors = [
    /* hero — eyebrow / h1s / supporting / button-wrapper, one at a time */
    '.hero.block > div > div:first-child > p',
    '.hero.block > div > div:first-child > h1',
    /* finance cards */
    '.cards.finance > ul > li',
    /* service tiles */
    '.cards.tiles > ul > li',
    /* blog cards */
    '.cards.photos.four > ul > li',
    /* logos */
    '.cards.logos > ul > li',
    /* locations branches */
    '.cards.locations > ul > li',
    /* section heads */
    '.text-wrapper .text.block',
  ];
  animSelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (!el.hasAttribute('data-anim')) el.setAttribute('data-anim', '');
    });
  });

  /* Apply data-flip to numerals in .cards.finance h3 <strong> elements
     (the "60" months / "$500" toward CVA — match strongs whose textContent
     is purely numeric). */
  document.querySelectorAll('.cards.finance h3 strong').forEach((el) => {
    const txt = el.textContent.trim();
    if (/^\d+$/.test(txt)) {
      el.setAttribute('data-flip', txt);
    }
  });

  /* ───── Lenis bootstrap ────────────────────────────────────────── */
  if (typeof window.Lenis !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('[wheelercat-motion] Lenis not loaded — smooth scroll disabled');
    return;
  }
  const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: !prefersReducedMotion });
  window.__lenis = lenis;
  (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());

  /* Nav scrolled state */
  const nav = document.querySelector('.site-header');
  if (nav) lenis.on('scroll', ({ scroll }) => {
    nav.classList.toggle('scrolled', scroll > 40);
  });

  /* ───── Helpers ────────────────────────────────────────────────── */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
  const getDocTop = (el) => el.getBoundingClientRect().top + (window.__lenis ? window.__lenis.scroll : window.scrollY);

  /* ───── Register-specific config (kinetic-display) ─────────────── */
  const animConfig = {
    cards: { trigger: 0.85, range: 0.32, slide: 48, stagger: 0.16 },
  };

  /* ───── Register lists ─────────────────────────────────────────── */
  const animList = [];

  function measure() {
    animList.forEach(({ el }) => { el.style.opacity = el.style.transform = el.style.willChange = ''; });
    animList.length = 0;

    document.querySelectorAll('[data-anim]').forEach((el) => {
      const parent = el.closest('.section, .cards-wrapper, .text-wrapper');
      let stagger = 0;
      if (parent) {
        const peers = parent.querySelectorAll('[data-anim]');
        const idx = Array.prototype.indexOf.call(peers, el);
        stagger = (idx % 8) * animConfig.cards.stagger;
      }
      el.style.opacity = '0';
      el.style.transform = `translateY(${animConfig.cards.slide}px)`;
      el.style.willChange = 'opacity, transform';
      animList.push({ el, triggerTop: getDocTop(el), staggerDelay: stagger });
    });
  }

  /* ───── [data-flip]: split-flap reveal ─────────────────────────── */
  const flipObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.target.dataset.flipped === '1') return;
      entry.target.dataset.flipped = '1';
      const target = +entry.target.getAttribute('data-flip');
      const total = 8 + Math.floor(Math.random() * 4);
      let i = 0;
      (function flap() {
        if (i >= total) { entry.target.textContent = String(target); return; }
        entry.target.textContent = String(Math.floor(Math.random() * 10));
        i += 1;
        setTimeout(flap, 60);
      })();
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-flip]').forEach((el) => flipObserver.observe(el));

  /* ───── rAF loop: scroll-progress reveals ──────────────────────── */
  (function tick() {
    if (prefersReducedMotion) { requestAnimationFrame(tick); return; }
    const sY = window.__lenis ? window.__lenis.scroll : window.scrollY;
    const vh = window.innerHeight;

    for (let i = 0; i < animList.length; i += 1) {
      const item = animList[i];
      const { trigger, range, slide } = animConfig.cards;
      const raw = (sY + vh * trigger - item.triggerTop) / (vh * range);
      const p = easeOut3(clamp(raw - item.staggerDelay, 0, 1));
      item.el.style.opacity = String(p);
      item.el.style.transform = `translateY(${(1 - p) * slide}px)`;
    }

    requestAnimationFrame(tick);
  })();

  measure();
  window.addEventListener('load', () => requestAnimationFrame(measure), { once: true });
  window.addEventListener('resize', measure, { passive: true });

  /* Reduced-motion: force final states */
  if (prefersReducedMotion) {
    document.querySelectorAll('[data-anim]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    document.querySelectorAll('[data-flip]').forEach((el) => {
      el.textContent = el.getAttribute('data-flip');
    });
  }
})();
