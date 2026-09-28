// Diagnostic : compare fetch Node et un vrai navigateur (Playwright) face à la
// protection Akamai de l'API Tesla FindUs. Exécuté dans le workflow via le VPN.
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

console.log('=== 2. Playwright (Chromium) ===');
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
const nav = await page
  .goto(`https://www.tesla.com/findus/location/supercharger/${SLUGS[0]}`, { waitUntil: 'networkidle', timeout: 60000 })
  .catch((e) => (console.log('navigation:', e.message), null));
console.log('page', nav?.status(), await page.title());
await page.waitForTimeout(5000);

for (const slug of SLUGS) {
  const res = await page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { Accept: 'application/json, text/plain, */*' } });
    return { status: r.status, body: await r.text() };
  }, apiUrl(slug));
  console.log(slug, res.status, short(res.body));
  await page.waitForTimeout(3000);
}
await browser.close();
