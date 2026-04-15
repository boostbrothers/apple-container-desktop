#!/usr/bin/env python3
"""
Apple Container Desktop — Typographic Icon
DESIGN.md 기준: Apple Blue (#0071e3), White (#ffffff), Black bg
SF Pro Display Semibold, tight leading, negative letter-spacing
"""

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FINAL = 1024
SCALE = 3
S = FINAL * SCALE
C = S // 2

SF_FONT = "/System/Library/Fonts/SFNS.ttf"
# Variable axes: [Width, Optical Size, GRAD, Weight]


def superellipse(cx, cy, rx, ry, n=5.0, pts=600):
    out = []
    for i in range(pts):
        t = 2 * math.pi * i / pts
        ct, st = math.cos(t), math.sin(t)
        x = cx + rx * abs(ct) ** (2 / n) * (1 if ct >= 0 else -1)
        y = cy + ry * abs(st) ** (2 / n) * (1 if st >= 0 else -1)
        out.append((x, y))
    return out


def ip(pts):
    return [(int(x), int(y)) for x, y in pts]


def make_font(size, weight=600):
    f = ImageFont.truetype(SF_FONT, size)
    f.set_variation_by_axes([100, 28, 400, weight])
    return f


def draw_text_centered(draw, text, cx, y, font, fill, letter_spacing=0):
    if letter_spacing == 0:
        bb = font.getbbox(text)
        tw = bb[2] - bb[0]
        x = cx - tw // 2
        draw.text((x, y), text, fill=fill, font=font)
    else:
        total_w = 0
        char_widths = []
        for ch in text:
            bb = font.getbbox(ch)
            w = bb[2] - bb[0]
            char_widths.append(w)
            total_w += w + letter_spacing
        total_w -= letter_spacing
        x = cx - total_w // 2
        for i, ch in enumerate(text):
            draw.text((x, y), ch, fill=fill, font=font)
            x += char_widths[i] + letter_spacing


def text_width(font, text):
    bb = font.getbbox(text)
    return bb[2] - bb[0]


def text_height(font, text):
    bb = font.getbbox(text)
    return bb[3] - bb[1]


