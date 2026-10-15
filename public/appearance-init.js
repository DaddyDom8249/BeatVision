(function () {
  'use strict';
  var key = 'beatvision.appearance.v1';
  function resolve(account, local) {
    account = account && typeof account === 'object' ? account : {};
    local = local && typeof local === 'object' ? local : {};
    function valid(value, options) { return options.indexOf(value) !== -1; }
    var themes = ['classic', 'arcane'];
    var motions = ['system', 'reduce', 'full'];
    function motion(value) {
      if (valid(value.motion, motions)) return value.motion;
      if (typeof value.reducedMotion === 'boolean') return value.reducedMotion ? 'reduce' : 'system';
      return null;
    }
    return {
      theme: valid(account.theme, themes) ? account.theme : valid(local.theme, themes) ? local.theme : 'classic',
      motion: motion(account) || motion(local) || 'system'
    };
  }
  function read() {
    try { return resolve(null, JSON.parse(window.localStorage.getItem(key))); }
    catch (_) { return resolve(null, null); }
  }
  function write(value) {
    try { window.localStorage.setItem(key, JSON.stringify(resolve(value, null))); return true; }
    catch (_) { return false; }
  }
  function apply(value) {
    var preference = resolve(value, null);
    var systemReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.theme = preference.theme;
    document.documentElement.dataset.motion = preference.motion === 'reduce' || (preference.motion === 'system' && systemReduced) ? 'reduce' : 'full';
  }
  window.BeatVisionAppearance = Object.freeze({ key: key, resolve: resolve, read: read, write: write, apply: apply });
  apply(read());
}());
