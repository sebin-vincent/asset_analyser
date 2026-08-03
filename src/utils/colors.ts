// Fixed-order categorical palette (validated for CVD-safe adjacent contrast in both light/dark modes).
// Assign by index in this order — never cycle or reassign when the fund list changes.
export const CATEGORICAL_PALETTE: { light: string; dark: string }[] = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
  { light: '#4a3aa7', dark: '#9085e9' }, // violet
  { light: '#e34948', dark: '#e66767' }, // red
];

export function colorForIndex(index: number, mode: 'light' | 'dark'): string {
  const slot = CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
  return mode === 'dark' ? slot.dark : slot.light;
}

// Semantic up/down ink for a signed value. These are text tokens, not series colors —
// the dark-mode green is a lighter step because #006300 on the dark surface is only 2.3:1.
const DELTA_UP = { light: '#006300', dark: '#0ca30c' };
const DELTA_DOWN = { light: '#d03b3b', dark: '#e66767' };

export function deltaColor(pct: number, mode: 'light' | 'dark'): string {
  const slot = pct >= 0 ? DELTA_UP : DELTA_DOWN;
  return mode === 'dark' ? slot.dark : slot.light;
}
