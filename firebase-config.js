// E-REPORT SAGS · Firebase Web App config for GitHub Pages
// Project: e-report-sags
// GitHub Pages hosts the web app; Firebase is used only as backend services.
// Firebase Web config is client-side configuration. Do not place service-account/private keys here.
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

// V1.84 FLIGHT REGISTRY TEST01
// Load only once, after the original V1.84 application and daily-roster.js have finished loading.
// No polling / MutationObserver / background Flight Registry listener is used here.
(function(){
  "use strict";
  const TEST_BUILD="V1.84-FRTEST-20260820-01";
  function loadFlightRegistryTest(){
    if(document.querySelector('script[data-sags-flight-registry-test="'+TEST_BUILD+'"]'))return;
    const s=document.createElement("script");
    s.src="./flight-registry-test.js?v="+encodeURIComponent(TEST_BUILD);
    s.async=true;
    s.dataset.sagsFlightRegistryTest=TEST_BUILD;
    (document.head||document.documentElement).appendChild(s);
  }
  if(document.readyState==="complete")loadFlightRegistryTest();
  else window.addEventListener("load",loadFlightRegistryTest,{once:true});
})();
