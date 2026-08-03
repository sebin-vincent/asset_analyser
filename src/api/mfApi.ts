import type { FundHistoryResponse, SchemeSearchResult } from '../types/fund';

const BASE_URL = 'https://api.mfapi.in/mf';

export async function searchFunds(
  query: string,
  signal?: AbortSignal,
): Promise<SchemeSearchResult[]> {
  const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    throw new Error(`Fund search failed: ${res.status}`);
  }
  return res.json();
}

export async function getFundHistory(schemeCode: number): Promise<FundHistoryResponse> {
  const res = await fetch(`${BASE_URL}/${schemeCode}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch fund history for ${schemeCode}: ${res.status}`);
  }
  return res.json();
}
