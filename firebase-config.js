// E-REPORT SAGS · Firebase Web App config
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
/* V2.5 loader · stable core + lightweight shared-flight modules. */
(function(){
  'use strict';
  const BUILD='V2.5-20260820-02';
  const chain=['session-bridge-v25.js','flight-registry-v2.js','flight-dossier-v2.js','flight-hub.js','admin-hub.js'];
  function loadAt(i){if(i>=chain.length)return;const src=chain[i],key=src.replace(/\.js$/,'');if(document.querySelector(`script[data-sags-v25="${key}"]`)){loadAt(i+1);return;}const s=document.createElement('script');s.src='./'+src+'?v='+encodeURIComponent(BUILD);s.async=false;s.dataset.sagsV25=key;s.onload=()=>loadAt(i+1);s.onerror=()=>console.error('[SAGS V2.5] load failed',src);(document.head||document.documentElement).appendChild(s);}
  const start=()=>loadAt(0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
