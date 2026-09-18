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

export interface Supercharger {
  id: string;
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
  priceHistory?: PriceSnapshot[];
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
