# Portrait laboratory — first compositing study

Date: 2026-09-20. Status: fitted proof of concept with collection 03 (39 new individual assets) and adjustable lens finishes; artwork and contracts remain experimental.

Open `/dev-panel/portrait-lab`, or use the link in the development panel / new administration Developer tools. Like the map lab, it permits guests only when `APP_ENV=development`. It makes no game API requests and has no server upload or persistence endpoint.

## What to try

- Choose the female or male pool: each now offers nine faces, six hairstyles plus bald, twelve garments and six frame designs. Each owns separate garment/accessory IDs and fitting settings, even when it reuses the same painted source. Facial hair is male-only (seven styles). Neckwear has seven designs, filtered by the selected collar: open blazers support ascots/cravats; the buttoned suit and female field shirt support ties/bows too.
- Switch **Lens finish** between clear, color tinted, dark/black and mirrored. **Lens tint color** controls tinted and mirrored material. The fill follows the frame's measured lens contours and eye registration, and is drawn underneath the frame; it never recolors the whole face. These settings are saved/exported explicitly.
- Select a palette or change fabric, accent, hair and background colors independently. Fabric/hair recoloring maps painted luminance through a material-specific color ramp, retaining alpha, shadows and highlights. The blazer shirt is masked out of fabric tint; officer shoulder trim and the tie use the accent color. The masks are prototype art definitions, not final production masks.
- Inspect individual layers, and compare the main portrait with its small roster preview. PNG export always exports the complete 512 × 600 portrait, even when inspecting a single layer.
- Use **Fit comparison** to compare the current parts across the selected pool's faces, or every compatible part in a category on the current face. Cards show large and clean roster-size portraits and can be selected to edit. **Show placement guides** overlays labelled landmarks on the main/comparison previews, never saved definitions, roster thumbnails or exported PNGs. Expand **Placement landmarks** for their numeric equivalents.
- Generate six repeatable samples from a seed, population mix and palette, then select one to edit. The default **Even mix · all 18 faces** includes the complete library. The seven original population profiles retain their earlier face distributions, including the six-face even mix. These are illustrative weights, not representations of actual nations or ethnic groups. Manual choices remain independent. There are now ten palettes and twelve hair-color swatches, plus the existing custom color controls.
- Save up to eight studies in the current browser, reload one, or export/import JSON. Saves are explicit; the current unsaved editor state is not restored automatically. Removing a shelf entry affects that local saved copy only. Keep exported files for a portable copy; browser storage is not a backup.
- Import a custom PNG/JPEG/WebP (up to 10 MB / 24 megapixels), adjust crop/zoom with sliders or exact values, and export it. Uploads are decoded locally and normalized to at most 1536 pixels on the longest side. The normalized image and crop are embedded in custom JSON recipes. No external image URL is accepted and no image is sent to the game server. Custom images replace the whole portrait; modular controls are disabled in that mode.

## Source and ownership

| Source | Responsibility |
| --- | --- |
| `resources/js/portrait-lab/catalog.js` | Stable library/asset IDs; original atlas crop rectangles, canonical placement, neck coverage, tint masks, garment compatibility and sample presets |
| `resources/js/portrait-lab/fitting.js` | Separate pool bindings, measured face landmarks, hair references, garment collar anchors, fitted placements, explicit conversion and valid comparison definitions |
| `resources/js/portrait-lab/collection-03.js` | Additive individual-asset registrations, source landmarks/material masks, collar compatibility, new palettes and lens-finish choices |
| `resources/js/portrait-lab/lenses.js` | Original frame lens contours and deterministic clipped clear/tinted/dark/mirror materials |
| `resources/js/portrait-lab/recipe.js` | Explicit versioned appearance recipe, strict import validation, seeded generation and crop geometry; no DOM or game rules |
| `resources/js/portrait-lab/renderer.js` | Canvas composition, material ramps, bounded 48-layer cache, custom image cropping and asset loading |
| `resources/js/portrait-lab/main.js` | Local editor, sample selection, file decoding, import/export, shelf and Scope-owned listeners/resources |
| `resources/js/portrait-lab/portrait-lab.scss` | Responsive lab composition using the existing game tokens/foundations |
| `resources/js/portrait-lab/assets/` | Original generated transparent atlas and its provenance / generation prompt |
| `resources/views/dev/portrait-lab.blade.php` | Separate Vite entry with no private bootstrap data |

