import db from '../db/connection.js';

const CACHE_KEY = 'nlw_rate';
const CACHE_TTL_DAYS = 30;

// UK government minimum wage API
// https://www.gov.uk/government/publications/minimum-wage-rates-for-2024
// We use the open data endpoint from HMRC / data.gov.uk
const GOV_API_URL = 'https://api.gov.uk/v1/minimum-wage';

// Fallback rate if API is unavailable
const FALLBACK_RATE = 12.21; // Apr 2025 NLW rate
const FALLBACK_YEAR = '2025';

interface NLWCache {
  rate: number;
  year: string;
  fetched_at: string;
}

export async function getNationalLivingWage(): Promise<{ rate: number; year: string; source: string }> {
  // Check db cache first
  try {
    const cached = await db('demand_inputs')
      .where('source', CACHE_KEY)
      .orderBy('updated_at', 'desc')
      .first();

    if (cached) {
      const fetchedAt = new Date(cached.updated_at);
      const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSince < CACHE_TTL_DAYS) {
        const data: NLWCache = JSON.parse(cached.notes);
        return { rate: data.rate, year: data.year, source: 'cache' };
      }
    }
  } catch {}

  // Cache miss or expired — try to fetch from gov.uk
  try {
    const res = await fetch(
      'https://data.gov.uk/api/3/action/datastore_search?resource_id=3c30c4de-0a20-4e36-b931-3ae9de94e13c&limit=1&sort=year desc',
      { signal: AbortSignal.timeout(4000) }
    );

    if (res.ok) {
      const json = await res.json() as any;
      const record = json?.result?.records?.[0];
      if (record) {
        const rate = parseFloat(record['National Living Wage'] || record['NLW'] || FALLBACK_RATE);
        const year = String(record['Year'] || record['year'] || FALLBACK_YEAR);

        // Store in cache using demand_inputs notes field as a simple KV store
        await db('demand_inputs')
          .insert({
            target_date: new Date().toISOString().split('T')[0],
            expected_covers: 0,
            source: CACHE_KEY,
            notes: JSON.stringify({ rate, year, fetched_at: new Date().toISOString() }),
          })
          .onConflict('target_date')
          .merge({ notes: JSON.stringify({ rate, year, fetched_at: new Date().toISOString() }), updated_at: db.fn.now() });

        return { rate, year, source: 'gov_api' };
      }
    }
  } catch {
    // API unavailable — fall through to fallback
  }

  // Use hardcoded fallback
  return { rate: FALLBACK_RATE, year: FALLBACK_YEAR, source: 'fallback' };
}
