"""Génère les icônes et visuels de l'application à partir du logo original.

Usage : python3 scripts/make-icons.py
- rend transparents les coins noirs du logo (forme arrondie),
- produit le logo pour l'interface (WebP), les icônes PWA (any + maskable),
  l'icône Apple et les favicons.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "logo_weplay_shibax.png"
OUT = ROOT / "public"
(OUT / "icons").mkdir(parents=True, exist_ok=True)
(OUT / "img").mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert("RGB")
w, h = img.size
px = img.load()

# 1. Zone extérieure : pixels sombres connectés aux coins (remplissage par diffusion).
outside = Image.new("L", (w, h), 0)
op = outside.load()
queue = deque([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
seen = set(queue)
while queue:
    x, y = queue.popleft()
    r, g, b = px[x, y]
    if r + g + b > 150:
        continue
    op[x, y] = 255
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
            seen.add((nx, ny))
            queue.append((nx, ny))

# 2. Masque intérieur légèrement érodé (supprime le liseré sombre) puis adouci.
inside = ImageChops.invert(outside)
inside = inside.filter(ImageFilter.MinFilter(7))  # érosion de 3 px
inside = inside.filter(ImageFilter.GaussianBlur(1.6))

logo = img.copy()
logo.putalpha(inside)
bbox = inside.point(lambda v: 255 if v > 8 else 0).getbbox()
logo = logo.crop(bbox)
side = max(logo.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(logo, ((side - logo.size[0]) // 2, (side - logo.size[1]) // 2))


def save_resized(im, size, path, **kw):
    im.resize((size, size), Image.LANCZOS).save(path, **kw)


# Logo de l'interface (coins transparents)
save_resized(square, 512, OUT / "img" / "logo-512.webp", quality=88, method=6)
save_resized(square, 256, OUT / "img" / "logo-256.webp", quality=88, method=6)
save_resized(square, 512, OUT / "img" / "logo-512.png", optimize=True)

# Icônes PWA « any » (coins transparents)
save_resized(square, 192, OUT / "icons" / "icon-192.png", optimize=True)
save_resized(square, 512, OUT / "icons" / "icon-512.png", optimize=True)
save_resized(square, 32, OUT / "icons" / "favicon-32.png", optimize=True)
save_resized(square, 16, OUT / "icons" / "favicon-16.png", optimize=True)

# 3. Version pleine (sans coins) : recadrage intérieur pour maskable et Apple.
bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
margin = int(round(min(bw, bh) * 0.095))
full = img.crop((bbox[0] + margin, bbox[1] + margin, bbox[2] - margin, bbox[3] - margin))
fs = min(full.size)
full = full.crop((0, 0, fs, fs))
save_resized(full, 512, OUT / "icons" / "maskable-512.png", optimize=True)
save_resized(full, 192, OUT / "icons" / "maskable-192.png", optimize=True)
save_resized(full, 180, OUT / "icons" / "apple-touch-icon.png", optimize=True)

print("bbox", bbox, "margin", margin)
for p in sorted((OUT / "icons").glob("*")) + sorted((OUT / "img").glob("*")):
    print(p.relative_to(ROOT), p.stat().st_size, "octets")
