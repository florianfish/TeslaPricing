import { describe, it, expect } from 'vitest';
import {
  parseCsvLine,
  readTeslaRows,
  groupIrveStations,
  matchStations,
  readPointStatuses,
  stationOccupancy,
  slotIndex,
  emptyStore,
  sampleAll,
  occupancyView,
  distanceM,
  formatStore,
  isValidStore,
} from '../scripts/lib/occupancy';
import { bestHourToday, parisDayHour, ageLabel } from '../src/occupancy';
import { tariffPeriodAt } from '../src/hours';

// Extraits au format des fichiers consolidés (schéma 2.3.1), colonnes réduites
const STATIC = [
  'nom_amenageur,id_station_itinerance,nom_station,coordonneesXY,nbre_pdc,id_pdc_itinerance',
  'TESLA France SARL,FRTSLP1,"Rennes, France - Cleunay","[-1.71390, 48.10370]",1,FRTSLE00A1',
  'TESLA France SARL,FRTSLP1,"Rennes, France - Cleunay","[-1.71390, 48.10370]",1,FRTSLE00A2',
  'TESLA France SARL,FRTSLP1,"Rennes, France - Cleunay","[-1.71390, 48.10370]",1,FRTSLE00A3',
  'TESLA France SARL,FRTSLP2,"Rennes, France - Avenue du Canada","[-1.65450, 48.08975]",1,FRTSLE00B1',
  'TESLA France SARL,FRTSLP2,"Rennes, France - Avenue du Canada","[-1.65450, 48.08975]",1,FRTSLE00B2',
  'Autre opérateur,FRXXXP9,"Station, ailleurs","[-1.65450, 48.08975]",1,FRXXXE0001',
  'TESLA France SARL,FRTSLP3,"Lyon, France","[4.83, 45.76]",1,FRTSLE00C1',
];

const now = new Date('2026-11-21T22:45:00Z'); // samedi 23 h 45 à Paris
const DYNAMIC = [
  'id_pdc_itinerance,etat_pdc,occupation_pdc,horodatage,etat_prise_type_2,etat_prise_type_combo_ccs,etat_prise_type_chademo,etat_prise_type_ef',
  'FRTSLE00A1,en_service,occupe,2026-11-21 22:40:00.000000+00:00,inconnu,inconnu,inconnu,inconnu',
  'FRTSLE00A2,en_service,libre,2026-11-21 22:30:00.000000+00:00,inconnu,inconnu,inconnu,inconnu',
  'FRTSLE00A3,en_service,libre,2026-03-04 14:31:01.202716+00:00,inconnu,inconnu,inconnu,inconnu', // périmé : ignoré
  'FRTSLE00B1,en_service,inconnu,2026-11-21 22:40:00.000000+00:00,inconnu,inconnu,inconnu,inconnu',
  'FRTSLE00B2,hors_service,libre,2026-11-21 22:40:00.000000+00:00,inconnu,inconnu,inconnu,inconnu',
  'FRTSLE00Z9,en_service,libre,2026-11-21 22:40:00.000000+00:00,inconnu,inconnu,inconnu,inconnu', // point inconnu
];

const ours = [
  { id: '6507', name: 'Rennes, France - Cleunay', latitude: 48.103642, longitude: -1.713845, stallCount: 3 },
  { id: '662', name: 'Rennes, France - Avenue du Canada', latitude: 48.0897, longitude: -1.6544, stallCount: 2 },
  { id: '7768', name: 'Paris, France', latitude: 48.84, longitude: 2.29, stallCount: 8 },
];

describe('lecture CSV', () => {
  it('gère les guillemets, les virgules et les guillemets doublés', () => {
    expect(parseCsvLine('a,"b, c","d ""e""",,f\r')).toEqual(['a', 'b, c', 'd "e"', '', 'f']);
  });

  it('ne garde que les points Tesla, regroupés par station avec leurs coordonnées', () => {
    const stations = groupIrveStations(readTeslaRows(STATIC));
    expect(stations.map((s) => [s.id, s.pdc.length])).toEqual([['FRTSLP1', 3], ['FRTSLP2', 2], ['FRTSLP3', 1]]);
    expect(stations[0]).toMatchObject({ name: 'Rennes, France - Cleunay', lat: 48.1037, lon: -1.7139 });
  });
});

describe('rapprochement', () => {
  it('associe chaque station à la station IRVE la plus proche, une pour une, à moins de 400 m', () => {
    const mapping = matchStations(ours, groupIrveStations(readTeslaRows(STATIC)));
    expect(mapping).toEqual({ '6507': ['FRTSLE00A1', 'FRTSLE00A2', 'FRTSLE00A3'], '662': ['FRTSLE00B1', 'FRTSLE00B2'] });
  });

  it('deux stations proches : le nombre de bornes et le nom départagent', () => {
    const irve = [
      { id: 'A', name: 'Ville, France - Nord', lat: 48, lon: -1, pdc: ['a1', 'a2', 'a3', 'a4'] },
      { id: 'B', name: 'Ville, France - Sud', lat: 48.0005, lon: -1, pdc: ['b1', 'b2'] },
    ];
    // « Sud » est à 30 m de A mais n'a que 2 bornes, comme B
    const mapping = matchStations(
      [
        { id: 'nord', name: 'Ville, France - Nord', latitude: 48.0003, longitude: -1, stallCount: 4 },
        { id: 'sud', name: 'Ville, France - Sud', latitude: 48.0003, longitude: -1.0001, stallCount: 2 },
      ],
      irve
    );
    expect(mapping).toEqual({ nord: ['a1', 'a2', 'a3', 'a4'], sud: ['b1', 'b2'] });
    expect(Math.round(distanceM(48, -1, 48.0005, -1))).toBe(56);
  });
});

