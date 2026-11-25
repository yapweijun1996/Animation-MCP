import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1080, 1920
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
def make(title, sub, note, out):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # soft dark gradient behind the lower third for legibility
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    for y in range(1250, H):
        a = int(150 * (y - 1250) / (H - 1250)); gd.line([(0, y), (W, y)], fill=(5, 20, 30, a))
    img = Image.alpha_composite(img, g)
    d = ImageDraw.Draw(img)
    ft = ImageFont.truetype(FONT, 96); fs = ImageFont.truetype(FONT, 44); fn = ImageFont.truetype(FONT, 30)
    d.rectangle([84, 1560, 92, 1736], fill=(255, 214, 140, 255))
    d.text((120, 1550), title, font=ft, fill=(255, 255, 255, 255))
    d.text((120, 1680), sub, font=fs, fill=(235, 245, 250, 235))
    tw = d.textlength(note, font=fn)
    d.text((W - 60 - tw, 1840), note, font=fn, fill=(255, 255, 255, 200))
    img.save(out)
if __name__ == '__main__':
    make('马六甲海峡', '最窄可航行水道约 2.7 km', '示意比例 · 船体放大 6 倍', 'title_overlay.png')
