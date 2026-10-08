import { useMemo, useSyncExternalStore } from 'react';
import type { Supercharger } from './types';

// Routage par le fragment d'URL (#/liste?q=rennes) : fonctionne sous un préfixe inconnu
// (Ingress Home Assistant) et sans configuration serveur.
export type Tab = 'map' | 'list' | 'stats' | 'updates' | 'simulator';

const TAB_PATHS: Record<Tab, string> = {
  map: 'carte',
  list: 'liste',
  stats: 'evolution',
  updates: 'mises-a-jour',
  simulator: 'simulateur',
};
const PATH_TABS = Object.fromEntries(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab])) as Record<string, Tab>;

export interface Route {
  tab: Tab;
  params: URLSearchParams;
}

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  return { tab: PATH_TABS[path] || 'map', params: new URLSearchParams(query) };
}

export function routeHash(tab: Tab, params?: URLSearchParams): string {
  const query = params?.toString();
  return `#/${TAB_PATHS[tab]}${query ? `?${query}` : ''}`;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
  };
}

const getHash = () => window.location.hash;

// pushState ne déclenche ni popstate ni hashchange : prévenir les abonnés nous-mêmes.
// Un remplacement conserve l'état de l'entrée courante (ex: fiche station ouverte depuis l'application).
export function navigate(hash: string, { replace = false, state }: { replace?: boolean; state?: unknown } = {}) {
  if (hash === window.location.hash) return;
  if (replace) window.history.replaceState(state ?? window.history.state, '', hash);
  else window.history.pushState(state ?? null, '', hash);
  listeners.forEach((listener) => listener());
}

// Modifier des paramètres de l'onglet courant sans créer d'entrée d'historique (valeur vide = retrait)
export function replaceParams(changes: Record<string, string | null | undefined>) {
  const { tab, params } = parseRoute(window.location.hash);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  navigate(routeHash(tab, params), { replace: true });
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => parseRoute(hash), [hash]);
}

// Fiche désignée dans l'URL par l'identifiant de la station (unique) ; un slug est aussi accepté
// pour les anciens liens, mais plusieurs stations peuvent partager le même (ex: deux à Rennes).
export function findStation(superchargers: Supercharger[], param: string | null): Supercharger | null {
  if (!param) return null;
  const slug = param.toLowerCase();
  return (
    superchargers.find((s) => s.id === param) ??
    superchargers.find((s) => s.locationSlug.toLowerCase() === slug) ??
    null
  );
}

// Sous Ingress Home Assistant, l'URL de l'iframe n'est pas partageable
export const isShareableLocation = () => !window.location.pathname.includes('/api/hassio_ingress/');
