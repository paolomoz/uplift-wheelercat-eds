# Wheeler Cat — EDS conversion log

## Audit

One prototype: `home.html`.

Sections (in document order under `<main>`):

| # | First class    | Tag       | Notes |
|---|----------------|-----------|-------|
| 1 | `hero`         | `<section>` | Compact Track Loader background, REDEFINING / COMMITMENT two-tone headline, white pill CTA |
| 2 | `finance`      | `<section>` | 3-card grid; Cat-yellow eyebrow on cards; data-flip numerals on card 1 (60 / 500) |
| 3 | `services`     | `<section>` | 6 service tiles; image-fade-on-hover via BEM modifier classes; yellow Browse More CTA |
| 4 | `blog-cards`   | `<section>` | 4 cards aspect-ratio 2:3, gradient overlay + Read More arrow; warm-stone background |
| 5 | `brand-logos`  | `<section>` | 5 partner logos in a 5-col grid; grayscale → color on hover |
| 6 | `locations`    | `<section>` | Yellow eyebrow band + proof paragraph + 15-branch grid + More link; dark ground |

Header (above main): yellow `utility-strip` + dark `site-header` (logo + 4 verb dropdowns + phone) + `mega-nav` (10 dept links).
Footer (below main): 4-column `site-footer`.

Above-fold fonts: Roboto, Roboto Condensed, Oswald.
Icon font: icomoon (custom, ships in `assets/fonts/icomoon.ttf`).

## Name + reuse decisions (LOCKED)

Single-prototype run — no cross-page reuse questions apply.

| Block | Rationale |
|---|---|
| `hero` | Matches `<section class="hero">`. |
| `finance` | Matches. |
| `services` | Matches. |
| `blog-cards` | Matches. |
| `brand-logos` | Matches. |
| `locations` | Matches. |

No `closing` block here — Wheeler home doesn't end with a generic CTA section; the closer is `locations`.

## Foundation tokens

Lift from prototype `:root` (lines 100-148 of the inline `<style>`):
- Colors: `--color-page` `#FFFFFF`, `--color-body` `#454545`, `--color-heading` `#272727`, `--color-cat-yellow` `#FFCC00`, `--color-cat-yellow-hover` `#E6B800`, `--color-surface-dark` `#272727`, `--color-surface-dark-hover` `#1A1A1A`, `--color-warm-stone` `#E5E3DF`, etc.
- Font sizes: `--fs-100` through `--fs-381` (modular scale ×1.25). `--fs-monogram` for the hero typographic device.
- Spacing: `--sp-xs` (4px) through `--sp-section` (64px).
- Radii: `--r-primary` (5px), `--r-card` (8px), `--r-pill` (999px).
- Layout: `--container-max` (1400px), `--grid-gap` (24px).
- Easing: `--ease-out`, `--ease-out-expo`.
- Fonts: `--font-display` (Roboto Condensed), `--font-body` (Roboto), `--font-icon` (icomoon).

## Fonts to self-host

| Family | License | fontsource pkg |
|---|---|---|
| Roboto | Apache 2.0 | `@fontsource-variable/roboto` |
| Roboto Condensed | Apache 2.0 | `@fontsource-variable/roboto-condensed` |
| Oswald | OFL 1.1 | `@fontsource-variable/oswald` |
| icomoon | Custom (no redistribution issue — internal icon font) | vendored from prototype assets |

Body uses Roboto (sans-serif) → metric-matched fallback is Arial. Override `@font-face "Arial"` with calibration from `@fontsource-variable/roboto`.

## Open carryover for run 002

- Hero supporting copy uses `<span class="hero__sup-accent">` for yellow accents on flow words ("PARTNER WITH WHEELER", "GUARANTEED PARTS..."). DA cell normalization strips `<span class>` — for this run, the supporting copy stays in the block's authoring shape as plain text; accents bake into block CSS via `:has()` or sibling combinators (TBD).
- Service tile and blog card background images are bound to BEM modifier classes (`.service-tile--field`, `.blog-card--maint`). Authoring them would require parallel CSS; for now they bake into block CSS.
