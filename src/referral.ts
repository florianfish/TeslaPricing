// Encart de parrainage : une fois fermé, il n'est plus proposé pendant 15 jours (par navigateur)

export const REFERRAL_DISMISS_KEY = 'referral-dismissed-at';
export const REFERRAL_SNOOZE_DAYS = 15;
const SNOOZE_MS = REFERRAL_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Vrai si l'encart a été fermé il y a moins de 15 jours. Stockage indisponible ou valeur invalide = affiché. */
export function isReferralSnoozed(now = Date.now(), storage: Storage | null = defaultStorage()): boolean {
  try {
    const dismissedAt = Number(storage?.getItem(REFERRAL_DISMISS_KEY));
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0 || dismissedAt > now) return false;
    return now - dismissedAt < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Mémorise la fermeture de l'encart (sans effet si le stockage est indisponible). */
export function snoozeReferral(now = Date.now(), storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(REFERRAL_DISMISS_KEY, String(now));
  } catch {
    // Navigation privée ou stockage bloqué : l'encart reviendra au prochain chargement
  }
}
