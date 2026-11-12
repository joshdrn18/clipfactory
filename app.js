const API_DEFAULT = "https://clipfactory-api.joshdrn18.workers.dev";
const state = { token: localStorage.getItem("cf_token") || "", user: null, points: 0, projects: [], files: [], packages: [], authMode: "login", adminTab:"overview", ffmpeg:null,subtitleCues:[],subtitleSourceFile:null,subtitleProjectId:null,subtitlePreviewUrl:null };
const $ = (id) => document.getElementById(id);
const apiBase = () => localStorage.getItem("cf_api_url") || API_DEFAULT;
async function api(path, options={}) {
  const {timeoutMs,...requestOptions}=options;
  const isForm = requestOptions.body instanceof FormData; const headers = { ...(isForm?{}:{"Content-Type":"application/json"}), ...(requestOptions.headers||{}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const controller=timeoutMs?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
   const response = await fetch(apiBase() + "/api" + path, { ...requestOptions, headers, ...(controller?{signal:controller.signal}:{}) });
   const data = await response.json().catch(()=>({error:"Invalid server response"}));
   if (!response.ok) throw new Error(data.error || "Request failed");
   return data;
  }catch(error){
   if(controller?.signal.aborted)throw new Error("Request timed out while "+path+". Check your connection and retry.");
   throw error;
  }finally{if(timer)clearTimeout(timer)}
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
function fmt(n){return Number(n||0).toLocaleString()}
function showView(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$("view-"+name)?.classList.add("active");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("crumbTitle").textContent=({overview:"Overview",projects:"My Projects",videos:"My Videos",bulk:"Bulk Upload",templates:"Viral Templates",growth:"Growth Tools",queue:"Processing Queue",exports:"Export Center",wallet:"Points Wallet",admin:"Admin Panel",settings:"Settings"})[name]||name;$("sidebar").classList.remove("open");if(name==="wallet")loadWallet();if(name==="projects")renderProjects();if(name==="videos")loadVideos();if(name==="queue")renderQueue();if(name==="exports")loadExportCenter();if(name==="admin")loadAdmin()}
document.addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)showView(b.dataset.view)});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
function setUser(user){state.user=user;$("adminNav").hidden=user?.role!=="admin";$("profileName").textContent=user?.name||"Guest creator";$("profileEmail").textContent=user?.email||"Sign in to sync";$("avatar").textContent=(user?.name||"G").slice(0,1).toUpperCase();$("topAvatar").textContent=$("avatar").textContent;$("authButton").textContent=user?"Account":"Sign in";$("settingsAccount").textContent=user?user.name+" · "+user.email:"You are browsing as a guest. Sign in to sync your workspace.";$("logoutButton").hidden=!user}
function updatePoints(n,unlimited=false){state.points=Number(n||0);const display=unlimited?"∞":fmt(state.points);$("sidePoints").innerHTML=display+' <small>pts</small>';$("statPoints").textContent=display;$("walletPoints").innerHTML=display+' <small>'+(unlimited?"unlimited":"pts")+'</small>';$("walletUnlimited")?.toggleAttribute("hidden",!unlimited);$("packageGrid")?.setAttribute("hidden","")}
async function refresh(){if(!state.token){setUser(null);updatePoints(0);$("statProjects").textContent="0";$("statExports").textContent="0";$("statQueue").textContent="—";return}try{const d=await api("/me");setUser(d.user);updatePoints(d.wallet?.balance,d.wallet?.unlimited||d.user?.role==="admin");state.projects=d.projects||[];$("statProjects").textContent=state.projects.length;renderProjects();$("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("")||"No projects yet — create your first batch.";try{const videos=await api("/videos");$("statExports").textContent=fmt(videos.count??videos.videos?.length??0)}catch(e){$("statExports").textContent="—"}$("statQueue").textContent="—";}catch(e){if(e.message==="Please sign in."){state.token="";localStorage.removeItem("cf_token");setUser(null)}$("statExports").textContent="—";toast(e.message||"Could not refresh workspace.")}}
function projectRow(p){const draft=String(p.status||"draft").toLowerCase()==="draft";const status=String(p.status||"Draft");const updated=p.updated_at||p.created_at;return '<div class="project-row"><span class="project-name-cell"><strong>'+escapeHtml(p.name||"Untitled project")+'</strong><small>'+escapeHtml(p.kind||"Video")+' · Created '+(p.created_at?new Date(p.created_at).toLocaleString(): "—")+'</small></span><span>'+escapeHtml(p.kind||"Video")+'</span><span><i class="status-pill">'+escapeHtml(status)+'</i></span><span>'+(updated?new Date(updated).toLocaleString(): "—")+(draft?' <button class="admin-action danger" data-delete-project="'+escapeHtml(p.id)+'" title="Delete draft project">Delete</button>':'')+'</span></div>'}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-delete-project]");if(!b)return;const id=b.dataset.deleteProject;const project=state.projects.find(p=>p.id===id);if(!project)return;if(String(project.status||"draft").toLowerCase()!=="draft"){toast("Only draft projects can be deleted.");return}if(!confirm('Delete draft project "'+project.name+'"? Its uploaded source files will be deleted, but finished videos stay in My Videos. Points already used will not be refunded.'))return;b.disabled=true;try{await api("/projects/"+encodeURIComponent(id),{method:"DELETE"});state.projects=state.projects.filter(p=>p.id!==id);$("statProjects").textContent=state.projects.length;$("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("")||"No projects yet — create your first batch.";renderProjects();toast("Draft project deleted.");}catch(err){b.disabled=false;toast(err.message||"Could not delete project.");}});
$("projectSearch")?.addEventListener("input",renderProjects);$("projectStatusFilter")?.addEventListener("change",renderProjects);$("projectSort")?.addEventListener("change",renderProjects);$("clearProjectFilters")?.addEventListener("click",()=>{$("projectSearch").value="";$("projectStatusFilter").value="all";$("projectSort").value="newest";renderProjects()});
function renderProjects(){const root=$("projectList");if(!state.user){root.innerHTML="Sign in to sync and manage your projects.";return}const q=($("projectSearch")?.value||"").trim().toLowerCase();const status=$("projectStatusFilter")?.value||"all";const sort=$("projectSort")?.value||"newest";let items=[...state.projects].filter(p=>{const haystack=((p.name||"")+" "+(p.kind||"")).toLowerCase();const s=String(p.status||"draft").toLowerCase();return (!q||haystack.includes(q))&&(status==="all"||s===status)});items.sort((x,y)=>{if(sort==="name")return String(x.name||"").localeCompare(String(y.name||""));const xd=new Date(sort==="updated"?(x.updated_at||x.created_at||0):(x.created_at||0)).getTime();const yd=new Date(sort==="updated"?(y.updated_at||y.created_at||0):(y.created_at||0)).getTime();return sort==="oldest"?xd-yd:yd-xd});$("projectResultCount").textContent=items.length+" of "+state.projects.length+" projects";root.innerHTML=items.length?'<div class="table-card"><div class="table-head project-table-head"><span>PROJECT</span><span>TYPE</span><span>STATUS</span><span>LAST UPDATED</span></div>'+items.map(projectRow).join("")+'</div>':(state.projects.length?'<div class="empty-state">No projects match these filters. Try another search or clear filters.</div>':'<div class="empty-state">No projects yet. Upload videos to start your first project.</div>')}
async function loadQueue(){
 const root=$("queueList");if(!state.user){root.innerHTML="Sign in to view your processing activity.";return}
 root.innerHTML='<div class="empty-state">Refreshing project status…</div>';
 try{const d=await api("/me");state.projects=d.projects||[];$("statProjects").textContent=state.projects.length;renderProjects();renderQueueList()}catch(e){root.innerHTML='<div class="notice">Could not refresh queue: '+escapeHtml(e.message)+'</div>'}
}
$("queueSearch")?.addEventListener("input",renderQueueList);$("queueStatusFilter")?.addEventListener("change",renderQueueList);
function renderQueue(){renderQueueList()}
function renderQueueList(){
 const root=$("queueList");if(!state.user){root.innerHTML="Sign in to view your processing activity.";return}
 const all=[...state.projects];const counts={draft:0,processing:0,completed:0,failed:0};all.forEach(p=>{const s=String(p.status||"draft").toLowerCase();if(Object.prototype.hasOwnProperty.call(counts,s))counts[s]++});
 $("queueMetrics").innerHTML='<article><span>ALL PROJECTS</span><strong>'+all.length+'</strong></article><article><span>IN PROGRESS</span><strong>'+counts.processing+'</strong></article><article><span>COMPLETED</span><strong>'+counts.completed+'</strong></article><article><span>NEEDS ATTENTION</span><strong>'+counts.failed+'</strong></article>';
 const q=($("queueSearch")?.value||"").trim().toLowerCase(),filter=$("queueStatusFilter")?.value||"all";const items=all.filter(p=>{const s=String(p.status||"draft").toLowerCase();return (!q||((p.name||"")+" "+(p.kind||"")).toLowerCase().includes(q))&&(filter==="all"||s===filter)}).sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
 if(!all.length){root.innerHTML='<div class="empty-state">No projects in the queue yet. Start in Bulk Upload to create your first video.</div>';return}
 if(!items.length){root.innerHTML='<div class="empty-state">No projects match this queue filter.</div>';return}
 root.innerHTML='<div class="table-card"><div class="table-head queue-table-head"><span>PROJECT</span><span>TYPE</span><span>STATUS</span><span>LAST UPDATED</span></div>'+items.map(p=>'<div class="project-row"><span><strong>'+escapeHtml(p.name||"Untitled project")+'</strong></span><span>'+escapeHtml(p.kind||"Video")+'</span><span><i class="status-pill">'+escapeHtml(p.status||"Draft")+'</i></span><span>'+(p.updated_at||p.created_at?new Date(p.updated_at||p.created_at).toLocaleString():"—")+'</span></div>').join("")+'</div>';
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
function activityDetailsText(raw){let data;try{data=typeof raw==="string"?JSON.parse(raw):raw}catch{return String(raw||"")};if(!data||typeof data!=="object"||Array.isArray(data))return String(raw||"");const labels={file_name:"File",size_bytes:"Size",kind:"Type",project_id:"Project",video_id:"Video",name:"Project name",method:"Method"};return Object.entries(data).filter(([,v])=>v!==null&&v!==undefined&&v!=="").map(([k,v])=>(labels[k]||k.replace(/_/g," ").replace(/^\w/,c=>c.toUpperCase()))+": "+(k==="size_bytes"?formatBytes(v):String(v))).join(" · ")||"No additional details"}
$("authButton").onclick=()=>state.user?showView("settings"):openAuth();
$("topAvatar").onclick=()=>state.user?showView("settings"):openAuth();
$("authToggle").onclick=(e)=>{e.preventDefault();state.authMode=state.authMode==="login"?"register":"login";$("authTitle").textContent=state.authMode==="login"?"Your creative workspace":"Create your account";$("authName").style.display=state.authMode==="register"?"block":"none";$("authName").required=state.authMode==="register";$("authToggle").textContent=state.authMode==="login"?"Need an account? Create one":"Already have an account? Sign in"};
function openAuth(){state.authMode="login";$("authName").style.display="none";$("authName").required=false;$("authTitle").textContent="Your creative workspace";$("authToggle").textContent="Need an account? Create one";$("authDialog").showModal()}
$("authForm").onsubmit=async e=>{e.preventDefault();const body={email:$("authEmail").value,password:$("authPassword").value,name:$("authName").value};try{const d=await api("/auth/"+state.authMode,{method:"POST",body:JSON.stringify(body)});state.token=d.token;localStorage.setItem("cf_token",d.token);$("authDialog").close();await refresh();toast("Welcome to ClipFactory!")}catch(err){toast(err.message)}};
$("logoutButton").onclick=async()=>{try{await api("/auth/logout",{method:"POST",body:"{}"})}catch(e){console.warn("Server logout could not be confirmed:",e.message)}state.token="";localStorage.removeItem("cf_token");state.projects=[];setUser(null);updatePoints(0);$("statProjects").textContent="0";$("statExports").textContent="0";$("statQueue").textContent="—";renderProjects();$("recentProjects").textContent="Sign in to see your recent projects.";toast("Signed out")};
const templates=[["Podcast punch","Turn a long conversation into a sharp, captioned highlight.","PODCAST","Podcast"],["Product spotlight","Show the value in the first three seconds.","PRODUCT","Product"],["Storytime hook","Open a story loop that makes viewers stay.","STORY","Story"],["Before / after","A visual transformation with a clear payoff.","TRANSFORM","Before / After"],["Quick tutorial","A clean step-by-step educational short.","HOW TO","Tutorial"],["Faceless facts","Pair concise facts with bold on-screen text.","FACTS","Faceless"]];
$("templateGrid").innerHTML=templates.map((t,i)=>'<article class="template-card"><div class="template-art">'+t[2]+'</div><div class="template-copy"><strong>'+t[0]+'</strong><p>'+t[1]+'</p><button class="text-button" data-template="'+i+'">Use template ↗</button></div></article>').join("");
$("templateGrid").onclick=e=>{const b=e.target.closest("[data-template]");if(!b)return;showView("bulk");$("workflow").value="clips";toast(templates[Number(b.dataset.template)][0]+" selected — upload footage to continue.")};
function uploadCost(file){return Math.ceil(file.size/(100*1024*1024))*10}
function renderSelectedFiles(){
 const totalBytes=state.files.reduce((n,f)=>n+f.size,0),totalCost=state.files.reduce((n,f)=>n+uploadCost(f),0);
 $("uploadSelectionSummary").textContent=state.files.length?state.files.length+" file(s) · "+(totalBytes/1048576).toFixed(1)+" MB total · "+(state.user?.role==="admin"?"Free":fmt(totalCost)+" points estimated"):"No files selected";
 $("fileList").innerHTML=state.files.map((f,i)=>'<div class="upload-file-card" data-upload-file="'+i+'"><div class="upload-file-top"><span class="upload-file-name">▣ '+escapeHtml(f.name)+'</span><span class="upload-file-size">'+(f.size/1048576).toFixed(1)+' MB</span><button type="button" class="admin-action danger" data-remove-file="'+i+'">Remove</button></div><div class="upload-file-progress"><span data-file-progress style="width:0%"></span></div><div class="upload-file-foot"><span data-file-status>Ready to upload</span><span data-file-percent>0%</span></div></div>').join("");
 $("clearFiles").hidden=!state.files.length;$("createBatch").disabled=!state.files.length;
}
function setUploadFileStatus(index,label,percent,tone){const row=$("fileList").querySelector('[data-upload-file="'+index+'"]');if(!row)return;row.querySelector("[data-file-status]").textContent=label;row.querySelector("[data-file-percent]").textContent=Math.round(percent)+"%";row.querySelector("[data-file-progress]").style.width=Math.max(0,Math.min(100,percent))+"%";row.dataset.state=tone||"active"}
function selectFiles(list){
 const incoming=Array.from(list),valid=incoming.filter(f=>/^video\/(mp4|quicktime|webm|x-matroska)$/.test(f.type)&&f.size<=500*1024*1024);
 const rejected=incoming.length-valid.length;if(rejected)toast(rejected+" file(s) skipped. Use MP4, MOV, WEBM or MKV up to 500 MB each.");
 state.files=[...state.files,...valid].filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i);
 renderSelectedFiles();
}
$("fileList").onclick=e=>{const b=e.target.closest("[data-remove-file]");if(!b)return;state.files.splice(Number(b.dataset.removeFile),1);selectFiles([])};
$("clearFiles").onclick=()=>{state.files=[];$("fileInput").value="";selectFiles([])};
$("fileInput").onchange=e=>selectFiles(e.target.files);
$("dropzone").ondragover=e=>{e.preventDefault();$("dropzone").style.borderColor="#a48aff"};
$("dropzone").ondragleave=()=>$("dropzone").style.borderColor="";
$("dropzone").ondrop=e=>{e.preventDefault();$("dropzone").style.borderColor="";selectFiles(e.dataTransfer.files)};
async function readVideoDuration(file,timeoutMs=15000){
 const url=URL.createObjectURL(file),video=document.createElement("video");
 video.preload="metadata";video.muted=true;video.playsInline=true;
 return await new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   video.onloadedmetadata=null;video.onerror=null;
   video.removeAttribute("src");video.load();
   URL.revokeObjectURL(url);
  };
  const timer=setTimeout(()=>{
   cleanup();
   reject(new Error("Timed out while reading video metadata. Try an MP4 (H.264/AAC) file or another video."));
  },timeoutMs);
  video.onloadedmetadata=()=>{
   const duration=Number(video.duration);
   cleanup();
   if(Number.isFinite(duration)&&duration>0)resolve(duration);
   else reject(new Error("Video duration is unavailable. Try converting the file to MP4 (H.264/AAC)."));
  };
  video.onerror=()=>{
   cleanup();
   reject(new Error("Your browser could not read this video's metadata. Try converting it to MP4 (H.264/AAC)."));
  };
  video.src=url;video.load();
 });
}
let engineProgressValue=0,ffmpegProgressBase=15,ffmpegProgressSpan=75;
function engineProgress(label,pct,reset=false,hint=""){if(reset)engineProgressValue=0;engineProgressValue=Math.max(engineProgressValue,Math.max(0,Math.min(100,Number(pct)||0)));$("engineProgress").hidden=false;$("engineStatus").textContent=label;$("enginePercent").textContent=Math.round(engineProgressValue)+"%";$("engineProgressBar").style.width=engineProgressValue+"%";const detail=$("engineHint");if(detail)detail.textContent=hint||"Your completed exports are saved automatically as each file finishes."}
async function getFFmpeg(){
 if(state.ffmpeg)return state.ffmpeg;
 engineProgress("Loading video engine…",2,false,"Preparing the browser-based FFmpeg engine. Keep this tab open while processing.");
 const {FFmpeg}=await Promise.race([import("https://esm.sh/@ffmpeg/ffmpeg@0.12.15"),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Video engine package did not load within 60 seconds. Check your connection and retry.")),60000))]);
 const ffmpeg=new FFmpeg();
 ffmpeg.__clipFactoryLogs=[];
 ffmpeg.on("log",({message})=>{ffmpeg.__lastProgressAt=Date.now();ffmpeg.__clipFactoryLogs.push(String(message));if(ffmpeg.__clipFactoryLogs.length>80)ffmpeg.__clipFactoryLogs.shift();});
 ffmpeg.__lastProgressAt=Date.now();ffmpeg.__operationLabel="Rendering video";
 ffmpeg.on("progress",({progress})=>{ffmpeg.__lastProgressAt=Date.now();engineProgress(ffmpeg.__operationLabel,ffmpegProgressBase+Math.max(0,Math.min(1,Number(progress)||0))*ffmpegProgressSpan,false,"FFmpeg is actively processing. Progress can pause briefly on complex video frames.")});
 const assetBase=window.location.origin+"/ffmpeg/";
 let loadTimer;
 try{
  await Promise.race([
   ffmpeg.load({
    classWorkerURL:assetBase+"worker.js",
    coreURL:"https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
    wasmURL:"https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm"
   }),
   new Promise((_,reject)=>{loadTimer=setTimeout(()=>{
    try{ffmpeg.terminate()}catch(e){}
    reject(new Error("Video engine could not finish loading within 2 minutes. Check your connection and retry."));
   },2*60*1000)})
  ]);
 }finally{clearTimeout(loadTimer)}
 state.ffmpeg=ffmpeg;return ffmpeg;
}
async function execFFmpegWithTimeout(ffmpeg,args,timeoutMs=30*60*1000,stallTimeoutMs=8*60*1000){
 let timer,watchdog;
 ffmpeg.__lastProgressAt=Date.now();
 const stopEngine=()=>{try{ffmpeg.terminate()}catch(e){}if(state.ffmpeg===ffmpeg)state.ffmpeg=null;};
 try{
  return await Promise.race([
   ffmpeg.exec(args),
   new Promise((_,reject)=>{timer=setTimeout(()=>{stopEngine();reject(new Error("Render exceeded the 30-minute safety limit. The video engine was reset; retry this file or use a shorter clip."))},timeoutMs)}),
   new Promise((_,reject)=>{watchdog=setInterval(()=>{if(Date.now()-(ffmpeg.__lastProgressAt||Date.now())>stallTimeoutMs){clearInterval(watchdog);stopEngine();reject(new Error("Render stopped responding for 8 minutes. The video engine was reset; retry this file or use a shorter clip."))}},15000)})
  ]);
 }finally{clearTimeout(timer);clearInterval(watchdog)}
}
async function uploadMedia(file,projectId,kind,forceBackup=false,onProgress){
  const init=await api("/media/upload/init",{method:"POST",timeoutMs:60000,body:JSON.stringify({file_name:file.name,file_size:file.size,content_type:file.type,project_id:projectId,kind,force_backup:forceBackup})});
  const parts=[],chunkSize=16*1024*1024,totalParts=Math.ceil(file.size/chunkSize);
  try{
   for(let partNumber=1;partNumber<=totalParts;partNumber++){
    const start=(partNumber-1)*chunkSize,end=Math.min(file.size,start+chunkSize);
    const chunk=file.slice(start,end);
    engineProgress("Uploading "+file.name+" · part "+partNumber+"/"+totalParts,Math.min(14,5+(partNumber/totalParts)*9));
    const part=await api("/media/upload/"+init.upload_id+"/part?partNumber="+partNumber,{method:"PUT",timeoutMs:120000,body:chunk,headers:{"Content-Type":"application/octet-stream"}});
    parts.push({partNumber:part.part_number,etag:part.etag});if(onProgress)onProgress(Math.round(partNumber/totalParts*100),"Uploading chunk "+partNumber+"/"+totalParts);
   }
   let completed;
   try{
    completed=await api("/media/upload/"+init.upload_id+"/complete",{method:"POST",timeoutMs:90000,body:JSON.stringify({parts})});
   }catch(completeError){
    const listing=await api("/media?project_id="+encodeURIComponent(projectId));
    const recovered=(listing.assets||[]).find(asset=>asset.kind===kind&&asset.file_name===file.name&&Number(asset.size_bytes)===file.size);
    if(!recovered)throw completeError;
    completed={asset:recovered,balance:null,recovered:true};
    await refresh().catch(()=>{});
   }
   if(kind==="source"&&state.user?.role!=="admin"&&completed.balance!==null&&completed.balance!==undefined)updatePoints(completed.balance,false);
   return completed;
  }catch(error){
   await api("/media/upload/"+init.upload_id+"/cancel",{method:"POST",timeoutMs:20000,body:"{}"}).catch(()=>{});
   await refresh().catch(()=>{});
   if(!forceBackup&&init.storage==="primary"){
    engineProgress("Primary storage unavailable. Retrying on backup storage…",5,false);
    return uploadMedia(file,projectId,kind,true,onProgress);
   }
   throw error;
  }
 }
function videoFilterArgs(aspect){
 const dims=aspect==="9:16"?"1080:1920":aspect==="1:1"?"1080:1080":"1920:1080";
 if(aspect==="9:16"){
  // Keep the complete source frame readable; use a blurred, cropped copy as the canvas fill.
  return ["-filter_complex","[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bgblur];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgfit];[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]","-map","[v]","-map","0:a?"];
 }
 return ["-vf","scale="+dims+":force_original_aspect_ratio=increase,crop="+dims,"-map","0:v:0","-map","0:a?"];
}
function parseVttTime(value){
 const parts=String(value||"").trim().replace(",",".").split(":").map(Number);
 if(parts.some(n=>!Number.isFinite(n)))return 0;
 return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts.length===2?parts[0]*60+parts[1]:0;
}
function parseSubtitleVtt(vtt,offset=0){
 const cues=[];
 for(const block of String(vtt||"").replace(/\r/g,"").split(/\n\s*\n/)){
  const lines=block.split("\n").map(x=>x.trim()).filter(Boolean),ti=lines.findIndex(x=>x.includes("-->"));
  if(ti<0)continue;
  const match=lines[ti].match(/(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})/);
  if(!match)continue;
  const text=lines.slice(ti+1).join(" ").trim();
  if(!text)continue;
  cues.push({start:Math.max(0,parseVttTime(match[1])+offset),end:Math.max(0,parseVttTime(match[2])+offset),text});
 }
 return cues;
}
function cleanSubtitleText(value){
 return String(value||"").replace(/<[^>]*>/g," ").replace(/\\N/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g," ").replace(/\s+/g," ").trim();
}
function normalizeSubtitleCues(input,duration=Infinity){
 const output=[];
 for(const raw of (input||[])){
  const text=cleanSubtitleText(raw.text),start=Math.max(0,Number(raw.start)||0),end=Math.min(duration,Math.max(start+.2,Number(raw.end)||start+.2));
  if(!text||end<=start)continue;
  const words=text.split(" "),parts=[];let line="";
  for(const word of words){
   const candidate=line?line+" "+word:word;
   if(line&&(candidate.length>38||line.split(" ").length>=7)){parts.push(line);line=word}else line=candidate;
  }
  if(line)parts.push(line);
  const span=end-start,weights=parts.map(part=>Math.max(1,part.split(" ").length)),total=weights.reduce((a,b)=>a+b,0);
  let cursor=start;
  parts.forEach((part,index)=>{
   const partEnd=index===parts.length-1?end:cursor+span*weights[index]/total;
   output.push({start:cursor,end:Math.max(cursor+.05,partEnd),text:part});
   cursor=partEnd;
  });
 }
 output.sort((a,b)=>a.start-b.start||a.end-b.end);
 // Rebuild a strictly ordered timeline. If Whisper segments overlap, preserve
 // their wording and move the later caption after the previous caption.
 const clean=[];
 for(const cue of output){
  let start=Math.max(0,Number(cue.start)||0),end=Math.max(start+.05,Number(cue.end)||start+.05);
  const previous=clean[clean.length-1];
  if(previous&&start<previous.end)start=previous.end;
  if(Number.isFinite(duration)){
   if(start>=duration)continue;
   end=Math.min(duration,Math.max(start+.05,end));
  }
  if(end>start)clean.push({start,end,text:cue.text});
 }
 return clean;
}
function formatVttTime(seconds){
 const ms=Math.max(0,Math.round(Number(seconds||0)*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),r=ms%1000;
 return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")+"."+String(r).padStart(3,"0");
}
function subtitleVtt(){
 return "WEBVTT\n\n"+(state.subtitleCues||[]).map(c=>formatVttTime(c.start)+" --> "+formatVttTime(c.end)+"\n"+String(c.text||"").replace(/[\r\n]+/g," ").trim()).join("\n\n")+"\n";
}
function subtitleSrt(){
 return (state.subtitleCues||[]).map((c,i)=>String(i+1)+"\n"+formatVttTime(c.start).replace(".",",")+" --> "+formatVttTime(c.end).replace(".",",")+"\n"+String(c.text||"").replace(/[\r\n]+/g," ").trim()).join("\n\n")+"\n";
}
function renderSubtitleEditor(){
 const panel=$("subtitleEditor");if(!panel)return;
 const cues=state.subtitleCues||[];
 panel.hidden=!cues.length;
 if(!cues.length)return;
 panel.innerHTML='<div class="subtitle-editor-head"><div><strong>Subtitle editor</strong><small>'+cues.length+' timed captions · '+escapeHtml(state.subtitleFileName||"Video")+'</small></div><div class="subtitle-downloads"><button class="btn btn-ghost" id="downloadVtt">Download VTT</button><button class="btn btn-ghost" id="downloadSrt">Download SRT</button></div></div><div class="subtitle-render-settings"><label>Subtitle position<select id="subtitlePosition"><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select></label><label>Text size<select id="subtitleSize"><option value="small">Small</option><option value="medium" selected>Medium</option><option value="large">Large</option></select></label><label>Text color<select id="subtitleColor"><option value="#ffffff">White</option><option value="#ffe45c">Yellow</option><option value="#70e1ff">Cyan</option></select></label><label>Background<select id="subtitleBackground"><option value="outline">Black outline</option><option value="box">Dark box</option><option value="none">No background</option></select></label></div><div class="subtitle-preview-wrap"><div class="subtitle-preview-heading"><strong>Live preview</strong><small>Play or seek the video to check caption timing</small></div><div class="subtitle-preview-stage"><video id="subtitlePreviewVideo" controls playsinline preload="metadata"></video><canvas id="subtitlePreviewCanvas" aria-hidden="true"></canvas></div></div><button class="btn btn-primary subtitle-burn-button" id="burnSubtitles">Burn subtitles into MP4 →</button><small class="subtitle-note">The edited captions and selected appearance will be rendered into a new MP4 and saved to My Videos.</small><div class="subtitle-cue-list">'+cues.map((c,i)=>'<article class="subtitle-cue" data-cue="'+i+'"><div class="subtitle-cue-times"><label>Start (sec)<input type="number" min="0" step="0.05" data-cue-start="'+i+'" value="'+Number(c.start).toFixed(2)+'"></label><label>End (sec)<input type="number" min="0" step="0.05" data-cue-end="'+i+'" value="'+Number(c.end).toFixed(2)+'"></label></div><label class="subtitle-cue-text">Caption<textarea rows="2" data-cue-text="'+i+'">'+escapeHtml(c.text)+'</textarea></label></article>').join("")+'</div>';
 if(state.subtitlePreviewUrl)URL.revokeObjectURL(state.subtitlePreviewUrl);
 state.subtitlePreviewUrl=URL.createObjectURL(state.subtitleSourceFile);
 const previewVideo=$("subtitlePreviewVideo"),previewCanvas=$("subtitlePreviewCanvas"),previewCtx=previewCanvas.getContext("2d");
 previewVideo.src=state.subtitlePreviewUrl;
 const readSettings=()=>({position:$("subtitlePosition").value,size:$("subtitleSize").value,color:$("subtitleColor").value,background:$("subtitleBackground").value});
 const paintPreview=()=>{
  if(!previewVideo.videoWidth||!previewVideo.videoHeight)return;
  const ratio=Math.min(1,1280/Math.max(previewVideo.videoWidth,previewVideo.videoHeight));
  const width=Math.max(2,Math.round(previewVideo.videoWidth*ratio)),height=Math.max(2,Math.round(previewVideo.videoHeight*ratio));
  if(previewCanvas.width!==width||previewCanvas.height!==height){previewCanvas.width=width;previewCanvas.height=height}
  const now=previewVideo.currentTime,cue=state.subtitleCues.find(item=>now>=item.start&&now<=item.end);
  previewCtx.clearRect(0,0,width,height);
  drawSubtitleFrame(previewCtx,null,width,height,cue,readSettings());
 };
 previewVideo.addEventListener("loadedmetadata",paintPreview);
 previewVideo.addEventListener("timeupdate",paintPreview);
 previewVideo.addEventListener("seeked",paintPreview);
 previewVideo.addEventListener("play",paintPreview);
 ["subtitlePosition","subtitleSize","subtitleColor","subtitleBackground"].forEach(id=>$(id).addEventListener("change",paintPreview));
 let previewRaf=0;
 const previewLoop=()=>{paintPreview();if(!previewVideo.paused&&!previewVideo.ended)previewRaf=requestAnimationFrame(previewLoop)};
 const startPreviewLoop=()=>{cancelAnimationFrame(previewRaf);previewLoop()};
 const stopPreviewLoop=()=>{cancelAnimationFrame(previewRaf);paintPreview()};
 previewVideo.addEventListener("play",startPreviewLoop);
 previewVideo.addEventListener("pause",stopPreviewLoop);
 previewVideo.addEventListener("ended",stopPreviewLoop);
 $("burnSubtitles").onclick=burnSubtitleExport;
 panel.querySelectorAll("[data-cue-start],[data-cue-end],[data-cue-text]").forEach(el=>el.addEventListener("input",()=>{
  const i=Number(el.dataset.cueStart??el.dataset.cueEnd??el.dataset.cueText),cue=state.subtitleCues[i];if(!cue)return;
  if(el.hasAttribute("data-cue-start")){
   cue.start=Math.max(0,Number(el.value)||0);
   if(cue.end<=cue.start){cue.end=cue.start+.2;const endField=panel.querySelector('[data-cue-end="'+i+'"]');if(endField)endField.value=cue.end.toFixed(2)}
  }else if(el.hasAttribute("data-cue-end")){
   cue.end=Math.max(cue.start+.2,Number(el.value)||0);el.value=cue.end.toFixed(2);
  }else cue.text=el.value;
  paintPreview();
 }));
 const download=(content,name,type)=>{const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $("downloadVtt").onclick=()=>download(subtitleVtt(),(state.subtitleFileName||"captions").replace(/\.[^.]+$/,"")+".vtt","text/vtt;charset=utf-8");
 $("downloadSrt").onclick=()=>download(subtitleSrt(),(state.subtitleFileName||"captions").replace(/\.[^.]+$/,"")+".srt","application/x-subrip;charset=utf-8");
}
async function transcribeAudio(form,timeoutMs=180000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch("https://clipfactory-transcribe.joshdrn18.workers.dev/transcribe",{method:"POST",headers:{Authorization:"Bearer "+state.token},body:form,signal:controller.signal});
  const data=await response.json().catch(()=>({error:"Invalid transcription response"}));
  if(!response.ok)throw new Error(data.error||"Speech recognition failed.");
  return data;
 }catch(error){if(controller.signal.aborted)throw new Error("Speech recognition timed out. Retry this audio segment.");throw error}
 finally{clearTimeout(timer)}
}
function drawSubtitleFrame(ctx,video,width,height,cue,settings){
 if(video)ctx.drawImage(video,0,0,width,height);
 if(!cue||!cue.text)return;
 let fontSize=(settings.size==="small"?34:settings.size==="large"?58:44)*(width/1080);
 ctx.save();ctx.font="800 "+fontSize+"px Arial, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
 const maxWidth=width*.88,words=cleanSubtitleText(cue.text).split(/\s+/),lines=[];let line="";
 for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}
 if(line)lines.push(line);
 while(lines.length>2&&fontSize>18){fontSize*=.9;ctx.font="800 "+fontSize+"px Arial, sans-serif";lines.length=0;line="";for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line)}
 if(lines.length>3){while(lines.length>3){const tail=lines.splice(2).join(" ");lines.push(tail)}}
 const lineHeight=fontSize*1.2,pad=fontSize*.34,totalHeight=lines.length*lineHeight;
 let centerY=settings.position==="top"?height*.16+totalHeight/2:settings.position==="center"?height*.5:height*.82-totalHeight/2;
 const color=settings.color;
 if(settings.background==="box"){
  const maxLine=Math.max(...lines.map(x=>ctx.measureText(x).width));
  ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect((width-maxLine)/2-pad,centerY-totalHeight/2-pad,maxLine+pad*2,totalHeight+pad*2);
 }
 lines.forEach((text,index)=>{const y=centerY-totalHeight/2+lineHeight*(index+.5);
  if(settings.background==="outline"){ctx.lineJoin="round";ctx.strokeStyle="rgba(0,0,0,.96)";ctx.lineWidth=Math.max(4,fontSize*.16);ctx.strokeText(text,width/2,y,maxWidth)}
  ctx.fillStyle=color;ctx.fillText(text,width/2,y,maxWidth);
 });
 ctx.restore();
}
async function recordBurnedSubtitleVideo(file,cues,settings,onProgress){
 const video=document.createElement("video"),url=URL.createObjectURL(file),canvas=document.createElement("canvas");
 let canvasStream=null,sourceStream=null,recorder=null,raf=0,videoFrame=0,playbackTimer=0;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx){URL.revokeObjectURL(url);throw new Error("This browser could not create a video render canvas.")}
 const stopTracks=()=>{
  if(canvasStream)canvasStream.getTracks().forEach(track=>track.stop());
  if(sourceStream)sourceStream.getTracks().forEach(track=>track.stop());
  if(videoFrame&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrame);
  if(raf)cancelAnimationFrame(raf);
  if(playbackTimer)clearTimeout(playbackTimer);
  video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);
 };
 const waitFor=(target,event,timeoutMs,message)=>{
  if(event==="loadedmetadata"&&target.readyState>=1)return Promise.resolve();
  if(event==="canplay"&&target.readyState>=3)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(new Error(message))},timeoutMs);
   const cleanup=()=>{clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener("error",failed)};
   const done=()=>{cleanup();resolve()};
   const failed=()=>{cleanup();reject(new Error(message))};
   target.addEventListener(event,done,{once:true});target.addEventListener("error",failed,{once:true});
  });
 };
 try{
  video.src=url;video.muted=false;video.volume=1;video.playsInline=true;video.preload="auto";video.load();
  await waitFor(video,"loadedmetadata",60000,"The source video metadata could not be loaded. Try re-exporting it as MP4.");
  if(!video.videoWidth||!video.videoHeight||!Number.isFinite(video.duration))throw new Error("The source video has invalid dimensions or duration.");
  const ratio=Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(2,Math.round(video.videoWidth*ratio/2)*2);
  canvas.height=Math.max(2,Math.round(video.videoHeight*ratio/2)*2);
  await waitFor(video,"canplay",60000,"The source video could not start decoding. Try another MP4 export.");
  canvasStream=canvas.captureStream(30);
  sourceStream=video.captureStream?video.captureStream():video.mozCaptureStream?.();
  if(!sourceStream)throw new Error("This browser cannot capture the source video. Use the latest Chrome or Edge.");
  const sourceAudioTracks=sourceStream.getAudioTracks();
  sourceAudioTracks.forEach(track=>canvasStream.addTrack(track));
  if(typeof MediaRecorder==="undefined"||typeof MediaRecorder.isTypeSupported!=="function")throw new Error("This browser does not support video recording. Use the latest Chrome or Edge.");
  const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime)throw new Error("No supported browser recording format was found.");
  recorder=new MediaRecorder(canvasStream,{mimeType:mime,videoBitsPerSecond:Math.min(8000000,Math.max(2500000,canvas.width*canvas.height*3))});
  const chunks=[];
  let rejectRecording;
  const recordingFailure=new Promise((_,reject)=>{rejectRecording=reject});
  const result=new Promise(resolve=>{
   recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
   recorder.onerror=()=>rejectRecording(new Error("Browser recording failed while burning subtitles."));
   recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));
  });
  recordingFailure.catch(()=>{});
  const paint=()=>{
   videoFrame=0;raf=0;
   const now=video.currentTime,cue=cues.find(item=>now>=item.start&&now<item.end);
   drawSubtitleFrame(ctx,video,canvas.width,canvas.height,cue,settings);
   onProgress?.(Math.min(92,video.duration?now/video.duration*92:0),now,video.duration);
   if(!video.paused&&!video.ended){
    if(video.requestVideoFrameCallback)videoFrame=video.requestVideoFrameCallback(paint);
    else raf=requestAnimationFrame(paint);
   }
  };
  if(video.currentTime!==0){video.currentTime=0;await waitFor(video,"seeked",15000,"Could not seek to the beginning of the source video.");}
  const playbackEnded=new Promise((resolve,reject)=>{
   video.addEventListener("ended",resolve,{once:true});
   video.addEventListener("pause",()=>{if(!video.ended&&recorder.state==="recording")reject(new Error("Video playback paused unexpectedly. Keep this tab active and do not pause during rendering."))});
   playbackTimer=setTimeout(()=>reject(new Error("Subtitle rendering exceeded the expected playback time. Keep the tab active and retry.")),Math.max(120000,video.duration*1000+120000));
  });
  recorder.start(1000);
  await video.play();
  paint();
  await Promise.race([playbackEnded,recordingFailure]);
  if(recorder.state==="recording")recorder.stop();
  const blob=await result;
  if(!blob.size)throw new Error("Subtitle render produced an empty recording.");
  return {blob,audioTrackCount:sourceAudioTracks.length};
 }catch(error){
  if(recorder&&recorder.state==="recording"){try{recorder.stop()}catch(e){}}
  throw error;
 }finally{stopTracks()}
}
function validateSubtitleCuesForRender(cues,duration=Infinity){
 const ordered=[...(cues||[])].sort((a,b)=>Number(a.start)-Number(b.start));
 for(let i=0;i<ordered.length;i++){
  const cue=ordered[i],start=Number(cue.start),end=Number(cue.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||!String(cue.text||"").trim())throw new Error("Caption "+(i+1)+" has invalid timing or empty text. Check its start, end, and wording.");
  if(i&&start<Number(ordered[i-1].end)-.02)throw new Error("Captions "+i+" and "+(i+1)+" overlap. Adjust their timestamps before rendering.");
  if(Number.isFinite(duration)&&end>duration+.05)throw new Error("Caption "+(i+1)+" ends after the video. Adjust its end time before rendering.");
 }
}
async function burnSubtitleExport(){
 const file=state.subtitleSourceFile,cues=state.subtitleCues||[];
 if(!file||!state.subtitleProjectId||!cues.length){toast("Generate subtitles first.");return}
 try{validateSubtitleCuesForRender(cues,Number(state.subtitleDuration)||Infinity)}catch(error){toast(error.message);return}
 const button=$("burnSubtitles");button.disabled=true;
 let ffmpeg=null,tempInput="",tempOutput="";
 try{
  const settings={position:$("subtitlePosition").value,size:$("subtitleSize").value,color:$("subtitleColor").value,background:$("subtitleBackground").value};
  engineProgress("Rendering subtitles into video…",0,true,"Keep this tab active. The browser will play the video once while drawing captions.");
  const recording=await recordBurnedSubtitleVideo(file,cues,settings,(pct,now,total)=>engineProgress("Burning subtitles · "+Math.floor(now)+"s / "+Math.floor(total)+"s",pct,false,"Captions are being drawn into every video frame."));
  const blob=recording.blob;
  if(!blob||blob.size<1024)throw new Error("Subtitle render produced an empty recording.");
  const webmHeader=new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if(webmHeader[0]!==0x1a||webmHeader[1]!==0x45||webmHeader[2]!==0xdf||webmHeader[3]!==0xa3)throw new Error("Browser recording is not a valid WebM video. Retry in the latest Chrome or Edge.");
  engineProgress("Encoding MP4…",93,false,recording.audioTrackCount?"Video and "+recording.audioTrackCount+" audio track(s) will be encoded into MP4.":"No audio track was detected in the source recording; the exported MP4 will be silent.");
  ffmpeg=await getFFmpeg();
  const inputBytes=new Uint8Array(await blob.arrayBuffer());
  tempInput="./subtitle-burn-"+Date.now()+".webm";tempOutput="./"+file.name.replace(/\.[^.]+$/,"")+"_subtitled.mp4";
  await ffmpeg.writeFile(tempInput,inputBytes);
  const code=await execFFmpegWithTimeout(ffmpeg,["-i",tempInput,"-map","0:v:0","-map","0:a?","-c:v","libx264","-preset","ultrafast","-crf","25","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-movflags","+faststart",tempOutput],30*60*1000,8*60*1000);
  if(code!==0)throw new Error("MP4 encoding failed. Check FFmpeg logs and retry.");
  if(recording.audioTrackCount>0&&!ffmpeg.__clipFactoryLogs.some(line=>/Audio:\\s*aac/i.test(line)))throw new Error("The source audio track was detected, but the MP4 encoder did not report an AAC audio stream. The export was stopped to avoid saving a silent video.");
  const bytes=await ffmpeg.readFile(tempOutput);
  if(!bytes||bytes.byteLength<1024||String.fromCharCode(...bytes.slice(4,8))!=="ftyp")throw new Error("The MP4 encoder returned an invalid or incomplete file. Retry the render.");
  const exported=new File([bytes],file.name.replace(/\.[^.]+$/,"")+"_subtitled.mp4",{type:"video/mp4"});
  engineProgress("Saving subtitled MP4…",96,false,"Uploading the rendered video to your ClipFactory storage.");
  const saved=await uploadMedia(exported,state.subtitleProjectId,"export");
  await api("/projects/"+encodeURIComponent(state.subtitleProjectId)+"/complete",{method:"POST",body:"{}"}).catch(()=>{});
  engineProgress("Subtitled video saved",100,false,"Your new MP4 is available in My Videos.");
  toast("Subtitled MP4 saved to My Videos.");
  await refresh().catch(()=>{});
  showView("videos");
 }catch(error){engineProgress("Subtitle render failed",engineProgressValue,false,error.message||"Retry the render.");toast(error.message||"Subtitle render failed.");}
 finally{
  if(ffmpeg){for(const name of [tempInput,tempOutput])if(name){try{await ffmpeg.deleteFile(name)}catch(e){}}}
  button.disabled=false;
 }
}
function scoreHighlightText(text){
 const value=String(text||"").toLowerCase(),words=value.match(/[a-z0-9']+/g)||[];
 if(words.length<5)return 0;
 let score=Math.min(words.length,28)*0.35;
 const patterns=[
  [/\b(why|how|what if|here's why|the reason)\b/g,2.5],
  [/\b(secret|mistake|truth|shocking|surprising|never|always|actually|finally)\b/g,2],
  [/\b(but|however|until|instead|because|so|therefore)\b/g,1.2],
  [/\b(number one|first|second|top|best|worst|biggest|fastest)\b/g,1.5],
  [/\b(imagine|remember|listen|watch|look|wait)\b/g,1.5],
  [/\b(amazing|incredible|crazy|insane|important|powerful|beautiful|terrible)\b/g,1.1]
 ];
 for(const [pattern,weight] of patterns)score+=(value.match(pattern)||[]).length*weight;
 if(/[?!]/.test(text))score+=1.5;
 if(/\d/.test(text))score+=1;
 if(words.length<9)score-=1;
 return score;
}
function nearestCueBoundary(cues,target,field,limit){
 let best=target,distance=limit;
 for(const cue of cues){
  const value=Number(cue[field]);
  if(!Number.isFinite(value))continue;
  const delta=Math.abs(value-target);
  if(delta<distance){best=value;distance=delta;}
 }
 return best;
}
function makeHighlightTitle(cues){
 const ranked=cues.map(cue=>({text:String(cue.text||"").replace(/\\s+/g," ").trim(),score:scoreHighlightText(cue.text)})).filter(x=>x.text.length>=18).sort((a,b)=>b.score-a.score);
 let source=ranked[0]?.text||cues.map(x=>x.text).join(" ");
 source=source.replace(/^(and|but|so|because|then|uh|um)\\s+/i,"").replace(/[.!?]+$/,"").trim();
 const words=source.split(/\\s+/).filter(Boolean);
 let title=words.slice(0,9).join(" ");
 if(title.length>62){title=title.slice(0,59).replace(/\\s+\\S*$/,"")+"…";}
 if(title.length<12)title="Highlight moment";
 return title.charAt(0).toUpperCase()+title.slice(1);
}
function buildShortsMetadata(transcript){
 const clean=String(transcript||"").replace(/<[^>]*>/g," ").replace(/&(?:amp|lt|gt|quot|#39);/g," ").replace(/\s+/g," ").trim();
 const sentences=(clean.match(/[^.!?]+[.!?]?/g)||[]).map(x=>x.trim()).filter(x=>x.length>=18);
 const ranked=sentences.map(text=>({text,score:scoreHighlightText(text)})).sort((a,b)=>b.score-a.score);
 let title=(ranked[0]?.text||clean).replace(/^[,;:—–-]+/,"").trim().replace(/[.!?]+$/,"");
 if(title.length>88)title=title.slice(0,85).replace(/\s+\S*$/,"")+"…";
 if(title.length<10)title="Interesting moment from this video";
 title=title.charAt(0).toUpperCase()+title.slice(1);
 const caption=(sentences.slice(0,2).join(" ")||clean).slice(0,420).trim();
 const stop=new Set(["about","after","again","also","because","before","being","could","does","doing","during","from","have","here","into","just","like","more","most","only","other","over","really","said","some","such","than","that","their","them","then","there","these","they","this","those","through","very","what","when","where","which","while","with","would","your","you","the","and","for","are","was","were","has","had","but","not","its","can","will","our","out","get","got"]);
 const counts=new Map();
 for(const word of clean.toLowerCase().match(/[a-z][a-z0-9]{3,}/g)||[]){if(stop.has(word))continue;counts.set(word,(counts.get(word)||0)+1);}
 const tags=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([word])=>"#"+word.replace(/[^a-z0-9]/g,""));
 return {title,caption,hashtags:[...new Set(["#Shorts",...tags])].join(" ")};
}
function measureSilenceRanges(wavBytes,offset,duration){
 const bytes=wavBytes instanceof Uint8Array?wavBytes:new Uint8Array(wavBytes);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let dataOffset=12,dataLength=0,sampleRate=16000,channels=1,bits=16;
 while(dataOffset+8<=bytes.length){
  const id=String.fromCharCode(...bytes.subarray(dataOffset,dataOffset+4));
  const size=view.getUint32(dataOffset+4,true);
  if(id==="fmt "&&dataOffset+24<=bytes.length){channels=view.getUint16(dataOffset+10,true)||1;sampleRate=view.getUint32(dataOffset+12,true)||16000;bits=view.getUint16(dataOffset+22,true)||16;}
  if(id==="data"){dataOffset+=8;dataLength=Math.min(size,bytes.length-dataOffset);break;}
  dataOffset+=8+size+(size%2);
 }
 if(!dataLength||bits!==16||!sampleRate)return [];
 const samplesPerWindow=Math.max(1,Math.floor(sampleRate*.5)),bytesPerFrame=channels*2,totalFrames=Math.floor(dataLength/bytesPerFrame),ranges=[];
 let silenceStart=-1;
 for(let frame=0;frame<totalFrames;frame+=samplesPerWindow){
  const end=Math.min(totalFrames,frame+samplesPerWindow);let energy=0,count=0;
  for(let f=frame;f<end;f++){
   for(let ch=0;ch<channels;ch++){const sample=view.getInt16(dataOffset+f*bytesPerFrame+ch*2,true)/32768;energy+=sample*sample;count++;}
  }
  const rms=Math.sqrt(energy/Math.max(1,count)),quiet=rms<0.006;
  if(quiet&&silenceStart<0)silenceStart=frame;
  if(!quiet&&silenceStart>=0){
   const start=offset+silenceStart/sampleRate,endTime=offset+frame/sampleRate;
   if(endTime-start>=.7)ranges.push({start,end:endTime});
   silenceStart=-1;
  }
 }
 if(silenceStart>=0){const start=offset+silenceStart/sampleRate,endTime=offset+totalFrames/sampleRate;if(endTime-start>=.7)ranges.push({start,end:endTime});}
 return ranges;
}
function silenceOverlapSeconds(ranges,start,end){
 return ranges.reduce((sum,range)=>sum+Math.max(0,Math.min(end,range.end)-Math.max(start,range.start)),0);
}
function chooseHighlightWindows(cues,duration,clipSeconds,silenceRanges=[]){
 const candidates=[];
 for(const cue of cues){
  const desiredStart=Math.max(0,Math.min(Math.max(0,duration-clipSeconds),cue.start-4));
  const desiredEnd=Math.min(duration,desiredStart+clipSeconds);
  let start=nearestCueBoundary(cues,desiredStart,"start",2.75);
  let end=nearestCueBoundary(cues,desiredEnd,"end",3.5);
  start=Math.max(0,Math.min(start,duration));
  end=Math.max(start,Math.min(end,duration));
  if(end-start>clipSeconds+2)end=nearestCueBoundary(cues,start+clipSeconds,"end",1.25);
  if(end-start<Math.min(12,clipSeconds*.55)){start=desiredStart;end=desiredEnd;}
  if(end-start<Math.min(12,clipSeconds*.55))continue;
  const inside=cues.filter(x=>x.start<end&&x.end>start);
  const transcript=inside.map(x=>x.text).join(" ").trim();
  const wordCount=(transcript.match(/\\S+/g)||[]).length;
  if(wordCount<10)continue;
  const density=Math.min(clipSeconds,inside.reduce((sum,x)=>sum+Math.max(0,Math.min(end,x.end)-Math.max(start,x.start)),0))/Math.max(1,clipSeconds);
  const cueScores=inside.map(x=>scoreHighlightText(x.text));
  const peak=Math.max(0,...cueScores),average=cueScores.reduce((a,b)=>a+b,0)/Math.max(1,cueScores.length);
  const silenceRatio=Math.min(1,silenceOverlapSeconds(silenceRanges,start,end)/Math.max(1,end-start));
  const score=peak*1.8+average*1.4+density*8+Math.min(wordCount,100)*.08-silenceRatio*14;
  candidates.push({start,end,score,text:transcript});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=[];
 for(const candidate of candidates){
  if(selected.length>=5)break;
  if(selected.some(x=>Math.abs(x.start-candidate.start)<clipSeconds*.72))continue;
  selected.push(candidate);
 }
 return selected.sort((a,b)=>a.start-b.start).map((item,index)=>{
  const inside=cues.filter(x=>x.start<item.end&&x.end>item.start);
  return {...item,title:makeHighlightTitle(inside)||("Highlight "+(index+1))};
 });
}
async function discoverVideoHighlights(ffmpeg,input,duration,clipSeconds,onProgress){
 const chunkSeconds=45,total=Math.ceil(duration/chunkSeconds),cues=[],silenceRanges=[],temporary=[];
 try{
  for(let index=0;index<total;index++){
   const offset=index*chunkSeconds,span=Math.min(chunkSeconds,duration-offset),audioName="./highlight-audio-"+Date.now()+"-"+index+".wav";
   temporary.push(audioName);
   onProgress("Listening for highlight moments "+(index+1)+"/"+total+"…", "Transcribing audio locally in short chunks; only extracted audio is sent for speech recognition.");
   const code=await execFFmpegWithTimeout(ffmpeg,["-ss",String(offset),"-i",input,"-t",String(span),"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le",audioName],180000,120000);
   if(code!==0)throw new Error("Could not extract audio for highlight analysis, segment "+(index+1)+".");
   const bytes=await ffmpeg.readFile(audioName);
   if(bytes.byteLength>4*1024*1024)throw new Error("Audio segment is too large for highlight analysis.");
   silenceRanges.push(...measureSilenceRanges(bytes,offset,span));
   const form=new FormData();form.append("audio",new Blob([bytes],{type:"audio/wav"}),"audio.wav");
   const result=await transcribeAudio(form,180000);
   const parsed=parseSubtitleVtt(result.vtt,offset);
   if(parsed.length)cues.push(...parsed);
   else if(result.text)cues.push({start:offset,end:Math.min(duration,offset+span),text:result.text});
   try{await ffmpeg.deleteFile(audioName)}catch(e){}
   temporary.splice(temporary.indexOf(audioName),1);
  }
 }finally{for(const name of temporary){try{await ffmpeg.deleteFile(name)}catch(e){}}}
 const normalized=normalizeSubtitleCues(cues,duration);
 if(!normalized.length)throw new Error("No clear speech was detected, so AI Highlight Discovery could not rank moments. Try Create short clips instead.");
 const highlights=chooseHighlightWindows(normalized,duration,clipSeconds,silenceRanges);
 if(!highlights.length)throw new Error("There was not enough speech to find distinct highlight moments. Try a longer clip length or Create short clips.");
 return highlights;
}
async function createSubtitleBatch(files){
 if(files.length!==1){toast("For subtitle editing, select one video at a time.");return}
 if(!$("createBatch").disabled)$("createBatch").disabled=true;
 $("engineResults").innerHTML="";$("subtitleEditor").hidden=true;state.subtitleCues=[];
 let ffmpeg=null,input="",audioName="";
 const temporary=new Set();
 try{
  const file=files[0],duration=await readVideoDuration(file);
  if(!duration||!Number.isFinite(duration))throw new Error("Could not read this video's duration.");
  state.subtitleDuration=duration;
  engineProgress("Preparing subtitle transcription…",2,true,"Extracting short audio chunks locally. Your full video is not uploaded for transcription.");
  const projectData=await api("/projects",{method:"POST",body:JSON.stringify({name:"Subtitles · "+file.name,kind:"Subtitle transcription",settings:{fileName:file.name,duration}})});
  state.subtitleSourceFile=file;state.subtitleProjectId=projectData.project.id;
  state.projects.unshift(projectData.project);$("statProjects").textContent=state.projects.length;
  ffmpeg=await getFFmpeg();
  const {fetchFile}=await import("https://esm.sh/@ffmpeg/util@0.12.2");
  input="./subtitle-source-"+Date.now()+".mp4";temporary.add(input);
  let sourceBytes=await fetchFile(file);
  await ffmpeg.writeFile(input,sourceBytes);sourceBytes=null;
  const chunkSeconds=45,total=Math.ceil(duration/chunkSeconds),cues=[];
  for(let index=0;index<total;index++){
   const offset=index*chunkSeconds,span=Math.min(chunkSeconds,duration-offset);
   audioName="./subtitle-audio-"+index+".wav";temporary.add(audioName);
   engineProgress("Extracting audio "+(index+1)+"/"+total+"…",5+index/total*75,false,"Converting to mono 16 kHz WAV before speech recognition.");
   const code=await execFFmpegWithTimeout(ffmpeg,["-ss",String(offset),"-i",input,"-t",String(span),"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le",audioName],180000,120000);
   if(code!==0)throw new Error("Could not extract audio from segment "+(index+1)+".");
   const audioBytes=await ffmpeg.readFile(audioName);
   if(audioBytes.byteLength>4*1024*1024)throw new Error("Audio segment is too large. Try a shorter source video.");
   const form=new FormData();form.append("audio",new Blob([audioBytes],{type:"audio/wav"}),"audio.wav");
   engineProgress("Transcribing audio "+(index+1)+"/"+total+"…",10+(index+1)/total*80,false,"Whisper is detecting speech and generating caption timestamps.");
   const result=await transcribeAudio(form,180000);
   const parsed=parseSubtitleVtt(result.vtt,offset);
   if(parsed.length)cues.push(...parsed);
   else if(result.text)cues.push({start:offset,end:Math.min(duration,offset+span),text:result.text});
   try{await ffmpeg.deleteFile(audioName)}catch(e){}temporary.delete(audioName);
   if(ffmpeg.__lastProgressAt)ffmpeg.__lastProgressAt=Date.now();
  }
  state.subtitleCues=normalizeSubtitleCues(cues,duration);
  state.subtitleFileName=file.name;
  if(!state.subtitleCues.length)throw new Error("No speech was detected. Check that the video contains audible dialogue.");
  engineProgress("Subtitles ready",100,false,"Review the transcript and adjust each caption's wording or timing below.");
  renderSubtitleEditor();toast("Generated "+state.subtitleCues.length+" readable subtitle cues.");
 }catch(error){
  engineProgress("Subtitle generation failed",engineProgressValue,false,error.message||"Please retry.");
  toast(error.message||"Subtitle generation failed.");
 }finally{
  if(ffmpeg){for(const name of temporary){try{await ffmpeg.deleteFile(name)}catch(e){}}}
  $("createBatch").disabled=!state.files.length;
 }
}
$("createBatch").onclick=async()=>{
 if(!state.files.length)return;
 if(!state.user){openAuth();toast("Sign in to process videos.");return}
 const files=[...state.files],workflow=$("workflow").value,aspect=$("aspect").value,clipSeconds=Number($("clipDuration").value);
 if(workflow==="subtitle"){await createSubtitleBatch(files);return}
 $("createBatch").disabled=true;$("engineResults").innerHTML="";
 let activeFFmpeg=null,activeFileIndex=-1;const temporaryFFmpegFiles=new Set();
 try{
  engineProgress("Creating project…",1,true);
  const projectData=await api("/projects",{method:"POST",body:JSON.stringify({name:files.length+" video batch",kind:"Video processing",settings:{aspect,workflow,clipSeconds,fileNames:files.map(f=>f.name)}})});
  const project=projectData.project;state.projects.unshift(project);$("statProjects").textContent=state.projects.length;
  let ffmpeg=await getFFmpeg();const {fetchFile}=await import("https://esm.sh/@ffmpeg/util@0.12.2");activeFFmpeg=ffmpeg;
  const results=[];
  const failedFiles=[];
  // Read every source duration up front so the batch progress denominator is stable.
  const durations=[],metadataErrors=[];
  for(let mi=0;mi<files.length;mi++){
   engineProgress("Checking video "+(mi+1)+"/"+files.length+"…",Math.max(engineProgressValue,3+(mi/files.length)*10),false,"Reading duration before uploads so progress can account for every output.");
   try{durations[mi]=await readVideoDuration(files[mi]);metadataErrors[mi]="";}
   catch(metadataError){durations[mi]=0;metadataErrors[mi]=metadataError?.message||"Could not read video metadata.";}
  }
  const totalTasks=Math.max(1,durations.reduce((sum,d)=>sum+(d>0?(workflow==="clips"?Math.ceil(d/clipSeconds):workflow==="highlights"?Math.min(5,Math.max(1,Math.ceil(d/clipSeconds))):1):0),0));
  let completedTasks=0;
  for(let fi=0;fi<files.length;fi++){
   activeFileIndex=fi;
   const file=files[fi],base=file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,45)||"video";
   let input="",engineUsed=false,plannedSegments=0,fileExports=0;
   try{
    if(!state.ffmpeg){engineProgress("Recovering video engine before the next file…",engineProgressValue,false);ffmpeg=await getFFmpeg();activeFFmpeg=ffmpeg;}
    const duration=durations[fi];
    if(!duration)throw new Error(metadataErrors[fi]||("Could not read video duration for "+file.name));
    setUploadFileStatus(fi,"Starting upload",0,"active");
    engineProgress("Uploading original "+(fi+1)+"/"+files.length+" · "+file.name,5+fi/files.length*10);
    await uploadMedia(file,project.id,"source",false,(pct,label)=>setUploadFileStatus(fi,label,pct,"active"));
    setUploadFileStatus(fi,"Original uploaded · processing",100,"uploaded");
    engineProgress("Upload complete · preparing "+file.name+" for processing…",15+fi/files.length*10);
    input="input-"+fi+"-"+Date.now()+".mp4";
    engineUsed=true;
    let inputBytes=await fetchFile(file);
    engineProgress("Loading "+file.name+" into video engine…",16+fi/files.length*10,false,"Copying the source video into browser memory.");
    temporaryFFmpegFiles.add(input);
    await ffmpeg.writeFile(input,inputBytes);
    // Release the duplicate JavaScript buffer once FFmpeg owns the source file.
    inputBytes=null;
    let highlightWindows=[];
    if(workflow==="highlights"){
     engineProgress("Finding the strongest moments…",18,false,"AI is transcribing the source and ranking distinct moments from the spoken content.");
     highlightWindows=await discoverVideoHighlights(ffmpeg,input,duration,clipSeconds,(label,hint)=>engineProgress(label,Math.max(engineProgressValue,20),false,hint));
     engineProgress("Found "+highlightWindows.length+" candidate highlights",Math.max(engineProgressValue,28),false,"Rendering the highest-scoring moments in chronological order.");
    }
    const segments=workflow==="clips"?Math.ceil(duration/clipSeconds):workflow==="highlights"?highlightWindows.length:1;
    plannedSegments=segments;
    for(let si=0;si<segments;si++){
     const highlight=workflow==="highlights"?highlightWindows[si]:null;
     const offset=workflow==="highlights"?highlight.start:workflow==="clips"?si*clipSeconds:0,seconds=workflow==="highlights"?highlight.end-highlight.start:workflow==="clips"?Math.min(clipSeconds,duration-offset):duration;
     if(seconds<=0)continue;
     const safeTitle=highlight?highlight.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,28):"";
     const output=base+(workflow==="highlights"?"-highlight-"+String(si+1).padStart(2,"0")+(safeTitle?"-"+safeTitle:""):workflow==="clips"?"-clip-"+String(si+1).padStart(2,"0"):"-export")+".mp4";
     const args=["-ss",String(offset),"-i",input,"-t",String(seconds)];
     if(workflow==="resize"||workflow==="clips"||workflow==="highlights")args.push(...videoFilterArgs(aspect));
     else args.push("-map","0:v:0","-map","0:a?");
     const ffmpegOutput="./"+output;
     temporaryFFmpegFiles.add(ffmpegOutput);
     args.push("-c:v","libx264","-preset","ultrafast","-crf",workflow==="compress"?"30":"25","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-movflags","+faststart",ffmpegOutput);
     const taskProgressSpan=75/totalTasks;ffmpegProgressBase=15+(completedTasks/totalTasks)*75;ffmpegProgressSpan=taskProgressSpan*0.8;
     ffmpeg.__operationLabel="Rendering "+output;
     engineProgress("Rendering "+output,ffmpegProgressBase,false,"Output "+(si+1)+" of "+segments+" for "+file.name+". This stage uses browser processing and may take time.");
     const code=await execFFmpegWithTimeout(ffmpeg,args);
     if(code!==0){
      const diagnostics=(ffmpeg.__clipFactoryLogs||[]).slice(-18).join("\n");
      throw new Error("FFmpeg exited with code "+code+" while rendering "+file.name+(diagnostics?"\n\nFFmpeg log:\n"+diagnostics:""));
     }
     let outputBytes=await ffmpeg.readFile(ffmpegOutput);
     const exported=new File([outputBytes],output,{type:"video/mp4"});
     // File now owns the export data; drop the extra Uint8Array reference before upload.
     outputBytes=null;
     engineProgress("Saving "+output+" to cloud storage…",ffmpegProgressBase+taskProgressSpan*0.9,false,"Uploading the finished export. It will appear in My Videos when saved.");
     const saved=await uploadMedia(exported,project.id,"export");
     results.push({...saved.asset,shortsMeta:highlight?buildShortsMetadata(highlight.text):null});
     fileExports++;
     completedTasks++;
     await ffmpeg.deleteFile(ffmpegOutput);
     temporaryFFmpegFiles.delete(ffmpegOutput);
     engineProgress("Export saved · "+output,ffmpegProgressBase+taskProgressSpan,false,"Finished export "+(si+1)+" of "+segments+" for "+file.name+".");
    }
    if(!fileExports)throw new Error("No export was produced for "+file.name);
    setUploadFileStatus(fi,"Completed · "+fileExports+" export(s) saved",100,"success");
   }catch(fileError){
    // Count the failed file's remaining outputs as skipped so later files still advance the batch.
    completedTasks+=Math.max(0,plannedSegments-fileExports);
    const message=fileError?.message||"Unknown file processing error";
    failedFiles.push({file,index:fi,message});
    setUploadFileStatus(fi,"Failed: "+message,0,"failed");
    console.error("ClipFactory file failed:",file.name,fileError);
    // Remove incomplete temporary outputs before resetting the worker. Saved cloud exports are untouched.
    for(const tempFile of [...temporaryFFmpegFiles]){try{await ffmpeg.deleteFile(tempFile)}catch(cleanupError){console.warn("ClipFactory failed-file cleanup:",tempFile,cleanupError)}temporaryFFmpegFiles.delete(tempFile);}
    // Isolate failures: a broken FFmpeg worker must not poison the next file.
    if(engineUsed&&state.ffmpeg===ffmpeg){try{ffmpeg.terminate()}catch(engineError){console.warn("ClipFactory engine reset:",engineError)}state.ffmpeg=null;}
   }finally{
    if(input){
     try{await ffmpeg.deleteFile(input)}catch(cleanupError){console.warn("ClipFactory input cleanup:",input,cleanupError)}
     temporaryFFmpegFiles.delete(input);
    }
   }
   // Large inputs can leave a high-water mark in the WebAssembly heap. Restart
   // after each large source to return that memory to the browser before continuing.
   if(file.size>=128*1024*1024&&state.ffmpeg===ffmpeg){
    engineProgress("Releasing video memory…",engineProgressValue,false,"Resetting FFmpeg after a large source before the next file.");
    try{ffmpeg.terminate()}catch(engineError){console.warn("ClipFactory large-file memory reset:",engineError)}
    state.ffmpeg=null;
    activeFFmpeg=null;
   }
  }
  if(results.length){
   await api("/projects/"+encodeURIComponent(project.id)+"/complete",{method:"POST",body:"{}"});
   project.status="completed";
  }
  state.files=failedFiles.map(x=>x.file);
  $("fileInput").value="";
  renderSelectedFiles();
  $("recentProjects").innerHTML=state.projects.slice(0,4).map(projectRow).join("");
  renderProjects();
  const failedSummary=failedFiles.length?" · "+failedFiles.length+" file(s) failed and remain selected for retry":"";
  $("engineStatus").textContent=results.length?"Completed · "+results.length+" export(s) saved"+failedSummary:"No exports saved · all "+failedFiles.length+" file(s) failed";
  $("enginePercent").textContent=results.length?"100%":"0%";
  $("engineProgressBar").style.width=results.length?"100%":"0%";
  let resultMarkup=results.length?'<h3>Ready to download</h3>'+results.map(x=>{const meta=x.shortsMeta;return '<div class="engine-result"><span>'+escapeHtml(x.file_name)+' <small>· '+(x.size_bytes/1048576).toFixed(1)+' MB</small></span><button class="admin-action" data-download="'+x.id+'" data-name="'+escapeHtml(x.file_name)+'">Download</button></div>'+(meta?'<div class="notice shorts-metadata"><strong>YouTube Shorts metadata</strong><p><b>Title</b><br>'+escapeHtml(meta.title)+'</p><button class="admin-action" data-copy-value="'+escapeHtml(meta.title)+'">Copy title</button><p><b>Caption</b><br>'+escapeHtml(meta.caption)+'</p><button class="admin-action" data-copy-value="'+escapeHtml(meta.caption)+'">Copy caption</button><p><b>Hashtags</b><br>'+escapeHtml(meta.hashtags)+'</p><button class="admin-action" data-copy-value="'+escapeHtml(meta.hashtags)+'">Copy hashtags</button></div>':'')}).join(""):"";
  if(failedFiles.length)resultMarkup+='<div class="notice"><strong>'+failedFiles.length+' file(s) need attention</strong>'+failedFiles.map(x=>'<p>'+escapeHtml(x.file.name)+': '+escapeHtml(x.message)+'</p>').join("")+'Only failed source files remain selected above. Start the batch again to retry those files; successful source files will not be processed again. Any exports already saved remain in My Videos.</div>';
  $("engineResults").innerHTML=resultMarkup;
  $("engineResults").querySelectorAll("[data-copy-value]").forEach(button=>button.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(button.dataset.copyValue||"");const original=button.textContent;button.textContent="Copied!";setTimeout(()=>button.textContent=original,1200);}catch(error){toast("Clipboard access failed. Select and copy the text manually.");}}));
  if(results.length&&failedFiles.length)toast(results.length+" export(s) saved. "+failedFiles.length+" file(s) failed and remain selected.");
  else if(results.length)toast("Video processing complete!");
  else toast("All files failed. Your selection is kept so you can retry.");
 }catch(e){
  console.error("ClipFactory processing failed:",e);
  const detail = e instanceof Error ? (e.stack || e.message) : (typeof e === "string" ? e : JSON.stringify(e) || String(e));
  const message = e?.message || (typeof e === "string" ? e : "Unknown processing error");
  if(activeFileIndex>=0)setUploadFileStatus(activeFileIndex,"Stopped: "+message,0,"failed");
  engineProgress("Stopped: "+message,0);
  toast(message);
  $("engineResults").innerHTML='<div class="notice">Processing error: '+escapeHtml(detail)+'</div>';
 }
 finally{
  if(activeFFmpeg){for(const tempFile of temporaryFFmpegFiles){try{await activeFFmpeg.deleteFile(tempFile)}catch(cleanupError){console.warn("ClipFactory temporary-file cleanup:",tempFile,cleanupError)}}}
  temporaryFFmpegFiles.clear();$("createBatch").disabled=!state.files.length
 }
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
async function loadAdminUserDetail(userId){
 const root=$("adminContent");root.onclick=null;root.innerHTML='<div class="empty-state">Loading creator account…</div>';
 try{
  const d=await api("/admin/users/"+encodeURIComponent(userId));
  const u=d.account,projects=d.projects||[],videos=d.videos||[],ledger=d.ledger||[],activity=d.activity||[],userActivity=d.user_activity||[];
  const projectRows=projects.length?projects.map(p=>'<div class="admin-detail-row"><span><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.kind||"Video")+'</small></span><i class="admin-pill">'+escapeHtml(p.status||"draft")+'</i><small>'+escapeHtml(p.updated_at||p.created_at||"")+'</small></div>').join(""):'<div class="empty-state">No projects created yet.</div>';
  const videoRows=videos.length?videos.map(v=>'<div class="admin-detail-row"><span><strong>'+escapeHtml(v.file_name)+'</strong><small>'+formatBytes(v.size_bytes)+' · '+escapeHtml(v.content_type||"video")+'</small></span><small>'+escapeHtml(v.created_at||"")+'</small></div>').join(""):'<div class="empty-state">No finished videos saved.</div>';
  const ledgerRows=ledger.length?ledger.map(x=>'<div class="admin-detail-row"><span><strong>'+escapeHtml(x.description||x.type)+'</strong><small>'+escapeHtml(x.type||"activity")+' · balance after '+fmt(x.balance_after)+'</small></span><strong class="'+(Number(x.amount)<0?"negative":"positive")+'">'+(Number(x.amount)>0?"+":"")+fmt(x.amount)+' pts</strong><small>'+escapeHtml(x.created_at||"")+'</small></div>').join(""):'<div class="empty-state">No points activity recorded.</div>';
  const userActivityRows=userActivity.length?userActivity.map(x=>'<div class="admin-log"><strong>'+escapeHtml(String(x.action||"activity").replace(/_/g," "))+'</strong><small>'+escapeHtml(activityDetailsText(x.details))+' · '+escapeHtml(x.created_at||"")+'</small></div>').join(""):'<div class="empty-state">No user activity recorded yet. New actions will appear here.</div>';const adminActivityRows=activity.length?activity.map(x=>'<div class="admin-log"><strong>'+escapeHtml(String(x.action||"").replace(/_/g," "))+'</strong> · '+escapeHtml(x.admin_email||"Admin")+'<small>'+escapeHtml(x.details||"{}")+' · '+escapeHtml(x.created_at||"")+'</small></div>').join(""):'<div class="empty-state">No admin actions recorded for this account.</div>';
  root.innerHTML='<div class="admin-detail-head"><button class="admin-action" data-back-users>← Back to users</button><button class="admin-action danger" data-reset-password="'+u.id+'">Reset password</button><div><span class="admin-pill '+(u.status==="suspended"?"warn":"")+'">'+escapeHtml(u.status||"active")+'</span> <span class="admin-pill">'+escapeHtml(u.role||"user")+'</span></div></div><div class="admin-detail-profile"><div class="admin-detail-avatar">'+escapeHtml((u.name||"U").slice(0,1).toUpperCase())+'</div><div><h2>'+escapeHtml(u.name)+'</h2><p>'+escapeHtml(u.email)+'</p><small>Account ID · '+escapeHtml(u.id)+' · Joined '+escapeHtml(u.created_at||"")+'</small></div></div><div class="admin-stats admin-detail-stats"><article class="admin-stat"><span>Current points</span><strong>'+fmt(d.wallet?.balance||0)+'</strong></article><article class="admin-stat"><span>Points deducted</span><strong>'+fmt(d.ledger_summary?.spent||0)+'</strong></article><article class="admin-stat"><span>Projects</span><strong>'+fmt(projects.length)+'</strong></article><article class="admin-stat"><span>Finished videos</span><strong>'+fmt(videos.length)+'</strong></article></div><div class="admin-detail-grid"><section class="admin-detail-panel"><div class="admin-section-intro"><strong>Projects</strong><span>'+fmt(projects.length)+' shown</span></div>'+projectRows+'</section><section class="admin-detail-panel"><div class="admin-section-intro"><strong>Finished videos</strong><span>'+fmt(videos.length)+' shown</span></div>'+videoRows+'</section><section class="admin-detail-panel"><div class="admin-section-intro"><strong>Points history</strong><span>'+fmt(d.ledger_summary?.entries||0)+' total entries · latest 100</span></div>'+ledgerRows+'</section><section class="admin-detail-panel"><div class="admin-section-intro"><strong>User activity</strong><span>'+fmt(userActivity.length)+' recent events · latest 100</span></div>'+userActivityRows+'</section><section class="admin-detail-panel"><div class="admin-section-intro"><strong>Admin actions</strong><span>Changes made by administrators</span></div>'+adminActivityRows+'</section><section class="admin-detail-panel"><div class="admin-section-intro"><strong>Login sessions</strong><span>'+fmt(d.sessions?.total||0)+' sessions</span></div><div class="admin-detail-row"><span><strong>Last session created</strong><small>Based on latest sign-in session</small></span><small>'+escapeHtml(d.sessions?.last_created_at||"No session data")+'</small></div></section></div>';
  root.onclick=e=>{if(e.target.closest("[data-back-users]")){loadAdmin("users");return}const reset=e.target.closest("[data-reset-password]");if(reset)openAdminPasswordDialog(reset.dataset.resetPassword,u.email)};
 }catch(e){root.innerHTML='<div class="notice">Could not load user details: '+escapeHtml(e.message)+'</div><button class="admin-action" data-back-users>← Back to users</button>';root.onclick=()=>loadAdmin("users")}
}
async function loadAdmin(tab){
 if(state.user?.role!=="admin")return;
 if(tab)state.adminTab=tab;
 document.querySelectorAll("[data-admin-tab]").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===state.adminTab));
 const root=$("adminContent");root.onclick=null;root.innerHTML='<div class="empty-state">Loading…</div>';
 try{
  if(state.adminTab==="overview"){
   const d=await api("/admin/stats");
   root.innerHTML='<div class="admin-stats"><article class="admin-stat"><span>Total users</span><strong>'+fmt(d.users.total)+'</strong></article><article class="admin-stat"><span>Active users</span><strong>'+fmt(d.users.active)+'</strong></article><article class="admin-stat"><span>Suspended users</span><strong>'+fmt(d.users.suspended)+'</strong></article><article class="admin-stat"><span>Points in circulation</span><strong>'+fmt(d.points)+'</strong></article><article class="admin-stat"><span>Total projects</span><strong>'+fmt(d.projects)+'</strong></article><article class="admin-stat"><span>Stored media</span><strong>'+fmt(d.media?.count||0)+'</strong></article><article class="admin-stat"><span>Storage used</span><strong>'+formatBytes(d.media?.bytes||0)+'</strong></article></div><div class="notice">Payment workflows are paused. Admin controls for accounts, points, projects, media and system monitoring are active.</div><div class="admin-shortcuts"><button class="admin-action" data-jump="users">Manage users ↗</button><button class="admin-action" data-jump="projects">Review projects ↗</button><button class="admin-action" data-jump="system">Check system ↗</button></div>';
   root.onclick=e=>{const b=e.target.closest("[data-jump]");if(b)loadAdmin(b.dataset.jump)};
  }else if(state.adminTab==="users"){
   const d=await api("/admin/users");
   root.innerHTML='<div class="admin-section-intro"><strong>Creator accounts</strong><span>'+fmt(d.users.length)+' accounts shown · newest first</span></div><div class="table-card">'+(d.users.length?d.users.map(u=>'<div class="admin-row"><span><strong>'+escapeHtml(u.name)+'</strong><br><small>'+escapeHtml(u.email)+' · '+escapeHtml(u.role)+'</small></span><span>'+fmt(u.points)+' pts</span><span><i class="admin-pill '+(u.status==="suspended"?"warn":"")+'">'+escapeHtml(u.status||"active")+'</i></span><span class="admin-actions"><button class="admin-action" data-user-detail="'+u.id+'">View details</button><button class="admin-action danger" data-reset-password="'+u.id+'">Reset password</button><button class="admin-action" data-adjust="'+u.id+'" data-email="'+escapeHtml(u.email)+'">Adjust points</button><button class="admin-action '+(u.status==="suspended"?"":"danger")+'" data-status="'+u.id+'" data-next="'+(u.status==="suspended"?"active":"suspended")+'">'+(u.status==="suspended"?"Activate":"Suspend")+'</button></span></div>').join(""):'<div class="empty-state">No users found.</div>')+'</div>';
   root.onclick=async e=>{const detail=e.target.closest("[data-user-detail]");if(detail){loadAdminUserDetail(detail.dataset.userDetail);return}const reset=e.target.closest("[data-reset-password]");if(reset){const email=reset.closest(".admin-row")?.querySelector("small")?.textContent?.split(" · ")[0]||"selected account";openAdminPasswordDialog(reset.dataset.resetPassword,email);return}const b=e.target.closest("[data-adjust],[data-status]");if(!b)return;try{if(b.dataset.adjust){const amount=prompt("Points adjustment for "+b.dataset.email+" (use negative number to deduct):","100");if(amount===null)return;const n=Number(amount);if(!Number.isInteger(n)||n===0){toast("Enter a non-zero whole number.");return}const description=prompt("Reason for this adjustment:","Admin points adjustment")||"Admin points adjustment";await api("/admin/users/"+b.dataset.adjust+"/points",{method:"POST",body:JSON.stringify({amount:n,description})});toast("Points updated.")}else{const next=b.dataset.next;if(!confirm((next==="suspended"?"Suspend":"Activate")+" this user?"))return;await api("/admin/users/"+b.dataset.status+"/status",{method:"POST",body:JSON.stringify({status:next})});toast("User status updated.")}loadAdmin("users")}catch(err){toast(err.message)}};
  }else if(state.adminTab==="points"){
   const d=await api("/admin/points");
   root.innerHTML='<div class="admin-section-intro"><strong>Points &amp; wallet control</strong><span>Manual adjustments only · purchases remain disabled</span></div><div class="table-card">'+(d.wallets.length?d.wallets.map(u=>'<div class="admin-row"><span><strong>'+escapeHtml(u.name)+'</strong><br><small>'+escapeHtml(u.email)+'</small></span><span><strong>'+fmt(u.balance)+'</strong> pts</span><span><small>'+fmt(u.ledger_count)+' ledger entries</small></span><span><button class="admin-action" data-adjust="'+u.id+'" data-email="'+escapeHtml(u.email)+'">Adjust balance</button></span></div>').join(""):'<div class="empty-state">No wallets found.</div>')+'</div>';
   root.onclick=async e=>{const b=e.target.closest("[data-adjust]");if(!b)return;const amount=prompt("Adjustment for "+b.dataset.email+" (negative number deducts points):","100");if(amount===null)return;const n=Number(amount);if(!Number.isInteger(n)||n===0){toast("Enter a non-zero whole number.");return}const reason=prompt("Reason for this adjustment:","Admin points adjustment")||"Admin points adjustment";try{await api("/admin/users/"+b.dataset.adjust+"/points",{method:"POST",body:JSON.stringify({amount:n,description:reason})});toast("Wallet balance updated.");loadAdmin("points")}catch(err){toast(err.message)}};
  }else if(state.adminTab==="projects"){
   const d=await api("/admin/projects");
   root.innerHTML='<div class="admin-section-intro"><strong>All creator projects</strong><span>'+fmt(d.projects.length)+' projects shown · newest first</span></div><div class="table-card">'+(d.projects.length?d.projects.map(p=>'<div class="admin-row admin-project-row"><span><strong>'+escapeHtml(p.name)+'</strong><br><small>'+escapeHtml(p.owner_name)+' · '+escapeHtml(p.owner_email)+'</small></span><span>'+escapeHtml(p.kind||"Video")+'</span><span><i class="admin-pill">'+escapeHtml(p.status||"draft")+'</i></span><span><small>'+escapeHtml(p.updated_at||p.created_at||"")+'</small></span></div>').join(""):'<div class="empty-state">No projects found.</div>')+'</div>';
  }else if(state.adminTab==="media"){
   const d=await api("/admin/media");
   root.innerHTML='<div class="admin-stats"><article class="admin-stat"><span>Media assets</span><strong>'+fmt(d.summary.count)+'</strong></article><article class="admin-stat"><span>Total storage</span><strong>'+formatBytes(d.summary.bytes)+'</strong></article><article class="admin-stat"><span>Source files</span><strong>'+fmt(d.summary.sources)+'</strong></article><article class="admin-stat"><span>Finished exports</span><strong>'+fmt(d.summary.exports)+'</strong></article></div><div class="admin-section-intro"><strong>Platform media library</strong><span>Latest 200 files across all accounts</span></div><div class="table-card">'+(d.assets.length?d.assets.map(v=>'<div class="admin-row admin-media-row"><span><strong>'+escapeHtml(v.file_name)+'</strong><br><small>'+escapeHtml(v.owner_email)+' · '+escapeHtml(v.project_name||"Project removed")+'</small></span><span>'+escapeHtml(v.kind)+'</span><span>'+formatBytes(v.size_bytes)+'</span><span><small>'+escapeHtml(v.created_at||"")+'</small></span><span class="admin-actions"><button class="admin-action" data-download-media="'+escapeHtml(v.id)+'" data-file-name="'+escapeHtml(v.file_name)+'">Download</button><button class="admin-action danger" data-delete-media="'+escapeHtml(v.id)+'" data-file-name="'+escapeHtml(v.file_name)+'" data-file-size="'+Number(v.size_bytes||0)+'">Delete</button></span></div>').join(""):'<div class="empty-state">No uploaded media found.</div>')+'</div><div class="notice">Deleting a file permanently removes its R2 object and its D1 media records, including the finished-video entry when applicable. This cannot be undone.</div>';
   root.onclick=async e=>{const dl=e.target.closest("[data-download-media]");if(dl){dl.disabled=true;const old=dl.textContent;dl.textContent="Preparing…";try{const response=await fetch(apiBase()+"/api/admin/media/"+encodeURIComponent(dl.dataset.downloadMedia)+"/download",{headers:{Authorization:"Bearer "+state.token}});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Download failed")}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=dl.dataset.fileName||"clipfactory-media";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("Download started.")}catch(err){toast(err.message)}finally{dl.disabled=false;dl.textContent=old}return}const b=e.target.closest("[data-delete-media]");if(!b)return;const name=b.dataset.fileName||"this video",size=formatBytes(Number(b.dataset.fileSize||0));if(!confirm('Permanently delete "'+name+'" ('+size+') from R2 and D1? This cannot be undone.'))return;b.disabled=true;b.textContent="Deleting…";try{const result=await api("/admin/media/"+encodeURIComponent(b.dataset.deleteMedia),{method:"DELETE"});toast("Deleted "+(result.file_name||name)+" · "+formatBytes(result.size_bytes||0)+" freed");await loadAdmin("media")}catch(err){b.disabled=false;b.textContent="Delete";toast(err.message)}};

  }else if(state.adminTab==="system"){
   const d=await api("/admin/system");
   const item=(label,ok,detail)=>'<div class="health-row"><span class="health-indicator '+(ok?"ok":"bad")+'"></span><span><strong>'+label+'</strong><small>'+escapeHtml(detail)+'</small></span><i class="admin-pill '+(ok?"":"warn")+'">'+(ok?"Operational":"Attention")+'</i></div>';
   root.innerHTML='<div class="admin-section-intro"><strong>Platform health</strong><span>Checked '+new Date(d.checked_at).toLocaleString()+'</span></div><div class="health-list">'+item("Worker API",d.api.ok,d.api.detail)+item("D1 database",d.database.ok,d.database.detail)+item("R2 media storage",d.storage.ok,d.storage.detail)+'</div><div class="admin-stats"><article class="admin-stat"><span>Users</span><strong>'+fmt(d.counts.users)+'</strong></article><article class="admin-stat"><span>Projects</span><strong>'+fmt(d.counts.projects)+'</strong></article><article class="admin-stat"><span>Media assets</span><strong>'+fmt(d.counts.media)+'</strong></article><article class="admin-stat"><span>Pending uploads</span><strong>'+fmt(d.counts.uploads)+'</strong></article></div><div class="notice">Storage status checks whether the R2 binding is configured. It does not perform a destructive write test.</div>';
  }else if(state.adminTab==="activity"){
   const d=await api("/admin/audit");
   root.innerHTML='<div class="admin-section-intro"><strong>Admin audit trail</strong><span>Latest 100 recorded actions</span></div><div class="table-card">'+(d.entries.length?d.entries.map(x=>'<div class="admin-log"><strong>'+escapeHtml(x.action.replace(/_/g," "))+'</strong> · '+escapeHtml(x.admin_email)+(x.target_email?' → '+escapeHtml(x.target_email):'')+'<small>'+escapeHtml(x.details||"{}")+' · '+escapeHtml(x.created_at)+'</small></div>').join(""):'<div class="empty-state">No admin activity recorded yet.</div>')+'</div>';
  }
 }catch(e){root.innerHTML='<div class="notice">Could not load admin data: '+escapeHtml(e.message)+'</div>'}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-admin-tab]");if(b){e.preventDefault();loadAdmin(b.dataset.adminTab)}});
async function loadWallet(){if(!state.user){$("packageGrid").hidden=true;$("ledgerList").innerHTML='<div class="empty-state">Sign in to view your wallet and points history.</div>';return}try{const d=await api("/points");updatePoints(d.balance,d.unlimited);$("packageGrid").hidden=true;$("packageGrid").innerHTML="";if(d.unlimited){$("ledgerList").innerHTML='<div class="empty-state">Admin account · Unlimited points enabled.</div>';return}const l=await api("/points/ledger");$("ledgerList").innerHTML=l.entries.length?l.entries.map(x=>'<div class="project-row"><span>'+escapeHtml(x.description)+'</span><span>'+escapeHtml(x.type)+'</span><span>'+((x.amount>0?"+":"")+fmt(x.amount))+' pts</span><span>'+new Date(x.created_at).toLocaleDateString()+'</span></div>').join(""):"No wallet activity yet."}catch(e){toast(e.message)}}
$("topupForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/points/topups",{method:"POST",body:JSON.stringify({package_code:$("topupDialog").dataset.pack,note:$("paymentNote").value})});$("topupDialog").close();$("paymentNote").value="";toast("Top-up request created: "+d.topup.reference);loadWallet()}catch(err){toast(err.message)}};

let adminPasswordTargetId="";
function openAdminPasswordDialog(userId,email){
 adminPasswordTargetId=userId;
 $("adminPasswordTarget").textContent="Set a new password for "+(email||"this account")+". All of this member's active sessions will be signed out.";
 $("adminNewPassword").value="";$("adminConfirmPassword").value="";
 $("adminPasswordDialog").showModal();
}
$("adminPasswordClose").onclick=()=> $("adminPasswordDialog").close();
$("adminPasswordForm").onsubmit=async e=>{
 e.preventDefault();
 const password=$("adminNewPassword").value,confirmation=$("adminConfirmPassword").value;
 if(password.length<8||password.length>128){toast("Password must be 8–128 characters.");return}
 if(password!==confirmation){toast("The passwords do not match.");return}
 const submit=$("adminPasswordSubmit");submit.disabled=true;submit.textContent="Resetting…";
 try{await api("/admin/users/"+encodeURIComponent(adminPasswordTargetId)+"/password",{method:"POST",body:JSON.stringify({password})});$("adminPasswordDialog").close();toast("Member password reset. Their sessions were signed out.");if(state.adminTab==="users")loadAdmin("users")}
 catch(err){toast(err.message)}finally{submit.disabled=false;submit.textContent="Reset password"}
};
$("passwordChangeForm").onsubmit=async e=>{
 e.preventDefault();
 const currentPassword=$("currentPassword").value,newPassword=$("newPassword").value,confirmation=$("confirmPassword").value;
 if(newPassword.length<8||newPassword.length>128){toast("New password must be 8–128 characters.");return}
 if(newPassword!==confirmation){toast("The new passwords do not match.");return}
 if(currentPassword===newPassword){toast("Choose a different password.");return}
 const submit=$("passwordChangeForm").querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Updating…";
 try{await api("/auth/password",{method:"POST",body:JSON.stringify({current_password:currentPassword,new_password:newPassword})});$("passwordChangeForm").reset();toast("Password updated. Other sessions have been signed out.")}
 catch(err){toast(err.message)}finally{submit.disabled=false;submit.textContent="Update password"}
};

async function testApiUrl(value){const status=$("apiConnectionStatus");if(!/^https:\/\//i.test(value)){status.textContent="Enter a valid HTTPS Worker URL.";status.classList.add("offline");return false}status.textContent="Testing API connection…";status.classList.remove("offline");try{const response=await fetch(value.replace(/\/$/,"")+"/api/health",{headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Health check failed");status.textContent="Connected · "+(data.service||"ClipFactory API")+" · "+(data.version||"healthy");return true}catch(err){status.textContent="Connection failed: "+err.message;status.classList.add("offline");return false}}$("testApi").onclick=async()=>{const value=$("apiUrl").value.trim().replace(/\/$/,"");await testApiUrl(value)};$("saveApi").onclick=async()=>{const value=$("apiUrl").value.trim().replace(/\/$/,"");if(!await testApiUrl(value)){toast("API URL was not saved. Fix the connection first.");return}localStorage.setItem("cf_api_url",value);toast("API URL saved. Reloading connection…");setTimeout(()=>location.reload(),500)};$("apiUrl").value=apiBase();$("adminReload").onclick=()=>loadAdmin(state.adminTab);
refresh().then(()=>{if(state.user)loadWallet()});
let healthCheckInFlight=false;
async function checkApiHealth(){
 const indicator=$("apiHealth");if(!indicator||healthCheckInFlight)return;
 healthCheckInFlight=true;indicator.textContent="Checking API…";indicator.classList.remove("offline");indicator.classList.add("checking");
 try{
  const response=await fetch(apiBase()+"/api/health",{headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const data=await response.json();if(!data.ok)throw new Error("Health check failed");
  indicator.textContent="API connected";indicator.classList.remove("offline","checking");indicator.title=(data.service||"ClipFactory API")+" · "+(data.version||"healthy");
 }catch(e){
  indicator.textContent="API unavailable";indicator.classList.remove("checking");indicator.classList.add("offline");indicator.title="Could not reach the ClipFactory Worker API";
 }finally{healthCheckInFlight=false}
}
checkApiHealth();
setInterval(checkApiHealth,45000);
window.addEventListener("online",checkApiHealth);
window.addEventListener("offline",()=>{const indicator=$("apiHealth");if(indicator){indicator.textContent="Network offline";indicator.classList.add("offline");indicator.classList.remove("checking")}});


$("workflow").addEventListener("change",()=>{const selected=$("workflow").value,subtitle=selected==="subtitle",clips=selected==="clips"||selected==="highlights";$("createBatch").textContent=subtitle?"Generate editable subtitles →":selected==="highlights"?"Find highlights & render clips →":"Upload & process videos →";$("clipDurationWrap").hidden=!clips;$("subtitle-cost-note").hidden=!subtitle;});
$("workflow").dispatchEvent(new Event("change"));
