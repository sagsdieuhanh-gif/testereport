/* E-REPORT SAGS V2.4 · Compact Admin Management Hub */
(function(root){'use strict';
 const S=v=>String(v??'').trim(), U=v=>S(v).toUpperCase();
 function isAD(){try{return U(root.currentRole||root.currentUserProfile?.role)==='AD'}catch(_){return false}}
 const groups=[
  {key:'ops',title:'✈ VẬN HÀNH CHUYẾN',sub:'Tạo chuyến, theo dõi chuyến và cấu hình khai thác',items:[
    ['roleBtnDailyRoster','📋 DAILY ROSTER','Upload roster → kiểm tra → ✈ TẠO CHUYẾN'],
    ['roleBtnRosterFlights','✈ DANH SÁCH CHUYẾN HÔM NAY','Mở hồ sơ chuyến và phân công/bàn giao'],
    ['roleBtnActivity','📊 TIẾN ĐỘ','Theo dõi các chuyến đang khai thác'],
    ['roleBtnAcLimits','⚠ A/C LIMITS','Hạn chế tàu bay / cảnh báo khai thác'],
    ['roleBtnFleet','🛫 FLEET TÀU BAY','A/C REG · A/C TYPE · CONFIG']
  ]},
  {key:'people',title:'👥 NHÂN SỰ & CẤU HÌNH',sub:'Tài khoản, quyền và cấu hình chức năng',items:[
    ['roleBtnAccounts','👤 TÀI KHOẢN & PHÂN QUYỀN','Tạo/sửa tài khoản, vai trò và quyền'],
    ['roleBtnAdminBuilder','🧩 ADMIN BUILDER','Biểu mẫu động, nút, cảnh báo và cấu hình']
  ]},
  {key:'monitor',title:'🛡 GIÁM SÁT & HỒ SƠ',sub:'Nhật ký, tài nguyên hệ thống và lưu trữ',items:[
    ['roleBtnAudit','🧾 NHẬT KÝ / AUDIT','Các mốc FINAL, KẾT SỔ và UPDATE quan trọng'],
    ['roleBtnFirebaseUsage','🔥 FIREBASE USAGE','Theo dõi mức sử dụng Firebase'],
    ['roleBtnArchive','🗄 HỒ SƠ','Tra cứu hồ sơ lưu trữ']
  ]}
 ];
 const hideIds=['roleBtnDailyRoster','roleBtnRosterFlights','roleBtnActivity','roleBtnAcLimits','roleBtnFleet','roleBtnAccounts','roleBtnAdminBuilder','roleBtnAudit','roleBtnFirebaseUsage','roleBtnArchive'];
 function ensure(){
  if(!document.getElementById('adminHubStyle')){
   const st=document.createElement('style');st.id='adminHubStyle';st.textContent=`body.sagsAdminHub ${hideIds.map(x=>'#'+x).join(',body.sagsAdminHub ')}{display:none!important}#adminHubModal{display:none;position:fixed;inset:0;z-index:17600;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:12px;font-family:Arial,sans-serif}#adminHubModal.show{display:flex}.ahPanel{width:min(95vw,720px);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;padding:14px;box-shadow:0 18px 48px rgba(0,0,0,.35)}.ahHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.ahHead h3{margin:0;color:#0b4f91}.ahClose,.ahGroupBtn,.ahBack,.ahItem{border:0;border-radius:11px;font-weight:900;cursor:pointer}.ahClose,.ahBack{padding:8px 11px;background:#eef2f6;color:#334}.ahGroups{display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px}.ahGroupBtn{min-height:74px;padding:13px 14px;text-align:left;background:#eef6ff;color:#164e7a;border:1px solid #c9def0;font-size:17px}.ahGroupBtn:hover,.ahItem:hover{background:#e1f0fc}.ahGroupBtn small{display:block;font-size:12px;font-weight:700;color:#657789;margin-top:5px}.ahSectionHead{display:flex;align-items:center;gap:8px;margin:14px 0 8px}.ahSectionHead h4{margin:0;color:#294b66;font-size:17px}.ahGrid{display:grid;grid-template-columns:1fr;gap:8px}.ahItem{min-height:58px;padding:10px 12px;text-align:left;background:#f7fbff;color:#164e7a;border:1px solid #d3e3ef;font-size:15px}.ahItem.primary{min-height:70px;background:#eaf7ef;border-color:#b7ddc3;color:#176b32;font-size:17px}.ahItem.missing{opacity:.45}.ahItem small{display:block;font-size:12px;color:#667788;margin-top:4px;font-weight:700}.ahSub{font-size:12px;color:#667788;margin-top:4px}@media(max-width:560px){.ahPanel{padding:12px}.ahGroupBtn{min-height:68px}}`;document.head.appendChild(st)
  }
  if(!document.getElementById('adminHubModal')){const m=document.createElement('div');m.id='adminHubModal';m.innerHTML=`<div class="ahPanel"><div class="ahHead"><div><h3>⚙ QUẢN LÝ ADMIN</h3><div class="ahSub">Chọn một nhóm chức năng. Các nút cùng mục đích được gom vào cùng màn hình.</div></div><button class="ahClose" onclick="adminHubClose()">ĐÓNG</button></div><div id="adminHubBody"></div></div>`;document.body.appendChild(m)}
  const bar=document.querySelector('.toolbar-row.main-actions');if(bar&&!document.getElementById('roleBtnAdminHub')){const b=document.createElement('button');b.id='roleBtnAdminHub';b.textContent='⚙ QUẢN LÝ';b.onclick=()=>root.adminHubOpen();const anchor=document.getElementById('roleBtnAccounts');if(anchor?.parentNode)anchor.parentNode.insertBefore(b,anchor);else bar.appendChild(b)}
 }
 function renderHome(){const host=document.getElementById('adminHubBody');if(!host)return;host.innerHTML=`<div class="ahGroups">${groups.map(g=>`<button class="ahGroupBtn" onclick="adminHubOpenGroup('${g.key}')">${g.title}<small>${g.sub}</small></button>`).join('')}</div>`}
 root.adminHubOpenGroup=function(key){const g=groups.find(x=>x.key===key),host=document.getElementById('adminHubBody');if(!g||!host)return;host.innerHTML=`<div class="ahSectionHead"><button class="ahBack" onclick="adminHubHome()">← QUAY LẠI</button><h4>${g.title}</h4></div><div class="ahGrid">${g.items.map(([id,label,note],i)=>{const exists=!!document.getElementById(id),primary=key==='ops'&&i===0;return `<button class="ahItem${primary?' primary':''}${exists?'':' missing'}" ${exists?`onclick="adminHubRun('${id}')"`:'disabled'}>${label}<small>${note}</small></button>`}).join('')}</div>`}
 root.adminHubHome=renderHome;
 root.adminHubRun=function(id){const b=document.getElementById(id);if(!b)return alert('Chức năng này chưa sẵn sàng.');root.adminHubClose();const old=b.style.display;b.style.setProperty('display','inline-flex','important');try{b.click()}finally{setTimeout(()=>{b.style.display=old||'';sync()},0)}};
 root.adminHubOpen=function(){ensure();renderHome();document.getElementById('adminHubModal')?.classList.add('show')};
 root.adminHubClose=function(){document.getElementById('adminHubModal')?.classList.remove('show')};
 function sync(){ensure();const ad=isAD();document.body.classList.toggle('sagsAdminHub',ad);const b=document.getElementById('roleBtnAdminHub');if(b)b.style.display=ad?'inline-flex':'none'}
 const base=root.applyRoleUI;if(typeof base==='function')root.applyRoleUI=function(){const r=base.apply(this,arguments);setTimeout(sync,0);return r};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,50),{once:true});else setTimeout(sync,50);
 root.__ADMIN_HUB_HDSD='AD chỉ thấy một nút ⚙ QUẢN LÝ trên thanh chính. Trong QUẢN LÝ có 3 nút lớn: VẬN HÀNH CHUYẾN, NHÂN SỰ & CẤU HÌNH, GIÁM SÁT & HỒ SƠ. VẬN HÀNH CHUYẾN → DAILY ROSTER: chọn/upload file, bấm ĐỌC DAILY ROSTER, sau khi hợp lệ mới hiện nút lớn ✈ TẠO CHUYẾN; tạo xong tự mở DANH SÁCH CHUYẾN HÔM NAY.';
})(typeof window!=='undefined'?window:globalThis);
