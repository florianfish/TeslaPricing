import React, { useState, useMemo, useEffect } from 'react';
import type { Supercharger } from '../types';
import { offPeakHours } from '../hours';
import { stationFreshness, FRESHNESS_CLASSES } from '../freshness';
import { distanceKm, formatDistance, type Geolocation } from '../geo';
import { parseRoute, replaceParams } from '../router';
import { Search, SlidersHorizontal, Zap, ArrowUpDown, ChevronRight, CheckCircle2, AlertCircle, Clock, LocateFixed, Loader2, Navigation } from 'lucide-react';

interface SuperchargerDirectoryProps {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
  onViewOnMap: (charger: Supercharger) => void;
  geolocation: Geolocation;
}

type StatusFilter = 'ALL' | 'OPEN' | 'CONSTRUCTION' | 'PLAN';
type SortBy = 'price' | 'stalls' | 'power' | 'city' | 'name' | 'distance';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'OPEN', 'CONSTRUCTION', 'PLAN'];
const SORTS: SortBy[] = ['price', 'stalls', 'power', 'city', 'name', 'distance'];
const MIN_POWERS = [0, 150, 250, 300];

// Filtres lus dans l'URL (#/liste?q=rennes&tri=price) pour pouvoir partager une recherche
function filtersFromUrl() {
  const params = parseRoute(window.location.hash).params;
  const status = (params.get('statut') || '').toUpperCase() as StatusFilter;
  const sort = params.get('tri') as SortBy;
  const power = Number(params.get('kw'));
  return {
    q: params.get('q') || '',
    status: STATUS_FILTERS.includes(status) ? status : 'ALL',
    ev: params.get('ev') === '1',
    power: MIN_POWERS.includes(power) ? power : 0,
    region: params.get('region') || 'ALL',
    sort: SORTS.includes(sort) ? sort : 'city',
    order: params.get('ordre') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
  } as const;
}

