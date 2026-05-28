# Notes — 001 index (wheelercat-home)

## Phase: Capture

Source: local Stardust prototype at `/Users/paolo/stardust/uplift-wheelercat/proto/home/index.html`, served via `python3 -m http.server 8123` from `proto/home/`.

Fetched into `input/`:
- `index.html` (1457 lines)
- `lenis.min.css` (external CSS ref)
- `lenis.min.js` (external JS ref)

Assets folder at source: `assets/media/` (13 images), `assets/fonts/` (5 webfont files), `assets/logo.png`.

## Phase: Analyze

### Structural map

```
Line   Element                                       Role
─────  ────────────────────────────────────────────  ─────────────
4-81   <!-- stardust:provenance ... -->              STRIP
82-93  <noscript><style>...</style></noscript>       keep, head
94-97  <meta charset>, viewport, title, description  keep, head
98     <link rel="stylesheet" href="lenis.min.css">  → concat into template CSS
99-887 <style>...</style> (inline)                   → /styles/wheelercat-home.css
891    <a> skip-to-main                              keep, header fragment
894-912 .utility-strip                               HEADER FRAGMENT
914-991 <header class="site-header">                 HEADER FRAGMENT (main-header + mega-nav)
993    <main id="main">                              MAIN START

996-1011 <section class="hero">                      SECTION 1 — hero
1014-1041 <section class="finance">                  SECTION 2 — finance
1044-1080 <section class="services">                 SECTION 3 — services
1083-1120 <section class="blog-cards">               SECTION 4 — blog-cards
1123-1136 <section class="brand-logos">              SECTION 5 — brand-logos
1139-1162 <section class="locations">                SECTION 6 — locations

1164    </main>                                       MAIN END
1166-1214 <footer class="site-footer">               FOOTER FRAGMENT
1216-1257 <script>...</script> (UI a11y JS)          → /scripts/wheelercat-home-animations.js
1259    <script src="lenis.min.js">                  → /scripts/wheelercat-home-lenis.js
1260-1454 <script>...</script> (motion runtime)      → append to wheelercat-home-animations.js
```

### Section first-class summary (no collisions)

| First class    | Tag       | Disambiguator needed? |
|----------------|-----------|----------------------|
| `hero`         | section   | no                   |
| `finance`      | section   | no                   |
| `services`     | section   | no                   |
| `blog-cards`   | section   | no                   |
| `brand-logos`  | section   | no                   |
| `locations`    | section   | no                   |

### Block-level feasibility — five-check assessment

| Section      | Structure | CSS scope | Content | JS indep | Visual indep | Verdict |
|--------------|-----------|-----------|---------|----------|--------------|---------|
| hero         | pass      | pass      | pass    | **fail** | pass         | page    |
| finance      | pass      | pass      | pass    | **fail** | pass         | page    |
| services     | pass      | pass      | pass    | **fail** | pass         | page    |
| blog-cards   | pass      | pass      | pass    | **fail** | pass         | page    |
| brand-logos  | pass      | pass      | pass    | pass     | pass         | (would be block-OK alone) |
| locations    | pass      | pass      | pass    | **fail** | pass         | page    |

**JS independence failures all stem from one cause**: a single
`requestAnimationFrame` tick loop in the motion runtime (lines 1260-1454)
queries the whole document for `[data-anim]`, `.display-head .word`,
`[data-split]` elements and registers `IntersectionObserver`s for
`[data-countup]` and `[data-flip]`. Lenis smooth scroll is bootstrapped
once at the page level. The animation runtime is page-global by design;
splitting it per-section would require rewriting it.

**Recommendation: `page` (overlay)** — preserves the entire motion runtime
and Lenis integration. Slot the authorable text/images, keep all visual
chrome (gradient overlays, BEM-class background variants, animation
runtime) verbatim.

### Asset strategy

Source is local-only (`http://127.0.0.1:8123`). Per `methodology.md` §3,
the production preview host can't reach `localhost`, so options are
`vendor` or `da-media`.

**Chosen: `vendor`** (~1.3 MB media + ~150 KB fonts + lenis files). Copy
`proto/home/assets/` into `assets/wheelercat-home/` in the repo. Template,
fragments, and per-template CSS reference root-relative `/assets/wheelercat-home/...`.
DA cell `<img>` URLs (none in this run — hero bg is a background-image
slot which carries a URL, not a DA `<img>` cell value) would need absolute
branch URLs per `methodology.md` Generate §4.

### External libs

| Lib   | Source ref         | Strategy                                          |
|-------|--------------------|---------------------------------------------------|
| Lenis | `lenis.min.css`    | concat into `/styles/wheelercat-home.css` (top)   |
| Lenis | `lenis.min.js`     | vendor as `/scripts/wheelercat-home-lenis.js`     |

### Fonts

Vendored under `assets/wheelercat-home/fonts/` and referenced via `@font-face` rules already in the inline `<style>` block.

### Inline `<style>` and `<script>` to extract

- `<style>` (lines 99-887, ~789 lines) → `/styles/wheelercat-home.css` with Lenis CSS prepended
- `<script>` (1216-1257, UI a11y handlers) → top of `/scripts/wheelercat-home-animations.js`
- `<script>` (1260-1454, motion runtime) → appended to same file. Note: ordering matters — runtime runs after Lenis loads (separate `<script src>` between the two inline blocks). In the converted output, both `wheelercat-home-lenis.js` and `wheelercat-home-animations.js` are pulled by the substrate's `delayed.js` HEAD-probe; we'll need to ensure load order or merge.

### Strip list

- Stardust `<!-- stardust:provenance ... -->` comment (lines 4-81) — strip

### Decisions surfaced

1. **No section disambiguators needed.** All section first-classes are unique.
2. **No section tag rewrites needed.** All content sections already use `<section>`.
3. **Hero background-image is a slot.** The `.hero` element has `background-image: linear-gradient(...) url("assets/media/Compact_Track_Loader-...")` inline in the CSS. Approach: lift just the gradient into the page CSS, and slot the `.hero` element as a background-image slot. The DA cell value carries the image; runtime preserves the gradient by writing only the URL.
4. **Service/blog tile background images are NOT slots.** They use BEM modifier classes (`.service-tile--field`, `.blog-card--maint`) bound to CSS rules. Authoring would require changing CSS, not just content. Keep them template-baked for this run.
5. **Animation runtime preserved verbatim.** Lines 1216-1454 of source go into `/scripts/wheelercat-home-animations.js` (with Lenis vendored separately).
6. **No head-level links to lift** — the source's only head `<link>` is `lenis.min.css`, which we're concatenating into the template CSS instead.
7. **Hero CTA, finance-card CTAs, services footer CTA, blog-card click-through, locations 'View all' link** — all slotted as link slots.

### Differences from prior runs

(none — this is run 001)
