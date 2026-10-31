"""Offline package contracts. No SDK connection, deployment or cloud invoke."""
import importlib.util
import os
import pathlib
import sys
import types
import unittest
from datetime import datetime,timezone
from unittest.mock import patch,MagicMock
from httpx import AsyncClient,ASGITransport
from providers.modal_motion.contracts import MotionContractError

PATH=pathlib.Path(__file__).resolve().parents[1]/'staging_modal.py'
ENVIRONMENT='bragoraforge-protocol2-staging'


def load_package(environment=ENVIRONMENT):
    captured={'functions':[],'images':[],'secrets':[],'apps':[]}
    class Image:
        @staticmethod
        def debian_slim(**kwargs):
            image=Image();image.settings=kwargs;captured['images'].append(image);return image
        def pip_install(self,*packages):self.packages=packages;return self
        def add_local_file(self,local,remote,**kwargs):
            self.files=getattr(self,'files',[])+[(local,remote,kwargs)];return self
    class App:
        def __init__(self,name):captured['apps'].append(name)
        def function(self,**kwargs):
            captured['functions'].append(kwargs)
            return lambda fn:fn
    def secret(name,**kwargs):
        captured['secrets'].append((name,kwargs));return object()
    def decorate(key):
        def settings(**kwargs):
            captured[key]=kwargs;return lambda fn:fn
        return settings
    modal=types.ModuleType('modal')
    modal.App,modal.Image=App,Image
    modal.Secret=types.SimpleNamespace(from_name=secret)
    modal.is_local=lambda:True
    modal.concurrent=decorate('concurrent');modal.asgi_app=decorate('asgi')
    config=types.ModuleType('modal.config');config.config=types.SimpleNamespace(get=lambda key:environment)
    spec=importlib.util.spec_from_file_location('offline_modal_package',PATH)
    module=importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules,{'modal':modal,'modal.config':config}):spec.loader.exec_module(module)
    return module,captured


class ModalPackageTests(unittest.IsolatedAsyncioTestCase):
    def env(self,expires=1300):
        return {'MODAL_TASK_ID':'ta-fixtureContainer',
          'BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT':datetime.fromtimestamp(expires,timezone.utc).isoformat()}

    async def test_cpu_only_bounded_definition_and_both_auth_layers(self):
        module,captured=load_package();settings=captured['functions'][0]
        self.assertEqual(len(captured['functions']),1)
        self.assertNotIn('gpu',settings)
        self.assertEqual(settings['cpu'],(0.125,0.125));self.assertEqual(settings['memory'],(256,256))
        for key,value in {'max_containers':2,'min_containers':0,'buffer_containers':0,
            'timeout':60,'startup_timeout':60,'scaledown_window':2,'restrict_modal_access':True,'include_source':False}.items():
            self.assertEqual(settings[key],value)
        # SDK1.6.3 forbids the retries argument for Web Functions, even zero.
        self.assertNotIn('retries',settings)
        self.assertEqual(captured['concurrent'],{'max_inputs':1})
        self.assertEqual(captured['asgi'],{'requires_proxy_auth':True})
        self.assertEqual(captured['images'][0].packages,('fastapi[standard]==0.162.0',))
        files=captured['images'][0].files
        self.assertEqual(len(files),7)
        self.assertTrue(all(values=={'copy':True} for _,_,values in files))
        self.assertEqual({pathlib.Path(remote).name for _,remote,_ in files},
            {'__init__.py','contracts.py','admission.py','protocol.py','staging.py','staging_modal.py'})
        self.assertFalse(any('worker.py' in remote or '/tests/' in remote for _,remote,_ in files))
        name,secret=captured['secrets'][0]
        self.assertEqual(secret['environment_name'],ENVIRONMENT)
        self.assertEqual(name,'bragoraforge-protocol2-staging')
        self.assertIn('BEATVISION_STAGING_SERVICE_ROLE_KEY',secret['required_keys'])
        self.assertIn('BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT',secret['required_keys'])
        self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY',secret['required_keys'])

    async def test_default_or_production_modal_environment_fails_before_definition(self):
        for value in ['',None,'main','production']:
            with self.assertRaisesRegex(MotionContractError,'STAGING_MODAL_ENVIRONMENT_REQUIRED'):
                load_package(value)

    async def test_invalid_expiry_or_container_stops_before_database_setup(self):
        module,_=load_package()
        for values in [{},self.env(999),self.env(1601),
            {**self.env(),'BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT':'2030-01-01'},
            {**self.env(),'MODAL_TASK_ID':'client-forged'}]:
            with patch.dict(os.environ,values,clear=True),patch.object(module.time,'time',return_value=1000),\
                patch.object(module,'from_env') as factory:
                with self.assertRaises(MotionContractError):module.protocol2_probe()
                factory.assert_not_called()

    async def test_expiry_during_warm_container_precedes_database_access(self):
        from providers.modal_motion.tests.test_protocol2_staging import ProbeTests,TOKEN
        probe,store,events=ProbeTests().fixture();module,_=load_package()
        with patch.dict(os.environ,self.env(),clear=True),patch.object(module.time,'time',return_value=1000),\
            patch.object(module,'from_env',return_value=(probe,TOKEN)):
            app=module.protocol2_probe()
        self.assertEqual(probe.worker_id,'modal-ta-fixtureContainer')
        probe.inspect=MagicMock(side_effect=AssertionError('No database access after deadline'))
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://fixture') as http:
            with patch.object(module.time,'time',return_value=1300):
                response=await http.get('/verify/fixture',headers={'Authorization':'Bearer '+TOKEN})
                self.assertEqual(response.status_code,410)
                anonymous=await http.get('/verify/fixture');self.assertEqual(anonymous.status_code,401)
        probe.inspect.assert_not_called();self.assertEqual(store.store,{});self.assertEqual(events,[])

    async def test_healthy_wrapper_serves_existing_probe_with_trusted_task_identity(self):
        from providers.modal_motion.tests.test_protocol2_staging import ProbeTests,TOKEN
        from providers.modal_motion.tests.test_submit_concurrency import body
        from providers.modal_motion.staging import CPU_ACK
        probe,store,events=ProbeTests().fixture();module,_=load_package()
        with patch.dict(os.environ,self.env(),clear=True),patch.object(module.time,'time',return_value=1000),\
            patch.object(module,'from_env',return_value=(probe,TOKEN)):
            app=module.protocol2_probe()
            async with AsyncClient(transport=ASGITransport(app=app),base_url='http://fixture',headers={'Authorization':'Bearer '+TOKEN}) as http:
                data=body();data['ack']=CPU_ACK
                response=await http.post('/submit',json=data)
        self.assertEqual(response.status_code,200);self.assertTrue(response.json()['synthetic'])
        self.assertEqual(response.json()['worker_id'],'modal-ta-fixtureContainer')
        self.assertEqual([e['phase'] for e in events],['spawn_attempt','model_start','completed'])
