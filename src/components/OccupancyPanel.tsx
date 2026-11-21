import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { SuperchargerPricing } from '../types';
import { tariffPeriodAt } from '../hours';
import { DAY_LABELS, ageLabel, bestHourToday, parisDayHour, type OccupancyResponse } from '../occupancy';

interface Props {
  stationId: string;
  pricing: SuperchargerPricing;
  now: Date;
}

const cellStyle = (rate: number | null): React.CSSProperties =>
  rate == null ? {} : { backgroundColor: `rgba(239, 68, 68, ${(0.08 + 0.85 * rate).toFixed(2)})` };

// Affluence de la station : en ce moment, moyenne par jour × heure, meilleure heure d'ici ce soir
export const OccupancyPanel: React.FC<Props> = ({ stationId, pricing, now }) => {
  const [data, setData] = useState<OccupancyResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`api/superchargers/${encodeURIComponent(stationId)}/occupancy`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setData(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  // Fonction désactivée ou station absente des données publiques : rien à montrer
  if (!data || !data.enabled || !data.matched) return null;

  const { day, hour } = parisDayHour(now);
  const best = bestHourToday(data.grid, now);
  const bestPeriod = best ? tariffPeriodAt(pricing.peakHours, best.hour * 60) : null;
  const bestPrice = bestPeriod === 'peak' ? pricing.teslaPeak : bestPeriod === 'offPeak' ? pricing.teslaOffPeak : null;
  const hasGrid = data.grid.some((row) => row.some((v) => v != null));

  return (
    <div className="bg-slate-950/70 rounded-2xl p-5 border border-slate-800 space-y-4" data-testid="occupancy-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-sm text-white flex items-center">
          <Users className="w-4 h-4 mr-1.5 text-red-500" />
          Affluence
        </h4>
        <span className="text-[11px] text-slate-400">
          {data.points} bornes suivies · {data.samples} relevé{data.samples > 1 ? 's' : ''} · données publiques IRVE
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">En ce moment</span>
          {data.current ? (
            <>
              <strong className="text-lg text-white font-bold">
                {data.current.occupied}/{data.current.total} bornes occupées
              </strong>
              <div className="text-[10px] text-slate-500 mt-0.5">État publié {ageLabel(data.current.at, now)}</div>
            </>
          ) : (
            <strong className="text-sm text-slate-400 font-semibold block mt-1">État non publié</strong>
          )}
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Meilleure heure d'ici ce soir</span>
          {best ? (
            <>
              <strong className="text-lg text-emerald-400 font-bold">
                {String(best.hour).padStart(2, '0')} h · {Math.round(best.rate * 100)} % d'occupation
              </strong>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {bestPeriod
                  ? `${bestPeriod === 'peak' ? 'Heures pleines' : 'Heures creuses'} : ${bestPrice?.toFixed(2)} €/kWh (Tesla)`
                  : 'Moyenne des semaines passées'}
              </div>
            </>
          ) : (
            <strong className="text-sm text-slate-400 font-semibold block mt-1">Pas encore assez de relevés</strong>
          )}
        </div>
      </div>

      {hasGrid && (
        <div className="overflow-x-auto">
          <table className="text-[10px] text-slate-400 border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="font-normal w-4 text-center">
                    {h % 3 === 0 ? h : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.grid.map((row, d) => (
                <tr key={d}>
                  <th className={`font-normal pr-1 text-left ${d === day ? 'text-white font-semibold' : ''}`}>{DAY_LABELS[d]}</th>
                  {row.map((rate, h) => (
                    <td
                      key={h}
                      title={`${DAY_LABELS[d]} ${h} h : ${rate == null ? 'pas assez de relevés' : `${Math.round(rate * 100)} % d'occupation`}`}
                      className={`w-4 h-4 rounded-sm ${rate == null ? 'border border-slate-800' : ''} ${d === day && h === hour ? 'ring-1 ring-white' : ''}`}
                      style={cellStyle(rate)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500 mt-1">
            Part moyenne des bornes occupées, par jour et par heure (heure de Paris). Plus la case est rouge, plus la station est chargée.
          </p>
        </div>
      )}
    </div>
  );
};
