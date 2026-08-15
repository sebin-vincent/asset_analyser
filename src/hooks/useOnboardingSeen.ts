import { useState } from 'react';

const STORAGE_KEY = 'aa-onboarding-seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // storage inaccessible — never show a popup that can't be durably dismissed
    return true;
  }
}

export function useOnboardingSeen() {
  const [seen, setSeen] = useState<boolean>(readSeen);

  const markSeen = () => {
    setSeen(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // best-effort persistence only
    }
  };

  return { seen, markSeen };
}