The UI composes the existing Button, Panel, FieldShell, RangeField and Scope. It introduces no shared widget, dependency, API, database model or gameplay integration. The lab owns its feature-specific arrangement and state.

## Recipe stability

Version 1 resolves face, hair and garment IDs, accessory on/off choices and exact colors. Version 2 adds an optional `accessoryStyles` map of resolved IDs (glasses, mustache/facial hair, tie/neckwear). Both retain `library: clean-digital-v1`, their original formats and the original rendering path.

Fitted editing supports version 3 and version 4, `library: clean-digital-fit-v1`. Version 4 adds required `lenses: {finish, color}`. Choosing a lens finish upgrades the working definition; new random characters use v4. Existing v3 definitions remain v3 until that explicit edit and retain clear-lens pixels. Pool/face/clothing changes preserve v4 lens settings. Older clients reject v4 rather than silently discarding its finish. The new image IDs are additive; original artwork, placement and clear rendering remain unchanged.

Hair, clothing and accessory IDs are pool-prefixed (`female:…` / `male:…`). All three accessory style fields are explicit; unavailable categories use `null` and must be switched off. Validation rejects cross-pool IDs, female facial hair, unknown lens finishes/invalid lens colors and active neckwear incompatible with the garment. A seed is a generation input, not a saved person's identity. Imports are validated before replacing the current portrait; custom images must also decode successfully. Unsupported libraries, missing IDs, invalid colors/crops and incompatible combinations are rejected rather than silently substituted.

Old studies load unchanged with modular editing hidden. **Use fitted model** explicitly creates an editable v3 copy, preserving the shelf original until a separate save. Conversion/pool changes retain matching source styles where possible, replace unavailable hair with that pool's default, and disable unsupported accessories. There is no automatic shelf migration. Legacy palettes, custom artwork and exports remain available.

Keep shipped artwork, coordinates, masks, color ramps, background rendering and layer order stable within each library revision. A new hairstyle can add a new ID without modifying existing recipes. Changes to existing pixels or rendering need a new library/renderer revision and retention of the old path. This POC has two explicit rendering paths and one opt-in conversion, not a general multi-version plugin loader. Browser/canvas differences can affect pixels across rendering engines; the tests establish exact restoration in the tested Chromium build.

Shelf writes commit only after localStorage succeeds. Quota errors retain the previous shelf. An unreadable shelf is left untouched and saving is disabled for that session; recipe export remains available. Late file operations cannot replace a more recently selected/edited portrait. Object URLs, animation frames, listeners and renderer cache have page-lifetime cleanup.

## Fitting model and provisional artwork-authoring recipe

The user's **recipe** means instructions for authoring more artwork; that is distinct from the JSON character definition. Collection 03 exercises this checklist with 39 independent assets; continue refining it from fit reviews rather than treating generation prompts as a production alignment guarantee. Its complete prompts and immutable source paths are in the [collection 03 asset notes](../../resources/js/portrait-lab/assets/collection-03/README.md).

Faces supply eye, nose, mouth, chin, scalp and shoulder measurements in canonical 512 × 600 coordinates. Glasses map their lens centers uniformly to the eyes; hair maps two scalp references; mustaches follow nose/mouth anchors; the beard follows mouth/chin/jaw dimensions. Garments use face-specific shoulder width, while neckwear follows the garment's collar point and span. Each sex owns separate bindings/calibration, not a matrix of every face × accessory combination. Source art can be reused without forcing shared placement settings. The four glasses fronts were repaired as new artwork without folded temple arms; originals remain for legacy portraits. See [fitted asset notes](../../resources/js/portrait-lab/assets/fitted-v1.md) and [ADR 0008](../client/decisions/0008-portrait-fitting.md).

