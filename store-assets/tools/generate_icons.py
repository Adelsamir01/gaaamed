# -*- coding: utf-8 -*-
"""Dedos (ديدوس) brand asset generator.
Generates Android launcher icons (mipmaps), adaptive-icon foregrounds,
splash screens, PWA icons and Google Play store art.
Style: emerald -> teal gradient tile, big bold white Arabic letter 'د',
subtle sparkle accents, dark #0b1220 surfaces.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
PUBLIC = os.path.join(ROOT, "public")
STORE = os.path.join(ROOT, "store-assets", "play")

FONT_TAHOMA_BD = r"C:\Windows\Fonts\tahomabd.ttf"
FONT_ARIAL_BD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_ARIAL = r"C:\Windows\Fonts\arial.ttf"
FONT_EMOJI = r"C:\Windows\Fonts\seguiemj.ttf"

DAL = "د"  # isolated form is typographically correct

EMERALD_400 = (52, 211, 153)
EMERALD_500 = (16, 185, 129)
TEAL_600 = (13, 148, 136)
TEAL_700 = (15, 118, 110)
DARK = (11, 18, 32)          # 0b1220
WHITE = (255, 255, 255)
SHADOW = (4, 58, 51)
SPARK_MAIN = (236, 253, 245)
SPARK_SOFT = (167, 243, 208)


def hx(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def diagonal_gradient(size, stops):
    """stops: [(pos0..1, (r,g,b)), ...] -> RGB Image (top-left -> bottom-right)."""
    g = np.linspace(0.0, 1.0, size, dtype=np.float32)
    t = (g[None, :] + g[:, None]) * 0.5
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    chans = []
    for ch in range(3):
        vals = np.array([s[1][ch] for s in stops], dtype=np.float32)
        chans.append(np.interp(t, pos, vals))
    arr = np.stack(chans, axis=-1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def horizontal_gradient(w, h, stops):
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    t = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :].repeat(h, axis=0)
    chans = [np.interp(t, pos, np.array([s[1][ch] for s in stops], dtype=np.float32)) for ch in range(3)]
    return Image.fromarray(np.stack(chans, axis=-1).astype(np.uint8), "RGB")


def radial_glow(w, h, cx, cy, radius, color, max_alpha, power=2.0):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt(((x - cx) / radius) ** 2 + ((y - cy) / radius) ** 2)
    alpha = (np.clip(1.0 - dist, 0.0, 1.0) ** power) * max_alpha
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = color
    arr[..., 3] = alpha.astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def circle_mask(size):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([0, 0, size - 1, size - 1], fill=255)
    return m


def render_glyph_layer(text, font_path, target_w, fill=WHITE):
    """Render a glyph cropped to its visual bbox, scaled so width == target_w."""
    probe = ImageFont.truetype(font_path, 200)
    b = probe.getbbox(text)
    w = b[2] - b[0]
    px = int(200 * target_w / w)
    f = ImageFont.truetype(font_path, px)
    b = f.getbbox(text)
    w, h = b[2] - b[0], b[3] - b[1]
    pad = max(8, px // 16)
    layer = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((pad - b[0], pad - b[1]), text, font=f, fill=fill)
    return layer


def paste_center(base, layer, cx, cy, dy=0):
    base.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2 + dy)))


def glyph_with_shadow(size, glyph_w, dy_frac=0.0, shadow_alpha=0.5):
    """White 'د' with soft dark shadow beneath. Returns RGBA layer of (size,size)."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glyph = render_glyph_layer(DAL, FONT_TAHOMA_BD, glyph_w)
    cx, cy = size / 2, size / 2 + size * dy_frac
    alpha = glyph.split()[3].point(lambda a: int(a * shadow_alpha))
    shadow = Image.new("RGBA", glyph.size, SHADOW + (0,))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.012))
    paste_center(layer, shadow, cx, cy, dy=size * 0.010)
    paste_center(layer, glyph, cx, cy)
    return layer


