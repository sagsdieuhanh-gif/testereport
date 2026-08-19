/* E-REPORT SAGS · BBBT QUICK ENTRY
 * V1.85 · 2026-08-19
 * Adds a glove-friendly quick-entry layer for the existing F/SAGS-CXR/56 BBBT.
 * It does NOT create a new form and does NOT change PDF rendering.
 */
(function(){
  'use strict';

  const BUILD='V1.85-20260819-02';
  const BUTTON_ID='bbbtQuickEntryBtn';
  const MODAL_ID='bbbtQuickEntryModal';
  const STYLE_ID='bbbtQuickEntryStyle';
  const RELEASE_ID='bbbtQuickEntryReleaseNote';
  const GUIDE_ID='bbbtQuickEntryGuide';

  const BOOL_KEYS=[
    'bbbtFoundSorting','bbbtFoundParking','bbbtFoundOther',
    'bbbtBaggage','bbbtCargo','bbbtMail','bbbtULD',
    'bbbtBrokenHandle','bbbtMissingWheel','bbbtDented','bbbtWet',
    'bbbtTorn','bbbtScratched','bbbtLeaking','bbbtDamageOther',
    'bbbtFoundOffload','bbbtFoundLoading','bbbtFoundUnidentified','bbbtFoundWhileOther',
    'bbbtReportRep','bbbtTakePicture','bbbtTape','bbbtHandover','bbbtHandlingOther'
  ];

  const TEXT_KEYS=[
    'bbbtReportAt','bbbtFoundOtherText',
    'bbbtPerson1','bbbtDuty1','bbbtPerson2','bbbtDuty2','bbbtPerson3','bbbtDuty3',
    'bbbtDamageOtherText','bbbtDetail','bbbtFoundWhileOtherText',
    'bbbtHandlingOtherText','bbbtComment'
  ];

  let draft={};
  let morePeople=false;

  function appState(){
    try{return (typeof state!=='undefined' && state) ? state : null;}catch(_){return null;}
  }

  function roleCode(){
    try{return String(typeof currentRole!=='undefined' ? currentRole : '').trim().toUpperCase();}catch(_){return '';}
  }

  function canUse(){
    const role=roleCode();
    if(!role || role==='VIEWER') return false;
    try{
      if(typeof v485Can==='function') return !!v485Can('BBBT');
    }catch(_){ }
    return true;
  }

  function h(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function normalizeTime(v){
    const raw=String(v||'').trim().replace(/\s/g,'');
    if(!raw) return '';
    let hh='',mm='';
    if(/^\d{4}$/.test(raw)){hh=raw.slice(0,2);mm=raw.slice(2);}
    else if(/^\d{1,2}:\d{2}$/.test(raw)){const p=raw.split(':');hh=p[0].padStart(2,'0');mm=p[1];}
    else return null;
    const H=Number(hh),M=Number(mm);
    if(H<0||H>23||M<0||M>59) return null;
    return hh+':'+mm;
  }

  function nowTime(){
    const d=new Date();
    return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }

  function cloneDraft(){
    const s=appState();
    if(!s) return false;
    draft={};
    for(const k of BOOL_KEYS) draft[k]=!!s[k];
    for(const k of TEXT_KEYS) draft[k]=String(s[k]??'');
    morePeople=!!(draft.bbbtPerson2||draft.bbbtDuty2||draft.bbbtPerson3||draft.bbbtDuty3);
    return true;
  }

  function setDraft(key,value){draft[key]=value;}

  function metaHtml(){
    const s=appState()||{};
    const cells=[
      ['FLIGHT',s.bbbtFlight],['REG',s.bbbtRegn],['TYPE',s.bbbtAcType],
      ['DATE',s.bbbtDateText],['ROUTE',s.bbbtRoute]
    ];
    return `<div class="bq-meta">${cells.map(([l,v])=>`<div><small>${h(l)}</small><strong>${h(v||'—')}</strong></div>`).join('')}</div>`;
  }

  function toggleGroup(title,items,cls=''){
    return `<section class="bq-section ${cls}"><h3>${h(title)}</h3><div class="bq-chip-grid">${items.map(it=>`<button type="button" class="bq-chip ${draft[it[0]]?'on':''}" data-bq-toggle="${h(it[0])}" aria-pressed="${draft[it[0]]?'true':'false'}">${h(it[1])}</button>`).join('')}</div></section>`;
  }

  function textField(key,label,placeholder='',opts={}){
    const tag=opts.multiline?'textarea':'input';
    const value=h(draft[key]||'');
    return `<label class="bq-field ${opts.className||''}"><span>${h(label)}</span>${tag==='textarea'
      ? `<textarea data-bq-input="${h(key)}" rows="${opts.rows||3}" placeholder="${h(placeholder)}">${value}</textarea>`
      : `<input data-bq-input="${h(key)}" value="${value}" placeholder="${h(placeholder)}" ${opts.inputmode?`inputmode="${h(opts.inputmode)}"`:''}>`}</label>`;
  }

  function render(){
    const modal=document.getElementById(MODAL_ID);
    if(!modal) return;
    const body=modal.querySelector('.bq-body');
    if(!body) return;

    body.innerHTML=`
      ${metaHtml()}
      <section class="bq-section bq-time-section">
        <h3>GIỜ LẬP BBBT</h3>
        <div class="bq-time-row">
          <input id="bqReportAt" inputmode="numeric" maxlength="5" value="${h(draft.bbbtReportAt||'')}" placeholder="HHMM">
          <button type="button" class="bq-now" data-bq-now>🕐 BÂY GIỜ</button>
        </div>
      </section>

      ${toggleGroup('1 · PHÁT HIỆN TẠI',[
        ['bbbtFoundSorting','SORTING AREA'],['bbbtFoundParking','PARKING BAY'],['bbbtFoundOther','OTHER']
      ])}
      <div class="bq-conditional ${draft.bbbtFoundOther?'show':''}" data-bq-cond="bbbtFoundOther">
        ${textField('bbbtFoundOtherText','Vị trí khác','Nhập vị trí…')}
      </div>

      <section class="bq-section">
        <h3>2 · NGƯỜI LẬP / DUTY</h3>
        <div class="bq-two">${textField('bbbtPerson1','Person 1','Họ tên')}${textField('bbbtDuty1','Duty 1','Nhiệm vụ')}</div>
        <button type="button" class="bq-secondary-wide" data-bq-more>${morePeople?'THU GỌN':'＋ THÊM NGƯỜI'}</button>
        <div class="bq-more ${morePeople?'show':''}">
          <div class="bq-two">${textField('bbbtPerson2','Person 2','Họ tên')}${textField('bbbtDuty2','Duty 2','Nhiệm vụ')}</div>
          <div class="bq-two">${textField('bbbtPerson3','Person 3','Họ tên')}${textField('bbbtDuty3','Duty 3','Nhiệm vụ')}</div>
        </div>
      </section>

      ${toggleGroup('3 · ĐỐI TƯỢNG',[
        ['bbbtBaggage','BAGGAGE'],['bbbtCargo','CARGO'],['bbbtMail','MAIL'],['bbbtULD','ULD']
      ])}

      ${toggleGroup('4 · DẠNG HƯ HỎNG',[
        ['bbbtBrokenHandle','BROKEN HANDLE / ZIPPER'],['bbbtMissingWheel','MISSING WHEEL'],
        ['bbbtDented','DENTED'],['bbbtWet','WET'],['bbbtTorn','TORN'],['bbbtScratched','SCRATCHED'],
        ['bbbtLeaking','LEAKING'],['bbbtDamageOther','OTHER']
      ],'bq-damage')}
      <div class="bq-conditional ${draft.bbbtDamageOther?'show':''}" data-bq-cond="bbbtDamageOther">
        ${textField('bbbtDamageOtherText','Hư hỏng khác','Mô tả ngắn…',{multiline:true,rows:2})}
      </div>

      <section class="bq-section">
        <h3>5 · CHI TIẾT BẤT THƯỜNG</h3>
        ${textField('bbbtDetail','Detail of irregularity','Mô tả tình trạng thực tế…',{multiline:true,rows:4})}
      </section>

      ${toggleGroup('6 · PHÁT HIỆN TRONG LÚC',[
        ['bbbtFoundOffload','OFF-LOADING'],['bbbtFoundLoading','LOADING'],
        ['bbbtFoundUnidentified','UNIDENTIFIED'],['bbbtFoundWhileOther','OTHER']
      ])}
      <div class="bq-conditional ${draft.bbbtFoundWhileOther?'show':''}" data-bq-cond="bbbtFoundWhileOther">
        ${textField('bbbtFoundWhileOtherText','Trường hợp khác','Nhập nội dung…')}
      </div>

      ${toggleGroup('7 · XỬ LÝ BAN ĐẦU',[
        ['bbbtReportRep','REPORT AIRLINES REP'],['bbbtTakePicture','TAKE PICTURE & SEND REP'],
        ['bbbtTape','CELLOPHANE TAPE'],['bbbtHandover','HAND-OVER LnF / CARGO'],['bbbtHandlingOther','OTHER']
      ],'bq-handling')}
      <div class="bq-conditional ${draft.bbbtHandlingOther?'show':''}" data-bq-cond="bbbtHandlingOther">
        ${textField('bbbtHandlingOtherText','Xử lý khác','Nhập xử lý…')}
      </div>

      <section class="bq-section">
        <h3>8 · COMMENT</h3>
        ${textField('bbbtComment','Comment','Ghi chú nếu có…',{multiline:true,rows:3})}
      </section>

      <section class="bq-guide" id="${GUIDE_ID}">
        <strong>HDSD NHẬP NHANH BBBT</strong>
        <p>Chọn các nút lớn theo tình trạng thực tế → nhập phần chữ cần thiết → bấm <b>CẬP NHẬT BBBT</b> một lần. Dữ liệu được ghi vào đúng F/SAGS-CXR/56 hiện tại. Chữ ký vẫn thực hiện trực tiếp trên tờ BBBT.</p>
      </section>
    `;
  }

  function syncInputToDraft(el){
    const key=el?.dataset?.bqInput;
    if(key) draft[key]=el.value;
  }

  function refreshConditional(){
    document.querySelectorAll(`#${MODAL_ID} [data-bq-cond]`).forEach(el=>{
      el.classList.toggle('show',!!draft[el.dataset.bqCond]);
    });
  }

  function save(){
    const s=appState();
    if(!s){alert('Không đọc được dữ liệu BBBT hiện tại.');return;}
    document.querySelectorAll(`#${MODAL_ID} [data-bq-input]`).forEach(syncInputToDraft);
    const report=document.getElementById('bqReportAt');
    if(report) draft.bbbtReportAt=report.value;
    const nt=normalizeTime(draft.bbbtReportAt);
    if(draft.bbbtReportAt && nt===null){
      alert('Giờ lập BBBT không hợp lệ. Nhập 4 số HHMM, ví dụ 1524.');
      try{report?.focus();}catch(_){ }
      return;
    }
    draft.bbbtReportAt=nt||'';

    for(const k of BOOL_KEYS) s[k]=!!draft[k];
    for(const k of TEXT_KEYS) s[k]=String(draft[k]??'').trim();

    try{if(typeof persist==='function') persist();}catch(e){console.warn('[BBBT QUICK] persist',e);}
    try{if(typeof draw==='function') draw();}catch(e){console.warn('[BBBT QUICK] draw',e);}
    close();
    toast('✓ Đã cập nhật BBBT');
  }

  function open(){
    if(!canUse()){
      try{if(typeof roleDenied==='function') return roleDenied('Tài khoản chưa được cấp quyền BBBT.');}catch(_){ }
      alert('Tài khoản chưa được cấp quyền BBBT.');return;
    }
    if(!cloneDraft()){alert('Chưa sẵn sàng dữ liệu BBBT.');return;}
    render();
    const modal=document.getElementById(MODAL_ID);
    if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false');}
  }

  function close(){
    const modal=document.getElementById(MODAL_ID);
    if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true');}
  }

  function toast(msg){
    let el=document.getElementById('bbbtQuickToast');
    if(!el){el=document.createElement('div');el.id='bbbtQuickToast';el.className='bq-toast';document.body.appendChild(el);}
    el.textContent=msg;el.classList.add('show');
    clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1800);
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const st=document.createElement('style');st.id=STYLE_ID;
    st.textContent=`
#${BUTTON_ID}{background:#0b5cab!important;color:#fff!important;font-weight:900!important;white-space:nowrap!important}
#${MODAL_ID}{position:fixed;inset:0;z-index:26050;background:#0a1421;display:none;flex-direction:column;color:#eef5fb;font-family:Arial,sans-serif;overscroll-behavior:contain}
#${MODAL_ID}.show{display:flex}
#${MODAL_ID} .bq-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));background:#102336;border-bottom:1px solid #28445f}
#${MODAL_ID} .bq-head h2{font-size:20px;line-height:1.05;margin:0;font-weight:900;letter-spacing:.2px}
#${MODAL_ID} .bq-close{min-width:76px;min-height:50px;border:0;border-radius:10px;background:#334a5e;color:#fff;font:900 15px Arial;touch-action:manipulation}
#${MODAL_ID} .bq-body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px max(12px,env(safe-area-inset-right)) 110px max(12px,env(safe-area-inset-left))}
#${MODAL_ID} .bq-meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:10px}
#${MODAL_ID} .bq-meta>div{min-width:0;background:#162c40;padding:8px 6px;border-radius:8px;text-align:center}
#${MODAL_ID} .bq-meta small{display:block;color:#91a8bb;font-size:9px;font-weight:800;margin-bottom:3px}
#${MODAL_ID} .bq-meta strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${MODAL_ID} .bq-section{margin:0 0 13px;padding:0;border:0}
#${MODAL_ID} .bq-section h3{margin:0 0 7px;color:#c8dae8;font-size:13px;letter-spacing:.6px;font-weight:900}
#${MODAL_ID} .bq-chip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
#${MODAL_ID} .bq-chip{min-height:60px;border:0;border-radius:10px;padding:8px 6px;background:#1d3449;color:#eef5fb;font:900 14px/1.15 Arial;touch-action:manipulation;box-shadow:inset 0 0 0 1px #36536e}
#${MODAL_ID} .bq-chip.on{background:#0d6d63;box-shadow:inset 0 0 0 2px #6fe0ce;color:#fff}
#${MODAL_ID} .bq-damage .bq-chip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
#${MODAL_ID} .bq-field{display:block;margin:0 0 8px}
#${MODAL_ID} .bq-field>span{display:block;margin:0 0 4px;color:#a9bdcc;font-size:12px;font-weight:800}
#${MODAL_ID} input,#${MODAL_ID} textarea{width:100%;border:1px solid #39566e;border-radius:10px;background:#14283a;color:#fff;font:800 17px Arial;padding:12px;outline:none;box-sizing:border-box;-webkit-appearance:none}
#${MODAL_ID} input{min-height:54px}
#${MODAL_ID} textarea{min-height:82px;resize:vertical;line-height:1.3}
#${MODAL_ID} input:focus,#${MODAL_ID} textarea:focus{border-color:#61c5ff;box-shadow:0 0 0 2px rgba(97,197,255,.18)}
#${MODAL_ID} .bq-two{display:grid;grid-template-columns:1.2fr .8fr;gap:7px}
#${MODAL_ID} .bq-time-row{display:grid;grid-template-columns:1fr 1.25fr;gap:7px}
#${MODAL_ID} .bq-time-row input{text-align:center;font-size:24px;font-variant-numeric:tabular-nums}
#${MODAL_ID} .bq-now,#${MODAL_ID} .bq-secondary-wide{min-height:56px;border:0;border-radius:10px;background:#28506e;color:#fff;font:900 15px Arial;touch-action:manipulation}
#${MODAL_ID} .bq-secondary-wide{width:100%;margin:0 0 8px;background:#263d51}
#${MODAL_ID} .bq-more{display:none}.bq-more.show{display:block}
#${MODAL_ID} .bq-conditional{display:none;margin:-5px 0 12px;padding:8px 8px 0;background:#10263a;border-radius:10px}.bq-conditional.show{display:block}
#${MODAL_ID} .bq-guide{margin-top:16px;padding:12px;border-radius:10px;background:#10263a;color:#c7d9e7;font-size:13px;line-height:1.4}
#${MODAL_ID} .bq-guide strong{display:block;color:#fff;margin-bottom:5px}#${MODAL_ID} .bq-guide p{margin:0}
#${MODAL_ID} .bq-foot{position:fixed;left:0;right:0;bottom:0;z-index:1;padding:8px max(12px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:linear-gradient(to top,#0a1421 78%,rgba(10,20,33,.88));display:grid;grid-template-columns:.8fr 1.8fr;gap:8px}
#${MODAL_ID} .bq-foot button{min-height:60px;border:0;border-radius:11px;font:900 16px Arial;touch-action:manipulation}
#${MODAL_ID} .bq-cancel{background:#334a5e;color:#fff}#${MODAL_ID} .bq-save{background:#137333;color:#fff}
.bq-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translate(-50%,20px);z-index:27000;background:#137333;color:#fff;padding:11px 18px;border-radius:999px;font:900 14px Arial;opacity:0;pointer-events:none;transition:.18s}.bq-toast.show{opacity:1;transform:translate(-50%,0)}
@media(max-width:390px){#${MODAL_ID} .bq-meta{grid-template-columns:repeat(3,minmax(0,1fr))}#${MODAL_ID} .bq-chip{min-height:58px;font-size:13px}#${MODAL_ID} .bq-two{grid-template-columns:1fr}#${MODAL_ID} .bq-head h2{font-size:18px}}
@media(min-width:700px){#${MODAL_ID} .bq-body{width:min(760px,100%);margin:0 auto}#${MODAL_ID} .bq-chip-grid{grid-template-columns:repeat(3,minmax(0,1fr))}#${MODAL_ID} .bq-damage .bq-chip-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media print{#${MODAL_ID},#${BUTTON_ID},.bq-toast{display:none!important}}
`;
    document.head.appendChild(st);
  }

  function ensureModal(){
    if(document.getElementById(MODAL_ID)) return;
    const modal=document.createElement('div');
    modal.id=MODAL_ID;modal.setAttribute('aria-hidden','true');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML=`<div class="bq-head"><h2>Nhập nhanh BBBT</h2><button type="button" class="bq-close" data-bq-close>ĐÓNG</button></div><div class="bq-body"></div><div class="bq-foot"><button type="button" class="bq-cancel" data-bq-close>ĐÓNG</button><button type="button" class="bq-save" data-bq-save>CẬP NHẬT BBBT</button></div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click',ev=>{
      const btn=ev.target.closest('button');
      if(!btn) return;
      if(btn.hasAttribute('data-bq-close')){close();return;}
      if(btn.hasAttribute('data-bq-save')){save();return;}
      if(btn.hasAttribute('data-bq-now')){
        draft.bbbtReportAt=nowTime();
        const el=document.getElementById('bqReportAt');if(el)el.value=draft.bbbtReportAt;
        return;
      }
      if(btn.hasAttribute('data-bq-more')){morePeople=!morePeople;render();return;}
      const key=btn.dataset.bqToggle;
      if(key){
        draft[key]=!draft[key];
        btn.classList.toggle('on',!!draft[key]);
        btn.setAttribute('aria-pressed',draft[key]?'true':'false');
        refreshConditional();
      }
    });
    modal.addEventListener('input',ev=>{
      if(ev.target?.matches?.('[data-bq-input]')) syncInputToDraft(ev.target);
      if(ev.target?.id==='bqReportAt') draft.bbbtReportAt=ev.target.value;
    });
  }

  function buttonVisible(){return canUse();}

  function ensureButton(){
    const row=document.querySelector('.toolbar-row.main-actions');
    if(!row) return false;
    let btn=document.getElementById(BUTTON_ID);
    if(!btn){
      btn=document.createElement('button');btn.id=BUTTON_ID;btn.type='button';btn.textContent='Nhập nhanh BBBT';btn.addEventListener('click',open);
      const manual=document.getElementById('roleBtnManualBBBT');
      if(manual?.parentNode===row) manual.insertAdjacentElement('afterend',btn);
      else {
        const quick=document.getElementById('roleBtnQuickTime');
        if(quick?.parentNode===row) quick.insertAdjacentElement('afterend',btn); else row.appendChild(btn);
      }
    }
    btn.style.display=buttonVisible()?'':'none';
    return true;
  }

  function injectReleaseNote(){
    if(document.getElementById(RELEASE_ID)) return;
    const panel=document.querySelector('#updateInfoModal > div');
    if(!panel) return;
    const note=document.createElement('div');note.id=RELEASE_ID;
    note.innerHTML=`<p style="margin:10px 0 4px"><b>V1.85 AI · 19/08/2026 — NHẬP NHANH BBBT CHO GĂNG TAY</b></p><p style="margin:4px 0">• Thêm nút <b>Nhập nhanh BBBT</b> dùng vùng chạm lớn, tối ưu thao tác ngoài hiện trường khi đeo găng tay.</p><p style="margin:4px 0">• Các lựa chọn map trực tiếp vào <b>F/SAGS-CXR/56</b> hiện có; không tạo biểu mẫu mới và không thay đổi PDF.</p><p style="margin:4px 0">• Dữ liệu chỉ chốt khi bấm <b>CẬP NHẬT BBBT</b>; phần chữ ký tiếp tục thực hiện trực tiếp trên tờ BBBT.</p>`;
    panel.insertBefore(note,panel.firstChild);
  }

  function injectUserGuide(){
    const host=document.getElementById('roleGuideContent');
    if(!host || host.querySelector('[data-bbbt-quick-guide]')) return;
    const guide=document.createElement('div');guide.setAttribute('data-bbbt-quick-guide','1');
    guide.style.cssText='margin-top:14px;padding:12px;border:1px solid #ccd8e3;border-radius:10px;background:#f7fbff;color:#123;line-height:1.45';
    guide.innerHTML='<b>NHẬP NHANH BBBT</b><br>Trong thanh chức năng chọn <b>Nhập nhanh BBBT</b> → bấm các nút lớn theo tình trạng thực tế → nhập phần mô tả cần thiết → bấm <b>CẬP NHẬT BBBT</b>. Dữ liệu được điền vào đúng F/SAGS-CXR/56 đang sử dụng. Chữ ký thực hiện trên tờ BBBT.';
    host.appendChild(guide);
  }

  function hookRoleUi(){
    try{
      const base=window.applyRoleUI;
      if(typeof base!=='function' || base.__bbbtQuickWrapped) return;
      const wrapped=function(){
        const out=base.apply(this,arguments);
        setTimeout(()=>{try{ensureButton();}catch(_){ }},0);
        return out;
      };
      wrapped.__bbbtQuickWrapped=true;
      window.applyRoleUI=wrapped;
    }catch(_){ }
  }

  function init(){
    ensureStyle();ensureModal();ensureButton();injectReleaseNote();injectUserGuide();hookRoleUi();
    const obs=new MutationObserver(()=>{ensureButton();injectReleaseNote();injectUserGuide();hookRoleUi();});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>{ensureButton();hookRoleUi();},800);
    setTimeout(()=>{ensureButton();hookRoleUi();},2500);
    window.BBBTQuickEntry={build:BUILD,open,close,refresh:()=>{ensureButton();injectUserGuide();}};
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
