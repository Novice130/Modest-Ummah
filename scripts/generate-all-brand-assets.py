#!/usr/bin/env python3
"""
Generates all brand assets for Modest Ummah across Web (Next.js) and Mobile (Flutter/iOS/Android)
from the uploaded luxury monogram artwork.
"""

import os
import base64
import io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC_IMAGE = Path('/Users/abdulhannan/.gemini/antigravity/brain/f4a18a6e-d8b6-4668-88e0-8c7085cbd92d/.user_uploaded/media_1790072317005.jpg')
ROOT_DIR = Path('/Volumes/Mac_main/Documents_Ext/Phet/Modest Ummah/vibe_modest')
PUBLIC_DIR = ROOT_DIR / 'public'
APP_DIR = ROOT_DIR / 'app'
MOBILE_DIR = ROOT_DIR / 'mobile'
IOS_ICONS_DIR = MOBILE_DIR / 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
IOS_LAUNCH_DIR = MOBILE_DIR / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
ANDROID_RES_DIR = MOBILE_DIR / 'android/app/src/main/res'
MOBILE_ASSETS_DIR = MOBILE_DIR / 'assets/images'
FONTS_DIR = MOBILE_DIR / 'assets/fonts'

def ensure_dirs():
    for d in [
        PUBLIC_DIR / 'images',
        IOS_ICONS_DIR,
        IOS_LAUNCH_DIR,
        MOBILE_ASSETS_DIR,
        MOBILE_DIR / 'screenshots',
        ANDROID_RES_DIR / 'mipmap-mdpi',
        ANDROID_RES_DIR / 'mipmap-hdpi',
        ANDROID_RES_DIR / 'mipmap-xhdpi',
        ANDROID_RES_DIR / 'mipmap-xxhdpi',
        ANDROID_RES_DIR / 'mipmap-xxxhdpi',
    ]:
        d.mkdir(parents=True, exist_ok=True)

