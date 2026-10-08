import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { CollectionStatus } from '../types';
import { daysSince, relativeDays } from '../freshness';

interface CollectionStatusPanelProps {
  onOpenStation: (id: string) => void;
}

const STALE_PREVIEW = 8;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Tableau de bord de la collecte : derniers imports de l'extension et fraîcheur des relevés par station
export const CollectionStatusPanel: React.FC<CollectionStatusPanelProps> = ({ onOpenStation }) => {
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [showAllStale, setShowAllStale] = useState(false);
  const [showImports, setShowImports] = useState(false);

  useEffect(() => {
    fetch('api/prices/collection-status')
      .then((res) => (res.ok ? res.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status) return null;

  const { lastImport, openStations } = status;
  const importAge = lastImport ? daysSince(lastImport.at) : null;
  const alert = importAge === null || importAge > status.alertDays;
  const segments = [
    { key: 'fresh', count: status.fresh, label: '≤ 7 j', className: 'bg-emerald-500' },
    { key: 'aging', count: status.aging, label: `8–${status.staleDays} j`, className: 'bg-amber-500' },
    { key: 'stale', count: status.stale, label: `> ${status.staleDays} j`, className: 'bg-red-500' },
    { key: 'never', count: status.never, label: 'jamais', className: 'bg-slate-600' },
  ];
  const staleList = showAllStale ? status.staleStations : status.staleStations.slice(0, STALE_PREVIEW);

  return (
    <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
      <div className="flex items-center space-x-3">
        <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
          <Activity className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">État de la collecte des tarifs</h2>
          <p className="text-xs text-slate-400">Relevés envoyés par l'extension navigateur et ancienneté des tarifs par station</p>
        </div>
      </div>

      {alert && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/50 border border-amber-800/60 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            {lastImport
              ? `Aucun relevé reçu depuis ${importAge} jours.`
              : 'Aucun relevé reçu pour l’instant.'}{' '}
            Vérifiez que le navigateur portant l'extension est ouvert et que la collecte n'est pas bloquée par Tesla.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Last import */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <span className="text-[11px] text-slate-400 block">Dernier relevé reçu</span>
          {lastImport ? (
            <>
              <div className="flex items-center gap-2">
                {!alert && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                <strong className="text-lg text-white">{relativeDays(importAge!)}</strong>
                <span className="text-xs text-slate-500">{formatDateTime(lastImport.at)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">{lastImport.updated} modifiés</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">{lastImport.confirmed} inchangés</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">{lastImport.skipped} ignorés</span>
              </div>
              {lastImport.abortReason && (
                <p className="text-[11px] text-amber-300">Collecte interrompue : {lastImport.abortReason}</p>
              )}
            </>
          ) : (
            <strong className="text-lg text-slate-500 block">—</strong>
          )}
        </div>

        {/* Coverage */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <span className="text-[11px] text-slate-400 block">Ancienneté des tarifs ({openStations} stations ouvertes)</span>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800">
            {segments.map((seg) =>
              seg.count > 0 ? (
                <div
                  key={seg.key}
                  className={seg.className}
                  style={{ width: `${(seg.count / Math.max(openStations, 1)) * 100}%` }}
                  title={`${seg.count} stations (${seg.label})`}
                />
              ) : null
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {segments.map((seg) => (
              <span key={seg.key} className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-1 ${seg.className}`} />
                <strong className="text-slate-200 mr-1">{seg.count}</strong> {seg.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stations to re-check */}
      {status.staleStations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-300">
            Tarifs à revérifier ({status.staleStations.length}) — relevés depuis plus de {status.staleDays} jours
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {staleList.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenStation(s.id)}
                title={s.name}
                className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-[11px] text-slate-300 transition-colors"
              >
                {s.city}
                <span className="ml-1.5 text-slate-500">{s.lastChecked ? relativeDays(daysSince(s.lastChecked)) : 'jamais'}</span>
              </button>
            ))}
            {status.staleStations.length > STALE_PREVIEW && (
              <button
                onClick={() => setShowAllStale(!showAllStale)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-400 hover:text-red-300"
              >
                {showAllStale ? 'Réduire' : `+ ${status.staleStations.length - STALE_PREVIEW} autres`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import history */}
      {status.imports.length > 1 && (
        <div>
          <button
            onClick={() => setShowImports(!showImports)}
            className="flex items-center text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            {showImports ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            Historique des imports ({status.imports.length})
          </button>
          {showImports && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-4 font-medium">Reçu le</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Modifiés</th>
                    <th className="py-2 pr-4 font-medium">Inchangés</th>
                    <th className="py-2 pr-4 font-medium">Ignorés</th>
                    <th className="py-2 font-medium">Remarque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {status.imports.map((imp) => (
                    <tr key={imp.at}>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(imp.at)}</td>
                      <td className="py-2 pr-4">{imp.source === 'extension' ? 'Extension' : 'Fichier'}</td>
                      <td className="py-2 pr-4">{imp.updated}</td>
                      <td className="py-2 pr-4">{imp.confirmed}</td>
                      <td className="py-2 pr-4">{imp.skipped}</td>
                      <td className="py-2 text-amber-300">{imp.abortReason || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
