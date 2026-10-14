/* BENUTZT-WENN: Meine Lizenzen öffnet die installierte Mac-App.
   Aufrufer: K1 collection.js beim freigegebenen Download-Block.
   Zugang bleibt im Speicher und im URI-Fragment; niemals protokollieren. */
(function () {
  'use strict';
  window.SecretControlCenter = Object.freeze({
    open: function (access) {
      if (typeof access !== 'string' || !/^[a-f0-9]{64}$/.test(access)) return false;
      window.location.assign('secretcontrolcenter://login#access=' + access);
      return true;
    }
  });
})();
