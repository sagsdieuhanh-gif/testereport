/* E-REPORT SAGS · SESSION BRIDGE V2.5
 * Exposes the current lexical role/profile to external V2 modules.
 * Event-driven only: no polling / no observer / no realtime listener.
 */
(function(root){
  'use strict';
  const BUILD='V2.5-20260820-02';
  const S=v=>String(v??'').trim();
  function snapshot(){
    let role='',profile=null;
    try{if(typeof currentRole!=='undefined')role=S(currentRole);}catch(_e){}
    try{if(typeof currentUserProfile!=='undefined'&&currentUserProfile)profile=currentUserProfile;}catch(_e){}
    if(!role)role=S(profile?.role||profile?.roleCode||'');
    return {role,profile:profile||{},username:S(profile?.username||profile?.userName||profile?.account||''),build:BUILD,isAD:role.toUpperCase()==='AD'||!!document?.body?.classList?.contains('role-admin')};
  }
  root.__sagsGetSession=snapshot;
  root.__SAGS_SESSION_BRIDGE_V25__={BUILD,snapshot};
})(typeof window!=='undefined'?window:globalThis);
