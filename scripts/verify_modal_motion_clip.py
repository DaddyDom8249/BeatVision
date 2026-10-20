"""Read-only verification of one completed, private Modal MP4.

No Modal calls, queue writes, job submissions or GPU allocation.
Fetches the exact approved-project job and video object with creator auth.
A decoded frame difference is evidence of changing imagery, not proof of
correct subject movement or creator approval.
"""

import getpass
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen

BASE = "https://mdofsinyofqbeapzfygu.supabase.co"
PROJECT = "8faa2cd4-361f-4764-bf1e-7800b87d6292"
JOB = "a054d8d3-2f53-4aaf-9018-937d99fc1b8b"
DEST = Path.home() / ".local/share/bragora-modal" / (JOB + ".mp4")
LIMIT = 8 * 1024 * 1024


def require(ok, message):
    if not ok:
        raise SystemExit(message)


def api_json(url, key, token=None, body=None):
    headers = {"apikey": key}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=json.dumps(body).encode() if body is not None else None,
                  headers=headers, method="POST" if body is not None else "GET")
    try:
        with urlopen(req, timeout=45) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, {}


def trusted_url(value):
    parsed = urlparse(value)
    require(parsed.scheme == "https" and parsed.netloc == urlparse(BASE).netloc,
            "UNTRUSTED_STORAGE_URL")
    require(parsed.path.startswith("/storage/v1/object/sign/visual-assets/"),
            "UNEXPECTED_STORAGE_URL_PATH")
    return value


def download(url, key, token=None):
    headers = {"apikey": key}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with urlopen(Request(url, headers=headers), timeout=90) as response:
            return response.read(LIMIT + 1)
    except HTTPError as error:
        print("DOWNLOAD_HTTP:", error.code, flush=True)
        return None


def decode_frames(path):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except (ImportError, OSError):
            print("DECODE_STATUS: FFMPEG_NOT_INSTALLED")
            print("SUBJECT_MOTION_VERIFIED: False")
            return

    width, height = 160, 90
    process = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-i", str(path),
         "-an", "-vf", f"scale={width}:{height},format=gray",
         "-vsync", "0", "-f", "rawvideo", "pipe:1"],
        capture_output=True, timeout=120,
    )
    if process.returncode != 0:
        print("DECODE_STATUS: FAILED")
        print("FFMPEG_ERROR:", process.stderr.decode("utf-8", "replace")[:1200])
        return

    pixel_count = width * height
    raw = process.stdout
    require(len(raw) % pixel_count == 0, "RAW_FRAME_SIZE_INVALID")
    count = len(raw) // pixel_count
    print("FFMPEG_DECODE_PASS")
    print("DECODED_FRAMES:", count)

    require(count >= 2, "INSUFFICIENT_VIDEO_FRAMES")
    first = raw[:pixel_count]
    middle = raw[(count // 2) * pixel_count:(count // 2 + 1) * pixel_count]
    last = raw[-pixel_count:]
    changed_middle = sum(abs(a - b) for a, b in zip(first, middle)) / pixel_count
    changed_last = sum(abs(a - b) for a, b in zip(first, last)) / pixel_count
    print("FIRST_MIDDLE_PIXEL_DELTA:", round(changed_middle, 3))
    print("FIRST_LAST_PIXEL_DELTA:", round(changed_last, 3))
    print("FRAMES_DIFFER:", changed_middle > 0 or changed_last > 0)
    print("SUBJECT_MOTION_VERIFIED: False")


def main():
    src = Path("src/lib/supabase/client.ts").read_text()
    match = re.search(r'DEFAULT_SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"', src)
    require(match is not None, "PUBLIC_KEY_LOOKUP_FAILED")
    key = match.group(1)

    email = getpass.getpass("Login email (hidden): ")
    password = getpass.getpass("Password (hidden): ")
    status, auth = api_json(BASE + "/auth/v1/token?grant_type=password",
                            key, body={"email": email, "password": password})
    password = None
    print("AUTH_HTTP:", status)
    require(status == 200 and isinstance(auth.get("access_token"), str),
            "AUTH_FAILED_NO_VIDEO_DOWNLOAD")
    token = auth["access_token"]

    url = (BASE + "/rest/v1/generation_jobs?id=eq." + JOB
           + "&project_id=eq." + PROJECT + "&select=id,status,provider,error,output")
    status, rows = api_json(url, key, token)
    print("JOB_HTTP:", status)
    require(status == 200 and isinstance(rows, list) and len(rows) == 1,
            "JOB_LOOKUP_FAILED")
    job = rows[0]
    require(job.get("status") == "completed" and job.get("provider") == "modal"
            and not job.get("error"), "GENERATION_NOT_VERIFIED_COMPLETE")

    output = job.get("output") or {}
    asset = output.get("motion_clip_asset") or {}
    result = (output.get("arena_status_response") or {}).get("result") or {}
    path = result.get("storage_path")
    require(isinstance(path, str) and path.startswith(PROJECT + "/scene-motion/")
            and path.endswith("/" + JOB + ".mp4") and ".." not in path,
            "STORAGE_PATH_INVALID")
    require(asset.get("id") and asset.get("approved") is False
            and asset.get("generation_job_id") == JOB,
            "GENERATED_ASSET_CONTRACT_MISMATCH")

    meta = result.get("verification") or {}
    expected = meta.get("byte_length")
    print("EXPECTED_BYTES:", expected)
    print("RECORDED_VIDEO_FRAMES:", meta.get("video_samples"))
    print("RECORDED_DURATION_SECONDS:", meta.get("video_duration_seconds"))
    require(isinstance(expected, int) and 16 <= expected <= LIMIT,
            "EXPECTED_SIZE_INVALID")
    print("ASSET_CREATOR_APPROVED:", asset.get("approved"))

    authenticated_url = (BASE + "/storage/v1/object/authenticated/visual-assets/"
                         + quote(path, safe="/"))
    raw = download(authenticated_url, key, token)
    if raw is None:
        signed_endpoint = (BASE + "/storage/v1/object/sign/visual-assets/"
                           + quote(path, safe="/"))
        status, signed = api_json(signed_endpoint, key, token,
                                  body={"expiresIn": 120})
        print("FRESH_SIGN_HTTP:", status)
        if status == 200 and (signed.get("signedURL") or signed.get("signedUrl")):
            path_or_url = signed.get("signedURL") or signed.get("signedUrl")
            signed_url = urljoin(BASE, path_or_url)
        else:
            signed_url = asset.get("video_url")
        require(isinstance(signed_url, str), "NO_AUTHORIZED_DOWNLOAD_URL")
        raw = download(trusted_url(signed_url), key)
    require(raw is not None, "STORAGE_DOWNLOAD_FAILED")
    require(len(raw) == expected, "STORED_MP4_SIZE_MISMATCH")
    require(raw[4:8] == b"ftyp", "MP4_CONTAINER_SIGNATURE_INVALID")

    DEST.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if DEST.exists():
        require(DEST.read_bytes() == raw, "EXISTING_FILE_DIFFERS_DO_NOT_OVERWRITE")
    else:
        with tempfile.NamedTemporaryFile(dir=DEST.parent, suffix=".tmp",
                                          delete=False) as stream:
            temp = Path(stream.name)
            stream.write(raw)
        temp.chmod(0o600)
        temp.replace(DEST)
    print("STORAGE_DOWNLOAD_PASS")
    print("LOCAL_MP4:", DEST)
    print("VERIFIED_BYTES:", len(raw))
    print("SHA256:", hashlib.sha256(raw).hexdigest())
    decode_frames(DEST)


if __name__ == "__main__":
    main()
