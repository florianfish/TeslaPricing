// Collecteur de tarifs Tesla — service worker de l'extension.
// L'API FindUs est protégée par Akamai : seul un vrai navigateur sur une IP résidentielle
// obtient les tarifs. L'extension ouvre donc un onglet www.tesla.com en arrière-plan,
// interroge l'API depuis la page (même origine, cookies du navigateur), puis envoie le
// relevé à l'add-on Home Assistant (POST /api/prices/import).
//
// Le rythme (une requête toutes les 5 s) est tenu ici et non dans l'onglet : Chrome ralentit
// fortement les minuteries des onglets en arrière-plan.

const TESLA_URL = 'https://www.tesla.com/fr_FR/findus';
const INTERVAL_MS = 5000;
const CHECK_PERIOD_MIN = 60;
const RETRY_AFTER_FAILURE_MS = 6 * 3600 * 1000;
const STALE_RUN_MS = 2 * 3600 * 1000;
const KEEP = ['effectivePricebooks', 'publicStallCount', 'maxPowerKw', 'openToNonTeslas'];
const DEFAULTS = { haUrl: '', importKey: '', intervalDays: 7 };

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

// Exécutée dans la page www.tesla.com (monde MAIN) : mêmes requêtes que le site lui-même
async function queryStation(id, keep) {
  const url = `/api/findus/get-charger-details?locationSlug=${encodeURIComponent(id)}` +
    '&programType=supercharger&locale=en-US&isInHkMoTw=false';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' }, credentials: 'include' });
    if (!res.ok) return { status: res.status };
    const json = await res.json();
    const data = json?.data?.data;
    if (!data) return { status: 204 };
    const kept = {};
    for (const k of keep) if (k in data) kept[k] = data[k];
    return { status: 200, data: kept };
  } catch (e) {
    return { status: 0, error: String((e && e.message) || e) };
  }
}

const queryInTab = async (tabId, id) => {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: queryStation,
    args: [id, KEEP],
  });
  return injection.result;
};

const waitForTabComplete = (tabId, timeoutMs = 60000) =>
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
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && onUpdated(tabId, { status: 'complete' }), () => {});
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

  try {
    const { haUrl } = await getSettings();
    const base = haUrl.replace(/\/+$/, '');

    const stationsRes = await fetch(`${base}/api/prices/collector-stations`);
    if (!stationsRes.ok) throw new Error(`Liste des stations indisponible (HTTP ${stationsRes.status})`);
    const stations = (await stationsRes.json()).data;

    const tab = await chrome.tabs.create({ url: TESLA_URL, active: false });
    tabId = tab.id;
    await waitForTabComplete(tabId);
    await sleep(3000); // laisser la page poser ses cookies de session

    let consecutive429 = 0;
    for (let i = 0; i < stations.length; i++) {
      const [id, locationId, slug] = stations[i];
      setBadge(String(Math.round((i / stations.length) * 100)), '#2563eb');
      await saveProgress({ running: true, trigger, startedAt, index: i, total: stations.length, counts });

      let r = { status: 404 };
      for (const candidate of [locationId, slug].filter((v, k, a) => v && a.indexOf(v) === k)) {
        try {
          r = await queryInTab(tabId, candidate);
        } catch (e) {
          throw new Error(`Onglet Tesla fermé ou inaccessible (${e.message})`);
        }
        if (r.status !== 404) break;
      }

      if (r.status === 429) {
        if (++consecutive429 >= 2) { abortReason = 'Double HTTP 429 (limite de requêtes Tesla)'; break; }
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

      await sleep(INTERVAL_MS);
    }
  } catch (e) {
    abortReason = e.message;
  }

  if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});

  // Envoyer ce qui a été collecté, même partiellement
  let imported = null;
  if (counts.ok > 0) {
    try {
      const { haUrl, importKey } = await getSettings();
      const res = await fetch(`${haUrl.replace(/\/+$/, '')}/api/prices/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${importKey}` },
        body: JSON.stringify({
          collectedAt: new Date(startedAt).toISOString(),
          durationSec: Math.round((Date.now() - startedAt) / 1000),
          abortReason,
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
  const summary = { at: Date.now(), trigger, durationSec: Math.round((Date.now() - startedAt) / 1000), counts, abortReason, imported };
  await chrome.storage.local.set({
    lastRun: summary,
    progress: { running: false },
    ...(success ? { lastSuccessAt: startedAt } : {}),
  });
  setBadge(success ? '' : '!');
}
