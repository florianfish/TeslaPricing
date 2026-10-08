import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Supercharger, SuperchargerStats } from './types';
import { Navbar } from './components/Navbar';
import { FranceMap } from './components/FranceMap';
import { SuperchargerDirectory } from './components/SuperchargerDirectory';
import { PriceEvolutionView } from './components/PriceEvolutionView';
import { CostSimulator } from './components/CostSimulator';
import { PriceUpdatesView } from './components/PriceUpdatesView';
import { StationDetailModal } from './components/StationDetailModal';
import { ReferralEncart } from './components/ReferralEncart';
import { CookieBanner } from './components/CookieBanner';
import { AlertCircle, Zap } from 'lucide-react';
import { trackTab, isAnalyticsConfigured, resetConsent, subscribeAnalytics } from './analytics';
import { useRoute, navigate, routeHash, parseRoute, type Tab } from './router';
import { useGeolocation } from './geo';

export default function App() {
  const [superchargers, setSuperchargers] = useState<Supercharger[]>([]);
  const [stats, setStats] = useState<SuperchargerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const analyticsConfigured = useSyncExternalStore(subscribeAnalytics, isAnalyticsConfigured);
  const geolocation = useGeolocation();

  // Onglet et fiche station ouverte sont portés par l'URL (#/carte?station=rennessupercharger)
  const route = useRoute();
  const activeTab = route.tab;
  const stationSlug = route.params.get('station')?.toLowerCase();
  const selectedCharger = useMemo(
    () => (stationSlug ? superchargers.find((s) => s.locationSlug.toLowerCase() === stationSlug) ?? null : null),
    [superchargers, stationSlug]
  );

  const setActiveTab = (tab: Tab) => navigate(routeHash(tab));

  // Ouvrir une fiche crée une entrée d'historique : le bouton Retour la referme
  const openStation = useCallback((charger: Supercharger, tab?: Tab) => {
    const current = parseRoute(window.location.hash);
    const target = tab ?? current.tab;
    const params = target === current.tab ? current.params : new URLSearchParams();
    params.set('station', charger.locationSlug);
    navigate(routeHash(target, params), { state: { stationOverlay: true } });
  }, []);

  const closeStation = () => {
    if (window.history.state?.stationOverlay) {
      window.history.back();
      return;
    }
    const params = new URLSearchParams(route.params);
    params.delete('station');
    navigate(routeHash(route.tab, params), { replace: true });
  };

  // Fetch all superchargers & stats
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [chargersRes, statsRes] = await Promise.all([
        fetch('api/superchargers'),
        fetch('api/prices/stats'),
      ]);

      if (!chargersRes.ok || !statsRes.ok) {
        throw new Error('Impossible de charger les données du serveur.');
      }

      const chargersData = await chargersRes.json();
      const statsData = await statsRes.json();

      setSuperchargers(chargersData.data || []);
      setStats(statsData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue lors de la récupération des données.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    trackTab(activeTab);
  }, [activeTab]);

  // View on map action
  const handleViewOnMap = (charger: Supercharger) => openStation(charger, 'map');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Encart Parrainage 1000 km offerts */}
        <ReferralEncart className="mb-6" />

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && !superchargers.length ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-red-500 animate-spin" />
              <Zap className="w-5 h-5 text-red-500 absolute" />
            </div>
            <p className="text-sm text-slate-400 font-medium animate-pulse">
              Chargement des 330+ superchargeurs et de la base de données de prix...
            </p>
          </div>
        ) : (
          <div>
            {/* View 1: France Map */}
            {activeTab === 'map' && (
              <FranceMap
                superchargers={superchargers}
                onSelectSupercharger={openStation}
                selectedCharger={selectedCharger}
                geolocation={geolocation}
              />
            )}

            {/* View 2: Directory & Search */}
            {activeTab === 'list' && (
              <SuperchargerDirectory
                superchargers={superchargers}
                onSelectSupercharger={openStation}
                onViewOnMap={handleViewOnMap}
                geolocation={geolocation}
              />
            )}

            {/* View 3: National Price Analytics & History */}
            {activeTab === 'stats' && (
              <PriceEvolutionView
                stats={stats}
                superchargers={superchargers}
                onSelectSupercharger={openStation}
              />
            )}

            {/* View 4: Latest price updates */}
            {activeTab === 'updates' && (
              <PriceUpdatesView
                superchargers={superchargers}
                onSelectSupercharger={openStation}
              />
            )}

            {/* View 5: Charging Cost Simulator */}
            {activeTab === 'simulator' && (
              <CostSimulator
                stats={stats}
                superchargers={superchargers}
              />
            )}
          </div>
        )}
      </main>

      {/* Station Details & Price History Modal */}
      {selectedCharger && (
        <StationDetailModal
          charger={selectedCharger}
          onClose={closeStation}
        />
      )}

      {/* Subtle Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Données des Superchargeurs Tesla France • Stockage & Évolution en Base de Données Persistante
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3 text-slate-400">
            <a
              href="https://www.tesla.com/fr_Fr/referral/florian572745"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 font-semibold transition-colors flex items-center space-x-1"
            >
              <span>🎁 1 000 km Tesla offerts</span>
            </a>
            <span>•</span>
            <a
              href="https://www.tesla.com/fr_FR/findus/list/superchargers/France"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-red-400 transition-colors"
            >
              Tesla FindUs France
            </a>
            <span>•</span>
            <span>Tarifs en € TTC / kWh</span>
            <span>•</span>
            <a
              href="https://github.com/florianfish/TeslaPricing/blob/main/tesla-pricing/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              title="Version de l'add-on — notes de version"
              className="hover:text-red-400 transition-colors font-mono"
            >
              v{__APP_VERSION__}
            </a>
            {analyticsConfigured && (
              <>
                <span>•</span>
                <button
                  onClick={resetConsent}
                  title="Modifier mon choix concernant les cookies de mesure d'audience"
                  className="hover:text-red-400 transition-colors"
                >
                  Cookies
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      <CookieBanner />
    </div>
  );
}
