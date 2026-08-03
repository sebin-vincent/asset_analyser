import { useEffect, useState } from 'react';
import type { SchemeSearchResult, SelectedFund } from '../types/fund';

const STORAGE_KEY = 'mf-selected-funds';

function loadInitial(): SelectedFund[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useSelectedFunds() {
  const [selectedFunds, setSelectedFunds] = useState<SelectedFund[]>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedFunds));
    } catch {
      // best-effort persistence only
    }
  }, [selectedFunds]);

  const add = (fund: SchemeSearchResult): boolean => {
    if (selectedFunds.some((f) => f.schemeCode === fund.schemeCode)) return false;
    // Assign the next unused color slot so existing funds never get repainted when the list changes.
    const nextColorIndex = selectedFunds.reduce((max, f) => Math.max(max, f.colorIndex), -1) + 1;
    setSelectedFunds((prev) => [
      ...prev,
      { schemeCode: fund.schemeCode, name: fund.schemeName, colorIndex: nextColorIndex },
    ]);
    return true;
  };

  const remove = (schemeCode: number) => {
    setSelectedFunds((prev) => prev.filter((f) => f.schemeCode !== schemeCode));
  };

  return { selectedFunds, add, remove };
}
