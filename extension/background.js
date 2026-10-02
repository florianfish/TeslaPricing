// Collecteur de tarifs Tesla — service worker de l'extension.
// L'API FindUs est protégée par Akamai : seul un vrai navigateur sur une IP résidentielle
// obtient les tarifs. L'extension ouvre donc un onglet www.tesla.com en arrière-plan,
// interroge l'API depuis la page (même origine, cookies du navigateur) — ou, si Akamai refuse
// ces fetch, ouvre directement chaque URL JSON dans l'onglet — puis envoie le relevé à
// l'add-on Home Assistant (POST /api/prices/import).
//
// Le rythme (une requête toutes les N s, réglable) est tenu ici et non dans l'onglet : Chrome
// ralentit fortement les minuteries des onglets en arrière-plan. Il est mesuré entre deux débuts
// de requête (le temps de réponse compte dans le délai) et ralentit de lui-même sur HTTP 429.

const TESLA_URL = 'https://www.tesla.com/fr_FR/findus';
const MAX_DELAY_MS = 30000;
const CHECK_PERIOD_MIN = 60;
const RETRY_AFTER_FAILURE_MS = 6 * 3600 * 1000;
const STALE_RUN_MS = 2 * 3600 * 1000;
const KEEP = ['effectivePricebooks', 'publicStallCount', 'maxPowerKw', 'openToNonTeslas'];
// mode : 'auto' (fetch puis navigation si Akamai refuse), 'fetch' ou 'json' (navigation directe)
const DEFAULTS = { haUrl: '', importKey: '', intervalDays: 7, delaySec: 5, mode: 'auto' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) });

const setBadge = (text, color = '#dc2626') => {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
};

// --- Planification ---------------------------------------------------------

const setupAlarm = () => chrome.alarms.create('check', { delayInMinutes: 1, periodInMinutes: CHECK_PERIOD_MIN });

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'check') return;
  const { haUrl, importKey, intervalDays } = await getSettings();
  if (!haUrl || !importKey) return;
  const { lastSuccessAt = 0, lastAttemptAt = 0 } = await chrome.storage.local.get(['lastSuccessAt', 'lastAttemptAt']);
  const now = Date.now();
  if (now - lastSuccessAt >= intervalDays * 86400000 && now - lastAttemptAt >= RETRY_AFTER_FAILURE_MS) {
    collect('planifiée');
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'collect-now') {
    collect('manuelle');
    sendResponse({ started: true });
  }
});

// --- Collecte ----------------------------------------------------------------

const apiUrl = (id) =>
  `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${encodeURIComponent(id)}` +
  '&programType=supercharger&locale=fr-FR&isInHkMoTw=false';

// Ne garder que les champs utiles de la réponse FindUs
function keepFields(json, keep) {
  const data = json?.data?.data;
  if (!data) return { status: 204 };
  const kept = {};
  for (const k of keep) if (k in data) kept[k] = data[k];
  return { status: 200, data: kept };
}

// Mode « fetch » — exécuté dans la page www.tesla.com (monde MAIN), comme le site lui-même.
// Fonction injectée : elle doit être autonome (pas d'eval possible avec la CSP de tesla.com).
async function fetchInPage(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' }, credentials: 'include' });
    if (!res.ok) return { status: res.status };
    return { status: 200, json: await res.json() };
  } catch (e) {
    return { status: 0, error: String((e && e.message) || e) };
  }
}

const queryByFetch = async (tabId, id) => {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: fetchInPage,
    args: [apiUrl(id)],
  });
  const r = injection.result;
  return r.status === 200 ? keepFields(r.json, KEEP) : r;
};

// Mode « navigation » — l'onglet ouvre directement l'URL JSON, comme une visite manuelle.
// Akamai accepte des navigations qu'il refuse parfois en fetch. Le code HTTP est lu via webRequest.
const lastStatusByTab = new Map();
chrome.webRequest.onCompleted.addListener(
  (details) => { if (details.tabId >= 0) lastStatusByTab.set(details.tabId, details.statusCode); },
  { urls: ['https://www.tesla.com/api/findus/*'], types: ['main_frame'] }
);

const readJsonDocument = () => {
  const text = (document.querySelector('pre') || document.body)?.textContent || '';
  try {
    return { json: JSON.parse(text) };
  } catch {
    return { denied: /access denied/i.test(document.title + ' ' + text) };
  }
};

const queryByNavigation = async (tabId, id) => {
  lastStatusByTab.delete(tabId);
  const loaded = waitForTabComplete(tabId, 60000, false);
  await chrome.tabs.update(tabId, { url: apiUrl(id) });
  await loaded;
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readJsonDocument });
  const { json, denied } = injection.result || {};
  const status = lastStatusByTab.get(tabId);
  if (json && (status === undefined || status === 200)) return keepFields(json, KEEP);
  return { status: status && status !== 200 ? status : denied ? 403 : 0 };
};

const waitForTabComplete = (tabId, timeoutMs = 60000, checkCurrent = true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('La page tesla.com ne se charge pas'));
    }, timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // La page a pu finir de charger avant l'ajout de l'écouteur
    if (checkCurrent) {
      chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && onUpdated(tabId, { status: 'complete' }), () => {});
    }
  });

const saveProgress = (progress) => chrome.storage.local.set({ progress });

