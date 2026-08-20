const CACHE_NAME="sags-v2-2-20260820-01";
const BUILD="V2.2-20260820-01";
const APP_SHELL=[
  "./index.html","./version.json","./manifest.webmanifest","./firebase-config.js","./qr-local.js","./daily-roster.js","./roster-extra-seed.js","./v488-archive.js","./ai-crosscheck.js","./document-scanner.js","./admin-builder.js","./ac-limits.js","./ac-limits-simple.js","./ac-limits-ai-review.js","./bbbt-quick-entry.js","./roster-completed.js","./roster-leg-workspace.js","./roster-handoff.js",
  "./alert-mva.mp3","./alert-mvt.mp3","./alert-pushback-missing.mp3","./alert-read-sign.mp3","./alert-ket-so-moi.mp3","./alert-ket-so-thay-doi.mp3",
  "./9Gfinal.png","./VJfinal.png","./VJfinal2.png","./VUfinal.png","./CBTT.png","./ĐH.png","./KTTB.png","./VHTTB.png","./PVHK.png","./PVHLNG.png","./LNF.png","./apple-touch-icon.png","./favicon-16.png","./favicon-32.png","./icon-192.png","./icon-512.png","./login-bg.jpg","./login-logo-10years.png",
  "./page1.png","./page2.png","./page4.png","./page6.png","./page7.png","./page9.png","./page10.png","./page11.png","./page12.png","./page13.png","./sags-logo.png",
  "./fsags13-official-page1.png","./fsags13-official-page2.png","./fsags13-official-continuation.png","./rns-lj-page1.png","./rns-lj-continuation.png","./rns-tw-page1.png","./rns-tw-participants.png","./rns-ke-page1.png","./rns-ke-continuation.png"
];
self.addEventListener("install",event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);const results=await Promise.allSettled(APP_SHELL.map(async path=>{const u=new URL(path,self.location.href);u.searchParams.set("__swbuild",BUILD);const res=await fetch(new Request(u.toString(),{cache:"reload"}));if(!res.ok)throw new Error("Precache failed: "+path+" HTTP "+res.status);await cache.put(path,res.clone());return path;}));const failed=results.filter(r=>r.status==="rejected");if(failed.length)console.warn("SAGS precache partial failure",failed.map(r=>String(r.reason?.message||r.reason)));})());});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  const isNavigation=event.request.mode==="navigate";
  const isFresh=isNavigation||["/version.json","/manifest.webmanifest","/firebase-config.js","/qr-local.js","/index.html","/daily-roster.js","/roster-extra-seed.js","/ai-crosscheck.js","/document-scanner.js","/admin-builder.js","/ac-limits.js","/ac-limits-simple.js","/ac-limits-ai-review.js","/bbbt-quick-entry.js","/roster-completed.js","/roster-leg-workspace.js","/roster-handoff.js"].some(x=>url.pathname.endsWith(x));
  if(isFresh){event.respondWith((async()=>{try{const r=await fetch(event.request,{cache:"no-store"});if(r&&r.ok){const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)).catch(()=>{});}return r;}catch(_){return await caches.match(event.request)||(isNavigation?await caches.match("./index.html"):undefined);}})());return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)).catch(()=>{});}return r;})));
});
