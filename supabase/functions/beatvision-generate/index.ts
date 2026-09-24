import { assertProjectOwner, BeatVisionAuthError, requireAuthenticatedUser } from "../_shared/auth.ts";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const configured = String(Deno.env.get("BEATVISION_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = configured.length ? configured : ["https://daddydom8249.github.io","https://beat-vision-theta.vercel.app","http://localhost:5173"];
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : (origin ? "" : "*"),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-beatvision-request",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}const CONTRACT='1.1';
type LanguageProviderMode = 'automatic' | 'manual';

interface LanguageProviderResult {
  provider: string;
  text: string;
}

function env(name: string): string {
  return String(Deno.env.get(name) || '').trim();
}

async function callConfiguredPrimaryLanguage(
  prompt: string,
  mode = 'generate',
  durationSeconds?: number,
): Promise<LanguageProviderResult> {
  const base = env('BEATVISION_PRIMARY_LANGUAGE_URL').replace(/\/$/, '');
  const token = env('BEATVISION_PRIMARY_LANGUAGE_TOKEN');
  if (!base) throw new Error('No primary language provider is configured.');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-BeatVision-Request': crypto.randomUUID(),
    },
    body: JSON.stringify({
      contract_version: CONTRACT,
      operation: 'generate',
      payload: { prompt, mode, duration_seconds: durationSeconds },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Primary language provider ${response.status}: ${text.slice(0, 500)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Primary language provider returned invalid JSON.');
  }
  return {
    provider: 'configured-primary',
    text: JSON.stringify(data?.result ?? data),
  };
}

async function callGeminiFallback(
  prompt: string,
  mode = 'generate',
  durationSeconds?: number,
): Promise<LanguageProviderResult> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini fallback is not configured.');
  const model = env('GEMINI_FALLBACK_MODEL') || 'gemini-3.8-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
      systemInstruction: {
        parts: [{
          text: 'You are BeatVision Intelligence operating as a creative planning engine. Return only valid JSON. Preserve supplied song facts and never invent execution results. This provider is a fallback, not the canonical provider authority.',
        }],
      },
      metadata: { mode, duration_seconds: durationSeconds ?? null },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini fallback ${response.status}: ${text.slice(0, 500)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Gemini fallback returned invalid JSON.');
  }
  const output = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text || '')
    .join('')
    .trim();
  if (!output) throw new Error('Gemini fallback returned no text.');
  return { provider: 'gemini-fallback', text: output };
}

async function callLanguageProvider(
  prompt: string,
  mode = 'generate',
  durationSeconds?: number,
  selectionMode: LanguageProviderMode = 'automatic',
): Promise<string> {
  const primaryError: string[] = [];
  if (selectionMode === 'manual') {
    const selected = env('BEATVISION_MANUAL_LANGUAGE_PROVIDER');
    if (!selected) throw new Error('Manual language provider selection is not configured.');
    if (selected === 'gemini') return (await callGeminiFallback(prompt, mode, durationSeconds)).text;
    if (selected === 'primary') return (await callConfiguredPrimaryLanguage(prompt, mode, durationSeconds)).text;
    throw new Error(`Unknown manual language provider: ${selected}`);
  }

  try {
    return (await callConfiguredPrimaryLanguage(prompt, mode, durationSeconds)).text;
  } catch (error) {
    primaryError.push(error instanceof Error ? error.message : String(error));
  }

  try {
    return (await callGeminiFallback(prompt, mode, durationSeconds)).text;
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(`All language providers failed. Primary: ${primaryError.join('; ')}. Gemini fallback: ${fallbackMessage}`);
  }
}

function obj(text:string):Record<string,unknown>{const f=text.match(/```(?:json)?\s*([\s\S]*?)```/);const c=f?.[1]?.trim()||text.trim();try{return JSON.parse(c)}catch{const m=c.match(/\{[\s\S]*\}/)?.[0];try{return JSON.parse(m||'')}catch{return{}}}}
function timestampRange(start:number,end:number):string{const fmt=(seconds:number)=>{const s=Math.max(0,Math.round(seconds));const m=Math.floor(s/60);const r=s%60;return `${m}:${String(r).padStart(2,'0')}`};return `${fmt(start)} - ${fmt(end)}`}
function storyboardArray(text:string):unknown[]{const parsed=obj(text) as any;const beats=Array.isArray(parsed?.visual_beats)?parsed.visual_beats:Array.isArray(parsed?.scenes)?parsed.scenes:[];return beats.map((b:any,i:number)=>{const start=Number(b.startTime??b.start_time??0),end=Number(b.endTime??b.end_time??0);return{beatId:b.beatId||b.beat_id||`beat-${String(i+1).padStart(2,'0')}`,scene_number:Number(b.scene||i+1),startTime:start,endTime:end,duration_seconds:Number(b.duration_seconds||Math.max(0,end-start)),sectionId:b.sectionId||b.section_id||null,lyricRange:b.lyricRange||b.lyric_range||null,lyricMeaning:b.lyricMeaning||b.lyric_meaning||null,narrativePurpose:b.narrativePurpose||b.narrative_purpose||null,emotionalState:b.emotionalState||b.emotional_state||b.emotion||null,emotionalIntensity:b.emotionalIntensity??null,characterState:b.characterState||b.character_state||null,environment:b.environment||b.location||null,action:b.action||null,visualConcept:b.visualConcept||b.visual_concept||null,symbolicElements:Array.isArray(b.symbolicElements)?b.symbolicElements:[],cameraIntent:b.cameraIntent||b.camera_intent||b.camera_direction||'',transitionIntent:b.transitionIntent||b.transition_intent||b.transition_style||'',worldConstraints:Array.isArray(b.worldConstraints)?b.worldConstraints:[],previousBeat:b.previousBeat||b.previous_beat||null,nextBeat:b.nextBeat||b.next_beat||null,visualContinuityRequirements:Array.isArray(b.visualContinuityRequirements)?b.visualContinuityRequirements:[],reusePolicy:b.reusePolicy||b.reuse_policy||'new_visual_event',description:b.description||b.visual_description||b.visualConcept||b.visual_concept||'',visual_direction:b.visual_direction||b.visualDirection||b.visualConcept||b.visual_concept||'',location:b.location||b.environment||'',emotion:b.emotion||b.emotionalState||b.emotional_state||'',continuity_notes:b.continuity_notes||b.continuityNotes||'',timestamp_range:b.timestamp_range||timestampRange(start,end),scene_title:b.scene_title||b.narrativePurpose||b.visualConcept||`Scene ${i+1}`,visual_description:b.visual_description||[b.visualConcept,b.action].filter(Boolean).join(' '),camera_direction:b.camera_direction||b.cameraIntent||'',mood:b.mood||b.emotionalState||b.emotion||'',lyric_moment:b.lyric_moment||b.lyricMeaning||b.lyric_meaning||'',transition_style:b.transition_style||b.transitionIntent||b.transition_intent||''}})}
function normalizeCreativeMatchScore(value:unknown):number{const n=Number(value);if(!Number.isFinite(n))return 0;return Math.max(0,Math.min(100,Math.round(n<=1?n*100:n)))}}
function arr(text:string):unknown[]{const f=text.match(/```(?:json)?\s*([\s\S]*?)```/);const c=f?.[1]?.trim()||text.trim();try{return JSON.parse(c)}catch{const m=c.match(/\[[\s\S]*\]/)?.[0];try{return JSON.parse(m||'')}catch{return[]}}}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders(req)});if(req.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:corsHeaders(req)});const contentLength=Number(req.headers.get('content-length')||0);
if(contentLength>2_000_000) return new Response(JSON.stringify({error:'Request body is too large.'}),{status:413,headers:{...corsHeaders(req),'Content-Type':'application/json'}});
let body:any;
try{body=await req.json()}catch{return new Response(JSON.stringify({error:'Invalid request body'}),{status:400,headers:{...corsHeaders(req),'Content-Type':'application/json'}})}
if(JSON.stringify(body).length>2_000_000) return new Response(JSON.stringify({error:'Request body is too large.'}),{status:413,headers:{...corsHeaders(req),'Content-Type':'application/json'}});
let authenticatedUser:{id:string};
try{authenticatedUser=await requireAuthenticatedUser(req);}catch(error){const status=error instanceof BeatVisionAuthError?401:500;return new Response(JSON.stringify({error:error instanceof Error?error.message:'Authentication failed'}),{status,headers:{...corsHeaders(req),'Content-Type':'application/json'}})}
const projectId=String(body.projectId||body.project_id||'').trim();
try{await assertProjectOwner(req,projectId,authenticatedUser.id);}catch(error){const status=Number((error as any)?.status)||(/denied/i.test(String((error as any)?.message))?403:500);return new Response(JSON.stringify({error:error instanceof Error?error.message:'Project authorization failed'}),{status,headers:{...corsHeaders(req),'Content-Type':'application/json'}})}
const action=String(body.action||''),title=String(body.projectTitle||''),lyrics=String(body.lyrics||''),style=String(body.style||'Cinematic'),notes=String(body.notes||''),seed=Number(body.seed||1);const out=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{headers:{...corsHeaders(req),'Content-Type':'application/json'}});try{
if(action==='generate_world_report'){const report=obj(await callLanguageProvider(`Analyze this song as BeatVision's visual-world director. Song: "${title}". Style: ${style}. Lyrics:\n${lyrics}\n${notes?`Notes: ${notes}`:''}\nSeed: ${seed}. Return ONLY JSON with song_summary,emotional_core,main_visual_world,color_palette,lighting_style,main_characters,symbolic_objects,key_locations,story_direction,creative_match_score.`));const required=['song_summary','emotional_core','main_visual_world','color_palette','lighting_style','main_characters','symbolic_objects','key_locations','story_direction'];const incomplete=required.some((key)=>{const value=report[key];return value===null||value===undefined||String(value).trim()===''||String(value).trim()==='—'});if(incomplete)throw new Error('Arena returned an incomplete Visual World Report. Nothing was written.');report.creative_match_score=normalizeCreativeMatchScore(report.creative_match_score);return out(report)}
if(action==='generate_storyboard'){const w=body.worldReport||{};const duration=Number(body.songDurationSeconds||body.song_duration_seconds||body.durationSeconds||0);const result=await callLanguageProvider(`Create BeatVision's complete song-grounded cinematic visual-beat plan. Song: "${title}". Style: ${style}. Duration: ${duration||'unknown'} seconds. Lyrics/transcript:\n${lyrics}\nWorld: ${JSON.stringify(w)}. Cover the entire song. Never target a fixed scene count. Choose beat count from musical structure, lyric density, narrative events, instrumental intervals and pacing. Each beat must be independently renderable, semantically distinct, and timestamped. Return ONLY JSON with sections, visual_beats, coverage_notes. Each visual beat must contain beatId,startTime,endTime,sectionId,lyricRange,lyricMeaning,narrativePurpose,emotionalState,emotionalIntensity,characterState,environment,action,visualConcept,symbolicElements,cameraIntent,transitionIntent,worldConstraints,previousBeat,nextBeat,visualContinuityRequirements,reusePolicy,description,visual_direction,location,emotion,continuity_notes,duration_seconds.`,'storyboard',duration);return out(storyboardArray(result))}
if(action==='refresh_scene'){const n=Number(body.sceneNumber||1),s=body.existingScene||{},w=body.worldReport||{};return out(obj(await callLanguageProvider(`Refresh BeatVision scene ${n}. Song: "${title}". Style: ${style}. Lyrics excerpt: ${lyrics.slice(0,500)}. World: ${JSON.stringify(w)}. Existing scene: ${JSON.stringify(s)}. Seed: ${seed}. Create a genuinely different visual event, location, camera and composition while preserving timestamp_range exactly. Return ONLY JSON with scene_number,timestamp_range,scene_title,visual_description,camera_direction,mood,location,lyric_moment,transition_style.`)))}
if(action==='generate_characters'){return out(obj(await callLanguageProvider(`Define BeatVision characters and environment. Song: "${title}". Style: ${style}. Lyrics: ${lyrics}. World: ${JSON.stringify(body.worldReport||{})}. Return ONLY JSON with main_character,supporting_character,main_environment,visual_atmosphere,wardrobe_style,world_rules.`)))}
if(action==='generate_style_bible'){return out(obj(await callLanguageProvider(`Create BeatVision's production World Style Bible. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport||{})}. Character/environment: ${JSON.stringify(body.charEnv||{})}. Seed: ${seed}. Return ONLY JSON with overall_visual_style,color_rules,lighting_rules,camera_rules,character_consistency_rules,environment_rules,symbolic_motifs,things_to_avoid.`)))}
if(action==='generate_character_sheet'){return out(obj(await callLanguageProvider(`Create BeatVision's detailed Character Sheet. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport||{})}. Context: ${JSON.stringify(body.charEnv||{})}. Seed: ${seed}. Return ONLY JSON with character_role,appearance,wardrobe,body_language,facial_expression,personality_energy,recurring_visual_traits,consistency_notes.`)))}
if(action==='generate_environment_sheet'){return out(obj(await callLanguageProvider(`Create BeatVision's detailed Environment Sheet. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport||{})}. Context: ${JSON.stringify(body.charEnv||{})}. Seed: ${seed}. Return ONLY JSON with main_world_description,key_locations,weather_atmosphere,textures_materials,background_details,lighting_conditions,recurring_objects,world_consistency_rules.`)))}
if(action==='generate_scene_prompts'){const scenes=Array.isArray(body.scenes)?body.scenes:[];return out(arr(await callLanguageProvider(`Create BeatVision visual prompt packages for every storyboard scene. Song: "${title}". Style: ${style}. Style Bible: ${JSON.stringify(body.styleBible||{})}. Character: ${JSON.stringify(body.characterSheet||{})}. Environment: ${JSON.stringify(body.environmentSheet||{})}. Scenes: ${JSON.stringify(scenes)}. Return ONLY JSON array with scene_number,scene_title,timestamp_range,main_image_prompt,camera_framing,lighting_direction,character_placement,mood,environment_details,symbolic_objects,style_consistency_notes,negative_prompt.`)))}
if(action==='refresh_scene_prompt'){return out(obj(await callLanguageProvider(`Regenerate one BeatVision scene image prompt. Song: "${title}". Style: ${style}. Seed: ${seed}. Style Bible: ${JSON.stringify(body.styleBible||{})}. World: ${JSON.stringify(body.worldReport||{})}. Current scene prompt: ${JSON.stringify(body.scenePrompt||{})}. Return ONLY JSON matching the current scene prompt fields with a visibly different composition.`)))}
if(action==='generate_scene_previews'){return out(arr(await callLanguageProvider(`Create BeatVision cinematic preview descriptors for every scene. Song: "${title}". Style: ${style}. World: ${JSON.stringify(body.worldReport||{})}. Scene prompts: ${JSON.stringify(body.scenePrompts||[])}. Return ONLY JSON array with scene_number,preview_title,preview_description,dominant_colors,mood,location,symbolic_object,camera_direction,placeholder_visual.`)))}
if(action==='generate_scene_image_prompt'||action==='generate_all_scene_image_prompts'){const batch=action==='generate_all_scene_image_prompts',items=batch?(body.scenePrompts||[]):[body.scenePrompt||{}];const results=[];for(let i=0;i<items.length;i++){const s=items[i]||{},n=Number(s.scene_number||i+1),p=obj(await callLanguageProvider(`Create a cinematic placeholder visual descriptor for BeatVision scene ${n}. Song: "${title}". Style: ${style}. Scene: ${JSON.stringify(s)}. Style Bible: ${JSON.stringify(body.styleBible||{})}. Character: ${JSON.stringify(body.characterSheet||{})}. Environment: ${JSON.stringify(body.envSheet||{})}. Consistency: ${JSON.stringify(body.consistency||{})}. Return ONLY JSON with prompt_summary,placeholder_description,placeholder_gradient_start,placeholder_gradient_end,placeholder_accent,placeholder_label_1,placeholder_label_2,character_presence,location,style_consistency_summary.` ));results.push({scene_number:n,scene_title:s.scene_title||`Scene ${n}`,timestamp_range:s.timestamp_range||null,mood:s.mood||null,camera_framing:s.camera_framing||null,location:p.location||null,character_presence:p.character_presence||null,lighting_direction:s.lighting_direction||null,prompt_used:JSON.stringify(s),prompt_summary:p.prompt_summary||`Scene ${n}`,style_consistency_summary:p.style_consistency_summary||null,placeholder_description:p.placeholder_description||null,placeholder_gradient_start:p.placeholder_gradient_start||'#1a1a2e',placeholder_gradient_end:p.placeholder_gradient_end||'#0d0d0d',placeholder_accent:p.placeholder_accent||'#3b7eff',placeholder_label_1:p.placeholder_label_1||s.scene_title||`Scene ${n}`,placeholder_label_2:p.placeholder_label_2||s.mood||'',image_url:null})}return out(results)}
return new Response(JSON.stringify({error:`Unsupported generation action: ${action}`}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}catch(err){return new Response(JSON.stringify({error:err instanceof Error?err.message:String(err),action}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}});