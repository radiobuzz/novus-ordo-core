# Fitted study — glasses-front repair

Date: 2026-09-20. Experimental art calibration, not a final authoring specification.

- Runtime source: `glasses-front-fit-v1.png`, 1254 × 1254 RGBA; four front-frame sprites in a 2 × 2 sheet.
- Generated with the built-in image tool using `accessory-expansion-01.png` as a style reference. Original result: `/home/chad/.codex/generated_images/01a0bbe7-401d-7203-9d84-01ba8482b625/exec-50d224c1-a9e9-46a6-9867-5a1ab729da0b.png`.
- Original atlases are unchanged. This sheet is used only by `clean-digital-fit-v1`; old definitions keep their original pixels.
- Measured crops and lens-center references live in `../fitting.js`. Male/female bindings own independent settings while reusing this image. Eye landmarks determine final position and uniform scale.
- Inspected front silhouettes and composed previews. No folded temple rods remain in the lens interiors. Fine edges, head contours and broader style coverage still need an art review.

## Exact generation prompt

Use case: stylized-concept. Repair artwork for four existing eyeglasses styles used as overlay sprites in a painted character portrait generator. Reference establishes style only. Create ONE square genuinely transparent RGBA sheet with four glasses front pieces in a regular 2x2 layout, ample empty space between. Top left thin dark circular round frames; top right dark rectangular frames; bottom left thin metal double-bridge aviator frames; bottom right delicate rimless rectangular lenses and a narrow bridge. Strict orthographic FRONT VIEW. Only the front rim, bridge and minimal hinges: NO temple arms, NO earpieces, NO folded diagonal rods behind the lenses, NO perspective side parts. Lenses completely transparent with NO highlights, reflections, tint or painted glass surfaces. No eyes, face, skin, nose or head. The empty lens interiors must remain genuinely alpha-transparent. Fine semi-realistic clean digital painted finish, restrained highlights on frame material only, soft even lighting, realistic frame proportions, all four front pieces equal overall width. No text, labels, backdrop, borders, shadows, checkerboard pixels or extra objects. These replace flawed existing frame sprites; focus on clean front silhouettes and clear empty interiors for reliable overlay on faces.

## Working authoring lessons

Front overlays need true empty lens interiors and no folded temple arms. Prompting does not establish exact registration: measure the output, record its crop and reference points, then check every supported face at portrait and roster sizes. Face measurements, collar anchors and separate pool bindings are documented in the [portrait lab](../../../../docs/game-design/portrait-lab.md). These are provisional asset-authoring instructions, not the saved-character JSON format or a guarantee that arbitrary generated images will fit.
