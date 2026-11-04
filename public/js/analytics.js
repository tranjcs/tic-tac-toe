'use strict';

// Google Analytics 4 (gtag.js). Off unless the server sets GA_MEASUREMENT_ID
// (see /config.js). Exposes window.analytics.track(name, params) either way.
(() => {
  const id = window.TTT_CONFIG && window.TTT_CONFIG.gaMeasurementId;
  if (!id) {
    window.analytics = { track() {} };
    return;
  }

  // EEA, UK and Switzerland: Consent Mode starts "denied", so GA sends cookieless
  // pings only (no cookies or identifiers stored). Elsewhere analytics cookies are on.
  // Ads storage and personalization are off everywhere.
  const CONSENT_REQUIRED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH',
  ];
  const ADS_DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

  window.dataLayer = window.dataLayer || [];
  // gtag must push the `arguments` object itself, not an array.
  function gtag() { window.dataLayer.push(arguments); }

  gtag('consent', 'default', { ...ADS_DENIED, analytics_storage: 'granted' });
  gtag('consent', 'default', {
    ...ADS_DENIED,
    analytics_storage: 'denied',
    region: CONSENT_REQUIRED_REGIONS,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  // Screen resolution, device, browser, OS, language, country and referrer are
  // collected automatically; the viewport isn't, so send it with the page view.
  gtag('config', id, { viewport_size: `${window.innerWidth}x${window.innerHeight}` });

  window.analytics = {
    track(name, params) {
      gtag('event', name, params);
    },
  };
})();
