# Development artwork v2

Generated on 2026-09-26 with the built-in image-generation tool (not the CLI/API fallback). Project assets, not runtime AI generation.

- `development-atlas-v2.png`: original transparent RGBA structure sheet, 1448 × 1086. Explicit source rectangles in `../development-art.js`; generated spacing is not a mechanically exact grid. Twelve building/equipment silhouettes, shared lighting. No colour-keying or destructive alpha processing.
- `quarry-v2.png`: original transparent quarry illustration. Scaled and clipped to an independently terrain-validated excavation footprint at runtime.

The image skill guided production prompts, transparent cutouts, visual inspection and project-local persistence. The UI skill guided use of existing controls and kept the renderer lab-local. Illustrations are samples of activity, not physically scaled/individually simulated buildings. The camera/scale remain deliberately illustrative. Equipment painted into the quarry is static, including at zero activity.

## Structure atlas — final prompt

Use case: stylized-concept.
Asset type: one production sprite atlas for Novus Ordo, a top-down geopolitical strategy game.
Create a single landscape-format, genuinely transparent RGBA sprite sheet: EXACTLY 4 columns by 3 rows, twelve equally sized invisible cells, one isolated structure per cell, evenly centred with generous transparent gutters (at least 12% of each cell). No grid lines, labels, numbers, text, logos, background or ground plates. Individual soft contact shadows are welcome.
Art direction: beautiful hand-painted realistic miniature architecture, crisp readable silhouettes, restrained natural colours, weathered materials, intricate but legible at small scale. Not cartoon, not icons, not photorealistic photographs. Consistent orthographic camera looking down at 65 degrees above the ground (mostly roofs, some south and east walls); all objects share the SAME camera orientation, scale of material detail, and soft upper-left sunlight. Objects will sit over a lush detailed painted terrain map.
Read cells LEFT TO RIGHT, TOP TO BOTTOM:
Row 1: (1) small warm stone house with muted terracotta gable roof and chimney; (2) detached cream house with dark slate roof and a modest annex; (3) compact connected row of three four-storey European urban buildings, roof details and small internal court, muted stone and brick; (4) substantial seven-storey cream urban apartment block, elegant roof terraces, L-shaped.
Row 2: (1) elegant tall sixteen-storey modern tower with blue-grey glazing, restrained pale stone base, rooftop mechanical details; (2) a taller stepped twenty-four-storey landmark office tower, muted steel blue glass and warm pale concrete, small podium; (3) beautiful brick industrial factory complex with two adjoining sawtooth-roof halls and ONE tall brick chimney, roof vents and small loading annex; (4) low corrugated metal warehouse with loading doors and a few neat crates.
Row 3: (1) one detailed dark steel oil pumpjack on two small concrete footings with visible counterweight; (2) compact group of three cylindrical pale oil storage tanks, ladders and thin connecting pipework; (3) mining processing crusher with conveyor and small grey corrugated building, weathered industrial metal; (4) one ochre yellow mining excavator with articulated arm and dark caterpillar tracks.
Each structure must fit completely within its own cell, including tower tops and shadows. Do not crop any structure. No trees, people, landscape, square turf bases, or solid-colour backdrops. Transparent pixels between objects, not a painted checkerboard. Broad enough silhouettes to remain readable when each sprite is displayed at 35–100 pixels wide. Premium coherent game artwork.

## Quarry — final prompt

Use case: stylized-concept.
Asset type: one transparent terrain-detail sprite for a premium painted top-down strategy map.
Subject: a beautifully detailed open-pit mineral quarry, one broad irregular excavation with five subtle terraced stone benches descending into a dusty pale grey-beige working floor. A believable continuous haul road spirals down one side. Exposed weathered sandstone and grey rock, fractured rock faces, scree, dusty tracks, subtle ochre soil at the rim. Tiny ore piles and a small yellow excavator for scale on the lowest bench.
Camera: orthographic, almost straight down, 70 degrees above ground, horizontal oval footprint roughly 1.4 times wider than tall. Upper-left warm daylight, subtle believable relief shadows, restrained realistic earthy colors matching a lush painted game map. High-quality miniature terrain illustration, not icons, not a photograph.
Composition: single isolated quarry centred with 8% margin, entirely visible. The outer edge is organic feathered rubble and disturbed earth fading smoothly to genuine transparent RGBA pixels. No square ground tile or pedestal, no surrounding landscape, grass, vegetation, water, sky, text, labels, grid, checkerboard or background.
Terraces must look geologically rough and detailed, NOT clean concentric stripes, black outlines, target rings or a cartoon bowl. Rich natural rock microtexture with shadows integrated into the material. Intended for display around 180-350 pixels wide, so strong cohesive shapes and finely painted detail.
