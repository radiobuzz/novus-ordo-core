# Identity Lab — Flag Editor implementation plan

Date: 2026-09-23. Status: implemented as a flag-only experimental Lab. The user approved the six-composition visual proof and full-editor expansion. See the [implementation handoff](identity-lab.md) for delivered behavior, bounds and verification.

This is a new standalone experimental Lab module, not a game feature. All phases end at proving and evaluating the Flag Editor. Emblem editing, coat of arms editing and gameplay integration are outside this delivery.

## Problem and proof objective

The user reports that the game currently supports a flag, with the current single-colour presentation providing little visual identity. First prove that layered 3:2 flags can produce attractive, distinct, readable results using a chosen primary/secondary palette, then save those results as PNG while retaining editable JSON.

The experiment should demonstrate the potential improvement without replacing any live flag or changing game behaviour. A solid-colour reference beside each generated design at large and small sizes makes the comparison concrete. User visual evaluation is part of the proof; a successful build alone does not establish that the designs work.

This revision supersedes the earlier two-editor implementation scope. Research and possible future contracts for emblems and coats of arms are preserved in [deferred research notes](identity-lab-heraldry-research.md), not required by any active phase.

## Agreed module layout and scope

The Lab has exactly three visible tabs, in this order:

| Tab | First experiment |
| --- | --- |
| Flag Editor | Enabled and selected by default; the only implemented editor |
| Emblem Editor | Disabled, visibly marked “Later” |
| Coat of Arms Editor | Disabled, visibly marked “Later” |

The last two tabs have clear disabled semantics and cannot be opened by mouse, keyboard or a tab-state URL. They do not load editor code, artwork, previews, storage or an Armoria adapter. Use the project's tab/navigation conventions with accessible labels; disabled tabs must not rely on colour or a tooltip alone to explain availability.

Retain the proposed `/dev-panel/identity-lab` route and `resources/js/identity-lab/` module name so the shell can accommodate later experiments. Add a Tools & experiments entry and use the same development-only/guest-access boundary as Portrait Lab. No nation/game/session dependency, gameplay reads, backend upload, database migration, nation creation control or live-game mutation belongs to this work.

Lab colours are editable primary/secondary/supporting hex values. Independent randomization now generates monochromatic, analogous, complementary and split-complementary palettes instead of cycling through four presets; no colour-wheel UI is required. They represent design inputs only; there is no automatic nation-colour lookup or reservation.

## Flag Editor deliverables

- Fixed 3:2 canvas with a proposed 900 × 600 opaque PNG master and a 48 × 32 small preview, both derived from the same composition. Confirm the proposed pixel sizes during evaluation.
- Adjustable geometric layers: bands, crosses, diagonal crosses, triangles/chevrons, corner regions, circles and diamonds. Crosses/bands support independent widths and offsets; all geometry clips to the flag bounds.
- Twelve initial pattern families inspired by the reference: solid, vertical/horizontal bisection, vertical/horizontal triband, diagonal bisection, diagonal band, cross, saltire, quadrisection, horizontal stripes and a Y-shaped division (pall). These are starting recipes that expand into editable geometry, not twelve fixed pictures.
- Layer selection, colour, position, size, rotation where meaningful, duplication, visibility, removal and ordering. Exact inputs and move-up/down buttons make dragging optional. Preserve 3:2 output independently of individual layer transforms.
- Optional symbol overlays, including stars/crescents and selected vector symbols, with colour, scale, position, rotation and mirroring. Repeated symbols can be positioned in simple rows/rings. Placing a symbol on a flag does not require or enable either deferred editor.
- A compact bundled symbol picker and constrained local SVG symbol import. The geometry proof must work without a large artwork collection; do not make a 150-symbol/heraldry inventory a prerequisite. Grow the initial symbol set only as flag examples justify it.
- Six repeatable generated alternatives, with locks for palette, base pattern and chosen symbol/placement. Generation uses composition-aware placement and contrasting supporting colours, preserving locked choices.
- Bounded undo/redo, explicit browser-local saves, JSON import/export and flag PNG download. No standalone emblem/coat-of-arms output or linked multi-design project in this revision.

Exclude shield templates, wreath/supporter composition, heraldic language/blazon parsing, historical validation, text/motto editing, cloth animation, arbitrary vector drawing, AI generation, collaboration/cloud storage and production integration. A supplied decorative SVG can still be used as a flat symbol layer if it meets the import contract.

## Primary reference and reuse evaluation

