import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import type { OccupancyLive, Supercharger } from '../types';
import { ageLabel } from '../occupancy';

interface Props {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
}

type LiveStation = OccupancyLive['stations'][number];

const PREVIEW = 10;
const pct = (r: number) => `${Math.round(r * 100)} %`;
const ratio = (s: LiveStation) => s.occupied / s.total;

// Écart notable avec l'affluence habituelle de ce créneau (15 points)
function trend(s: LiveStation): 'busier' | 'calmer' | null {
  if (s.usual === null) return null;
  const d = ratio(s) - s.usual;
  return d >= 0.15 ? 'busier' : d <= -0.15 ? 'calmer' : null;
}

const Row: React.FC<{ s: LiveStation; onOpen: () => void }> = ({ s, onOpen }) => {
  const r = ratio(s);
  const t = trend(s);
  return (
    <button onClick={onOpen} className="w-full text-left py-2.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white font-semibold truncate">{s.name.replace(/, France/, '')}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {s.region}
            {s.usual !== null && ` · d'habitude ${pct(s.usual)} à cette heure`}
            {t === 'busier' && <span className="text-amber-400"> · plus chargée que d'habitude</span>}
            {t === 'calmer' && <span className="text-emerald-400"> · plus calme que d'habitude</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-white">
            {s.occupied}/{s.total}
          </div>
          <div className="text-[10px] text-slate-500">bornes occupées</div>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${r >= 0.8 ? 'bg-red-500' : r >= 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(3, r * 100)}%` }} />
      </div>
    </button>
  );
};

// Affluence de toutes les stations en ce moment, d'après l'état des bornes publié en open data
export const OccupancyLiveView: React.FC<Props> = ({ superchargers, onSelectSupercharger }) => {
  const [data, setData] = useState<OccupancyLive | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('api/occupancy/now')
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => {
          setData(d);
          setNow(new Date());
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 5 * 60_000);
    return () => clearInterval(timer);
  }, []);

  const byId = useMemo(() => new Map(superchargers.map((s) => [s.id, s])), [superchargers]);
  const regions = useMemo(() => [...new Set((data?.stations || []).map((s) => s.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [data]);

  const stations = useMemo(() => {
    const q = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (data?.stations || []).filter((s) => {
      if (region && s.region !== region) return false;
      if (!q) return true;
      return `${s.name} ${s.city}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
    });
  }, [data, search, region]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Lecture de l'affluence…
      </div>
    );
  }

  const open = (id: string) => {
    const charger = byId.get(id);
    if (charger) onSelectSupercharger(charger);
  };

  const occupied = stations.reduce((a, s) => a + s.occupied, 0);
  const total = stations.reduce((a, s) => a + s.total, 0);
  const full = stations.filter((s) => s.occupied === s.total).length;
  const empty = stations.filter((s) => s.occupied === 0).length;
  const busiest = [...stations].sort((a, b) => ratio(b) - ratio(a) || b.occupied - a.occupied);
  // Les plus calmes : au moins 4 bornes suivies, pour ne pas classer une station de 2 bornes « libre à 100 % »
  const calmest = [...stations].filter((s) => s.total >= 4).sort((a, b) => ratio(a) - ratio(b) || b.total - a.total);
  const busierThanUsual = stations.filter((s) => trend(s) === 'busier').length;

  const tiles = [
    { label: 'Bornes occupées', value: total ? `${occupied}/${total}` : '—', hint: total ? `${pct(occupied / total)} des bornes suivies` : '' },
    { label: 'Stations complètes', value: `${full}`, hint: 'toutes les bornes occupées' },
    { label: 'Stations vides', value: `${empty}`, hint: 'aucune borne occupée' },
    { label: 'Plus chargées que d’habitude', value: `${busierThanUsual}`, hint: 'à ce jour et cette heure' },
  ];

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
              <Users className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Affluence en direct</h2>
              <p className="text-xs text-slate-400">
                {data.lastSampleAt
                  ? `Relevé ${ageLabel(data.lastSampleAt, now)} · ${data.stations.length} stations avec un état à jour`
                  : 'Premier relevé en attente'}{' '}
                · état des bornes publié par Tesla (transport.data.gouv.fr)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Station, ville…"
                className="pl-8 pr-3 py-1.5 w-40 sm:w-48 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600"
              />
            </div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-red-600"
            >
              <option value="">Toutes les régions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

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

      {stations.length === 0 ? (
        <p className="text-sm text-slate-400 px-1">Aucune station ne correspond.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl">
            <h3 className="font-bold text-sm text-white flex items-center mb-2">
              <TrendingUp className="w-4 h-4 mr-1.5 text-red-500" /> Les plus chargées
            </h3>
            <div className="divide-y divide-slate-800/60" data-testid="busiest">
              {(showAll ? busiest : busiest.slice(0, PREVIEW)).map((s) => (
                <Row key={s.id} s={s} onOpen={() => open(s.id)} />
              ))}
            </div>
          </div>
          <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl">
            <h3 className="font-bold text-sm text-white flex items-center mb-2">
              <TrendingDown className="w-4 h-4 mr-1.5 text-emerald-500" /> Les plus calmes
              <span className="ml-2 text-[10px] font-normal text-slate-500">(4 bornes suivies ou plus)</span>
            </h3>
            <div className="divide-y divide-slate-800/60">
              {(showAll ? calmest : calmest.slice(0, PREVIEW)).map((s) => (
                <Row key={s.id} s={s} onOpen={() => open(s.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {stations.length > PREVIEW && (
        <div className="text-center">
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-slate-400 hover:text-white underline-offset-2 hover:underline">
            {showAll ? 'Réduire les listes' : `Voir les ${stations.length} stations`}
          </button>
        </div>
      )}
    </div>
  );
};
