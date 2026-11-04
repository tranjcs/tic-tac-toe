'use strict';

// Google Analytics 4 (gtag.js). Exposes window.analytics.track(name, params) either way.
// GA doesn't load at all when:
//   - the server doesn't set GA_MEASUREMENT_ID (see /config.js), or
//   - the browser sends Global Privacy Control or Do Not Track, or
//   - the visitor looks like they're in the EEA, the UK or Switzerland (by time zone).
(() => {
  const off = () => { window.analytics = { track() {} }; };

  const id = window.TTT_CONFIG && window.TTT_CONFIG.gaMeasurementId;
  if (!id) return off();

  // Global Privacy Control (legally recognized in California and other US states) and the
  // older Do Not Track setting.
  const dnt = navigator.doNotTrack || window.doNotTrack;
  if (navigator.globalPrivacyControl === true || dnt === '1' || dnt === 'yes') return off();

  // Skip the EEA, UK and Switzerland entirely: no cookies and no cookieless pings either.
  // The browser's time zone needs no IP lookup. It errs toward skipping: all Europe/* zones,
  // plus EU islands and overseas regions outside Europe/*, and an unknown zone.
  const EUROPEAN_ZONES = new Set([
    'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Atlantic/Faroe',
    'Arctic/Longyearbyen', 'Asia/Nicosia', 'Asia/Famagusta', 'Africa/Ceuta',
    'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'America/Marigot',
    'America/St_Barthelemy', 'Indian/Reunion', 'Indian/Mayotte',
    'GB', 'GB-Eire', 'Eire', 'Iceland', 'Poland', 'Portugal', 'WET', 'CET', 'MET', 'EET',
  ]);
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* unknown */ }
  if (!timeZone || timeZone.startsWith('Europe/') || EUROPEAN_ZONES.has(timeZone)) return off();

  window.dataLayer = window.dataLayer || [];
  // gtag must push the `arguments` object itself, not an array.
  function gtag() { window.dataLayer.push(arguments); }

  // Ads storage and personalization are off everywhere. As a backstop for visitors in the
  // EEA, UK or Switzerland whose time zone says otherwise (travelers, misconfigured clocks),
  // Google's own IP-based region check keeps analytics cookies off there too.
  const ADS_DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  const CONSENT_REQUIRED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH',
  ];
  gtag('consent', 'default', { ...ADS_DENIED, analytics_storage: 'granted' });
  gtag('consent', 'default', { ...ADS_DENIED, analytics_storage: 'denied', region: CONSENT_REQUIRED_REGIONS });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  gtag('config', id);

  window.analytics = {
    track(name, params) {
      gtag('event', name, params);
    },
  };
})();
