// Read-only public CORS OPTIONS checks. No bearer token, API key, POST, job or inference.
import assert from "node:assert/strict";
const endpoint="https://mdofsinyofqbeapzfygu.supabase.co/functions/v1/";
const slugs=["beatvision-generation","beatvision-ai-director","beatvision-song-interpretation",
  "beatvision-world","beatvision-analyze-song","beatvision-style-draft"];
const positive=["https://beat-vision-kfk4sh067-beat-vision.vercel.app","https://beat-vision-theta.vercel.app"];
const hostile="https://untrusted-preview-attacker.example";
const check=async(slug,origin)=>{
 const response=await fetch(endpoint+slug,{
   method:"OPTIONS",
   headers:{
     Origin:origin,
     "Access-Control-Request-Method":"POST",
     "Access-Control-Request-Headers":"authorization,apikey,content-type,x-client-info",
   },redirect:"error",signal:AbortSignal.timeout(12000),
 });
 const actual=response.headers.get("access-control-allow-origin");
 console.log(JSON.stringify({slug,origin,status:response.status,cors:actual}));
 assert.ok([200,204].includes(response.status),slug+": preflight rejected ("+response.status+")");
 return actual;
};
for(const slug of slugs){
 for(const origin of positive)
  assert.equal(await check(slug,origin),origin,slug+": expected exact approved origin");
 assert.notEqual(await check(slug,hostile),hostile,slug+": hostile origin was allowed");
}
console.log("PASS: all six Edge functions admit production and exact preview origins while denying hostile origin; OPTIONS only.");