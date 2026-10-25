"""Explicit CPU-only Modal runtime startup check; never deployed or auto-run."""

import modal

from providers.modal_motion.worker import web_image

app = modal.App('bragoraforge-modal-api-startup-check')


@app.function(image=web_image, timeout=60, retries=0,
              min_containers=0, max_containers=1)
def check_startup():
    from providers.modal_motion.api_startup_check import main
    main()
    return 'MODAL_CPU_RUNTIME_STARTUP_PASS_NO_GPU'


@app.local_entrypoint()
def main():
    result = check_startup.remote()
    if result != 'MODAL_CPU_RUNTIME_STARTUP_PASS_NO_GPU':
        raise RuntimeError('API_STARTUP_CHECK_FAILED')
    print(result)
