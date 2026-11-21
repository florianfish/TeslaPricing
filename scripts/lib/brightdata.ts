// Interrogation de l'API Tesla FindUs via Bright Data Web Unlocker.
// Akamai refuse les requêtes serveur directes : Bright Data les fait passer par un navigateur
// et une IP résidentielle. On ne garde que les champs utiles de la réponse, comme l'extension.

export interface BrightDataConfig {
  token: string;
  zone: string;
  country?: string;
  endpoint?: string; // remplaçable pour les tests
  timeoutMs?: number;
}

export interface FindUsResult {
  // 200 : tarifs reçus ; 404 : identifiant inconnu de Tesla ; 429 / 403 : limité ou bloqué par Tesla ;
  // 0 : erreur Bright Data (zone, clé, crédit…) ou réseau
  status: number;
  data?: Record<string, unknown>;
  detail: string;
}

export const FINDUS_FIELDS = ['effectivePricebooks', 'publicStallCount', 'maxPowerKw', 'openToNonTeslas'];

export const findUsUrl = (id: string) =>
  `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${encodeURIComponent(id)}` +
  '&programType=supercharger&locale=fr-FR&isInHkMoTw=false';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 200);

export async function fetchFindUs(id: string, config: BrightDataConfig): Promise<FindUsResult> {
  const body: Record<string, string> = { zone: config.zone, url: findUsUrl(id), format: 'raw' };
  if (config.country) body.country = config.country;

  let res: Response;
  try {
    res = await fetch(config.endpoint || 'https://api.brightdata.com/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? 120000),
    });
  } catch (e: any) {
    return { status: 0, detail: `erreur réseau : ${e?.message || e}` };
  }

  const text = await res.text();
  if (!res.ok) {
    // Erreur de Bright Data lui-même (zone inconnue, clé refusée, crédit épuisé…)
    const brdError = res.headers.get('x-brd-error');
    return { status: 0, detail: `Bright Data HTTP ${res.status} : ${clean(brdError || text)}` };
  }

  // Réponse refusée par Tesla et relayée par Bright Data (« response status was rejected: 429 status code »)
  const rejected = text.match(/rejected:\s*(\d{3})/i);
  if (rejected) return { status: Number(rejected[1]), detail: `Tesla HTTP ${rejected[1]}` };
  if (/captcha|protection page|access denied|cpr_chlge/i.test(text) || /^\s*<(!doctype|html)/i.test(text)) {
    return { status: 403, detail: `bloqué par Tesla : ${clean(text)}` };
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 0, detail: `réponse non JSON : ${clean(text)}` };
  }
  const data = json?.data?.data;
  if (!data || typeof data !== 'object') return { status: 404, detail: 'station inconnue de Tesla' };

  const kept: Record<string, unknown> = {};
  for (const k of FINDUS_FIELDS) if (k in data) kept[k] = data[k];
  return { status: 200, data: kept, detail: 'OK' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Interroger une station : identifiants dans l'ordre (locationId puis slug), en retentant le même
// identifiant après une pause quand Tesla limite (429) ou bloque (403, captcha).
export async function fetchStation(
  candidates: string[],
  config: BrightDataConfig,
  options: { retries?: number; retryPauseMs?: number; onAttempt?: (candidate: string, r: FindUsResult, attempt: number) => void } = {}
): Promise<FindUsResult & { candidate?: string; requests: number }> {
  const retries = options.retries ?? 2;
  const pause = options.retryPauseMs ?? 20000;
  let last: FindUsResult = { status: 404, detail: 'aucun identifiant Tesla' };
  let requests = 0;

  for (const candidate of candidates) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(pause * attempt);
      requests++;
      last = await fetchFindUs(candidate, config);
      options.onAttempt?.(candidate, last, attempt);
      if (last.status !== 429 && last.status !== 403) break;
    }
    if (last.status === 200) return { ...last, candidate, requests };
    // Seul un identifiant inconnu (404) justifie d'essayer le suivant ; blocage ou erreur Bright Data : on s'arrête
    if (last.status !== 404) break;
  }
  return { ...last, requests };
}
