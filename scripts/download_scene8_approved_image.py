"""Download the exact approved Scene 8 image using owner-authenticated signing.

Read-only. Does not use Modal/GPU, update storage, or create a generation job.
"""

import getpass
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "https://mdofsinyofqbeapzfygu.supabase.co"
PROJECT_ID = "8faa2cd4-361f-4764-bf1e-7800b87d6292"
ASSET_ID = "99da9456-4ef4-43ea-afa3-20afc10aca58"
STORAGE_PATH = (
    PROJECT_ID + "/scene-images/a6cb12eb-be4d-4982-9e28-2b29e3332af0/"
    "b352251c-3901-4e2c-981a-8de35430d042/"
    "6416bfa0-feab-4b16-b02b-80c45a9c05bb.jpg"
)
EXPECTED_BYTES = 431668
LOCAL = Path.home() / ".local/share/bragora-modal/Scene8-Approved-Source.jpg"
ANDROID = Path("/sdcard/Download/BragoraForge-Approved-Source.jpg")


def require(condition, error):
    if not condition:
        raise SystemExit(error)


def post(url, body, public_key, access_token=None):
    headers = {"apikey": public_key, "Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = "Bearer " + access_token
    request = Request(url, data=json.dumps(body).encode("utf-8"),
                      headers=headers, method="POST")
    try:
        with urlopen(request, timeout=45) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        return exc.code, {}


def safe_write(destination, data):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        require(destination.read_bytes() == data, "DESTINATION_DIFFERS_REFUSING_OVERWRITE")
    else:
        destination.write_bytes(data)
    require(destination.read_bytes() == data, "COPY_MISMATCH")


def main():
    src = Path("src/lib/supabase/client.ts").read_text(encoding="utf-8")
    match = re.search(r'DEFAULT_SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"', src)
    require(match is not None, "PUBLIC_KEY_LOOKUP_FAILED")
    public_key = match.group(1)

    email = getpass.getpass("Login email (hidden): ")
    password = getpass.getpass("Password (hidden): ")
    status, auth = post(BASE + "/auth/v1/token?grant_type=password",
                        {"email": email, "password": password}, public_key)
    password = None
    print("AUTH_HTTP:", status, flush=True)
    require(status == 200 and isinstance(auth.get("access_token"), str), "AUTH_FAILED")
    token = auth["access_token"]

    status, signed = post(BASE + "/functions/v1/beatvision-generation",
                          {"action": "image_url", "projectId": PROJECT_ID,
                           "assetId": ASSET_ID}, public_key, token)
    print("IMAGE_URL_HTTP:", status, flush=True)
    require(status == 200 and isinstance(signed.get("image_url"), str),
            "IMAGE_SIGN_FAILED")
    signed_url = signed["image_url"]
    parsed = urlparse(signed_url)
    expected_route = "/storage/v1/object/sign/visual-assets/" + STORAGE_PATH
    require(parsed.scheme == "https"
            and parsed.netloc == urlparse(BASE).netloc
            and parsed.path == expected_route, "SIGNED_IMAGE_URL_NOT_EXPECTED_ASSET")

    with urlopen(Request(signed_url, method="GET"), timeout=90) as response:
        data = response.read(EXPECTED_BYTES + 1)
    print("DOWNLOADED_BYTES:", len(data), flush=True)
    require(len(data) == EXPECTED_BYTES, "SOURCE_SIZE_MISMATCH")
    require(data[:3] == b"\xff\xd8\xff" and data[-2:] == b"\xff\xd9",
            "INVALID_JPEG_CONTENT")

    safe_write(LOCAL, data)
    print("SOURCE_SHA256:", hashlib.sha256(data).hexdigest())
    print("SOURCE_READY:", str(LOCAL))

    if ANDROID.parent.is_dir() and ANDROID.parent.exists():
        safe_write(ANDROID, data)
        print("ANDROID_IMAGE_READY:", str(ANDROID))
    else:
        print("ANDROID_DOWNLOADS_NOT_MOUNTED")
    print("NO_GPU_CALLS_OR_STORAGE_WRITES")


if __name__ == "__main__":
    main()
