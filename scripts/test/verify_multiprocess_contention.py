"""LEGACY DICT-ONLY contention probe; does not verify PostgreSQL protocol2.

Operator-only CPU staging probe. NEVER run against production.

Usage:
  MODAL_TOKEN_ID=... MODAL_TOKEN_SECRET=... python scripts/test/verify_multiprocess_contention.py https://staging-host.modal.run

Requires approved staging deployment. Does not invoke production GPU.
"""
import concurrent.futures
import json
import os
import sys
import urllib.request
import urllib.parse
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def request_one(args):
    url, body, headers = args
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with OPENER.open(req, timeout=45) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try: return exc.code, json.loads(exc.read())
        except Exception: return exc.code, {}
    except Exception as exc:
        return 0, {"error": repr(exc)}


def verify(base):
    expected = os.environ.get("MODAL_STAGING_ORIGIN", "").rstrip("/")
    parsed = urllib.parse.urlsplit(base.rstrip("/"))
    if not expected or parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or base.rstrip("/") != expected:
        raise SystemExit("Refusing URL other than exact configured MODAL_STAGING_ORIGIN")
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
    # Duplicate submissions may return the already-persisted receipt with 200.
    # Execution uniqueness is proved by the event count below, not HTTP counts.
    if (len(receipt_ids) != 1 or
            any(not isinstance(receipt, str) or not receipt.startswith("fc-staging-")
                for receipt in receipt_ids)):
        raise AssertionError(f"Expected one shared staging receipt; statuses={statuses}, receipts={receipt_ids}")
    container_ids = [body.get("container_id") for status, body in results if status in (200,202,409)]
    if not container_ids or any(not isinstance(cid,str) or not cid.startswith("ta-") for cid in container_ids):
        raise AssertionError("Missing or invalid Modal container identity in staging responses")
    unique_containers = set(container_ids)
    if len(unique_containers) < 2:
        raise AssertionError("Only one Modal container handled the burst; cross-container isolation unverified")
    verify_req = urllib.request.Request(
        base.rstrip("/") + "/verify/" + job_id,
        headers={"Modal-Key": token_id, "Modal-Secret": token_secret},
    )
    with OPENER.open(verify_req, timeout=30) as response:
        summary = json.loads(response.read())
    assert summary["reserved"] is True, summary
    assert summary["fake_spawn_events"] == 1, summary
    print(json.dumps({"status": "PASS", "protocol":"legacy_dict", "protocol2_verified":False, "requests": len(results),
                      "fake_spawn_events": summary["fake_spawn_events"],
                      "receipt_count": len(receipt_ids), "unique_containers": len(unique_containers), "http_statuses": statuses}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/test/verify_multiprocess_contention.py STAGING_BASE_URL")
    verify(sys.argv[1])
