import React, { useState } from 'react';
import type { Supercharger, SuperchargerStats } from '../types';
import { Calculator, Zap, Fuel, DollarSign, Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface CostSimulatorProps {
  stats: SuperchargerStats | null;
  superchargers: Supercharger[];
}

interface VehiclePreset {
  name: string;
  brand: string;
  batteryKwh: number;
  consumptionKwh100: number;
  isTesla: boolean;
}

const VEHICLE_PRESETS: VehiclePreset[] = [
  { name: 'Model Y / Model 3 Propulsion', brand: 'Tesla', batteryKwh: 60, consumptionKwh100: 15.5, isTesla: true },
  { name: 'Model Y / Model 3 Grande Autonomie', brand: 'Tesla', batteryKwh: 78.1, consumptionKwh100: 16.5, isTesla: true },
  { name: 'Model S / Model X Plaid', brand: 'Tesla', batteryKwh: 100, consumptionKwh100: 19.0, isTesla: true },
  { name: 'Renault Scenic E-Tech (87 kWh)', brand: 'Renault', batteryKwh: 87, consumptionKwh100: 18.0, isTesla: false },
  { name: 'Peugeot e-3008 (73 kWh)', brand: 'Peugeot', batteryKwh: 73, consumptionKwh100: 17.5, isTesla: false },
  { name: 'Kia EV6 / Ioniq 5 (77.4 kWh)', brand: 'Kia/Hyundai', batteryKwh: 77.4, consumptionKwh100: 18.5, isTesla: false },
  { name: 'MG 4 Electric (64 kWh)', brand: 'MG', batteryKwh: 64, consumptionKwh100: 16.0, isTesla: false },
];

export const CostSimulator: React.FC<CostSimulatorProps> = ({ stats, superchargers }) => {
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePreset>(VEHICLE_PRESETS[0]);
  const [customBattery, setCustomBattery] = useState<number>(60);
  const [isCustom, setIsCustom] = useState(false);
  const [startPercent, setStartPercent] = useState<number>(10);
  const [endPercent, setEndPercent] = useState<number>(80);
  const [selectedStationSlug, setSelectedStationSlug] = useState<string>('NATIONAL');

  // Selected station or national average pricing
  const station = superchargers.find((s) => s.locationSlug === selectedStationSlug);
  const teslaOffPeak = station ? station.currentPricing.teslaOffPeak : stats?.avgTeslaOffPeak || 0.30;
  const teslaPeak = station ? station.currentPricing.teslaPeak : stats?.avgTeslaPeak || 0.36;
  const nonTeslaOffPeak = station ? station.currentPricing.nonTeslaOffPeak : stats?.avgNonTeslaOffPeak || 0.39;
  const nonTeslaPeak = station ? station.currentPricing.nonTeslaPeak : stats?.avgNonTeslaPeak || 0.49;

  const effectiveBattery = isCustom ? customBattery : selectedVehicle.batteryKwh;
  const energyKwh = Number(((effectiveBattery * (endPercent - startPercent)) / 100).toFixed(1));

  // Calculations
  const costTeslaOffPeak = Number((energyKwh * teslaOffPeak).toFixed(2));
  const costTeslaPeak = Number((energyKwh * teslaPeak).toFixed(2));
  const costNonTeslaOffPeak = Number((energyKwh * nonTeslaOffPeak).toFixed(2));
  const costNonTeslaPeak = Number((energyKwh * nonTeslaPeak).toFixed(2));

  // Thermal comparison (equivalent gasoline: 6.5 L/100km at 1.85€/L)
  const kmGained = Math.round((energyKwh / (selectedVehicle.consumptionKwh100 || 16)) * 100);
  const equivalentGasolineCost = Number(((kmGained / 100) * 6.5 * 1.85).toFixed(2));
  const savingsVsGasoline = Math.max(0, Number((equivalentGasolineCost - costTeslaOffPeak).toFixed(2)));

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2.5 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Simulateur de Coût de Supercharge</h2>
            <p className="text-xs text-slate-400">
              Estimez le coût précis de votre session selon votre véhicule, l'horaire et la station
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-1 bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-5">
          <h3 className="font-bold text-sm text-white border-b border-slate-800 pb-3">
            Configuration du véhicule & session
          </h3>

          {/* Vehicle Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Modèle de Véhicule
            </label>
            <select
              value={isCustom ? 'CUSTOM' : selectedVehicle.name}
              onChange={(e) => {
                if (e.target.value === 'CUSTOM') {
                  setIsCustom(true);
                } else {
                  setIsCustom(false);
                  const v = VEHICLE_PRESETS.find((p) => p.name === e.target.value);
                  if (v) setSelectedVehicle(v);
                }
              }}
              className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
            >
              {VEHICLE_PRESETS.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.brand} - {v.name} ({v.batteryKwh} kWh)
                </option>
              ))}
              <option value="CUSTOM">Batterie personnalisée...</option>
            </select>
          </div>

          {/* Custom Battery Input */}
          {isCustom && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Capacité utile de batterie (kWh)
              </label>
              <input
                type="number"
                min={20}
                max={150}
                value={customBattery}
                onChange={(e) => setCustomBattery(Number(e.target.value))}
                className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
          )}

          {/* Charge Percentage Range */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-300">Niveau de charge</span>
              <span className="font-bold text-red-400">
                {startPercent}% &rarr; {endPercent}% ({energyKwh} kWh)
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Départ ({startPercent}%)</span>
                  <span>10% recommandé</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={startPercent}
                  onChange={(e) => setStartPercent(Number(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Arrivée ({endPercent}%)</span>
                  <span>80% idéal sur autoroute</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={endPercent}
                  onChange={(e) => setEndPercent(Number(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Station Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Station de Supercharge
            </label>
            <select
              value={selectedStationSlug}
              onChange={(e) => setSelectedStationSlug(e.target.value)}
              className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
            >
              <option value="NATIONAL">Moyenne nationale France</option>
              {superchargers.map((s) => (
                <option key={s.id} value={s.locationSlug}>
                  {s.city} ({s.currentPricing.teslaOffPeak.toFixed(2)}€ HC / {s.currentPricing.teslaPeak.toFixed(2)}€ HP)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Column: Cost Comparison & Analysis */}
        <div className="lg:col-span-2 space-y-4">
          {/* Main Price Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Off-Peak Tesla */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 p-5 rounded-2xl border border-emerald-900/60 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-emerald-400 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Heures Creuses (Tesla / Abonné)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 font-bold">
                  Meilleur Prix
                </span>
              </div>
              <div className="flex items-baseline space-x-2 my-2">
                <span className="text-4xl font-extrabold text-white">{costTeslaOffPeak.toFixed(2)} €</span>
                <span className="text-xs text-slate-400">({teslaOffPeak.toFixed(2)} €/kWh)</span>
              </div>
              <p className="text-xs text-slate-400">
                Pour recharger <strong>{energyKwh} kWh</strong> ({startPercent}% &rarr; {endPercent}%)
              </p>
            </div>

            {/* Card 2: Peak Tesla */}
            <div className="bg-gradient-to-br from-amber-950/40 to-slate-900 p-5 rounded-2xl border border-amber-900/60 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-amber-400 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Heures Pleines (Tesla / Abonné)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/80 text-amber-300 font-bold">
                  16h00 - 20h00
                </span>
              </div>
              <div className="flex items-baseline space-x-2 my-2">
                <span className="text-4xl font-extrabold text-white">{costTeslaPeak.toFixed(2)} €</span>
                <span className="text-xs text-slate-400">({teslaPeak.toFixed(2)} €/kWh)</span>
              </div>
              <p className="text-xs text-slate-400">
                Surcoût horaire de <strong>+{(costTeslaPeak - costTeslaOffPeak).toFixed(2)} €</strong>
              </p>
            </div>

            {/* Card 3: Non-Tesla Off Peak */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Autre VE (Sans abonnement - HC)</span>
                <span className="text-[10px] text-slate-500">{nonTeslaOffPeak.toFixed(2)} €/kWh</span>
              </div>
              <div className="flex items-baseline space-x-2 my-2">
                <span className="text-3xl font-bold text-slate-200">{costNonTeslaOffPeak.toFixed(2)} €</span>
              </div>
              <p className="text-xs text-slate-400">
                Abonnement Tesla à 12,99€/mois permet d'économiser {(costNonTeslaOffPeak - costTeslaOffPeak).toFixed(2)}€ par session
              </p>
            </div>

            {/* Card 4: Non-Tesla Peak */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Autre VE (Sans abonnement - HP)</span>
                <span className="text-[10px] text-slate-500">{nonTeslaPeak.toFixed(2)} €/kWh</span>
              </div>
              <div className="flex items-baseline space-x-2 my-2">
                <span className="text-3xl font-bold text-slate-200">{costNonTeslaPeak.toFixed(2)} €</span>
              </div>
              <p className="text-xs text-slate-400">
                Tarif maximum en période d'affluence
              </p>
            </div>
          </div>

          {/* Comparison with Gasoline Vehicle */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
            <h4 className="font-bold text-sm text-white flex items-center">
              <Fuel className="w-4 h-4 mr-2 text-amber-500" />
              Comparatif face à un véhicule thermique essence équivalent
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 block">Autonomie récupérée</span>
                <strong className="text-base text-white font-bold">~{kmGained} km</strong>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 block">Coût équivalent Essence</span>
                <strong className="text-base text-amber-400 font-bold">{equivalentGasolineCost.toFixed(2)} €</strong>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 block">Économie nette réalisée</span>
                <strong className="text-base text-emerald-400 font-bold">+{savingsVsGasoline.toFixed(2)} €</strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              *Calcul basé sur une consommation essence moyenne de 6,5 L/100km à 1,85 €/L de SP95-E10 sur autoroute.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
