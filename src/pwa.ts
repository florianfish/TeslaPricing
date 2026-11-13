// Application installable (PWA) : enregistrement du service worker (public/sw.js),
// invite d'installation Android/Chrome et état hors connexion.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribePwa(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** Vrai quand le navigateur propose l'installation et que l'application n'est pas déjà installée. */
export const canInstall = () => installPrompt !== null;

export const isOnline = () => navigator.onLine;

export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  notify();
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

/**
 * Date d'enregistrement d'une réponse servie par le service worker hors connexion
 * (en-tête X-SW-Cached-At), ou null pour une réponse fraîche du serveur.
 */
export function cachedAt(response: Response): Date | null {
  const value = response.headers.get('X-SW-Cached-At');
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    notify();
  });

  // Pas de service worker en développement : il masquerait les rechargements de Vite
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
        console.warn('Service worker non enregistré :', err);
      });
    });
  }
}
