"""CPU-only Modal contention staging app. Never import production GPU worker.

Deployment is an explicit, separate operator action and can incur CPU costs.
Requires a dedicated Modal environment; does not use production Dict names.
"""
import hashlib
import json
import re
import uuid

import modal

app = modal.App("bragoraforge-atomic-reservation-staging")
web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi>=0.115,<1")
RESERVATIONS = "bragoraforge-staging-reservations-v1"
SPAWN_EVENTS = "bragoraforge-staging-fake-spawns-v1"
UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


@app.function(image=web_image, max_containers=20, timeout=60, min_containers=0)
@modal.asgi_app(requires_proxy_auth=True)
def staging_api():
    import fastapi
    from fastapi.responses import JSONResponse

    reservations = modal.Dict.from_name(RESERVATIONS, create_if_missing=True)
    events = modal.Dict.from_name(SPAWN_EVENTS, create_if_missing=True)
    web = fastapi.FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @web.post("/submit")
    async def submit(request: fastapi.Request):
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("payload"), dict):
            return JSONResponse({"error": "INVALID_BODY"}, status_code=400)
        payload = body["payload"]
        job_id = payload.get("generation_job_id")
        if not isinstance(job_id, str) or not UUID_RE.fullmatch(job_id):
            return JSONResponse({"error": "INVALID_JOB_ID"}, status_code=400)
        try:
            job_id = str(uuid.UUID(job_id))
        except ValueError:
            return JSONResponse({"error": "INVALID_JOB_ID"}, status_code=400)
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        reservation = {"fingerprint": fingerprint, "state": "receipt_unknown"}
        # Provider-side atomic reservation is the sole authority to execute.
        acquired = reservations.put(job_id, reservation, skip_if_exists=True)
        if not acquired:
            existing = reservations.get(job_id)
            if not isinstance(existing, dict) or existing.get("fingerprint") != fingerprint:
                return JSONResponse({"error": "FINGERPRINT_CONFLICT"}, status_code=409)
            if existing.get("job_id"):
                return {"status": "processing", "job_id": existing["job_id"]}
            return JSONResponse({"status": "reconciliation_required"}, status_code=202)

        # No Modal GPU worker is imported or invoked here.
        # Unique event keys avoid lossy read-modify-write counters.
        event_id = str(uuid.uuid4())
        events.put(job_id + ":" + event_id, {"job_id": job_id}, skip_if_exists=True)
        receipt = "fc-staging-" + uuid.uuid4().hex
        reservations.put(job_id, {"fingerprint": fingerprint, "state": "accepted", "job_id": receipt})
        return {"status": "processing", "job_id": receipt}

    @web.get("/verify/{job_id}")
    async def verify(job_id: str):
        if not UUID_RE.fullmatch(job_id):
            return JSONResponse({"error": "INVALID_JOB_ID"}, status_code=400)
        try: job_id = str(uuid.UUID(job_id))
        except ValueError: return JSONResponse({"error": "INVALID_JOB_ID"}, status_code=400)
        count = sum(1 for k in events.keys() if isinstance(k, str) and k.startswith(job_id + ":"))
        return {"job_id": job_id, "fake_spawn_events": count, "reserved": reservations.contains(job_id)}

    return web