export const SuperchargerDirectory: React.FC<SuperchargerDirectoryProps> = ({
  superchargers,
  onSelectSupercharger,
  onViewOnMap,
  geolocation,
}) => {
  const [initial] = useState(filtersFromUrl);
  const [searchTerm, setSearchTerm] = useState<string>(initial.q);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initial.status);
  const [otherEVsOnly, setOtherEVsOnly] = useState<boolean>(initial.ev);
  const [minPower, setMinPower] = useState<number>(initial.power);
  const [selectedRegion, setSelectedRegion] = useState<string>(initial.region);
  const [sortBy, setSortBy] = useState<SortBy>(initial.sort);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initial.order);
  const [currentPage, setCurrentPage] = useState<number>(initial.page);
  const pageSize = 18;
  const { position, status: geoStatus, error: geoError, locate } = geolocation;

  // Valeurs par défaut omises de l'URL
  useEffect(() => {
    replaceParams({
      q: searchTerm.trim(),
      region: selectedRegion !== 'ALL' ? selectedRegion : null,
      statut: statusFilter !== 'ALL' ? statusFilter.toLowerCase() : null,
      ev: otherEVsOnly ? '1' : null,
      kw: minPower ? String(minPower) : null,
      tri: sortBy !== 'city' ? sortBy : null,
      ordre: sortOrder === 'desc' ? 'desc' : null,
      page: currentPage > 1 ? String(currentPage) : null,
    });
  }, [searchTerm, selectedRegion, statusFilter, otherEVsOnly, minPower, sortBy, sortOrder, currentPage]);

  const distances = useMemo(() => {
    const map = new Map<string, number>();
    if (position) superchargers.forEach((s) => map.set(s.id, distanceKm(position, s)));
    return map;
  }, [superchargers, position]);

  // Extract unique regions for dropdown
  const regions = useMemo(() => {
    const set = new Set<string>();
    superchargers.forEach((s) => {
      if (s.region && s.region !== 'France') set.add(s.region);
    });
    return Array.from(set).sort();
  }, [superchargers]);

  // Filter and sort items
  const filteredAndSorted = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    const filtered = superchargers.filter((s) => {
      if (q) {
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesCity = s.city.toLowerCase().includes(q);
        const matchesSlug = s.locationSlug.toLowerCase().includes(q);
        const matchesPostal = s.postalCode.includes(q);
        const matchesDept = s.department.toLowerCase().includes(q);
        const matchesStreet = s.street.toLowerCase().includes(q);
        if (!matchesName && !matchesCity && !matchesSlug && !matchesPostal && !matchesDept && !matchesStreet) {
          return false;
        }
      }

      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (otherEVsOnly && !s.otherEVs) return false;
      if (minPower > 0 && s.powerKw < minPower) return false;
      if (selectedRegion !== 'ALL' && s.region !== selectedRegion) return false;

      return true;
    });

    const order = sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'distance' && distances.size) {
        return (distances.get(a.id)! - distances.get(b.id)!) * order;
      }
      if (sortBy === 'price') {
        return (a.currentPricing.teslaOffPeak - b.currentPricing.teslaOffPeak) * order;
      }
      if (sortBy === 'stalls') {
        return (a.stallCount - b.stallCount) * order;
      }
      if (sortBy === 'power') {
        return (a.powerKw - b.powerKw) * order;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name) * order;
      }
      return a.city.localeCompare(b.city) * order;
    });

    return filtered;
  }, [superchargers, searchTerm, statusFilter, otherEVsOnly, minPower, selectedRegion, sortBy, sortOrder, distances]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;

  // Page lue dans l'URL hors limites (ex: après le chargement des stations)
  useEffect(() => {
    if (superchargers.length && currentPage > totalPages) setCurrentPage(totalPages);
  }, [superchargers.length, currentPage, totalPages]);
  const paginatedList = filteredAndSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (newSort: SortBy) => {
    if (newSort === 'distance' && !position) locate();
    if (sortBy === newSort) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSort);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters Section */}
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="search-superchargers-input"
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Rechercher une ville, nom, slug (ex: rennessupercharger, 35000, Bordeaux)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Region Select */}
          <div className="w-full md:w-56">
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2.5 px-3 bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value="ALL">Toutes les régions ({superchargers.length})</option>
              {regions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          {/* Min Power Select */}
          <div className="w-full md:w-48">
            <select
              value={minPower}
              onChange={(e) => {
                setMinPower(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full py-2.5 px-3 bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value={0}>Toutes puissances</option>
              <option value={150}>150 kW+ (V2/V3/V4)</option>
              <option value={250}>250 kW+ (V3/V4)</option>
              <option value={300}>300 kW+ (V4 Haute Puissance)</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium mr-1 flex items-center">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1 text-red-400" />
              Statut :
            </span>

            <button
              onClick={() => {
                setStatusFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tous
            </button>

            <button
              onClick={() => {
                setStatusFilter('OPEN');
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'OPEN'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              Ouverts
            </button>

            <button
              onClick={() => {
                setStatusFilter('CONSTRUCTION');
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'CONSTRUCTION'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              En construction
            </button>

            <button
              onClick={() => {
                setOtherEVsOnly(!otherEVsOnly);
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg font-medium transition-colors border ${
                otherEVsOnly
                  ? 'bg-red-950/80 text-red-400 border-red-700'
                  : 'bg-slate-800/60 text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3 text-red-400" />
              <span>Ouvert aux non-Tesla</span>
            </button>
          </div>

          {/* Quick Sort Options */}
          <div className="flex items-center space-x-1 text-xs">
            <span className="text-slate-400 mr-1 flex items-center">
              <ArrowUpDown className="w-3 h-3 mr-1 text-slate-400" />
              Trier par :
            </span>
            <button
              onClick={() => toggleSort('city')}
              className={`px-2.5 py-1 rounded-md font-medium ${
                sortBy === 'city' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ville {sortBy === 'city' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => toggleSort('price')}
              className={`px-2.5 py-1 rounded-md font-medium ${
                sortBy === 'price' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Prix HC {sortBy === 'price' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => toggleSort('stalls')}
              className={`px-2.5 py-1 rounded-md font-medium ${
                sortBy === 'stalls' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stèles {sortBy === 'stalls' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => toggleSort('power')}
              className={`px-2.5 py-1 rounded-md font-medium ${
                sortBy === 'power' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Puissance {sortBy === 'power' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => toggleSort('distance')}
              disabled={geoStatus === 'locating'}
              title="Trier par distance depuis votre position"
              className={`flex items-center px-2.5 py-1 rounded-md font-medium ${
                sortBy === 'distance' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {geoStatus === 'locating' ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <LocateFixed className="w-3 h-3 mr-1" />
              )}
              Distance {sortBy === 'distance' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{filteredAndSorted.length}</span> superchargeurs trouvés
          {searchTerm && <span> pour « {searchTerm} »</span>}
        </p>
        <span className="text-xs text-slate-500">
          Page {currentPage} sur {totalPages}
        </span>
      </div>

      {sortBy === 'distance' && !position && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <span>{geoError || 'Partagez votre position pour trier les stations par distance (elle reste dans votre navigateur).'}</span>
          {geoStatus !== 'locating' && (
            <button
              onClick={locate}
              className="shrink-0 flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700"
            >
              <LocateFixed className="w-3.5 h-3.5 mr-1" />
              Me localiser
            </button>
          )}
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedList.map((charger) => {
          const isOpen = charger.status === 'OPEN';
          const priceOffPeak = charger.currentPricing.teslaOffPeak;
          const pricePeak = charger.currentPricing.teslaPeak;
          const freshness = stationFreshness(charger);
          const distance = distances.get(charger.id);

          return (
            <div
              key={charger.id}
              className="group bg-slate-900 rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all shadow-md hover:shadow-xl flex flex-col justify-between"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-base text-white group-hover:text-red-400 transition-colors">
                        {charger.city}
                      </h3>
                      {charger.department && (
                        <span className="text-[11px] font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                          {charger.department}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-[220px]" title={charger.name}>
                      {charger.name}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isOpen
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                    }`}
                  >
                    {isOpen ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Ouvert</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>{charger.status === 'CONSTRUCTION' ? 'Travaux' : 'Prévu'}</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Specs Tags */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 font-medium">
                    {charger.stallCount} bornes
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-red-400 font-semibold">
                    {charger.powerKw} kW
                  </span>
                  {charger.stallsBreakdown.v4 ? (
                    <span className="px-2 py-0.5 rounded-md bg-blue-950/70 text-blue-400 font-semibold border border-blue-800/50">
                      V4 ({charger.stallsBreakdown.v4})
                    </span>
                  ) : charger.powerKw >= 250 ? (
                    <span className="px-2 py-0.5 rounded-md bg-red-950/70 text-red-300 font-semibold border border-red-800/50">
                      V3
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-semibold">
                      V2
                    </span>
                  )}
                  {distance !== undefined && (
                    <span className="flex items-center px-2 py-0.5 rounded-md bg-blue-950/70 text-blue-300 font-semibold border border-blue-800/50">
                      <Navigation className="w-3 h-3 mr-1" />
                      {formatDistance(distance)}
                    </span>
                  )}
                  {charger.otherEVs ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 text-emerald-300 font-semibold border border-emerald-800/50">
                      Tous VE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 font-semibold">
                      Tesla Only
                    </span>
                  )}
                </div>

                {/* Pricing Box */}
                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                      Heures Creuses (Tesla) :
                    </span>
                    <span className="font-bold text-emerald-400 text-sm">
                      {priceOffPeak.toFixed(2)} €<span className="text-xs font-normal text-slate-400">/kWh</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                      Heures Pleines (Tesla) :
                    </span>
                    <span className="font-bold text-amber-400 text-sm">
                      {pricePeak.toFixed(2)} €<span className="text-xs font-normal text-slate-400">/kWh</span>
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      HP : {charger.currentPricing.peakHours}
                      {offPeakHours(charger.currentPricing.peakHours) && <> · HC : {offPeakHours(charger.currentPricing.peakHours)}</>}
                    </span>
                    <span>Non-Tesla : ~{charger.currentPricing.nonTeslaOffPeak.toFixed(2)} €</span>
                  </div>

                  <div className="flex justify-end">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${FRESHNESS_CLASSES[freshness.level]}`}>
                      {freshness.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2">
                <button
                  id={`view-charger-details-${charger.locationSlug}`}
                  onClick={() => onSelectSupercharger(charger)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors shadow-md shadow-red-600/20"
                >
                  <span>Fiche & Évolution des prix</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onViewOnMap(charger)}
                  title="Voir sur la carte de France"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
                >
                  <Zap className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 py-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700"
          >
            Précédent
          </button>
          <span className="text-xs text-slate-400 px-3">
            Page <strong className="text-white">{currentPage}</strong> sur{' '}
            <strong className="text-white">{totalPages}</strong>
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
};
