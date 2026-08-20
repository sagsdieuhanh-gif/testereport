/* E-REPORT SAGS · A/C LIMITS SIMPLE ENTRY · V1.88
 * Admin UI only. Existing ac-limits.js remains the runtime alert engine.
 * Workflow: A/C REG first -> tick APU INOP / HOLD INOP / OTHER.
 */
(()=>{
'use strict';

const BUILD='V1.103-20260820-01';
const DOC='AC_LIMITS_CATALOG_V1';
const HISTORY_PREFIX='AC_LIMITS_HISTORY_';
const KIND='sags_ac_limits_catalog_v1';
const PUBLIC_PATH='ac_limits/catalog_public';
const SIGNAL_PATH='ac_limits/catalog_signal';
const DEFAULT_ROLES=['DH','CBTT','VHTTB','PVHK','PVHLNG'];
const ALL_ROLES=['DH','CBTT','PVHK','VHTTB','KTTB','PVHLNG','LOSTFOUND','AD'];
let catalog={version:0,items:[],dailyDate:'',dailyVersion:''};
let editingId='';
let lastReg='';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normReg=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const displayReg=v=>String(v??'').trim().toUpperCase();
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const uid=()=>`ACL_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`.toUpperCase();
const clone=v=>JSON.parse(JSON.stringify(v??null));
function role(){try{return String(currentRole||currentUserProfile?.role||'').trim().toUpperCase()}catch(_){return ''}}
function isAdmin(){return role()==='AD'||(typeof window.v485Can==='function'&&window.v485Can('AC_LIMITS'))}
function actor(){try{return currentActor?.()||{role:role(),username:String(currentUserProfile?.username||'')}}catch(_){return {role:role()}}}
function collectionName(){try{if(typeof HANDOVER_COLLECTION!=='undefined'&&HANDOVER_COLLECTION)return HANDOVER_COLLECTION}catch(_){}throw new Error('Không xác định được HANDOVER_COLLECTION.')}
function db(){if(typeof initHandoverFirebase!=='function')throw new Error('Firebase chưa sẵn sàng.');return initHandoverFirebase()}
function normalizeItem(x={}){
  return {
    ...x,
    id:String(x.id||uid()),
    source:String(x.source||'MANUAL').toUpperCase(),
    active:x.active!==false,
    airline:String(x.airline||'').trim().toUpperCase(),
    flightNo:String(x.flightNo||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''),
    acReg:normReg(x.acReg||x.displayReg||''),
    displayReg:displayReg(x.displayReg||x.acReg||''),
    matchMode:String(x.matchMode||'REG').toUpperCase(),
    category:String(x.category||'OTHERS').toUpperCase(),
    restriction:String(x.restriction||'').trim(),
    effectiveFrom:String(x.effectiveFrom||''),
    effectiveTo:String(x.effectiveTo||''),
    batchDate:String(x.batchDate||''),
    batchVersion:String(x.batchVersion||''),
    recipientRoles:[...new Set((x.recipientRoles||DEFAULT_ROLES).map(v=>String(v||'').trim().toUpperCase()).filter(Boolean))],
    createdAtMs:Number(x.createdAtMs||Date.now()),
    updatedAtMs:Number(x.updatedAtMs||Date.now()),
    createdBy:x.createdBy||null,
    updatedBy:x.updatedBy||null
  };
}
function friendlyCategory(c){c=String(c||'').toUpperCase();if(c==='APU INOP')return 'APU INOP';if(c==='HOLD INOP/ISSUES')return 'HOLD INOP';if(c==='OTHERS')return 'OTHER';return c||'OTHER'}
function fleetMap(){try{return sagsDynamicFleetCache?.()?.byReg||{}}catch(_){return {}}}
async function refreshFleet(){try{if(typeof refreshDynamicFleetCache==='function')await refreshDynamicFleetCache(false)}catch(_){}renderRegOptions()}
function fleetInfo(reg){const key=normReg(reg),map=fleetMap();return map[key]||Object.values(map).find(x=>normReg(x?.reg)===key)||null}
function renderRegOptions(){
  const list=$('aclSRegList');if(!list)return;
  const rows=Object.values(fleetMap()).filter(Boolean).sort((a,b)=>String(a.reg||'').localeCompare(String(b.reg||'')));
  list.innerHTML=rows.map(x=>`<option value="${esc(x.reg||'')}">${esc([x.airline,x.acType].filter(Boolean).join(' · '))}</option>`).join('');
  updateFleetHint();
}
function updateFleetHint(){
  const reg=$('aclSReg')?.value||'',info=fleetInfo(reg),h=$('aclSFleetHint');if(!h)return;
  h.textContent=info?`✓ ${info.airline||''}${info.acType?' · '+info.acType:''}`:(reg?'REG chưa có trong Fleet — vẫn có thể lưu LIMIT theo REG này.':'Chọn A/C REG trước để mở phần loại LIMIT.');
  h.classList.toggle('warn',!!reg&&!info);
  const types=$('aclSTypes');if(types)types.classList.toggle('disabled',!normReg(reg));
}
async function loadCatalog(force=false){
  if(!force&&catalog.version)return catalog;
  let loaded=null;
  try{if(typeof sagsV470Ref==='function'){const s=await sagsV470Ref(PUBLIC_PATH).once('value');const d=s?.val?.();if(d?.version)loaded=d}}catch(_){}
  if(!loaded){try{const s=await db().collection(collectionName()).doc(DOC).get();if(s.exists)loaded=s.data()||{}}catch(e){if(force)throw e}}
  if(loaded)catalog={version:Number(loaded.version||0),items:(loaded.items||[]).map(normalizeItem),dailyDate:String(loaded.dailyDate||''),dailyVersion:String(loaded.dailyVersion||'')};
  return catalog;
}
async function writeCatalog(items,action='SIMPLE_UPDATE'){
  if(!isAdmin())throw new Error('Tài khoản chưa được AD cấp quyền A/C LIMITS.');
  const now=Date.now(),old=clone(catalog),next={kind:KIND,version:now,dailyDate:catalog.dailyDate||'',dailyVersion:catalog.dailyVersion||'',items:(items||[]).map(normalizeItem),updatedAtMs:now,updatedBy:actor()};
  const dbase=db(),col=collectionName();
  await dbase.collection(col).doc(DOC).set(next,{merge:false});
  try{await dbase.collection(col).doc(HISTORY_PREFIX+now).set({kind:'sags_ac_limits_history_v1',action,oldVersion:Number(old?.version||0),newVersion:now,oldCount:Array.isArray(old?.items)?old.items.length:0,newCount:next.items.length,dailyDate:next.dailyDate,dailyVersion:next.dailyVersion,createdAtMs:now,createdBy:actor()},{merge:false})}catch(_){}
  catalog={...next,items:next.items.map(normalizeItem)};
  try{if(typeof sagsV470Ref==='function'){await sagsV470Ref(PUBLIC_PATH).set(next);await sagsV470Ref(SIGNAL_PATH).set({version:now,action,updatedAtMs:now,updatedBy:actor()})}}catch(e){console.info('A/C LIMITS simple RTDB publish',e?.message||e)}
  try{await window.aclLoadCatalog?.(true);window.aclEvaluate?.()}catch(_){}
  return catalog;
}
function selectedRoles(){return [...document.querySelectorAll('#aclSimpleModal input[data-acls-role]:checked')].map(x=>x.dataset.aclsRole).filter(Boolean)}
function selectedEquipment(){return ['GPU','ACU','ASU'].filter(x=>$('aclSEq'+x)?.checked)}
function checked(id){return !!$(id)?.checked}
function setChecked(id,on){const e=$(id);if(e)e.checked=!!on}
function toggleSections(){
  const enabled=!!normReg($('aclSReg')?.value);
  ['aclSApuBox','aclSHoldBox','aclSOtherBox'].forEach(id=>{const e=$(id);if(e)e.style.opacity=enabled?'1':'.48'});
  const apu=$('aclSApuDetail'),hold=$('aclSHoldDetail'),other=$('aclSOtherDetail');
  if(apu)apu.style.display=enabled&&checked('aclSApu')?'block':'none';
  if(hold)hold.style.display=enabled&&checked('aclSHold')?'block':'none';
  if(other)other.style.display=enabled&&checked('aclSOther')?'block':'none';
}
function status(text,err=false){const e=$('aclSStatus');if(!e)return;e.textContent=text||'';e.classList.toggle('err',!!err);e.classList.toggle('ok',!!text&&!err)}
function clearForm(keepReg=false){
  editingId='';
  if(!keepReg&&$('aclSReg'))$('aclSReg').value='';
  ['aclSApu','aclSEqGPU','aclSEqACU','aclSEqASU','aclSHold','aclSOther'].forEach(id=>setChecked(id,false));
  if($('aclSHoldText'))$('aclSHoldText').value='';if($('aclSOtherText'))$('aclSOtherText').value='';
  if($('aclSFrom'))$('aclSFrom').value=todayISO();if($('aclSTo'))$('aclSTo').value=todayISO();
  document.querySelectorAll('#aclSimpleModal input[data-acls-role]').forEach(x=>x.checked=DEFAULT_ROLES.includes(x.dataset.aclsRole));
  const b=$('aclSSave');if(b)b.textContent='LƯU LIMIT';
  toggleSections();updateFleetHint();
}
function buildGeneratedItems(){
  const rawReg=displayReg($('aclSReg')?.value),reg=normReg(rawReg),from=$('aclSFrom')?.value||todayISO(),to=$('aclSTo')?.value||from,roles=selectedRoles();
  if(!reg)throw new Error('Chọn A/C REG trước.');if(!roles.length)throw new Error('Chọn ít nhất 1 đối tượng nhận cảnh báo.');
  const base={source:'MANUAL',active:true,airline:String(fleetInfo(rawReg)?.airline||''),flightNo:'',acReg:reg,displayReg:rawReg,matchMode:'REG',effectiveFrom:from,effectiveTo:to,recipientRoles:roles,updatedAtMs:Date.now(),updatedBy:actor()};
  const out=[];
  if(checked('aclSApu')){const eq=selectedEquipment(),text=eq.length?`APU INOP · NEED ${eq.join(' / ')}`:'APU INOP';out.push(normalizeItem({...base,category:'APU INOP',restriction:text}))}
  if(checked('aclSHold')){const text=String($('aclSHoldText')?.value||'').trim();if(!text)throw new Error('HOLD INOP đã tích — cần dán nội dung HOLD từ file LIMIT.');out.push(normalizeItem({...base,category:'HOLD INOP/ISSUES',restriction:text}))}
  if(checked('aclSOther')){const text=String($('aclSOtherText')?.value||'').trim();if(!text)throw new Error('OTHER đã tích — cần dán nội dung từ file LIMIT.');out.push(normalizeItem({...base,category:'OTHERS',restriction:text}))}
  if(!out.length)throw new Error('Tích ít nhất một loại LIMIT: APU INOP / HOLD INOP / OTHER.');
  return out;
}
async function save(){
  try{
    status('Đang lưu...');await loadCatalog(true);const made=buildGeneratedItems(),reg=made[0].acReg,now=Date.now();let arr=(catalog.items||[]).slice();
    if(editingId){arr=arr.filter(x=>x.id!==editingId)}
    for(let i=0;i<made.length;i++){
      const n=made[i],same=arr.find(x=>normReg(x.acReg)===reg&&String(x.category).toUpperCase()===String(n.category).toUpperCase());
      const old=(i===0&&editingId)?(catalog.items||[]).find(x=>x.id===editingId):same;
      if(same)arr=arr.filter(x=>x.id!==same.id);
      n.id=old?.id||uid();n.createdAtMs=Number(old?.createdAtMs||now);n.createdBy=old?.createdBy||actor();n.updatedAtMs=now;n.updatedBy=actor();n.active=true;
      arr.push(normalizeItem(n));
    }
    await writeCatalog(arr,editingId?'SIMPLE_EDIT':'SIMPLE_UPSERT');lastReg=made[0].displayReg||made[0].acReg;status(`✓ Đã lưu ${made.length} LIMIT cho ${lastReg}.`);clearForm(true);renderList();
  }catch(e){status(String(e?.message||e),true)}
}
async function toggleItem(id,on){try{await loadCatalog(true);const arr=(catalog.items||[]).map(x=>x.id===id?normalizeItem({...x,active:!!on,updatedAtMs:Date.now(),updatedBy:actor()}):x);await writeCatalog(arr,on?'SIMPLE_REACTIVATE':'SIMPLE_DEACTIVATE');renderList()}catch(e){status(String(e?.message||e),true)}}
async function deleteItem(id){if(!confirm('Xóa LIMIT này?'))return;try{await loadCatalog(true);await writeCatalog((catalog.items||[]).filter(x=>x.id!==id),'SIMPLE_DELETE');renderList()}catch(e){status(String(e?.message||e),true)}}
function editItem(id){
  const x=(catalog.items||[]).find(v=>v.id===id);if(!x)return;editingId=id;
  $('aclSReg').value=x.displayReg||x.acReg||'';$('aclSFrom').value=x.effectiveFrom||todayISO();$('aclSTo').value=x.effectiveTo||x.effectiveFrom||todayISO();
  ['aclSApu','aclSEqGPU','aclSEqACU','aclSEqASU','aclSHold','aclSOther'].forEach(k=>setChecked(k,false));$('aclSHoldText').value='';$('aclSOtherText').value='';
  const cat=String(x.category||'').toUpperCase();
  if(cat==='APU INOP'){setChecked('aclSApu',true);const t=String(x.restriction||'').toUpperCase();['GPU','ACU','ASU'].forEach(eq=>setChecked('aclSEq'+eq,t.includes(eq)))}
  else if(cat==='HOLD INOP/ISSUES'){setChecked('aclSHold',true);$('aclSHoldText').value=x.restriction||''}
  else {setChecked('aclSOther',true);$('aclSOtherText').value=x.restriction||''}
  document.querySelectorAll('#aclSimpleModal input[data-acls-role]').forEach(c=>c.checked=(x.recipientRoles||[]).includes(c.dataset.aclsRole));
  $('aclSSave').textContent='LƯU THAY ĐỔI';updateFleetHint();toggleSections();status(`Đang sửa ${friendlyCategory(x.category)} · ${x.displayReg||x.acReg}.`);$('aclSimplePanel')?.scrollTo({top:0,behavior:'smooth'});
}
function itemHtml(x){
  const reg=x.displayReg||x.acReg||'',cat=friendlyCategory(x.category),roles=(x.recipientRoles||[]).join(', '),date=x.effectiveFrom===x.effectiveTo?(x.effectiveFrom||''):`${x.effectiveFrom||''} → ${x.effectiveTo||''}`;
  return `<div class="acls-item ${x.active?'':'off'}"><div class="acls-item-head"><div><b>${esc(reg||'—')}</b> <span class="acls-badge ${cat==='APU INOP'?'apu':cat==='HOLD INOP'?'hold':'other'}">${esc(cat)}</span></div><span class="acls-state">${x.active?'ĐANG BẬT':'ĐÃ TẮT'}</span></div><div class="acls-text">${esc(x.restriction||'')}</div>${x.flightNo?`<div class="acls-legacy">Legacy Flight: ${esc(x.flightNo)}</div>`:''}<div class="acls-meta">${esc(date)} · Nhận: ${esc(roles)}</div><div class="acls-actions"><button onclick="aclSimpleEdit('${esc(x.id)}')">SỬA</button><button onclick="aclSimpleToggle('${esc(x.id)}',${x.active?'false':'true'})">${x.active?'TẮT':'BẬT'}</button><button class="danger" onclick="aclSimpleDelete('${esc(x.id)}')">XÓA</button></div></div>`;
}
function renderList(){
  const h=$('aclSList');if(!h)return;const q=normReg($('aclSFilter')?.value||''),arr=(catalog.items||[]).slice().filter(x=>!q||normReg(x.acReg).includes(q)).sort((a,b)=>String(a.displayReg||a.acReg).localeCompare(String(b.displayReg||b.acReg))||Number(b.active)-Number(a.active)||Number(b.updatedAtMs)-Number(a.updatedAtMs));
  h.innerHTML=arr.length?arr.map(itemHtml).join(''):'<div class="acls-empty">Chưa có LIMIT phù hợp.</div>';
}
function rolesHtml(){return ALL_ROLES.map(r=>`<label class="acls-role"><input type="checkbox" data-acls-role="${r}" ${DEFAULT_ROLES.includes(r)?'checked':''}> ${r}</label>`).join('')}
function ensureCss(){if($('aclSimpleStyle'))return;const s=document.createElement('style');s.id='aclSimpleStyle';s.textContent=`
#aclSimpleModal{position:fixed;inset:0;z-index:16050;display:none;background:rgba(4,14,25,.72);padding:max(8px,env(safe-area-inset-top)) 7px max(8px,env(safe-area-inset-bottom));box-sizing:border-box;align-items:flex-start;justify-content:center;overflow:auto}.acls-panel{width:min(98vw,780px);max-height:96dvh;overflow:auto;background:#f7f9fb;border-radius:18px;padding:14px;box-sizing:border-box;color:#193047;font:14px/1.4 Arial;box-shadow:0 18px 54px rgba(0,0,0,.38)}.acls-top{position:sticky;top:-14px;z-index:5;background:#f7f9fb;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0 11px;border-bottom:1px solid #d6e0e8}.acls-top h3{margin:0;color:#003b8e;font:900 20px Arial}.acls-close{border:0;border-radius:10px;padding:10px 13px;background:#e5ebf0;font-weight:900}.acls-step{background:#fff;border:1px solid #d9e2ea;border-radius:14px;padding:12px;margin:10px 0}.acls-step-title{font:900 15px Arial;color:#17324d;margin-bottom:8px}.acls-num{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#003b8e;color:#fff;margin-right:6px}.acls-reg{width:100%;box-sizing:border-box;border:2px solid #7b93a8;border-radius:12px;padding:13px 14px;font:900 20px Arial;text-transform:uppercase;background:#fff}.acls-hint{margin-top:7px;font-weight:800;color:#426078}.acls-hint.warn{color:#9a5b00}.acls-types.disabled{pointer-events:none}.acls-type{display:block;border:2px solid #ced8e1;border-radius:13px;padding:11px;margin:8px 0;background:#fbfcfd}.acls-type:has(>label>input:checked){border-color:#0b67b2;background:#eef7ff}.acls-type>label{display:flex;align-items:center;gap:9px;font:900 17px Arial;cursor:pointer}.acls-type input[type=checkbox]{width:22px;height:22px;accent-color:#075ea8}.acls-detail{display:none;margin:10px 0 0 31px;padding-top:9px;border-top:1px dashed #cad5de}.acls-equipment{display:flex;gap:8px;flex-wrap:wrap}.acls-chip{display:flex;align-items:center;gap:6px;border:1px solid #bfcbd5;border-radius:999px;padding:8px 12px;background:#fff;font-weight:900}.acls-textarea{width:100%;min-height:76px;box-sizing:border-box;border:1px solid #9fb0bf;border-radius:10px;padding:10px;font:700 14px Arial;resize:vertical}.acls-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.acls-grid label{font-weight:900;font-size:11px;color:#54697a}.acls-date{width:100%;box-sizing:border-box;border:1px solid #aab9c5;border-radius:9px;padding:9px;font-weight:800}.acls-roles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}.acls-role{border:1px solid #d2dce5;border-radius:8px;padding:7px;background:#fff;font-weight:800}.acls-role input{accent-color:#075ea8}.acls-save-row{display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:-14px;background:#f7f9fb;padding:10px 0 4px;z-index:4}.acls-save{flex:1;min-width:190px;border:0;border-radius:11px;padding:13px;background:#0a6d45;color:#fff;font:900 16px Arial}.acls-reset{border:1px solid #bdc9d3;border-radius:11px;padding:12px;background:#fff;font-weight:900}.acls-status{min-height:20px;font-weight:900;color:#0a6d45}.acls-status.err{color:#b42318}.acls-list-head{display:flex;gap:8px;align-items:center;justify-content:space-between}.acls-filter{width:min(210px,48%);border:1px solid #a9b8c4;border-radius:9px;padding:8px;font-weight:800;text-transform:uppercase}.acls-item{border:1px solid #d5dee6;border-radius:11px;padding:10px;margin:8px 0;background:#fff}.acls-item.off{opacity:.58}.acls-item-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.acls-item-head b{font-size:16px}.acls-badge{display:inline-block;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.acls-badge.apu{background:#fff0d7;color:#8c5700}.acls-badge.hold{background:#e9f2ff;color:#15528a}.acls-badge.other{background:#eceff3;color:#4b5662}.acls-state{font-size:10px;font-weight:900;color:#557}.acls-text{white-space:pre-wrap;font-weight:800;margin:7px 0}.acls-meta,.acls-legacy{font-size:11px;color:#657788}.acls-actions{display:flex;gap:6px;margin-top:8px}.acls-actions button{border:1px solid #bcc9d4;border-radius:8px;padding:7px 10px;background:#f4f7f9;font-weight:900}.acls-actions .danger{border-color:#e3b4b0;color:#a51f16}.acls-empty{padding:14px;text-align:center;color:#617485;font-weight:800}.acls-help{font-size:12px;color:#506778;background:#eef4f8;border-radius:10px;padding:9px;margin-top:10px}.acls-help summary{font-weight:900;cursor:pointer}
@media(max-width:620px){.acls-grid{grid-template-columns:1fr}.acls-roles{grid-template-columns:repeat(2,minmax(0,1fr))}.acls-panel{padding:10px}.acls-top{top:-10px}.acls-detail{margin-left:0}.acls-item-head{align-items:flex-start}.acls-list-head{align-items:stretch;flex-direction:column}.acls-filter{width:100%}}
`;document.head.appendChild(s)}
function ensureUi(){
  ensureCss();if($('aclSimpleModal'))return;
  const d=document.createElement('div');d.id='aclSimpleModal';d.innerHTML=`<div id="aclSimplePanel" class="acls-panel"><div class="acls-top"><h3>A/C LIMITS</h3><button class="acls-close" onclick="aclSimpleClose()">ĐÓNG</button></div>
  <div id="aclSStatus" class="acls-status"></div>
  <div class="acls-step"><div class="acls-step-title"><span class="acls-num">1</span>CHỌN A/C REG</div><input id="aclSReg" class="acls-reg" list="aclSRegList" placeholder="VD: HL7269" autocomplete="off"><datalist id="aclSRegList"></datalist><div id="aclSFleetHint" class="acls-hint">Chọn A/C REG trước để mở phần loại LIMIT.</div></div>
  <div id="aclSTypes" class="acls-step acls-types disabled"><div class="acls-step-title"><span class="acls-num">2</span>TÍCH LOẠI LIMIT</div>
    <div id="aclSApuBox" class="acls-type"><label><input id="aclSApu" type="checkbox"> APU INOP</label><div id="aclSApuDetail" class="acls-detail"><div style="font-weight:900;margin-bottom:7px">Cần thiết bị nào?</div><div class="acls-equipment"><label class="acls-chip"><input id="aclSEqGPU" type="checkbox"> GPU</label><label class="acls-chip"><input id="aclSEqACU" type="checkbox"> ACU</label><label class="acls-chip"><input id="aclSEqASU" type="checkbox"> ASU</label></div></div></div>
    <div id="aclSHoldBox" class="acls-type"><label><input id="aclSHold" type="checkbox"> HOLD INOP</label><div id="aclSHoldDetail" class="acls-detail"><textarea id="aclSHoldText" class="acls-textarea" placeholder="Dán nguyên nội dung HOLD từ file LIMIT..."></textarea></div></div>
    <div id="aclSOtherBox" class="acls-type"><label><input id="aclSOther" type="checkbox"> OTHER</label><div id="aclSOtherDetail" class="acls-detail"><textarea id="aclSOtherText" class="acls-textarea" placeholder="Dán nguyên nội dung OTHER từ file LIMIT..."></textarea></div></div>
  </div>
  <div class="acls-step"><div class="acls-step-title"><span class="acls-num">3</span>ÁP DỤNG</div><div class="acls-grid"><label>TỪ NGÀY<input id="aclSFrom" class="acls-date" type="date"></label><label>ĐẾN NGÀY<input id="aclSTo" class="acls-date" type="date"></label></div><details class="acls-help"><summary>ĐỐI TƯỢNG NHẬN CẢNH BÁO</summary><div class="acls-roles">${rolesHtml()}</div></details></div>
  <div class="acls-save-row"><button id="aclSSave" class="acls-save" onclick="aclSimpleSave()">LƯU LIMIT</button><button class="acls-reset" onclick="aclSimpleClear()">XÓA Ô</button></div>
  <div class="acls-step"><div class="acls-list-head"><div class="acls-step-title" style="margin:0">LIMIT ĐANG LƯU</div><input id="aclSFilter" class="acls-filter" placeholder="Lọc theo REG"></div><div id="aclSList"></div></div>
  <details class="acls-help"><summary>HDSD A/C LIMITS V1.88</summary><ol><li>Chọn <b>A/C REG</b> trước. REG là khóa gốc; LIMIT mới không cần Flight No.</li><li>Tích <b>APU INOP</b>, <b>HOLD INOP</b> hoặc <b>OTHER</b>. Có thể tích nhiều loại cùng lúc.</li><li>APU INOP: tích thêm <b>GPU / ACU / ASU</b> nếu tàu cần thiết bị tương ứng.</li><li>HOLD INOP và OTHER: copy nguyên nội dung cần thiết từ file LIMIT vào ô tương ứng.</li><li>Mỗi REG + loại LIMIT được lưu theo kiểu <b>UPDATE</b> nếu đã tồn tại, tránh tạo trùng.</li><li>Popup cảnh báo khai thác giữ logic hiện tại: LIMIT chung STA-10; nội dung có ASU dùng ETD-10, chưa có ETD thì STD-10.</li></ol></details>
  </div>`;document.body.appendChild(d);
  $('aclSFrom').value=todayISO();$('aclSTo').value=todayISO();
  $('aclSReg').addEventListener('input',()=>{updateFleetHint();toggleSections()});
  ['aclSApu','aclSHold','aclSOther'].forEach(id=>$(id).addEventListener('change',toggleSections));
  $('aclSFilter').addEventListener('input',renderList);
}
async function open(){
  if(!isAdmin())return alert('Tài khoản chưa được AD cấp quyền A/C LIMITS.');ensureUi();
  try{const old=$('aclAdminModal');if(old)old.style.display='none'}catch(_){}
  $('aclSimpleModal').style.display='flex';status('Đang tải LIMIT...');
  try{await Promise.all([loadCatalog(true),refreshFleet()]);renderRegOptions();renderList();if(!editingId)clearForm(false);status('')}catch(e){status('Không tải được A/C LIMITS: '+String(e?.message||e),true)}
}
function close(){const m=$('aclSimpleModal');if(m)m.style.display='none'}
function patchButton(){const b=$('roleBtnAcLimits');if(!b)return;if(!b.dataset.aclSimple){b.dataset.aclSimple='1';b.onclick=e=>{e?.preventDefault?.();open();return false}}if(typeof window.v485Can==='function')b.style.display=window.v485Can('AC_LIMITS')?'inline-flex':'none'}
function init(){ensureUi();patchButton();refreshFleet();const mo=new MutationObserver(patchButton);mo.observe(document.documentElement,{childList:true,subtree:true});setInterval(patchButton,2500);window.aclOpenAdmin=open;window.aclCloseAdmin=close}

window.aclSimpleOpen=open;window.aclSimpleClose=close;window.aclSimpleSave=save;window.aclSimpleClear=()=>{clearForm(false);status('')};window.aclSimpleEdit=editItem;window.aclSimpleToggle=toggleItem;window.aclSimpleDelete=deleteItem;window.ACLSimple={build:BUILD,open,close,refresh:async()=>{await loadCatalog(true);renderList()}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})();
