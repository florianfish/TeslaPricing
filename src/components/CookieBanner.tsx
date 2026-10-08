import React, { useSyncExternalStore } from 'react';
import { Cookie } from 'lucide-react';
import { getConsent, isAnalyticsConfigured, setConsent, subscribeAnalytics } from '../analytics';

// Bandeau de consentement aux cookies de mesure d'audience, affiché seulement si Google Analytics est configuré
export const CookieBanner: React.FC = () => {
  const visible = useSyncExternalStore(subscribeAnalytics, () => isAnalyticsConfigured() && getConsent() === null);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Consentement aux cookies"
      className="fixed inset-x-0 bottom-0 z-[2000] p-4"
    >
      <div className="max-w-3xl mx-auto rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur shadow-2xl shadow-black/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 shrink-0">
            <Cookie className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Ce site utilise Google Analytics pour mesurer sa fréquentation (statistiques de visite). Ces cookies ne sont
            déposés qu'avec votre accord, modifiable à tout moment via le lien « Cookies » en bas de page.
          </p>
        </div>
        {/* Boutons de même apparence : refuser doit être aussi simple qu'accepter (recommandations CNIL) */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setConsent('denied')}
            className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Refuser
          </button>
          <button
            onClick={() => setConsent('granted')}
            className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
};
