import test from "node:test";
import assert from "node:assert/strict";
import {loadGeneration} from "./generation-runtime.mjs";

const secret = "unit-test-scheduler-secret-not-live";
let rpcCalls = 0;
let authCalls = 0;
const db = {
  rpc: async name => {
    rpcCalls++;
    assert.equal(name,"get_generation_scheduler_secret");
    return {data:secret,error:null};
  },
  auth: {getUser:async()=>{authCalls++;return{data:{user:null},error:new Error("Session missing")}}},
  from:()=>{throw Error("No table access expected")},
};
function request(value) {
  return new Request("https://example.test/beatvision-generation",{
    method:"POST",
    headers: value ? {"X-BeatVision-Queue-Secret":value}: {},
    body:"{}",
  });
}
test("wrong scheduler secret is rejected without user JWT fallback",async()=>{
  rpcCalls=0;authCalls=0;
  const rt=await loadGeneration(db,{SUPABASE_URL:"https://stub.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-only-unit-test"});
  try {
    for(const value of ["wrong",secret.slice(0,-1),secret+"more"]) {
      await assert.rejects(rt.authenticate(request(value)),err=>err?.status===401&&err?.code==="UNAUTHORIZED_SCHEDULER");
    }
    assert.equal(rpcCalls,3);
    assert.equal(authCalls,0);
  } finally {await rt.cleanup();}
});
test("exact secret authorizes system jobs without exposing it",async()=>{
  const rt=await loadGeneration(db,{SUPABASE_URL:"https://stub.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-only-unit-test"});
  try {
    const result=await rt.authenticate(request(secret));
    assert.deepEqual(result,{kind:"system",userId:null});
  } finally {await rt.cleanup();}
});
test("empty scheduler header cannot authorize without normal user session",async()=>{
  const rt=await loadGeneration(db,{SUPABASE_URL:"https://stub.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"server-only-unit-test"});
  try {
    await assert.rejects(rt.authenticate(request("")),err=>err?.status===401&&err?.code==="UNAUTHENTICATED");
  } finally {await rt.cleanup();}
});
