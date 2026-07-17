# Compose Play-Store marketing screenshots for ديدوس (Dedos).
# Raw phone shot (1080x2045) -> dark brand canvas 1080x2044 with Arabic caption
# band on top and a rounded device bezel with a subtle emerald glow.
import os
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display

    def ar(text: str) -> str:
        return get_display(arabic_reshaper.reshape(text))
except ImportError:  # fallback: no shaping libs
    def ar(text: str) -> str:
        return text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'screenshots', 'raw')
OUT = os.path.join(ROOT, 'screenshots')
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 2044
BG = (11, 18, 32)          # #0B1220 brand dark
EMERALD = (52, 211, 153)   # emerald-400
FONT_CANDIDATES = [
    r'C:\Windows\Fonts\tahomabd.ttf',
    r'C:\Windows\Fonts\arialbd.ttf',
    r'C:\Windows\Fonts\segoeuib.ttf',
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
assert FONT_PATH, 'no bold font found'

SHOT_W = 840                       # device image width on canvas
BEZEL = 14                         # bezel ring thickness
RADIUS = 64                        # outer corner radius
CAPTION_SIZE = 64
SUB_SIZE = 34

# (raw file, output file, caption, sub-caption)
JOBS = [
    ('01-onboarding.png',        'shot-1-onboarding.png',  'ديدوس — سهّلها والعب', 'ثوانٍ وتدخل الجو'),
    ('03-games.png',             'shot-2-games.png',       '٨+ ألعاب جماعية',      'إكس أو، ذاكرة، شخبطة وأكثر'),
    ('04-online-lobby.png',      'shot-3-online.png',      'العب مع أصحابك أونلاين', 'غرف برمز ومباريات سريعة'),
    ('07-memory-game.png',       'shot-4-memory.png',      'تحدّى نفسك أوفلاين',   'ألعاب ذاكرة وذكاء ضد الكمبيوتر'),
    ('06b-new-group.png',        'shot-5-chat.png',        'دردشة وجروبات فورية',  'كلم أصحابك وتحدّاهم على طول'),
    ('08-profile.png',           'shot-6-profile.png',     'ملفك ومستواك',          'اكسب عملات وارفع مستواك'),
    ('02-home.png',              'shot-7-home.png',        'مكافآت يومية وتحديات',  'ارجع كل يوم واكسب أكثر'),
    ('01b-onboarding-expanded.png', 'shot-8-avatars.png',  'اختر شخصيتك',           'عشرات الشخصيات المرحة'),
]


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def draw_centered(draw, cx, y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2 - bbox[0], y), text, font=font, fill=fill)


for raw_name, out_name, caption, sub in JOBS:
    src_path = os.path.join(RAW, raw_name)
    if not os.path.exists(src_path):
        print('MISSING', raw_name)
        continue

    canvas = Image.new('RGB', (W, H), BG)

    # subtle radial glow behind the phone
    glow = Image.new('RGB', (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W / 2 - 620, 500, W / 2 + 620, 1740], fill=(16, 46, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    canvas = Image.blend(canvas, glow, 0.55)

    shot = Image.open(src_path).convert('RGB')
    ratio = SHOT_W / shot.width
    shot = shot.resize((SHOT_W, int(shot.height * ratio)), Image.LANCZOS)

    inner_r = RADIUS - BEZEL
    mask = rounded_mask(shot.size, inner_r)

    phone_w = shot.width + BEZEL * 2
    phone_h = shot.height + BEZEL * 2
    px = (W - phone_w) // 2
    py = H - phone_h - 90  # bottom margin

    # emerald glow halo behind the device
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.rounded_rectangle([px - 6, py - 6, px + phone_w + 6, py + phone_h + 6],
                         radius=RADIUS + 6, outline=EMERALD + (120,), width=5)
    halo = halo.filter(ImageFilter.GaussianBlur(18))
    canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), halo).convert('RGB'), (0, 0))

    # dark bezel
    bd = ImageDraw.Draw(canvas)
    bd.rounded_rectangle([px, py, px + phone_w, py + phone_h], radius=RADIUS, fill=(23, 32, 51))
    bd.rounded_rectangle([px, py, px + phone_w, py + phone_h], radius=RADIUS,
                         outline=(48, 62, 92), width=2)
    canvas.paste(shot, (px + BEZEL, py + BEZEL), mask)

    # captions (Arabic shaped, RTL via bidi)
    d = ImageDraw.Draw(canvas)
    f_cap = ImageFont.truetype(FONT_PATH, CAPTION_SIZE)
    f_sub = ImageFont.truetype(FONT_PATH, SUB_SIZE)
    cap_y = 130
    draw_centered(d, W / 2, cap_y, ar(caption), f_cap, (255, 255, 255))
    draw_centered(d, W / 2, cap_y + CAPTION_SIZE + 34, ar(sub), f_sub, (148, 178, 210))
    # small emerald accent bar under captions
    bar_w = 120
    d.rounded_rectangle([W / 2 - bar_w / 2, cap_y + CAPTION_SIZE + 34 + SUB_SIZE + 40,
                         W / 2 + bar_w / 2, cap_y + CAPTION_SIZE + 34 + SUB_SIZE + 48],
                        radius=4, fill=EMERALD)

    canvas.save(os.path.join(OUT, out_name), 'PNG')
    print('OK', out_name)

print('DONE')
