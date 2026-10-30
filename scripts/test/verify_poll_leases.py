"""Independent PostgreSQL sessions; isolated fixture databases ONLY, no providers.

Apply generation-enqueue-fixture.sql, add fixture timestamps, then the poll
migration before invoking. --psql accepts a JSON argv prefix for local Docker.
"""
import argparse
import concurrent.futures
import json
import os
import re
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--psql', default='["psql"]')
    args = parser.parse_args()
    if os.environ.get('BEATVISION_POLL_TEST_ISOLATED') != '1':
        raise SystemExit('Explicit isolated fixture acknowledgement required')
    prefix = json.loads(args.psql)

    def sql(statement, expected=0):
        result = subprocess.run(prefix + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=statement,
                                text=True, capture_output=True, timeout=30)
        if result.returncode != expected:
            raise AssertionError(f'psql exit {result.returncode}: {result.stderr}')
        return result.stdout

    sql("""insert into generation_jobs(id,project_id,visual_plan_scene_id,job_type,status,input_snapshot)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        '00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300',
        'scene_motion','processing','{"frozen":true}'::jsonb from generate_series(1,41)n;""")
    statement = "begin;select id from claim_generation_poll(null,8);select pg_sleep(0.2);commit;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        replies = list(pool.map(lambda _: sql(statement), range(12)))
    selected = re.findall(r'^00000000-0000-4000-8000-\d{12}$', '\n'.join(replies), re.M)
    assert len(selected) == len(set(selected)) == 41, selected
    assert '00000000-0000-4000-8000-000000000009' in selected
    assert not sql('select id from claim_generation_poll(null,8);').strip()
    # A new connection sees durable claims; expiry permits recovery with a NEW
    # token, while the old worker's conditional update affects no rows.
    old = sql("select poll_lease_token from generation_jobs where id='00000000-0000-4000-8000-000000000009';").strip()
    sql("update generation_jobs set poll_lease_until=now()-interval '1 second',next_poll_at=now()-interval '1 second' where id='00000000-0000-4000-8000-000000000009';")
    new = sql("select poll_lease_token from claim_generation_poll('00000000-0000-4000-8000-000000000009',1);").strip()
    assert old and new and old != new
    assert not sql("update generation_jobs set status='failed' where id='00000000-0000-4000-8000-000000000009' and poll_lease_token='"+old+"' returning id;").strip()
    assert sql("select count(*) from generation_jobs where input_snapshot->>'frozen'='true';").strip() == '41'
    for role in ('anon','authenticated'):
        sql('set role '+role+';select * from claim_generation_poll(null,8);', expected=3)
        sql('set role '+role+";update generation_jobs set status='queued';", expected=3)
    print('PASS:12 independent sessions,41 distinct claims,ninth selected,no overlap,expiry recovery,stale-token fencing,frozen inputs,client denials')


if __name__ == '__main__':
    main()
