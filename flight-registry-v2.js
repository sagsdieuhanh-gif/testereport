/* E-REPORT SAGS · FLIGHT REGISTRY V2.5
 * V1.84 stable core + V2 LEG/rotation architecture.
 * Event-driven: zero Registry RTDB listeners, zero polling, zero MutationObserver.
 */
(function(root){
  "use strict";

  const BUILD="V2.5-20260820-02";
  const DB_ROOT="flight_registry_v2";
  const SCHEMA=1;
  const S=v=>String(v??"").trim();
  const U=v=>S(v).toUpperCase();
  const esc=v=>S(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v??{}));

  function hashId(value){
    let h=2166136261>>>0;
    const s=String(value??"");
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    return h.toString(36).toUpperCase();
  }
  function safeKey(v){
    try{if(typeof root.sagsV470Safe==="function")return root.sagsV470Safe(v);}catch(_e){}
    return S(v).replace(/[.#$\[\]\/]/g,"_");
  }
  function userName(){
    try{ if(typeof currentUserProfile!=="undefined" && currentUserProfile?.username) return U(currentUserProfile.username); }catch(_e){}
    try{ if(typeof currentRole!=="undefined" && U(currentRole)==="AD") return "AD"; }catch(_e){}
    return "AD";
  }
  function normUser(v){
    try{ if(typeof normalizePersonalUsername==="function") return normalizePersonalUsername(v); }catch(_e){}
    return U(v).replace(/\s+/g,"").replace(/[^A-Z0-9._-]/g,"_").slice(0,40);
  }
  function usersFromInput(v){
    return [...new Set(U(v).split(/[\\/,;|\n]+/).map(normUser).filter(x=>x&&/^[A-Z][A-Z0-9._-]{1,39}$/.test(x)&&!/^N\\?A$/.test(x)&&!/^\d+$/.test(x)))];
  }
  function displayDate(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(S(iso));
    return m?`${m[3]}/${m[2]}/${m[1]}`:S(iso);
  }
  function isAD(){
    // V2.0: use the role class produced by the V1.84 core. This works for both
    // bootstrap AD and personal AD and avoids window.currentRole (global let is not a Window property).
    try{ if(document?.body?.classList?.contains("role-admin")) return true; }catch(_e){}
    try{ if(typeof currentRole!=="undefined" && U(currentRole)==="AD") return true; }catch(_e){}
    try{ if(typeof currentUserProfile!=="undefined" && [currentUserProfile?.role,currentUserProfile?.roleCode].some(v=>U(v)==="AD")) return true; }catch(_e){}
    return false;
  }
  function ref(path){
    if(typeof root.sagsV470Ref!=="function")throw new Error("Realtime Database chưa sẵn sàng.");
    return root.sagsV470Ref(path);
  }
  function todayISO(){
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function splitFlights(raw){
    const parts=U(raw).replace(/[\/]+/g," ").split(/\s+/).filter(Boolean);
    let prefix="";const out=[];
    for(const p0 of parts){
      const p=p0.replace(/[^A-Z0-9]/g,"");if(!p)continue;
      let m=/^([A-Z0-9]{2,3}?)(\d{1,5})$/.exec(p);
      if(m&&/[A-Z]/.test(m[1])){prefix=m[1];out.push(prefix+m[2]);continue;}
      m=/^(\d{1,5})$/.exec(p);if(m&&prefix)out.push(prefix+m[1]);
    }
    return [...new Set(out)];
  }
  function addAlias(leg,oldFlight){
    const f=U(oldFlight);if(!f)return;
    const a=Array.isArray(leg.aliases)?leg.aliases.slice():[];
    if(f!==U(leg.flightNo)&&!a.map(U).includes(f))a.push(f);
    leg.aliases=[...new Set(a.map(U).filter(Boolean))];
  }
  function operationalSignature(leg){
    return JSON.stringify({
      direction:U(leg.direction),flightNo:U(leg.flightNo),time:S(leg.time),aircraftReg:U(leg.aircraftReg),
      aircraftType:U(leg.aircraftType),route:U(leg.route),bay:U(leg.bay),gate:U(leg.gate),status:U(leg.status)
    });
  }
  function newLegId(opDate,direction,flightNo){
    return "LEG_"+hashId([opDate,U(direction),U(flightNo)].join("|"));
  }
  function findExistingLeg(legs,direction,flightNo){
    const d=U(direction),f=U(flightNo);
    return Object.values(legs||{}).find(x=>x&&U(x.direction)===d&&(U(x.flightNo)===f||(x.aliases||[]).map(U).includes(f)))||null;
  }
  function normalizeLeg(leg){
    const x={...leg};
    x.legId=S(x.legId);
    x.direction=["ARR","DEP","UNKNOWN"].includes(U(x.direction))?U(x.direction):"UNKNOWN";
    x.flightNo=U(x.flightNo);
    x.aliases=[...new Set((x.aliases||[]).map(U).filter(Boolean))];
    x.time=S(x.time);
    x.aircraftReg=U(x.aircraftReg);
    x.aircraftType=U(x.aircraftType);
    x.route=U(x.route);
    x.bay=U(x.bay);
    x.gate=U(x.gate);
    x.status=U(x.status)||"SCHEDULED";
    x.arrDisposition=U(x.arrDisposition)||"TBD";
    x.onwardLegId=S(x.onwardLegId);
    x.depSourceType=U(x.depSourceType)||"TBD";
    x.sourceLegId=S(x.sourceLegId);
    x.onGroundReg=U(x.onGroundReg);
    x.revision=Math.max(1,Number(x.revision||1));
    return x;
  }

  function reconcileRelations(inputLegs){
    const legs={};Object.entries(inputLegs||{}).forEach(([id,l])=>legs[id]=normalizeLeg({...l,legId:l?.legId||id}));
    const arrs=Object.values(legs).filter(l=>l.direction==="ARR"),deps=Object.values(legs).filter(l=>l.direction==="DEP");
    const arrMap=new Map(arrs.map(l=>[l.legId,l])),depMap=new Map(deps.map(l=>[l.legId,l]));
    const linksByDep=new Map();
    const linkOwnerByArr=new Map();

    function requestLink(arrId,depId,source){
      if(!arrMap.has(arrId))throw new Error(`Quan hệ ${source}: không tìm thấy ARR ${arrId}.`);
      if(!depMap.has(depId))throw new Error(`Quan hệ ${source}: không tìm thấy DEP ${depId}.`);
      const prev=linksByDep.get(depId);
      if(prev&&prev!==arrId)throw new Error(`DEP ${depMap.get(depId).flightNo||depId} đang nhận 2 chuyến ARR khác nhau.`);
      const prevDep=linkOwnerByArr.get(arrId);
      if(prevDep&&prevDep!==depId)throw new Error(`ARR ${arrMap.get(arrId).flightNo||arrId} đang nối tới 2 chuyến DEP.`);
      linksByDep.set(depId,arrId);linkOwnerByArr.set(arrId,depId);
    }

    for(const a of arrs){
      if(a.arrDisposition==="TO_DEPARTURE"){
        if(!a.onwardLegId)throw new Error(`ARR ${a.flightNo||a.legId}: chưa chọn chuyến DEP tiếp theo.`);
        requestLink(a.legId,a.onwardLegId,"ARR");
      }else a.onwardLegId="";
    }
    for(const d of deps){
      if(d.depSourceType==="ARRIVAL_LEG"){
        if(!d.sourceLegId)throw new Error(`DEP ${d.flightNo||d.legId}: chưa chọn chuyến ARR nguồn.`);
        requestLink(d.sourceLegId,d.legId,"DEP");
      }else d.sourceLegId="";
    }

    for(const [depId,arrId] of linksByDep){
      const a=arrMap.get(arrId),d=depMap.get(depId);
      if(["REMAIN","NIGHT_STOP"].includes(a.arrDisposition))throw new Error(`ARR ${a.flightNo}: đang chọn ${a.arrDisposition} nhưng lại được dùng cho DEP ${d.flightNo}.`);
      if(d.depSourceType==="ON_GROUND")throw new Error(`DEP ${d.flightNo}: đang chọn TÀU NẰM SÂN nhưng đồng thời nối từ ARR ${a.flightNo}.`);
      a.arrDisposition="TO_DEPARTURE";a.onwardLegId=d.legId;
      d.depSourceType="ARRIVAL_LEG";d.sourceLegId=a.legId;d.onGroundReg="";
    }

    for(const a of arrs){
      if(a.arrDisposition!=="TO_DEPARTURE")a.onwardLegId="";
    }
    for(const d of deps){
      if(d.depSourceType==="ON_GROUND"){
        d.sourceLegId="";
        d.onGroundReg=U(d.onGroundReg||d.aircraftReg);
        if(!d.onGroundReg)throw new Error(`DEP ${d.flightNo||d.legId}: chọn TÀU NẰM TẠI CXR nhưng chưa nhập A/C REG.`);
      }else if(d.depSourceType!=="ARRIVAL_LEG"){
        d.sourceLegId="";d.onGroundReg="";
      }
    }

    const rotations={};
    for(const d of deps){
      if(d.depSourceType==="ARRIVAL_LEG"&&d.sourceLegId){
        const a=arrMap.get(d.sourceLegId);if(!a)continue;
        const id="ROT_"+hashId([a.legId,d.legId].join("|"));
        rotations[id]={rotationId:id,type:"ARRIVAL_TO_DEPARTURE",arrLegId:a.legId,depLegId:d.legId,aircraftReg:U(d.aircraftReg||a.aircraftReg),active:true};
      }else if(d.depSourceType==="ON_GROUND"){
        const id="ROT_"+hashId(["GROUND",d.legId].join("|"));
        rotations[id]={rotationId:id,type:"ON_GROUND_TO_DEPARTURE",depLegId:d.legId,aircraftReg:U(d.onGroundReg||d.aircraftReg),active:true};
      }
    }
    return {legs,rotations};
  }

  root.__SAGS_FLIGHT_REGISTRY_V2__={BUILD,DB_ROOT,hashId,splitFlights,reconcileRelations,normalizeLeg,manualAssignmentPlan,flightRawFor,
    assignmentUnit:a=>U(a?.unit||(a?.assignmentType==="DH_OPS"?"ĐH":a?.assignmentType==="CBTT_FINAL"?"CBTT":a?.formGroup==="fsags09"?"PVHK":["fsags","fsags421","fsags551"].includes(S(a?.formGroup))?"RAMP":a?.sourceColumn||"")),
    foldHeader,allRowKey,pairCanAutoLink,extractExtraUnitAssignments,mergeParsedRosterIntoDay};
  if(typeof document==="undefined")return;

  let managerDay=null;
  let requestedManagerDay="";
  let baseOpenRoster=null;
  let basePublishRoster=null;

  function dateFromRosterUI(){return S(document.getElementById("drManageDate")?.value)||todayISO();}
  function statusMessage(msg,isErr=false){
    const e=document.getElementById("frtRosterStatus");if(e){e.textContent=msg;e.classList.toggle("err",!!isErr);}
  }
  function appendRosterStatus(msg){
    const e=document.getElementById("drStatus");if(e)e.textContent=S(e.textContent)+(S(e.textContent)?"\n":"")+msg;
  }
  function eventId(){return "EVT_"+Date.now()+"_"+hashId(Math.random());}
  function addEvent(day,type,details={}){
    const events={...(day.events||{})};
    const id=eventId();events[id]={eventId:id,type,atMs:Date.now(),by:userName(),...details};
    const ordered=Object.entries(events).sort((a,b)=>Number(a[1]?.atMs||0)-Number(b[1]?.atMs||0));
    while(ordered.length>100){const [oldId]=ordered.shift();delete events[oldId];}
    day.events=events;
  }
  async function readManifest(date){
    if(!date)throw new Error("Chưa chọn ngày roster.");
    return (await ref(`roster_manifests/${safeKey(date)}`).once("value")).val()||null;
  }
  async function readDay(date){
    const d=(await ref(`${DB_ROOT}/days/${safeKey(date)}`).once("value")).val()||null;
    return d||{schema:SCHEMA,registryBuild:BUILD,opDate:date,revision:0,legs:{},assignments:{},rotations:{},events:{}};
  }
  async function readAssignmentPayload(item){
    const id=S(item?.assignmentId),u=U(item?.user||item?.originalUser);
    if(!id||!u)return null;
    try{return (await ref(`roster_mail/${safeKey(u)}/items/${safeKey(id)}`).once("value")).val()||null;}catch(_e){return null;}
  }
  async function mapLimit(items,limit,fn){
    const out=new Array(items.length);let next=0;
    async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}
    await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
  }
  function groupKey(item){return U(item?.flightName||item?.flightRaw||"").replace(/\s+/g," ");}
  function fallbackPayload(item){
    // Không tự coi chuyến đơn là ARR. Với DEP-only/ARR-only phải suy hướng từ STA/STD/route,
    // hoặc giữ UNKNOWN để AD xử lý; tuyệt đối không bỏ qua chỉ vì thiếu cặp.
    return {
      flightRaw:item?.flightRaw||item?.flightName||"",flightName:item?.flightName||item?.flightRaw||"",
      arrFlight:U(item?.arrFlight),depFlight:U(item?.depFlight),sta:S(item?.sta),std:S(item?.std),
      acReg:U(item?.acReg),acType:U(item?.acType),route1:U(item?.route1),route3:U(item?.route3),bay:U(item?.bay)
    };
  }
  function payloadScore(p){
    if(!p)return 0;
    return (p.arrFlight?8:0)+(p.depFlight?8:0)+(p.sta?3:0)+(p.std?3:0)+(p.acReg?2:0)+(p.route1?1:0)+(p.route3?1:0);
  }
  async function bestGroupPayload(group){
    // Assignment đầu tiên có thể đã bị CHUYỂN và mailbox cũ không còn. Thử vài item trong group
    // để tránh rơi về fallback thiếu STA/STD rồi phân loại sai chuyến đơn.
    let best=null,bestScore=-1;
    for(const item of (group||[]).slice(0,8)){
      const p=await readAssignmentPayload(item);
      const c=p||fallbackPayload(item),score=payloadScore(c);
      if(score>bestScore){best=c;bestScore=score;}
      if(p&&(p.arrFlight||p.depFlight)&&(p.sta||p.std))break;
    }
    return best||fallbackPayload(group?.[0]||{});
  }
  function classifySingleLeg(payload,flightNo){
    const f=U(flightNo);
    if(!f)return "UNKNOWN";
    if(U(payload?.depFlight)===f)return "DEP";
    if(U(payload?.arrFlight)===f)return "ARR";
    const sta=S(payload?.sta),std=S(payload?.std),r1=U(payload?.route1),r3=U(payload?.route3);
    if((std&&!sta)||(r3&&!r1))return "DEP";
    if((sta&&!std)||(r1&&!r3))return "ARR";
    return "UNKNOWN";
  }
  async function manifestGroups(man){
    const items=Object.values(man?.items||{}).filter(Boolean);const groups=new Map();
    for(const item of items){const k=groupKey(item);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(item);}
    const entries=[...groups.entries()];
    const payloads=await mapLimit(entries,4,async([k,group])=>[k,await bestGroupPayload(group)]);
    return {items,groups,payloadMap:new Map(payloads)};
  }
  function legFromCandidate(day,payload,direction,flightNo){
    const existing=findExistingLeg(day.legs,direction,flightNo);
    const id=existing?.legId||newLegId(day.opDate,direction,flightNo);
    const prev=existing?normalizeLeg(existing):null;
    const route1=U(payload?.route1),route3=U(payload?.route3),route=direction==="ARR"?[route1,"CXR"].filter(Boolean).join("-"):["CXR",route3].filter(Boolean).join("-");
    const next=normalizeLeg({
      ...(existing||{}),legId:id,direction,flightNo:U(flightNo),time:direction==="ARR"?S(payload?.sta):S(payload?.std),
      aircraftReg:U(payload?.acReg),aircraftType:U(payload?.acType),route,bay:U(payload?.bay),status:existing?.status||"SCHEDULED",
      arrDisposition:existing?.arrDisposition||"TBD",onwardLegId:existing?.onwardLegId||"",
      depSourceType:existing?.depSourceType||"TBD",sourceLegId:existing?.sourceLegId||"",onGroundReg:existing?.onGroundReg||"",
      revision:existing?.revision||1,rosterActive:true,rosterUpdatedAtMs:Date.now(),needsReview:existing?.needsReview||false
    });
    if(prev){
      const before=operationalSignature(prev),after=operationalSignature(next);
      if(before!==after){next.revision=Number(prev.revision||1)+1;next.needsReview=true;next.updatedAtMs=Date.now();next.updatedBy=userName();}
    }else{next.createdAtMs=Date.now();next.createdBy=userName();}
    return next;
  }
  async function syncFromManifest(date,source="MANUAL_SYNC"){
    if(!isAD())throw new Error("Chỉ AD được tạo/cập nhật Flight LEG.");
    const man=await readManifest(date);if(!man?.items)throw new Error(`Ngày ${date} chưa có manifest DAILY ROSTER.`);
    const day=await readDay(date);day.opDate=date;day.schema=SCHEMA;day.registryBuild=BUILD;day.legs=day.legs||{};day.assignments=day.assignments||{};
    Object.values(day.legs).forEach(l=>{if(l)l.rosterActive=false;});
    Object.values(day.assignments).forEach(a=>{if(!a)return;if(a.source==="MANUAL"&&a.registryOnly===true){a.active=true;return;}a.active=false;});
    const {items,groups,payloadMap}=await manifestGroups(man);
    const groupLegs=new Map();
    for(const [k,group] of groups){
      const payload=payloadMap.get(k)||fallbackPayload(group[0]);
      let arr=U(payload.arrFlight),dep=U(payload.depFlight);const flights=splitFlights(payload.flightName||payload.flightRaw||group[0]?.flightRaw||"");
      if(!arr&&!dep&&flights.length>=2){arr=flights[0];dep=flights[1];}
      if(!arr&&!dep&&flights.length===1){
        const dir=classifySingleLeg(payload,flights[0]);
        if(dir==="DEP")dep=flights[0];else if(dir==="ARR")arr=flights[0];
      }
      const ids=[];
      if(arr){const leg=legFromCandidate(day,payload,"ARR",arr);day.legs[leg.legId]=leg;ids.push(leg.legId);}
      if(dep){
        const existed=findExistingLeg(day.legs,"DEP",dep);
        const leg=legFromCandidate(day,payload,"DEP",dep);
        // DEP-only có A/C Reg và không có ARR đi kèm: coi là tàu đang nằm tại CXR theo dữ liệu roster.
        // Nếu AD đã cấu hình nguồn trước đó thì luôn giữ lựa chọn của AD.
        if(!arr&&!existed&&U(payload.acReg)){leg.depSourceType="ON_GROUND";leg.onGroundReg=U(payload.acReg);}
        day.legs[leg.legId]=leg;ids.push(leg.legId);
      }
      if(!arr&&!dep&&flights[0]){const leg=legFromCandidate(day,payload,"UNKNOWN",flights[0]);day.legs[leg.legId]=leg;ids.push(leg.legId);}
      groupLegs.set(k,ids);
    }
    for(const item of items){
      const id=S(item.assignmentId);if(!id)continue;
      day.assignments[id]={...(day.assignments[id]||{}),assignmentId:id,active:true,user:U(item.user),originalUser:U(item.originalUser),formGroup:S(item.formGroup),sourceColumn:S(item.sourceColumn),roleKey:S(item.roleKey),flightRaw:S(item.flightRaw),legIds:groupLegs.get(groupKey(item))||[],source:item.manualEntry===true?"MANUAL":"ROSTER",registryOnly:item.registryOnly===true,assignmentType:S(item.assignmentType||item.roleKey),manualFlightKey:S(item.manualFlightKey),updatedAtMs:Date.now()};
    }
    day.revision=Number(day.revision||0)+1;day.updatedAtMs=Date.now();day.updatedBy=userName();day.sourceManifestPublishedAtMs=Number(man.publishedAtMs||0);
    addEvent(day,"ROSTER_SYNC",{source,legCount:Object.keys(day.legs).length,assignmentCount:Object.keys(day.assignments).filter(id=>day.assignments[id]?.active).length});
    await ref(`${DB_ROOT}/days/${safeKey(date)}`).set(day);
    managerDay=day;
    return day;
  }

  function ensureStyles(){
    if(document.getElementById("frtStyle"))return;
    const s=document.createElement("style");s.id="frtStyle";s.textContent=`
      #frtModal{display:none;position:fixed;inset:0;z-index:17100;background:rgba(0,0,0,.58);align-items:center;justify-content:center;padding:10px;box-sizing:border-box;font-family:Arial,sans-serif}
      #frtModal.show{display:flex}.frtPanel{width:min(97vw,1040px);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;padding:14px;box-sizing:border-box;box-shadow:0 18px 48px rgba(0,0,0,.3)}
      .frtHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.frtHead h3{margin:0;color:#0b4f91}.frtSub{font-size:12px;color:#5b6874;line-height:1.45;margin:5px 0 10px}.frtTestBadge{display:inline-block;padding:3px 8px;border-radius:999px;background:#fff3cd;color:#7a5700;font-weight:900;font-size:11px}
      .frtActions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.frtBtn{border:0;border-radius:9px;padding:9px 12px;font-weight:800;background:#0b67b2;color:#fff;cursor:pointer}.frtBtn.gray{background:#eef3f7;color:#31475a;border:1px solid #ccd7df}.frtBtn.green{background:#15803d}.frtBtn:disabled{opacity:.5;cursor:default}
      .frtStatus{padding:9px 10px;background:#eef6ff;color:#234764;border-radius:9px;font-size:12px;white-space:pre-wrap;margin:8px 0}.frtStatus.err{background:#fff0f0;color:#9b1c1c}
      .frtGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.frtSection{margin-top:12px}.frtSection h4{margin:0 0 7px;color:#234764}.frtLegCard{border:1px solid #d8e1e8;border-radius:12px;padding:10px;background:#fbfcfd}.frtLegTop{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.frtLegTitle{font-weight:900;color:#173b5b}.frtMuted{font-size:11px;color:#6a7884}.frtFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.frtField label{display:block;font-size:10px;font-weight:900;color:#4b6174;margin-bottom:3px}.frtField input,.frtField select{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccd7df;border-radius:7px;background:#fff;font-size:12px}.frtWide{grid-column:1/-1}.frtInactive{opacity:.58}.frtAssignments{margin-top:12px;padding:9px;border:1px dashed #cbd6df;border-radius:10px;font-size:11px;color:#455b6d}.frtHelp{margin-top:10px;padding:9px;background:#f7f4ff;border:1px solid #e2daf8;border-radius:10px;color:#4b3d72;font-size:12px;line-height:1.45}
      #frtRosterControls{margin-top:10px;border:1px solid #d7e3ec;border-radius:10px;padding:10px;background:#f5f9fc}.frtMini{font-size:11px;color:#60717e;margin-top:5px}.frtRosterBtns{display:flex;gap:7px;flex-wrap:wrap}.frtRosterBtns .drBtn{margin:0}.frtRosterStatus{font-size:12px;margin-top:7px;color:#345}.frtRosterStatus.err{color:#a01616}
      @media(max-width:700px){.frtGrid,.frtFields{grid-template-columns:1fr}.frtPanel{padding:10px}.frtActions .frtBtn,.frtRosterBtns .drBtn{flex:1}.frtWide{grid-column:auto}}
    `;document.head.appendChild(s);
  }
  function ensureRosterControls(){
    ensureStyles();const modal=document.getElementById("dailyRosterModal"),panel=modal?.querySelector(".drPanel");if(!panel)return;
    let box=document.getElementById("frtRosterControls");if(!box){
      box=document.createElement("div");box.id="frtRosterControls";
      box.innerHTML=`<b>✈️ QUẢN LÝ CHUYẾN · DAILY ROSTER · V2.5</b><div class="frtMini">Không có listener Flight Registry chạy nền. Registry chỉ READ/WRITE khi AD bấm nút.</div><div class="frtRosterBtns" style="margin-top:8px"><button class="drBtn secondary" onclick="sagsFlightManagerOpen()">← QUẢN LÝ CHUYẾN</button><button class="drBtn secondary" onclick="sagsV2RegistrySync()">ĐỒNG BỘ LEG TỪ ROSTER</button><button class="drBtn" onclick="sagsV2RegistryOpen()">MỞ LEG / ROTATION</button></div><div class="frtRosterStatus" id="frtRosterStatus">V2.5 trên lõi ổn định V1.84 · không có listener Flight Registry chạy nền.</div>`;
      const manage=document.getElementById("drManage")?.closest?.(".drField");if(manage?.parentNode)manage.parentNode.insertBefore(box,manage);else panel.appendChild(box);
    }
    box.style.display=isAD()?"":"none";
  }
  function ensureModal(){
    ensureStyles();if(document.getElementById("frtModal"))return;
    const m=document.createElement("div");m.id="frtModal";m.innerHTML=`<div class="frtPanel"><div class="frtHead"><div><h3>FLIGHT LEG / AIRCRAFT ROTATION</h3><div class="frtSub"><span class="frtTestBadge">V2.5 · LEG ARCHITECTURE</span> LEG là gốc. Quan hệ ARR→DEP chỉ được tạo khi AD xác nhận.</div></div><button class="frtBtn gray" onclick="sagsV2RegistryClose()">ĐÓNG</button></div><div class="frtActions"><button class="frtBtn gray" onclick="sagsV2RegistrySync()">ĐỒNG BỘ TỪ ROSTER</button><button class="frtBtn gray" onclick="sagsV2RegistryReload()">TẢI LẠI</button><button class="frtBtn green" onclick="sagsV2RegistrySave()">LƯU QUAN HỆ</button></div><div class="frtStatus" id="frtStatus">Chưa tải dữ liệu.</div><div class="frtHelp"><b>Ví dụ:</b> ARR A → DEP C: chọn ARR A = “ĐI TIẾP CHUYẾN DEP” và chọn C. ARR B nằm lại: chọn “NẰM LẠI CXR”. DEP D dùng tàu có sẵn: chọn “TÀU ĐANG NẰM TẠI CXR” rồi nhập A/C REG. Hệ thống không bắt buộc tạo B→D.</div><div id="frtBody"></div></div>`;document.body.appendChild(m);
    m.addEventListener("change",ev=>{if(ev.target?.matches?.("select[data-frt-relation]"))toggleConditional();});
  }
  function setManagerStatus(msg,err=false){const e=document.getElementById("frtStatus");if(e){e.textContent=msg;e.classList.toggle("err",!!err);}}
  function option(value,label,current){return `<option value="${esc(value)}"${U(current)===U(value)?" selected":""}>${esc(label)}</option>`;}
  function legOptions(legs,direction,current){
    const arr=Object.values(legs||{}).filter(x=>U(x.direction)===direction&&x.rosterActive!==false).sort((a,b)=>S(a.time).localeCompare(S(b.time))||S(a.flightNo).localeCompare(S(b.flightNo)));
    return `<option value="">-- chọn --</option>`+arr.map(x=>`<option value="${esc(x.legId)}"${S(current)===S(x.legId)?" selected":""}>${esc(x.flightNo||x.legId)}${x.time?" · "+esc(x.time):""}</option>`).join("");
  }
  function relationHtml(leg,legs){
    if(leg.direction==="ARR")return `<div class="frtField frtWide"><label>SAU KHI ĐẾN CXR</label><select data-field="arrDisposition" data-frt-relation="1">${option("TBD","CHƯA XÁC ĐỊNH",leg.arrDisposition)}${option("TO_DEPARTURE","ĐI TIẾP CHUYẾN DEP",leg.arrDisposition)}${option("REMAIN","NẰM LẠI CXR / KHÔNG KHAI THÁC TIẾP",leg.arrDisposition)}${option("NIGHT_STOP","NIGHT STOP",leg.arrDisposition)}</select></div><div class="frtField frtWide" data-rel-row="arrTarget"><label>CHUYẾN DEP TIẾP THEO</label><select data-field="onwardLegId">${legOptions(legs,"DEP",leg.onwardLegId)}</select></div>`;
    if(leg.direction==="DEP")return `<div class="frtField frtWide"><label>NGUỒN TÀU BAY</label><select data-field="depSourceType" data-frt-relation="1">${option("TBD","CHƯA XÁC ĐỊNH",leg.depSourceType)}${option("ARRIVAL_LEG","TỪ CHUYẾN ARR",leg.depSourceType)}${option("ON_GROUND","TÀU ĐANG NẰM TẠI CXR",leg.depSourceType)}</select></div><div class="frtField frtWide" data-rel-row="depSource"><label>CHUYẾN ARR NGUỒN</label><select data-field="sourceLegId">${legOptions(legs,"ARR",leg.sourceLegId)}</select></div><div class="frtField frtWide" data-rel-row="groundReg"><label>A/C REG TÀU NẰM SẴN</label><input data-field="onGroundReg" value="${esc(leg.onGroundReg||"")}" placeholder="VD: VN-A123"></div>`;
    return `<div class="frtField frtWide"><label>GHI CHÚ</label><div class="frtMuted">LEG chưa xác định ARR/DEP. Chọn HƯỚNG rồi LƯU, sau đó tải lại để cấu hình rotation.</div></div>`;
  }
  function legCard(leg,legs){
    const inactive=leg.rosterActive===false?" frtInactive":"";
    return `<div class="frtLegCard${inactive}" data-leg-id="${esc(leg.legId)}" data-original='${esc(JSON.stringify(leg))}'><div class="frtLegTop"><div><span class="frtLegTitle">${esc(leg.flightNo||"CHƯA CÓ FLIGHT")}</span> <span class="frtTestBadge">${esc(leg.direction)}</span></div><div class="frtMuted">${esc(leg.legId)} · REV ${Number(leg.revision||1)}${leg.needsReview?" · CẦN REVIEW":""}${leg.rosterActive===false?" · NGOÀI ROSTER":""}</div></div><div class="frtFields"><div class="frtField"><label>HƯỚNG</label><select data-field="direction">${option("ARR","ARR",leg.direction)}${option("DEP","DEP",leg.direction)}${option("UNKNOWN","CHƯA XÁC ĐỊNH",leg.direction)}</select></div><div class="frtField"><label>FLIGHT NO</label><input data-field="flightNo" value="${esc(leg.flightNo)}"></div><div class="frtField"><label>STA / STD</label><input data-field="time" value="${esc(leg.time)}" placeholder="HH:MM"></div><div class="frtField"><label>A/C REG</label><input data-field="aircraftReg" value="${esc(leg.aircraftReg)}"></div><div class="frtField"><label>A/C TYPE</label><input data-field="aircraftType" value="${esc(leg.aircraftType)}"></div><div class="frtField"><label>BAY</label><input data-field="bay" value="${esc(leg.bay)}"></div><div class="frtField"><label>GATE</label><input data-field="gate" value="${esc(leg.gate||"")}"></div><div class="frtField frtWide"><label>ROUTE</label><input data-field="route" value="${esc(leg.route)}"></div><div class="frtField frtWide"><label>TRẠNG THÁI LEG</label><select data-field="status">${option("SCHEDULED","SCHEDULED",leg.status)}${option("ACTIVE","ACTIVE",leg.status)}${option("COMPLETED","COMPLETED",leg.status)}${option("CANCELLED","CANCELLED",leg.status)}${option("NO_OPERATION","NO OPERATION",leg.status)}</select></div>${relationHtml(leg,legs)}</div></div>`;
  }
  function renderDay(day){
    const host=document.getElementById("frtBody");if(!host)return;const legs=day?.legs||{};
    const active=Object.values(legs).filter(Boolean).sort((a,b)=>({ARR:0,DEP:1,UNKNOWN:2}[U(a.direction)]??9)-({ARR:0,DEP:1,UNKNOWN:2}[U(b.direction)]??9)||S(a.time).localeCompare(S(b.time))||S(a.flightNo).localeCompare(S(b.flightNo)));
    const arrs=active.filter(x=>U(x.direction)==="ARR"),deps=active.filter(x=>U(x.direction)==="DEP"),unknown=active.filter(x=>!['ARR','DEP'].includes(U(x.direction)));
    const assignments=Object.values(day?.assignments||{}).filter(x=>x&&x.active!==false);
    host.innerHTML=`<div class="frtStatus">Ngày <b>${esc(day.opDate||"")}</b> · ${active.length} LEG · ${assignments.length} assignment · Day REV ${Number(day.revision||0)}<br>Flight Registry background listeners: <b>0</b>. Dữ liệu chỉ đọc khi mở/tải lại và chỉ ghi khi AD bấm lưu/đồng bộ.</div>${arrs.length?`<div class="frtSection"><h4>ARRIVAL LEG (${arrs.length})</h4><div class="frtGrid">${arrs.map(x=>legCard(x,legs)).join("")}</div></div>`:""}${deps.length?`<div class="frtSection"><h4>DEPARTURE LEG (${deps.length})</h4><div class="frtGrid">${deps.map(x=>legCard(x,legs)).join("")}</div></div>`:""}${unknown.length?`<div class="frtSection"><h4>CHƯA XÁC ĐỊNH (${unknown.length})</h4><div class="frtGrid">${unknown.map(x=>legCard(x,legs)).join("")}</div></div>`:""}${!active.length?'<div class="frtStatus err">Chưa có LEG. Hãy đồng bộ từ DAILY ROSTER trước.</div>':""}<div class="frtAssignments"><b>Assignment hiện tại</b><br>${assignments.slice(0,120).map(a=>`${esc(a.user)} · ${esc(a.formGroup)} · ${esc(a.flightRaw)} → ${(a.legIds||[]).map(id=>esc(legs[id]?.flightNo||id)).join(" / ")}`).join("<br>")||"Chưa có assignment."}</div>`;
    toggleConditional();
  }
  function toggleConditional(){
    document.querySelectorAll("#frtModal .frtLegCard").forEach(card=>{
      const dir=U(card.querySelector('[data-field="direction"]')?.value);
      const disp=U(card.querySelector('[data-field="arrDisposition"]')?.value),src=U(card.querySelector('[data-field="depSourceType"]')?.value);
      const ar=card.querySelector('[data-rel-row="arrTarget"]'),ds=card.querySelector('[data-rel-row="depSource"]'),gr=card.querySelector('[data-rel-row="groundReg"]');
      if(ar)ar.style.display=dir==="ARR"&&disp==="TO_DEPARTURE"?"":"none";
      if(ds)ds.style.display=dir==="DEP"&&src==="ARRIVAL_LEG"?"":"none";
      if(gr)gr.style.display=dir==="DEP"&&src==="ON_GROUND"?"":"none";
    });
  }
  function field(card,name){return S(card.querySelector(`[data-field="${name}"]`)?.value);}
  function collectEditedLegs(){
    const legs={};
    document.querySelectorAll("#frtModal .frtLegCard").forEach(card=>{
      const id=S(card.dataset.legId),old=managerDay?.legs?.[id]||{};let original={};try{original=JSON.parse(card.dataset.original||"{}");}catch(_e){}
      const next=normalizeLeg({...old,legId:id,direction:field(card,"direction"),flightNo:field(card,"flightNo"),time:field(card,"time"),aircraftReg:field(card,"aircraftReg"),aircraftType:field(card,"aircraftType"),bay:field(card,"bay"),gate:field(card,"gate"),route:field(card,"route"),status:field(card,"status"),arrDisposition:field(card,"arrDisposition")||old.arrDisposition,onwardLegId:field(card,"onwardLegId")||"",depSourceType:field(card,"depSourceType")||old.depSourceType,sourceLegId:field(card,"sourceLegId")||"",onGroundReg:field(card,"onGroundReg")||""});
      if(U(original.flightNo)&&U(original.flightNo)!==U(next.flightNo))addAlias(next,original.flightNo);
      if(operationalSignature(original)!==operationalSignature(next)){next.revision=Math.max(Number(original.revision||1)+1,Number(next.revision||1));next.needsReview=true;next.updatedAtMs=Date.now();next.updatedBy=userName();}
      legs[id]=next;
    });
    return legs;
  }
  async function saveManager(){
    if(!isAD())return setManagerStatus("Chỉ AD được lưu Flight Registry V2.5.",true);
    if(!managerDay)return setManagerStatus("Chưa tải dữ liệu.",true);
    try{
      const before=clone(managerDay),edited=collectEditedLegs(),result=reconcileRelations(edited);
      managerDay.legs=result.legs;managerDay.rotations=result.rotations;managerDay.revision=Number(managerDay.revision||0)+1;managerDay.updatedAtMs=Date.now();managerDay.updatedBy=userName();managerDay.schema=SCHEMA;managerDay.registryBuild=BUILD;
      const beforeRot=JSON.stringify(before.rotations||{}),afterRot=JSON.stringify(managerDay.rotations||{});if(beforeRot!==afterRot){Object.values(managerDay.legs).forEach(l=>{if(l)l.needsReview=true;});}
      addEvent(managerDay,"LEG_ROTATION_UPDATED",{rotationCount:Object.keys(managerDay.rotations||{}).length});
      await ref(`${DB_ROOT}/days/${safeKey(managerDay.opDate)}`).set(managerDay);
      setManagerStatus(`✓ Đã lưu ${Object.keys(managerDay.legs||{}).length} LEG · ${Object.keys(managerDay.rotations||{}).length} rotation. Không có listener nền.`);renderDay(managerDay);
    }catch(e){setManagerStatus("Không lưu được: "+S(e?.message||e),true);}
  }
  async function openManager(){
    if(!isAD())return alert("Chỉ AD được mở Flight LEG / Rotation.");ensureModal();const m=document.getElementById("frtModal");if(m)m.classList.add("show");await reloadManager();
  }
  function closeManager(){document.getElementById("frtModal")?.classList.remove("show");managerDay=null;}
  async function reloadManager(){
    if(!isAD())return;const date=S(requestedManagerDay)||dateFromRosterUI();requestedManagerDay="";try{setManagerStatus("Đang đọc Flight Registry của "+date+"…");managerDay=await readDay(date);renderDay(managerDay);setManagerStatus(`Đã tải ${Object.keys(managerDay.legs||{}).length} LEG. Không mở listener realtime.`);}catch(e){setManagerStatus("Không tải được Registry: "+S(e?.message||e),true);}
  }
  async function manualSync(){
    if(!isAD())return statusMessage("Chỉ AD được đồng bộ LEG.",true);const date=dateFromRosterUI();try{statusMessage("Đang đồng bộ LEG từ manifest "+date+"…");const day=await syncFromManifest(date,"AD_MANUAL_SYNC");statusMessage(`✓ ${Object.keys(day.legs||{}).length} LEG · ${Object.values(day.assignments||{}).filter(x=>x?.active!==false).length} assignment. Không có listener nền.`);if(document.getElementById("frtModal")?.classList.contains("show")){managerDay=day;renderDay(day);setManagerStatus("✓ Đã đồng bộ từ DAILY ROSTER.");}}catch(e){statusMessage("Không đồng bộ được: "+S(e?.message||e),true);setManagerStatus("Không đồng bộ được: "+S(e?.message||e),true);}
  }

  const ROSTER_ENGINE="DAILY_ROSTER_V1";
  const ROSTER_MAIL="roster_mail";
  const ROSTER_MANIFEST="roster_manifests";
  const ROSTER_REVOKE="roster_revocations";

  function flightRawFor(arrFlight,depFlight){
    return [U(arrFlight),U(depFlight)].filter(Boolean).join("/") || U(arrFlight||depFlight);
  }
  function manualAssignmentPlan(corRaw,ldRaw,paxRaw,cbttRaw,dhRaw){
    const cor=usersFromInput(corRaw),ld=usersFromInput(ldRaw),pax=usersFromInput(paxRaw),cbtt=usersFromInput(cbttRaw),dh=usersFromInput(dhRaw);
    const ldSet=new Set(ld),corSet=new Set(cor),out=[];
    const add=(user,formGroup,sourceColumn,roleKey,registryOnly=false,assignmentType="")=>{
      out.push({user,formGroup,sourceColumn,roleKey,registryOnly,assignmentType:assignmentType||roleKey});
    };
    if(!ld.length){
      for(const u of cor)add(u,"fsags","Grnd_Cor","COR");
    }else{
      for(const u of cor.filter(u=>ldSet.has(u)))add(u,"fsags","Grnd_Cor + Grnd_Ld","BOTH");
      for(const u of cor.filter(u=>!ldSet.has(u)))add(u,"fsags421","Grnd_Cor","COR");
      for(const u of ld.filter(u=>!corSet.has(u)))add(u,"fsags551","Grnd_Ld","LD");
    }
    for(const u of pax)add(u,"fsags09","Pax_Supr","PAX09");
    for(const u of cbtt)add(u,"FINAL","CBTT","CBTT",true,"CBTT_FINAL");
    for(const u of dh)add(u,"OPS","ĐH","DH",true,"DH_OPS");
    return out;
  }
  function assignmentLabel(a){
    if(a.assignmentType==="CBTT_FINAL")return "CBTT · FINAL";
    if(a.assignmentType==="DH_OPS")return "ĐH · KHAI THÁC";
    if(a.formGroup==="fsags421")return "42.1";
    if(a.formGroup==="fsags551")return "55.1";
    if(a.formGroup==="fsags09")return "FSAGS 09";
    if(a.formGroup==="fsags")return "42.3";
    return a.formGroup||a.roleKey||"";
  }
  function manualPayload(base,spec,id){
    return {
      engine:ROSTER_ENGINE,schema:2,assignmentId:id,targetUser:spec.user,originalTargetUser:spec.user,
      opDate:base.opDate,date:displayDate(base.opDate),flightRaw:base.flightRaw,flightName:base.flightName,
      arrFlight:base.arrFlight,depFlight:base.depFlight,sta:base.sta,std:base.std,acReg:base.acReg,acType:base.acType,
      route:base.route,route1:base.route1,route3:base.route3,bay:base.bay,formGroup:spec.formGroup,
      sourceColumn:spec.sourceColumn,roleKey:spec.roleKey,sourceFile:"MANUAL_V2.5",active:true,manualOverride:true,
      manualEntry:true,publishedAtMs:Date.now(),publishedBy:userName()
    };
  }
  async function upsertManualAssignments(day,base,specs,legIds){
    day.assignments=day.assignments||{};
    const flightKey=[...legIds].sort().join("+")||U(base.flightRaw);
    let man={};
    try{man=(await ref(`${ROSTER_MANIFEST}/${safeKey(base.opDate)}`).once("value")).val()||{};}catch(_e){}
    const manItems={...(man.items||{})};
    const patch={};
    const old=Object.values(day.assignments).filter(a=>a&&a.source==="MANUAL"&&S(a.manualFlightKey)===flightKey);
    const wanted=new Set();
    for(const spec of specs){
      const id="RA_"+hashId([base.opDate,base.flightRaw,spec.roleKey,spec.user].join("|"));
      wanted.add(id);
      const payload=manualPayload(base,spec,id);
      day.assignments[id]={
        assignmentId:id,active:true,user:spec.user,originalUser:spec.user,formGroup:spec.formGroup,sourceColumn:spec.sourceColumn,
        roleKey:spec.roleKey,assignmentType:spec.assignmentType,registryOnly:!!spec.registryOnly,source:"MANUAL",manualFlightKey:flightKey,
        flightRaw:base.flightRaw,flightName:base.flightName,legIds:[...legIds],updatedAtMs:Date.now()
      };
      manItems[id]={
        assignmentId:id,user:spec.user,originalUser:spec.user,flightRaw:base.flightRaw,flightName:base.flightName,
        formGroup:spec.formGroup,sourceColumn:spec.sourceColumn,roleKey:spec.roleKey,manualEntry:true,manualFlightKey:flightKey,
        arrFlight:base.arrFlight,depFlight:base.depFlight,sta:base.sta,std:base.std,acReg:base.acReg,acType:base.acType,
        route1:base.route1,route3:base.route3,bay:base.bay,registryOnly:!!spec.registryOnly,assignmentType:spec.assignmentType
      };
      if(!spec.registryOnly){
        patch[`${ROSTER_MAIL}/${safeKey(spec.user)}/items/${safeKey(id)}`]=payload;
        patch[`${ROSTER_REVOKE}/${safeKey(spec.user)}/items/${safeKey(id)}`]=null;
      }
    }
    for(const a of old){
      if(wanted.has(S(a.assignmentId)))continue;
      a.active=false;a.replacedAtMs=Date.now();day.assignments[a.assignmentId]=a;
      delete manItems[a.assignmentId];
      if(!a.registryOnly&&a.user){
        patch[`${ROSTER_MAIL}/${safeKey(a.user)}/items/${safeKey(a.assignmentId)}`]=null;
        patch[`${ROSTER_REVOKE}/${safeKey(a.user)}/items/${safeKey(a.assignmentId)}`]={
          assignmentId:a.assignmentId,reason:"MANUAL_ASSIGNMENT_UPDATED",atMs:Date.now(),by:userName()
        };
      }
    }
    const nextMan={
      ...man,engine:ROSTER_ENGINE,schema:2,opDate:base.opDate,
      fileName:man.fileName||"MANUAL_V2.5",columns:man.columns||["Grnd_Cor","Grnd_Ld","Pax_Supr","CBTT","ĐH"],
      publishedAtMs:Date.now(),publishedBy:userName(),items:manItems
    };
    patch[`${ROSTER_MANIFEST}/${safeKey(base.opDate)}`]=nextMan;
    return {patch,flightKey,created:specs.length};
  }

  function ensureManualCreateModal(){
    ensureStyles();
    if(document.getElementById("frtCreateModal"))return;
    const s=document.createElement("style");
    s.id="frtCreateStyle";
    s.textContent=`
      #frtCreateModal{display:none;position:fixed;inset:0;z-index:17200;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:10px;box-sizing:border-box;font-family:Arial,sans-serif}
      #frtCreateModal.show{display:flex}.frtcPanel{width:min(96vw,820px);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;padding:14px;box-sizing:border-box;box-shadow:0 18px 48px rgba(0,0,0,.32)}
      .frtcHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.frtcHead h3{margin:0;color:#0b4f91}.frtcGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.frtcField label{display:block;font-size:11px;font-weight:900;color:#425d73;margin-bottom:4px}.frtcField input,.frtcField select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd7e0;border-radius:8px;background:#fff}.frtcWide{grid-column:1/-1}.frtcHint{font-size:12px;color:#60717e;line-height:1.45;margin-top:5px}.frtcBlock{border:1px solid #dbe4eb;border-radius:11px;padding:10px;background:#fafcfd}.frtcBlock h4{margin:0 0 8px;color:#244a69}.frtcActions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}.frtcBtn{border:0;border-radius:9px;padding:10px 13px;font-weight:900;cursor:pointer;background:#0b67b2;color:#fff}.frtcBtn.gray{background:#eef3f7;color:#31475a;border:1px solid #ccd7df}.frtcBtn.green{background:#15803d}.frtcStatus{margin-top:9px;padding:9px 10px;border-radius:9px;background:#eef6ff;color:#234764;font-size:12px;white-space:pre-wrap}.frtcStatus.err{background:#fff0f0;color:#9b1c1c}.frtcAssignHint{font-size:11px;color:#566b7b;line-height:1.4;margin-top:6px}
      @media(max-width:650px){.frtcGrid{grid-template-columns:1fr}.frtcWide{grid-column:auto}.frtcActions .frtcBtn{flex:1}}
    `;
    document.head.appendChild(s);
    const m=document.createElement("div");m.id="frtCreateModal";
    m.innerHTML=`<div class="frtcPanel"><div class="frtcHead"><div><h3>✈️ QUẢN LÝ CHUYẾN · TẠO THỦ CÔNG</h3><div class="frtcHint"><b>V2.5 · nền V1.84.</b> Tạo/cập nhật LEG, rotation và phân công trong một lần xác nhận.</div></div><button class="frtcBtn gray" onclick="sagsFlightRegistryCreateClose()">ĐÓNG</button></div>
      <div class="frtcGrid">
        <div class="frtcField"><label>NGÀY KHAI THÁC</label><input id="frtcDate" type="date"></div>
        <div class="frtcField"><label>KIỂU TẠO</label><select id="frtcMode" onchange="sagsFlightRegistryCreateModeChanged()"><option value="PAIR">CẶP ARR → DEP</option><option value="ARR_ONLY">ARR-ONLY</option><option value="DEP_ONLY">DEP-ONLY</option></select></div>
      </div>
      <div class="frtcBlock" id="frtcArrBlock" style="margin-top:10px"><h4>CHUYẾN ĐẾN · ARR</h4><div class="frtcGrid"><div class="frtcField"><label>FLIGHT ARR</label><input id="frtcArrFlight" placeholder="VD: VJ733"></div><div class="frtcField"><label>ORIGIN</label><input id="frtcOrigin" placeholder="VD: HAN"></div><div class="frtcField"><label>STA</label><input id="frtcSta" placeholder="HH:MM"></div><div class="frtcField" id="frtcArrDispositionWrap"><label>SAU KHI ĐẾN</label><select id="frtcArrDisposition"><option value="TBD">CHƯA XÁC ĐỊNH</option><option value="REMAIN">NẰM LẠI CXR</option><option value="NIGHT_STOP">NIGHT STOP</option></select></div></div></div>
      <div class="frtcBlock" id="frtcDepBlock" style="margin-top:10px"><h4>CHUYẾN ĐI · DEP</h4><div class="frtcGrid"><div class="frtcField"><label>FLIGHT DEP</label><input id="frtcDepFlight" placeholder="VD: VJ834"></div><div class="frtcField"><label>DESTINATION</label><input id="frtcDestination" placeholder="VD: SGN"></div><div class="frtcField"><label>STD</label><input id="frtcStd" placeholder="HH:MM"></div><div class="frtcField" id="frtcDepSourceWrap"><label>NGUỒN TÀU</label><select id="frtcDepSource"><option value="ON_GROUND">TÀU ĐANG NẰM TẠI CXR</option><option value="TBD">CHƯA XÁC ĐỊNH</option></select></div></div></div>
      <div class="frtcBlock" style="margin-top:10px"><h4>TÀU BAY / VỊ TRÍ</h4><div class="frtcGrid"><div class="frtcField"><label>A/C REG</label><input id="frtcReg" placeholder="VD: VN-A123"></div><div class="frtcField"><label>A/C TYPE</label><input id="frtcType" placeholder="VD: A321"></div><div class="frtcField"><label>BAY</label><input id="frtcBay" placeholder="VD: 16"></div><div class="frtcField"><label>GATE</label><input id="frtcGate" placeholder="VD: 3"></div></div></div>
      <div class="frtcBlock" style="margin-top:10px"><h4>PHÂN CÔNG NHÂN SỰ</h4><div class="frtcGrid">
        <div class="frtcField"><label>Grnd_Cor · username</label><input id="frtcCor" placeholder="VD: BANGTD"></div>
        <div class="frtcField"><label>Grnd_Ld · username</label><input id="frtcLd" placeholder="Để trống nếu không có"></div>
        <div class="frtcField"><label>Pax_Supr · username</label><input id="frtcPax" placeholder="VD: LINHNT"></div>
        <div class="frtcField"><label>CBTT · username</label><input id="frtcCbtt" placeholder="Có thể nhiều username, ngăn bằng dấu phẩy"></div>
        <div class="frtcField frtcWide"><label>ĐH · username</label><input id="frtcDh" placeholder="Có thể nhiều username, ngăn bằng dấu phẩy"></div>
      </div><div class="frtcAssignHint">Quy tắc tự tạo: không có Grnd_Ld → Grnd_Cor nhận 42.3; Cor/Ld khác người → Cor 42.1 + Ld 55.1; cùng người → 42.3; Pax_Supr → FSAGS09. CBTT/ĐH được gắn assignment vào chuyến; FINAL chỉ sinh khi CBTT mở lần đầu.</div></div>
      <div class="frtcStatus" id="frtcStatus">Nhập thông tin rồi bấm TẠO / CẬP NHẬT. Không tạo listener Flight Registry nền.</div>
      <div class="frtcActions"><button class="frtcBtn gray" onclick="sagsFlightManagerOpen()">← QUẢN LÝ CHUYẾN</button><button class="frtcBtn green" id="frtcSaveBtn" onclick="sagsFlightRegistryCreateSave()">TẠO / CẬP NHẬT & PHÂN CÔNG</button></div></div>`;
    document.body.appendChild(m);
    const d=document.getElementById("frtcDate");if(d)d.value=todayISO();
    createModeChanged();
  }
  function createStatus(msg,err=false){const e=document.getElementById("frtcStatus");if(e){e.textContent=msg;e.classList.toggle("err",!!err);}}
  function createValue(id){return S(document.getElementById(id)?.value);}
  function validTime(v){return !v||/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(S(v));}
  function createModeChanged(){
    const mode=U(createValue("frtcMode")||"PAIR"),arr=document.getElementById("frtcArrBlock"),dep=document.getElementById("frtcDepBlock"),ad=document.getElementById("frtcArrDispositionWrap"),ds=document.getElementById("frtcDepSourceWrap");
    if(arr)arr.style.display=mode==="DEP_ONLY"?"none":"";
    if(dep)dep.style.display=mode==="ARR_ONLY"?"none":"";
    if(ad)ad.style.display=mode==="PAIR"?"none":"";
    if(ds)ds.style.display=mode==="PAIR"?"none":"";
  }
  async function createOpen(){
    if(!isAD())return alert("Chỉ AD được tạo/cập nhật chuyến.");
    ensureManualCreateModal();
    const d=document.getElementById("frtcDate");if(d)d.value=document.getElementById("fm21Date")?.value||dateFromRosterUI()||todayISO();
    document.getElementById("frtHubModal")?.classList.remove("show");
    document.getElementById("frtCreateModal")?.classList.add("show");createModeChanged();
  }
  function createClose(){document.getElementById("frtCreateModal")?.classList.remove("show");}
  function upsertManualLeg(day,direction,flightNo,fields){
    const existing=findExistingLeg(day.legs,direction,flightNo);
    const before=existing?operationalSignature(normalizeLeg(existing)):"";
    const leg=normalizeLeg({
      ...(existing||{}),legId:existing?.legId||newLegId(day.opDate,direction,flightNo),direction,flightNo,
      time:fields.time,aircraftReg:fields.reg,aircraftType:fields.type,route:fields.route,bay:fields.bay,gate:fields.gate,
      status:existing?.status||"SCHEDULED",revision:existing?.revision||1,manualCreated:true,manualUpdatedAtMs:Date.now(),
      createdAtMs:existing?.createdAtMs||Date.now(),createdBy:existing?.createdBy||userName()
    });
    const after=operationalSignature(leg);
    if(existing&&before!==after){leg.revision=Number(existing.revision||1)+1;leg.needsReview=true;leg.updatedAtMs=Date.now();leg.updatedBy=userName();}
    return leg;
  }
  async function createSave(){
    if(!isAD())return createStatus("Chỉ AD được tạo/cập nhật chuyến.",true);
    const mode=U(createValue("frtcMode")||"PAIR"),opDate=createValue("frtcDate"),arrFlight=U(createValue("frtcArrFlight")),depFlight=U(createValue("frtcDepFlight")),
      origin=U(createValue("frtcOrigin")),dest=U(createValue("frtcDestination")),sta=createValue("frtcSta"),std=createValue("frtcStd"),reg=U(createValue("frtcReg")),
      type=U(createValue("frtcType")),bay=U(createValue("frtcBay")),gate=U(createValue("frtcGate"));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(opDate))return createStatus("Ngày khai thác không hợp lệ.",true);
    if(!validTime(sta)||!validTime(std))return createStatus("STA/STD phải theo HH:MM.",true);
    if(mode!=="DEP_ONLY"&&!arrFlight)return createStatus("Chưa nhập Flight ARR.",true);
    if(mode!=="ARR_ONLY"&&!depFlight)return createStatus("Chưa nhập Flight DEP.",true);
    if(mode==="PAIR"&&arrFlight===depFlight)return createStatus("Flight ARR và DEP không được trùng nhau.",true);
    try{
      createStatus("Đang tạo/cập nhật LEG và phân công…");
      const day=await readDay(opDate);day.opDate=opDate;day.schema=SCHEMA;day.registryBuild=BUILD;day.legs=day.legs||{};day.assignments=day.assignments||{};
      let arr=null,dep=null;
      if(mode!=="DEP_ONLY"){
        arr=upsertManualLeg(day,"ARR",arrFlight,{time:sta,reg,type,route:[origin,"CXR"].filter(Boolean).join("-"),bay,gate});
        arr.arrDisposition=mode==="PAIR"?"TO_DEPARTURE":U(createValue("frtcArrDisposition")||arr.arrDisposition||"TBD");
        day.legs[arr.legId]=arr;
      }
      if(mode!=="ARR_ONLY"){
        dep=upsertManualLeg(day,"DEP",depFlight,{time:std,reg,type,route:["CXR",dest].filter(Boolean).join("-"),bay,gate});
        const source=mode==="PAIR"?"ARRIVAL_LEG":U(createValue("frtcDepSource")||dep.depSourceType||"ON_GROUND");
        dep.depSourceType=source;dep.sourceLegId=mode==="PAIR"?arr?.legId||"":"";dep.onGroundReg=source==="ON_GROUND"?U(reg||dep.aircraftReg):"";
        day.legs[dep.legId]=dep;
      }
      if(arr&&dep){arr.onwardLegId=dep.legId;day.legs[arr.legId]=arr;}
      const rel=reconcileRelations(day.legs);day.legs=rel.legs;day.rotations=rel.rotations;
      const legIds=[arr?.legId,dep?.legId].filter(Boolean);
      const base={
        opDate,flightRaw:flightRawFor(arrFlight,depFlight),flightName:[arrFlight,depFlight].filter(Boolean).join(" / ")||arrFlight||depFlight,
        arrFlight,depFlight,sta,std,acReg:reg,acType:type,route:[origin,"CXR",dest].filter(Boolean).join("-"),route1:origin,route3:dest,bay
      };
      const specs=manualAssignmentPlan(createValue("frtcCor"),createValue("frtcLd"),createValue("frtcPax"),createValue("frtcCbtt"),createValue("frtcDh"));
      const asn=await upsertManualAssignments(day,base,specs,legIds);
      day.revision=Number(day.revision||0)+1;day.updatedAtMs=Date.now();day.updatedBy=userName();day.registryBuild=BUILD;
      addEvent(day,"MANUAL_FLIGHT_SAVED",{mode,arrLegId:arr?.legId||"",depLegId:dep?.legId||"",arrFlight:arr?.flightNo||"",depFlight:dep?.flightNo||"",aircraftReg:reg,assignmentCount:specs.length});
      asn.patch[`${DB_ROOT}/days/${safeKey(opDate)}`]=day;
      await ref("").update(asn.patch);managerDay=day;
      const labels=specs.map(x=>`${x.user} · ${assignmentLabel(x)}`);
      createStatus(`✓ Đã lưu ${arr&&dep?arr.flightNo+" → "+dep.flightNo:(arr?"ARR "+arr.flightNo:"DEP "+dep.flightNo)} · ${specs.length} assignment.${labels.length?"\n"+labels.join("\n"):"\nChưa phân nhân sự."}`);
      const md=document.getElementById("drManageDate");if(md)md.value=opDate;
      const hd=document.getElementById("fm21Date");if(hd)hd.value=opDate;
    }catch(e){createStatus("Không tạo/cập nhật được chuyến: "+S(e?.message||e),true);}
  }


  /* ---------- V2.5 · ONE-STEP DAILY ROSTER IMPORT ---------- */
  function foldHeader(v){
    return U(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/Đ/g,"D").replace(/[^A-Z0-9]/g,"");
  }
  function headerIndexByAliases(map,aliases){
    const wanted=new Set((aliases||[]).map(foldHeader));
    for(const [k,i] of Object.entries(map||{}))if(wanted.has(foldHeader(k)))return i;
    return -1;
  }
  function cellAt(row,i){return i>=0?S(row?.[i]):"";}
  async function parseRosterDirect(file){
    const T=root.__SAGS_DAILY_ROSTER_TEST__;
    if(!T)throw new Error("DAILY ROSTER engine chưa sẵn sàng.");
    if(!file)throw new Error("Chưa chọn file DAILY ROSTER.");
    if(/\.csv$/i.test(file.name||""))return T.parseCsvText(await file.text());
    return T.parseXlsxBytes(new Uint8Array(await file.arrayBuffer()));
  }
  function directRosterPayload(r,data){
    return {engine:ROSTER_ENGINE,schema:2,assignmentId:r.assignmentId,targetUser:r.targetUser,originalTargetUser:r.originalTargetUser||r.targetUser,
      opDate:r.opDate,date:r.date,flightRaw:r.flightRaw,flightName:r.flightName||"",arrFlight:r.arrFlight||"",depFlight:r.depFlight||"",
      sta:r.sta||"",std:r.std||"",acReg:r.acReg||"",acType:r.acType||"",route:r.route||"",route1:r.route1||"",route3:r.route3||"",bay:r.bay||"",
      formGroup:r.formGroup,sourceColumn:r.sourceColumn,roleKey:r.roleKey,sourceFile:data.fileName||"",active:true,manualOverride:false,
      publishedAtMs:Date.now(),publishedBy:userName()};
  }
  async function publishRosterDirect(data,allRows){
    const byDate=new Map();
    for(const r of data.records||[]){if(!byDate.has(r.opDate))byDate.set(r.opDate,[]);byDate.get(r.opDate).push(r);}
    for(const r of allRows||[])if(r?.opDate&&!byDate.has(r.opDate))byDate.set(r.opDate,[]);
    let writes=0,removes=0,overrides=0;
    for(const [opDate,recs0] of byDate){
      let old={};try{old=(await ref(`${ROSTER_MANIFEST}/${safeKey(opDate)}`).once("value")).val()||{};}catch(_e){}
      const oldItems=old.items||{},nextItems={},patch={};
      for(const baseRec of recs0){
        const oldItem=oldItems[baseRec.assignmentId]||{};
        const manual=oldItem.manualOverride===true&&S(oldItem.user);
        const effectiveUser=manual?normUser(oldItem.user):baseRec.targetUser;
        if(manual)overrides++;
        const r={...baseRec,targetUser:effectiveUser};
        const payload={...directRosterPayload(r,data),manualOverride:manual};
        patch[`${ROSTER_MAIL}/${safeKey(r.targetUser)}/items/${safeKey(r.assignmentId)}`]=payload;
        patch[`${ROSTER_REVOKE}/${safeKey(r.targetUser)}/items/${safeKey(r.assignmentId)}`]=null;
        if(oldItem.user&&normUser(oldItem.user)!==normUser(r.targetUser)){
          patch[`${ROSTER_MAIL}/${safeKey(oldItem.user)}/items/${safeKey(r.assignmentId)}`]=null;
          patch[`${ROSTER_REVOKE}/${safeKey(oldItem.user)}/items/${safeKey(r.assignmentId)}`]={assignmentId:r.assignmentId,reason:"REASSIGNED",atMs:Date.now(),by:userName()};
        }
        nextItems[r.assignmentId]={assignmentId:r.assignmentId,user:r.targetUser,originalUser:baseRec.originalTargetUser||baseRec.targetUser,
          flightRaw:r.flightRaw,flightName:r.flightName||"",formGroup:r.formGroup,sourceColumn:r.sourceColumn,roleKey:r.roleKey,manualOverride:manual};
        writes++;
      }
      for(const [id,x] of Object.entries(oldItems)){
        // Giữ assignment tạo tay V2; roster import không được xóa chuyến lẻ/assignment tay.
        if(x?.manualEntry===true){nextItems[id]=x;continue;}
        if(!nextItems[id]&&x?.user){
          patch[`${ROSTER_MAIL}/${safeKey(x.user)}/items/${safeKey(id)}`]=null;
          patch[`${ROSTER_REVOKE}/${safeKey(x.user)}/items/${safeKey(id)}`]={assignmentId:id,reason:"ROSTER_REMOVED",atMs:Date.now(),by:userName()};
          removes++;
        }
      }
      patch[`${ROSTER_MANIFEST}/${safeKey(opDate)}`]={...old,engine:ROSTER_ENGINE,schema:2,opDate,fileName:data.fileName||"",columns:["Grnd_Cor","Grnd_Ld","Pax_Supr"],publishedAtMs:Date.now(),publishedBy:userName(),items:nextItems};
      await ref("").update(patch);
    }
    return {writes,removes,overrides,dates:byDate.size};
  }
  function allRowKey(r){const raw=S(r?.flightRaw||r?.flightName||"");const fs=splitFlights(raw);return fs.length?fs.join("|"):foldHeader(raw);}
  function extractExtraUnitAssignments(parsed,allRows){
    const T=root.__SAGS_DAILY_ROSTER_TEST__,out=[];
    if(!T)return out;
    let hi;try{hi=T.headerRowInfo(parsed.rows||[]);}catch(_e){return out;}
    const map=hi.map||{},rows=parsed.rows||[],byFlight=new Map();
    for(const r of allRows||[]){const k=allRowKey(r);if(k&&!byFlight.has(k))byFlight.set(k,r);}
    const defs=[
      {unit:"CBTT",type:"CBTT_FINAL",roleKey:"CBTT",label:"CBTT · FINAL",aliases:["CBTT","LOAD CONTROL","LOAD_CONTROLLER","LOAD CONTROLLER"]},
      {unit:"ĐH",type:"DH_OPS",roleKey:"DH",label:"ĐH · KHAI THÁC",aliases:["ĐH","DH","DIEU HANH","DISPATCHER","OPS CONTROLLER"]},
      {unit:"SÂN ĐỖ",type:"APRON_TASK",roleKey:"SAN_DO",label:"SÂN ĐỖ",aliases:["SÂN ĐỖ","SAN DO","SANDO","APRON","APRON STAFF"]},
      {unit:"HÀNH LÝ NHÀ GA",type:"BAGGAGE_TERMINAL_TASK",roleKey:"HL_NHA_GA",label:"HÀNH LÝ NHÀ GA",aliases:["HÀNH LÝ NHÀ GA","HANH LY NHA GA","BAGGAGE TERMINAL","BAGGAGE HALL"]},
      {unit:"KHO HÀNG",type:"CARGO_WAREHOUSE_TASK",roleKey:"KHO_HANG",label:"KHO HÀNG",aliases:["KHO HÀNG","KHO HANG","CARGO WAREHOUSE","WAREHOUSE"]}
    ];
    const idx=defs.map(d=>({...d,i:headerIndexByAliases(map,d.aliases)})).filter(d=>d.i>=0);
    if(!idx.length)return out;
    const flightIdx=headerIndexByAliases(map,["FlightNo","FLIGHT NO","FLIGHT"]);
    for(let ri=hi.row+1;ri<rows.length;ri++){
      const row=rows[ri]||[],raw=cellAt(row,flightIdx),base=byFlight.get((splitFlights(raw).length?splitFlights(raw).join("|"):foldHeader(raw)));
      if(!raw||!base)continue;
      for(const d of idx)for(const user of usersFromInput(cellAt(row,d.i))){out.push({opDate:base.opDate,flightRaw:base.flightRaw,flightName:base.flightName,user,unit:d.unit,assignmentType:d.type,roleKey:d.roleKey,label:d.label});}
    }
    return out;
  }
  function pairCanAutoLink(day,arrId,depId){
    for(const l of Object.values(day.legs||{})){
      if(!l)continue;
      if(l.direction==="ARR"&&l.legId!==arrId&&l.arrDisposition==="TO_DEPARTURE"&&S(l.onwardLegId)===depId)return false;
      if(l.direction==="DEP"&&l.legId!==depId&&l.depSourceType==="ARRIVAL_LEG"&&S(l.sourceLegId)===arrId)return false;
    }
    return true;
  }
  function mergeParsedRosterIntoDay(day,rows,extras){
    day.legs=day.legs||{};day.assignments=day.assignments||{};const groupLegs=new Map();let review=0;
    for(const rec of rows||[]){
      let arr=U(rec.arrFlight),dep=U(rec.depFlight);const flights=splitFlights(rec.flightName||rec.flightRaw||"");
      if(!arr&&!dep&&flights.length>=2){arr=flights[0];dep=flights[1];}
      if(!arr&&!dep&&flights.length===1){const dir=classifySingleLeg(rec,flights[0]);if(dir==="ARR")arr=flights[0];else if(dir==="DEP")dep=flights[0];}
      const ids=[];let a=null,d=null;
      if(arr){a=legFromCandidate(day,rec,"ARR",arr);day.legs[a.legId]=a;ids.push(a.legId);}
      if(dep){const existed=findExistingLeg(day.legs,"DEP",dep);d=legFromCandidate(day,rec,"DEP",dep);if(!arr&&!existed&&U(rec.acReg)){d.depSourceType="ON_GROUND";d.onGroundReg=U(rec.acReg);}day.legs[d.legId]=d;ids.push(d.legId);}
      if(!arr&&!dep&&flights[0]){const x=legFromCandidate(day,rec,"UNKNOWN",flights[0]);day.legs[x.legId]=x;ids.push(x.legId);}
      if(a&&d){
        const userLocked=["REMAIN","NIGHT_STOP"].includes(U(a.arrDisposition))||U(d.depSourceType)==="ON_GROUND";
        if(!userLocked&&pairCanAutoLink(day,a.legId,d.legId)){
          a.arrDisposition="TO_DEPARTURE";a.onwardLegId=d.legId;d.depSourceType="ARRIVAL_LEG";d.sourceLegId=a.legId;d.onGroundReg="";
        }else if(!userLocked){a.needsReview=true;d.needsReview=true;review++;}
        day.legs[a.legId]=a;day.legs[d.legId]=d;
      }
      groupLegs.set(allRowKey(rec),ids);
    }
    try{const rel=reconcileRelations(day.legs);day.legs=rel.legs;day.rotations=rel.rotations;}catch(e){review++;day.rotationReview={required:true,message:S(e?.message||e),atMs:Date.now()};}
    // Các cột đơn vị phụ trợ (nếu có đúng header) chỉ tạo assignment; không tự sinh form giả.
    for(const x of extras||[]){
      if(S(x.opDate)!==S(day.opDate))continue;const ids=groupLegs.get(allRowKey(x))||[];
      const id="RAU_"+hashId([x.opDate,x.flightRaw,x.roleKey,x.user].join("|"));
      day.assignments[id]={assignmentId:id,active:true,user:x.user,originalUser:x.user,formGroup:"UNIT_TASK",sourceColumn:x.unit,roleKey:x.roleKey,
        assignmentType:x.assignmentType,unit:x.unit,label:x.label,registryOnly:true,source:"ROSTER_UNIT",flightRaw:x.flightRaw,flightName:x.flightName||x.flightRaw,legIds:ids,updatedAtMs:Date.now()};
    }
    return {day,review};
  }
  async function importDailyRosterOneStep(file){
    if(!isAD())throw new Error("Chỉ AD được nhập DAILY ROSTER.");
    const T=root.__SAGS_DAILY_ROSTER_TEST__,parsed=await parseRosterDirect(file),fixed=T.rosterRecords(parsed),all=T.allFlightRows(parsed),allRows=all.records||[];
    if(!allRows.length)throw new Error("Không tìm thấy chuyến hợp lệ trong DAILY ROSTER.");
    const data={...fixed,sheetName:parsed.sheetName,fileName:file.name||"DAILY_ROSTER"};
    const pub=await publishRosterDirect(data,allRows),extras=extractExtraUnitAssignments(parsed,allRows),dates=[...new Set(allRows.map(r=>r.opDate).filter(Boolean))];
    let totalLegs=0,totalAssignments=0,totalReview=0;
    for(const date of dates){
      let day;try{day=await syncFromManifest(date,"V2.5_ONE_STEP_IMPORT");}catch(_e){day=await readDay(date);}
      const merged=mergeParsedRosterIntoDay(day,allRows.filter(r=>r.opDate===date),extras);day=merged.day;totalReview+=merged.review;
      day.revision=Number(day.revision||0)+1;day.updatedAtMs=Date.now();day.updatedBy=userName();day.registryBuild=BUILD;
      addEvent(day,"ROSTER_ONE_STEP_IMPORTED",{fileName:file.name||"",legCount:Object.keys(day.legs||{}).length,assignmentCount:Object.values(day.assignments||{}).filter(a=>a?.active!==false).length,reviewCount:merged.review});
      await ref(`${DB_ROOT}/days/${safeKey(date)}`).set(day);totalLegs+=Object.keys(day.legs||{}).length;totalAssignments+=Object.values(day.assignments||{}).filter(a=>a?.active!==false).length;
      managerDay=day;
    }
    return {fileName:file.name||"",dates,rows:allRows.length,legs:totalLegs,assignments:totalAssignments,forms:pub.writes,removed:pub.removes,overrides:pub.overrides,review:totalReview};
  }
  async function managerFileChanged(input){
    const file=input?.files?.[0];if(!file)return;input.disabled=true;const st=document.getElementById("fm22Status");
    try{
      if(st){st.className="fm22Status";st.textContent=`Đang đọc ${file.name} và tự tạo/cập nhật chuyến…`;}
      const r=await importDailyRosterOneStep(file);const d=r.dates[0]||todayISO();const di=document.getElementById("fm21Date");if(di)di.value=d;
      if(st){st.className="fm22Status ok";st.textContent=`✓ ĐÃ XỬ LÝ ${r.fileName}\n${r.rows} dòng chuyến · ${r.legs} LEG · ${r.assignments} assignment · ${r.forms} biểu mẫu phân công${r.review?`\n⚠ ${r.review} trường hợp rotation cần AD kiểm tra.`:"\nRotation rõ ràng đã được tự ghép; trường hợp mơ hồ giữ để kiểm tra."}`;}
    }catch(e){if(st){st.className="fm22Status err";st.textContent="Không nhập được DAILY ROSTER: "+S(e?.message||e);}else alert(S(e?.message||e));}
    finally{input.disabled=false;input.value="";}
  }

  function ensureUnifiedHub(){
    ensureStyles();
    if(!document.getElementById("fm21Style")){
      const st=document.createElement("style");st.id="fm21Style";st.textContent=`
        #roleBtnFlightCreateV2,#roleBtnDailyRoster{display:none!important}
        #roleBtnFlightManageV21{display:none!important;background:#075c9c!important;color:#fff!important}
        body.role-admin #roleBtnFlightManageV21{display:inline-flex!important;align-items:center;justify-content:center}
        #frtHubModal{display:none;position:fixed;inset:0;z-index:17080;background:rgba(0,0,0,.56);align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font-family:Arial,sans-serif}
        #frtHubModal.show{display:flex}.fm21Panel{width:min(96vw,760px);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;padding:15px;box-shadow:0 18px 46px rgba(0,0,0,.3)}
        .fm21Head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.fm21Head h3{margin:0;color:#0b4f91}.fm21Sub{font-size:12px;color:#5d6d79;line-height:1.45;margin:5px 0 12px}.fm21Date{border:1px solid #d8e2ea;border-radius:11px;padding:10px;background:#f7fafc}.fm21Date label{font-size:11px;font-weight:900;color:#466176;display:block;margin-bottom:4px}.fm21Date input{padding:9px;border:1px solid #cbd7e0;border-radius:8px;width:min(220px,100%);box-sizing:border-box}
        .fm22Import{margin-top:12px;border:2px dashed #9fc0d8;border-radius:14px;padding:18px;text-align:center;background:#f7fbff}.fm22ImportBtn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:11px;padding:11px 17px;background:#0b67b2;color:#fff;font-weight:900;cursor:pointer}.fm22Status{margin-top:10px;padding:10px;border-radius:10px;background:#eef6ff;color:#345;font-size:12px;line-height:1.45;white-space:pre-wrap;text-align:left}.fm22Status.ok{background:#eaf7ef;color:#176b32}.fm22Status.err{background:#fff0f0;color:#9b1c1c}.fm22Bottom{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fm22SmallBtn{border:1px solid #cbd7e0;border-radius:9px;padding:9px 11px;background:#fff;color:#31546f;font-weight:800;cursor:pointer}.fm21Close{border:0;border-radius:9px;padding:9px 12px;font-weight:800;background:#eef3f7;color:#31475a}
      `;document.head.appendChild(st);
    }
    if(!document.getElementById("frtHubModal")){
      const m=document.createElement("div");m.id="frtHubModal";
      m.innerHTML=`<div class="fm21Panel"><div class="fm21Head"><div><h3>✈️ QUẢN LÝ CHUYẾN</h3><div class="fm21Sub">V2.5 · Chọn DAILY ROSTER là hệ thống tự tạo/cập nhật chuyến, rotation và phân công. Không còn bước xem trước → TẠO & PHÂN CÔNG.</div></div><button class="fm21Close" onclick="sagsFlightManagerClose()">ĐÓNG</button></div>
        <div class="fm21Date"><label>NGÀY ĐANG XEM</label><input id="fm21Date" type="date"></div>
        <div class="fm22Import"><div style="font-weight:900;color:#174b72;margin-bottom:8px">DAILY ROSTER</div><button class="fm22ImportBtn" onclick="document.getElementById('fm22RosterFile').click()">📋 CHỌN FILE XLSX / CSV</button><input id="fm22RosterFile" type="file" accept=".xlsx,.xlsm,.csv" style="display:none" onchange="sagsFlightManagerImportFile(this)"><div class="fm22Status" id="fm22Status">Chọn file DAILY ROSTER. Sau khi chọn, hệ thống tự tạo/cập nhật LEG và phân công ngay.</div></div>
        <div class="fm22Bottom"><button class="fm22SmallBtn" onclick="sagsFlightManagerOpenRegistry()">DANH SÁCH CHUYẾN / ROTATION</button><button class="fm22SmallBtn" onclick="sagsFlightRegistryCreateOpen()">+ THÊM CHUYẾN LẺ</button></div></div>`;
      document.body.appendChild(m);const d=document.getElementById("fm21Date");if(d)d.value=todayISO();
    }
  }
  function hubDate(){return S(document.getElementById("fm21Date")?.value)||todayISO();}
  function managerOpen(){
    if(!isAD())return alert("Chỉ AD được mở QUẢN LÝ CHUYẾN.");
    ensureUnifiedHub();document.getElementById("frtHubModal")?.classList.add("show");
  }
  function managerClose(){document.getElementById("frtHubModal")?.classList.remove("show");}
  function openRosterFromHub(){
    if(!isAD())return;
    const date=hubDate();managerClose();
    if(typeof root.openDailyRosterManager!=="function")return alert("DAILY ROSTER chưa sẵn sàng.");
    root.openDailyRosterManager();
    const md=document.getElementById("drManageDate");if(md)md.value=date;
    ensureRosterControls();
  }
  function openRegistryFromHub(){
    const date=hubDate();managerClose();requestedManagerDay=date;
    const md=document.getElementById("drManageDate");if(md)md.value=date;
    void openManager();
  }
  function openAssignmentsFromHub(){
    const date=hubDate();managerClose();
    if(typeof root.openDailyRosterManager!=="function")return alert("DAILY ROSTER chưa sẵn sàng.");
    root.openDailyRosterManager();
    const md=document.getElementById("drManageDate");if(md)md.value=date;
    ensureRosterControls();
    if(typeof root.dailyRosterLoadAssignments==="function")void root.dailyRosterLoadAssignments();
  }
  function ensureAdEntryButton(){
    ensureUnifiedHub();
    const bar=document.querySelector(".toolbar-row.main-actions");if(!bar)return;
    let b=document.getElementById("roleBtnFlightManageV21");
    if(!b){
      b=document.createElement("button");b.id="roleBtnFlightManageV21";b.type="button";b.textContent="✈️ QUẢN LÝ CHUYẾN";b.onclick=managerOpen;
      const anchor=document.getElementById("roleBtnFlights");
      if(anchor?.parentNode)anchor.parentNode.insertBefore(b,anchor.nextSibling);else bar.insertBefore(b,bar.firstChild);
    }
  }

  const V2_VERSION_URL="./v2-version.json";
  const V2_APPLY_KEY="sags-v2-update-applying";
  function applyV2Display(){
    try{
      document.documentElement.setAttribute("data-sags-build",BUILD);
      document.documentElement.setAttribute("data-app-version","V2.5 AI");
      const marker=document.getElementById("buildMarker");if(marker)marker.textContent="V2.5 AI";
      const hint=document.getElementById("statusHint");if(hint&&!/^Lỗi khởi tạo:/i.test(S(hint.textContent)))hint.textContent="V2.5 AI · 20/08/26";
    }catch(_e){}
  }
  function ensureV2UpdateModal(){
    if(document.getElementById("v2UpdateModal"))return;
    const m=document.createElement("div");m.id="v2UpdateModal";
    m.style.cssText="display:none;position:fixed;inset:0;z-index:52000;background:rgba(0,0,0,.58);align-items:center;justify-content:center;padding:14px";
    m.innerHTML='<div style="width:min(94vw,460px);background:#fff;border-radius:14px;padding:16px;font-family:Arial;box-shadow:0 16px 42px rgba(0,0,0,.32)"><h3 style="margin:0 0 8px;color:#0b4f91">CÓ BẢN E-REPORT MỚI</h3><div id="v2UpdateText" style="font-size:14px;line-height:1.45;color:#334;margin-bottom:12px"></div><div style="display:flex;gap:8px"><button id="v2UpdateLater" style="flex:1;border:0;border-radius:9px;padding:11px;background:#e9eef2;font-weight:800">ĐỂ SAU</button><button id="v2UpdateNow" style="flex:1;border:0;border-radius:9px;padding:11px;background:#0b67b2;color:#fff;font-weight:800">LƯU & CẬP NHẬT</button></div></div>';
    document.body.appendChild(m);
    const later=document.getElementById("v2UpdateLater");if(later)later.onclick=()=>{m.style.display="none";};
  }
  async function v2FetchJson(path){const r=await fetch(path+(path.includes("?")?"&":"?")+"t="+Date.now(),{cache:"no-store",headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});if(!r.ok)throw new Error(path+" HTTP "+r.status);return r.json();}
  async function v2FetchText(path){const r=await fetch(path+(path.includes("?")?"&":"?")+"t="+Date.now(),{cache:"no-store",headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});if(!r.ok)throw new Error(path+" HTTP "+r.status);return r.text();}
  async function v2ServerInfo(){
    const v=await v2FetchJson(V2_VERSION_URL),build=S(v?.build),display=S(v?.displayVersion||v?.label||v?.version||build);
    return {build,display};
  }
  async function verifyV2Files(target){
    const [js,sw]=await Promise.all([v2FetchText("./flight-registry-v2.js"),v2FetchText("./service-worker.js")]);
    const jb=S(/const\s+BUILD\s*=\s*["']([^"']+)/.exec(js)?.[1]);
    const sb=S(/const\s+BUILD\s*=\s*["']([^"']+)/.exec(sw)?.[1]);
    if(jb!==target||sb!==target)throw new Error(`File chưa đồng bộ: module=${jb||"?"}, SW=${sb||"?"}, target=${target}`);
  }
  async function activateWaitingV2(reg,target,reload){
    if(!reg)return;
    try{await reg.update();}catch(_e){}
    let waiting=reg.waiting;
    if(!waiting&&reg.installing){
      waiting=await new Promise(resolve=>{
        const w=reg.installing,t=setTimeout(()=>resolve(reg.waiting||null),7000);
        const fn=()=>{if(reg.waiting||w.state==="installed"||w.state==="redundant"){clearTimeout(t);resolve(reg.waiting||null);}};
        w.addEventListener("statechange",fn);
      });
    }
    if(waiting){
      if(reload){try{localStorage.setItem(V2_APPLY_KEY,target);}catch(_e){};waiting.postMessage({type:"SKIP_WAITING"});}
      else waiting.postMessage({type:"SKIP_WAITING"});
    }else if(reload){location.reload();}
  }
  async function v2ApplyUpdate(target){
    const btn=document.getElementById("v2UpdateNow");if(btn){btn.disabled=true;btn.textContent="ĐANG CẬP NHẬT…";}
    try{
      try{if(typeof sagsSaveBeforeAppUpdate==="function")await sagsSaveBeforeAppUpdate();}catch(_e){}
      await verifyV2Files(target);
      const reg=await navigator.serviceWorker?.getRegistration?.();
      let changed=false;
      const onChange=()=>{if(changed)return;changed=true;location.reload();};
      navigator.serviceWorker?.addEventListener?.("controllerchange",onChange,{once:true});
      await activateWaitingV2(reg,target,true);
      setTimeout(()=>{if(!changed)location.reload();},1800);
    }catch(e){if(btn){btn.disabled=false;btn.textContent="LƯU & CẬP NHẬT";}alert("Chưa cập nhật được V2: "+S(e?.message||e));}
  }
  async function v2CheckUpdate(){
    try{
      const info=await v2ServerInfo();if(!info.build)return;
      if(info.build===BUILD){
        try{if(localStorage.getItem(V2_APPLY_KEY)===BUILD)localStorage.removeItem(V2_APPLY_KEY);}catch(_e){}
        const reg=await navigator.serviceWorker?.getRegistration?.();if(reg?.waiting)await activateWaitingV2(reg,BUILD,false);
        return;
      }
      ensureV2UpdateModal();const m=document.getElementById("v2UpdateModal"),txt=document.getElementById("v2UpdateText"),btn=document.getElementById("v2UpdateNow");
      if(txt)txt.textContent=`Đang dùng V2.5 AI · Có ${info.display||info.build}. Chỉ cập nhật sau khi bạn bấm LƯU & CẬP NHẬT.`;
      if(btn){btn.disabled=false;btn.textContent="LƯU & CẬP NHẬT";btn.onclick=()=>v2ApplyUpdate(info.build);}
      if(m)m.style.display="flex";
    }catch(e){console.info("[SAGS V2 update]",e?.message||e);}
  }
  function installV2UpdateRuntime(){
    applyV2Display();ensureV2UpdateModal();
    window.addEventListener("pageshow",applyV2Display);
    window.addEventListener("focus",()=>{applyV2Display();void v2CheckUpdate();});
    window.addEventListener("online",()=>void v2CheckUpdate());
    void v2CheckUpdate();
  }

  root.sagsV2ImportDailyRoster=importDailyRosterOneStep;
  root.sagsFlightManagerImportFile=managerFileChanged;
  root.sagsFlightManagerOpen=managerOpen;
  root.sagsFlightManagerClose=managerClose;
  root.sagsFlightManagerOpenRoster=openRosterFromHub;
  root.sagsFlightManagerOpenRegistry=openRegistryFromHub;
  root.sagsFlightManagerOpenAssignments=openAssignmentsFromHub;
  root.sagsFlightRegistryCreateOpen=createOpen;
  root.sagsFlightRegistryCreateClose=createClose;
  root.sagsFlightRegistryCreateSave=createSave;
  root.sagsFlightRegistryCreateModeChanged=createModeChanged;
  root.sagsV2RegistryOpen=openManager;
  root.sagsV2RegistryClose=closeManager;
  root.sagsV2RegistryReload=reloadManager;
  root.sagsV2RegistrySave=saveManager;
  root.sagsV2RegistrySync=manualSync;

  function patchRoster(){
    if(typeof root.openDailyRosterManager==="function"&&!root.openDailyRosterManager.__frtWrapped){
      baseOpenRoster=root.openDailyRosterManager;
      const wrapped=function(){const r=baseOpenRoster.apply(this,arguments);try{ensureRosterControls();}catch(e){console.warn("Flight Registry V2.5 controls",e);}return r;};
      wrapped.__frtWrapped=true;root.openDailyRosterManager=wrapped;
    }
    if(typeof root.dailyRosterPublish==="function"&&!root.dailyRosterPublish.__frtWrapped){
      basePublishRoster=root.dailyRosterPublish;
      const wrapped=async function(){
        const r=await basePublishRoster.apply(this,arguments);
        try{
          ensureRosterControls();
          const ok=/^✓/m.test(S(document.getElementById("drStatus")?.textContent));
          if(isAD()&&ok){const date=dateFromRosterUI();statusMessage("Roster đã publish. Đang tạo/cập nhật LEG…");const day=await syncFromManifest(date,"ROSTER_PUBLISH");statusMessage(`✓ Registry: ${Object.keys(day.legs||{}).length} LEG · ${Object.values(day.assignments||{}).filter(x=>x?.active!==false).length} assignment.`);appendRosterStatus(`FLIGHT REGISTRY V2.5: ${Object.keys(day.legs||{}).length} LEG đã được tạo/cập nhật. Quan hệ tàu bay chờ AD xác nhận.`);}
        }catch(e){statusMessage("Roster đã phân công nhưng Flight Registry V2.5 chưa đồng bộ: "+S(e?.message||e),true);}
        return r;
      };
      wrapped.__frtWrapped=true;root.dailyRosterPublish=wrapped;
    }
  }

  // One-time event wiring only. No polling/MutationObserver/background Registry listener.
  ensureAdEntryButton();
  installV2UpdateRuntime();
  console.info(`[SAGS Flight Registry V2.5] ${BUILD} ready · no background registry listeners`);
})(typeof window!=="undefined"?window:globalThis);
