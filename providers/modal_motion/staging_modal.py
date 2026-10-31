"""Separate CPU-only Modal package. Import is local; deployment costs require approval.

No run/deploy/spawn is performed here. Only selected CPU source files are shipped.
Resource limits and the application deadline do not constitute an account bill cap.
"""
import hmac
import os
import re
import time
from datetime import datetime
from pathlib import Path

import modal
from modal.config import config
from providers.modal_motion.contracts import MotionContractError
from providers.modal_motion.staging import from_env,create_app

STAGING_ENVIRONMENT='bragoraforge-protocol2-staging'
REQUIRED_KEYS=[
    'BEATVISION_PROTOCOL2_STAGING','BEATVISION_STAGING_SUPABASE_URL',
    'BEATVISION_STAGING_EXPECTED_ORIGIN','BEATVISION_PRODUCTION_SUPABASE_URL',
    'BEATVISION_STAGING_SERVICE_ROLE_KEY','BEATVISION_STAGING_RUN_ID',
    'BEATVISION_STAGING_PROBE_TOKEN','BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT',
]
# Modal CLI resolves --env into config before importing this module (SDK1.6.3).
# Reject a default/production local deployment definition, without any RPC.
if modal.is_local() and config.get('environment')!=STAGING_ENVIRONMENT:
    raise MotionContractError('STAGING_MODAL_ENVIRONMENT_REQUIRED')

app=modal.App('bragoraforge-protocol2-cpu-probe')
secret=modal.Secret.from_name('bragoraforge-protocol2-staging',
    environment_name=STAGING_ENVIRONMENT,required_keys=REQUIRED_KEYS)
image=modal.Image.debian_slim(python_version='3.11').pip_install('fastapi[standard]==0.162.0')
root=Path(__file__).resolve().parent
image=image.add_local_file(str(root.parent/'__init__.py'),'/root/providers/__init__.py',copy=True)
for filename in ['__init__.py','contracts.py','admission.py','protocol.py','staging.py','staging_modal.py']:
    image=image.add_local_file(str(root/filename),'/root/providers/modal_motion/'+filename,copy=True)


@app.function(image=image,secrets=[secret],name='protocol2_probe',
    cpu=(0.125,0.125),memory=(256,256),max_containers=2,min_containers=0,
    buffer_containers=0,scaledown_window=2,timeout=60,startup_timeout=60,
    restrict_modal_access=True,include_source=False)
@modal.concurrent(max_inputs=1)
@modal.asgi_app(requires_proxy_auth=True)
def protocol2_probe():
    """Existing synthetic probe, trusted task identity, maximum10-minute window."""
    try:
        expires=datetime.fromisoformat(os.environ.get('BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT',''))
        if expires.tzinfo is None:raise ValueError()
        deadline=expires.timestamp();now=time.time()
        if not now<deadline<=now+600:raise ValueError()
    except (ValueError,TypeError,OverflowError):
        raise MotionContractError('STAGING_CAMPAIGN_WINDOW_INVALID') from None
    task_id=os.environ.get('MODAL_TASK_ID','')
    if not re.fullmatch(r'ta-[A-Za-z0-9_-]{1,90}',task_id):
        raise MotionContractError('STAGING_MODAL_TASK_ID_REQUIRED')
    probe,token=from_env()
    probe.worker_id='modal-'+task_id
    web=create_app(probe,token)

    @web.middleware('http')
    async def campaign_window(request,call_next):
        from fastapi.responses import JSONResponse
        # Keep bearer authentication ahead of expiry and every database access.
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            return JSONResponse({'error':'STAGING_UNAUTHORIZED'},status_code=401)
        if time.time()>=deadline:
            return JSONResponse({'error':'STAGING_CAMPAIGN_EXPIRED'},status_code=410)
        return await call_next(request)

    return web
