import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGeneration } from './generation-runtime.mjs';

// Disk-backed real PostgreSQL engine. Only a minimal isolated execution-row
// fixture is created; this is not a production schema migration or GPU test.
test('Modal dispatch intent survives PostgreSQL database restart and controller re-entry without resubmission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bragora-pg-modal-recovery-'));
  const id = '00000000-0000-4000-8000-000000000099';
  let db;
  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { providerCalls++; throw new Error('FORBIDDEN_DUPLICATE_MODAL_SUBMISSION'); };
  const loadRow = async () => {
    const result = await db.query('select * from generation_jobs where id = $1', [id]);
    return result.rows[0];
  };
  try {
    db = new PGlite(dir);
    await db.exec(`create table generation_jobs (
      id uuid primary key, job_type text not null, status text not null,
      provider text not null, input_snapshot jsonb not null,
      output jsonb not null, created_at timestamptz not null,
      updated_at timestamptz not null
    )`);
    const originalInput = {modal_motion:{source_image_id:'approved-source'}};
    const intent = {request_id:'beatvision:'+id,provider:'modal',state:'submission_pending'};
    const old = new Date(Date.now()-7*60*1000).toISOString();
    await db.query(`insert into generation_jobs
      (id,job_type,status,provider,input_snapshot,output,created_at,updated_at)
      values ($1,'scene_motion','processing','modal',$2::jsonb,$3::jsonb,$4,$4)`,
      [id,JSON.stringify(originalInput),JSON.stringify({dispatch_started_at:old,dispatch_intent:intent}),old]);
    // Simulate the originating submission process ending after its DB commit
    // but before a provider call ID is durably captured.
    await db.close();
    db = null;
    db = new PGlite(dir);
    const recovered = await loadRow();
    assert.deepEqual(recovered.output.dispatch_intent,intent);
    let writes=0;
    const postgrest = { from(table) {
      assert.equal(table,'generation_jobs');
      let patch=null; const filters=[];
      return {
        update(value) {patch=value;return this;},
        select() {return this;},
        eq(key,value) {filters.push([key,value]);return this;},
        async maybeSingle() {
          const current=await loadRow();
          if(filters.some(([k,v])=>String(current[k] instanceof Date ? current[k].toISOString() : current[k]) !== String(v instanceof Date ? v.toISOString() : v)))return {data:null,error:null};
          if(patch) {
            const change=await db.query(`update generation_jobs
              set output=$1::jsonb where id=$2 returning *`,
              [JSON.stringify(patch.output),id]);
            writes++;
            return {data:change.rows[0],error:null};
          }
          return {data:current,error:null};
        },
        async single() {return {data:await loadRow(),error:null};},
      };
    }};
    for(let attempt=0;attempt<2;attempt++) {
      const runtime=await loadGeneration();
      try {
        const result=await runtime.poll(postgrest,await loadRow());
        assert.equal(result.status,'processing');
        assert.equal(result.output.reconciliation_required,true);
        assert.deepEqual(result.output.dispatch_intent,intent);
        assert.deepEqual(result.input_snapshot,originalInput);
      } finally {await runtime.cleanup();}
    }
    assert.equal(writes,1,'second controller must not rewrite reconciled state');
    assert.equal(providerCalls,0,'controller restarts cannot submit another GPU request');
    await db.close();db=null;
    db=new PGlite(dir);
    const persisted=await loadRow();
    assert.equal(persisted.output.reconciliation_reason,'PROVIDER_ACCEPTANCE_UNKNOWN');
    assert.deepEqual(persisted.output.dispatch_intent,intent);
    assert.equal(persisted.status,'processing');
  } finally {
    globalThis.fetch=originalFetch;
    if(db)await db.close();
    await rm(dir,{recursive:true,force:true});
  }
});
