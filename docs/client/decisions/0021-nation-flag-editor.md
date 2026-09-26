# ADR 0021 — Flag design during nation creation

Status: Accepted and implemented

Date: 2026-09-25

## Decision

The identity step opens the existing Flag Editor in a large native dialog. `identity-lab/editor.js` owns each editor instance; `main.js` supplies the standalone experiment's navigation and language controls. The creation feature loads the editor lazily and owns its dialog through the identity step's Scope. It reuses Button, Panel, FieldShell, RangeField, semantic tokens and the existing canvas recipe engine.

The dialog edits a private recipe copy. Use this flag compiles a single immutable snapshot and commits its PNG File and recipe together into `NationCreationProcess`. Cancel, Escape, step disposal and late rendering never apply the local copy. The editor is inert while compiling; a revision check also rejects outstanding imports that finish during compilation. The opener receives focus after closing. Wizard navigation and rejected submission retain the accepted draft. Ordinary upload/removal clears the recipe. Nation colours remain independent.

The existing multipart submission carries `flag_design` JSON with `nation_flag`. `FlagDesign` validates supported versions, exact data keys, geometry, symbols, custom paths and resource limits. A supplied recipe requires a PNG master at 900×600. The existing image service creates the 300×200 gameplay image, and the existing creation transaction saves nullable `nation_details.flag_design`. Failed finalization rolls back the recipe and removes files written by that attempt. Later turn replication retains the recipe with the flag.

The server checks the data and image format/dimensions; it does not independently render the recipe or prove pixel equivalence. The browser compiles both from one snapshot, covered by a pixel comparison check. Imported SVG remains normalized data, never mounted markup. Keep PHP validation aligned with `recipe.js`, with cross-language tests for bundled templates, supported versions and imported symbols.

## Boundaries

The local studies shelf remains browser storage and does not itself assign a nation flag. Only Use this flag updates the wizard; only final creation writes the nation. The standalone development experiment remains available. Existing `flag_src` consumers keep displaying PNGs; no public recipe read API, new game-data store, post-creation editor, division grant or compatibility switch is introduced.

The migration is supplied for the operator to run; verification used only the guarded temporary database. See the progress journal for the actual checks and remaining deployment step.
