// Google Analytics 4, activé uniquement si un ID de mesure est configuré côté serveur
// (variable GA_MEASUREMENT_ID ou option « ga_measurement_id » de l'add-on Home Assistant)
// et si le visiteur a accepté les cookies de mesure d'audience (RGPD) : rien n'est chargé avant.

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export type Consent = 'granted' | 'denied' | null;

const CONSENT_KEY = 'analytics-consent';

const TAB_TITLES: Record<string, string> = {
  map: 'Carte',
  list: 'Répertoire',
  stats: 'Évolution des prix',
  updates: 'Mises à jour',
  simulator: 'Simulateur',
};

let measurementId: string | null = null;
let loaded = false;
let currentTab: string | null = null;
const listeners = new Set<() => void>();

function readConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

let consent: Consent = readConsent();

function sendPageView(tab: string) {
  window.gtag('event', 'page_view', {
    page_title: TAB_TITLES[tab] || tab,
    page_location: `${window.location.origin}${window.location.pathname}#${tab}`,
  });
}

function loadGtag() {
  if (loaded || !measurementId) return;
  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js attend l'objet arguments, pas un tableau
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // Pages vues envoyées à chaque changement d'onglet (application monopage)
  window.gtag('config', measurementId, { send_page_view: false });

  if (currentTab) sendPageView(currentTab);
}

// Cookies _ga* déposés sur le domaine courant ou son domaine parent
function deleteGaCookies() {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (!name.startsWith('_ga')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

export async function initAnalytics() {
  try {
    const res = await fetch('api/config');
    if (!res.ok) return;
    const { gaMeasurementId } = await res.json();
    if (!gaMeasurementId) return;

    measurementId = gaMeasurementId;
    if (consent === 'granted') loadGtag();
    listeners.forEach((listener) => listener());
  } catch {
    // Analytics facultatif : ne jamais bloquer l'application
  }
}

export function trackTab(tab: string) {
  currentTab = tab;
  if (loaded) sendPageView(tab);
}

export function isAnalyticsConfigured() {
  return measurementId !== null;
}

export function getConsent(): Consent {
  return consent;
}

export function setConsent(value: 'granted' | 'denied') {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Stockage indisponible (navigation privée…) : choix valable pour la session seulement
  }
  consent = value;

  if (value === 'granted') {
    loadGtag();
  } else if (loaded) {
    // gtag.js ne peut pas être déchargé : purge des cookies puis rechargement sans le script
    deleteGaCookies();
    window.location.reload();
    return;
  }
  listeners.forEach((listener) => listener());
}

// Ré-afficher le bandeau pour modifier son choix
export function resetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // ignoré
  }
  consent = null;
  listeners.forEach((listener) => listener());
}

export function subscribeAnalytics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