def sparkle_layer(r, color, alpha):
    """Four-point star sparkle, axis aligned."""
    R = int(r * 2) + 4
    layer = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = R / 2
    ri = r * 0.20
    pts = [(c, c - r), (c + ri, c - ri), (c + r, c), (c + ri, c + ri),
           (c, c + r), (c - ri, c + ri), (c - r, c), (c - ri, c - ri)]
    d.polygon(pts, fill=color + (alpha,))
    return layer


def add_sparkles(img, size):
    for fx, fy, fr, col, al in [
        (0.755, 0.205, 0.050, SPARK_MAIN, 235),
        (0.650, 0.330, 0.024, SPARK_SOFT, 215),
        (0.850, 0.330, 0.017, SPARK_SOFT, 200),
    ]:
        sp = sparkle_layer(size * fr, col, al)
        img.alpha_composite(sp, (int(size * fx - sp.width / 2), int(size * fy - sp.height / 2)))


TILE_STOPS = [(0.0, EMERALD_400), (0.55, EMERALD_500), (1.0, TEAL_700)]


def make_tile(size, shape="round"):
    """Rounded-square or circular gradient tile with glyph + sparkles."""
    grad = diagonal_gradient(size, TILE_STOPS).convert("RGBA")
    # soft top-left light
    grad.alpha_composite(radial_glow(size, size, size * 0.30, size * 0.26,
                                     size * 0.85, (209, 250, 229), 60))
    # slight bottom-right depth
    grad.alpha_composite(radial_glow(size, size, size * 0.85, size * 0.90,
                                     size * 0.9, (6, 60, 54), 50))
    mask = rounded_mask(size, int(size * 0.235)) if shape == "round" else circle_mask(size)
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.paste(grad, (0, 0), mask)
    tile.alpha_composite(glyph_with_shadow(size, int(size * 0.52)))
    add_sparkles(tile, size)
    return tile


def make_fullbleed(size):
    """Full-bleed square (Play store / PWA): gradient corner to corner."""
    img = diagonal_gradient(size, TILE_STOPS).convert("RGBA")
    img.alpha_composite(radial_glow(size, size, size * 0.30, size * 0.24,
                                    size * 0.9, (209, 250, 229), 55))
    img.alpha_composite(radial_glow(size, size, size * 0.9, size * 0.95,
                                    size * 0.95, (6, 60, 54), 60))
    img.alpha_composite(glyph_with_shadow(size, int(size * 0.50)))
    add_sparkles(img, size)
    return img


