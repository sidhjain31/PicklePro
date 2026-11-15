"""Pick a vivid team colour from each logo (most common bright, saturated hue), then show swatches.
python logo_colours.py <logosDir> <out.json> <swatches.png>"""
import colorsys, json, os, sys
from PIL import Image, ImageDraw

src, out_json, sheet = sys.argv[1:4]
res = {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.webp'):
        continue
    im = Image.open(os.path.join(src, f)).convert('RGBA').resize((96, 96))
    bins = {}
    for r, g, b, a in im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata():
        if a < 128:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.45 or v < 0.45:
            continue
        k = int(h * 24) % 24
        w = s * v
        e = bins.setdefault(k, [0.0, 0.0, 0.0, 0.0])
        e[0] += w; e[1] += r * w; e[2] += g * w; e[3] += b * w
    if not bins:
        res[f[:-5]] = None
        continue
    # The pickleball's yellow is in nearly every logo: count it at a third so the team's own
    # colour wins (yellow still wins when it really dominates).
    weight = lambda k: 0.33 if 2 <= k <= 4 else 1.0
    k, e = max(bins.items(), key=lambda kv: kv[1][0] * weight(kv[0]))
    r, g, b = e[1] / e[0], e[2] / e[0], e[3] / e[0]
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    # Vivid but not neon: saturation >= 0.7, brightness 0.88.
    r, g, b = colorsys.hsv_to_rgb(h, max(s, 0.7), 0.88)
    res[f[:-5]] = '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
json.dump(res, open(out_json, 'w'), indent=1)
keys = list(res)
im = Image.new('RGB', (len(keys) * 34, 60), (20, 30, 60))
d = ImageDraw.Draw(im)
for i, k in enumerate(keys):
    d.rectangle((i * 34 + 2, 2, i * 34 + 32, 40), fill=res[k] or '#888888')
    d.text((i * 34 + 3, 44), k[-3:], fill=(255, 255, 255))
im.save(sheet)
print(res)
