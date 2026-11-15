"""Team logos from the organisers' Drive -> small square WebP files + main colour per logo.
python process_logos.py <rawDir> <outDir> <contactSheet.png> [size=640]"""
import io, json, os, sys
from collections import Counter
import fitz  # PyMuPDF
from PIL import Image, ImageChops, ImageDraw

raw, out, sheet_path = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
# 640 px since 2026-11-16 (was 320): sharp on 3x phone screens and 4K TVs.
SIZE = int(sys.argv[4]) if len(sys.argv) > 4 else 640


def load(path):
    data = open(path, 'rb').read()
    if data[:4] == b'%PDF':
        doc = fitz.open(stream=data, filetype='pdf')
        page = doc[0]
        zoom = 700 / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
    return Image.open(io.BytesIO(data)).convert('RGBA')


def trim(im):
    """Crop away a uniform border (the colour of the corners) or transparent margin."""
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] < 250:
        box = alpha.point(lambda a: 255 if a > 20 else 0).getbbox()
        return im.crop(box) if box else im
    rgb = im.convert('RGB')
    corner = rgb.getpixel((2, 2))
    bg = Image.new('RGB', rgb.size, corner)
    diff = ImageChops.difference(rgb, bg).convert('L').point(lambda v: 255 if v > 28 else 0)
    box = diff.getbbox()
    if not box:
        return im
    w, h = im.size
    # Keep a little breathing room.
    pad = int(max(box[2] - box[0], box[3] - box[1]) * 0.03)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
    return im.crop(box)


def square(im):
    w, h = im.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    # Opaque logos keep their own background colour around them instead of transparency.
    if im.getchannel('A').getextrema()[0] >= 250:
        canvas = Image.new('RGBA', (s, s), im.convert('RGB').getpixel((1, 1)) + (255,))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2), im)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main_colour(im):
    small = im.resize((64, 64)).convert('RGBA')
    buckets = Counter()
    sums = {}
    for r, g, b, a in small.getdata():
        if a < 128:
            continue
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 50 or mx - mn < 45:
            continue
        k = (r >> 5, g >> 5, b >> 5)
        buckets[k] += 1
        s = sums.setdefault(k, [0, 0, 0])
        s[0] += r; s[1] += g; s[2] += b
    if not buckets:
        return None
    k, n = buckets.most_common(1)[0]
    s = sums[k]
    return '#%02x%02x%02x' % (s[0] // n, s[1] // n, s[2] // n)


results = {}
tiles = []
for name in sorted(os.listdir(raw)):
    if not name.endswith('.bin'):
        continue
    key = name[:-4]
    im = square(trim(load(os.path.join(raw, name))))
    target = os.path.join(out, f'{key}.webp')
    im.save(target, 'WEBP', quality=86, method=6)
    results[key] = {'file': f'{key}.webp', 'color': main_colour(im), 'bytes': os.path.getsize(target)}
    tiles.append((key, im))

# Contact sheet to eyeball the results.
cols = 8
rows = (len(tiles) + cols - 1) // cols
T = 140
sheet = Image.new('RGB', (cols * T, rows * (T + 18)), (20, 30, 60))
d = ImageDraw.Draw(sheet)
for i, (key, im) in enumerate(tiles):
    x, y = (i % cols) * T, (i // cols) * (T + 18)
    t = im.resize((T - 10, T - 10))
    sheet.paste(t, (x + 5, y + 5), t)
    c = results[key]['color'] or '#888888'
    d.rectangle((x + 5, y + T - 2, x + T - 5, y + T + 14), fill=c)
    d.text((x + 8, y + T), key, fill=(255, 255, 255))
sheet.save(sheet_path)
print(json.dumps(results, indent=0))
print('total KB', sum(r['bytes'] for r in results.values()) // 1024)
