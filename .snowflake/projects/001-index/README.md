# 001 — index (uplift-wheelercat-home)

Source: local Stardust prototype at `/Users/paolo/stardust/uplift-wheelercat/proto/home/index.html` (served via `python3 -m http.server 8123` from `proto/home/`).
Generator: Stardust prototype (variant A-rich, iteration 2: lenis + C-cinematic hero).
Captured: 2026-05-28
Target: `paolomoz/uplift-wheelercat-eds` at DA path `/index`
Template: `wheelercat-home`
Conversion level: page (overlay)
Asset strategy: vendor

Status: round-trip complete, ready for closure

## URLs

- Local preview: http://localhost:3000/drafts/wheelercat-home-index
- Production preview: https://main--uplift-wheelercat-eds--paolomoz.aem.page/
- Live: https://main--uplift-wheelercat-eds--paolomoz.aem.live/
- DA editor: https://da.live/edit#/paolomoz/uplift-wheelercat-eds/index

## What was generated

- `templates/wheelercat-home.html` — `<main>` with 33 `[data-slot]` markers across 6 sections
- `fragments/wheelercat-home/header.html` — utility strip, sticky header (logo + 4 verb dropdowns + phone), mega-nav
- `fragments/wheelercat-home/footer.html` — 4-column footer (brand, quick links, contact, social)
- `styles/wheelercat-home.css` — Lenis CSS + the prototype's ~788 lines of inline page CSS (asset paths rewritten to `/assets/wheelercat-home/...`)
- `scripts/wheelercat-home-animations.js` — UI a11y handlers + the prototype's motion runtime (lenis-bootstrap, `[data-anim]`, `[data-flip]`, `[data-countup]`, `.display-head` word reveals)
- `scripts/wheelercat-home-lenis.min.js` — vendored Lenis 1.x
- `assets/wheelercat-home/` — vendored fonts, media, logo (~1.5 MB)
- DA source body at `output/da/index.html` — 6 section divs with slot rows + metadata block

## Findings

See `learnings.md`.
