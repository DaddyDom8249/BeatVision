"""Offline regressions: never import an active GPU client or invoke Modal."""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("ltx_motion_worker", ROOT / "modal_workers/ltx_motion_worker.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
I = str(uuid.uuid4())
P = str(uuid.uuid4())
S = str(uuid.uuid4())
J = str(uuid.uuid4())

def png():
    b = io.BytesIO(); Image.new("RGB", (128, 128), "red").save(b, format="PNG"); return b.getvalue()

class MotionTests(unittest.TestCase):
    def call(self, **changes):
        args = dict(project_id=P, scene_id=S, source_image_id=I, job_id=J,
                    prompt="The character turns their head naturally in falling rain", image_bytes=png())
        args.update(changes)
        return m.preflight(**args)

    def test_only_preflight_no_fake_generated_media(self):
        result = self.call()
        self.assertEqual(result['status'], 'preflight_only')
        self.assertIs(result['gpu_executed'], False)
        self.assertIs(result['media_generated'], False)
        self.assertNotIn('video_base64', result)
        self.assertEqual(result['model'], 'Lightricks/LTX-Video-0.9.5')

    def test_hash_stability_and_variation(self):
        a = self.call()
        self.assertEqual(a['request_sha256'], self.call()['request_sha256'])
        self.assertNotEqual(a['request_sha256'], self.call(prompt='A second different direction')['request_sha256'])
        self.assertNotEqual(a['request_sha256'], self.call(job_id=str(uuid.uuid4()))['request_sha256'])

    def test_reject_invalid_ids_and_prompts(self):
        for field in ('project_id', 'scene_id', 'source_image_id', 'job_id'):
            with self.subTest(field=field), self.assertRaises(m.ContractError): self.call(**{field: 'bad'})
        for p in ('x', ' ' * 40, 'a' * 1501):
            with self.assertRaises(m.ContractError): self.call(prompt=p)

    def test_reject_invalid_image_bytes(self):
        for data in (b'bad', b'\x89PNG\r\n\x1a\n' + b'x'*600, b'A'* (m.MAX_IMAGE_BYTES + 1)):
            with self.assertRaises(m.ContractError): self.call(image_bytes=data)

    def test_refuse_live_gpu_without_two_independent_flags(self):
        for flags in ({}, {'BRAGORA_MODAL_GPU_ENABLED':'YES'}, {'BRAGORA_MODAL_BILLING_CONFIRMED':'YES'}):
            with patch.dict(os.environ, flags, clear=True):
                self.assertFalse(m.approval_present())
                with self.assertRaisesRegex(m.ContractError, 'GPU_EXECUTION_NOT_AUTHORIZED'):
                    m.render_ltx(P, S, I, J, 'Character walks through rain', png())
        with patch.dict(os.environ, {'BRAGORA_MODAL_GPU_ENABLED':'YES','BRAGORA_MODAL_BILLING_CONFIRMED':'YES'}, clear=True):
            self.assertTrue(m.approval_present())

    def test_no_url_fetch_or_public_web_endpoint(self):
        text = (ROOT / 'modal_workers/ltx_motion_worker.py').read_text()
        self.assertNotIn('web_endpoint', text)
        self.assertNotIn('requests.get', text)
        self.assertNotIn('urllib.request', text)
        self.assertIn('pipeline(image=source,', text)

    def test_cli_offline_real_png(self):
        with tempfile.TemporaryDirectory() as d:
            inp = Path(d) / 'source.png';inp.write_bytes(png())
            proc = subprocess.run([sys.executable, str(ROOT/'modal_workers/ltx_motion_worker.py'),
                                   '--project-id',P,'--scene-id',S,'--source-image-id',I,
                                   '--job-id',J,'--image-path',str(inp),'--prompt','A person turns head'],
                                  capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(proc.stdout)['status'],'preflight_only')

if __name__ == '__main__': unittest.main(verbosity=2)
