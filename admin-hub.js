/* E-REPORT SAGS · ADMIN HUB V2.5
 * One AD entry: operations / people-config / monitoring-dossier.
 * DAILY ROSTER is one-step: select file => create/update flights + assignments.
 * No MutationObserver / setInterval / polling / RTDB listeners.
 */
(function(root){
  'use strict';
  const BUILD='V2.5-20260820-02';
  const S=v=>String(v??'').trim();
  const esc=v=>S(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function isAD(){
    try{const x=root.__sagsGetSession?.();if(x?.isAD||S(x?.role).toUpperCase()==='AD')return true;}catch(_e){}
    try{if(document?.body?.classList?.contains('role-admin'))return true;}catch(_e){}
    try{if(typeof currentRole!=='undefined'&&S(currentRole).toUpperCase()==='AD')return true;}catch(_e){}
    return false;
  }
  function ensureStyle(){
    if(document.getElementById('ah25Style'))return;
    const st=document.createElement('style');st.id='ah25Style';st.textContent=`
      #roleBtnAdminHubV25{display:none!important;background:#123f6b!important;color:#fff!important}
      body.role-admin #roleBtnAdminHubV25{display:inline-flex!important;align-items:center;justify-content:center}
      body.role-admin #roleBtnFlightManageV21,body.role-admin #roleBtnDailyRoster,body.role-admin #roleBtnFlightCreateV2{display:none!important}
      #ah25Modal{display:none;position:fixed;inset:0;z-index:18150;background:rgba(0,0,0,.56);align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font-family:Arial,sans-serif}
      #ah25Modal.show{display:flex}.ah25Panel{width:min(96vw,900px);max-height:93vh;overflow:auto;background:#f7fafc;border-radius:16px;padding:15px;box-shadow:0 18px 48px rgba(0,0,0,.32)}
      .ah25Head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ah25Head h3{margin:0;color:#0b4f91}.ah25Sub{font-size:12px;color:#607384;line-height:1.45;margin-top:5px}.ah25Close,.ah25Btn{border:0;border-radius:9px;padding:10px 12px;font-weight:900;cursor:pointer}.ah25Close{background:#e9eef2;color:#345}.ah25Btn{background:#0b67b2;color:#fff}.ah25Btn.gray{background:#e8eef4;color:#28465f}.ah25Btn.green{background:#177245}.ah25Btn.small{padding:8px 10px;font-size:12px}
      .ah25Grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.ah25Card{background:#fff;border:1px solid #d5e0e9;border-radius:13px;padding:12px}.ah25Card h4{margin:0 0 6px;color:#174b72}.ah25Meta{font-size:12px;color:#647889;line-height:1.4}.ah25Section{display:none;margin-top:12px;background:#fff;border:1px solid #d5e0e9;border-radius:13px;padding:12px}.ah25Section.show{display:block}.ah25Actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .ah25Roster{border:2px dashed #9fc0d8;border-radius:13px;padding:16px;text-align:center;background:#f7fbff;margin-top:8px}.ah25Status{margin-top:9px;padding:9px 10px;border-radius:9px;background:#eef6ff;color:#345;font-size:12px;white-space:pre-wrap;text-align:left;line-height:1.45}.ah25Status.ok{background:#eaf7ef;color:#176b32}.ah25Status.err{background:#fff0f0;color:#9b1c1c}
      @media(max-width:720px){.ah25Grid{grid-template-columns:1fr}.ah25Panel{padding:11px}.ah25Btn{flex:1}}
    `;document.head.appendChild(st);
  }
  function ensureUI(){
    ensureStyle();
    if(!document.getElementById('ah25Modal')){
      const m=document.createElement('div');m.id='ah25Modal';m.innerHTML=`<div class="ah25Panel"><div class="ah25Head"><div><h3>⚙ QUẢN LÝ · V2.5</h3><div class="ah25Sub">Một nơi quản trị chung. VẬN HÀNH CHUYẾN dùng DAILY ROSTER một bước; chọn file là tự tạo/cập nhật chuyến và phân công.</div></div><button class="ah25Close" onclick="sagsAdminHubClose()">ĐÓNG</button></div>
      <div class="ah25Grid"><div class="ah25Card"><h4>✈ VẬN HÀNH CHUYẾN</h4><div class="ah25Meta">DAILY ROSTER · chuyến hôm nay · rotation · chuyến lẻ.</div><div class="ah25Actions"><button class="ah25Btn" onclick="sagsAdminHubSection('OPS')">MỞ</button></div></div><div class="ah25Card"><h4>👥 NHÂN SỰ & CẤU HÌNH</h4><div class="ah25Meta">Tài khoản · quyền · cấu hình nghiệp vụ hiện có.</div><div class="ah25Actions"><button class="ah25Btn" onclick="sagsAdminHubSection('PEOPLE')">MỞ</button></div></div><div class="ah25Card"><h4>🛡 GIÁM SÁT & HỒ SƠ</h4><div class="ah25Meta">Hồ sơ chuyến · nhật ký · phê duyệt quyền xem.</div><div class="ah25Actions"><button class="ah25Btn" onclick="sagsAdminHubSection('MON')">MỞ</button></div></div></div>
      <div id="ah25OPS" class="ah25Section"><h4>✈ VẬN HÀNH CHUYẾN</h4><div class="ah25Roster"><b>DAILY ROSTER</b><div class="ah25Meta" style="margin:6px 0 10px">Chọn .xlsx / .xlsm / .csv → hệ thống tự tạo/cập nhật LEG, rotation, assignment và biểu mẫu liên quan.</div><button class="ah25Btn green" onclick="document.getElementById('ah25RosterFile').click()">📋 CHỌN FILE DAILY ROSTER</button><input id="ah25RosterFile" type="file" accept=".xlsx,.xlsm,.csv" style="display:none" onchange="sagsAdminHubRoster(this)"><div id="ah25RosterStatus" class="ah25Status">Chưa chọn file.</div></div><div class="ah25Actions"><button class="ah25Btn gray" onclick="sagsV25OpenAdminFlights()">DANH SÁCH / ROTATION</button><button class="ah25Btn gray" onclick="sagsFlightRegistryCreateOpen()">+ THÊM CHUYẾN LẺ</button><button class="ah25Btn gray" onclick="sagsV25OpenMyFlights()">HỒ SƠ CHUYẾN</button></div></div>
      <div id="ah25PEOPLE" class="ah25Section"><h4>👥 NHÂN SỰ & CẤU HÌNH</h4><div class="ah25Meta">Mở nhanh các chức năng quản trị sẵn có của E-Report.</div><div class="ah25Actions"><button class="ah25Btn gray" onclick="sagsAdminHubLegacy('ACCOUNT')">QUẢN LÝ TÀI KHOẢN</button><button class="ah25Btn gray" onclick="sagsAdminHubLegacy('PERMISSION')">PHÂN QUYỀN</button><button class="ah25Btn gray" onclick="sagsAdminHubLegacy('BUILDER')">CẤU HÌNH / BUILDER</button></div></div>
      <div id="ah25MON" class="ah25Section"><h4>🛡 GIÁM SÁT & HỒ SƠ</h4><div class="ah25Actions"><button class="ah25Btn gray" onclick="sagsV25OpenMyFlights()">CHUYẾN / HỒ SƠ</button><button class="ah25Btn gray" onclick="sagsAdminHubApproval()">PHÊ DUYỆT QUYỀN XEM</button><button class="ah25Btn gray" onclick="sagsAdminHubLegacy('ARCHIVE')">HỒ SƠ LƯU TRỮ</button><button class="ah25Btn gray" onclick="sagsAdminHubLegacy('AUDIT')">NHẬT KÝ</button></div></div></div>`;document.body.appendChild(m);
    }
    const bar=document.querySelector('.toolbar-row.main-actions');if(bar&&!document.getElementById('roleBtnAdminHubV25')){const b=document.createElement('button');b.id='roleBtnAdminHubV25';b.type='button';b.textContent='⚙ QUẢN LÝ';b.onclick=open;const anchor=document.getElementById('roleBtnFlights');if(anchor?.parentNode)anchor.parentNode.insertBefore(b,anchor.nextSibling);else bar.appendChild(b);}
  }
  function open(){if(!isAD())return alert('Chỉ AD được mở QUẢN LÝ.');ensureUI();document.getElementById('ah25Modal')?.classList.add('show');section('OPS');}
  function close(){document.getElementById('ah25Modal')?.classList.remove('show');}
  function section(k){['OPS','PEOPLE','MON'].forEach(x=>document.getElementById('ah25'+x)?.classList.toggle('show',x===k));}
  async function roster(input){const f=input?.files?.[0],st=document.getElementById('ah25RosterStatus');if(!f)return;input.disabled=true;if(st){st.className='ah25Status';st.textContent='Đang xử lý '+f.name+'…';}try{const r=await root.sagsV25ImportDailyRoster(f);if(st){st.className='ah25Status ok';st.textContent=`✓ ${r.fileName}\n${r.rows} dòng · ${r.legs} LEG · ${r.assignments} assignment · ${r.forms} biểu mẫu${r.review?`\n⚠ ${r.review} rotation cần AD kiểm tra.`:'\n✓ Rotation rõ ràng đã tự ghép.'}`;}}catch(e){if(st){st.className='ah25Status err';st.textContent='Không xử lý được: '+S(e?.message||e);}else alert(S(e?.message||e));}finally{input.disabled=false;input.value='';}}
  function findLegacy(kind){
    const all=[...document.querySelectorAll('button')].filter(b=>b.id!=='roleBtnAdminHubV25'&&!b.closest('#ah25Modal'));const txt=b=>S(b.textContent).toUpperCase();const id=b=>S(b.id).toUpperCase();
    const tests={ACCOUNT:b=>/ACCOUNT|TÀI KHOẢN|TAI KHOAN/.test(txt(b)+' '+id(b)),PERMISSION:b=>/PHÂN QUYỀN|PHAN QUYEN|PERMISSION/.test(txt(b)+' '+id(b)),BUILDER:b=>/BUILDER|CẤU HÌNH|CAU HINH/.test(txt(b)+' '+id(b)),ARCHIVE:b=>/HỒ SƠ|HO SO|ARCHIVE/.test(txt(b)+' '+id(b)),AUDIT:b=>/NHẬT KÝ|NHAT KY|AUDIT/.test(txt(b)+' '+id(b))};return all.find(tests[kind]||(()=>false));
  }
  function legacy(kind){const b=findLegacy(kind);if(b){close();b.click();}else alert('Chức năng '+kind+' chưa có nút tương ứng trên bản lõi hiện tại.');}
  function approval(){if(typeof root.sagsV2ApprovalOpen==='function'){close();return root.sagsV2ApprovalOpen();}alert('Phê duyệt chưa sẵn sàng.');}
  root.openAdminHub=open;root.sagsAdminHubOpen=open;root.sagsAdminHubClose=close;root.sagsAdminHubSection=section;root.sagsAdminHubRoster=roster;root.sagsAdminHubLegacy=legacy;root.sagsAdminHubApproval=approval;root.__SAGS_ADMIN_HUB_V25__={BUILD,isAD};
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI,{once:true});else ensureUI();root.addEventListener?.('sags:role-changed',ensureUI);root.addEventListener?.('sags:auth-ready',ensureUI);}
})(typeof window!=='undefined'?window:globalThis);
