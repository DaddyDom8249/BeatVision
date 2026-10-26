import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const file=process.argv[2]||'docs/releases/2026-10-26/runtime-manifest.json';
const manifest=JSON.parse(await readFile(file,'utf8'));
for(const item of manifest.files){
 const actual=createHash('sha256').update(await readFile(resolve(item.path))).digest('hex');
 if(actual!==item.sha256)throw new Error('Release snapshot mismatch: '+item.path);
}
console.log('RELEASE_SNAPSHOT_PASS '+manifest.files.length+' exact files; live versions still require independent API verification.');