def make_foreground(size):
    """Adaptive-icon foreground: glyph + sparkles on transparent, center 66% safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(glyph_with_shadow(size, int(size * 0.44), shadow_alpha=0.35))
    sp = sparkle_layer(size * 0.045, SPARK_MAIN, 240)
    img.alpha_composite(sp, (int(size * 0.660 - sp.width / 2), int(size * 0.290 - sp.height / 2)))
    sp2 = sparkle_layer(size * 0.020, SPARK_SOFT, 215)
    img.alpha_composite(sp2, (int(size * 0.590 - sp2.width / 2), int(size * 0.365 - sp2.height / 2)))
    return img


def make_splash(w, h, tile_master):
    img = Image.new("RGB", (w, h), DARK)
    m = min(w, h)
    glow = radial_glow(w, h, w / 2, h / 2, m * 0.62, TEAL_600, 46)
    base = img.convert("RGBA")
    base.alpha_composite(glow)
    t = int(m * 0.36)
    tile = tile_master.resize((t, t), Image.LANCZOS)
    base.alpha_composite(tile, ((w - t) // 2, (h - t) // 2))
    return base.convert("RGB")


def fit_font(path, text, start_px, max_w):
    px = start_px
    while px > 8:
        f = ImageFont.truetype(path, px)
        b = f.getbbox(text)
        if b[2] - b[0] <= max_w:
            return f
        px -= 2
    return ImageFont.truetype(path, px)


def make_feature_graphic(tile_master):
    W, H = 1024, 500
    bg = horizontal_gradient(W, H, [(0.0, DARK), (0.55, hx("#0C1626")), (1.0, hx("#082F2B"))]).convert("RGBA")
    # glows
    bg.alpha_composite(radial_glow(W, H, 235, 250, 330, TEAL_600, 70))
    bg.alpha_composite(radial_glow(W, H, 980, 40, 420, EMERALD_500, 34))
    bg.alpha_composite(radial_glow(W, H, 60, 490, 380, hx("#134E4A"), 40))
    # faint background sparkles
    for fx, fy, fr, al in [(0.52, 0.15, 9, 120), (0.90, 0.72, 7, 100), (0.44, 0.82, 6, 90)]:
        sp = sparkle_layer(fr, SPARK_SOFT, al)
        bg.alpha_composite(sp, (int(W * fx - sp.width / 2), int(H * fy - sp.height / 2)))
    # tile
    ts = 296
    tile = tile_master.resize((ts, ts), Image.LANCZOS)
    bg.alpha_composite(tile, (88, (H - ts) // 2))
    d = ImageDraw.Draw(bg)
    tx = 452
    # Title
    f_title = fit_font(FONT_ARIAL_BD, "Dedos", 128, W - tx - 60)
    d.text((tx, 172), "Dedos", font=f_title, fill=WHITE, anchor="lm")
    # Tagline
    tag = "Arabic party games — play & chat with friends"
    f_tag = fit_font(FONT_ARIAL, tag, 36, W - tx - 60)
    d.text((tx + 2, 252), tag, font=f_tag, fill=hx("#A7F3D0"), anchor="lm")
    # underline accent
    d.rounded_rectangle([tx + 2, 288, tx + 150, 294], radius=3, fill=EMERALD_500 + (255,))
    # Emoji row
    emojis = ["🎮", "🎨", "🏦", "⚡", "✂️"]
    f_em = ImageFont.truetype(FONT_EMOJI, 46)
    ex = tx + 2
    for e in emojis:
        d.text((ex, 356), e, font=f_em, embedded_color=True, anchor="lm")
        ex += 66
    return bg.convert("RGB")


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("wrote", os.path.relpath(path, ROOT), img.size)


def main():
    S = 1024
    tile_round = make_tile(S, "round")
    tile_circle = make_tile(S, "circle")
    fullbleed = make_fullbleed(S)
    foreground = make_foreground(S)

    densities = {  # launcher px, foreground px
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for name, (lpx, fpx) in densities.items():
        d = os.path.join(RES, f"mipmap-{name}")
        save(tile_round.resize((lpx, lpx), Image.LANCZOS), os.path.join(d, "ic_launcher.png"))
        save(tile_circle.resize((lpx, lpx), Image.LANCZOS), os.path.join(d, "ic_launcher_round.png"))
        save(foreground.resize((fpx, fpx), Image.LANCZOS), os.path.join(d, "ic_launcher_foreground.png"))

    splashes = {
        "drawable": (480, 320),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960),
        "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600),
        "drawable-port-xxxhdpi": (1280, 1920),
    }
    for folder, (w, h) in splashes.items():
        save(make_splash(w, h, tile_round), os.path.join(RES, folder, "splash.png"))

    save(fullbleed.resize((192, 192), Image.LANCZOS), os.path.join(PUBLIC, "icon-192.png"))
    save(fullbleed.resize((512, 512), Image.LANCZOS), os.path.join(PUBLIC, "icon-512.png"))

    save(fullbleed.resize((512, 512), Image.LANCZOS), os.path.join(STORE, "icon-512.png"))
    save(make_feature_graphic(tile_round), os.path.join(STORE, "feature-graphic-1024x500.png"))

    # keep a preview of the rounded tile for verification
    save(tile_round.resize((512, 512), Image.LANCZOS), os.path.join(STORE, "preview-tile-512.png"))


if __name__ == "__main__":
    main()
