"""Operator-only CPU staging contention probe. NEVER run against production.

Usage:
  MODAL_TOKEN_ID=... MODAL_TOKEN_SECRET=... python scripts/test/verify_multiprocess_contention.py https://staging-host.modal.run

Requires approved staging deployment. Does not invoke production GPU.
"""
import concurrent.futures
import json
import os
import sys
import urllib.request
import uuid


def request_one(args):
    url, body, headers = args
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try: return exc.code, json.loads(exc.read())
        except Exception: return exc.code, {}
    except Exception as exc:
        return 0, {"error": repr(exc)}


def verify(base):
    if not base.startswith("https://") or "staging" not in base:
        raise SystemExit("Refusing non-HTTPS or non-staging target")
    token_id = os.environ.get("MODAL_TOKEN_ID")
    token_secret = os.environ.get("MODAL_TOKEN_SECRET")
    if not token_id or not token_secret:
        raise SystemExit("Missing Modal proxy credentials")
    job_id = str(uuid.uuid4())
    payload = {"payload": {"generation_job_id": job_id, "test_nonce": str(uuid.uuid4())}}
    headers = {"Content-Type": "application/json", "Modal-Key": token_id, "Modal-Secret": token_secret}
    args = (base.rstrip("/") + "/submit", json.dumps(payload).encode(), headers)
    with concurrent.futures.ProcessPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(request_one, [args] * 20))
    statuses = [status for status, _ in results]
    receipt_ids = {body.get("job_id") for status, body in results if status == 200}
    if not all(status in (200, 202) for status in statuses):
        raise AssertionError(f"Unacceptable statuses: {statuses}")
    if len(receipt_ids) != 1:
        raise AssertionError(f"Expected one receipt, found {receipt_ids}")
    verify_req = urllib.request.Request(
        base.rstrip("/") + "/verify/" + job_id,
        headers={"Modal-Key": token_id, "Modal-Secret": token_secret},
    )
    with urllib.request.urlopen(verify_req, timeout=30) as response:
        summary = json.loads(response.read())
    assert summary["reserved"] is True, summary
    assert summary["fake_spawn_events"] == 1, summary
    print(json.dumps({"status": "PASS", "requests": len(results),
                      "fake_spawn_events": summary["fake_spawn_events"],
                      "receipt_count": len(receipt_ids), "http_statuses": statuses}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/test/verify_multiprocess_contention.py STAGING_BASE_URL")
    verify(sys.argv[1])
