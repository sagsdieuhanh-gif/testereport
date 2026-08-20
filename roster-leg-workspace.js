/* E-REPORT SAGS · DAILY ROSTER LEG WORKSPACE CONTINUITY · V1.93
 * One flight pair keeps one shared roster workspace for a given operational role/form.
 * Later roster batches may split ARRIVAL and DEPARTURE assignees without recreating form state.
 * No heartbeat. Only roster publish/mailbox/session events are intercepted.
 */
(function(root){
  'use strict';
  const BUILD='V1.93-20260820-01';
  const MANIFEST_PATH='roster_manifests';
  const MAIL_PATH='roster_mail';
  const SESSION_PATH='roster_sessions';
  const WORKSPACE_PATH='roster_flight_workspaces';
  const REVOKE_PATH='roster_revocations';
  const MAP_KEY='sags_roster_workspace_map_v193';
  const S=v=>String(v??'').trim();
  const safe=v=>S(v).replace(/[.#$\[\]\/]/g,'_');
  const norm=v=>S(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const hash=s=>{let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h.toString(36).toUpperCase()};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch(_){return v}};
  let map={};
  try{map=JSON.parse(localStorage.getItem(MAP_KEY)||'{}')||{}}catch(_){map={}};
  function persistMap(){try{localStorage.setItem(MAP_KEY,JSON.stringify(map))}catch(_){}}
  function remember(id,workspaceKey,scope){id=S(id);workspaceKey=S(workspaceKey);if(!id||!workspaceKey)return;map[id]={workspaceKey,scope:S(scope||map[id]?.scope||'BOTH'),atMs:Date.now()};persistMap()}
  function mapping(id){return map[S(id)]||null}
  function stableKey(opDate,item){
    const flight=norm(item?.flightRaw||item?.flightName||'');
    const role=norm(item?.roleKey||item?.sourceColumn||'ROLE');
    const form=norm(item?.formGroup||'FORM');
    return 'RW_'+hash([S(opDate),flight,role,form].join('|'));
  }
  function sameDuty(a,b){
    if(!a||!b)return false;
    return norm(a.flightRaw||a.flightName)===norm(b.flightRaw||b.flightName)
      && norm(a.roleKey||a.sourceColumn)===norm(b.roleKey||b.sourceColumn)
      && norm(a.formGroup)===norm(b.formGroup);
  }
  function scanMailbox(raw){
    for(const rec of Object.values(raw||{})){
      if(!rec||typeof rec!=='object')continue;
      const id=S(rec.assignmentId),wk=S(rec.workspaceKey||rec.rosterWorkspaceKey);
      if(id&&wk)remember(id,wk,rec.assignmentScope||rec.legScope||'BOTH');
    }
  }
  function wrapMailboxRef(ref,path){
    if(!ref||!/^roster_mail\/[^/]+\/items$/.test(S(path)))return ref;
    const cbMap=new Map();
    if(typeof ref.on==='function'){
      const baseOn=ref.on.bind(ref);
      ref.on=function(event,cb,cancel){
        if(event!=='value'||typeof cb!=='function')return baseOn(event,cb,cancel);
        const wrapped=snap=>{try{scanMailbox(snap?.val?.()||{})}catch(_){}return cb(snap)};
        cbMap.set(cb,wrapped);
        return baseOn(event,wrapped,cancel);
      };
    }
    if(typeof ref.off==='function'){
      const baseOff=ref.off.bind(ref);
      ref.off=function(event,cb){const wrapped=cbMap.get(cb)||cb;const r=baseOff(event,wrapped);if(cb)cbMap.delete(cb);return r};
    }
    if(typeof ref.once==='function'){
      const baseOnce=ref.once.bind(ref);
      ref.once=async function(){const snap=await baseOnce.apply(this,arguments);try{scanMailbox(snap?.val?.()||{})}catch(_){}return snap};
    }
    return ref;
  }
  function redirectSessionPath(path){
    const m=/^roster_sessions\/([^/]+)(\/.*)?$/.exec(S(path));
    if(!m)return S(path);
    const hit=mapping(m[1]);
    return hit?.workspaceKey?`${WORKSPACE_PATH}/${safe(hit.workspaceKey)}${m[2]||''}`:S(path);
  }
  function rewriteSessionPatchPaths(patch){
    const adds={};
    for(const key of Object.keys(patch||{})){
      const m=/^roster_sessions\/([^/]+)(\/.*)?$/.exec(key);if(!m)continue;
      const hit=mapping(m[1]);if(!hit?.workspaceKey)continue;
      const nk=`${WORKSPACE_PATH}/${safe(hit.workspaceKey)}${m[2]||''}`;
      adds[nk]=patch[key];delete patch[key];
    }
    Object.assign(patch,adds);
  }
  async function loadVal(baseRef,path){try{return (await baseRef(path).once('value')).val()||null}catch(_){return null}}
  function patchMailFields(patch,user,id,wk,scope){
    user=safe(user);id=safe(id);if(!user||!id)return;
    const parent=`${MAIL_PATH}/${user}/items/${id}`;
    if(patch[parent]&&typeof patch[parent]==='object'){
      patch[parent]={...patch[parent],workspaceKey:wk,rosterWorkspaceKey:wk,assignmentScope:scope,active:true};
    }else if(patch[parent]!==null){
      patch[`${parent}/workspaceKey`]=wk;patch[`${parent}/rosterWorkspaceKey`]=wk;patch[`${parent}/assignmentScope`]=scope;patch[`${parent}/active`]=true;
    }
  }
  async function enhanceRosterPublish(baseRef,patch){
    const manifestKeys=Object.keys(patch||{}).filter(k=>/^roster_manifests\/[^/]+$/.test(k));
    if(!manifestKeys.length)return;
    for(const manifestKey of manifestKeys){
      const incoming=patch[manifestKey];if(!incoming?.items||typeof incoming.items!=='object')continue;
      const dateKey=manifestKey.slice(MANIFEST_PATH.length+1);
      const old=(await loadVal(baseRef,`${MANIFEST_PATH}/${dateKey}`))||{};
      const oldItems=old.items||{};
      const incomingItems=incoming.items||{};
      const incomingIds=new Set(Object.keys(incomingItems));

      for(const [newId,newItem0] of Object.entries(incomingItems)){
        const newItem={...newItem0};
        const sameId=oldItems[newId]||null;
        let peers=Object.entries(oldItems).filter(([id,x])=>id!==newId&&sameDuty(x,newItem));
        let arrival=peers.find(([,x])=>S(x.assignmentScope)==='ARRIVAL')||null;
        let departure=peers.find(([,x])=>S(x.assignmentScope)==='DEPARTURE')||null;
        const unscoped=peers.filter(([,x])=>!S(x.assignmentScope)||S(x.assignmentScope)==='BOTH');
        const wk=S(sameId?.workspaceKey||sameId?.rosterWorkspaceKey||arrival?.[1]?.workspaceKey||departure?.[1]?.workspaceKey||unscoped?.[0]?.[1]?.workspaceKey)||stableKey(dateKey,newItem);

        if(sameId){
          newItem.workspaceKey=wk;newItem.rosterWorkspaceKey=wk;newItem.assignmentScope=S(sameId.assignmentScope||'BOTH');
          incomingItems[newId]=newItem;remember(newId,wk,newItem.assignmentScope);
          patchMailFields(patch,newItem.user||newItem.targetUser,newId,wk,newItem.assignmentScope);
          continue;
        }

        // A later batch assigning the same flight/role to a different user means:
        // preserve the original worker as ARRIVAL and assign the latest worker to DEPARTURE.
        let source=arrival||unscoped[0]||departure;
        if(source){
          const [srcId,src0]=source,src={...src0,workspaceKey:wk,rosterWorkspaceKey:wk,assignmentScope:'ARRIVAL',active:true};
          // If an ARRIVAL already exists, the previous DEPARTURE is superseded instead.
          if(arrival&&departure){
            const [depId,dep0]=departure;
            const dep={...dep0,workspaceKey:wk,rosterWorkspaceKey:wk,assignmentScope:'DEPARTURE',active:false,supersededAtMs:Date.now(),supersededBy:newId};
            incomingItems[depId]=dep;
            const du=S(dep0.user||dep0.targetUser);
            if(du){patch[`${MAIL_PATH}/${safe(du)}/items/${safe(depId)}`]=null;patch[`${REVOKE_PATH}/${safe(du)}/items/${safe(depId)}`]={assignmentId:depId,reason:'LEG_REASSIGNED_DEPARTURE',toUser:S(newItem.user||newItem.targetUser),atMs:Date.now()};}
          }else{
            incomingItems[srcId]=src;
            patchMailFields(patch,src.user||src.targetUser,srcId,wk,'ARRIVAL');
            remember(srcId,wk,'ARRIVAL');
          }

          newItem.workspaceKey=wk;newItem.rosterWorkspaceKey=wk;newItem.assignmentScope='DEPARTURE';newItem.active=true;
          incomingItems[newId]=newItem;remember(newId,wk,'DEPARTURE');
          patchMailFields(patch,newItem.user||newItem.targetUser,newId,wk,'DEPARTURE');

          // Seed the common workspace once from the already-used assignment session.
          const wsPath=`${WORKSPACE_PATH}/${safe(wk)}`;
          let ws=await loadVal(baseRef,wsPath);
          if(!ws){
            const srcSession=await loadVal(baseRef,`${SESSION_PATH}/${safe(srcId)}`);
            if(srcSession)patch[wsPath]={...clone(srcSession),workspaceKey:wk,rosterWorkspaceKey:wk,migratedFromAssignmentId:srcId,migratedAtMs:Date.now()};
          }
        }else{
          newItem.workspaceKey=wk;newItem.rosterWorkspaceKey=wk;newItem.assignmentScope='BOTH';incomingItems[newId]=newItem;remember(newId,wk,'BOTH');patchMailFields(patch,newItem.user||newItem.targetUser,newId,wk,'BOTH');
        }
      }
      patch[manifestKey]={...incoming,workspaceSchema:1,legAssignmentMode:true,items:incomingItems};
    }
  }
  function install(){
    if(root.__ROSTER_LEG_WORKSPACE_V193)return;
    const previous=root.sagsV470Ref;if(typeof previous!=='function'){setTimeout(install,500);return;}
    root.__ROSTER_LEG_WORKSPACE_V193=BUILD;
    root.sagsV470Ref=function(path=''){
      const originalPath=S(path);
      const redirected=redirectSessionPath(originalPath);
      const ref=previous(redirected);
      wrapMailboxRef(ref,originalPath);
      if(originalPath===''&&ref&&typeof ref.update==='function'){
        const baseUpdate=ref.update.bind(ref);
        ref.update=async function(patch){
          if(patch&&typeof patch==='object'&&!Array.isArray(patch)){
            await enhanceRosterPublish(previous,patch);
            rewriteSessionPatchPaths(patch);
          }
          return baseUpdate(patch);
        };
      }
      return ref;
    };

    root.rosterWorkspaceInfo=function(assignmentId){return clone(mapping(assignmentId)||null)};
    root.__ROSTER_LEG_WORKSPACE_HDSD='DAILY ROSTER: 1 cặp chuyến giữ cùng workspace theo nghiệp vụ. Roster lại cùng người không recreate state. Nếu đổi người cho đợt chiều, người cũ giữ ARRIVAL; người mới nhận DEPARTURE và mở dữ liệu đã có. Đổi tiếp người Departure chỉ thay Departure, không xóa Arrival. Excel roster không được seed đè dữ liệu đã nhập.';
  }
  install();
})(window);
