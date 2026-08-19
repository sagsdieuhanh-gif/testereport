/* E-Report SAGS · V1.29 ADMIN BUILDER
   No-code dynamic module/form/rule/workflow engine.
   Safety: no eval/new Function/custom HTML/custom JS from config.
*/
(()=>{
'use strict';

const AB_VERSION='1.0.0';
const AB_MODULE_KIND='sags_admin_builder_module_v1';
const AB_HISTORY_KIND='sags_admin_builder_history_v1';
const AB_RECORD_KIND='sags_dynamic_form_record_v1';
const AB_CATALOG_KIND='sags_admin_builder_catalog_v1';
const AB_CATALOG_DOC='ADMIN_BUILDER_CATALOG_V1';
const AB_SIGNAL_PATH='admin_builder/catalog_signal';
const AB_RECORD_SIGNAL_PATH='admin_builder/record_signal';
const AB_CACHE_KEY='sags_admin_builder_catalog_cache_v1';
const AB_CACHE_MAX_AGE=6*60*60*1000;
const AB_ALL_ROLES=['AD','DH','CBTT','PVHK','KTTB','VHTTB','PVHLNG','LOSTFOUND','VIEWER','FPL','KH'];
const AB_FIELD_TYPES=[
  ['text','Chữ'],['number','Số'],['time','Giờ'],['date','Ngày'],['datetime','Ngày + giờ'],
  ['textarea','Ghi chú dài'],['select','Danh sách chọn'],['radio','Chọn 1'],['checkbox','Có / Không'],
  ['yesno','CÓ / KHÔNG'],['readonly','Chỉ đọc'],['formula','Tự tính'],['attachment','Link tài liệu / MediaFire'],['section','Tiêu đề nhóm']
];
const AB_OPS=[['==','='],['!=','≠'],['>','>'],['>=','≥'],['<','<'],['<=','≤'],['empty','ĐỂ TRỐNG'],['not_empty','CÓ DỮ LIỆU'],['between','TRONG KHOẢNG']];

let abCatalog={version:0,modules:[]};
let abCatalogSignalRef=null, abCatalogSignalCb=null;
let abEditingId='';
let abEditor={fields:[],rules:[],workflow:[]};
let abCurrentModule=null;
let abCurrentRecord=null;
let abBuilderList=[];
let abDismissedRuleKeys=new Set();
let abInitialized=false;
let abRecordSignalRef=null,abRecordSignalCb=null;
let abPendingByModule={};

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const safeId=v=>String(v||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Đ/g,'D').replace(/đ/g,'d').replace(/\s+/g,'_').replace(/[^A-Z0-9._-]/g,'_').replace(/_+/g,'_').slice(0,70);
const keyId=v=>safeId(v).replace(/[^A-Z0-9_]/g,'_').replace(/^([0-9])/,'F_$1').slice(0,40);
const clone=v=>JSON.parse(JSON.stringify(v??null));
const now=()=>Date.now();

function abDb(){
  if(typeof initHandoverFirebase!=='function')throw new Error('Firebase chưa sẵn sàng.');
  return initHandoverFirebase();
}
function abActor(){
  try{ if(typeof currentActor==='function')return currentActor(); }catch(_){ }
  const p=(typeof currentUserProfile!=='undefined'&&currentUserProfile)||{};
  return {username:String(p.username||''),name:String(p.name||p.fullName||p.username||''),role:String((typeof currentRole!=='undefined'?currentRole:p.role)||'').toUpperCase()};
}
function abIdentity(){
  const p=(typeof currentUserProfile!=='undefined'&&currentUserProfile)||{};
  const role=String((typeof currentRole!=='undefined'?currentRole:p.role)||'').toUpperCase();
  let group=String(p.groupCode||'').toUpperCase();
  let dep=String(p.departmentCode||p.systemDepartment||'').toUpperCase();
  try{ if(!group&&typeof v18InferGroup==='function')group=String(v18InferGroup(p,role)||'').toUpperCase(); }catch(_){ }
  try{ if(!dep&&typeof v18LegacyDept==='function')dep=String(v18LegacyDept(p,role)||'').toUpperCase(); }catch(_){ }
  return {role,group,department:dep,username:String(p.username||'').toLowerCase(),name:String(p.name||p.fullName||p.username||'')};
}
function abIsAdmin(){return abIdentity().role==='AD';}
function abUnique(arr){return [...new Set((arr||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];}
function abCsv(v){return abUnique(String(v||'').split(/[,;\n]+/));}
function abArrayText(arr){return (arr||[]).join(', ');}

function abDefaultModule(){return {
  id:'',code:'',name:'',icon:'🧩',description:'',category:'NGHIỆP VỤ',order:500,
  status:'DRAFT',active:true,requireFlight:false,submitLabel:'GỬI / LƯU',
  visibility:{roles:['AD'],groups:[],departments:[]},submitRoles:['AD'],
  fields:[],rules:[],workflow:[],revision:0,publishVersion:0,updatedAtMs:0
};}
function abNormalizeModule(raw){
  const d={...abDefaultModule(),...(raw||{})};
  d.id=String(d.id||''); d.code=safeId(d.code||d.id); d.name=String(d.name||d.code||'CHỨC NĂNG');
  d.icon=String(d.icon||'🧩').slice(0,8); d.category=String(d.category||'NGHIỆP VỤ').slice(0,50);
  d.order=Number.isFinite(Number(d.order))?Number(d.order):500; d.status=String(d.status||'DRAFT').toUpperCase(); d.active=d.active!==false;
  d.visibility=d.visibility&&typeof d.visibility==='object'?d.visibility:{};
  d.visibility.roles=abUnique(d.visibility.roles||[]); d.visibility.groups=abUnique(d.visibility.groups||[]); d.visibility.departments=abUnique(d.visibility.departments||[]);
  d.submitRoles=abUnique(d.submitRoles||d.visibility.roles||[]);
  d.fields=Array.isArray(d.fields)?d.fields.map((f,i)=>abNormalizeField(f,i)):[];
  d.rules=Array.isArray(d.rules)?d.rules.map((r,i)=>abNormalizeRule(r,i)):[];
  d.workflow=Array.isArray(d.workflow)?d.workflow.map((s,i)=>abNormalizeStep(s,i)):[];
  return d;
}
function abNormalizeField(f,i=0){
  const type=AB_FIELD_TYPES.some(x=>x[0]===f?.type)?f.type:'text';
  return {
    id:String(f?.id||('FIELD_'+(i+1))),key:keyId(f?.key||f?.label||('F'+(i+1))),label:String(f?.label||('Trường '+(i+1))),type,
    required:!!f?.required,placeholder:String(f?.placeholder||''),defaultValue:String(f?.defaultValue??''),unit:String(f?.unit||''),
    options:Array.isArray(f?.options)?f.options.map(String).filter(Boolean):String(f?.options||'').split(',').map(x=>x.trim()).filter(Boolean),
    min:f?.min===''||f?.min==null?'':Number(f.min),max:f?.max===''||f?.max==null?'':Number(f.max),
    formula:String(f?.formula||''),showWhen:f?.showWhen&&typeof f.showWhen==='object'?{field:keyId(f.showWhen.field||''),op:String(f.showWhen.op||'=='),value:String(f.showWhen.value??'')}:{field:'',op:'==',value:''}
  };
}
function abNormalizeCondition(c){return {field:keyId(c?.field||''),op:String(c?.op||'=='),value:String(c?.value??'')};}
function abNormalizeRule(r,i=0){return {
  id:String(r?.id||('RULE_'+(i+1))),name:String(r?.name||('Cảnh báo '+(i+1))),
  c1:abNormalizeCondition(r?.c1||{}),join:['AND','OR'].includes(String(r?.join||'').toUpperCase())?String(r.join).toUpperCase():'',
  c2:abNormalizeCondition(r?.c2||{}),message:String(r?.message||'CẦN KIỂM TRA LẠI DỮ LIỆU'),blocking:!!r?.blocking,active:r?.active!==false
};}
function abNormalizeStep(s,i=0){return {id:String(s?.id||('STEP_'+(i+1))),label:String(s?.label||('Bước '+(i+1))),role:String(s?.role||'AD').toUpperCase(),action:String(s?.action||'XÁC NHẬN')};}

function abInjectCss(){
  if($('abStyle'))return;
  const st=document.createElement('style');st.id='abStyle';st.textContent=`
  #adminBuilderModal,#abRuntimeModal{position:fixed;inset:0;z-index:13680;display:none;align-items:flex-start;justify-content:center;background:rgba(0,0,0,.58);padding:max(10px,env(safe-area-inset-top)) 8px max(10px,env(safe-area-inset-bottom));box-sizing:border-box;overflow:auto}
  .abPanel{width:min(98vw,1040px);max-height:96vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 18px 52px rgba(0,0,0,.35);padding:14px;box-sizing:border-box;font:13px/1.42 Arial;color:#203040}
  .abTop{position:sticky;top:-14px;z-index:5;background:#fff;display:flex;gap:8px;align-items:center;justify-content:space-between;padding:5px 0 10px;border-bottom:1px solid #e0e6ec}.abTop h3{margin:0;color:#003B8E;font:900 20px Arial}.abClose{border:0;background:#e9edf2;border-radius:9px;padding:9px 13px;font-weight:900}
  .abHint{background:#eef6ff;border-left:4px solid #0b67b2;border-radius:9px;padding:9px 10px;margin:9px 0;color:#274862;font-weight:700}.abWarn{background:#fff0ef;border:2px solid #d92d20;color:#9d1c14;border-radius:10px;padding:10px;margin:8px 0;font-weight:900}.abWarn button{float:right;border:0;background:#9d1c14;color:#fff;border-radius:7px;padding:5px 8px;font-weight:900}
  .abTabs{display:flex;gap:6px;overflow:auto;padding:8px 0;position:sticky;top:44px;background:#fff;z-index:4}.abTab{white-space:nowrap;border:1px solid #afbcc8;border-radius:9px;padding:8px 10px;background:#f7f9fb;color:#234;font-weight:900}.abTab.active{background:#003B8E;color:#fff;border-color:#003B8E}.abPane{display:none}.abPane.active{display:block}
  .abCard{border:1px solid #d7dfe7;background:#fbfcfe;border-radius:12px;padding:11px;margin:9px 0}.abCardTitle{font:900 15px Arial;color:#17324d;margin-bottom:7px}.abGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.abGrid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.abLabel{display:block;font:900 11px Arial;color:#4c5d6c;margin:4px 0}.abInput,.abSelect,.abTextarea{width:100%;box-sizing:border-box;border:1px solid #aeb9c4;background:#fff;color:#172735;border-radius:8px;padding:9px;font:700 13px Arial}.abTextarea{min-height:72px;resize:vertical}.abCheckGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.abCheck{display:flex;align-items:center;gap:6px;border:1px solid #d8e0e7;border-radius:8px;padding:7px;background:#fff;font-weight:800}
  .abActions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.abBtn{border:0;border-radius:8px;min-height:36px;padding:7px 11px;font-weight:900;background:#003B8E;color:#fff}.abBtn.secondary{background:#e8eef5;color:#234;border:1px solid #c3ced8}.abBtn.good{background:#167947}.abBtn.warn{background:#ad6800}.abBtn.danger{background:#b42318}.abBtn:disabled{opacity:.45}.abStatus{min-height:20px;font-weight:800;color:#516170}.abStatus.err{color:#b42318}
  .abFieldRow,.abRuleRow,.abStepRow{border:1px solid #d5dee7;border-radius:10px;background:#fff;padding:9px;margin:7px 0}.abRowHead{display:flex;align-items:center;gap:7px;justify-content:space-between}.abRowHead b{color:#17324d}.abMiniActions{display:flex;gap:4px}.abMiniActions button{border:0;border-radius:7px;padding:5px 7px;font-weight:900;background:#edf2f7;color:#234}.abMiniActions .danger{background:#fff0ef;color:#b42318}.abRuleJoin{font-weight:900;color:#003B8E;text-align:center;padding-top:23px}
  .abList{display:flex;flex-direction:column;gap:7px}.abItem{border:1px solid #d3dde6;border-radius:10px;background:#fff;padding:10px}.abItemTitle{font:900 14px Arial;color:#17324d}.abMeta{font:700 11px Arial;color:#667788;margin-top:3px}.abPill{display:inline-block;border-radius:20px;padding:3px 7px;font:900 10px Arial;background:#eaf2fb;color:#174d80;margin:2px}.abPill.pub{background:#e8f6ed;color:#167947}.abPill.draft{background:#fff5df;color:#8a5a00}.abPill.off{background:#f2f2f2;color:#666}
  .abRuntimeFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.abRuntimeField{min-width:0}.abRuntimeField.full,.abRuntimeSection{grid-column:1/-1}.abRuntimeSection{font:900 15px Arial;color:#003B8E;border-bottom:2px solid #d7e5f4;padding:9px 2px 5px;margin-top:4px}.abRadioGroup{display:flex;gap:8px;flex-wrap:wrap;border:1px solid #c9d3dc;border-radius:8px;padding:8px;background:#fff}.abRadioGroup label{font-weight:800}.abFormula{background:#f3f7fb!important;color:#123d66!important}.abUnitWrap{display:flex;align-items:center;gap:6px}.abUnit{font-weight:900;color:#607080;white-space:nowrap}.abRecords{margin-top:12px;border-top:1px solid #d9e1e8;padding-top:10px}.abRecordItem{border:1px solid #d6dfe7;border-radius:9px;padding:9px;margin:6px 0;background:#fff}.abRecordValues{font-size:11px;color:#556575;margin-top:4px}.abWorkflow{font-weight:900;color:#003B8E;margin-top:5px}
  .abHelp h4{color:#003B8E;margin:14px 0 5px}.abHelp ol,.abHelp ul{padding-left:20px}.abHelp code{background:#eef2f6;border-radius:4px;padding:1px 4px}.abExample{border-left:4px solid #167947;background:#effaf3;border-radius:8px;padding:9px 10px;margin:8px 0}
  .abDynamicBtn{position:relative}.abDynamicBadge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:10px;background:#c8241b;color:#fff;font:900 10px Arial;display:none;align-items:center;justify-content:center;padding:0 3px;box-sizing:border-box}
  @media(max-width:700px){.abGrid,.abGrid3,.abRuntimeFields{grid-template-columns:1fr}.abCheckGrid{grid-template-columns:repeat(2,1fr)}.abTabs{top:42px}.abPanel{padding:11px}.abGrid .wide,.abGrid3 .wide{grid-column:1/-1}}
  `;document.head.appendChild(st);
}

function abEnsureModals(){
  if(!$('adminBuilderModal')){
    const d=document.createElement('div');d.id='adminBuilderModal';d.innerHTML=`<div class="abPanel">
      <div class="abTop"><h3>ADMIN BUILDER · AD</h3><button class="abClose" onclick="abCloseBuilder()">ĐÓNG</button></div>
      <div class="abHint"><b>TỰ TẠO CHỨC NĂNG KHÔNG CẦN UPDATE CODE.</b> Tạo nút → tạo biểu mẫu → thêm rule/cảnh báo → chọn tài khoản/đơn vị được dùng → XEM THỬ → XUẤT BẢN. Cấu hình được lưu Firebase và tải động trên các máy khác.</div>
      <div class="abTabs">
        <button class="abTab active" data-abtab="basic" onclick="abSwitchTab('basic')">1 · CHỨC NĂNG</button>
        <button class="abTab" data-abtab="fields" onclick="abSwitchTab('fields')">2 · BIỂU MẪU</button>
        <button class="abTab" data-abtab="rules" onclick="abSwitchTab('rules')">3 · CẢNH BÁO</button>
        <button class="abTab" data-abtab="workflow" onclick="abSwitchTab('workflow')">4 · WORKFLOW</button>
        <button class="abTab" data-abtab="permissions" onclick="abSwitchTab('permissions')">5 · PHÂN QUYỀN</button>
        <button class="abTab" data-abtab="preview" onclick="abSwitchTab('preview')">6 · XEM THỬ</button>
        <button class="abTab" data-abtab="list" onclick="abSwitchTab('list')">ĐÃ TẠO</button>
        <button class="abTab" data-abtab="help" onclick="abSwitchTab('help')">HDSD</button>
      </div>
      <div id="abPaneBasic" class="abPane active"></div><div id="abPaneFields" class="abPane"></div><div id="abPaneRules" class="abPane"></div><div id="abPaneWorkflow" class="abPane"></div><div id="abPanePermissions" class="abPane"></div><div id="abPanePreview" class="abPane"></div><div id="abPaneList" class="abPane"></div><div id="abPaneHelp" class="abPane abHelp"></div>
    </div>`;document.body.appendChild(d);
  }
  if(!$('abRuntimeModal')){
    const d=document.createElement('div');d.id='abRuntimeModal';d.innerHTML=`<div class="abPanel" style="width:min(98vw,860px)"><div class="abTop"><h3 id="abRuntimeTitle">BIỂU MẪU</h3><button class="abClose" onclick="abCloseRuntime()">ĐÓNG</button></div><div id="abRuntimeBody"></div></div>`;document.body.appendChild(d);
  }
}

function abEnsureAdminButton(){
  if($('roleBtnAdminBuilder'))return;
  const anchor=$('roleBtnManual'), row=document.querySelector('.toolbar-row.main-actions');if(!row)return;
  const b=document.createElement('button');b.id='roleBtnAdminBuilder';b.textContent='ADMIN BUILDER';b.style.display='none';b.onclick=()=>abOpenBuilder();
  if(anchor?.nextSibling)row.insertBefore(b,anchor.nextSibling);else row.appendChild(b);
}
function abRoleOptionsHtml(selected=[]){const s=new Set(abUnique(selected));return AB_ALL_ROLES.map(r=>`<label class="abCheck"><input type="checkbox" data-abrole="${r}" ${s.has(r)?'checked':''}> ${r}</label>`).join('');}

function abSwitchTab(tab){
  const t=String(tab||'basic');document.querySelectorAll('.abTab').forEach(b=>b.classList.toggle('active',b.dataset.abtab===t));document.querySelectorAll('#adminBuilderModal .abPane').forEach(p=>p.classList.remove('active'));
  const pane=$('abPane'+t.charAt(0).toUpperCase()+t.slice(1));if(pane)pane.classList.add('active');
  if(t==='preview')abRenderPreview();if(t==='list')abRefreshBuilderList();
}

function abRenderEditor(){
  const m=abEditor.module||abDefaultModule();
  $('abPaneBasic').innerHTML=`<div class="abCard"><div class="abCardTitle">THÔNG TIN NÚT / CHỨC NĂNG</div><div class="abGrid3">
    <div><label class="abLabel">Mã chức năng *</label><input id="abCode" class="abInput" value="${esc(m.code)}" placeholder="VD: CHECK_GPU"></div>
    <div><label class="abLabel">Tên nút / chức năng *</label><input id="abName" class="abInput" value="${esc(m.name)}" placeholder="VD: KIỂM TRA GPU"></div>
    <div><label class="abLabel">Icon / ký hiệu</label><input id="abIcon" class="abInput" value="${esc(m.icon||'🧩')}" placeholder="🧩"></div>
    <div><label class="abLabel">Nhóm</label><input id="abCategory" class="abInput" value="${esc(m.category||'NGHIỆP VỤ')}"></div>
    <div><label class="abLabel">Thứ tự nút</label><input id="abOrder" class="abInput" type="number" value="${Number(m.order||500)}"></div>
    <div><label class="abLabel">Chữ trên nút GỬI/LƯU</label><input id="abSubmitLabel" class="abInput" value="${esc(m.submitLabel||'GỬI / LƯU')}"></div>
    <div class="wide" style="grid-column:1/-1"><label class="abLabel">Mô tả / mục đích</label><textarea id="abDescription" class="abTextarea">${esc(m.description||'')}</textarea></div>
  </div><label class="abCheck" style="margin-top:8px"><input id="abRequireFlight" type="checkbox" ${m.requireFlight?'checked':''}> Chỉ cho nhập khi đang có chuyến đang chọn</label></div>
  <div class="abActions"><button class="abBtn good" onclick="abSaveDraft()">LƯU NHÁP</button><button class="abBtn" onclick="abPublish()">XUẤT BẢN</button><button class="abBtn secondary" onclick="abResetEditor()">TẠO MỚI</button></div><div id="abBuilderStatus" class="abStatus"></div>`;
  abRenderFields();abRenderRules();abRenderWorkflow();abRenderPermissions();abRenderHelp();
}
function abRenderFields(){
  const host=$('abPaneFields');if(!host)return;
  host.innerHTML=`<div class="abCard"><div class="abRowHead"><div><div class="abCardTitle">CÁC TRƯỜNG TRÊN BIỂU MẪU</div><div class="abMeta">Key dùng cho công thức/rule. Không nhập JavaScript.</div></div><button class="abBtn good" onclick="abAddField()">+ THÊM TRƯỜNG</button></div><div id="abFieldList"></div></div>`;
  const list=$('abFieldList');abEditor.fields.forEach((f,i)=>{const n=abNormalizeField(f,i),row=document.createElement('div');row.className='abFieldRow';row.innerHTML=`
    <div class="abRowHead"><b>${i+1}. ${esc(n.label)} <span class="abPill">${esc(n.key)}</span></b><div class="abMiniActions"><button onclick="abMoveField(${i},-1)">↑</button><button onclick="abMoveField(${i},1)">↓</button><button class="danger" onclick="abDeleteField(${i})">XÓA</button></div></div>
    <div class="abGrid3" style="margin-top:7px">
      <div><label class="abLabel">Tên trường</label><input class="abInput" data-fprop="label" data-i="${i}" value="${esc(n.label)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Key</label><input class="abInput" data-fprop="key" data-i="${i}" value="${esc(n.key)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Loại</label><select class="abSelect" data-fprop="type" data-i="${i}" onchange="abFieldChanged(this)">${AB_FIELD_TYPES.map(x=>`<option value="${x[0]}" ${n.type===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
      <div><label class="abLabel">Placeholder</label><input class="abInput" data-fprop="placeholder" data-i="${i}" value="${esc(n.placeholder)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Giá trị mặc định</label><input class="abInput" data-fprop="defaultValue" data-i="${i}" value="${esc(n.defaultValue)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Đơn vị</label><input class="abInput" data-fprop="unit" data-i="${i}" value="${esc(n.unit)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Min</label><input class="abInput" type="number" data-fprop="min" data-i="${i}" value="${n.min===''?'':esc(n.min)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Max</label><input class="abInput" type="number" data-fprop="max" data-i="${i}" value="${n.max===''?'':esc(n.max)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Danh sách lựa chọn (cách nhau dấu phẩy)</label><input class="abInput" data-fprop="options" data-i="${i}" value="${esc(n.options.join(', '))}" oninput="abFieldChanged(this)"></div>
      <div class="wide" style="grid-column:1/-1"><label class="abLabel">Công thức (chỉ loại Tự tính) · VD: BAG_KG / BAG_PCS</label><input class="abInput" data-fprop="formula" data-i="${i}" value="${esc(n.formula)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Hiện khi FIELD</label><input class="abInput" data-fprop="showField" data-i="${i}" value="${esc(n.showWhen.field)}" oninput="abFieldChanged(this)"></div>
      <div><label class="abLabel">Điều kiện</label><select class="abSelect" data-fprop="showOp" data-i="${i}" onchange="abFieldChanged(this)">${AB_OPS.map(x=>`<option value="${x[0]}" ${n.showWhen.op===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
      <div><label class="abLabel">Giá trị điều kiện</label><input class="abInput" data-fprop="showValue" data-i="${i}" value="${esc(n.showWhen.value)}" oninput="abFieldChanged(this)"></div>
    </div><label class="abCheck" style="margin-top:7px"><input type="checkbox" data-fprop="required" data-i="${i}" ${n.required?'checked':''} onchange="abFieldChanged(this)"> Bắt buộc nhập</label>`;list.appendChild(row);});
  if(!abEditor.fields.length)list.innerHTML='<div class="abHint">Chưa có trường. Bấm <b>+ THÊM TRƯỜNG</b>.</div>';
}
function abFieldChanged(el){
  const i=Number(el.dataset.i),p=el.dataset.fprop;if(!abEditor.fields[i])return;let v=el.type==='checkbox'?!!el.checked:el.value;
  if(p==='key')v=keyId(v); if(p==='options')v=String(v).split(',').map(x=>x.trim()).filter(Boolean); if(p==='min'||p==='max')v=v===''?'':Number(v);
  if(p==='showField')abEditor.fields[i].showWhen={...(abEditor.fields[i].showWhen||{}),field:keyId(v)};
  else if(p==='showOp')abEditor.fields[i].showWhen={...(abEditor.fields[i].showWhen||{}),op:String(v)};
  else if(p==='showValue')abEditor.fields[i].showWhen={...(abEditor.fields[i].showWhen||{}),value:String(v)};
  else abEditor.fields[i][p]=v;
}
function abAddField(){abEditor.fields.push(abNormalizeField({label:'Trường mới',key:'F'+(abEditor.fields.length+1)},abEditor.fields.length));abRenderFields();}
function abDeleteField(i){abEditor.fields.splice(i,1);abRenderFields();}
function abMoveField(i,d){const j=i+d;if(j<0||j>=abEditor.fields.length)return;[abEditor.fields[i],abEditor.fields[j]]=[abEditor.fields[j],abEditor.fields[i]];abRenderFields();}

function abFieldKeyOptions(selected=''){return '<option value="">— chọn field —</option>'+abEditor.fields.filter(f=>f.type!=='section').map(f=>`<option value="${esc(f.key)}" ${String(f.key)===String(selected)?'selected':''}>${esc(f.key)} · ${esc(f.label)}</option>`).join('');}
function abRenderRules(){
  const host=$('abPaneRules');if(!host)return;host.innerHTML=`<div class="abCard"><div class="abRowHead"><div><div class="abCardTitle">RULE / CẢNH BÁO</div><div class="abMeta">Mỗi rule có tối đa 2 điều kiện ghép AND/OR. Mặc định chỉ cảnh báo; bật CHẶN nếu thực sự bắt buộc.</div></div><button class="abBtn good" onclick="abAddRule()">+ THÊM RULE</button></div><div id="abRuleList"></div></div>`;
  const list=$('abRuleList');abEditor.rules.forEach((r,i)=>{const n=abNormalizeRule(r,i),row=document.createElement('div');row.className='abRuleRow';row.innerHTML=`
    <div class="abRowHead"><b>${esc(n.name)}</b><div class="abMiniActions"><button class="danger" onclick="abDeleteRule(${i})">XÓA</button></div></div>
    <div class="abGrid3" style="margin-top:7px"><div><label class="abLabel">Tên rule</label><input class="abInput" data-rprop="name" data-i="${i}" value="${esc(n.name)}" oninput="abRuleChanged(this)"></div><div><label class="abLabel">FIELD 1</label><select class="abSelect" data-rprop="c1field" data-i="${i}" onchange="abRuleChanged(this)">${abFieldKeyOptions(n.c1.field)}</select></div><div><label class="abLabel">Điều kiện 1</label><select class="abSelect" data-rprop="c1op" data-i="${i}" onchange="abRuleChanged(this)">${AB_OPS.map(x=>`<option value="${x[0]}" ${n.c1.op===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
    <div><label class="abLabel">Giá trị 1 · BETWEEN dùng: 10,20</label><input class="abInput" data-rprop="c1value" data-i="${i}" value="${esc(n.c1.value)}" oninput="abRuleChanged(this)"></div><div><label class="abLabel">Ghép điều kiện</label><select class="abSelect" data-rprop="join" data-i="${i}" onchange="abRuleChanged(this)"><option value="" ${!n.join?'selected':''}>KHÔNG</option><option value="AND" ${n.join==='AND'?'selected':''}>AND</option><option value="OR" ${n.join==='OR'?'selected':''}>OR</option></select></div><div><label class="abLabel">FIELD 2</label><select class="abSelect" data-rprop="c2field" data-i="${i}" onchange="abRuleChanged(this)">${abFieldKeyOptions(n.c2.field)}</select></div>
    <div><label class="abLabel">Điều kiện 2</label><select class="abSelect" data-rprop="c2op" data-i="${i}" onchange="abRuleChanged(this)">${AB_OPS.map(x=>`<option value="${x[0]}" ${n.c2.op===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div><div><label class="abLabel">Giá trị 2</label><input class="abInput" data-rprop="c2value" data-i="${i}" value="${esc(n.c2.value)}" oninput="abRuleChanged(this)"></div><div></div>
    <div class="wide" style="grid-column:1/-1"><label class="abLabel">Nội dung cảnh báo</label><input class="abInput" data-rprop="message" data-i="${i}" value="${esc(n.message)}" oninput="abRuleChanged(this)"></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:7px"><label class="abCheck"><input type="checkbox" data-rprop="active" data-i="${i}" ${n.active?'checked':''} onchange="abRuleChanged(this)"> Bật rule</label><label class="abCheck"><input type="checkbox" data-rprop="blocking" data-i="${i}" ${n.blocking?'checked':''} onchange="abRuleChanged(this)"> CHẶN GỬI khi vi phạm</label></div>`;list.appendChild(row);});
  if(!abEditor.rules.length)list.innerHTML='<div class="abHint">Không có rule thì biểu mẫu vẫn hoạt động bình thường.</div>';
}
function abRuleChanged(el){const i=Number(el.dataset.i),p=el.dataset.rprop;if(!abEditor.rules[i])return;const r=abEditor.rules[i],v=el.type==='checkbox'?!!el.checked:el.value;if(p==='c1field')r.c1.field=keyId(v);else if(p==='c1op')r.c1.op=v;else if(p==='c1value')r.c1.value=v;else if(p==='c2field')r.c2.field=keyId(v);else if(p==='c2op')r.c2.op=v;else if(p==='c2value')r.c2.value=v;else r[p]=v;}
function abAddRule(){abEditor.rules.push(abNormalizeRule({name:'Cảnh báo '+(abEditor.rules.length+1)},abEditor.rules.length));abRenderRules();}
function abDeleteRule(i){abEditor.rules.splice(i,1);abRenderRules();}

function abRenderWorkflow(){
  const host=$('abPaneWorkflow');if(!host)return;host.innerHTML=`<div class="abCard"><div class="abRowHead"><div><div class="abCardTitle">WORKFLOW XÁC NHẬN SAU KHI GỬI</div><div class="abMeta">Không bắt buộc. Ví dụ: CBTT CHECK → ĐH XÁC NHẬN. Mỗi bước chỉ vai trò được chọn mới bấm được nút xác nhận.</div></div><button class="abBtn good" onclick="abAddStep()">+ THÊM BƯỚC</button></div><div id="abStepList"></div></div>`;
  const list=$('abStepList');abEditor.workflow.forEach((s,i)=>{const n=abNormalizeStep(s,i),row=document.createElement('div');row.className='abStepRow';row.innerHTML=`<div class="abRowHead"><b>BƯỚC ${i+1}</b><div class="abMiniActions"><button onclick="abMoveStep(${i},-1)">↑</button><button onclick="abMoveStep(${i},1)">↓</button><button class="danger" onclick="abDeleteStep(${i})">XÓA</button></div></div><div class="abGrid3" style="margin-top:7px"><div><label class="abLabel">Tên bước</label><input class="abInput" data-sprop="label" data-i="${i}" value="${esc(n.label)}" oninput="abStepChanged(this)"></div><div><label class="abLabel">Vai trò xử lý</label><select class="abSelect" data-sprop="role" data-i="${i}" onchange="abStepChanged(this)">${AB_ALL_ROLES.map(r=>`<option ${n.role===r?'selected':''}>${r}</option>`).join('')}</select></div><div><label class="abLabel">Tên nút hành động</label><input class="abInput" data-sprop="action" data-i="${i}" value="${esc(n.action)}" oninput="abStepChanged(this)"></div></div>`;list.appendChild(row);});
  if(!abEditor.workflow.length)list.innerHTML='<div class="abHint">Không có workflow: người dùng nhập và lưu xong là hoàn tất.</div>';
}
function abStepChanged(el){const i=Number(el.dataset.i),p=el.dataset.sprop;if(abEditor.workflow[i])abEditor.workflow[i][p]=el.value;}
function abAddStep(){abEditor.workflow.push(abNormalizeStep({label:'Bước '+(abEditor.workflow.length+1),role:'AD',action:'XÁC NHẬN'},abEditor.workflow.length));abRenderWorkflow();}
function abDeleteStep(i){abEditor.workflow.splice(i,1);abRenderWorkflow();}
function abMoveStep(i,d){const j=i+d;if(j<0||j>=abEditor.workflow.length)return;[abEditor.workflow[i],abEditor.workflow[j]]=[abEditor.workflow[j],abEditor.workflow[i]];abRenderWorkflow();}

function abRenderPermissions(){
  const m=abEditor.module||abDefaultModule(),host=$('abPanePermissions');if(!host)return;host.innerHTML=`<div class="abCard"><div class="abCardTitle">AI ĐƯỢC THẤY NÚT NÀY?</div><div class="abCheckGrid" id="abRoleChecks">${abRoleOptionsHtml(m.visibility?.roles||['AD'])}</div><div class="abGrid" style="margin-top:8px"><div><label class="abLabel">GroupCode bổ sung · cách nhau dấu phẩy</label><input id="abGroups" class="abInput" value="${esc(abArrayText(m.visibility?.groups||[]))}" placeholder="VD: VHTTB, PVHK"></div><div><label class="abLabel">DepartmentCode bổ sung</label><input id="abDepartments" class="abInput" value="${esc(abArrayText(m.visibility?.departments||[]))}" placeholder="VD: DH, CBTT"></div></div></div>
  <div class="abCard"><div class="abCardTitle">AI ĐƯỢC NHẬP / GỬI?</div><div class="abMeta">Để trống = dùng cùng danh sách được thấy. Có thể nhập: PVHK, CBTT...</div><input id="abSubmitRoles" class="abInput" value="${esc(abArrayText(m.submitRoles||[]))}"></div>
  <div class="abHint">AD luôn có thể mở module để kiểm tra. Người dùng chỉ thấy module khi khớp ít nhất một tiêu chí Role / Group / Department đã cấu hình.</div>`;
}

function abReadEditorIntoModule(){
  const old=abEditor.module||abDefaultModule(),m=abNormalizeModule({...old});
  m.code=safeId($('abCode')?.value||m.code);m.name=String($('abName')?.value||m.name).trim();m.icon=String($('abIcon')?.value||'🧩').trim().slice(0,8)||'🧩';m.category=String($('abCategory')?.value||'NGHIỆP VỤ').trim();m.order=Number($('abOrder')?.value||500);m.submitLabel=String($('abSubmitLabel')?.value||'GỬI / LƯU').trim()||'GỬI / LƯU';m.description=String($('abDescription')?.value||'').trim();m.requireFlight=!!$('abRequireFlight')?.checked;
  const roles=[...document.querySelectorAll('#abRoleChecks [data-abrole]:checked')].map(x=>x.dataset.abrole);m.visibility={roles:abUnique(roles),groups:abCsv($('abGroups')?.value),departments:abCsv($('abDepartments')?.value)};m.submitRoles=abCsv($('abSubmitRoles')?.value);if(!m.submitRoles.length)m.submitRoles=[...m.visibility.roles];m.fields=abEditor.fields.map(abNormalizeField);m.rules=abEditor.rules.map(abNormalizeRule);m.workflow=abEditor.workflow.map(abNormalizeStep);m.id=old.id||abEditingId||('AB_MODULE__'+m.code);return m;
}
function abValidateModule(m){
  if(!m.code||!m.name)return 'Cần nhập Mã chức năng và Tên chức năng.';
  if(!m.fields.length)return 'Cần ít nhất 1 trường dữ liệu hoặc tiêu đề nhóm.';
  const keys=m.fields.filter(f=>f.type!=='section').map(f=>f.key);if(keys.some((k,i)=>keys.indexOf(k)!==i))return 'Key của các trường không được trùng nhau.';
  if(keys.some(k=>!k))return 'Có trường chưa có Key.';
  for(const f of m.fields){if(f.type==='formula'&&!f.formula.trim())return `Trường ${f.label} là Tự tính nhưng chưa có công thức.`;}
  if(!m.visibility.roles.length&&!m.visibility.groups.length&&!m.visibility.departments.length)return 'Cần chọn ít nhất Role / Group / Department được thấy.';
  return '';
}
function abStatus(msg,err=false){const e=$('abBuilderStatus');if(e){e.textContent=msg;e.classList.toggle('err',!!err);}}

async function abWriteHistory(module,action){
  try{const stamp=now(),id=`AB_HISTORY__${safeId(module.id)}__${stamp}`;await abDb().collection(HANDOVER_COLLECTION).doc(id).set({kind:AB_HISTORY_KIND,moduleId:module.id,moduleCode:module.code,action:String(action||'SAVE'),revision:Number(module.revision||0),publishVersion:Number(module.publishVersion||0),snapshot:clone(module),createdAtMs:stamp,createdBy:abActor()});}catch(e){console.info('Admin Builder history',e?.message||e);}
}
async function abSaveDraft(){
  if(!abIsAdmin())return roleDenied?.('Chỉ AD được dùng ADMIN BUILDER.');
  try{let m=abReadEditorIntoModule(),err=abValidateModule(m);if(err)return abStatus(err,true);abStatus('Đang lưu nháp...');const stamp=now();m.status='DRAFT';m.active=true;m.revision=Number(m.revision||0)+1;m.updatedAtMs=stamp;m.updatedBy=abActor();m.createdAtMs=Number(m.createdAtMs||stamp);await abDb().collection(HANDOVER_COLLECTION).doc(m.id).set({kind:AB_MODULE_KIND,...clone(m)},{merge:true});await abWriteHistory(m,'SAVE_DRAFT');abEditingId=m.id;abEditor.module=m;abStatus(`Đã lưu NHÁP · revision ${m.revision}. Chưa xuất hiện ở tài khoản người dùng.`);abRefreshBuilderList();}catch(e){abStatus('Không lưu được: '+(e?.message||e),true);}
}
async function abRebuildCatalog(changedId='',action='PUBLISH'){
  const snap=await abDb().collection(HANDOVER_COLLECTION).where('kind','==',AB_MODULE_KIND).get(),mods=[];snap.forEach(doc=>{const d=abNormalizeModule({id:doc.id,...(doc.data()||{})});if(d.status==='PUBLISHED'&&d.active!==false)mods.push(d);});mods.sort((a,b)=>Number(a.order||500)-Number(b.order||500)||String(a.name).localeCompare(String(b.name),'vi'));const version=now();const catalog={kind:AB_CATALOG_KIND,version,modules:mods,updatedAtMs:version,updatedBy:abActor()};await abDb().collection(HANDOVER_COLLECTION).doc(AB_CATALOG_DOC).set(catalog);abCatalog={version,modules:mods};abSaveCatalogCache(abCatalog);abRenderDynamicButtons();try{if(typeof sagsV470Ref==='function')await sagsV470Ref(AB_SIGNAL_PATH).set({version,moduleId:changedId,action,updatedAtMs:version,updatedBy:abActor()});}catch(e){console.info('Admin Builder RTDB signal',e?.message||e);}return catalog;
}
async function abPublish(){
  if(!abIsAdmin())return;
  try{let m=abReadEditorIntoModule(),err=abValidateModule(m);if(err)return abStatus(err,true);abStatus('Đang XUẤT BẢN...');const stamp=now();m.status='PUBLISHED';m.active=true;m.revision=Number(m.revision||0)+1;m.publishVersion=Number(m.publishVersion||0)+1;m.updatedAtMs=stamp;m.updatedBy=abActor();m.createdAtMs=Number(m.createdAtMs||stamp);await abDb().collection(HANDOVER_COLLECTION).doc(m.id).set({kind:AB_MODULE_KIND,...clone(m)},{merge:true});await abWriteHistory(m,'PUBLISH');await abRebuildCatalog(m.id,'PUBLISH');abEditingId=m.id;abEditor.module=m;abStatus(`ĐÃ XUẤT BẢN · Config V${m.publishVersion}. Tài khoản phù hợp sẽ tự nhận nút mới, không cần update ZIP.`);abRefreshBuilderList();}catch(e){abStatus('Xuất bản thất bại: '+(e?.message||e),true);}
}
async function abSetModuleActive(id,active){
  if(!abIsAdmin())return;try{const ref=abDb().collection(HANDOVER_COLLECTION).doc(id),s=await ref.get();if(!s.exists)return;let m=abNormalizeModule({id,...s.data()});if(active){const err=abValidateModule(m);if(err)return alert('Chưa thể bật/xuất bản: '+err);m.publishVersion=Number(m.publishVersion||0)+1;}m.active=!!active;m.status=active?'PUBLISHED':'INACTIVE';m.revision=Number(m.revision||0)+1;m.updatedAtMs=now();m.updatedBy=abActor();await ref.set({kind:AB_MODULE_KIND,...clone(m)},{merge:true});await abWriteHistory(m,active?'REACTIVATE_PUBLISH':'DEACTIVATE');await abRebuildCatalog(id,active?'PUBLISH':'DEACTIVATE');abRefreshBuilderList();}catch(e){alert('Không thay đổi được trạng thái: '+(e?.message||e));}
}
async function abDeleteModule(id){
  if(!abIsAdmin()||!confirm('XÓA MỀM chức năng này? Bản ghi đã tạo vẫn được giữ để truy vết.'))return;try{const ref=abDb().collection(HANDOVER_COLLECTION).doc(id),s=await ref.get();if(!s.exists)return;let m=abNormalizeModule({id,...s.data()});m.active=false;m.status='DELETED';m.deletedAtMs=now();m.deletedBy=abActor();m.revision=Number(m.revision||0)+1;await ref.set({kind:AB_MODULE_KIND,...clone(m)},{merge:true});await abWriteHistory(m,'DELETE_SOFT');await abRebuildCatalog(id,'DELETE');abRefreshBuilderList();}catch(e){alert('Không xóa được: '+(e?.message||e));}
}

async function abRefreshBuilderList(){
  const host=$('abPaneList');if(!host)return;host.innerHTML='<div class="abHint">Đang tải danh sách...</div>';try{const snap=await abDb().collection(HANDOVER_COLLECTION).where('kind','==',AB_MODULE_KIND).get(),arr=[];snap.forEach(doc=>arr.push(abNormalizeModule({id:doc.id,...(doc.data()||{})})));arr.sort((a,b)=>Number(b.updatedAtMs||0)-Number(a.updatedAtMs||0));abBuilderList=arr;host.innerHTML=`<div class="abCard"><div class="abRowHead"><div class="abCardTitle">CHỨC NĂNG ĐÃ TẠO</div><button class="abBtn good" onclick="abResetEditor();abSwitchTab('basic')">+ TẠO MỚI</button></div><div class="abList">${arr.length?arr.map(m=>abModuleItemHtml(m)).join(''):'<div class="abHint">Chưa có chức năng động.</div>'}</div></div>`;}catch(e){host.innerHTML='<div class="abWarn">Không tải được danh sách: '+esc(e?.message||e)+'</div>';}
}
function abModuleItemHtml(m){const cl=m.status==='PUBLISHED'&&m.active?'pub':m.status==='DRAFT'?'draft':'off',lab=m.status==='PUBLISHED'&&m.active?'ĐANG HOẠT ĐỘNG':m.status==='DRAFT'?'NHÁP':m.status;return `<div class="abItem"><div class="abItemTitle">${esc(m.icon)} ${esc(m.code)} · ${esc(m.name)} <span class="abPill ${cl}">${esc(lab)}</span></div><div class="abMeta">${m.fields.length} trường · ${m.rules.length} rule · ${m.workflow.length} bước workflow · Config V${Number(m.publishVersion||0)} · sửa ${m.updatedAtMs?new Date(m.updatedAtMs).toLocaleString('vi-VN'):''}</div><div class="abActions"><button class="abBtn secondary" onclick='abEditModule(${JSON.stringify(m.id)})'>SỬA</button><button class="abBtn secondary" onclick='abLoadHistory(${JSON.stringify(m.id)})'>LỊCH SỬ</button>${m.status==='PUBLISHED'&&m.active?`<button class="abBtn warn" onclick='abSetModuleActive(${JSON.stringify(m.id)},false)'>TẮT</button>`:`<button class="abBtn good" onclick='abSetModuleActive(${JSON.stringify(m.id)},true)'>BẬT/XUẤT BẢN</button>`}<button class="abBtn danger" onclick='abDeleteModule(${JSON.stringify(m.id)})'>XÓA MỀM</button></div></div>`;}
async function abEditModule(id){try{const s=await abDb().collection(HANDOVER_COLLECTION).doc(id).get();if(!s.exists)return;const m=abNormalizeModule({id,...s.data()});abEditingId=id;abEditor={module:m,fields:clone(m.fields),rules:clone(m.rules),workflow:clone(m.workflow)};abRenderEditor();abSwitchTab('basic');}catch(e){alert('Không mở được cấu hình: '+(e?.message||e));}}
async function abLoadHistory(id){
  try{const snap=await abDb().collection(HANDOVER_COLLECTION).where('kind','==',AB_HISTORY_KIND).where('moduleId','==',id).get(),arr=[];snap.forEach(doc=>arr.push({id:doc.id,...(doc.data()||{})}));arr.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));const host=$('abPaneList');host.innerHTML=`<div class="abCard"><div class="abRowHead"><div class="abCardTitle">LỊCH SỬ CẤU HÌNH</div><button class="abBtn secondary" onclick="abRefreshBuilderList()">← QUAY LẠI</button></div><div class="abHint">KHÔI PHỤC chỉ nạp cấu hình cũ vào trình sửa. Anh phải bấm XUẤT BẢN nếu muốn áp dụng lại.</div><div class="abList">${arr.length?arr.slice(0,50).map(h=>`<div class="abItem"><div class="abItemTitle">${esc(h.action)} · revision ${Number(h.revision||0)} · Config V${Number(h.publishVersion||0)}</div><div class="abMeta">${new Date(Number(h.createdAtMs||0)).toLocaleString('vi-VN')} · ${esc(h.createdBy?.name||h.createdBy?.username||'')}</div><div class="abActions"><button class="abBtn secondary" onclick='abRestoreHistory(${JSON.stringify(h.id)})'>NẠP BẢN NÀY</button></div></div>`).join(''):'<div class="abHint">Chưa có lịch sử.</div>'}</div></div>`;}catch(e){alert('Không tải được lịch sử: '+(e?.message||e));}
}
async function abRestoreHistory(historyId){try{const s=await abDb().collection(HANDOVER_COLLECTION).doc(historyId).get();if(!s.exists||!s.data()?.snapshot)return;const m=abNormalizeModule(s.data().snapshot);abEditingId=m.id;abEditor={module:m,fields:clone(m.fields),rules:clone(m.rules),workflow:clone(m.workflow)};abRenderEditor();abSwitchTab('basic');abStatus('Đã NẠP bản lịch sử vào trình sửa. Chưa áp dụng cho người dùng cho đến khi bấm XUẤT BẢN.');}catch(e){alert('Không khôi phục được: '+(e?.message||e));}}

function abResetEditor(){const m=abDefaultModule();abEditingId='';abEditor={module:m,fields:[],rules:[],workflow:[]};abRenderEditor();}
function abOpenBuilder(){if(!abIsAdmin())return typeof roleDenied==='function'?roleDenied('Chỉ AD được dùng ADMIN BUILDER.'):null;abEnsureModals();$('adminBuilderModal').style.display='flex';if(!abEditor.module)abResetEditor();else abRenderEditor();abSwitchTab('basic');abRefreshBuilderList();}
function abCloseBuilder(){$('adminBuilderModal').style.display='none';}

function abHelpHtml(){return `<div class="abCard"><div class="abCardTitle">HDSD · ADMIN BUILDER</div>
  <h4>A. TẠO MỘT BIỂU MẪU MỚI</h4><ol><li>AD → <b>ADMIN BUILDER</b>.</li><li>Tab <b>1 · CHỨC NĂNG</b>: nhập Mã, Tên nút, Icon, mô tả.</li><li>Tab <b>2 · BIỂU MẪU</b>: bấm <b>+ THÊM TRƯỜNG</b>. Mỗi trường có Tên, Key, Loại, Required, Min/Max, lựa chọn, công thức, điều kiện hiển thị.</li><li>Tab <b>3 · CẢNH BÁO</b>: thêm rule nếu cần.</li><li>Tab <b>4 · WORKFLOW</b>: thêm các bước xác nhận sau khi người dùng gửi; không cần thì để trống.</li><li>Tab <b>5 · PHÂN QUYỀN</b>: chọn Role/Group/Department được thấy và được nhập.</li><li>Tab <b>6 · XEM THỬ</b>: test trước khi phát hành.</li><li>Bấm <b>LƯU NHÁP</b> để giữ riêng cho AD; bấm <b>XUẤT BẢN</b> để các tài khoản phù hợp nhận nút mới.</li></ol>
  <h4>B. VÍ DỤ: KIỂM TRA GPU TRƯỚC CHUYẾN</h4><div class="abExample"><b>Tên:</b> KIỂM TRA GPU<br><b>Role:</b> VHTTB<br><b>Field:</b> GPU_READY loại CÓ/KHÔNG<br><b>Rule:</b> GPU_READY = KHÔNG → “GPU CHƯA SẴN SÀNG · KIỂM TRA NGAY”.<br><b>Publish:</b> VHTTB tự thấy nút mới, không cần update ZIP.</div>
  <h4>C. CÔNG THỨC AN TOÀN</h4><p>Dùng Key trường. Ví dụ <code>BAG_KG / BAG_PCS</code>, <code>ADL + CHD + INF</code>, <code>ROUND(BAG_KG / BAG_PCS, 1)</code>. Hỗ trợ <code>SUM()</code>, <code>AVG()</code>, <code>MIN()</code>, <code>MAX()</code>, <code>ROUND()</code>. Không hỗ trợ JavaScript, HTML hoặc lệnh Firebase tự do.</p>
  <h4>C2. GIÁ TRỊ MẶC ĐỊNH TỰ ĐIỀN</h4><p>Có thể dùng <code>{USERNAME}</code>, <code>{NAME}</code>, <code>{ROLE}</code>, <code>{TODAY}</code>, <code>{NOW}</code>, <code>{FLIGHT}</code> trong Giá trị mặc định để tự lấy tài khoản/ngày/giờ/chuyến hiện tại.</p>
  <h4>D. ĐIỀU KIỆN / RULE</h4><p>Hỗ trợ =, ≠, &gt;, ≥, &lt;, ≤, ĐỂ TRỐNG, CÓ DỮ LIỆU, BETWEEN; có thể ghép 2 điều kiện bằng AND/OR. Mặc định là cảnh báo đỏ có nút <b>ĐÃ BIẾT</b>. Chỉ bật <b>CHẶN GỬI</b> khi quy định nghiệp vụ thật sự bắt buộc.</p>
  <h4>E. TRƯỜNG ĐIỀU KIỆN HIỂN THỊ</h4><p>Ví dụ chỉ hiện “LÝ DO” khi <code>GPU_READY = KHÔNG</code>: ở field LÝ DO, nhập <b>Hiện khi FIELD = GPU_READY</b>, điều kiện <b>=</b>, giá trị <b>KHÔNG</b>.</p>
  <h4>F. WORKFLOW</h4><p>Ví dụ thêm Bước 1: <b>CBTT · KIỂM TRA</b>, Bước 2: <b>DH · XÁC NHẬN</b>. Sau khi bản ghi được gửi, hệ thống hiển thị trạng thái bước và chỉ tài khoản đúng Role mới được bấm hành động bước hiện tại.</p>
  <h4>G. SỬA / TẮT / KHÔI PHỤC</h4><ul><li><b>SỬA</b>: thay cấu hình rồi Publish lại.</li><li><b>TẮT</b>: nút biến mất khỏi người dùng nhưng dữ liệu cũ giữ nguyên.</li><li><b>XÓA MỀM</b>: không hiển thị module, không xóa các bản ghi nghiệp vụ.</li><li><b>LỊCH SỬ → NẠP BẢN NÀY</b>: nạp snapshot cũ rồi Publish nếu muốn rollback.</li></ul>
  <h4>H. TÀI LIỆU ĐÍNH KÈM</h4><p>Field <b>Link tài liệu / MediaFire</b> lưu URL + tên mô tả, không lưu nội dung file trong Firestore. Nếu MediaFire FileDrop đã được cấu hình, người dùng có nút mở FileDrop để upload rồi dán link file.</p>
  <h4>I. KHI NÀO VẪN PHẢI UPDATE CODE?</h4><p>Camera/scan mới, thuật toán AI mới, API hãng bên ngoài, thay Firebase Authentication, logic phần cứng hoặc chức năng đặc thù chưa có component trong Builder vẫn cần phát hành bản mới. Các form/rule/workflow thông thường thì không.</p>
  </div>`;}
function abRenderHelp(){if($('abPaneHelp'))$('abPaneHelp').innerHTML=abHelpHtml();}

function abRenderPreview(){
  try{const m=abReadEditorIntoModule(),host=$('abPanePreview');host.innerHTML=`<div class="abCard"><div class="abRowHead"><div><div class="abCardTitle">XEM THỬ · ${esc(m.icon)} ${esc(m.name||'CHỨC NĂNG')}</div><div class="abMeta">Preview không ghi dữ liệu Firebase.</div></div><button class="abBtn" onclick="abOpenRuntimePreview()">MỞ FORM XEM THỬ</button></div><div style="margin-top:8px">${m.fields.map(f=>`<span class="abPill">${esc(f.key)} · ${esc(f.label)}</span>`).join('')}</div></div>`;}catch(e){$('abPanePreview').innerHTML='<div class="abWarn">'+esc(e?.message||e)+'</div>';}
}
function abOpenRuntimePreview(){try{const m=abReadEditorIntoModule();abOpenRuntime(m,{preview:true});}catch(e){alert(e?.message||e);}}

/* ---------------- Safe formula parser ---------------- */
function abTokenize(expr){
  const s=String(expr||''),out=[];let i=0;while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue;}if(/[0-9.]/.test(c)){let j=i+1;while(j<s.length&&/[0-9.]/.test(s[j]))j++;const n=Number(s.slice(i,j));if(!Number.isFinite(n))throw new Error('Số không hợp lệ');out.push({t:'num',v:n});i=j;continue;}if(/[A-Za-z_]/.test(c)){let j=i+1;while(j<s.length&&/[A-Za-z0-9_]/.test(s[j]))j++;out.push({t:'id',v:s.slice(i,j).toUpperCase()});i=j;continue;}if('+-*/(),'.includes(c)){out.push({t:c,v:c});i++;continue;}throw new Error('Ký tự không được phép: '+c);}return out;}
function abFormula(expr,values){
  if(!String(expr||'').trim())return '';
  const ts=abTokenize(expr);let p=0;const peek=()=>ts[p],eat=t=>{if(peek()?.t===t)return ts[p++];throw new Error('Sai công thức');};
  const valueOf=id=>{const v=values[id];const n=Number(v);return Number.isFinite(n)?n:0;};
  function primary(){const x=peek();if(!x)throw new Error('Thiếu dữ liệu');if(x.t==='num'){p++;return x.v;}if(x.t==='-'){p++;return -primary();}if(x.t==='+'){p++;return primary();}if(x.t==='('){p++;const v=add();eat(')');return v;}if(x.t==='id'){p++;const id=x.v;if(peek()?.t==='('){p++;const args=[];if(peek()?.t!==')'){args.push(add());while(peek()?.t===','){p++;args.push(add());}}eat(')');if(id==='SUM')return args.reduce((a,b)=>a+b,0);if(id==='AVG')return args.length?args.reduce((a,b)=>a+b,0)/args.length:0;if(id==='MIN')return args.length?Math.min(...args):0;if(id==='MAX')return args.length?Math.max(...args):0;if(id==='ROUND'){const d=Math.max(0,Math.min(6,Math.trunc(args[1]||0))),k=10**d;return Math.round((args[0]||0)*k)/k;}throw new Error('Hàm không hỗ trợ: '+id);}return valueOf(id);}throw new Error('Sai công thức');}
  function mul(){let v=primary();while(peek()&&['*','/'].includes(peek().t)){const op=ts[p++].t,b=primary();v=op==='*'?v*b:(b===0?0:v/b);}return v;}function add(){let v=mul();while(peek()&&['+','-'].includes(peek().t)){const op=ts[p++].t,b=mul();v=op==='+'?v+b:v-b;}return v;}
  const r=add();if(p!==ts.length)throw new Error('Dư ký tự trong công thức');return Number.isFinite(r)?r:'';
}
function abCompare(actual,op,expected){
  const a=actual,empty=a===''||a==null||a===false;if(op==='empty')return empty;if(op==='not_empty')return !empty;
  if(op==='between'){const [x,y]=String(expected||'').split(',').map(Number);const n=Number(a);return Number.isFinite(n)&&Number.isFinite(x)&&Number.isFinite(y)&&n>=Math.min(x,y)&&n<=Math.max(x,y);}
  const an=Number(a),en=Number(expected),numeric=String(a).trim()!==''&&String(expected).trim()!==''&&Number.isFinite(an)&&Number.isFinite(en);const A=numeric?an:String(a??'').trim().toUpperCase(),B=numeric?en:String(expected??'').trim().toUpperCase();
  if(op==='==')return A===B;if(op==='!=')return A!==B;if(op==='>')return A>B;if(op==='>=')return A>=B;if(op==='<')return A<B;if(op==='<=')return A<=B;return false;
}
function abRuleTriggered(rule,vals){const c1=abCompare(vals[rule.c1.field],rule.c1.op,rule.c1.value);if(!rule.join||!rule.c2.field)return c1;const c2=abCompare(vals[rule.c2.field],rule.c2.op,rule.c2.value);return rule.join==='AND'?(c1&&c2):(c1||c2);}

function abResolveDefault(v){
  let s=String(v??'');const actor=abActor();let meta={};try{if(typeof currentFlightSessionMeta==='function')meta=currentFlightSessionMeta()||{};}catch(_){ }
  const map={USERNAME:actor.username||'',NAME:actor.name||'',ROLE:actor.role||'',TODAY:new Date().toISOString().slice(0,10),NOW:new Date().toTimeString().slice(0,5),FLIGHT:String(meta.name||'')};
  Object.entries(map).forEach(([k,val])=>s=s.replaceAll('{'+k+'}',String(val)));return s;
}
function abModuleVisible(m,id=abIdentity()){
  if(!m||m.status!=='PUBLISHED'||m.active===false)return false;if(id.role==='AD')return true;
  // Vai trò nằm trong workflow luôn được thấy module để xử lý bản ghi, dù không phải vai trò nhập biểu mẫu.
  if((m.workflow||[]).some(s=>String(s.role||'').toUpperCase()===id.role))return true;
  const v=m.visibility||{},tests=[];if(v.roles?.length)tests.push(v.roles.includes(id.role)||v.roles.includes('ALL')||v.roles.includes('*'));if(v.groups?.length)tests.push(v.groups.includes(id.group));if(v.departments?.length)tests.push(v.departments.includes(id.department));return tests.length?tests.some(Boolean):false;
}
function abCanSubmit(m,id=abIdentity()){if(id.role==='AD')return true;const r=abUnique(m.submitRoles||[]);return !r.length||r.includes(id.role)||r.includes('ALL')||r.includes('*');}
function abHasFlight(){try{return !!((typeof activeFlightSessionId!=='undefined'&&activeFlightSessionId)&&typeof currentFlightSessionMeta==='function'&&currentFlightSessionMeta());}catch(_){return false;}}

function abRenderDynamicButtons(){
  const row=document.querySelector('.toolbar-row.main-actions');if(!row)return;row.querySelectorAll('.abDynamicBtn').forEach(x=>x.remove());const id=abIdentity();if(!id.role)return;const mods=(abCatalog.modules||[]).filter(m=>abModuleVisible(m,id)).sort((a,b)=>Number(a.order||500)-Number(b.order||500));const before=$('roleBtnNA');mods.forEach(m=>{const b=document.createElement('button');b.className='abDynamicBtn';b.dataset.abmodule=m.id;b.innerHTML=`${esc(m.icon||'🧩')} ${esc(m.name)}<span class="abDynamicBadge" id="abBadge_${safeId(m.id)}"></span>`;b.onclick=()=>abOpenModule(m.id);if(before)row.insertBefore(b,before);else row.appendChild(b);const n=Number(abPendingByModule[m.id]||0),badge=b.querySelector('.abDynamicBadge');if(n>0){badge.textContent=n>99?'99+':String(n);badge.style.display='flex';}});
}
function abRefreshRoleUi(){abEnsureAdminButton();const b=$('roleBtnAdminBuilder');if(b)b.style.display=abIsAdmin()?'inline-flex':'none';abRenderDynamicButtons();abStartCatalogSignal();abStartRecordSignal();}

function abSaveCatalogCache(cat){try{localStorage.setItem(AB_CACHE_KEY,JSON.stringify({savedAtMs:now(),catalog:cat}));}catch(_){ }}
function abReadCatalogCache(){try{const o=JSON.parse(localStorage.getItem(AB_CACHE_KEY)||'null');if(o?.catalog&&now()-Number(o.savedAtMs||0)<AB_CACHE_MAX_AGE)return o.catalog;}catch(_){ }return null;}
async function abLoadCatalog(force=false){
  if(!force){const c=abReadCatalogCache();if(c){abCatalog={version:Number(c.version||0),modules:(c.modules||[]).map(abNormalizeModule)};abRenderDynamicButtons();}}
  if(force||!abCatalog.version){try{const s=await abDb().collection(HANDOVER_COLLECTION).doc(AB_CATALOG_DOC).get();if(s.exists){const d=s.data()||{};abCatalog={version:Number(d.version||0),modules:(d.modules||[]).map(abNormalizeModule)};abSaveCatalogCache(abCatalog);abRenderDynamicButtons();}}catch(e){console.info('Admin Builder catalog',e?.message||e);}}
}
function abStartCatalogSignal(){
  if(abCatalogSignalRef||typeof sagsV470Ref!=='function')return;try{abCatalogSignalRef=sagsV470Ref(AB_SIGNAL_PATH);abCatalogSignalCb=s=>{const v=Number(s.val()?.version||0);if(v>Number(abCatalog.version||0))abLoadCatalog(true);};abCatalogSignalRef.on('value',abCatalogSignalCb);}catch(e){console.info('Admin Builder signal',e?.message||e);}
}
function abStartRecordSignal(){
  if(abRecordSignalRef||typeof sagsV470Ref!=='function'||!abIdentity().role)return;try{abRecordSignalRef=sagsV470Ref(AB_RECORD_SIGNAL_PATH);abRecordSignalCb=s=>{const d=s.val()||{},m=(abCatalog.modules||[]).find(x=>x.id===d.moduleId);if(!m||!abModuleVisible(m))return;const targetRole=String(d.targetRole||'').toUpperCase();if(targetRole&&targetRole!==abIdentity().role&&abIdentity().role!=='AD')return;const eventId=String(d.eventId||'');if(!eventId)return;const lk='ab_last_record_signal_'+safeId(m.id),prev=localStorage.getItem(lk)||'';if(prev===eventId)return;localStorage.setItem(lk,eventId);abPendingByModule[m.id]=Math.min(99,Number(abPendingByModule[m.id]||0)+1);abRenderDynamicButtons();};abRecordSignalRef.on('value',abRecordSignalCb);}catch(e){console.info('Admin Builder record signal',e?.message||e);}
}

async function abOpenModule(moduleId){let m=(abCatalog.modules||[]).find(x=>x.id===moduleId);if(!m&&abIsAdmin()){try{const s=await abDb().collection(HANDOVER_COLLECTION).doc(moduleId).get();if(s.exists)m=abNormalizeModule({id:moduleId,...s.data()});}catch(_){ }}if(!m)return alert('Không tìm thấy cấu hình chức năng. Hãy làm mới ứng dụng.');if(!abModuleVisible(m)&&!abIsAdmin())return;abPendingByModule[m.id]=0;abRenderDynamicButtons();abOpenRuntime(m,{preview:false});}
function abOpenRuntime(module,opts={}){
  abEnsureModals();abCurrentModule=abNormalizeModule(module);abCurrentRecord=null;abDismissedRuleKeys=new Set();const m=abCurrentModule;$('abRuntimeTitle').textContent=`${m.icon||'🧩'} ${m.name}${opts.preview?' · XEM THỬ':''}`;const body=$('abRuntimeBody');body.innerHTML=`<div class="abHint">${esc(m.description||'Biểu mẫu động do AD tạo.')}${m.requireFlight?' · <b>YÊU CẦU ĐANG CHỌN CHUYẾN</b>':''}</div><div id="abRuntimeWarnings"></div><div id="abRuntimeFields" class="abRuntimeFields"></div><div class="abActions"><button id="abRuntimeSubmit" class="abBtn good" ${opts.preview?'disabled':''}>${esc(m.submitLabel||'GỬI / LƯU')}</button><button class="abBtn secondary" onclick="abRuntimeReset()">LÀM MỚI</button>${opts.preview?'<span class="abMeta">Preview: không lưu dữ liệu.</span>':''}</div><div id="abRuntimeStatus" class="abStatus"></div>${opts.preview?'':'<div id="abRecords" class="abRecords"></div>'}`;
  abRenderRuntimeFields(m);body.dataset.preview=opts.preview?'1':'0';$('abRuntimeSubmit').onclick=()=>abSubmitRuntime();$('abRuntimeModal').style.display='flex';abRuntimeRecalc();if(!opts.preview)abLoadRecords(m.id);
}
function abCloseRuntime(){$('abRuntimeModal').style.display='none';abCurrentModule=null;abCurrentRecord=null;}
function abRuntimeReset(){if(!abCurrentModule)return;abDismissedRuleKeys=new Set();abRenderRuntimeFields(abCurrentModule);abRuntimeRecalc();}
function abRenderRuntimeFields(m){
  const host=$('abRuntimeFields');host.innerHTML='';m.fields.forEach((f,i)=>{f=abNormalizeField(f,i);if(f.type==='section'){const sec=document.createElement('div');sec.className='abRuntimeSection';sec.dataset.abwrap=f.key;sec.textContent=f.label;host.appendChild(sec);return;}const wrap=document.createElement('div');wrap.className='abRuntimeField'+(['textarea','radio','attachment'].includes(f.type)?' full':'');wrap.dataset.abwrap=f.key;const lab=document.createElement('label');lab.className='abLabel';lab.textContent=f.label+(f.required?' *':'');let input;
    if(f.type==='textarea'){input=document.createElement('textarea');input.className='abTextarea';}
    else if(f.type==='select'){input=document.createElement('select');input.className='abSelect';input.innerHTML='<option value="">— chọn —</option>'+f.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');}
    else if(f.type==='radio'){input=document.createElement('div');input.className='abRadioGroup';input.dataset.abkey=f.key;input.innerHTML=f.options.map(o=>`<label><input type="radio" name="abr_${esc(f.key)}" value="${esc(o)}"> ${esc(o)}</label>`).join('');}
    else if(f.type==='checkbox'){input=document.createElement('input');input.type='checkbox';input.className='abCheck';}
    else if(f.type==='yesno'){input=document.createElement('select');input.className='abSelect';input.innerHTML='<option value="">— chọn —</option><option value="CÓ">CÓ</option><option value="KHÔNG">KHÔNG</option>';}
    else if(f.type==='attachment'){input=document.createElement('div');input.innerHTML=`<div class="abGrid"><input class="abInput" data-abattachment-url placeholder="Dán link https://www.mediafire.com/..."><input class="abInput" data-abattachment-name placeholder="Tên tài liệu / file"></div><div class="abActions"><button type="button" class="abBtn secondary" data-abmedia>📎 MỞ MEDIAFIRE FILEDROP</button></div>`;input.querySelector('[data-abmedia]').onclick=()=>{try{if(typeof rsOpenMediaFireFileDrop==='function')rsOpenMediaFireFileDrop();else alert('MediaFire FileDrop chưa có trong bản này.');}catch(e){alert(e?.message||e);}};}
    else{input=document.createElement('input');input.className='abInput';input.type=f.type==='number'?'number':f.type==='date'?'date':f.type==='time'?'time':f.type==='datetime'?'datetime-local':'text';if(f.type==='readonly'||f.type==='formula'){input.readOnly=true;input.classList.add('abFormula');}}
    if(f.type!=='radio'&&f.type!=='attachment'){input.dataset.abkey=f.key;input.dataset.abtype=f.type;if(f.placeholder)input.placeholder=f.placeholder;if(f.type==='number'){if(f.min!=='')input.min=f.min;if(f.max!=='')input.max=f.max;}if(f.type==='checkbox')input.checked=['1','TRUE','YES','CÓ'].includes(String(abResolveDefault(f.defaultValue)).toUpperCase());else input.value=abResolveDefault(f.defaultValue);input.addEventListener('input',abRuntimeRecalc);input.addEventListener('change',abRuntimeRecalc);}else if(f.type==='radio'){input.querySelectorAll('input').forEach(x=>{x.addEventListener('change',abRuntimeRecalc);if(x.value===abResolveDefault(f.defaultValue))x.checked=true;});}else{input.querySelectorAll('input').forEach(x=>{x.addEventListener('input',abRuntimeRecalc);x.addEventListener('change',abRuntimeRecalc);});}
    wrap.appendChild(lab);if(f.unit&&f.type!=='checkbox'){const uw=document.createElement('div');uw.className='abUnitWrap';uw.appendChild(input);const u=document.createElement('span');u.className='abUnit';u.textContent=f.unit;uw.appendChild(u);wrap.appendChild(uw);}else wrap.appendChild(input);host.appendChild(wrap);});
}
function abRuntimeValues(){const vals={};if(!abCurrentModule)return vals;abCurrentModule.fields.forEach(f=>{if(f.type==='section')return;const wrap=document.querySelector(`[data-abwrap="${CSS.escape(f.key)}"]`);if(!wrap)return;if(f.type==='radio'){vals[f.key]=wrap.querySelector('input[type="radio"]:checked')?.value||'';}else if(f.type==='attachment'){vals[f.key]={url:String(wrap.querySelector('[data-abattachment-url]')?.value||'').trim(),name:String(wrap.querySelector('[data-abattachment-name]')?.value||'').trim()};}else{const inp=wrap.querySelector('[data-abkey]');vals[f.key]=f.type==='checkbox'?!!inp?.checked:String(inp?.value??'').trim();}});return vals;}
function abSetRuntimeValue(key,val){const f=abCurrentModule?.fields.find(x=>x.key===key),wrap=document.querySelector(`[data-abwrap="${CSS.escape(key)}"]`);if(!f||!wrap)return;if(f.type==='radio'){wrap.querySelectorAll('input[type="radio"]').forEach(x=>x.checked=String(x.value)===String(val));}else if(f.type==='attachment'){wrap.querySelector('[data-abattachment-url]').value=val?.url||'';wrap.querySelector('[data-abattachment-name]').value=val?.name||'';}else{const inp=wrap.querySelector('[data-abkey]');if(!inp)return;if(f.type==='checkbox')inp.checked=!!val;else inp.value=val??'';}}
function abRuntimeRecalc(){
  if(!abCurrentModule)return;let vals=abRuntimeValues();for(const f of abCurrentModule.fields){if(f.type==='formula'){try{const v=abFormula(f.formula,vals);abSetRuntimeValue(f.key,v);vals[f.key]=v;}catch(_){abSetRuntimeValue(f.key,'');vals[f.key]='';}}}
  vals=abRuntimeValues();for(const f of abCurrentModule.fields){if(!f.showWhen?.field)continue;const wrap=document.querySelector(`[data-abwrap="${CSS.escape(f.key)}"]`);if(wrap)wrap.style.display=abCompare(vals[f.showWhen.field],f.showWhen.op,f.showWhen.value)?'':'none';}
  const warnings=[];let blocking=false;abCurrentModule.rules.filter(r=>r.active!==false).forEach(r=>{if(abRuleTriggered(r,vals)){const sig=r.id+'|'+r.message+'|'+JSON.stringify(vals);if(!abDismissedRuleKeys.has(sig))warnings.push({r,sig});if(r.blocking)blocking=true;}});const wh=$('abRuntimeWarnings');wh.innerHTML=warnings.map(x=>{const token=encodeURIComponent(x.sig);return `<div class="abWarn"><button onclick="abDismissRule(decodeURIComponent('${token}'))">ĐÃ BIẾT</button>⚠ ${esc(x.r.name)}<div style="margin-top:4px;font-weight:800">${esc(x.r.message)}</div></div>`;}).join('');const btn=$('abRuntimeSubmit');if(btn&&$('abRuntimeBody')?.dataset.preview!=='1')btn.disabled=blocking||!abCanSubmit(abCurrentModule)||(abCurrentModule.requireFlight&&!abHasFlight());
}
function abDismissRule(sig){abDismissedRuleKeys.add(sig);abRuntimeRecalc();}
function abRuntimeStatus(msg,err=false){const e=$('abRuntimeStatus');if(e){e.textContent=msg;e.classList.toggle('err',!!err);}}
function abValidateRuntime(m,vals){for(const f of m.fields){if(f.type==='section')continue;const wrap=document.querySelector(`[data-abwrap="${CSS.escape(f.key)}"]`);if(wrap&&wrap.style.display==='none')continue;const v=vals[f.key],missing=f.type==='attachment'?!String(v?.url||'').trim():f.type==='checkbox'?!v:String(v??'').trim()==='';if(f.required&&missing)return `Còn thiếu trường bắt buộc: ${f.label}.`;if(f.type==='number'&&String(v).trim()!==''){const n=Number(v);if(f.min!==''&&n<Number(f.min))return `${f.label} phải ≥ ${f.min}.`;if(f.max!==''&&n>Number(f.max))return `${f.label} phải ≤ ${f.max}.`;}}for(const r of m.rules.filter(x=>x.active!==false&&x.blocking)){if(abRuleTriggered(r,vals))return `Đang có cảnh báo CHẶN GỬI: ${r.message}`;}return '';}
async function abSubmitRuntime(){
  if(!abCurrentModule||$('abRuntimeBody')?.dataset.preview==='1')return;const m=abCurrentModule;if(m.requireFlight&&!abHasFlight())return abRuntimeStatus('Chức năng này yêu cầu đang chọn chuyến.',true);if(!abCanSubmit(m))return abRuntimeStatus('Tài khoản này chỉ được xem, không được nhập/gửi.',true);const vals=abRuntimeValues(),err=abValidateRuntime(m,vals);if(err)return abRuntimeStatus(err,true);
  try{abRuntimeStatus('Đang lưu...');const stamp=now(),labels={};m.fields.forEach(f=>labels[f.key]=f.label);let flight={};try{const meta=typeof currentFlightSessionMeta==='function'?currentFlightSessionMeta():null;flight={sessionId:typeof activeFlightSessionId!=='undefined'?String(activeFlightSessionId||''):'',name:String(meta?.name||''),createdAt:Number(meta?.createdAt||0)};}catch(_){ }
    const workflow=(m.workflow||[]).map(abNormalizeStep),wf=workflow.length?{currentIndex:0,status:'PENDING',steps:workflow.map((s,i)=>({...s,done:false,doneAtMs:0,doneBy:null}))}:{currentIndex:-1,status:'COMPLETED',steps:[]};const payload={kind:AB_RECORD_KIND,moduleId:m.id,moduleCode:m.code,moduleName:m.name,configVersion:Number(m.publishVersion||0),values:clone(vals),labels,flight,workflow:wf,createdBy:abActor(),createdAtMs:stamp,updatedAtMs:stamp};const ref=await abDb().collection(HANDOVER_COLLECTION).add(payload);abCurrentRecord={id:ref.id,...payload};abRuntimeStatus(`Đã lưu lúc ${new Date(stamp).toLocaleString('vi-VN')}${workflow.length?' · chờ '+workflow[0].role+' · '+workflow[0].label:''}.`);await abSignalRecord(abCurrentRecord,m);abLoadRecords(m.id);
  }catch(e){abRuntimeStatus('Không lưu được: '+(e?.message||e),true);}
}
async function abSignalRecord(rec,m){try{if(typeof sagsV470Ref!=='function')return;const wf=rec.workflow||{},step=wf.steps?.[wf.currentIndex]||null,eventAtMs=now();await sagsV470Ref(AB_RECORD_SIGNAL_PATH).set({eventId:rec.id+'|'+wf.currentIndex+'|'+eventAtMs,moduleId:m.id,moduleName:m.name,recordId:rec.id,targetRole:step?.role||'',status:wf.status,eventAtMs,sourceRole:abIdentity().role,sourceUser:abIdentity().username});}catch(e){console.info('Admin Builder record signal',e?.message||e);}}
async function abLoadRecords(moduleId){
  const host=$('abRecords');if(!host)return;host.innerHTML='<div class="abMeta">Đang tải bản ghi...</div>';try{const snap=await abDb().collection(HANDOVER_COLLECTION).where('kind','==',AB_RECORD_KIND).where('moduleId','==',moduleId).get(),arr=[];snap.forEach(doc=>arr.push({id:doc.id,...(doc.data()||{})}));arr.sort((a,b)=>Number(b.updatedAtMs||b.createdAtMs||0)-Number(a.updatedAtMs||a.createdAtMs||0));host.innerHTML=`<div class="abRowHead"><div class="abCardTitle">BẢN GHI GẦN ĐÂY</div><button class="abBtn secondary" onclick="abLoadRecords('${esc(moduleId)}')">LÀM MỚI</button></div>${arr.length?arr.slice(0,30).map(r=>abRecordHtml(r)).join(''):'<div class="abHint">Chưa có bản ghi.</div>'}`;}catch(e){host.innerHTML='<div class="abWarn">Không tải được bản ghi: '+esc(e?.message||e)+'</div>';}
}
function abRecordHtml(r){const wf=r.workflow||{},step=wf.steps?.[wf.currentIndex],id=abIdentity(),can=step&&(id.role==='AD'||String(step.role).toUpperCase()===id.role),summary=Object.entries(r.values||{}).slice(0,6).map(([k,v])=>`${esc(r.labels?.[k]||k)}: <b>${esc(typeof v==='object'?(v?.name||v?.url||''):v)}</b>`).join(' · ');return `<div class="abRecordItem"><div class="abRowHead"><b>${esc(r.flight?.name||r.moduleName||'BẢN GHI')} · ${new Date(Number(r.createdAtMs||0)).toLocaleString('vi-VN')}</b><button class="abBtn secondary" onclick='abViewRecord(${JSON.stringify(r.id)})'>XEM</button></div><div class="abRecordValues">${summary}</div><div class="abWorkflow">${wf.status==='COMPLETED'?'✓ HOÀN TẤT':step?`Đang chờ ${esc(step.role)} · ${esc(step.label)}`:'ĐÃ LƯU'}</div>${can&&wf.status!=='COMPLETED'?`<div class="abActions"><button class="abBtn good" onclick='abAdvanceRecord(${JSON.stringify(r.id)})'>${esc(step.action||'XÁC NHẬN')}</button></div>`:''}</div>`;}
async function abViewRecord(id){try{const s=await abDb().collection(HANDOVER_COLLECTION).doc(id).get();if(!s.exists)return;const r={id,...s.data()};abCurrentRecord=r;const vals=r.values||{};Object.entries(vals).forEach(([k,v])=>abSetRuntimeValue(k,v));abRuntimeRecalc();abRuntimeStatus(`Đang xem bản ghi ${new Date(Number(r.createdAtMs||0)).toLocaleString('vi-VN')} · dữ liệu chỉ đọc để đối chiếu.`);document.querySelectorAll('#abRuntimeFields input,#abRuntimeFields textarea,#abRuntimeFields select').forEach(x=>x.disabled=true);if($('abRuntimeSubmit'))$('abRuntimeSubmit').disabled=true;}catch(e){alert(e?.message||e);}}
async function abAdvanceRecord(id){
  try{const ref=abDb().collection(HANDOVER_COLLECTION).doc(id),s=await ref.get();if(!s.exists)return;const r={id,...s.data()},wf=clone(r.workflow||{}),idx=Number(wf.currentIndex||0),step=wf.steps?.[idx],identity=abIdentity();if(!step)return;if(identity.role!=='AD'&&String(step.role).toUpperCase()!==identity.role)return alert('Bước này dành cho '+step.role+'.');wf.steps[idx].done=true;wf.steps[idx].doneAtMs=now();wf.steps[idx].doneBy=abActor();if(idx>=wf.steps.length-1){wf.status='COMPLETED';wf.currentIndex=idx;}else{wf.currentIndex=idx+1;wf.status='PENDING';}await ref.set({workflow:wf,updatedAtMs:now()},{merge:true});r.workflow=wf;const m=(abCatalog.modules||[]).find(x=>x.id===r.moduleId)||abCurrentModule;if(m)await abSignalRecord(r,m);if(abCurrentModule)abLoadRecords(abCurrentModule.id);}catch(e){alert('Không xác nhận được: '+(e?.message||e));}
}

function abPatchRoleUi(){
  try{const base=window.applyRoleUI;if(typeof base==='function'&&!base.__abWrapped){const wrapped=function(...args){const r=base.apply(this,args);setTimeout(()=>abRefreshRoleUi(),0);return r;};wrapped.__abWrapped=true;window.applyRoleUI=wrapped;}}
  catch(e){console.info('Admin Builder patch role UI',e?.message||e);}
}

function abInit(){
  if(abInitialized)return;abInitialized=true;abInjectCss();abEnsureModals();abEnsureAdminButton();abResetEditor();abPatchRoleUi();abRefreshRoleUi();setTimeout(()=>{abLoadCatalog(false);abStartCatalogSignal();},350);
}

Object.assign(window,{abOpenBuilder,abCloseBuilder,abSwitchTab,abAddField,abDeleteField,abMoveField,abFieldChanged,abAddRule,abDeleteRule,abRuleChanged,abAddStep,abDeleteStep,abMoveStep,abStepChanged,abSaveDraft,abPublish,abResetEditor,abSetModuleActive,abDeleteModule,abRefreshBuilderList,abEditModule,abLoadHistory,abRestoreHistory,abOpenRuntimePreview,abOpenModule,abCloseRuntime,abRuntimeReset,abDismissRule,abLoadRecords,abViewRecord,abAdvanceRecord});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(abInit,0));else setTimeout(abInit,0);
})();