[Dan Carter's “ProcGen Fun 8: Fun with flags”](https://codingblog.carterdan.net/2026/05/26/PGF-08/) is the primary implementation reference. Its documented C# generator uses twelve patterns, weighted colour choices, colour-adjacency restrictions, contrasting borders, variable proportions and pattern-dependent symbol placement.

Implement that approach in the existing plain-JavaScript stack. Before copying/porting code, inspect the linked source, record its revision and reuse terms, and distinguish adapted source from ideas implemented independently. The source licence was not established in the discussion. No .NET runtime, hosted generator, Svelte application or new production Node server is proposed.

Armoria remains a future emblem/coat-of-arms reference. Its renderer extraction and full artwork inventory are deferred, not dependencies of flag Phase 0. If a specific Armoria artwork file is useful as a flat flag symbol, assess and bundle that asset independently; this does not authorize adopting its generator.

## Recipe and PNG contract

Save one resolved flag design per recipe. Proposed envelope:

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `kind: "flag"` | Explicit format and supported design type |
| `rendererVersion` | Pinned flag rendering behaviour |
| `assetLibrary` | Stable ID/revision for any bundled symbol definitions |
| `name` | Plain text local study name |
| `palette` | Resolved primary/secondary/supporting hex values |
| `flag` | Fixed 3:2 format, opaque background and ordered geometry/symbol layers |
| `customAssets` | Validated normalized local vector symbols, embedded for portability |
| `generation` | Optional seed/preset provenance; never instructions to regenerate a saved flag |

Each layer has an explicit type/ID, finite bounded parameters, visibility and colour bindings. Colours reference primary/secondary/supporting slots or literal hex values. Changing the lab palette updates slot-bound layers and preserves literal overrides. Store pattern properties separately rather than encoding size, colours and position into a string.

Resolve all random/template choices before saving. Reopening a recipe renders its saved layers; it does not rerun the template. Do not add empty emblem/coat-of-arms fields, recursive project references or separate renderer versions for disabled features. Unsupported recipe kinds/versions fail without replacing the current draft.

Use SVG internally if useful, resolving symbols and geometry into a self-contained document before rasterizing to canvas. Prefix local SVG IDs for repeated symbols, preserve holes and aspect ratios, and resolve colours explicitly. No external font, URL, stylesheet or remote symbol dependency is allowed in the export composition. PNG output excludes guides, selection handles and interface backgrounds.

JSON owns editable intent; the saved PNG preserves the exact saved appearance. Never redraw stored PNGs automatically on reload or renderer/library updates. Preserve a stored image for viewing if its recipe cannot be edited, with an explanation. Migrations, if ever needed, create explicit copies. Same-browser pixel restoration can be verified; cross-browser byte identity is not promised.

## Symbol delivery and import

Start with procedural geometric symbols and a small useful selection from one source where practical. Existing candidate collections and font research remain in [the research notes](identity-lab-heraldry-research.md). Select by flag readability, not catalog size.

Package selected artwork plus names/categories/provenance into one versioned cached bundle, loaded only by the active Flag Editor. Avoid individual requests for every symbol thumbnail and exclude all deferred-editor assets. Measure compressed size and loading/render cost before expanding the collection. A few category bundles are acceptable only if measurements justify them. No icon-font dependency is assumed.

Keep required notices and attribution together in a maintained credits document/view and retain source information with recipes as applicable. The user's noncommercial intent remains recorded; asset packaging should not require manual licence management while editing.

Custom SVG import parses without mounting raw markup, allows documented vector shapes/transforms and supported local definitions, and rejects scripts, events, external resources, `foreignObject`, fonts, raster embeds and unsupported constructs. Normalize to data-only symbol definitions, preserve holes/transparency and prefix IDs. First-pass custom symbols are single-colour; do not build a multichannel artwork editor. Set explicit byte/node/path/asset-count/recipe limits using representative flag symbols before shipping. Rejected imports retain the working design and explain the unsupported content.

## Editor and local storage

Compose existing Button, Panel, FieldShell, RangeField, native controls and Scope. Use shared theme tokens, accessible names and EN/FR labels. Keep the tab shell, layer list, symbol picker and variation gallery feature-local; no general multi-editor framework is needed for disabled tabs.

Show the active large flag, its small preview, a solid-primary comparison and the relevant layer properties. On narrow screens, place controls after the preview without horizontal overflow. Keep keyboard access to all editing actions and label colour choices. Release listeners, object URLs and render caches on teardown.

Propose IndexedDB for an eight-study shelf, each record containing one recipe, one PNG blob, a revision and timestamps. Render from an immutable recipe snapshot, then commit JSON and PNG together in one transaction. A failed render/write keeps the old record. Edits made during a save remain visibly unsaved rather than being paired with an outdated image. Handle unavailable/corrupt storage without destroying records; file export remains available.

Export PNG and JSON from deliberate snapshots. JSON includes custom artwork but refers to a shipped library revision for built-in symbols; it does not preserve the bytes of an old PNG. Keep both files for an exact appearance archive. No portrait-storage refactor or ZIP dependency is part of this experiment.

## Implementation phases and proof gates

### Phase 0 — Flag composition proof

Inspect the flag reference source and document the adaptation decision. Prove a simple banded design, an offset cross/diagonal layered design and a symbol-overlaid design using primary/secondary colours. Demonstrate JSON → render → PNG → JSON reload, fixed 3:2 bounds and small-size readability. Record rough export time and payload size.

Gate (passed: user approved the compositions and full-editor expansion): show the examples next to solid-colour references and obtain the user's visual assessment before expanding to the full editor. Technical success alone is insufficient. Armoria extraction, shields and modern-emblem templates are not part of this gate. If the results are weak, refine the flag proof before expanding scope.

### Phase 1 — Flag recipes, geometry and PNG foundations

Implement strict validation, explicit layers/colour bindings, deterministic generation inputs, versioned assets and self-contained rendering. Add clipping, symbol transforms, import limits and portable custom assets.

Acceptance: all planned flag layer types round-trip; geometry is finite/bounded; unsupported versions/assets fail clearly; palette overrides behave correctly; repeated symbols retain their shapes and colours; exported PNG is opaque, 3:2 and free of editing guides. Keep fixtures for compatibility checks.

### Phase 2 — Lab shell and manual Flag Editor

Add the isolated route, Blade/Vite entry and Tools listing. Display the three tabs with Flag Editor active and the two future editors disabled. Deliver twelve pattern families, layer controls, a compact symbol picker, constrained SVG import, undo/redo and large/small/comparison previews.

Acceptance: manually create striped, offset-cross, Union-Jack-inspired and symbol-bearing flags with mouse and keyboard. Verify 3:2 output, layer ordering and narrow EN/FR layout. Disabled tabs cannot activate and fetch no feature assets. The Union-Jack-inspired design tests layered widths/offsets, not exact historical reproduction.

### Phase 3 — Variations, local saves and exports

Add six-sample generation and locks, composition-aware placement, the local shelf, and PNG/JSON export/import. Preserve locked palette choices and the current draft on failures.

Acceptance: generate → select → refine → save → reload → edit → export works for a flag with custom artwork. Fixed seeds/settings repeat; locks hold; JSON and PNG represent one revision; save/edit races cannot mismatch them; reload uses the stored PNG without rerolling.

### Phase 4 — Prove the experiment and document results

Complete focused checks and user visual review. Compare distinct designs using the same palette and different palettes at full size and 48 × 32; include solid-colour baselines. Assess recognizability, contrast, variety and editing friction. Document examples, limits, bundle measurements and whether the experiment demonstrates an improvement over a plain flag.

Acceptance: working Flag Editor only, two visibly disabled future tabs, reliable editable JSON/finished PNG pairs, no gameplay dependency or mutation, and recorded user evaluation. A successful Lab does not automatically enable deferred editors or initiate integration.

## Proposed source ownership and checks

Use `resources/js/identity-lab/` with focused `recipe.js`, `geometry.js`, `renderer.js`, `generator.js`, `templates.js`, `catalog.js`, `import-symbol.js`, `storage.js`, `main.js`, styles and bundled assets. All are flag-only in this revision; no `armoria-adapter.js` or deferred-editor modules are planned. Use `resources/views/dev/identity-lab.blade.php` for the standalone page.

Inspect/update `routes/web.php`, `vite.config.js`, the Tools lab inventory in `app/Http/Controllers/ClientController.php`, locale dictionaries, `tests/client/contracts.php` and the browser fixture server as needed. These are proposed integration points for a development tool, not game feature changes.

- Pure Node checks: recipe validation/round-trips, finite geometry, palette bindings, deterministic variations/locks, resolved templates and retained fixture compatibility.
- Browser checks: flag layers/transforms, keyboard controls, undo/redo, safe/unsupported imports, PNG dimensions/opacity, same-browser restored pixels, local save failures/races and disabled-tab behaviour.
- Resource checks: bounded cached symbol bundle requests, no external font/API/symbol calls, no deferred-editor assets and no Lab library requests during gameplay.
- Visual evidence: simple/complex flags, same-palette alternatives, symbol readability at small sizes, comparison to solid flags and narrow EN/FR layout.
- Implementation checks: targeted Node/Playwright suites, `npm run build`, `npm run check:client`, `npm run test:client:php`, and representative Portrait Lab/Tools regressions. Broaden for actual shared changes or failures. Use isolated fixtures; do not mutate live games.
- Record Chromium coverage explicitly; other browsers and physical devices require separate evidence.

## Deferred work and next step

Emblem Editor and Coat of Arms Editor remain disabled until separately requested and planned. [The research notes](identity-lab-heraldry-research.md) preserve Armoria, traditional/modern composition ideas, artwork sources and earlier multi-design storage considerations.

Game integration also requires a separate request and plan. This experiment does not replace current flags, read/write nation records, change colour selection or publish game assets. Its purpose is to prove the flag design experience first.

The original phased acceptance scope above is retained for context. Delivered defaults are a 900 × 600 PNG, 48 × 32 preview, 14 bundled symbols, constrained SVG import and an eight-study shelf. The user approved Phase 0 and expansion; subsequent feedback prioritized separate shapes/colours/emblem randomizers, algorithmic colour harmonies, direct dragging and Advanced controls collapsed by default. Final UI evaluation and any game integration are separate follow-ups; [the handoff](identity-lab.md) records implementation details and limitations.
