import React, { useState } from 'react';
import type { SuperchargerStats, Supercharger } from '../types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, ArrowDownRight, ArrowUpRight, Clock, Zap, ShieldAlert, Award } from 'lucide-react';

interface PriceEvolutionViewProps {
  stats: SuperchargerStats | null;
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
}

export const PriceEvolutionView: React.FC<PriceEvolutionViewProps> = ({
  stats,
  superchargers,
  onSelectSupercharger,
}) => {
  const [activeCurve, setActiveCurve] = useState<'ALL' | 'TESLA' | 'NON_TESLA'>('ALL');

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        Chargement des données historiques de prix...
      </div>
    );
  }

  // Format data for Recharts
  const chartData = stats.nationalHistory.map((item) => {
    return {
      date: item.date,
      displayDate: new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' }).format(new Date(item.date)),
      'Tesla - Heures Creuses': item.teslaOffPeak,
      'Tesla - Heures Pleines': item.teslaPeak,
      'Non-Tesla - Heures Creuses': item.nonTeslaOffPeak,
      'Non-Tesla - Heures Pleines': item.nonTeslaPeak,
      notes: item.notes,
      changePercentage: item.changePercentage,
    };
  });

  // Calculate savings
  const offPeakDiscount = Math.round(
    ((stats.avgTeslaPeak - stats.avgTeslaOffPeak) / stats.avgTeslaPeak) * 100
  );
  const nonTeslaSurplus = Math.round(
    ((stats.avgNonTeslaPeak - stats.avgTeslaPeak) / stats.avgTeslaPeak) * 100
  );

  return (
    <div className="space-y-8">
      {/* Overview Header & Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Moyenne Heures Creuses</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-emerald-400">{stats.avgTeslaOffPeak.toFixed(2)} €</span>
            <span className="text-xs text-slate-400">/ kWh</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Économie de <strong className="text-emerald-300">{offPeakDiscount}%</strong> par rapport aux heures pleines
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Moyenne Heures Pleines</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-amber-400">{stats.avgTeslaPeak.toFixed(2)} €</span>
            <span className="text-xs text-slate-400">/ kWh</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Généralement de <strong className="text-amber-300">16h00 à 20h00</strong>
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Station la plus abordable</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-white">{stats.minPriceStation.price.toFixed(2)} €</span>
            <span className="text-xs text-slate-400">/ kWh</span>
          </div>
          <p className="text-xs text-slate-400 mt-2 truncate">
            {stats.minPriceStation.city} ({stats.minPriceStation.name})
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Surcoût Non-Tesla (sans abo)</span>
            <Zap className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-red-400">+{nonTeslaSurplus}%</span>
            <span className="text-xs text-slate-400">en moyenne</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Abonnement 12,99€/mois amorti dès ~80 kWh/mois
          </p>
        </div>
      </div>

      {/* Main Historical Chart */}
      <div className="bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-red-500" />
              Évolution historique du prix du kWh en France (2021 – 2026)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Historique des tarifs des Superchargeurs Tesla enregistrés en base de données (€ TTC / kWh)
            </p>
          </div>

          {/* Curve filter buttons */}
          <div className="flex items-center space-x-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs">
            <button
              onClick={() => setActiveCurve('ALL')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                activeCurve === 'ALL' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tous les tarifs
            </button>
            <button
              onClick={() => setActiveCurve('TESLA')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                activeCurve === 'TESLA' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Propriétaires Tesla
            </button>
            <button
              onClick={() => setActiveCurve('NON_TESLA')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                activeCurve === 'NON_TESLA' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Véhicules tiers
            </button>
          </div>
        </div>

        {/* Recharts Component */}
        <div className="w-full h-80 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis
                dataKey="displayDate"
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
              />
              <YAxis
                domain={[0.2, 0.85]}
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                tickFormatter={(val) => `${val.toFixed(2)}€`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
                formatter={(value: any) => [`${Number(value).toFixed(2)} € / kWh`]}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  return (
                    <div className="font-semibold border-b border-slate-700 pb-1 mb-1">
                      <span>{item?.date}</span>
                      {item?.notes && <p className="text-[11px] font-normal text-slate-400">{item.notes}</p>}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
              />

              {(activeCurve === 'ALL' || activeCurve === 'TESLA') && (
                <Line
                  type="monotone"
                  dataKey="Tesla - Heures Creuses"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 7 }}
                />
              )}

              {(activeCurve === 'ALL' || activeCurve === 'TESLA') && (
                <Line
                  type="monotone"
                  dataKey="Tesla - Heures Pleines"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#f59e0b' }}
                  activeDot={{ r: 7 }}
                />
              )}

              {(activeCurve === 'ALL' || activeCurve === 'NON_TESLA') && (
                <Line
                  type="monotone"
                  dataKey="Non-Tesla - Heures Creuses"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4, fill: '#38bdf8' }}
                  activeDot={{ r: 7 }}
                />
              )}

              {(activeCurve === 'ALL' || activeCurve === 'NON_TESLA') && (
                <Line
                  type="monotone"
                  dataKey="Non-Tesla - Heures Pleines"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4, fill: '#f43f5e' }}
                  activeDot={{ r: 7 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical Milestones Timeline */}
      <div className="bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl">
        <h3 className="text-base font-bold text-white mb-4">
          Chronologie des grandes étapes tarifaires Tesla en France
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Septembre 2022</span>
              <span className="flex items-center text-red-400 font-bold">
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                Pic 0,67 €
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">Crise énergétique européenne</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Flambée sans précédent du cours du MWh en Europe. Les superchargeurs atteignent jusqu'à 0,79€ pour les non-Tesla.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Mai 2023</span>
              <span className="flex items-center text-emerald-400 font-bold">
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                Chute à 0,30 €
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">Grande baisse tarifaire</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Répercussion de la chute des cours de gros. Le prix du kWh redevient extrêmement compétitif face aux réseaux concurrents.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">2024 - 2026</span>
              <span className="flex items-center text-amber-400 font-bold">
                <Clock className="w-3.5 h-3.5 mr-0.5" />
                Tarification dynamique
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">Système Heures Pleines / Creuses</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Généralisation des créneaux 16h-20h plus onéreux pour lisser la charge du réseau et inciter à la recharge nocturne ou matinale.
            </p>
          </div>
        </div>
      </div>

      {/* Database Snapshots Table */}
      <div className="bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Relevés historiques en base de données</h3>
            <p className="text-xs text-slate-400">Données enregistrées et persistées pour le suivi national</p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-lg">
            {stats.nationalHistory.length} relevés enregistrés
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Tesla HC</th>
                <th className="py-3 px-4">Tesla HP</th>
                <th className="py-3 px-4">Non-Tesla HC</th>
                <th className="py-3 px-4">Non-Tesla HP</th>
                <th className="py-3 px-4">Variation</th>
                <th className="py-3 px-4">Source & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stats.nationalHistory.slice().reverse().map((snap) => (
                <tr key={snap.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-semibold text-white">{snap.date}</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold">{snap.teslaOffPeak.toFixed(2)} €</td>
                  <td className="py-3 px-4 text-amber-400 font-semibold">{snap.teslaPeak.toFixed(2)} €</td>
                  <td className="py-3 px-4 text-slate-300">{snap.nonTeslaOffPeak.toFixed(2)} €</td>
                  <td className="py-3 px-4 text-slate-300">{snap.nonTeslaPeak.toFixed(2)} €</td>
                  <td className="py-3 px-4">
                    {snap.changePercentage ? (
                      <span
                        className={`font-semibold ${
                          snap.changePercentage > 0 ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {snap.changePercentage > 0 ? `+${snap.changePercentage}%` : `${snap.changePercentage}%`}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={snap.notes || snap.source}>
                    <span className="text-slate-200 font-medium mr-1">{snap.source}:</span>
                    {snap.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
