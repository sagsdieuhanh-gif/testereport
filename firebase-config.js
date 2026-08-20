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

/* V2.0 loader on the stable V1.84 core.
 * No wrapper, no index rewriting, no polling. The V2 module is loaded once.
 */
(function(){
  "use strict";
  const BUILD="V2.0-20260820-01";
  function loadV2(){
    if(document.querySelector('script[data-sags-v2="'+BUILD+'"]'))return;
    const s=document.createElement("script");
    s.src="./flight-registry-v2.js?v="+encodeURIComponent(BUILD);
    s.async=false;s.dataset.sagsV2=BUILD;
    (document.head||document.documentElement).appendChild(s);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadV2,{once:true});
  else loadV2();
})();
