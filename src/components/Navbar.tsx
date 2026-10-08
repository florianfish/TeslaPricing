import React from 'react';
import { Zap, MapPin, TrendingUp, Calculator, Database, ExternalLink, Gift, History } from 'lucide-react';
import type { SuperchargerStats } from '../types';
import type { Tab } from '../router';

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  stats: SuperchargerStats | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  stats,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('map')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30 border border-red-500/30">
              <Zap className="w-5 h-5 fill-white" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">Superchargeurs France</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/50">
                  Tesla
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Observatoire & Évolution des prix en base de données
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {stats && (
            <div className="hidden lg:flex items-center space-x-4 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">{stats.openStations}</span>
                <span className="text-slate-400">stations actives</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center space-x-1">
                <span className="text-slate-400">Moy. HC:</span>
                <span className="font-semibold text-emerald-400">{stats.avgTeslaOffPeak.toFixed(2)} €/kWh</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center space-x-1">
                <span className="text-slate-400">HP:</span>
                <span className="font-semibold text-amber-400">{stats.avgTeslaPeak.toFixed(2)} €/kWh</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <a
              href="https://www.tesla.com/fr_Fr/referral/florian572745"
              target="_blank"
              rel="noopener noreferrer"
              title="Obtenir 1 000 km Tesla offerts"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600/20 via-red-500/15 to-red-600/10 hover:from-red-600/30 hover:to-red-500/25 border border-red-500/40 text-xs font-semibold text-red-300 hover:text-white transition-all shadow-sm shadow-red-950/20"
            >
              <Gift className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">1 000 km offerts</span>
            </a>

            <a
              href="https://www.tesla.com/fr_FR/findus/list/superchargers/France"
              target="_blank"
              rel="noopener noreferrer"
              title="Liste officielle Tesla France"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto py-2 border-t border-slate-800/60 no-scrollbar">
          <button
            id="tab-map"
            onClick={() => onTabChange('map')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'map'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Carte de France</span>
          </button>

          <button
            id="tab-list"
            onClick={() => onTabChange('list')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'list'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Liste & Recherche ({stats?.totalStations || '336'})</span>
          </button>

          <button
            id="tab-stats"
            onClick={() => onTabChange('stats')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'stats'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Évolution des Prix</span>
          </button>

          <button
            id="tab-updates"
            onClick={() => onTabChange('updates')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'updates'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Mises à jour</span>
          </button>

          <button
            id="tab-simulator"
            onClick={() => onTabChange('simulator')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Simulateur de Coût</span>
          </button>
        </div>
      </div>
    </header>
  );
};
