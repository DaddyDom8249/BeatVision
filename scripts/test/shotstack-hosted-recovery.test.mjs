import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const src=await readFile(new URL('../../src/pages/ProductionWorkspacePage.tsx',import.meta.url),'utf8');
const from=src.indexOf('function legacyRenderHref(');
const to=src.indexOf('\nfunction productionErrorMessage(',from);
assert.ok(from>=0&&to>from);
const code=ts.transpileModule(src.slice(from,to),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {legacyRenderHref,hostedShotstackRenderHref}=new Function(code+';return {legacyRenderHref,hostedShotstackRenderHref};')();
const old='https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com/eaf220ehc2/3afd25f2-995e-4b2b-97da-b39d8dad6dc8.mp4';
test('exact legacy Shotstack S3 URL creates stage CDN candidate',()=>{
 assert.equal(legacyRenderHref(old),old);
 assert.equal(hostedShotstackRenderHref(old),'https://cdn.shotstack.io/au/stage/eaf220ehc2/3afd25f2-995e-4b2b-97da-b39d8dad6dc8.mp4');
});
for(const url of [
 'https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com.evil.com/eaf220ehc2/3afd25f2-995e-4b2b-97da-b39d8dad6dc8.mp4',
 old+'?token=secret',old.replace('https:','http:'),old.replace('.com/','.com:444/'),
 'https://cdn.shotstack.io/au/stage/eaf220ehc2/3afd25f2-995e-4b2b-97da-b39d8dad6dc8.mp4',
 'https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com/../../secrets.mp4',null,''
])test('no redirect or hosted candidate for untrusted legacy URL '+String(url).slice(0,60),()=>{
 assert.equal(hostedShotstackRenderHref(url),null);
});
test('browser decoding remains mandatory for a READY state, no fake export',()=>{
 assert.match(src,/onCanPlay=\{\(\) => setFinalPlayback\(\{ url: finalPreviewUrl, state: "ready" \}\)\}/);
 assert.match(src,/onError=\{\(\) => setFinalPlayback\(\{ url: finalPreviewUrl, state: "failed" \}\)\}/);
 assert.match(src,/RENDER RECORDED · PLAYBACK UNVERIFIED/);
 assert.match(src,/Open hosted render \(availability unverified\)/);
 assert.match(src,/finalVideo\.downloadable === true/);
});
