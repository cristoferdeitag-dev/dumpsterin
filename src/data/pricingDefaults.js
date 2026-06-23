// Shared provider pricing config.
//
// Single source of truth for what a provider charges. Both the Settings
// screen (where the provider edits it) and the Quote Generator (which reads
// it to build the catalog) import from here. The config is persisted via
// BD's /api/provider/quote-config endpoint, keyed by provider_id (companyId).
//
// DEFAULT_PRICING holds TP's real prices, used as the fallback whenever the
// API returns no saved config (config: null) or any error occurs.

export const DEFAULT_PRICING = {
  sizes: [
    { key: '10_general', label: '10 yd — General Debris', price: 599, weight: '1 ton', days: 3, dims: '12×8×2.5 ft' },
    { key: '10_clean',   label: '10 yd — Clean Soil / Clean Concrete', price: 599, weight: 'No limit', days: 3, dims: '12×8×2.5 ft' },
    { key: '10_mixed',   label: '10 yd — Mixed / Bricks / Asphalt', price: 749, weight: 'No limit', days: 3, dims: '12×8×2.5 ft' },
    { key: '20',         label: '20 yd', price: 699, weight: '2 tons', days: 7, dims: '16×8×4 ft' },
    { key: '30',         label: '30 yd', price: 799, weight: '3 tons', days: 7, dims: '16×8×6 ft' },
  ],
  items: [
    { key: 'mattress', label: 'Mattress', price: 59 },
    { key: 'tire', label: 'Tire', price: 20 },
    { key: 'electronic', label: 'Electronic', price: 59 },
    { key: 'appliance', label: 'Appliance', price: 59 },
  ],
  extraDay: 49,
  overweight: 199,
  cancelFee: 150,
};

const QUOTE_CONFIG_URL = 'https://bookingdumpsters.com/api/provider/quote-config';

// Fetch the provider's saved pricing config. Returns the saved config when
// present, otherwise DEFAULT_PRICING. Never throws — any network/parse error
// falls back to DEFAULT_PRICING so the quote generator always has prices.
export async function fetchProviderPricing(companyId) {
  if (!companyId) return DEFAULT_PRICING;
  try {
    const res = await fetch(
      `${QUOTE_CONFIG_URL}?provider_id=${encodeURIComponent(companyId)}`
    );
    if (!res.ok) return DEFAULT_PRICING;
    const data = await res.json();
    return data?.config || DEFAULT_PRICING;
  } catch (e) {
    console.warn('fetchProviderPricing failed, using defaults:', e);
    return DEFAULT_PRICING;
  }
}
