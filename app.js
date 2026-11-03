const API_DEFAULT = "https://clipfactory-api.joshdrn18.workers.dev";
const state = { token: localStorage.getItem("cf_token") || "", user: null, points: 0, projects: [], files: [], packages: [], authMode: "login", adminTab:"overview", ffmpeg:null };
const $ = (id) => document.getElementById(id);
const apiBase = () => localStorage.getItem("cf_api_url") || API_DEFAULT;
async function api(path, options={}) {
  const isForm = options.body instanceof FormData; const headers = { ...(isForm?{}:{"Content-Type":"application/json"}), ...(options.headers||{}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const response = await fetch(apiBase() + "/api" + path, { ...options, headers });
  const data = await response.json().catch(()=>({error:"Invalid server response"}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
function fmt(n){return Number(n||0).toLocaleString()}
function showView(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$("view-"+name)?.classList.add("active");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("crumbTitle").textContent=({overview:"Overview",projects:"My Projects",videos:"My Videos",bulk:"Bulk Upload",templates:"Viral Templates",growth:"Growth Tools",queue:"Processing Queue",exports:"Export Center",wallet:"Points Wallet",admin:"Admin Panel",settings:"Settings"})[name]||name;$("sidebar").classList.remove("open");if(name==="wallet")loadWallet();if(name==="projects")renderProjects();if(name==="videos")loadVideos();if(name==="queue")renderQueue();if(name==="exports")loadExportCenter();if(name==="admin")loadAdmin()}
document.addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)showView(b.dataset.view)});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
function setUser(user){state.user=user;$("adminNav").hidden=user?.role!=="admin";$("profileName").textContent=user?.name||"Guest creator";$("profileEmail").textContent=user?.email||"Sign in to sync";$("avatar").textContent=(user?.name||"G").slice(0,1).toUpperCase();$("topAvatar").textContent=$("avatar").textContent;$("authButton").textContent=user?"Account":"Sign in";$("settingsAccount").textContent=user?user.name+" · "+user.email:"You are browsing as a guest. Sign in to sync your workspace.";$("logoutButton").hidden=!user}
function updatePoints(n,unlimited=false){state.points=Number(n||0);const display=unlimited?"∞":fmt(state.points);$("sidePoints").innerHTML=display+' <small>pts</small>';$("statPoints").textContent=display;$("walletPoints").innerHTML=display+' <small>'+(unlimited?"unlimited":"pts")+'</small>';$("walletUnlimited")?.toggleAttribute("hidden",!unlimited);$("packageGrid")?.setAttribute("hidden","")}
async function refresh(){if(!state.token){setUser(null);updatePoints(0);$("statProjects").textContent="0";$("statExports").textContent="0";$("statQueue").textContent="—";return}try{const d=await api("/me");setUser(d.user);updatePoints(d.wallet?.balance,d.wallet?.unlimited||d.user?.role==="admin");state.projects=d.projects||[];$("statProjects").textContent=state.projects.length;renderProjects();$("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("")||"No projects yet — create your first batch.";try{const videos=await api("/videos");$("statExports").textContent=fmt(videos.count??videos.videos?.length??0)}catch(e){$("statExports").textContent="—"}$("statQueue").textContent="—";}catch(e){if(e.message==="Please sign in."){state.token="";localStorage.removeItem("cf_token");setUser(null)}$("statExports").textContent="—";toast(e.message||"Could not refresh workspace.")}}
function projectRow(p){const draft=String(p.status||"draft").toLowerCase()==="draft";return '<div class="project-row"><span>'+escapeHtml(p.name)+(draft?' <button class="admin-action danger" data-delete-project="'+escapeHtml(p.id)+'" title="Delete draft project">Delete</button>':'')+'</span><span>'+escapeHtml(p.kind||"Video")+'</span><span><i class="status-pill">'+escapeHtml(p.status||"Draft")+'</i></span><span>'+new Date(p.created_at||Date.now()).toLocaleDateString()+'</span></div>'}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-delete-project]");if(!b)return;const id=b.dataset.deleteProject;const project=state.projects.find(p=>p.id===id);if(!project)return;if(String(project.status||"draft").toLowerCase()!=="draft"){toast("Only draft projects can be deleted.");return}if(!confirm('Delete draft project "'+project.name+'"? Its uploaded source files will be deleted, but finished videos stay in My Videos. Points already used will not be refunded.'))return;b.disabled=true;try{await api("/projects/"+encodeURIComponent(id),{method:"DELETE"});state.projects=state.projects.filter(p=>p.id!==id);$("statProjects").textContent=state.projects.length;$("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("")||"No projects yet — create your first batch.";renderProjects();toast("Draft project deleted.");}catch(err){b.disabled=false;toast(err.message||"Could not delete project.");}});
function renderProjects(){$("projectList").innerHTML=state.user?(state.projects.map(projectRow).join("")||"No projects yet. Upload videos to start a project."):"Sign in to sync and manage your projects."}
async function loadQueue(){
 const root=$("queueList");if(!state.user){root.innerHTML="Sign in to view your processing activity.";return}
 root.innerHTML='<div class="empty-state">Refreshing project status…</div>';
 try{const d=await api("/me");state.projects=d.projects||[];$("statProjects").textContent=state.projects.length;renderProjects();renderQueueList()}catch(e){root.innerHTML='<div class="notice">Could not refresh queue: '+escapeHtml(e.message)+'</div>'}
}
function renderQueue(){renderQueueList()}
function renderQueueList(){
 const root=$("queueList");if(!state.user){root.innerHTML="Sign in to view your processing activity.";return}
 const items=[...state.projects].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 if(!items.length){root.innerHTML='<div class="empty-state">No projects yet. Start in Bulk Upload to create your first video.</div>';return}
 root.innerHTML='<div class="table-card">'+items.map(p=>'<div class="project-row"><span><strong>'+escapeHtml(p.name)+'</strong></span><span>'+escapeHtml(p.kind||"Video")+'</span><span><i class="status-pill">'+escapeHtml(p.status||"Draft")+'</i></span><span>'+new Date(p.updated_at||p.created_at||Date.now()).toLocaleString()+'</span></div>').join("")+'</div>';
}
async function loadExportCenter(){
 const root=$("exportLibrary");if(!state.user){root.innerHTML="Sign in to view your exports.";return}
 root.innerHTML='<div class="empty-state">Loading exports…</div>';
 try{
  const data=await api("/videos");const videos=data.videos||[];
  if(!videos.length){root.innerHTML='<div class="empty-state">No exports yet. Finish a video in Bulk Upload and it will appear here.</div>';return}
  root.innerHTML='<div class="table-card">'+videos.map(v=>'<div class="project-row"><span><strong>'+escapeHtml(v.file_name)+'</strong><small style="display:block;color:var(--muted)">'+escapeHtml(v.project_name||"Saved export")+'</small></span><span>'+formatBytes(v.size_bytes)+'</span><span>'+new Date(v.created_at).toLocaleDateString()+'</span><span><button class="admin-action" data-export-download="'+escapeHtml(v.id)+'" data-name="'+escapeHtml(v.file_name)+'">Download</button></span></div>').join("")+'</div>';
 }catch(e){root.innerHTML='<div class="notice">Could not load exports: '+escapeHtml(e.message)+'</div>'}
}
$("refreshQueue").onclick=()=>loadQueue();
$("refreshExports").onclick=()=>loadExportCenter();
$("exportLibrary").onclick=async e=>{
 const b=e.target.closest("[data-export-download]");if(!b)return;
 try{
  const response=await fetch(apiBase()+"/api/videos/"+encodeURIComponent(b.dataset.exportDownload)+"/download",{headers:{Authorization:"Bearer "+state.token}});
  if(!response.ok)throw new Error("Download failed");
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=b.dataset.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(err){toast(err.message||"Could not download export.")}
};
function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024*1024)return (n/1024).toFixed(0)+" KB";if(n<1024*1024*1024)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(2)+" GB"}
async function loadVideos(){
 const root=$("videoLibrary");if(!state.user){root.innerHTML="Sign in to view your finished videos.";return}
 root.innerHTML='<div class="empty-state">Loading your video library…</div>';
 try{
  const data=await api("/videos");const videos=data.videos||[];
  $("videoCount").textContent=fmt(videos.length);$("videoStorage").textContent=formatBytes(data.storage_bytes);
  if(!videos.length){root.innerHTML='<div class="empty-state">No finished videos yet. Completed exports will appear here automatically.</div>';return}
  root.innerHTML='<div class="video-grid">'+videos.map(v=>'<article class="video-card"><div class="video-preview" id="video-preview-'+escapeHtml(v.id)+'"><button class="video-preview-load" data-video-preview="'+escapeHtml(v.id)+'">▶ Load preview</button></div><div class="video-card-body"><strong class="video-name">'+escapeHtml(v.file_name)+'</strong><small>'+escapeHtml(v.project_name||"Original project unavailable")+' · '+formatBytes(v.size_bytes)+' · '+new Date(v.created_at).toLocaleDateString()+'</small><div class="video-card-actions"><button class="admin-action" data-video-download="'+escapeHtml(v.id)+'" data-name="'+escapeHtml(v.file_name)+'">Download</button><button class="admin-action" data-video-rename="'+escapeHtml(v.id)+'" data-name="'+escapeHtml(v.file_name)+'">Rename</button><button class="admin-action danger" data-video-delete="'+escapeHtml(v.id)+'">Delete</button></div></div></article>').join("")+'</div>';
 }catch(e){root.innerHTML='<div class="notice">Could not load videos: '+escapeHtml(e.message)+'</div>'}
}
$("refreshVideos").onclick=loadVideos;
$("videoLibrary").onclick=async e=>{
 const preview=e.target.closest("[data-video-preview]"),download=e.target.closest("[data-video-download]"),rename=e.target.closest("[data-video-rename]"),del=e.target.closest("[data-video-delete]");
 try{
  if(preview){const id=preview.dataset.videoPreview,box=$("video-preview-"+id);preview.disabled=true;preview.textContent="Loading preview…";const response=await fetch(apiBase()+"/api/videos/"+encodeURIComponent(id)+"/file",{headers:{Authorization:"Bearer "+state.token}});if(!response.ok)throw new Error("Preview failed");const blob=await response.blob(),url=URL.createObjectURL(blob);box.innerHTML='<video controls autoplay playsinline></video>';box.querySelector("video").src=url}
  if(download){const id=download.dataset.videoDownload;const response=await fetch(apiBase()+"/api/videos/"+encodeURIComponent(id)+"/download",{headers:{Authorization:"Bearer "+state.token}});if(!response.ok)throw new Error("Download failed");const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=download.dataset.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  if(rename){const next=prompt("New video filename:",rename.dataset.name);if(!next||!next.trim()||next.trim()===rename.dataset.name)return;await api("/videos/"+encodeURIComponent(rename.dataset.videoRename),{method:"PUT",body:JSON.stringify({file_name:next.trim()})});toast("Video renamed.");await loadVideos()}
  if(del){if(!confirm("Permanently delete this finished video from your library?"))return;await api("/videos/"+encodeURIComponent(del.dataset.videoDelete),{method:"DELETE"});toast("Video deleted.");await loadVideos()}
 }catch(err){toast(err.message||"Video action failed.")}
};

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("authButton").onclick=()=>state.user?showView("settings"):openAuth();
$("topAvatar").onclick=()=>state.user?showView("settings"):openAuth();
$("authToggle").onclick=(e)=>{e.preventDefault();state.authMode=state.authMode==="login"?"register":"login";$("authTitle").textContent=state.authMode==="login"?"Your creative workspace":"Create your account";$("authName").style.display=state.authMode==="register"?"block":"none";$("authName").required=state.authMode==="register";$("authToggle").textContent=state.authMode==="login"?"Need an account? Create one":"Already have an account? Sign in"};
function openAuth(){state.authMode="login";$("authName").style.display="none";$("authName").required=false;$("authTitle").textContent="Your creative workspace";$("authToggle").textContent="Need an account? Create one";$("authDialog").showModal()}
$("authForm").onsubmit=async e=>{e.preventDefault();const body={email:$("authEmail").value,password:$("authPassword").value,name:$("authName").value};try{const d=await api("/auth/"+state.authMode,{method:"POST",body:JSON.stringify(body)});state.token=d.token;localStorage.setItem("cf_token",d.token);$("authDialog").close();await refresh();toast("Welcome to ClipFactory!")}catch(err){toast(err.message)}};
$("logoutButton").onclick=()=>{state.token="";localStorage.removeItem("cf_token");state.projects=[];setUser(null);updatePoints(0);$("statProjects").textContent="0";$("statExports").textContent="0";$("statQueue").textContent="—";renderProjects();$("recentProjects").textContent="Sign in to see your recent projects.";toast("Signed out")};
const templates=[["Podcast punch","Turn a long conversation into a sharp, captioned highlight.","PODCAST","Podcast"],["Product spotlight","Show the value in the first three seconds.","PRODUCT","Product"],["Storytime hook","Open a story loop that makes viewers stay.","STORY","Story"],["Before / after","A visual transformation with a clear payoff.","TRANSFORM","Before / After"],["Quick tutorial","A clean step-by-step educational short.","HOW TO","Tutorial"],["Faceless facts","Pair concise facts with bold on-screen text.","FACTS","Faceless"]];
$("templateGrid").innerHTML=templates.map((t,i)=>'<article class="template-card"><div class="template-art">'+t[2]+'</div><div class="template-copy"><strong>'+t[0]+'</strong><p>'+t[1]+'</p><button class="text-button" data-template="'+i+'">Use template ↗</button></div></article>').join("");
$("templateGrid").onclick=e=>{const b=e.target.closest("[data-template]");if(!b)return;showView("bulk");$("workflow").value="clips";toast(templates[Number(b.dataset.template)][0]+" selected — upload footage to continue.")};
function uploadCost(file){return Math.ceil(file.size/(100*1024*1024))*10}
function selectFiles(list){
 const incoming=Array.from(list),valid=incoming.filter(f=>/^video\/(mp4|quicktime|webm|x-matroska)$/.test(f.type)&&f.size<=500*1024*1024);
 if(valid.length!==incoming.length)toast("Only MP4, MOV, WEBM or MKV files up to 500 MB are accepted.");
 state.files=[...state.files,...valid].filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size)===i);
 const totalCost=state.files.reduce((sum,file)=>sum+uploadCost(file),0);
 const costLabel=state.user?.role==="admin"?"Admin unlimited · 0 points":fmt(totalCost)+" points estimated";
 $("fileList").innerHTML=state.files.map((f,i)=>'<div class="file-item"><span>▣ '+escapeHtml(f.name)+'</span><span>'+(f.size/1048576).toFixed(1)+' MB · '+(state.user?.role==="admin"?"Free":uploadCost(f)+" pts")+'</span><button type="button" class="admin-action danger" data-remove-file="'+i+'">Remove</button></div>').join("")+(state.files.length?'<div class="file-item"><strong>Estimated upload cost</strong><strong>'+costLabel+'</strong></div>':"");
 $("clearFiles").hidden=!state.files.length;$("createBatch").disabled=!state.files.length;
}
$("fileList").onclick=e=>{const b=e.target.closest("[data-remove-file]");if(!b)return;state.files.splice(Number(b.dataset.removeFile),1);selectFiles([])};
$("clearFiles").onclick=()=>{state.files=[];$("fileInput").value="";selectFiles([])};
$("fileInput").onchange=e=>selectFiles(e.target.files);
$("dropzone").ondragover=e=>{e.preventDefault();$("dropzone").style.borderColor="#a48aff"};
$("dropzone").ondragleave=()=>$("dropzone").style.borderColor="";
$("dropzone").ondrop=e=>{e.preventDefault();$("dropzone").style.borderColor="";selectFiles(e.dataTransfer.files)};
let engineProgressValue=0,ffmpegProgressBase=15,ffmpegProgressSpan=75;
function engineProgress(label,pct,reset=false){if(reset)engineProgressValue=0;engineProgressValue=Math.max(engineProgressValue,Math.max(0,Math.min(100,Number(pct)||0)));$("engineProgress").hidden=false;$("engineStatus").textContent=label;$("enginePercent").textContent=Math.round(engineProgressValue)+"%";$("engineProgressBar").style.width=engineProgressValue+"%"}
async function getFFmpeg(){
 if(state.ffmpeg)return state.ffmpeg;
 engineProgress("Loading video engine (first run may take a moment)…",2);
 const {FFmpeg}=await import("https://esm.sh/@ffmpeg/ffmpeg@0.12.15");
 const ffmpeg=new FFmpeg();
 ffmpeg.__clipFactoryLogs=[];
 ffmpeg.on("log",({message})=>{ffmpeg.__clipFactoryLogs.push(String(message));if(ffmpeg.__clipFactoryLogs.length>80)ffmpeg.__clipFactoryLogs.shift();});
 ffmpeg.on("progress",({progress})=>engineProgress("Processing video…",ffmpegProgressBase+Math.max(0,Math.min(1,Number(progress)||0))*ffmpegProgressSpan));
 const assetBase=window.location.origin+"/ffmpeg/";
 await ffmpeg.load({
  classWorkerURL:assetBase+"worker.js",
  coreURL:"https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
  wasmURL:"https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm"
 });
 state.ffmpeg=ffmpeg;return ffmpeg;
}
async function uploadMedia(file,projectId,kind){
 const init=await api("/media/upload/init",{method:"POST",body:JSON.stringify({file_name:file.name,file_size:file.size,content_type:file.type,project_id:projectId,kind})});
 const parts=[],chunkSize=16*1024*1024,totalParts=Math.ceil(file.size/chunkSize);
 try{
  for(let partNumber=1;partNumber<=totalParts;partNumber++){
   const start=(partNumber-1)*chunkSize,end=Math.min(file.size,start+chunkSize);
   const chunk=file.slice(start,end);
   engineProgress("Uploading "+file.name+" · part "+partNumber+"/"+totalParts,Math.min(14,5+(partNumber/totalParts)*9));
   const part=await api("/media/upload/"+init.upload_id+"/part?partNumber="+partNumber,{method:"PUT",body:chunk,headers:{"Content-Type":"application/octet-stream"}});
   parts.push({partNumber:part.part_number,etag:part.etag});
  }
  const completed=await api("/media/upload/"+init.upload_id+"/complete",{method:"POST",body:JSON.stringify({parts})});
  if(kind==="source"&&state.user?.role!=="admin")updatePoints(completed.balance,false);
  return completed;
 }catch(error){
  await api("/media/upload/"+init.upload_id+"/cancel",{method:"POST",body:"{}"}).catch(()=>{});
  await refresh().catch(()=>{});
  throw error;
 }
}
function videoFilter(){
 const dims=$("aspect").value==="9:16"?"1080:1920":$("aspect").value==="1:1"?"1080:1080":"1920:1080";
 return "scale="+dims+":force_original_aspect_ratio=increase,crop="+dims;
}
$("createBatch").onclick=async()=>{
 if(!state.files.length)return;
 if(!state.user){openAuth();toast("Sign in to process videos.");return}
 const files=[...state.files],workflow=$("workflow").value,aspect=$("aspect").value,clipSeconds=Number($("clipDuration").value);
 if(workflow==="subtitle"){toast("Auto subtitles are coming soon. Choose another workflow.");return}
 $("createBatch").disabled=true;$("engineResults").innerHTML="";
 try{
  engineProgress("Creating project…",1,true);
  const projectData=await api("/projects",{method:"POST",body:JSON.stringify({name:files.length+" video batch",kind:"Video processing",settings:{aspect,workflow,clipSeconds,fileNames:files.map(f=>f.name)}})});
  const project=projectData.project;state.projects.unshift(project);$("statProjects").textContent=state.projects.length;
  const ffmpeg=await getFFmpeg(),{fetchFile}=await import("https://esm.sh/@ffmpeg/util@0.12.2");
  const results=[];let completed=0,total=files.length;
  for(let fi=0;fi<files.length;fi++){
   const file=files[fi],base=file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,45)||"video";
   engineProgress("Uploading original "+(fi+1)+"/"+files.length+" · "+file.name,5+fi/files.length*10);
   await uploadMedia(file,project.id,"source");
   engineProgress("Upload complete · preparing "+file.name+" for processing…",15+fi/files.length*10);
   const input="input-"+fi+"-"+Date.now()+".mp4";
   const inputBytes=await fetchFile(file);
   engineProgress("Loading "+file.name+" into video engine…",16+fi/files.length*10);
   await ffmpeg.writeFile(input,inputBytes);
   engineProgress("Reading video duration…",17+fi/files.length*10);
   const video=document.createElement("video");video.preload="metadata";video.src=URL.createObjectURL(file);
   const duration=await new Promise(resolve=>{video.onloadedmetadata=()=>resolve(video.duration||0);video.onerror=()=>resolve(0)});
   URL.revokeObjectURL(video.src);
   if(!duration)throw new Error("Could not read video duration for "+file.name);
   const segments=workflow==="clips"?Math.ceil(duration/clipSeconds):1;total+=segments-1;
   for(let si=0;si<segments;si++){
    const offset=workflow==="clips"?si*clipSeconds:0,seconds=workflow==="clips"?Math.min(clipSeconds,duration-offset):duration;
    if(seconds<=0)continue;
    const output=base+(workflow==="clips"?"-clip-"+String(si+1).padStart(2,"0"):"-export")+".mp4";
    const args=["-ss",String(offset),"-i",input,"-t",String(seconds)];
    if(workflow==="resize"||workflow==="clips")args.push("-vf",videoFilter());
    const ffmpegOutput="./"+output;
    args.push("-c:v","libx264","-preset","ultrafast","-crf",workflow==="compress"?"30":"25","-c:a","aac","-b:a","128k","-movflags","+faststart",ffmpegOutput);
    ffmpegProgressBase=15+(completed/total)*75;ffmpegProgressSpan=75/total;
    engineProgress("Rendering "+output,ffmpegProgressBase);
    const code=await ffmpeg.exec(args);
    if(code!==0){const diagnostics=(ffmpeg.__clipFactoryLogs||[]).slice(-18).join("\n");throw new Error("FFmpeg exited with code "+code+" while rendering "+file.name+(diagnostics?"\n\nFFmpeg log:\n"+diagnostics:""));}
    const bytes=await ffmpeg.readFile(ffmpegOutput),blob=new Blob([bytes.buffer],{type:"video/mp4"});
    const exported=new File([blob],output,{type:"video/mp4"});
    engineProgress("Saving "+output+" to cloud storage…",15+((completed+0.7)/total)*75);
    const saved=await uploadMedia(exported,project.id,"export");
    results.push(saved.asset);await ffmpeg.deleteFile(ffmpegOutput);completed++;
   }
   await ffmpeg.deleteFile(input);
  }
  await api("/projects/"+encodeURIComponent(project.id)+"/complete",{method:"POST",body:"{}"});project.status="completed";
  state.files=[];$("fileList").innerHTML="";$("createBatch").disabled=true;
  $("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("");renderProjects();
  $("engineStatus").textContent="Completed · "+results.length+" export(s) saved";$("enginePercent").textContent="100%";$("engineProgressBar").style.width="100%";
  $("engineResults").innerHTML='<h3>Ready to download</h3>'+results.map(x=>'<div class="engine-result"><span>'+escapeHtml(x.file_name)+' <small>· '+(x.size_bytes/1048576).toFixed(1)+' MB</small></span><button class="admin-action" data-download="'+x.id+'" data-name="'+escapeHtml(x.file_name)+'">Download</button></div>').join("");
  toast("Video processing complete!");
 }catch(e){
  console.error("ClipFactory processing failed:",e);
  const detail = e instanceof Error ? (e.stack || e.message) : (typeof e === "string" ? e : JSON.stringify(e) || String(e));
  const message = e?.message || (typeof e === "string" ? e : "Unknown processing error");
  engineProgress("Stopped: "+message,0);
  toast(message);
  $("engineResults").innerHTML='<div class="notice">Processing error: '+escapeHtml(detail)+'</div>';
 }
 finally{$("createBatch").disabled=!state.files.length}
};
$("engineResults").onclick=async e=>{
 const b=e.target.closest("[data-download]");if(!b)return;
 try{
  const response=await fetch(apiBase()+"/api/media/"+b.dataset.download+"/download",{headers:{Authorization:"Bearer "+state.token}});
  if(!response.ok)throw new Error("Download failed");
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=b.dataset.name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }catch(err){toast(err.message)}
};
$("copyGrowth").onclick=async()=>{const content=$("growthOutput").innerText.trim();if(!content||content.startsWith("Your hooks"))return;try{await navigator.clipboard.writeText(content);toast("Growth ideas copied.")}catch(e){toast("Clipboard access was blocked by your browser.")}};
$("generateCopy").onclick=()=>{const topic=$("topic").value.trim();if(!topic){toast("Add a short description first.");return}const platform=$("platform").value,tone=$("tone").value;const clean=topic.replace(/[.!?]+$/,"");$("copyGrowth").disabled=false;$("growthOutput").innerHTML='<strong>HOOK IDEAS</strong><br>1. "You need to see this if you love '+escapeHtml(clean.toLowerCase())+'."<br>2. "I wish I knew this sooner…"<br>3. "Here’s the part nobody talks about."<br><br><strong>CAPTION STARTER</strong><br>'+escapeHtml(clean)+'. Save this for later and tell me what you think.<br><br><strong>HASHTAG IDEAS</strong><br>#'+clean.split(/\s+/).slice(0,2).map(x=>x.replace(/[^a-z0-9]/gi,"")).filter(Boolean).join("")+' #'+platform.replace(/\s+/g,"")+' #CreatorTips #ContentIdeas<br><br><small>Draft suggestions · '+tone+' tone · Review and tailor before posting.</small>'};
async function loadAdmin(tab){
 if(state.user?.role!=="admin")return;
 if(tab)state.adminTab=tab;
 document.querySelectorAll("[data-admin-tab]").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===state.adminTab));
 const root=$("adminContent");root.innerHTML='<div class="empty-state">Loading…</div>';
 try{
  if(state.adminTab==="overview"){
   const d=await api("/admin/stats");
   const revenue=(d.revenue||[]).map(x=>x.currency+" "+(x.amount/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})).join(" · ")||"—";
   root.innerHTML='<div class="admin-stats"><article class="admin-stat"><span>Total users</span><strong>'+fmt(d.users.total)+'</strong></article><article class="admin-stat"><span>Active users</span><strong>'+fmt(d.users.active)+'</strong></article><article class="admin-stat"><span>Suspended users</span><strong>'+fmt(d.users.suspended)+'</strong></article><article class="admin-stat"><span>Points in circulation</span><strong>'+fmt(d.points)+'</strong></article><article class="admin-stat"><span>Total projects</span><strong>'+fmt(d.projects)+'</strong></article></div><div class="notice">Payment management is paused. User accounts, points adjustments and activity logs remain available.</div>';
  }else if(state.adminTab==="users"){
   const d=await api("/admin/users");
   root.innerHTML='<div class="table-card">'+(d.users.length?d.users.map(u=>'<div class="admin-row"><span><strong>'+escapeHtml(u.name)+'</strong><br><small>'+escapeHtml(u.email)+'</small></span><span>'+fmt(u.points)+' pts</span><span><i class="admin-pill '+(u.status==="suspended"?"warn":"")+'">'+escapeHtml(u.status||"active")+'</i></span><span class="admin-actions"><button class="admin-action" data-adjust="'+u.id+'" data-email="'+escapeHtml(u.email)+'">Adjust points</button><button class="admin-action '+(u.status==="suspended"?"":"danger")+'" data-status="'+u.id+'" data-next="'+(u.status==="suspended"?"active":"suspended")+'">'+(u.status==="suspended"?"Activate":"Suspend")+'</button></span></div>').join(""):'<div class="empty-state">No users found.</div>')+'</div>';
   root.onclick=async e=>{const b=e.target.closest("[data-adjust],[data-status]");if(!b)return;try{if(b.dataset.adjust){const amount=prompt("Points adjustment for "+b.dataset.email+" (use negative number to deduct):","100");if(amount===null)return;const n=Number(amount);if(!Number.isInteger(n)||n===0){toast("Enter a non-zero whole number.");return}const description=prompt("Reason for this adjustment:","Admin points adjustment")||"Admin points adjustment";await api("/admin/users/"+b.dataset.adjust+"/points",{method:"POST",body:JSON.stringify({amount:n,description})});toast("Points updated.")}else{const next=b.dataset.next;if(!confirm((next==="suspended"?"Suspend":"Activate")+" this user?"))return;await api("/admin/users/"+b.dataset.status+"/status",{method:"POST",body:JSON.stringify({status:next})});toast("User status updated.")}loadAdmin("users")}catch(err){toast(err.message)}};
  }else if(state.adminTab==="topups"){
   const d=await api("/admin/topups");
   root.innerHTML='<div class="notice">Only approve a request after confirming the payment was received in your payment provider or bank account.</div><div class="table-card">'+(d.topups.length?d.topups.map(t=>'<div class="admin-row"><span><strong>'+escapeHtml(t.user_name)+'</strong><br><small>'+escapeHtml(t.email)+' · '+escapeHtml(t.reference)+'</small></span><span>'+fmt(t.points)+' pts</span><span>'+escapeHtml(t.currency)+' '+(t.amount_minor/100).toFixed(2)+'<br><i class="admin-pill '+(t.status==="pending"?"warn":"")+'">'+escapeHtml(t.status)+'</i></span><span class="admin-actions">'+(t.status==="pending"?'<button class="admin-action" data-approve="'+t.id+'">Approve</button><button class="admin-action danger" data-reject="'+t.id+'">Reject</button>':'<small>Reviewed '+escapeHtml(t.reviewed_at||"")+'</small>')+'</span></div>').join(""):'<div class="empty-state">No top-up requests yet.</div>')+'</div>';
   root.onclick=async e=>{const b=e.target.closest("[data-approve],[data-reject]");if(!b)return;const action=b.dataset.approve?"approve":"reject";if(action==="approve"&&!confirm("Confirm payment was received and credit these points?"))return;try{await api("/admin/topups/"+(b.dataset.approve||b.dataset.reject)+"/"+action,{method:"POST",body:"{}"});toast("Top-up "+action+"d.");loadAdmin("topups")}catch(err){toast(err.message)}};
  }else if(state.adminTab==="packages"){
   const d=await api("/admin/packages");
   root.innerHTML='<div class="admin-package-grid">'+d.packages.map(p=>'<article class="admin-package"><h3>'+escapeHtml(p.name)+' <small>· '+escapeHtml(p.code)+'</small></h3><strong>'+fmt(p.points)+' pts</strong><p>'+escapeHtml(p.currency)+' '+(p.price_minor/100).toFixed(2)+' · '+(p.active?"Visible to users":"Hidden from users")+'</p><button class="admin-action" data-package="'+escapeHtml(p.code)+'" data-name="'+escapeHtml(p.name)+'" data-points="'+p.points+'" data-price="'+(p.price_minor/100)+'" data-currency="'+escapeHtml(p.currency)+'" data-active="'+p.active+'">Edit package</button></article>').join("")+'</div>';
   root.onclick=async e=>{const b=e.target.closest("[data-package]");if(!b)return;const name=prompt("Package name:",b.dataset.name);if(name===null)return;const points=prompt("Points:",b.dataset.points);if(points===null)return;const price=prompt("Price in "+b.dataset.currency+" (e.g. 12.00):",b.dataset.price);if(price===null)return;const currency=prompt("Currency code:",b.dataset.currency);if(currency===null)return;const active=confirm("Keep this package visible to users? Choose Cancel to hide it.");try{await api("/admin/packages/"+b.dataset.package,{method:"POST",body:JSON.stringify({name,points:Number(points),price_minor:Math.round(Number(price)*100),currency,active})});toast("Package updated.");loadAdmin("packages")}catch(err){toast(err.message)}};
  }else if(state.adminTab==="activity"){
   const d=await api("/admin/audit");
   root.innerHTML='<div class="table-card">'+(d.entries.length?d.entries.map(x=>'<div class="admin-log"><strong>'+escapeHtml(x.action.replace(/_/g," "))+'</strong> · '+escapeHtml(x.admin_email)+(x.target_email?' → '+escapeHtml(x.target_email):'')+'<small>'+escapeHtml(x.details||"{}")+' · '+escapeHtml(x.created_at)+'</small></div>').join(""):'<div class="empty-state">No admin activity recorded yet.</div>')+'</div>';
  }
 }catch(e){root.innerHTML='<div class="notice">Could not load admin data: '+escapeHtml(e.message)+'</div>'}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-admin-tab]");if(b){e.preventDefault();loadAdmin(b.dataset.adminTab)}});
