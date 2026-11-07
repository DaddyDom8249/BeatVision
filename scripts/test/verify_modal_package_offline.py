"""Validate the real pinned SDK's CPU package definition with sockets denied.

Never invoke Modal CLI, App.run/deploy, a Function, image build or provider RPC.
Install the pinned SDK separately; this script is not a staging campaign.
"""
import importlib.metadata
import os
import pathlib
import socket
import sys

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]))
attempts=[]


def forbidden(*args,**kwargs):
    attempts.append(True)
    raise AssertionError('Offline package validation forbids every socket connection')


def main():
    assert importlib.metadata.version('modal')=='1.6.3','Pinned Modal1.6.3 required'
    socket.socket.connect=forbidden
    socket.socket.connect_ex=forbidden
    socket.create_connection=forbidden
    # This is local SDK configuration, never authorization to deploy/spend.
    os.environ['MODAL_ENVIRONMENT']='bragoraforge-protocol2-staging'
    from providers.modal_motion import staging_modal
    from modal import Function
    from modal._resources import convert_fn_config_to_resources_config
    assert isinstance(staging_modal.protocol2_probe,Function)
    resources=convert_fn_config_to_resources_config(cpu=(0.125,0.125),memory=(256,256),gpu=None)
    assert (resources.milli_cpu,resources.milli_cpu_max,resources.memory_mb,resources.memory_mb_max)==(125,125,256,256)
    assert not any(name in sys.modules for name in ['torch','diffusers','providers.modal_motion.worker'])
    assert not attempts,'Package attempted network access'
    print('PASS: real Modal1.6.3 CPU package definition/resource limits;0 socket attempts;0 cloud invocations')


if __name__=='__main__':main()
