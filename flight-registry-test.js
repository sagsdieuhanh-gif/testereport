/* E-REPORT SAGS · V1.84 FLIGHT REGISTRY TEST01
 * Test architecture only. Base application remains V1.84.
 * Event-driven: zero RTDB listeners, zero polling, zero MutationObserver.
 */
(function(root){
  "use strict";

  const BUILD="V1.84-FRTEST-20260820-01";
  const DB_ROOT="flight_registry_test_v1";
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
    return U(root.currentUserProfile?.username||root.currentUserProfile?.user||"");
  }
  function isAD(){
    const values=[root.currentRole,root.currentUserProfile?.role,root.currentUserProfile?.roleCode,root.currentUserProfile?.groupCode];
    return values.some(v=>U(v)==="AD"||U(v)==="ADMIN");
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
      aircraftType:U(leg.aircraftType),route:U(leg.route),bay:U(leg.bay),status:U(leg.status)
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

  root.__SAGS_FLIGHT_REGISTRY_TEST__={BUILD,DB_ROOT,hashId,splitFlights,reconcileRelations,normalizeLeg};
  if(typeof document==="undefined")return;

  let managerDay=null;
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
    return d||{schema:SCHEMA,testBuild:BUILD,opDate:date,revision:0,legs:{},assignments:{},rotations:{},events:{}};
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
    const flights=splitFlights(item?.flightName||item?.flightRaw||"");
    return {flightRaw:item?.flightRaw||item?.flightName||"",flightName:item?.flightName||item?.flightRaw||"",arrFlight:flights[0]||"",depFlight:flights[1]||""};
  }
  async function manifestGroups(man){
    const items=Object.values(man?.items||{}).filter(Boolean);const groups=new Map();
    for(const item of items){const k=groupKey(item);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(item);}
    const entries=[...groups.entries()];
    const payloads=await mapLimit(entries,4,async([k,group])=>{
      const p=await readAssignmentPayload(group[0]);return [k,p||fallbackPayload(group[0])];
    });
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
    if(!isAD())throw new Error("Chỉ AD được tạo/cập nhật Flight LEG trong bản test.");
    const man=await readManifest(date);if(!man?.items)throw new Error(`Ngày ${date} chưa có manifest DAILY ROSTER.`);
    const day=await readDay(date);day.opDate=date;day.schema=SCHEMA;day.testBuild=BUILD;day.legs=day.legs||{};day.assignments=day.assignments||{};
    Object.values(day.legs).forEach(l=>{if(l)l.rosterActive=false;});
    Object.values(day.assignments).forEach(a=>{if(a)a.active=false;});
    const {items,groups,payloadMap}=await manifestGroups(man);
    const groupLegs=new Map();
    for(const [k,group] of groups){
      const payload=payloadMap.get(k)||fallbackPayload(group[0]);
      let arr=U(payload.arrFlight),dep=U(payload.depFlight);const flights=splitFlights(payload.flightName||payload.flightRaw||group[0]?.flightRaw||"");
      if(!arr&&flights.length>=1)arr=flights[0];if(!dep&&flights.length>=2)dep=flights[1];
      const ids=[];
      if(arr){const leg=legFromCandidate(day,payload,"ARR",arr);day.legs[leg.legId]=leg;ids.push(leg.legId);}
      if(dep){const leg=legFromCandidate(day,payload,"DEP",dep);day.legs[leg.legId]=leg;ids.push(leg.legId);}
      if(!arr&&!dep&&flights[0]){const leg=legFromCandidate(day,payload,"UNKNOWN",flights[0]);day.legs[leg.legId]=leg;ids.push(leg.legId);}
      groupLegs.set(k,ids);
    }
    for(const item of items){
      const id=S(item.assignmentId);if(!id)continue;
      day.assignments[id]={...(day.assignments[id]||{}),assignmentId:id,active:true,user:U(item.user),originalUser:U(item.originalUser),formGroup:S(item.formGroup),sourceColumn:S(item.sourceColumn),roleKey:S(item.roleKey),flightRaw:S(item.flightRaw),legIds:groupLegs.get(groupKey(item))||[],updatedAtMs:Date.now()};
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
      box.innerHTML=`<b>🧪 FLIGHT LEG / ROTATION · TEST01</b><div class="frtMini">Không có listener Flight Registry chạy nền. Registry chỉ READ/WRITE khi AD bấm nút.</div><div class="frtRosterBtns" style="margin-top:8px"><button class="drBtn secondary" onclick="sagsFlightRegistryTestSync()">ĐỒNG BỘ LEG TỪ ROSTER</button><button class="drBtn" onclick="sagsFlightRegistryTestOpen()">MỞ LEG / ROTATION</button></div><div class="frtRosterStatus" id="frtRosterStatus">TEST overlay trên V1.84 · chưa thay đổi version/update.</div>`;
      const manage=document.getElementById("drManage")?.closest?.(".drField");if(manage?.parentNode)manage.parentNode.insertBefore(box,manage);else panel.appendChild(box);
    }
    box.style.display=isAD()?"":"none";
  }
  function ensureModal(){
    ensureStyles();if(document.getElementById("frtModal"))return;
    const m=document.createElement("div");m.id="frtModal";m.innerHTML=`<div class="frtPanel"><div class="frtHead"><div><h3>FLIGHT LEG / AIRCRAFT ROTATION</h3><div class="frtSub"><span class="frtTestBadge">TEST01 · V1.84 BASE</span> LEG là gốc. Quan hệ ARR→DEP chỉ được tạo khi AD xác nhận.</div></div><button class="frtBtn gray" onclick="sagsFlightRegistryTestClose()">ĐÓNG</button></div><div class="frtActions"><button class="frtBtn gray" onclick="sagsFlightRegistryTestSync()">ĐỒNG BỘ TỪ ROSTER</button><button class="frtBtn gray" onclick="sagsFlightRegistryTestReload()">TẢI LẠI</button><button class="frtBtn green" onclick="sagsFlightRegistryTestSave()">LƯU QUAN HỆ</button></div><div class="frtStatus" id="frtStatus">Chưa tải dữ liệu.</div><div class="frtHelp"><b>Ví dụ test:</b> ARR A → DEP C: chọn ARR A = “ĐI TIẾP CHUYẾN DEP” và chọn C. ARR B nằm lại: chọn “NẰM LẠI CXR”. DEP D dùng tàu có sẵn: chọn “TÀU ĐANG NẰM TẠI CXR” rồi nhập A/C REG. Hệ thống không bắt buộc tạo B→D.</div><div id="frtBody"></div></div>`;document.body.appendChild(m);
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
    return `<div class="frtLegCard${inactive}" data-leg-id="${esc(leg.legId)}" data-original='${esc(JSON.stringify(leg))}'><div class="frtLegTop"><div><span class="frtLegTitle">${esc(leg.flightNo||"CHƯA CÓ FLIGHT")}</span> <span class="frtTestBadge">${esc(leg.direction)}</span></div><div class="frtMuted">${esc(leg.legId)} · REV ${Number(leg.revision||1)}${leg.needsReview?" · CẦN REVIEW":""}${leg.rosterActive===false?" · NGOÀI ROSTER":""}</div></div><div class="frtFields"><div class="frtField"><label>HƯỚNG</label><select data-field="direction">${option("ARR","ARR",leg.direction)}${option("DEP","DEP",leg.direction)}${option("UNKNOWN","CHƯA XÁC ĐỊNH",leg.direction)}</select></div><div class="frtField"><label>FLIGHT NO</label><input data-field="flightNo" value="${esc(leg.flightNo)}"></div><div class="frtField"><label>STA / STD</label><input data-field="time" value="${esc(leg.time)}" placeholder="HH:MM"></div><div class="frtField"><label>A/C REG</label><input data-field="aircraftReg" value="${esc(leg.aircraftReg)}"></div><div class="frtField"><label>A/C TYPE</label><input data-field="aircraftType" value="${esc(leg.aircraftType)}"></div><div class="frtField"><label>BAY</label><input data-field="bay" value="${esc(leg.bay)}"></div><div class="frtField frtWide"><label>ROUTE</label><input data-field="route" value="${esc(leg.route)}"></div><div class="frtField frtWide"><label>TRẠNG THÁI LEG</label><select data-field="status">${option("SCHEDULED","SCHEDULED",leg.status)}${option("ACTIVE","ACTIVE",leg.status)}${option("COMPLETED","COMPLETED",leg.status)}${option("CANCELLED","CANCELLED",leg.status)}${option("NO_OPERATION","NO OPERATION",leg.status)}</select></div>${relationHtml(leg,legs)}</div></div>`;
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
      const next=normalizeLeg({...old,legId:id,direction:field(card,"direction"),flightNo:field(card,"flightNo"),time:field(card,"time"),aircraftReg:field(card,"aircraftReg"),aircraftType:field(card,"aircraftType"),bay:field(card,"bay"),route:field(card,"route"),status:field(card,"status"),arrDisposition:field(card,"arrDisposition")||old.arrDisposition,onwardLegId:field(card,"onwardLegId")||"",depSourceType:field(card,"depSourceType")||old.depSourceType,sourceLegId:field(card,"sourceLegId")||"",onGroundReg:field(card,"onGroundReg")||""});
      if(U(original.flightNo)&&U(original.flightNo)!==U(next.flightNo))addAlias(next,original.flightNo);
      if(operationalSignature(original)!==operationalSignature(next)){next.revision=Math.max(Number(original.revision||1)+1,Number(next.revision||1));next.needsReview=true;next.updatedAtMs=Date.now();next.updatedBy=userName();}
      legs[id]=next;
    });
    return legs;
  }
  async function saveManager(){
    if(!isAD())return setManagerStatus("Chỉ AD được lưu Flight Registry TEST.",true);
    if(!managerDay)return setManagerStatus("Chưa tải dữ liệu.",true);
    try{
      const before=clone(managerDay),edited=collectEditedLegs(),result=reconcileRelations(edited);
      managerDay.legs=result.legs;managerDay.rotations=result.rotations;managerDay.revision=Number(managerDay.revision||0)+1;managerDay.updatedAtMs=Date.now();managerDay.updatedBy=userName();managerDay.schema=SCHEMA;managerDay.testBuild=BUILD;
      const beforeRot=JSON.stringify(before.rotations||{}),afterRot=JSON.stringify(managerDay.rotations||{});if(beforeRot!==afterRot){Object.values(managerDay.legs).forEach(l=>{if(l)l.needsReview=true;});}
      addEvent(managerDay,"LEG_ROTATION_UPDATED",{rotationCount:Object.keys(managerDay.rotations||{}).length});
      await ref(`${DB_ROOT}/days/${safeKey(managerDay.opDate)}`).set(managerDay);
      setManagerStatus(`✓ Đã lưu ${Object.keys(managerDay.legs||{}).length} LEG · ${Object.keys(managerDay.rotations||{}).length} rotation. Không có listener nền.`);renderDay(managerDay);
    }catch(e){setManagerStatus("Không lưu được: "+S(e?.message||e),true);}
  }
  async function openManager(){
    if(!isAD())return alert("Chỉ AD được mở Flight LEG / Rotation TEST.");ensureModal();const m=document.getElementById("frtModal");if(m)m.classList.add("show");await reloadManager();
  }
  function closeManager(){document.getElementById("frtModal")?.classList.remove("show");managerDay=null;}
  async function reloadManager(){
    if(!isAD())return;const date=dateFromRosterUI();try{setManagerStatus("Đang đọc Flight Registry của "+date+"…");managerDay=await readDay(date);renderDay(managerDay);setManagerStatus(`Đã tải ${Object.keys(managerDay.legs||{}).length} LEG. Không mở listener realtime.`);}catch(e){setManagerStatus("Không tải được Registry: "+S(e?.message||e),true);}
  }
  async function manualSync(){
    if(!isAD())return statusMessage("Chỉ AD được đồng bộ LEG.",true);const date=dateFromRosterUI();try{statusMessage("Đang đồng bộ LEG từ manifest "+date+"…");const day=await syncFromManifest(date,"AD_MANUAL_SYNC");statusMessage(`✓ ${Object.keys(day.legs||{}).length} LEG · ${Object.values(day.assignments||{}).filter(x=>x?.active!==false).length} assignment. Không có listener nền.`);if(document.getElementById("frtModal")?.classList.contains("show")){managerDay=day;renderDay(day);setManagerStatus("✓ Đã đồng bộ từ DAILY ROSTER.");}}catch(e){statusMessage("Không đồng bộ được: "+S(e?.message||e),true);setManagerStatus("Không đồng bộ được: "+S(e?.message||e),true);}
  }

  root.sagsFlightRegistryTestOpen=openManager;
  root.sagsFlightRegistryTestClose=closeManager;
  root.sagsFlightRegistryTestReload=reloadManager;
  root.sagsFlightRegistryTestSave=saveManager;
  root.sagsFlightRegistryTestSync=manualSync;

  function patchRoster(){
    if(typeof root.openDailyRosterManager==="function"&&!root.openDailyRosterManager.__frtWrapped){
      baseOpenRoster=root.openDailyRosterManager;
      const wrapped=function(){const r=baseOpenRoster.apply(this,arguments);try{ensureRosterControls();}catch(e){console.warn("Flight Registry TEST controls",e);}return r;};
      wrapped.__frtWrapped=true;root.openDailyRosterManager=wrapped;
    }
    if(typeof root.dailyRosterPublish==="function"&&!root.dailyRosterPublish.__frtWrapped){
      basePublishRoster=root.dailyRosterPublish;
      const wrapped=async function(){
        const r=await basePublishRoster.apply(this,arguments);
        try{
          ensureRosterControls();
          const ok=/^✓/m.test(S(document.getElementById("drStatus")?.textContent));
          if(isAD()&&ok){const date=dateFromRosterUI();statusMessage("Roster đã publish. Đang tạo/cập nhật LEG…");const day=await syncFromManifest(date,"ROSTER_PUBLISH");statusMessage(`✓ Registry: ${Object.keys(day.legs||{}).length} LEG · ${Object.values(day.assignments||{}).filter(x=>x?.active!==false).length} assignment.`);appendRosterStatus(`FLIGHT REGISTRY TEST: ${Object.keys(day.legs||{}).length} LEG đã được tạo/cập nhật. Quan hệ tàu bay chờ AD xác nhận.`);}
        }catch(e){statusMessage("Roster đã phân công nhưng Flight Registry TEST chưa đồng bộ: "+S(e?.message||e),true);}
        return r;
      };
      wrapped.__frtWrapped=true;root.dailyRosterPublish=wrapped;
    }
  }

  // The module itself is loaded once after window.load. This is one-time wiring only.
  patchRoster();
  console.info(`[SAGS Flight Registry TEST] ${BUILD} ready · no background registry listeners`);
})(typeof window!=="undefined"?window:globalThis);