async function collect(trigger) {
  // Une seule collecte à la fois, y compris après un redémarrage du service worker
  const { progress } = await chrome.storage.local.get('progress');
  if (progress?.running && Date.now() - progress.startedAt < STALE_RUN_MS) return;

  const startedAt = Date.now();
  await chrome.storage.local.set({ lastAttemptAt: startedAt });
  const counts = { ok: 0, notFound: 0, blocked: 0, error: 0 };
  const results = {};
  let abortReason = null;
  let tabId = null;
  const settings = await getSettings();
  // En auto : fetch depuis la page d'abord, bascule définitive en navigation si Akamai refuse le fetch
  const autoMode = settings.mode === 'auto';
  let mode = settings.mode === 'json' ? 'navigation' : 'fetch';
  let delayMs = Math.min(MAX_DELAY_MS, Math.max(1000, Number(settings.delaySec) * 1000 || 5000));

  // Une requête au plus toutes les delayMs, comptées de début à début
  let nextRequestAt = 0;
  const pace = async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextRequestAt = Date.now() + delayMs;
  };

  // Identifiant (locationId ou slug) qui a répondu lors des collectes précédentes : essayé en premier
  const { knownCandidates = {} } = await chrome.storage.local.get('knownCandidates');

  try {
    const base = settings.haUrl.replace(/\/+$/, '');

    const stationsRes = await fetch(`${base}/api/prices/collector-stations`);
    if (!stationsRes.ok) throw new Error(`Liste des stations indisponible (HTTP ${stationsRes.status})`);
    const stations = (await stationsRes.json()).data;

    // La page FindUs pose les cookies de session Akamai. Indispensable au fetch ; en mode JSON,
    // les URL sont ouvertes directement et la page n'est chargée qu'en secours (refus 403).
    const openFindUs = async () => {
      const loaded = waitForTabComplete(tabId, 60000, false);
      await chrome.tabs.update(tabId, { url: TESLA_URL });
      await loaded;
      await sleep(3000); // laisser la page poser ses cookies de session
      warmedUp = true;
    };
    let warmedUp = false;
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    tabId = tab.id;
    await waitForTabComplete(tabId);
    if (mode === 'fetch') await openFindUs();

    let consecutive429 = 0;
    for (let i = 0; i < stations.length; i++) {
      const [id, locationId, slug] = stations[i];
      setBadge(String(Math.round((i / stations.length) * 100)), '#2563eb');
      await saveProgress({ running: true, trigger, startedAt, index: i, total: stations.length, counts, mode, delaySec: delayMs / 1000 });

      let r = { status: 404 };
      const candidates = [knownCandidates[id], locationId, slug].filter((v, k, a) => v && a.indexOf(v) === k);
      for (const candidate of candidates) {
        await pace();
        try {
          r = mode === 'fetch' ? await queryByFetch(tabId, candidate) : await queryByNavigation(tabId, candidate);
        } catch (e) {
          throw new Error(`Onglet Tesla fermé ou inaccessible (${e.message})`);
        }
        if (r.status === 200) knownCandidates[id] = candidate;
        if (r.status !== 404) break;
      }

      if (r.status === 403 && mode === 'navigation' && !warmedUp && counts.ok === 0) {
        await openFindUs();
        i--; // réessayer la même station avec les cookies de la page FindUs
        continue;
      }

      if (r.status === 403 && autoMode && mode === 'fetch' && counts.ok === 0) {
        mode = 'navigation';
        i--; // réessayer la même station en navigation directe
        continue;
      }

      if (r.status === 429) {
        if (++consecutive429 >= 2) { abortReason = 'Double HTTP 429 (limite de requêtes Tesla)'; break; }
        // Ralentir pour le reste de la collecte
        delayMs = Math.min(MAX_DELAY_MS, delayMs * 2);
        await sleep(60000);
        i--; // réessayer la même station
        continue;
      }
      consecutive429 = 0;

      results[id] = r;
      if (r.status === 200) counts.ok++;
      else if (r.status === 404) counts.notFound++;
      else if (r.status === 403) counts.blocked++;
      else counts.error++;

      // Trop de refus d'affilée : la protection Akamai bloque la session
      if (counts.ok === 0 && counts.blocked >= 5) { abortReason = 'Accès refusé (403) par Tesla dès le début'; break; }
    }
  } catch (e) {
    abortReason = e.message;
  }

  if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
  await chrome.storage.local.set({ knownCandidates });

  // Envoyer ce qui a été collecté, même partiellement
  let imported = null;
  if (counts.ok > 0) {
    try {
      const { haUrl, importKey } = settings;
      const res = await fetch(`${haUrl.replace(/\/+$/, '')}/api/prices/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${importKey}` },
        body: JSON.stringify({
          collectedAt: new Date(startedAt).toISOString(),
          durationSec: Math.round((Date.now() - startedAt) / 1000),
          abortReason,
          mode,
          counts,
          results,
        }),
      });
      imported = await res.json().catch(() => ({}));
      if (!res.ok) abortReason = `Import refusé par Home Assistant (HTTP ${res.status}) : ${imported.error || ''}`;
    } catch (e) {
      abortReason = `Home Assistant injoignable : ${e.message}`;
    }
  }

  const success = counts.ok > 0 && imported?.success;
  const summary = { at: Date.now(), trigger, mode, delaySec: delayMs / 1000, durationSec: Math.round((Date.now() - startedAt) / 1000), counts, abortReason, imported };
  await chrome.storage.local.set({
    lastRun: summary,
    progress: { running: false },
    ...(success ? { lastSuccessAt: startedAt } : {}),
  });
  setBadge(success ? '' : '!');
}
