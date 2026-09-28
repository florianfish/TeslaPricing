// Diagnostic : compare fetch Node et un vrai navigateur (Playwright) face à la
// protection Akamai de l'API Tesla FindUs. Exécuté dans le workflow via le VPN,
// sous xvfb-run pour permettre le mode graphique (non headless).
import { chromium } from 'playwright';

const SLUGS = ['444407', '417319', 'parissupercharger'];
const apiUrl = (slug) =>
  `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${slug}&programType=supercharger&locale=en-US&isInHkMoTw=false`;
const short = (t) => t.replace(/\s+/g, ' ').slice(0, 160);

console.log('=== 1. fetch Node ===');
for (const slug of SLUGS) {
  try {
    const r = await fetch(apiUrl(slug), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
    });
    console.log(slug, r.status, short(await r.text()));
  } catch (e) {
    console.log(slug, 'ERREUR', e.message);
  }
}

const variants = [
  { name: 'Chrome graphique', opts: { headless: false, channel: 'chrome' } },
  { name: 'Chromium graphique', opts: { headless: false, channel: 'chromium' } },
];

for (const { name, opts } of variants) {
  console.log(`=== ${name} ===`);
  let browser;
  try {
    browser = await chromium.launch({ ...opts, args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1366, height: 768 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
    const page = await context.newPage();

    // a) Navigation directe vers l'URL de l'API (comme dans un navigateur)
    const direct = await page.goto(apiUrl(SLUGS[0]), { waitUntil: 'load', timeout: 45000 }).catch((e) => (console.log('direct:', e.message), null));
    console.log('a) navigation API', direct?.status(), short((await page.content()) || ''));

    // b) Page de la station puis fetch depuis la page (cookies Akamai obtenus)
    const nav = await page
      .goto(`https://www.tesla.com/findus/location/supercharger/${SLUGS[0]}`, { waitUntil: 'networkidle', timeout: 60000 })
      .catch((e) => (console.log('navigation:', e.message), null));
    console.log('b) page station', nav?.status(), await page.title());
    await page.waitForTimeout(5000);
    for (const slug of SLUGS) {
      const res = await page.evaluate(async (u) => {
        const r = await fetch(u, { headers: { Accept: 'application/json, text/plain, */*' } });
        return { status: r.status, body: await r.text() };
      }, apiUrl(slug));
      console.log('   fetch', slug, res.status, short(res.body));
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    console.log(`${name} : ERREUR`, e.message);
  } finally {
    await browser?.close();
  }
}
