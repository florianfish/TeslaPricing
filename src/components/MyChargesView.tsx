import React, { useEffect, useState } from 'react';
import { Receipt, AlertTriangle, Loader2 } from 'lucide-react';
import type { Supercharger } from '../types';

interface ChargeAnalysis {
  chargeIds: number[];
  start: string;
  stationId: string;
  stationName: string;
  energyAdded: number;
  energyUsed: number;
  cost: number;
  realRate: number;
  period: 'peak' | 'offPeak' | null;
  fromGrid?: boolean;
  expectedRate: number | null;
  priceDate: string | null;
  expectedCost: number | null;
  diff: number | null;
  offPeakCost: number | null;
}

interface MyChargesResponse {
  enabled: boolean;
  error?: string;
  fetchedAt?: string;
  sessions?: ChargeAnalysis[];
  totals?: {
    sessions: number;
    compared: number;
    cost: number;
    expectedCost: number;
    diff: number;
    possibleSaving: number;
    energy: number;
  };
  unmatched?: number;
}

interface Props {
  superchargers: Supercharger[];
  onSelectSupercharger: (charger: Supercharger) => void;
}

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const rate = (n: number) => `${n.toFixed(2).replace('.', ',')} €/kWh`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${euro(n)}`;
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// Écart sensible au-delà de 2 % du coût attendu (arrondis de facturation en dessous)
const diffClass = (s: ChargeAnalysis) =>
  s.diff === null || s.expectedCost === null
    ? 'text-slate-500'
    : Math.abs(s.diff) <= Math.max(0.1, s.expectedCost * 0.02)
      ? 'text-emerald-400'
      : s.diff > 0
        ? 'text-amber-400'
        : 'text-sky-400';

// Mes sessions Superchargeur (TeslaMate) comparées au tarif relevé pour la station à cette date
export const MyChargesView: React.FC<Props> = ({ superchargers, onSelectSupercharger }) => {
  const [data, setData] = useState<MyChargesResponse | null>(null);

  useEffect(() => {
    fetch('api/my-charges')
      .then(async (res) => setData(await res.json()))
      .catch((err) => setData({ enabled: true, error: err.message }));
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Lecture de vos recharges dans TeslaMate…
      </div>
    );
  }

  if (data.error || !data.sessions || !data.totals) {
    return (
      <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-950/50 border border-amber-800/60 text-sm text-amber-200">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
        <span>{data.error || 'Lecture de TeslaMate impossible : vérifiez les options de l’add-on.'}</span>
      </div>
    );
  }

  const { totals, sessions } = data;
  const byId = new Map(superchargers.map((s) => [s.id, s]));

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
            <Receipt className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Mes recharges au Superchargeur</h2>
            <p className="text-xs text-slate-400">
              Coût facturé (TeslaMate) comparé au tarif relevé pour la station, au créneau du début de la session.
              Visible seulement depuis Home Assistant.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Dépensé</span>
            <strong className="text-lg text-white font-bold">{euro(totals.cost)}</strong>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {totals.sessions} sessions · {totals.energy.toLocaleString('fr-FR')} kWh
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Écart avec les tarifs relevés</span>
            <strong className={`text-lg font-bold ${Math.abs(totals.diff) < 1 ? 'text-emerald-400' : totals.diff > 0 ? 'text-amber-400' : 'text-sky-400'}`}>
              {signed(totals.diff)}
            </strong>
            <div className="text-[10px] text-slate-500 mt-0.5">sur {totals.compared} sessions comparables</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Économie possible en heures creuses</span>
            <strong className="text-lg text-emerald-400 font-bold">{euro(totals.possibleSaving)}</strong>
            <div className="text-[10px] text-slate-500 mt-0.5">mêmes stations, même énergie</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Prix moyen payé</span>
            <strong className="text-lg text-white font-bold">{totals.energy ? rate(totals.cost / totals.energy) : '—'}</strong>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {data.unmatched ? `${data.unmatched} session(s) « Supercharger » non reconnue(s)` : 'toutes les sessions reconnues'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-xl">
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune session payante au Superchargeur dans TeslaMate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="my-charges">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-4 font-medium">Début</th>
                  <th className="py-2 pr-4 font-medium">Station</th>
                  <th className="py-2 pr-4 font-medium" title="Énergie fournie par la borne (base de la facture)">kWh</th>
                  <th className="py-2 pr-4 font-medium">Payé</th>
                  <th className="py-2 pr-4 font-medium">Prix réel</th>
                  <th className="py-2 pr-4 font-medium">Tarif relevé</th>
                  <th className="py-2 pr-4 font-medium">Écart</th>
                  <th className="py-2 font-medium">En HC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {sessions.map((s) => {
                  const station = byId.get(s.stationId);
                  return (
                    <tr key={s.chargeIds.join('-')}>
                      <td className="py-2 pr-4 whitespace-nowrap">{dateTime(s.start)}</td>
                      <td className="py-2 pr-4">
                        {station ? (
                          <button className="text-left hover:text-white underline-offset-2 hover:underline" onClick={() => onSelectSupercharger(station)}>
                            {s.stationName.replace(/, France/, '')}
                          </button>
                        ) : (
                          s.stationName
                        )}
                        {s.chargeIds.length > 1 && (
                          <span className="ml-1 text-[10px] text-slate-500" title="Sessions consécutives au même coût : facture comptée une fois">
                            ({s.chargeIds.length} sessions)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{s.energyUsed.toLocaleString('fr-FR')}</td>
                      <td className="py-2 pr-4 font-semibold text-white">{euro(s.cost)}</td>
                      <td className="py-2 pr-4">{rate(s.realRate)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap" title={s.priceDate ? `Relevé du ${s.priceDate}` : 'Aucun relevé avant cette date'}>
                        {s.expectedRate !== null ? `${rate(s.expectedRate)} (${s.fromGrid ? 'grille' : s.period === 'peak' ? 'HP' : 'HC'})` : '—'}
                      </td>
                      <td className={`py-2 pr-4 font-semibold ${diffClass(s)}`}>{s.diff !== null ? signed(s.diff) : '—'}</td>
                      <td className="py-2 text-emerald-400">{s.offPeakCost !== null ? euro(s.offPeakCost) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-3">
              Prix réel = montant payé ÷ énergie fournie par la borne. Une session à cheval sur deux créneaux est comparée au
              tarif de son début. Données TeslaMate lues {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('fr-FR') : ''}, mises en
              cache une heure.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
