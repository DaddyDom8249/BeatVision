export type MotionJobStatus = 'queued'|'running'|'polling'|'succeeded'|'failed'|'cancelled';
export type MotionJob = { job_id:string; project_id:string; stage:'motion'; provider:string; provider_job_id:string|null; status:MotionJobStatus; retry_count:number; max_retries:number; idempotency_key:string; created_at:string; updated_at:string; error:string|null; output:Record<string,unknown>|null; input:Record<string,unknown>; events:Array<Record<string,unknown>> };
const now=()=>new Date().toISOString(); const MAX_RETRIES=3;
const retryable=(s:string)=>/502|503|504|temporarily unavailable|rate limit|too many requests|timed out|timeout|aborted/i.test(s);
const validImageUrl=(value:unknown)=>{try{const u=new URL(String(value||''));return u.protocol==='https:'||u.protocol==='http:';}catch{return false;}};

export class BeatVisionMotionJob {
  state:any; env:any;
  constructor(state:any,env:any){this.state=state;this.env=env;}
  async load():Promise<MotionJob|null>{return (await this.state.storage.get('job'))||null;}
  async save(job:MotionJob){job.updated_at=now();await this.state.storage.put('job',job);}
  async event(job:MotionJob,event:string,details:Record<string,unknown>={}){const entry={at:now(),event,...details};job.events=[...(job.events||[]).slice(-99),entry];await this.save(job);}
  async alarm(){const job=await this.load();if(!job||['succeeded','failed','cancelled'].includes(job.status))return;try{await this.tick(job);}catch(e){const msg=e instanceof Error?e.message:String(e);job.error=msg;if(retryable(msg)&&job.retry_count<job.max_retries){job.retry_count++;job.status='polling';await this.event(job,'transient_error',{error:msg,retry_count:job.retry_count});await this.state.storage.setAlarm(Date.now()+Math.min(30000,1500*job.retry_count));}else{job.status='failed';await this.event(job,'job_failed',{error:msg,retries:job.retry_count});}}}
  async tick(job:MotionJob){
    if(!job.provider_job_id){
      if(!this.env.PIXAZO_API_KEY){job.status='failed';job.error='PIXAZO_API_KEY is not configured.';await this.save(job);return;}
      if(!validImageUrl(job.input?.image_url)){job.status='failed';job.error='input.image_url must be an http(s) URL.';await this.save(job);return;}
      if(!String(job.input?.prompt||'').trim()){job.status='failed';job.error='input.prompt is required.';await this.save(job);return;}
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);let response:Response;try{response=await fetch('https://gateway.pixazo.ai/ltx-video/v1/image-to-video',{method:'POST',headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':this.env.PIXAZO_API_KEY},body:JSON.stringify(job.input),signal:controller.signal});}finally{clearTimeout(timer);}
      const text=await response.text();let data:any;try{data=JSON.parse(text)}catch{data={raw:text}};if(!response.ok)throw new Error(`Pixazo submit ${response.status}: ${String(data?.message||data?.error||text).slice(0,1200)}`);
      const direct=data?.output?.media_url?.[0]||data?.output?.media_url||data?.output?.url||data?.url||null;
      if(direct){job.output={provider_job_id:null,asset_id:`motion:${job.job_id}`,video_url:direct};job.status='succeeded';job.error=null;await this.event(job,'provider_completed',{direct:true});return;}
      if(!data?.request_id)throw new Error('Pixazo returned no request_id or media output.');
      job.provider_job_id=String(data.request_id);job.status='polling';job.retry_count=0;await this.event(job,'provider_submitted',{provider_job_id:job.provider_job_id});await this.state.storage.setAlarm(Date.now()+7000);return;
    }
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);let response:Response;try{response=await fetch(`https://gateway.pixazo.ai/v2/requests/status/${encodeURIComponent(job.provider_job_id)}`,{headers:{'Ocp-Apim-Subscription-Key':this.env.PIXAZO_API_KEY},signal:controller.signal});}finally{clearTimeout(timer);}
    const text=await response.text();let data:any;try{data=JSON.parse(text)}catch{data={}};if(!response.ok)throw new Error(`Pixazo status ${response.status}: ${text.slice(0,1200)}`);
    const status=String(data?.status||'').toUpperCase();
    if(status==='COMPLETED'||status==='SUCCEEDED'){const url=data?.output?.media_url?.[0]||data?.output?.media_url||data?.output?.url||data?.url||null;if(!url)throw new Error('Pixazo completed without video output.');job.output={provider_job_id:job.provider_job_id,asset_id:`motion:${job.job_id}:${job.provider_job_id}`,video_url:url};job.status='succeeded';job.error=null;await this.event(job,'provider_completed',{provider_job_id:job.provider_job_id});return;}
    if(['ERROR','FAILED','CANCELLED'].includes(status)){job.status='failed';job.error=String(data?.error||`Provider job ${status}`);await this.event(job,'provider_failed',{provider_job_id:job.provider_job_id,error:job.error});return;}
    job.status='polling';job.retry_count=0;await this.save(job);await this.state.storage.setAlarm(Date.now()+7000);
  }
  async fetch(request:Request):Promise<Response>{
    if(request.method==='GET')return Response.json((await this.load())||{status:'not_found'});
    if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
    if(this.env.GATEWAY_TOKEN&&request.headers.get('Authorization')!==`Bearer ${this.env.GATEWAY_TOKEN}`)return Response.json({ok:false,error:'Unauthorized'},{status:401});
    const existing=await this.load();if(existing)return Response.json(existing,{headers:{'X-BeatVision-Idempotent':'true'}});
    const body:any=await request.json();const projectId=String(body?.project_id||'').trim();const key=String(body?.idempotency_key||body?.job_id||'').trim();if(!projectId||!key)return Response.json({ok:false,error:'project_id and idempotency_key are required.'},{status:400});
    const input=body?.input&&typeof body.input==='object'?body.input:{};if(!validImageUrl(input.image_url)||!String(input.prompt||'').trim())return Response.json({ok:false,error:'input.prompt and an http(s) input.image_url are required.'},{status:422});
    const job:MotionJob={job_id:String(body.job_id||crypto.randomUUID()),project_id:projectId,stage:'motion',provider:String(body.provider||'pixazo-ltx'),provider_job_id:null,status:'queued',retry_count:0,max_retries:Math.max(0,Math.min(Number(body.max_retries)||MAX_RETRIES,8)),idempotency_key:key,created_at:now(),updated_at:now(),error:null,output:null,input,events:[]};
    await this.event(job,'job_created',{project_id:projectId,idempotency_key:key});await this.state.storage.setAlarm(Date.now()+1);return Response.json(job,{status:202});
  }
}
export function retryMotionJob(job:MotionJob,error:string,transient:boolean){if(job.status==='succeeded'||job.status==='cancelled')return job;job.error=error;if(transient&&job.retry_count<job.max_retries){job.retry_count++;job.status='polling';}else job.status='failed';job.updated_at=now();return job;}
export function completeMotionJob(job:MotionJob,output:Record<string,unknown>){if(job.status==='succeeded')return job;job.output=output;job.error=null;job.status='succeeded';job.updated_at=now();return job;}
