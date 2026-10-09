import React, { useEffect, useState } from 'react';
import type { Supercharger } from '../types';
import { offPeakHours, currentTariffPeriod, type TariffPeriod } from '../hours';
import { stationFreshness, FRESHNESS_CLASSES } from '../freshness';
import { isShareableLocation } from '../router';
import { teslaStationUrl } from '../tesla';
import { stationPagePath } from '../stationPage';
import {
  X,
  Zap,
  MapPin,
  Clock,
  Navigation,
  ExternalLink,
  TrendingUp,
  Link2,
  Check,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface StationDetailModalProps {
  charger: Supercharger | null;
  onClose: () => void;
}

export const StationDetailModal: React.FC<StationDetailModalProps> = ({
  charger,
  onClose,
}) => {
  const [linkCopied, setLinkCopied] = useState(false);

  if (!charger) return null;

  const freshness = stationFreshness(charger);

  // L'URL courante pointe déjà sur la fiche (#/onglet?station=<id>)
  const handleShare = async () => {
    // Page de la station rendue par le serveur : aperçu de partage et titre propres à la station
    const url = new URL(`./${stationPagePath(charger)}`, window.location.href).href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Superchargeur ${charger.city}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Partage annulé par l'utilisateur ou presse-papiers indisponible
    }
  };

  const current = charger.currentPricing;

  // Créneau HP/HC en cours, réévalué chaque minute tant que la fiche est ouverte
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const activePeriod = currentTariffPeriod(current.peakHours, now);
  const priceCellClass = (period: TariffPeriod) =>
    activePeriod === null
      ? ''
      : activePeriod === period
        ? `-m-2 p-2 rounded-lg ring-1 ${period === 'peak' ? 'ring-amber-500/60 bg-amber-500/10' : 'ring-emerald-500/60 bg-emerald-500/10'}`
        : '-m-2 p-2 opacity-50';
  const nowTag = (period: TariffPeriod) =>
    activePeriod === period && (
      <span className="ml-1.5 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-900">Maintenant</span>
    );
  const history = charger.priceHistory || [];

  const chartData = history.map((item) => ({
    date: item.date,
    'Heures Creuses': item.teslaOffPeak,
    'Heures Pleines': item.teslaPeak,
    'Non-Tesla HC': item.nonTeslaOffPeak,
    'Non-Tesla HP': item.nonTeslaPeak,
    notes: item.notes,
  }));

  const officialTeslaWebUrl = teslaStationUrl(charger);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${charger.latitude},${charger.longitude}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Modal Top Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-950/50">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl sm:text-2xl font-extrabold text-white">
                {charger.city}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {charger.department}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  charger.status === 'OPEN'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {charger.status === 'OPEN' ? 'Station Ouverte' : 'En travaux / Prévu'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-red-500" />
              {charger.street ? `${charger.street}, ` : ''}{charger.postalCode} {charger.city} ({charger.region})
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[calc(85vh-120px)] overflow-y-auto">

          {/* Quick Technical Bar & Official Links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Nombre de bornes</span>
              <strong className="text-lg text-white font-bold">{charger.stallCount} stèles</strong>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {charger.stallsBreakdown.v4 ? `Dont ${charger.stallsBreakdown.v4} V4` : charger.powerKw >= 250 ? 'Génération V3' : 'Génération V2'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Puissance Maximale</span>
              <strong className="text-lg text-red-400 font-bold">{charger.powerKw} kW</strong>
              <div className="text-[10px] text-slate-500 mt-0.5">Prises CCS Combo 2</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Compatibilité</span>
              <strong className="text-sm text-emerald-400 font-bold block mt-0.5">
                {charger.otherEVs ? 'Ouvert à tous VE' : 'Réservé Tesla'}
              </strong>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {charger.otherEVs ? 'Recharge multi-marques' : 'Non-Tesla non supporté'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Lieu & Commodités</span>
              <strong className="text-xs text-white font-semibold truncate block mt-1" title={charger.facilityName}>
                {charger.facilityName || 'Services à proximité'}
              </strong>
              <div className="text-[10px] text-slate-500 mt-0.5">24h/24 • 7j/7</div>
            </div>
          </div>

          {/* Links Bar */}
          <div className="flex flex-wrap items-center justify-end gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {isShareableLocation() && (
                <button
                  onClick={handleShare}
                  title="Copier le lien vers cette fiche"
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{linkCopied ? 'Lien copié' : 'Partager'}</span>
                </button>
              )}

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <Navigation className="w-3.5 h-3.5 text-blue-400" />
                <span>Naviguer</span>
              </a>

              {officialTeslaWebUrl && (
                <a
                  href={officialTeslaWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-red-400" />
                  <span>Page Tesla.com</span>
                </a>
              )}
            </div>
          </div>

          {/* Current Pricing Matrix */}
          <div className="bg-slate-950/70 rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-white flex items-center">
                <Zap className="w-4 h-4 mr-1.5 text-yellow-400 fill-yellow-400" />
                Grille tarifaire actuelle en vigueur
                <span
                  title="Date du dernier passage du collecteur sur cette station, que le tarif ait changé ou non"
                  className={`ml-2 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${FRESHNESS_CLASSES[freshness.level]}`}
                >
                  {freshness.label}
                </span>
              </h4>
              <span className="text-[11px] text-slate-400 flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                Heures pleines : {current.peakHours}
                {offPeakHours(current.peakHours) && <> · Heures creuses : {offPeakHours(current.peakHours)}</>}
                {activePeriod && (
                  <span
                    data-testid="current-period"
                    className={`ml-2 whitespace-nowrap px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                      activePeriod === 'peak'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    En ce moment : {activePeriod === 'peak' ? 'heures pleines' : 'heures creuses'}
                  </span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tesla Owners Box */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-3">
                  <span>Conducteurs Tesla / Avec Abonnement</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-400 border border-red-800/40">
                    Tarif Préférentiel
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={priceCellClass('offPeak')}>
                    <span className="text-[11px] text-slate-400 flex items-center">Heures Creuses{nowTag('offPeak')}</span>
                    <strong className="text-2xl font-extrabold text-emerald-400">
                      {current.teslaOffPeak.toFixed(2)} €
                    </strong>
                    <span className="text-[11px] text-slate-400 ml-1">/kWh</span>
                  </div>
                  <div className={priceCellClass('peak')}>
                    <span className="text-[11px] text-slate-400 flex items-center">Heures Pleines{nowTag('peak')}</span>
                    <strong className="text-2xl font-extrabold text-amber-400">
                      {current.teslaPeak.toFixed(2)} €
                    </strong>
                    <span className="text-[11px] text-slate-400 ml-1">/kWh</span>
                  </div>
                </div>
              </div>

              {/* Non-Tesla Box */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-3">
                  <span>Autres Véhicules Électriques (Sans abonnement)</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                    Tarif Standard
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={priceCellClass('offPeak')}>
                    <span className="text-[11px] text-slate-400 flex items-center">Heures Creuses{nowTag('offPeak')}</span>
                    <strong className="text-2xl font-extrabold text-slate-200">
                      {current.nonTeslaOffPeak.toFixed(2)} €
                    </strong>
                    <span className="text-[11px] text-slate-400 ml-1">/kWh</span>
                  </div>
                  <div className={priceCellClass('peak')}>
                    <span className="text-[11px] text-slate-400 flex items-center">Heures Pleines{nowTag('peak')}</span>
                    <strong className="text-2xl font-extrabold text-slate-200">
                      {current.nonTeslaPeak.toFixed(2)} €
                    </strong>
                    <span className="text-[11px] text-slate-400 ml-1">/kWh</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Idle fees notice */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
              <span>
                Frais d'inactivité : <strong>{current.idleFeeStandard.toFixed(2)} €/min</strong> (ou{' '}
                <strong>{current.idleFeeCongested.toFixed(2)} €/min</strong> si station saturée à 100%)
              </span>
              <span>Dernière révision : {new Date(current.lastUpdated).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>

          {/* Historical Price Chart for this station */}
          <div className="bg-slate-950/70 rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center">
                  <TrendingUp className="w-4 h-4 mr-1.5 text-red-500" />
                  Historique d'évolution des prix sur cette station
                </h4>
                <p className="text-xs text-slate-400">
                  Évolution enregistrée en base de données (€/kWh)
                </p>
              </div>
            </div>

            {/* Recharts chart */}
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    domain={['auto', 'auto']}
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v) => `${v.toFixed(2)}€`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '10px',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Heures Creuses"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Heures Pleines"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Historical Log Table */}
          <div className="space-y-2">
            <h5 className="font-semibold text-xs text-slate-300">
              Historique des snapshots enregistrés pour {charger.city}
            </h5>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Tesla HC</th>
                    <th className="py-2.5 px-3">Tesla HP</th>
                    <th className="py-2.5 px-3">Non-Tesla</th>
                    <th className="py-2.5 px-3">Variation</th>
                    <th className="py-2.5 px-3">Source & Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {history.slice().reverse().map((snap) => (
                    <tr key={snap.id} className="hover:bg-slate-950/40">
                      <td className="py-2.5 px-3 font-medium text-white">{snap.date}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-semibold">{snap.teslaOffPeak.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-amber-400 font-semibold">{snap.teslaPeak.toFixed(2)} €</td>
                      <td className="py-2.5 px-3 text-slate-400">{snap.nonTeslaOffPeak.toFixed(2)} € / {snap.nonTeslaPeak.toFixed(2)} €</td>
                      <td className="py-2.5 px-3">
                        {snap.changePercentage ? (
                          <span className={snap.changePercentage > 0 ? 'text-red-400' : 'text-emerald-400'}>
                            {snap.changePercentage > 0 ? `+${snap.changePercentage}%` : `${snap.changePercentage}%`}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-xs" title={snap.notes}>
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

      </div>
    </div>
  );
};
