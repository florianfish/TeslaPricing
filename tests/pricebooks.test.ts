import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  normalizePricebooks,
  dailySchedule,
  priceLevels,
  rateAt,
  rateAtMinute,
  pricebooksChanged,
  formatSchedule,
  vehiclesOf,
  hasDaySpecificSlots,
  hasOccupancyPricing,
} from '../src/pricebooks';

// Grilles réelles relevées via Bright Data le 21/11/2026
const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'tesla-pricebooks.json'), 'utf-8'));
const gassin = normalizePricebooks(raw.gassin);
const lexy = normalizePricebooks(raw.lexy);

// 21/11/2026 (samedi), heure de Paris = UTC+1
const paris = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00+01:00`);

describe('normalizePricebooks', () => {
  it('garde tous les créneaux et types de véhicules', () => {
    expect(gassin).toHaveLength(18);
    expect(vehiclesOf(gassin)).toEqual(['TSLA', 'NTSLA', 'MSP']);
    expect(gassin.find((s) => s.vehicle === 'TSLA' && s.start === '20:00')).toEqual({
      vehicle: 'TSLA', fee: 'CHARGING', rate: 0.28, uom: 'kwh', start: '20:00', end: '00:00', days: null, tou: true,
    });
    expect(gassin.find((s) => s.fee === 'CONGESTION' && s.vehicle === 'TSLA')).toMatchObject({ rate: 0.5, uom: 'min', tou: false });
  });

  it('ignore les entrées invalides et retient les jours partiels et l’affluence', () => {
    const slots = normalizePricebooks([
      null,
      { feeType: 'CHARGING' },
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.3, startTime: '08:00', endTime: '12:00', days: '1,2,3', isTou: true, minSiteOccupancy: 50 },
    ]);
    expect(slots).toEqual([
      { vehicle: 'TSLA', fee: 'CHARGING', rate: 0.3, uom: 'kwh', start: '08:00', end: '12:00', days: [1, 2, 3], tou: true, minOccupancy: 50 },
    ]);
    expect(hasDaySpecificSlots(slots)).toBe(true);
    expect(hasOccupancyPricing(slots)).toBe(true);
    expect(hasDaySpecificSlots(gassin) || hasOccupancyPricing(gassin)).toBe(false);
    expect(normalizePricebooks(undefined)).toEqual([]);
  });
});

describe('grille de la journée', () => {
  it('Gassin : trois prix Tesla, dont le palier de 20 h à minuit', () => {
    expect(dailySchedule(gassin)).toEqual([
      { start: '00:00', end: '10:00', rates: { TSLA: 0.19, NTSLA: 0.27, MSP: 0.22 } },
      { start: '10:00', end: '20:00', rates: { TSLA: 0.4, NTSLA: 0.57, MSP: 0.49 } },
      { start: '20:00', end: '00:00', rates: { TSLA: 0.28, NTSLA: 0.4, MSP: 0.34 } },
    ]);
    expect(priceLevels(gassin)).toEqual([0.4, 0.28, 0.19]);
    expect(formatSchedule(gassin)).toBe('0,19 (00:00 – 10:00) · 0,40 (10:00 – 20:00) · 0,28 (20:00 – 00:00)');
  });

  it('Lexy : créneaux adjacents au même prix fusionnés, y compris autour de minuit', () => {
    expect(dailySchedule(lexy)).toEqual([
      { start: '10:00', end: '21:00', rates: { TSLA: 0.42, NTSLA: 0.57, MSP: 0.48 } },
      { start: '21:00', end: '10:00', rates: { TSLA: 0.24, NTSLA: 0.32, MSP: 0.27 } },
    ]);
    expect(priceLevels(lexy)).toEqual([0.42, 0.24]);
  });

  it('prix à une heure donnée, heure de Paris', () => {
    expect(rateAt(gassin, 'TSLA', paris('22:30'))).toBe(0.28); // le résumé HP / HC annoncerait 0,19
    expect(rateAt(gassin, 'TSLA', paris('09:59'))).toBe(0.19);
    expect(rateAt(gassin, 'NTSLA', paris('10:00'))).toBe(0.57);
    expect(rateAt(lexy, 'MSP', paris('03:00'))).toBe(0.27);
    // Hors de tout créneau : tarif de base
    expect(rateAtMinute(normalizePricebooks([{ feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.35, isTou: false }]), 'TSLA', 600)).toBe(0.35);
    expect(rateAtMinute(gassin, 'XXX', 600)).toBeNull();
  });

  it('jours partiels : la grille du jour n’utilise que les créneaux de ce jour', () => {
    const slots = normalizePricebooks([
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.3, isTou: false },
      { feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.5, startTime: '08:00', endTime: '12:00', days: '1,2,3,4,5', isTou: true },
    ]);
    expect(dailySchedule(slots, 0)).toEqual([{ start: '00:00', end: '00:00', rates: { TSLA: 0.3 } }]);
    expect(dailySchedule(slots, 1).map((r) => [r.start, r.end, r.rates.TSLA])).toEqual([
      ['08:00', '12:00', 0.5],
      ['12:00', '08:00', 0.3],
    ]);
  });
});

describe('pricebooksChanged', () => {
  it('insensible à l’ordre, sensible au moindre prix', () => {
    expect(pricebooksChanged(gassin, [...gassin].reverse())).toBe(false);
    expect(pricebooksChanged(gassin, gassin.map((s) => (s.start === '20:00' && s.vehicle === 'TSLA' ? { ...s, rate: 0.29 } : s)))).toBe(true);
    expect(pricebooksChanged(gassin, lexy)).toBe(true);
  });
});
