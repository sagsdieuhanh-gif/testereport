import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js";

const ACL_AI_VERSION="E_REPORT_AC_LIMITS_AI_V1_33";
const DEFAULT_FAST="gemini-3.5-flash-lite";
const DEFAULT_ACCURATE="gemini-3.6-flash";
const FAST_TIMEOUT=45000;
const ACCURATE_TIMEOUT=60000;
let aiApp=null,appCheckInstance=null,modelCache=null,lastConfig=null,lastConfigAt=0;
let modelNames={fast:DEFAULT_FAST,accurate:DEFAULT_ACCURATE};

const compactText=v=>String(v??"").replace(/\s+/g," ").trim();
function tagged(stage,e){const x=e instanceof Error?e:new Error(String(e||"Lỗi không xác định"));try{x.aclAiStage=stage}catch(_){ }return x}
function errText(e){const a=[];for(const v of [e?.message,e?.code,e?.name,e?.status,e?.statusText,e?.cause?.message,e?.cause]){const s=compactText(v);if(s&&!a.includes(s))a.push(s)}return a.join(" | ").slice(0,2200)}
function classify(e){const raw=errText(e),x=raw.toLowerCase();
  if(/app check|appcheck|recaptcha|token/.test(x))return {code:"ACL-AI-APP-CHECK",msg:"App Check chưa lấy được token cho Firebase AI Logic."};
  if(/model.*not found|not found.*model|404/.test(x))return {code:"ACL-AI-MODEL",msg:"Model AI cấu hình hiện tại không khả dụng."};
  if(/quota|429|resource.?exhausted|rate limit/.test(x))return {code:"ACL-AI-QUOTA",msg:"AI đang chạm quota/rate limit."};
  if(/permission|403|forbidden|unauthenticated|unauthorized/.test(x))return {code:"ACL-AI-PERMISSION",msg:"Firebase AI Logic từ chối quyền truy cập."};
  if(/timeout|deadline|abort/.test(x))return {code:"ACL-AI-TIMEOUT",msg:"AI xử lý ảnh quá thời gian."};
  if(/failed to fetch|network|offline|load failed/.test(x))return {code:"ACL-AI-NETWORK",msg:"Không kết nối được Firebase AI Logic."};
  if(/json|structured|parse/.test(x))return {code:"ACL-AI-JSON",msg:"AI đã trả kết quả nhưng JSON chưa hợp lệ."};
  return {code:"ACL-AI-UNKNOWN",msg:"AI A/C LIMITS chưa đọc được ảnh."};
}
async function loadConfig(force=false){
  if(!force&&lastConfig&&Date.now()-lastConfigAt<120000)return lastConfig;
  if(typeof window.sagsAiLoadConfig!=="function")throw tagged("CONFIG",new Error("Bridge cấu hình AI chưa sẵn sàng."));
  const cfg=await window.sagsAiLoadConfig();
  if(!cfg?.enabled)throw tagged("CONFIG",new Error("AI chưa được AD bật trong CẤU HÌNH AI."));
  lastConfig=cfg;lastConfigAt=Date.now();return cfg;
}
function resolveModels(cfg){
  const legacy=compactText(cfg?.model);
  return {
    fast:compactText(cfg?.fastModel)||(legacy&&/flash-lite/i.test(legacy)?legacy:DEFAULT_FAST),
    accurate:compactText(cfg?.accurateModel)||(legacy&&!/flash-lite/i.test(legacy)?legacy:DEFAULT_ACCURATE)
  };
}
function resultSchema(){return Schema.object({properties:{
  date:Schema.string(),version:Schema.string(),
  items:Schema.array({maxItems:150,items:Schema.object({properties:{
    category:Schema.enumString({enum:["APU INOP","HOLD INOP/ISSUES","SEAT INOP","OTHERS"]}),
    aircraftRegs:Schema.array({maxItems:40,items:Schema.string()}),
    restriction:Schema.string()
  }})})
}})}
async function initModels(force=false){
  if(modelCache&&!force)return modelCache;
  const cfg=await loadConfig(force),site=compactText(cfg?.appCheckSiteKey),conf=window.SAGS_FIREBASE_CONFIG;
  if(!site)throw tagged("APP_CHECK",new Error("Chưa cấu hình App Check site key."));
  if(!conf?.projectId||!conf?.apiKey||!conf?.appId)throw tagged("FIREBASE_CONFIG",new Error("Firebase Web config chưa đủ projectId/apiKey/appId."));
  if(String(conf.projectId)!=="e-report-sags")throw tagged("FIREBASE_CONFIG",new Error("AI chỉ được dùng Firebase project e-report-sags."));
  aiApp=getApps().find(a=>a.name==="SAGS_AC_LIMITS_AI")||initializeApp(conf,"SAGS_AC_LIMITS_AI");
  if(!appCheckInstance){
    try{appCheckInstance=initializeAppCheck(aiApp,{provider:new ReCaptchaEnterpriseProvider(site),isTokenAutoRefreshEnabled:true})}
    catch(e){if(!/already|initialized/i.test(String(e?.message||e)))throw tagged("APP_CHECK_INIT",e)}
  }
  const ai=getAI(aiApp,{backend:new GoogleAIBackend()});modelNames=resolveModels(cfg);const schema=resultSchema();
  const make=(name,timeout,maxOutputTokens)=>getGenerativeModel(ai,{model:name,generationConfig:{
    responseMimeType:"application/json",responseSchema:schema,maxOutputTokens,temperature:0
  }},{timeout});
  modelCache={fast:make(modelNames.fast,FAST_TIMEOUT,5000),accurate:make(modelNames.accurate,ACCURATE_TIMEOUT,6000)};
  return modelCache;
}
function loadImage(url){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(tagged("IMAGE_DECODE",new Error("Trình duyệt không đọc được file ảnh đã chọn.")));im.src=url})}
async function normalizeImage(url){
  const raw=String(url||"");if(!/^data:image\//i.test(raw))throw tagged("IMAGE_INPUT",new Error("File đã chọn không phải ảnh hợp lệ."));
  const im=await loadImage(raw),iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;
  if(!iw||!ih)throw tagged("IMAGE_SIZE",new Error("Không xác định được kích thước ảnh."));
  const scale=Math.min(1,2400/Math.max(iw,ih)),w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
  const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d",{alpha:false});
  x.fillStyle="#fff";x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.drawImage(im,0,0,w,h);
  return {dataUrl:c.toDataURL("image/jpeg",.92),width:w,height:h};
}
function inlinePart(url){const m=String(url||"").match(/^data:([^;]+);base64,(.+)$/s);if(!m)throw tagged("IMAGE_PART",new Error("Không tạo được payload ảnh."));return {inlineData:{mimeType:m[1],data:m[2]}}}
function parseJson(raw){
  let s=String(raw||"").trim();if(!s)throw tagged("JSON_EMPTY",new Error("AI không trả nội dung."));
  s=s.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  try{return JSON.parse(s)}catch(_){}
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch(_){}}
  const e=new Error("AI trả kết quả không đúng JSON.");e.aclAiRaw=s.slice(0,1200);throw tagged("JSON_PARSE",e);
}
function normalizeReg(v){return compactText(v).toUpperCase().replace(/[–—−]/g,"-").replace(/\s*-\s*/g,"-").replace(/[^A-Z0-9-]/g,"")}
function normalizeResult(j){
  const out={date:compactText(j?.date),version:compactText(j?.version),items:[]};
  for(const it of Array.isArray(j?.items)?j.items:[]){
    const cat0=compactText(it?.category).toUpperCase(),category=["APU INOP","HOLD INOP/ISSUES","SEAT INOP","OTHERS"].includes(cat0)?cat0:"OTHERS";
    const restriction=compactText(it?.restriction);if(!restriction)continue;
    const regs=[...new Set((Array.isArray(it?.aircraftRegs)?it.aircraftRegs:[]).map(normalizeReg).filter(x=>x&&/[0-9]/.test(x)))];
    if(regs.length)out.items.push({category,aircraftRegs:regs,restriction});
  }
  return out;
}
const PROMPT=`Đọc CHÍNH XÁC ảnh bảng A/C LIMITS / AIRCRAFT RESTRICTIONS.

Ảnh thường có:
- Tiêu đề "A/C LIMITS 17 AUG 2026" và "VER 01".
- Cột trái là category, có thể là ô gộp kéo dài nhiều dòng.
- Cột giữa là một hoặc nhiều A/C REG.
- Cột phải là restriction.

Trả JSON theo schema và tuân thủ:
1. date = ngày trên tiêu đề; version = VER/version.
2. category chỉ dùng: APU INOP, HOLD INOP/ISSUES, SEAT INOP, OTHERS.
3. Mỗi dòng/ô restriction là một item riêng.
4. Nếu một ô có nhiều A/C REG, đưa TẤT CẢ vào aircraftRegs và giữ cùng restriction.
5. Nếu category là ô gộp, áp dụng category đó cho các dòng bên dưới cho tới category mới.
6. Không biến Flight No, số ghế, seat 2D/51H, HOLD/CP hoặc số trong restriction thành A/C REG.
7. Không bịa. Không đọc chắc A/C REG thì bỏ dòng.
8. Giữ đúng ý nghĩa restriction và các thuật ngữ GPU, ASU, ACU, INOP, EMPTY, STILL OPERABLE, REQ, NEED.
9. Một A/C Reg có nhiều hạn chế thì trả nhiều item, không gộp mất.
10. Không giải thích ngoài JSON.`;
async function callModel(mdl,name,img){
  let out;try{out=await mdl.generateContent([PROMPT,inlinePart(img.dataUrl)])}catch(e){const x=tagged("GENERATE_CONTENT",e);x.aclAiModel=name;throw x}
  let txt="";try{txt=out?.response?.text?.()||""}catch(e){throw tagged("RESPONSE_TEXT",e)}
  const r=normalizeResult(parseJson(txt));r._meta={model:name,image:`${img.width}x${img.height}`};return r;
}
function shouldFallback(e){const x=errText(e).toLowerCase();return /timeout|json|empty|max.?tokens|model.*not found|404|503|unavailable|internal|server/.test(x)||["JSON_PARSE","JSON_EMPTY","EMPTY_ITEMS"].includes(String(e?.aclAiStage||""))}

