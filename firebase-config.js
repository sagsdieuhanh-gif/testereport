// E-REPORT SAGS · Firebase Web App config for GitHub Pages
// Project: e-report-sags
window.SAGS_FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyCImOnRxvqbL-sRGbiS2eFE_Wmvktgc8oI",
  authDomain: "e-report-sags.firebaseapp.com",
  databaseURL: "https://e-report-sags-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "e-report-sags",
  storageBucket: "e-report-sags.firebasestorage.app",
  messagingSenderId: "670672018280",
  appId: "1:670672018280:web:46c336986ecdbbc6a954dd",
  measurementId: "G-JFTKH5BHPX"
});

// TEST02: one-time cleanup for the legacy V1.91/V1.92 worker that rewrote index.html
// and injected flight-workspace.js. This is NOT a polling loop.
(function resetLegacyWorkspaceWorkerOnce(){
  "use strict";
  if(!("serviceWorker" in navigator))return;
  const KEY="sags-frtest02-sw-reset";
  async function workerBuild(worker){
    if(!worker)return "";
    return await new Promise(resolve=>{
      const ch=new MessageChannel(),timer=setTimeout(()=>resolve(""),450);
      ch.port1.onmessage=e=>{clearTimeout(timer);resolve(String(e?.data?.build||""));};
      try{worker.postMessage({type:"GET_BUILD"},[ch.port2]);}catch(_){clearTimeout(timer);resolve("");}
    });
  }
  window.addEventListener("load",async()=>{
    try{
      if(sessionStorage.getItem(KEY)==="done")return;
      const reg=await navigator.serviceWorker.getRegistration();
      if(!reg)return;
      const build=await workerBuild(navigator.serviceWorker.controller||reg.active);
      if(!/^V1\.(?:8[5-9]|9\d)/i.test(build))return;
      sessionStorage.setItem(KEY,"done");
      let changed=false;
      const onChange=()=>{if(changed)return;changed=true;location.reload();};
      navigator.serviceWorker.addEventListener("controllerchange",onChange,{once:true});
      await reg.update();
      if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});
      else if(reg.installing){reg.installing.addEventListener("statechange",()=>{if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});});}
    }catch(e){console.warn("[SAGS TEST02] legacy worker cleanup",e);}
  },{once:true});
})();

// Load Flight Registry TEST02 only once after the V1.84 app has finished loading.
(function(){
  "use strict";
  const TEST_BUILD="V1.84-FRTEST-20260820-02";
  function load(){
    if(document.querySelector('script[data-sags-flight-registry-test="'+TEST_BUILD+'"]'))return;
    const s=document.createElement("script");
    s.src="./flight-registry-test.js?v="+encodeURIComponent(TEST_BUILD);
    s.async=true;s.dataset.sagsFlightRegistryTest=TEST_BUILD;
    (document.head||document.documentElement).appendChild(s);
  }
  if(document.readyState==="complete")load();else window.addEventListener("load",load,{once:true});
})();
