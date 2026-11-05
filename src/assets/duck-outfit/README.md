# Dressed-duck art

The Daily Dashboard draws the mascot dressed for the weather:
`duck-base.webp` (the mascot from `design/duck-mascot.webp`, 512 × 512) with
one transparent layer per outfit item stacked on top.

The pieces were drawn from the brief in `design/duck-art-brief/` as
1024 × 1024 transparent PNGs, then redrawn against a traced map of the duck
(landmarks and one mask per body region of `01-duck-reference.png`, which is
`duck-base.webp` at twice the size). Each garment is drawn in place on that
canvas and clipped to the duck's outline, so no per-piece scaling or nudging
is needed: every file is simply halved to 512 × 512 WebP (3 to 11 KB each).

- **Swap a piece:** replace `<item>.webp` with a transparent image the same
  size as `duck-base.webp` (512 × 512), with the garment drawn exactly where it
  sits on the duck and nothing else. A 1024 × 1024 PNG drawn in place on
  `design/duck-art-brief/01-duck-reference.png` is fine too: halve it to
  512 × 512 and save it as WebP.
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
