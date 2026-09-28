#!/usr/bin/env python3
import os
import sys
import time
import signal
import shutil
import subprocess
from PIL import Image

PROJECT_ROOT = "/Volumes/Mac_main/Documents_Ext/Phet/Modest Ummah/vibe_modest/mobile"
API_BASE_URL = "https://modestummah.com"
STRIPE_KEY = "pk_test_51StX7wLVTPxo7F7hmpEwEgwxiHNMMNr4Wne6lUPSLzqSbRgVUmdzLPhbScO8RJaM34S09oFu15OhfN5DdWONIDCe00vLwM3eSF"

IPHONE_ID = "51935319-ABB0-4EF6-BE1F-7172F3FCC53F"
IPAD_ID = "300F416E-1D9D-4BF7-A5F4-0FB1DEF4CE69"

SCREENSHOTS_DIR = os.path.join(PROJECT_ROOT, "screenshots")
VIDEOS_DIR = os.path.join(SCREENSHOTS_DIR, "videos")
IPHONE_65_DIR = os.path.join(SCREENSHOTS_DIR, "iphone_6.5")
IPHONE_69_DIR = os.path.join(SCREENSHOTS_DIR, "iphone_6.9")
IPAD_13_DIR = os.path.join(SCREENSHOTS_DIR, "ipad_13")

for d in [VIDEOS_DIR, IPHONE_65_DIR, IPHONE_69_DIR, IPAD_13_DIR]:
    os.makedirs(d, exist_ok=True)

def resize_image(src_path, dst_path, target_width, target_height):
    with Image.open(src_path) as img:
        resized = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        resized.save(dst_path, "PNG", optimize=True)
    print(f"  ✓ Saved {os.path.basename(dst_path)} ({target_width}x{target_height})")

def run_capture(device_name, device_id, is_ipad=False):
    print(f"\n==================================================")
    print(f" Starting capture for {device_name} ({device_id})")
    print(f"==================================================")

    names = ["01_shop", "02_product", "03_search", "04_bag", "05_checkout", "06_account"]
    for n in names:
        p = os.path.join(PROJECT_ROOT, n)
        if os.path.exists(p):
            try: os.remove(p)
            except: pass

    # 1. Start Video Recording in /tmp to prevent sandbox/TCC permission errors
    prefix = "ipad" if is_ipad else "iphone"
    tmp_video = f"/tmp/{prefix}_preview.mp4"
    final_video = os.path.join(VIDEOS_DIR, f"{prefix}_preview.mp4")

    if os.path.exists(tmp_video):
        try: os.remove(tmp_video)
        except: pass
    if os.path.exists(final_video):
        try: os.remove(final_video)
        except: pass

    print(f"🎥 Starting video recording -> {tmp_video}")
    rec_proc = subprocess.Popen([
        "xcrun", "simctl", "io", device_id, "recordVideo",
        "--codec=h264", "--force", tmp_video
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    # 2. Run Flutter Drive
    drive_cmd = [
        "flutter", "drive",
        "--driver=test_driver/integration_test.dart",
        "--target=integration_test/capture_flow.dart",
        f"-d", device_id,
        f"--dart-define=API_BASE_URL={API_BASE_URL}",
        f"--dart-define=STRIPE_PUBLISHABLE_KEY={STRIPE_KEY}"
    ]

    print(f"🚀 Running Flutter Drive customer journey on {device_name}...")
    subprocess.run(drive_cmd, cwd=PROJECT_ROOT)

    # 3. Stop Video Recording gracefully
    print(f"🛑 Finalizing video recording...")
    try:
        rec_proc.send_signal(signal.SIGINT)
        rec_proc.wait(timeout=15)
    except Exception as e:
        print("  rec_proc exception:", e)
        rec_proc.kill()
    time.sleep(2)

    if os.path.exists(tmp_video):
        shutil.copy2(tmp_video, final_video)
        size_mb = os.path.getsize(final_video) / (1024 * 1024)
        print(f"✅ Video recorded and saved: {final_video} ({size_mb:.2f} MB)")
    else:
        print(f"⚠️ Video recording warning: {tmp_video} not created.")

    # 4. Process screenshots
    print(f"🖼️ Processing screenshots for {device_name}...")
    for n in names:
        raw_path = os.path.join(PROJECT_ROOT, n)
        if os.path.exists(raw_path):
            if is_ipad:
                # iPad 13" Display: 2048 x 2732
                dst = os.path.join(IPAD_13_DIR, f"{n}.png")
                resize_image(raw_path, dst, 2048, 2732)
            else:
                # iPhone 6.5" Display: 1284 x 2778
                dst_65 = os.path.join(IPHONE_65_DIR, f"{n}.png")
                resize_image(raw_path, dst_65, 1284, 2778)
                # iPhone 6.9" Display: 1320 x 2868
                dst_69 = os.path.join(IPHONE_69_DIR, f"{n}.png")
                resize_image(raw_path, dst_69, 1320, 2868)
            try: os.remove(raw_path)
            except: pass
        else:
            print(f"  Missing screenshot: {n}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "both"
    if target in ["iphone", "both"]:
        run_capture("iPhone 17", IPHONE_ID, is_ipad=False)
    if target in ["ipad", "both"]:
        run_capture("iPad Pro 13-inch (M5)", IPAD_ID, is_ipad=True)
    print("\n🎉 ALL ASSETS CAPTURED AND GENERATED SUCCESSFULLY!")
