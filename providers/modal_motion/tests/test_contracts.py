"""Zero-network / zero-GPU regression tests for the isolated proof worker."""
import ast
import hashlib
import pathlib
import unittest
import uuid

from providers.modal_motion.contracts import (
    ACKNOWLEDGEMENT, MAX_IMAGE_BYTES, MotionContractError,
    MotionRequest, manifest, require_execution_authorization, validate_request,
)

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
ROOT = pathlib.Path(__file__).resolve().parents[1]


def valid_request(**overrides):
    fields = dict(
        project_id=str(uuid.UUID(int=1)), scene_id=str(uuid.UUID(int=2)),
        source_image_id=str(uuid.UUID(int=3)), generation_job_id=str(uuid.UUID(int=4)),
        image_sha256=hashlib.sha256(PNG).hexdigest(),
        prompt='A character walks naturally across the scene.', seed=42,
    )
    fields.update(overrides)
    return MotionRequest(**fields)


class ContractTests(unittest.TestCase):
    def test_valid_image_and_ids(self):
        self.assertEqual(validate_request(valid_request(), PNG), valid_request())

    def test_unapproved_or_changed_source_hash_rejected(self):
        with self.assertRaisesRegex(MotionContractError, 'IMAGE_HASH_MISMATCH'):
            validate_request(valid_request(), PNG + b'changed')

    def test_non_media_rejected(self):
        with self.assertRaisesRegex(MotionContractError, 'IMAGE_TYPE_INVALID'):
            validate_request(valid_request(), b'not image bytes' + b' ' * 20)

    def test_large_source_rejected(self):
        with self.assertRaisesRegex(MotionContractError, 'IMAGE_BYTES_INVALID'):
            validate_request(valid_request(), PNG + b'x' * MAX_IMAGE_BYTES)

    def test_uuid_and_prompt_rejected(self):
        for override, expected in [({'project_id':'wrong'}, 'PROJECT_ID_INVALID'),
                                   ({'prompt':'short'}, 'PROMPT_INVALID'),
                                   ({'seed':True}, 'SEED_INVALID'),
                                   ({'seed':2_147_483_647}, 'SEED_INVALID')]:
            with self.subTest(override=override), self.assertRaisesRegex(MotionContractError, expected):
                validate_request(valid_request(**override), PNG)

    def test_gpu_access_fail_closed(self):
        for ack, enabled in [('', 'true'), (ACKNOWLEDGEMENT, ''), (ACKNOWLEDGEMENT, 'false')]:
            with self.assertRaisesRegex(MotionContractError, 'GPU_PROOF_NOT_AUTHORIZED'):
                require_execution_authorization(ack, enabled)
        require_execution_authorization(ACKNOWLEDGEMENT, 'true')

    def test_output_unapproved(self):
        blob = b'\x00\x00\x00\x18ftypisom' + b'moov' + b'mdat' + b'0' * 1030
        r = manifest(valid_request(), blob, model='ltx', revision='test')
        self.assertFalse(r['creator_approved'])
        self.assertFalse(r['subject_motion_verified'])
        self.assertEqual(r['source_sha256'], valid_request().image_sha256)

    def test_output_missing_container_rejected(self):
        with self.assertRaisesRegex(MotionContractError, 'VIDEO_CONTAINER_INVALID'):
            manifest(valid_request(), b'0'*2048, model='ltx', revision='test')

    def test_proxy_authenticated_web_bridge_and_no_automatic_retry(self):
        tree = ast.parse((ROOT/'worker.py').read_text())
        decorators = [d for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)
                      for d in n.decorator_list if isinstance(d, ast.Call)]
        asgi = [d for d in decorators
                if isinstance(d.func, ast.Attribute) and d.func.attr == 'asgi_app']
        self.assertEqual(len(asgi), 1)
        asgi_keywords = {kw.arg: kw.value.value for kw in asgi[0].keywords
                         if isinstance(kw.value, ast.Constant)}
        self.assertIs(asgi_keywords['requires_proxy_auth'], True)
        functions = [d for d in decorators
                     if isinstance(d.func, ast.Attribute) and d.func.attr == 'function']
        gpu = next(d for d in functions if any(
            kw.arg == 'name' and isinstance(kw.value, ast.Constant)
            and kw.value.value == 'single_motion_proof' for kw in d.keywords))
        keywords = {kw.arg: kw.value.value for kw in gpu.keywords
                    if isinstance(kw.value, ast.Constant)}
        self.assertEqual(keywords['max_containers'], 1)
        self.assertEqual(keywords['min_containers'], 0)
        self.assertEqual(keywords['retries'], 0)
        source = (ROOT/'worker.py').read_text()
        self.assertIn("@web.post('/submit')", source)
        self.assertIn("@web.get('/poll/{call_id}')", source)
        self.assertIn('single_motion_proof.spawn(payload, source, ack)', source)
        self.assertIn('call.get(timeout=0)', source)


    def test_asgi_submit_request_annotation_resolves_globally(self):
        # FastAPI evaluates postponed annotations using the function module
        # globals. A nested-only 'import fastapi' caused HTTP 422 for every
        # /submit request: missing query parameter 'request'.
        tree = ast.parse((ROOT/'worker.py').read_text())
        asgi = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                    and node.name == 'motion_api')
        self.assertTrue(any(
            isinstance(node, ast.Global) and 'fastapi' in node.names
            for node in asgi.body
        ), 'The lazy FastAPI import must be visible in module globals.')
        submit = next(node for node in asgi.body
                      if isinstance(node, ast.AsyncFunctionDef) and node.name == 'submit')
        self.assertEqual(
            ast.unparse(submit.args.args[0].annotation),
            'fastapi.Request',
        )

    def test_pinned_diffusers_i2v_snapshot_has_expected_reference(self):
        # Regression: previous source pinned an older LTX-Video tree with no
        # model_index.json, so from_pretrained would fail before inference.
        source = (ROOT/'worker.py').read_text()
        self.assertIn("MODEL = 'Lightricks/LTX-Video-0.9.5'", source)
        self.assertIn("MODEL_REVISION = 'e58e28c39631af4d1468ee57a853764e11c1d37e'", source)
        self.assertIn('LTXImageToVideoPipeline.from_pretrained(', source)

    def test_no_automatic_remote_call_in_worker_module(self):
        tree=ast.parse((ROOT/'worker.py').read_text())
        top_level_calls=[n for n in tree.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)]
        self.assertEqual(top_level_calls, [])


