import { describe, it, expect } from 'vitest';
import {
  parseTeslaData,
  applyTeslaData,
  pricingChanged,
  gridChanged,
  logImport,
  purgePriceHistory,
  type DatabaseSchema,
} from '../scripts/lib/tesla-pricing';
import type { ImportLogEntry } from '../src/types';
import { loadFixture } from './helpers';

// Réponse FindUs minimale : tarifs Tesla et non-Tesla par plage horaire
function teslaResponse(p: { peak: number; offPeak: number; ntPeak: number; ntOffPeak: number; start?: string; end?: string }) {
  return {
    publicStallCount: 12,
    maxPowerKw: 250,
    openToNonTeslas: true,
    effectivePricebooks: [
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: p.peak, startTime: p.start ?? '09:00', endTime: p.end ?? '20:00' },
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: p.offPeak, startTime: p.end ?? '20:00', endTime: p.start ?? '09:00' },
      { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: p.ntPeak },
      { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: p.ntOffPeak },
      { feeType: 'CONGESTION', rateBase: 0.5 },
    ],
  };
}

describe('parseTeslaData', () => {
  it('extrait les tarifs heures pleines / creuses Tesla et non-Tesla', () => {
    const parsed = parseTeslaData(teslaResponse({ peak: 0.4, offPeak: 0.2, ntPeak: 0.55, ntOffPeak: 0.3, start: '16:00', end: '20:00' }));
    expect(parsed?.pricing).toMatchObject({
      teslaPeak: 0.4,
      teslaOffPeak: 0.2,
      nonTeslaPeak: 0.55,
      nonTeslaOffPeak: 0.3,
      peakHours: '16:00 - 20:00',
      idleFeeStandard: 0.5,
      idleFeeCongested: 1,
    });
    expect(parsed).toMatchObject({ stallCount: 12, powerKw: 250, otherEVs: true });
  });

  it('gère un tarif unique et estime le non-Tesla (+35 %) en son absence', () => {
    const parsed = parseTeslaData({
      effectivePricebooks: [{ feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: false, rateBase: 0.4 }],
    });
    expect(parsed?.pricing).toMatchObject({ teslaPeak: 0.4, teslaOffPeak: 0.4, nonTeslaPeak: 0.54, nonTeslaOffPeak: 0.54 });
  });

  it('renvoie null sans grille tarifaire Tesla', () => {
    expect(parseTeslaData({})).toBeNull();
    expect(parseTeslaData({ effectivePricebooks: [] })).toBeNull();
    expect(parseTeslaData({ effectivePricebooks: [{ feeType: 'CHARGING', vehicleMakeType: 'NTSLA', rateBase: 0.5 }] })).toBeNull();
  });
});

describe('applyTeslaData', () => {
  const current = { peak: 0.36, offPeak: 0.16, ntPeak: 0.53, ntOffPeak: 0.22 };

  it('tarif inchangé : « confirmed », date de relevé mise à jour, aucun relevé ajouté', () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;
    const before = db.priceSnapshots.length;

    const result = applyTeslaData(db, station, teslaResponse(current), '2026-10-08');

    expect(result.outcome).toBe('confirmed');
    expect(station.lastCheckedAt).toBe('2026-10-08');
    expect(db.priceSnapshots).toHaveLength(before);
  });

  it('tarif modifié : « updated », relevé historisé avec la variation, tarif courant remplacé', () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;

    const result = applyTeslaData(db, station, teslaResponse({ ...current, offPeak: 0.2 }), '2026-10-08');

    expect(result.outcome).toBe('updated');
    // Moyenne HP/HC : (0.36 + 0.16) / 2 = 0.26 → (0.36 + 0.20) / 2 = 0.28
    expect(result.changePercentage).toBe(7.7);
    expect(station.currentPricing.teslaOffPeak).toBe(0.2);
    expect(station.lastCheckedAt).toBe('2026-10-08');
    expect(station.priceHistory?.at(-1)).toMatchObject({ id: '6507-2026-10-08', date: '2026-10-08', teslaOffPeak: 0.2, superchargerId: '6507' });
    expect(db.priceSnapshots.at(-1)?.id).toBe('6507-2026-10-08');
  });

  // Grille à trois prix : HP 0,36 (09–20 h), palier 20 h – minuit, HC 0,16 (minuit – 9 h)
  const threeLevels = (mid: number) => ({
    effectivePricebooks: [
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: 0.36, startTime: '09:00', endTime: '20:00', days: '0,1,2,3,4,5,6' },
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: mid, startTime: '20:00', endTime: '00:00', days: '0,1,2,3,4,5,6' },
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: 0.16, startTime: '00:00', endTime: '09:00', days: '0,1,2,3,4,5,6' },
      { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: 0.53, startTime: '09:00', endTime: '20:00' },
      { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: 0.22, startTime: '20:00', endTime: '09:00' },
    ],
  });

  it('première grille complète : conservée sur la station, sans compter comme un changement', () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;
    const before = db.priceSnapshots.length;

    expect(applyTeslaData(db, station, threeLevels(0.28), '2026-10-08').outcome).toBe('confirmed');
    expect(station.pricebooks?.find((s) => s.vehicle === 'TSLA' && s.start === '20:00')).toMatchObject({ vehicle: 'TSLA', rate: 0.28 });
    expect(db.priceSnapshots).toHaveLength(before);
  });

  it('palier intermédiaire modifié, HP / HC inchangés : « updated », grille historisée', () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;
    applyTeslaData(db, station, threeLevels(0.28), '2026-10-08');

    const result = applyTeslaData(db, station, threeLevels(0.3), '2026-10-15');

    expect(result).toEqual({ outcome: 'updated', changePercentage: 0 });
    expect(station.currentPricing).toMatchObject({ teslaPeak: 0.36, teslaOffPeak: 0.16 });
    expect(station.pricebooks?.find((s) => s.vehicle === 'TSLA' && s.start === '20:00')?.rate).toBe(0.3);
    expect(station.priceHistory?.at(-1)?.pricebooks?.find((s) => s.vehicle === 'TSLA' && s.start === '20:00')?.rate).toBe(0.3);
    // Même grille au relevé suivant : rien de nouveau
    expect(applyTeslaData(db, station, threeLevels(0.3), '2026-10-22').outcome).toBe('confirmed');
  });

  it("réponse invalide : « invalid », la station n'est pas marquée comme relevée", () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;

    expect(applyTeslaData(db, station, {}, '2026-10-08').outcome).toBe('invalid');
    expect(station.lastCheckedAt).toBeUndefined();
  });

  it("ne touche pas l'autre station qui partage le même slug", () => {
    const db = loadFixture();
    const station = db.superchargers.find((s) => s.id === '6507')!;
    const twin = db.superchargers.find((s) => s.id === '662')!;
    const twinPricing = structuredClone(twin.currentPricing);

    applyTeslaData(db, station, teslaResponse({ ...current, offPeak: 0.2 }), '2026-10-08');

    expect(twin.currentPricing).toEqual(twinPricing);
    expect(twin.lastCheckedAt).toBeUndefined();
  });
});

