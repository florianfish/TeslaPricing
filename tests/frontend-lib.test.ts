import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { offPeakHours, currentTariffPeriod } from '../src/hours';
import { daysSince, freshnessLevel, relativeDays, stationFreshness } from '../src/freshness';
import { distanceKm, formatDistance } from '../src/geo';
import { parseRoute, routeHash, findStation } from '../src/router';
import { CHANGELOG, parseChangelog } from '../src/changelog';
import { teslaStationUrl } from '../src/tesla';
import { loadFixture } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('hours', () => {
  it('déduit la plage d’heures creuses de la plage d’heures pleines', () => {
    expect(offPeakHours('16:00 - 20:00')).toBe('20:00 - 16:00');
    expect(offPeakHours(' 9:00-20:00 ')).toBe('20:00 - 9:00');
    expect(offPeakHours('variable')).toBeNull();
  });

  it('indique le créneau en cours à l’heure de Paris', () => {
    // 2026-10-09 : heure d'été, Paris = UTC+2
    const at = (utc: string) => new Date(`2026-10-09T${utc}:00Z`);
    expect(currentTariffPeriod('16:00 - 20:00', at('14:00'))).toBe('peak');
    expect(currentTariffPeriod('16:00 - 20:00', at('17:59'))).toBe('peak');
    expect(currentTariffPeriod('16:00 - 20:00', at('18:00'))).toBe('offPeak');
    expect(currentTariffPeriod('16:00 - 20:00', at('13:59'))).toBe('offPeak');
    expect(currentTariffPeriod('09:00 - 00:00', at('21:59'))).toBe('peak');
    expect(currentTariffPeriod('09:00 - 00:00', at('22:00'))).toBe('offPeak');
    expect(currentTariffPeriod('22:00 - 06:00', at('02:00'))).toBe('peak');
    expect(currentTariffPeriod('variable', at('12:00'))).toBeNull();
  });
});

describe('freshness', () => {
  it('compte les jours calendaires écoulés', () => {
    const now = Date.parse('2026-10-08T23:30:00Z');
    expect(daysSince('2026-10-08', now)).toBe(0);
    expect(daysSince('2026-10-07T23:59:00Z', now)).toBe(1);
    expect(daysSince('2026-09-18T08:00:00.000Z', now)).toBe(20);
    expect(daysSince('2026-10-20', now)).toBe(0);
  });

  it('classe la fraîcheur : récent ≤ 7 j, ancien > 14 j', () => {
    expect(freshnessLevel(null)).toBe('unknown');
    expect(freshnessLevel(7)).toBe('fresh');
    expect(freshnessLevel(8)).toBe('aging');
    expect(freshnessLevel(14)).toBe('aging');
    expect(freshnessLevel(15)).toBe('stale');
    expect([0, 1, 5].map(relativeDays)).toEqual(["aujourd'hui", 'hier', 'il y a 5 j']);
  });

  it('utilise le dernier passage du collecteur, à défaut le dernier changement de tarif', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const [rennes] = loadFixture().superchargers;
    expect(stationFreshness(rennes)).toEqual({ days: 20, level: 'stale', label: 'Relevé il y a 20 j' });
    expect(stationFreshness({ ...rennes, lastCheckedAt: '2026-10-07' })).toEqual({ days: 1, level: 'fresh', label: 'Relevé hier' });
  });
});

describe('tesla', () => {
  it('construit la fiche FindUs à partir du locationId', () => {
    expect(teslaStationUrl({ locationId: '413672' })).toBe('https://www.tesla.com/fr_FR/findus/location/supercharger/413672');
    expect(teslaStationUrl({})).toBeNull();
  });
});

describe('geo', () => {
  it('calcule la distance à vol d’oiseau', () => {
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const rennes = { latitude: 48.1173, longitude: -1.6778 };
    expect(distanceKm(paris, rennes)).toBeGreaterThan(305);
    expect(distanceKm(paris, rennes)).toBeLessThan(312);
    expect(distanceKm(paris, paris)).toBe(0);
    expect(formatDistance(3.14)).toBe('3,1 km');
    expect(formatDistance(46.4)).toBe('46 km');
  });
});

describe('router', () => {
  it('lit l’onglet et les paramètres du fragment d’URL', () => {
    const route = parseRoute('#/liste?q=rennes&tri=price');
    expect(route.tab).toBe('list');
    expect(route.params.get('q')).toBe('rennes');
    expect(parseRoute('').tab).toBe('map');
    expect(parseRoute('#/inconnu').tab).toBe('map');
    expect(parseRoute('#/mises-a-jour').tab).toBe('updates');
  });

  it('construit le fragment d’URL', () => {
    expect(routeHash('stats')).toBe('#/evolution');
    expect(routeHash('map', new URLSearchParams({ station: '6507' }))).toBe('#/carte?station=6507');
    for (const tab of ['map', 'list', 'stats', 'updates', 'simulator'] as const) {
      expect(parseRoute(routeHash(tab)).tab).toBe(tab);
    }
  });

  it('retrouve la station par identifiant, même quand le slug est partagé', () => {
    const { superchargers } = loadFixture();
    expect(findStation(superchargers, '662')?.name).toBe('Rennes, France - Avenue du Canada');
    expect(findStation(superchargers, '6507')?.name).toBe('Rennes, France - Cleunay');
    // Anciens liens par slug : première station correspondante
    expect(findStation(superchargers, 'ParisSupercharger')?.id).toBe('7768');
    expect(findStation(superchargers, 'inconnue')).toBeNull();
    expect(findStation(superchargers, null)).toBeNull();
  });
});

describe('changelog', () => {
  it('découpe les versions et les puces, y compris sur plusieurs lignes', () => {
    expect(parseChangelog('# Changelog\n\n## 2.0.0\n\n- Un\n  suite\n- Deux\n\n## 1.0.0\n\n- Init\n')).toEqual([
      { version: '2.0.0', changes: ['Un suite', 'Deux'] },
      { version: '1.0.0', changes: ['Init'] },
    ]);
  });

  it('documente la version de l’add-on en tête du CHANGELOG', () => {
    const config = fs.readFileSync(path.join(import.meta.dirname, '..', 'tesla-pricing', 'config.yaml'), 'utf-8');
    const version = config.match(/^version:\s*"?([^"\s]+)"?/m)?.[1];
    expect(CHANGELOG[0].version).toBe(version);
    expect(CHANGELOG.every((release) => release.changes.length > 0)).toBe(true);
  });
});