async function loadWallet(){if(!state.user){$("packageGrid").hidden=true;$("ledgerList").innerHTML='<div class="empty-state">Sign in to view your wallet and points history.</div>';return}try{const d=await api("/points");updatePoints(d.balance,d.unlimited);$("packageGrid").hidden=true;$("packageGrid").innerHTML="";if(d.unlimited){$("ledgerList").innerHTML='<div class="empty-state">Admin account · Unlimited points enabled.</div>';return}const l=await api("/points/ledger");$("ledgerList").innerHTML=l.entries.length?l.entries.map(x=>'<div class="project-row"><span>'+escapeHtml(x.description)+'</span><span>'+escapeHtml(x.type)+'</span><span>'+((x.amount>0?"+":"")+fmt(x.amount))+' pts</span><span>'+new Date(x.created_at).toLocaleDateString()+'</span></div>').join(""):"No wallet activity yet."}catch(e){toast(e.message)}}
$("topupForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/points/topups",{method:"POST",body:JSON.stringify({package_code:$("topupDialog").dataset.pack,note:$("paymentNote").value})});$("topupDialog").close();$("paymentNote").value="";toast("Top-up request created: "+d.topup.reference);loadWallet()}catch(err){toast(err.message)}};
async function testApiUrl(value){const status=$("apiConnectionStatus");if(!/^https:\/\//i.test(value)){status.textContent="Enter a valid HTTPS Worker URL.";status.classList.add("offline");return false}status.textContent="Testing API connection…";status.classList.remove("offline");try{const response=await fetch(value.replace(/\/$/,"")+"/api/health",{headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Health check failed");status.textContent="Connected · "+(data.service||"ClipFactory API")+" · "+(data.version||"healthy");return true}catch(err){status.textContent="Connection failed: "+err.message;status.classList.add("offline");return false}}$("testApi").onclick=async()=>{const value=$("apiUrl").value.trim().replace(/\/$/,"");await testApiUrl(value)};$("saveApi").onclick=async()=>{const value=$("apiUrl").value.trim().replace(/\/$/,"");if(!await testApiUrl(value)){toast("API URL was not saved. Fix the connection first.");return}localStorage.setItem("cf_api_url",value);toast("API URL saved. Reloading connection…");setTimeout(()=>location.reload(),500)};$("apiUrl").value=apiBase();$("adminReload").onclick=()=>loadAdmin(state.adminTab);
refresh().then(()=>{if(state.user)loadWallet()});
async function checkApiHealth(){const indicator=document.querySelector(".status-dot");if(!indicator)return;indicator.textContent="Checking API…";try{const response=await fetch(apiBase()+"/api/health");if(!response.ok)throw new Error("API unavailable");const data=await response.json();if(!data.ok)throw new Error("API unavailable");indicator.textContent="API connected";indicator.classList.remove("offline")}catch(e){indicator.textContent="API unavailable";indicator.classList.add("offline")}}
checkApiHealth();
