# Dressed-duck art

The Daily Dashboard draws the mascot dressed for the weather: `duck-base.webp`
(the mascot from `design/duck-mascot.webp`, 512 px) with one transparent SVG
layer per outfit item on top.

These pieces are **drafts**, traced from the mascot's own outlines so they fit
the running pose. Redraw any of them whenever you like:

- **Swap a piece:** replace `<item>.svg` with your drawing, keeping the same
  file name and `viewBox="0 0 100 100"`. The box is the whole duck image, so
  (0, 0) is its top-left corner and (100, 100) its bottom-right. Draw only the
  garment; everything else must stay transparent.
- **Check it:** `npm run dev`, open the Daily Dashboard and pick run times
  until the outfit uses your piece.
- **Stacking order** (what covers what) is `LAYER_ORDER` in
  `src/dashboard/duck/pieces.ts`. Add a new item's id there after drawing it.
- The base duck already wears its blue headband and singlet, so `singlet`
  has no file, and `headband` is the thicker winter ear band.
- Use the brand palette: Crew Navy `#1B3F72`, Track Blue `#378ADD`,
  Duck Gold `#EF9F27`, Pavement `#F5F0E8`, Asphalt `#2C2C2A` outlines
  (about 1.1 units wide). The reflective vest is safety yellow on purpose.

| File | Item |
|---|---|
| `tee.svg`, `long-sleeve.svg`, `thermal-layers.svg` | Tops |
| `light-jacket.svg`, `windbreaker.svg`, `windproof-shell.svg`, `raincoat.svg` | Jackets |
| `reflective-vest.svg`, `neck-warmer.svg` | Over the top |
| `shorts.svg`, `tights.svg` | Legs |
| `light-gloves.svg`, `gloves.svg`, `mittens.svg` | Hands |
| `cap.svg`, `toque.svg`, `headband.svg`, `headlamp.svg`, `sunglasses.svg` | Head |
| `grippy-shoes.svg` | Ice cleats under the feet |

The duck is decorative and hidden from screen readers. The text outfit list
next to it carries the meaning, so a missing or odd drawing never hides
advice.
