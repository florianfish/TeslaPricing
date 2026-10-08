import React, { useEffect, useMemo, useState } from 'react';
import { History, Search, TrendingUp, TrendingDown, AlertCircle, MapPin } from 'lucide-react';
import type { PriceUpdate, StationEvent, Supercharger } from '../types';
import { CollectionStatusPanel } from './CollectionStatusPanel';

interface PriceUpdatesViewProps {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
}

type Direction = 'all' | 'up' | 'down';

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const STATUS_LABELS: Record<Supercharger['status'], { label: string; className: string }> = {
  OPEN: { label: 'Ouverte', className: 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60' },
  CONSTRUCTION: { label: 'En travaux', className: 'bg-amber-950/60 text-amber-300 border-amber-900/60' },
  PLAN: { label: 'En projet', className: 'bg-slate-800 text-slate-300 border-slate-700' },
};

const StatusBadge: React.FC<{ status: Supercharger['status'] }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${STATUS_LABELS[status].className}`}>
    {STATUS_LABELS[status].label}
  </span>
);

const EVENTS_PREVIEW = 8;

// Prix actuel, avec l'ancien prix et le sens de variation s'il a changé
const PriceCell: React.FC<{ value: number; previous?: number; accent: string }> = ({ value, previous, accent }) => {
  const changed = previous !== undefined && previous !== value;
  return (
    <td className="py-3 px-4 whitespace-nowrap">
      <span className={`font-semibold ${accent}`}>{value.toFixed(2)} €</span>
      {changed && (
        <span className={`ml-1.5 text-[11px] ${value > previous! ? 'text-red-400' : 'text-emerald-400'}`}>
          {value > previous! ? '▲' : '▼'} <span className="line-through text-slate-500">{previous!.toFixed(2)}</span>
        </span>
      )}
    </td>
  );
};

export const PriceUpdatesView: React.FC<PriceUpdatesViewProps> = ({ superchargers, onSelectSupercharger }) => {
  const [updates, setUpdates] = useState<PriceUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [stationEvents, setStationEvents] = useState<StationEvent[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);

  useEffect(() => {
    fetch('api/prices/updates?limit=500')
      .then((res) => {
        if (!res.ok) throw new Error('Impossible de charger les mises à jour de tarif.');
        return res.json();
      })
      .then((json) => setUpdates(json.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
    fetch('api/stations/events?limit=200')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setStationEvents(json.data || []))
      .catch(() => {});
  }, []);

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? stationEvents.filter((e) => [e.superchargerName, e.city, e.region].some((v) => v?.toLowerCase().includes(q)))
      : stationEvents;
    return showAllEvents ? list : list.slice(0, EVENTS_PREVIEW);
  }, [stationEvents, search, showAllEvents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return updates.filter(({ snapshot, city, region }) => {
      if (q && ![snapshot.superchargerName, city, region].some((v) => v?.toLowerCase().includes(q))) return false;
      const change = snapshot.changePercentage || 0;
      if (direction === 'up' && change <= 0) return false;
      if (direction === 'down' && change >= 0) return false;
      return true;
    });
  }, [updates, search, direction]);

  // Regroupement par date de relevé (déjà triés du plus récent au plus ancien)
  const byDate = useMemo(() => {
    const groups: { date: string; items: PriceUpdate[] }[] = [];
    for (const u of filtered) {
      const last = groups[groups.length - 1];
      if (last?.date === u.snapshot.date) last.items.push(u);
      else groups.push({ date: u.snapshot.date, items: [u] });
    }
    return groups;
  }, [filtered]);

  const ups = updates.filter((u) => (u.snapshot.changePercentage || 0) > 0).length;
  const downs = updates.filter((u) => (u.snapshot.changePercentage || 0) < 0).length;

  const openStation = (id: string) => {
    const charger = superchargers.find((s) => s.id === id);
    if (charger) onSelectSupercharger(charger);
  };

  return (
    <div className="space-y-6">
      <CollectionStatusPanel onOpenStation={openStation} />

      <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
              <History className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Dernières mises à jour de tarif</h2>
              <p className="text-xs text-slate-400">
                Chaque changement de prix relevé sur une station, comparé au relevé précédent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">{updates.length} relevés</span>
            <span className="px-2.5 py-1 rounded-lg bg-red-950/60 text-red-300 border border-red-900/60">▲ {ups}</span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-900/60">▼ {downs}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Station, ville ou région…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex rounded-lg bg-slate-950 border border-slate-800 p-1 text-xs font-medium">
            {([
              ['all', 'Toutes', null],
              ['up', 'Hausses', TrendingUp],
              ['down', 'Baisses', TrendingDown],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setDirection(key)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  direction === key ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {visibleEvents.length > 0 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800">
            <h3 className="flex items-center space-x-2 text-sm font-bold text-white">
              <MapPin className="w-4 h-4 text-red-400" />
              <span>Évolutions des stations</span>
            </h3>
            <span className="text-xs text-slate-400">Nouvelles stations et changements de statut</span>
          </div>
          <ul className="divide-y divide-slate-800/60">
            {visibleEvents.map((e) => (
              <li
                key={`${e.date}-${e.superchargerId}-${e.type}-${e.to}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-6 py-3 text-xs"
              >
                <div>
                  <button
                    onClick={() => openStation(e.superchargerId)}
                    className="font-semibold text-white hover:text-red-400 text-left transition-colors"
                  >
                    {e.superchargerName.replace(/, France/, '')}
                  </button>
                  <div className="text-[11px] text-slate-500">
                    {[e.city, e.region].filter(Boolean).join(' · ')} · {new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {e.type === 'NEW' ? (
                    <span className="px-2 py-0.5 rounded-md border text-[11px] font-semibold bg-red-950/60 text-red-300 border-red-900/60">
                      Nouvelle
                    </span>
                  ) : (
                    e.from && (
                      <>
                        <StatusBadge status={e.from} />
                        <span className="text-slate-500">→</span>
                      </>
                    )
                  )}
                  <StatusBadge status={e.to} />
                </div>
              </li>
            ))}
          </ul>
          {!showAllEvents && stationEvents.length > EVENTS_PREVIEW && (
            <button
              onClick={() => setShowAllEvents(true)}
              className="w-full py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/40 border-t border-slate-800 transition-colors"
            >
              Voir toutes les évolutions ({stationEvents.length})
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-12 animate-pulse">Chargement des mises à jour…</p>
      ) : !error && byDate.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">Aucune mise à jour ne correspond à ces filtres.</p>
      ) : (
        byDate.map(({ date, items }) => (
          <div key={date} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white first-letter:uppercase">{formatDate(date)}</h3>
              <span className="text-xs text-slate-400">
                {items.length} station{items.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Station</th>
                    <th className="py-3 px-4">Tesla HC</th>
                    <th className="py-3 px-4">Tesla HP</th>
                    <th className="py-3 px-4">Non-Tesla HC</th>
                    <th className="py-3 px-4">Non-Tesla HP</th>
                    <th className="py-3 px-4">Heures pleines</th>
                    <th className="py-3 px-4">Variation</th>
                    <th className="py-3 px-4">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map(({ snapshot: s, previous: p, city, region }) => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 min-w-[180px]">
                        <button
                          onClick={() => openStation(s.superchargerId)}
                          className="font-semibold text-white hover:text-red-400 text-left transition-colors"
                        >
                          {s.superchargerName.replace(/, France/, '')}
                        </button>
                        <div className="text-[11px] text-slate-500">
                          {[city, region].filter(Boolean).join(' · ')}
                          {p && <> · précédent le {new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR')}</>}
                        </div>
                      </td>
                      <PriceCell value={s.teslaOffPeak} previous={p?.teslaOffPeak} accent="text-emerald-400" />
                      <PriceCell value={s.teslaPeak} previous={p?.teslaPeak} accent="text-amber-400" />
                      <PriceCell value={s.nonTeslaOffPeak} previous={p?.nonTeslaOffPeak} accent="text-slate-200" />
                      <PriceCell value={s.nonTeslaPeak} previous={p?.nonTeslaPeak} accent="text-slate-200" />
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.peakHours}
                        {p && p.peakHours !== s.peakHours && (
                          <div className="text-[11px] text-slate-500 line-through">{p.peakHours}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.changePercentage ? (
                          <span className={`font-semibold ${s.changePercentage > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {s.changePercentage > 0 ? '+' : ''}
                            {s.changePercentage}%
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-[200px] truncate" title={s.notes || s.source}>
                        {s.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