1. Use a new immutable asset ID and keep the clean digital painting style, frontal pose and common soft front-left light. Prefer an individually authored 512 × 600 transparent layer aligned to the canonical portrait. An atlas may still supply an explicit source crop.
2. Fit it to the canonical landmarks, then record `source` and `target` rectangles and the relevant source reference points. Add an explicit pool binding (or separate bindings when both pools are supported). The first AI atlas did **not** obey exact grid placement, so measured registration is stored in metadata. Do not assume text prompting alone guarantees pixel alignment.
3. Face bases include ears and neck. The current atlas needed a painted neck extension under open collars; the compositor reuses a lower-neck strip behind the original head and garment. Future art should include sufficient neck coverage directly.
4. Hair/garments intended for recoloring need neutral luminance and actual transparency. Supply accurate neutral/accent masks where needed. Detailed production masks should follow the artwork; broad polygons here are only a first experiment.
5. Declare compatibility and stacking needs. The original stack remains background → extended face/neck → clothing → hair → accessories. Collection 03 garments additionally declare `headInFront`: exclude a jaw/chin-shaped region from clothing composition, retaining front-collar overlap on the neck. This keeps tall rear-collar tips out of the face without repainting its semi-transparent pixels or changing old garments. A dedicated back-hair layer, hats and hair behind shoulders remain unsupported. Source-space neutral/fabric masks follow each new garment's target transform; the field shirt also masks its rear collar band.
6. Verify the new piece against all supported face/garment combinations, several palettes and roster size. Keep a recipe from before the addition and confirm it renders unchanged.

The expanded library has eighteen face bases. Age, sex presentation and complexion are authored in those bases, not independent controls. The pool selector chooses among those authored bases; it does not transform facial anatomy. Skin/eye recoloring, separate nose/mouth parts, age progression, expressions, scars, headwear, hair extending behind the torso, faction uniforms and a broad representative population remain future art experiments. Female fitted portraits cannot select male facial hair or cross-pool parts. Legacy portraits retain their historical unrestricted choices only through the preserved rendering path.

Landmarks improve positioning, but do not reshape hair edges or beard contours to arbitrary heads. Hairline/ear overlap, beard seams, shoulder silhouettes and prototype tint masks still need artistic review. This pass establishes a bounded calibration mechanism, not proof that every future asset will fit automatically.

## Collection 03 additions

- Twelve faces: Aya, Ines, Sana, Freya, Lin and Mara in the female pool; Malik, Arun, Tomas, Elias, Kenji and Idris in the male pool. Each has measured source/target landmarks and a distinct immutable image.
- Twelve garments: female tailored jacket, naval dress coat, utility vest, high-neck blouse, research coat and field service shirt; male three-piece suit, ceremonial tunic, mechanic overalls, expedition jacket, naval sweater and mandarin-collar jacket. The authored shirts in the tailored jacket/three-piece suit came back open, so only ascots/cravats are offered there.
- Hair: female textured pixie, braided crown and wavy bob; male textured quiff, slicked back and tight curls.
- Frames: browline (independent binding in both pools), female cat-eye and male square wire. All seven frame designs support clear/tinted/dark/mirror finishes through measured contours.
- Facial hair: chevron, horseshoe and goatee. Neckwear: knitted tie, pleated cravat and ribbon bow. Original blazer now also supports the cravat; the original buttoned suit supports all seven neckwear styles.
- Three palettes (slate/ice, olive/sand, wine/silver), three hair colors (copper, ash blond, charcoal grey), and a default all-18-face population profile. Original catalogs and weighted generation functions remain intact.

All 39 masters are in `resources/js/portrait-lab/assets/collection-03/`, about 45 MB before HTTP compression/caching. The lab currently loads them all, decoding in groups of four; lazy delivery/downsampled production derivatives remain future optimization. Detailed per-asset [prompts and provenance](../../resources/js/portrait-lab/assets/collection-03/README.md) are retained. Source images are not overwritten or destructively recolored.

## Collection 02 additions (historical)

