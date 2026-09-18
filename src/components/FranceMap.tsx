import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Supercharger } from '../types';
import { Zap, Filter, Compass, Info } from 'lucide-react';

interface FranceMapProps {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
  selectedCharger: Supercharger | null;
}

export const FranceMap: React.FC<FranceMapProps> = ({
  superchargers,
  onSelectSupercharger,
  selectedCharger,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [mapFilter, setMapFilter] = useState<'ALL' | 'OTHER_EVS' | 'HIGH_POWER' | 'CHEAP'>('ALL');

  // Filter markers
  const filteredList = React.useMemo(() => {
    return superchargers.filter((s) => {
      if (mapFilter === 'OTHER_EVS' && !s.otherEVs) return false;
      if (mapFilter === 'HIGH_POWER' && s.powerKw < 250) return false;
      if (mapFilter === 'CHEAP' && s.currentPricing.teslaOffPeak > 0.31) return false;
      return true;
    });
  }, [superchargers, mapFilter]);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Centered on France
    const map = L.map(mapContainerRef.current, {
      center: [46.603354, 2.3],
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false,
    });

    // Sleek CartoDB Dark Matter tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers when filteredList changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    filteredList.forEach((charger) => {
      if (!charger.latitude || !charger.longitude) return;

      const isOpen = charger.status === 'OPEN';
      const isOtherEV = charger.otherEVs;
      
      // Marker color
      let markerColor = '#e11d48'; // Tesla red
      if (!isOpen) {
        markerColor = '#f59e0b'; // Amber for plan/construction
      } else if (!isOtherEV) {
        markerColor = '#9f1239'; // Dark red for Tesla only
      }

      const iconHtml = `
        <div style="
          width: 28px;
          height: 28px;
          background: ${markerColor};
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.15s ease;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-supercharger-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const marker = L.marker([charger.latitude, charger.longitude], { icon: customIcon });

      // Popup Content
      const popupHtml = `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${charger.city}</span>
            <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 9999px; background: ${isOpen ? '#dcfce7' : '#fef3c7'}; color: ${isOpen ? '#166534' : '#92400e'};">
              ${isOpen ? 'Actif' : charger.status}
            </span>
          </div>

          <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">
            ${charger.name}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; font-size: 11px;">
            <div style="background: #f1f5f9; padding: 6px; border-radius: 6px;">
              <span style="color: #64748b; display: block;">Puissance</span>
              <strong style="color: #0f172a; font-size: 12px;">${charger.powerKw} kW</strong>
            </div>
            <div style="background: #f1f5f9; padding: 6px; border-radius: 6px;">
              <span style="color: #64748b; display: block;">Stèles</span>
              <strong style="color: #0f172a; font-size: 12px;">${charger.stallCount} bornes</strong>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: #64748b;">Heures Creuses :</span>
              <strong style="color: #16a34a;">${charger.currentPricing.teslaOffPeak.toFixed(2)} €/kWh</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="color: #64748b;">Heures Pleines :</span>
              <strong style="color: #d97706;">${charger.currentPricing.teslaPeak.toFixed(2)} €/kWh</strong>
            </div>
          </div>

          <button
            id="popup-btn-${charger.id}"
            style="
              width: 100%;
              background: #e11d48;
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              box-shadow: 0 2px 4px rgba(225, 29, 72, 0.2);
            "
          >
            Fiche station & Historique des prix &rarr;
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`popup-btn-${charger.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectSupercharger(charger);
          };
        }
      });

      layerGroup.addLayer(marker);
    });
  }, [filteredList, onSelectSupercharger]);

  // Center on selected charger if set
  useEffect(() => {
    if (!selectedCharger || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo(
      [selectedCharger.latitude, selectedCharger.longitude],
      12,
      { duration: 1.2 }
    );
  }, [selectedCharger]);

  const handleResetView = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([46.603354, 2.3], 6, { duration: 1 });
  };

  return (
    <div className="relative w-full h-[calc(100vh-135px)] min-h-[500px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Controls & Filters */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 max-w-[calc(100%-2rem)]">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs">
          <Filter className="w-3.5 h-3.5 text-red-400" />
          <span className="font-semibold text-slate-300 mr-1">Filtres :</span>

          <button
            onClick={() => setMapFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mapFilter === 'ALL'
                ? 'bg-red-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Tous ({superchargers.length})
          </button>

          <button
            onClick={() => setMapFilter('OTHER_EVS')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mapFilter === 'OTHER_EVS'
                ? 'bg-red-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Ouverts Non-Tesla
          </button>

          <button
            onClick={() => setMapFilter('HIGH_POWER')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mapFilter === 'HIGH_POWER'
                ? 'bg-red-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            V3 / V4 (250 kW+)
          </button>

          <button
            onClick={() => setMapFilter('CHEAP')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mapFilter === 'CHEAP'
                ? 'bg-red-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Éco (≤ 0.31 €/kWh)
          </button>
        </div>

        {/* Reset View Button */}
        <button
          onClick={handleResetView}
          title="Recentrer sur la France"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <Compass className="w-3.5 h-3.5 text-red-400" />
          <span>Recentrer</span>
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center space-x-3 px-3.5 py-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs text-slate-300">
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-red-600 border border-white" />
          <span>Ouvert (Tous VE)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-900 border border-white" />
          <span>Exclusif Tesla</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white" />
          <span>En travaux / Prévu</span>
        </div>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">Cliquez sur un marqueur pour les détails</span>
      </div>
    </div>
  );
};
