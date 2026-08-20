/* E-REPORT SAGS · DAILY ROSTER ROUTE + BOOKING + ARR PAX SAFE SEED · V1.95
 * Reads Route/Booking from the same roster file and enriches mailbox payloads.
 * Applies only when target field is empty or still equals previous roster seed.
 */
(function(root){
'use strict';
const BUILD='V1.95-20260820-01',MAIL='roster_mail';
const S=v=>String(v??'').trim(),U=v=>S(v).toUpperCase(),safe=v=>S(v).replace(/[.#$\[\]\/]/g,'_');
let lookup=new Map(),installed=false;
const normFlight=v=>U(v).replace(/[^A-Z0-9]/g,'');
const key=(date,flight)=>`${S(date)}|${normFlight(flight)}`;
function cell(row,map,name){const i=map?.[name];return i===undefined?'':S(row?.[i])}
function routeParts(v){const a=U(v).split(/[-–—>/]+/).map(S).filter(Boolean),i=a.indexOf('CXR');return i>=0?{route1:a[i-1]||'',route3:a[i+1]||''}:{route1:a[0]||'',route3:a[1]||''}}
function bookingParts(raw){const s=U(raw),o={raw:S(raw),total:'',F:'',C:'',Y:'',I:''};if(/^\d+$/.test(S(raw)))o.total=S(raw);for(const c of ['F','C','Y','I']){const m=new RegExp(`(?:^|[\\s,;/|])${c}\\s*[:=\\-]?\\s*(\\d+)`,'i').exec(s);if(m)o[c]=m[1]}return o}
function arrivalPaxTotal(raw){const s=S(raw);if(!s)return '';const first=s.split('/')[0].trim();const m=first.match(/\d+/);return m?m[0]:''}
async function parseFile(file){
  const T=root.__SAGS_DAILY_ROSTER_TEST__;if(!T||!file)return null;let parsed;if(/\.csv$/i.test(file.name||''))parsed=T.parseCsvText(await file.text());else parsed=await T.parseXlsxBytes(new Uint8Array(await file.arrayBuffer()));
  const hi=T.headerRowInfo(parsed.rows||[]),map=hi.map,next=new Map();let rosterDate=null;for(let i=0;i<Math.min(hi.row,15)&&!rosterDate;i++)for(const x of (parsed.rows[i]||[])){const d=T.parseDate(x);if(d){rosterDate=d;break}}
  for(let i=hi.row+1;i<(parsed.rows||[]).length;i++){
    const row=parsed.rows[i]||[],flightRaw=cell(row,map,'FlightNo');if(!flightRaw)continue;const arr=T.parseDate(cell(row,map,'ArrFlightDate')),dep=T.parseDate(cell(row,map,'DepFlightDate')),op=arr||dep||rosterDate;if(!op)continue;
    const route=U(cell(row,map,'Route')),rp=routeParts(route),booking=cell(row,map,'Booking'),totalPax=cell(row,map,'TotalPax'),extra={opDate:op.iso,flightRaw:U(flightRaw),route,route1:rp.route1,route3:rp.route3,booking,bookingParts:bookingParts(booking),totalPax,arrPaxTTL:arrivalPaxTotal(totalPax)};next.set(key(op.iso,flightRaw),extra);
  }
  lookup=next;root.__SAGS_ROSTER_EXTRA_LOOKUP__=Object.fromEntries(next);return next;
}
function findExtra(rec){return lookup.get(key(rec?.opDate,rec?.flightRaw))||null}
function enrichObject(x){if(!x||typeof x!=='object')return x;const e=findExtra(x);if(!e)return x;return {...x,rosterRoute:e.route,route:e.route||x.route,route1:e.route1||x.route1,route3:e.route3||x.route3,booking:e.booking,bookingParts:e.bookingParts,totalPax:e.totalPax,arrPaxTTL:e.arrPaxTTL}}
function enrichPatch(patch){for(const k of Object.keys(patch||{})){if(/^roster_mail\/[^/]+\/items\/[^/]+$/.test(k)&&patch[k]&&typeof patch[k]==='object')patch[k]=enrichObject(patch[k]);if(/^roster_manifests\/[^/]+$/.test(k)&&patch[k]?.items){for(const id of Object.keys(patch[k].items))patch[k].items[id]=enrichObject(patch[k].items[id])}}}
function safeSeed(env,k,v){v=S(v);if(!v)return false;env.state=env.state&&typeof env.state==='object'?env.state:{};env.rosterSeed=env.rosterSeed&&typeof env.rosterSeed==='object'?env.rosterSeed:{};const cur=S(env.state[k]),old=S(env.rosterSeed[k]);if(!cur||cur===old){env.state[k]=v;env.rosterSeed[k]=v;return true}return false}
function applyRec(rec){
  const list=typeof root.readFlightSessionList==='function'?root.readFlightSessionList():[],meta=list.find(x=>S(x.rosterAssignmentId)===S(rec.assignmentId));if(!meta)return false;let env=root.readFlightSessionEnvelope?.(meta.id);if(!env)return false;const g=S(meta.initialGroup||rec.formGroup||env.mainForm),bp=rec.bookingParts||bookingParts(rec.booking),r1=S(rec.route1),r3=S(rec.route3),arrTTL=S(rec.arrPaxTTL||arrivalPaxTotal(rec.totalPax));let changed=false;
  if(g==='fsags421'){changed=safeSeed(env,'f421_route1',r1)||changed;changed=safeSeed(env,'f421_route3',r3)||changed;if(arrTTL)changed=safeSeed(env,'f421_arrPaxTTL',arrTTL)||changed;if(bp.F)changed=safeSeed(env,'f421_bookingF',bp.F)||changed;if(bp.C)changed=safeSeed(env,'f421_bookingC',bp.C)||changed;if(bp.Y)changed=safeSeed(env,'f421_bookingY',bp.Y)||changed}
  else if(g==='fsags551'){changed=safeSeed(env,'f551_route1',r1)||changed;changed=safeSeed(env,'f551_route3',r3)||changed}
  else if(g==='fsags09'){changed=safeSeed(env,'f09_route1',r1)||changed;changed=safeSeed(env,'f09_route3',r3)||changed;if(bp.total)changed=safeSeed(env,'f09_booking',bp.total)||changed;if(bp.F)changed=safeSeed(env,'f09_bookF',bp.F)||changed;if(bp.C)changed=safeSeed(env,'f09_bookC',bp.C)||changed;if(bp.Y)changed=safeSeed(env,'f09_bookY',bp.Y)||changed;if(bp.I)changed=safeSeed(env,'f09_bookI',bp.I)||changed}
  else {changed=safeSeed(env,'route1',r1)||changed;changed=safeSeed(env,'route2','CXR')||changed;changed=safeSeed(env,'route3',r3)||changed;if(arrTTL)changed=safeSeed(env,'arrPaxTTL',arrTTL)||changed;if(bp.F)changed=safeSeed(env,'bookingF',bp.F)||changed;if(bp.C)changed=safeSeed(env,'bookingC',bp.C)||changed;if(bp.Y)changed=safeSeed(env,'bookingY',bp.Y)||changed}
  if(changed){try{localStorage.setItem(root.flightSessionStorageKey(meta.id),JSON.stringify(env))}catch(_){return false}if(S(root.activeFlightSessionId)===S(meta.id)){try{for(const k of Object.keys(root.state||{}))delete root.state[k];Object.assign(root.state,env.state||{});root.draw?.()}catch(_){}}}return changed;
}
function scan(raw){const vals=Object.values(raw||{}).filter(x=>x&&x.engine==='DAILY_ROSTER_V1');for(const rec of vals)if(rec.booking||rec.route1||rec.route3||rec.totalPax||rec.arrPaxTTL){setTimeout(()=>applyRec(rec),250);setTimeout(()=>applyRec(rec),900);setTimeout(()=>applyRec(rec),1900)}}
function bindFile(){const f=document.getElementById('drFile');if(!f||f.dataset.extraSeedV195)return;f.dataset.extraSeedV195='1';f.addEventListener('change',async()=>{try{if(f.files?.[0]){await parseFile(f.files[0]);const e=document.getElementById('drStatus');if(e&&lookup.size)e.textContent=(e.textContent?e.textContent+'\n':'')+`Route/Booking/TotalPax: đã đọc ${lookup.size} dòng để tự điền an toàn.`}}catch(e){console.warn('Roster Route/Booking parse',e)}})}
function install(){
  if(installed)return;const prev=root.sagsV470Ref;if(typeof prev!=='function'||!root.__SAGS_DAILY_ROSTER_TEST__){setTimeout(install,400);return}installed=true;root.__ROSTER_EXTRA_SEED_V195=BUILD;
  root.sagsV470Ref=function(path=''){
    const p=S(path),ref=prev(p);if(p===''&&ref&&typeof ref.update==='function'){const base=ref.update.bind(ref);ref.update=async patch=>{if(patch&&typeof patch==='object')enrichPatch(patch);return base(patch)}}
    if(/^roster_mail\/[^/]+\/items$/.test(p)&&ref){if(typeof ref.on==='function'){const bon=ref.on.bind(ref);ref.on=function(event,cb,...rest){if(event==='value'&&typeof cb==='function'){const wrap=s=>{const r=cb(s);try{scan(s?.val?.()||{})}catch(_){}return r};return bon(event,wrap,...rest)}return bon(event,cb,...rest)}}if(typeof ref.once==='function'){const bo=ref.once.bind(ref);ref.once=async function(){const s=await bo.apply(this,arguments);try{scan(s?.val?.()||{})}catch(_){}return s}}
    }
    return ref;
  };
  bindFile();const mo=new MutationObserver(bindFile);mo.observe(document.documentElement,{childList:true,subtree:true});root.__ROSTER_EXTRA_HDSD='DAILY ROSTER V1.95: Route/Booking/TotalPax lấy từ file roster. TotalPax dạng 440/437 lấy phần trước dấu / (440) điền ARR PAX: TTL trên 42.1/42.3. Chỉ seed khi ô trống hoặc còn đúng seed roster cũ; không ghi đè dữ liệu nhân viên đã sửa. Booking tổng chỉ điền FSAGS09; F/C/Y chỉ điền khi file Booking ghi rõ F/C/Y.';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
})(window);