def build_master_assets():
    print("1. Loading source and cleaning watermark...")
    im = Image.open(SRC_IMAGE).convert('RGB')
    w, h = im.size

    # 1. Clean watermark at (920, 650)
    scx, scy = 920, 650
    radius = 28
    patch_size = (radius + 15) * 2
    mask_patch = Image.new('L', (patch_size, patch_size), 0)
    draw_patch = ImageDraw.Draw(mask_patch)
    draw_patch.ellipse((15, 15, patch_size - 15, patch_size - 15), fill=255)
    mask_patch = mask_patch.filter(ImageFilter.GaussianBlur(8))

    source_x = scx + 35
    clean_patch = im.crop((source_x - patch_size//2, scy - patch_size//2, source_x + patch_size//2, scy + patch_size//2))
    cleaned = im.copy()
    cleaned.paste(clean_patch, (scx - patch_size//2, scy - patch_size//2), mask_patch)

    # 2. Build seamless 1024x1024 textured linen background
    print("2. Synthesizing full 1024x1024 linen canvas...")
    bg_tile = im.crop((10, 20, 150, 720))
    full_bg = Image.new('RGB', (1024, 1024), (235, 227, 218))
    for tx in range(0, 1024, 140):
        for ty in range(0, 1024, 700):
            tile = bg_tile.copy()
            if (tx // 140) % 2 == 1:
                tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            if (ty // 700) % 2 == 1:
                tile = tile.transpose(Image.FLIP_TOP_BOTTOM)
            full_bg.paste(tile, (tx, ty))

    # 3. Scale and composite emblem onto 1024x1024
    scale = 0.90
    new_w = int(w * scale)
    new_h = int(h * scale)
    scaled_cleaned = cleaned.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Center coordinates of the emblem in original image
    cx, cy = 551.5 * scale, 400.5 * scale
    dest_x = int(round(512 - cx))
    dest_y = int(round(512 - cy))

    feather_mask = Image.new('L', (new_w, new_h), 255)
    draw_f = ImageDraw.Draw(feather_mask)
    margin_x = int(35 * scale)
    margin_y = int(25 * scale)
    for i in range(margin_x):
        val = int(255 * (i / margin_x))
        draw_f.line([(i, 0), (i, new_h)], fill=val)
        draw_f.line([(new_w - 1 - i, 0), (new_w - 1 - i, new_h)], fill=val)
    for j in range(margin_y):
        val = int(255 * (j / margin_y))
        for x in range(new_w):
            curr = feather_mask.getpixel((x, j))
            feather_mask.putpixel((x, j), min(curr, val))
            curr_b = feather_mask.getpixel((x, new_h - 1 - j))
            feather_mask.putpixel((x, new_h - 1 - j), min(curr_b, val))

    feather_mask = feather_mask.filter(ImageFilter.GaussianBlur(12))

    master_square = full_bg.copy()
    master_square.paste(scaled_cleaned, (dest_x, dest_y), feather_mask)

    # 4. Circular luxury badge with gold hairline rim
    print("3. Creating circular luxury badge...")
    master_badge = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    cmask = Image.new('L', (1024, 1024), 0)
    cdraw = ImageDraw.Draw(cmask)
    cdraw.ellipse((30, 30, 994, 994), fill=255)
    master_badge.paste(master_square, (0, 0), cmask)
    bdraw = ImageDraw.Draw(master_badge)
    bdraw.ellipse((30, 30, 994, 994), outline=(198, 162, 110, 255), width=6)

    return master_square, master_badge

def export_assets(master_square, master_badge):
    print("4. Exporting Web and Mobile assets...")

    # Web Logo PNGs (512x512)
    badge_512 = master_badge.resize((512, 512), Image.Resampling.LANCZOS)
    badge_512.save(PUBLIC_DIR / 'images/logo.png', 'PNG')
    badge_512.save(PUBLIC_DIR / 'images/logo-badge.png', 'PNG')
    badge_512.save(MOBILE_ASSETS_DIR / 'logo.png', 'PNG')
    badge_512.save(MOBILE_ASSETS_DIR / 'logo_badge.png', 'PNG')
    print("  -> public/images/logo.png & mobile/assets/images/logo.png")

    square_512 = master_square.resize((512, 512), Image.Resampling.LANCZOS)
    square_512.save(PUBLIC_DIR / 'images/logo-square.png', 'PNG')
    square_512.save(MOBILE_ASSETS_DIR / 'logo_square.png', 'PNG')

    # Touch and Favicons
    badge_180 = master_badge.resize((180, 180), Image.Resampling.LANCZOS)
    badge_180.save(PUBLIC_DIR / 'apple-icon.png', 'PNG')
    badge_180.save(PUBLIC_DIR / 'apple-touch-icon.png', 'PNG')
    badge_180.save(PUBLIC_DIR / 'apple-touch-icon-precomposed.png', 'PNG')
    
    # Favicon ICO with multiple sizes (16, 32, 48)
    master_badge.save(
        PUBLIC_DIR / 'favicon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("  -> public/favicon.ico & apple-touch-icon.png")

    # SVG icon embedding high-res PNG for browsers requesting SVG
    buffered = io.BytesIO()
    badge_512.save(buffered, format="PNG")
    b64_png = base64.b64encode(buffered.getvalue()).decode('utf-8')
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,{b64_png}" width="512" height="512" />
</svg>
'''
    (PUBLIC_DIR / 'icon.svg').write_text(svg_content)
    (APP_DIR / 'icon.svg').write_text(svg_content)
    (PUBLIC_DIR / 'apple-icon.svg').write_text(svg_content)
    (APP_DIR / 'apple-icon.svg').write_text(svg_content)
    print("  -> icon.svg & apple-icon.svg (public & app)")

    # iOS App Icons
    print("5. Generating iOS AppIcon set...")
    ios_icons = [
        ('Icon-App-20x20@1x.png', 20),
        ('Icon-App-20x20@2x.png', 40),
        ('Icon-App-20x20@3x.png', 60),
        ('Icon-App-29x29@1x.png', 29),
        ('Icon-App-29x29@2x.png', 58),
        ('Icon-App-29x29@3x.png', 87),
        ('Icon-App-40x40@1x.png', 40),
        ('Icon-App-40x40@2x.png', 80),
        ('Icon-App-40x40@3x.png', 120),
        ('Icon-App-60x60@2x.png', 120),
        ('Icon-App-60x60@3x.png', 180),
        ('Icon-App-76x76@1x.png', 76),
        ('Icon-App-76x76@2x.png', 152),
        ('Icon-App-83.5x83.5@2x.png', 167),
        ('Icon-App-1024x1024@1x.png', 1024),
    ]
    for filename, size in ios_icons:
        icon_img = master_square.resize((size, size), Image.Resampling.LANCZOS)
        # 1024 must be RGB (no alpha)
        if size == 1024:
            icon_img = icon_img.convert('RGB')
        icon_img.save(IOS_ICONS_DIR / filename, 'PNG')
    
    # Store 1024 marketing icon
    marketing = master_square.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGB')
    marketing.save(MOBILE_DIR / 'screenshots/icon-1024.png', 'PNG')
    print("  -> All iOS icons in AppIcon.appiconset & screenshots/icon-1024.png")

    # iOS Launch Screen images
    print("6. Generating iOS LaunchImage set...")
    launch_sizes = [
        ('LaunchImage.png', 200),
        ('LaunchImage@2x.png', 400),
        ('LaunchImage@3x.png', 600),
    ]
    for filename, size in launch_sizes:
        launch_img = master_badge.resize((size, size), Image.Resampling.LANCZOS)
        launch_img.save(IOS_LAUNCH_DIR / filename, 'PNG')
    print("  -> iOS LaunchImage 1x/2x/3x")

    # Android launcher icons
    print("7. Generating Android mipmap icons...")
    android_icons = [
        ('mipmap-mdpi', 48),
        ('mipmap-hdpi', 72),
        ('mipmap-xhdpi', 96),
        ('mipmap-xxhdpi', 144),
        ('mipmap-xxxhdpi', 192),
    ]
    for folder, size in android_icons:
        a_img = master_square.resize((size, size), Image.Resampling.LANCZOS)
        a_img.save(ANDROID_RES_DIR / folder / 'ic_launcher.png', 'PNG')
    print("  -> Android ic_launcher in all mipmaps")

    # OpenGraph 1200x630
    print("8. Generating OpenGraph social card (1200x630)...")
    tile = master_square.crop((50, 50, 250, 250))
    og = Image.new('RGB', (1200, 630), (235, 227, 218))
    for x in range(0, 1200, 200):
        for y in range(0, 630, 200):
            t = tile.copy()
            if (x // 200) % 2 == 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if (y // 200) % 2 == 1:
                t = t.transpose(Image.FLIP_TOP_BOTTOM)
            og.paste(t, (x, y))

    badge_380 = master_badge.resize((380, 380), Image.Resampling.LANCZOS)
    og.paste(badge_380, ((1200 - 380) // 2, 50), badge_380)

    draw_og = ImageDraw.Draw(og)
    title_font = ImageFont.truetype(str(FONTS_DIR / 'PlayfairDisplay-Variable.ttf'), 40)
    title_text = 'M O D E S T   U M M A H'
    t_box = draw_og.textbbox((0, 0), title_text, font=title_font)
    t_w = t_box[2] - t_box[0]
    draw_og.text(((1200 - t_w) // 2, 460), title_text, fill=(35, 30, 25), font=title_font)

    sub_font = ImageFont.truetype(str(FONTS_DIR / 'Inter-Variable.ttf'), 16)
    sub_text = 'P R E M I U M   M O D E S T   F A S H I O N'
    s_box = draw_og.textbbox((0, 0), sub_text, font=sub_font)
    s_w = s_box[2] - s_box[0]
    draw_og.text(((1200 - s_w) // 2, 520), sub_text, fill=(120, 110, 100), font=sub_font)

    og.save(PUBLIC_DIR / 'og-image.jpg', 'JPEG', quality=95)
    og.save(PUBLIC_DIR / 'og-image.png', 'PNG')
    print("  -> public/og-image.jpg & public/og-image.png")

def main():
    ensure_dirs()
    master_square, master_badge = build_master_assets()
    export_assets(master_square, master_badge)
    print("\n✓ All brand assets successfully generated across Web & Mobile!")

if __name__ == '__main__':
    main()
