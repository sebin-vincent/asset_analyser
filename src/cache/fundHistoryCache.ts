import { getFundHistory } from '../api/mfApi';
import type { FundHistoryResponse } from '../types/fund';

interface CacheEntry {
  fetchedAt: string; // ISO date string
  data: FundHistoryResponse;
}

const memoryCache = new Map<number, FundHistoryResponse>();

function storageKey(schemeCode: number): string {
  return `mf-cache:${schemeCode}`;
}

function isFromToday(fetchedAt: string): boolean {
  const fetched = new Date(fetchedAt);
  const now = new Date();
  return (
    fetched.getFullYear() === now.getFullYear() &&
    fetched.getMonth() === now.getMonth() &&
    fetched.getDate() === now.getDate()
  );
}

function readFromLocalStorage(schemeCode: number): FundHistoryResponse | null {
  try {
    const raw = localStorage.getItem(storageKey(schemeCode));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (!isFromToday(entry.fetchedAt)) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeToLocalStorage(schemeCode: number, data: FundHistoryResponse): void {
  try {
    const entry: CacheEntry = { fetchedAt: new Date().toISOString(), data };
    localStorage.setItem(storageKey(schemeCode), JSON.stringify(entry));
  } catch {
    // localStorage may be full or unavailable (private browsing) — cache is best-effort.
  }
}

export async function fetchFundHistoryCached(schemeCode: number): Promise<FundHistoryResponse> {
  const inMemory = memoryCache.get(schemeCode);
  if (inMemory) return inMemory;

  const fromStorage = readFromLocalStorage(schemeCode);
  if (fromStorage) {
    memoryCache.set(schemeCode, fromStorage);
    return fromStorage;
  }

  const fresh = await getFundHistory(schemeCode);
  memoryCache.set(schemeCode, fresh);
  writeToLocalStorage(schemeCode, fresh);
  return fresh;
}