def generate():
    print(f"Generating typographic icon at {S}x{S}...")

    # ── Squircle mask ──
    margin = int(S * 0.018)
    pts = superellipse(C, C, C - margin, C - margin, n=5.0)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(ip(pts), fill=255)

    # ── Background: Pure Black (#000000) ──
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 255))

    # Subtle radial center glow (very faint, per Apple dark section style)
    Y, X = np.ogrid[:S, :S]
    dist = np.sqrt((X - C) ** 2 + (Y - C) ** 2).astype(np.float64)
    t = np.clip(dist / (S * 0.50), 0, 1)
    vig = np.zeros((S, S, 4), dtype=np.uint8)
    vig[:, :, 0] = (8 * (1 - t)).astype(np.uint8)
    vig[:, :, 1] = (10 * (1 - t)).astype(np.uint8)
    vig[:, :, 2] = (16 * (1 - t)).astype(np.uint8)
    vig[:, :, 3] = (18 * (1 - t)).astype(np.uint8)
    bg = Image.alpha_composite(bg, Image.fromarray(vig, "RGBA"))

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(bg, mask=mask)
    print("  [1] Background")

    # ── Typography — DESIGN.md specs ──
    # "Apple": SF Pro Display, 56px → scale to icon
    #   weight 600, line-height 1.07, letter-spacing -0.28px
    # "Container"/"Desktop": SF Pro Display, 40px → scale to icon
    #   weight 600, line-height 1.10, letter-spacing normal

    # Map DESIGN.md px sizes to icon proportions
    # In a 1024px icon, the 56px hero → ~18% of icon height
    # Scaling factor: icon is like a mini viewport

    # Find font size so "Container" (longest) fits ~78% of icon width
    target_w = S * 0.78
    test_font = make_font(200, weight=600)
    actual_w = text_width(test_font, "Container")
    base_size = int(200 * target_w / actual_w)

    # "Apple" is Display Hero style — larger, weight 600
    apple_size = int(base_size * 1.15)
    # "Container"/"Desktop" is Section Heading style
    section_size = base_size

    font_apple = make_font(apple_size, weight=600)
    font_section = make_font(section_size, weight=600)

    # Letter spacing from DESIGN.md
    # Hero: -0.28px at 56px → ratio = -0.005 per px
    ls_apple = int(-apple_size * 0.005)
    # Section: normal (0)
    ls_section = 0

    # ── Colors from DESIGN.md ──
    apple_blue = (0, 113, 227, 255)     # #0071e3 — Apple Blue (interactive accent)
    text_white = (255, 255, 255, 255)   # #ffffff — text on dark backgrounds

    # ── Layout ──
    h_apple = text_height(font_apple, "Apple")
    h_cont  = text_height(font_section, "Container")
    h_desk  = text_height(font_section, "Desktop")

    # Line-height gaps from DESIGN.md
    # Hero LH 1.07 → gap ≈ 0.07 * font_size (very tight)
    # Section LH 1.10 → gap ≈ 0.10 * font_size
    gap_after_apple = int(apple_size * 0.20)
    gap_after_cont  = int(section_size * 0.16)

    total_h = h_apple + gap_after_apple + h_cont + gap_after_cont + h_desk
    y_start = C - total_h // 2

    bb_a = font_apple.getbbox("Apple")
    bb_c = font_section.getbbox("Container")
    bb_d = font_section.getbbox("Desktop")

    # ── Draw text ──
    txt = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt, "RGBA")

    # "Apple" — Apple Blue
    y_a = y_start
    draw_text_centered(td, "Apple", C, y_a - bb_a[1], font_apple,
                       apple_blue, letter_spacing=ls_apple)

    # "Container" — White
    y_c = y_a + h_apple + gap_after_apple
    draw_text_centered(td, "Container", C, y_c - bb_c[1], font_section,
                       text_white, letter_spacing=ls_section)

    # "Desktop" — White
    y_d = y_c + h_cont + gap_after_cont
    draw_text_centered(td, "Desktop", C, y_d - bb_d[1], font_section,
                       text_white, letter_spacing=ls_section)

    # Mask text to squircle
    txt_m = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    txt_m.paste(txt, mask=mask)
    print("  [2] Typography")

    # ── Subtle blue glow behind "Apple" ──
    glow_cy = y_a + h_apple // 2
    glow_r = int(S * 0.18)
    d_glow = np.sqrt((X - C) ** 2 + (Y - glow_cy) ** 2)
    tg = np.clip(d_glow / glow_r, 0, 1)
    g_arr = np.zeros((S, S, 4), dtype=np.uint8)
    g_arr[:, :, 0] = (0 * (1 - tg)).astype(np.uint8)
    g_arr[:, :, 1] = (80 * (1 - tg) * 0.12).astype(np.uint8)
    g_arr[:, :, 2] = (200 * (1 - tg) * 0.12).astype(np.uint8)
    g_arr[:, :, 3] = (35 * (1 - tg)).astype(np.uint8)
    glow = Image.fromarray(g_arr, "RGBA")
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(S * 0.04)))
    glow_m = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_m.paste(glow, mask=mask)
    print("  [3] Blue glow")

    # ── Composite: bg → glow → text ──
    bg_only = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg_only.paste(bg, mask=mask)
    canvas = Image.alpha_composite(bg_only, glow_m)
    canvas = Image.alpha_composite(canvas, txt_m)

    # ── Inner edge highlight ──
    mo = int(S * 0.018)
    mi = int(S * 0.027)
    po = superellipse(C, C, C - mo, C - mo)
    pi_ = superellipse(C, C, C - mi, C - mi)
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring, "RGBA").polygon(ip(po), fill=(255, 255, 255, 7))
    inner_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inner_mask).polygon(ip(pi_), fill=255)
    ra = np.array(ring)
    ra[:, :, 3] = np.where(np.array(inner_mask) > 128, 0, ra[:, :, 3])
    ring = Image.fromarray(ra, "RGBA").filter(
        ImageFilter.GaussianBlur(radius=int(S * 0.003)))
    canvas = Image.alpha_composite(canvas, ring)
    print("  [4] Edge polish")

    icon = canvas.resize((FINAL, FINAL), Image.LANCZOS)
    print(f"\nDownscaled to {FINAL}x{FINAL}")
    return icon


def save_all(icon):
    base = "/Users/yoonho.go/workspace/apple-container-desktop/src-tauri/icons"

    # PNG sizes
    for name, sz in {
        "icon.png": 1024, "128x128@2x.png": 256, "128x128.png": 128,
        "32x32.png": 32, "Square310x310Logo.png": 310,
        "Square284x284Logo.png": 284, "Square150x150Logo.png": 150,
        "Square142x142Logo.png": 142, "Square107x107Logo.png": 107,
        "Square89x89Logo.png": 89, "Square71x71Logo.png": 71,
        "Square44x44Logo.png": 44, "Square30x30Logo.png": 30,
        "StoreLogo.png": 50,
    }.items():
        icon.resize((sz, sz), Image.LANCZOS).save(f"{base}/{name}")
        print(f"  {name} ({sz})")

    # ICO (Windows)
    icon.save(f"{base}/icon.ico", format="ICO",
              sizes=[(sz, sz) for sz in [16, 24, 32, 48, 64, 128, 256]])
    print("  icon.ico (multi-size)")


def generate_icns(base):
    """Generate macOS .icns via iconutil."""
    import subprocess, os, shutil
    iconset = f"{base}/icon.iconset"
    os.makedirs(iconset, exist_ok=True)
    icon = Image.open(f"{base}/icon.png")
    for name, sz in {
        "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
    }.items():
        icon.resize((sz, sz), Image.LANCZOS).save(f"{iconset}/{name}")
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", f"{base}/icon.icns"],
                   check=True)
    shutil.rmtree(iconset)
    print("  icon.icns (macOS)")


if __name__ == "__main__":
    icon = generate()
    base = "/Users/yoonho.go/workspace/apple-container-desktop/src-tauri/icons"
    print("\nSaving...")
    save_all(icon)
    generate_icns(base)
    print("Done!")