describe('occupation et agrégation', () => {
  const statuses = readPointStatuses(readTeslaRows(DYNAMIC));

  it('compte les points à jour et en service, libres ou occupés', () => {
    expect(stationOccupancy(['FRTSLE00A1', 'FRTSLE00A2', 'FRTSLE00A3'], statuses, now.getTime())).toEqual({ occupied: 1, total: 2 });
    // inconnu + hors service : rien d'exploitable
    expect(stationOccupancy(['FRTSLE00B1', 'FRTSLE00B2'], statuses, now.getTime())).toBeNull();
  });

  it('case jour × heure en heure de Paris (0 = lundi 0 h), changement d’heure compris', () => {
    expect(slotIndex(now)).toBe(5 * 24 + 23); // samedi 23 h
    expect(slotIndex(new Date('2026-07-06T06:30:00Z'))).toBe(8); // lundi 8 h 30 (UTC+2)
  });

  it('cumule les échantillons et ne montre une case qu’à partir de deux relevés', () => {
    const store = emptyStore();
    store.mapping = matchStations(ours, groupIrveStations(readTeslaRows(STATIC)));
    store.current['662'] = { occupied: 1, total: 2, at: '2026-11-01T00:00:00Z' };

    const result = sampleAll(store, statuses, now);
    expect(result.stations).toBe(1);
    expect(result.unknownShare).toBeCloseTo(1 / 6);
    expect(store.current['662']).toBeUndefined(); // plus d'état à jour : ancien état retiré

    let view = occupancyView(store, '6507');
    expect(view).toMatchObject({ matched: true, points: 3, samples: 1, current: { occupied: 1, total: 2 } });
    expect(view.grid[5][23]).toBeNull();

    sampleAll(store, statuses, new Date(now.getTime() + 5 * 60_000));
    view = occupancyView(store, '6507');
    expect(view.grid[5][23]).toBe(0.5);
    expect(occupancyView(store, '7768')).toMatchObject({ matched: false, samples: 0, current: null });
  });
});

describe('interface', () => {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null as number | null));
  grid[5][15] = 0.6;
  grid[5][18] = 0.2;
  grid[5][20] = 0.2;
  grid[5][10] = 0.0; // déjà passée à 14 h

  it('meilleure heure d’ici ce soir : la moins chargée, la plus proche à égalité', () => {
    const at14h = new Date('2026-11-21T13:00:00Z'); // samedi 14 h à Paris
    expect(parisDayHour(at14h)).toEqual({ day: 5, hour: 14 });
    expect(bestHourToday(grid, at14h)).toEqual({ hour: 18, rate: 0.2 });
    expect(bestHourToday(grid, new Date('2026-11-21T22:00:00Z'))).toBeNull(); // 23 h : plus rien
  });

  it('créneau tarifaire à une heure donnée', () => {
    expect(tariffPeriodAt('09:00 - 20:00', 18 * 60)).toBe('peak');
    expect(tariffPeriodAt('09:00 - 20:00', 21 * 60)).toBe('offPeak');
    expect(tariffPeriodAt('n/a', 0)).toBeNull();
  });

  it('ancienneté lisible', () => {
    expect(ageLabel('2026-11-21T22:44:30Z', now)).toBe("à l'instant");
    expect(ageLabel('2026-11-21T22:33:00Z', now)).toBe('il y a 12 min');
    expect(ageLabel('2026-11-21T19:45:00Z', now)).toBe('il y a 3 h');
  });
});

describe('sauvegarde hebdomadaire', () => {
  const store = emptyStore();
  store.mapping = matchStations(ours, groupIrveStations(readTeslaRows(STATIC)));
  sampleAll(store, readPointStatuses(readTeslaRows(DYNAMIC)), now);

  it('fichier relu à l’identique, une station par ligne (diff lisible)', () => {
    const text = formatStore(store);
    expect(JSON.parse(text)).toEqual(store);
    expect(text.split('\n').filter((l) => l.startsWith('    "6507": '))).toHaveLength(3); // mapping, slots, current
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('n’écrase jamais la sauvegarde avec un export vide ou inattendu', () => {
    expect(isValidStore(store)).toBe(true);
    expect(isValidStore(emptyStore())).toBe(false);
    expect(isValidStore({ error: 'x' })).toBe(false);
    expect(isValidStore(null)).toBe(false);
  });
});
