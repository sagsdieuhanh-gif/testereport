/* E-REPORT SAGS · A/C LIMITS AI IMAGE REVIEW · V1.97
 * AI is input assistance only: image -> proposed rows -> AD reviews -> save.
 * Never auto-applies an unread/uncertain row and never auto-deletes CLEAR rows.
 */
(()=>{
'use strict';
const ACL_AI_MODEL='gemini-3.6-flash';
const BUILD='V1.97-20260820-01';
const APP_CHECK_SITE_KEY='6LeJjYotAAAAAELyLTYPzugn_Zn37U5qOz9tHjqV';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normReg=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,'').replace(/^([A-Z]{2})A(?=\d)/,'$1-A');
let aiRows=[];
let previewUrl='';
let aiSdkPromise=null;

function isAdmin(){try{return String(currentRole||currentUserProfile?.role||'').trim().toUpperCase()==='AD'}catch(_){return false}}
function status(t,err=false){const e=$('aclAIStatus');if(e){e.textContent=t||'';e.classList.toggle('err',!!err)}}
function ensureCss(){if($('aclAIStyle'))return;const s=document.createElement('style');s.id='aclAIStyle';s.textContent=`
.aclai-box{border:2px solid #a9c7e4;background:#f3f9ff;border-radius:14px;padding:12px;margin:10px 0}.aclai-title{font:900 15px Arial;color:#173f69;margin-bottom:8px}.aclai-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.aclai-file{max-width:100%;font-weight:800}.aclai-btn{border:0;border-radius:10px;padding:10px 13px;background:#075ea8;color:#fff;font-weight:900}.aclai-btn.good{background:#0a7147}.aclai-btn.secondary{background:#e6edf4;color:#25435e;border:1px solid #c3d0dc}.aclai-preview{display:none;max-width:100%;max-height:280px;margin:9px auto;border-radius:10px;border:1px solid #c9d4de;object-fit:contain;background:#fff}.aclai-status{min-height:20px;margin:7px 0;font-weight:900;color:#17613f}.aclai-status.err{color:#b42318}.aclai-list{display:grid;gap:8px;margin-top:10px}.aclai-row{border:1px solid #cad6e1;background:#fff;border-radius:12px;padding:10px}.aclai-row.warn{border-color:#e0ae56;background:#fffaf0}.aclai-row.clear{border-color:#e0a5a0;background:#fff5f4}.aclai-head{display:flex;gap:8px;align-items:center;justify-content:space-between}.aclai-head-left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.aclai-reg{width:135px;max-width:44vw;border:1px solid #9fb2c4;border-radius:8px;padding:8px;font:900 15px Arial;text-transform:uppercase}.aclai-cat{border:1px solid #9fb2c4;border-radius:8px;padding:8px;font-weight:900}.aclai-conf{font-size:11px;font-weight:900;padding:4px 8px;border-radius:999px;background:#e9f5ec;color:#146338}.aclai-conf.mid{background:#fff1d8;color:#8b5b00}.aclai-conf.low{background:#ffe7e5;color:#a72b22}.aclai-eq{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.aclai-eq label{border:1px solid #bdcbd7;border-radius:999px;padding:6px 10px;font-weight:900}.aclai-text{width:100%;min-height:52px;box-sizing:border-box;border:1px solid #a9b9c7;border-radius:8px;padding:8px;font:700 13px Arial}.aclai-note{font-size:11px;color:#657789;margin-top:5px}.aclai-check{width:20px;height:20px;accent-color:#0871bd}
@media(max-width:620px){.aclai-head{align-items:flex-start;flex-direction:column}.aclai-reg{width:100%;max-width:none}.aclai-cat{width:100%}}
`;document.head.appendChild(s)}
function ensureUi(){
  const panel=$('aclSimplePanel');if(!panel||$('aclAIBox'))return false;ensureCss();
  const anchor=panel.querySelector('.acls-step');
  const d=document.createElement('div');d.id='aclAIBox';d.className='aclai-box';d.innerHTML=`
    <div class="aclai-title">📷 UP ẢNH LIMIT + AI ĐỌC</div>
    <div class="aclai-actions"><input id="aclAIFile" class="aclai-file" type="file" accept="image/jpeg,image/png,image/webp"><button id="aclAIRead" class="aclai-btn" type="button">🤖 AI ĐỌC ẢNH</button><button id="aclAIClear" class="aclai-btn secondary" type="button">XÓA KẾT QUẢ</button></div>
    <img id="aclAIPreview" class="aclai-preview" alt="Ảnh LIMIT">
    <div id="aclAIStatus" class="aclai-status"></div><div id="aclAIList" class="aclai-list"></div>
    <div id="aclAISaveWrap" class="aclai-actions" style="display:none;margin-top:10px"><button id="aclAISave" class="aclai-btn good" type="button">✓ LƯU CÁC DÒNG ĐÃ CHỌN</button></div>
    <div class="aclai-note">AI chỉ đề xuất. AD phải kiểm tra REG / loại LIMIT / nội dung trước khi lưu. Dòng CLEAR không tự xóa LIMIT cũ.</div>`;
  panel.insertBefore(d,anchor||panel.children[1]);
  $('aclAIFile').addEventListener('change',onFile);$('aclAIRead').addEventListener('click',readAI);$('aclAIClear').addEventListener('click',clearAI);$('aclAISave').addEventListener('click',saveSelected);
  return true;
}
function onFile(){const f=$('aclAIFile')?.files?.[0],img=$('aclAIPreview');aiRows=[];renderRows();if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}if(!f){if(img)img.style.display='none';return}previewUrl=URL.createObjectURL(f);if(img){img.src=previewUrl;img.style.display='block'}status(`${f.name} · ${(f.size/1024).toFixed(0)} KB · sẵn sàng AI đọc.`)}
function clearAI(){aiRows=[];renderRows();status('');const f=$('aclAIFile');if(f)f.value='';const img=$('aclAIPreview');if(img)img.style.display='none';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}}
async function filePart(file){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=()=>reject(r.error||new Error('Không đọc được ảnh.'));r.readAsDataURL(file)});return {inlineData:{data,mimeType:file.type||'image/jpeg'}}}
async function sdk(){
  if(aiSdkPromise)return aiSdkPromise;
  aiSdkPromise=(async()=>{
    const [appMod,appCheckMod,aiMod]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app-check.js'),
      import('https://www.gstatic.com/firebasejs/12.1.0/firebase-ai.js')
    ]);
    const opts=window.firebase?.app?.().options;if(!opts?.apiKey||!opts?.projectId||!opts?.appId)throw new Error('Không lấy được Firebase config đầy đủ của SAGS.');
    let app;try{app=appMod.getApp('sags-acl-ai')}catch(_){app=appMod.initializeApp(opts,'sags-acl-ai')}
    let appCheck;
    try{
      appCheck=appCheckMod.initializeAppCheck(app,{
        provider:new appCheckMod.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled:true
      });
    }catch(e){
      // initializeAppCheck chỉ được gọi một lần/app. Nếu module đã được khởi tạo, lấy instance hiện có.
      try{appCheck=appCheckMod.getAppCheck(app)}catch(_){throw e}
    }
    const token=await appCheckMod.getToken(appCheck,false);
    if(!token?.token)throw new Error('Không lấy được Firebase App Check token.');
    const ai=aiMod.getAI(app,{backend:new aiMod.GoogleAIBackend()});
    const model=aiMod.getGenerativeModel(ai,{model:ACL_AI_MODEL,generationConfig:{responseMimeType:'application/json',temperature:0.1}});
    return {model,appCheck};
  })();
  return aiSdkPromise;
}
function prompt(){return `Bạn là trợ lý nhập A/C LIMITS khai thác hàng không. Đọc chính xác bảng trong ảnh, không suy đoán ký tự không nhìn thấy.
Mục tiêu: tách theo A/C REG làm gốc rồi phân loại đúng 3 loại: APU INOP, HOLD INOP, OTHER.
Quy tắc:
1) APU INOP: nếu nội dung yêu cầu GPU/ACU/ASU thì equipment liệt kê đúng các mã xuất hiện.
2) HOLD INOP/ISSUES, cargo/hold inop -> HOLD INOP và giữ nguyên nội dung restriction.
3) Seat inop và mọi hạn chế khác -> OTHER, giữ nguyên nội dung.
4) Nếu một ô có nhiều REG cùng một nội dung, tách thành nhiều item, mỗi REG một item.
5) Dòng CLEAR -> action CLEAR, category OTHER; KHÔNG biến thành cảnh báo.
6) Nếu không chắc REG/nội dung, vẫn trả item nhưng confidence thấp và needsReview=true; không tự bịa.
Chỉ trả JSON hợp lệ, không markdown:
{"documentTitle":"","documentDate":"","version":"","items":[{"reg":"VN-A648","category":"APU INOP","equipment":["GPU","ACU","ASU"],"restriction":"REQ ASU,ACU,GPU","action":"UPSERT","confidence":0.98,"needsReview":false}]}`}
function extractJson(text){text=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a<0||b<a)throw new Error('AI không trả JSON hợp lệ.');return JSON.parse(text.slice(a,b+1))}
function normalizedCategory(v){const s=String(v||'').toUpperCase();if(s.includes('APU'))return 'APU INOP';if(s.includes('HOLD')||s.includes('CARGO'))return 'HOLD INOP';return 'OTHER'}
function normalizeRows(obj){
  const out=[];for(const x of (Array.isArray(obj?.items)?obj.items:[])){
    const reg=normReg(x?.reg||'');if(!reg)continue;const cat=normalizedCategory(x.category),restriction=String(x.restriction||'').trim();const action=String(x.action||'UPSERT').toUpperCase()==='CLEAR'?'CLEAR':'UPSERT';
    const eq=['GPU','ACU','ASU'].filter(k=>(x.equipment||[]).map(v=>String(v).toUpperCase()).includes(k)||new RegExp(`\\b${k}\\b`,'i').test(restriction));const confidence=Math.max(0,Math.min(1,Number(x.confidence||0)));
    out.push({selected:action!=='CLEAR'&&confidence>=.7,reg,category:cat,equipment:eq,restriction,action,confidence,needsReview:!!x.needsReview||confidence<.85});
  }
  return out;
}
async function readAI(){
  if(!isAdmin())return status('Chỉ AD được dùng AI A/C LIMITS.',true);const file=$('aclAIFile')?.files?.[0];if(!file)return status('Chọn ảnh LIMIT trước.',true);if(file.size>10*1024*1024)return status('Ảnh vượt 10 MB.',true);
  const btn=$('aclAIRead');if(btn)btn.disabled=true;status('AI đang đọc REG và phân loại LIMIT...');
  try{const {model}=await sdk(),part=await filePart(file);const result=await model.generateContent([prompt(),part]);const text=result?.response?.text?.()||'';const obj=extractJson(text);aiRows=normalizeRows(obj);renderRows();status(aiRows.length?`✓ AI đọc được ${aiRows.length} dòng. Kiểm tra rồi mới LƯU.`:'AI chưa đọc được dòng LIMIT nào.',!aiRows.length)}catch(e){aiSdkPromise=null;status('AI đọc ảnh lỗi: '+String(e?.message||e),true)}finally{if(btn)btn.disabled=false}
}
function confClass(c){return c>=.9?'':c>=.7?'mid':'low'}
function renderRows(){const h=$('aclAIList'),w=$('aclAISaveWrap');if(!h)return;h.innerHTML=aiRows.map((x,i)=>`<div class="aclai-row ${x.action==='CLEAR'?'clear':x.needsReview?'warn':''}" data-i="${i}"><div class="aclai-head"><div class="aclai-head-left"><input class="aclai-check" type="checkbox" data-k="selected" ${x.selected?'checked':''} ${x.action==='CLEAR'?'disabled':''}><input class="aclai-reg" data-k="reg" value="${esc(x.reg)}"><select class="aclai-cat" data-k="category"><option ${x.category==='APU INOP'?'selected':''}>APU INOP</option><option ${x.category==='HOLD INOP'?'selected':''}>HOLD INOP</option><option ${x.category==='OTHER'?'selected':''}>OTHER</option></select></div><span class="aclai-conf ${confClass(x.confidence)}">${x.action==='CLEAR'?'CLEAR':Math.round(x.confidence*100)+'%'}</span></div><div class="aclai-eq" style="${x.category==='APU INOP'?'':'display:none'}"><label><input type="checkbox" data-eq="GPU" ${x.equipment.includes('GPU')?'checked':''}> GPU</label><label><input type="checkbox" data-eq="ACU" ${x.equipment.includes('ACU')?'checked':''}> ACU</label><label><input type="checkbox" data-eq="ASU" ${x.equipment.includes('ASU')?'checked':''}> ASU</label></div><textarea class="aclai-text" data-k="restriction">${esc(x.restriction)}</textarea>${x.action==='CLEAR'?'<div class="aclai-note"><b>CLEAR:</b> không được AI tự xóa. AD kiểm tra LIMIT cũ rồi tự tắt/xóa nếu đúng.</div>':x.needsReview?'<div class="aclai-note"><b>⚠ CẦN KIỂM TRA:</b> độ tin cậy chưa cao.</div>':''}</div>`).join('');if(w)w.style.display=aiRows.some(x=>x.action!=='CLEAR')?'flex':'none';
  h.querySelectorAll('.aclai-row').forEach(row=>{const i=Number(row.dataset.i);row.addEventListener('input',ev=>{const k=ev.target.dataset.k;if(k){aiRows[i][k]=k==='selected'?!!ev.target.checked:ev.target.value;if(k==='category')renderRows()}const eq=ev.target.dataset.eq;if(eq){const set=new Set(aiRows[i].equipment);ev.target.checked?set.add(eq):set.delete(eq);aiRows[i].equipment=[...set]}})})
}
function setSimple(row){
  const reg=$('aclSReg');if(reg)reg.value=row.reg;['aclSApu','aclSEqGPU','aclSEqACU','aclSEqASU','aclSHold','aclSOther'].forEach(id=>{if($(id))$(id).checked=false});if($('aclSHoldText'))$('aclSHoldText').value='';if($('aclSOtherText'))$('aclSOtherText').value='';
  if(row.category==='APU INOP'){if($('aclSApu'))$('aclSApu').checked=true;for(const eq of row.equipment){const e=$('aclSEq'+eq);if(e)e.checked=true}}
  else if(row.category==='HOLD INOP'){if($('aclSHold'))$('aclSHold').checked=true;if($('aclSHoldText'))$('aclSHoldText').value=row.restriction||'HOLD INOP'}
  else {if($('aclSOther'))$('aclSOther').checked=true;if($('aclSOtherText'))$('aclSOtherText').value=row.restriction||'OTHER'}
  reg?.dispatchEvent(new Event('input',{bubbles:true}));['aclSApu','aclSHold','aclSOther'].forEach(id=>$(id)?.dispatchEvent(new Event('change',{bubbles:true})));
}
async function saveSelected(){
  const rows=aiRows.filter(x=>x.selected&&x.action!=='CLEAR');if(!rows.length)return status('Chưa tích dòng nào để lưu.',true);const btn=$('aclAISave');if(btn)btn.disabled=true;let ok=0;
  try{for(const r of rows){if(!r.reg||!r.restriction&&r.category!=='APU INOP')continue;setSimple(r);await window.aclSimpleSave?.();if($('aclSStatus')?.classList.contains('err'))throw new Error($('aclSStatus')?.textContent||('Không lưu được '+r.reg));ok++;}status(`✓ Đã chuyển ${ok} dòng AI đã duyệt vào A/C LIMITS. Kiểm tra danh sách đang lưu bên dưới.`);try{await window.ACLSimple?.refresh?.()}catch(_){}}finally{if(btn)btn.disabled=false}
}
function patchHelp(){const p=$('aclSimplePanel');if(!p||p.dataset.aiHelpV197)return;p.dataset.aiHelpV197='1';const details=[...p.querySelectorAll('details.acls-help')].pop();if(details){const li=document.createElement('div');li.className='aclai-note';li.innerHTML='<b>V1.99:</b> AI LIMITS dùng Firebase App Check + reCAPTCHA Enterprise và model <b>gemini-3.6-flash</b>. Token được lấy trước khi gọi AI và tự refresh; AI vẫn chỉ đề xuất, AD phải kiểm tra trước khi lưu; CLEAR không tự xóa.';details.appendChild(li)}}
function install(){if(ensureUi())patchHelp();else if(!$('aclAIBox'))setTimeout(install,350)}
function hookSimpleOpen(){
  try{
    const api=window.ACLSimple;
    if(api&&typeof api.open==='function'&&!api.open.__aclAIHook){
      const original=api.open;
      const wrapped=async function(){const r=await original.apply(this,arguments);ensureUi();patchHelp();return r};
      wrapped.__aclAIHook=true;api.open=wrapped;window.aclSimpleOpen=wrapped;
      const b=$('roleBtnAcLimits');if(b)b.onclick=e=>{e?.preventDefault?.();wrapped();return false};
    }
  }catch(_){}
  if(!$('aclAIBox'))setTimeout(hookSimpleOpen,500);
}
window.ACL_AI_MODEL=ACL_AI_MODEL;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();hookSimpleOpen()},{once:true});else setTimeout(()=>{install();hookSimpleOpen()},0);
window.ACLLimitAI={build:BUILD,read:readAI,clear:clearAI};
})();
