import { useCallback, useState } from 'react';

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number; // mètres
}

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'error';

export interface Geolocation {
  position: UserPosition | null;
  status: GeoStatus;
  error: string | null;
  locate: () => void;
}

// Distance à vol d'oiseau (formule de haversine)
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Accès à votre position refusé : autorisez la localisation pour ce site dans le navigateur.',
  2: 'Position indisponible pour le moment.',
  3: 'La localisation a pris trop de temps, réessayez.',
};

// Position demandée uniquement sur action de l'utilisateur, jamais stockée ni envoyée au serveur
export function useGeolocation(): Geolocation {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    const fail = (message: string) => {
      setError(message);
      setStatus('error');
    };
    if (!window.isSecureContext) return fail('La géolocalisation nécessite une connexion HTTPS.');
    if (!('geolocation' in navigator)) return fail("Votre navigateur ne permet pas la géolocalisation.");

    setStatus('locating');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
        setStatus('ready');
      },
      (err) => fail(ERROR_MESSAGES[err.code] || 'Localisation impossible.'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  return { position, status, error, locate };
}
