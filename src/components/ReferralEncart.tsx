import React, { useState } from 'react';
import { Gift, ExternalLink, Sparkles, X, ChevronRight, Zap } from 'lucide-react';

interface ReferralEncartProps {
  variant?: 'banner' | 'card' | 'compact';
  className?: string;
}

export const ReferralEncart: React.FC<ReferralEncartProps> = ({
  variant = 'banner',
  className = '',
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const referralUrl = 'https://www.tesla.com/fr_Fr/referral/florian572745';

  if (isDismissed) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <a
        href={referralUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 hover:border-red-500/60 shadow-lg shadow-red-950/20 transition-all ${className}`}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 group-hover:scale-105 transition-transform">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white group-hover:text-red-300 transition-colors">
                1 000 km Tesla offerts
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                Offre Parrainage
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Profitez de la recharge gratuite pour l'achat de votre Tesla neuve.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-xs font-semibold text-red-400 group-hover:text-red-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-3">
          <span>En profiter</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </a>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950/70 via-slate-900/95 to-slate-900 border border-red-500/30 shadow-xl shadow-red-950/25 p-4 sm:p-5 transition-all ${className}`}
    >
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-red-800/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left Side: Icon & Details */}
        <div className="flex items-start sm:items-center space-x-4">
          <div className="relative shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30 border border-red-400/30">
            <Gift className="w-6 h-6 animate-pulse" />
            <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1 -right-1" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center space-x-1">
                <Zap className="w-3 h-3 fill-current" />
                <span>Offre Parrainage Tesla</span>
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                • Valable sur Model 3, Model Y, Model S & Model X
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>1 000 km Tesla offerts</span>
              <span className="text-xs font-normal text-slate-400 hidden lg:inline">
                (ou remise équivalente sur votre commande)
              </span>
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Vous préparez l'achat de votre Tesla ? Utilisez ce lien de parrainage officiel pour recevoir{' '}
              <strong className="text-white font-semibold">1 000 km de Supercharge gratuite</strong> lors de votre livraison.
            </p>
          </div>
        </div>

        {/* Right Side: CTA Button & Dismiss */}
        <div className="flex items-center space-x-2.5 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0">
          <a
            href={referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 hover:from-red-500 to-red-700 hover:to-red-600 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-600/30 hover:shadow-red-600/50 hover:scale-[1.02] active:scale-[0.98] transition-all border border-red-400/30"
          >
            <span>Profiter des 1 000 km offerts</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Fermer l'encart"
            title="Fermer l'encart"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
