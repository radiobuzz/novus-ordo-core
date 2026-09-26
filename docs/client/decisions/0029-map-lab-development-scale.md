# ADR 0029 — Development scale and synthetic microcell inputs

Status: Accepted; implemented for visual evaluation

Date: 2026-09-26

## Context

The user accepted the development artwork as a checkpoint, but wants smaller cities and economic features, more breathing room and a closer relationship to the underlying microcells. This is a visual test, not adoption of population, construction or production rules.

## Decision

- Preserve each example's original plots and streets. Derive every projection from this checkpoint, never from a previously scaled result. **Restore scale checkpoint** restores the original geometry and disables synthetic inputs without changing built extent, activity, urban intensity or camera.
- Compare **Current / Half / Quarter** linear size at one fixed camera. Half size implies roughly one-quarter the parcel area; quarter size roughly one-sixteenth, before suitability exclusions. Separate **Structure size** changes buildings/equipment/pads without moving centres (fields and pits retain their size); **Structure spacing** moves centres independently. Overall scale also changes tracks and ground clearing.
- Reuse RangeField, Scope, native details/select/checkbox controls and existing painted assets. Keep this composition local to `development-scale-controls.js`, not a new shared widget. Optional `development-cell-renderer.js` indicators have exact readable counterparts in the cell selector and inspector. Study guides can be hidden without disabling test data.
- `development-scale.js` owns per-example synthetic cell records: development allowance and urban intensity. Allowance caps the sum of parcel footprint area in each touched microhex. Exact polygon/hex intersections charge a crossing parcel to both cells; candidates exceeding any allowance are omitted whole rather than cut at a hex edge. Cell intensity modulates the existing central-to-outskirts architecture gradient. These records are deliberately independent between examples, not a shared authoritative game-cell ledger.
- Test new placements against existing land, snow, slope, rivers and initial extraction deposits. River-bank clearance stays tied to river width, not building scale. Omit unsuitable or overlapping candidates rather than modify geography. Rejected cells remain inspectable, including a cell whose allowance was set to zero. The exact old checkpoint bypasses the stricter new projection checks so it remains restorable.
- Report parcel area only: decorative roads, feathered clearing margins and sprite shadows are excluded. Reserve allowance independently of built extent, then reveal accepted parcels through the existing growth control. Zero allowance also excludes crossing decorative tracks. This is not an exact land-cover or facility-capacity measurement.
- Use the projected layout for both artwork and landscape clearing. Add the layout revision to the decorated surface key, retaining natural ground caches. Activity remains independent of layout and clearing; idle extraction retains structures. Keep generator/seed/options, geographical atlas, military/economy accounts and administrative edits unchanged.

## Limits and verification

Values are temporary and reset on reload, regeneration or resolution change. Restoring the checkpoint disables but retains edited synthetic values until those resets. Whole-parcel allocation may leave allowance unused; counts can change under scaling as terrain or resource suitability changes. Cross-cell membership is geometric, while interior terrain sampling remains heuristic. Roads are decorative and may be disconnected. Painted building heights and nominal map distances do not establish metric scale.

Pure checks cover clipping conservation, non-cumulative restoration, independent size/spacing controls, allowance limits and zero-cell exclusion, architecture intensity, unchanged geography/activity and all study types at 7/19/37 resolution. Fixture browser checks cover fixed-camera comparison, optional guides, clearing/cache coherence, all study types, exact/keyboard input, narrow layout and regeneration alongside the existing experiments. Execution evidence belongs in the progress journal. No new asset, dependency, backend command, persistence or Node runtime service is introduced.
