#!/usr/bin/env python3
import time
import sys
import jwt
import requests

KEY_ID = "ZA4U66BMCU"
ISSUER_ID = "07ba3ed9-33fb-4952-8cb5-aca4d1f5a7d6"
KEY_FILE = "/Users/abdulhannan/.appstoreconnect/private_keys/AuthKey_ZA4U66BMCU.p8"
APP_ID = "6816634935"
VERSION_ID = "93a42afe-1318-483d-855b-8cc60a2726a6"
BETA_GROUP_ID = "8d5819c0-4a6e-4b92-a650-841e0af997da"

with open(KEY_FILE, "r") as f:
    PRIVATE_KEY = f.read()

def get_headers():
    now = int(time.time())
    token = jwt.encode({"iss": ISSUER_ID, "exp": now + 1200, "aud": "appstoreconnect-v1"}, PRIVATE_KEY, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

print("Waiting for Apple ITMS ingestion and processing...")
build_id = None
attempts = 0
max_attempts = 60 # 20 minutes

while attempts < max_attempts:
    attempts += 1
    headers = get_headers()
    try:
        r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/builds", headers=headers)
        if r.status_code == 200:
            builds = r.json().get("data", [])
            if builds:
                b = builds[0]
                build_id = b.get("id")
                attrs = b.get("attributes", {})
                state = attrs.get("processingState")
                print(f"[{time.strftime('%H:%M:%S')}] Found build {build_id} (Version: {attrs.get('version')}, State: {state})")
                
                if state == "VALID":
                    print("✓ Build processing is COMPLETE and VALID!")
                    
                    # 1. Set export compliance if needed
                    if attrs.get("usesNonExemptEncryption") is None:
                        print("Setting usesNonExemptEncryption = false...")
                        patch_b = {
                            "data": {
                                "type": "builds",
                                "id": build_id,
                                "attributes": {"usesNonExemptEncryption": False}
                            }
                        }
                        p_res = requests.patch(f"https://api.appstoreconnect.apple.com/v1/builds/{build_id}", json=patch_b, headers=headers)
                        print("  Encryption compliance status:", p_res.status_code)
                    
                    # 2. Add build to TestFlight Close_Friends beta group
                    print(f"Deploying build to TestFlight group {BETA_GROUP_ID}...")
                    tf_payload = {
                        "data": [
                            {"type": "builds", "id": build_id}
                        ]
                    }
                    tf_res = requests.post(f"https://api.appstoreconnect.apple.com/v1/betaGroups/{BETA_GROUP_ID}/relationships/builds", json=tf_payload, headers=headers)
                    print("  TestFlight deployment status:", tf_res.status_code)
                    if tf_res.status_code in [200, 204]:
                        print("  🎉 Build successfully distributed to TestFlight (Close_Friends)!")
                    else:
                        print("  TestFlight response:", tf_res.text)

                    # 3. Attach build to App Store Version
                    print(f"Attaching build to App Store Version {VERSION_ID}...")
                    ver_payload = {
                        "data": {
                            "type": "builds",
                            "id": build_id
                        }
                    }
                    ver_res = requests.patch(f"https://api.appstoreconnect.apple.com/v1/appStoreVersions/{VERSION_ID}/relationships/build", json=ver_payload, headers=headers)
                    print("  App Store version build attachment status:", ver_res.status_code)
                    if ver_res.status_code in [200, 204]:
                        print("  🎉 Build successfully attached to App Store Release Version 1.0!")
                    else:
                        print("  App Store attachment response:", ver_res.text)
                    
                    break
                elif state == "PROCESSING":
                    print("  Apple is still processing the build. Waiting 20 seconds...")
                else:
                    print(f"  Build state: {state}")
            else:
                print(f"[{time.strftime('%H:%M:%S')}] Ingestion in progress... (waiting 20s)")
        else:
            print(f"[{time.strftime('%H:%M:%S')}] Query failed ({r.status_code}): {r.text}")
    except Exception as e:
        print("Error checking builds:", e)
    time.sleep(20)

print("\nProcess finished.")
