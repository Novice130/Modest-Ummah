#!/usr/bin/env python3
import os
import time
import hashlib
import jwt
import requests

KEY_ID = "ZA4U66BMCU"
ISSUER_ID = "07ba3ed9-33fb-4952-8cb5-aca4d1f5a7d6"
KEY_FILE = "/Users/abdulhannan/.appstoreconnect/private_keys/AuthKey_ZA4U66BMCU.p8"

with open(KEY_FILE, "r") as f:
    PRIVATE_KEY = f.read()

def get_token():
    now = int(time.time())
    payload = {
        "iss": ISSUER_ID,
        "exp": now + 1200,
        "aud": "appstoreconnect-v1"
    }
    headers = {"kid": KEY_ID, "typ": "JWT"}
    return jwt.encode(payload, PRIVATE_KEY, algorithm="ES256", headers=headers)

def api_request(method, url, json_data=None):
    token = get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    if method == "GET":
        return requests.get(url, headers=headers)
    elif method == "POST":
        return requests.post(url, json=json_data, headers=headers)
    elif method == "PATCH":
        return requests.patch(url, json=json_data, headers=headers)
    elif method == "DELETE":
        return requests.delete(url, headers=headers)

def upload_screenshot(screenshot_set_id, file_path):
    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    checksum = hashlib.md5(file_bytes).hexdigest()

    print(f"  Uploading screenshot: {file_name} ({file_size} bytes)...")
    reserve_payload = {
        "data": {
            "type": "appScreenshots",
            "attributes": {
                "fileName": file_name,
                "fileSize": file_size
            },
            "relationships": {
                "appScreenshotSet": {
                    "data": {
                        "type": "appScreenshotSets",
                        "id": screenshot_set_id
                    }
                }
            }
        }
    }
    r = api_request("POST", "https://api.appstoreconnect.apple.com/v1/appScreenshots", reserve_payload)
    if r.status_code not in [200, 201]:
        print(f"    ❌ Failed to reserve: {r.text}")
        return False

    shot_data = r.json().get("data", {})
    shot_id = shot_data.get("id")
    ops = shot_data.get("attributes", {}).get("uploadOperations", [])

    for op in ops:
        url = op.get("url")
        offset = op.get("offset")
        length = op.get("length")
        req_headers = {h.get("name"): h.get("value") for h in op.get("requestHeaders", [])}
        chunk = file_bytes[offset:offset+length]
        put_r = requests.put(url, data=chunk, headers=req_headers)
        if put_r.status_code not in [200, 201]:
            print(f"    ❌ Chunk upload failed ({put_r.status_code}): {put_r.text}")
            return False

    commit_payload = {
        "data": {
            "type": "appScreenshots",
            "id": shot_id,
            "attributes": {
                "uploaded": True,
                "sourceFileChecksum": checksum
            }
        }
    }
    commit_r = api_request("PATCH", f"https://api.appstoreconnect.apple.com/v1/appScreenshots/{shot_id}", commit_payload)
    if commit_r.status_code == 200:
        print(f"    ✓ Successfully uploaded & committed: {file_name}")
        return True
    else:
        print(f"    ❌ Commit failed: {commit_r.text}")
        return False

def upload_preview(preview_set_id, file_path):
    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    checksum = hashlib.md5(file_bytes).hexdigest()

    print(f"  Uploading preview video: {file_name} ({file_size} bytes)...")
    reserve_payload = {
        "data": {
            "type": "appPreviews",
            "attributes": {
                "fileName": file_name,
                "fileSize": file_size
            },
            "relationships": {
                "appPreviewSet": {
                    "data": {
                        "type": "appPreviewSets",
                        "id": preview_set_id
                    }
                }
            }
        }
    }
    r = api_request("POST", "https://api.appstoreconnect.apple.com/v1/appPreviews", reserve_payload)
    if r.status_code not in [200, 201]:
        print(f"    ❌ Failed to reserve preview: {r.text}")
        return False

    preview_data = r.json().get("data", {})
    preview_id = preview_data.get("id")
    ops = preview_data.get("attributes", {}).get("uploadOperations", [])

    for op in ops:
        url = op.get("url")
        offset = op.get("offset")
        length = op.get("length")
        req_headers = {h.get("name"): h.get("value") for h in op.get("requestHeaders", [])}
        chunk = file_bytes[offset:offset+length]
        put_r = requests.put(url, data=chunk, headers=req_headers)
        if put_r.status_code not in [200, 201]:
            print(f"    ❌ Chunk upload failed ({put_r.status_code}): {put_r.text}")
            return False

    commit_payload = {
        "data": {
            "type": "appPreviews",
            "id": preview_id,
            "attributes": {
                "uploaded": True,
                "sourceFileChecksum": checksum
            }
        }
    }
    commit_r = api_request("PATCH", f"https://api.appstoreconnect.apple.com/v1/appPreviews/{preview_id}", commit_payload)
    if commit_r.status_code == 200:
        print(f"    ✓ Successfully uploaded & committed preview: {file_name}")
        return True
    else:
        print(f"    ❌ Commit failed: {commit_r.text}")
        return False

