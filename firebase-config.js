// E-REPORT SAGS · Firebase Web App config for GitHub Pages
// Project: e-report-sags
// V1.91: verified safe update runtime + Flight Workspace roster/assignment release.
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

(function loadSagsUpdateRuntime(){
  const BUILD="V1.91-20260820-01";
  try{
    if(document.querySelector('script[data-sags-update-runtime-loader]'))return;
    const s=document.createElement("script");
    s.src="./update-runtime.js?v="+encodeURIComponent(BUILD);
    s.async=false;
    s.setAttribute("data-sags-update-runtime-loader",BUILD);
    (document.head||document.documentElement).appendChild(s);
  }catch(e){console.warn("SAGS update runtime loader",e);}
})();
