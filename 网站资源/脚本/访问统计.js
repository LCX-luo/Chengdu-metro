(function () {
  'use strict';
  const config = window.MetroAnalyticsConfig || {};
  const events = new Set([
    'view-dashboard', 'view-import', 'view-help', 'view-time', 'view-explore', 'view-costs',
    'import-csv-success', 'import-pdf-success', 'load-demo-success',
    'confirm-filters', 'export-statistics', 'export-trips', 'print-report',
  ]);
  const preferenceKey = 'metro.analytics.disabled';
  let disabled = false, ready = false, started = false;
  const pending = [];
  try { disabled = localStorage.getItem(preferenceKey) === '1'; } catch (_) {}
  function allowed() {
    return !disabled && navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
  }
  let owner;
  try { if (window.parent !== window && window.parent.location.origin === location.origin) owner = window.parent.MetroAnalytics; } catch (_) {}
  function cleanPath(value) {
    try { return new URL(value, location.origin).pathname; } catch (_) { return '/'; }
  }
  // Only approved operation names and basic page metadata may leave this page.
  window.metroAnalyticsBeforeSend = function (type, payload) {
    if (!allowed() || type !== 'event' || !payload || (payload.name && !events.has(payload.name))) return false;
    const result = {};
    for (const key of ['website', 'hostname', 'language', 'screen', 'title']) {
      if (payload[key] !== undefined) result[key] = payload[key];
    }
    result.url = cleanPath(payload.url || location.pathname);
    try { result.referrer = payload.referrer ? new URL(payload.referrer).origin : ''; } catch (_) { result.referrer = ''; }
    if (payload.name) result.name = payload.name;
    return result;
  };
  function send(name) {
    try { Promise.resolve(window.umami.track(name)).catch(() => {}); } catch (_) {}
  }
  function track(name) {
    if (!events.has(name)) return;
    if (owner) { owner.track(name); return; }
    if (!allowed() || !started) return;
    if (ready) send(name);
    else if (pending.length < 30) pending.push(name);
  }
  function start() {
    if (owner || started || !allowed() || location.hostname !== config.hostname || location.protocol !== 'https:' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.websiteId || '')) return;
    let source;
    try { source = new URL(config.scriptUrl); if (source.protocol !== 'https:') return; } catch (_) { return; }
    started = true;
    const script = document.createElement('script');
    script.src = source.href;
    script.async = true;
    for (const [key, value] of Object.entries({
      'website-id': config.websiteId, domains: config.hostname,
      'exclude-search': 'true', 'exclude-hash': 'true',
      'do-not-track': 'true', 'before-send': 'metroAnalyticsBeforeSend',
    })) script.setAttribute('data-' + key, value);
    script.onload = () => {
      ready = !!window.umami;
      if (ready && allowed()) pending.splice(0).forEach(send);
      else pending.length = 0;
    };
    script.onerror = () => { pending.length = 0; };
    document.head.appendChild(script);
  }
  function setDisabled(value) {
    if (owner) { owner.setDisabled(value); return; }
    disabled = !!value;
    pending.length = 0;
    try { localStorage.setItem(preferenceKey, disabled ? '1' : '0'); } catch (_) {}
    if (!disabled) start();
  }
  window.MetroAnalytics = { track, setDisabled, isDisabled: () => owner ? owner.isDisabled() : disabled };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-analytics-optout]').forEach(input => {
      input.checked = window.MetroAnalytics.isDisabled();
      input.addEventListener('change', () => window.MetroAnalytics.setDisabled(input.checked));
    });
  });
  start();
})();
