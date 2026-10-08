export interface SuperchargerPricing {
  teslaPeak: number;         // €/kWh during peak hours (e.g. 0.36)
  teslaOffPeak: number;      // €/kWh during off-peak hours (e.g. 0.30)
  nonTeslaPeak: number;      // €/kWh for non-Tesla during peak (e.g. 0.49)
  nonTeslaOffPeak: number;   // €/kWh for non-Tesla during off-peak (e.g. 0.39)
  peakHours: string;         // e.g. "16:00 - 20:00"
  idleFeeStandard: number;   // e.g. 0.50 €/min
  idleFeeCongested: number;  // e.g. 1.00 €/min (100% station saturation)
  lastUpdated: string;       // ISO date
}

export interface PriceSnapshot {
  id: string;
  superchargerId: string;
  superchargerName: string;
  locationSlug: string;
  date: string;              // YYYY-MM-DD
  teslaPeak: number;
  teslaOffPeak: number;
  nonTeslaPeak: number;
  nonTeslaOffPeak: number;
  peakHours: string;
  source: string;            // "Relevé Borne / App Tesla", "Tesla API FindUs", "Observatoire Communautaire", etc.
  notes?: string;
  changePercentage?: number; // % variation vs previous snapshot
}

// Évolution d'une station dans le registre supercharge.info : nouvelle station ou changement de statut
export interface StationEvent {
  date: string;              // YYYY-MM-DD
  type: 'NEW' | 'STATUS';
  superchargerId: string;
  superchargerName: string;
  city: string;
  region: string;
  from?: Supercharger['status'];
  to: Supercharger['status'];
}

// Mise à jour de tarif : un relevé et les tarifs du relevé précédent de la même station
export interface PriceUpdate {
  snapshot: PriceSnapshot;
  previous: Pick<PriceSnapshot, 'date' | 'teslaPeak' | 'teslaOffPeak' | 'nonTeslaPeak' | 'nonTeslaOffPeak' | 'peakHours'> | null;
  city: string;
  region: string;
}

export interface Supercharger {
  id: string;
  locationId?: string;       // Tesla internal locationId (e.g. "300313")
  locationSlug: string;
  name: string;
  city: string;
  department: string;
  region: string;
  street: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  status: 'OPEN' | 'CONSTRUCTION' | 'PLAN';
  stallCount: number;
  powerKw: number;
  stallsBreakdown: {
    v2?: number;
    v3?: number;
    v4?: number;
    accessible?: number;
  };
  otherEVs: boolean; // Ouvert aux non-Tesla
  facilityName?: string;
  dateOpened?: string;
  currentPricing: SuperchargerPricing;
  lastCheckedAt?: string;    // YYYY-MM-DD : dernier relevé du collecteur, prix modifié ou non
  priceHistory?: PriceSnapshot[];
}

// Import d'un relevé du collecteur (extension navigateur ou fichier du favori)
export interface ImportLogEntry {
  at: string;                // ISO : date de réception par le serveur
  collectedAt: string;       // ISO : début de la collecte
  source: 'extension' | 'fichier';
  updated: number;
  confirmed: number;
  skipped: number;
  abortReason?: string | null;
}

// État de la collecte des tarifs : derniers imports et fraîcheur des relevés des stations ouvertes
export interface CollectionStatus {
  alertDays: number;         // alerte si aucun import depuis ce nombre de jours
  staleDays: number;         // relevé d'une station considéré comme ancien au-delà
  lastImport: ImportLogEntry | null;
  imports: ImportLogEntry[]; // du plus récent au plus ancien
  openStations: number;
  fresh: number;
  aging: number;
  stale: number;
  never: number;
  staleStations: { id: string; locationSlug: string; name: string; city: string; lastChecked: string | null }[];
}

export interface SuperchargerStats {
  totalStations: number;
  openStations: number;
  constructionStations: number;
  plannedStations: number;
  totalStalls: number;
  otherEVsCount: number;
  otherEVsPercentage: number;
  avgTeslaOffPeak: number;
  avgTeslaPeak: number;
  avgNonTeslaOffPeak: number;
  avgNonTeslaPeak: number;
  minPriceStation: {
    name: string;
    city: string;
    locationSlug: string;
    price: number;
  };
  maxPriceStation: {
    name: string;
    city: string;
    locationSlug: string;
    price: number;
  };
  nationalHistory: PriceSnapshot[];
  lastSyncTime: string;
}

export interface SuperchargerFilterOptions {
  search?: string;
  status?: string;
  otherEVsOnly?: boolean;
  minPower?: number;
  region?: string;
  sortBy?: 'name' | 'city' | 'price' | 'stalls' | 'power';
  sortOrder?: 'asc' | 'desc';
}