window.acLimitsAiSelfCheck=async function(){
  const mdl=await initModels(true);
  if(appCheckInstance){try{await getToken(appCheckInstance,true)}catch(e){throw tagged("APP_CHECK_TOKEN",e)}}
  return {ok:true,version:ACL_AI_VERSION,models:modelNames,fast:!!mdl.fast,accurate:!!mdl.accurate};
};
window.acLimitsAiParseImage=async function(dataUrl){
  try{
    const img=await normalizeImage(dataUrl),mdl=await initModels(false);
    try{
      const r=await callModel(mdl.fast,modelNames.fast,img);
      if(r.items.length)return r;
      throw tagged("EMPTY_ITEMS",new Error("FAST model không tìm thấy dòng A/C LIMITS."));
    }catch(e){
      if(!shouldFallback(e))throw e;
      console.warn("A/C LIMITS AI fallback",e);
      return await callModel(mdl.accurate,modelNames.accurate,img);
    }
  }catch(e){
    const d=classify(e),raw=errText(e),x=new Error(`${d.code} · ${d.msg}${raw?` · ${raw}`:""}`);
    x.code=d.code;x.cause=e;throw x;
  }
};
window.dispatchEvent(new CustomEvent("sags-ac-limits-ai-ready",{detail:{version:ACL_AI_VERSION}}));
