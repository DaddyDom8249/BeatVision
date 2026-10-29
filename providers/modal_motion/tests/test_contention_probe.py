"""Local regression for the operator probe; no network or Modal calls."""
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import MagicMock, patch

PROBE_PATH = pathlib.Path(__file__).resolve().parents[3] / 'scripts/test/verify_multiprocess_contention.py'
spec = importlib.util.spec_from_file_location('contention_probe', PROBE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ContentionProbeTests(unittest.TestCase):
    def run_probe(self, results, spawn_events=1):
        pool = MagicMock()
        pool.__enter__.return_value.map.return_value = results
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(
            {'reserved': True, 'fake_spawn_events': spawn_events}).encode()
        with patch.dict(probe.os.environ, {'MODAL_TOKEN_ID': 'fixture', 'MODAL_TOKEN_SECRET': 'fixture'}), \
                patch.object(probe.concurrent.futures, 'ProcessPoolExecutor', return_value=pool), \
                patch.object(probe.urllib.request, 'urlopen', return_value=response), \
                contextlib.redirect_stdout(io.StringIO()):
            probe.verify('https://fixture-staging.modal.run')

    def results(self):
        return [(200, {'job_id': 'fc-staging-same', 'container_id': f'ta-{i % 2}'}) for i in range(20)]

    def test_replayed_receipt_is_valid_without_additional_spawn(self):
        self.run_probe(self.results())

    def test_pending_reservations_and_one_receipt_are_valid(self):
        results = self.results()
        results[1:] = [(202, {'status': 'reconciliation_required', 'container_id': 'ta-other'})] * 19
        self.run_probe(results)

    def test_distinct_receipts_are_rejected(self):
        results = self.results()
        results[1][1]['job_id'] = 'fc-staging-other'
        with self.assertRaises(AssertionError):
            self.run_probe(results)

    def test_duplicate_spawn_events_are_rejected(self):
        with self.assertRaises(AssertionError):
            self.run_probe(self.results(), spawn_events=2)

    def test_missing_receipts_are_rejected(self):
        results = self.results()
        for _, body in results:
            body.pop('job_id')
        with self.assertRaises(AssertionError):
            self.run_probe(results)

    def test_single_container_is_insufficient(self):
        results = self.results()
        for _, body in results:
            body['container_id'] = 'ta-same'
        with self.assertRaises(AssertionError):
            self.run_probe(results)
