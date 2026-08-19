/* E-REPORT SAGS · DAILY ROSTER ROLE MAP + PVHK FSAGS09 + DIRECT REASSIGN · V1.77 */
(function(root){
  "use strict";

  const BUILD="V1.81-20260819-01";
  const ENGINE="DAILY_ROSTER_V1";
  const MAIL_PATH="roster_mail";
  const MANIFEST_PATH="roster_manifests";
  const SESSION_PATH="roster_sessions";
  const REVOKE_PATH="roster_revocations";
  const FIXED_ROLE_COLUMNS=["Grnd_Cor","Grnd_Ld","Pax_Supr"];

  const S=v=>String(v??"").trim();
  const upper=v=>S(v).toUpperCase();
  const normUser=v=>{
    try{ if(typeof normalizePersonalUsername==="function") return normalizePersonalUsername(v); }catch(e){}
    return upper(v).replace(/\s+/g,"").replace(/[^A-Z0-9._-]/g,"_").slice(0,40);
  };
  const safeKey=v=>{
    try{ if(typeof sagsV470Safe==="function") return sagsV470Safe(v); }catch(e){}
    return S(v).replace(/[.#$\[\]\/]/g,"_");
  };
  const esc=v=>S(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function xmlUnescape(s){
    return S(s)
      .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
      .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
      .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
  }
  function attrsOf(s){
    const o={};
    String(s||"").replace(/([:\w-]+)="([^"]*)"/g,(_,k,v)=>{o[k]=xmlUnescape(v);return "";});
    return o;
  }
  function colIndex(ref){
    const m=/^([A-Z]+)\d+$/i.exec(S(ref));
    if(!m)return -1;
    let n=0; for(const ch of m[1].toUpperCase()) n=n*26+(ch.charCodeAt(0)-64);
    return n-1;
  }
  function textFromSi(body){
    let out="";
    String(body||"").replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi,(_,x)=>{out+=xmlUnescape(x);return "";});
    return out;
  }
  async function inflateRaw(u8){
    if(typeof DecompressionStream!=="function") throw new Error("Trình duyệt chưa hỗ trợ giải nén XLSX. Hãy dùng Safari/Chrome mới hoặc lưu roster thành CSV.");
    const ds=new DecompressionStream("deflate-raw");
    const ab=await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }
  async function unzipEntries(bytes){
    const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    let eocd=-1;
    const from=Math.max(0,u8.length-65557);
    for(let i=u8.length-22;i>=from;i--){ if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;} }
    if(eocd<0)throw new Error("File XLSX không hợp lệ: không tìm thấy ZIP directory.");
    const count=dv.getUint16(eocd+10,true),cdOffset=dv.getUint32(eocd+16,true);
    const decoder=new TextDecoder("utf-8");
    const entries={}; let p=cdOffset;
    for(let n=0;n<count;n++){
      if(dv.getUint32(p,true)!==0x02014b50)throw new Error("File XLSX lỗi central directory.");
      const method=dv.getUint16(p+10,true),compSize=dv.getUint32(p+20,true),nameLen=dv.getUint16(p+28,true),extraLen=dv.getUint16(p+30,true),commentLen=dv.getUint16(p+32,true),localOff=dv.getUint32(p+42,true);
      const name=decoder.decode(u8.subarray(p+46,p+46+nameLen));
      entries[name]={method,compSize,localOff};
      p+=46+nameLen+extraLen+commentLen;
    }
    async function read(name){
      const e=entries[name]; if(!e)return null;
      const q=e.localOff;
      if(dv.getUint32(q,true)!==0x04034b50)throw new Error("File XLSX lỗi local header: "+name);
      const nameLen=dv.getUint16(q+26,true),extraLen=dv.getUint16(q+28,true),start=q+30+nameLen+extraLen;
      const src=u8.subarray(start,start+e.compSize);
      if(e.method===0)return src.slice();
      if(e.method===8)return await inflateRaw(src);
      throw new Error("XLSX dùng kiểu nén chưa hỗ trợ: "+e.method);
    }
    return {entries,read};
  }
  async function parseXlsxBytes(bytes){
    const zip=await unzipEntries(bytes);
    const dec=new TextDecoder("utf-8");
    const readText=async name=>{const b=await zip.read(name);return b?dec.decode(b):"";};
    const workbook=await readText("xl/workbook.xml");
    const rels=await readText("xl/_rels/workbook.xml.rels");
    if(!workbook||!rels)throw new Error("Không đọc được cấu trúc workbook.");

    const sheets=[];
    workbook.replace(/<sheet\b([^>]*)\/?\s*>/gi,(_,a)=>{const x=attrsOf(a);if(x.name&&x["r:id"])sheets.push({name:x.name,rid:x["r:id"]});return "";});
    const wanted=sheets.find(x=>upper(x.name)==="DAILY_ROSTER")||sheets[0];
    if(!wanted)throw new Error("Workbook không có sheet dữ liệu.");

    const relMap={};
    rels.replace(/<Relationship\b([^>]*)\/?\s*>/gi,(_,a)=>{const x=attrsOf(a);if(x.Id&&x.Target)relMap[x.Id]=x.Target;return "";});
    let target=relMap[wanted.rid];
    if(!target)throw new Error("Không xác định được sheet DAILY_ROSTER.");
    target=target.replace(/^\//,"");
    if(!target.startsWith("xl/"))target="xl/"+target.replace(/^\.\//,"");

    const sharedXml=await readText("xl/sharedStrings.xml");
    const shared=[];
    if(sharedXml)sharedXml.replace(/<si\b[^>]*>([\s\S]*?)<\/si>/gi,(_,b)=>{shared.push(textFromSi(b));return "";});
    const sheetXml=await readText(target);
    if(!sheetXml)throw new Error("Không đọc được sheet DAILY_ROSTER.");

    const rows=[];
    sheetXml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi,(_,ra,body)=>{
      const rattrs=attrsOf(ra),rnum=Number(rattrs.r||rows.length+1),arr=[];
      body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi,(__,ca,cb)=>{
        const a=attrsOf(ca),idx=colIndex(a.r); if(idx<0)return "";
        const inside=cb||"",vm=/<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(inside),raw=vm?xmlUnescape(vm[1]):"";
        let v="";
        if(a.t==="s")v=shared[Number(raw)]??"";
        else if(a.t==="inlineStr")v=textFromSi(inside);
        else if(a.t==="e")v="";
        else if(a.t==="b")v=raw==="1"?"TRUE":"FALSE";
        else v=raw;
        arr[idx]=v; return "";
      });
      rows[rnum-1]=arr; return "";
    });
    return {sheetName:wanted.name,rows};
  }
  function parseCsvText(text){
    const rows=[]; let row=[],cell="",q=false;
    const s=String(text||"");
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(q){ if(c==='"'&&s[i+1]==='"'){cell+='"';i++;} else if(c==='"')q=false; else cell+=c; }
      else if(c==='"')q=true; else if(c===','){row.push(cell);cell="";} else if(c==='\n'){row.push(cell.replace(/\r$/, ""));rows.push(row);row=[];cell="";} else cell+=c;
    }
    row.push(cell.replace(/\r$/, "")); if(row.some(x=>S(x)))rows.push(row);
    return {sheetName:"CSV",rows};
  }
  async function parseRosterFile(file){
    const name=upper(file?.name||"");
    if(name.endsWith(".CSV"))return parseCsvText(await file.text());
    const buf=await file.arrayBuffer();
    return await parseXlsxBytes(new Uint8Array(buf));
  }

  function headerRowInfo(rows){
    for(let i=0;i<Math.min(rows.length,80);i++){
      const r=rows[i]||[];
      const map={};r.forEach((v,j)=>{const k=S(v);if(k)map[k]=j;});
      if(map.FlightNo!==undefined && (map.STA!==undefined||map.STD!==undefined))return {row:i,map};
    }
    throw new Error("Không tìm thấy hàng tiêu đề có FlightNo / STA / STD.");
  }
  function parseDate(v){
    const s=S(v);if(!s||/^\d+(?:\.\d+)?$/.test(s))return null;
    let m=/^(\d{1,2})[-\/]([A-Za-z]{3}|\d{1,2})[-\/,\s](\d{2,4})$/.exec(s);
    if(m){
      const mons={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
      const d=Number(m[1]),mo=mons[upper(m[2])]||Number(m[2]),y=Number(m[3])+(Number(m[3])<100?2000:0);
      if(d&&mo>=1&&mo<=12)return {iso:`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`,display:`${String(d).padStart(2,"0")}/${String(mo).padStart(2,"0")}/${y}`};
    }
    const d=new Date(s);
    if(Number.isFinite(d.getTime()))return {iso:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,display:`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`};
    return null;
  }
  function fmtTime(v){
    let s=S(v);if(!s)return "";
    s=s.replace(/\.0+$/,"");
    if(/^\d{1,4}$/.test(s)){s=s.padStart(4,"0");const h=Number(s.slice(0,2)),m=Number(s.slice(2));if(h<24&&m<60)return `${s.slice(0,2)}:${s.slice(2)}`;}
    const m=/^(\d{1,2}):(\d{2})/.exec(s);if(m&&Number(m[1])<24&&Number(m[2])<60)return `${String(Number(m[1])).padStart(2,"0")}:${m[2]}`;
    return "";
  }
  function splitFlights(raw){
    const parts=upper(raw).replace(/[\/]+/g," ").split(/\s+/).filter(Boolean);
    let prefix="";const out=[];
    for(const p0 of parts){
      const p=p0.replace(/[^A-Z0-9]/g,"");if(!p)continue;
      let m=/^([A-Z0-9]{2,3}?)(\d{1,5})$/.exec(p);
      if(m&&/[A-Z]/.test(m[1])){prefix=m[1];out.push(prefix+m[2]);continue;}
      m=/^(\d{1,5})$/.exec(p);if(m&&prefix){out.push(prefix+m[1]);continue;}
    }
    return [...new Set(out)];
  }
  function routeParts(route){
    const a=upper(route).split(/[-–—>/]+/).map(S).filter(Boolean),i=a.indexOf("CXR");
    if(i>=0)return {route1:a[i-1]||"",route3:a[i+1]||""};
    return {route1:a[0]||"",route3:a[1]||""};
  }
  function usersFromCell(v){
    return [...new Set(upper(v).split(/[\/,;|\n]+/).map(normUser).filter(x=>x&&/^[A-Z][A-Z0-9._-]{1,39}$/.test(x)&&!/^N\/?A$/.test(x)&&!/^\d+$/.test(x)))];
  }
  function formLabel(g){return g==="fsags421"?"42.1":(g==="fsags551"?"55.1":(g==="fsags09"?"FSAGS 09":"42.3"));}
  function hashId(s){
    let h=2166136261>>>0;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(36).toUpperCase();
  }
  function getCell(row,map,key){const i=map[key];return i===undefined?"":S(row?.[i]);}
  function allFlightRows(parsed){
    const {row:hi,map}=headerRowInfo(parsed.rows||[]),out=[];
    let rosterDate=null;
    for(let i=0;i<Math.min(hi,15);i++){
      for(const x of (parsed.rows[i]||[])){
        const d=parseDate(x);if(d){rosterDate=d;break;}
      }
      if(rosterDate)break;
    }
    const seen=new Set();
    for(let i=hi+1;i<(parsed.rows||[]).length;i++){
      const row=parsed.rows[i]||[],flightRaw=getCell(row,map,"FlightNo");if(!flightRaw)continue;
      const arrDate=parseDate(getCell(row,map,"ArrFlightDate")),depDate=parseDate(getCell(row,map,"DepFlightDate"));
      const opDate=arrDate||depDate||rosterDate;if(!opDate)continue;
      const flights=splitFlights(flightRaw),sta=fmtTime(getCell(row,map,"STA")),std=fmtTime(getCell(row,map,"STD"));
      let arrFlight="",depFlight="";
      if(flights.length>=2){arrFlight=flights[0];depFlight=flights[1];}
      else if(flights.length===1){if(arrDate||sta)arrFlight=flights[0];else if(depDate||std)depFlight=flights[0];}
      if(!arrFlight&&!depFlight)continue;
      const rp=routeParts(getCell(row,map,"Route"));
      const rec={
        rowNo:i+1,opDate:opDate.iso,date:opDate.display,flightRaw:upper(flightRaw),
        flightName:[arrFlight,depFlight].filter(Boolean).join(" / ")||upper(flightRaw),
        arrFlight,depFlight,sta,std,
        eta:fmtTime(getCell(row,map,"ETA")),etd:fmtTime(getCell(row,map,"ETD")),
        acReg:upper(getCell(row,map,"ACRegNo")),acType:upper(getCell(row,map,"ACType")),
        route:upper(getCell(row,map,"Route")),route1:rp.route1,route3:rp.route3,
        bay:S(getCell(row,map,"ParkingBay")),gate:S(getCell(row,map,"Gate")),
        booking:S(getCell(row,map,"Booking"))
      };
      const key=rec.opDate+"|"+rec.flightName;
      if(seen.has(key))continue;
      seen.add(key);out.push(rec);
    }
    return {records:out,headerMap:map,headerRow:hi+1,rosterDate:rosterDate?.iso||""};
  }

  function pvhk09SeedFor(rec){
    const s={
      f09_date:rec.date,f09_fltBefore:rec.arrFlight,f09_fltAfter:rec.depFlight,
      f09_sta:rec.sta,f09_std:rec.std,f09_eta:rec.eta,f09_etd:rec.etd,
      f09_regn:rec.acReg,f09_acType:rec.acType,f09_route1:rec.route1,f09_route3:rec.route3
    };
    if(rec.bay){s.f09_parkingArr=rec.bay;s.f09_parkingDep=rec.bay;}
    if(rec.gate){s.f09_gateArr=rec.gate;s.f09_gateDep=rec.gate;}
    if(rec.booking)s.f09_booking=rec.booking;
    for(const k of Object.keys(s))if(!S(s[k]))delete s[k];
    return s;
  }

  function rosterRecords(parsed){
    const {row:hi,map}=headerRowInfo(parsed.rows||[]),out=[];
    let rosterDate=null;
    for(let i=0;i<Math.min(hi,15);i++)for(const x of (parsed.rows[i]||[])){const d=parseDate(x);if(d){rosterDate=d;break;}if(rosterDate)break;}
    for(let i=hi+1;i<(parsed.rows||[]).length;i++){
      const row=parsed.rows[i]||[],flightRaw=getCell(row,map,"FlightNo");if(!flightRaw)continue;
      const arrDate=parseDate(getCell(row,map,"ArrFlightDate")),depDate=parseDate(getCell(row,map,"DepFlightDate"));
      const opDate=arrDate||depDate||rosterDate;if(!opDate)continue;
      const flights=splitFlights(flightRaw),sta=fmtTime(getCell(row,map,"STA")),std=fmtTime(getCell(row,map,"STD"));
      let arrFlight="",depFlight="";
      if(flights.length>=2){arrFlight=flights[0];depFlight=flights[1];}
      else if(flights.length===1){if(arrDate||sta)arrFlight=flights[0];else if(depDate||std)depFlight=flights[0];}
      const rp=routeParts(getCell(row,map,"Route"));
      const corUsers=usersFromCell(getCell(row,map,"Grnd_Cor"));
      const ldUsers=usersFromCell(getCell(row,map,"Grnd_Ld"));
      const paxUsers=usersFromCell(getCell(row,map,"Pax_Supr"));
      const corSet=new Set(corUsers),ldSet=new Set(ldUsers);
      const common=corUsers.filter(u=>ldSet.has(u));
      const corOnly=corUsers.filter(u=>!ldSet.has(u));
      const ldOnly=ldUsers.filter(u=>!corSet.has(u));
      if(!common.length&&!corOnly.length&&!ldOnly.length&&!paxUsers.length)continue;

      const base={
        rowNo:i+1,opDate:opDate.iso,date:opDate.display,flightRaw:upper(flightRaw),arrFlight,depFlight,sta,std,
        acReg:upper(getCell(row,map,"ACRegNo")),acType:upper(getCell(row,map,"ACType")),route:upper(getCell(row,map,"Route")),
        route1:rp.route1,route3:rp.route3,bay:S(getCell(row,map,"ParkingBay")),
        grndCor:corUsers,grndLd:ldUsers,paxSupr:paxUsers,
        flightName:[arrFlight,depFlight].filter(Boolean).join(" / ")||upper(flightRaw)
      };
      const add=(u,formGroup,sourceColumn,roleKey)=>{
        // ID dựa trên roster gốc + vai trò. Khi AD chuyển người, ID giữ nguyên để giữ dữ liệu và override.
        const id="RA_"+hashId([base.opDate,base.flightRaw,roleKey,u].join("|"));
        out.push({...base,assignmentId:id,targetUser:u,originalTargetUser:u,formGroup,sourceColumn,roleKey});
      };
      // V1.69:
      // - Không có Grnd_Ld: mọi Grnd_Cor nhận 42.3.
      // - Có Grnd_Ld:
      //   + cùng username ở cả Cor + Ld => 42.3
      //   + Cor khác người Ld => Cor 42.1, Ld 55.1
      if(!ldUsers.length){
        for(const u of corUsers)add(u,"fsags","Grnd_Cor","COR");
      }else{
        for(const u of common)add(u,"fsags","Grnd_Cor + Grnd_Ld","BOTH");
        for(const u of corOnly)add(u,"fsags421","Grnd_Cor","COR");
        for(const u of ldOnly)add(u,"fsags551","Grnd_Ld","LD");
      }
      // V1.77: PVHK Passenger Supervisor nhận F/SAGS-CXR/09.
      // Mỗi username trong Pax_Supr nhận 01 form 09 của đúng chuyến.
      for(const u of paxUsers)add(u,"fsags09","Pax_Supr","PAX09");
    }
    return {records:out,headerMap:map,headerRow:hi+1,rosterDate:rosterDate?.iso||""};
  }
  function seedFor(rec){
    const s={};
    if(rec.formGroup==="fsags421"){
      Object.assign(s,{f421_date:rec.date,f421_fltBefore:rec.arrFlight,f421_fltAfter:rec.depFlight,f421_sta:rec.sta,f421_std:rec.std,f421_regn:rec.acReg,f421_acType:rec.acType,f421_route1:rec.route1,f421_route3:rec.route3});
      if(rec.bay){s.f421_bayBefore=rec.bay;s.f421_bayAfter=rec.bay;}
    }else if(rec.formGroup==="fsags551"){
      Object.assign(s,{f551_date:rec.date,f551_fltBefore:rec.arrFlight,f551_fltAfter:rec.depFlight,f551_sta:rec.sta,f551_std:rec.std,f551_regn:rec.acReg,f551_acType:rec.acType,f551_route1:rec.route1,f551_route3:rec.route3});
      if(rec.bay)s.f551_bay=rec.bay;
    }else if(rec.formGroup==="fsags09"){
      Object.assign(s,{
        f09_date:rec.date,f09_fltBefore:rec.arrFlight,f09_fltAfter:rec.depFlight,
        f09_sta:rec.sta,f09_std:rec.std,f09_regn:rec.acReg,f09_acType:rec.acType,
        f09_route1:rec.route1,f09_route3:rec.route3
      });
      if(rec.bay){s.f09_parkingArr=rec.bay;s.f09_parkingDep=rec.bay;}
    }else{
      Object.assign(s,{date:rec.date,fltBefore:rec.arrFlight,fltAfter:rec.depFlight,sta:rec.sta,std:rec.std,regn:rec.acReg,acType:rec.acType,route1:rec.route1,route2:"CXR",route3:rec.route3});
      if(rec.bay){s.bayBefore=rec.bay;s.bayAfter=rec.bay;}
    }
    for(const k of Object.keys(s))if(!S(s[k]))delete s[k];
    return s;
  }


  // Pure helpers exposed for validation/tests.
  root.__SAGS_DAILY_ROSTER_TEST__={parseXlsxBytes,parseCsvText,headerRowInfo,parseDate,fmtTime,splitFlights,usersFromCell,allFlightRows,pvhk09SeedFor,rosterRecords,seedFor};
  if(typeof document==="undefined")return;

  let preview=null,mailRef=null,mailCb=null,revRef=null,revCb=null,lastToastSig="";
  const rosterSyncTimers=new Map(),rosterSyncSig=new Map();
  function isAD(){try{return upper(currentRole)==="AD";}catch(e){return false;}}
  function canManageDailyRoster(){
    if(isAD())return true;
    try{return typeof v485Can==="function"&&v485Can("DAILY_ROSTER");}catch(e){return false;}
  }
  function ensureUI(){
    if(document.getElementById("dailyRosterModal"))return;
    const style=document.createElement("style");
    style.textContent=`
      #dailyRosterModal{display:none;position:fixed;inset:0;z-index:16050;background:rgba(0,0,0,.52);align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font-family:Arial,sans-serif}
      #dailyRosterModal.show{display:flex}.drPanel{width:min(96vw,960px);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 16px 45px rgba(0,0,0,.28);padding:16px;box-sizing:border-box}.drHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.drHead h3{margin:0;color:#0b4f91}.drSub{font-size:13px;color:#5d6875;line-height:1.45;margin:5px 0 12px}.drGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.drField{border:1px solid #d9e1e8;border-radius:11px;padding:10px;background:#f9fbfd}.drField label{display:block;font-size:12px;font-weight:800;color:#29445e;margin-bottom:5px}.drField input,.drField select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #c9d5df;border-radius:8px;background:#fff}.drCols{display:flex;flex-wrap:wrap;gap:7px}.drCheck{display:flex!important;align-items:center;gap:5px;font-size:12px!important;font-weight:700!important;margin:0!important;padding:5px 7px;border:1px solid #d7e0e8;border-radius:8px;background:#fff}.drCheck input{width:auto!important}.drActions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}.drBtn{border:0;border-radius:9px;padding:9px 13px;font-weight:800;cursor:pointer;background:#0b67b2;color:#fff}.drBtn.secondary{background:#eef3f7;color:#31475a;border:1px solid #ccd7df}.drBtn.publish{background:#15803d}.drStatus{margin-top:10px;padding:9px 10px;border-radius:9px;background:#eef6ff;color:#234764;font-size:13px;white-space:pre-wrap}.drStatus.err{background:#fff0f0;color:#9b1c1c}.drTableWrap{overflow:auto;margin-top:10px;border:1px solid #d9e1e8;border-radius:10px;max-height:38vh}.drTable{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}.drTable th,.drTable td{border-bottom:1px solid #e5ebf0;padding:7px 8px;text-align:left}.drTable th{position:sticky;top:0;background:#edf5fb;color:#214968;z-index:1}.drBadge{display:inline-block;border-radius:999px;padding:2px 7px;background:#e8f5e9;color:#176b32;font-weight:800;margin:1px}.drEmpty{padding:14px;color:#667}.drToast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:17000;background:#123d64;color:#fff;border-radius:12px;padding:10px 14px;font:700 13px Arial;box-shadow:0 8px 25px rgba(0,0,0,.25);max-width:min(90vw,520px);text-align:center}
      #roleBtnPVHK09Roster{background:#0b6b72!important;color:#fff!important}
      @media(max-width:650px){.drGrid{grid-template-columns:1fr}.drPanel{padding:12px}.drActions .drBtn{flex:1}}
    `;
    document.head.appendChild(style);
    const m=document.createElement("div");m.id="dailyRosterModal";
    m.innerHTML=`<div class="drPanel"><div class="drHead"><div><h3>📋 DAILY ROSTER · TỰ PHÂN BIỂU MẪU</h3><div class="drSub">RAMP dùng Grnd_Cor / Grnd_Ld. <b>PVHK: Pax_Supr → FSAGS 09</b>. Nhân viên đúng username tự nhận biểu mẫu, không cần bấm NHẬN.</div></div><button class="drBtn secondary" onclick="closeDailyRosterManager()">ĐÓNG</button></div>
      <div class="drField"><label>File DAILY ROSTER</label><input id="drFile" type="file" accept=".xlsx,.xlsm,.csv"></div>
      <div class="drStatus"><b>QUY TẮC TẠO FORM</b><br>• Không có Grnd_Ld: Grnd_Cor → 42.3<br>• Có Grnd_Ld khác người: Grnd_Cor → 42.1, Grnd_Ld → 55.1<br>• Cùng người ở Grnd_Cor + Grnd_Ld → 42.3<br>• <b>Pax_Supr → FSAGS 09</b>.</div>
      <div class="drActions"><button class="drBtn" onclick="dailyRosterReadPreview()">ĐỌC & XEM TRƯỚC</button><button class="drBtn publish" id="drPublishBtn" onclick="dailyRosterPublish()" disabled>TẠO & PHÂN CÔNG</button></div>
      <div class="drStatus" id="drStatus">Chọn file roster để bắt đầu.</div><div id="drPreview"></div>
      <div class="drField" style="margin-top:14px"><label>AD · CHUYỂN NGƯỜI PHỤ TRÁCH TRỰC TIẾP</label><div class="drSub">Không dùng GIAO CA. Chọn ngày → tải phân công → bấm CHUYỂN ở đúng biểu mẫu. Dữ liệu roster đã lưu trên V1.66 được giữ qua bản đồng bộ roster.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="drManageDate" type="date" style="flex:1;min-width:160px"><button class="drBtn secondary" onclick="dailyRosterLoadAssignments()">TẢI PHÂN CÔNG</button></div><div id="drManage"></div></div>
      </div>`;
    document.body.appendChild(m);
    const td=new Date(),d=`${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,"0")}-${String(td.getDate()).padStart(2,"0")}`;const md=document.getElementById("drManageDate");if(md)md.value=d;
    document.getElementById("drFile")?.addEventListener("change",()=>{preview=null;const b=document.getElementById("drPublishBtn");if(b)b.disabled=true;});
  }
  function canBuildPVHK09(){
    try{return upper(currentRole)==="AD"||(typeof v485Can==="function"&&v485Can("FSAGS09"));}catch(e){return false;}
  }
  function ensureButton(){
    const bar=document.querySelector(".toolbar-row.main-actions");if(!bar)return;
    let b=document.getElementById("roleBtnDailyRoster");
    if(!b){b=document.createElement("button");b.id="roleBtnDailyRoster";b.textContent="📋 DAILY ROSTER";b.onclick=()=>openDailyRosterManager();b.style.display="none";const anchor=document.getElementById("roleBtnActivity");if(anchor?.parentNode)anchor.parentNode.insertBefore(b,anchor.nextSibling);else bar.appendChild(b);}
    b.style.display=canManageDailyRoster()?"":"none";

    let p=document.getElementById("roleBtnPVHK09Roster");
    if(!p){
      p=document.createElement("button");p.id="roleBtnPVHK09Roster";p.textContent="📋 PHÂN CHUYẾN 09";p.style.display="none";
      p.onclick=()=>root.dailyRosterPickPVHK09?.();
      const anchor=document.getElementById("roleBtnFlights");
      if(anchor?.parentNode)anchor.parentNode.insertBefore(p,anchor.nextSibling);else bar.appendChild(p);

      const f=document.createElement("input");f.id="pvhk09RosterFile";f.type="file";f.accept=".xlsx,.xlsm,.csv";
      f.style.position="fixed";f.style.left="-9999px";f.style.top="-9999px";f.style.width="1px";f.style.height="1px";f.style.opacity="0";
      f.addEventListener("change",async()=>{const file=f.files?.[0];f.value="";if(file)await root.dailyRosterCreatePVHK09FromFile?.(file);});
      document.body.appendChild(f);
    }
    p.style.display=canBuildPVHK09()?"":"none";
  }
  function setStatus(msg,err=false){const e=document.getElementById("drStatus");if(e){e.textContent=msg;e.classList.toggle("err",!!err);}}
  function renderPreview(data){
    const host=document.getElementById("drPreview");if(!host)return;
    const recs=data.records||[],users=[...new Set(recs.map(x=>x.targetUser))];
    const grouped=new Map();
    for(const r of recs){
      const k=r.opDate+"|"+r.flightRaw;
      if(!grouped.has(k))grouped.set(k,{...r,assignments:[]});
      grouped.get(k).assignments.push({user:r.targetUser,formGroup:r.formGroup,sourceColumn:r.sourceColumn});
    }
    const rows=[...grouped.values()].slice(0,100);
    host.innerHTML=`<div class="drStatus">Đọc được <b>${grouped.size}</b> dòng chuyến · <b>${recs.length}</b> biểu mẫu · <b>${users.length}</b> username.<br>Ngày roster: ${esc(data.rosterDate||"không xác định")} · Sheet: ${esc(data.sheetName||"")}</div>${rows.length?`<div class="drTableWrap"><table class="drTable"><thead><tr><th>Ngày</th><th>Flight</th><th>STA</th><th>STD</th><th>Grnd_Cor</th><th>Grnd_Ld</th><th>Pax_Supr</th><th>Biểu mẫu sinh ra</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td><b>${esc(r.flightRaw)}</b></td><td>${esc(r.sta)}</td><td>${esc(r.std)}</td><td>${(r.grndCor||[]).map(u=>`<span class="drBadge">${esc(u)}</span>`).join(" ")}</td><td>${(r.grndLd||[]).map(u=>`<span class="drBadge">${esc(u)}</span>`).join(" ")}</td><td>${(r.paxSupr||[]).map(u=>`<span class="drBadge">${esc(u)}</span>`).join(" ")}</td><td>${r.assignments.map(a=>`<span class="drBadge">${esc(a.user)} · ${formLabel(a.formGroup)}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table></div>`:'<div class="drEmpty">Không có tên hợp lệ ở Grnd_Cor / Grnd_Ld / Pax_Supr.</div>'}`;
  }

  root.openDailyRosterManager=function(){if(!canManageDailyRoster()){try{roleDenied?.("Tài khoản chưa được cấp quyền DAILY ROSTER.");}catch(e){}return;}ensureUI();document.getElementById("dailyRosterModal")?.classList.add("show");};
  root.closeDailyRosterManager=function(){document.getElementById("dailyRosterModal")?.classList.remove("show");};
  root.dailyRosterReadPreview=async function(){
    if(!canManageDailyRoster())return;
    const file=document.getElementById("drFile")?.files?.[0];if(!file)return setStatus("Chưa chọn file roster.",true);
    try{
      setStatus("Đang đọc "+file.name+"…");
      const parsed=await parseRosterFile(file),x=rosterRecords(parsed);
      preview={...x,sheetName:parsed.sheetName,fileName:file.name};
      renderPreview(preview);
      const md=document.getElementById("drManageDate");if(md&&preview.rosterDate)md.value=preview.rosterDate;
      document.getElementById("drPublishBtn").disabled=!preview.records.length;
      setStatus(`Đã dựng ${preview.records.length} biểu mẫu theo Grnd_Cor / Grnd_Ld / Pax_Supr. Kiểm tra bảng rồi bấm TẠO & PHÂN CÔNG.`);
    }catch(e){preview=null;document.getElementById("drPublishBtn").disabled=true;setStatus("Không đọc được roster: "+S(e?.message||e),true);}
  };

  async function publishRecords(data){
    const byDate=new Map();for(const r of data.records||[]){if(!byDate.has(r.opDate))byDate.set(r.opDate,[]);byDate.get(r.opDate).push(r);}
    let writes=0,removes=0,overrides=0;
    for(const [opDate,recs0] of byDate){
      const manRef=sagsV470Ref(MANIFEST_PATH+"/"+safeKey(opDate));let old={};try{old=(await manRef.once("value")).val()||{};}catch(e){}
      const oldItems=old.items||{},nextItems={},patch={};
      for(const baseRec of recs0){
        const oldItem=oldItems[baseRec.assignmentId]||{};
        const manual=oldItem.manualOverride===true&&S(oldItem.user);
        const effectiveUser=manual?normUser(oldItem.user):baseRec.targetUser;
        if(manual)overrides++;
        const r={...baseRec,targetUser:effectiveUser};
        const payload={engine:ENGINE,schema:2,assignmentId:r.assignmentId,targetUser:r.targetUser,originalTargetUser:baseRec.originalTargetUser||baseRec.targetUser,opDate:r.opDate,date:r.date,flightRaw:r.flightRaw,flightName:r.flightName||"",arrFlight:r.arrFlight,depFlight:r.depFlight,sta:r.sta,std:r.std,acReg:r.acReg,acType:r.acType,route:r.route,route1:r.route1,route3:r.route3,bay:r.bay,formGroup:r.formGroup,sourceColumn:r.sourceColumn,roleKey:r.roleKey,sourceFile:data.fileName||"",active:true,manualOverride:manual,publishedAtMs:Date.now(),publishedBy:normUser(currentUserProfile?.username||"")};
        patch[`${MAIL_PATH}/${safeKey(r.targetUser)}/items/${safeKey(r.assignmentId)}`]=payload;
        patch[`${REVOKE_PATH}/${safeKey(r.targetUser)}/items/${safeKey(r.assignmentId)}`]=null;
        if(oldItem.user&&normUser(oldItem.user)!==normUser(r.targetUser)){
          patch[`${MAIL_PATH}/${safeKey(oldItem.user)}/items/${safeKey(r.assignmentId)}`]=null;
          patch[`${REVOKE_PATH}/${safeKey(oldItem.user)}/items/${safeKey(r.assignmentId)}`]={assignmentId:r.assignmentId,reason:"REASSIGNED",atMs:Date.now(),by:normUser(currentUserProfile?.username||"")};
        }
        nextItems[r.assignmentId]={assignmentId:r.assignmentId,user:r.targetUser,originalUser:baseRec.originalTargetUser||baseRec.targetUser,flightRaw:r.flightRaw,flightName:r.flightName||"",formGroup:r.formGroup,sourceColumn:r.sourceColumn,roleKey:r.roleKey,manualOverride:manual};writes++;
      }
      for(const [id,x] of Object.entries(oldItems)){
        if(!nextItems[id]&&x?.user){
          patch[`${MAIL_PATH}/${safeKey(x.user)}/items/${safeKey(id)}`]=null;
          patch[`${REVOKE_PATH}/${safeKey(x.user)}/items/${safeKey(id)}`]={assignmentId:id,reason:"ROSTER_REMOVED",atMs:Date.now(),by:normUser(currentUserProfile?.username||"")};
          removes++;
        }
      }
      patch[`${MANIFEST_PATH}/${safeKey(opDate)}`]={engine:ENGINE,schema:2,opDate,fileName:data.fileName||"",columns:FIXED_ROLE_COLUMNS,publishedAtMs:Date.now(),publishedBy:normUser(currentUserProfile?.username||""),items:nextItems};
      await sagsV470Ref("").update(patch);
    }
    return {writes,removes,overrides,dates:byDate.size};
  }
  root.dailyRosterPublish=async function(){
    if(!canManageDailyRoster()||!preview?.records?.length)return;const btn=document.getElementById("drPublishBtn");if(btn)btn.disabled=true;
    try{setStatus("Đang tạo mailbox và phân công biểu mẫu…");const r=await publishRecords(preview);setStatus(`✓ Đã phân công ${r.writes} biểu mẫu cho ${r.dates} ngày. Xóa ${r.removes} phân công cũ. Giữ ${r.overrides} chuyển người thủ công.\nRAMP theo Grnd_Cor/Grnd_Ld · Pax_Supr→FSAGS 09.`);void root.dailyRosterLoadAssignments();}
    catch(e){setStatus("Không phân công được: "+S(e?.message||e),true);}
    finally{if(btn)btn.disabled=false;}
  };

  function opDateMs(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(S(iso));if(!m)return Date.now();return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0).getTime();}
  function sameFlightDate(env,rec){
    const st=env?.state||{},date=S(st.date||st.f421_date||st.f551_date||st.f09_date),flt=[S(st.fltBefore||st.f421_fltBefore||st.f551_fltBefore||st.f09_fltBefore),S(st.fltAfter||st.f421_fltAfter||st.f551_fltAfter||st.f09_fltAfter)].filter(Boolean).map(upper);
    const recFlights=[rec.arrFlight,rec.depFlight].filter(Boolean).map(upper),group=S(env?.mainForm||env?.activeFormGroup||"");
    return group===S(rec.formGroup) && date===rec.date && recFlights.some(f=>flt.includes(f));
  }
  function mergeRosterSeed(env,seed){
    env=env&&typeof env==="object"?env:{};env.state=env.state&&typeof env.state==="object"?env.state:{};const prev=env.rosterSeed||{};
    for(const [k,v] of Object.entries(seed||{})){const cur=S(env.state[k]),old=S(prev[k]);if(!cur||cur===old)env.state[k]=v;}
    env.rosterSeed={...seed};return env;
  }
  function makeRosterLocalId(rec){return "roster-"+hashId(rec.assignmentId);}
  function startPageForGroup(g){return g==="fsags421"?6:(g==="fsags551"?9:(g==="fsags09"?11:1));}
  function sanitizeRosterEnvelope(env){
    const x=env&&typeof env==="object"?env:{},src=x.state&&typeof x.state==="object"?x.state:{},state={};
    for(const [k,v] of Object.entries(src)){
      if(/attachment/i.test(k))continue;
      try{const s=JSON.stringify(v);if(s.length<=180000)state[k]=JSON.parse(s);}catch(e){}
    }
    return {state,mainForm:S(x.mainForm||x.activeFormGroup||"fsags"),activeFormGroup:S(x.mainForm||x.activeFormGroup||"fsags"),currentPage:Number(x.currentPage)||1,scrollY:0,arrivalOp:S(x.arrivalOp||"passenger"),departureOp:S(x.departureOp||"passenger"),rosterSeed:x.rosterSeed||{}};
  }
  async function readSharedAssignment(id){try{return (await sagsV470Ref(`${SESSION_PATH}/${safeKey(id)}`).once("value")).val()||null;}catch(e){return null;}}
  async function writeSharedAssignment(id,env,owner,formGroup,force=false){
    if(!id||!env)return false;
    const clean=sanitizeRosterEnvelope(env),sig=JSON.stringify(clean);
    if(!force&&rosterSyncSig.get(id)===sig)return false;
    try{await sagsV470Ref(`${SESSION_PATH}/${safeKey(id)}`).update({engine:ENGINE,schema:1,assignmentId:id,ownerUser:normUser(owner),formGroup:S(formGroup||clean.mainForm),envelope:clean,updatedAtMs:Date.now(),updatedBy:normUser(currentUserProfile?.username||owner)});rosterSyncSig.set(id,sig);return true;}catch(e){console.info("Roster shared sync",e?.message||e);return false;}
  }
  function scheduleSharedSync(meta,env,delay=260){
    const id=S(meta?.rosterAssignmentId);if(!id)return;
    if(rosterSyncTimers.has(id))clearTimeout(rosterSyncTimers.get(id));
    rosterSyncTimers.set(id,setTimeout(()=>{rosterSyncTimers.delete(id);void writeSharedAssignment(id,env,currentUserProfile?.username||"",meta.initialGroup||env?.mainForm||"",false);},delay));
  }
  async function autoReceiveOne(rec){
    if(!rec||rec.engine!==ENGINE||rec.active===false)return {ok:false,reason:"INACTIVE"};
    const me=normUser(currentUserProfile?.username||"");if(!me||me!==normUser(rec.targetUser))return {ok:false,reason:"USER"};
    const list=readFlightSessionList();let meta=list.find(x=>S(x.rosterAssignmentId)===S(rec.assignmentId));let id=meta?.id||"";
    if(!id){for(const x of list){const env=readFlightSessionEnvelope(x.id);if(sameFlightDate(env,rec)){meta=x;id=x.id;break;}}}
    const seed=seedFor(rec),now=Date.now(),shared=await readSharedAssignment(rec.assignmentId);
    if(!id){
      id=makeRosterLocalId(rec);if(list.some(x=>x.id===id))id=id+"-"+Math.random().toString(36).slice(2,6);
      meta={id,name:rec.flightName||[rec.arrFlight,rec.depFlight].filter(Boolean).join(" / ")||rec.flightRaw,customName:true,initialGroup:rec.formGroup||"fsags",arrivalOp:"passenger",departureOp:"passenger",createdAt:opDateMs(rec.opDate),updatedAt:now,rosterAssignmentId:rec.assignmentId,rosterAutoReceived:true,rosterSourceColumn:rec.sourceColumn,rosterOpDate:rec.opDate,rosterOwner:me};
      list.push(meta);writeFlightSessionList(list);
      let env=shared?.envelope&&typeof shared.envelope==="object"?JSON.parse(JSON.stringify(shared.envelope)):{state:{},mainForm:meta.initialGroup,activeFormGroup:meta.initialGroup,currentPage:startPageForGroup(meta.initialGroup),scrollY:0,arrivalOp:"passenger",departureOp:"passenger"};
      env.mainForm=meta.initialGroup;env.activeFormGroup=meta.initialGroup;env.currentPage=startPageForGroup(meta.initialGroup);
      env=mergeRosterSeed(env,seed);env.rosterAssignmentId=rec.assignmentId;env.rosterAutoReceived=true;env.rosterReceivedAtMs=now;
      localStorage.setItem(flightSessionStorageKey(id),JSON.stringify(env));
      if(!shared)void writeSharedAssignment(rec.assignmentId,env,me,meta.initialGroup,true);
      return {ok:true,created:true,id};
    }
    meta.rosterAssignmentId=rec.assignmentId;meta.rosterAutoReceived=true;meta.rosterSourceColumn=rec.sourceColumn;meta.rosterOpDate=rec.opDate;meta.rosterOwner=me;meta.initialGroup=rec.formGroup||meta.initialGroup;meta.updatedAt=now;writeFlightSessionList(list);
    let env=readFlightSessionEnvelope(id);
    if(shared?.envelope&&Number(shared.updatedAtMs||0)>Number(env?.rosterSharedAtMs||0)){
      const incoming=JSON.parse(JSON.stringify(shared.envelope));incoming.rosterSharedAtMs=Number(shared.updatedAtMs||0);env=incoming;
    }
    env.mainForm=rec.formGroup||env.mainForm;env.activeFormGroup=env.mainForm;env.currentPage=startPageForGroup(env.mainForm);
    env=mergeRosterSeed(env,seed);env.rosterAssignmentId=rec.assignmentId;env.rosterAutoReceived=true;env.rosterReceivedAtMs=env.rosterReceivedAtMs||now;
    localStorage.setItem(flightSessionStorageKey(id),JSON.stringify(env));
    return {ok:true,created:false,id};
  }
  function showToast(msg){const sig=S(msg);if(!sig||sig===lastToastSig)return;lastToastSig=sig;document.querySelectorAll(".drToast").forEach(x=>x.remove());const e=document.createElement("div");e.className="drToast";e.textContent=msg;document.body.appendChild(e);setTimeout(()=>e.remove(),4500);}
  async function processMailbox(raw){
    const items=Object.values(raw||{}).filter(x=>x&&x.engine===ENGINE&&x.active!==false),created=[];
    for(const rec of items){try{const r=await autoReceiveOne(rec);if(r.ok&&r.created)created.push(`${rec.flightRaw||rec.arrFlight||rec.depFlight} · ${formLabel(rec.formGroup)}`);}catch(e){console.info("Daily roster auto receive",e?.message||e);}}
    if(created.length){showToast(`DAILY ROSTER: tự nhận ${created.length} biểu mẫu · ${created.slice(0,3).join(", ")}${created.length>3?"…":""}`);try{window.rampProgressSyncAll?.("ROSTER_AUTO_RECEIVE");}catch(e){}try{renderFlightSessionList?.();}catch(e){}}
  }
  function stopMailbox(){try{if(mailRef&&mailCb)mailRef.off("value",mailCb);}catch(e){}mailRef=null;mailCb=null;}
  function startMailbox(){
    stopMailbox();const me=normUser(currentUserProfile?.username||"");if(!me)return;
    try{mailRef=sagsV470Ref(`${MAIL_PATH}/${safeKey(me)}/items`);mailCb=s=>void processMailbox(s.val()||{});mailRef.on("value",mailCb,e=>console.warn("Daily roster mailbox",e));}catch(e){console.warn("Daily roster mailbox start",e);}
  }
  root.dailyRosterRestartMailbox=startMailbox;
  root.dailyRosterCanManage=canManageDailyRoster;


  function manifestDate(){return S(document.getElementById("drManageDate")?.value||preview?.rosterDate||"");}
  async function loadManifest(date){if(!date)return null;try{return (await sagsV470Ref(`${MANIFEST_PATH}/${safeKey(date)}`).once("value")).val()||null;}catch(e){throw e;}}
  function renderManage(man){
    const host=document.getElementById("drManage");if(!host)return;
    const items=Object.values(man?.items||{}).filter(Boolean).sort((a,b)=>S(a.flightRaw).localeCompare(S(b.flightRaw))||S(a.formGroup).localeCompare(S(b.formGroup)));
    host.innerHTML=items.length?`<div class="drTableWrap"><table class="drTable"><thead><tr><th>Flight</th><th>Form</th><th>Vai trò</th><th>Người hiện tại</th><th>Thao tác</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.flightRaw||"")}</b></td><td>${esc(formLabel(x.formGroup))}</td><td>${esc(x.sourceColumn||"")}</td><td>${esc(x.user||"")}${x.manualOverride?` <span class="drBadge">chuyển tay</span>`:""}</td><td><button class="drBtn" style="padding:6px 9px" onclick="dailyRosterReassign('${esc(x.assignmentId||"")}')">CHUYỂN</button>${x.manualOverride&&x.originalUser?` <button class="drBtn secondary" style="padding:6px 9px" onclick="dailyRosterResetToRoster('${esc(x.assignmentId||"")}')">THEO ROSTER</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:'<div class="drEmpty">Ngày này chưa có phân công DAILY ROSTER.</div>';
  }
  root.dailyRosterLoadAssignments=async function(){
    if(!canManageDailyRoster())return;const d=manifestDate();if(!d)return setStatus("Chọn ngày để tải phân công.",true);
    try{const man=await loadManifest(d);renderManage(man);if(!man)setStatus("Ngày "+d+" chưa có manifest DAILY ROSTER.",true);}catch(e){setStatus("Không tải được phân công: "+S(e?.message||e),true);}
  };
  async function transferAssignment(id,newUser,reset=false){
    const d=manifestDate(),man=await loadManifest(d);if(!man?.items?.[id])throw new Error("Không tìm thấy assignment trong ngày đã chọn.");
    const item=man.items[id],oldUser=normUser(item.user),target=normUser(newUser);if(!target)throw new Error("Username mới không hợp lệ.");if(target===oldUser&&!reset)return {same:true};
    let payload=null;try{payload=(await sagsV470Ref(`${MAIL_PATH}/${safeKey(oldUser)}/items/${safeKey(id)}`).once("value")).val();}catch(e){}
    payload=payload||{engine:ENGINE,schema:2,assignmentId:id,opDate:d,flightRaw:item.flightRaw||"",formGroup:item.formGroup||"fsags",sourceColumn:item.sourceColumn||"",roleKey:item.roleKey||""};
    payload={...payload,targetUser:target,originalTargetUser:item.originalUser||payload.originalTargetUser||oldUser,manualOverride:!reset,reassignedFrom:oldUser,reassignedAtMs:Date.now(),reassignedBy:normUser(currentUserProfile?.username||""),active:true};
    const patch={};
    patch[`${MAIL_PATH}/${safeKey(oldUser)}/items/${safeKey(id)}`]=null;
    patch[`${MAIL_PATH}/${safeKey(target)}/items/${safeKey(id)}`]=payload;
    patch[`${REVOKE_PATH}/${safeKey(oldUser)}/items/${safeKey(id)}`]={assignmentId:id,reason:"ROSTER_REASSIGN",toUser:target,atMs:Date.now(),by:normUser(currentUserProfile?.username||"")};
    patch[`${REVOKE_PATH}/${safeKey(target)}/items/${safeKey(id)}`]=null;
    patch[`${MANIFEST_PATH}/${safeKey(d)}/items/${safeKey(id)}`]={...item,user:target,originalUser:item.originalUser||payload.originalTargetUser||oldUser,manualOverride:!reset,assignmentId:id};
    patch[`${SESSION_PATH}/${safeKey(id)}/ownerUser`]=target;
    patch[`${SESSION_PATH}/${safeKey(id)}/reassignedAtMs`]=Date.now();
    patch[`${SESSION_PATH}/${safeKey(id)}/reassignedBy`]=normUser(currentUserProfile?.username||"");
    await sagsV470Ref("").update(patch);
    return {oldUser,target,item};
  }
  root.dailyRosterReassign=async function(id){
    if(!canManageDailyRoster())return;const man=await loadManifest(manifestDate()),item=man?.items?.[id];if(!item)return setStatus("Không tìm thấy phân công để chuyển.",true);
    const u=prompt(`CHUYỂN ${item.flightRaw||""} · ${formLabel(item.formGroup)}\\nTừ: ${item.user||""}\\nNhập username người mới:`);if(u===null)return;
    try{const r=await transferAssignment(id,u,false);if(r.same)return setStatus("Username mới đang là người phụ trách hiện tại.");setStatus(`✓ Đã chuyển ${r.item.flightRaw||""} · ${formLabel(r.item.formGroup)} từ ${r.oldUser} → ${r.target}. Không cần GIAO CA.`);await root.dailyRosterLoadAssignments();}catch(e){setStatus("Không chuyển được: "+S(e?.message||e),true);}
  };
  root.dailyRosterResetToRoster=async function(id){
    if(!canManageDailyRoster())return;const man=await loadManifest(manifestDate()),item=man?.items?.[id],u=normUser(item?.originalUser||"");if(!item||!u)return setStatus("Không xác định được người gốc trong roster.",true);
    try{const r=await transferAssignment(id,u,true);setStatus(`✓ Đã trả ${r.item.flightRaw||""} · ${formLabel(r.item.formGroup)} về ${r.target} theo roster.`);await root.dailyRosterLoadAssignments();}catch(e){setStatus("Không trả về roster được: "+S(e?.message||e),true);}
  };


  function mergePVHK09Seed(env,seed){
    env=env&&typeof env==="object"?env:{};env.state=env.state&&typeof env.state==="object"?env.state:{};
    const prev=env.pvhk09RosterSeed||{};
    for(const [k,v] of Object.entries(seed||{})){
      const cur=S(env.state[k]),old=S(prev[k]);
      if(!cur||cur===old)env.state[k]=v;
    }
    env.pvhk09RosterSeed={...seed};
    return env;
  }
  function pvhk09StableId(rec){return "pvhk09-"+hashId(rec.opDate+"|"+rec.flightName);}
  function findExistingPVHK09(list,rec){
    const stable=pvhk09StableId(rec);
    let m=list.find(x=>x.id===stable||S(x.pvhk09RosterKey)===S(rec.opDate+"|"+rec.flightName));
    if(m)return m;
    for(const x of list){
      try{const env=readFlightSessionEnvelope(x.id);if(sameFlightDate(env,{...rec,formGroup:"fsags09"}))return x;}catch(e){}
    }
    return null;
  }
  root.dailyRosterPickPVHK09=function(){
    if(!canBuildPVHK09())return;
    const f=document.getElementById("pvhk09RosterFile");if(f)f.click();
  };
  root.dailyRosterCreatePVHK09FromFile=async function(file){
    if(!canBuildPVHK09()||!file)return;
    try{
      showToast("PVHK: đang đọc roster "+file.name+"…");
      const parsed=await parseRosterFile(file),data=allFlightRows(parsed),rows=data.records||[];
      if(!rows.length){alert("Không tìm thấy dòng chuyến hợp lệ trong roster.");return;}
      if(!confirm(`Tạo/cập nhật ${rows.length} F/SAGS-CXR/09 từ roster?\\n\\nMỗi form được đặt tên theo chuyến bay. Dữ liệu đã nhập tay trước đó không bị ghi đè.`))return;

      const list=readFlightSessionList();let created=0,updated=0;
      const now=Date.now();
      for(const rec of rows){
        let meta=findExistingPVHK09(list,rec),id=meta?.id||pvhk09StableId(rec);
        const seed=pvhk09SeedFor(rec);
        if(!meta){
          meta={
            id,name:rec.flightName,customName:true,initialGroup:"fsags09",
            arrivalOp:"passenger",departureOp:"passenger",
            createdAt:opDateMs(rec.opDate),updatedAt:now,
            pvhk09RosterBatch:true,pvhk09RosterKey:rec.opDate+"|"+rec.flightName,
            rosterOpDate:rec.opDate
          };
          list.push(meta);created++;
          let env={state:{},mainForm:"fsags09",activeFormGroup:"fsags09",currentPage:11,scrollY:0,arrivalOp:"passenger",departureOp:"passenger"};
          env=mergePVHK09Seed(env,seed);
          localStorage.setItem(flightSessionStorageKey(id),JSON.stringify(env));
        }else{
          meta.name=rec.flightName;meta.customName=true;meta.initialGroup="fsags09";meta.updatedAt=now;
          meta.pvhk09RosterBatch=true;meta.pvhk09RosterKey=rec.opDate+"|"+rec.flightName;meta.rosterOpDate=rec.opDate;
          let env=readFlightSessionEnvelope(id)||{state:{},mainForm:"fsags09",activeFormGroup:"fsags09",currentPage:11,scrollY:0};
          env.mainForm="fsags09";env.activeFormGroup="fsags09";env.currentPage=11;
          env=mergePVHK09Seed(env,seed);
          localStorage.setItem(flightSessionStorageKey(id),JSON.stringify(env));
          updated++;
        }
      }
      writeFlightSessionList(list);
      try{renderFlightSessionList?.();}catch(e){}
      showToast(`PVHK FSAGS 09: tạo mới ${created} · cập nhật ${updated} · tổng ${rows.length} chuyến.`);
    }catch(e){
      console.error("PVHK FSAGS09 roster",e);
      alert("Không tạo được FSAGS 09 từ roster: "+S(e?.message||e));
    }
  };

  function backupKey(id){try{return sagsOwnedKey("rosterRevokedBackupV166_"+id)}catch(e){return "rosterRevokedBackupV166_"+id}}
  async function revokeLocalAssignment(id,info={}){
    const list=readFlightSessionList(),affected=list.filter(x=>S(x.rosterAssignmentId)===S(id));if(!affected.length)return false;
    for(const meta of affected){
      const env=readFlightSessionEnvelope(meta.id);try{localStorage.setItem(backupKey(id),JSON.stringify({meta,envelope:env,revokedAtMs:Date.now(),info}));}catch(e){}
      try{await writeSharedAssignment(id,env,meta.rosterOwner||currentUserProfile?.username||"",meta.initialGroup||env?.mainForm||"",true);}catch(e){}
      localStorage.removeItem(flightSessionStorageKey(meta.id));
    }
    const ids=new Set(affected.map(x=>x.id)),next=list.filter(x=>!ids.has(x.id));writeFlightSessionList(next);
    if(ids.has(activeFlightSessionId)){
      activeFlightSessionId="";try{localStorage.removeItem(sagsOwnedKey(FLIGHT_SESSION_ACTIVE_KEY));}catch(e){}
      if(next.length){const fb=next.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];switchFlightSession(fb.id);}
      else{
        try{for(const k of Object.keys(state))delete state[k];activeKey=null;editing=null;signing=null;updateBagTotals();draw();renderAttachments();renderBBBTAttachments();renderFSAGS421Attachments();renderFSAGS551Attachments?.();renderFlightSessionList();showRoleHomeIdle?.();}catch(e){console.info("Roster revoke idle",e);}
      }
    }else try{renderFlightSessionList?.();}catch(e){}
    showToast(`DAILY ROSTER: người phụ trách đã được chuyển cho ${affected.length} biểu mẫu.`);return true;
  }
  async function processRevocations(raw){for(const x of Object.values(raw||{})){if(x?.assignmentId)try{await revokeLocalAssignment(x.assignmentId,x);}catch(e){console.info("Roster revoke",e?.message||e);}}}
  function stopRevocations(){try{if(revRef&&revCb)revRef.off("value",revCb);}catch(e){}revRef=null;revCb=null;}
  function startRevocations(){
    stopRevocations();const me=normUser(currentUserProfile?.username||"");if(!me)return;
    try{revRef=sagsV470Ref(`${REVOKE_PATH}/${safeKey(me)}/items`);revCb=s=>void processRevocations(s.val()||{});revRef.on("value",revCb,e=>console.warn("Roster revocation",e));}catch(e){console.warn("Roster revocation start",e);}
  }

  // Đồng bộ dữ liệu form roster theo sự kiện persist, không heartbeat.
  const baseRosterPersist=root.persist||persist;
  root.persist=persist=function(){
    const r=baseRosterPersist.apply(this,arguments);
    try{
      const meta=currentFlightSessionMeta?.();if(meta?.rosterAssignmentId){const env=readFlightSessionEnvelope(meta.id);scheduleSharedSync(meta,env,260);}
    }catch(e){}
    return r;
  };
  function applyRole(){ensureUI();ensureButton();}
  const baseApply=root.applyRoleUI;
  if(typeof baseApply==="function")root.applyRoleUI=applyRoleUI=function(){const r=baseApply.apply(this,arguments);setTimeout(applyRole,0);setTimeout(startMailbox,80);setTimeout(startRevocations,100);return r;};

  setTimeout(()=>{ensureUI();ensureButton();startMailbox();startRevocations();},900);
})(typeof window!=="undefined"?window:globalThis);
