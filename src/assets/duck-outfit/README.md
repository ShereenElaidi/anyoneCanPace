# Dressed-duck art

The Daily Dashboard draws the mascot dressed for the weather:
`duck-base.webp` (the mascot from `design/duck-mascot.webp`, 512 × 512) with
one transparent layer per outfit item stacked on top.

The pieces were drawn by ChatGPT from the brief in `design/duck-art-brief/`
(1024 × 1024 PNGs with transparent backgrounds). Each was then fitted onto the
duck: the scale and position that best covers that garment's zone (torso,
arms, hands, head, neck, hips and legs) was kept when it clearly helped. The
originals stay as drawn for the vest, gloves, light gloves, mittens, tee, long sleeve,
thermal layers, cap, headlamp, sunglasses and ice cleats. They were then
scaled to 512 × 512 WebP (about 8 KB each).

- **Swap a piece:** replace `<item>.webp` with a transparent image the same
  size as `duck-base.webp` (512 × 512), with the garment drawn exactly where it
  sits on the duck and nothing else. A 1024 × 1024 PNG from the brief is fine
  too: send it over and it gets fitted and converted the same way.
- **Check it:** `npm run dev`, open the Daily Dashboard and pick run times
  until the outfit uses your piece.
- **Stacking order** (what covers what) is `LAYER_ORDER` in
  `src/dashboard/duck/pieces.ts`. Add a new item's id there after drawing it.
- The base duck already wears its blue headband and singlet, so `singlet`
  has no file, and `headband` is the thicker winter ear band.

| File | Item |
|---|---|
| `tee`, `long-sleeve`, `thermal-layers` | Tops (thermal includes tights) |
| `light-jacket`, `windbreaker`, `windproof-shell`, `raincoat` | Jackets |
| `reflective-vest`, `neck-warmer` | Over the top |
| `shorts`, `tights` | Legs |
| `light-gloves`, `gloves`, `mittens` | Hands |
| `cap`, `toque`, `headband`, `headlamp`, `sunglasses` | Head |
| `grippy-shoes` | Ice cleats under the feet |

The duck is decorative and hidden from screen readers. The text outfit list
next to it carries the meaning, so a missing or odd drawing never hides
advice.
