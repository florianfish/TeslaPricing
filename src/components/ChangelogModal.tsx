import React, { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { CHANGELOG } from '../changelog';

interface ChangelogModalProps {
  onClose: () => void;
}

// Texte d'une puce : seuls les `extraits de code` et le **gras** sont mis en forme
const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
        return (
          <code key={i} className="px-1 py-0.5 rounded bg-slate-800 text-red-300 font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
        return <strong key={i} className="text-white">{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    })}
  </>
);

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50">
              <Sparkles className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 id="changelog-title" className="text-base font-bold text-white">Notes de version</h2>
              <p className="text-xs text-slate-400">Version installée : v{__APP_VERSION__}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Fermer"
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {CHANGELOG.map((release) => {
            const isCurrent = release.version === __APP_VERSION__;
            return (
              <section key={release.version} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-mono font-bold text-sm text-white">v{release.version}</h3>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border-emerald-900/60">
                      Installée
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-red-500 text-xs text-slate-300 leading-relaxed">
                  {release.changes.map((change, i) => (
                    <li key={i}>
                      <InlineMarkdown text={change} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
