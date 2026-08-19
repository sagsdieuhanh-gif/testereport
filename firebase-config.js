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

// V1.87: load the Flight Workspace architecture layer globally without changing index.html.
// The module waits for the existing E-Report globals/role UI, so current business workflows remain untouched.
(function loadSagsFlightWorkspace(){
  if(typeof document==="undefined"||document.getElementById("sagsFlightWorkspaceScript"))return;
  const s=document.createElement("script");
  s.id="sagsFlightWorkspaceScript";
  s.src="./flight-workspace.js?v=V1.87-20260820-01";
  s.defer=true;
  (document.head||document.documentElement).appendChild(s);
})();
