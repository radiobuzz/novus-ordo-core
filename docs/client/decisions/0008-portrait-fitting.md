# ADR 0008 — Separate portrait pools and landmark fitting

Status: Accepted direction; first lab implementation, art calibration remains experimental

Date: 2026-09-20

## Context

The expanded portrait lab exposed inconsistent accessory scale, hair alignment and unsuitable cross-pool choices. The user approved tuning before further expansion, explicitly requested separate male/female accessories, and clarified that a future “recipe” means asset-authoring instructions.

## Decision

- Keep this experiment in the local-only portrait lab; do not integrate character models or write game data.
- Give male/female pools separate hair, clothing and accessory binding IDs/settings. Reuse painted sources where appropriate without forcing identical calibration. Offer only the current pool's supported parts; facial hair is male-only in this fitted library.
- Measure a small set of landmarks once per face. Fit glasses to eyes, hair to scalp references and facial hair to nose/mouth/chin/jaw. Fit neckwear to garment collars, with explicit eligibility. Avoid a hand-maintained per-face × per-accessory adjustment matrix.
- Review through selectable comparison cards, small roster thumbnails and preview-only placement guides. Preserve existing game UI controls and feature ownership.
- Introduce v3 / `clean-digital-fit-v1` for changed placement and repaired glasses. Retain original v1/v2 artwork/rendering; imports never silently migrate. Explicit conversion creates an editable copy and leaves saved originals untouched.
- Maintain provisional authoring instructions separately from saved-character definitions. Finalize the production authoring recipe only after fit review and a new-asset trial.

## Consequences

Calibration is centralized and additions can declare their supported pools. Geometry does not solve arbitrary hairline, beard, collar or lighting mismatches: incompatible shapes still need different artwork or narrower compatibility. Distinct pool IDs increase catalog entries but need not duplicate image files. The library remains six authored faces, not a general anatomy/age/ethnicity generator.

## Alternatives

- Continue universal overlays: preserves all combinations, but repeats known fit and suitability problems.
- Tune every combination: flexible but grows a large maintenance matrix.
- Generate each complete portrait: useful as the existing custom-image path, but does not preserve modular recoloring and deterministic asset composition.

## Evidence and next step

Collection 03 addendum: the user requested twelve faces, twelve garments, tinted/dark/mirrored glasses and more accessories. Added immutable individual masters and measured metadata without changing shipped source art. Native lens controls serialize v4 `{finish,color}` settings; v3 stays clear and unchanged until an explicit lens edit. New garments may declare head-in-front compositing to keep rear collar tips off the face. The original garment/rendering path remains intact. This extends the accepted fitting direction; it is not gameplay integration or a new generic UI/data architecture.

See [portrait lab](../../game-design/portrait-lab.md) for source ownership, tests and remaining art limits. Review the supported combinations before expanding the library or freezing its authoring specification.
