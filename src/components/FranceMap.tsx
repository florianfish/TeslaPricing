import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Supercharger } from '../types';
import { Filter, Compass, Layers, LocateFixed, Loader2, X } from 'lucide-react';
import { stationFreshness, FRESHNESS_COLORS } from '../freshness';
import { distanceKm, formatDistance, type Geolocation } from '../geo';

interface FranceMapProps {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
  selectedCharger: Supercharger | null;
  geolocation: Geolocation;
}

const NEAREST_COUNT = 5;

export const FranceMap: React.FC<FranceMapProps> = ({
  superchargers,
  onSelectSupercharger,
  selectedCharger,
  geolocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const [showNearest, setShowNearest] = useState(false);
  const { position, status: geoStatus, error: geoError, locate } = geolocation;

  const [mapFilter, setMapFilter] = useState<'ALL' | 'OTHER_EVS' | 'HIGH_POWER' | 'CHEAP'>('ALL');
  const [mapStyle, setMapStyle] = useState<'dark' | 'osm' | 'satellite'>('dark');

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

    // Layer group for base tiles
    const tileGroup = L.layerGroup().addTo(map);
    tileLayerGroupRef.current = tileGroup;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    userLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update base tiles when mapStyle changes (100% free, no API key required)
  useEffect(() => {
    const tileGroup = tileLayerGroupRef.current;
    if (!tileGroup) return;

    tileGroup.clearLayers();

    if (mapStyle === 'dark') {
      // ESRI Dark Gray Canvas (Gratuit & sans clé API)
      const base = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin',
          maxZoom: 16,
        }
      );
      const reference = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
        }
      );
      tileGroup.addLayer(base);
      tileGroup.addLayer(reference);
    } else if (mapStyle === 'satellite') {
      // ESRI Satellite Imagery (Gratuit & sans clé API)
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics',
          maxZoom: 19,
        }
      );
      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
        }
      );
      tileGroup.addLayer(sat);
      tileGroup.addLayer(labels);
    } else {
      // OpenStreetMap France (100% libre et gratuit, sans clé API)
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 20,
        subdomains: 'abc',
      });
      tileGroup.addLayer(osm);
    }
  }, [mapStyle]);

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

      const freshness = stationFreshness(charger);

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
            <div style="display: flex; align-items: center; gap: 5px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b;">
              <span style="width: 7px; height: 7px; border-radius: 9999px; background: ${FRESHNESS_COLORS[freshness.level]};"></span>
              ${freshness.label}
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

  // Position de l'utilisateur : marqueur, cercle de précision et zoom sur la zone
  useEffect(() => {
    const map = mapInstanceRef.current;
    const userLayer = userLayerRef.current;
    if (!map || !userLayer || !position) return;
    userLayer.clearLayers();
    const latLng: L.LatLngTuple = [position.latitude, position.longitude];
    L.circle(latLng, { radius: position.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(userLayer);
    L.circleMarker(latLng, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 })
      .bindTooltip('Vous êtes ici')
      .addTo(userLayer);
    map.flyTo(latLng, 9, { duration: 1.2 });
  }, [position]);

  const nearest = React.useMemo(() => {
    if (!position) return [];
    return superchargers
      .filter((s) => s.status === 'OPEN' && s.latitude && s.longitude)
      .map((charger) => ({ charger, km: distanceKm(position, charger) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, NEAREST_COUNT);
  }, [superchargers, position]);

  const handleLocate = () => {
    setShowNearest(true);
    locate();
  };

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

        <button
          onClick={handleLocate}
          disabled={geoStatus === 'locating'}
          title="Afficher les superchargeurs les plus proches de vous"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
        >
          {geoStatus === 'locating' ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 text-blue-400" />
          )}
          <span>Autour de moi</span>
        </button>

        {/* Nearest stations */}
        {showNearest && (geoStatus === 'error' || nearest.length > 0) && (
          <div className="basis-full">
          <div role="region" aria-label="Superchargeurs les plus proches" className="w-72 max-w-full bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="font-semibold text-slate-200">
                {geoStatus === 'error' ? 'Localisation impossible' : 'Les plus proches de vous'}
              </span>
              <button
                onClick={() => setShowNearest(false)}
                title="Masquer"
                className="p-0.5 rounded text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {geoStatus === 'error' ? (
              <p className="px-3 py-2.5 text-slate-400">{geoError}</p>
            ) : (
              <ul className="divide-y divide-slate-800/80">
                {nearest.map(({ charger, km }) => (
                  <li key={charger.id}>
                    <button
                      onClick={() => onSelectSupercharger(charger)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-800/70 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-200 truncate">{charger.city}</span>
                        <span className="block text-[11px] text-slate-500">{formatDistance(km)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold text-emerald-400">{charger.currentPricing.teslaOffPeak.toFixed(2)} € HC</span>
                        <span className="block text-[11px] text-amber-400">{charger.currentPricing.teslaPeak.toFixed(2)} € HP</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Top-Right Style Switcher (100% Free & No API Key Required) */}
      <div className="absolute top-4 right-4 z-10 flex items-center space-x-1 p-1 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-lg text-xs">
        <div className="flex items-center px-2 py-1 text-slate-400 font-semibold gap-1.5 border-r border-slate-800 mr-0.5">
          <Layers className="w-3.5 h-3.5 text-red-400" />
          <span className="hidden sm:inline">Fond de carte :</span>
        </div>
        <button
          onClick={() => setMapStyle('dark')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            mapStyle === 'dark'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Fond de carte sombre minimaliste"
        >
          Sombre
        </button>
        <button
          onClick={() => setMapStyle('osm')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            mapStyle === 'osm'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="OpenStreetMap France officiel"
        >
          OSM France
        </button>
        <button
          onClick={() => setMapStyle('satellite')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            mapStyle === 'satellite'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Vue satellite haute résolution"
        >
          Satellite
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
