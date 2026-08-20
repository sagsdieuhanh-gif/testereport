/* E-REPORT SAGS · FLIGHT WORKSPACE · V1.90
   Architecture: AD creates the operational flight pair once.
   Each flight leg has a stable legId; pairing is a revisioned relation and may be re-paired.
   Existing KET SO / FINAL / CROSSCHECK / MVT / FSAGS workflows are opened unchanged.
*/
(function(root){
"use strict";

const VERSION="V1.90";
const BUILD="V1.90-20260820-01";
const ENGINE="SAGS_FLIGHT_WORKSPACE_V2";
const SCHEMA=2;
const DB_ROOT="flight_workspace_v2";
const ROSTER_MANIFEST="roster_manifests";
const ACTIVE_KEY="sagsFlightWorkspaceActiveV2";
const HOME_KEY="sagsFlightWorkspaceHomeShownV2";
const LOCAL_DAY_KEY="sagsFlightWorkspaceLocalDayV2";

const S=v=>String(v??"").trim();
const U=v=>S(v).toUpperCase();
const esc=v=>S(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch(_){return null;}};
const now=()=>Date.now();

let currentDay="";
let dayStore={legs:{},pairs:{},events:{}};
let roster=null;
let dayRef=null,rosterRef=null;
let dayCb=null,rosterCb=null;
let selectedPairId="";
let repairSelected=new Set();
let started=false;
let bootTimer=null;
let eventsPrimed=false;
let eventStartedAt=0;
let seenEvents=new Set();
let alertQueue=[];
let alertShowing=false;

function role(){
  try{return U((typeof currentRole!=="undefined"?currentRole:root.currentRole)||"");}catch(_){return U(root.currentRole||"");}
}
function username(){
  let v="";
  try{v=(typeof currentUserProfile!=="undefined"?currentUserProfile:root.currentUserProfile)?.username||"";}catch(_){v=root.currentUserProfile?.username||"";}
  try{return typeof normalizePersonalUsername==="function"?normalizePersonalUsername(v):U(v).replace(/\s+/g,"").replace(/[^A-Z0-9._-]/g,"_");}catch(_){return U(v).replace(/\s+/g,"");}
}
function isAD(){return role()==="AD";}
function safe(v){
  try{return typeof sagsV470Safe==="function"?sagsV470Safe(v):S(v).replace(/[.#$\[\]\/]/g,"_");}
  catch(_){return S(v).replace(/[.#$\[\]\/]/g,"_");}
}
function ownedKey(v){try{return typeof sagsOwnedKey==="function"?sagsOwnedKey(v):v;}catch(_){return v;}}
function rtdb(path){try{return typeof sagsV470Ref==="function"?sagsV470Ref(path):null;}catch(_){return null;}}
function cxrDay(ms=Date.now()){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Number(ms)||Date.now()));}
  catch(_){return new Date(Number(ms)||Date.now()).toISOString().slice(0,10);}
}
function isoDate(v){
  const x=S(v);let m=/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(x);
  if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(x);
  return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:"";
}
function fmtTime(v){
  let x=S(v).replace(/\s/g,"");if(!x)return "";
  if(/^\d{1,4}$/.test(x)){x=x.padStart(4,"0");const h=+x.slice(0,2),m=+x.slice(2);if(h<24&&m<60)return `${x.slice(0,2)}:${x.slice(2)}`;}
  const m=/^(\d{1,2}):(\d{2})$/.exec(x);if(m&&+m[1]<24&&+m[2]<60)return `${String(+m[1]).padStart(2,"0")}:${m[2]}`;
  return "";
}
function flightNo(v){return U(v).replace(/[^A-Z0-9]/g,"").slice(0,12);}
function station(v){return U(v).replace(/[^A-Z0-9]/g,"").slice(0,4);}
function uid(prefix){
  const c=(root.crypto&&typeof root.crypto.randomUUID==="function")?root.crypto.randomUUID().replace(/-/g,"").slice(0,12):Math.random().toString(36).slice(2,14);
  return `${prefix}_${Date.now().toString(36)}_${c}`.toUpperCase();
}
function tokens(v){
  const out=[],seen=new Set();let prefix="";
  for(const q0 of U(v).replace(/[\/]+/g," ").split(/[^A-Z0-9]+/).filter(Boolean)){
    const q=q0.replace(/[^A-Z0-9]/g,"");let m=/^([A-Z0-9]{2,3}?)(\d{1,5}[A-Z]?)$/.exec(q);
    if(m&&/[A-Z]/.test(m[1])){prefix=m[1];const f=prefix+m[2];if(!seen.has(f)){seen.add(f);out.push(f);}continue;}
    m=/^(\d{1,5}[A-Z]?)$/.exec(q);if(m&&prefix){const f=prefix+m[1];if(!seen.has(f)){seen.add(f);out.push(f);}}
  }
  return out;
}
function normalizeStore(v){
  const x=v&&typeof v==="object"?v:{};
  return {legs:x.legs&&typeof x.legs==="object"?x.legs:{},pairs:x.pairs&&typeof x.pairs==="object"?x.pairs:{},events:x.events&&typeof x.events==="object"?x.events:{}};
}
function localDayKey(day){return ownedKey(`${LOCAL_DAY_KEY}|${day}`);}
function loadLocal(day){try{return normalizeStore(JSON.parse(localStorage.getItem(localDayKey(day))||"{}"));}catch(_){return normalizeStore({});}}
function saveLocal(day,data){try{localStorage.setItem(localDayKey(day),JSON.stringify(normalizeStore(data)));}catch(_){}}
function toast(msg){try{if(typeof showToast==="function")return showToast(msg);}catch(_){}console.info("Flight Workspace:",msg);}
function deny(msg){try{if(typeof roleDenied==="function")return roleDenied(msg);}catch(_){}alert(msg);}
function sameArray(a,b){return JSON.stringify(a||[])===JSON.stringify(b||[]);}
function uniq(a){return [...new Set((a||[]).map(S).filter(Boolean))];}

function legAliases(leg){return uniq([leg?.flightNo,...(Array.isArray(leg?.aliases)?leg.aliases:[])]).map(flightNo).filter(Boolean);}
function pairLegs(pair){return (pair?.legIds||[]).map(id=>dayStore.legs?.[id]).filter(Boolean);}
function orderedLegIds(ids){
  const a=(ids||[]).filter(Boolean);
  return a.slice().sort((x,y)=>{const ax=dayStore.legs?.[x]?.direction==="ARR"?0:1,ay=dayStore.legs?.[y]?.direction==="ARR"?0:1;return ax-ay;});
}
function pairTitle(pair){const ls=pairLegs(pair);return ls.map(x=>x.flightNo||"?").join(" / ")||"CHUYẾN BAY";}
function pairRoute(pair){
  const ls=pairLegs(pair),arr=ls.find(x=>x.direction==="ARR")||ls[0],dep=ls.find(x=>x.direction==="DEP")||ls[1];
  return [arr?.origin,"CXR",dep?.destination].filter(Boolean).join(" - ");
}
function pairTimes(pair){const ls=pairLegs(pair),arr=ls.find(x=>x.direction==="ARR"),dep=ls.find(x=>x.direction==="DEP");return [arr?.sta?`STA ${arr.sta}`:"",dep?.std?`STD ${dep.std}`:""].filter(Boolean).join(" · ");}
function pairAircraft(pair){const ls=pairLegs(pair);const reg=ls.map(x=>x.acReg).find(Boolean)||"",type=ls.map(x=>x.acType).find(Boolean)||"";return [reg,type].filter(Boolean).join(" · ");}
function pairFlightTokens(pair){const out=[];for(const l of pairLegs(pair))out.push(...legAliases(l));return uniq(out);}
function validOperationalPair(ids){
  const ls=(ids||[]).map(id=>dayStore.legs?.[id]).filter(Boolean);
  if(ls.length!==2)return false;
  return ls.some(x=>x.direction==="ARR")&&ls.some(x=>x.direction==="DEP");
}
function planRepair(pair1,pair2,first,partner,legs=dayStore.legs){
  const all=uniq([...(pair1?.legIds||[]),...(pair2?.legIds||[])]),rest=all.filter(x=>x!==first&&x!==partner);
  const order=ids=>(ids||[]).filter(Boolean).slice().sort((x,y)=>((legs?.[x]?.direction==="ARR"?0:1)-(legs?.[y]?.direction==="ARR"?0:1)));
  const valid=ids=>{const xs=(ids||[]).map(id=>legs?.[id]).filter(Boolean);return xs.length===2&&xs.some(x=>x.direction==="ARR")&&xs.some(x=>x.direction==="DEP");};
  const new1=order([first,partner]),new2=order(rest);
  return {all,new1,new2,valid:new Set(all).size===4&&first!==partner&&valid(new1)&&valid(new2)};
}

function sessionEnvelope(meta){try{return typeof readFlightSessionEnvelope==="function"?readFlightSessionEnvelope(meta?.id):null;}catch(_){return null;}}
function sessionList(){try{return typeof readFlightSessionList==="function"?(readFlightSessionList()||[]):[];}catch(_){return [];}}
function stateVal(st,...keys){for(const k of keys)if(S(st?.[k]))return S(st[k]);return "";}
function sessionIdentity(meta){
  const env=sessionEnvelope(meta),st=env?.state||{};
  const before=stateVal(st,"fltBefore","f09_fltBefore","f421_fltBefore","f551_fltBefore");
  const after=stateVal(st,"fltAfter","f09_fltAfter","f421_fltAfter","f551_fltAfter");
  const name=S(meta?.name)||[before,after].filter(Boolean).join(" / ");
  const d=S(meta?.rosterOpDate)||isoDate(stateVal(st,"date","f09_date","f421_date","f551_date"))||cxrDay(Number(meta?.createdAt)||Date.now());
  return {date:d,tokens:uniq([...tokens(before),...tokens(after),...tokens(name)]),group:S(meta?.initialGroup||env?.mainForm||env?.activeFormGroup||""),assignmentId:S(meta?.rosterAssignmentId),name,meta};
}
function localSessionsForPair(pair){
  const pTok=new Set(pairFlightTokens(pair));
  return sessionList().map(sessionIdentity).filter(x=>x.date===currentDay&&x.tokens.some(f=>pTok.has(f)));
}
function assignmentItemsForPair(pair){
  const pTok=new Set(pairFlightTokens(pair)),me=username(),ad=isAD();
  return Object.values(roster?.items||{}).filter(Boolean).filter(a=>{
    if(!ad&&U(a.user)!==U(me))return false;
    return tokens(`${a.flightRaw||""} ${a.flightName||""}`).some(f=>pTok.has(f));
  });
}
function formLabel(g){const x=U(g);return x==="FSAGS421"?"F/SAGS 42.1":x==="FSAGS551"?"F/SAGS 55.1":x==="FSAGS09"?"F/SAGS-CXR/09":x==="FSAGS"?"F/SAGS 42.3":/FINAL/.test(x)?"FINAL":S(g)||"HỒ SƠ CHUYẾN";}

function activeContext(){try{return JSON.parse(localStorage.getItem(ownedKey(ACTIVE_KEY))||"null");}catch(_){return null;}}
function setActive(pair){
  if(!pair)return;
  const ls=pairLegs(pair),ctx={engine:ENGINE,schema:SCHEMA,pairId:pair.pairId,opDate:currentDay,legIds:(pair.legIds||[]).slice(),flightNos:ls.map(x=>x.flightNo).filter(Boolean),route:pairRoute(pair),revision:Number(pair.revision)||1,needsReview:pair.needsReview===true,selectedAtMs:now()};
  try{localStorage.setItem(ownedKey(ACTIVE_KEY),JSON.stringify(ctx));}catch(_){}
  try{root.dispatchEvent(new CustomEvent("sags:flight-workspace-changed",{detail:ctx}));}catch(_){}
}

function eventSummary(type,before,after){
  if(type==="PAIR_REPAIRED")return `${before} → ${after}`;
  if(type==="OPS_UPDATED")return `Thông tin khai thác ${before} → ${after}`;
  return after||before||"Cập nhật chuyến bay";
}
function makeEvent(type,pairIds,summary,extra={}){
  const id=uid("EVT");return {eventId:id,type,pairIds:uniq(pairIds),opDate:currentDay,summary:S(summary),by:username()||"AD",eventAtMs:now(),appVersion:VERSION,...extra};
}
async function commit(changes,applyLocal){
  const ref=rtdb("");
  if(ref&&typeof ref.update==="function"){
    try{await ref.update(changes);if(typeof applyLocal==="function")applyLocal();return true;}
    catch(e){console.error("Flight Workspace write",e);throw e;}
  }
  if(typeof applyLocal==="function")applyLocal();saveLocal(currentDay,dayStore);return true;
}
function basePath(suffix=""){return `${DB_ROOT}/days/${safe(currentDay)}${suffix?"/"+suffix:""}`;}

function createPairFromForm(){
  if(!isAD())return deny("Chỉ AD được tạo chuyến bay.");
  const arrNo=flightNo(document.getElementById("fwCreateArrNo")?.value),depNo=flightNo(document.getElementById("fwCreateDepNo")?.value);
  const origin=station(document.getElementById("fwCreateOrigin")?.value),dest=station(document.getElementById("fwCreateDest")?.value);
  const sta=fmtTime(document.getElementById("fwCreateSta")?.value),std=fmtTime(document.getElementById("fwCreateStd")?.value);
  const reg=U(document.getElementById("fwCreateReg")?.value).replace(/\s+/g,""),type=U(document.getElementById("fwCreateType")?.value),bay=S(document.getElementById("fwCreateBay")?.value),gate=S(document.getElementById("fwCreateGate")?.value);
  if(!arrNo||!depNo)return setFormStatus("fwCreateStatus","Cần nhập đủ số hiệu chuyến đến và chuyến đi.",true);
  if(!origin||!dest)return setFormStatus("fwCreateStatus","Cần nhập chặng đến CXR và chặng đi từ CXR.",true);
  if(!sta||!std)return setFormStatus("fwCreateStatus","STA/STD chưa hợp lệ. Dùng HH:MM.",true);
  const duplicate=Object.values(dayStore.pairs||{}).some(p=>{const t=pairFlightTokens(p);return t.includes(arrNo)&&t.includes(depNo)&&p.status!=="CANCELLED";});
  if(duplicate)return setFormStatus("fwCreateStatus","Cặp chuyến này đã có trong Flight Workspace hôm nay.",true);
  const t=now(),arrId=uid("LEG"),depId=uid("LEG"),pairId=uid("PAIR");
  const common={opDate:currentDay,acReg:reg,acType:type,bay,gate,status:"ACTIVE",revision:1,createdBy:username()||"AD",createdAtMs:t,updatedAtMs:t};
  const arr={...common,legId:arrId,pairId,direction:"ARR",flightNo:arrNo,aliases:[arrNo],origin,destination:"CXR",sta,std:""};
  const dep={...common,legId:depId,pairId,direction:"DEP",flightNo:depNo,aliases:[depNo],origin:"CXR",destination:dest,sta:"",std};
  const pair={engine:ENGINE,schema:SCHEMA,pairId,opDate:currentDay,legIds:[arrId,depId],revision:1,status:"ACTIVE",needsReview:false,reviewFlags:{},createdBy:username()||"AD",createdAtMs:t,updatedAtMs:t};
  const ev=makeEvent("PAIR_CREATED",[pairId],`${arrNo}/${depNo} · ${origin}-CXR-${dest}`);
  const patch={};patch[`${basePath("legs")}/${safe(arrId)}`]=arr;patch[`${basePath("legs")}/${safe(depId)}`]=dep;patch[`${basePath("pairs")}/${safe(pairId)}`]=pair;patch[`${basePath("events")}/${safe(ev.eventId)}`]=ev;
  setFormStatus("fwCreateStatus","Đang tạo Flight Workspace…");
  commit(patch,()=>{dayStore.legs[arrId]=arr;dayStore.legs[depId]=dep;dayStore.pairs[pairId]=pair;dayStore.events[ev.eventId]=ev;}).then(()=>{selectedPairId=pairId;closeEditor("fwCreateModal");render();toast(`Đã tạo ${arrNo} / ${depNo}.`);}).catch(e=>setFormStatus("fwCreateStatus","Không tạo được chuyến: "+S(e?.message||e),true));
}

function openCreate(){
  if(!isAD())return deny("Chỉ AD được tạo chuyến bay.");installUi();
  ["fwCreateArrNo","fwCreateOrigin","fwCreateSta","fwCreateDepNo","fwCreateDest","fwCreateStd","fwCreateReg","fwCreateType","fwCreateBay","fwCreateGate"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  setFormStatus("fwCreateStatus",`Ngày khai thác: ${currentDay}. AD tạo chuyến một lần; các bộ phận khác chỉ vào chuyến để làm phần việc.`);
  document.getElementById("fwCreateModal")?.classList.add("show");
}

function openEdit(pairId){
  if(!isAD())return deny("Chỉ AD được cập nhật thông tin khai thác.");
  const p=dayStore.pairs?.[pairId];if(!p)return;
  const ls=pairLegs(p),arr=ls.find(x=>x.direction==="ARR"),dep=ls.find(x=>x.direction==="DEP");if(!arr||!dep)return;
  installUi();
  document.getElementById("fwEditPairId").value=pairId;
  document.getElementById("fwEditArrNo").value=arr.flightNo||"";document.getElementById("fwEditOrigin").value=arr.origin||"";document.getElementById("fwEditSta").value=arr.sta||"";
  document.getElementById("fwEditDepNo").value=dep.flightNo||"";document.getElementById("fwEditDest").value=dep.destination||"";document.getElementById("fwEditStd").value=dep.std||"";
  document.getElementById("fwEditReg").value=arr.acReg||dep.acReg||"";document.getElementById("fwEditType").value=arr.acType||dep.acType||"";document.getElementById("fwEditBay").value=arr.bay||dep.bay||"";document.getElementById("fwEditGate").value=arr.gate||dep.gate||"";
  setFormStatus("fwEditStatus","Có thể đổi số hiệu, chặng, STA/STD, A/C Reg/Type. Hệ thống giữ legId và lưu revision.");
  document.getElementById("fwEditModal")?.classList.add("show");
}
function saveEdit(){
  if(!isAD())return deny("Chỉ AD được cập nhật thông tin khai thác.");
  const pairId=S(document.getElementById("fwEditPairId")?.value),p=dayStore.pairs?.[pairId];if(!p)return;
  const ls=pairLegs(p),arr=ls.find(x=>x.direction==="ARR"),dep=ls.find(x=>x.direction==="DEP");if(!arr||!dep)return;
  const vals={arrNo:flightNo(document.getElementById("fwEditArrNo")?.value),origin:station(document.getElementById("fwEditOrigin")?.value),sta:fmtTime(document.getElementById("fwEditSta")?.value),depNo:flightNo(document.getElementById("fwEditDepNo")?.value),dest:station(document.getElementById("fwEditDest")?.value),std:fmtTime(document.getElementById("fwEditStd")?.value),reg:U(document.getElementById("fwEditReg")?.value).replace(/\s+/g,""),type:U(document.getElementById("fwEditType")?.value),bay:S(document.getElementById("fwEditBay")?.value),gate:S(document.getElementById("fwEditGate")?.value)};
  if(!vals.arrNo||!vals.depNo||!vals.origin||!vals.dest||!vals.sta||!vals.std)return setFormStatus("fwEditStatus","Thông tin số hiệu/chặng/STA/STD chưa đầy đủ hoặc chưa hợp lệ.",true);
  const before=`${pairTitle(p)} · ${pairRoute(p)}`;
  const t=now(),rev=(Number(p.revision)||1)+1;
  const nextArr={...arr,flightNo:vals.arrNo,aliases:uniq([...legAliases(arr),arr.flightNo,vals.arrNo]),origin:vals.origin,destination:"CXR",sta:vals.sta,acReg:vals.reg,acType:vals.type,bay:vals.bay,gate:vals.gate,revision:(Number(arr.revision)||1)+1,updatedAtMs:t,updatedBy:username()||"AD"};
  const nextDep={...dep,flightNo:vals.depNo,aliases:uniq([...legAliases(dep),dep.flightNo,vals.depNo]),origin:"CXR",destination:vals.dest,std:vals.std,acReg:vals.reg,acType:vals.type,bay:vals.bay,gate:vals.gate,revision:(Number(dep.revision)||1)+1,updatedAtMs:t,updatedBy:username()||"AD"};
  const tmpStore=dayStore;dayStore={...dayStore,legs:{...dayStore.legs,[arr.legId]:nextArr,[dep.legId]:nextDep}};const after=`${pairTitle(p)} · ${pairRoute(p)}`;dayStore=tmpStore;
  const flag={kind:"OPS_UPDATED",atMs:t,by:username()||"AD",revision:rev};
  const nextPair={...p,revision:rev,needsReview:true,reviewFlags:{...(p.reviewFlags||{}),opsChanged:flag},updatedAtMs:t,updatedBy:username()||"AD"};
  const ev=makeEvent("OPS_UPDATED",[pairId],eventSummary("OPS_UPDATED",before,after),{revision:rev,before:{pair:before},after:{pair:after}});
  const patch={};patch[`${basePath("legs")}/${safe(arr.legId)}`]=nextArr;patch[`${basePath("legs")}/${safe(dep.legId)}`]=nextDep;patch[`${basePath("pairs")}/${safe(pairId)}`]=nextPair;patch[`${basePath("events")}/${safe(ev.eventId)}`]=ev;
  setFormStatus("fwEditStatus","Đang lưu revision mới…");
  commit(patch,()=>{dayStore.legs[arr.legId]=nextArr;dayStore.legs[dep.legId]=nextDep;dayStore.pairs[pairId]=nextPair;dayStore.events[ev.eventId]=ev;}).then(()=>{closeEditor("fwEditModal");render();toast("Đã cập nhật khai thác. Các phần phụ thuộc cặp chuyến được đánh dấu CẦN KIỂM TRA LẠI.");}).catch(e=>setFormStatus("fwEditStatus","Không lưu được: "+S(e?.message||e),true));
}

function toggleRepair(pairId,checked){
  if(!isAD())return;if(checked)repairSelected.add(pairId);else repairSelected.delete(pairId);
  if(repairSelected.size>2){repairSelected.delete(pairId);const cb=document.querySelector(`[data-fw-repair='${CSS.escape(pairId)}']`);if(cb)cb.checked=false;toast("Chỉ chọn 2 cặp để ĐỔI CẶP.");}
  renderRepairAction();
}
function renderRepairAction(){const b=document.getElementById("fwRepairBtn");if(b){b.disabled=repairSelected.size!==2;b.textContent=repairSelected.size?`🔀 ĐỔI CẶP (${repairSelected.size}/2)`:"🔀 ĐỔI CẶP";}}
function openRepair(){
  if(!isAD())return deny("Chỉ AD được đổi cặp chuyến.");if(repairSelected.size!==2)return toast("Chọn đúng 2 cặp chuyến trước.");
  const [id1,id2]=[...repairSelected],p1=dayStore.pairs[id1],p2=dayStore.pairs[id2];if(!p1||!p2)return;
  const ids=uniq([...(p1.legIds||[]),...(p2.legIds||[])]);if(ids.length!==4)return toast("ĐỔI CẶP cần 2 cặp đầy đủ, tổng cộng 4 chuyến đơn khác nhau.");
  const first=document.getElementById("fwRepairFirst");if(!first)return;
  first.innerHTML=ids.map(id=>{const l=dayStore.legs[id];return `<option value="${esc(id)}">${esc(l?.flightNo||id)} · ${esc(l?.direction||"")} · ${esc(l?.origin||"")}→${esc(l?.destination||"")}</option>`;}).join("");
  first.value=p1.legIds?.[0]||ids[0];
  document.getElementById("fwRepairPair1").value=id1;document.getElementById("fwRepairPair2").value=id2;
  document.getElementById("fwRepairOld").textContent=`Hiện tại: ${pairTitle(p1)}  +  ${pairTitle(p2)}`;
  rebuildRepairPartner();
  setFormStatus("fwRepairStatus","Chọn 2 chuyến đơn để tạo cặp mới thứ nhất. Hai chuyến còn lại tự tạo cặp thứ hai. Bốn legId đều được giữ nguyên.");
  updateRepairPreview();document.getElementById("fwRepairModal")?.classList.add("show");
}
function rebuildRepairPartner(){
  const id1=S(document.getElementById("fwRepairPair1")?.value),id2=S(document.getElementById("fwRepairPair2")?.value),p1=dayStore.pairs[id1],p2=dayStore.pairs[id2],first=S(document.getElementById("fwRepairFirst")?.value),sel=document.getElementById("fwRepairPartner");if(!p1||!p2||!first||!sel)return;
  const ids=uniq([...(p1.legIds||[]),...(p2.legIds||[])]),old=sel.value,dir=dayStore.legs[first]?.direction;
  sel.innerHTML=ids.filter(x=>x!==first).map(id=>{const l=dayStore.legs[id];return `<option value="${esc(id)}">${esc(l?.flightNo||id)} · ${esc(l?.direction||"")} · ${esc(l?.origin||"")}→${esc(l?.destination||"")}</option>`;}).join("");
  if(old&&ids.includes(old)&&old!==first)sel.value=old;else{const preferred=ids.find(id=>id!==first&&dayStore.legs[id]?.direction&&dayStore.legs[id].direction!==dir);if(preferred)sel.value=preferred;}
  updateRepairPreview();
}
function updateRepairPreview(){
  const id1=S(document.getElementById("fwRepairPair1")?.value),id2=S(document.getElementById("fwRepairPair2")?.value),first=S(document.getElementById("fwRepairFirst")?.value),partner=S(document.getElementById("fwRepairPartner")?.value);
  const p1=dayStore.pairs[id1],p2=dayStore.pairs[id2];if(!p1||!p2||!first||!partner)return;
  const plan=planRepair(p1,p2,first,partner),n1=plan.new1,n2=plan.new2;
  const name=ids=>ids.map(id=>dayStore.legs[id]?.flightNo||"?").join(" / ");const e=document.getElementById("fwRepairPreview");if(e)e.textContent=`Mới: ${name(n1)}  +  ${name(n2)}`;
  setFormStatus("fwRepairStatus",plan.valid?"Hai cặp mới hợp lệ: mỗi cặp có 1 chuyến đến + 1 chuyến đi.":"Cặp mới chưa hợp lệ: mỗi cặp phải có đúng 1 chuyến đến và 1 chuyến đi.",!plan.valid);
}
function saveRepair(){
  if(!isAD())return deny("Chỉ AD được đổi cặp chuyến.");
  const id1=S(document.getElementById("fwRepairPair1")?.value),id2=S(document.getElementById("fwRepairPair2")?.value),first=S(document.getElementById("fwRepairFirst")?.value),partner=S(document.getElementById("fwRepairPartner")?.value),p1=dayStore.pairs[id1],p2=dayStore.pairs[id2];if(!p1||!p2)return;
  const plan=planRepair(p1,p2,first,partner),new1=plan.new1,new2=plan.new2;if(!plan.valid)return setFormStatus("fwRepairStatus","Không thể xác nhận: cặp mới phải gồm 1 chuyến đến + 1 chuyến đi.",true);
  const oldLabel=`${pairTitle(p1)} + ${pairTitle(p2)}`,name=ids=>ids.map(id=>dayStore.legs[id]?.flightNo||"?").join(" / "),newLabel=`${name(new1)} + ${name(new2)}`,t=now(),by=username()||"AD";
  const np1={...p1,legIds:new1,revision:(Number(p1.revision)||1)+1,needsReview:true,reviewFlags:{...(p1.reviewFlags||{}),repaired:{kind:"PAIR_REPAIRED",atMs:t,by}},updatedAtMs:t,updatedBy:by};
  const np2={...p2,legIds:new2,revision:(Number(p2.revision)||1)+1,needsReview:true,reviewFlags:{...(p2.reviewFlags||{}),repaired:{kind:"PAIR_REPAIRED",atMs:t,by}},updatedAtMs:t,updatedBy:by};
  const nextLegs={};for(const id of new1)nextLegs[id]={...dayStore.legs[id],pairId:id1,updatedAtMs:t,updatedBy:by};for(const id of new2)nextLegs[id]={...dayStore.legs[id],pairId:id2,updatedAtMs:t,updatedBy:by};
  const ev=makeEvent("PAIR_REPAIRED",[id1,id2],eventSummary("PAIR_REPAIRED",oldLabel,newLabel),{before:{pair1:p1.legIds,pair2:p2.legIds,label:oldLabel},after:{pair1:new1,pair2:new2,label:newLabel}});
  const patch={};patch[`${basePath("pairs")}/${safe(id1)}`]=np1;patch[`${basePath("pairs")}/${safe(id2)}`]=np2;for(const [id,l] of Object.entries(nextLegs))patch[`${basePath("legs")}/${safe(id)}`]=l;patch[`${basePath("events")}/${safe(ev.eventId)}`]=ev;
  setFormStatus("fwRepairStatus","Đang đổi cặp và lưu revision…");
  commit(patch,()=>{dayStore.pairs[id1]=np1;dayStore.pairs[id2]=np2;Object.assign(dayStore.legs,nextLegs);dayStore.events[ev.eventId]=ev;}).then(()=>{repairSelected.clear();closeEditor("fwRepairModal");render();toast(`Đã đổi cặp: ${oldLabel} → ${newLabel}.`);}).catch(e=>setFormStatus("fwRepairStatus","Không đổi cặp được: "+S(e?.message||e),true));
}

function setFormStatus(id,msg,err=false){const e=document.getElementById(id);if(e){e.textContent=msg||"";e.className="fwFormStatus"+(err?" err":"");}}
function closeEditor(id){document.getElementById(id)?.classList.remove("show");}

function installUi(){
  if(!document.getElementById("fw190Style")){
    const style=document.createElement("style");style.id="fw190Style";style.textContent=`
#fwHome,#fwCreateModal,#fwEditModal,#fwRepairModal,#fwGuideModal,#fwAlertModal{display:none;position:fixed;inset:0;z-index:16880;background:rgba(4,18,32,.72);font-family:Arial,sans-serif;color:#17324d;box-sizing:border-box}#fwHome.show,#fwCreateModal.show,#fwEditModal.show,#fwRepairModal.show,#fwGuideModal.show,#fwAlertModal.show{display:flex}.fwShell{width:100%;height:100%;background:#f3f7fa;display:grid;grid-template-rows:auto 1fr;overflow:hidden}.fwTop{background:#fff;border-bottom:1px solid #d7e1e9;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));display:flex;gap:10px;justify-content:space-between;align-items:center}.fwTitle{font-size:20px;font-weight:900;color:#075b9f}.fwVersion{display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;background:#e7f2fb;color:#075b9f;font-size:11px;font-weight:900}.fwSub{font-size:12px;color:#667a8b;line-height:1.4}.fwTopActions,.fwActions{display:flex;gap:7px;flex-wrap:wrap}.fwBtn{border:0;border-radius:9px;padding:9px 11px;background:#0b67b2;color:#fff;font-weight:800;cursor:pointer}.fwBtn.gray{background:#e9eef2;color:#345}.fwBtn.green{background:#167a48}.fwBtn.orange{background:#b65c08}.fwBtn.red{background:#b42318}.fwBtn:disabled{opacity:.45;cursor:not-allowed}.fwBody{display:grid;grid-template-columns:minmax(310px,38%) 1fr;min-height:0}.fwList,.fwDetail{overflow:auto;padding:11px}.fwList{border-right:1px solid #d7e1e9}.fwCard,.fwPanel{background:#fff;border:1px solid #d5e0e8;border-radius:12px;padding:11px;margin-bottom:9px;box-shadow:0 1px 2px rgba(0,0,0,.025)}.fwCard{cursor:pointer}.fwCard.sel{border:2px solid #0b67b2;padding:10px}.fwCardTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.fwFlight{font-size:17px;font-weight:900;color:#075b9f}.fwMeta{font-size:12px;line-height:1.45;color:#66798b}.fwPill{display:inline-block;border-radius:999px;padding:4px 7px;background:#e8f3fb;color:#075b9f;font-size:11px;font-weight:900}.fwPill.warn{background:#fff1da;color:#985300}.fwPill.red{background:#fee4e2;color:#b42318}.fwTask{display:flex;justify-content:space-between;gap:9px;align-items:center;border:1px solid #dbe4eb;border-radius:10px;padding:9px;margin-top:8px}.fwWarn{border:1px solid #f2b8b5;background:#fff2f1;color:#9f1d18;border-radius:10px;padding:10px;margin:9px 0;font-size:13px;font-weight:700;line-height:1.45}.fwEmpty{padding:20px;text-align:center;color:#66798b}.fwRepairPick{display:flex;align-items:center;gap:5px;margin-top:7px;font-size:12px;font-weight:800;color:#43576a}.fwRepairPick input{width:18px;height:18px}.fwFloating{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:16780;border:0;border-radius:999px;padding:12px 15px;background:#075fa7;color:#fff;font:900 13px Arial;box-shadow:0 8px 24px #0004}.fwRoleButton{background:#075fa7!important;color:#fff!important;font-weight:900!important}.fwEditor{margin:auto;width:min(94vw,760px);max-height:92vh;overflow:auto;background:#fff;border-radius:15px;padding:14px;box-sizing:border-box}.fwEditor h3{margin:0 0 4px;color:#075b9f}.fwGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.fwField{border:1px solid #dce4ea;border-radius:10px;padding:9px;background:#f9fbfc}.fwField label{display:block;font-size:11px;font-weight:900;color:#42576a;margin-bottom:4px}.fwField input,.fwField select{width:100%;box-sizing:border-box;border:1px solid #c7d3dc;border-radius:8px;padding:9px;background:#fff;font:14px Arial}.fwSpan2{grid-column:1/-1}.fwFormStatus{margin:10px 0;padding:9px;border-radius:9px;background:#eef7ff;color:#345f80;font-size:12px;line-height:1.45}.fwFormStatus.err{background:#fff0ef;color:#a11f18;font-weight:700}.fwGuide{font-size:13px;line-height:1.55}.fwGuide h4{margin:12px 0 5px;color:#075b9f}.fwAlertBox{margin:auto;width:min(92vw,520px);background:#fff;border-radius:15px;padding:16px;box-shadow:0 18px 50px #0005}.fwAlertBox h3{margin:0 0 8px;color:#b42318}.fwAlertText{font-size:14px;line-height:1.55;white-space:pre-wrap}.fwDebug{font-size:10px;color:#8796a4;margin-top:5px}
@media(max-width:760px){.fwTop{align-items:flex-start}.fwTitle{font-size:17px}.fwBody{grid-template-columns:1fr;grid-template-rows:42% 1fr}.fwList{border-right:0;border-bottom:1px solid #d7e1e9}.fwGrid{grid-template-columns:1fr}.fwSpan2{grid-column:auto}.fwTask{align-items:flex-start;flex-direction:column}.fwTask .fwBtn{width:100%}.fwTopActions .fwBtn{padding:8px 9px;font-size:11px}.fwEditor{width:100vw;max-height:100dvh;height:auto;border-radius:15px 15px 0 0;margin:auto 0 0;padding-bottom:max(14px,env(safe-area-inset-bottom))}}
`;
    document.head.appendChild(style);
  }
  if(!document.getElementById("fwHome")){
    const h=document.createElement("div");h.id="fwHome";h.innerHTML=`<div class="fwShell"><div class="fwTop"><div><div class="fwTitle">✈️ CHUYẾN BAY HÔM NAY <span class="fwVersion">V1.90</span></div><div class="fwSub" id="fwHeaderSub"></div><div class="fwDebug">Flight Workspace build ${BUILD}</div></div><div class="fwTopActions"><button class="fwBtn green" id="fwCreateBtn" onclick="SAGSFlightWorkspace.openCreate()">＋ TẠO CHUYẾN</button><button class="fwBtn orange" id="fwRepairBtn" onclick="SAGSFlightWorkspace.openRepair()" disabled>🔀 ĐỔI CẶP</button><button class="fwBtn gray" onclick="SAGSFlightWorkspace.openGuide()">HDSD</button><button class="fwBtn gray" onclick="SAGSFlightWorkspace.close()">ĐÓNG</button></div></div><div class="fwBody"><div class="fwList" id="fwList"></div><div class="fwDetail" id="fwDetail"></div></div></div>`;document.body.appendChild(h);
  }
  if(!document.getElementById("fwCreateModal")){
    const m=document.createElement("div");m.id="fwCreateModal";m.innerHTML=`<div class="fwEditor"><h3>＋ AD · TẠO CHUYẾN BAY</h3><div class="fwSub">Tạo một lần từ đầu. Hệ thống sinh legId cố định cho chuyến đến và chuyến đi.</div><div class="fwGrid"><div class="fwField"><label>CHUYẾN ĐẾN</label><input id="fwCreateArrNo" placeholder="VD: VN1346"></div><div class="fwField"><label>CHẶNG ĐẾN CXR</label><input id="fwCreateOrigin" placeholder="VD: HAN"></div><div class="fwField"><label>STA</label><input id="fwCreateSta" placeholder="08:10"></div><div class="fwField"><label>CHUYẾN ĐI</label><input id="fwCreateDepNo" placeholder="VD: VN1347"></div><div class="fwField"><label>CHẶNG ĐI TỪ CXR</label><input id="fwCreateDest" placeholder="VD: SGN"></div><div class="fwField"><label>STD</label><input id="fwCreateStd" placeholder="09:05"></div><div class="fwField"><label>A/C REG</label><input id="fwCreateReg" placeholder="VD: VN-Axxx"></div><div class="fwField"><label>A/C TYPE</label><input id="fwCreateType" placeholder="VD: A321"></div><div class="fwField"><label>BAY</label><input id="fwCreateBay"></div><div class="fwField"><label>GATE</label><input id="fwCreateGate"></div></div><div id="fwCreateStatus" class="fwFormStatus"></div><div class="fwActions" style="justify-content:flex-end"><button class="fwBtn gray" onclick="SAGSFlightWorkspace.closeEditor('fwCreateModal')">HỦY</button><button class="fwBtn green" onclick="SAGSFlightWorkspace.createPairFromForm()">TẠO FLIGHT WORKSPACE</button></div></div>`;document.body.appendChild(m);
  }
  if(!document.getElementById("fwEditModal")){
    const m=document.createElement("div");m.id="fwEditModal";m.innerHTML=`<div class="fwEditor"><h3>✏️ AD · CẬP NHẬT KHAI THÁC</h3><div class="fwSub">Không đổi legId. Mỗi lần thay số hiệu/chặng/tàu bay/giờ khai thác sẽ tăng revision và đánh dấu cần kiểm tra lại dữ liệu phụ thuộc.</div><input type="hidden" id="fwEditPairId"><div class="fwGrid"><div class="fwField"><label>CHUYẾN ĐẾN</label><input id="fwEditArrNo"></div><div class="fwField"><label>CHẶNG ĐẾN CXR</label><input id="fwEditOrigin"></div><div class="fwField"><label>STA</label><input id="fwEditSta"></div><div class="fwField"><label>CHUYẾN ĐI</label><input id="fwEditDepNo"></div><div class="fwField"><label>CHẶNG ĐI TỪ CXR</label><input id="fwEditDest"></div><div class="fwField"><label>STD</label><input id="fwEditStd"></div><div class="fwField"><label>A/C REG</label><input id="fwEditReg"></div><div class="fwField"><label>A/C TYPE</label><input id="fwEditType"></div><div class="fwField"><label>BAY</label><input id="fwEditBay"></div><div class="fwField"><label>GATE</label><input id="fwEditGate"></div></div><div id="fwEditStatus" class="fwFormStatus"></div><div class="fwActions" style="justify-content:flex-end"><button class="fwBtn gray" onclick="SAGSFlightWorkspace.closeEditor('fwEditModal')">HỦY</button><button class="fwBtn green" onclick="SAGSFlightWorkspace.saveEdit()">LƯU REVISION</button></div></div>`;document.body.appendChild(m);
  }
  if(!document.getElementById("fwRepairModal")){
    const m=document.createElement("div");m.id="fwRepairModal";m.innerHTML=`<div class="fwEditor"><h3>🔀 AD · ĐỔI CẶP CHUYẾN</h3><div class="fwSub" id="fwRepairOld"></div><input type="hidden" id="fwRepairPair1"><input type="hidden" id="fwRepairPair2"><div class="fwGrid"><div class="fwField"><label>CHUYẾN THỨ NHẤT CỦA CẶP MỚI</label><select id="fwRepairFirst" onchange="SAGSFlightWorkspace.rebuildRepairPartner()"></select></div><div class="fwField"><label>CHUYẾN GHÉP CÙNG</label><select id="fwRepairPartner" onchange="SAGSFlightWorkspace.updateRepairPreview()"></select></div><div class="fwPanel fwSpan2" style="margin:0"><b id="fwRepairPreview"></b></div></div><div id="fwRepairStatus" class="fwFormStatus"></div><div class="fwActions" style="justify-content:flex-end"><button class="fwBtn gray" onclick="SAGSFlightWorkspace.closeEditor('fwRepairModal')">HỦY</button><button class="fwBtn orange" onclick="SAGSFlightWorkspace.saveRepair()">XÁC NHẬN ĐỔI CẶP</button></div></div>`;document.body.appendChild(m);
  }
  if(!document.getElementById("fwGuideModal")){
    const m=document.createElement("div");m.id="fwGuideModal";m.innerHTML=`<div class="fwEditor fwGuide"><h3>HDSD · FLIGHT WORKSPACE V1.90</h3><h4>1. Ai tạo chuyến?</h4><div>Chỉ <b>AD</b> tạo chuyến ban đầu. DAILY ROSTER không tự tạo chuyến; roster chỉ hỗ trợ phân phần việc vào chuyến đã tồn tại.</div><h4>2. Một chuyến được nhận diện thế nào?</h4><div>Mỗi chuyến đơn có <b>legId cố định</b>. Flight No, route, A/C Reg, A/C Type, STA/STD là thông tin có thể thay đổi bằng revision, không phải ID chính.</div><h4>3. Đổi tàu bay / đổi chặng / đổi số hiệu</h4><div>AD chọn chuyến → <b>CẬP NHẬT KHAI THÁC</b>. Hệ thống giữ legId, lưu revision và đánh dấu các dữ liệu phụ thuộc là <b>CẦN KIỂM TRA LẠI</b>.</div><h4>4. Đổi cặp A-B + C-D → A-C + B-D</h4><div>AD đánh dấu đúng 2 cặp → <b>ĐỔI CẶP</b> → chọn chuyến ghép mới với chuyến neo. Bốn legId được giữ nguyên; chỉ quan hệ pairing đổi. Hai workspace liên quan được đánh dấu cần kiểm tra lại.</div><h4>5. Nhân viên làm việc</h4><div>Nhân viên vào <b>CHUYẾN BAY HÔM NAY</b> → chọn chuyến → xem <b>PHẦN VIỆC CỦA BẠN</b> → MỞ PHẦN VIỆC. Các bước KẾT SỔ / FINAL / CROSSCHECK / MVT / FSAGS vẫn chạy đúng luồng của bản hiện tại.</div><div class="fwActions" style="justify-content:flex-end;margin-top:14px"><button class="fwBtn" onclick="SAGSFlightWorkspace.closeEditor('fwGuideModal')">ĐÓNG</button></div></div>`;document.body.appendChild(m);
  }
  if(!document.getElementById("fwAlertModal")){
    const m=document.createElement("div");m.id="fwAlertModal";m.innerHTML=`<div class="fwAlertBox"><h3>⚠️ THÔNG TIN CHUYẾN ĐÃ THAY ĐỔI</h3><div class="fwAlertText" id="fwAlertText"></div><div class="fwActions" style="justify-content:flex-end;margin-top:14px"><button class="fwBtn red" onclick="SAGSFlightWorkspace.ackAlert()">ĐÃ BIẾT</button></div></div>`;document.body.appendChild(m);
  }
}

function ensureEntry(){
  if(!role())return;
  const bar=document.querySelector(".toolbar-row.main-actions");let b=document.getElementById("roleBtnFlightWorkspace");
  if(bar){if(!b){b=document.createElement("button");b.id="roleBtnFlightWorkspace";b.className="fwRoleButton";b.textContent="✈️ CHUYẾN BAY";b.onclick=open;const a=document.getElementById("roleBtnFlights");a?.parentNode?a.parentNode.insertBefore(b,a):bar.insertBefore(b,bar.firstChild);}b.style.display="";const f=document.getElementById("fwFloating");if(f)f.remove();}
  else if(!document.getElementById("fwFloating")){const f=document.createElement("button");f.id="fwFloating";f.className="fwFloating";f.textContent="✈️ CHUYẾN BAY · V1.90";f.onclick=open;document.body.appendChild(f);}
}

function renderList(){
  const host=document.getElementById("fwList");if(!host)return;const pairs=Object.values(dayStore.pairs||{}).filter(Boolean).filter(p=>p.status!=="CANCELLED");
  pairs.sort((a,b)=>pairTimes(a).localeCompare(pairTimes(b))||pairTitle(a).localeCompare(pairTitle(b)));
  if(!pairs.length){host.innerHTML=`<div class="fwPanel fwEmpty">${isAD()?'<b>Chưa có chuyến hôm nay.</b><br><br>Bấm <b>＋ TẠO CHUYẾN</b> để tạo Flight Workspace đầu tiên.':'<b>AD chưa tạo chuyến hôm nay.</b><br><br>Khi AD tạo chuyến, chuyến sẽ xuất hiện tại đây để bạn vào lấy phần việc.'}</div>`;selectedPairId="";return pairs;}
  if(!selectedPairId||!dayStore.pairs[selectedPairId])selectedPairId=pairs[0].pairId;
  host.innerHTML=pairs.map(p=>{const tasks=assignmentItemsForPair(p).length||localSessionsForPair(p).length,checked=repairSelected.has(p.pairId);return `<div class="fwCard ${selectedPairId===p.pairId?"sel":""}" onclick="SAGSFlightWorkspace.selectPair('${esc(p.pairId)}')"><div class="fwCardTop"><div><div class="fwFlight">${esc(pairTitle(p))}</div><div class="fwMeta">${esc(pairRoute(p)||"CXR")} · ${esc(pairTimes(p)||"Chưa có giờ")}</div><div class="fwMeta">${esc(pairAircraft(p)||"Chưa có A/C")} · REV ${Number(p.revision)||1}</div></div><div><span class="fwPill">${tasks} việc</span>${p.needsReview?'<br><span class="fwPill red" style="margin-top:5px">CẦN KIỂM TRA</span>':''}</div></div>${isAD()?`<label class="fwRepairPick" onclick="event.stopPropagation()"><input type="checkbox" data-fw-repair="${esc(p.pairId)}" ${checked?"checked":""} onchange="SAGSFlightWorkspace.toggleRepair('${esc(p.pairId)}',this.checked)"> Chọn để đổi cặp</label>`:""}</div>`;}).join("");
  return pairs;
}
function renderDetail(){
  const host=document.getElementById("fwDetail");if(!host)return;const p=dayStore.pairs?.[selectedPairId];if(!p){host.innerHTML=`<div class="fwPanel fwEmpty">Chọn một chuyến để xem phần việc.</div>`;return;}
  const ls=pairLegs(p),assign=assignmentItemsForPair(p),sessions=localSessionsForPair(p),byAssignment=new Map(sessions.filter(x=>x.assignmentId).map(x=>[x.assignmentId,x]));
  const tasks=[];for(const a of assign){const s=byAssignment.get(S(a.assignmentId));tasks.push({key:`A:${a.assignmentId}`,title:formLabel(a.formGroup),meta:[a.sourceColumn||a.roleKey,isAD()?a.user:""].filter(Boolean).join(" · "),sessionId:s?.meta?.id||"",waiting:!s});}
  for(const s of sessions){if(s.assignmentId&&assign.some(a=>S(a.assignmentId)===s.assignmentId))continue;tasks.push({key:`S:${s.meta?.id}`,title:formLabel(s.group),meta:"Hồ sơ hiện có",sessionId:s.meta?.id||"",waiting:false});}
  host.innerHTML=`<div class="fwPanel"><div class="fwCardTop"><div><div class="fwFlight">${esc(pairTitle(p))}</div><div class="fwMeta">${esc(pairRoute(p))}</div><div class="fwMeta">${esc(pairTimes(p))}${pairAircraft(p)?" · "+esc(pairAircraft(p)):""}</div><div class="fwMeta">Pair ID: ${esc(p.pairId)} · REV ${Number(p.revision)||1}</div></div>${isAD()?`<button class="fwBtn" onclick="SAGSFlightWorkspace.openEdit('${esc(p.pairId)}')">✏️ CẬP NHẬT KHAI THÁC</button>`:""}</div></div>${p.needsReview?`<div class="fwWarn">⚠️ <b>CẦN KIỂM TRA LẠI</b><br>Thông tin khai thác hoặc cặp chuyến đã thay đổi ở revision mới. Dữ liệu cũ không bị xóa nhưng các phần phụ thuộc cặp chuyến cần được kiểm tra theo đúng quy trình hiện tại.</div>`:""}<div class="fwPanel"><b>${isAD()?"PHẦN VIỆC CỦA CÁC BỘ PHẬN":"PHẦN VIỆC CỦA BẠN"}</b>${tasks.length?tasks.map(t=>`<div class="fwTask"><div><b>${esc(t.title)}</b><div class="fwMeta">${esc(t.meta||"")}</div></div>${t.sessionId?`<button class="fwBtn green" onclick="SAGSFlightWorkspace.openTask('${esc(p.pairId)}','${esc(t.sessionId)}')">MỞ PHẦN VIỆC</button>`:`<span class="fwPill warn">CHỜ ĐỒNG BỘ</span>`}</div>`).join(""):'<div class="fwMeta" style="margin-top:10px">Chưa có phần việc từ roster/hồ sơ hiện tại khớp với chuyến này.</div>'}</div><div class="fwPanel"><b>CHUYẾN ĐƠN / LEG ID</b>${ls.map(l=>`<div class="fwTask"><div><b>${esc(l.direction)} · ${esc(l.flightNo)}</b><div class="fwMeta">${esc(l.origin)} → ${esc(l.destination)} · legId ${esc(l.legId)} · REV ${Number(l.revision)||1}</div></div><span class="fwPill">${esc(l.acReg||l.acType||"ACTIVE")}</span></div>`).join("")}</div>`;
}
function render(){
  installUi();const sub=document.getElementById("fwHeaderSub");if(sub)sub.textContent=`${currentDay||cxrDay()} · ${role()||"—"}${username()?" · "+username():""} · Chọn chuyến → lấy phần việc`;
  const create=document.getElementById("fwCreateBtn"),repair=document.getElementById("fwRepairBtn");if(create)create.style.display=isAD()?"":"none";if(repair)repair.style.display=isAD()?"":"none";
  renderList();renderDetail();renderRepairAction();
}
function selectPair(id){selectedPairId=S(id);const p=dayStore.pairs?.[selectedPairId];setActive(p);render();}
function openTask(pairId,sessionId){const p=dayStore.pairs?.[pairId];setActive(p);close();try{if(typeof switchFlightSession==="function")return switchFlightSession(sessionId);}catch(e){console.error(e);}toast("Không mở được phần việc trên thiết bị này.");}
function open(){installUi();ensureEntry();if(!currentDay)connectDay(cxrDay());document.getElementById("fwHome")?.classList.add("show");render();}
function close(){document.getElementById("fwHome")?.classList.remove("show");}
function openGuide(){installUi();document.getElementById("fwGuideModal")?.classList.add("show");}

function queueEventAlerts(events){
  const vals=Object.values(events||{}).filter(Boolean).sort((a,b)=>(a.eventAtMs||0)-(b.eventAtMs||0));
  if(!eventsPrimed){for(const e of vals)if(e.eventId)seenEvents.add(e.eventId);eventsPrimed=true;eventStartedAt=now();return;}
  for(const e of vals){if(!e?.eventId||seenEvents.has(e.eventId))continue;seenEvents.add(e.eventId);if(Number(e.eventAtMs||0)<eventStartedAt-1500)continue;if(!["OPS_UPDATED","PAIR_REPAIRED"].includes(e.type))continue;alertQueue.push(e);}
  showNextAlert();
}
function showNextAlert(){
  if(alertShowing||!alertQueue.length||!role())return;installUi();const e=alertQueue.shift();alertShowing=true;const t=document.getElementById("fwAlertText");if(t)t.textContent=`${e.summary||"Thông tin chuyến đã thay đổi."}\n\nVui lòng vào CHUYẾN BAY HÔM NAY và kiểm tra lại phần việc bị ảnh hưởng.`;document.getElementById("fwAlertModal")?.classList.add("show");
}
function ackAlert(){document.getElementById("fwAlertModal")?.classList.remove("show");alertShowing=false;setTimeout(showNextAlert,80);}

function disconnect(){
  try{if(dayRef&&dayCb)dayRef.off("value",dayCb);}catch(_){}try{if(rosterRef&&rosterCb)rosterRef.off("value",rosterCb);}catch(_){}dayRef=dayCb=rosterRef=rosterCb=null;
}
function connectDay(d){
  d=d||cxrDay();if(currentDay===d&&dayRef)return;disconnect();currentDay=d;dayStore=loadLocal(d);roster=null;eventsPrimed=false;seenEvents.clear();eventStartedAt=now();render();
  const dr=rtdb(`${DB_ROOT}/days/${safe(d)}`);if(dr){dayRef=dr;dayCb=s=>{dayStore=normalizeStore(s.val()||{});saveLocal(d,dayStore);queueEventAlerts(dayStore.events);render();};try{dr.on("value",dayCb,e=>console.warn("Flight Workspace day",e));}catch(e){console.warn(e);}}
  const rr=rtdb(`${ROSTER_MANIFEST}/${safe(d)}`);if(rr){rosterRef=rr;rosterCb=s=>{roster=s.val()||null;render();};try{rr.on("value",rosterCb,e=>console.warn("Flight Workspace roster",e));}catch(e){console.warn(e);}}
}
function maybeOpenHome(){
  if(!role())return;ensureEntry();connectDay(cxrDay());const key=`${HOME_KEY}|${cxrDay()}|${username()||role()}`;try{if(sessionStorage.getItem(key)==="1")return;sessionStorage.setItem(key,"1");}catch(_){}
  setTimeout(()=>{if(role())open();},120);
}
function start(){
  if(started)return;started=true;installUi();
  try{const base=root.applyRoleUI;if(typeof base==="function"&&!base.__fw190){const wrap=function(){const r=base.apply(this,arguments);setTimeout(maybeOpenHome,80);return r;};wrap.__fw190=true;root.applyRoleUI=wrap;}}catch(_){}
  try{const mo=new MutationObserver(()=>{if(role()){ensureEntry();maybeOpenHome();}});mo.observe(document.body,{childList:true,subtree:true});root.__fw190Observer=mo;}catch(_){}
  let n=0;bootTimer=setInterval(()=>{n++;if(role())maybeOpenHome();if(n>120){clearInterval(bootTimer);bootTimer=null;}},500);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&role()){connectDay(cxrDay());render();}});
  maybeOpenHome();
}

root.__SAGS_FW190_TEST__={planRepair,tokens,fmtTime,isoDate,flightNo,station};
root.SAGSFlightWorkspace={version:VERSION,build:BUILD,engine:ENGINE,schema:SCHEMA,open,close,openGuide,selectPair,openTask,openCreate,createPairFromForm,openEdit,saveEdit,toggleRepair,openRepair,rebuildRepairPartner,updateRepairPreview,saveRepair,closeEditor,ackAlert,getActive:activeContext,getPair:id=>clone(dayStore.pairs?.[id]||null),getLeg:id=>clone(dayStore.legs?.[id]||null),needsReview:id=>dayStore.pairs?.[id]?.needsReview===true,refresh:()=>{connectDay(cxrDay());render();}};
root.openFlightWorkspace=open;
root.getActiveFlightWorkspace=activeContext;
root.sagsFlightWorkspaceNeedsReview=id=>dayStore.pairs?.[id]?.needsReview===true;
root.__SAGS_FLIGHT_WORKSPACE_BUILD__=BUILD;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(typeof window!=="undefined"?window:globalThis);
