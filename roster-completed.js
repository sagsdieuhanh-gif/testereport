/* E-REPORT SAGS · DAILY ROSTER COMPLETED TASKS + CUMULATIVE IMPORT · V1.87
   Shared flight completion status: one DATE + flight pair => all roster assignments complete together.
   No heartbeat. RTDB is used only for lightweight completion state. */
(function(root){
  "use strict";

  const BUILD="V1.87-20260820-01";
  const SESSION_PATH="roster_sessions";
  const STATUS_PATH="roster_flight_status";
  const MANIFEST_PATH="roster_manifests";
  const MAIL_PATH="roster_mail";
  const REVOKE_PATH="roster_revocations";
  let activeTab="pending";
  let renderGuard=false;
  let statusRef=null,statusCb=null,statusDate="",statusCache={};
  let lastPublishedSig="";

  const S=v=>String(v??"").trim();
  const now=()=>Date.now();
  const safeId=v=>S(v).replace(/[.#$\[\]\/]/g,"_");
  const norm=v=>S(v).toUpperCase().replace(/\s+/g," ").trim();
  const hashId=s=>{let h=2166136261>>>0;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(36).toUpperCase();};
  const validClock=v=>{
    const s=S(v).replace(/\s+/g,"");
    if(/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return s;
    if(/^\d{4}$/.test(s)){
      const h=Number(s.slice(0,2)),m=Number(s.slice(2));
      if(h<24&&m<60)return s.slice(0,2)+":"+s.slice(2);
    }
    return "";
  };
  function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function isRoster(meta){return !!S(meta?.rosterAssignmentId);}
  function envelopeOf(meta){try{return root.readFlightSessionEnvelope?.(meta.id)||{};}catch(e){return {};}}
  function pushbackOf(env){const st=(env&&env.state&&typeof env.state==="object")?env.state:{};return validClock(st.h24Start||st.f421_h24Start||"");}
  function opDateOf(meta,env){return S(meta?.rosterOpDate||env?.rosterOpDate||"");}
  function flightPartsFromState(st){
    const arr=S(st?.fltBefore||st?.f421_fltBefore||st?.f551_fltBefore||st?.f09_fltBefore||"");
    const dep=S(st?.fltAfter||st?.f421_fltAfter||st?.f551_fltAfter||st?.f09_fltAfter||"");
    return [arr,dep].map(x=>norm(x).replace(/[^A-Z0-9]/g,"")).filter(Boolean);
  }
  function flightSignature(meta,env){
    const st=(env&&env.state&&typeof env.state==="object")?env.state:{};
    const parts=flightPartsFromState(st);
    if(parts.length)return parts.join("_");
    const fromName=norm(meta?.name||"").match(/[A-Z0-9]{2,3}\s*\d{1,5}/g)||[];
    if(fromName.length)return fromName.map(x=>x.replace(/\s+/g,"")).join("_");
    return norm(meta?.name||meta?.id||"").replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  }
  function tripInfo(meta,env){
    const opDate=opDateOf(meta,env),sig=flightSignature(meta,env);
    if(!opDate||!sig)return null;
    return {opDate,sig,key:"RF_"+hashId(opDate+"|"+sig),label:S(meta?.name||sig.replace(/_/g," / "))};
  }
  function archivedAt(meta,env){return Number(env?.rosterCompletedArchivedAtMs||meta?.rosterCompletedArchivedAtMs||0)||0;}
  function completedAt(meta,env){return Number(env?.rosterCompletedAtMs||meta?.rosterCompletedAtMs||0)||0;}
  function sharedStatus(meta,env){const t=tripInfo(meta,env);return t?statusCache[t.key]||null:null;}
  function isTodayRoster(meta,env){return isRoster(meta)&&opDateOf(meta,env)===todayIso();}

  function classify(meta){
    const env=envelopeOf(meta);
    if(!isRoster(meta))return {kind:"manual",env,pushback:"",archived:false};
    if(!isTodayRoster(meta,env))return {kind:"outdated",env,pushback:"",archived:false};
    const localPush=pushbackOf(env),ss=sharedStatus(meta,env);
    const completed=!!localPush||ss?.completed===true;
    if(!completed)return {kind:"pending",env,pushback:"",archived:false};
    const archived=archivedAt(meta,env)>0;
    return {kind:archived?"archived":"completed",env,pushback:localPush||validClock(ss?.pushback||"")||"",archived,completedAt:completedAt(meta,env)||Number(ss?.completedAtMs||0)||0};
  }
  function listSorted(){try{return (root.readFlightSessionList?.()||[]).slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));}catch(e){return [];}}

  function ensureStyle(){
    if(document.getElementById("rosterCompletedStyle"))return;
    const st=document.createElement("style");st.id="rosterCompletedStyle";st.textContent=`
#rosterTaskTabs{display:none;grid-template-columns:1fr 1.45fr;gap:7px;margin:8px 0 10px}
.rosterTaskTab{min-height:44px;border:0;border-radius:10px;background:#e8edf2;color:#29445d;font:900 13px Arial;padding:7px 8px;touch-action:manipulation}
.rosterTaskTab.active{background:#0b5cab;color:#fff;box-shadow:0 3px 10px rgba(11,92,171,.2)}
.rosterTaskCount{display:inline-flex;min-width:23px;height:23px;align-items:center;justify-content:center;margin-left:5px;padding:0 6px;border-radius:99px;background:rgba(255,255,255,.9);color:#0b5cab;font:900 12px Arial}
.rosterTaskTab:not(.active) .rosterTaskCount{background:#fff;color:#34495e}
#rosterCompletedTools{display:none;margin:-2px 0 10px;gap:7px;align-items:center;justify-content:space-between;flex-wrap:wrap}
#rosterCompletedClear{min-height:38px;border:0;border-radius:9px;background:#f2e7e6;color:#9b261f;font:900 12px Arial;padding:8px 11px;touch-action:manipulation}
#rosterCompletedGuideBtn{min-height:38px;border:0;border-radius:9px;background:#eaf2fb;color:#174f86;font:900 12px Arial;padding:8px 11px;touch-action:manipulation}
#rosterTaskEmpty{display:none;padding:18px 12px;text-align:center;border:1px dashed #c9d2dc;border-radius:10px;background:#fafcfe;color:#607080;font:800 12px/1.45 Arial}
#rosterCompletedGuide{display:none;margin:0 0 10px;padding:10px 11px;border-radius:10px;background:#f5f8fb;color:#405466;font:12px/1.45 Arial}
#rosterCompletedGuide b{color:#0b5cab}.rosterCompletedBadge{display:inline-flex;margin-left:5px;padding:2px 6px;border-radius:99px;background:#e7f6ec;color:#14713d;font:900 10px Arial;vertical-align:middle}
@media(max-width:430px){#rosterTaskTabs{grid-template-columns:1fr 1.55fr}.rosterTaskTab{font-size:12px;padding:6px 5px}.rosterTaskCount{min-width:21px;height:21px;margin-left:3px}}`;
    document.head.appendChild(st);
  }
  function ensureUi(){
    ensureStyle();const current=document.getElementById("flightSessionCurrent"),listEl=document.getElementById("flightSessionList");if(!current||!listEl)return null;
    let tabs=document.getElementById("rosterTaskTabs");if(!tabs){
      tabs=document.createElement("div");tabs.id="rosterTaskTabs";tabs.innerHTML=`<button type="button" class="rosterTaskTab active" id="rosterTaskPendingBtn">CHUYẾN <span class="rosterTaskCount" id="rosterTaskPendingCount">0</span></button><button type="button" class="rosterTaskTab" id="rosterTaskCompletedBtn">✅ ĐÃ HOÀN THÀNH <span class="rosterTaskCount" id="rosterTaskCompletedCount">0</span></button>`;
      current.insertAdjacentElement("afterend",tabs);
      document.getElementById("rosterTaskPendingBtn").onclick=()=>{activeTab="pending";enhanceList();};
      document.getElementById("rosterTaskCompletedBtn").onclick=()=>{activeTab="completed";enhanceList();};
      const tools=document.createElement("div");tools.id="rosterCompletedTools";tools.innerHTML=`<button id="rosterCompletedClear" type="button">🗑 XÓA DANH SÁCH HOÀN THÀNH</button><button id="rosterCompletedGuideBtn" type="button">HDSD</button>`;tabs.insertAdjacentElement("afterend",tools);
      document.getElementById("rosterCompletedClear").onclick=clearCompletedList;
      document.getElementById("rosterCompletedGuideBtn").onclick=()=>{const g=document.getElementById("rosterCompletedGuide");if(g)g.style.display=g.style.display==="block"?"none":"block";};
      const guide=document.createElement("div");guide.id="rosterCompletedGuide";guide.innerHTML=`<b>HDSD:</b> Chỉ DAILY ROSTER <b>ngày hiện tại</b> được tính. Khi 42.1/42.3 của cùng chuyến lưu <b>PUSHBACK</b>, trạng thái hoàn thành nhẹ được đồng bộ theo <b>Ngày + cặp chuyến</b>; 55.1 và các assignment khác của đúng chuyến tự chuyển sang <b>✅ ĐÃ HOÀN THÀNH</b>. Xóa PUSHBACK sẽ đưa chuyến về CHUYẾN. Dọn cuối ca chỉ ẩn danh sách hoàn thành, không xóa hồ sơ. <b>ROSTER CỘNG DỒN:</b> có thể tạo roster nhiều đợt trong cùng ngày; đợt sau chỉ thêm chuyến mới hoặc cập nhật assignment trùng, không tự gỡ các chuyến đã tạo từ đợt trước.`;tools.insertAdjacentElement("afterend",guide);
      const empty=document.createElement("div");empty.id="rosterTaskEmpty";listEl.insertAdjacentElement("afterend",empty);
    }
    return tabs;
  }

  function enhanceList(){
    if(renderGuard)return;renderGuard=true;
    try{
      const tabs=ensureUi();if(!tabs)return;const listEl=document.getElementById("flightSessionList"),rows=Array.from(listEl?.children||[]).filter(x=>x.classList?.contains("flightSessionRow")),list=listSorted();
      let rosterToday=0,pendingCount=0,completedCount=0,visible=0;
      list.forEach((meta,i)=>{
        const c=classify(meta),row=rows[i];if(!row)return;
        if(c.kind==="pending"||c.kind==="completed"||c.kind==="archived")rosterToday++;
        if(c.kind==="pending")pendingCount++;if(c.kind==="completed")completedCount++;
        let show=false;
        if(c.kind==="outdated"||c.kind==="archived")show=false;
        else if(c.kind==="manual")show=activeTab==="pending";
        else if(activeTab==="completed")show=c.kind==="completed";
        else show=c.kind==="pending";
        row.style.display=show?"":"none";if(show)visible++;
        const sub=row.querySelector(".flightSessionSelect span");if(sub){sub.querySelectorAll(".rosterCompletedBadge").forEach(x=>x.remove());if(c.kind==="completed"){const badge=document.createElement("span");badge.className="rosterCompletedBadge";badge.textContent="✓ PUSHBACK "+(c.pushback||"ĐÃ GHI NHẬN");sub.appendChild(badge);}}
      });
      tabs.style.display=rosterToday?"grid":"none";
      const tools=document.getElementById("rosterCompletedTools"),guide=document.getElementById("rosterCompletedGuide"),empty=document.getElementById("rosterTaskEmpty"),pBtn=document.getElementById("rosterTaskPendingBtn"),cBtn=document.getElementById("rosterTaskCompletedBtn"),pCount=document.getElementById("rosterTaskPendingCount"),cCount=document.getElementById("rosterTaskCompletedCount");
      if(pCount)pCount.textContent=String(pendingCount);if(cCount)cCount.textContent=String(completedCount);
      pBtn?.classList.toggle("active",activeTab==="pending");cBtn?.classList.toggle("active",activeTab==="completed");if(tools)tools.style.display=rosterToday&&activeTab==="completed"?"flex":"none";
      const clear=document.getElementById("rosterCompletedClear");if(clear){clear.disabled=completedCount===0;clear.style.opacity=completedCount?"1":".45";}if(guide&&activeTab!=="completed")guide.style.display="none";
      if(empty){empty.style.display=rosterToday&&visible===0?"block":"none";empty.textContent=activeTab==="completed"?"Chưa có chuyến DAILY ROSTER nào đã hoàn thành hôm nay.":"Không còn chuyến DAILY ROSTER cần làm hôm nay.";}
    }finally{renderGuard=false;}
  }

  function saveMarkers(meta,env,completed,completedMs,preserveArchive=true){
    let changed=false;
    if(completed){
      const at=Number(completedMs||env.rosterCompletedAtMs||meta.rosterCompletedAtMs||now())||now();
      if(Number(env.rosterCompletedAtMs||0)!==at){env.rosterCompletedAtMs=at;changed=true;}if(Number(meta.rosterCompletedAtMs||0)!==at){meta.rosterCompletedAtMs=at;changed=true;}
      if(!preserveArchive){if(env.rosterCompletedArchivedAtMs){delete env.rosterCompletedArchivedAtMs;changed=true;}if(meta.rosterCompletedArchivedAtMs){delete meta.rosterCompletedArchivedAtMs;changed=true;}}
    }else if(env.rosterCompletedAtMs||meta.rosterCompletedAtMs||env.rosterCompletedArchivedAtMs||meta.rosterCompletedArchivedAtMs){delete env.rosterCompletedAtMs;delete meta.rosterCompletedAtMs;delete env.rosterCompletedArchivedAtMs;delete meta.rosterCompletedArchivedAtMs;changed=true;}
    return changed;
  }
  function syncAssignment(meta,env){
    const assignment=S(meta?.rosterAssignmentId);if(!assignment||typeof root.sagsV470Ref!=="function")return;
    const patch={completedAtMs:Number(env?.rosterCompletedAtMs||0)||null,completedPushback:pushbackOf(env)||null,completedListClearedAtMs:Number(env?.rosterCompletedArchivedAtMs||0)||null,"envelope/rosterCompletedAtMs":Number(env?.rosterCompletedAtMs||0)||null,"envelope/rosterCompletedArchivedAtMs":Number(env?.rosterCompletedArchivedAtMs||0)||null};
    try{root.sagsV470Ref(`${SESSION_PATH}/${safeId(assignment)}`).update(patch).catch?.(()=>{});}catch(e){}
  }
  function applySharedToLocal(){
    const list=root.readFlightSessionList?.()||[];let listChanged=false;
    for(let i=0;i<list.length;i++){
      const meta=list[i],env=envelopeOf(meta);if(!isTodayRoster(meta,env))continue;const t=tripInfo(meta,env);if(!t)continue;const ss=statusCache[t.key]||null,localPush=pushbackOf(env),done=!!localPush||ss?.completed===true;
      const changed=saveMarkers(meta,env,done,Number(ss?.completedAtMs||0)||0,true);if(changed){try{localStorage.setItem(root.flightSessionStorageKey(meta.id),JSON.stringify(env));}catch(e){}list[i]=meta;listChanged=true;syncAssignment(meta,env);}
    }
    if(listChanged)root.writeFlightSessionList?.(list);
  }
  function statusPayload(meta,env,push){
    const t=tripInfo(meta,env);if(!t)return null;return {engine:"DAILY_ROSTER_V1",schema:1,opDate:t.opDate,tripKey:t.key,flightLabel:t.label,flightSignature:t.sig,completed:!!push,pushback:push||null,completedAtMs:push?now():null,updatedAtMs:now(),updatedBy:S(root.currentUserProfile?.username||"")};
  }
  function publishFlightStatus(meta,env,push){
    const p=statusPayload(meta,env,push);if(!p||typeof root.sagsV470Ref!=="function")return;
    statusCache[p.tripKey]=p;applySharedToLocal();enhanceList();const sig=JSON.stringify([p.opDate,p.tripKey,p.completed,p.pushback]);if(sig===lastPublishedSig)return;lastPublishedSig=sig;
    try{root.sagsV470Ref(`${STATUS_PATH}/${safeId(p.opDate)}/${safeId(p.tripKey)}`).set(p).catch?.(e=>console.info("Roster flight status",e?.message||e));}catch(e){}
  }
  function reconcileActiveCompletion(){
    try{
      const meta=root.currentFlightSessionMeta?.();if(!meta||!isRoster(meta))return;
      const env=envelopeOf(meta);if(!isTodayRoster(meta,env))return;
      // Chỉ 42.3 / 42.1 là nguồn có field PUSHBACK. 55.1/FSAGS09 chỉ NHẬN trạng thái chung,
      // tuyệt đối không được persist "không có PUSHBACK" rồi xóa trạng thái hoàn thành của chuyến.
      const group=S(meta?.initialGroup||env?.mainForm||"");
      if(group!=="fsags"&&group!=="fsags421")return;
      publishFlightStatus(meta,env,pushbackOf(env));
    }catch(e){console.info("Roster completion reconcile",e?.message||e);}
  }
  function stopStatusListener(){try{if(statusRef&&statusCb)statusRef.off("value",statusCb);}catch(e){}statusRef=null;statusCb=null;statusDate="";}
  function startStatusListener(){
    const d=todayIso();if(statusRef&&statusDate===d)return;stopStatusListener();statusDate=d;if(typeof root.sagsV470Ref!=="function")return;
    try{statusRef=root.sagsV470Ref(`${STATUS_PATH}/${safeId(d)}`);statusCb=s=>{statusCache=s.val()||{};applySharedToLocal();try{root.renderFlightSessionList?.();}catch(e){enhanceList();}};statusRef.on("value",statusCb,e=>console.info("Roster status listener",e?.message||e));}catch(e){console.info("Roster status listener start",e?.message||e);}
  }
  function migrateExistingPushbacks(){
    for(const meta of listSorted()){const env=envelopeOf(meta);if(!isTodayRoster(meta,env))continue;const push=pushbackOf(env);if(push){publishFlightStatus(meta,env,push);break;}}
  }

  async function clearCompletedList(){
    const list=root.readFlightSessionList?.()||[],targets=[];for(const meta of list){const c=classify(meta);if(c.kind==="completed")targets.push({meta,c});}if(!targets.length)return;
    const d=new Date(),label=`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;if(!confirm(`Xóa ${targets.length} chuyến đã hoàn thành khỏi danh sách công việc ngày ${label}?\n\nHồ sơ chuyến và biểu mẫu vẫn được giữ lại.`))return;
    const at=now();for(const x of targets){const meta=x.meta,env=x.c.env||envelopeOf(meta);meta.rosterCompletedArchivedAtMs=at;env.rosterCompletedArchivedAtMs=at;try{localStorage.setItem(root.flightSessionStorageKey(meta.id),JSON.stringify(env));}catch(e){}syncAssignment(meta,env);}root.writeFlightSessionList?.(list);enhanceList();
  }
  root.dailyRosterClearCompletedList=clearCompletedList;

  // V1.87: DAILY ROSTER is cumulative within the operating day.
  // A later import adds/updates assignments but never removes assignments that were
  // created by an earlier batch on the same date. Explicit reassignment/revoke flows
  // remain untouched. This is implemented at the one RTDB multi-path update used by
  // DAILY ROSTER publishing, so the original parser/role mapping stays unchanged.
  function installCumulativeRosterMerge(){
    if(root.__rosterCumulativeMergeV187)return true;
    const originalRef=root.sagsV470Ref;
    if(typeof originalRef!=="function")return false;
    root.__rosterCumulativeMergeV187=true;

    root.sagsV470Ref=function(path=""){
      const ref=originalRef(path);
      if(S(path)!==""||!ref||typeof ref.update!=="function")return ref;
      const originalUpdate=ref.update.bind(ref);
      ref.update=async function(patch){
        if(!patch||typeof patch!=="object"||Array.isArray(patch))return originalUpdate(patch);
        const manifestKeys=Object.keys(patch).filter(k=>/^roster_manifests\/[^/]+$/.test(k));
        if(!manifestKeys.length)return originalUpdate(patch);

        let preserved=0,updated=0,added=0;
        for(const manifestKey of manifestKeys){
          const incoming=patch[manifestKey];
          if(!incoming||typeof incoming!=="object"||!incoming.items)continue;
          const dateKey=manifestKey.slice((MANIFEST_PATH+"/").length);
          let old={};
          try{old=(await originalRef(`${MANIFEST_PATH}/${dateKey}`).once("value")).val()||{};}catch(e){old={};}
          const oldItems=(old.items&&typeof old.items==="object")?old.items:{};
          const newItems=(incoming.items&&typeof incoming.items==="object")?incoming.items:{};
          const merged={...oldItems,...newItems};
          for(const id of Object.keys(newItems)){if(oldItems[id])updated++;else added++;}

          // DAILY ROSTER legacy publish marks assignments missing from the new file as
          // ROSTER_REMOVED. In cumulative mode those entries are deliberately cancelled.
          for(const [id,item] of Object.entries(oldItems)){
            if(Object.prototype.hasOwnProperty.call(newItems,id))continue;
            preserved++;
            const user=safeId(item?.user||"");
            const aid=safeId(id);
            if(user&&aid){
              const mailKey=`${MAIL_PATH}/${user}/items/${aid}`;
              if(Object.prototype.hasOwnProperty.call(patch,mailKey)&&patch[mailKey]===null)delete patch[mailKey];
              const revokeKey=`${REVOKE_PATH}/${user}/items/${aid}`;
              if(patch[revokeKey]?.reason==="ROSTER_REMOVED")delete patch[revokeKey];
            }
          }

          patch[manifestKey]={
            ...old,
            ...incoming,
            schema:Math.max(Number(old.schema||0),Number(incoming.schema||0),2),
            cumulative:true,
            cumulativeMode:"MERGE_SAME_DAY",
            lastBatchFileName:S(incoming.fileName||""),
            lastBatchAtMs:Number(incoming.publishedAtMs||now()),
            items:merged
          };
        }
        root.__ROSTER_CUMULATIVE_LAST={preserved,updated,added,atMs:now()};
        return originalUpdate(patch);
      };
      return ref;
    };

    // Rewrite the legacy success text so operators are not told that older assignments
    // were deleted when V1.87 intentionally preserved them.
    const basePublish=root.dailyRosterPublish;
    if(typeof basePublish==="function")root.dailyRosterPublish=async function(){
      const result=await basePublish.apply(this,arguments);
      try{
        const e=document.getElementById("drStatus"),m=root.__ROSTER_CUMULATIVE_LAST||{};
        if(e&&!e.classList.contains("err")&&/Đã phân công|phân công/i.test(S(e.textContent))){
          e.textContent=`✓ ROSTER CỘNG DỒN: thêm ${Number(m.added||0)} · cập nhật ${Number(m.updated||0)} · giữ ${Number(m.preserved||0)} phân công đã có trong ngày. Không tự xóa chuyến cũ.`;
        }
      }catch(e){}
      return result;
    };
    return true;
  }

  function installHooks(){
    if(root.__rosterCompletedHooksV186B02)return;root.__rosterCompletedHooksV186B02=true;
    try{const baseRender=root.renderFlightSessionList;if(typeof baseRender==="function")root.renderFlightSessionList=function(){const out=baseRender.apply(this,arguments);setTimeout(enhanceList,0);return out;};}catch(e){}
    try{const baseOpen=root.openFlightSessions;if(typeof baseOpen==="function")root.openFlightSessions=function(){activeTab="pending";startStatusListener();const out=baseOpen.apply(this,arguments);setTimeout(enhanceList,0);return out;};}catch(e){}
    try{const basePersist=root.persist;if(typeof basePersist==="function")root.persist=function(){const out=basePersist.apply(this,arguments);reconcileActiveCompletion();setTimeout(()=>{try{root.renderFlightSessionList?.();}catch(e){}},0);return out;};}catch(e){}
    try{const baseApply=root.applyRoleUI;if(typeof baseApply==="function")root.applyRoleUI=function(){const out=baseApply.apply(this,arguments);setTimeout(startStatusListener,40);return out;};}catch(e){}
    setTimeout(()=>{ensureUi();startStatusListener();applySharedToLocal();migrateExistingPushbacks();try{root.renderFlightSessionList?.();}catch(e){}},450);
    setInterval(()=>{if(statusDate&&statusDate!==todayIso()){statusCache={};startStatusListener();try{root.renderFlightSessionList?.();}catch(e){}}},60000);
  }

  installCumulativeRosterMerge();
  installHooks();root.__ROSTER_COMPLETED_BUILD=BUILD;root.__ROSTER_CUMULATIVE_BUILD=BUILD;
})(window);
