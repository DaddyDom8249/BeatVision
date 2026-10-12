import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync("supabase/functions/_shared/storagePaths.ts", "utf8");
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function("exports", code)(mod.exports);
const {assertSongPath,assertStyleAssetPath,assertSceneImagePath}=mod.exports;
const id="00000000-0000-0000-0000-000000000001";
const owner="owner", project="project", plan="plan", scene="scene", job="job";
test("song keys require exact owner/project and canonical UUID filename",()=>{
  assertSongPath(owner+"/"+project+"/"+id+".mp3",owner,project);
  for(const path of ["other/"+project+"/"+id+".mp3",owner+"/other/"+id+".mp3",owner+"/"+project+"/audio.mp3",owner+"/"+project+"/"+id+"mp3",owner+"/"+project+"/"+id+".",owner+"/"+project+"/"+id+".mp3/extra"]){
    assert.throws(()=>assertSongPath(path,owner,project));
  }
});
test("decoded traversal, separators, nested encoding and malformed escapes fail closed",()=>{
  for(const part of ["..",".","%2e%2e","%2E","%2f","%5c","%252e%252e","%00","%",""]){
    assert.throws(()=>assertStyleAssetPath(owner+"/"+project+"/characters/parent/"+part,owner,project,"characters","parent"));
  }
  for(const path of ["/"+owner+"/"+project+"/"+id+".mp3",owner+"//"+project+"/"+id+".mp3"," "+owner+"/"+project+"/"+id+".mp3"]){
    assert.throws(()=>assertSongPath(path,owner,project));
  }
});
test("style names with two dots stay valid; lineage mismatches fail",()=>{
  const path=owner+"/"+project+"/characters/parent/"+id+"-portrait..final.jpg";
  assertStyleAssetPath(path,owner,project,"characters","parent");
  for(const args of [["other",project,"characters","parent"],[owner,"other","characters","parent"],[owner,project,"environments","parent"],[owner,project,"characters","other"]]){
    assert.throws(()=>assertStyleAssetPath(path,...args));
  }
});
test("service image paths bind project, plan, scene and job; cannot cross lineage",()=>{
  const path=project+"/scene-images/"+plan+"/"+scene+"/"+job+".jpg";
  assertSceneImagePath(path,project,plan,scene,job);
  for(const args of [["other",plan,scene,job],[project,"other",scene,job],[project,plan,"other",job],[project,plan,scene,"other"]]){
    assert.throws(()=>assertSceneImagePath(path,...args));
  }
  assert.throws(()=>assertSceneImagePath(project+"/scene-images/"+plan+"/"+scene+"/%2e%2e",project,plan,scene,job));
});
