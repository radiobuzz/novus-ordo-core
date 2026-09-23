# Identity Lab — deferred emblem and coat of arms research

Date: 2026-09-23. Status: retained research and design notes, not an implementation plan or authorization. The [active plan](identity-lab-plan.md) implements only the experimental Flag Editor. Emblem Editor and Coat of Arms Editor remain visible but disabled.

These notes preserve the earlier discussion so future work can resume without repeating discovery. Upstream capabilities below were established through documentation/source listings during discussion, not by running or integrating the projects. No Armoria adapter or artwork library has been installed by this planning work.

## User direction retained for later

- Support both traditional heraldry and modern national emblems when these experiments resume.
- Use primary and secondary colours, ordinarily matching a nation in a hypothetical game integration, with optional supporting colours and an independent colour for each symbol.
- Offer templates and a broad, varied symbol bank rather than a UI-icon collection. A future coat of arms could itself become an element on a flag.
- Avoid hundreds of separate icon fetches and manual per-file licence handling in the editor. Prefer a bundled, cached catalog with aggregated credits/provenance.
- Use JSON for editable composition and flattened PNG for final display. SVG/font artwork may be used internally without dictating the game's display format.
- The game has no planned commercial release. Noncommercial artwork is a candidate; applicable attribution/notices still travel with the source/assets.
- Latest scope correction: the game currently supports a flag; prove flags first. Neither future editor is needed to place an ordinary vector symbol on a flag.

## Armoria — leading future reuse candidate

