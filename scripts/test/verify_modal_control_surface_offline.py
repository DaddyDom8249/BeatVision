"""Inspect the pinned SDK locally; never instantiate a client or invoke control.

Exit0 means the documented limitations were reproduced, NOT remote readiness.
"""
import ast
import hashlib
import importlib.metadata
import json
import pathlib
import socket


def main():
    attempts=[]
    def forbidden(*args,**kwargs):
        attempts.append(True)
        raise AssertionError('Offline SDK inspection forbids socket connections')
    socket.socket.connect=forbidden;socket.socket.connect_ex=forbidden;socket.create_connection=forbidden
    assert importlib.metadata.version('modal')=='1.6.3','Pinned SDK1.6.3 required'
    distribution=importlib.metadata.distribution('modal')
    source=pathlib.Path(distribution.locate_file('modal/cli/container.py')).read_bytes()
    tree=ast.parse(source)
    stop=next(node for node in tree.body if isinstance(node,ast.AsyncFunctionDef) and node.name=='stop')
    documentation=ast.get_docstring(stop)
    assert 'SIGINT' in documentation and 'rescheduled on other containers' in documentation
    assert 'finish the inputs' in documentation
    # Generated protobuf definitions are local data, not a client/SDK operation.
    from modal_proto import api_pb2
    fields=lambda message:sorted(message.DESCRIPTOR.fields_by_name)
    assert fields(api_pb2.ContainerStopRequest)==['graceful','task_id']
    assert fields(api_pb2.ContainerStopResponse)==[]
    assert fields(api_pb2.TaskGetInfoResponse)==['app_id','info']
    assert not set(fields(api_pb2.TaskInfo)) & {'function_id','workspace_id','environment_name','image_digest','deployment_id'}
    assert not attempts
    print(json.dumps({'inspection':'PASS','live_remote_fault_control':'BLOCKED','sdk':'1.6.3',
        'stop_semantics':'SIGINT_WITH_POSSIBLE_FUNCTION_INPUT_RESCHEDULING',
        'stop_ack_proves_death':False,'complete_task_identity_in_get_info':False,
        'stop_request_fields':fields(api_pb2.ContainerStopRequest),
        'stop_response_fields':fields(api_pb2.ContainerStopResponse),
        'cli_container_source_sha256':hashlib.sha256(source).hexdigest(),
        'socket_attempts':len(attempts),'cloud_invocations':0},sort_keys=True))


if __name__=='__main__':main()