if __name__ == '__main__':
    unittest.main()


class LocalEntryPointTests(unittest.TestCase):
    def test_dry_run_never_submits_and_execution_requires_env(self):
        import contextlib
        import importlib.util
        import io
        import os
        import sys
        import tempfile
        from unittest.mock import patch
        from types import SimpleNamespace

        calls = []

        class FakeImage:
            @staticmethod
            def debian_slim(**kwargs): return FakeImage()
            def pip_install(self, *args): return self
            def add_local_python_source(self, *args): return self

        class FakeApp:
            def __init__(self, *_): pass
            def function(self, **kwargs):
                def decorate(fn):
                    fn.remote = lambda *args: calls.append(args)
                    return fn
                return decorate
            def local_entrypoint(self): return lambda fn: fn

        fake_modal = SimpleNamespace(
            App=FakeApp, Image=FakeImage,
            asgi_app=lambda **kwargs: (lambda fn: fn),
        )
        spec = importlib.util.spec_from_file_location('modal_motion_test_worker', ROOT/'worker.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'modal': fake_modal}):
            spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory)/'source.png'
            source.write_bytes(PNG)
            kwargs = dict(image_path=str(source), project_id=str(uuid.UUID(int=1)),
                          scene_id=str(uuid.UUID(int=2)), source_image_id=str(uuid.UUID(int=3)),
                          generation_job_id=str(uuid.UUID(int=4)),
                          prompt='Character moves naturally through scene.')
            with contextlib.redirect_stdout(io.StringIO()) as output:
                module.main(**kwargs)
            self.assertIn('DRY_RUN_VALID', output.getvalue())
            self.assertEqual(calls, [])
            with patch.dict(os.environ, {'BRAGORA_MODAL_GPU_ENABLED':'false'}):
                with self.assertRaisesRegex(MotionContractError, 'GPU_PROOF_NOT_AUTHORIZED'):
                    module.main(**kwargs, execute=True, acknowledgment=ACKNOWLEDGEMENT)
            self.assertEqual(calls, [])
