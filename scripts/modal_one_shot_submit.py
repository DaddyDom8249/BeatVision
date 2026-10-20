"""Owner-triggered, one-use Modal submission for the approved Ghast image.

Requires --submit-once. Creates a durable local receipt before enqueue.
Never automatically retries, resubmits, or switches to another provider.
Do not remove the receipt to repeat a GPU request without fresh approval.
"""

from __future__ import annotations

import getpass
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


PROJECT_ID = "8faa2cd4-361f-4764-bf1e-7800b87d6292"
SCENE_ID = "b352251c-3901-4e2c-981a-8de35430d042"
SOURCE_IMAGE_ID = "99da9456-4ef4-43ea-afa3-20afc10aca58"
BASE = "https://mdofsinyofqbeapzfygu.supabase.co"
RECEIPT = Path.home() / ".local/state/bragora-modal/ghast-modal-third-attempt.json"
WORKER = Path("providers/modal_motion/worker.py")
CLIENT = Path("src/lib/supabase/client.ts")


def require(condition: bool, label: str) -> None:
    if not condition:
        raise SystemExit(label)


def request(method: str, url: str, key: str, body=None, token=None, timeout=90):
    headers = {"apikey": key}
    payload = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(url, payload, headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as error:
        raw = error.read()
        try:
            parsed = json.loads(raw) if raw else {}
        except (ValueError, UnicodeDecodeError):
            parsed = {}
        return error.code, parsed


def record(data: dict, exclusive=False) -> None:
    RECEIPT.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    fd = os.open(RECEIPT, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(data, output, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def main() -> None:
    require(sys.argv[1:] == ["--submit-once"], "USAGE: python3 scripts/modal_one_shot_submit.py --submit-once")
    require(not RECEIPT.exists(), "EXISTING_ATTEMPT_RECEIPT: DO_NOT_RESUBMIT")

    profile = subprocess.check_output(
        ["/root/modal-env/bin/modal", "profile", "current"], text=True
    ).strip()
    require(profile == "beatvision", "WORKSPACE_MISMATCH_NO_GPU_CALL")

    worker_source = WORKER.read_text(encoding="utf-8")
    require("generator = torch.Generator(device='cuda')" in worker_source,
            "CUDA_REPAIR_MISSING_NO_GPU_CALL")

    client_source = CLIENT.read_text(encoding="utf-8")
    match = re.search(r'DEFAULT_SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"', client_source)
    require(match is not None and len(match.group(1)) > 20,
            "PUBLIC_KEY_LOOKUP_FAILED_NO_GPU_CALL")
    key = match.group(1)

    email = getpass.getpass("Login email (hidden): ")
    password = getpass.getpass("Password (hidden): ")
    status, auth = request("POST", BASE + "/auth/v1/token?grant_type=password",
                           key, {"email": email, "password": password}, timeout=30)
    password = None
    print("AUTH_HTTP:", status, flush=True)
    require(status == 200 and isinstance(auth.get("access_token"), str),
            "AUTH_FAILED_NO_GPU_CALL")
    token = auth["access_token"]

    endpoint = BASE + "/functions/v1/beatvision-generation"
    status, capability = request("POST", endpoint, key, {
        "action": "modal_capability", "projectId": PROJECT_ID
    }, token=token, timeout=30)
    print("CAPABILITY_HTTP:", status, flush=True)
    require(status == 200 and capability.get("modal_supported") is True
            and capability.get("modal_available") is True,
            "MODAL_UNAVAILABLE_NO_GPU_CALL")

    active_url = (BASE + "/rest/v1/generation_jobs?project_id=eq." + PROJECT_ID
                  + "&job_type=eq.scene_motion&status=in.(queued,submitted,processing)"
                  + "&select=id,status&limit=10")
    status, active = request("GET", active_url, key, token=token, timeout=30)
    print("ACTIVE_JOBS_HTTP:", status, flush=True)
    require(status == 200 and isinstance(active, list),
            "ACTIVE_JOB_QUERY_FAILED_NO_GPU_CALL")
    require(not active, "ACTIVE_MOTION_JOB_EXISTS_NO_GPU_CALL")

    request_id = str(uuid.uuid4())
    receipt = {
        "project_id": PROJECT_ID,
        "scene_id": SCENE_ID,
        "source_image_id": SOURCE_IMAGE_ID,
        "request_id": request_id,
        "job_id": None,
        "stage": "enqueue_attempted",
    }
    record(receipt, exclusive=True)
    print("ATTEMPT_MARKER_CREATED:", str(RECEIPT), flush=True)
    print("DO_NOT_RERUN_THIS_SCRIPT", flush=True)

    status, queued = request("POST", endpoint, key, {
        "action": "enqueue_ai_motion",
        "projectId": PROJECT_ID,
        "sceneId": SCENE_ID,
        "sourceImageId": SOURCE_IMAGE_ID,
        "requestId": request_id,
        "acceptedTerms": True,
        "provider": "modal",
    }, token=token)
    print("ENQUEUE_HTTP:", status, flush=True)
    require(status == 200 and isinstance(queued, dict),
            "ENQUEUE_UNCERTAIN_DO_NOT_RESUBMIT")

    job = queued.get("job") or {}
    receipt["job_id"] = job.get("id")
    receipt["stage"] = "enqueued"
    record(receipt)
    print("JOB_ID:", receipt["job_id"], flush=True)
    print("JOB_STATUS:", job.get("status"), flush=True)
    require(isinstance(job.get("id"), str)
            and (job.get("input_snapshot") or {}).get("modal_motion")
            and job.get("provider") != "huggingface-zerogpu",
            "INVALID_MODAL_JOB_DO_NOT_RESUBMIT")
    require(job.get("status") == "queued",
            "JOB_ALREADY_ACTIVE_OR_UNEXPECTED_DO_NOT_RESUBMIT")

    receipt["stage"] = "run_attempted"
    record(receipt)
    status, run = request("POST", endpoint, key, {
        "action": "run", "projectId": PROJECT_ID, "jobId": job["id"]
    }, token=token)
    print("RUN_HTTP:", status, flush=True)
    print("RUN_JOB_STATUS:", (run.get("job") or {}).get("status")
          if isinstance(run, dict) else None, flush=True)
    print("RUN_JOB_PROVIDER:", (run.get("job") or {}).get("provider")
          if isinstance(run, dict) else None, flush=True)
    print("TRACK_THIS_JOB_ID:", job["id"], flush=True)
    receipt["stage"] = "run_response_received" if status == 200 else "run_uncertain"
    record(receipt)
    require(status == 200, "RUN_UNCERTAIN_DO_NOT_RESUBMIT")
    print("SUBMISSION_FINISHED_NO_RETRIES", flush=True)


if __name__ == "__main__":
    main()
