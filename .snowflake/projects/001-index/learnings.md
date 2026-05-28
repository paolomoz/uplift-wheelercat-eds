# Learnings — 001 wheelercat-home

## 2026-05-28 — Extracted CSS must NOT include the source's `<style>` opening tag

**Context.** Phase 3.5 (extract inline `<style>` to `/styles/<template>.css`)
used `sed -n '99,887p'` to slice the source. Lines 99 and 887 are the
literal `<style>` and `</style>` HTML tags, not CSS content. Both
ended up in the extracted file.

**Visible symptom.** Lint passed, file was 790 lines on disk, drafts
rendered with full styling locally (because the `<style>` line was
"benign" inside a `.css` file when viewed in some contexts — actually
turned out: browsers parsed `<style>` as an invalid CSS selector and
silently aborted parsing the rest of the file. Local dev server may
have been more tolerant; production aem.page wasn't). First production
load was an unstyled page even though all artifacts returned 200.

**Fix applied.** `sed -n '100,886p'` — slice the INNER content of the
style block, not the wrapper tags.

**Generic rule** [promoted]. The Phase 3.5 self-check should grep
the extracted CSS for `<style>`/`</style>` tokens and fail loudly if
present. Worth adding to `phases/3-generate.md` §3.9 self-checks:
```bash
grep -nE "<\/?style" "$PROJ/output/styles/$TPL.css" && echo "FAIL: HTML tags in CSS" || echo "OK"
```

---

## 2026-05-28 — playwright-cli binary not on PATH

**Context.** `scripts/dom-equality.mjs` calls `spawnSync('playwright-cli', ...)`.
On this host (macOS, nvm node 25.2.1) only the `playwright` npm CLI was
installed, not the legacy `playwright-cli` binary used by the script.
The script errored: `playwright-cli not on PATH: spawnSync playwright-cli ENOENT`.

**Workaround for this run.** Wrote a 20-line `chromium.launch()` script
that captured the same invariants (`main.dataset.overlay`, section
count, slot values, console errors).

**Generic rule** [promoted]. The bundled `dom-equality.mjs` could
fall back to the `playwright` npm package when `playwright-cli` is
absent, or the skill prereq documentation could note the dependency
explicitly. Filing as a learning rather than a substrate change.

---

## 2026-05-28 — AEM Edge Delivery URL normalization converts `_` to `-`

**Context.** From a separate prior import attempt (not this snowflake
run): an asset uploaded to DA as `Compact_Track_Loader-3b9bd4.webp`
was probed by `admin.hlx.page/preview` as `compact-track-loader-3b9bd4.webp`
and 404'd until the file was renamed to use hyphens.

**Relevance to snowflake.** For the `vendor` asset strategy used here,
this didn't bite us — Code Sync serves files from git at the EXACT
path they're committed, no rename. The bug only surfaces for the
`da-media` strategy where DA admin handles the file path. Worth
documenting in `knowledge/methodology.md` §3 asset strategies as a
caveat for `da-media`.

[promoted]

---

## 2026-05-28 — BEM-modifier-driven background images are not directly slottable

**Context.** Service tiles (`service-tile--field`, etc.) and blog cards
(`blog-card--maint`, etc.) carry their hero photos via CSS rules tied
to the variant class:
```css
.service-tile--field::before { background-image: url("..."); }
```
Making the image authorable would require either:
(a) changing the CSS rules at author time (out of scope for snowflake), OR
(b) refactoring the source markup to put the background-image inline
    style on the `::before`'s parent element so it becomes a
    background-image slot per the substrate's writer.

**Decision for run 001.** Kept template-baked. Authors edit the
tile/card titles only; image swaps require a code change.

Not promotable — this is a per-input authoring choice.
