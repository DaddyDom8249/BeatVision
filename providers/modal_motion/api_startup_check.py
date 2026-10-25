"""Start the real ASGI bridge without submitting a GPU job or using credentials."""

import json
import sys


def main():
    from providers.modal_motion.worker import motion_api
    from fastapi.testclient import TestClient

    # Only malformed requests: no source image, acknowledgment, FunctionCall,
    # inference, database access or creative asset can be produced by this check.
    with TestClient(motion_api.local()) as client:
        submitted = client.post('/submit', json={})
        assert submitted.status_code == 400, submitted.status_code
        assert submitted.json() == {'error': 'HTTP_BODY_INVALID'}, submitted.json()
        polled = client.get('/poll/invalid')
        assert polled.status_code == 400, polled.status_code
        assert polled.json() == {'error': 'MODAL_JOB_ID_INVALID'}, polled.json()
    assert not any(name in sys.modules for name in ('PIL', 'torch', 'diffusers'))
    print(json.dumps({'api_startup': 'PASS', 'submit_validation': 400,
                      'poll_validation': 400, 'gpu_inference_requested': False}))


if __name__ == '__main__':
    main()
