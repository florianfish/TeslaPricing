import React from 'react';
import { CalendarClock } from 'lucide-react';
import {
  dailySchedule,
  vehiclesOf,
  parisClock,
  priceLevels,
  hasDaySpecificSlots,
  hasOccupancyPricing,
  VEHICLE_LABELS,
  type PricebookSlot,
} from '../pricebooks';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// La plage contient-elle cette minute ? « 21:00 – 10:00 » chevauche minuit, « 20:00 – 00:00 » va jusqu'à minuit.
function inRange(start: string, end: string, minute: number): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end) || 1440;
  return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

const VEHICLE_HINTS: Record<string, string> = {
  TSLA: 'Conducteurs Tesla (et abonnés Supercharging)',
  NTSLA: 'Autres véhicules électriques, sans abonnement',
  MSP: 'Tarif publié par Tesla sous « MSP » : a priori la recharge payée via un fournisseur tiers',
};

interface Props {
  slots: PricebookSlot[];
  now: Date;
  checkedAt?: string;
}

// Grille complète de la journée, créneau par créneau et par type de véhicule, créneau en cours mis en évidence
export const PricebookSchedule: React.FC<Props> = ({ slots, now, checkedAt }) => {
  const { minute, weekday } = parisClock(now);
  const rows = dailySchedule(slots, weekday);
  const vehicles = vehiclesOf(slots);
  if (!rows.length || !vehicles.length) return null;

  const levels = priceLevels(slots, 'TSLA');
  const congestion = slots.find((s) => s.fee === 'CONGESTION' && s.vehicle === 'TSLA');

  return (
    <div className="bg-slate-950/70 rounded-2xl p-5 border border-slate-800 space-y-3" data-testid="pricebook-schedule">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-sm text-white flex items-center">
          <CalendarClock className="w-4 h-4 mr-1.5 text-red-500" />
          Grille complète de la journée
          {levels.length > 2 && (
            <span className="ml-2 px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-amber-500/15 text-amber-300 border-amber-500/40">
              {levels.length} prix différents
            </span>
          )}
        </h4>
        <span className="text-[11px] text-slate-400">
          Grille publiée par Tesla{checkedAt ? `, relevée le ${new Date(checkedAt).toLocaleDateString('fr-FR')}` : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-800">
              <th className="py-2 pr-4 font-medium">Créneau</th>
              {vehicles.map((v) => (
                <th key={v} className="py-2 pr-4 font-medium" title={VEHICLE_HINTS[v]}>
                  {VEHICLE_LABELS[v] || v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {rows.map((row) => {
              const active = inRange(row.start, row.end, minute);
              return (
                <tr key={`${row.start}-${row.end}`} className={active ? 'bg-red-500/10' : ''} data-active={active || undefined}>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {row.start} – {row.end}
                    {active && (
                      <span className="ml-1.5 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-900">
                        Maintenant
                      </span>
                    )}
                  </td>
                  {vehicles.map((v) => (
                    <td key={v} className={`py-2 pr-4 font-semibold ${v === 'TSLA' ? 'text-white' : ''}`}>
                      {typeof row.rates[v] === 'number' ? `${(row.rates[v] as number).toFixed(2)} €` : '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-slate-500 space-y-0.5">
        <p>Prix au kWh, heure de Paris.{congestion ? ` Frais d'inactivité : ${congestion.rate.toFixed(2)} €/min.` : ''}</p>
        {hasDaySpecificSlots(slots) && <p>Cette grille varie selon le jour : affichage pour aujourd'hui.</p>}
        {hasOccupancyPricing(slots) && <p>Une partie des prix dépend de l'affluence de la station.</p>}
      </div>
    </div>
  );
};
