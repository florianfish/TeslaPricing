// Collecteur de tarifs Tesla — exécuté DANS le navigateur, sur une page www.tesla.com.
// L'API FindUs est protégée par Akamai : seul un vrai navigateur sur une IP
// résidentielle obtient les tarifs. Ce script interroge donc l'API depuis la page
// (même origine, cookies du navigateur), puis télécharge un fichier JSON à importer
// avec `npm run import-prices -- <fichier>`.
//
// __STATIONS__ est remplacé par `npm run collector` : [[id, locationId, slug], ...]
(async () => {
  const STATIONS = __STATIONS__;
  const INTERVAL_MS = 5000;
  const KEEP = ['effectivePricebooks', 'publicStallCount', 'maxPowerKw', 'openToNonTeslas'];

  if (location.hostname !== 'www.tesla.com') {
    alert('Ouvrez d’abord une page https://www.tesla.com (par ex. /fr_FR/findus), puis relancez le collecteur.');
    return;
  }
  if (window.__teslaCollectorRunning) {
    alert('Le collecteur tourne déjà dans cet onglet.');
    return;
  }
  window.__teslaCollectorRunning = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:340px;padding:14px 16px;' +
    'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;' +
    'font:13px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)';
  box.innerHTML =
    '<b style="color:#f87171">⚡ Collecteur de tarifs Tesla</b>' +
    '<div data-s style="margin:8px 0">Démarrage…</div>' +
    '<button data-stop style="background:#dc2626;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">' +
    'Arrêter et télécharger</button>';
  document.body.appendChild(box);
  const status = box.querySelector('[data-s]');
  let stopRequested = false;
  box.querySelector('[data-stop]').onclick = () => { stopRequested = true; };

  const results = {};
  const counts = { ok: 0, notFound: 0, blocked: 0, error: 0 };
  let consecutive429 = 0;
  let abortReason = null;

  const query = async (slug) => {
    const url = `/api/findus/get-charger-details?locationSlug=${encodeURIComponent(slug)}` +
      '&programType=supercharger&locale=en-US&isInHkMoTw=false';
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' }, credentials: 'include' });
      if (!res.ok) return { status: res.status };
      const json = await res.json();
      const data = json?.data?.data;
      if (!data) return { status: 204 };
      const kept = {};
      for (const k of KEEP) if (k in data) kept[k] = data[k];
      return { status: 200, data: kept };
    } catch (e) {
      return { status: 0, error: String(e && e.message || e) };
    }
  };

  const startedAt = Date.now();
  for (let i = 0; i < STATIONS.length && !stopRequested; i++) {
    const [id, locationId, slug] = STATIONS[i];
    const eta = Math.round(((STATIONS.length - i) * INTERVAL_MS) / 60000);
    status.textContent =
      `${i + 1}/${STATIONS.length} — ✅ ${counts.ok} · 404 ${counts.notFound} · ⛔ ${counts.blocked} · ⚠️ ${counts.error}` +
      ` — reste ~${eta} min`;

    let r = { status: 404 };
    for (const candidate of [locationId, slug].filter((v, k, a) => v && a.indexOf(v) === k)) {
      r = await query(candidate);
      if (r.status !== 404) break;
    }

    if (r.status === 429) {
      consecutive429++;
      if (consecutive429 >= 2) { abortReason = 'Double HTTP 429 (limite de requêtes Tesla)'; break; }
      status.textContent = '⏳ HTTP 429 : pause de 60 s…';
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

  const payload = {
    collectedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - startedAt) / 1000),
    abortReason: abortReason || (stopRequested ? 'Arrêt manuel' : null),
    counts,
    results,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tesla-prices-${payload.collectedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  status.innerHTML =
    `${payload.abortReason ? '🛑 ' + payload.abortReason : '🏁 Terminé'} — ✅ ${counts.ok} tarifs, 404 ${counts.notFound}, ` +
    `⛔ ${counts.blocked}, ⚠️ ${counts.error}.<br>Fichier <b>${a.download}</b> téléchargé.`;
  box.querySelector('[data-stop]').remove();
  window.__teslaCollectorRunning = false;
})();
