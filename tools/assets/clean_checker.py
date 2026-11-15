"""Replace a fake 'transparent' checkerboard (grey/white squares baked into the image) with plain
white: flood fill from the border over near-neutral light pixels only, so the logo's own outlines
stop the fill. python -I clean_checker.py <in.webp> <out.webp> [min_level]"""
import sys
from collections import deque
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
lo = int(sys.argv[3]) if len(sys.argv) > 3 else 150
im = Image.open(src).convert('RGB')
w, h = im.size
px = im.load()
bg = lambda p: max(p) - min(p) < 22 and sum(p) / 3 >= lo
seen = bytearray(w * h)
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
filled = 0
while q:
    x, y = q.popleft()
    i = y * w + x
    if seen[i]:
        continue
    seen[i] = 1
    if not bg(px[x, y]):
        continue
    px[x, y] = (255, 255, 255)
    filled += 1
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
            q.append((nx, ny))
im.save(dst, 'WEBP', quality=90, method=6)
print(src.split('/')[-1], 'filled %.0f%%' % (100 * filled / (w * h)))
