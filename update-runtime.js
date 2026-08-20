/* E-REPORT SAGS · SAFE UPDATE RUNTIME · V1.92
   Fixes repeated update prompts by using a release manifest, semantic build ordering,
   verified service-worker activation, and cleanup after the target build becomes active.
*/
(function(root){
"use strict";
const RELEASE_VERSION="V1.92";
const RELEASE_DISPLAY="V1.92 AI";
const RELEASE_BUILD="V1.92-20260820-01";
const VERSION_URL="./version.json";
const MANIFEST_URL="./update-manifest.json";
const DISMISS_KEY="pdh-update-dismissed";
const APPLYING_KEY="pdh-update-applying";
const CHECK_MS=120000;

if(root.__SAGS_SAFE_UPDATE_RUNTIME__?.build===RELEASE_BUILD)return;
const state={build:RELEASE_BUILD,target:"",display:"",busy:false,installed:false,registration:null,lastCheck:0,reloadStarted:false};
root.__SAGS_SAFE_UPDATE_RUNTIME__=state;
root.__SAGS_UPDATE_RUNTIME_BUILD__=RELEASE_BUILD;

const S=v=>String(v??"").trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function noStoreInit(){return {cache:"no-store",headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}};}
function bust(path,label){const u=new URL(path,location.href);u.searchParams.set("__sags",label||RELEASE_BUILD);u.searchParams.set("t",Date.now());return u.toString();}
function parseBuild(v){
  const s=S(v).toUpperCase().replace(/\s+AI\b/g,"");
  const m=/^V(\d+)\.(\d+)(?:\.(\d+))?(?:-(\d{8})-(\d+))?/.exec(s);
  if(!m)return null;
  return [Number(m[1]||0),Number(m[2]||0),Number(m[3]||0),Number(m[4]||0),Number(m[5]||0)];
}
function compareBuild(a,b){
  if(S(a)===S(b))return 0;
  const x=parseBuild(a),y=parseBuild(b);if(!x||!y)return null;
  for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1;}
  return 0;
}
function currentBuild(){
  const direct=S(root.SAGS_RUNTIME_BUILD||root.__SAGS_FLIGHT_WORKSPACE_BUILD__||document.documentElement.getAttribute("data-sags-build"));
  if(direct)return direct;
  const marker=S(document.getElementById("buildMarker")?.textContent||document.documentElement.getAttribute("data-app-version"));
  const m=marker.match(/V\d+\.\d+(?:\.\d+)?/i);return m?m[0].toUpperCase():"";
}
function currentDisplay(){
  return S(root.SAGS_RUNTIME_DISPLAY||document.documentElement.getAttribute("data-app-version")||document.getElementById("buildMarker")?.textContent);
}
function syncRuntimeDisplay(){
  // Never relabel an old page before V1.92 is actually active.
  if(S(currentBuild())!==RELEASE_BUILD)return false;
  try{
    root.SAGS_RUNTIME_DISPLAY=RELEASE_DISPLAY;
    document.documentElement.setAttribute("data-sags-build",RELEASE_BUILD);
    document.documentElement.setAttribute("data-app-version",RELEASE_DISPLAY);
    const marker=document.getElementById("buildMarker");
    if(marker)marker.textContent=RELEASE_DISPLAY;
    const hint=document.getElementById("statusHint");
    if(hint&&!/^Lỗi khởi tạo:/i.test(S(hint.textContent)))hint.textContent=RELEASE_DISPLAY+" · 20/08/26";
    return true;
  }catch(_){return false;}
}
function cleanUpdateUrl(){
  try{
    const u=new URL(location.href);let changed=false;
    for(const k of ["_build","_upd","appv","_r","__sags_build","__sags_update"]){if(u.searchParams.has(k)){u.searchParams.delete(k);changed=true;}}
    if(changed&&history?.replaceState)history.replaceState(history.state,"",u.toString());
  }catch(_){}
}
async function fetchJson(path,label){const r=await fetch(bust(path,label),noStoreInit());if(!r.ok)throw new Error(`${path} HTTP ${r.status}`);return r.json();}
async function fetchText(path,label){const r=await fetch(bust(path,label),noStoreInit());if(!r.ok)throw new Error(`${path} HTTP ${r.status}`);return r.text();}
function buildFromJs(text,name){
  const rx=name==="runtime"?/const\s+RELEASE_BUILD\s*=\s*["']([^"']+)["']/:/const\s+BUILD\s*=\s*["']([^"']+)["']/;
  return S(rx.exec(S(text))?.[1]);
}
async function releaseInfo(){
  try{
    const [v,m]=await Promise.all([fetchJson(VERSION_URL,"version"),fetchJson(MANIFEST_URL,"manifest")]);
    const vb=S(v?.build),mb=S(m?.build),display=S(m?.displayVersion||v?.displayVersion||v?.label||m?.version||v?.version);
    if(!vb||!mb||vb!==mb)return {ready:false,reason:"VERSION_MANIFEST_MISMATCH",versionBuild:vb,manifestBuild:mb};
    const declared=[m?.serviceWorkerBuild,m?.updateRuntimeBuild,m?.flightWorkspaceBuild,m?.firebaseConfigBuild].map(S).filter(Boolean);
    if(declared.some(x=>x!==vb))return {ready:false,reason:"MANIFEST_COMPONENT_MISMATCH",build:vb,declared};
    return {ready:true,build:vb,display:display||vb,manifest:m,version:v};
  }catch(e){return {ready:false,reason:"NETWORK",error:e};}
}
function dismissed(build){
  try{const x=JSON.parse(sessionStorage.getItem(DISMISS_KEY)||"null");return x&&S(x.build)===S(build)&&Number(x.until||0)>Date.now();}catch(_){return false;}
}
function hidePrompt(){const m=document.getElementById("appUpdateModal");if(m)m.style.display="none";}
function setButton(normal=true,label=""){
  const b=document.getElementById("appUpdateNowBtn");if(!b)return;
  b.disabled=!normal;b.textContent=normal?("LƯU & CẬP NHẬT"+(label?" "+label:"")):"ĐANG CẬP NHẬT…";
}
function clearCompleted(build){
  state.target="";state.display="";state.busy=false;
  try{const applying=S(localStorage.getItem(APPLYING_KEY));if(!applying||applying===build||compareBuild(build,applying)>=0)localStorage.removeItem(APPLYING_KEY);}catch(_){}
  try{sessionStorage.removeItem(DISMISS_KEY);}catch(_){}
  try{localStorage.setItem("sags-last-successful-build",build);}catch(_){}
  syncRuntimeDisplay();cleanUpdateUrl();hidePrompt();setButton(true,"");
}
function showPrompt(info){
  if(!info?.build||dismissed(info.build))return;
  state.target=info.build;state.display=info.display||info.build;
  const modal=document.getElementById("appUpdateModal"),txt=document.getElementById("appUpdateVersionText"),title=document.getElementById("appUpdateTitle");
  if(title)title.textContent="Có bản cập nhật mới";
  if(txt)txt.textContent=`Bản đang dùng: ${currentDisplay()||currentBuild()||"—"} → Bản mới: ${state.display} (${state.target})`;
  if(modal)modal.style.display="flex";
  setButton(true,state.display);
}
async function check(){
  if(state.busy)return;state.lastCheck=Date.now();
  const info=await releaseInfo();if(!info.ready)return;
  const cur=currentBuild(),cmp=cur?compareBuild(info.build,cur):1;
  if(cur&&S(info.build)===S(cur)){clearCompleted(cur);return;}
  if(cmp!==null&&cmp<=0){hidePrompt();setButton(true,"");return;}
  // Unknown/older page: only accept a release whose manifest and version agree.
  showPrompt(info);
}
async function verifyAssets(target){
  const [sw,rt,fw,fb,m,v]=await Promise.all([
    fetchText("./service-worker.js","sw-"+target),fetchText("./update-runtime.js","rt-"+target),fetchText("./flight-workspace.js","fw-"+target),fetchText("./firebase-config.js","fb-"+target),fetchJson(MANIFEST_URL,"m2-"+target),fetchJson(VERSION_URL,"v2-"+target)
  ]);
  const swb=buildFromJs(sw,"sw"),rtb=buildFromJs(rt,"runtime"),fwb=buildFromJs(fw,"fw"),fbb=S(/const\s+BUILD\s*=\s*["']([^"']+)["']/.exec(S(fb))?.[1]),mb=S(m?.build),vb=S(v?.build);
  const all=[swb,rtb,fwb,fbb,mb,vb];
  if(all.some(x=>x!==target))throw new Error("Bản mới chưa đồng bộ đủ file: "+JSON.stringify({sw:swb,runtime:rtb,workspace:fwb,firebase:fbb,manifest:mb,version:vb}));
  return true;
}
function workerBuild(worker,timeout=2500){
  return new Promise(resolve=>{
    if(!worker)return resolve("");let done=false;const ch=new MessageChannel();const end=v=>{if(done)return;done=true;clearTimeout(t);resolve(S(v));};
    ch.port1.onmessage=e=>end(e?.data?.build||"");const t=setTimeout(()=>end(""),timeout);
    try{worker.postMessage({type:"GET_BUILD"},[ch.port2]);}catch(_){end("");}
  });
}
function waitInstalled(reg,timeout=15000){
  return new Promise(resolve=>{
    if(reg?.waiting)return resolve(reg.waiting);const w=reg?.installing;if(!w)return resolve(null);
    let done=false;const finish=x=>{if(done)return;done=true;clearTimeout(t);resolve(x);};
    const inspect=()=>{if(reg.waiting)return finish(reg.waiting);if(w.state==="installed")return finish(w);if(w.state==="redundant")return finish(null);};
    w.addEventListener("statechange",inspect);const t=setTimeout(()=>finish(reg.waiting||null),timeout);inspect();
  });
}
async function registrationForTarget(target){
  let reg=await navigator.serviceWorker.getRegistration();
  if(!reg){reg=await navigator.serviceWorker.register("./service-worker.js?install="+encodeURIComponent(target),{updateViaCache:"none"});}
  state.registration=reg;
  try{await reg.update();}catch(e){console.warn("SW update",e);}
  let worker=reg.waiting||await waitInstalled(reg,15000);
  if(!worker&&reg.active){const b=await workerBuild(reg.active);if(b===target)return {reg,worker:reg.active,active:true};}
  if(worker){const b=await workerBuild(worker);if(b===target)return {reg,worker,active:worker.state==="activated"};}

  // Recovery is used only after all release files have been verified from the server.
  try{await reg.unregister();}catch(_){}
  reg=await navigator.serviceWorker.register("./service-worker.js?recovery="+encodeURIComponent(target)+"&t="+Date.now(),{updateViaCache:"none"});
  state.registration=reg;worker=reg.waiting||await waitInstalled(reg,18000);
  if(!worker&&reg.active)worker=reg.active;
  const b=await workerBuild(worker,3500);
  if(b!==target)throw new Error(`Service Worker chưa lên đúng build ${target}${b?` (đang là ${b})`:""}.`);
  return {reg,worker,active:worker?.state==="activated"};
}
async function saveBeforeUpdate(){try{if(typeof root.sagsSaveBeforeAppUpdate==="function")await root.sagsSaveBeforeAppUpdate();}catch(e){console.warn("save before update",e);}}
function reloadInto(target){
  if(state.reloadStarted)return;state.reloadStarted=true;
  saveBeforeUpdate().finally(()=>{
    const u=new URL(location.href);u.searchParams.set("__sags_build",target);u.searchParams.set("__sags_update",Date.now());location.replace(u.toString());
  });
}
async function apply(){
  if(state.busy)return;state.busy=true;setButton(false);
  try{
    await saveBeforeUpdate();
    const info=await releaseInfo();if(!info.ready)throw new Error("Máy chủ chưa đồng bộ xong bộ file cập nhật. Không chuyển phiên bản để tránh lỗi.");
    const target=info.build,cur=currentBuild(),cmp=cur?compareBuild(target,cur):1;
    if(cur&&(target===cur||(cmp!==null&&cmp<=0))){clearCompleted(cur);return;}
    await verifyAssets(target);
    const {worker,active}=await registrationForTarget(target);
    try{localStorage.setItem(APPLYING_KEY,target);}catch(_){}
    try{sessionStorage.removeItem(DISMISS_KEY);}catch(_){}
    let changed=false;
    const onChange=()=>{changed=true;reloadInto(target);};
    navigator.serviceWorker.addEventListener("controllerchange",onChange,{once:true});
    if(!active){try{worker.postMessage({type:"SKIP_WAITING"});}catch(_){};}
    else reloadInto(target);
    setTimeout(()=>{if(!changed)reloadInto(target);},10000);
  }catch(e){
    console.error("SAGS update",e);state.busy=false;setButton(true,state.display||"");
    alert("CẬP NHẬT CHƯA THỰC HIỆN\n\n"+(e?.message||e)+"\n\nDữ liệu đang nhập vẫn được giữ nguyên.");
  }
}
function dismiss(){
  if(state.target){try{sessionStorage.setItem(DISMISS_KEY,JSON.stringify({build:state.target,until:Date.now()+10*60*1000}));}catch(_){}}
  hidePrompt();
}
function installLegacyPromptGuard(){
  if(state.legacyGuard)return;state.legacyGuard=true;
  try{
    const guard=()=>{
      if(S(currentBuild())!==RELEASE_BUILD)return;
      const m=document.getElementById("appUpdateModal");
      if(m&&m.style.display!=="none")m.style.display="none";
      const b=document.getElementById("appUpdateNowBtn");if(b&&state.busy===false)b.disabled=false;
    };
    const modal=document.getElementById("appUpdateModal");
    if(modal){const mo=new MutationObserver(guard);mo.observe(modal,{attributes:true,attributeFilter:["style","class"]});state.legacyObserver=mo;}
    guard();
  }catch(_){}
}
let overrideAttempts=0;
function installOverrides(){
  if(state.installed)return;
  if(typeof root.applyAppUpdate!=="function"||!document.getElementById("appUpdateNowBtn")){
    const delays=[80,160,320,640,1200,2400,4800];
    if(overrideAttempts<delays.length)setTimeout(installOverrides,delays[overrideAttempts++]);
    return;
  }
  state.installed=true;installLegacyPromptGuard();
  root.applyAppUpdate=apply;
  root.dismissAppUpdate=dismiss;
  root.checkForNewestBuild=async function(reg){state.registration=reg||state.registration;return check();};
  document.addEventListener("click",e=>{
    const b=e.target?.closest?.("#appUpdateNowBtn");if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();apply();
  },true);
  setTimeout(()=>{syncRuntimeDisplay();check();},100);
  setInterval(check,CHECK_MS);
  addEventListener("online",check);
  addEventListener("pageshow",()=>{syncRuntimeDisplay();if(Date.now()-state.lastCheck>15000)check();});
  addEventListener("focus",()=>{syncRuntimeDisplay();if(Date.now()-state.lastCheck>15000)check();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){syncRuntimeDisplay();if(Date.now()-state.lastCheck>15000)check();}});
}

root.SAGSUpdateRuntime={build:RELEASE_BUILD,version:RELEASE_VERSION,display:RELEASE_DISPLAY,check,apply,releaseInfo,currentBuild,currentDisplay,compareBuild,syncRuntimeDisplay};
installOverrides();
})(typeof window!=="undefined"?window:globalThis);
