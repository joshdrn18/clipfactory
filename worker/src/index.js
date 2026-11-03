const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8"}});
const fail = (message,status=400) => json({error:message},status);
const uid = () => crypto.randomUUID();
const encoder = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function digest(value){return hex(await crypto.subtle.digest("SHA-256",encoder.encode(value)))}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:100000,hash:"SHA-256"},key,256))}
function cors(req,env){const origin=req.headers.get("Origin")||"";const allowed=env.ALLOWED_ORIGIN||"";return {"Access-Control-Allow-Origin":allowed==="*"||origin===allowed?origin:allowed,"Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"}}
function withCors(response,headers){const h=new Headers(response.headers);Object.entries(headers).forEach(([k,v])=>v&&h.set(k,v));return new Response(response.body,{status:response.status,headers:h})}
async function body(req){try{return await req.json()}catch{return {}}}
async function auth(req,env){const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return null;const hash=await digest(token);return await env.DB.prepare("SELECT u.id,u.name,u.email,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'").bind(hash,Math.floor(Date.now()/1000)).first()}
async function createSession(env,userId){const token=hex(crypto.getRandomValues(new Uint8Array(32)));await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await digest(token),userId,Math.floor(Date.now()/1000)+60*60*24*30).run();return token}
async function route(req,env){const url=new URL(req.url),path=url.pathname.replace(/^\/api/,""),method=req.method;
if(method==="GET"&&path==="/health")return json({ok:true,service:"ClipFactory API",version:"0.1.0"});
if(method==="GET"&&path==="/points/packages"){const {results}=await env.DB.prepare("SELECT code,name,points,price_minor,currency FROM point_packages WHERE active=1 ORDER BY sort_order").all();return json({packages:results})}
if(method==="POST"&&path==="/auth/register"){const b=await body(req),email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),password=String(b.password||"");if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8||name.length<1||name.length>80)return fail("Enter a valid name, email and password (at least 8 characters).");if(await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return fail("An account with this email already exists.",409);const id=uid(),salt=hex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt),role=email===(env.ADMIN_EMAIL||"").toLowerCase()?"admin":"user";await env.DB.batch([env.DB.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,role) VALUES(?,?,?,?,?,?)").bind(id,name,email,hash,salt,role),env.DB.prepare("INSERT INTO wallets(user_id,balance) VALUES(?,0)").bind(id)]);return json({token:await createSession(env,id),user:{id,name,email,role}},201)}
if(method==="POST"&&path==="/auth/login"){const b=await body(req),email=String(b.email||"").trim().toLowerCase(),user=await env.DB.prepare("SELECT id,name,email,password_hash,password_salt,role,status FROM users WHERE email=?").bind(email).first();if(!user||await passwordHash(String(b.password||""),user.password_salt)!==user.password_hash)return fail("Email or password is incorrect.",401);if(user.status==="suspended")return fail("This account has been suspended. Contact support.",403);if(email===(env.ADMIN_EMAIL||"").toLowerCase()&&user.role!=="admin"){await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(user.id).run();user.role="admin"}return json({token:await createSession(env,user.id),user:{id:user.id,name:user.name,email:user.email,role:user.role}})}
const user=await auth(req,env);
if(path==="/me"&&method==="GET"){if(!user)return fail("Please sign in.",401);const wallet=await env.DB.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(user.id).first();const {results:projects}=await env.DB.prepare("SELECT id,name,kind,status,created_at FROM projects WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();return json({user,wallet:{...wallet,unlimited:user.role==="admin"},projects})}
if(!user)return fail("Please sign in.",401);
if(path==="/points"&&method==="GET"){const wallet=await env.DB.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(user.id).first();const {results:packages}=await env.DB.prepare("SELECT code,name,points,price_minor,currency FROM point_packages WHERE active=1 ORDER BY sort_order").all();return json({balance:wallet?.balance||0,unlimited:user.role==="admin",packages})}
if(path==="/points/ledger"&&method==="GET"){const {results:entries}=await env.DB.prepare("SELECT type,amount,balance_after,description,created_at FROM points_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();return json({entries})}
if(path==="/points/topups"&&method==="POST"){const b=await body(req),pkg=await env.DB.prepare("SELECT * FROM point_packages WHERE code=? AND active=1").bind(String(b.package_code||"")).first();if(!pkg)return fail("That points package is unavailable.");const id=uid(),reference="CF-"+crypto.randomUUID().slice(0,8).toUpperCase();await env.DB.prepare("INSERT INTO topups(id,user_id,package_code,reference,points,amount_minor,currency,note) VALUES(?,?,?,?,?,?,?,?)").bind(id,user.id,pkg.code,reference,pkg.points,pkg.price_minor,pkg.currency,String(b.note||"").slice(0,500)).run();return json({topup:{id,reference,points:pkg.points,amount_minor:pkg.price_minor,currency:pkg.currency,status:"pending"},message:"Pending request created. Points are not credited until payment is verified."},201)}

if(path==="/media/upload/init"&&method==="POST"){
 if(!env.MEDIA)return fail("Media storage is not configured. Bind the R2 bucket as MEDIA.",503);
 const b=await body(req),fileName=String(b.file_name||"video.mp4").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"video.mp4";
 const projectId=String(b.project_id||""),kind=String(b.kind||"source"),size=Number(b.file_size),contentType=String(b.content_type||"");
 if(!Number.isSafeInteger(size)||size<1||size>500*1024*1024)return fail("Each video must be between 1 byte and 500 MB.");
 if(!["source","export"].includes(kind))return fail("Invalid media type.");
 if(!/^video\/(mp4|quicktime|webm|x-matroska)$/.test(contentType))return fail("Unsupported video format.");
 const project=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
 if(!project)return fail("Project not found.",404);
 const pointsCost=kind==="source"&&user.role!=="admin"?Math.ceil(size/(100*1024*1024))*10:0;
 if(pointsCost>0){
  const wallet=await env.DB.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(user.id).first();
  if((wallet?.balance||0)<pointsCost)return fail("Not enough points. This upload requires "+pointsCost+" points.",402);
 }
 const id=uid(),key=user.id+"/"+projectId+"/"+id+"-"+fileName;
 const multipart=await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType},customMetadata:{userId:user.id,projectId,kind}});
 try{
  await env.DB.prepare("INSERT INTO media_uploads(id,user_id,project_id,kind,file_name,object_key,r2_upload_id,size_bytes,content_type,points_charged) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,projectId,kind,fileName,key,multipart.uploadId,size,contentType,pointsCost).run();
 }catch(e){
  await multipart.abort().catch(()=>{});
  throw e;
 }
 return json({upload_id:id,points_cost:pointsCost,unlimited:user.role==="admin"},201);
}
const uploadPart=path.match(/^\/media\/upload\/([\w-]+)\/part$/);
if(uploadPart&&method==="PUT"){
 const session=await env.DB.prepare("SELECT object_key,r2_upload_id FROM media_uploads WHERE id=? AND user_id=?").bind(uploadPart[1],user.id).first();
 if(!session)return fail("Upload session not found.",404);
 const partNumber=Number(url.searchParams.get("partNumber"));
 if(!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)return fail("Invalid multipart part number.");
 const part=await env.MEDIA.resumeMultipartUpload(session.object_key,session.r2_upload_id).uploadPart(partNumber,req.body);
 return json({part_number:part.partNumber,etag:part.etag});
}
const uploadComplete=path.match(/^\/media\/upload\/([\w-]+)\/complete$/);
if(uploadComplete&&method==="POST"){
 const session=await env.DB.prepare("SELECT * FROM media_uploads WHERE id=? AND user_id=?").bind(uploadComplete[1],user.id).first();
 if(!session)return fail("Upload session not found.",404);
 const b=await body(req),parts=Array.isArray(b.parts)?b.parts.map(p=>({partNumber:Number(p.partNumber),etag:String(p.etag||"")})):[];
 if(!parts.length||parts.some(p=>!Number.isInteger(p.partNumber)||p.partNumber<1||!p.etag))return fail("Upload parts are incomplete.");
 parts.sort((a,b)=>a.partNumber-b.partNumber);
 let charged=false;
 if(session.points_charged>0){
  const charge=await env.DB.batch([
   env.DB.prepare("UPDATE wallets SET balance=balance-?,updated_at=datetime('now') WHERE user_id=? AND balance>=?").bind(session.points_charged,user.id,session.points_charged),
   env.DB.prepare("INSERT INTO points_ledger(id,user_id,type,amount,balance_after,description) SELECT ?,?,'usage',-?,balance,? FROM wallets WHERE user_id=? AND changes()=1").bind(uid(),user.id,session.points_charged,"Video upload · "+session.file_name,user.id)
  ]);
  if(!charge[0].meta.changes){
   await env.MEDIA.resumeMultipartUpload(session.object_key,session.r2_upload_id).abort().catch(()=>{});
   await env.DB.prepare("DELETE FROM media_uploads WHERE id=? AND user_id=?").bind(session.id,user.id).run();
   return fail("Not enough points to complete this upload. You need "+session.points_charged+" points.",402);
  }
  charged=true;
 }
 const multipart=env.MEDIA.resumeMultipartUpload(session.object_key,session.r2_upload_id);
 const id=uid();
 try{
  await multipart.complete(parts);
  await env.DB.prepare("INSERT INTO media_assets(id,user_id,project_id,kind,file_name,object_key,size_bytes,content_type) VALUES(?,?,?,?,?,?,?,?)").bind(id,user.id,session.project_id,session.kind,session.file_name,session.object_key,session.size_bytes,session.content_type).run();
  if(session.kind==="export") await env.DB.prepare("INSERT INTO finished_videos(id,user_id,source_project_id,file_name,object_key,size_bytes,content_type) VALUES(?,?,?,?,?,?,?)").bind(id,user.id,session.project_id,session.file_name,session.object_key,session.size_bytes,session.content_type).run();
  await env.DB.prepare("DELETE FROM media_uploads WHERE id=? AND user_id=?").bind(session.id,user.id).run();
 }catch(e){
  await env.MEDIA.delete(session.object_key).catch(()=>{});
  if(charged){
   await env.DB.batch([
    env.DB.prepare("UPDATE wallets SET balance=balance+?,updated_at=datetime('now') WHERE user_id=?").bind(session.points_charged,user.id),
    env.DB.prepare("INSERT INTO points_ledger(id,user_id,type,amount,balance_after,description) SELECT ?,?,'refund',?,balance,? FROM wallets WHERE user_id=?").bind(uid(),user.id,session.points_charged,"Refund · upload failed · "+session.file_name,user.id)
   ]);
  }
  throw e;
 }
 const wallet=await env.DB.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(user.id).first();
 return json({asset:{id,project_id:session.project_id,kind:session.kind,file_name:session.file_name,size_bytes:session.size_bytes,content_type:session.content_type},points_charged:session.points_charged,balance:wallet?.balance??0,unlimited:user.role==="admin"});
}
const uploadCancel=path.match(/^\/media\/upload\/([\w-]+)\/cancel$/);
if(uploadCancel&&method==="POST"){
 const session=await env.DB.prepare("SELECT * FROM media_uploads WHERE id=? AND user_id=?").bind(uploadCancel[1],user.id).first();
 if(!session)return json({ok:true});
 await env.MEDIA.resumeMultipartUpload(session.object_key,session.r2_upload_id).abort().catch(()=>{});
 await env.DB.prepare("DELETE FROM media_uploads WHERE id=? AND user_id=?").bind(session.id,user.id).run();
 return json({ok:true});
}
if(path==="/media"&&method==="GET"){
 const projectId=String(url.searchParams.get("project_id")||"");
 const {results}=await env.DB.prepare("SELECT id,project_id,kind,file_name,size_bytes,content_type,created_at FROM media_assets WHERE user_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id,projectId).all();
 return json({assets:results});
}
if(path==="/videos"&&method==="GET"){
 const {results}=await env.DB.prepare("SELECT v.id,v.source_project_id,v.file_name,v.size_bytes,v.content_type,v.created_at,v.updated_at,p.name AS project_name FROM finished_videos v LEFT JOIN projects p ON p.id=v.source_project_id WHERE v.user_id=? ORDER BY v.created_at DESC LIMIT 500").bind(user.id).all();
 const total=results.reduce((sum,v)=>sum+Number(v.size_bytes||0),0);
 return json({videos:results,storage_bytes:total,count:results.length});
}
const videoFile=path.match(/^\/videos\/([\w-]+)\/(file|download)$/);
if(videoFile&&method==="GET"){
 if(!env.MEDIA)return fail("Media storage is not configured.",503);
 const video=await env.DB.prepare("SELECT object_key,file_name,content_type FROM finished_videos WHERE id=? AND user_id=?").bind(videoFile[1],user.id).first();
 if(!video)return fail("Finished video not found.",404);
 const object=await env.MEDIA.get(video.object_key);
 if(!object)return fail("Video file is missing from storage.",404);
 const filename=String(video.file_name||"video.mp4").replace(/["\\\\\\r\\n]/g,"_");
 return new Response(object.body,{headers:{"Content-Type":video.content_type||"video/mp4","Content-Disposition":(videoFile[2]==="file"?"inline":"attachment")+'; filename="'+filename+'"',"Content-Length":String(object.size||0),"Accept-Ranges":"bytes","Cache-Control":"private, no-store"}});
}
const videoRename=path.match(/^\/videos\/([\w-]+)$/);
if(videoRename&&method==="PUT"){
 const b=await body(req),name=String(b.file_name||"").trim().slice(0,180);
 if(!name||/[\\/\\\\\\r\\n]/.test(name))return fail("Enter a valid filename.");
 const result=await env.DB.prepare("UPDATE finished_videos SET file_name=?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(name,videoRename[1],user.id).run();
 if(!result.meta.changes)return fail("Finished video not found.",404);
 return json({ok:true,file_name:name});
}
if(videoRename&&method==="DELETE"){
 const video=await env.DB.prepare("SELECT object_key FROM finished_videos WHERE id=? AND user_id=?").bind(videoRename[1],user.id).first();
 if(!video)return fail("Finished video not found.",404);
 if(!env.MEDIA)return fail("Media storage is not configured.",503);
 await env.MEDIA.delete(video.object_key);
 await env.DB.prepare("DELETE FROM finished_videos WHERE id=? AND user_id=?").bind(videoRename[1],user.id).run();
 await env.DB.prepare("DELETE FROM media_assets WHERE id=? AND user_id=? AND kind='export'").bind(videoRename[1],user.id).run();
 return json({ok:true,deleted:true});
}
const mediaDownload=path.match(/^\/media\/([\w-]+)\/download$/);
if(mediaDownload&&method==="GET"){
 if(!env.MEDIA)return fail("Media storage is not configured.",503);
 const asset=await env.DB.prepare("SELECT object_key,file_name,content_type FROM media_assets WHERE id=? AND user_id=?").bind(mediaDownload[1],user.id).first();
 if(!asset)return fail("Media file not found.",404);
 const object=await env.MEDIA.get(asset.object_key);
 if(!object)return fail("Media file is missing from storage.",404);
 return new Response(object.body,{headers:{"Content-Type":asset.content_type||"application/octet-stream","Content-Disposition":'attachment; filename="'+asset.file_name.replace(/["\\\\]/g,"_")+'"',"Cache-Control":"private, no-store"}});
}
const projectDelete=path.match(/^\/projects\/([\w-]+)$/);
if(projectDelete&&method==="DELETE"){
 const project=await env.DB.prepare("SELECT id,status FROM projects WHERE id=? AND user_id=?").bind(projectDelete[1],user.id).first();
 if(!project)return fail("Project not found.",404);
 if(String(project.status||"draft").toLowerCase()!=="draft")return fail("Only draft projects can be deleted.",409);
 const {results:uploads}=await env.DB.prepare("SELECT object_key,r2_upload_id FROM media_uploads WHERE project_id=? AND user_id=?").bind(project.id,user.id).all();
 const {results:assets}=await env.DB.prepare("SELECT object_key,kind FROM media_assets WHERE project_id=? AND user_id=?").bind(project.id,user.id).all();
 if((uploads.length||assets.some(a=>a.kind!=="export"))&&!env.MEDIA)return fail("Media storage is unavailable; project was not deleted.",503);
 for(const upload of uploads){await env.MEDIA.resumeMultipartUpload(upload.object_key,upload.r2_upload_id).abort().catch(()=>{});}
 for(const asset of assets){if(asset.kind!=="export")await env.MEDIA.delete(asset.object_key).catch(()=>{});}
 await env.DB.prepare("DELETE FROM projects WHERE id=? AND user_id=? AND lower(status)='draft'").bind(project.id,user.id).run();
 return json({ok:true,deleted:true});
}
const projectComplete=path.match(/^\/projects\/([\w-]+)\/complete$/);
if(projectComplete&&method==="POST"){
 const result=await env.DB.prepare("UPDATE projects SET status='completed',updated_at=datetime('now') WHERE id=? AND user_id=?").bind(projectComplete[1],user.id).run();
 if(!result.meta.changes)return fail("Project not found.",404);
 return json({ok:true,status:"completed"});
}
if(path==="/projects"&&method==="POST"){const b=await body(req),name=String(b.name||"Untitled project").trim().slice(0,120),kind=String(b.kind||"Video").slice(0,40),settings=JSON.stringify(b.settings||{}),id=uid();await env.DB.prepare("INSERT INTO projects(id,user_id,name,kind,settings_json) VALUES(?,?,?,?,?)").bind(id,user.id,name,kind,settings).run();return json({project:{id,name,kind,status:"draft",created_at:new Date().toISOString()}},201)}

if(path.startsWith("/admin/")&&user.role!=="admin")return fail("Admin access required.",403);
if(path==="/admin/stats"&&method==="GET"){
 const [users,pending,approved,revenue,points,projects]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended FROM users").first(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM topups WHERE status='pending'").first(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM topups WHERE status='approved'").first(),
  env.DB.prepare("SELECT currency,COALESCE(SUM(amount_minor),0) AS amount FROM topups WHERE status='approved' GROUP BY currency").all(),
  env.DB.prepare("SELECT COALESCE(SUM(balance),0) AS total FROM wallets").first(),
  env.DB.prepare("SELECT COUNT(*) AS total FROM projects").first()
 ]);
 return json({users,pending:pending.total,approved:approved.total,revenue:revenue.results,points:points.total,projects:projects.total});
}
if(path==="/admin/users"&&method==="GET"){
 const {results}=await env.DB.prepare("SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,COALESCE(w.balance,0) AS points,(SELECT COUNT(*) FROM topups t WHERE t.user_id=u.id) AS topups_count FROM users u LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 200").all();
 return json({users:results});
}
const userAction=path.match(/^\/admin\/users\/([\w-]+)\/(status|points)$/);
if(userAction&&method==="POST"){
 const target=await env.DB.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").bind(userAction[1]).first();
 if(!target)return fail("User not found.",404);
 if(target.id===user.id)return fail("You cannot modify your own admin account here.",400);
 const b=await body(req);
 if(userAction[2]==="status"){
  const status=b.status==="suspended"?"suspended":"active";
  await env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(status,target.id).run();
  await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_user_id,details) VALUES(?,?,?,?,?)").bind(uid(),user.id,"user_status",target.id,JSON.stringify({email:target.email,status})).run();
  return json({ok:true,status});
 }
 const amount=Math.trunc(Number(b.amount)),description=String(b.description||"Admin points adjustment").slice(0,180);
 if(!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>1000000)return fail("Enter a non-zero points adjustment up to 1,000,000.");
 const updated=await env.DB.prepare("UPDATE wallets SET balance=balance+?,updated_at=datetime('now') WHERE user_id=? AND balance+?>=0").bind(amount,target.id,amount).run();
 if(!updated.meta.changes)return fail("Insufficient points balance or wallet missing.",400);
 const wallet=await env.DB.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(target.id).first();
 await env.DB.prepare("INSERT INTO points_ledger(id,user_id,type,amount,balance_after,description) VALUES(?,?,?,?,?,?)").bind(uid(),target.id,"adjustment",amount,wallet.balance,description).run();
 await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_user_id,details) VALUES(?,?,?,?,?)").bind(uid(),user.id,"points_adjustment",target.id,JSON.stringify({email:target.email,amount,description})).run();
 return json({ok:true,balance:wallet.balance});
}
if(path==="/admin/packages"&&method==="GET"){
 const {results}=await env.DB.prepare("SELECT code,name,points,price_minor,currency,active,sort_order FROM point_packages ORDER BY sort_order").all();
 return json({packages:results});
}
const packageAction=path.match(/^\/admin\/packages\/([\w-]+)$/);
if(packageAction&&method==="POST"){
 const old=await env.DB.prepare("SELECT * FROM point_packages WHERE code=?").bind(packageAction[1]).first();
 if(!old)return fail("Package not found.",404);
 const b=await body(req),name=String(b.name||old.name).slice(0,60),points=Math.trunc(Number(b.points??old.points)),price=Math.trunc(Number(b.price_minor??old.price_minor)),currency=String(b.currency||old.currency).toUpperCase().slice(0,3),active=b.active===false?0:1;
 if(!Number.isSafeInteger(points)||points<1||points>10000000||!Number.isSafeInteger(price)||price<0||price>1000000000||!/^[A-Z]{3}$/.test(currency))return fail("Invalid package values.");
 await env.DB.prepare("UPDATE point_packages SET name=?,points=?,price_minor=?,currency=?,active=? WHERE code=?").bind(name,points,price,currency,active,old.code).run();
 await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,details) VALUES(?,?,?,?)").bind(uid(),user.id,"package_updated",JSON.stringify({code:old.code,name,points,price,currency,active})).run();
 return json({ok:true});
}
if(path==="/admin/audit"&&method==="GET"){
 const {results}=await env.DB.prepare("SELECT a.id,a.action,a.details,a.created_at,u.email AS admin_email,t.email AS target_email FROM admin_audit_logs a JOIN users u ON u.id=a.admin_user_id LEFT JOIN users t ON t.id=a.target_user_id ORDER BY a.created_at DESC LIMIT 100").all();
 return json({entries:results});
}
if(path==="/admin/topups"&&method==="GET"){const {results}=await env.DB.prepare("SELECT t.*,u.email,u.name AS user_name FROM topups t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 100").all();return json({topups:results})}
const approve=path.match(/^\/admin\/topups\/([\w-]+)\/(approve|reject)$/);if(approve&&method==="POST"){if(user.role!=="admin")return fail("Admin access required.",403);const t=await env.DB.prepare("SELECT * FROM topups WHERE id=? AND status='pending'").bind(approve[1]).first();if(!t)return fail("Pending top-up not found.",404);const status=approve[2]==="approve"?"approved":"rejected";if(status==="approved"){await env.DB.batch([env.DB.prepare("UPDATE topups SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'").bind(user.id,t.id),env.DB.prepare("UPDATE wallets SET balance=balance+(SELECT points FROM topups WHERE id=?),updated_at=datetime('now') WHERE user_id=? AND changes()=1").bind(t.id,t.user_id),env.DB.prepare("INSERT INTO points_ledger(id,user_id,type,amount,balance_after,description,reference_id) SELECT ?,t.user_id,'topup',t.points,w.balance,'Points top-up '||t.reference,t.id FROM topups t JOIN wallets w ON w.user_id=t.user_id WHERE t.id=? AND t.status='approved' AND t.reviewed_by=? AND changes()=1").bind(uid(),t.id,user.id)]);}else await env.DB.prepare("UPDATE topups SET status='rejected',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'").bind(user.id,t.id).run();await env.DB.prepare("INSERT INTO admin_audit_logs(id,admin_user_id,action,target_user_id,details) VALUES(?,?,?,?,?)").bind(uid(),user.id,"topup_"+status,t.user_id,JSON.stringify({reference:t.reference,points:t.points,amount_minor:t.amount_minor,currency:t.currency})).run();return json({ok:true,status})}
return fail("Not found.",404)}
export default {async fetch(req,env){const headers=cors(req,env);if(req.method==="OPTIONS")return new Response(null,{status:204,headers});try{return withCors(await route(req,env),headers)}catch(e){console.error("ClipFactory API error:",e);return withCors(json({error:"Internal server error",detail:env.ENVIRONMENT==="development"?e.message:undefined},500),headers)}}};