describe('logImport', () => {
  const entry = (i: number): ImportLogEntry => ({
    at: `2026-10-${String(i).padStart(2, '0')}T08:00:00.000Z`,
    collectedAt: '2026-10-01T08:00:00.000Z',
    source: 'extension',
    updated: i,
    confirmed: 0,
    skipped: 0,
  });

  it('ajoute en tête et conserve les 50 derniers imports', () => {
    const db: DatabaseSchema = loadFixture();
    for (let i = 1; i <= 60; i++) logImport(db, entry(i));
    expect(db.importLog).toHaveLength(50);
    expect(db.importLog?.[0].updated).toBe(60);
    expect(db.importLog?.at(-1)?.updated).toBe(11);
  });
});

describe('purgePriceHistory', () => {
  it('ne garde qu’un relevé par station, reconstruit depuis le tarif actuel', () => {
    const db = loadFixture();
    const result = purgePriceHistory(db);

    expect(result).toEqual({ stations: 5, removed: 1 });
    expect(db.priceSnapshots).toHaveLength(5);
    const rennes = db.superchargers.find((s) => s.id === '6507')!;
    expect(rennes.priceHistory).toEqual([
      expect.objectContaining({ id: '6507-2026-09-18', teslaOffPeak: 0.16, teslaPeak: 0.36, changePercentage: 0 }),
    ]);
    // La courbe nationale n'est pas purgée
    expect(db.nationalHistory).toHaveLength(3);
  });
});

describe('gridChanged', () => {
  const slot = (rate: number) => [{ vehicle: 'TSLA', fee: 'CHARGING', rate, uom: 'kwh', start: '20:00', end: '00:00', days: null, tou: true }];
  it('une grille absente d’un côté n’est pas un changement', () => {
    expect(gridChanged(undefined, slot(0.3))).toBe(false);
    expect(gridChanged(slot(0.3), [])).toBe(false);
    expect(gridChanged(slot(0.3), slot(0.3))).toBe(false);
    expect(gridChanged(slot(0.3), slot(0.31))).toBe(true);
  });
});

describe('pricingChanged', () => {
  const base = { teslaPeak: 0.4, teslaOffPeak: 0.2, nonTeslaPeak: 0.55, nonTeslaOffPeak: 0.3, peakHours: '09:00 - 20:00' };

  it('détecte tout changement de prix ou d’heures pleines', () => {
    expect(pricingChanged(base, { ...base })).toBe(false);
    expect(pricingChanged(base, { ...base, teslaOffPeak: 0.21 })).toBe(true);
    expect(pricingChanged(base, { ...base, nonTeslaPeak: 0.56 })).toBe(true);
    expect(pricingChanged(base, { ...base, peakHours: '10:00 - 21:00' })).toBe(true);
  });

  it('ignore les frais d’inoccupation et la date de mise à jour', () => {
    expect(pricingChanged({ ...base, idleFeeStandard: 0.5, lastUpdated: 'a' } as any, { ...base, idleFeeStandard: 1, lastUpdated: 'b' } as any)).toBe(false);
  });
});
