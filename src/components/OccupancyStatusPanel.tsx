import React, { useEffect, useState } from 'react';
import { Users, AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import type { OccupancyStatus } from '../types';
import { ageLabel } from '../occupancy';

const STATE: Record<OccupancyStatus['state'], { label: string; className: string; icon: React.ReactNode }> = {
  ok: { label: 'Relevé à jour', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  late: { label: 'Relevé en retard', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: <Clock className="w-3.5 h-3.5" /> },
  error: { label: 'Dernier relevé en échec', className: 'bg-red-500/15 text-red-300 border-red-500/40', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  pending: { label: 'Premier relevé en attente', className: 'bg-slate-500/15 text-slate-300 border-slate-500/40', icon: <Clock className="w-3.5 h-3.5" /> },
  disabled: { label: 'Désactivé', className: 'bg-slate-500/15 text-slate-400 border-slate-600', icon: <PauseCircle className="w-3.5 h-3.5" /> },
};

const formatDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Santé du relevé de l'occupation (données IRVE), sous l'état de la collecte des tarifs
export const OccupancyStatusPanel: React.FC = () => {
  const [status, setStatus] = useState<OccupancyStatus | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const load = () =>
      fetch('api/occupancy/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((s) => {
          setStatus(s);
          setNow(new Date());
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!status) return null;
  const state = STATE[status.state];

  const tiles = [
    { label: 'Dernier relevé', value: status.lastSampleAt ? ageLabel(status.lastSampleAt, now) : '—', hint: status.intervalMin ? `toutes les ${status.intervalMin} min` : 'relevé désactivé' },
    { label: 'Stations suivies', value: `${status.matchedStations}/${status.openStations}`, hint: status.mappingAt ? `rapprochées le ${formatDate(status.mappingAt)}` : 'rapprochement à venir' },
    { label: 'État à jour', value: `${status.liveStations}`, hint: 'stations au dernier relevé' },
    { label: 'Carte d’affluence', value: `${Math.round(status.gridFill * 100)} %`, hint: `${status.samples.toLocaleString('fr-FR')} relevés cumulés` },
  ];

  return (
    <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4" data-testid="occupancy-status">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
            <Users className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Relevé de l'occupation des stations</h2>
            <p className="text-xs text-slate-400">État des bornes publié par Tesla en open data (transport.data.gouv.fr), relevé par l'add-on</p>
          </div>
        </div>
        <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${state.className}`}>
          {state.icon}
          {state.label}
        </span>
      </div>

      {status.state === 'error' && status.lastError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span className="break-all">{status.lastError}</span>
        </div>
      )}
      {status.state === 'late' && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/50 border border-amber-800/60 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Aucun relevé depuis plus de {3 * status.intervalMin} minutes : vérifier le journal de l'add-on et l'accès à transport.data.gouv.fr.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">{t.label}</span>
            <strong className="text-lg text-white font-bold">{t.value}</strong>
            <div className="text-[10px] text-slate-500 mt-0.5">{t.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
