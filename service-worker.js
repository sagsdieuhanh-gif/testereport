const CACHE_NAME="sags-v1-88-flight-workspace-20260820-01";
const BUILD="V1.88-20260820-01";
const DISPLAY_VERSION="V1.88 AI";
const APP_SHELL=[
  "./index.html","./version.json","./firebase-config.js","./flight-workspace.js","./daily-roster.js","./v488-archive.js","./ai-crosscheck.js","./document-scanner.js","./admin-builder.js","./ac-limits.js","./bbbt-quick-entry.js",
  "./alert-mva.mp3","./alert-mvt.mp3","./alert-pushback-missing.mp3","./alert-read-sign.mp3","./alert-ket-so-moi.mp3","./alert-ket-so-thay-doi.mp3",
  "./9Gfinal.png","./VJfinal.png","./VJfinal2.png","./VUfinal.png","./CBTT.png","./ĐH.png","./KTTB.png","./VHTTB.png","./PVHK.png","./PVHLNG.png","./LNF.png","./apple-touch-icon.png","./favicon-16.png","./favicon-32.png","./icon-192.png","./icon-512.png","./login-bg.jpg","./login-logo-10years.png",
  "./page1.png","./page2.png","./page4.png","./page6.png","./page7.png","./page9.png","./page10.png","./page11.png","./page12.png","./page13.png","./sags-logo.png",
  "./fsags13-official-page1.png","./fsags13-official-page2.png","./fsags13-official-continuation.png","./rns-lj-page1.png","./rns-lj-continuation.png","./rns-tw-page1.png","./rns-tw-participants.png","./rns-ke-page1.png","./rns-ke-continuation.png"
];
const CRITICAL=new Set(["./index.html","./version.json","./firebase-config.js","./flight-workspace.js"]);

function patchIndexHtml(html){
  let out=String(html||"");
  out=out.replace(/const\s+APP_BUILD_VERSION\s*=\s*["'][^"']*["']\s*;/,`const APP_BUILD_VERSION="${BUILD}";`);
  out=out.replace(/const\s+APP_DISPLAY_VERSION\s*=\s*["'][^"']*["']\s*;/,`const APP_DISPLAY_VERSION="${DISPLAY_VERSION}";`);
  out=out.replace(/<script\b[^>]*src=["'][^"']*flight-workspace\.js[^"']*["'][^>]*><\/script>\s*/gi,"");
  const tag=`<script src="./flight-workspace.js?v=${BUILD}"></script>`;
  if(/<\/body\s*>/i.test(out))out=out.replace(/<\/body\s*>/i,tag+"</body>");else out+=tag;
  return out;
}
async function patchedHtmlResponse(response){
  if(!response)return response;
  const type=String(response.headers.get("content-type")||"");
  if(type&&!/text\/html|application\/xhtml\+xml/i.test(type))return response;
  const text=await response.text();
  const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("content-encoding");headers.set("cache-control","no-cache");headers.set("x-sags-build",BUILD);
  return new Response(patchIndexHtml(text),{status:response.status,statusText:response.statusText,headers});
}
async function precacheOne(cache,path){
  const u=new URL(path,self.location.href);u.searchParams.set("__swbuild",BUILD);
  try{const res=await fetch(new Request(u.toString(),{cache:"reload"}));if(!res.ok)throw new Error("HTTP "+res.status);await cache.put(path,res.clone());}
  catch(e){if(CRITICAL.has(path))throw new Error("Precache critical failed: "+path+" · "+e.message);console.warn("Precache optional failed",path,e);}
}
self.addEventListener("install",event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);for(const path of APP_SHELL)await precacheOne(cache,path);})());});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();});

async function navigationResponse(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const network=await fetch(request,{cache:"no-store"});
    if(network&&network.ok){const patched=await patchedHtmlResponse(network);await cache.put("./index.html",patched.clone());return patched;}
  }catch(e){console.info("Navigation network fallback",e?.message||e);}
  const cached=await caches.match("./index.html",{ignoreSearch:true})||await caches.match(request,{ignoreSearch:true});
  return cached?await patchedHtmlResponse(cached):Response.error();
}
async function freshAssetResponse(request){
  try{const r=await fetch(request,{cache:"no-store"});if(r&&r.ok){const c=await caches.open(CACHE_NAME);c.put(request,r.clone()).catch(()=>{});}return r;}
  catch(_){return await caches.match(request,{ignoreSearch:true});}
}
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.mode==="navigate"){event.respondWith(navigationResponse(event.request));return;}
  const fresh=["/version.json","/firebase-config.js","/flight-workspace.js","/index.html","/daily-roster.js","/ai-crosscheck.js","/document-scanner.js","/admin-builder.js","/ac-limits.js","/bbbt-quick-entry.js"].some(x=>url.pathname.endsWith(x));
  if(fresh){event.respondWith(freshAssetResponse(event.request));return;}
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)).catch(()=>{});}return r;})));
});

self.__SAGS_SW_BUILD__=BUILD;
self.__SAGS_SW_TEST__={patchIndexHtml};