[Live editor](https://azgaar.github.io/Armoria/) · [Repository](https://github.com/Azgaar/Armoria) · [Tutorial](https://github.com/Azgaar/Armoria/wiki/Armoria-Tutorial) · [API source/documentation](https://github.com/Azgaar/armoria-api)

Armoria is a JavaScript/TypeScript heraldry project with Svelte used for the editor interface. Its documented workflow includes generated galleries, manual editing, selectable shield/banner shapes, custom colours, uploads and locking choices while regenerating other parts. SVG charges can expose primary, secondary and tertiary colour channels. The API accepts explicit COA definitions as well as seeded generation and normally renders SVG.

Potential reuse: a pinned local generator/renderer/artwork subset behind a small adapter to the existing plain-JS client. The whole Svelte application or a hosted API is not required by our preferred direction. The source advertises MIT code, CC0 simple artwork and complex WappenWiki artwork with noncommercial terms; inspect individual notices when selecting files rather than treating the code licence as the artwork licence.

Questions to investigate only when future editor work is authorized:

1. Can the renderer/generator operate without editor stores, DOM globals and Svelte lifecycle assumptions?
2. Can custom primary/secondary colours map cleanly onto its colour channels and generation rules?
3. How much code/artwork must be retained for the intended subset, and what is the compressed bundle/render cost?
4. How well do its primitives support modern shieldless arrangements, wreaths and circular badges?
5. Can symbols be normalized and bundled without external requests, ID collisions or unintended colour changes?
6. Are the GUI modules or API modules the smaller reuse boundary? Do not assume the API is a drop-in browser library.

A proposed evaluation would render a traditional shield, a shieldless symbol and repeated recolourable charges, then prove JSON → composition → PNG → JSON reload. It belongs to a future plan, not flag Phase 0. If extraction needs substantial framework/global-state rewriting, record that evidence and reconsider which primitives/artwork to reuse rather than silently building a general heraldry engine.

## Useful discussions and related implementations

- [Armoria: rework patterned field representation](https://github.com/Azgaar/Armoria/discussions/174): users requested independent pattern size and position, exposing limitations of a compact string format and the risk of breaking saved links. Design lesson: keep pattern, colour, scale and position in separate properties and version the recipe.
- [Armoria API seed documentation](https://github.com/Azgaar/armoria-api): seeded appearance is stable only while generation code stays the same. Design lesson: save resolved choices, not a seed as the identity. This already applies to the active flag plan.
- [Armoria discussions](https://github.com/Azgaar/Armoria/discussions) and [the author's procedural-generation announcement](https://www.reddit.com/r/proceduralgeneration/comments/kg6x9u/): places to revisit for practical user feedback and extension requests. The announcement was found through search; its full Reddit page could not be retrieved during discussion.
- [Heraldicon](https://github.com/heraldry/heraldicon): a more ambitious heraldic data/rendering system, including formal descriptions and style differences. Useful as a modelling reference; its broader scope is not required for a simple Lab. Code is listed as GPL-3.0 and published artwork has its own attribution metadata.
- [Heraldry Weaver](https://github.com/obsidian-ttrpg-community/heraldry-weaver): documented layered charge groups with colour/count/arrangement/position/scale/rotation/mirroring and output on shields or 3:2 flags. Background divisions extend to the output boundaries while charges retain their proportions. Useful precedent for future shared design ingredients; not tested locally or selected as a dependency.
- [ProcGen Fun 8](https://codingblog.carterdan.net/2026/05/26/PGF-08/): C# flag generator with weighted colours, twelve pattern families and composition-aware symbol placement. This remains the active Flag Editor reference; its approach can be implemented in JavaScript. Source revision/reuse terms must be inspected before copying code.

## Artwork and font research

| Candidate | Findings from discussion | Potential role |
| --- | --- | --- |
| [Game-icons.net](https://game-icons.net/) and [SVG repository](https://github.com/game-icons/icons) | Thousands of individually downloadable SVGs, tagged website, bulk downloads, repository folders by artist; game symbols rather than solely UI icons | Varied animals, plants, objects, abstract symbols; select silhouettes that read as flags/emblems |
| [Traceable Heraldic Art](https://heraldicart.org/) and [lion examples](https://heraldicart.org/lion/) | Subject-based catalog with individual variants/SVG downloads and bulk archives; mixed sources/terms | Traditional heraldic animals, ornaments and shield material; inspect selected items' notices |
| [RPG Awesome](https://nagoshiashumari.github.io/Rpg-Awesome/) | Font/CSS collection advertising 495 fantasy symbols, including animals, crowns, plants and astrology | A compact ready-made font candidate if its visual vocabulary fits; not selected |
| [Game Icons font conversion](https://github.com/toddfast/game-icons-net-font) | Community conversion of Game-icons.net artwork into a font | Candidate for broad single-file glyph delivery; current coverage and notices need checking |
| Armoria's own catalog | Heraldic charges with declared colour channels and original provenance | First artwork candidate when evaluating coat of arms reuse; no wholesale adoption assumed |

Collections of individual SVGs do not require one request per symbol. A versioned SVG sprite or vector-data bundle can deliver many named symbols together, while retaining paths suitable for recolouring and raster export. Fonts also reduce requests but do not remove artwork attribution obligations, and portable composition requires resolving the actual glyph shape/font. For this project, one bundled vector library is the preferred candidate; measure actual size before choosing packaging.

Game-icons' [FAQ](https://game-icons.net/faq.html) describes author attribution through a credits page. Preserve the applicable terms for whichever assets are selected; do not infer one blanket licence across unrelated sources. The user wants this handled by the project, not imposed as an editing workflow.

An SVG extension alone does not guarantee useful recolouring: silhouettes often need one fill, while outlined heraldic animals can need preserved outlines/holes and multiple colour regions. Normalize deliberately. The previous proposal of at least 150 selected symbols was a tentative catalog target, not a user requirement, and has been removed from the active flag proof.

## Future template directions

The user chose both traditional and modern styles. A useful provisional distinction for the disabled tabs is:

- Emblem Editor: shieldless symbols, circular badges, wreath/sunburst arrangements and modern national emblems.
- Coat of Arms Editor: selectable shield outlines, divided fields, heraldic charges and optional surrounding ornaments.

This distinction still needs review when those tabs are activated; avoid implementing a shared multi-editor framework in anticipation.

Traditional building blocks considered: pointed/rounded/square-topped/oval shields; solid/vertical/horizontal/diagonal/quartered fields; a large central symbol, repeated groups, paired symbols or one symbol per quarter. Shield shape and content layout should be independent choices.

Modern building blocks considered: one strong shieldless symbol, a circular arrangement, a symbol within a wreath, or a sunburst framing the centre. Supporting white/black/gold/silver can improve contrast while retaining primary/secondary identity colours.

Surroundings such as crowns, animals, helmets, mantling and motto ribbons would follow after basic compositions look good. Strict heraldic correctness and blazon parsing were not requested. Generation can prefer contrast and balanced layouts while manual editing allows modern combinations.

The earlier first-delivery suggestion of three traditional and three modern templates is now deferred. These are future candidates, not acceptance criteria for the Flag Editor.

## Future composition/storage considerations

The previous two-design proposal stored `flag` and `emblem` in one project recipe, with the flag referencing an immutable embedded emblem definition. It paired that JSON with two PNGs in one atomic local record. The user has now requested separate future Emblem and Coat of Arms tabs; a combined project schema must be reconsidered then rather than frozen today.

Principles worth retaining:

- A flag using a saved emblem should capture the artwork/definition needed for that revision rather than point at a mutable shelf item that could silently change it.
- Keep resolved colours, placements, layer order and stable artwork versions. Generation seeds are provenance only.
- Flatten each final output to PNG. Keep internal vector artwork self-contained and namespace repeated definitions.
- A square transparent PNG canvas, tentatively 600 × 600 with padding, could hold an emblem or shield without stretching its proportions. This is a future proposal, not an active output requirement.
- Save all images and their recipe from one immutable snapshot if a later project contains multiple outputs. Handle failed/asynchronous saves without mixing revisions.
- Do not redraw saved PNGs automatically after upstream changes. Explicit migrations should create editable copies and preserve previous appearance.

The active plan intentionally uses only a flag recipe and one PNG. No blank emblem fields, coat-of-arms renderer, future output files or dependencies are needed to preserve these ideas.

## Resuming later

Only a separate user request enables either deferred editor. Start by reviewing these notes, current upstream source/terms and the results of the flag experiment, then write a focused implementation plan. Decide whether shared controls or rendering boundaries have real reuse at that point. Gameplay integration remains a separate decision even if all three Lab editors eventually exist.
