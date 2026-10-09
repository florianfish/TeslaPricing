import type { Supercharger } from '../src/types';
import { stationLabel, stationPagePath } from '../src/stationPage.js';

// Référencement : le HTML de l'application (index.html) est complété côté serveur par les balises
// propres à chaque page (titre, description, URL canonique, aperçu de partage, données structurées)
// et par un contenu lisible sans JavaScript, remplacé par l'application React au chargement.
// Sans URL publique configurée, l'instance est privée (Ingress Home Assistant) : rien n'est indexé.

const SITE_NAME = 'Superchargeurs France';
const STATUS_LABELS: Record<Supercharger['status'], string> = {
  OPEN: 'Ouvert',
  CONSTRUCTION: 'En travaux',
  PLAN: 'En projet',
};

export interface PageMeta {
  title?: string;
  description?: string;
  path: string; // relatif à la racine du site, '' pour l'accueil
  body: string;
  jsonLd?: object;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const euros = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

function replaceMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const pattern = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(pattern, `$1${escapeHtml(content)}$2`);
}

export function renderPage(template: string, page: PageMeta, publicUrl: string): string {
  let html = template;
  if (page.title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
    html = replaceMeta(html, 'property', 'og:title', page.title);
  }
  if (page.description) {
    html = replaceMeta(html, 'name', 'description', page.description);
    html = replaceMeta(html, 'property', 'og:description', page.description);
  }

  const head: string[] = [];
  if (publicUrl) {
    const url = `${publicUrl}/${page.path}`;
    head.push(
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      `<meta property="og:image" content="${escapeHtml(`${publicUrl}/og-image.png`)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
    );
  } else {
    head.push('<meta name="robots" content="noindex" />');
  }
  head.push(`<meta property="og:site_name" content="${SITE_NAME}" />`, '<meta property="og:locale" content="fr_FR" />');
  if (page.jsonLd) {
    // « < » échappé : le JSON ne peut pas refermer la balise script
    head.push(`<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`);
  }

  return html
    .replace('</head>', `    ${head.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);
}

// Accueil : présentation et liens vers chaque fiche (découverte des pages par les robots)
export function homePage(stations: Supercharger[], publicUrl: string): PageMeta {
  const open = stations.filter((s) => s.status === 'OPEN');
  const links = [...stations]
    .sort((a, b) => stationLabel(a).localeCompare(stationLabel(b), 'fr'))
    .map((s) => `<li><a href="./${stationPagePath(s)}">${escapeHtml(stationLabel(s))}</a></li>`)
    .join('');
  return {
    path: '',
    body:
      `<main class="seo-content">` +
      `<h1>Superchargeurs Tesla en France : prix au kWh et carte</h1>` +
      `<p>Observatoire des ${open.length} Superchargeurs Tesla ouverts en France : tarifs en heures pleines et heures creuses ` +
      `pour les Tesla et les autres véhicules électriques, historique des prix, carte interactive et simulateur de coût de recharge.</p>` +
      `<h2>Toutes les stations</h2><ul>${links}</ul></main>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      inLanguage: 'fr-FR',
      ...(publicUrl && { url: `${publicUrl}/` }),
    },
  };
}

export function stationPage(s: Supercharger, publicUrl: string): PageMeta {
  const label = stationLabel(s);
  const p = s.currentPricing;
  const isOpen = s.status === 'OPEN';
  const hardware = `${s.stallCount} bornes jusqu'à ${s.powerKw} kW`;

  const description = isOpen
    ? `Prix du Superchargeur Tesla ${label} (${s.postalCode ?? s.city}) : ${euros(p.teslaOffPeak)}/kWh en heures creuses, ` +
      `${euros(p.teslaPeak)}/kWh en heures pleines (${p.peakHours}) pour les Tesla` +
      (s.otherEVs ? `, ${euros(p.nonTeslaPeak)}/kWh pour les autres véhicules. ` : ' (réservé aux Tesla). ') +
      `${hardware}.`
    : `Superchargeur Tesla ${label} (${s.postalCode ?? s.city}) : ${STATUS_LABELS[s.status].toLowerCase()}, ${hardware}.`;

  const address = [s.street, [s.postalCode, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const prices = isOpen
    ? `<h2>Tarifs actuels</h2><table>` +
      `<tr><th></th><th>Heures creuses</th><th>Heures pleines (${escapeHtml(p.peakHours)})</th></tr>` +
      `<tr><th>Tesla</th><td>${euros(p.teslaOffPeak)}/kWh</td><td>${euros(p.teslaPeak)}/kWh</td></tr>` +
      (s.otherEVs ? `<tr><th>Autres véhicules</th><td>${euros(p.nonTeslaOffPeak)}/kWh</td><td>${euros(p.nonTeslaPeak)}/kWh</td></tr>` : '') +
      `</table>` +
      `<p>Frais d'inactivité : ${euros(p.idleFeeStandard)}/min (${euros(p.idleFeeCongested)}/min si la station est saturée). ` +
      `Tarif relevé le ${escapeHtml(day(s.lastCheckedAt ?? p.lastUpdated) ?? '')}.</p>`
    : '';

  return {
    title: `Superchargeur Tesla ${label} : prix au kWh | ${SITE_NAME}`,
    description,
    path: stationPagePath(s),
    body:
      `<main class="seo-content">` +
      `<h1>Superchargeur Tesla ${escapeHtml(label)}</h1>` +
      `<p>${escapeHtml(address)}${s.region ? ` (${escapeHtml(s.region)})` : ''}</p>` +
      `<p>${STATUS_LABELS[s.status]} · ${escapeHtml(hardware)}` +
      `${s.otherEVs ? ' · ouvert aux véhicules non-Tesla' : ' · réservé aux Tesla'}</p>` +
      prices +
      `<p><a href="./#/carte?station=${s.id}">Voir sur la carte</a> · <a href="./">Tous les Superchargeurs</a></p>` +
      `</main>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: `Superchargeur Tesla ${label}`,
      description,
      ...(publicUrl && { url: `${publicUrl}/${stationPagePath(s)}` }),
      address: {
        '@type': 'PostalAddress',
        streetAddress: s.street,
        postalCode: s.postalCode,
        addressLocality: s.city,
        addressRegion: s.region,
        addressCountry: 'FR',
      },
      geo: { '@type': 'GeoCoordinates', latitude: s.latitude, longitude: s.longitude },
    },
  };
}

export function robotsTxt(publicUrl: string): string {
  return publicUrl
    ? `User-agent: *\nDisallow: /api/\n\nSitemap: ${publicUrl}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}

export function sitemapXml(stations: Supercharger[], publicUrl: string): string {
  const lastmods = stations.map((s) => day(s.lastCheckedAt ?? s.currentPricing.lastUpdated)).filter(Boolean) as string[];
  const entry = (path: string, lastmod?: string) =>
    `  <url><loc>${escapeHtml(`${publicUrl}/${path}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry('', lastmods.sort().pop()),
    ...stations.map((s) => entry(stationPagePath(s), day(s.lastCheckedAt ?? s.currentPricing.lastUpdated))),
    '</urlset>',
    '',
  ].join('\n');
}
