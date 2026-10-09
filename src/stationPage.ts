import type { Supercharger } from './types';

// Pages station indexables, générées par le serveur : « superchargeur-abbeville-9655 ».
// Chemin à la racine du site (sans sous-dossier) pour que les ressources relatives (./assets, api/…) restent valides.
const PAGE_PATTERN = /^superchargeur-(?:[a-z0-9-]+-)?(\d+)$/;

// Nom affiché sans le pays : « Rennes, France - Cleunay » → « Rennes - Cleunay »
export function stationLabel(charger: Pick<Supercharger, 'name'>): string {
  return charger.name.replace(/,\s*France\b/i, '').trim();
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function stationPagePath(charger: Pick<Supercharger, 'id' | 'name'>): string {
  const slug = slugify(stationLabel(charger));
  return `superchargeur-${slug ? `${slug}-` : ''}${charger.id}`;
}

// Identifiant de la station désignée par un chemin de page (avec ou sans « / » initial), sinon null
export function parseStationPagePath(pathname: string): string | null {
  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  return PAGE_PATTERN.exec(last)?.[1] ?? null;
}
