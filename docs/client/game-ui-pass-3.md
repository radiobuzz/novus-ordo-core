# Game UI pass 3 — experimental unit control

Date: 2026-09-20

Status: Implemented in the new `/client`, not the classic SPA. Visual style and interaction thresholds remain revisable. See [ADR 0012](decisions/0012-unit-control.md).

## Trying it

- Open World → Military. Right-button drag pans; left-button drag selects active own units. Shift-drag adds; Shift-click toggles a miniature (or the units represented by a distant stack). Wheel and keyboard map navigation remain available. Touch retains one-finger pan, pinch zoom and tap selection; Forces supplies the accessible checkbox list.
- Zoom in to expose existing divisions as miniatures. Distant/crowded groups retain counts. `+` indicates accepted pending deployments; `◇` indicates unsubmitted ghosts. Pending/ghost units are not selectable active divisions. Selection survives zoom and ordinary refresh.
- Military → Appearance switches between Miniatures and Flat counters, with paint/uniform and aircraft-trim colour inputs. These are local per-game visual preferences, not new persisted nation identity fields.
- Deploy → select a unit type → click eligible territories. Each click adds one local ghost. Types and territories can be mixed. Confirm deployment sends one existing batch request; Undo last and Clear draft change only the preview. A native “Place using a list” alternative supports destination and quantity entry for touch/keyboard, followed by Add to preview and the same Confirm button.
- The catalogue subtracts the complete draft from the shared resource pool. Costs and additional upkeep are previewed. The draft is capped at 100 entries, matching the previous client-side per-request limit; this is not a new backend rule.

## Boundaries and ownership

No new unit types, real-time mechanics, microcell positioning, movement rules, resource rules, permissions, schema or backend code. Sprites depict the five existing types. An arrangement within a territory is visual only; it does not change travel distance. Generated-map slots use land-cell centres, not offshore region-centre positions where land slots are available. Dense/very small island territories can remain grouped even at close zoom. Classic territories currently provide nine slots; generated territories use up to their available land cells. No enemy-private data is introduced.

`ui/map/MapInteractions.js` adds right-button panning and optional rectangle callbacks to the existing shared viewport. Drawing and picking use the same pure `unitLayout.js` result; `militaryOverlay.js` composes markers, sprites and existing order lines. The feature owns mode and selection meaning. `UnitSprites.js` owns scope-bound image loading and a bounded recoloured-surface cache; failed images fall back to labelled flat tokens.

`features/world/DeploymentBrush.js` is feature-local composition of ImageChoice, Button and native fields, not a new universal control. The pure helpers in `services/militaryCommands.js` calculate preview validity/costs from current server metadata. `GameplayService.deploymentDraft(snapshot)` owns an in-memory, game/nation/turn-scoped draft (`entries`, monotonic local `nextId`). World and its saved view metadata do not publish private drafts to localStorage. Accepted local IDs are removed by the service even after navigation; newer IDs survive. Rejected/uncertain drafts remain for review, with existing no-automatic-retry and stale-data gates. Local draft IDs are never API fields. Turn changes clear incompatible drafts; session loss clears the service's draft reference.

The existing endpoint already accepts mixed types/territories and validates eligibility and combined affordability before creating requests. This pass does **not** add a database transaction, concurrency lock, operation ID or atomicity guarantee. Existing uncertain-outcome recovery remains important. The durable rollback/reset-context gap documented in the [shared-data plan](live-data-plan.md) is unchanged.

## Artwork and palette contract

Five new transparent PNG masters live in `resources/js/client/assets/units/miniatures-v1/`. Their [asset notes](../../resources/js/client/assets/units/miniatures-v1/README.md) contain the complete prompts; the built-in image-generation tool was used. Original catalogue WebP assets are unchanged. The source masters remain intact and the runtime creates small cached coloured surfaces; there is no 3D engine.

`unitPalette.js` uses the portrait compositor's luminance-ramp principle without importing the portrait feature or changing its rendering. V1 material masks use the authored olive hue range for uniforms/paint and warm aircraft trim. Alpha, shading and non-target skin/wood/neutral metal remain unmodified by the ramp. This is provisional colour-key masking, not a claim of precise hand-authored material segmentation. Some ambiguous edge/material pixels may need authored masks in a later art pass. Paint and trim inputs are validated six-digit colours; neutral original metal and separately drawn shadows are not blanket-tinted.

Source masters currently add about 5.3 MB before HTTP compression/caching. Smaller delivery variants, exact material masks, adjustable miniature sizes and more sophisticated dense-stack expansion can follow playtesting. Flat counters are already an in-game alternative, independent of selection and orders.

## Verification

- Production build, generated-client and PHP no-database contracts pass. All 20 existing Node test files passed; new unit-control contracts and focused gameplay/store/live-data reruns cover combined budgets, stable layout/picking, density fallback, palette alpha/protected pixels and accepted-ID cleanup.
- Existing 37 Chromium client/entry/foundation/HUD/command/live-data scenarios passed after adapting the deployment helpers to preview → confirm. New scenarios cover near-zoom click/Shift/rectangle selection, right drag, colour/style changes, mixed drafts, rejection, invalidated budgets, French mobile controls, newer in-flight placements, navigation during submission, and generated-map land slots/aircraft.
- Real isolated classic game 34 and generated-map game 35 passed two types across two territories, exact Capital/Ore deductions, no server mutation for ghosts, pending vs active separation, next-turn production, and persistent main canvas. No live game/account was mutated.
- Existing full World-command journeys also passed on isolated classic game 36 and beta game 37: deployment/cancellation, real map picking, movement/cancellation, disband/cancellation and mobile. The temporary PHP/database fixture services were stopped afterward.
- Source recovery archive: `/tmp/no7-unit-control-GvCdWR/source-before.tar.gz` covers client/tests/client docs before this pass, not a full application/database backup.
- Final finished-build Chromium run: all 43 scenarios passed together. Temporary browser fixture host stopped automatically.

Chromium/emulated touch only, not physical-device or cross-browser verification. This remains a first visual/control experiment; the art, masks, thresholds and density behaviour are not frozen future requirements.
