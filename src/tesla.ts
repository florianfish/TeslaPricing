import type { Supercharger } from './types';

// Fiche FindUs de la station : adressée par le locationId Tesla (le slug ne fonctionne pas).
export function teslaStationUrl(charger: Pick<Supercharger, 'locationId'>): string | null {
  return charger.locationId
    ? `https://www.tesla.com/fr_FR/findus/location/supercharger/${encodeURIComponent(charger.locationId)}`
    : null;
}
