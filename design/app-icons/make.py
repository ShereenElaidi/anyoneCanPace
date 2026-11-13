"""Warm Montréal-sunset app icons and favicons. Run: python3 -I design/app-icons/make.py
Reads src/assets/home/riverside.webp (scene with the duck), writes public/*.png (the app icons and favicons).
Pure Pillow; no other dependencies."""
from PIL import Image, ImageDraw, ImageFilter
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public')
scene = Image.open(os.path.join(ROOT, 'src/assets/home/riverside.webp')).convert('RGB')  # 1080x720
W, H = scene.size
DUCK_CX = 520  # duck centre in the scene

def square_crop(side_frac=1.0):
    """Square centred on the duck, full height."""
    s = int(H * side_frac)
    x0 = DUCK_CX - s // 2
    return scene.crop((x0, 0, x0 + s, s))

def rounded(im, radius_frac=0.22):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, *im.size), radius=int(im.size[0] * radius_frac), fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out

def maskable(size):
    """Duck inside the central 80% safe circle; scene bleeds to every edge."""
    f = 0.60 * size / 512 * (512 / 512)
    sw, sh = int(W * 0.60 * size / 512 * 1.0), int(H * 0.60 * size / 512 * 1.0)
    fg = scene.resize((int(W * 0.62 * size / 540 * 1.0), int(H * 0.62 * size / 540 * 1.0)), Image.LANCZOS)
    fw, fh = fg.size
    # centre the scene on the duck horizontally, a touch low so the head clears the top
    cx = int(DUCK_CX / W * fw)
    left = size // 2 - cx
    top = (size - fh) // 2
    canvas = Image.new('RGB', (size, size))
    # extend sky upward and path downward by stretching the edge rows, then soften
    top_row = fg.crop((0, 0, fw, 1)).resize((fw, max(top, 1)))
    bot_row = fg.crop((0, fh - 1, fw, fh)).resize((fw, max(size - top - fh, 1)))
    strip = Image.new('RGB', (fw, size))
    strip.paste(top_row, (0, 0)); strip.paste(fg, (0, top)); strip.paste(bot_row, (0, top + fh))
    # left/right: stretch edge columns
    canvas.paste(strip, (left, 0))
    if left > 0:
        canvas.paste(strip.crop((0, 0, 1, size)).resize((left, size)), (0, 0))
    if left + fw < size:
        canvas.paste(strip.crop((fw - 1, 0, fw, size)).resize((size - left - fw, size)), (left + fw, 0))
    # soften the seam where the stretched rows meet the picture
    blur = canvas.filter(ImageFilter.GaussianBlur(size * 0.012))
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rectangle((0, top - int(size*.02), size, top + int(size*.02)), fill=255)
    d.rectangle((0, top + fh - int(size*.02), size, top + fh + int(size*.02)), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(size * 0.02))
    return Image.composite(blur, canvas, m)

def favicon(size):
    """Warm sunset gradient + just the duck's head (the skyline is mush at 16 px)."""
    g = Image.new('RGB', (size, size))
    px = g.load()
    top, mid, bot = (150, 165, 235), (245, 150, 120), (255, 185, 95)
    for y in range(size):
        t = y / (size - 1)
        a, b, u = (top, mid, t / .55) if t < .55 else (mid, bot, (t - .55) / .45)
        c = tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))
        for x in range(size): px[x, y] = c
    # head + shoulders crop from the scene
    head = scene.crop((DUCK_CX - 190, 60, DUCK_CX + 270, 520))  # 460 square
    mask = Image.open(os.path.join(ROOT, 'src/assets/home/riverside-duck.webp')).convert('RGBA').crop((DUCK_CX - 190, 60, DUCK_CX + 270, 520))
    duck = mask.resize((int(size * 1.02),) * 2, Image.LANCZOS)
    g = g.convert('RGBA')
    g.alpha_composite(duck, (-int(size * 0.01), int(size * 0.04)))
    return rounded(g.convert('RGB'), 0.2)

os.makedirs(OUT, exist_ok=True)
sq = square_crop()
sq.resize((180, 180), Image.LANCZOS).save(f'{OUT}/apple-touch-icon.png')            # opaque full square; iOS rounds it
for s in (512, 192):
    rounded(sq.resize((s, s), Image.LANCZOS)).save(f'{OUT}/pwa-{s}x{s}.png')
maskable(512).save(f'{OUT}/maskable-512x512.png')
for s in (32, 16):
    big = favicon(s * 8).resize((s, s), Image.LANCZOS)
    big.save(f'{OUT}/favicon-{s}x{s}.png')
print('ok')
