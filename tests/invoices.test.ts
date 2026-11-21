import { describe, it, expect } from 'vitest';
import { analyzeCharges, matchStation, periodAt, priceInEffect, type TeslaMateCharge } from '../scripts/lib/invoices';
import type { Supercharger, PriceSnapshot } from '../src/types';

const snap = (date: string, peak: number, offPeak: number, peakHours = '10:00 - 20:00'): PriceSnapshot => ({
  id: date,
  superchargerId: 'x',
  superchargerName: 'x',
  locationSlug: 'x',
  date,
  teslaPeak: peak,
  teslaOffPeak: offPeak,
  nonTeslaPeak: peak + 0.15,
  nonTeslaOffPeak: offPeak + 0.1,
  peakHours,
  source: 'test',
});

const station = (id: string, name: string, city: string, lat: number, lon: number, history: PriceSnapshot[]) =>
  ({ id, name, city, latitude: lat, longitude: lon, priceHistory: history }) as unknown as Supercharger;

const sables = station('9001', "Les Sables-d'Olonne, France", "Les Sables-d'Olonne", 46.5139, -1.7771, [
  snap('2026-06-01', 0.44, 0.2),
  snap('2026-09-01', 0.46, 0.21),
]);
const ruffec = station('9002', 'Ruffec, France', 'Ruffec', 46.0347, 0.1804, [snap('2026-07-15', 0.39, 0.19, '09:00 - 21:00')]);
const stations = [sables, ruffec];

// Sessions réelles (TeslaMate, août 2026)
const charges: TeslaMateCharge[] = [
  { charge_id: 689, start_date: '2026-08-20T20:13:22+02:00', end_date: '2026-08-20T20:39:01+02:00', address: "Supercharger Les Sables d'Olonne, Les Sables-d'Olonne", charge_energy_added: 31.84, charge_energy_used: 32.55, cost: 6.48, latitude: 46.513867, longitude: -1.77708 },
  { charge_id: 688, start_date: '2026-08-09T17:07:02+02:00', end_date: '2026-08-09T17:32:59+02:00', address: "Supercharger Les Sables d'Olonne, Les Sables-d'Olonne", charge_energy_added: 28.12, charge_energy_used: 29.73, cost: 12.46, latitude: 46.513844, longitude: -1.777056 },
  { charge_id: 686, start_date: '2026-08-08T10:34:36+02:00', end_date: '2026-08-08T10:40:41+02:00', address: 'Supercharger Ruffec, Ruffec', charge_energy_added: 10.6, charge_energy_used: 10.92, cost: 3.04, latitude: 46.034688, longitude: 0.180365 },
  { charge_id: 685, start_date: '2026-08-08T10:30:26+02:00', end_date: '2026-08-08T10:33:36+02:00', address: 'Supercharger Ruffec, Ruffec', charge_energy_added: 5.54, charge_energy_used: 6.07, cost: 3.04, latitude: 46.034688, longitude: 0.180365 },
  { charge_id: 683, start_date: '2026-08-03T14:43:55+02:00', end_date: '2026-08-03T15:15:46+02:00', address: 'Perigueux Supercharger, Boulazac Isle Manoire', charge_energy_added: 45.14, charge_energy_used: 47.54, cost: 16.52, latitude: 45.152425, longitude: 0.790072 },
  { charge_id: 681, start_date: '2026-08-01T05:01:36+02:00', end_date: '2026-08-01T07:06:15+02:00', address: 'Domicile', charge_energy_added: 6.44, charge_energy_used: 7.13, cost: 1.17, latitude: 48.040551, longitude: -1.601884 },
  { charge_id: 676, start_date: '2026-07-28T08:18:29+02:00', end_date: '2026-07-28T17:45:10+02:00', address: 'P+R Poterie, Rennes', charge_energy_added: 31.94, charge_energy_used: 34.82, cost: 0, latitude: 48.086914, longitude: -1.64312 },
];

describe('rattachement à une station', () => {
  it('par position (moins de 300 m), sinon par la ville dans l’adresse', () => {
    expect(matchStation(charges[0], stations)?.id).toBe('9001');
    expect(matchStation(charges[5], stations)).toBeNull(); // domicile
    expect(matchStation({ ...charges[2], latitude: null, longitude: null }, stations)?.id).toBe('9002');
    expect(matchStation({ charge_id: 1, start_date: '', end_date: '', address: 'Domicile, Ruffec' }, stations)).toBeNull();
  });
});

describe('tarif en vigueur', () => {
  it('dernier relevé à la date de la session, créneau à l’heure de Paris', () => {
    expect(priceInEffect(sables, new Date('2026-08-20T18:13:22Z'))?.date).toBe('2026-06-01');
    expect(priceInEffect(sables, new Date('2026-05-01T12:00:00Z'))).toBeNull();
    expect(periodAt('10:00 - 20:00', new Date('2026-08-20T18:13:22Z'))).toBe('offPeak'); // 20 h 13 à Paris
    expect(periodAt('10:00 - 20:00', new Date('2026-08-09T15:07:02Z'))).toBe('peak'); // 17 h 07
    expect(periodAt('22:00 - 06:00', new Date('2026-08-09T23:30:00Z'))).toBe('peak'); // 1 h 30, plage sur minuit
  });
});

describe('analyse des sessions', () => {
  const report = analyzeCharges(charges, stations);

  it('ne garde que les sessions payantes des stations connues, regroupe les doublons', () => {
    expect(report.sessions.map((s) => s.chargeIds)).toEqual([[689], [688], [685, 686]]);
    expect(report.unmatched).toBe(1); // Périgueux : station absente de la liste de test
  });

  it('compare le prix réel au tarif relevé du créneau', () => {
    const [hc, hp, ruffecGroup] = report.sessions;
    expect(hc).toMatchObject({ period: 'offPeak', expectedRate: 0.2, priceDate: '2026-06-01', energyUsed: 32.55, realRate: 0.199, expectedCost: 6.51, diff: -0.03 });
    expect(hp).toMatchObject({ period: 'peak', expectedRate: 0.44, realRate: 0.419, expectedCost: 13.08, diff: -0.62, offPeakCost: 5.95 });
    // Deux sessions consécutives au même coût : facture comptée une fois, énergie cumulée
    expect(ruffecGroup).toMatchObject({ cost: 3.04, energyUsed: 16.99, period: 'peak', expectedRate: 0.39, start: '2026-08-08T10:30:26+02:00' });
  });

  it('totaux : dépense, écart, économie possible en heures creuses', () => {
    expect(report.totals).toEqual({
      sessions: 3,
      compared: 3,
      cost: 21.98,
      expectedCost: 26.22, // 6,51 + 13,08 + 6,63
      diff: -4.24,
      possibleSaving: 6.51, // 12,46 − 5,95 : la session de 20 h et Ruffec sont déjà sous le tarif HC
      energy: 79.3,
    });
  });
});
