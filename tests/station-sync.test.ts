import { describe, it, expect } from 'vitest';
import { applyRegistrySites } from '../scripts/lib/station-sync';
import { loadFixture } from './helpers';

const NOW = new Date('2026-10-08T03:00:00.000Z');

// Site au format supercharge.info
const site = (overrides: Record<string, unknown>) => ({
  id: 6507,
  locationId: '300313',
  name: 'Rennes, France - Cleunay',
  status: 'OPEN',
  stallCount: 20,
  powerKilowatt: 250,
  otherEVs: true,
  address: { city: 'Rennes', zip: '35000', state: 'Bretagne', country: 'France' },
  gps: { latitude: 48.1, longitude: -1.7 },
  ...overrides,
});

describe('applyRegistrySites', () => {
  it('station inchangée : aucun événement ni mise à jour', () => {
    const db = loadFixture();
    const result = applyRegistrySites(db, [site({})], NOW);
    expect(result).toMatchObject({ created: 0, statusChanged: 0, updated: 0, events: [] });
    expect(db.lastSyncTime).toBe('2026-10-01T03:00:00.000Z');
  });

  it('changement de statut : événement historisé, tarifs conservés', () => {
    const db = loadFixture();
    const ales = db.superchargers.find((s) => s.id === '10743')!;
    const pricing = structuredClone(ales.currentPricing);

    const result = applyRegistrySites(db, [site({ id: 10743, locationId: undefined, name: 'Alès, France', status: 'OPEN', stallCount: 8 })], NOW);

    expect(result.statusChanged).toBe(1);
    expect(ales.status).toBe('OPEN');
    expect(ales.currentPricing).toEqual(pricing);
    expect(db.stationEvents?.[0]).toMatchObject({ date: '2026-10-08', type: 'STATUS', superchargerId: '10743', from: 'CONSTRUCTION', to: 'OPEN' });
    expect(db.lastSyncTime).toBe(NOW.toISOString());
  });

  it('bornes et puissance mises à jour sans toucher aux tarifs', () => {
    const db = loadFixture();
    const result = applyRegistrySites(db, [site({ stallCount: 24, powerKilowatt: 325 })], NOW);
    const rennes = db.superchargers.find((s) => s.id === '6507')!;
    expect(result.updated).toBe(1);
    expect(rennes).toMatchObject({ stallCount: 24, powerKw: 325 });
    expect(rennes.currentPricing.teslaOffPeak).toBe(0.16);
  });

  it('nouvelle station : créée avec un tarif initial et un événement « NEW »', () => {
    const db = loadFixture();
    const result = applyRegistrySites(
      db,
      [site({ id: 99999, locationId: undefined, name: 'Vitré, France', status: 'CONSTRUCTION', address: { city: 'Vitré', zip: '35500', state: 'Bretagne', country: 'France' } })],
      NOW
    );

    expect(result.created).toBe(1);
    const created = db.superchargers.find((s) => s.id === '99999')!;
    expect(created).toMatchObject({ locationSlug: 'vitresupercharger', city: 'Vitré', department: 'Dép. 35', region: 'Bretagne', status: 'CONSTRUCTION' });
    expect(created.priceHistory).toHaveLength(1);
    expect(db.priceSnapshots.some((p) => p.superchargerId === '99999')).toBe(true);
    expect(db.stationEvents?.[0]).toMatchObject({ type: 'NEW', superchargerId: '99999', to: 'CONSTRUCTION' });
  });
});
