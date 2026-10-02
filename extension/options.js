const FIELDS = { haUrl: '', importKey: '', intervalDays: 7 };
const $ = (id) => document.getElementById(id);
const say = (text) => { $('message').textContent = text; };
const fmtDate = (ms) => new Date(ms).toLocaleString('fr-FR');

const readForm = () => ({
  haUrl: $('haUrl').value.trim().replace(/\/+$/, ''),
  importKey: $('importKey').value.trim(),
  intervalDays: Math.max(1, Number($('intervalDays').value) || 7),
});

// L'accès à l'adresse de l'add-on est demandé à l'utilisateur (permission optionnelle)
const requestHostPermission = (haUrl) => {
  let origin;
  try {
    origin = new URL(haUrl).origin;
  } catch {
    return Promise.resolve(false);
  }
  return chrome.permissions.request({ origins: [`${origin}/*`] });
};

async function load() {
  const values = await chrome.storage.local.get(FIELDS);
  for (const k of Object.keys(FIELDS)) $(k).value = values[k] ?? FIELDS[k];
  renderStatus();
}

async function renderStatus() {
  const { progress, lastRun, lastSuccessAt } = await chrome.storage.local.get(['progress', 'lastRun', 'lastSuccessAt']);
  const lines = [];
  if (progress?.running) {
    const c = progress.counts;
    lines.push(`⏳ Collecte ${progress.trigger} en cours (mode ${progress.mode}) : ${progress.index + 1}/${progress.total}` +
      ` — ✅ ${c.ok} · 404 ${c.notFound} · ⛔ ${c.blocked} · ⚠️ ${c.error}`);
  }
  if (lastRun) {
    const c = lastRun.counts;
    lines.push(`Dernière collecte (${lastRun.trigger}, mode ${lastRun.mode || 'fetch'}) : ${fmtDate(lastRun.at)}, ${Math.round(lastRun.durationSec / 60)} min` +
      ` — ✅ ${c.ok} · 404 ${c.notFound} · ⛔ ${c.blocked} · ⚠️ ${c.error}`);
    if (lastRun.imported?.success) {
      lines.push(`Import Home Assistant : ${lastRun.imported.updated} tarif(s) modifié(s), ${lastRun.imported.confirmed} inchangé(s)`);
    }
    if (lastRun.abortReason) lines.push(`🛑 ${lastRun.abortReason}`);
  }
  lines.push(lastSuccessAt ? `Dernière collecte réussie : ${fmtDate(lastSuccessAt)}` : 'Aucune collecte réussie pour l’instant.');
  $('status').textContent = lines.join('\n');
  $('collect').disabled = !!progress?.running;
}

$('save').onclick = async () => {
  const values = readForm();
  // La demande de permission doit partir directement du clic
  const granted = await requestHostPermission(values.haUrl);
  await chrome.storage.local.set(values);
  say(granted ? '✅ Réglages enregistrés.' : '⚠️ Réglages enregistrés, mais l’accès à cette adresse a été refusé ou l’adresse est invalide.');
};

$('test').onclick = async () => {
  const { haUrl, importKey } = readForm();
  if (!(await requestHostPermission(haUrl))) return say('⚠️ Adresse invalide ou accès refusé.');
  say('Test en cours…');
  try {
    const stations = await fetch(`${haUrl}/api/prices/collector-stations`);
    if (!stations.ok) return say(`❌ Add-on joignable mais liste des stations en erreur (HTTP ${stations.status}).`);
    const { data } = await stations.json();
    // Un relevé vide est refusé (400) seulement si la clé est acceptée
    const probe = await fetch(`${haUrl}/api/prices/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${importKey}` },
      body: '{}',
    });
    const keyStatus = probe.status === 400 ? '✅ clé d’import acceptée'
      : probe.status === 401 ? '❌ clé d’import invalide'
      : probe.status === 403 ? '❌ import désactivé : renseigner la clé dans les options de l’add-on'
      : `❌ réponse inattendue (HTTP ${probe.status})`;
    say(`✅ Add-on joignable, ${data.length} stations à interroger.\n${keyStatus}`);
  } catch (e) {
    say(`❌ Add-on injoignable (${e.message}). Vérifier l’adresse et le port direct de l’add-on.`);
  }
};

$('collect').onclick = async () => {
  await chrome.storage.local.set(readForm());
  await chrome.runtime.sendMessage({ type: 'collect-now' });
  say('Collecte lancée : un onglet tesla.com s’ouvre en arrière-plan. Ne le fermez pas.');
  setTimeout(renderStatus, 500);
};

chrome.storage.onChanged.addListener(renderStatus);
load();