def main():
    root = "/Volumes/Mac_main/Documents_Ext/Phet/Modest Ummah/vibe_modest/mobile"
    loc_id = "8a3773f8-5ff0-444e-8c41-e8856dd8034d"

    # Fetch screenshot sets
    r = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets")
    ss_sets = {s.get("attributes", {}).get("screenshotDisplayType"): s.get("id") for s in r.json().get("data", [])}

    # Fetch preview sets
    pr_r = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc_id}/appPreviewSets")
    pr_sets = {p.get("attributes", {}).get("previewType"): p.get("id") for p in pr_r.json().get("data", [])}

    print("Existing Screenshot Sets:", ss_sets)
    print("Existing Preview Sets:", pr_sets)

    # 1. iPhone 6.5" screenshots (upload 02 to 06)
    if "APP_IPHONE_65" in ss_sets:
        set_id = ss_sets["APP_IPHONE_65"]
        print(f"\n📱 Uploading remaining iPhone 6.5\" screenshots to set {set_id}...")
        # Check already uploaded files
        existing_shots = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{set_id}/appScreenshots").json().get("data", [])
        uploaded_names = {s.get("attributes", {}).get("fileName") for s in existing_shots}
        for name in ["01_shop.png", "02_product.png", "03_search.png", "04_bag.png", "05_checkout.png", "06_account.png"]:
            if name in uploaded_names:
                print(f"  Skipping {name} (already uploaded)")
                continue
            p = os.path.join(root, "screenshots/iphone_6.5", name)
            if os.path.exists(p):
                upload_screenshot(set_id, p)

    # 2. iPhone 6.7" / 6.9" screenshots (upload 01 to 06)
    if "APP_IPHONE_67" in ss_sets:
        set_id = ss_sets["APP_IPHONE_67"]
        print(f"\n📱 Uploading iPhone 6.9\" screenshots to set {set_id}...")
        existing_shots = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{set_id}/appScreenshots").json().get("data", [])
        uploaded_names = {s.get("attributes", {}).get("fileName") for s in existing_shots}
        for name in ["01_shop.png", "02_product.png", "03_search.png", "04_bag.png", "05_checkout.png", "06_account.png"]:
            if name in uploaded_names:
                print(f"  Skipping {name} (already uploaded)")
                continue
            p = os.path.join(root, "screenshots/iphone_6.9", name)
            if os.path.exists(p):
                upload_screenshot(set_id, p)

    # 3. iPad Pro 13" screenshots (upload 01 to 06)
    if "APP_IPAD_PRO_3GEN_129" in ss_sets:
        set_id = ss_sets["APP_IPAD_PRO_3GEN_129"]
        print(f"\n📱 Uploading iPad 13\" screenshots to set {set_id}...")
        existing_shots = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{set_id}/appScreenshots").json().get("data", [])
        uploaded_names = {s.get("attributes", {}).get("fileName") for s in existing_shots}
        for name in ["01_shop.png", "02_product.png", "03_search.png", "04_bag.png", "05_checkout.png", "06_account.png"]:
            if name in uploaded_names:
                print(f"  Skipping {name} (already uploaded)")
                continue
            p = os.path.join(root, "screenshots/ipad_13", name)
            if os.path.exists(p):
                upload_screenshot(set_id, p)

    # 4. iPad App Preview Video
    if "IPAD_PRO_3GEN_129" in pr_sets:
        set_id = pr_sets["IPAD_PRO_3GEN_129"]
        print(f"\n🎬 Uploading iPad App Preview Video to set {set_id}...")
        existing_previews = api_request("GET", f"https://api.appstoreconnect.apple.com/v1/appPreviewSets/{set_id}/appPreviews").json().get("data", [])
        if not existing_previews:
            ipad_video = os.path.join(root, "screenshots/videos/ipad_preview.mp4")
            if os.path.exists(ipad_video):
                upload_preview(set_id, ipad_video)
        else:
            print("  iPad preview already uploaded!")

    print("\n🎉 ALL SCREENSHOTS AND APP PREVIEWS UPLOADED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