- Faces: Mei (young adult woman), Leila (mature woman), Oskar (older man).
- Hair: close textured crop, chin-length bob, swept-up bun.
- Clothing: knit cardigan, double-breasted suit, field jacket.
- Glasses: rectangular, aviator and rimless frames, in addition to the original round frames.
- Facial hair: pencil mustache, handlebar mustache and short full beard, in addition to the original trimmed mustache.
- Neckwear: striped slim tie, bow tie and silk ascot, in addition to the original classic tie. Garment-specific destinations place neckwear at the new suit collar while retaining original blazer placement.
- Palettes: ivory/bronze, teal/copper, plum/pearl. Hair swatches: blue black, sandy blond, warm brown. Population profiles: Mei-, Leila- and Oskar-led mixes (70% primary / 6% each other face).

The two new transparent sheets and their exact built-in generation prompts are documented in [collection 02 asset notes](../../resources/js/portrait-lab/assets/collection-02.md). Original artwork, transforms and material ramps were preserved. The UI adds native style selects through the existing FieldShell and Scope; no shared component or backend changes were needed.

## Verification

The final collection-03 run passed all **12** portrait Chromium browser journeys (nine existing and three batch/material checks). The actual development route returned HTTP 200. Screenshot review includes the final jaw-shaped collar correction, not the earlier flat-mask experiment.

- Collection 03: production build, generated-endpoint check and all three portrait Node suites pass. Coverage includes exact 39-file RGBA inventory, separate pool counts, all face/frame eye registrations, compatible finite placements across all garments/categories, 1,000 seeded samples covering all 18 faces, v4 lens validation/round-trips and unchanged v3 definitions. Browser coverage now includes all new faces/garments/hair, lens finishes and colors, v3 clear-pixel equivalence, restored v4 pixels, new facial hair/neckwear, collar occlusion and finishes confined away from the lower face. The review sheet is `test-results/client/portrait-collection-03.png`; accessory example is `portrait-collection-accessories.png`. Existing legacy, custom-image, storage and narrow-layout checks remain included.
- Fitting pass: production build, generated-endpoint check, both portrait Node suites and all **nine** portrait browser journeys pass. Coverage includes 500 compatible seeded definitions, cross-pool import rejection, mathematical eye registration for all six faces/four frames, comparison eligibility, pool-switch controls, guide-free PNG/roster output, explicit legacy conversion and unchanged legacy pixel hashes. Screenshots include `test-results/client/portrait-fitted-comparison.png` and the updated expansion samples. Earlier verification below records the original/collection-02 checks.
- `npm run build`, `npm run check:client`, `npm run test:client:php`.
- `node --test tests/client/portrait-lab.test.js tests/client/foundations.test.js` covers recipe round trips, input rejection, deterministic/weighted sampling, legal crops and existing UI state contracts.
- `npm run test:client:browser -- portrait-lab.spec.js foundations.spec.js` passed ten browser journeys (five portrait / five shared-foundation). Portrait coverage exercises visible layers/colors, unchanged face pixels during fabric recoloring, exact saved restoration, PNG/JSON export, repeatable samples, invalid import preservation, custom-image decoding/cropping/round-trip, storage quota/corruption preservation, mobile width with long names and keyboard controls. The fixture host permits no writes and never opens the game database.
- Screenshots: `test-results/client/portrait-lab-desktop.png` and `test-results/client/portrait-lab-mobile.png`.
- Collection 02 verification: seven portrait browser tests pass, including pixel hashes captured **before** expansion for three original portraits with accessories. Tests cover all new selectable assets, four visibly distinct variants per accessory category, version 2 restoration, version 1 compatibility, custom images, storage errors and mobile width. Node checks cover catalog counts, all accessory ID round trips, six-face sampling and invalid style/version rejection. Visual samples are `test-results/client/portrait-expansion-{mei-v1,leila-v1,oskar-v1,accessories}.png`; the expanded page is `portrait-expansion-desktop.png` in that folder.

Chromium desktop and mobile emulation are the supported verification evidence for this study. Physical phones, other browsers, EN/FR localization, final art quality and broad library compatibility remain open. The development page is currently English, like the map lab.
