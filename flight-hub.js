/* E-REPORT SAGS · FLIGHT HUB V2.5
 * Lightweight adapter around Flight Registry + common Flight Dossier.
 * One flight identity, one shared dossier, role-specific assignments.
 */
(function(root){
  'use strict';
  const BUILD='V2.5-20260820-02';
  const S=v=>String(v??'').trim();
  function openMine(){
    if(typeof root.sagsV2MyFlightsOpen==='function')return root.sagsV2MyFlightsOpen();
    alert('CHUYẾN CỦA TÔI chưa sẵn sàng. Hãy đóng/mở lại ứng dụng.');
  }
  function openAdminFlights(){
    if(typeof root.sagsFlightManagerOpen==='function')return root.sagsFlightManagerOpen();
    alert('QUẢN LÝ CHUYẾN chưa sẵn sàng.');
  }
  async function importRoster(file){
    if(!file)throw new Error('Chưa chọn file DAILY ROSTER.');
    if(typeof root.sagsV2ImportDailyRoster!=='function')throw new Error('Flight Registry chưa sẵn sàng.');
    return root.sagsV2ImportDailyRoster(file);
  }
  async function archiveSent(input){
    if(typeof root.sagsV2ArchiveFlightDocument!=='function')throw new Error('HỒ SƠ CHUYẾN chưa sẵn sàng.');
    return root.sagsV2ArchiveFlightDocument(input||{});
  }
  function session(){try{return root.__sagsGetSession?.()||{};}catch(_e){return {};}}
  root.openFlightHub=openMine;
  root.sagsV25OpenMyFlights=openMine;
  root.sagsV25OpenAdminFlights=openAdminFlights;
  root.sagsV25ImportDailyRoster=importRoster;
  root.sagsV25ArchiveSentDocument=archiveSent;
  root.__SAGS_FLIGHT_HUB_V25__={BUILD,openMine,openAdminFlights,importRoster,archiveSent,session,S};
})(typeof window!=='undefined'?window:globalThis);
