const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
function cors(request,env){
 const origin=request.headers.get("Origin")||"";
 const allowed=env.ALLOWED_ORIGIN||"https://clipfactory-aer.pages.dev";
 const permitted=origin===allowed||/^https:\/\/[a-z0-9-]+\.clipfactory-aer\.pages\.dev$/.test(origin);
 return {"Access-Control-Allow-Origin":permitted?origin:allowed,"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"};
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("")}
async function authenticate(request,env){
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 return env.DB.prepare("SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'")
  .bind(await digest(token),Math.floor(Date.now()/1000)).first();
}
export default {
 async fetch(request,env){
  const headers=cors(request,env);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const respond=(data,status=200)=>{const response=json(data,status);Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response};
  if(new URL(request.url).pathname==="/health"&&request.method==="GET")return respond({ok:true,service:"ClipFactory Transcription API",model:"@cf/openai/whisper-large-v3-turbo"});
  if(new URL(request.url).pathname!=="/transcribe"||request.method!=="POST")return respond({error:"Not found."},404);
  try{
   const user=await authenticate(request,env);
   if(!user)return respond({error:"Please sign in again to generate subtitles."},401);
   if(!env.AI)return respond({error:"Speech recognition is not configured."},503);
   let form;try{form=await request.formData()}catch{return respond({error:"Upload an audio chunk."},400)}
   const audio=form.get("audio");
   if(!(audio instanceof File)||audio.size<44||audio.size>4*1024*1024)return respond({error:"Audio chunk must be a WAV file between 44 bytes and 4 MB."},400);
   if(audio.type&&audio.type!=="audio/wav"&&audio.type!=="audio/x-wav")return respond({error:"Only WAV audio chunks are accepted."},415);
   const recent=await env.DB.prepare("SELECT COUNT(*) AS total FROM user_activity_logs WHERE user_id=? AND action='subtitle_transcribed' AND created_at>=datetime('now','-1 day')").bind(user.id).first();
   if(Number(recent?.total||0)>=160)return respond({error:"Daily subtitle limit reached. Try again tomorrow."},429);
   const bytes=new Uint8Array(await audio.arrayBuffer());
   const result=await env.AI.run("@cf/openai/whisper-large-v3-turbo",{audio:Array.from(bytes),task:"transcribe",condition_on_previous_text:false});
   const output=result?.result||result||{};
   if(!output.text&&!output.vtt)return respond({error:"No speech detected in this audio segment."},422);
   await env.DB.prepare("INSERT INTO user_activity_logs(id,user_id,action,details) VALUES(?,?,?,?)")
    .bind(crypto.randomUUID(),user.id,"subtitle_transcribed",JSON.stringify({bytes:audio.size,words:Number(output.word_count||0)})).run();
   return respond({text:String(output.text||""),vtt:String(output.vtt||""),segments:Array.isArray(output.segments)?output.segments:[],word_count:Number(output.word_count||0)});
  }catch(error){console.error("Transcription request failed",error);return respond({error:"Speech recognition failed. Please retry this segment."},502)}
 }
};