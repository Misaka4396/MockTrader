# tools/make_icon.py — 生成二次元风格（蜡烛猫 mascot）exe 图标 (.ico 多尺寸)
import os
from PIL import Image, ImageDraw

W = H = 256
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cs', 'MockTrader')

GREEN = (16, 185, 129, 255)
GREEN_D = (5, 150, 105, 255)
PINK = (255, 182, 198, 255)
DARK = (31, 41, 55, 255)
BLUE = (91, 141, 239, 255)

def star(d, cx, cy, r, color):
    d.polygon([
        (cx, cy - r), (cx + r * 0.28, cy - r * 0.28), (cx + r, cy),
        (cx + r * 0.28, cy + r * 0.28), (cx, cy + r), (cx - r * 0.28, cy + r * 0.28),
        (cx - r, cy), (cx - r * 0.28, cy - r * 0.28),
    ], fill=color)

def make_icon():
    # 1) 渐变背景（粉 -> 蓝），圆角
    grad = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dg = ImageDraw.Draw(grad)
    top = (255, 209, 220); bot = (191, 216, 255)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
        dg.line([(0, y), (W, y)], fill=c)
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([8, 8, W - 8, H - 8], radius=48, fill=255)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # 2) 蜡烛上下影线
    d.line([(128, 56), (128, 88)], fill=GREEN_D, width=7)
    d.line([(128, 180), (128, 208)], fill=GREEN_D, width=7)

    # 3) 蜡烛主体（圆角矩形）
    d.rounded_rectangle([92, 88, 164, 180], radius=12, fill=GREEN, outline=GREEN_D, width=4)

    # 4) 猫耳
    d.polygon([(96, 92), (66, 40), (116, 72)], fill=GREEN, outline=GREEN_D)
    d.polygon([(160, 92), (190, 40), (140, 72)], fill=GREEN, outline=GREEN_D)
    d.polygon([(98, 88), (78, 56), (110, 74)], fill=PINK)
    d.polygon([(158, 88), (178, 56), (146, 74)], fill=PINK)

    # 5) 大眼睛（眼白 + 虹膜 + 瞳孔 + 高光）
    for lx, rx in [(102, 132)]:
        d.ellipse([lx, 116, lx + 22, 148], fill=(255, 255, 255, 255), outline=DARK, width=3)
        d.ellipse([rx, 116, rx + 22, 148], fill=(255, 255, 255, 255), outline=DARK, width=3)
        d.ellipse([lx + 4, 122, lx + 18, 142], fill=BLUE)
        d.ellipse([rx + 4, 122, rx + 18, 142], fill=BLUE)
        d.ellipse([lx + 8, 126, lx + 14, 138], fill=DARK)
        d.ellipse([rx + 8, 126, rx + 14, 138], fill=DARK)
        d.ellipse([lx + 11, 119, lx + 15, 123], fill=(255, 255, 255, 255))
        d.ellipse([rx + 11, 119, rx + 15, 123], fill=(255, 255, 255, 255))

    # 6) 腮红
    d.ellipse([86, 152, 106, 163], fill=(255, 143, 163, 150))
    d.ellipse([150, 152, 170, 163], fill=(255, 143, 163, 150))

    # 7) 嘴巴（微笑弧）
    d.arc([122, 158, 134, 172], start=0, end=180, fill=DARK, width=3)

    # 8) 背景星光
    for (cx, cy) in [(44, 44), (212, 56), (50, 204), (208, 196), (206, 150)]:
        star(d, cx, cy, 12, (255, 255, 255, 220))

    return img

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    img = make_icon()
    ico_path = os.path.join(OUT_DIR, 'icon.ico')
    png_path = os.path.join(OUT_DIR, 'icon.png')
    img.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    img.save(png_path)
    print('icon.ico ->', ico_path, os.path.getsize(ico_path), 'bytes')
    print('icon.png ->', png_path, os.path.getsize(png_path), 'bytes')
